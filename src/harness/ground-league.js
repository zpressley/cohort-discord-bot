// src/harness/ground-league.js
//
// Each map's ground to fight for (src/data/maps, `ground`): how many
// battles it decides, how long they run, and whether where it lies favours
// one side of the field. Faction armies on every map, a day of twelve
// hours (night ends a battle with no winner), each battle a seed of its own.
//
//   --mode mirror   (default) the same faction on both sides, both played by
//                   the computer (opponent/planner.js), no Commander on the
//                   field: the only difference between west and east is the
//                   map, so wins by side say whether the ground is fair
//   --mode app      as the app plays it: red (west) a Commander on the field
//                   riding with his best unit, his orders by rider, played
//                   as the computer plays; blue the computer
//   --mode idle     red gives no orders at all: does the computer take the
//                   ground from a player who will not come out?
//   --none          no ground at all (the battle as before), to compare
//   --ground map=Feature[:reach]+...   other ground to try on a map, e.g.
//                   --ground "thornwood=Brook Ford:1", or a box of open
//                   tiles: "ravenridge=Raven Gap@20-22;19-21"; several
//                   maps joined by ",map:"
//   --rounds N      battles per faction per map (default 2)
//   --map name      one map only
//
//   node src/harness/ground-league.js --mode mirror --rounds 2

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback }
const { createGame, submitOrders, waitingOn } = require('../engine/orchestrator')
const { planTurn } = require('../opponent/planner')
const { loadScenario, mapChoices } = require('../adapters/hotseat/scenarios')
const { fieldFactions, FACTIONS } = require('../engine/army/factions')
const { withSecondLine } = require('../engine/army/secondLine')
const { leadUnit } = require('../engine/command/company')
const { byCommandPost } = require('../engine/command/messengers')
const { groundOf } = require('../data/maps')
const T = require('../engine/combat/tables')

const MODE = arg('--mode', 'mirror')
const ROUNDS = Number(arg('--rounds', 2))
const NONE = process.argv.includes('--none')
// map=Name[:reach][@x0-x1,y0-y1]+Name...: a feature by name, or the open
// tiles of a box (water left out) called by that name.
const { resolveMap } = require('../engine/map/map')
const OTHER = Object.fromEntries(String(arg('--ground', '')).split(',map:').filter(Boolean).map(s => {
  const [map, rest] = s.split('=')
  return [map, rest.split('+').map((one, i) => {
    const [head, box] = one.split('@')
    const [name, reach] = head.split(':')
    const base = { id: `ground-${i + 1}`, name, ...(reach ? { reach: Number(reach) } : {}) }
    if (!box) return { ...base, feature: name }
    const [[x0, x1], [y0, y1]] = box.split(';').map(r => r.split('-').map(Number))
    const m = resolveMap(map)
    const tiles = []
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (m.terrainAt({ x, y }) !== 'river') tiles.push({ x, y })
    return { ...base, tiles }
  })]
}))
const MAX_STOPS = 600

function play(map, red, blue, seed) {
  let spec = withSecondLine(fieldFactions(loadScenario('meeting-battle', { map, deploy: true }), { red, blue }), { red, blue })
  const objectives = NONE ? [] : OTHER[map] ?? groundOf(map)
  spec = { ...spec, standingOrders: {}, dayMinutes: T.DAY.MINUTES, ...(objectives.length ? { objectives } : {}) }
  if (MODE !== 'mirror') {
    const mine = spec.units.filter(u => u.side === 'red')
    spec = { ...spec, commanders: { red: { unitId: mine[leadUnit(mine)].id } } }
  }
  const game = createGame(spec, { seed })
  const wanted = (side) => waitingOn(game).includes(side)
  let stops = 0
  while (!game.outcome.decided && stops < MAX_STOPS) {
    stops++
    for (const side of ['red', 'blue']) {
      if (game.outcome.decided || !wanted(side)) continue
      let orders
      if (side === 'blue') orders = MODE === 'mirror' ? planTurn(game, 'blue') : byCommandPost(planTurn(game, 'blue'))
      else orders = MODE === 'idle' ? [] : planTurn(game, 'red')
      submitOrders(game, side, orders)
    }
  }
  const o = game.outcome
  // Who held the ground first, and when.
  const first = game.battle.log.ofType('objective').find(e => e.side && !e.close)
  return { decided: o.decided, winner: o.winner, reason: o.reason, minutes: game.minutesElapsed, first: first?.side ?? null, firstAt: first ? first.turn * 10 : null }
}

const keys = Object.keys(FACTIONS)
const rows = []
const ONLY = arg('--map', null)
for (const { id: map } of mapChoices({ big: Boolean(ONLY) }).filter(m => !ONLY || m.id === ONLY)) {
  const r = { map, red: 0, blue: 0, night: 0, draw: 0, byGround: 0, minutes: 0, n: 0, reasons: {}, stuck: 0, first: { red: 0, blue: 0 }, firstWon: 0, firstAt: 0 }
  keys.forEach((red, i) => {
    for (let round = 0; round < ROUNDS; round++) {
      const blue = MODE === 'mirror' ? red : keys[(i + 1 + round * 7) % keys.length]
      const seed = 1 + i + keys.length * round
      const out = play(map, red, blue, seed)
      r.n++
      if (!out.decided) { r.stuck++; continue }
      r.minutes += out.minutes
      if (out.first) { r.first[out.first]++; r.firstAt += out.firstAt; if (out.winner === out.first) r.firstWon++ }
      const why = out.reason === 'night fell' || out.winner === 'draw' ? out.reason : `${out.reason} (${out.winner === 'red' ? 'west' : 'east'})`
      r.reasons[why] = (r.reasons[why] ?? 0) + 1
      if (out.reason === 'objectives held') r.byGround++
      if (out.reason === 'night fell') r.night++
      else if (out.winner === 'draw') r.draw++
      else r[out.winner]++
    }
  })
  rows.push(r)
  const won = r.red + r.blue
  console.log(`${map.padEnd(11)} ${String(r.n).padStart(3)} battles: west ${r.red}, east ${r.blue}` +
    (won ? ` (west ${Math.round(100 * r.red / won)}%)` : '') +
    `, night ${r.night}, drawn ${r.draw}; by the ground ${r.byGround}; ${Math.round(r.minutes / Math.max(1, r.n - r.stuck))} min on average` +
    (r.stuck ? `; ${r.stuck} NOT ENDED` : ''))
  const firsts = r.first.red + r.first.blue
  if (firsts) console.log(`            held first: west ${r.first.red}, east ${r.first.blue}, at ${Math.round(r.firstAt / firsts)} min on average; the side that held it first won ${r.firstWon}`)
  console.log(`            ${Object.entries(r.reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`)
}
const all = rows.reduce((a, r) => ({ n: a.n + r.n, g: a.g + r.byGround, m: a.m + r.minutes, night: a.night + r.night }), { n: 0, g: 0, m: 0, night: 0 })
console.log(`all: ${all.n} battles (${MODE}${NONE ? ', no ground' : ''}); by the ground ${all.g} (${Math.round(100 * all.g / all.n)}%), night ${all.night}, ${Math.round(all.m / all.n)} min on average`)
if (rows.some(r => r.stuck)) process.exitCode = 1
