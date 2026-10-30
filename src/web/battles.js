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

const { createGame, submitOrders, forceProcess, sideView, gameRecord, replayGame } = require('../engine/orchestrator')
const { sides } = require('../engine/world')
const { gridLabel } = require('../engine/map/grid')
const { detectFeatures } = require('../engine/map/features')
const { isGridRef } = require('../engine/map/grid')
const { staminaPool } = require('../engine/combat/ratings')
const { interpretText } = require('../interpreter/orders')
const { narrateTurn, visibleEvents, maskNames, fact } = require('../narrator/turnNarrator')
const { loadScenario, SCENARIOS } = require('../adapters/hotseat/scenarios')

const TERRAIN_CODES = {
  plains: 'p', road: 'r', hill: 'h', forest: 'f', marsh: 'm', river: 'w', ford: 'd', bridge: 'b'
}

const SCENARIO_TITLES = {
  'meeting-battle': 'Crownhill: the meeting battle',
  'legions-vs-celts': 'Crownhill: Legions and Celts'
}

const where = (position) => gridLabel(position, { quarter: true })

// "red_spears" -> "Spears"; "red_unit_2" (spearmen) -> "Spearmen 2".
function unitName(unit) {
  const bare = unit.id.replace(/^(red|blue)_/, '')
  const numbered = bare.match(/^unit_(\d+)$/)
  const words = numbered ? `${String(unit.role ?? 'unit').replace(/_/g, ' ')} ${numbered[1]}` : bare.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// An order in force, in plain words.
function describeOrder(order) {
  if (!order) return 'following the standing orders'
  const at = order.target ? ` ${where(order.target)}` : ''
  const careful = order.careful ? ', carefully' : ''
  switch (order.action) {
    case 'hold': return 'holding'
    case 'move': return `moving to${at}${careful}` + (order.then === 'hold' ? ', then holding' : '')
    case 'defend': return `defending${at}${careful}`
    case 'advance': return `advancing on the enemy${careful}`
    case 'attack': return `attacking${at}${careful}`
    case 'withdraw': return `falling back${at}${careful}`
    case 'hide': return `hiding${at}`
    case 'check': return `searching the ground${at}`
    case 'ambush': return `lying in ambush${at}` +
      (order.against ? `, for ${order.against}` : '') +
      (order.letPass ? `, letting ${order.letPass} pass` : '') +
      (order.regardless ? ', whatever happens' : '')
    default: return order.action
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

// One event as a sentence for the plain account. A round of fighting is told
// as men lost, not as the combat engine's numbers.
function plainLine(game, event) {
  if (event.type === 'exchange') {
    return `${event.a.unitId} and ${event.b.unitId} fought: ${event.a.unitId} lost ${event.a.killed} men, ${event.b.unitId} ${event.b.killed}`
  }
  if (event.type === 'objective') {
    const words = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : null
    return fact(game.battle.map, { ...event, side: words(event.side), was: words(event.was) })
  }
  return fact(game.battle.map, event)
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
   *   opponent    'standing' (play alone) | 'friend' (a second link)
   *   side        the side the mustering player takes
   *   timeLimitMinutes  null or minutes of battle
   *   objectives  ground to hold: grid squares or feature names
   *   seed        optional
   * @returns {{ id, seats: { [side]: token } }} only the seats for people
   */
  function muster(m = {}) {
    const scenario = SCENARIOS[m.scenario] ? m.scenario : 'meeting-battle'
    let spec = loadScenario(scenario)
    const allSides = Object.keys(spec.sides)
    const side = allSides.includes(m.side) ? m.side : allSides[0]
    const other = allSides.find(s => s !== side)
    if (m.timeLimitMinutes) spec = { ...spec, timeLimitMinutes: Number(m.timeLimitMinutes) }
    const objectives = (m.objectives ?? []).filter(Boolean).map((ground, i) => isGridRef(ground)
      ? { id: `objective-${i + 1}`, square: ground }
      : { id: `objective-${i + 1}`, feature: ground })
    if (objectives.length) spec = { ...spec, objectives }

    const game = createGame(spec, { seed: m.seed ?? crypto.randomInt(1, 1_000_000) })
    const solo = m.opponent !== 'friend'
    const entry = {
      id: crypto.randomBytes(6).toString('hex'),
      scenario,
      title: SCENARIO_TITLES[scenario] ?? scenario,
      createdAt: now(),
      updatedAt: now(),
      seats: { [side]: newToken(), [other]: solo ? null : newToken() },
      auto: solo ? other : null,
      dispatches: Object.fromEntries(allSides.map(s => [s, []])),
      // What each side has sent this turn, in its own words, until the
      // turn runs: so a commander can see and change it.
      pending: {},
      game
    }
    register(entry)
    save(entry)
    return { id: entry.id, seats: Object.fromEntries(Object.entries(entry.seats).filter(([, t]) => t)) }
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
      enemies: sideView(game, side).intel
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
        order: battle.broken.has(u.id) ? 'broken and fleeing' : describeOrder(battle.orderBook.get(u.id)),
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
      dispatches: [...entry.dispatches[side]].reverse(),
      verdict: game.outcome.decided ? tally(game) : null
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

  /** Read orders back without sending them. */
  async function readBack(token, text) {
    const seat = seatOf(token)
    if (!seat) return null
    const read = await interpretText(String(text ?? ''), context(seat.entry, seat.side), { ai })
    const name = namer(seat.entry.game, seat.side)
    return { understood: read.understood.map(name), questions: read.questions.map(name), source: read.source, surrender: read.surrender }
  }

  /**
   * Send orders. Questions send nothing. When every side is in, the turn
   * runs and each side gets its report.
   */
  async function submit(token, text) {
    const seat = seatOf(token)
    if (!seat) return null
    const { entry, side } = seat
    const game = entry.game
    if (game.outcome.decided) return { status: 'finished' }

    const read = await interpretText(String(text ?? ''), context(entry, side), { ai })
    const name = namer(game, side)
    const understood = read.understood.map(name)
    if (read.questions.length > 0) {
      return { status: 'clarify', questions: read.questions.map(name), understood }
    }

    entry.pending[side] = { text: String(text ?? ''), understood, at: now() }
    let result = submitOrders(game, side, read.surrender ? { surrender: true } : read.orders)
    // Solo: the standing orders answer at once.
    if (result.status === 'waiting' && entry.auto && result.waitingOn.includes(entry.auto)) {
      result = submitOrders(game, entry.auto, [])
    }

    if (result.status !== 'waiting') {
      entry.pending = {}
      await writeDispatches(entry)
    }
    entry.updatedAt = now()
    save(entry)
    return { status: result.status === 'waiting' ? 'waiting' : 'turn-ran', understood }
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
      const known = (id) => ownIds.has(id) || seen.includes(id)
      // The plain account: what this side could know, one sentence each.
      const lines = visibleEvents(events, { ownIds, seenEnemyIds: new Set(seen) })
        .map(e => plainLine(game, maskNames(e, known)))
        .filter(Boolean)
        .map(l => name(l))
        .map(l => l.charAt(0).toUpperCase() + l.slice(1))
      const told = await narrateTurn(ai, {
        map: game.battle.map, side, culture: own[0]?.culture ?? 'unknown',
        ownIds, seenEnemyIds: new Set(seen), events,
        plain: lines.join('\n')
      })
      entry.dispatches[side].push({
        turn: turnEntry.playerTurn,
        minutes: game.minutesElapsed,
        interrupt: turnEntry.interrupt,
        lines,
        narrated: told.source === 'ai' ? name(told.text) : null,
        at: now()
      })
    }
  }

  load()

  return {
    muster,
    summary,
    view,
    replay,
    readBack,
    submit,
    seatOf,
    scenarios: () => Object.keys(SCENARIOS).map(id => ({ id, title: SCENARIO_TITLES[id] ?? id }))
  }
}

module.exports = { createBattleStore, unitName, describeOrder }
