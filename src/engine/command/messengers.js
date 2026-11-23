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
//   - The computer's side, which has no Commander on the field, sends its
//     orders the same way from its best unit, when they come marked so
//     (byCommandPost). What it knows is not delayed.
//
// One search over the whole field (Dijkstra, a binary heap, ties broken by
// tile index so it is the same every time) gives every unit's delay at
// once; on a 40 by 40 field it is a few thousand steps.

const { COMMAND, QUALITY_ORDER } = require('../combat/tables')

const tilesApart = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

// What each tile costs to cross, once for each map.
const stepsOf = new WeakMap()
function stepCosts(map) {
  if (stepsOf.has(map)) return stepsOf.get(map)
  const step = new Float64Array(map.width * map.height)
  for (let i = 0; i < step.length; i++) {
    const p = { x: i % map.width, y: Math.floor(i / map.width) }
    step[i] = map.passable(p) ? map.moveCost(p) : Infinity
  }
  stepsOf.set(map, step)
  return step
}

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
  const step = stepCosts(map)

  // A binary heap of numbers: the cost (in half steps, as every tile's cost
  // is) times the field's size, plus the tile's index. Least cost first,
  // then least index: the same order every time.
  const heap = []
  const push = (v) => {
    heap.push(v)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent] <= v) break
      heap[i] = heap[parent]
      i = parent
    }
    heap[i] = v
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length > 0) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        if (l >= heap.length) break
        const m = l + 1 < heap.length && heap[l + 1] < heap[l] ? l + 1 : l
        if (heap[m] >= last) break
        heap[i] = heap[m]
        i = m
      }
      heap[i] = last
    }
    return top
  }

  push(start)
  const done = new Uint8Array(size)
  while (heap.length > 0) {
    const v = pop()
    const i = v % size
    const c = (v - i) / size / 2
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
      if (nc < cost[j]) { cost[j] = nc; push(Math.round(nc * 2) * size + j) }
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
  if (!c && state.posts?.has(side)) {
    // The computer's side has no Commander on the field: its orders go out
    // from its best unit, as its command post (step 3 of the design).
    const best = state.world.units
      .filter(u => u.side === side && u.strength > 0 && !state.broken.has(u.id))
      .sort((a, b) => QUALITY_ORDER.indexOf(b.quality) - QUALITY_ORDER.indexOf(a.quality) || b.strength - a.strength || a.id.localeCompare(b.id))[0]
    return best ? { unitId: best.id, position: { ...best.position } } : null
  }
  if (!c || c.status !== 'free') return null
  const unit = state.world.units.find(u => u.id === c.unitId && u.strength > 0)
  return unit ? { unitId: unit.id, position: { ...unit.position } } : null
}

/**
 * Does this side send its orders by rider? A side with a Commander on the
 * field does; so does a side whose orders came marked as from a command
 * post (the computer's, in the app: byCommandPost).
 */
const byRider = (state, side) => Boolean(state.commanders?.[side]) || Boolean(state.posts?.has(side))

/**
 * Orders marked to go out by rider from the side's best unit, as the
 * computer's do in the app (it has no Commander on the field). The mark
 * goes into the order log, so a saved battle replays it, and a battle
 * saved before it replays as it was played.
 */
const byCommandPost = (orders) => (Array.isArray(orders) ? orders.map(o => ({ ...o, fromPost: true })) : orders)

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
 * `from` is the unit he will ride with, if he rides over first. `word`, his
 * knowledge (orchestrator/word.js): judged from where he believes each unit
 * stands and the enemy he knows of, so the read-back tells him nothing he
 * could not know (the rider finds out the rest on the road).
 */
function orderDelays(state, side, unitIds, { from = null, word = null } = {}) {
  let world = state.world
  if (word) {
    const own = state.world.units.filter(u => u.side === side)
      .map(u => (word.units[u.id] ? { ...u, position: { ...word.units[u.id].position } } : u))
    const enemies = Object.entries(word.enemies).filter(([, e]) => e.strength > 0)
      .map(([id, e]) => ({ id, side: null, position: { ...e.position }, strength: e.strength }))
    world = { ...state.world, units: [...own, ...enemies] }
  }
  const known = { ...state, world, broken: word ? new Set() : state.broken, hidden: word ? new Map() : state.hidden }
  const post = from ? world.units.find(u => u.id === from && u.side === side && u.strength > 0) : null
  const view = post
    ? riders({ ...known, commanders: { ...state.commanders, [side]: { ...state.commanders[side], unitId: post.id } } }, side)
    : riders(known, side)
  if (!view) return null
  const out = {}
  for (const id of unitIds) {
    const unit = world.units.find(u => u.id === id)
    if (!unit) continue
    const t = view.ticks(unit)
    out[id] = t === Infinity ? Infinity : t * 10
  }
  return out
}

module.exports = { riderCosts, commandPost, byRider, byCommandPost, riders, orderDelays, tilesApart }
