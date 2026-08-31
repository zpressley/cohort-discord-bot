// src/phase3-movement/simultaneous.js
//
// Simultaneous multi-unit movement resolution — the heart of phase 3.
//
// The phase 2 harness resolved movement unit-by-unit: each unit walked its
// whole path before the next unit moved at all. That is fine for two units and
// wrong for twelve — a slow unit that happens to sort first walks through
// ground a fast unit should have claimed, and a column can never follow its
// own vanguard through a gap, because the vanguard finishes its entire move
// while the follower has not started.
//
// This resolver interleaves instead. Every unit plans its full path up front
// (A* over terrain, ignoring units — intent is where you MEAN to go), then
// movement resolves in ticks: one tile step per unit per tick, taken in
// initiative order (scouts -> siege, see initiative.js). Occupancy is queried
// live at each step, so:
//
//   - Two units racing for one tile: the higher-initiative unit takes it on
//     its step; the other finds it occupied and waits.
//   - A column: the lead unit vacates a tile early in the tick, the follower
//     enters it later in the same tick. Friendly pass-through falls out of the
//     model with no special rule.
//   - Head-on units trying to swap tiles: each finds the other's tile occupied
//     and neither moves. They stand facing each other, which is what two
//     hundred-man bodies meeting head-on do — resolving it is combat (phase 4).
//   - No path replanning around a blocker. A blocked unit waits, and if it is
//     still blocked next tick it stops for the turn. Flowing around a friend
//     mid-order is a command the player did not give; the report says who
//     blocked whom, and the player can reroute next turn. (Flagged as a
//     possible later refinement — autonomy AI territory, Phase 8.)
//
// The resolver mutates unit positions (like the phase 2 movement phase) but
// draws no randomness — movement is fully deterministic, chaos stays combat's
// single RNG channel.

const { getCell, MOVEMENT_COSTS } = require('../phase1-movement/mapData')
const { findPath } = require('../phase1-movement/movementEngine')
const { inInitiativeOrder, tierName } = require('./initiative')
const { buildOccupancy, canEnter, moveUnit } = require('./occupancy')
const { getUnit, isAlive } = require('../phase2-combat/harness/world')

// A unit blocked this many ticks in a row gives up for the turn.
const BLOCKED_TICKS_TO_STOP = 2

/**
 * Resolve one turn of simultaneous movement.
 *
 * @param {Object} world   phase 2 harness world (mutated: unit positions)
 * @param {Array}  orders  [{ unitId, target }] — target is a coord or 'hold'
 * @returns {Array} per-unit movement results, sorted by unit id
 */
function resolveSimultaneousMovement(world, orders) {
  const occupancy = buildOccupancy(world)
  const plans = new Map()
  const results = new Map()

  // ── Plan ────────────────────────────────────────────
  for (const order of orders) {
    const unit = getUnit(world, order.unitId)

    if (!unit) {
      results.set(order.unitId, { unitId: order.unitId, skipped: 'no such unit' })
      continue
    }
    if (!isAlive(unit)) {
      results.set(unit.id, { unitId: unit.id, skipped: 'destroyed' })
      continue
    }
    if (!order.target || order.target === 'hold') {
      results.set(unit.id, { unitId: unit.id, held: true, position: unit.position })
      continue
    }
    if (order.target === unit.position) {
      results.set(unit.id, { unitId: unit.id, failed: 'already there', position: unit.position })
      continue
    }

    const path = findPath(unit.position, order.target)
    if (!path) {
      results.set(unit.id, { unitId: unit.id, failed: 'no path', position: unit.position })
      continue
    }

    plans.set(unit.id, {
      unit,
      target: order.target,
      steps: path.slice(1),            // path[0] is where the unit stands
      stepIndex: 0,
      budget: unit.movementRange,
      from: unit.position,
      tilesTraversed: [],
      blockedTicks: 0,
      blockedBy: null,
      stopped: false
    })
  }

  // ── Tick loop ───────────────────────────────────────
  // Initiative order is computed once per turn, not per tick: a unit's speed
  // class does not change mid-move.
  const moveOrder = inInitiativeOrder([...plans.values()].map(p => p.unit))

  let anyoneMoving = true
  while (anyoneMoving) {
    anyoneMoving = false

    for (const unit of moveOrder) {
      const plan = plans.get(unit.id)
      if (!plan || plan.stopped) continue
      if (plan.stepIndex >= plan.steps.length) continue

      const nextCoord = plan.steps[plan.stepIndex]
      const terrain = getCell(nextCoord).terrain
      const cost = MOVEMENT_COSTS[terrain] ?? 1.0

      if (plan.budget < cost) {
        plan.stopped = true
        continue
      }

      const entry = canEnter(occupancy, unit, nextCoord)
      if (!entry.ok) {
        plan.blockedTicks += 1
        plan.blockedBy = entry.blocker
        if (entry.reason === 'enemy' || plan.blockedTicks >= BLOCKED_TICKS_TO_STOP) {
          // An enemy never moves aside for you; a friend gets one tick to.
          plan.stopped = true
        } else {
          anyoneMoving = true // still hoping the tile clears
        }
        continue
      }

      moveUnit(occupancy, unit, nextCoord)
      plan.budget = Math.round((plan.budget - cost) * 100) / 100
      plan.stepIndex += 1
      plan.tilesTraversed.push({ coord: nextCoord, terrain })
      plan.blockedTicks = 0
      plan.blockedBy = null
      anyoneMoving = true
    }
  }

  // ── Report ──────────────────────────────────────────
  for (const plan of plans.values()) {
    results.set(plan.unit.id, {
      unitId: plan.unit.id,
      tier: tierName(plan.unit),
      from: plan.from,
      to: plan.unit.position,
      target: plan.target,
      reachedTarget: plan.unit.position === plan.target,
      tilesMoved: plan.tilesTraversed.length,
      tilesTraversed: plan.tilesTraversed,
      movementRemaining: plan.budget,
      blockedBy: plan.blockedBy,
      terrain: getCell(plan.unit.position).terrain
    })
  }

  return [...results.values()].sort((a, b) => a.unitId.localeCompare(b.unitId))
}

module.exports = { resolveSimultaneousMovement, BLOCKED_TICKS_TO_STOP }
