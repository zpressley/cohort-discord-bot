// src/engine/map/deploy.js
//
// Put an army on a map it was not drawn for. A scenario's units keep their
// formation (where each stands relative to the others), and the whole
// formation is set down on open ground near the map's deployment spot for
// that side's home edge (a map file's `deploy`, or a third of the way in
// from that edge). Pure and deterministic: the same map and army always
// form up the same way.

const { toPosition } = require('./labels')

// Ground an army does not form up on.
const NOT_HERE = ['river', 'marsh', 'ford', 'bridge']

function defaultSpot(map, edge) {
  const midX = Math.floor(map.width / 2)
  const midY = Math.floor(map.height / 2)
  switch (edge) {
    case 'west': return { x: Math.floor(map.width / 3), y: midY }
    case 'east': return { x: Math.floor(map.width * 2 / 3), y: midY }
    case 'north': return { x: midX, y: Math.floor(map.height / 3) }
    case 'south': return { x: midX, y: Math.floor(map.height * 2 / 3) }
    default: return { x: midX, y: midY }
  }
}

// Candidate centres, nearest first, in a fixed order.
function* around(spot, radius) {
  yield spot
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r) yield { x: spot.x + dx, y: spot.y + dy }
      }
    }
  }
}

/**
 * @param {Object} map      a built map (createMap/resolveMap)
 * @param {Array}  units    the scenario's units (positions as labels or {x,y})
 * @param {Object} sides    the scenario's sides: { red: { homeEdge }, ... }
 * @param {Object} [spots]  { west: {x,y}, east: {x,y}, ... }, else the map's
 *                          own `deploy`, else a third of the way in
 * @returns {Array} the units, each with a new { x, y } position
 */
function deployArmies(map, units, sides, spots = map.deploy ?? {}) {
  spots = spots ?? {}
  const taken = new Set()
  const placed = new Map()
  const ok = (p) => map.inBounds(p) && map.passable(p) && !NOT_HERE.includes(map.terrainAt(p)) && !taken.has(`${p.x},${p.y}`)

  for (const side of Object.keys(sides)) {
    const army = units.filter(u => u.side === side)
    if (army.length === 0) continue
    const at = army.map(u => toPosition(u.position))
    const cx = Math.round(at.reduce((s, p) => s + p.x, 0) / at.length)
    const cy = Math.round(at.reduce((s, p) => s + p.y, 0) / at.length)
    const offsets = at.map(p => ({ x: p.x - cx, y: p.y - cy }))
    const edge = sides[side].homeEdge ?? 'west'
    const spot = spots[edge] ?? defaultSpot(map, edge)

    // The whole formation where it fits, nearest the spot first.
    let centre = null
    for (const c of around(spot, 12)) {
      if (offsets.every(o => ok({ x: c.x + o.x, y: c.y + o.y }))) { centre = c; break }
    }
    army.forEach((unit, i) => {
      let p = centre ? { x: centre.x + offsets[i].x, y: centre.y + offsets[i].y } : null
      // No room for the formation: each unit takes the nearest open ground.
      if (!p) for (const c of around({ x: spot.x + offsets[i].x, y: spot.y + offsets[i].y }, 15)) { if (ok(c)) { p = c; break } }
      if (!p) throw new Error(`no ground on ${map.name} to deploy ${unit.id}`)
      taken.add(`${p.x},${p.y}`)
      placed.set(unit.id, p)
    })
  }
  return units.map(u => (placed.has(u.id) ? { ...u, position: placed.get(u.id) } : u))
}

module.exports = { deployArmies }
