// src/engine/command/messengers.js
//
// Orders and news by rider (docs/design/point-of-view-and-messengers.md).
// Ruled 2026-11-23: "Commands take longer to reach troops farther away,
// there is an immediate range around the commander then outside that range
// every turn of movement by a messenger on horseback is a delay in the
// order... so both ways, you are delayed in hearing back from distant
// troops ... maybe even troops behind enemy lines can't communicate."
//
// How it is built (tables.COMMAND holds the numbers):
//   - Within COMMAND.IMMEDIATE tiles of the Commander (the eight-way count
//     of tiles, as RIDE.REACH is), an order arrives at once.
//   - Beyond it a rider carries it. His way is the cheapest path over the
//     ground from the Commander's tile to the unit's, at the same cost per
//     tile a unit pays (woods and fords slow him as they slow horse; a
//     river without a ford or bridge stops him), and he covers
//     COMMAND.RIDER_PACE of that cost in ten minutes. The delay is that
//     cost over his pace, rounded up to whole ten minutes.
//   - He will not cross a tile within COMMAND.CLEARANCE of an enemy unit
//     he could see: one on the field, not broken and running, not hidden.
//     He may set out from such a tile (the Commander's own) and ride into
//     one (the unit he carries the order to, if it is in a fight), but not
//     ride on through it. No such path: no rider can get through.
//   - News comes back by the same way at the same pace (the one search,
//     from the Commander's tile, serves both).
//
// One search over the whole field (Dijkstra, a binary heap, ties broken by
// tile index so it is the same every time) gives every unit's delay at
// once; on a 40 by 40 field it is a few thousand steps.

const { COMMAND } = require('../combat/tables')

const tilesApart = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

/**
 * What a rider's ride costs from one tile to every tile of the field.
 *
 * @param {Object} o  { map, world, broken: Set, hidden: Map, side, from }
 * @returns {Float64Array} cost per tile (index y * width + x); Infinity
 *   where no rider can get through
 */
function riderCosts({ map, world, broken = new Set(), hidden = new Map(), side, from }) {
  const { width, height } = map
  const size = width * height
  const cost = new Float64Array(size).fill(Infinity)
  // Ground the enemy holds: within CLEARANCE of an enemy unit a rider sees.
  const held = new Uint8Array(size)
  const reach = COMMAND.CLEARANCE
  for (const u of world.units) {
    if (u.side === side || u.strength <= 0 || broken.has(u.id) || hidden.has(u.id)) continue
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = u.position.x + dx
        const y = u.position.y + dy
        if (x >= 0 && x < width && y >= 0 && y < height) held[y * width + x] = 1
      }
    }
  }
  if (!from || !map.inBounds(from)) return cost
  const start = from.y * width + from.x
  cost[start] = 0
  const step = new Float64Array(size)
  for (let i = 0; i < size; i++) {
    const p = { x: i % width, y: Math.floor(i / width) }
    step[i] = map.passable(p) ? map.moveCost(p) : Infinity
  }

  // A binary heap of [cost, index], least cost first, then least index.
  const heap = []
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
  const push = (item) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!less(heap[i], heap[parent])) break
      ;[heap[i], heap[parent]] = [heap[parent], heap[i]]
      i = parent
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && less(heap[l], heap[m])) m = l
        if (r < heap.length && less(heap[r], heap[m])) m = r
        if (m === i) break
        ;[heap[i], heap[m]] = [heap[m], heap[i]]
        i = m
      }
    }
    return top
  }

  push([0, start])
  const done = new Uint8Array(size)
  while (heap.length > 0) {
    const [c, i] = pop()
    if (done[i]) continue
    done[i] = 1
    // He rides into ground the enemy holds, but not on through it.
    if (held[i] && i !== start) continue
    const x = i % width
    const y = (i - x) / width
    const next = [y > 0 ? i - width : -1, y < height - 1 ? i + width : -1, x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1]
    for (const j of next) {
      if (j < 0 || done[j] || step[j] === Infinity) continue
      const nc = c + step[j]
      if (nc < cost[j]) { cost[j] = nc; push([nc, j]) }
    }
  }
  return cost
}

/**
 * Where a side's orders go out from: the unit its Commander rides with,
 * while he is free. Null when he gives none (held, or gone from the field),
 * and for a side with no Commander on the field.
 */
function commandPost(state, side) {
  const c = state.commanders?.[side]
  if (!c || c.status !== 'free') return null
  const unit = state.world.units.find(u => u.id === c.unitId && u.strength > 0)
  return unit ? { unitId: unit.id, position: { ...unit.position } } : null
}

/** Does this side send its orders, and hear its news, by rider? */
const byRider = (state, side) => Boolean(state.commanders?.[side])

/**
 * How long a rider takes from a side's command post to each of its units,
 * as they stand now.
 *
 * @returns {{ post, ticks: (unit) => number }|null}  ticks: 0 within the
 *   immediate range, Infinity when no rider can get through; null when the
 *   side sends no orders at all (its Commander held, or none on the field)
 */
function riders(state, side) {
  const post = commandPost(state, side)
  if (!post) return null
  const costs = riderCosts({ map: state.map, world: state.world, broken: state.broken, hidden: state.hidden, side, from: post.position })
  const ticks = (unit) => {
    if (tilesApart(unit.position, post.position) <= COMMAND.IMMEDIATE) return 0
    const c = costs[unit.position.y * state.map.width + unit.position.x]
    return c === Infinity ? Infinity : Math.max(1, Math.ceil(c / COMMAND.RIDER_PACE - 1e-9))
  }
  return { post, ticks }
}

/**
 * How long an order to each of these units of his would take, if he gave
 * it now, for the read-back: { unitId: minutes } (0 at once), with
 * Infinity for a unit no rider can reach. Null when he sends none.
 * `from` is the unit he will ride with, if he rides over first.
 */
function orderDelays(state, side, unitIds, { from = null } = {}) {
  const post = from ? state.world.units.find(u => u.id === from && u.side === side && u.strength > 0) : null
  const view = post
    ? riders({ ...state, commanders: { ...state.commanders, [side]: { ...state.commanders[side], unitId: post.id } } }, side)
    : riders(state, side)
  if (!view) return null
  const out = {}
  for (const id of unitIds) {
    const unit = state.world.units.find(u => u.id === id)
    if (!unit) continue
    const t = view.ticks(unit)
    out[id] = t === Infinity ? Infinity : t * 10
  }
  return out
}

module.exports = { riderCosts, commandPost, byRider, riders, orderDelays, tilesApart }
