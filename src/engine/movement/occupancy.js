// src/engine/movement/occupancy.js
//
// Who is on which tile, queried live while movement resolves.
//
// Friendly units may share a tile (ruled 2026-10-21). A tile holds at most
// CROWDING.CAP men; past about one unit's worth it is crowded, and the
// crowding tiers (combat/tables.js) cost movement, fighting strength and, at
// the worst, morale. Before Stage 3 the rule was one unit per tile, and
// armies jammed into single file.
//
// An enemy's tile is never entered: walking into an enemy is contact, and
// contact is combat's business, not movement's. Passing THROUGH friends and
// stopping among them are both allowed while the tile has room.

const { livingUnits } = require('../world')
const { positionKey } = require('../map/labels')
const { CROWDING } = require('../combat/tables')

// Build a live index: position key -> the units standing there. Only living
// units occupy ground; a destroyed unit's tile frees the moment it empties.
function buildOccupancy(world) {
  const index = new Map()
  for (const unit of livingUnits(world)) {
    const key = positionKey(unit.position)
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(unit)
  }
  return index
}

function unitsAt(occupancy, position) {
  return occupancy.get(positionKey(position)) ?? []
}

// The first unit on a tile, or null. Kept for callers that only ask whether
// someone is there.
function getUnitAt(occupancy, position) {
  return unitsAt(occupancy, position)[0] ?? null
}

function isOccupied(occupancy, position) {
  return unitsAt(occupancy, position).length > 0
}

function menOn(units) {
  return units.reduce((sum, u) => sum + Math.max(0, u.strength), 0)
}

// Move a unit in the index. The index and the unit's own position field are
// kept in step here so neither can drift from the other mid-resolution.
function moveUnit(occupancy, unit, to) {
  const fromKey = positionKey(unit.position)
  const here = occupancy.get(fromKey)
  if (here) {
    const i = here.indexOf(unit)
    if (i >= 0) here.splice(i, 1)
    if (here.length === 0) occupancy.delete(fromKey)
  }
  const toKey = positionKey(to)
  if (!occupancy.has(toKey)) occupancy.set(toKey, [])
  occupancy.get(toKey).push(unit)
  unit.position = { x: to.x, y: to.y }
}

// May `unit` step onto `position` right now?
//  - empty tile: yes
//  - enemy on it: never; that is contact, not movement
//  - friends on it: yes while the men there plus this unit stay within the
//    cap; otherwise no (reason 'friendly': the tile may clear later in the
//    tick if someone moves off)
function canEnter(occupancy, unit, position) {
  const others = unitsAt(occupancy, position).filter(u => u !== unit)
  if (others.length === 0) return { ok: true }
  const enemy = others.find(u => u.side !== unit.side)
  if (enemy) return { ok: false, reason: 'enemy', blocker: enemy.id }
  if (menOn(others) + Math.max(0, unit.strength) > CROWDING.CAP) {
    return { ok: false, reason: 'friendly', blocker: others[0].id }
  }
  return { ok: true, shared: true }
}

// The crowding tier for a number of men on a SHARED tile. A lone unit is
// never crowded, so callers pass the unit count too.
function crowdingTier(men, unitCount = 2) {
  if (unitCount < 2) return CROWDING.TIERS[0]
  return CROWDING.TIERS.find(t => men <= t.upTo) ?? CROWDING.TIERS[CROWDING.TIERS.length - 1]
}

// Each living unit's crowding, read from the world: unitId -> tier.
function crowdingByUnit(world) {
  const result = new Map()
  for (const units of buildOccupancy(world).values()) {
    const tier = crowdingTier(menOn(units), units.length)
    for (const unit of units) result.set(unit.id, tier)
  }
  return result
}

// A unit's movement for the turn, after crowding on the tile it starts on.
function crowdedRange(unit, tier) {
  if (!tier || tier.move === 0) return unit.movementRange
  const reduced = Math.round(unit.movementRange * (1 - tier.move) * 100) / 100
  return Math.min(unit.movementRange, Math.max(CROWDING.MIN_MOVE, reduced))
}

module.exports = {
  buildOccupancy, unitsAt, getUnitAt, isOccupied, menOn, moveUnit, canEnter,
  crowdingTier, crowdingByUnit, crowdedRange
}
