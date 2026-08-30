// src/phase1-movement/movementEngine.js
// A* pathfinding + movement execution.
// No missions, no formations, no external dependencies.
// parseCoord, coordToString, findPathAStar copied from mapUtils.js.

const { getCell, MOVEMENT_COSTS } = require('./mapData')

// ── COORDINATE HELPERS ─────────────────────────────────────────

// Parse "W6" → { row: 5, col: 22 }
function parseCoord(coord) {
  if (!coord || typeof coord !== 'string') throw new Error(`Invalid coordinate: ${coord}`)

  const match = coord.match(/^([A-Z]+)(\d+)$/)
  if (!match) throw new Error(`Invalid coordinate format: ${coord}. Expected A1-AN40.`)

  const colStr = match[1]
  const row = parseInt(match[2]) - 1  // 1-indexed → 0-indexed

  // Excel-style bijective base-26: A=0 .. Z=25, AA=26, AB=27 .. AN=39.
  // Restored from mapUtils.js parseCoord — the original copy here used
  // (charCode - 65) with an i>0 increment, which collapsed every two-letter
  // column onto a single-letter one (AA1 -> col 1 instead of 26), making the
  // eastern third of the 40x40 map unaddressable.
  let col = 0
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64)  // A=1 .. Z=26
  }
  col -= 1

  if (row < 0 || row >= 40 || col < 0 || col >= 40) {
    throw new Error(`Coordinate out of bounds: ${coord}. Valid range: A1-AN40`)
  }

  return { row, col }
}

// { row: 5, col: 22 } → "W6"
function coordToString(pos) {
  let col = pos.col
  let colStr = ''

  if (col < 26) {
    colStr = String.fromCharCode(65 + col)
  } else {
    const firstLetter = Math.floor((col) / 26) - 1
    const secondLetter = col % 26
    colStr = String.fromCharCode(65 + firstLetter) + String.fromCharCode(65 + secondLetter)
  }

  return `${colStr}${pos.row + 1}`
}

// All orthogonally adjacent coords within the 40×40 grid
function getAdjacentCoords(coord) {
  const pos = parseCoord(coord)
  const neighbors = []
  const deltas = [[-1,0],[1,0],[0,-1],[0,1]]
  for (const [dr, dc] of deltas) {
    const nr = pos.row + dr
    const nc = pos.col + dc
    if (nr >= 0 && nr < 40 && nc >= 0 && nc < 40) {
      neighbors.push(coordToString({ row: nr, col: nc }))
    }
  }
  return neighbors
}

// ── A* PATHFINDING ─────────────────────────────────────────────
// Copied from mapUtils.js findPathAStar, adapted to use getCell for terrain.

function findPath(from, to) {
  const goal = parseCoord(to)

  const openSet = [{ coord: from, f: 0, g: 0, h: 0 }]
  const closedSet = new Set()
  const cameFrom = new Map()
  const gScore = new Map()
  gScore.set(from, 0)

  const heuristic = (coordStr) => {
    const pos = parseCoord(coordStr)
    return Math.abs(goal.col - pos.col) + Math.abs(goal.row - pos.row)
  }

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f)
    const current = openSet.shift()

    if (current.coord === to) {
      return reconstructPath(cameFrom, current.coord)
    }

    closedSet.add(current.coord)
    const neighbors = getAdjacentCoords(current.coord)

    for (const neighbor of neighbors) {
      if (closedSet.has(neighbor)) continue

      const terrain = getCell(neighbor).terrain
      const moveCost = MOVEMENT_COSTS[terrain] || 1.0

      // Impassable
      if (moveCost >= 999) continue

      const tentativeG = gScore.get(current.coord) + moveCost

      if (!gScore.has(neighbor) || tentativeG < gScore.get(neighbor)) {
        cameFrom.set(neighbor, current.coord)
        gScore.set(neighbor, tentativeG)

        const h = heuristic(neighbor)
        const f = tentativeG + h

        const existingNode = openSet.find(n => n.coord === neighbor)
        if (existingNode) {
          existingNode.g = tentativeG
          existingNode.h = h
          existingNode.f = f
        } else {
          openSet.push({ coord: neighbor, g: tentativeG, h: h, f: f })
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

function executeMove(unit, targetCoord) {
  // Validate target
  try {
    parseCoord(targetCoord)
  } catch (e) {
    return { success: false, reason: `Invalid target coordinate: ${targetCoord}` }
  }

  // Already there
  if (unit.position === targetCoord) {
    return { success: false, reason: 'Unit is already at that location' }
  }

  // Find path
  const path = findPath(unit.position, targetCoord)
  if (!path) {
    return { success: false, reason: 'No valid path — impassable terrain blocks all routes' }
  }

  // Walk path, spending movement points
  let movementRemaining = unit.movementRange
  let finalPosition = unit.position
  const tilesTraversed = []

  // path[0] is the starting position — skip it
  for (const coord of path.slice(1)) {
    const terrain = getCell(coord).terrain
    const cost = MOVEMENT_COSTS[terrain] || 1.0

    if (movementRemaining < cost) break

    movementRemaining -= cost
    finalPosition = coord
    tilesTraversed.push({ coord, terrain })
  }

  const reachedTarget = finalPosition === targetCoord

  return {
    success: true,
    startPosition: unit.position,
    finalPosition,
    targetCoord,
    reachedTarget,
    tilesTraversed,
    movementRemaining: Math.round(movementRemaining * 100) / 100,
    partialMove: !reachedTarget,
    fullPath: path,
    turnsToTarget: reachedTarget ? 1 : estimateTurns(path, unit.movementRange)
  }
}

// Rough estimate of turns remaining to reach target
function estimateTurns(path, movementRange) {
  let totalCost = 0
  for (const coord of path.slice(1)) {
    const terrain = getCell(coord).terrain
    totalCost += MOVEMENT_COSTS[terrain] || 1.0
  }
  return Math.ceil(totalCost / movementRange)
}

module.exports = { executeMove, findPath, parseCoord, coordToString }
