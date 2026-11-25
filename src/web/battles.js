// src/web/battles.js
//
// The web app's battles: everything the server does except speak HTTP.
//
// A battle is the engine's game (src/engine/orchestrator) plus what the web
// needs around it: one secret link per side (a "seat"), the turn reports
// each side has received, and when things happened. It is saved as a JSON
// document (storage.js: a file, or a row in Postgres) and rebuilt on start
// by replaying its order log (gameRecord / replayGame), so a battle
// survives the server stopping, which matters for a game played over days
// (ruled 2026-10-29).
//
// Fog of war is enforced here, not in the browser: a seat only ever gets
// its own side's view. Nothing about an enemy the side has not seen leaves
// this module.

const crypto = require('crypto')

const { createGame, submitOrders, forceProcess, sideView, gameRecord, replayGame, commanderOf, captorOf, checkOffer, checkAnswer, waitingOn } = require('../engine/orchestrator')
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
const { withCommander, commanderOf: enemyCommanderOf } = require('../opponent/commander')
const { musterOfficers, settleBattle, ridesWith, createCompany } = require('../engine/command/company')
const { unitsOf } = require('../engine/command/company')
const { matchedVeterancy } = require('../engine/veterans/veterancy')
const { bargainChips, canRide, heldSight, sightFrom } = require('../engine/command/commander')
const { orderDelays, byCommandPost } = require('../engine/command/messengers')
const { knownEnemies, newsBetween, arrivalOf } = require('../engine/orchestrator/word')
const { aboutHowMany } = require('../engine/orchestrator/reports')
const { captorAnswer } = require('../opponent/captor')
const { createCommanderStore } = require('./commanders')
const { createFileStorage } = require('./storage')
const { digest, summarise, placeName } = require('../narrator/turnNarrator')
const { gradeOf, DEATH_ODDS, loyaltyBand } = require('../engine/command/officers')
const T = require('../engine/combat/tables')
const { narrateTurn, report } = require('../narrator/turnNarrator')
const { orderWords, RIDER, NIGHT, REPORT, GROUND, ENEMY_COMMANDER, FIELD } = require('../narrator/words')
const { BATTLE_OVER, kindWords } = require('../narrator/words')
const { VERDICT } = require('../narrator/words')
const { KINDS } = require('../narrator/words')
const { standShare } = require('../engine/orchestrator/victory')
const { loadScenario, SCENARIOS, mapChoices } = require('../adapters/hotseat/scenarios')
const { MAPS, groundOf, kindsOf, kindSpec } = require('../data/maps')
const { FACTIONS, factionChoices } = require('../engine/army/factions')
const { fieldArmies, anyFaction, usualArmy, kitOf, baseOf } = require('../engine/army/standard')
const { withSecondLine, linesOf } = require('../engine/army/secondLine')
const { armyChanged, handOver, takeIn, moveOfficer, renameUnit } = require('../engine/command/company')
const { checkArmy, appraise, unitNoun, perkLines } = require('./armies')
const { rosterOf, marchingOf, checkMarching, fieldingOf, benchedOf, plainName, nameRefusal, renamed, without, addToRoster } = require('./roster')
const { PARLEY } = T

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
// `name` words an enemy unit's id ("enemy archers"), for an attack on one.
function describeOrder(order, standing = null, name = (id) => id) {
  if (!order) return standing === 'advance' ? 'advancing on the enemy (standing orders)' : 'holding (no orders yet)'
  // The same words the read-back and the dispatches use (narrator/words.js).
  const doing = orderWords('doing', order, order.enemy ? name(order.enemy) : order.friend ? name(order.friend) : order.target ? where(order.target) : null)
  const more = order.steps?.length ? `, then ${order.steps.length} more ${order.steps.length === 1 ? 'step' : 'steps'}` : ''
  switch (order.action) {
    case 'ambush': return doing +
      (order.against ? `, for ${order.against}` : '') +
      (order.letPass ? `, letting ${order.letPass} pass` : '') +
      (order.regardless ? ', whatever happens' : '') + more
    default: return doing + more
  }
}

// One piece of the ground to fight for as one side is told it: who holds
// it, and, when one side holds all of it, how long it has left to hold.
function groundStatus(game, objective, side) {
  const holder = game.objectiveHolds[objective.id]?.side ?? null
  const holds = game.objectives.map(o => game.objectiveHolds[o.id])
  const length = game.spec.objectiveHoldMinutes ?? T.GROUND.HOLD_MINUTES
  const all = !game.outcome.decided && !game.spec.objectiveTurnsToWin && holder && holds.every(h => h?.side === holder)
  const left = all ? Math.max(0, length - Math.min(...holds.map(h => game.minutesElapsed - h.sinceMinute))) : null
  // Held by the enemy, he can send no orders: his army is told of (S11).
  const words = game.battle.commanders?.[side]?.status === 'held' ? GROUND.held : GROUND
  // Held before and no one's alone now: both may be on it, or neither (S12).
  if (holder === null && game.battle.log.all().some(e => e.type === 'objective' && e.objectiveId === objective.id)) return GROUND.noOnesAlone(objective.name)
  return words.status(objective.name, holder === null ? null : holder === side, left)
}

// Who a side knows to be on a piece of the ground to fight for now, by
// name (S12: "You no longer hold the Crownhill" said nothing of who was on
// it): an enemy unit of his reports last placed on it, and his own men by
// their word (or, with no word, where they are). Within the ground's reach,
// as engine/orchestrator/victory.js counts it.
function knownOnGround(game, side, groundName) {
  const o = (game.objectives ?? []).find(g => g.name === groundName)
  if (!o) return {}
  const tiles = o.tiles ?? [o.coord]
  const reach = o.reach ?? (o.single === false ? 0 : 1)
  const on = (p) => Boolean(p) && tiles.some(t => Math.abs(p.x - t.x) + Math.abs(p.y - t.y) <= reach)
  const word = game.word?.[side] ?? null
  const own = word
    ? Object.values(word.units).some(u => !u.gone && !u.broken && on(u.position))
    : game.battle.world.units.some(u => u.side === side && u.strength > 0 && !game.battle.broken.has(u.id) && on(u.position))
  const enemy = Object.values(enemyKnowledge(game, side)).some(e => e.status !== 'gone' && on(e.position))
  return { own, enemy }
}

// ── The kinds of battle (ruled 2026-11-25) ──
// A battle's kind: its spec's, else (a battle saved before the kinds, or
// one whose ground the API named) a battle for ground if it has ground, a
// pitched battle if not.
const kindOfBattle = (spec) => spec.kind ?? ((spec.objectives ?? []).length ? 'ground' : 'pitched')
// Some of several grounds to hold: how many, or null.
const neededOf = (game) => (Number.isInteger(game.spec.objectivesNeeded) && game.spec.objectivesNeeded < game.objectives.length ? game.spec.objectivesNeeded : null)
const calledOf = (game) => game.spec.groundCalled ?? 'pieces of ground'

// The line under the map in the tent, for the whole battle, when one line
// says it better than a line for each piece of ground: a pitched battle's
// rule; or, with some of several grounds to hold, who holds which (every
// side knows at once) and the rule, with the time left to the side on the
// clock. Null otherwise (each piece's own line, groundStatus).
function battleLine(game, side) {
  if (game.spec.kind === 'pitched' && game.objectives.length === 0) return KINDS.pitched.tent(T.PITCHED.STAND_SHARE)
  const needed = neededOf(game)
  if (!needed) return null
  const holder = (o) => game.objectiveHolds[o.id]?.side ?? null
  const length = game.spec.objectiveHoldMinutes ?? T.GROUND.HOLD_MINUTES
  const f = !game.outcome.decided ? game.fieldHold ?? null : null
  return GROUND.some.status({
    mine: game.objectives.filter(o => holder(o) === side).map(o => o.name),
    theirs: game.objectives.filter(o => holder(o) !== null && holder(o) !== side).map(o => o.name),
    needed, count: game.objectives.length, called: calledOf(game), minutes: length,
    onClock: f ? f.side === side : null,
    left: f ? Math.max(0, length - (game.minutesElapsed - f.sinceMinute)) : null,
    held: game.battle.commanders?.[side]?.status === 'held'
  })
}

// The battle's end as the verdict says it, for the endings that need more
// than BATTLE_OVER's words: the ground (and which of it), and night in a
// pitched battle. Null for the rest.
function endSaid(game, side) {
  const o = game.outcome
  const mine = o.winner === side
  const length = game.spec.objectiveHoldMinutes ?? T.GROUND.HOLD_MINUTES
  if (o.reason === 'objectives held') {
    const needed = neededOf(game)
    if (!needed) return GROUND.won(game.objectives.map(g => g.name), mine, length)
    const held = game.objectives.filter(g => game.objectiveHolds[g.id]?.side === o.winner).map(g => g.name)
    return GROUND.some.won(held, mine, length, needed, game.objectives.length, calledOf(game))
  }
  const share = T.PITCHED.STAND_SHARE
  if (o.reason === 'field held at nightfall') return KINDS.pitched.held(mine, share)
  if (o.reason === 'night fell' && game.spec.kind === 'pitched') {
    const all = Object.keys(game.startingStrength)
    const standing = all.filter(s => standShare(game.battle.world, game.battle.broken, s, game.startingStrength) >= share)
    return standing.length === all.length ? KINDS.pitched.tie(share) : KINDS.pitched.neither(share)
  }
  return null
}

// Text for one side with unit ids swapped for names: its own units by name
// ("Spears"), enemies as "enemy spears". Ids the side does not know stay as
// they are (the narrator has already masked those).
//
// An enemy is named as his reports have told it (engine/orchestrator/
// reports.js): by its kind once a report has told it ("enemy archers"),
// else "enemy troops" (ruled 2026-11-23: "additional details as
// progression happens but never incorrect details"). The unit holding him,
// when he is held, he sees for himself.
function namer(game, side) {
  const all = [...game.battle.world.units, ...game.battle.fledUnits]
  const known = enemyKnowledge(game, side)
  const c = game.battle.commanders?.[side]
  const holder = c?.status === 'held' ? c.heldBy : null
  const names = all.map(u => [u.id, u.side === side ? unitName(u)
    : known[u.id]?.told && !known[u.id].told.kind && u.id !== holder ? `enemy ${REPORT.troops}` : `enemy ${unitName(u).toLowerCase()}`])
    .sort((a, b) => b[0].length - a[0].length)
  return (text) => names.reduce((out, [id, name]) => out.replace(new RegExp(`\\b${id}\\b`, 'g'), name), String(text))
}

// A question's choices as the Commander reads them: an enemy by the name his
// side knows it by ("enemy light horse"), not by the word he typed, and
// never its id (which would tell its kind).
function namedChoices(choices, name) {
  return (choices ?? []).map(c => ({
    ...c,
    question: name(c.question),
    options: (c.options ?? []).map(({ enemy, seen, ...o }) => (enemy ? { ...o, label: `${name(enemy)} ${seen}` } : o))
  }))
}

// What a side knows of the enemy now: as reported to its Commander, when he
// is with his army and the battle is on; else its side's own sight.
function enemyKnowledge(game, side) {
  const word = game.battle.commanders?.[side]?.status === 'free' && !game.outcome?.decided ? game.word?.[side] ?? null : null
  return word ? word.enemies : game.intel?.[side]?.known ?? {}
}

// What the reports of an enemy unit hold (engine/orchestrator/reports.js).
// An entry with none (the enemy as a held Commander sees it from where he
// sits, built in view) is told whole, as before.
function toldOf(e, unit = null) {
  if (e.told) return e.told
  const on = e.seenOnTurn ?? 0
  const kind = { role: e.role ?? unit?.role ?? null, mounted: Boolean(e.mounted ?? unit?.mounted), primaryWeapon: e.primaryWeapon ?? unit?.primaryWeapon ?? null, on }
  return { grade: T.REPORTS.NO_OFFICERS, on, kind, ...(e.strength !== undefined ? { count: { exact: true, strength: e.strength, on } } : {}) }
}

// The id the browser knows an enemy unit by. Its own id says what kind it
// is ("blue_slingers"), so an enemy whose kind he has not been told goes by
// a stand-in made from the battle's seed, which tells nothing.
function enemyHandle(game, e) {
  if (toldOf(e).kind) return e.id
  return 'enemy-' + crypto.createHash('sha256').update(`${game.seed}:${e.id}`).digest('hex').slice(0, 10)
}

// One enemy unit as a seat is shown it: where and when, and only what the
// reports of it hold (the fog test proves it, src/web/tests/reports.test.js).
function enemyView(game, e, unit, turn) {
  const told = toldOf(e, unit)
  const kind = told.kind ?? null
  const age = (fact) => Math.max(0, (turn - fact.on) * 10)
  const minutesAgo = Math.max(0, (turn - e.seenOnTurn) * 10)
  const count = told.count ? (told.count.exact ? { exact: true, strength: told.count.strength } : { exact: false, band: told.count.band }) : null
  return {
    id: enemyHandle(game, e),
    name: kind ? (unit ? unitName(unit) : e.id) : capitalise(`enemy ${REPORT.troops}`),
    role: kind ? kind.role : null,
    mounted: kind ? kind.mounted : false,
    ...(kind ? {} : { unknownKind: true }),
    status: e.status,
    position: e.position,
    at: where(e.position),
    ...(count?.exact ? { strength: count.strength } : {}),
    ...(count && !count.exact ? { about: REPORT.men(count) } : {}),
    ...(count ? { countMinutesAgo: age(told.count) } : {}),
    ...(told.state ? { holding: REPORT.holding(told.state), holdingMinutesAgo: age(told.state) } : {}),
    // The best officer whose report of them has reached him.
    reportedBy: told.grade,
    seenOnTurn: e.seenOnTurn,
    minutesAgo,
    said: REPORT.line({
      status: e.status, minutesAgo, kindKnown: Boolean(kind), grade: told.grade,
      count, countAgo: told.count ? age(told.count) : 0,
      state: told.state ?? null, stateAgo: told.state ? age(told.state) : 0
    })
  }
}

// How many men a unit is, for the plain account: his own (and, held, his
// captors' own, as their reports tell it) counted; an enemy as his reports
// of it tell, roughly or not at all.
function menAsTold(game, side, ownIds) {
  const known = enemyKnowledge(game, side)
  return (id, n) => {
    const men = n === 1 ? '1 man' : `${n} men`
    if (ownIds.has(id)) return men
    const count = known[id] ? toldOf(known[id]).count : null
    if (!count) return null
    return count.exact ? men : REPORT.men({ exact: false, band: aboutHowMany(n).band })
  }
}

// An enemy unit as the order reader may know it: where it was reported, and
// its kind only if a report told it ("troops" else, so that he can still
// name it: "attack the enemy troops at F6", "attack the enemy at the bridge").
function enemyForOrders(e) {
  const told = toldOf(e)
  const base = { id: e.id, status: e.status, position: e.position, seenOnTurn: e.seenOnTurn, ...(e.strength !== undefined ? { strength: e.strength } : {}) }
  return told.kind
    ? { ...base, role: told.kind.role, mounted: told.kind.mounted, primaryWeapon: told.kind.primaryWeapon, thrown: told.kind.thrown, armor: told.kind.armor, shield: told.kind.shield }
    : { ...base, name: REPORT.troops }
}

// Men standing, fled and fallen for each side, and the units that broke:
// shown once the battle is over. The men are counted on the field when it
// is over, for both sides, as before. The units that broke (S9: "Fled 0"
// in every verdict, when his dispatches told of units that broke and fled)
// are, of his own, every one, with what became of it; of the enemy, only
// those his side saw break (with his men, or by a report that reached
// him), named as he knows them, and nothing of what became of them.
function tally(game, viewer = null) {
  const out = {}
  const events = game.battle.log.all()
  const name = viewer ? namer(game, viewer) : (id) => id
  const word = viewer ? game.word?.[viewer] ?? null : null
  const known = viewer ? enemyKnowledge(game, viewer) : {}
  const unitOf = (id) => game.battle.world.units.find(u => u.id === id) ?? game.battle.fledUnits.find(u => u.id === id)
  for (const side of Object.keys(game.spec.sides)) {
    const start = game.startingStrength[side] ?? 0
    const standing = game.battle.world.units.filter(u => u.side === side).reduce((n, u) => n + Math.max(0, u.strength), 0)
    const fled = game.battle.fledUnits.filter(u => u.side === side).reduce((n, u) => n + u.strength, 0)
    const mine = !viewer || side === viewer
    // Breaks his side could know of.
    const ours = (id) => unitOf(id)?.side === viewer
    const sawIt = (e) => mine || ours(e.by) || (word ? arrivalOf(game, viewer, e) !== Infinity : Boolean(known[e.unitId]))
    const breaks = new Map()
    for (const e of events) {
      if (e.type !== 'rout' || unitOf(e.unitId)?.side !== side || !sawIt(e)) continue
      breaks.set(e.unitId, (breaks.get(e.unitId) ?? 0) + 1)
    }
    const broke = [...breaks].map(([id, n]) => {
      const unit = unitOf(id)
      const times = VERDICT.times(n)
      const gone = game.battle.fledUnits.some(u => u.id === id)
      const fate = !mine ? VERDICT.fate.seen(times)
        : gone ? VERDICT.fate.fled(times, unit.strength === 1 ? '1 man' : `${unit.strength} men`)
          : (unit?.strength ?? 0) <= 0 ? VERDICT.fate.destroyed(times)
            : game.battle.broken?.has?.(id) || unit?.broken ? VERDICT.fate.fleeing(times)
              : VERDICT.fate.rallied(times)
      return { name: capitalise(name(id)), said: fate }
    })
    out[side] = { start, standing, standingSaid: VERDICT.standing(standing, start), fled, fallen: Math.max(0, start - standing - fled), broke }
  }
  return { sides: out, head: VERDICT.head, note: VERDICT.note, yours: VERDICT.yours, theirs: VERDICT.theirs }
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
  // The units a Commander in the enemy's hands gave for his freedom: their
  // officers go with them.
  const prices = commanderOf(game, side)?.prices ?? []
  return units.map(spec => {
    const unit = now(spec.id)
    const losses = 1 - Math.max(0, unit?.strength ?? 0) / (spec.strength || 1)
    const exposure = exposureFromEvents(events, spec.id)
    const chances = fateChances({ result, losses, exposure })
    const roll = random()
    // The longer he has served, the better he is at coming through.
    const pKill = perOfficer(chances.kill, units.length) * (spec.officer && !spec.officer.headless ? DEATH_ODDS[gradeOf(spec.officer)] ?? 1 : 1)
    const pCapture = perOfficer(chances.capture, units.length)
    const pWound = perOfficer(chances.wound, units.length)
    // A unit with no officer has no one to lose (the roll is still made,
    // so the others' fates do not depend on it).
    const rolled = spec.officer?.headless ? 'unhurt'
      : roll < pKill ? 'killed'
        : roll < pKill + pCapture ? 'captured'
          : roll < pKill + pCapture + pWound ? 'wounded' : 'unhurt'
    const fate = prices.includes(spec.id) && !spec.officer?.headless && rolled !== 'killed' && rolled !== 'captured' ? 'given up' : rolled
    return {
      unit: unitName(spec),
      unitId: spec.id,
      officer: spec.officer?.name ?? null,
      officerId: spec.officer?.id ?? null,
      ...(spec.officer?.headless ? { headless: true } : {}),
      destroyed: (unit?.strength ?? 0) <= 0,
      // The men it went in with and came out with, for its veterancy.
      mustered: spec.strength, survivors: Math.max(0, unit?.strength ?? 0),
      // Whether it struck a blow or took one: a battle it only watched is a
      // different thing to an officer who lives for glory.
      fought: events.some(e => (e.type === 'exchange' && (e.a.unitId === spec.id || e.b.unitId === spec.id)) ||
        ((e.type === 'volley' || e.type === 'pursuit') && (e.unitId === spec.id || e.by === spec.id))),
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
 *   storage  where battles and Commanders are kept (storage.js), already
 *         opened; in place of dir (the server's, for Postgres)
 *   ai    an AI client (src/llm) for reading orders and narrating; null for
 *         the grammar and plain reports
 *   now   clock, for "the turn ran 2 h ago" (injectable for tests)
 */
function createBattleStore({ dir = null, storage = null, ai = null, now = () => Date.now() } = {}) {
  const battles = new Map()   // id -> entry
  const seats = new Map()     // token -> { id, side }
  const kept = storage ?? createFileStorage(dir)
  const commanders = createCommanderStore({ storage: kept, now })

  // ── Saving and loading ────────────────────────────

  function save(entry) {
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
      // Fought again the next day (again): this battle's day, and the
      // battle of the day after, once there is one.
      ...(entry.day ? { day: entry.day } : {}),
      ...(entry.next ? { next: entry.next } : {}),
      // The side that called the next day, for the other's notice.
      ...(entry.calledBy ? { calledBy: entry.calledBy } : {}),
      // What Discord has been told of it, so nothing is sent twice
      // (src/discord/notices.js).
      ...(entry.discord ? { discord: entry.discord } : {}),
      // Played with orders and news by rider (a battle saved before them
      // plays back without: engine/command/messengers.js).
      riders: entry.game.spec.messengers !== false,
      // Played with the riders rulings of 2026-11-23: each side asked only
      // when wanted, and no word noticed rather than told (a battle saved
      // before them plays back without: spec.everyoneAsked).
      asked: !entry.game.spec.everyoneAsked,
      record: gameRecord(entry.game)
    }
    return kept.put('battle', entry.id, data)
  }

  function load() {
    for (const data of kept.all('battle')) {
      // A battle saved before orders and news went by rider replays as it
      // was played, and goes on so.
      let record = data.riders ? data.record : { ...data.record, spec: { ...data.record.spec, messengers: false } }
      // ... and one saved before the riders rulings, as it was played: every
      // side asked at every stop.
      if (!data.asked) record = { ...record, spec: { ...record.spec, everyoneAsked: true } }
      const entry = { ...data, game: replayGame(record) }
      delete entry.riders
      delete entry.asked
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
   *   objectives  ground to hold: grid squares or feature names; with
   *               none given, the map's own ground to fight for
   *               (src/data/maps, groundOf); [] for none at all
   *   ground      the ground as a spec's objectives (the next day: the
   *               same ground as the day before)
   *   seed        optional
   *   commander   the mustering player's Commander token: his company's
   *               officers lead his side, and the battle is written into
   *               the company when it ends
   *   faction     the mustering side's faction (src/data/factions.js), for a
   *               Commander who has none yet, or a battle with no Commander;
   *               a Commander's own faction is his for life
   *   enemyFaction  the other side's; else any faction (the mustering
   *               side's own among them), drawn from the seed. Against a
   *               friend it holds only until he joins with his own. With no
   *               faction at all the scenario's armies fight.
   *   The mustering Commander brings the standard army he bought, or with
   *   none his faction's usual one.
   * @returns {{ id, seats: { [side]: token } }} only the seats for people
   */
  function muster(m = {}) {
    const scenario = SCENARIOS[m.scenario] ? m.scenario : 'meeting-battle'
    const mapName = MAPS[m.map] ? m.map : 'crownhill'
    // The kind of battle (ruled 2026-11-25): as chosen, else the field's
    // first (src/data/maps, kindsOf). A battle for ground fights for the
    // field's own ground, unless the player named his own; a pitched battle
    // for none. (The next day: the same kind, and the same ground.) Its
    // armies form up where the field says for that kind.
    const kinds = kindsOf(mapName)
    const named = Array.isArray(m.ground) || Array.isArray(m.objectives)
    const kind = kinds.includes(m.kind) ? m.kind : named ? null : kinds[0]
    let spec = loadScenario(scenario, { map: mapName, deploy: true, kind })
    const allSides = Object.keys(spec.sides)
    const side = allSides.includes(m.side) ? m.side : allSides[0]
    const other = allSides.find(s => s !== side)
    const solo = m.opponent !== 'friend'
    // A commander's units hold until ordered (ruled 2026-11-21): they attack
    // of their own accord only when told to ("seek and destroy"). The
    // standing order to advance is the computer's side's alone.
    spec = { ...spec, standingOrders: solo && spec.standingOrders?.[other] ? { [other]: spec.standingOrders[other] } : {} }
    if (m.timeLimitMinutes) spec = { ...spec, timeLimitMinutes: Number(m.timeLimitMinutes) }
    // Every battle has an end of day, so that none stands for ever: in
    // battle time, since each side is asked only when wanted (a number of
    // turns, if asked for: a testing aid).
    spec = Number.isInteger(m.turnLimit) && m.turnLimit > 0
      ? { ...spec, turnLimit: m.turnLimit }
      : { ...spec, dayMinutes: Number.isInteger(m.dayMinutes) && m.dayMinutes > 0 ? m.dayMinutes : T.DAY.MINUTES }
    const made = kind ? kindSpec(mapName, kind) : {}
    const objectives = Array.isArray(m.ground) ? m.ground
      : !Array.isArray(m.objectives) ? made.objectives
        : m.objectives.filter(Boolean).map((ground, i) => isGridRef(ground)
          ? { id: `objective-${i + 1}`, square: ground }
          : { id: `objective-${i + 1}`, feature: ground })
    const needed = Number.isInteger(m.objectivesNeeded) ? m.objectivesNeeded : Array.isArray(m.ground) ? null : made.objectivesNeeded ?? null
    // (Ground named by the API with no kind, a testing aid: no kind in the
    // spec, and the battle ends as battles did before the kinds.)
    if (kind) spec = { ...spec, kind }
    if (objectives.length) spec = { ...spec, objectives }
    if (objectives.length && needed && needed < objectives.length) spec = { ...spec, objectivesNeeded: needed, ...(m.groundCalled ?? made.groundCalled ? { groundCalled: m.groundCalled ?? made.groundCalled } : {}) }

    const seed = m.seed ?? crypto.randomInt(1, 1_000_000)
    const commander = m.commander ? commanders.get(m.commander) : null
    // The armies are the factions' (src/data/factions.js): the mustering
    // Commander's, and the enemy's. With no faction named, and no Commander
    // who has one, the scenario's own armies fight, as before factions.
    const faction = musterFaction(commander, m.faction)
    const enemy = faction ? (FACTIONS[m.enemyFaction] ? m.enemyFaction : anyFaction(seed)) : null
    // Which of his units march: as asked, else as last time (roster.js).
    if (commander) mayLead(commander)
    // The next day of a battle night ended: both armies as they stood at
    // nightfall (nightArmies), not mustered afresh.
    const night = Array.isArray(m.nightBefore) ? m.nightBefore : null
    const marching = commander?.faction && !night ? whoMarches(commander, m.marching) : null
    if (night) spec = { ...spec, units: night, nextDay: m.day }
    else if (faction) spec = musterArmies(spec, { [side]: { faction, commander, marching }, [other]: { faction: enemy } })
    // Every unit gets an officer to carry the Commander's orders: a name,
    // his experience and his nature, drawn from the battle's seed. (On the
    // next day, a unit whose officer was lost the day before gets a new man.)
    spec = { ...spec, units: assignOfficers(spec.units, seed) }
    // The mustering Commander's own officers lead his side. His army can
    // fight one battle at a time (ruled 2026-11-22).
    let company = null   // his company with this battle's officers given out
    if (commander) {
      const led = leadSide(spec, side, commander.company, seed, marching ? benchedOf(commander, marching) : night ? stayedHome(commander, spec, side) : [], { night: Boolean(night) })
      company = led.company
      // He is on the field himself, riding with his best unit (his
      // veteran's): there he can be taken, or killed.
      spec = led.spec
      // Against the computer, its army matches his (ruled 2026-11-23); on
      // the next day it is the army it had at nightfall.
      if (solo && !night) spec = matchComputer(spec, side, other)
    }
    // Against the computer, its Commander: a name and a character from the
    // seed (opponent/commander.js), or the day before's.
    if (solo) spec = withCommander(spec, other, seed, m.enemyCommander ?? null)
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
      // Against a friend, his army is not known until he chooses who leads
      // (join): until then the battle is "Rome against a friend", not
      // against the faction the lot put in his seat for now.
      title: faction ? (solo || spec.nextDay ? factionTitle(spec, side) : `${MAPS[spec.map]?.title ?? spec.map}: ${FACTIONS[sideFaction(spec, side)]?.title ?? sideName(side)} against a friend`)
        : `${MAPS[mapName].title ?? mapName}: ${SCENARIO_TITLES[scenario] ?? scenario}`,
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
      if (faction && !commander.faction) commanders.setFaction(commander, faction)
      commanders.setCompany(commander, company)
      // What marched this time is what marches next time, unless he changes it.
      if (marching) commanders.setRoster(commander, { marching })
      commanders.setBattle(commander, entry.id)
    }
    return { id: entry.id, title: entry.title, seats: Object.fromEntries(Object.entries(entry.seats).filter(([, t]) => t)) }
  }

  // "Ashford Vale: Macedon against Han", the mustering side first.
  function factionTitle(spec, first) {
    const second = Object.keys(spec.sides).find(s => s !== first)
    const title = (s) => FACTIONS[sideFaction(spec, s)]?.title ?? sideName(s)
    return `${MAPS[spec.map]?.title ?? spec.map}: ${title(first)} against ${title(second)}`
  }
  const sideFaction = (spec, side) => spec.units.find(u => u.side === side)?.faction ?? null
  const sideName = (side) => side.charAt(0).toUpperCase() + side.slice(1)

  // A side's officers from a company, and the Commander on the field with
  // the unit his most experienced officer leads (a new Commander's veteran
  // is with the elite unit). For the muster and for the friend who joins.
  // `benched`: the units he owns that stay at home; their officers stay with them.
  // `night`: the next day of a battle, whose units come as they stood at
  // nightfall, their veterancy with them (nightArmies): trained afresh from
  // what they were raised as, but their veterancy not read again.
  function leadSide(spec, side, company, seed, benched = [], { night = false } = {}) {
    // (The quality a unit was raised at, before training, for the next day:
    // it is trained again from there, not twice.)
    // (The second line, raised for the day, is not his company's: its
    // officers are drawn for the battle and go home with it.)
    const mine = spec.units.filter(u => u.side === side && !u.secondLine).map(u => ({ ...u, quality: u.raisedAs ?? u.quality, kind: unitName(u).toLowerCase() }))
    const raised = spec.units.filter(u => u.side === side && u.secondLine && !u.officer)
    const drawn = new Map(raised.length ? assignOfficers(raised, seed).map(u => [u.id, u.officer]) : [])
    const led = musterOfficers(company, mine, seed, { benched })
    const officerOf = new Map(led.units.map(u => [u.id, u.officer]))
    // The quality each unit takes the field at: what it was raised as, and
    // what an officer of the greatest experience has since made of it.
    const qualityOf = new Map(led.units.map(u => [u.id, u.quality]))
    const raisedOf = new Map(mine.map(u => [u.id, u.quality]))
    // Each unit's own veterancy, its men's average experience, as it goes
    // into this battle (army-balance.md, part 4). Saved in the spec, so the
    // battle replays with it; a unit with none carries none. (The next day,
    // the veterancy it came off the field with.)
    const earned = new Map(unitsOf(led.company).map(u => [u.kind, u.veterancy]))
    const veterancyOf = new Map(night ? [] : mine.filter(u => earned.get(u.kind) > 0).map(u => [u.id, earned.get(u.kind)]))
    const trained = (u) => {
      const quality = qualityOf.get(u.id) ?? u.quality
      const { raisedAs: _was, ...rest } = u
      return { ...rest, quality, ...(quality !== raisedOf.get(u.id) ? { raisedAs: raisedOf.get(u.id) } : {}) }
    }
    return {
      company: led.company,
      spec: {
        ...spec,
        units: spec.units.map(u => (officerOf.has(u.id) ? { ...trained(u), officer: officerOf.get(u.id), ...(veterancyOf.has(u.id) ? { veterancy: veterancyOf.get(u.id) } : {}) } : drawn.has(u.id) ? { ...u, officer: drawn.get(u.id) } : u)),
        commanders: { ...(spec.commanders ?? {}), [side]: { unitId: ridesWith(led.units) } }
      }
    }
  }

  // The computer's side, against a Commander: every unit of it takes the
  // average veterancy of the units he fields, up to seasoned
  // (veterancy.js, matchedVeterancy; ruled 2026-11-23). Fixed here, in the
  // spec, for the whole battle.
  function matchComputer(spec, side, other) {
    const v = matchedVeterancy(spec.units.filter(u => u.side === side && !u.secondLine))
    if (!(v > 0)) return spec
    return { ...spec, units: spec.units.map(u => (u.side === other ? { ...u, veterancy: v } : u)) }
  }

  // The faction whose army a side brings: its Commander's for life; for one
  // with none yet, the one named now (made his when he leads it).
  function musterFaction(commander, asked) {
    if (asked && !FACTIONS[asked]) throw Object.assign(new Error(`There is no faction "${asked}".`), { status: 400 })
    if (commander?.faction && asked && asked !== commander.faction) {
      throw Object.assign(new Error(`${commander.name} fights for ${FACTIONS[commander.faction].title}, and always will.`), { status: 409 })
    }
    return commander?.faction ?? asked ?? null
  }

  // ── The standard army ─────────────────────────────

  // Each side's army on the field: the units of its Commander's roster that
  // march (the ones he bought, or his faction's usual army; those taken from
  // the enemy; the elite), else its faction's usual army.
  // `sides`: { [side]: { faction, commander?, marching? } } (marching: the
  // names, as whoMarches gives them)
  function musterArmies(spec, sides) {
    const armies = {}
    for (const [side, { faction, commander, marching }] of Object.entries(sides)) {
      if (!commander?.faction) {
        armies[side] = { faction, units: commander?.army?.units ?? null }
        continue
      }
      const field = fieldingOf(commander, marching ?? whoMarches(commander))
      // Kept armies are checked when kept; checked again in case the rules
      // under them have changed since. Not his people's restrictions: those
      // hold when an army is bought, and an army bought before keeps its
      // units (docs/design/army-balance.md, part 9).
      const checked = field.units?.length ? checkArmy(faction, field.units, { restrictions: false }) : null
      if (checked && !checked.ok) {
        throw Object.assign(new Error(`${commander.name}'s army no longer passes muster: ${checked.errors.join('; ')}. Change it, or take the usual army.`), { status: 409 })
      }
      armies[side] = { faction, ...field }
    }
    // On a field of more than one line (the big map), each army's second
    // line: its faction's usual army again, raised for the day.
    return withSecondLine(fieldArmies(spec, armies), Object.fromEntries(Object.entries(sides).map(([side, { faction }]) => [side, faction])))
  }

  // The names of the units that march with a Commander: those asked (an
  // array, from the muster), else those that marched last time. Either way
  // within his budget, or refused with the reason.
  function whoMarches(commander, asked) {
    const checked = checkMarching(commander, Array.isArray(asked) ? asked : marchingOf(commander))
    if (!checked.ok) {
      const error = Array.isArray(asked) ? checked.errors.join(' ') : `${checked.errors.join(' ')} Choose again who marches.`
      throw Object.assign(new Error(error), { status: Array.isArray(asked) ? 400 : 409, errors: checked.errors })
    }
    return checked.names
  }

  // The units of his that are not on this field (the next day: those that
  // stayed at home the day before, and any he has had since): their
  // officers stay with them.
  function stayedHome(commander, spec, side) {
    const fielded = new Set(spec.units.filter(u => u.side === side).map(u => unitName(u).toLowerCase()))
    return rosterOf(commander).filter(u => u.how !== 'elite' && !fielded.has(u.name)).map(u => u.name)
  }

  // Not while his army is in the field.
  function athome(commander, what) {
    if (commander.ended) mayLead(commander)
    const busy = fighting(commander)
    if (busy) throw Object.assign(new Error(`Your army is in the field (${busy.title}). ${what} when the battle is over.`), { status: 409 })
  }

  /**
   * A Commander moves an officer to another of his units, between battles
   * (company.js, moveOfficer): to one that has none, or in exchange with the
   * officer who leads it.
   *
   * @param {Object} body { officer: his id, to: the unit's name }
   * @returns his company's view
   */
  function transfer(token, body = {}) {
    const commander = commanders.get(token)
    if (!commander) return null
    athome(commander, 'Your officers can be moved')
    const officer = commander.company.officers.find(o => o.id === body.officer)
    if (!officer) throw Object.assign(new Error('There is no such officer in your company.'), { status: 400 })
    const to = rosterOf(commander).find(u => u.name === body.to)
    if (!to) throw Object.assign(new Error(`You have no unit called "${String(body.to ?? '').slice(0, 40)}".`), { status: 400 })
    commanders.setCompany(commander, moveOfficer(commander.company, officer.id, to.name).company)
    return commanderView(token)
  }

  /**
   * A Commander names one of his units that has an officer, between battles
   * (roster.js, nameRefusal). The unit is the same men under its new name:
   * its veterancy, training and officer (company.js, renameUnit), its place
   * in his bought army or among those taken, in what marches; and it still
   * answers to what it was called before where nothing else does.
   *
   * @param {Object} body { unit: its name now, name: the new one }
   * @returns his company's view
   */
  function nameUnit(token, body = {}) {
    const commander = commanders.get(token)
    if (!commander) return null
    athome(commander, 'Your units can be named')
    const from = String(body.unit ?? '')
    const name = plainName(body.name)
    const refused = nameRefusal(commander, from, name)
    if (refused) throw Object.assign(new Error(refused), { status: 400, errors: [refused] })
    commanders.setRoster(commander, renamed(commander, from, name))
    commanders.setCompany(commander, renameUnit(commander.company, from, name))
    return commanderView(token)
  }

  /**
   * A Commander buys his standard army, or takes his faction's usual one
   * (`{ usual: true }`). Only between battles: never while his army is in
   * the field. Every army is checked here through the builder; the
   * browser's word is not taken. His company is told (armyChanged): a unit
   * dismissed loses its count of battles toward an officer.
   *
   * @returns his company's view, with the army
   */
  function setArmy(token, body = {}) {
    const commander = commanders.get(token)
    if (!commander) return null
    if (commander.ended) mayLead(commander)
    const busy = fighting(commander)
    if (busy) {
      throw Object.assign(new Error(`Your army is in the field (${busy.title}). It can be changed when the battle is over.`), { status: 409 })
    }
    if (!commander.faction) throw Object.assign(new Error('Choose a faction first: the army is bought from its kit.'), { status: 409 })
    let units = null
    const before = rosterOf(commander)
    if (!body.usual) {
      const checked = checkArmy(commander.faction, body.units)
      // A unit he named keeps its name only if it is the unit he named: the
      // browser cannot name a unit by saying so.
      const named = (name) => before.find(u => u.name === name && u.named && (u.how === 'bought' || u.how === 'usual'))
      const errors = [...checked.errors, ...checked.units.filter(u => u.named && !named(u.name)).map(u => `${u.name}: that is not a name for ${unitNoun(u)}`)]
      if (errors.length) throw Object.assign(new Error(errors.join('; ')), { status: 400, errors })
      units = checked.units.map(({ named: _n, formerly: _f, ...u }) => {
        const was = u.name && named(u.name)
        return was ? { ...u, named: true, ...(was.formerly?.length ? { formerly: was.formerly } : {}) } : u
      })
    }
    // The units that came to him otherwise, but those he lets go
    // (`captured`: the names of those he keeps; all, if not said).
    const keep = Array.isArray(body.captured) ? body.captured.map(String) : null
    const gained = (commander.gained ?? []).filter(u => !keep || keep.includes(u.name))
    const elite = rosterOf(commander).find(u => u.how === 'elite').name
    const clash = (units ?? []).find(u => u.name === elite || gained.some(g => g.name === u.name || baseOf(g.name) === baseOf(u.name)))
    if (clash) {
      const error = `${clash.name.charAt(0).toUpperCase()}${clash.name.slice(1)}: you have a unit called that already`
      throw Object.assign(new Error(error), { status: 400, errors: [error] })
    }
    const bought = units ?? usualArmy(commander.faction)
    const names = [...bought.map(u => u.name), ...gained.map(u => u.name), elite]
    commanders.setCompany(commander, armyChanged(commander.company, names))
    commanders.setArmy(commander, units)
    // Who marches next: those that marched and are still his, and every
    // unit he has just bought; then, should that be over the budget, the
    // units taken from the enemy stay at home, the last taken first.
    const fields = { gained: gained.length ? gained : null }
    if (Array.isArray(commander.marching)) {
      const had = new Set(before.map(u => u.name))
      let marching = [...commander.marching.filter(n => names.includes(n)), ...bought.map(u => u.name).filter(n => !had.has(n))]
      commanders.setRoster(commander, { ...fields, marching })
      for (const g of [...gained].reverse()) {
        if (checkMarching(commander, marching).ok) break
        marching = marching.filter(n => n !== g.name)
      }
      fields.marching = marching
    }
    commanders.setRoster(commander, fields)
    return commanderView(token)
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
   * Their army is their Commander's faction's. A new Commander (or one
   * from before factions) takes the faction named, else the one the muster
   * gave this side, and keeps it for life.
   *
   * @param {string} token           the friend's seat
   * @param {string|null} commander  their Commander's token, or null for none
   * @param {string|null} faction    for a Commander with none yet
   * @param {string[]|null} marching the names of his units that march; else as last time
   */
  function join(token, commanderToken = null, asked = null, marchingAsked = null) {
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
    // Their Commander's own army (the one he bought, or his faction's
    // usual one), where the muster gave this side another.
    const mustered = sideFaction(record.spec, side)
    // The next day of a battle night ended: the army is the one this side
    // had at nightfall, whoever leads it now; a Commander of its faction.
    const night = Boolean(record.spec.nextDay)
    const faction = mustered ? (night ? musterFaction(commander, mustered) : musterFaction(commander, asked) ?? mustered) : null
    // Those of his units that marched last time march (roster.js).
    const marching = commander?.faction && !night ? whoMarches(commander, marchingAsked) : null
    let spec = !night && faction && (faction !== mustered || commander?.army || (marching && fieldingOf(commander, marching).units))
      ? musterArmies(record.spec, { [side]: { faction, commander, marching } })
      : record.spec
    // A seed of the side's own, so the two sides' first veterans are not
    // drawn alike.
    const benched = marching ? benchedOf(commander, marching) : night && commander ? stayedHome(commander, spec, side) : []
    const led = leadSide(spec, side, commander ? commander.company : createCompany(), (Math.imul(record.seed, 31) + 17) >>> 0, benched, { night })
    spec = led.spec
    entry.game = replayGame({ ...record, spec })
    entry.joining = null
    // (Until now the title said "against a friend": his army is known now.)
    if (faction && !night) entry.title = factionTitle(spec, Object.keys(spec.sides).find(s => s !== side))
    if (commander) {
      if (faction && !commander.faction) commanders.setFaction(commander, faction)
      commanders.setCompany(commander, led.company)
      if (marching) commanders.setRoster(commander, { marching })
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
    return { ...commanders.view(token), battle: entry ? { title: entry.title, seat: entry.seats[side] ?? null, ...calledOut(entry, side) } : null, record: recordOf(commander) }
  }

  /**
   * His record: the battles written into his company, oldest first, as
   * this server still has them: each one's title, when it was fought, how
   * it ended for him, and what became of him in it (taken and ransomed,
   * freed, let go, killed; nothing when he came through untouched).
   */
  function recordOf(commander) {
    const settled = commander.company.settled ?? []
    return settled.map(id => battles.get(id)).filter(Boolean).flatMap(entry => {
      const side = Object.keys(entry.commanders ?? {}).find(s => entry.commanders[s] === commander.id)
      const game = entry.game
      if (!side || !game?.outcome?.decided) return []
      // A battle fought on into the next day is one battle, told once its
      // last day is written in: its first day's title and when, the last
      // day's outcome.
      if (entry.next && settled.includes(entry.next)) return []
      const before = previousOf(entry)
      let first = entry
      for (let b = before, n = 0; b && n < 20; b = previousOf(b), n++) first = b
      const fate = commanderOf(game, side)?.fate
      return [{
        title: before ? `${firstTitle(entry)}, ${NIGHT.overDays(entry.day ?? 2)}` : entry.title, when: first.createdAt ?? entry.createdAt ?? null,
        result: game.outcome.winner === 'draw' ? 'draw' : game.outcome.winner === side ? 'victory' : 'defeat',
        ...(fate && fate !== 'free' ? { fate } : {})
      }]
    })
  }

  // ── Reading ───────────────────────────────────────

  function seatOf(token) {
    const seat = seats.get(token)
    if (!seat) return null
    return { entry: battles.get(seat.id), side: seat.side }
  }

  // His orders are asked for when the battle has stopped for him; otherwise
  // they are with his army. Whether the battle is running, or standing for
  // the other Commander, he is not told (ruled 2026-11-23: "both would only
  // be notified when there are commands to give or things happen to them").
  function status(entry, side) {
    if (entry.game.outcome.decided) return 'finished'
    return waitingOn(entry.game).includes(side) && !entry.pending[side] ? 'your-orders' : 'waiting'
  }
  // His own turn: how many times the battle has stopped for him, not for
  // anyone else. Once it is over, everything is told.
  // This side's own count of turns: the one it is asked for now, or, once
  // the battle is over, the one it ended in (its last dispatch's), not the
  // battle's count of stops, which the other side's turns also add to.
  const turnOf = (game, side) => (game.outcome.decided ? game.calls?.[side] ?? game.playerTurn : (game.calls?.[side] ?? game.playerTurn) + 1)

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
      turn: turnOf(game, side),
      minutes: game.minutesElapsed,
      // (Who was ahead when night fell is the harness's, not the player's.)
      // Fought on the next day: one battle in the list, under its first
      // day's title, "fought over two days" (the day before is not listed).
      ...(previousOf(entry) ? { firstTitle: firstTitle(entry), overDays: NIGHT.overDays(entry.day ?? 2) } : {}),
      outcome: game.outcome.decided ? { decided: true, winner: game.outcome.winner, reason: game.outcome.reason, ...(game.outcome.reason === 'night fell' ? { title: NIGHT.title, said: endSaid(game, side) ?? NIGHT.ended, listed: NIGHT.listed } : {}),
        // The ground decided it, or night a pitched battle: the verdict
        // names it.
        ...(['objectives held', 'field held at nightfall'].includes(game.outcome.reason) ? { said: endSaid(game, side) } : {}) } : null,
      // The kind of battle (ruled 2026-11-25), in words.
      kind: kindOfBattle(game.spec),
      kindTitle: KINDS[kindOfBattle(game.spec)]?.title ?? null,
      updatedAt: entry.updatedAt,
      sentAt: entry.pending[side]?.at ?? null,
      // How the table between a held Commander and his captors stands, as
      // this side may know it: a page waiting on the turn looks again when
      // it changes (an offer made to it, or an answer to its own).
      table: tableStamp(game, side),
      // The next day's battle, once there is one, and whether he has been
      // called out to it (this side's seat only).
      ...nextDayOf(entry, side),
      ...calledOut(entry, side)
    }
  }
  // The next day's battle after this one, if there is one: this side's seat
  // in it, and the notice if the other side called it and his orders are
  // wanted there.
  function nextDayOf(entry, side) {
    const next = entry.next ? battles.get(entry.next) : null
    if (!next?.seats[side]) return {}
    return { nextDay: { token: next.seats[side], title: next.title, ...calledOut(next, side) } }
  }
  // The other side called this next day, and it waits on this side's first
  // orders (or his choice of who leads): he is told so, plainly.
  function calledOut(entry, side) {
    if (!entry.calledBy || entry.calledBy === side || entry.game.outcome.decided) return {}
    if (entry.game.playerTurn > 0 || entry.pending[side] || !waitingOn(entry.game).includes(side)) return {}
    return { calledOut: NIGHT.calledOut(entry.day ?? 2) }
  }
  function tableStamp(game, side) {
    const mine = game.parley?.[side]
    const held = Object.keys(game.parley ?? {}).find(s => captorOf(game, s) === side)
    const theirs = held ? game.parley[held] : null
    const stamp = [mine?.answer ? `${mine.answer.kind}${mine.answer.to}` : '', theirs?.offer ? `offer${theirs.offer.id}` : ''].join('|')
    return stamp === '|' ? null : stamp
  }

  // The context the order reader needs: this side's own units and what it
  // knows of the enemy.
  function context(entry, side) {
    const game = entry.game
    // A Commander with his army reads his orders against what he knows:
    // each unit where word of it last put it, the enemy as reported to him
    // (engine/orchestrator/word.js).
    const word = game.battle.commanders?.[side]?.status === 'free' ? game.word?.[side] ?? null : null
    const known = (u) => (word?.units[u.id] ? { ...u, position: { ...word.units[u.id].position } } : u)
    // (A unit he last heard of as broken may have rallied since: he may
    // still send it orders, and the rider finds out. So that his words are
    // always read and a turn never waits on him, he may name any unit he
    // has not heard is gone.)
    const broken = (u) => (word ? false : game.battle.broken.has(u.id))
    const there = (u) => (word ? Boolean(word.units[u.id]) && !word.units[u.id].gone : u.strength > 0)
    return {
      map: game.battle.map,
      units: [...game.battle.world.units, ...game.battle.fledUnits].filter(u => u.side === side && there(u) && !broken(u))
        .filter(u => word || u.strength > 0)
        .map(u => ({ ...known(u), aliases: [unitName(u).toLowerCase(), ...(u.aliases ?? [])] })),
      enemies: (word ? knownEnemies(word) : sideView(game, side).intel).map(enemyForOrders),
      // Where "fall back" takes a unit, for the read-back.
      homeEdge: game.spec.sides?.[side]?.homeEdge,
      // The ground to fight for, which every side knows: "the hill" is it
      // where it is a hill.
      ground: game.battle.ground ?? [],
      // Some of several to hold: "take the fords" goes for that many.
      groundNeeded: neededOf(game),
      lyingInWait: lyingInWait(game.battle, side),
      // For counsel: the units that would break at the first blow.
      shaken: game.battle.world.units.filter(u => u.side === side && game.battle.isShaken(u)).map(u => u.id),
      // "I ride with the horse": may he, and if not, why (canRide).
      ride: (unitId) => canRide(game.battle.commanders, game.battle.world, game.battle.broken, side, unitId),
      ridingWith: game.battle.commanders?.[side]?.status === 'free' ? game.battle.commanders[side].unitId : null,
      // How long a rider takes to each unit (engine/command/messengers.js),
      // for the read-back: from the unit he rides with, or the one he is
      // riding over to first.
      messengers: (ids, from) => orderDelays(game.battle, side, ids, { from, word }),
      allOwn: [...game.battle.world.units, ...game.battle.fledUnits].filter(u => u.side === side && there(u))
        .filter(u => word || u.strength > 0)
        .map(u => ({ ...known(u), aliases: [unitName(u).toLowerCase(), ...(u.aliases ?? [])] }))
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

    // Held by the enemy, he sees only what can be seen from where he is
    // held: the unit holding him and what it can see (ruled 2026-11-23).
    // His own army beyond that is out of his sight. Free again, or once the
    // battle is over, he has his side's view back.
    const held = !atGame && !game.outcome.decided ? heldSight(battle, side) : null
    const ride = (u) => !atGame && !game.outcome.decided && canRide(battle.commanders, battle.world, battle.broken, side, u.id).ok
    // Free, with his army, he knows each unit of his as the last word of it
    // to reach him: live within his immediate range, older beyond it, and
    // none at all from a unit cut off (engine/orchestrator/word.js). Once
    // the battle is over, everything is told.
    const word = !atGame && !game.outcome.decided && !held ? game.word?.[side] ?? null : null
    const ownUnits = word
      ? [...battle.world.units, ...battle.fledUnits].filter(u => u.side === side && word.units[u.id] && !word.units[u.id].gone)
      : battle.world.units.filter(u => u.side === side && u.strength > 0)
    // Orders of his still on the road (command/messengers.js): he knows
    // what he sent, and about when it arrives.
    // An order no rider could carry he believes on the road as long as the
    // ride would take, as far as he knows (word.js, blocked): that the way
    // is shut he learns only when the rider is back.
    const onTheRoad = (id) => {
      // (A rider the enemy caught he still believes on the road, until he
      // should have arrived: no word comes back.)
      const real = [...(battle.riders ?? []), ...(battle.lostRiders ?? []).filter(r => r.arrives > battle.turn)]
        .filter(r => r.side === side && r.unitId === id).sort((a, b) => a.sent - b.sent).at(-1) ?? null
      const shut = (word?.blocked ?? []).filter(b => b.unitId === id && b.arrives > battle.turn).at(-1)
      if (!shut || (real && real.sent >= shut.sent)) return real
      const given = game.orderLog.filter(l => l.side === side && Array.isArray(l.orders)).flatMap(l => l.orders).filter(o => o.unitRef === id).at(-1)
      return { arrives: shut.arrives, order: given ?? null }
    }
    const own = ownUnits.map(u => {
      if (held && !held.seen.has(u.id)) {
        return {
          id: u.id, name: unitName(u), role: u.role ?? null, kind: kindWords(u), quality: u.quality ?? null, mounted: Boolean(u.mounted),
          outOfSight: true,
          officer: !u.officer ? null : u.officer.headless ? { headless: true } : { name: u.officer.name, grade: gradeOf(u.officer), personality: u.officer.personality, loyalty: loyaltyBand(u.officer) },
          order: 'out of your sight: their officer leads them as he sees fit'
        }
      }
      if (held) {
        // In sight from where he is held: where they are and about how
        // many, as he would see any unit; not their morale or orders.
        return {
          id: u.id, name: unitName(u), role: u.role ?? null, kind: kindWords(u), quality: u.quality ?? null, mounted: Boolean(u.mounted),
          inSightOfCaptivity: true,
          position: { ...u.position }, at: where(u.position), strength: u.strength, maxStrength: u.maxStrength,
          broken: battle.broken.has(u.id),
          officer: !u.officer ? null : u.officer.headless ? { headless: true } : { name: u.officer.name, grade: gradeOf(u.officer), personality: u.officer.personality, loyalty: loyaltyBand(u.officer) },
          order: 'in your sight: their officer leads them as he sees fit'
        }
      }
      const state = battle.resolver.getState(u.id)
      // As the last word of them says, or as they stand.
      const r = word ? word.units[u.id] : null
      const now = r ?? {
        position: u.position, strength: u.strength, maxStrength: u.maxStrength,
        morale: state ? Math.round(state.morale) : null, stamina: state ? Math.round(state.stamina) : null,
        broken: battle.broken.has(u.id), hidden: battle.hidden.has(u.id), crowding: battle.crowding.get(u.id) ?? 'organized',
        rallied: battle.rallied?.has(u.id) ?? false, order: battle.orderBook.get(u.id) ?? null
      }
      const road = word ? onTheRoad(u.id) : null
      return {
        id: u.id,
        name: unitName(u),
        role: u.role ?? null,
        // What kind of men they are, in words (words.js, kindWords).
        kind: kindWords(u),
        quality: u.quality ?? null,
        mounted: Boolean(u.mounted),
        // Raised for the day on a big field (engine/army/secondLine.js).
        ...(game.spec.units.find(s => s.id === u.id)?.secondLine ? { secondLine: true } : {}),
        position: { ...now.position },
        at: where(now.position),
        strength: now.strength,
        maxStrength: now.maxStrength,
        morale: now.morale ?? 100,
        stamina: now.stamina ?? staminaPool(u),
        staminaPool: staminaPool(u),
        broken: now.broken,
        hidden: now.hidden,
        crowding: now.crowding,
        // How old his word of them is (minutes), and when he last had any.
        ...(r ? { word: wordOf(r, battle.turn) } : {}),
        ...(road ? { rider: riderOf(road, battle.turn, namer(game, side)) } : {}),
        // The officer who carries your orders to this unit.
        // A unit can have none: it has yet to earn one.
        officer: !u.officer ? null
          : u.officer.headless ? { headless: true }
            : { name: u.officer.name, grade: gradeOf(u.officer), personality: u.officer.personality, loyalty: loyaltyBand(u.officer) },
        // Missile troops: how far they shoot, and whether they are holding fire.
        shootsTo: missileRangeMetres(u) || null,
        holdingFire: Boolean(now.order?.holdFire),
        order: now.broken
          ? 'broken and fleeing'
          : describeOrder(now.order, game.spec.standingOrders?.[side], namer(game, side)) +
            (now.rallied ? (now.morale !== null && now.morale <= 25 ? ' (rallied, at breaking point)' : ' (rallied)') : ''),
        target: now.order?.target ?? null,
        // He may ride over to them (command/commander.js, canRide).
        ...(ride(u) ? { canRide: true } : {})
      }
    })
    // Held, he knows of the units he lost before he was taken, and of those
    // he can see lying where they fell.
    const takenAt = held ? battle.log.all().filter(e => e.type === 'commanderTaken' && e.side === side).at(-1)?.turn ?? 0 : null
    const fellAt = (id) => battle.log.all().find(e => (e.type === 'destroyed' || e.type === 'fled') && e.unitId === id)?.turn ?? Infinity
    const fallen = [...battle.world.units.filter(u => u.side === side && u.strength <= 0),
      ...battle.fledUnits.filter(u => u.side === side)]
      .filter(u => !held || fellAt(u.id) < takenAt || (u.strength <= 0 && held.seen.has(u.id)))
      // With his army: those word of whose end has reached him.
      .filter(u => !word || word.units[u.id]?.gone)
      .map(u => ({ id: u.id, name: unitName(u), fled: u.strength > 0 }))

    // Held: the enemy as it can be seen from where he is held, and nothing
    // his side knew before or has learned since.
    const intel = held
      ? battle.world.units.filter(u => u.side !== side && u.strength > 0 && held.seen.has(u.id))
        .map(u => ({ id: u.id, status: 'visible', position: { ...u.position }, strength: u.strength, seenOnTurn: battle.turn }))
      : word ? knownEnemies(word) : sv.intel
    // Each as the reports of it have told it (enemyView).
    const enemies = intel.map(e => {
      const unit = battle.world.units.find(u => u.id === e.id) ?? battle.fledUnits.find(u => u.id === e.id)
      return enemyView(game, e, unit, battle.turn)
    })

    // The ground to fight for: who holds it is known to every side at once
    // (ruled); not who stands on it.
    const objectives = (game.objectives ?? []).map(o => ({
      id: o.id,
      name: o.name,
      tiles: o.tiles,
      holder: game.objectiveHolds[o.id]?.side ?? null,
      said: groundStatus(game, o, side)
    }))

    const landmarks = detectFeatures(map).filter(f => f.name).map(f => ({ name: f.name, kind: f.kind, centre: f.centre }))

    const line = summary(token)
    return {
      battle: atGame
        ? { ...line, turn: game.playerTurn + 1, minutes: game.minutesElapsed, sides: sides(battle.world), timeLimitMinutes: game.spec.timeLimitMinutes ?? null, turnLimit: game.spec.turnLimit ?? null, dayMinutes: game.spec.dayMinutes ?? null }
        : { ...line, sides: sides(battle.world), timeLimitMinutes: game.spec.timeLimitMinutes ?? null, turnLimit: game.spec.turnLimit ?? null, dayMinutes: game.spec.dayMinutes ?? null },
      map: { name: map.name, width: map.width, height: map.height, squareTiles: 4, terrain, landmarks },
      own,
      fallen,
      enemies,
      objectives,
      // One line under the map for the whole battle, where it says it
      // better: a pitched battle's rule; some of several grounds to hold.
      groundLine: battleLine(game, side),
      // Some of several grounds to hold: how many, and what they are called
      // together ("fords"), for the first turn's example orders.
      ...(neededOf(game) ? { groundHold: { needed: neededOf(game), called: calledOf(game) } } : {}),
      pending: entry.pending[side] ?? null,
      // While his orders are with the army (narrator/words.js).
      carryingOut: RIDER.carryingOut,
      // The friend has yet to choose who leads (join).
      choosing: !atGame && choosing(entry, side),
      // Whose army this side is (a faction of src/data/factions.js), if any.
      faction: sideFaction(game.spec, side),
      // The computer's Commander against him: his name, and what is said
      // of him (his character, in a word). Nothing of how he will fight.
      enemyCommander: enemyCommanderView(game.spec, side),
      commander: commanderView_(game, side, atGame),
      // An enemy Commander this side holds, and what he offers for his
      // freedom (only what he chose to offer, and what this side has seen).
      captive: captiveView(game, side, atGame),
      dispatches: [...entry.dispatches[side]].reverse(),
      verdict: game.outcome.decided && !atGame
        ? { ...tally(game, side), replayTo: game.playerTurn, officers: officerFates(game, side), company: Boolean(entry.commanders?.[side]), commander: commanderEnd(game, side), ...nightOf(entry, side) }
        : null
    }
  }

  function enemyCommanderView(spec, side) {
    const other = Object.keys(spec.sides).find(s => s !== side)
    const them = enemyCommanderOf(spec, other)
    return them ? { name: them.name, said: ENEMY_COMMANDER.said(them.name, them.character) } : null
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

  // How old his word of a unit is, in the app's words (narrator/words.js).
  // A unit cut off was told so in a battle saved before the riders rulings;
  // since, he only notices that no word has come (`noWord`, from his own
  // ledger: word.js, overdue).
  function wordOf(r, turn) {
    const minutesAgo = Math.max(0, (turn - r.heard) * 10)
    const said = r.cutOff ? RIDER.cutOff(r.heard * 10) : r.overdue ? RIDER.noWord(r.heard * 10) : RIDER.age(minutesAgo)
    return { live: r.live, minutesAgo, heardAt: r.heard * 10, cutOff: r.cutOff, noWord: Boolean(r.overdue), said }
  }
  // An order of his still on the road to a unit.
  function riderOf(road, turn, name) {
    const inMinutes = Math.max(0, (road.arrives - turn) * 10)
    const order = road.order ? describeOrder(road.order, null, name) : 'your orders'
    return { order, inMinutes, said: RIDER.onTheRoad(order, inMinutes) }
  }

  // The Commander on the field, as his own side sees him: the unit he
  // rides with; or that he is held, by whom and where, the units he could
  // offer for his freedom, and how the table stands.
  function commanderView_(game, side, atGame) {
    const c = game.battle.commanders?.[side]
    if (!c || atGame) return null
    const name = namer(game, side)
    const held = c.status === 'held'
    const captor = held ? game.battle.world.units.find(u => u.id === c.heldBy) : null
    const t = held ? game.parley?.[side] : null
    const named = (ids) => ids.map(id => ({ id, name: name(id) }))
    return {
      status: c.status,
      // How far round him an order arrives at once, and he sees for himself.
      immediate: T.COMMAND.IMMEDIATE,
      unitId: c.status === 'free' ? c.unitId : null,
      with: c.status === 'free' ? name(c.unitId) : null,
      heldBy: held ? name(c.heldBy) : null,
      heldAt: held && captor ? where(captor.position) : null,
      ...(held && captor ? { heldPosition: { ...captor.position } } : {}),
      chips: held ? bargainChips(game.battle.world, side).map(u => ({ id: u.id, name: unitName(u) })) : [],
      ...(held ? {
        table: {
          // His offer on the table, if any; whether he may make one this turn.
          offer: t?.offer ? { id: t.offer.id, units: named(t.offer.units) } : null,
          mayOffer: t?.last !== game.playerTurn,
          // The captor's last answer, and what it asks for if it asked more.
          answer: t?.answer ? { kind: t.answer.kind } : null,
          counter: t?.counter && game.playerTurn <= t.counter.turn + PARLEY.COUNTER_LASTS ? { units: named(t.counter.units) } : null
        }
      } : {})
    }
  }
  // The enemy Commander this side holds, as the captor sees him: which of
  // its units holds him, the offer on the table (the captive's own words,
  // nothing more of his army), and the enemy units this side has seen, to
  // ask for.
  function captiveView(game, side, atGame) {
    if (atGame || game.outcome.decided) return null
    const captive = Object.keys(game.battle.commanders ?? {}).find(s => captorOf(game, s) === side)
    if (!captive) return null
    const name = namer(game, side)
    const t = game.parley?.[captive]
    // (What he has heard of, when his own Commander is with his army.)
    const word = game.battle.commanders?.[side]?.status === 'free' ? game.word?.[side] : null
    const seen = word ? knownEnemies(word) : sideView(game, side).intel
    const handleOf = (id) => { const e = seen.find(x => x.id === id); return e ? enemyHandle(game, e) : id }
    return {
      heldBy: name(game.battle.commanders[captive].heldBy),
      offer: t?.offer ? { id: t.offer.id, units: t.offer.units.map(id => ({ id, name: name(id) })) } : null,
      asked: t?.counter && game.playerTurn <= t.counter.turn + PARLEY.COUNTER_LASTS ? { units: t.counter.units.map(id => ({ id: handleOf(id), name: name(id) })) } : null,
      seen: seen.map(e => ({ id: enemyHandle(game, e), name: name(e.id) }))
    }
  }
  // What became of him, for the verdict.
  function commanderEnd(game, side) {
    const end = commanderOf(game, side)
    const name = namer(game, side)
    return end ? { fate: end.fate, price: end.price ? name(end.price) : null, prices: end.prices.map(name) } : null
  }

  // A battle night ended (ruled 2026-11-24): its words, and this side's
  // seat in the next day's battle once there is one.
  function nightOf(entry, side) {
    if (entry.game.outcome.reason !== 'night fell') return {}
    const next = entry.next ? battles.get(entry.next) : null
    return {
      night: {
        title: NIGHT.title, ended: NIGHT.ended, again: NIGHT.again, againNote: NIGHT.againNote, released: NIGHT.released,
        next: next?.seats[side] ?? null,
        // Called by the other side: the notice, while his orders are wanted.
        ...(next ? calledOut(next, side) : {}),
        // Against a friend, before either has asked: the browser may tell
        // him if the other does, while the page is open.
        ...(!next && !entry.auto ? { tellMe: NIGHT.tellMe, toldYou: NIGHT.toldYou } : {}),
        // Nothing left on one side to take the field: no next day to offer.
        ...(!next && Object.values(nightArmies(entry).left).some(n => n === 0) ? { noNextDay: NIGHT.noNextDay } : {})
      }
    }
  }

  /**
   * Both armies as they stood when night fell, for the next day's battle
   * (ruled 2026-11-24: "lol yes, it's just night time. Computer does not
   * get to reset."). Every unit with men left, and no other: its men
   * standing, and those who ran come back to the standards in the night;
   * the fallen do not. Its kit, its faction and where it was drawn up are
   * the day's; its strength when whole stays what it was, so a unit that
   * has lost men hits softer (combat/ratings.js, strengthScale). No
   * recruits come, and nothing is bought, in one night.
   *
   * A side led by a Commander: its officers are given again from his
   * company at the muster (as the day left it: the dead gone, the wounded
   * sitting it out), and each unit's veterancy is its own men's, the day's
   * battle banked, with no recruits to thin it (the company's veterancy,
   * over the men left). A side with none (the computer's): each unit keeps
   * its officer, or has a new one if he was lost in the day; and its
   * veterancy, which is not matched again.
   *
   * @returns {{ units, left: { [side]: number } }} the next day's unit specs,
   *   and how many units each side has left
   */
  function nightArmies(entry) {
    const game = entry.game
    const now = (id) => game.battle.world.units.find(u => u.id === id) ?? game.battle.fledUnits.find(u => u.id === id)
    const left = Object.fromEntries(Object.keys(game.spec.sides).map(s => [s, 0]))
    const fates = {}
    const units = []
    for (const spec of game.spec.units) {
      const men = Math.max(0, Math.round(now(spec.id)?.strength ?? 0))
      if (men <= 0) continue
      left[spec.side] = (left[spec.side] ?? 0) + 1
      const company = entry.commanders?.[spec.side] ? commanders.byId(entry.commanders[spec.side])?.company : null
      const unit = { ...spec, strength: men, maxStrength: spec.maxStrength ?? spec.strength, ...(spec.position ? { position: { ...spec.position } } : {}) }
      if (company) {
        // His officers come from his company at the muster.
        const state = company.units?.[unitName(spec).toLowerCase()]
        const v = state?.totalExperience > 0 ? Math.round(state.totalExperience / men * 100) / 100 : 0
        delete unit.veterancy
        if (v > 0) unit.veterancy = v
      } else {
        fates[spec.side] ??= new Map(officerFates(game, spec.side).map(f => [f.unitId, f.fate]))
        if (!spec.officer?.headless && fates[spec.side].get(spec.id) !== 'unhurt') delete unit.officer
      }
      units.push(unit)
    }
    return { units, left }
  }

  /**
   * Fight again the next day (ruled 2026-11-24: "No the day just ends the
   * battle, you can choose to fight again the next day"). After a battle
   * night ended: a new battle on the same field, against the same enemy,
   * both armies as they stood at nightfall (nightArmies), on both sides,
   * whoever leads them. Against a friend, his
   * Commander leads his side again if he can; if not (he had none, or his
   * army is in another battle), the friend chooses when he comes, as he did
   * the first day. Made once: whoever asks after is given his own seat in it.
   *
   * @returns {{ token, title }} this side's seat in the next day's battle
   */
  function again(token) {
    const seat = seatOf(token)
    if (!seat) return null
    const { entry, side } = seat
    const game = entry.game
    if (game.outcome.reason !== 'night fell') {
      throw Object.assign(new Error('Only a battle that night ended can be fought again the next day.'), { status: 409 })
    }
    if (entry.next) {
      const next = battles.get(entry.next)
      return { token: next?.seats[side] ?? null, title: next?.title ?? null }
    }
    // A side with nothing left able to fight has no next day.
    const night = nightArmies(entry)
    if (Object.values(night.left).some(n => n === 0)) throw Object.assign(new Error(NIGHT.noNextDay), { status: 409 })
    const other = Object.keys(game.spec.sides).find(s => s !== side)
    const solo = Boolean(entry.auto)
    const own = entry.commanders?.[side] ? commanders.byId(entry.commanders[side]) : null
    const theirs = entry.commanders?.[other] ? commanders.byId(entry.commanders[other]) : null
    const made = muster({
      scenario: entry.scenario,
      map: game.spec.map,
      opponent: solo ? 'standing' : 'friend',
      side,
      commander: own?.token ?? null,
      faction: own ? null : sideFaction(game.spec, side),
      enemyFaction: sideFaction(game.spec, other),
      ...(game.spec.turnLimit ? { turnLimit: game.spec.turnLimit } : { dayMinutes: game.spec.dayMinutes }),
      nightBefore: night.units,
      ground: game.spec.objectives ?? [],
      ...(game.spec.kind ? { kind: game.spec.kind } : {}),
      ...(game.spec.objectivesNeeded ? { objectivesNeeded: game.spec.objectivesNeeded, groundCalled: game.spec.groundCalled ?? null } : {}),
      ...(solo ? { enemyCommander: enemyCommanderOf(game.spec, other) } : {}),
      day: (entry.day ?? 1) + 1
    })
    const next = battles.get(made.id)
    if (!solo && theirs && !theirs.ended && !fighting(theirs)) join(next.seats[other], theirs.token)
    // Who called it: the other is told (nextDayNotice).
    next.calledBy = side
    next.day = (entry.day ?? 1) + 1
    next.title = `${next.title}, day ${next.day}`
    entry.next = next.id
    save(next)
    save(entry)
    return { token: next.seats[side], title: next.title }
  }

  /**
   * A Commander in the enemy's hands puts an offer on the table: any of his
   * units still on the field, or none (the field alone), for his freedom.
   * One a player turn, replacing any before it. The computer, as captor,
   * answers at once (opponent/captor.js); a friend answers when they will,
   * or not at all. An offer that gives all the captor asked for strikes the
   * deal. Each goes through submitOrders, so a saved battle replays it.
   */
  async function offer(token, units) {
    const seat = seatOf(token)
    if (!seat) return null
    const { entry, side } = seat
    const game = entry.game
    if (game.outcome.decided) return { status: 'finished' }
    const ids = Array.isArray(units) ? units.map(String) : []
    const refused = checkOffer(game, side, { units: ids })
    if (refused) throw Object.assign(new Error(capitalise(refused) + '.'), { status: 409 })
    submitOrders(game, side, { offer: { units: ids } })
    const captor = captorOf(game, side)
    if (!game.outcome.decided && entry.auto && captor === entry.auto) {
      const answer = captorAnswer(game, entry.auto)
      if (answer) submitOrders(game, entry.auto, { answer })
    }
    return await afterTable(entry)
  }

  /**
   * The captor answers the offer on the table: accept it (the battle ends,
   * he is free), refuse it, or ask for more: units of his this side has
   * seen. Or does nothing at all, and fights on.
   */
  async function answer(token, given = {}) {
    const seat = seatOf(token)
    if (!seat) return null
    const { entry, side } = seat
    const game = entry.game
    if (game.outcome.decided) return { status: 'finished' }
    const reply = { offer: Number(given.offer) }
    if (given.accept === true) reply.accept = true
    else if (given.refuse === true) reply.refuse = true
    // (An enemy whose kind he has not been told goes by its stand-in.)
    else if (Array.isArray(given.more)) reply.more = { units: given.more.map(String).map(id => byHandle(game, side, id)) }
    const refused = checkAnswer(game, side, reply)
    if (refused) throw Object.assign(new Error(capitalise(refused) + '.'), { status: 409 })
    submitOrders(game, side, { answer: reply })
    return await afterTable(entry)
  }

  // The enemy unit a stand-in names (enemyHandle), as this side knows it.
  function byHandle(game, side, id) {
    if (!id.startsWith('enemy-')) return id
    const known = enemyKnowledge(game, side)
    return Object.keys(known).find(k => enemyHandle(game, { id: k, ...known[k] }) === id) ?? id
  }

  // A deal ends the battle as a turn does; anything else is only saved.
  async function afterTable(entry) {
    if (entry.game.outcome.decided) {
      entry.pending = {}
      await finishTurn(entry)
      return { status: 'finished' }
    }
    entry.updatedAt = now()
    save(entry)
    return { status: 'on the table' }
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
    if (seat.entry.game.battle.commanders?.[seat.side]?.status === 'held') {
      throw Object.assign(new Error('You are held by the enemy: your words reach no one.'), { status: 409 })
    }
    const read = await interpretText(String(text ?? ''), context(seat.entry, seat.side), { ai })
    const name = namer(seat.entry.game, seat.side)
    return {
      understood: read.understood.map(name), questions: read.questions.map(name), notes: (read.notes ?? []).map(name),
      counsel: (read.counsel ?? []).map(name),
      choices: namedChoices(read.choices, name), source: read.source, surrender: read.surrender
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

    // A Commander in the enemy's hands sends no orders, and cannot yield by
    // his own word (ruled 2026-11-23): he waits, and his officers run their
    // own units. The field is his only to offer for his freedom.
    const held = game.battle.commanders?.[side]?.status === 'held'
    const said = String(text ?? '')
    const read = await interpretText(!held ? said : '', context(entry, side), { ai })
    const name = namer(game, side)
    const understood = read.understood.map(name)
    if (read.questions.length > 0 && !(sendClear && read.orders.length > 0)) {
      return {
        status: 'clarify', questions: read.questions.map(name), understood, counsel: (read.counsel ?? []).map(name),
        choices: namedChoices(read.choices, name),
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
    // Its orders go by rider from its best unit, as a Commander's do from
    // his (engine/command/messengers.js); what it knows is not delayed.
    // The battle goes on, the computer asked each time it is wanted, until
    // it is a player's turn again (ruled 2026-11-23: "No the game keeps
    // going"); in a battle saved before that ruling, once a turn, as before.
    const computerAlone = () => {
      const wanted = waitingOn(game)
      return wanted.length > 0 && wanted.every(s => s === entry.auto)
    }
    if (result.status === 'waiting' && entry.auto && result.waitingOn.includes(entry.auto)) {
      result = submitOrders(game, entry.auto, byCommandPost(planTurn(game, entry.auto)))
    }
    for (let i = 0; i < 1000 && entry.auto && result.status === 'processed' && computerAlone(); i++) {
      result = submitOrders(game, entry.auto, byCommandPost(planTurn(game, entry.auto)))
    }

    if (result.status !== 'waiting') {
      entry.pending = {}
      await finishTurn(entry)
    } else {
      entry.updatedAt = now()
      save(entry)
    }
    // (Turn-ran only when it ran to a stop for him: that it ran on to one
    // for the other Commander is not his to know.)
    return { status: result.status === 'waiting' || status(entry, side) === 'waiting' ? 'waiting' : 'turn-ran', understood, notes }
  }

  // A finished battle is written into the company of each Commander who
  // fought it, once: who lived, what each officer's unit did, and what the
  // Commander told him (his memory of it).
  function settle(entry) {
    const game = entry.game
    if (!game.outcome.decided || entry.settled) return
    entry.settled = true
    const written = []
    for (const [side, id] of Object.entries(entry.commanders ?? {})) {
      const commander = commanders.byId(id)
      if (!commander) continue
      const name = namer(game, side)
      const result = game.outcome.winner === 'draw' ? 'draw' : game.outcome.winner === side ? 'victory' : 'defeat'
      const events = summarise(game.battle.log.all())
      const said = (entry.said?.[side] ?? []).flatMap(s => s.lines)
      const prices = commanderOf(game, side)?.prices ?? []
      // Every unit that fought: an officer's fate, or (officerId null) a
      // unit with none, which is a battle nearer to earning one.
      // (Not the second line's: raised for the day, it goes home.)
      const raisedForTheDay = new Set(game.spec.units.filter(u => u.secondLine).map(u => u.id))
      const fates = officerFates(game, side).filter(f => !raisedForTheDay.has(f.unitId)).map(f => {
        const deeds = digest(events, { map: game.battle.map, ownIds: new Set([f.unitId]) })[0]?.text ?? ''
        return {
          unitId: f.unitId, culture: game.spec.units.find(u => u.id === f.unitId)?.culture ?? null,
          officerId: f.officerId, unit: f.unit.toLowerCase(), destroyed: f.destroyed, mustered: f.mustered, survivors: f.survivors, fought: f.fought,
          // The next day of a battle: it went in short, and is made up to
          // strength only once the fight is over (company.js, `full`).
          ...(game.spec.nextDay ? { full: game.spec.units.find(u => u.id === f.unitId)?.maxStrength ?? f.mustered } : {}),
          fate: f.headless && prices.includes(f.unitId) ? 'given up' : f.fate, ...(f.how ? { how: f.how } : {}),
          // Given in a deal: the unit is gone, whatever befell its officer.
          ...(prices.includes(f.unitId) ? { given: true } : {}),
          deeds: name(deeds).replace(/^[^:]+:\s*/, '').replace('BROKE', 'broke'),
          // "Spears, Swords: advance on the enemy" was said to both.
          orders: said
            .filter(line => line.slice(0, line.indexOf(':')).toLowerCase().split(/,\s*/).includes(f.unit.toLowerCase()))
            .map(line => line.replace(/^[^:]+:\s*/, ''))
        }
      })
      written.push({ side, commander, result, fates, prices, fresh: !(commander.company.settled ?? []).includes(entry.id) })
    }
    // What changes hands in a deal, read before any company is written.
    const taken = capturesOf(entry, written)
    for (const { side, commander, result, fates, prices, fresh } of written) {
      const end = commanderOf(game, side)
      // The next day of a battle is the same battle: written in under the
      // whole battle's title, and counted once (oneBattle).
      const before = previousOf(entry)
      const title = before ? `${firstTitle(entry)}, ${NIGHT.overDays(entry.day ?? 2)}` : entry.title
      let after = settleBattle(commander.company, { id: entry.id, title, result, seed: game.seed }, fates)
      if (before && fresh && (commander.company.settled ?? []).includes(before.id)) after = oneBattle(commander.company, after, before.id, entry.id)
      // (A Commander held as a lost battle ended keeps what came through it.)
      // The units his side was given in a deal join him, with their officers.
      const coming = fresh ? taken.filter(t => t.to === side) : []
      for (const unit of coming) {
        const added = addToRoster(commander, unit.unit, 'captured')
        commanders.setRoster(commander, { gained: added.gained })
        after = takeIn(after, { name: added.unit.name, state: unit.state, officer: unit.officer, from: unit.unit.from })
      }
      commanders.setCompany(commander, after)
      // The units he gave are his no more, to a player or to the computer.
      if (fresh && commander.faction) {
        const gone = fates.filter(f => prices.includes(f.unitId)).map(f => f.unit)
        for (const unit of gone) commanders.setRoster(commander, without(commander, unit))
        if (gone.length) commanders.setCompany(commander, armyChanged(commander.company, rosterOf(commander).map(u => u.name)))
      }
      if (commander.battle === entry.id) commanders.setBattle(commander, null)
      // Killed: everything ends with him. (A held Commander is never killed.)
      if (end?.fate === 'killed') commanders.end(commander, { how: end.fate, at: entry.title })
    }
  }

  // A battle fought on the next day (again), and the day before it: one
  // battle. The day before, if this battle is a next day; and the title
  // of its first day ("Crownhill: Rome against Gaul", not "..., day 2").
  function previousOf(entry) {
    if (!entry.day || entry.day < 2) return null
    for (const other of battles.values()) if (other.next === entry.id) return other
    return null
  }
  function firstTitle(entry) {
    let first = entry
    for (let before = previousOf(first), n = 0; before && n < 20; before = previousOf(before), n++) first = before
    return String(first.title).replace(/, day \d+$/, '')
  }
  // Written into a company after the day before was (settleBattle wrote
  // each): it counts as one battle. The company's count of battles, and
  // each unit's count, go back by one; an officer who fought both days has
  // one line for the battle, the last day's, and one battle's experience,
  // the first day's (his loyalty moves with each day's outcome); each
  // unit's men bank it once.
  function oneBattle(was, after, beforeId, id) {
    const next = JSON.parse(JSON.stringify(after))
    next.battles = Math.max(0, next.battles - 1)
    for (const officer of next.officers) {
      const days = officer.record.filter(r => r.battle === beforeId || r.battle === id)
      if (days.length < 2) continue
      officer.record = officer.record.filter(r => r.battle !== beforeId)
      const then = was.officers.find(o => o.id === officer.id)
      if (then) officer.experience = Math.min(officer.experience, then.experience)
    }
    for (const [kind, state] of Object.entries(next.units ?? {})) {
      const then = was.units?.[kind]
      if (typeof state === 'object' && then && typeof then === 'object' && state.battlesParticipated > then.battlesParticipated) {
        state.battlesParticipated -= 1
        // Its men bank the battle once: what the second day added is not
        // added again (what its fallen took with them stays taken).
        state.totalExperience = Math.min(state.totalExperience, then.totalExperience)
      }
    }
    return next
  }

  // The units given in a deal between two players' Commanders, each as it
  // goes to its captor's roster (ruled 2026-11-23: "Additional units from
  // capture and other avenues exist"): its kit as it was raised, its men,
  // its veterancy and training with this battle in them, its officer if he
  // went with it, and whom it was taken from. Nothing is taken from or by
  // the computer: it keeps no roster.
  function capturesOf(entry, written) {
    const game = entry.game
    const out = []
    for (const captive of written) {
      if (!captive.prices.length) continue
      const captor = written.find(w => w.side !== captive.side)
      if (!captor?.commander.faction || !captive.commander.faction) continue
      const roster = rosterOf(captive.commander)
      for (const f of captive.fates.filter(x => captive.prices.includes(x.unitId))) {
        const spec = game.spec.units.find(u => u.id === f.unitId)
        const own = roster.find(u => u.name === f.unit)
        const kit = own ?? { quality: spec.raisedAs ?? spec.quality, weapon: spec.primaryWeapon, second: spec.sidearm ?? spec.thrown, armor: spec.armor, shield: spec.shield, mounted: Boolean(spec.mounted) }
        const { state, officer } = handOver(captive.commander.company, { id: entry.id, title: entry.title, result: captive.result }, f)
        out.push({
          to: captor.side,
          state,
          officer,
          unit: {
            ...kitOf(kit), name: f.unit, men: spec.maxStrength ?? spec.strength, culture: spec.culture ?? null,
            ...(own?.named ? { named: true } : {}), ...(own?.formerly ? { formerly: own.formerly } : {}),
            from: { commander: captive.commander.name, faction: captive.commander.faction ?? null, battle: entry.title }
          }
        })
      }
    }
    return out
  }

  // Was this side's Commander held all through the turn just run (taken
  // before it began)? Then where, and what could be seen from there at its
  // end: the captor's sight (command/commander.js, sightFrom). A turn in
  // which he was taken he spent with his army, and hears of as it does.
  function heldThrough(game, side, events) {
    const c = game.battle.commanders?.[side]
    if (!c) return null
    if (events.some(e => e.type === 'commanderTaken' && e.side === side)) return null
    const freed = events.find(e => e.type === 'commanderFreed' && e.side === side)
    const captorId = freed?.by ?? (c.status === 'held' ? c.heldBy : null)
    return captorId ? sightFrom(game.battle, captorId) : null
  }

  // Each human side's report of the turn just run: the plain account (fog
  // of war held) and, when the AI is on, the narrated one.
  //
  // Only a side the battle has stopped for is written to (ruled 2026-11-23:
  // each is asked only when wanted), and his dispatch tells all that has
  // reached him since his last: every stretch the battle ran while it did
  // not want him. Once it is over, everyone is told.
  async function writeDispatches(entry) {
    const game = entry.game
    const last = game.history.at(-1)
    for (const side of Object.keys(entry.seats)) {
      if (!entry.seats[side]) continue
      if (!game.outcome.decided && !waitingOn(game).includes(side)) continue
      const before = entry.dispatches[side].at(-1)
      const since = before ? before.through ?? before.turn : 0
      const stretch = game.history.slice(since)
      if (stretch.length === 0) continue
      const turnEntry = {
        playerTurn: game.calls?.[side] ?? last.playerTurn,
        interrupt: last.wanted?.[side] ?? last.interrupt,
        ticks: stretch.flatMap(h => h.ticks)
      }
      const name = namer(game, side)
      const events = turnEntry.ticks.flatMap(t => game.battle.log.forTurn(t.battleTurn))
      const own = [...game.battle.world.units, ...game.battle.fledUnits].filter(u => u.side === side)
      const seen = sideView(game, side).intel.filter(e => e.status === 'visible').map(e => e.id)
      const ownIds = new Set(own.map(u => u.id))
      // Held for the turn (taken before it began), he hears only what the
      // unit holding him could see and hear (ruled 2026-11-23).
      const captivity = heldThrough(game, side, events)
      // ... and reads the reports that come in to his captors (ruled
      // 2026-11-23: "you get dispatches from the enemy side"): everything
      // their side could know of the turn, their own units and all.
      const theirs = captivity ? [...game.battle.world.units, ...game.battle.fledUnits].filter(u => u.side !== side) : []
      const theirIds = new Set(theirs.map(u => u.id))
      const theySaw = captivity ? Object.keys(entry.seats).filter(s => s !== side)
        .flatMap(s => sideView(game, s).intel.filter(e => e.status === 'visible').map(e => e.id)) : []
      const turn = {
        map: game.battle.map, side, culture: own[0]?.culture ?? 'unknown',
        // Held: the turn as his captors' side knows it, told in his own
        // names for everyone ("enemy swords", "Spears").
        ownIds: captivity ? theirIds : ownIds,
        seenEnemyIds: captivity ? new Set(theySaw) : new Set(seen),
        events,
        nameOf: name,
        // How many an enemy unit is, as far as his reports of it tell.
        howMany: menAsTold(game, side, captivity ? theirIds : ownIds),
        // Where each unit of the side told of stands now, to say where it fought.
        whereIs: (id) => (captivity ? theirs : own).find(u => u.id === id)?.position ?? null,
        // The battle ended in this stretch: the ground no longer decides it.
        over: Boolean(game.outcome.decided),
        // In the enemy's hands as the stretch ends: his army is told of (S11).
        held: game.battle.commanders?.[side]?.status === 'held',
        // Who he knows to be on a piece of the ground now (S12).
        onGround: (groundName) => knownOnGround(game, side, groundName)
      }
      // The plain account: what this side could know, most important first,
      // the fighting told unit by unit.
      let lines = report(turn).map(l => l.charAt(0).toUpperCase() + l.slice(1))
      // With his army on the field, he is told what has reached him by the
      // turn's end: word from about him at once, from beyond by rider, each
      // with how old it is (engine/orchestrator/word.js). The battle's end
      // tells all.
      const word = !captivity && !game.outcome.decided ? game.word?.[side] ?? null : null
      if (word) {
        const to = turnEntry.ticks.at(-1)?.battleTurn ?? game.battle.turn
        const from = (turnEntry.ticks[0]?.battleTurn ?? to + 1) - 1
        const news = newsBetween(game, side, from, to)
        const knownIds = new Set(knownEnemies(word).map(e => e.id))
        const told = (evs) => report({ ...turn, events: evs, seenEnemyIds: knownIds, whereIs: (id) => word.units[id]?.position ?? null })
          .map(l => l.charAt(0).toUpperCase() + l.slice(1))
        const late = new Map()
        // (Marching told late is only noise: the map shows where word put
        // each unit.)
        const QUIET = ['move', 'arrived', 'halted', 'crowding']
        for (const n of news.filter(n => n.arrived > n.event.turn && !QUIET.includes(n.event.type))) {
          const age = (to - n.event.turn) * 10
          if (!late.has(age)) late.set(age, [])
          late.get(age).push(n.event)
        }
        // News from far off first, newest first: it is what he could not
        // see for himself.
        // Word come again from a unit he had had none of for too long.
        const again = [...new Set((word.back ?? []).filter(b => b.turn > from && b.turn <= to).map(b => b.unitId))]
          .map(id => capitalise(name(RIDER.wordAgain(id))))
        // Enemies first reported to him in this stretch, by whom and where,
        // with as much as the report held (REPORT.sighted).
        const known = enemyKnowledge(game, side)
        const sighted = Object.entries(word.enemies)
          .filter(([, e]) => e.first && e.first.turn > from && e.first.turn <= to)
          .sort((a, b) => b[1].first.sent - a[1].first.sent || a[0].localeCompare(b[0]))
          .map(([id, e]) => {
            const age = Math.max(0, (to - e.first.sent) * 10)
            const men = REPORT.men(toldOf(known[id] ?? e).count)
            const said = (n) => capitalise(name(REPORT.sighted(e.first.by, n > 1 ? `${id} (${n} units)` : id, men, `${placeName(game.battle.map, e.position)} (${where(e.position)})`)))
            return { age, said }
          })
          // Several he cannot tell apart, reported together, are one line.
          .reduce((out, x) => {
            const same = out.find(y => y.age === x.age && y.said(1) === x.said(1))
            if (same) same.n += 1
            else out.push({ ...x, n: 1 })
            return out
          }, [])
          .map(x => (x.age > 0 ? `${RIDER.from(x.age)}: ${x.said(x.n)}` : x.said(x.n)))
        lines = [
          ...again,
          ...sighted,
          ...[...late.keys()].sort((a, b) => a - b).flatMap(age => told(late.get(age)).map(l => `${RIDER.from(age)}: ${l}`)),
          ...told(news.filter(n => n.arrived === n.event.turn).map(n => n.event))
        ]
        turn.events = news.map(n => n.event)
        turn.seenEnemyIds = knownIds
        turn.whereIs = (id) => word.units[id]?.position ?? null
      }
      // His first dispatch of a battle tells him, against the computer, whom
      // he faces (after the ground, which goes first)...
      const them = entry.dispatches[side].length === 0 ? enemyCommanderOf(game.spec, Object.keys(game.spec.sides).find(s => s !== side)) : null
      if (them) lines.unshift(ENEMY_COMMANDER.faced(them.name, them.character))
      // His first dispatch of a battle tells him the ground to fight for.
      if (entry.dispatches[side].length === 0 && game.objectives.length > 0) {
        const names = game.objectives.map(o => o.name)
        const minutes = game.spec.objectiveHoldMinutes ?? T.GROUND.HOLD_MINUTES
        lines.unshift(`${GROUND.toFightFor(names)} ${neededOf(game)
          ? GROUND.some.rule(neededOf(game), names.length, calledOf(game), minutes)
          : GROUND.rule(names, minutes, game.objectives.some(o => (o.reach ?? (o.single ? 1 : 0)) > 0))}`)
      }
      // ... or, in a pitched battle, that there is none, and how it is won.
      if (entry.dispatches[side].length === 0 && game.objectives.length === 0 && game.spec.kind === 'pitched') lines.unshift(KINDS.pitched.tent(T.PITCHED.STAND_SHARE))
      if (captivity?.captor) {
        lines.unshift(`You are held by ${name(captivity.captor.id)} at ${where(captivity.captor.position)}, and hear the reports as they come in to your captors`)
      }
      // The battle's end, first, to every side: a battle decided by the
      // ground (or by a bargain) leaves no event of its own in the log, and
      // the last dispatch said nothing of it. Night has its own line.
      if (game.outcome.decided && game.outcome.reason !== 'night fell') {
        const over = BATTLE_OVER.line(game.outcome.reason, game.outcome.winner === 'draw' ? null : game.outcome.winner === side)
        lines = [over, ...lines.filter(l => !l.startsWith('The battle is over'))]
      }
      const told = await narrateTurn(ai, { ...turn, plain: lines.join('\n'), facts: lines })
      entry.dispatches[side].push({
        turn: turnEntry.playerTurn,
        minutes: game.minutesElapsed,
        interrupt: turnEntry.interrupt,
        // The battle's stretches it covers (game.history), for the next.
        through: game.history.length,
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
    offer: (token, units) => inTurn(token, () => offer(token, units)),
    answer: (token, given) => inTurn(token, () => answer(token, given)),
    again,
    // The length of the day, and what night does, for the muster.
    day: () => ({ minutes: T.DAY.MINUTES, said: NIGHT.day(T.DAY.MINUTES) }),
    seatOf,
    commanders,
    // Where it is all kept (storage.js): the server waits on it before it
    // answers, and asks it whether saving works.
    storage: kept,
    commanderView,
    scenarios: () => Object.keys(SCENARIOS).map(id => ({ id, title: SCENARIO_TITLES[id] ?? id })),
    // Each field with its own ground to fight for, in the muster's words;
    // and the kinds of battle fought on it (ruled 2026-11-25), the one
    // offered first first, each with a line on how it is won.
    maps: () => mapChoices().map(m => {
      const ground = groundOf(m.id)
      const names = ground.map(g => g.name)
      const hold = MAPS[m.id]?.hold
      const rule = hold?.needed && hold.needed < names.length
        ? GROUND.some.rule(hold.needed, names.length, hold.called ?? 'pieces of ground', T.GROUND.HOLD_MINUTES)
        : GROUND.rule(names, T.GROUND.HOLD_MINUTES, ground.some(g => g.reach > 0))
      const said = names.length ? `${MAPS[m.id]?.kingOfTheHill ? `${KINDS.kingOfTheHill} ` : ''}${GROUND.toFightFor(names)} ${rule}` : ''
      // A big field says so, and that its armies come in two lines.
      const lines = linesOf(m.id) > 1 ? FIELD.lines : ''
      const kinds = kindsOf(m.id).map(k => ({ id: k, title: KINDS[k].title, said: k === 'ground' ? said : KINDS[k].said(T.PITCHED.STAND_SHARE) }))
      return { ...m, ground: names, said: [said, lines].filter(Boolean).join(' '), kinds, ...(lines ? { lines } : {}), ...(m.km > 1 ? { size: FIELD.size(m.km) } : {}) }
    }),
    // Each with its people's perks, a line each (armies.js, perkLines).
    factions: () => factionChoices().map(f => ({ ...f, perks: perkLines(f.id) })),
    setArmy,
    transfer,
    nameUnit,
    appraise: (faction, body) => appraise(faction, body),
    // For Discord (src/discord/notices.js): every battle, to look over; and
    // what it has told of one, kept on the battle's own document. Neither
    // changes the battle.
    allBattles: () => [...battles.values()],
    remember: (id, told) => {
      const entry = battles.get(id)
      if (!entry) return
      entry.discord = told
      save(entry)
    }
  }
}

const capitalise = (text) => String(text).charAt(0).toUpperCase() + String(text).slice(1)

module.exports = { createBattleStore, unitName, describeOrder, namedChoices }
