// src/phase2-combat/scenarios/index.js
// Fixed scenarios. Each one isolates a single question the combat engine has
// to answer, so a change in the numbers shows up somewhere specific.

const bridgeStandoff = require('./bridge-standoff')
const fordCrossing = require('./ford-crossing')
const hillAssault = require('./hill-assault')

const SCENARIOS = {
  'bridge-standoff': bridgeStandoff,
  'ford-crossing': fordCrossing,
  'hill-assault': hillAssault
}

function getScenario(name) {
  const scenario = SCENARIOS[name]
  if (!scenario) {
    throw new Error(`Unknown scenario "${name}". Available: ${Object.keys(SCENARIOS).join(', ')}`)
  }
  return scenario
}

module.exports = { SCENARIOS, getScenario, bridgeStandoff, fordCrossing, hillAssault }
