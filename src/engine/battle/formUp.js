// src/engine/battle/formUp.js
//
// Units sent to the same place by one order form up beside one another
// around it, instead of all making for the one spot and packing onto it
// (the playthrough of November 24, D11: "everyone take the Crownhill" put
// 280 men on one tile, and their crowding blunted their fighting).
//
// Done here, as orders reach the battle, so it is the same for a player's
// orders and the computer's. Which orders: a move, a stand ("defend") or a
// fall back to a place, two or more units of one side given the same one in
// the same turn, with nothing after it (no steps, no condition). Not an
// attack on a place or on an enemy (units sent into the same fight go
// together), not hiding, searching or lying in wait (they are for the one
// spot's cover), and not an advance (it has no place).
//
// How: one tile each, in a line across the way the enemy lies (seen or last
// seen by the side, else his edge of the field), the middle of the line on
// the spot. Tiles a unit could not stand on (water, ground it cannot
// enter), and tiles its own side's other units stand on, are left out; a
// tile off the spot's own kind of ground (off the hill, say) is dearer, so
// the line keeps to it while it can, and a second rank forms behind when the
// first runs out. Each unit takes the place on its own side of the line, so
// they do not cross one another to get there. Pure and deterministic.

const { tables: T } = require('../combat')
const { samePosition, positionKey, toPosition } = require('../map/labels')

const ALONGSIDE = ['move', 'defend', 'withdraw']
const NOT_ON = ['river']

// The way the enemy lies from a place, as a unit vector; null if unknown.
function enemyWay(spot, enemies, edge) {
  if (enemies.length > 0) {
    const near = [...enemies].sort((a, b) => dist(a, spot) - dist(b, spot) || a.x - b.x || a.y - b.y)[0]
    const d = { x: near.x - spot.x, y: near.y - spot.y }
    const n = Math.hypot(d.x, d.y)
    if (n > 0) return { x: d.x / n, y: d.y / n }
  }
  switch (edge) {
    case 'east': return { x: 1, y: 0 }
    case 'west': return { x: -1, y: 0 }
    case 'north': return { x: 0, y: -1 }
    case 'south': return { x: 0, y: 1 }
    default: return null
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) }

/**
 * @param {Array} orders   one side's orders this turn, one per unit ({ unitId, action, target, ... })
 * @param {Object} ctx     { map, units: that side's living units, others: tiles (keys) of the side's
 *                         units not in these orders, enemies: positions the side sees or last saw,
 *                         enemyEdge: the enemy's home edge }
 * @returns {Array} the orders, those formed up with a target of their own
 */
function formUp(orders, { map, units, others = new Set(), enemies = [], enemyEdge = null }) {
  const groups = new Map()
  for (const o of orders) {
    if (!ALONGSIDE.includes(o.action) || !o.target || o.target === 'hold' || o.steps?.length || o.when) continue
    let at
    try { at = toPosition(o.target) } catch { continue }
    const key = `${o.action}|${positionKey(at)}|${o.careful ? 1 : 0}|${o.then ?? ''}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(o)
  }
  const placed = new Map()
  const taken = new Set(others)
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const spot = toPosition(group[0].target)
    const way = enemyWay(spot, enemies, enemyEdge) ?? { x: 1, y: 0 }
    const across = { x: -way.y, y: way.x }
    const kind = map.terrainAt(spot)
    const R = T.FORM_UP.REACH
    // Only ground joined to the spot within reach (not across a river
    // from it): flooded out from the spot.
    const stand = (t) => map.inBounds(t) && map.passable(t) && !NOT_ON.includes(map.terrainAt(t))
    const joined = new Set([positionKey(spot)])
    const queue = [spot]
    while (queue.length > 0) {
      const at = queue.shift()
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = { x: at.x + ox, y: at.y + oy }
        if (Math.abs(t.x - spot.x) > R || Math.abs(t.y - spot.y) > R || joined.has(positionKey(t)) || !stand(t)) continue
        joined.add(positionKey(t))
        queue.push(t)
      }
    }
    const slots = []
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const tile = { x: spot.x + dx, y: spot.y + dy }
        const centre = dx === 0 && dy === 0
        if (!centre && (!joined.has(positionKey(tile)) || taken.has(positionKey(tile)))) continue
        const lateral = dx * across.x + dy * across.y
        const depth = dx * way.x + dy * way.y
        const cost = centre ? -1
          : Math.abs(lateral) + T.FORM_UP.DEPTH * Math.abs(depth) + (depth > 0.5 ? T.FORM_UP.AHEAD : 0) +
            (map.terrainAt(tile) !== kind ? T.FORM_UP.OFF_GROUND : 0)
        slots.push({ tile, lateral, cost })
      }
    }
    slots.sort((a, b) => a.cost - b.cost || a.lateral - b.lateral || a.tile.y - b.tile.y || a.tile.x - b.tile.x)
    // The units who can stand there, each to the place on its own side.
    const mine = group.map(o => ({ o, unit: units.find(u => u.id === o.unitId) })).filter(m => m.unit)
    const chosen = []
    for (const s of slots) {
      if (chosen.length >= mine.length) break
      chosen.push(s)
    }
    if (chosen.length < mine.length) continue
    const along = (p) => p.x * across.x + p.y * across.y
    const byLine = [...chosen].sort((a, b) => a.lateral - b.lateral || a.cost - b.cost)
    const byUnit = [...mine].sort((a, b) => along(a.unit.position) - along(b.unit.position) || a.unit.id.localeCompare(b.unit.id))
    byUnit.forEach((m, i) => {
      const tile = byLine[i].tile
      taken.add(positionKey(tile))
      placed.set(m.o.unitId, tile)
    })
  }
  if (placed.size === 0) return orders
  return orders.map(o => (placed.has(o.unitId) && !samePosition(placed.get(o.unitId), toPosition(o.target)) ? { ...o, target: { ...placed.get(o.unitId) } } : o))
}

module.exports = { formUp }
