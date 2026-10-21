// src/harness/officer-fates.js
//
// Check officer fate rates against real battles: run many games, measure
// how many men each elite lost and what befell it, and report the chance
// that a battle costs the roster an officer killed, captured or wounded.
// Ruling Q3 targets about 1 in 10 battles won and 1 in 5 lost for deaths.
//
//   npm run officers                    legions-vs-celts, 200 seeds
//   npm run officers -- --seeds 500

const { runBattle } = require('../engine/battle/battle')
const { fateChances, exposureFromEvents } = require('../engine/veterans')
const { loadScenario } = require('../adapters/hotseat/scenarios')

const seedsArg = process.argv.indexOf('--seeds')
const seeds = seedsArg > -1 ? Number(process.argv[seedsArg + 1]) : 200
const spec = { ...loadScenario('legions-vs-celts'), maxTurns: 40 }
const elites = spec.units.filter(u => u.quality === 'elite')

const tally = { victory: [], defeat: [], draw: [] }
for (let seed = 1; seed <= seeds; seed++) {
  const battle = runBattle(spec, { seed })
  for (const elite of elites) {
    const end = battle.turns.at(-1).snapshot.units.find(u => u.id === elite.id) ??
      battle.fled.find(u => u.id === elite.id)
    const losses = 1 - (end?.strength ?? 0) / elite.strength
    const result = battle.outcome.winner === 'draw' ? 'draw'
      : battle.outcome.winner === elite.side ? 'victory' : 'defeat'
    tally[result].push(fateChances({ result, losses, exposure: exposureFromEvents(battle.events, elite.id) }))
  }
}

const pct = (x) => `${(100 * x).toFixed(1)}%`.padStart(6)
console.log(`officer fates over ${seeds} legions-vs-celts battles (per battle, whole roster)`)
console.log('result    battles  killed  captured  wounded')
for (const [result, rows] of Object.entries(tally)) {
  if (rows.length === 0) continue
  const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length
  console.log(`${result.padEnd(9)} ${String(rows.length).padStart(7)}  ${pct(mean('kill'))}  ${pct(mean('capture'))}    ${pct(mean('wound'))}`)
}
