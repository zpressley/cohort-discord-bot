// src/engine/map/map.js
//
// A battlefield as a value. Everything that asks "what is on this tile?" asks
// the map it was given, so the engine works on any map of any size: the
// 40x40 Crownhill today, a 2 km map (80x80) or larger later.
//
// A map definition is plain data (see src/data/maps/crownhill.js):
//   { name, title, width, height,
//     cells:   { label: { terrain, tags, landmark, aliases, description } },
//     terrain: { terrainType: [label, ...] } }
// Named cells win over the terrain lists; anything unlisted is plains.

const { fromLabel, toLabel, positionKey, isPosition } = require('./labels')
const { MOVEMENT_COSTS, IMPASSABLE } = require('./terrain')
const { MAPS } = require('../../data/maps')

const DEFAULT_MAP = 'crownhill'

// Orthogonal steps, in the order the pathfinder has always tried them:
// north, south, west, east. Changing this order changes which of two equally
// short paths a unit takes.
const STEPS = [[0, -1], [0, 1], [-1, 0], [1, 0]]

function plainCell(terrain = 'plains') {
  return { terrain, tags: [], landmark: null, aliases: [], description: null }
}

function createMap(definition) {
  const { name, title, width, height } = definition
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error(`map ${name}: width and height must be positive integers`)
  }

  const inBounds = (p) => Boolean(p) && p.x >= 0 && p.x < width && p.y >= 0 && p.y < height

  const place = (label, what) => {
    const p = fromLabel(label)
    if (!inBounds(p)) throw new Error(`map ${name}: ${what} at ${label} is off the map`)
    return p
  }

  // Terrain lists first, first list wins; named cells override them.
  const cells = new Map()
  for (const [terrain, labels] of Object.entries(definition.terrain ?? {})) {
    for (const label of labels) {
      const key = positionKey(place(label, terrain))
      if (!cells.has(key)) cells.set(key, plainCell(terrain))
    }
  }
  const landmarks = []
  for (const [label, cell] of Object.entries(definition.cells ?? {})) {
    const position = place(label, 'cell')
    const full = { ...plainCell(), ...cell }
    cells.set(positionKey(position), full)
    if (full.landmark) landmarks.push({ position, ...full })
  }

  // Strict on purpose: a label or a stray string here would otherwise read as
  // an unknown tile and come back as plains, silently.
  const cell = (p) => {
    if (!isPosition(p)) throw new Error(`map ${name}: not a position: ${JSON.stringify(p)}`)
    return cells.get(positionKey(p)) ?? plainCell()
  }
  const terrainAt = (p) => cell(p).terrain
  const moveCost = (p) => MOVEMENT_COSTS[terrainAt(p)] ?? 1.0
  const passable = (p) => inBounds(p) && moveCost(p) < IMPASSABLE

  const neighbors = (p) => {
    const out = []
    for (const [dx, dy] of STEPS) {
      const q = { x: p.x + dx, y: p.y + dy }
      if (inBounds(q)) out.push(q)
    }
    return out
  }

  return {
    name,
    title: title ?? name,
    width,
    height,
    inBounds,
    cell,
    terrainAt,
    moveCost,
    passable,
    neighbors,
    landmarks: () => landmarks.map(l => ({ ...l, position: { ...l.position } })),
    label: toLabel
  }
}

// Turn whatever a spec carries into a map: a built map, a definition, or the
// name of an authored map. No map at all means Crownhill, the only one so far.
const built = new Map()
function resolveMap(spec = DEFAULT_MAP) {
  if (spec && typeof spec.cell === 'function') return spec
  if (typeof spec === 'string') {
    const definition = MAPS[spec]
    if (!definition) throw new Error(`no map named ${spec}`)
    if (!built.has(spec)) built.set(spec, createMap(definition))
    return built.get(spec)
  }
  return createMap(spec)
}

module.exports = { createMap, resolveMap, DEFAULT_MAP }
