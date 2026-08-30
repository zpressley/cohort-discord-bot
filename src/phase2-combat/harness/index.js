// src/phase2-combat/harness/index.js
// Public surface of the phase 2 harness.

const { runScenario, runMovementPhase, detectEngagements, applyCasualties, checkOutcome } = require('./runner')
const { createRng } = require('./rng')
const world = require('./world')
const { formatReport, formatSummary } = require('./report')

// Run one scenario across a range of seeds. This is the balance-tuning tool:
// a rule is only good if it holds up across many rolls, not one lucky run.
//
// Pass `combatResolverFactory` for any resolver that carries state between
// rounds — stamina, morale and rounds-in-contact all do, and none of them live
// in the world model, so the real phase 2 resolver keeps them in a closure.
// Reusing one instance across seeds would leak seed 1's battle into seed 2 and
// silently destroy the reproducibility the sweep exists to measure.
// `combatResolver` stays supported for stateless resolvers such as the
// placeholder.
function sweep(scenario, { combatResolver, combatResolverFactory, seeds = 20 } = {}) {
  const runs = []
  for (let seed = 1; seed <= seeds; seed++) {
    const resolver = combatResolverFactory ? combatResolverFactory() : combatResolver
    runs.push(runScenario(scenario, { combatResolver: resolver, seed }))
  }

  const tally = {}
  for (const run of runs) {
    const winner = run.outcome.winner ?? 'undecided'
    tally[winner] = (tally[winner] ?? 0) + 1
  }

  return { runs, tally }
}

module.exports = {
  runScenario,
  runMovementPhase,
  detectEngagements,
  applyCasualties,
  checkOutcome,
  sweep,
  createRng,
  formatReport,
  formatSummary,
  ...world
}
