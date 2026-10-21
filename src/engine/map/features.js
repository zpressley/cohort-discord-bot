// src/engine/map/features.js
//
// The ground as a person would describe it. Players should be able to say
// "the ridge to the east" or "stop at the clearing" (ruling of 2026-10-21),
// so the map has to know its ridges and clearings, not just its tiles.
//
// Features are found from terrain alone, so every map has them without
// anyone authoring them, including maps that do not exist yet. Named
// landmarks inside a feature give it a name; they are flavour, not the
// mechanism.
//
// A feature:
//   { id, kind, shape?, name, tiles: [{x,y}], size, centre: {x,y},
//     bounds: { minX, maxX, minY, maxY } }
//
// Kinds, and how each is found:
//   hill      connected high ground (3+ tiles). shape 'ridge' when long and
//             narrow, else 'hill'. Players may call either a hill, a ridge
//             or the heights.
//   woods     connected forest (4+ tiles)
//   marsh     connected marsh (4+ tiles)
//   river     connected open water, joined through its crossings
//   ford      connected ford tiles: a place to cross the river on foot
//   bridge    connected bridge tiles
//   road      connected road, joined through the crossings it uses
//   clearing  a small patch of open plains (2 to 40 tiles) mostly ringed by
//             woods: at least 60% of the tiles around it are forest
//
// Pure and deterministic: tiles are scanned row by row, north to south,
// west to east, so ids and order never change for the same map.

const { positionKey } = require('./labels')

const STEPS = [[0, -1], [0, 1], [-1, 0], [1, 0]]

// Terrain-run kinds: which terrain makes them, and the smallest patch that
// counts. A single tree is not woods.
//
// `through` lists terrain that joins a run without belonging to it. A river
// is one river even where a ford or bridge crosses it, and a road is one road
// even where it crosses the river: the crossing tiles connect the pieces, but
// the feature keeps only its own tiles (the ford is its own feature).
const RUNS = [
  { kind: 'hill', terrain: 'hill', minSize: 3 },
  { kind: 'woods', terrain: 'forest', minSize: 4 },
  { kind: 'marsh', terrain: 'marsh', minSize: 4 },
  { kind: 'river', terrain: 'river', minSize: 1, through: ['ford', 'bridge'] },
  { kind: 'ford', terrain: 'ford', minSize: 1 },
  { kind: 'bridge', terrain: 'bridge', minSize: 1 },
  { kind: 'road', terrain: 'road', minSize: 1, through: ['ford', 'bridge'] }
]

const CLEARING = { terrain: 'plains', minSize: 2, maxSize: 40, minForestShare: 0.6 }

// A hill this many times longer than it is wide, and at least this long,
// reads as a ridge.
const RIDGE = { minRatio: 2, minLength: 5 }

// Connected runs of tiles matching `match`, scanned in a fixed order.
function components(map, match) {
  const seen = new Set()
  const out = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const start = { x, y }
      if (!match(start) || seen.has(positionKey(start))) continue

      const tiles = []
      const stack = [start]
      seen.add(positionKey(start))
      while (stack.length > 0) {
        const tile = stack.pop()
        tiles.push(tile)
        for (const [dx, dy] of STEPS) {
          const next = { x: tile.x + dx, y: tile.y + dy }
          if (!map.inBounds(next) || !match(next) || seen.has(positionKey(next))) continue
          seen.add(positionKey(next))
          stack.push(next)
        }
      }
      tiles.sort((a, b) => a.y - b.y || a.x - b.x)
      out.push(tiles)
    }
  }
  return out
}

function boundsOf(tiles) {
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const { x, y } of tiles) {
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x)
    bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y)
  }
  return bounds
}

// The feature's own tile nearest its middle, so the centre is always on the
// feature (a crescent-shaped wood's average point may be open ground).
function centreOf(tiles) {
  const cx = tiles.reduce((s, t) => s + t.x, 0) / tiles.length
  const cy = tiles.reduce((s, t) => s + t.y, 0) / tiles.length
  let best = tiles[0]
  let bestDistance = Infinity
  for (const tile of tiles) {
    const d = (tile.x - cx) ** 2 + (tile.y - cy) ** 2
    if (d < bestDistance) { best = tile; bestDistance = d }
  }
  return { x: best.x, y: best.y }
}

function hillShape(bounds) {
  const w = bounds.maxX - bounds.minX + 1
  const h = bounds.maxY - bounds.minY + 1
  const long = Math.max(w, h)
  const short = Math.min(w, h)
  return long >= RIDGE.minLength && long / short >= RIDGE.minRatio ? 'ridge' : 'hill'
}

// Share of the tiles bordering a patch that are forest.
function forestShare(map, tiles) {
  const inside = new Set(tiles.map(positionKey))
  const border = new Map()
  for (const tile of tiles) {
    for (const [dx, dy] of STEPS) {
      const next = { x: tile.x + dx, y: tile.y + dy }
      if (!map.inBounds(next) || inside.has(positionKey(next))) continue
      border.set(positionKey(next), map.terrainAt(next))
    }
  }
  if (border.size === 0) return 0
  return [...border.values()].filter(t => t === 'forest').length / border.size
}

function nameOf(map, tiles) {
  const inside = new Set(tiles.map(positionKey))
  const named = map.landmarks().find(l => inside.has(positionKey(l.position)))
  return named ? named.landmark : null
}

function build(map, kind, tiles, index, extra = {}) {
  const bounds = boundsOf(tiles)
  return {
    id: `${kind}-${index + 1}`,
    kind,
    ...extra,
    name: nameOf(map, tiles),
    tiles: tiles.map(t => ({ x: t.x, y: t.y })),
    size: tiles.length,
    centre: centreOf(tiles),
    bounds
  }
}

function findFeatures(map) {
  const features = []

  for (const { kind, terrain, minSize, through = [] } of RUNS) {
    const joins = [terrain, ...through]
    const runs = components(map, p => joins.includes(map.terrainAt(p)))
      .map(tiles => tiles.filter(t => map.terrainAt(t) === terrain))
      .filter(tiles => tiles.length >= minSize)
    runs.forEach((tiles, i) => {
      const extra = kind === 'hill' ? { shape: hillShape(boundsOf(tiles)) } : {}
      features.push(build(map, kind, tiles, i, extra))
    })
  }

  const clearings = components(map, p => map.terrainAt(p) === CLEARING.terrain)
    .filter(tiles => tiles.length >= CLEARING.minSize && tiles.length <= CLEARING.maxSize)
    .filter(tiles => forestShare(map, tiles) >= CLEARING.minForestShare)
  clearings.forEach((tiles, i) => features.push(build(map, 'clearing', tiles, i)))

  return features
}

// Features never change for a map, so they are worked out once per map.
const cache = new WeakMap()
function detectFeatures(map) {
  if (!cache.has(map)) cache.set(map, findFeatures(map))
  return cache.get(map)
}

// Which feature a tile belongs to, if any, for each kind it could be.
function featuresAt(map, position) {
  const key = positionKey(position)
  return detectFeatures(map).filter(f => f.tiles.some(t => positionKey(t) === key))
}

const KINDS = ['hill', 'woods', 'marsh', 'river', 'ford', 'bridge', 'road', 'clearing']

module.exports = { detectFeatures, featuresAt, KINDS, RIDGE, CLEARING }
