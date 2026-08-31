// src/phase5-orchestration/index.js
// Public surface of phase 5: the two-player game loop.
//
// The Discord adapter (phase 7) sits on exactly this surface and nothing
// deeper: createGame / submitOrders / forceProcess / sideView.

const { createGame, submitOrders, forceProcess, sideView, MAX_TICKS_PER_TURN, MINUTES_PER_TICK } =
  require('./orchestrator')
const { VISION, visionRange, createIntel, updateIntel } = require('./fogOfWar')
const { evaluateVictory, objectiveController, COLLAPSE_FRACTION, OBJECTIVE_TURNS_TO_WIN } =
  require('./victory')

module.exports = {
  createGame,
  submitOrders,
  forceProcess,
  sideView,
  MAX_TICKS_PER_TURN,
  MINUTES_PER_TICK,
  VISION,
  visionRange,
  createIntel,
  updateIntel,
  evaluateVictory,
  objectiveController,
  COLLAPSE_FRACTION,
  OBJECTIVE_TURNS_TO_WIN
}
