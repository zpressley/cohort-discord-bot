// src/harness/army-study/lib.js
//
// The army balance study (docs/design/army-balance.md): one battle between
// two armies, each a faction's usual army or a bought one, each side played
// by a policy of its own; and the bookkeeping the study's scripts share.
//
// A battle is mustered as the app musters it: the meeting battle on one of
// the four maps, the day over after 40 player turns, a bought army with its
// Commander on the field with the elite unit. A side with its faction's
// usual army (the computer's) has no Commander, as in the app and in
// bought-league.js; when both sides are bought, both have one.
//
// Policies (who gives the orders):
//   planner  the computer's planner (opponent/planner.js), as it is
//   close    the same planner told to close at once: it never holds ground
//            and has no patience (TUNING.HOLDS 0, PATIENCE 0)
//   charge   a player who orders "everyone advance" every turn: the foot
//            and horse go straight at the nearest enemy; missile troops,
//            told to advance, close until they can shoot and stand there
//   rush     "charge", but the horse ride for the enemy's missile troops
//            first (what a player would tell them against slingers)
//
// Every battle has a seed of its own: `seedFor` hashes what the battle is.

const { createGame, submitOrders, commanderOf } = require('../../engine/orchestrator')
const { planTurn, TUNING } = require('../../opponent/planner')
const { loadScenario, mapChoices } = require('../../adapters/hotseat/scenarios')
const { fieldArmies } = require('../../engine/army/standard')
const { buildUnit } = require('../../engine/army/builder')
const { missileRange } = require('../../engine/combat/ranged')
const { tileDistance } = require('../../engine/world')
const D = require('../../engine/army/data')
const { FACTIONS } = require('../../data/factions')
const { leadUnit } = require('../../engine/command/company')
const { nextName, checkArmy } = require('../../web/armies')

// `--set data.ARMOR_SP.heavy_armor=3` or `--set tables.MISSILES.SHOCK=0.5`
// on any study script's command line changes that number, in memory, for
// the run (and in search.js's workers too): to try a change without
// editing the engine.
function applySets(argv = process.argv) {
  const roots = { data: D, tables: require('../../engine/combat/tables'), factions: FACTIONS }
  const sets = []
  argv.forEach((a, i) => { if (a === '--set') sets.push(argv[i + 1]) })
  for (const set of sets) {
    const [path, raw] = set.split('=')
    const keys = path.split('.')
    let obj = roots[keys.shift()]
    while (keys.length > 1) obj = obj[keys.shift()]
    obj[keys[0]] = isNaN(Number(raw)) ? raw : Number(raw)
  }
  return sets
}
const SETS = applySets()

const MAX_PLAYER_TURNS = 60
const DAY_TURNS = 40
const MAPS = mapChoices().map(m => m.id)

// ── Seeds ────────────────────────────────────────────
function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
  return (h % 2000000000) + 1
}
const seedFor = (...parts) => hash(parts.join('|'))

// ── Policies ─────────────────────────────────────────
function withTuning(overrides, fn) {
  const saved = {}
  for (const k of Object.keys(overrides)) { saved[k] = TUNING[k]; TUNING[k] = overrides[k] }
  try { return fn() } finally { Object.assign(TUNING, saved) }
}

function chargeOrders(game, side, { rush = false } = {}) {
  const battle = game.battle
  const mine = battle.world.units.filter(u => u.side === side && u.strength > 0 && !battle.broken.has(u.id))
  const seen = [...(battle.lastSeen.get(side) ?? new Map()).entries()]
    .map(([id, position]) => ({ id, position, unit: battle.world.units.find(u => u.id === id) }))
    .filter(e => e.unit && e.unit.strength > 0 && !battle.broken.has(e.id))
  return mine.map(u => {
    if (rush && u.mounted && missileRange(u) === 0) {
      const prey = seen.filter(e => missileRange(e.unit) > 0 && !e.unit.mounted)
        .sort((a, b) => tileDistance(u.position, a.position) - tileDistance(u.position, b.position) || a.id.localeCompare(b.id))[0]
      if (prey) return { unitRef: u.id, action: 'attack', target: { ...prey.position } }
    }
    return { unitRef: u.id, action: 'advance' }
  })
}

const POLICIES = {
  planner: (game, side) => planTurn(game, side),
  close: (game, side) => withTuning({ HOLDS: 0, PATIENCE: 0, PATIENCE_MORE: 0 }, () => planTurn(game, side)),
  charge: (game, side) => chargeOrders(game, side),
  rush: (game, side) => chargeOrders(game, side, { rush: true })
}

// ── Armies ───────────────────────────────────────────
// An army is { faction, units } with units a bought list, or null for the
// faction's usual army.
const usual = (faction) => ({ faction, units: null })

/** Name a list of kits as the army screen would, and check it is legal. */
function named(faction, kits) {
  const units = []
  for (const k of kits) {
    const kit = { armor: 'no_armor', shield: 'no_shield', mounted: false, ...k }
    units.push({ name: nextName(faction, kit, units.map(u => u.name)), ...kit })
  }
  return units
}
function legal(faction, units) {
  return checkArmy(faction, units)
}
const budgetOf = (faction) => D.SP_BUDGETS[FACTIONS[faction].culture] ?? D.DEFAULT_SP_BUDGET
const costOf = (faction, kit) => {
  const r = buildUnit({ armor: 'no_armor', shield: 'no_shield', mounted: false, ...kit }, FACTIONS[faction].culture)
  return r.ok ? r.cost : null
}
/** As many of one kit as the budget buys (or `count`, if given and affordable). */
function mono(faction, kit, count = null) {
  const c = costOf(faction, kit)
  if (c === null) return null
  const n = count ?? Math.floor(budgetOf(faction) / c)
  if (n < 1 || n * c > budgetOf(faction)) return null
  return named(faction, Array.from({ length: n }, () => kit))
}

// ── One battle ───────────────────────────────────────
// A usual army is data, written for the prices of its day: while a study
// tries other prices it is fielded as written, its budget lifted for the
// muster only. `--strict-usual` holds it to the budget (and fails if over).
const STRICT_USUAL = process.argv.includes('--strict-usual')
function overBudget(faction, fn) {
  if (STRICT_USUAL) return fn()
  const culture = FACTIONS[faction].culture
  const had = Object.prototype.hasOwnProperty.call(D.SP_BUDGETS, culture)
  const was = D.SP_BUDGETS[culture]
  D.SP_BUDGETS[culture] = 1000
  try { return fn() } finally { if (had) D.SP_BUDGETS[culture] = was; else delete D.SP_BUDGETS[culture] }
}

/**
 * @param {Object} red   { faction, units|null, policy?='planner', men? }
 * @param {Object} blue  the same
 * @param {Object} o     { map, seed, turnLimit }
 *   `men` (optional) scales every bought unit's numbers (an experiment:
 *   the same army with fewer men).
 */
function battle(red, blue, { map = 'crownhill', seed = 1, turnLimit = DAY_TURNS, mark = null } = {}) {
  const sides = { red, blue }
  // Each side mustered on its own, so that a usual army a price change has
  // put over its budget can still be the yardstick while prices are tried
  // (overBudget, below); a bought army is always held to its budget.
  let spec0 = loadScenario('meeting-battle', { map, deploy: true })
  for (const side of ['red', 'blue']) {
    const s = sides[side]
    const muster = () => fieldArmies(spec0, { [side]: { faction: s.faction, units: s.units } })
    spec0 = s.units ? muster() : overBudget(s.faction, muster)
  }
  // Optional per-side scaling of men (bought units only, not the elite).
  const units = spec0.units.map(u => {
    const m = sides[u.side]?.men
    if (!m || u.quality === 'elite') return u
    const n = Math.max(1, Math.round(u.strength * m))
    return { ...u, strength: n, maxStrength: n }
  }).map(u => (mark ? mark(u) : u))
  const commanders = {}
  for (const side of ['red', 'blue']) {
    if (!sides[side].units) continue
    const mine = units.filter(u => u.side === side)
    commanders[side] = { unitId: mine[leadUnit(mine)].id }
  }
  const game = createGame({ ...spec0, units, turnLimit, standingOrders: {}, commanders }, { seed })
  let turns = 0
  while (!game.outcome.decided && turns < MAX_PLAYER_TURNS) {
    const r = POLICIES[red.policy ?? 'planner'](game, 'red')
    const b = POLICIES[blue.policy ?? 'planner'](game, 'blue')
    submitOrders(game, 'red', r)
    submitOrders(game, 'blue', b)
    turns++
  }
  const lost = (side) => {
    const start = game.startingStrength[side] || 1
    const now = game.battle.world.units.filter(u => u.side === side).reduce((s, u) => s + Math.max(0, u.strength), 0)
    return 1 - now / start
  }
  return {
    decided: game.outcome.decided,
    // Night ends a battle with no winner (ruled 2026-11-24); this study
    // still counts the side ahead as night fell (fewer men lost) as the
    // winner, so its tables read as they did. The game never does.
    winner: game.outcome.reason === 'night fell' ? (game.outcome.ahead ?? 'draw') : game.outcome.winner ?? null,
    reason: game.outcome.reason,
    turns,
    lost: { red: lost('red'), blue: lost('blue') },
    fates: { red: commanderOf(game, 'red')?.fate ?? null, blue: commanderOf(game, 'blue')?.fate ?? null }
  }
}

/**
 * An army against a list of opponents, every map, both ways round, `seeds`
 * seeds each. Returns wins, battles, and per opponent.
 */
function evaluate(army, opponents, { seeds = 2, maps = MAPS, tag = 'eval' } = {}) {
  const out = { won: 0, draws: 0, battles: 0, turns: 0, against: {}, lostOwn: 0 }
  for (const [label, opp] of Object.entries(opponents)) {
    const a = out.against[label] = { won: 0, battles: 0 }
    for (const map of maps) for (const side of ['red', 'blue']) for (let s = 1; s <= seeds; s++) {
      const other = side === 'red' ? 'blue' : 'red'
      const seed = seedFor(tag, JSON.stringify(army), label, map, side, s)
      const r = battle(side === 'red' ? army : opp, side === 'red' ? opp : army, { map, seed })
      out.battles++; a.battles++
      out.turns += r.turns
      out.lostOwn += r.lost[side]
      if (r.winner === side) { out.won++; a.won++ } else if (r.winner === 'draw' || !r.winner) out.draws++
      void other
    }
  }
  out.rate = out.won / Math.max(1, out.battles)
  return out
}

const USUAL = Object.fromEntries(Object.keys(FACTIONS).map(k => [k, usual(k)]))
const pct = (x) => `${Math.round(100 * x)}%`

module.exports = {
  SETS,
  battle, evaluate, seedFor, POLICIES, MAPS, USUAL, usual, named, mono, legal, costOf, budgetOf, pct, withTuning
}
