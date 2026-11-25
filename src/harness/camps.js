// src/harness/camps.js
//
// Camp battles (ruled 2026-11-25; engine/battle/camp.js), whole, on
// Greywater: each army starts with its camp packed up, carried, pitches it,
// guards it, may lose it, and the battle goes on day after day until one
// side is beaten (or CAMP.MAX_DAYS run out). Both sides the computer
// (opponent/planner.js), no Commander on the field, each battle a seed of
// its own; no ground to fight for (the camps are what is fought for).
//
// What it measures (docs/DECISIONS.md, "How camps were built"):
//   how long a battle lasts, in days and hours; how it ends; how often a
//   camp is burned (defended or not), moved, fought in; wind over the days
//   for an army with and without its camp; how many broken units reach
//   their camp and rally there; the west's share of wins (fair within 45
//   to 55%); every battle ends.
//
//   --battles N     how many (default 120)
//   --mode mirror   (default) the same faction on both sides; 'mixed':
//                   faction against faction
//   --mode idle     the west gives no orders at all (a plain stand-in who
//                   never pitches: is it a good plan never to pitch?)
//   --mode nopitch  the west plays as the computer but never pitches
//   --mode hold     the west pitches where it formed up and holds there
//   --mode lost     the west's camp burned before a blow is struck: what
//                   losing it costs an army with all its men
//   --mode stand    the west's camp pitched where it formed up from the
//                   start, and it plays as the computer (the other reading:
//                   a camp that starts pitched)
//   --character c   the west's Commander's character (bold, steady,
//                   cautious); --against c the east's
//   --set NAME=v    try a CAMP rate (tables.CAMP), e.g. --set HITS=6
//   --verbose       one line a battle
//
//   node src/harness/camps.js --battles 120

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback }
const T = require('../engine/combat/tables')
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] !== '--set') continue
  const [name, value] = process.argv[i + 1].split('=')
  T.CAMP[name] = value === 'true' ? true : value === 'false' ? false : Number(value)
}
const { createGame, submitOrders, waitingOn } = require('../engine/orchestrator')
const { planTurn } = require('../opponent/planner')
const { loadScenario } = require('../adapters/hotseat/scenarios')
const { fieldFactions, FACTIONS } = require('../engine/army/factions')
const { withSecondLine } = require('../engine/army/secondLine')
const { leadUnit } = require('../engine/command/company')
const { byCommandPost } = require('../engine/command/messengers')

const BATTLES = Number(arg('--battles', 120))
const MODE = arg('--mode', 'mirror')
const CHARACTER = arg('--character', null)
const AGAINST = arg('--against', null)
const VERBOSE = process.argv.includes('--verbose')
// The west a Commander on the field, riding with his best unit, his orders
// by rider, as the app has it (the Commander-taken odds); the east the
// computer from its command post.
const COMMANDER = process.argv.includes('--commander')
// No camps at all, on the same field and seeds: to compare.
const NO_CAMPS = process.argv.includes('--nocamps')
const MAX_STOPS = 4000

/** One camp battle; returns what was measured of it. */
function play(red, blue, seed, { mode = MODE, character = CHARACTER, against = AGAINST } = {}) {
  let spec = withSecondLine(fieldFactions(loadScenario('meeting-battle', { map: 'greywater', deploy: true }), { red, blue }), { red, blue })
  const sides = { ...spec.sides }
  if (character) sides.red = { ...sides.red, character }
  if (against) sides.blue = { ...sides.blue, character: against }
  const formed = (side) => {
    const units = spec.units.filter(u => u.side === side)
    return { x: Math.round(units.reduce((s, u) => s + u.position.x, 0) / units.length), y: Math.round(units.reduce((s, u) => s + u.position.y, 0) / units.length) }
  }
  const camps = mode === 'stand' || mode === 'lost' ? { red: { at: formed('red') } } : true
  spec = { ...spec, sides, standingOrders: {}, dayMinutes: T.DAY.MINUTES, ...(NO_CAMPS ? {} : { camps }) }
  if (COMMANDER) {
    const west = spec.units.filter(u => u.side === 'red')
    spec = { ...spec, commanders: { red: { unitId: west[leadUnit(west)].id } } }
  }
  const game = createGame(spec, { seed })
  // The west's camp lost before a blow is struck: what losing it costs an
  // army that still has all its men (a measure only; no event is logged).
  if (mode === 'lost' && game.battle.camps) Object.assign(game.battle.camps.red, { status: 'burned', tiles: null })
  let stops = 0
  const atBurn = []
  while (!game.outcome.decided && stops < MAX_STOPS) {
    stops++
    for (const side of ['red', 'blue']) {
      if (game.outcome.decided || !waitingOn(game).includes(side)) continue
      let orders = planTurn(game, side)
      if (side === 'red' && mode === 'idle') orders = []
      // Plays as the computer, but never pitches its camp: the carrier
      // marches with the army instead.
      if (side === 'red' && mode === 'nopitch') orders = orders.filter(o => o.action !== 'pitch')
      if (side === 'blue' && COMMANDER) orders = byCommandPost(orders)
      if (side === 'red' && mode === 'hold') {
        const camp = game.battle.camps?.red ?? { status: 'none' }
        orders = camp.status === 'carried' ? [{ unitRef: camp.carrier, action: 'pitch' }] : []
      }
      submitOrders(game, side, orders)
    }
    // At each camp burned: how the burned side stood (its formed men to
    // the enemy's), to tell a blow in the middle of a battle from the end
    // of one already lost.
    for (const e of game.battle.log.ofType('campBurned').slice(atBurn.length)) {
      const formedMen = (s) => game.battle.world.units.filter(u => u.side === s && u.strength > 0 && !game.battle.broken.has(u.id) && !game.battle.isShaken(u)).reduce((n, u) => n + u.strength, 0)
      const other = e.side === 'red' ? 'blue' : 'red'
      atBurn.push({ side: e.side, turn: e.turn, steady: formedMen(e.side), against: formedMen(other) })
    }
  }
  const log = game.battle.log
  const camp = (side) => game.battle.camps?.[side] ?? { status: 'none' }
  const burned = log.ofType('campBurned')
  const rests = log.ofType('campRest')
  return {
    seed, red, blue,
    decided: game.outcome.decided,
    winner: game.outcome.winner,
    reason: game.outcome.reason,
    days: game.day,
    minutes: game.minutesElapsed,
    burned: burned.map((e, i) => ({ side: e.side, undefended: e.undefended, turn: e.turn, ...atBurn[i], after: game.battle.turn - e.turn })),
    assailed: log.ofType('campAssailed').length,
    pitched: log.ofType('campPitched').map(e => e.side),
    struck: log.ofType('campStruck').length,
    dropped: log.ofType('campDropped').length,
    neverPitched: ['red', 'blue'].filter(s => !log.ofType('campPitched').some(e => e.side === s)),
    pitchedAt: Object.fromEntries(['red', 'blue'].map(s => [s, log.ofType('campPitched').find(e => e.side === s)?.turn ?? null])),
    rallied: log.ofType('rallied').length,
    ralliedInCamp: log.ofType('rallied').filter(e => e.inCamp).length,
    routs: log.ofType('rout').length,
    fled: game.battle.fledUnits.length,
    // Wind at each nightfall, as a share of what each army can spend, and
    // whether its camp was pitched to rest in.
    rests: rests.map(e => ({ side: e.side, rested: e.rested, wind: e.wind, day: game.battle.log.ofType('nightPassed').filter(n => n.turn <= e.turn).length })),
    status: { red: camp('red').status, blue: camp('blue').status },
    commander: game.battle.commanders?.red ? {
      taken: log.ofType('commanderTaken').some(e => e.side === 'red'),
      killed: log.ofType('commanderKilled').some(e => e.side === 'red')
    } : null
  }
}

function league(n = BATTLES, options = {}) {
  const keys = Object.keys(FACTIONS)
  const out = []
  for (let i = 0; i < n; i++) {
    const red = keys[i % keys.length]
    const blue = (options.mode ?? MODE) === 'mixed' ? keys[(i * 7 + 3) % keys.length] : red
    const r = play(red, blue, 1 + i, options)
    out.push(r)
    if (VERBOSE) console.log(`${String(r.seed).padStart(3)} ${red}/${blue}: ${r.winner} (${r.reason}) day ${r.days}, ${Math.round(r.minutes / 60)} h; burned ${r.burned.map(b => `${b.side}${b.undefended ? '' : '*'}`).join(',') || '-'}; rallied ${r.ralliedInCamp}/${r.rallied} in camp; camps ${r.status.red}/${r.status.blue}`)
  }
  return out
}

function summary(rows) {
  const n = rows.length
  const pct = (k) => `${Math.round(100 * k / Math.max(1, n))}%`
  const won = rows.filter(r => r.winner === 'red' || r.winner === 'blue')
  const red = won.filter(r => r.winner === 'red').length
  const reasons = {}
  for (const r of rows) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1
  const days = {}
  for (const r of rows) days[r.days] = (days[r.days] ?? 0) + 1
  const burned = rows.filter(r => r.burned.length > 0)
  const burnedUndefended = rows.flatMap(r => r.burned).filter(b => b.undefended).length
  const burnedAll = rows.flatMap(r => r.burned).length
  // A burned camp's side: how often it went on to lose.
  const losers = rows.flatMap(r => r.burned.map(b => ({ b, r }))).filter(({ b, r }) => r.winner !== 'draw').map(({ b, r }) => r.winner !== b.side)
  // Wind at the first night, with a camp pitched and without.
  const nightWind = { with: [], without: [] }
  for (const r of rows) for (const w of r.rests) if (w.wind !== null) (w.rested ? nightWind.with : nightWind.without).push(w.wind)
  const mean = (xs) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) : null
  const hours = mean(rows.map(r => r.minutes / 60))
  return {
    battles: n,
    ended: rows.filter(r => r.decided).length,
    westWins: won.length ? Math.round(100 * red / won.length) : null,
    won: won.length,
    reasons,
    days,
    hours: hours === null ? null : Math.round(hours * 10) / 10,
    burnedBattles: pct(burned.length),
    burnedUndefended: `${burnedUndefended} of ${burnedAll}`,
    burnedSideLost: losers.length ? `${losers.filter(Boolean).length} of ${losers.length}` : '-',
    // Burned while its army still had steady men at least half the
    // enemy's: a blow mid-battle, not the end of one lost.
    burnedMidBattle: rows.flatMap(r => r.burned).filter(b => b.steady > 0 && b.steady * 2 >= b.against).length,
    burnedMidBattleLost: (() => { const m = rows.flatMap(r => r.burned.map(b => ({ b, r }))).filter(({ b }) => b.steady > 0 && b.steady * 2 >= b.against); return `${m.filter(({ b, r }) => r.winner !== b.side).length} of ${m.length}` })(),
    hoursFromBurnToEnd: Math.round(10 * (mean(rows.flatMap(r => r.burned.map(b => b.after / 6))) ?? 0)) / 10,
    assailedTicks: rows.reduce((s, r) => s + r.assailed, 0),
    struck: rows.reduce((s, r) => s + r.struck, 0),
    dropped: rows.reduce((s, r) => s + r.dropped, 0),
    neverPitched: rows.reduce((s, r) => s + r.neverPitched.length, 0),
    pitchedAtMinutes: Math.round(10 * mean(rows.flatMap(r => Object.values(r.pitchedAt).filter(t => t !== null)))),
    routs: rows.reduce((s, r) => s + r.routs, 0),
    rallied: rows.reduce((s, r) => s + r.rallied, 0),
    ralliedInCamp: rows.reduce((s, r) => s + r.ralliedInCamp, 0),
    fled: rows.reduce((s, r) => s + r.fled, 0),
    windAtNightWithCamp: nightWind.with.length ? Math.round(100 * mean(nightWind.with)) : null,
    windAtNightWithout: nightWind.without.length ? Math.round(100 * mean(nightWind.without)) : null,
    commanderTaken: rows.some(r => r.commander) ? pct(rows.filter(r => r.commander?.taken).length) : '-',
    commanderKilled: rows.some(r => r.commander) ? pct(rows.filter(r => r.commander?.killed).length) : '-',
    nightsWith: nightWind.with.length,
    nightsWithout: nightWind.without.length
  }
}

if (require.main === module) {
  const rows = league()
  const s = summary(rows)
  console.log(`camp battles on Greywater (${MODE}${CHARACTER ? `, west ${CHARACTER}` : ''}${AGAINST ? `, east ${AGAINST}` : ''}), CAMP ${JSON.stringify(T.CAMP)}`)
  for (const [k, v] of Object.entries(s)) console.log(`  ${k.padEnd(22)} ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  if (s.ended < s.battles) { console.log(`  ${s.battles - s.ended} NOT ENDED`); process.exitCode = 1 }
}

module.exports = { play, league, summary }
