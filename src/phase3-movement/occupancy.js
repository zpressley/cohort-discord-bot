// src/phase3-movement/occupancy.js
//
// The occupancy layer the roadmap asks for: who is on which tile, queried
// live while movement resolves.
//
// The rule is one unit per tile, and it is a consequence of ruling Q6 rather
// than a new decision: standard units are ~100 men and a 25m tile holds ~100
// men, so a unit IS a tile's capacity. The old docs' stacking-density tiers
// (400/500/1200 per tile) described 400-man units on 50m tiles; at this scale
// the "crush" case cannot arise from movement at all — it arises from being
// shoved into an occupied tile, which is phase 4's push-back handling, where
// it costs morale instead of admitting a second unit.
//
// Passing THROUGH is a different question from stopping. A friendly column can
// flow through ground another friendly unit holds mid-turn (the tick model in
// simultaneous.js makes this concrete: a tile freed earlier in the tick can be
// entered later in it), but nobody may END a move on an occupied tile, and
// nobody enters a tile an enemy currently holds — walking into an enemy is
// contact, and contact is combat's business (phase 4), not movement's.

const { livingUnits } = require('../phase2-combat/harness/world')

// Build a live index: coord -> unit. Only living units occupy ground; a
// destroyed unit's tile is passable the moment it empties.
function buildOccupancy(world) {
  const index = new Map()
  for (const unit of livingUnits(world)) {
    index.set(unit.position, unit)
  }
  return index
}

function getUnitAt(occupancy, coord) {
  return occupancy.get(coord) ?? null
}

function isOccupied(occupancy, coord) {
  return occupancy.has(coord)
}

// Move a unit in the index. The index and the unit's own position field are
// kept in step here so neither can drift from the other mid-resolution.
function moveUnit(occupancy, unit, toCoord) {
  if (occupancy.get(unit.position) === unit) {
    occupancy.delete(unit.position)
  }
  occupancy.set(toCoord, unit)
  unit.position = toCoord
}

// May `unit` step onto `coord` right now?
//  - empty tile: yes
//  - enemy tile: never — that is contact, not movement
//  - friendly tile: no (may open later this tick if the friendly moves off;
//    the tick loop in simultaneous.js retries, which is what lets columns
//    flow through each other without ever co-occupying a tile)
function canEnter(occupancy, unit, coord) {
  const occupant = occupancy.get(coord)
  if (!occupant) return { ok: true }
  if (occupant.side !== unit.side) return { ok: false, reason: 'enemy', blocker: occupant.id }
  return { ok: false, reason: 'friendly', blocker: occupant.id }
}

module.exports = { buildOccupancy, getUnitAt, isOccupied, moveUnit, canEnter }
