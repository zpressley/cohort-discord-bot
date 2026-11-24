// src/engine/battle/skirmish.js
//
// Fire and retreat (ruled 2026-11-24: "Fire and retreat is ok"; "No firing
// on the move"; docs/design/army-balance.md part 7). A missile unit told to
// press the enemy closes until it can shoot, and stands there shooting
// (battle.js). When an enemy it can outmarch comes within reach, it falls
// back out of reach, still in shot if it can, and shoots again when it
// stands. Falling back is a march like any other: the unit's own pace, over
// the ground as it is, no dearer than any march; foot do not shoot on a
// tick they moved, horse archers shoot as they ride, as they always have.
//
// No man is slower for his kit (Marathon: hoplites ran). So foot cannot get
// away from foot: only horse outmarch foot, and nothing outmarches horse.
// With an enemy among those coming on that it cannot outmarch, it stands
// and shoots until it is caught. The field's edges and ground that cannot
// be crossed pin it.
//
// A unit ordered to hold, to stand, to hide or to march somewhere, or one
// already fighting, does not fall back: only one pressing the enemy.
//
// Pure: positions, kit and numbers in, a tile out.

const T = require('../combat/tables')
const { missileRange } = require('../combat/ranged')
const { tileDistance } = require('../world')
const { visionRange } = require('../map/sight')

/** Does this unit fire and retreat: has it a missile weapon? */
function canSkirmish(unit) {
  return missileRange(unit) > 0
}

/** Can this unit get away from that enemy: does its march beat his? */
function outruns(unit, enemy) {
  if (T.SKIRMISH.FROM === 'any') return true
  return unit.movementRange > enemy.movementRange
}

// The order of preference among the places a skirmisher could fall back to.
const KEYS = [['safe', 1], ['shoot', 1], ['away', 1], ['straight', 1], ['steps', -1]]
function better(c, best) {
  for (const [key, sign] of KEYS) if (c[key] !== best[key]) return sign * (c[key] - best[key]) > 0
  return c.tile.y < best.tile.y || (c.tile.y === best.tile.y && c.tile.x < best.tile.x)
}

// The tiles a unit can get to this tick, over the ground as it is (woods,
// marsh and hills cost more; rivers cannot be crossed but at a ford or a
// bridge), not through an enemy, with what each costs. As in the movement
// resolver, a first step can always be made.
function reachable(unit, map, enemyAt) {
  const key = (p) => `${p.x},${p.y}`
  const spent = new Map([[key(unit.position), 0]])
  const open = [{ tile: unit.position, cost: 0, steps: 0 }]
  const out = []
  while (open.length > 0) {
    open.sort((a, b) => a.cost - b.cost || a.tile.y - b.tile.y || a.tile.x - b.tile.x)
    const here = open.shift()
    if (here.steps > 0) out.push(here)
    for (const next of map.neighbors(here.tile)) {
      if (!map.passable(next) || enemyAt(next)) continue
      const step = map.moveCost(next)
      const cost = here.cost + step
      if (cost > unit.movementRange && here.steps > 0) continue
      if (spent.has(key(next)) && spent.get(key(next)) <= cost) continue
      spent.set(key(next), cost)
      open.push({ tile: next, cost, steps: here.steps + 1 })
    }
  }
  // (A tile reached twice is kept at its cheaper cost.)
  const best = new Map()
  for (const r of out) if (!best.has(key(r.tile)) || best.get(key(r.tile)).cost > r.cost) best.set(key(r.tile), r)
  return [...best.values()]
}

/** How near an enemy can come to blows with a unit in one tick. */
const reachOf = (enemy, engagementRange) => enemy.movementRange + engagementRange

/**
 * Where a missile unit falls back to this tick, or null if it does not.
 *
 * @param {Object} unit
 * @param {Array}  enemies   enemies its side can see, not broken and not
 *                           locked in a fight
 * @param {Object} o
 * @param {Object} o.map
 * @param {number} o.engagementRange
 * @param {Function} o.enemyAt (tile) => true if an enemy stands there
 * @returns {{ to: {x,y}, from: string[] } | null}  `from`: who it gives ground before
 */
function fallBack(unit, enemies, { map, engagementRange = 1, enemyAt = () => false }) {
  const S = T.SKIRMISH
  if (!canSkirmish(unit)) return null
  const threats = enemies.filter(e =>
    tileDistance(unit.position, e.position) <= reachOf(e, engagementRange) + S.WARY)
  if (threats.length === 0) return null
  // One it cannot outmarch among them: falling back is no use.
  if (threats.some(e => !outruns(unit, e))) return null

  const margin = (tile) => Math.min(...threats.map(e => tileDistance(tile, e.position) - reachOf(e, engagementRange)))
  // In reach of its weapon, and of its own sight (map/sight.js).
  const range = Math.min(missileRange(unit), visionRange(unit, map))
  const canShoot = (tile) => threats.some(e => tileDistance(tile, e.position) <= range)
  let best = null
  for (const { tile, steps } of reachable(unit, map, enemyAt)) {
    const m = margin(tile)
    // Out of reach is what matters; beyond that, being able to shoot,
    // then as far from them as it can get, straight back rather than
    // across their front, and no more running than that takes.
    const straight = Math.min(...threats.map(e => (tile.x - e.position.x) ** 2 + (tile.y - e.position.y) ** 2))
    const c = { tile, safe: Math.min(m, S.WARY + 1), shoot: canShoot(tile) ? 1 : 0, away: m, straight, steps }
    if (!best || better(c, best)) best = c
  }
  // Nowhere better than where it stands (an edge, a river at its back).
  if (!best || best.safe <= Math.min(margin(unit.position), S.WARY + 1)) return null
  return { to: best.tile, from: threats.map(e => e.id).sort() }
}

module.exports = { canSkirmish, outruns, fallBack }
