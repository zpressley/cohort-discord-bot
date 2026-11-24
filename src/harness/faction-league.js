// src/harness/faction-league.js
//
// Every faction's army against every other, both sides played by the
// computer (opponent/planner.js), on every map: who wins, how long it
// takes, and how often a Commander riding with his elite unit is taken or
// killed. Each side has a Commander on the field, with its elite unit, as a
// player in the web app has.
//
//   node src/harness/faction-league.js               20 seeds, every map
//   node src/harness/faction-league.js --seeds 5 --maps crownhill,ashford
//   node src/harness/faction-league.js --factions rome,han,celts
//
// With twenty factions there are 190 pairings: every map at 20 seeds is
// 30,400 battles. Ten seeds on two maps (7,600) takes about a quarter of
// an hour.

const { createGame, submitOrders, commanderOf } = require('../engine/orchestrator')
const { planTurn } = require('../opponent/planner')
const { loadScenario, mapChoices } = require('../adapters/hotseat/scenarios')
const { fieldFactions, FACTIONS } = require('../engine/army/factions')
const { leadUnit } = require('../engine/command/company')

const MAX_PLAYER_TURNS = 150

/** One battle: red's faction against blue's, the computer on both sides. */
function playFactions(red, blue, { map = 'crownhill', seed = 1, scenario = 'meeting-battle' } = {}) {
  const spec = fieldFactions(loadScenario(scenario, { map, deploy: true }), { red, blue })
  const riding = (side) => {
    const mine = spec.units.filter(u => u.side === side)
    return { unitId: mine[leadUnit(mine)].id }
  }
  const commanders = { red: riding('red'), blue: riding('blue') }
  const game = createGame({ ...spec, standingOrders: {}, commanders }, { seed })
  let turns = 0
  while (!game.outcome.decided && turns < MAX_PLAYER_TURNS) {
    const r = planTurn(game, 'red')
    const b = planTurn(game, 'blue')
    submitOrders(game, 'red', r)
    submitOrders(game, 'blue', b)
    turns++
  }
  const fate = (side) => commanderOf(game, side)?.fate ?? null
  const elite = (side) => spec.units.find(u => u.id === commanders[side].unitId)
  return {
    decided: game.outcome.decided,
    winner: game.outcome.winner ?? null,
    reason: game.outcome.reason ?? null,
    turns,
    minutes: game.minutesElapsed,
    fates: { red: fate('red'), blue: fate('blue') },
    // The Commander ever in enemy hands, from the battle's own record.
    taken: {
      red: game.battle.log.all().some(e => e.type === 'commanderTaken' && e.side === 'red'),
      blue: game.battle.log.all().some(e => e.type === 'commanderTaken' && e.side === 'blue')
    },
    ridesWithElite: elite('red').quality === 'elite' && elite('blue').quality === 'elite'
  }
}

function league({ seeds = 20, maps = mapChoices({ big: false }).map(m => m.id), factions = Object.keys(FACTIONS) } = {}) {
  const pairs = {}
  // Each faction's own record, over all its battles.
  const record = Object.fromEntries(factions.map(f => [f, { battles: 0, wins: 0, losses: 0, draws: 0 }]))
  const all = { battles: 0, stuck: [], turns: 0, minutes: 0, commanders: 0, taken: 0, killed: 0, notWithElite: 0 }
  for (const a of factions) for (const b of factions) {
    if (a === b) continue
    // Each pair fought both ways round, so neither side's ground favours one.
    const key = [a, b].sort().join(' v ')
    const p = pairs[key] ?? (pairs[key] = { a: [a, b].sort()[0], b: [a, b].sort()[1], wins: {}, draws: 0, battles: 0, turns: 0 })
    for (const map of maps) for (let seed = 1; seed <= seeds; seed++) {
      const r = playFactions(a, b, { map, seed })
      all.battles++
      p.battles++
      if (!r.decided) { all.stuck.push(`${a} v ${b} on ${map}, seed ${seed}`); continue }
      all.turns += r.turns
      all.minutes += r.minutes
      p.turns += r.turns
      const winner = r.winner === 'red' ? a : r.winner === 'blue' ? b : null
      if (winner) p.wins[winner] = (p.wins[winner] ?? 0) + 1
      else p.draws++
      for (const f of [a, b]) {
        record[f].battles++
        if (!winner) record[f].draws++
        else if (winner === f) record[f].wins++
        else record[f].losses++
      }
      if (!r.ridesWithElite) all.notWithElite++
      for (const side of ['red', 'blue']) {
        all.commanders++
        if (r.taken[side]) all.taken++
        if (r.fates[side] === 'killed') all.killed++
      }
    }
  }
  return { pairs, record, all }
}

if (require.main === module) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null }
  const seeds = Number(arg('--seeds') ?? 20)
  const maps = arg('--maps') ? arg('--maps').split(',') : mapChoices({ big: false }).map(m => m.id)
  const factions = arg('--factions') ? arg('--factions').split(',') : Object.keys(FACTIONS)
  const { pairs, record, all } = league({ seeds, maps, factions })
  const pct = (n, d) => `${Math.round(100 * n / Math.max(1, d))}%`
  console.log(`${all.battles} battles: ${factions.length} factions, ${seeds} seeds, each pair both ways round, on ${maps.join(', ')}\n`)
  // Each faction over all its battles; a faction that wins or loses more
  // than 65% of them is marked.
  console.log('| Faction | Won | Lost | Drawn |')
  console.log('|---|---|---|---|')
  for (const [f, r] of Object.entries(record).sort((x, y) => y[1].wins / y[1].battles - x[1].wins / x[1].battles)) {
    const mark = r.wins / r.battles > 0.65 || r.losses / r.battles > 0.65 ? ' **(over 65%)**' : ''
    console.log(`| ${FACTIONS[f].title}${mark} | ${pct(r.wins, r.battles)} | ${pct(r.losses, r.battles)} | ${pct(r.draws, r.battles)} |`)
  }
  // The pairings, worst first; with many factions only those past 75/25.
  const worst = (p) => Math.max(p.wins[p.a] ?? 0, p.wins[p.b] ?? 0) / Math.max(1, p.battles)
  const listed = Object.values(pairs).sort((x, y) => worst(y) - worst(x))
    .filter(p => factions.length <= 6 || worst(p) > 0.75)
  console.log(`\n${listed.length === Object.keys(pairs).length ? 'Every pairing' : `Pairings worse than 75/25: ${listed.length} of ${Object.keys(pairs).length}`}\n`)
  console.log('| Pairing | Wins | Draws | Player turns |')
  console.log('|---|---|---|---|')
  for (const p of listed) {
    const wa = p.wins[p.a] ?? 0
    const wb = p.wins[p.b] ?? 0
    const lopsided = Math.max(wa, wb) / Math.max(1, p.battles) > 0.75 ? ' **(over 75/25)**' : ''
    console.log(`| ${FACTIONS[p.a].title} v ${FACTIONS[p.b].title} | ${FACTIONS[p.a].title} ${pct(wa, p.battles)}, ${FACTIONS[p.b].title} ${pct(wb, p.battles)}${lopsided} | ${pct(p.draws, p.battles)} | ${(p.turns / Math.max(1, p.battles)).toFixed(1)} |`)
  }
  const done = all.battles - all.stuck.length
  console.log(`\nEnded: ${done} of ${all.battles}. Average ${(all.turns / Math.max(1, done)).toFixed(1)} player turns, ${Math.round(all.minutes / Math.max(1, done))} battle minutes.`)
  console.log(`Commanders on the field: ${all.commanders}; taken in ${all.taken}${all.taken ? ` (1 in ${(all.commanders / all.taken).toFixed(0)})` : ''}, killed in ${all.killed}${all.killed ? ` (1 in ${(all.commanders / all.killed).toFixed(0)})` : ''}.`)
  if (all.notWithElite) console.log(`  ${all.notWithElite} battles where a Commander did not ride with the elite`)
  for (const s of all.stuck.slice(0, 10)) console.log(`  stuck: ${s}`)
  if (all.stuck.length) process.exitCode = 1
}

module.exports = { playFactions, league }
