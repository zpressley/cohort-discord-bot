// src/engine/map/sight.js
//
// Who can see whom (ruled 2026-10-22). Pure and deterministic: the same
// ground and the same positions always give the same answer, and chance
// never enters into it.
//
// Range: 6 tiles, scouts 10, +4 standing on high ground (the roadmap's scale
// table, §6). Within range, the ground decides:
//
//   - Woods. A unit in a forest is seen only from 1 tile away. Trees block a
//     sight line: one that passes through a forest tile on its way stops
//     there. So deep in a wood a unit sees 1 tile; on the edge of a wood it
//     sees out at its full range, while those outside cannot see in. A force
//     hidden in the trees can miss another creeping through them behind it.
//   - Hills. High ground between two units blocks the line, unless one of
//     them stands on high ground. This is what lets a reverse slope hide a
//     unit.
//
// Hiding (Stage 3, step 5) narrows this further; this file is the ground.

const { toPosition, distance } = require('./labels')
const { HIGH_GROUND_TERRAIN } = require('../combat/tables')

const VISION = {
  STANDARD: 6,       // [§6] was 3 tiles at 50m
  SCOUT: 10,         // [§6] was 5
  ELEVATED_BONUS: 4  // [§6] was +2
}

// Terrain that blocks a sight line passing through it.
const HIGH_GROUND = HIGH_GROUND_TERRAIN
const COVER = ['forest']

function isScout(unit) {
  return unit.role === 'scout' || unit.role === 'scouts'
}

function visionRange(unit, map) {
  if (!map) throw new Error('visionRange needs the map')
  const base = isScout(unit) ? VISION.SCOUT : VISION.STANDARD
  const elevated = HIGH_GROUND.includes(map.terrainAt(toPosition(unit.position)))
  return base + (elevated ? VISION.ELEVATED_BONUS : 0)
}

// The tiles a straight line from a to b crosses, ends excluded. Walked from
// the lower endpoint so the line is the same in both directions.
function tilesBetween(a, b) {
  let [p, q] = [toPosition(a), toPosition(b)]
  if (q.x < p.x || (q.x === p.x && q.y < p.y)) [p, q] = [q, p]
  const tiles = []
  const dx = Math.abs(q.x - p.x)
  const dy = Math.abs(q.y - p.y)
  const sx = q.x > p.x ? 1 : q.x < p.x ? -1 : 0
  const sy = q.y > p.y ? 1 : q.y < p.y ? -1 : 0
  let err = dx - dy
  let x = p.x
  let y = p.y
  while (x !== q.x || y !== q.y) {
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
    if (x !== q.x || y !== q.y) tiles.push({ x, y })
  }
  return tiles
}

/**
 * Is the straight line from one tile to another clear of trees and of hills
 * in the way? Says nothing about range.
 */
function lineOfSight(map, from, to) {
  const high = (pos) => HIGH_GROUND.includes(map.terrainAt(toPosition(pos)))
  const overTheHills = high(from) || high(to)
  for (const tile of tilesBetween(from, to)) {
    const terrain = map.terrainAt(tile)
    if (COVER.includes(terrain)) return false
    if (!overTheHills && HIGH_GROUND.includes(terrain)) return false
  }
  return true
}

/**
 * Can this unit see that one? Range first, then the ground.
 */
function canSee(map, viewer, target) {
  const d = distance(viewer.position, target.position)
  if (d <= 1) return true
  if (d > visionRange(viewer, map)) return false
  if (COVER.includes(map.terrainAt(toPosition(target.position)))) return false
  return lineOfSight(map, viewer.position, target.position)
}

module.exports = { VISION, visionRange, tilesBetween, lineOfSight, canSee, HIGH_GROUND, COVER }
