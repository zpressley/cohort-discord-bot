// src/engine/movement/pathfinding.js
// A* pathfinding + single-unit movement execution, on whatever map it is given.
// No missions, no formations, no external dependencies.
//
// The search is the one phase 1 copied from mapUtils.js findPathAStar, kept
// step for step: same neighbour order, same stable sort on f, same heuristic.
// Any change there changes which of two equally short paths a unit takes, and
// every scenario's outcome with it.

const { toPosition, samePosition, positionKey } = require('../map/labels')

// ── A* PATHFINDING ─────────────────────────────────────────────

/**
 * @returns {Array<{x,y}>|null} the path including both ends, or null when the
 *   target is off the map or every route is impassable
 */
function findPath(map, from, to) {
  const start = toPosition(from)
  const goal = toPosition(to)
  if (!map.inBounds(goal) || !map.inBounds(start)) return null

  const goalKey = positionKey(goal)
  const startKey = positionKey(start)
  const positions = new Map([[startKey, start]])

  const openSet = [{ key: startKey, f: 0, g: 0, h: 0 }]
  const closedSet = new Set()
  const cameFrom = new Map()
  const gScore = new Map()
  gScore.set(startKey, 0)

  const heuristic = (p) => Math.abs(goal.x - p.x) + Math.abs(goal.y - p.y)

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f)
    const current = openSet.shift()

    if (current.key === goalKey) {
      return reconstructPath(cameFrom, current.key).map(k => ({ ...positions.get(k) }))
    }

    closedSet.add(current.key)

    for (const neighbor of map.neighbors(positions.get(current.key))) {
      const key = positionKey(neighbor)
      if (closedSet.has(key)) continue

      const moveCost = map.moveCost(neighbor)

      // Impassable
      if (!map.passable(neighbor)) continue

      const tentativeG = gScore.get(current.key) + moveCost

      if (!gScore.has(key) || tentativeG < gScore.get(key)) {
        positions.set(key, neighbor)
        cameFrom.set(key, current.key)
        gScore.set(key, tentativeG)

        const h = heuristic(neighbor)
        const f = tentativeG + h

        const existingNode = openSet.find(n => n.key === key)
        if (existingNode) {
          existingNode.g = tentativeG
          existingNode.h = h
          existingNode.f = f
        } else {
          openSet.push({ key, g: tentativeG, h, f })
        }
      }
    }
  }

  return null  // no path found
}

function reconstructPath(cameFrom, current) {
  const path = [current]
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)
    path.unshift(current)
  }
  return path
}

// ── MOVEMENT EXECUTION ─────────────────────────────────────────
// One unit alone on the map. Used by the scripted scenario runner and the
// phase 1 movement demo; real battles use simultaneous.js.

function executeMove(map, unit, target) {
  let targetPosition
  try {
    targetPosition = toPosition(target)
  } catch (e) {
    return { success: false, reason: `Invalid target: ${JSON.stringify(target)}` }
  }
  if (!map.inBounds(targetPosition)) {
    return { success: false, reason: `Target is off the map: ${map.label(targetPosition)}` }
  }

  const start = toPosition(unit.position)

  // Already there
  if (samePosition(start, targetPosition)) {
    return { success: false, reason: 'Unit is already at that location' }
  }

  // Find path
  const path = findPath(map, start, targetPosition)
  if (!path) {
    return { success: false, reason: 'No valid path — impassable terrain blocks all routes' }
  }

  // Walk path, spending movement points
  let movementRemaining = unit.movementRange
  let finalPosition = start
  const tilesTraversed = []

  // path[0] is the starting position — skip it
  for (const coord of path.slice(1)) {
    const terrain = map.terrainAt(coord)
    const cost = map.moveCost(coord)

    if (movementRemaining < cost) break

    movementRemaining -= cost
    finalPosition = coord
    tilesTraversed.push({ coord, terrain })
  }

  const reachedTarget = samePosition(finalPosition, targetPosition)

  return {
    success: true,
    startPosition: start,
    finalPosition: { ...finalPosition },
    targetCoord: targetPosition,
    reachedTarget,
    tilesTraversed,
    movementRemaining: Math.round(movementRemaining * 100) / 100,
    partialMove: !reachedTarget,
    fullPath: path,
    turnsToTarget: reachedTarget ? 1 : estimateTurns(map, path, unit.movementRange)
  }
}

// Rough estimate of turns remaining to reach target
function estimateTurns(map, path, movementRange) {
  let totalCost = 0
  for (const coord of path.slice(1)) totalCost += map.moveCost(coord)
  return Math.ceil(totalCost / movementRange)
}

module.exports = { executeMove, findPath }
