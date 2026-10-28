// src/engine/movement/simultaneous.js
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
//   - Friends share ground (Stage 3): a unit may step onto a friend's tile
//     while the tile stays under the crowding cap, and pays for the crowding
//     (occupancy.js). Two units racing for one tile can both end there.
//   - A full tile: the higher-initiative units fill it; the next finds it
//     full, looks once for a way around, and otherwise waits a tick and then
//     stops for the turn.
//   - An enemy's tile is never entered: that is contact.
//   - Crowding slows a unit: its range for the turn is cut by the crowding
//     on the tile it starts on.
//
// The resolver mutates unit positions (like the phase 2 movement phase) but
// draws no randomness — movement is fully deterministic, chaos stays combat's
// single RNG channel.

const { findPath } = require('./pathfinding')
const { toPosition, samePosition, positionKey } = require('../map/labels')
const { inInitiativeOrder, tierName } = require('./initiative')
const { buildOccupancy, canEnter, moveUnit, crowdingByUnit, crowdedRange } = require('./occupancy')
const { getUnit, isAlive } = require('../world')

// A unit blocked this many ticks in a row gives up for the turn.
const BLOCKED_TICKS_TO_STOP = 2

/**
 * Resolve one turn of simultaneous movement.
 *
 * @param {Object} world   phase 2 harness world (mutated: unit positions)
 * @param {Array}  orders  [{ unitId, target }] — target is a position, a map
 *                         label, or 'hold'
 * @param {Object} map     the battlefield (src/engine/map/map.js)
 * @returns {Array} per-unit movement results, sorted by unit id
 */
function resolveSimultaneousMovement(world, orders, map, options = {}) {
  // Enemies hidden from everyone (Stage 3): a unit looking for a fight does
  // not stop for one it cannot see, and one that walks into its tile has
  // stumbled on it.
  const hidden = options.hidden ?? new Set()
  // Ambushes lying in wait (Stage 3): unitId set, and the battle's decision,
  // asked each time an enemy steps within reach of one. 'spring' stops the
  // passing unit where it stands: it has been caught.
  const ambushers = options.ambushers ?? new Set()
  const decideAmbush = options.ambush ?? (() => null)
  const sprung = new Set()
  if (!map) throw new Error('resolveSimultaneousMovement needs the map')
  const occupancy = buildOccupancy(world)
  const crowding = crowdingByUnit(world)
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
    const target = toPosition(order.target)
    if (samePosition(target, unit.position)) {
      results.set(unit.id, { unitId: unit.id, failed: 'already there', position: unit.position })
      continue
    }

    const path = findPath(map, unit.position, target)
    if (!path) {
      results.set(unit.id, { unitId: unit.id, failed: 'no path', position: unit.position })
      continue
    }

    plans.set(unit.id, {
      unit,
      target,
      fleeing: Boolean(order.fleeing),
      steps: path.slice(1),            // path[0] is where the unit stands
      stepIndex: 0,
      // Careful (on guard) marches at half speed, after crowding.
      budget: order.careful
        ? Math.round(crowdedRange(unit, crowding.get(unit.id)) / 2 * 100) / 100
        : crowdedRange(unit, crowding.get(unit.id)),
      careful: Boolean(order.careful),
      // Looking for a fight (Stage 3): only such a unit stops when it meets
      // an enemy. Others walk on past, if the way is open. Callers that do
      // not say are treated as seeking, the rule before Stage 3.
      seeking: order.seeking ?? true,
      from: { ...unit.position },
      tilesTraversed: [],
      blockedTicks: 0,
      blockedBy: null,
      stopped: false,
      // In contact before anyone moved: such a unit may step away (a
      // withdrawal), so only contact made during the turn stops it below.
      startedInContact: Boolean(adjacentEnemy(occupancy, unit, map, hidden)),
      stumbledOn: null
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

      // An enemy came up beside this unit earlier in the turn: it is in
      // contact now, and turns to fight instead of walking on. Without this,
      // a unit chasing an enemy could step out of the contact the enemy had
      // just made, and the two could circle each other for ever.
      if (plan.seeking && !plan.fleeing && !plan.startedInContact) {
        const enemy = adjacentEnemy(occupancy, unit, map, hidden)
        if (enemy) {
          plan.stopped = true
          plan.blockedBy = enemy.id
          continue
        }
      }

      const nextCoord = plan.steps[plan.stepIndex]
      const terrain = map.terrainAt(nextCoord)
      const cost = map.moveCost(nextCoord)

      if (plan.budget < cost) {
        plan.stopped = true
        continue
      }

      const entry = canEnter(occupancy, unit, nextCoord)
      // A full tile of friends in the way: once per turn, look for a way
      // around the tiles this unit cannot enter. Paths are planned over an
      // empty field, so without this a broken unit wedged in a packed line
      // can block both armies for good. An enemy in the way is contact, and
      // stops the move (below).
      if (!entry.ok && entry.reason === 'friendly' && !plan.detoured) {
        plan.detoured = true
        const avoid = new Set([...occupancy.entries()]
          .filter(([, units]) => units.length > 0 && !canEnter(occupancy, unit, units[0].position).ok)
          .map(([key]) => key))
        const detour = findPath(map, unit.position, plan.target, { avoid })
        if (detour && detour.length > 1) {
          plan.steps = detour.slice(1)
          plan.stepIndex = 0
          anyoneMoving = true
          continue
        }
      }
      if (!entry.ok) {
        plan.blockedTicks += 1
        plan.blockedBy = entry.blocker
        if (entry.reason === 'enemy' && hidden.has(entry.blocker)) plan.stumbledOn = entry.blocker
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

      // An ambush within reach may spring on this unit, and catch it here.
      if (ambushers.size > 0) {
        const lying = map.neighbors(unit.position)
          .flatMap(n => occupancy.get(positionKey(n)) ?? [])
          .filter(a => a.side !== unit.side && ambushers.has(a.id) && !sprung.has(a.id))
          .sort((x, y) => x.id.localeCompare(y.id))
        const by = lying.find(a => decideAmbush(a, unit, { careful: plan.careful, fleeing: plan.fleeing }) === 'spring')
        if (by) {
          sprung.add(by.id)
          plan.stopped = true
          plan.blockedBy = by.id
          plan.ambushedBy = by.id
          continue
        }
      }

      // Contact stops a unit looking for a fight: it steps next to an enemy,
      // halts there and fights. Contact used to be checked only after
      // everyone had moved, so two units could slip past each other through
      // the diagonals, swap places, and repeat for ever without a blow.
      // Fleeing units are exempt: they keep running, and pursuit deals with
      // them. A unit not looking for a fight walks on (Stage 3).
      if (plan.seeking && !plan.fleeing) {
        const enemy = adjacentEnemy(occupancy, unit, map, hidden)
        if (enemy) {
          plan.stopped = true
          plan.blockedBy = enemy.id
        }
      }
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
      reachedTarget: samePosition(plan.unit.position, plan.target),
      tilesMoved: plan.tilesTraversed.length,
      careful: plan.careful,
      tilesTraversed: plan.tilesTraversed,
      movementRemaining: plan.budget,
      blockedBy: plan.blockedBy,
      ...(plan.stumbledOn ? { stumbledOn: plan.stumbledOn } : {}),
      ...(plan.ambushedBy ? { ambushedBy: plan.ambushedBy } : {}),
      terrain: map.terrainAt(plan.unit.position)
    })
  }

  return [...results.values()].sort((a, b) => a.unitId.localeCompare(b.unitId))
}

function adjacentEnemy(occupancy, unit, map, hidden = new Set()) {
  for (const next of map.neighbors(unit.position)) {
    const other = (occupancy.get(positionKey(next)) ?? []).find(u => u.side !== unit.side && !hidden.has(u.id))
    if (other) return other
  }
  return null
}

module.exports = { resolveSimultaneousMovement, BLOCKED_TICKS_TO_STOP }
