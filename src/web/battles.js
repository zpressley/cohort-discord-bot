// src/web/battles.js
//
// The web app's battles: everything the server does except speak HTTP.
//
// A battle is the engine's game (src/engine/orchestrator) plus what the web
// needs around it: one secret link per side (a "seat"), the turn reports
// each side has received, and when things happened. It is saved as a JSON
// file and rebuilt on start by replaying its order log (gameRecord /
// replayGame), so a battle survives the server stopping, which matters for
// a game played over days (ruled 2026-10-29).
//
// Fog of war is enforced here, not in the browser: a seat only ever gets
// its own side's view. Nothing about an enemy the side has not seen leaves
// this module.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const { createGame, submitOrders, forceProcess, sideView, gameRecord, replayGame, commanderOf } = require('../engine/orchestrator')
const { sides } = require('../engine/world')
const { gridLabel } = require('../engine/map/grid')
const { detectFeatures } = require('../engine/map/features')
const { isGridRef } = require('../engine/map/grid')
const { staminaPool } = require('../engine/combat/ratings')
const { missileRangeMetres } = require('../engine/combat/ranged')
const { fateChances, perOfficer, woundReason, exposureFromEvents } = require('../engine/veterans')
const { createRng } = require('../engine/rng')
const { interpretText } = require('../interpreter/orders')
const { lyingInWait } = require('../interpreter/resolve')
const { assignOfficers } = require('../engine/command/roster')
const { planTurn } = require('../opponent/planner')
const { musterOfficers, settleBattle, ridesWith, createCompany } = require('../engine/command/company')
const { bargainChips } = require('../engine/command/commander')
const { createCommanderStore } = require('./commanders')
const { digest, summarise } = require('../narrator/turnNarrator')
const { gradeOf } = require('../engine/command/officers')
const { narrateTurn, report } = require('../narrator/turnNarrator')
const { orderWords } = require('../narrator/words')
const { loadScenario, SCENARIOS, mapChoices } = require('../adapters/hotseat/scenarios')
const { MAPS } = require('../data/maps')

const TERRAIN_CODES = {
  plains: 'p', road: 'r', hill: 'h', forest: 'f', marsh: 'm', river: 'w', ford: 'd', bridge: 'b'
}

const SCENARIO_TITLES = {
  'meeting-battle': 'the meeting battle',
  'legions-vs-celts': 'Legions and Celts'
}

const where = (position) => gridLabel(position, { quarter: true })

// "red_spears" -> "Spears"; "red_unit_2" (spearmen) -> "Spearmen 2".
function unitName(unit) {
  const bare = unit.id.replace(/^(red|blue)_/, '')
  const numbered = bare.match(/^unit_(\d+)$/)
  const words = numbered ? `${String(unit.role ?? 'unit').replace(/_/g, ' ')} ${numbered[1]}` : bare.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// An order in force, in plain words. A unit with no order follows its
// side's standing order: to advance (the computer's side), or to hold.
function describeOrder(order, standing = null) {
  if (!order) return standing === 'advance' ? 'advancing on the enemy (standing orders)' : 'holding (no orders yet)'
  // The same words the read-back and the dispatches use (narrator/words.js).
  const doing = orderWords('doing', order, order.target ? where(order.target) : null)
  const more = order.steps?.length ? `, then ${order.steps.length} more ${order.steps.length === 1 ? 'step' : 'steps'}` : ''
  switch (order.action) {
    case 'ambush': return doing +
      (order.against ? `, for ${order.against}` : '') +
      (order.letPass ? `, letting ${order.letPass} pass` : '') +
      (order.regardless ? ', whatever happens' : '') + more
    default: return doing + more
  }
}

// Text for one side with unit ids swapped for names: its own units by name
// ("Spears"), enemies as "enemy spears". Ids the side does not know stay as
// they are (the narrator has already masked those).
function namer(game, side) {
  const all = [...game.battle.world.units, ...game.battle.fledUnits]
  const names = all.map(u => [u.id, u.side === side ? unitName(u) : `enemy ${unitName(u).toLowerCase()}`])
    .sort((a, b) => b[0].length - a[0].length)
  return (text) => names.reduce((out, [id, name]) => out.replace(new RegExp(`\\b${id}\\b`, 'g'), name), String(text))
}

// Men standing, fled and fallen for each side: shown once the battle is
// over, when nothing is hidden any more.
function tally(game) {
  const out = {}
  for (const side of Object.keys(game.spec.sides)) {
    const start = game.startingStrength[side] ?? 0
    const standing = game.battle.world.units.filter(u => u.side === side).reduce((n, u) => n + Math.max(0, u.strength), 0)
    const fled = game.battle.fledUnits.filter(u => u.side === side).reduce((n, u) => n + u.strength, 0)
    out[side] = { standing, fled, fallen: Math.max(0, start - standing - fled) }
  }
  return { sides: out }
}

// What became of each unit's captain, once the battle is over (ruled
// 2026-10-21: killed about 1 battle in 10 won and 1 in 5 lost; captured
// when caught in a rout; wounded by a near miss or poor choices). Each
// captain's chances come from their own unit's losses and what befell it,
// spread over the army as engine/veterans/officers.js does. Seeded from the
// battle, so the same battle always tells the same story.
function officerFates(game, side) {
  const events = game.battle.log.all()
  const result = game.outcome.winner === 'draw' ? 'draw' : game.outcome.winner === side ? 'victory' : 'defeat'
  const units = [...game.spec.units].filter(u => u.side === side)
  const random = createRng((game.seed * 31 + (side === 'red' ? 7 : 13)) >>> 0)
  const now = (id) => game.battle.world.units.find(u => u.id === id) ?? game.battle.fledUnits.find(u => u.id === id)
  // The unit a Commander in the enemy's hands gave for his freedom: its
  // officer goes with it.
  const price = commanderOf(game, side)?.price ?? null
  return units.map(spec => {
    const unit = now(spec.id)
    const losses = 1 - Math.max(0, unit?.strength ?? 0) / (spec.strength || 1)
    const exposure = exposureFromEvents(events, spec.id)
    const chances = fateChances({ result, losses, exposure })
    const roll = random()
    const pKill = perOfficer(chances.kill, units.length)
    const pCapture = perOfficer(chances.capture, units.length)
    const pWound = perOfficer(chances.wound, units.length)
    // A unit with no officer has no one to lose (the roll is still made,
    // so the others' fates do not depend on it).
    const rolled = spec.officer?.headless ? 'unhurt'
      : roll < pKill ? 'killed'
        : roll < pKill + pCapture ? 'captured'
          : roll < pKill + pCapture + pWound ? 'wounded' : 'unhurt'
    const fate = price === spec.id && !spec.officer?.headless && rolled !== 'killed' && rolled !== 'captured' ? 'given up' : rolled
    return {
      unit: unitName(spec),
      unitId: spec.id,
      officer: spec.officer?.name ?? null,
      officerId: spec.officer?.id ?? null,
      ...(spec.officer?.headless ? { headless: true } : {}),
      destroyed: (unit?.strength ?? 0) <= 0,
      fate,
      ...(fate === 'wounded' ? { how: woundReason(exposure) } : {})
    }
  })
}

function newToken() {
  return crypto.randomBytes(18).toString('base64url')
}

/**
 * @param {Object} options
 *   dir   where battles are saved (one JSON file each); null keeps them in
 *         memory only (tests)
 *   ai    an AI client (src/llm) for reading orders and narrating; null for
 *         the grammar and plain reports
 *   now   clock, for "the turn ran 2 h ago" (injectable for tests)
 */
function createBattleStore({ dir = null, ai = null, now = () => Date.now() } = {}) {
  const battles = new Map()   // id -> entry
  const seats = new Map()     // token -> { id, side }
  const commanders = createCommanderStore({ dir, now })

  // ── Saving and loading ────────────────────────────

  function save(entry) {
    if (!dir) return
    fs.mkdirSync(dir, { recursive: true })
    const data = {
      id: entry.id,
      scenario: entry.scenario,
      title: entry.title,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      seats: entry.seats,
      auto: entry.auto,
      dispatches: entry.dispatches,
      pending: entry.pending,
      // Whose company each side's officers belong to, what each Commander
      // said turn by turn (for his officers' memory), and whether the
      // battle has been written into the companies.
      commanders: entry.commanders ?? {},
      joining: entry.joining ?? null,
      said: entry.said ?? {},
      settled: Boolean(entry.settled),
      record: gameRecord(entry.game)
    }
    const file = path.join(dir, `${entry.id}.json`)
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data))
    fs.renameSync(`${file}.tmp`, file)
  }

  function load() {
    if (!dir || !fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
      const entry = { ...data, game: replayGame(data.record) }
      delete entry.record
      register(entry)
    }
    // What a server that stopped half way left undone: a battle decided
    // but not yet written into its companies; an army whose Commander does
    // not know it is in the field.
    for (const entry of battles.values()) {
      if (entry.game.outcome.decided && !entry.settled) {
        settle(entry)
        save(entry)
      }
      if (entry.settled) continue
      for (const id of Object.values(entry.commanders ?? {})) {
        const commander = commanders.byId(id)
        if (commander && !commander.ended && commander.battle !== entry.id && !fighting(commander)) commanders.setBattle(commander, entry.id)
      }
    }
  }

  function register(entry) {
    battles.set(entry.id, entry)
    for (const [side, token] of Object.entries(entry.seats)) {
      if (token) seats.set(token, { id: entry.id, side })
    }
  }

  // ── Mustering ─────────────────────────────────────

  /**
   * @param {Object} m
   *   scenario    'meeting-battle' | 'legions-vs-celts'
 *   map         'crownhill' (default) | 'ashford' | 'thornwood' | 'ravenridge'
   *   opponent    'standing' (play alone) | 'friend' (a second link)
   *   side        the side the mustering player takes
   *   timeLimitMinutes  null or minutes of battle
   *   objectives  ground to hold: grid squares or feature names
   *   seed        optional
   *   commander   the mustering player's Commander token: his company's
   *               officers lead his side, and the battle is written into
   *               the company when it ends
   * @returns {{ id, seats: { [side]: token } }} only the seats for people
   */
  function muster(m = {}) {
    const scenario = SCENARIOS[m.scenario] ? m.scenario : 'meeting-battle'
    const mapName = MAPS[m.map] ? m.map : 'crownhill'
    let spec = loadScenario(scenario, { map: mapName, deploy: true })
    const allSides = Object.keys(spec.sides)
    const side = allSides.includes(m.side) ? m.side : allSides[0]
    const other = allSides.find(s => s !== side)
    const solo = m.opponent !== 'friend'
    // A commander's units hold until ordered (ruled 2026-11-21): they attack
    // of their own accord only when told to ("seek and destroy"). The
    // standing order to advance is the computer's side's alone.
    spec = { ...spec, standingOrders: solo && spec.standingOrders?.[other] ? { [other]: spec.standingOrders[other] } : {} }
    if (m.timeLimitMinutes) spec = { ...spec, timeLimitMinutes: Number(m.timeLimitMinutes) }
    const objectives = (m.objectives ?? []).filter(Boolean).map((ground, i) => isGridRef(ground)
      ? { id: `objective-${i + 1}`, square: ground }
      : { id: `objective-${i + 1}`, feature: ground })
    if (objectives.length) spec = { ...spec, objectives }

    // Every unit gets an officer to carry the Commander's orders: a name,
    // his experience and his nature, drawn from the battle's seed.
    const seed = m.seed ?? crypto.randomInt(1, 1_000_000)
    spec = { ...spec, units: assignOfficers(spec.units, seed) }
    // The mustering Commander's own officers lead his side. His army can
    // fight one battle at a time (ruled 2026-11-22).
    const commander = m.commander ? commanders.get(m.commander) : null
    let company = null   // his company with this battle's officers given out
    if (commander) {
      mayLead(commander)
      const mine = spec.units.filter(u => u.side === side).map(u => ({ ...u, kind: unitName(u).toLowerCase() }))
      const led = musterOfficers(commander.company, mine, seed)
      company = led.company
      const officerOf = new Map(led.units.map(u => [u.id, u.officer]))
      // He is on the field himself, riding with his best unit (his
      // veteran's): there he can be taken, or killed.
      spec = {
        ...spec,
        units: spec.units.map(u => (officerOf.has(u.id) ? { ...u, officer: officerOf.get(u.id) } : u)),
        commanders: { [side]: { unitId: ridesWith(led.units) } }
      }
    }
    let game
    try {
      game = createGame(spec, { seed })
    } catch (error) {
      // Ground to hold that is not on this field, and the like: the
      // player's to put right, not a fault of the server's.
      const named = String(error.message).match(/no feature named "([^"]+)"/)
      throw Object.assign(new Error(named ? `There is no "${named[1]}" on this field to hold.` : 'That battle cannot be mustered.'), { status: 400 })
    }
    const entry = {
      id: crypto.randomBytes(6).toString('hex'),
      scenario,
      title: `${MAPS[mapName].title ?? mapName}: ${SCENARIO_TITLES[scenario] ?? scenario}`,
      createdAt: now(),
      updatedAt: now(),
      seats: { [side]: newToken(), [other]: solo ? null : newToken() },
      auto: solo ? other : null,
      dispatches: Object.fromEntries(allSides.map(s => [s, []])),
      // What each side has sent this turn, in its own words, until the
      // turn runs: so a commander can see and change it.
      pending: {},
      commanders: commander ? { [side]: commander.id } : {},
      // The friend's seat, until they choose who leads it (see join).
      joining: solo ? null : other,
      said: {},
      settled: false,
      game
    }
    register(entry)
    // The battle is saved before the company is touched: a battle that could
    // not be made changes nothing, and load() mends a stop in between.
    save(entry)
    if (commander) {
      commanders.setCompany(commander, company)
      commanders.setBattle(commander, entry.id)
    }
    return { id: entry.id, seats: Object.fromEntries(Object.entries(entry.seats).filter(([, t]) => t)) }
  }

  // The unfinished battle a Commander's army is in, if any.
  function fighting(commander) {
    // In the field until the battle is written into his company, not just
    // until it is decided: the last dispatch is written in between.
    const entry = commander.battle ? battles.get(commander.battle) : null
    return entry && !entry.settled ? entry : null
  }

  // A Commander who has fallen, or whose army is in the field, cannot lead.
  function mayLead(commander) {
    if (commander.ended) {
      throw Object.assign(new Error(`Commander ${commander.name} ${commander.ended.how === 'killed' ? 'was killed' : 'was lost'} at ${commander.ended.at}. Muster with a new Commander.`), { status: 409 })
    }
    const busy = fighting(commander)
    if (busy) {
      throw Object.assign(new Error(`${commander.name ?? 'This Commander'}'s army is in the field (${busy.title}). An army fights one battle at a time.`), { status: 409 })
    }
  }

  // ── The friend who joins by link ──────────────────

  // Whether this seat has still to choose who leads it: the friend's seat,
  // until they choose or the first turn has run.
  function choosing(entry, side) {
    return entry.joining === side && entry.game.playerTurn === 0 && !entry.game.outcome.decided
  }

  /**
   * The friend chooses who leads their side, as the mustering player does at
   * the muster: one of their Commanders (his company's officers lead their
   * units, he rides with their best unit, the battle is written into his
   * company), or none. With none they fight as a new Commander would, with
   * a veteran on their best unit and a Commander on the field, and nothing
   * is kept.
   *
   * The officers and the Commander are in the spec, and a battle is its
   * spec, seed and order log. No turn has run yet, so the game is made again
   * from the new spec and the order log so far (the mustering player's
   * first orders, if sent) played back into it: the saved battle is then
   * one spec and one log, as every battle is.
   *
   * @param {string} token           the friend's seat
   * @param {string|null} commander  their Commander's token, or null for none
   */
  function join(token, commanderToken = null) {
    const seat = seatOf(token)
    if (!seat) return null
    const { entry, side } = seat
    if (!choosing(entry, side)) {
      throw Object.assign(new Error('Who leads this side is settled: the battle has begun.'), { status: 409 })
    }
    const commander = commanderToken ? commanders.get(commanderToken) : null
    if (commanderToken && !commander) throw Object.assign(new Error('no such commander'), { status: 404 })
    if (commander) mayLead(commander)

    const record = gameRecord(entry.game)
    const mine = record.spec.units.filter(u => u.side === side).map(u => ({ ...u, kind: unitName(u).toLowerCase() }))
    // A seed of the side's own, so the two sides' first veterans are not
    // drawn alike.
    const led = musterOfficers(commander ? commander.company : createCompany(), mine, (Math.imul(record.seed, 31) + 17) >>> 0)
    const officerOf = new Map(led.units.map(u => [u.id, u.officer]))
    const spec = {
      ...record.spec,
      units: record.spec.units.map(u => (officerOf.has(u.id) ? { ...u, officer: officerOf.get(u.id) } : u)),
      commanders: { ...(record.spec.commanders ?? {}), [side]: { unitId: ridesWith(led.units) } }
    }
    entry.game = replayGame({ ...record, spec })
    entry.joining = null
    if (commander) {
      commanders.setCompany(commander, led.company)
      entry.commanders = { ...(entry.commanders ?? {}), [side]: commander.id }
    }
    entry.updatedAt = now()
    save(entry)
    if (commander) commanders.setBattle(commander, entry.id)
    return { status: 'joined', commander: commander ? commander.name : null }
  }

  /** A Commander's company, and the battle his army is in (with his seat). */
  function commanderView(token) {
    const commander = commanders.get(token)
    if (!commander) return null
    const entry = fighting(commander)
    const side = entry && Object.keys(entry.commanders ?? {}).find(s => entry.commanders[s] === commander.id)
    return { ...commanders.view(token), battle: entry ? { title: entry.title, seat: entry.seats[side] ?? null } : null }
  }

  // ── Reading ───────────────────────────────────────

  function seatOf(token) {
    const seat = seats.get(token)
    if (!seat) return null
    return { entry: battles.get(seat.id), side: seat.side }
  }

  function status(entry, side) {
    if (entry.game.outcome.decided) return 'finished'
    return entry.pending[side] ? 'waiting' : 'your-orders'
  }

  /** A battle as one line, for "your battles". */
  function summary(token) {
    const seat = seatOf(token)
    if (!seat) return null
    const { entry, side } = seat
    const game = entry.game
    return {
      token,
      id: entry.id,
      title: entry.title,
      side,
      opponent: entry.auto ? 'standing' : 'friend',
      status: status(entry, side),
      turn: game.playerTurn + 1,
      minutes: game.minutesElapsed,
      outcome: game.outcome.decided ? game.outcome : null,
      updatedAt: entry.updatedAt,
      sentAt: entry.pending[side]?.at ?? null
    }
  }

  // The context the order reader needs: this side's own units and what it
  // knows of the enemy.
  function context(entry, side) {
    const game = entry.game
    return {
      map: game.battle.map,
      units: game.battle.world.units.filter(u => u.side === side && u.strength > 0 && !game.battle.broken.has(u.id))
        .map(u => ({ ...u, aliases: [unitName(u).toLowerCase()] })),
      enemies: sideView(game, side).intel,
      lyingInWait: lyingInWait(game.battle, side),
      // For counsel: the units that would break at the first blow.
      shaken: game.battle.world.units.filter(u => u.side === side && game.battle.isShaken(u)).map(u => u.id)
    }
  }

  /**
   * Everything one side may see, for the Command Tent. With `atGame`, the
   * same view of an earlier state of the battle (the replay).
   */
  function view(token, atGame = null) {
    const seat = seatOf(token)
    if (!seat) return null
    const { entry, side } = seat
    const game = atGame ?? entry.game
    const battle = game.battle
    const map = battle.map
    const sv = sideView(game, side)

    const terrain = []
    for (let y = 0; y < map.height; y++) {
      let row = ''
      for (let x = 0; x < map.width; x++) row += TERRAIN_CODES[map.terrainAt({ x, y })] ?? 'p'
      terrain.push(row)
    }

    const own = battle.world.units.filter(u => u.side === side && u.strength > 0).map(u => {
      const state = battle.resolver.getState(u.id)
      return {
        id: u.id,
        name: unitName(u),
        role: u.role ?? null,
        quality: u.quality ?? null,
        mounted: Boolean(u.mounted),
        position: { ...u.position },
        at: where(u.position),
        strength: u.strength,
        maxStrength: u.maxStrength,
        morale: state ? Math.round(state.morale) : 100,
        stamina: state ? Math.round(state.stamina) : staminaPool(u),
        staminaPool: staminaPool(u),
        broken: battle.broken.has(u.id),
        hidden: battle.hidden.has(u.id),
        crowding: battle.crowding.get(u.id) ?? 'organized',
        // The officer who carries your orders to this unit.
        // A unit can have none: it has yet to earn one.
        officer: !u.officer ? null
          : u.officer.headless ? { headless: true }
            : { name: u.officer.name, grade: gradeOf(u.officer), personality: u.officer.personality },
        // Missile troops: how far they shoot, and whether they are holding fire.
        shootsTo: missileRangeMetres(u) || null,
        holdingFire: Boolean(battle.orderBook.get(u.id)?.holdFire),
        order: battle.broken.has(u.id)
          ? 'broken and fleeing'
          : describeOrder(battle.orderBook.get(u.id), game.spec.standingOrders?.[side]) +
            (battle.rallied?.has(u.id) ? (state && state.morale <= 25 ? ' (rallied, at breaking point)' : ' (rallied)') : ''),
        target: battle.orderBook.get(u.id)?.target ?? null
      }
    })
    const fallen = [...battle.world.units.filter(u => u.side === side && u.strength <= 0),
      ...battle.fledUnits.filter(u => u.side === side)].map(u => ({ id: u.id, name: unitName(u), fled: u.strength > 0 }))

    const enemies = sv.intel.map(e => {
      const unit = battle.world.units.find(u => u.id === e.id) ?? battle.fledUnits.find(u => u.id === e.id)
      return {
        id: e.id,
        name: unit ? unitName(unit) : e.id,
        role: unit?.role ?? null,
        mounted: Boolean(unit?.mounted),
        status: e.status,
        position: e.position,
        at: where(e.position),
        strength: e.strength,
        seenOnTurn: e.seenOnTurn,
        minutesAgo: Math.max(0, (battle.turn - e.seenOnTurn) * 10)
      }
    })

    const objectives = (game.objectives ?? []).map(o => ({
      id: o.id,
      name: o.name,
      tiles: o.tiles,
      holder: game.objectiveHolds[o.id]?.side ?? null
    }))

    const landmarks = detectFeatures(map).filter(f => f.name).map(f => ({ name: f.name, kind: f.kind, centre: f.centre }))

    const line = summary(token)
    return {
      battle: atGame
        ? { ...line, turn: game.playerTurn + 1, minutes: game.minutesElapsed, sides: sides(battle.world), timeLimitMinutes: game.spec.timeLimitMinutes ?? null }
        : { ...line, sides: sides(battle.world), timeLimitMinutes: game.spec.timeLimitMinutes ?? null },
      map: { name: map.name, width: map.width, height: map.height, squareTiles: 4, terrain, landmarks },
      own,
      fallen,
      enemies,
      objectives,
      pending: entry.pending[side] ?? null,
      // The friend has yet to choose who leads (join).
      choosing: !atGame && choosing(entry, side),
      commander: commanderView_(game, side, atGame),
      dispatches: [...entry.dispatches[side]].reverse(),
      verdict: game.outcome.decided && !atGame
        ? { ...tally(game), officers: officerFates(game, side), company: Boolean(entry.commanders?.[side]), commander: commanderEnd(game, side) }
        : null
    }
  }

  /**
   * A finished battle, as this side saw it after a given turn (0: before the
   * first). Only once the battle is over: replaying is for looking back.
   */
  function replay(token, turn) {
    const seat = seatOf(token)
    if (!seat || !seat.entry.game.outcome.decided) return null
    const record = gameRecord(seat.entry.game)
    const target = Math.max(0, Math.min(Number(turn) || 0, seat.entry.game.playerTurn))
    // Play the log forward one submission at a time until that turn has run.
    const game = createGame(record.spec, { seed: record.seed })
    for (const logged of record.orderLog) {
      if (game.playerTurn >= target) break
      if (logged.forced) forceProcess(game)
      else submitOrders(game, logged.side, logged.orders)
    }
    const seen = view(token, game)
    return { turn: target, lastTurn: seat.entry.game.playerTurn, map: seen.map, own: seen.own, enemies: seen.enemies, objectives: seen.objectives, battle: seen.battle }
  }

  // ── Orders ────────────────────────────────────────

  // The Commander on the field, as his own side sees him: the unit he
  // rides with; or that he is held, by whom, and what he could give up to
  // go free.
  function commanderView_(game, side, atGame) {
    const c = game.battle.commanders?.[side]
    if (!c || atGame) return null
    const name = namer(game, side)
    return {
      status: c.status,
      unitId: c.status === 'free' ? c.unitId : null,
      with: c.status === 'free' ? name(c.unitId) : null,
      heldBy: c.status === 'held' ? name(c.heldBy) : null,
      chips: c.status === 'held' ? bargainChips(game.battle.world, side).map(u => ({ id: u.id, name: unitName(u) })) : []
    }
  }
  // What became of him, for the verdict.
  function commanderEnd(game, side) {
    const end = commanderOf(game, side)
    return end ? { fate: end.fate, price: end.price ? namer(game, side)(end.price) : null } : null
  }

  /**
   * A Commander in the enemy's hands gives up one of his units still on the
   * field and leaves it: the battle is lost, and he is free.
   */
  async function bargain(token, unitId) {
    const seat = seatOf(token)
    if (!seat) return null
    const { entry, side } = seat
    const game = entry.game
    if (game.outcome.decided) return { status: 'finished' }
    const c = game.battle.commanders?.[side]
    if (c?.status !== 'held' || !bargainChips(game.battle.world, side).some(u => u.id === unitId)) {
      throw Object.assign(new Error('That is not yours to give.'), { status: 409 })
    }
    submitOrders(game, side, { bargain: unitId })
    entry.pending = {}
    await finishTurn(entry)
    return { status: 'finished' }
  }

  // A turn has run. The battle is saved first, then its dispatches written
  // (which may wait on the AI), then a finished battle is written into its
  // companies, and saved again. A server that stops in between loses at
  // most a dispatch: load() does the rest.
  async function finishTurn(entry) {
    entry.updatedAt = now()
    save(entry)
    await writeDispatches(entry)
    settle(entry)
    entry.updatedAt = now()
    save(entry)
  }

  // One thing at a time for each battle: orders read by the AI take a
  // moment, and a second request in that moment must not run a turn of its
  // own or finish the battle underneath the first.
  const lines = new Map()   // battle id -> the last request made of it
  function inTurn(token, work) {
    const seat = seatOf(token)
    if (!seat) return Promise.resolve(null)
    const last = lines.get(seat.entry.id) ?? Promise.resolve()
    const mine = last.then(work)
    lines.set(seat.entry.id, mine.catch(() => {}))
    return mine
  }

  // The friend's first orders wait on their choice of who leads.
  function mustHaveChosen(entry, side) {
    if (choosing(entry, side)) throw Object.assign(new Error('Choose who leads your side first.'), { status: 409 })
  }

  /** Read orders back without sending them. */
  async function readBack(token, text) {
    const seat = seatOf(token)
    if (!seat) return null
    mustHaveChosen(seat.entry, seat.side)
    const read = await interpretText(String(text ?? ''), context(seat.entry, seat.side), { ai })
    const name = namer(seat.entry.game, seat.side)
    return {
      understood: read.understood.map(name), questions: read.questions.map(name), notes: (read.notes ?? []).map(name),
      counsel: (read.counsel ?? []).map(name),
      choices: (read.choices ?? []).map(c => ({ ...c, question: name(c.question) })), source: read.source, surrender: read.surrender
    }
  }

  /**
   * Send orders. A question sends nothing, unless `sendClear` says to send
   * the orders that were understood and leave the rest: one unclear order
   * should not hold up, or throw away, the others. When every side is in,
   * the turn runs and each side gets its report.
   */
  async function submit(token, text, { sendClear = false } = {}) {
    const seat = seatOf(token)
    if (!seat) return null
    const { entry, side } = seat
    const game = entry.game
    if (game.outcome.decided) return { status: 'finished' }
    mustHaveChosen(entry, side)

    // A Commander in the enemy's hands sends no orders: he waits, and the
    // turn runs on the orders his units have. (He may still yield.)
    const held = game.battle.commanders?.[side]?.status === 'held'
    const said = String(text ?? '')
    const read = await interpretText(!held ? said : /^\s*(i\s+)?(yield|surrender)\s*$/i.test(said) ? 'yield' : '', context(entry, side), { ai })
    const name = namer(game, side)
    const understood = read.understood.map(name)
    if (read.questions.length > 0 && !(sendClear && read.orders.length > 0)) {
      return {
        status: 'clarify', questions: read.questions.map(name), understood, counsel: (read.counsel ?? []).map(name),
        choices: (read.choices ?? []).map(c => ({ ...c, question: name(c.question) })),
        canSendRest: read.orders.length > 0
      }
    }

    const notes = [...(read.notes ?? []), ...read.questions.map(q => `Not sent: ${q}`)].map(name)
    entry.pending[side] = { text: String(text ?? ''), understood, notes, at: now() }
    if (understood.length > 0) {
      entry.said = entry.said ?? {}
      entry.said[side] = [...(entry.said[side] ?? []), { turn: game.playerTurn + 1, lines: understood }].slice(-60)
    }
    let result = submitOrders(game, side, read.surrender ? { surrender: true } : read.orders)
    // Solo: the computer's side answers at once, with the orders it thinks
    // best from what it has seen (opponent/planner.js).
    if (result.status === 'waiting' && entry.auto && result.waitingOn.includes(entry.auto)) {
      result = submitOrders(game, entry.auto, planTurn(game, entry.auto))
    }

    if (result.status !== 'waiting') {
      entry.pending = {}
      await finishTurn(entry)
    } else {
      entry.updatedAt = now()
      save(entry)
    }
    return { status: result.status === 'waiting' ? 'waiting' : 'turn-ran', understood, notes }
  }

  // A finished battle is written into the company of each Commander who
  // fought it, once: who lived, what each officer's unit did, and what the
  // Commander told him (his memory of it).
  function settle(entry) {
    const game = entry.game
    if (!game.outcome.decided || entry.settled) return
    entry.settled = true
    for (const [side, id] of Object.entries(entry.commanders ?? {})) {
      const commander = commanders.byId(id)
      if (!commander) continue
      const name = namer(game, side)
      const result = game.outcome.winner === 'draw' ? 'draw' : game.outcome.winner === side ? 'victory' : 'defeat'
      const events = summarise(game.battle.log.all())
      const said = (entry.said?.[side] ?? []).flatMap(s => s.lines)
      const price = commanderOf(game, side)?.price ?? null
      // Every unit that fought: an officer's fate, or (officerId null) a
      // unit with none, which is a battle nearer to earning one.
      const fates = officerFates(game, side).map(f => {
        const deeds = digest(events, { map: game.battle.map, ownIds: new Set([f.unitId]) })[0]?.text ?? ''
        return {
          unitId: f.unitId, culture: game.spec.units.find(u => u.id === f.unitId)?.culture ?? null,
          officerId: f.officerId, unit: f.unit.toLowerCase(), destroyed: f.destroyed,
          fate: f.headless && price === f.unitId ? 'given up' : f.fate, ...(f.how ? { how: f.how } : {}),
          deeds: name(deeds).replace(/^[^:]+:\s*/, '').replace('BROKE', 'broke'),
          // "Spears, Swords: advance on the enemy" was said to both.
          orders: said
            .filter(line => line.slice(0, line.indexOf(':')).toLowerCase().split(/,\s*/).includes(f.unit.toLowerCase()))
            .map(line => line.replace(/^[^:]+:\s*/, ''))
        }
      })
      const end = commanderOf(game, side)
      commanders.setCompany(commander, settleBattle(commander.company, { id: entry.id, title: entry.title, result, seed: game.seed }, fates))
      if (commander.battle === entry.id) commanders.setBattle(commander, null)
      // Killed, or lost in the enemy's hands with nothing to bargain with:
      // everything ends with him.
      if (end?.fate === 'killed' || end?.fate === 'lost') commanders.end(commander, { how: end.fate, at: entry.title })
    }
  }

  // Each human side's report of the turn just run: the plain account (fog
  // of war held) and, when the AI is on, the narrated one.
  async function writeDispatches(entry) {
    const game = entry.game
    const turnEntry = game.history.at(-1)
    for (const side of Object.keys(entry.seats)) {
      if (!entry.seats[side]) continue
      const name = namer(game, side)
      const events = turnEntry.ticks.flatMap(t => game.battle.log.forTurn(t.battleTurn))
      const own = [...game.battle.world.units, ...game.battle.fledUnits].filter(u => u.side === side)
      const seen = sideView(game, side).intel.filter(e => e.status === 'visible').map(e => e.id)
      const ownIds = new Set(own.map(u => u.id))
      const turn = {
        map: game.battle.map, side, culture: own[0]?.culture ?? 'unknown',
        ownIds, seenEnemyIds: new Set(seen), events, nameOf: name,
        // Where each of the side's own units stands now, to say where it fought.
        whereIs: (id) => own.find(u => u.id === id)?.position ?? null
      }
      // The plain account: what this side could know, most important first,
      // the fighting told unit by unit.
      const lines = report(turn).map(l => l.charAt(0).toUpperCase() + l.slice(1))
      const told = await narrateTurn(ai, { ...turn, plain: lines.join('\n') })
      entry.dispatches[side].push({
        turn: turnEntry.playerTurn,
        minutes: game.minutesElapsed,
        interrupt: turnEntry.interrupt,
        lines,
        narrated: told.source === 'ai' ? told.text : null,
        // The AI is on and there was something to tell, but it did not
        // answer: the page says this is the plain account.
        ...(ai?.configured && told.source !== 'ai' && lines.length > 0 ? { plainReport: true } : {}),
        at: now()
      })
    }
  }

  load()

  return {
    muster,
    join,
    summary,
    view,
    replay,
    readBack,
    submit: (token, text, options) => inTurn(token, () => submit(token, text, options)),
    bargain: (token, unitId) => inTurn(token, () => bargain(token, unitId)),
    seatOf,
    commanders,
    commanderView,
    scenarios: () => Object.keys(SCENARIOS).map(id => ({ id, title: SCENARIO_TITLES[id] ?? id })),
    maps: () => mapChoices()
  }
}

module.exports = { createBattleStore, unitName, describeOrder }
