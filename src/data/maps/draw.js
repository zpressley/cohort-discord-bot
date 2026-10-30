// src/data/maps/draw.js
//
// A small sketching kit for authoring maps as shapes instead of long lists
// of tiles: fill a rectangle with woods, lay an ellipse of high ground, run
// a river or a road along a line. Later strokes paint over earlier ones.
// The result is the same plain data every map file exports (terrain lists in
// map labels), so the engine never knows a map was sketched.
//
// Deterministic: no randomness, so a map is the same every time it loads.

function letters(n) {
  let s = ''
  let k = n + 1
  while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26) }
  return s
}
const label = (x, y) => `${letters(x)}${y + 1}`

function sketch(width, height) {
  const grid = Array.from({ length: height }, () => Array(width).fill('plains'))
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height
  const set = (x, y, kind) => { if (inside(x, y)) grid[y][x] = kind }

  const api = {
    set,
    get: (x, y) => (inside(x, y) ? grid[y][x] : null),

    /** Every tile from (x0,y0) to (x1,y1), inclusive. */
    rect(x0, y0, x1, y1, kind) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, kind)
      return api
    },

    /** An ellipse centred on (cx,cy). keep(x,y) can leave tiles out. */
    ellipse(cx, cy, rx, ry, kind, keep = () => true) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
          if (d <= 1 && keep(x, y)) set(x, y, kind)
        }
      }
      return api
    },

    /**
     * A stroke along points [[x,y],...], `width` tiles wide: a river, a road.
     * Only tiles whose current ground passes `over` are painted (so a road
     * can leave the river alone and be bridged or forded separately).
     */
    line(points, kind, { width = 1, over = () => true } = {}) {
      const r = (width - 1) / 2
      for (let i = 0; i < points.length - 1; i++) {
        const [x0, y0] = points[i]
        const [x1, y1] = points[i + 1]
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1
        let prev = null
        const paint = (cx, cy) => {
          for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
            for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
              if (Math.hypot(dx, dy) > r + 0.35) continue
              const tx = cx + dx
              const ty = cy + dy
              if (inside(tx, ty) && over(grid[ty][tx])) set(tx, ty, kind)
            }
          }
        }
        for (let s = 0; s <= steps; s++) {
          const x = Math.round(x0 + (x1 - x0) * s / steps)
          const y = Math.round(y0 + (y1 - y0) * s / steps)
          // Edge to edge, never corner to corner: a diagonal step gets the
          // tile beside it too, so a road or river is one connected line.
          if (prev && prev.x !== x && prev.y !== y) paint(x, prev.y)
          paint(x, y)
          prev = { x, y }
        }
      }
      return api
    },

    /**
     * Where a road meets a river, make the crossing: every run of up to three
     * river tiles with road on both sides (across or along) becomes `kind`
     * (ford or bridge). Returns the crossings made, as [[x, y], ...].
     */
    cross(kind, { road = 'road', river = 'river' } = {}) {
      const made = []
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (const [dx, dy] of [[1, 0], [0, 1]]) {
            if (api.get(x, y) !== road) continue
            let n = 1
            while (n <= 3 && api.get(x + dx * n, y + dy * n) === river) n++
            if (n === 1 || n > 3 || api.get(x + dx * n, y + dy * n) !== road) continue
            for (let k = 1; k < n; k++) { set(x + dx * k, y + dy * k, kind); made.push([x + dx * k, y + dy * k]) }
          }
        }
      }
      return made
    },

    /** The terrain lists a map file exports: { kind: [labels] }, plains left out. */
    terrain() {
      const out = {}
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const kind = grid[y][x]
          if (kind === 'plains') continue
          ;(out[kind] ??= []).push(label(x, y))
        }
      }
      return out
    }
  }
  return api
}

module.exports = { sketch, label }
