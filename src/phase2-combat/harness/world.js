// src/phase2-combat/harness/world.js
// Multi-unit battlefield state.
//
// Phase 1 carried a single unit in a module-level variable. Combat needs at
// least two sides, so this holds the roster. Same 40x40 map, same coordinate
// strings, same terrain source — nothing here forks phase 1's map.

const { getCell } = require('../../phase1-movement/mapData')
const { parseCoord } = require('../../phase1-movement/movementEngine')

// A harness unit. Field names match phase 1's createUnit() where they overlap
// so movementEngine.executeMove() can consume one unchanged.
function createUnit(spec) {
  if (!spec.id) throw new Error('unit requires an id')
  if (!spec.side) throw new Error(`unit ${spec.id} requires a side`)
  if (!spec.position) throw new Error(`unit ${spec.id} requires a position`)

  const maxStrength = spec.maxStrength ?? spec.strength ?? 400

  return {
    id: spec.id,
    side: spec.side,
    culture: spec.culture ?? 'Roman Republic',
    role: spec.role ?? 'heavy_infantry',
    position: spec.position,
    strength: spec.strength ?? maxStrength,
    maxStrength,
    movementRange: spec.movementRange ?? 3,
    mounted: spec.mounted ?? false,

    // Combat-facing fields. Phase 2 owns the meaning of these; the harness
    // only carries them through and reports on them.
    quality: spec.quality ?? 'professional',
    primaryWeapon: spec.primaryWeapon ?? null,
    armor: spec.armor ?? 'medium_armor',
    shield: spec.shield ?? 'medium_shield',
    formation: spec.formation ?? 'line',
    morale: spec.morale ?? 100,

    aliases: spec.aliases ?? []
  }
}

function createWorld({ units = [], turn = 0 } = {}) {
  return {
    turn,
    units: units.map(createUnit)
  }
}

// Structural clone — snapshots must not alias live state.
function cloneWorld(world) {
  return JSON.parse(JSON.stringify(world))
}

function getUnit(world, unitId) {
  return world.units.find(u => u.id === unitId) ?? null
}

// A unit at zero strength is destroyed and stops participating.
function isAlive(unit) {
  return unit.strength > 0
}

function livingUnits(world) {
  return world.units.filter(isAlive)
}

function unitsOnSide(world, side) {
  return livingUnits(world).filter(u => u.side === side)
}

function sides(world) {
  return [...new Set(world.units.map(u => u.side))].sort()
}

// Manhattan distance in tiles. Phase 1's pathfinder moves orthogonally and
// uses a Manhattan heuristic, so distance is measured the same way here.
function tileDistance(coordA, coordB) {
  const a = parseCoord(coordA)
  const b = parseCoord(coordB)
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col)
}

// Terrain under a unit — the thing positional combat modifiers key off.
function terrainAt(coord) {
  return getCell(coord).terrain
}

module.exports = {
  createUnit,
  createWorld,
  cloneWorld,
  getUnit,
  isAlive,
  livingUnits,
  unitsOnSide,
  sides,
  tileDistance,
  terrainAt
}
