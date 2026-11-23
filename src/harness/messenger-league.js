// src/harness/messenger-league.js
//
// Orders and news by rider (docs/design/point-of-view-and-messengers.md):
// how long orders take in practice, how many cannot be sent, how often a
// unit is cut off, and what it does to who wins. Faction armies on every
// map, as in faction-league.js, each battle with a seed of its own.
//
// Red is the player, with his Commander on the field riding with his elite
// unit (officers as a new Commander has them: a veteran with the elite, no
// one on the rest). He plays one of two ways:
//   --policy planner   he plans as the computer does (opponent/planner.js),
//                      from what his side has seen: the nearest thing to a
//                      thinking player the harness has
//   --policy planner-word   the same, but planning from what has reached
//                      his Commander of the enemy (news by rider)
//   --policy charge    he sends everyone in, every turn
// Blue is the computer, with no Commander on the field, as in the app.
//
//   node src/harness/messenger-league.js --battles 336 --policy planner
//   node src/harness/messenger-league.js --root /path/to/an/older/src ...
//   --computer instant   blue's orders at once (as before step 3), not by rider
//
// The rider counts are read from the battle's events (riderSent,
// riderBlocked); a build before them has none. Units cut off are counted
// with this tree's command/messengers.js, on whichever build is played.

const path = require('path')
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback }
const ROOT = path.resolve(arg('--root', path.join(__dirname, '..')))
const need = (p) => require(path.join(ROOT, p))

const { createGame, submitOrders, waitingOn } = need('engine/orchestrator')
const { planTurn } = need('opponent/planner')
const { loadScenario, mapChoices } = need('adapters/hotseat/scenarios')
const { fieldFactions, FACTIONS } = need('engine/army/factions')
const { leadUnit } = need('engine/command/company')
const { assignOfficers } = need('engine/command/roster')
const { riders } = require('../engine/command/messengers')
let byCommandPost = null
try { ({ byCommandPost } = need('engine/command/messengers')) } catch { /* a build before riders */ }
const COMPUTER = arg('--computer', 'rider')

const MAX_PLAYER_TURNS = 150

function play(red, blue, { map, seed, policy }) {
  let spec = fieldFactions(loadScenario('meeting-battle', { map, deploy: true }), { red, blue })
  spec = { ...spec, units: assignOfficers(spec.units, seed) }
  const mine = spec.units.filter(u => u.side === 'red')
  const elite = mine[leadUnit(mine)].id
  spec = { ...spec, units: spec.units.map(u => u.side !== 'red' ? u : u.id === elite ? u : { ...u, officer: { headless: true } }) }
  const game = createGame({ ...spec, standingOrders: {}, commanders: { red: { unitId: elite } } }, { seed })
  const r = { orders: 0, cutOffUnits: new Set(), cutOffTurns: 0, unitTurns: 0, noWord: 0, noWordCut: 0, noWordGone: 0 }
  let turns = 0
  let stops = 0
  // Each side gives orders only when the battle stops for it (the riders
  // rulings); a build before them asks both every turn. `turns` counts
  // red's own turns.
  const wanted = (side) => (waitingOn ? waitingOn(game).includes(side) : true)
  while (!game.outcome.decided && turns < MAX_PLAYER_TURNS && stops < 4 * MAX_PLAYER_TURNS) {
    stops++
    const battle = game.battle
    if (!wanted('red')) {
      const blueOrders = planTurn(game, 'blue')
      submitOrders(game, 'blue', COMPUTER === 'rider' && byCommandPost ? byCommandPost(blueOrders) : blueOrders)
      continue
    }
    // Who is cut off as the turn opens, by this tree's rule.
    const road = riders(battle, 'red')
    if (road) {
      for (const u of battle.world.units.filter(u => u.side === 'red' && u.strength > 0)) {
        r.unitTurns++
        if (road.ticks(u) === Infinity) { r.cutOffTurns++; r.cutOffUnits.add(u.id) }
      }
      // Units he has noticed no word of (the riders rulings): truly cut
      // off, gone from the field, or only late.
      for (const [id, k] of Object.entries(game.word?.red?.units ?? {})) {
        if (!k.overdue || k.gone) continue
        r.noWord++
        const u = battle.world.units.find(x => x.id === id && x.strength > 0)
        if (!u) r.noWordGone++
        else if (road.ticks(u) === Infinity) r.noWordCut++
      }
    }
    // planner-word: the planner, told of the enemy only what has reached
    // his Commander (game.word, from step 2 on); its own units it still
    // reads as they stand, so it is kinder than a player's lot.
    const knowing = policy === 'planner-word' && game.word?.red
      ? { ...game, intel: { ...game.intel, red: { known: game.word.red.enemies } } }
      : game
    const orders = policy === 'charge'
      ? battle.world.units.filter(u => u.side === 'red' && u.strength > 0 && !battle.broken.has(u.id)).map(u => ({ unitRef: u.id, action: 'advance' }))
      : planTurn(knowing, 'red')
    if (battle.commanders.red.status === 'free') r.orders += orders.filter(o => !o.ride).length
    submitOrders(game, 'red', orders)
    // Blue's orders by rider from its best unit, as in the app (step 3);
    // --computer instant for its orders at once, as before.
    turns++
    if (game.outcome.decided || !wanted('blue')) continue
    const blueOrders = planTurn(game, 'blue')
    submitOrders(game, 'blue', COMPUTER === 'rider' && byCommandPost ? byCommandPost(blueOrders) : blueOrders)
  }
  const events = game.battle.log.all()
  return {
    decided: game.outcome.decided,
    winner: game.outcome.winner,
    turns,
    stops: game.history.length,
    // How long he waited each time before he was asked again (minutes),
    // and why he was.
    ...waitsOf(game),
    minutes: game.minutesElapsed,
    orders: r.orders,
    delays: events.filter(e => e.type === 'riderSent' && e.side === 'red').map(e => e.minutes),
    blocked: events.filter(e => e.type === 'riderBlocked' && e.side === 'red').length,
    blueDelays: events.filter(e => e.type === 'riderSent' && e.side === 'blue').map(e => e.minutes),
    blueBlocked: events.filter(e => e.type === 'riderBlocked' && e.side === 'blue').length,
    cutOff: r.cutOffUnits.size,
    cutOffTurns: r.cutOffTurns,
    noWord: r.noWord,
    noWordCut: r.noWordCut,
    noWordGone: r.noWordGone,
    unitTurns: r.unitTurns
  }
}

// The time between the stops that asked red (every stop, in a build before
// the riders rulings), and why each asked him.
function waitsOf(game) {
  let wait = 0
  const waits = []
  const why = []
  for (const h of game.history) {
    wait += h.ticks.length
    if (!h.wanted || h.wanted.red) { waits.push(wait * 10); why.push(h.wanted?.red ?? h.interrupt); wait = 0 }
  }
  return { waits, why }
}

function league({ battles = 336, policy = 'planner' } = {}) {
  const maps = mapChoices().map(m => m.id)
  const factions = Object.keys(FACTIONS)
  const pairs = []
  for (const a of factions) for (const b of factions) if (a !== b) for (const map of maps) pairs.push([a, b, map])
  const all = { noWord: 0, noWordCut: 0, noWordGone: 0, stops: 0, waits: [], why: {}, battles: 0, stuck: 0, wins: 0, losses: 0, draws: 0, turns: 0, minutes: 0, orders: 0, delays: [], blocked: 0, blueDelays: [], blueBlocked: 0, battlesCutOff: 0, cutOffTurns: 0, unitTurns: 0 }
  for (let i = 0; i < battles; i++) {
    const [a, b, map] = pairs[i % pairs.length]
    const r = play(a, b, { map, seed: 1000 + i * 7919, policy })
    all.battles++
    if (!r.decided) { all.stuck++; continue }
    if (r.winner === 'red') all.wins++
    else if (r.winner === 'blue') all.losses++
    else all.draws++
    all.turns += r.turns
    all.stops += r.stops
    all.waits.push(...r.waits)
    for (const w of r.why) all.why[w] = (all.why[w] ?? 0) + 1
    all.minutes += r.minutes
    all.orders += r.orders
    all.delays.push(...r.delays)
    all.blocked += r.blocked
    all.blueDelays.push(...r.blueDelays)
    all.blueBlocked += r.blueBlocked
    if (r.cutOff > 0) all.battlesCutOff++
    all.cutOffTurns += r.cutOffTurns
    all.noWord += r.noWord
    all.noWordCut += r.noWordCut
    all.noWordGone += r.noWordGone
    all.unitTurns += r.unitTurns
  }
  return all
}

if (require.main === module) {
  const battles = Number(arg('--battles', 336))
  const policy = arg('--policy', 'planner')
  const started = Date.now()
  const all = league({ battles, policy })
  const pct = (n, d) => `${Math.round(100 * n / Math.max(1, d))}%`
  const done = all.battles - all.stuck
  console.log(`${all.battles} battles (${ROOT}), red ${policy}; ${all.stuck} did not end; ${((Date.now() - started) / 1000).toFixed(0)} s`)
  console.log(`red won ${all.wins} (${pct(all.wins, done)}), lost ${all.losses} (${pct(all.losses, done)}), drew ${all.draws}; ` +
    `${(all.turns / Math.max(1, done)).toFixed(1)} player turns, ${Math.round(all.minutes / Math.max(1, done))} battle minutes on average`)
  const w = [...all.waits].sort((x, y) => x - y)
  const wq = (q) => w[Math.min(w.length - 1, Math.floor(q * w.length))] ?? 0
  console.log(`${(all.stops / Math.max(1, done)).toFixed(1)} stops of the battle (for either side); red waited between his turns: median ${wq(0.5)} min, 90% ${wq(0.9)}, longest ${w.at(-1) ?? 0}; over an hour ${pct(w.filter(x => x > 60).length, w.length)}`)
  console.log(`why red was asked: ${Object.entries(all.why).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n, w.length)}`).join(', ')}`)
  const d = [...all.delays].sort((x, y) => x - y)
  const at = (q) => d.length ? d[Math.min(d.length - 1, Math.floor(q * d.length))] : 0
  const atOnce = all.orders - d.length - all.blocked
  console.log(`orders to units: ${all.orders}; at once ${atOnce} (${pct(atOnce, all.orders)}), by rider ${d.length} (${pct(d.length, all.orders)}), not sent ${all.blocked} (${pct(all.blocked, all.orders)})`)
  if (d.length) {
    const spread = {}
    for (const m of d) spread[m] = (spread[m] ?? 0) + 1
    console.log(`by rider, minutes: median ${at(0.5)}, quarter ${at(0.25)} to ${at(0.75)}, longest ${d.at(-1)}; ` +
      Object.entries(spread).map(([m, n]) => `${m}: ${n}`).join(', '))
  }
  if (all.blueDelays.length || all.blueBlocked) {
    const b = [...all.blueDelays].sort((x, y) => x - y)
    console.log(`the computer's orders by rider: ${b.length}, median ${b[Math.floor(b.length / 2)] ?? 0} min, longest ${b.at(-1) ?? 0}; not sent ${all.blueBlocked}`)
  }
  console.log(`a unit cut off at some turn's start in ${all.battlesCutOff} battles (${pct(all.battlesCutOff, done)}); ${pct(all.cutOffTurns, all.unitTurns)} of unit-turns cut off`)
  if (all.noWord) console.log(`units marked "no word" as red is asked: ${all.noWord} (${pct(all.noWord, all.unitTurns)} of unit-turns); of those truly cut off ${pct(all.noWordCut, all.noWord)}, gone from the field ${pct(all.noWordGone, all.noWord)}, only late ${pct(all.noWord - all.noWordCut - all.noWordGone, all.noWord)}`)
}

module.exports = { play, league }
