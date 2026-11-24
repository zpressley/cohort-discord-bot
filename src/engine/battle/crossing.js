// src/engine/battle/crossing.js
//
// A unit going in at an enemy close across a ford or bridge steps straight
// into the crossing, rather than along the bank first. Going round by the
// bank, a crowded unit had no march left for the water, and two such units
// paced up and down either bank for ever (ashford, Rome against Han, seeds 1
// and 2). A unit can always make one tile of ground (movement/
// simultaneous.js), so it gets into the water. First built for the
// computer's units alone (opponent/planner.js, "How armies were made to come
// to grips"); here since, for every unit (docs/DECISIONS.md, "How the first
// battle, being asked, and forming up were built").

const { findPath } = require('../movement/pathfinding')
const { tileDistance } = require('../world')
const { tables: T } = require('../combat')

const CROSSINGS = ['ford', 'bridge']

/**
 * The tile of a ford or bridge beside the unit to step into, going in at an
 * enemy at `at` within CROSSING.NEAR tiles whose way to him lies over the
 * crossing (the tile nearest him); null otherwise (it goes at him as before).
 */
function intoTheCrossing(map, unit, at) {
  const d = tileDistance(unit.position, at)
  if (d < 2 || d > T.CROSSING.NEAR) return null
  const path = findPath(map, unit.position, at)
  if (!path || !path.slice(1).some(t => CROSSINGS.includes(map.terrainAt(t)))) return null
  return map.neighbors(unit.position)
    .filter(t => CROSSINGS.includes(map.terrainAt(t)) && map.passable(t) && tileDistance(t, at) < d)
    .sort((a, b) => tileDistance(a, at) - tileDistance(b, at) || a.y - b.y || a.x - b.x)[0] ?? null
}

module.exports = { intoTheCrossing, CROSSINGS }
