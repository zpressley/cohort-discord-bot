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
//
// The rider counts are read from the battle's events (riderSent,
// riderBlocked); a build before them has none. Units cut off are counted
// with this tree's command/messengers.js, on whichever build is played.

const path = require('path')
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback }
const ROOT = path.resolve(arg('--root', path.join(__dirname, '..')))
const need = (p) => require(path.join(ROOT, p))

const { createGame, submitOrders } = need('engine/orchestrator')
const { planTurn } = need('opponent/planner')
const { loadScenario, mapChoices } = need('adapters/hotseat/scenarios')
const { fieldFactions, FACTIONS } = need('engine/army/factions')
const { leadUnit } = need('engine/command/company')
const { assignOfficers } = need('engine/command/roster')
const { riders } = require('../engine/command/messengers')

const MAX_PLAYER_TURNS = 150

function play(red, blue, { map, seed, policy }) {
  let spec = fieldFactions(loadScenario('meeting-battle', { map, deploy: true }), { red, blue })
  spec = { ...spec, units: assignOfficers(spec.units, seed) }
  const mine = spec.units.filter(u => u.side === 'red')
  const elite = mine[leadUnit(mine)].id
  spec = { ...spec, units: spec.units.map(u => u.side !== 'red' ? u : u.id === elite ? u : { ...u, officer: { headless: true } }) }
  const game = createGame({ ...spec, standingOrders: {}, commanders: { red: { unitId: elite } } }, { seed })
  const r = { orders: 0, cutOffUnits: new Set(), cutOffTurns: 0, unitTurns: 0 }
  let turns = 0
  while (!game.outcome.decided && turns < MAX_PLAYER_TURNS) {
    const battle = game.battle
    // Who is cut off as the turn opens, by this tree's rule.
    const road = riders(battle, 'red')
    if (road) {
      for (const u of battle.world.units.filter(u => u.side === 'red' && u.strength > 0)) {
        r.unitTurns++
        if (road.ticks(u) === Infinity) { r.cutOffTurns++; r.cutOffUnits.add(u.id) }
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
    submitOrders(game, 'blue', planTurn(game, 'blue'))
    turns++
  }
  const events = game.battle.log.all()
  return {
    decided: game.outcome.decided,
    winner: game.outcome.winner,
    turns,
    minutes: game.minutesElapsed,
    orders: r.orders,
    delays: events.filter(e => e.type === 'riderSent' && e.side === 'red').map(e => e.minutes),
    blocked: events.filter(e => e.type === 'riderBlocked' && e.side === 'red').length,
    cutOff: r.cutOffUnits.size,
    cutOffTurns: r.cutOffTurns,
    unitTurns: r.unitTurns
  }
}

function league({ battles = 336, policy = 'planner' } = {}) {
  const maps = mapChoices().map(m => m.id)
  const factions = Object.keys(FACTIONS)
  const pairs = []
  for (const a of factions) for (const b of factions) if (a !== b) for (const map of maps) pairs.push([a, b, map])
  const all = { battles: 0, stuck: 0, wins: 0, losses: 0, draws: 0, turns: 0, minutes: 0, orders: 0, delays: [], blocked: 0, battlesCutOff: 0, cutOffTurns: 0, unitTurns: 0 }
  for (let i = 0; i < battles; i++) {
    const [a, b, map] = pairs[i % pairs.length]
    const r = play(a, b, { map, seed: 1000 + i * 7919, policy })
    all.battles++
    if (!r.decided) { all.stuck++; continue }
    if (r.winner === 'red') all.wins++
    else if (r.winner === 'blue') all.losses++
    else all.draws++
    all.turns += r.turns
    all.minutes += r.minutes
    all.orders += r.orders
    all.delays.push(...r.delays)
    all.blocked += r.blocked
    if (r.cutOff > 0) all.battlesCutOff++
    all.cutOffTurns += r.cutOffTurns
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
  console.log(`a unit cut off at some turn's start in ${all.battlesCutOff} battles (${pct(all.battlesCutOff, done)}); ${pct(all.cutOffTurns, all.unitTurns)} of unit-turns cut off`)
}

module.exports = { play, league }
