// src/phase2-combat/harness/runner.js
// Deterministic turn loop. No Discord, no AI, no database, no wall clock.
//
// Same scenario + same seed + same combat resolver == byte-identical report,
// every time. That property is the whole point: it is what lets you change a
// damage table and see exactly what moved.
//
// Turn order:
//   1. movement   — phase 1's engine, unchanged
//   2. contact    — who is now adjacent to an enemy
//   3. combat     — delegated to the injected resolver (phase 2 owns this)
//   4. casualties — applied by the harness, so the resolver stays pure
//   5. snapshot   — recorded for the report

const { executeMove } = require('../../phase1-movement/movementEngine')
const {
  createWorld, cloneWorld, getUnit, isAlive,
  livingUnits, unitsOnSide, sides, tileDistance, terrainAt
} = require('./world')
const { createRng } = require('./rng')

const DEFAULT_ENGAGEMENT_RANGE = 1  // tiles — adjacent means in contact

// Every enemy pair currently within engagement range.
// Sorted so the list never depends on roster insertion order.
function detectEngagements(world, engagementRange = DEFAULT_ENGAGEMENT_RANGE) {
  const alive = livingUnits(world)
  const engagements = []

  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i]
      const b = alive[j]
      if (a.side === b.side) continue

      const distance = tileDistance(a.position, b.position)
      if (distance > engagementRange) continue

      // Pair members are named a/b, not attacker/defender. Which side is
      // attacking is a tactical judgement (who moved into contact, who holds
      // ground, charge vs. receive) that phase 2's resolver makes — the
      // harness only reports that these two are in contact.
      engagements.push({
        aId: a.id,
        bId: b.id,
        distance,
        aTerrain: terrainAt(a.position),
        bTerrain: terrainAt(b.position)
      })
    }
  }

  engagements.sort((x, y) =>
    x.aId.localeCompare(y.aId) || x.bId.localeCompare(y.bId))

  return engagements
}

// Phase 1's engine pathfinds for a single unit and knows nothing about anyone
// else on the map, so without this two units walk onto the same tile and the
// engagement detector reports a 0-tile "contact". A 25m tile does not hold two
// bodies of 400 men. Rule: a unit stops on the last tile of its path before the
// first occupied one. Occupancy is evaluated in unit-id order, so it is
// deterministic. Phase 2 may want to own this (zones of control, friendly
// stacking penalties) — see PHASE2_COMBAT_PLAN.md.
function truncateForOccupancy(world, unit, move) {
  const occupied = new Map()
  for (const other of livingUnits(world)) {
    if (other.id === unit.id) continue
    occupied.set(other.position, other)
  }

  let finalPosition = move.startPosition
  const tilesTraversed = []
  let blockedBy = null

  for (const step of move.tilesTraversed) {
    const blocker = occupied.get(step.coord)
    if (blocker) {
      blockedBy = blocker.id
      break
    }
    finalPosition = step.coord
    tilesTraversed.push(step)
  }

  return {
    ...move,
    finalPosition,
    tilesTraversed,
    reachedTarget: finalPosition === move.targetCoord,
    blockedBy
  }
}

// Movement for one turn. Orders are sorted by unit id before execution so
// two units racing for the same tile always resolve the same way.
function runMovementPhase(world, orders) {
  const results = []
  const sorted = [...orders].sort((a, b) => a.unitId.localeCompare(b.unitId))

  for (const order of sorted) {
    const unit = getUnit(world, order.unitId)

    if (!unit) {
      results.push({ unitId: order.unitId, skipped: 'no such unit' })
      continue
    }
    if (!isAlive(unit)) {
      results.push({ unitId: order.unitId, skipped: 'destroyed' })
      continue
    }
    if (!order.target || order.target === 'hold') {
      results.push({ unitId: unit.id, held: true, position: unit.position })
      continue
    }

    const rawMove = executeMove(unit, order.target)

    if (!rawMove.success) {
      results.push({ unitId: unit.id, failed: rawMove.reason, position: unit.position })
      continue
    }

    const move = truncateForOccupancy(world, unit, rawMove)
    unit.position = move.finalPosition

    results.push({
      unitId: unit.id,
      from: move.startPosition,
      to: move.finalPosition,
      target: move.targetCoord,
      reachedTarget: move.reachedTarget,
      tilesMoved: move.tilesTraversed.length,
      terrain: terrainAt(move.finalPosition),
      blockedBy: move.blockedBy
    })
  }

  return results
}

// Casualties come back from the resolver as intent; the harness applies them.
// Strength floors at zero — a unit is never negative, and never revived here.
function applyCasualties(world, casualties = []) {
  const applied = []

  for (const casualty of casualties) {
    const unit = getUnit(world, casualty.unitId)
    if (!unit) continue

    const killed = Math.max(0, Math.round(casualty.killed ?? 0))
    const actual = Math.min(killed, unit.strength)
    unit.strength -= actual

    applied.push({
      unitId: unit.id,
      killed: actual,
      remaining: unit.strength,
      destroyed: unit.strength === 0
    })
  }

  applied.sort((a, b) => a.unitId.localeCompare(b.unitId))
  return applied
}

// A side is beaten when it has no living units left.
function checkOutcome(world) {
  const remaining = sides(world).filter(side => unitsOnSide(world, side).length > 0)

  if (remaining.length === 1) return { decided: true, winner: remaining[0], reason: 'enemy destroyed' }
  if (remaining.length === 0) return { decided: true, winner: 'draw', reason: 'mutual destruction' }
  return { decided: false, winner: null, reason: null }
}

/**
 * Run one scenario to completion.
 *
 * @param {Object} scenario                see scenarios/ for the shape
 * @param {Object} [options]
 * @param {Function} [options.combatResolver]  ({engagements, world, random, turn}) =>
 *                                             { casualties: [{unitId, killed}], events: [] }
 *                                             Omit it and the run is movement-only.
 * @param {number} [options.seed]          overrides scenario.seed
 * @returns {Object} run record — turns, snapshots, outcome
 */
function runScenario(scenario, options = {}) {
  const seed = options.seed ?? scenario.seed ?? 1
  const combatResolver = options.combatResolver ?? null
  const engagementRange = scenario.engagementRange ?? DEFAULT_ENGAGEMENT_RANGE

  const random = createRng(seed)
  const world = createWorld({ units: scenario.units })

  const record = {
    scenario: scenario.name,
    seed,
    combatEnabled: Boolean(combatResolver),
    turns: [],
    outcome: { decided: false, winner: null, reason: 'scenario ended' }
  }

  const orderScript = scenario.turns ?? []

  for (let turnIndex = 0; turnIndex < orderScript.length; turnIndex++) {
    world.turn = turnIndex + 1

    const orders = orderScript[turnIndex].orders ?? []
    const movement = runMovementPhase(world, orders)
    const engagements = detectEngagements(world, engagementRange)

    let combat = null
    let casualties = []

    if (combatResolver && engagements.length > 0) {
      combat = combatResolver({ engagements, world, random, turn: world.turn })
      casualties = applyCasualties(world, combat?.casualties ?? [])
    }

    record.turns.push({
      turn: world.turn,
      movement,
      engagements,
      events: combat?.events ?? [],
      casualties,
      snapshot: cloneWorld(world)
    })

    const outcome = checkOutcome(world)
    if (outcome.decided) {
      record.outcome = outcome
      break
    }
  }

  return record
}

module.exports = {
  runScenario,
  runMovementPhase,
  truncateForOccupancy,
  detectEngagements,
  applyCasualties,
  checkOutcome,
  DEFAULT_ENGAGEMENT_RANGE
}
