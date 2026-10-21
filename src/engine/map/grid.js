// src/engine/map/grid.js
//
// The player-facing grid (ruled 2026-10-21): letters for columns, numbers for
// rows, every square 100 m on every map, each split into four 50 m quarters.
//
//   C7      a square: 4x4 tiles of 25 m
//   C7-NE   a quarter: 2x2 tiles (NW, NE, SW, SE)
//
// Bigger maps simply have more squares: a 2 km map is 20x20 (A-T, 1-20),
// Crownhill (1 km) is 10x10 (A-J, 1-10). The engine keeps its numeric x,y;
// this module only translates. Tile labels (labels.js) stay for scenario
// files and tests; players see and type grid references.

const { isPosition } = require('./labels')

const SQUARE_TILES = 4   // 100 m / 25 m
const QUARTER_TILES = 2  // 50 m
const QUARTERS = { NW: [0, 0], NE: [1, 0], SW: [0, 1], SE: [1, 1] }
const QUARTER_WORDS = {
  nw: 'NW', ne: 'NE', sw: 'SW', se: 'SE',
  northwest: 'NW', northeast: 'NE', southwest: 'SW', southeast: 'SE',
  'north-west': 'NW', 'north-east': 'NE', 'south-west': 'SW', 'south-east': 'SE'
}

function letters(n) {
  let s = ''
  let k = n + 1
  while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26) }
  return s
}

function lettersToIndex(text) {
  let n = 0
  for (const ch of text.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** How many squares the map has across and down. */
function gridSize(map) {
  return { columns: Math.ceil(map.width / SQUARE_TILES), rows: Math.ceil(map.height / SQUARE_TILES) }
}

/**
 * The grid reference for a tile: "C7", or with { quarter: true } "C7-NE".
 */
function gridLabel(position, { quarter = false } = {}) {
  if (!isPosition(position)) throw new Error(`not a position: ${JSON.stringify(position)}`)
  const col = Math.floor(position.x / SQUARE_TILES)
  const row = Math.floor(position.y / SQUARE_TILES)
  const square = `${letters(col)}${row + 1}`
  if (!quarter) return square
  const qx = Math.floor((position.x % SQUARE_TILES) / QUARTER_TILES)
  const qy = Math.floor((position.y % SQUARE_TILES) / QUARTER_TILES)
  const name = Object.keys(QUARTERS).find(k => QUARTERS[k][0] === qx && QUARTERS[k][1] === qy)
  return `${square}-${name}`
}

const GRID_REF = /^([a-z]{1,2})\s*(\d{1,3})(?:\s*[- ]?\s*(nw|ne|sw|se|north[- ]?west|north[- ]?east|south[- ]?west|south[- ]?east))?$/i

/** Does this text look like a grid reference? */
function isGridRef(text) {
  return GRID_REF.test(String(text ?? '').trim())
}

/**
 * Read a grid reference into the tiles it covers.
 * @returns {{ label, tiles: {minX,maxX,minY,maxY} } | null}
 */
function parseGridRef(text) {
  const match = String(text ?? '').trim().match(GRID_REF)
  if (!match) return null
  const col = lettersToIndex(match[1])
  const row = parseInt(match[2], 10) - 1
  if (row < 0) return null
  let minX = col * SQUARE_TILES
  let minY = row * SQUARE_TILES
  let size = SQUARE_TILES
  let label = `${letters(col)}${row + 1}`
  if (match[3]) {
    const key = QUARTER_WORDS[match[3].toLowerCase().replace(/\s+/g, '')] ??
      QUARTER_WORDS[match[3].toLowerCase().replace(/[- ]/g, '')]
    const [qx, qy] = QUARTERS[key]
    minX += qx * QUARTER_TILES
    minY += qy * QUARTER_TILES
    size = QUARTER_TILES
    label += `-${key}`
  }
  return { label, tiles: { minX, maxX: minX + size - 1, minY, maxY: minY + size - 1 } }
}

/**
 * Where an order to a grid reference goes: the passable tile nearest the
 * middle of the square or quarter. A square that is all river or off the
 * map gives a reason instead.
 * @returns {{ position, label } | { none }}
 */
function gridTarget(map, text) {
  const ref = parseGridRef(text)
  if (!ref) return { none: `"${text}" is not a grid reference` }
  const { minX, maxX, minY, maxY } = ref.tiles
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  let best = null
  let bestD = Infinity
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = { x, y }
      if (!map.passable(p)) continue
      const d = (x - cx) ** 2 + (y - cy) ** 2
      if (d < bestD) { best = p; bestD = d }
    }
  }
  if (!best) {
    const anyOnMap = map.inBounds({ x: minX, y: minY })
    return { none: anyOnMap ? `${ref.label} cannot be entered` : `${ref.label} is off the map` }
  }
  return { position: best, label: ref.label }
}

module.exports = { gridLabel, gridSize, isGridRef, parseGridRef, gridTarget, SQUARE_TILES, QUARTER_TILES }
