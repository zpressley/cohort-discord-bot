// src/phase2-combat/harness/index.js
// Public surface of the phase 2 harness.

const { runScenario, runMovementPhase, detectEngagements, applyCasualties, checkOutcome } = require('./runner')
const { createRng } = require('./rng')
const world = require('./world')
const { formatReport, formatSummary } = require('./report')

// Run one scenario across a range of seeds. This is the balance-tuning tool:
// a rule is only good if it holds up across many rolls, not one lucky run.
function sweep(scenario, { combatResolver, seeds = 20 } = {}) {
  const runs = []
  for (let seed = 1; seed <= seeds; seed++) {
    runs.push(runScenario(scenario, { combatResolver, seed }))
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
