// src/engine/movement/index.js
// Public surface of phase 3: simultaneous multi-unit movement.
//
// Builds on phase 1 (map, A*) and the phase 2 harness world. No combat — that
// is phase 4, where this resolver and the phase 2 combat engine meet.

const { resolveSimultaneousMovement, BLOCKED_TICKS_TO_STOP } = require('./simultaneous')
const { initiativeTier, tierName, inInitiativeOrder, TIERS } = require('./initiative')
const {
  buildOccupancy, unitsAt, getUnitAt, isOccupied, canEnter, moveUnit,
  crowdingTier, crowdingByUnit, crowdedRange
} = require('./occupancy')
const { resolveUnitReference, expandOrders } = require('./unitResolver')

module.exports = {
  resolveSimultaneousMovement,
  BLOCKED_TICKS_TO_STOP,
  initiativeTier,
  tierName,
  inInitiativeOrder,
  TIERS,
  buildOccupancy,
  getUnitAt,
  isOccupied,
  canEnter,
  moveUnit,
  unitsAt,
  crowdingTier,
  crowdingByUnit,
  crowdedRange,
  resolveUnitReference,
  expandOrders
}
