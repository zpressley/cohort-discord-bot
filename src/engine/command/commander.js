// src/engine/command/commander.js
//
// The Commander on the field. (The Commander is the player.) He has no men
// of his own: he rides with one of his units and goes where it goes.
//
// Ruled 2026-11-22:
//   "If a commander's unit is attacked and it gets below a threshold the
//   commander can be killed or captured. It's low odds and not possible till
//   a threshold."
//   "Capture means he has to negotiate with the enemy team, he can bargain
//   units. But the other side of this is the units are still in a battle,
//   the captured commander can negotiate and leave the field or wait and his
//   units may win the battle and force a surrender even with their commander
//   captured.... the risk is if you lose all your troops and get captured
//   you don't have much to bargain with or for."
//   "When your commander dies you actually lose everything."
//
// How that is built (tables.COMMANDER holds the numbers):
//   - Each tick his unit is struck hand to hand (or cut down as it runs)
//     while under the threshold of its strength, he may fall: a low chance.
//     If the unit is destroyed around him the chance is higher; if he comes
//     through that, he gets away to another of his units.
//   - When he falls he is taken, or less often killed. He can be killed
//     only when the unit is at a quarter of its strength or less (ruled
//     2026-11-23: "should be lower for death, quarter or less").
//   - Killed: the battle is lost, and (in a campaign) everything with it.
//   - Taken: he gives no orders. His units fight on with the orders they
//     have. He is free again if the unit that holds him breaks or is
//     destroyed, or when his army wins.
//   - While taken he may bargain: give up one of his units still on the
//     field, and leave it. The battle is lost; he is free.
//   - If the battle ends, not won, while he is still held, the enemy takes
//     the best of his units still on the field as his price. With none
//     left he has nothing to bargain with: he is lost, as if killed.
//
// Pure: the caller supplies the random stream and the tick's events.

const { COMMANDER, QUALITY_ORDER } = require('../combat/tables')

/** side -> { unitId, status: 'free'|'held'|'killed'|'away', heldBy } */
function createCommanders(spec) {
  if (!spec.commanders) return null
  return Object.fromEntries(Object.entries(spec.commanders).map(([side, c]) =>
    [side, { unitId: c.unitId, status: 'free', heldBy: null }]))
}

const onField = (world, id) => world.units.find(u => u.id === id && u.strength > 0) ?? null

// Where a Commander goes when the men around him are gone: one of his units
// still on the field, a steady one for choice, the nearest to where he was.
function refuge(world, broken, side, from) {
  const far = (u) => (from ? Math.max(Math.abs(u.position.x - from.x), Math.abs(u.position.y - from.y)) : 0)
  return world.units
    .filter(u => u.side === side && u.strength > 0)
    .sort((a, b) => Number(broken.has(a.id)) - Number(broken.has(b.id)) || far(a) - far(b) || a.id.localeCompare(b.id))[0] ?? null
}

/** His units still on the field: what he has to bargain with, best first. */
function bargainChips(world, side) {
  return world.units
    .filter(u => u.side === side && u.strength > 0)
    .sort((a, b) => QUALITY_ORDER.indexOf(b.quality) - QUALITY_ORDER.indexOf(a.quality) || b.strength - a.strength || a.id.localeCompare(b.id))
}

/**
 * One tick for every Commander on the field.
 *
 * @param {Object} o
 *   commanders  from createCommanders (changed in place)
 *   world, broken, fledUnits   the battle's
 *   events      this tick's events, to tell who struck whom
 *   mustered    Map(unitId -> strength at the start of the battle)
 *   random      seeded, a stream of its own
 * @returns {Array<{ type, fields }>} events to log
 */
function stepCommanders({ commanders, world, broken, fledUnits, events, mustered, random }) {
  const out = []
  const struckBy = new Map()   // unitId -> ids of the enemy units that struck it
  const strike = (id, by) => { if (!struckBy.has(id)) struckBy.set(id, new Set()); struckBy.get(id).add(by) }
  for (const e of events) {
    if (e.type === 'exchange') { strike(e.a.unitId, e.b.unitId); strike(e.b.unitId, e.a.unitId) }
    if (e.type === 'pursuit') strike(e.unitId, e.by)
  }
  const anywhere = (id) => world.units.find(u => u.id === id) ?? null

  for (const side of Object.keys(commanders).sort()) {
    const c = commanders[side]

    if (c.status === 'held') {
      const captor = onField(world, c.heldBy)
      if (captor && !broken.has(captor.id)) continue
      // The men who held him have broken or are gone.
      const to = refuge(world, broken, side, anywhere(c.heldBy)?.position)
      if (!to) continue
      out.push({ type: 'commanderFreed', fields: { side, unitId: to.id, by: c.heldBy } })
      Object.assign(c, { status: 'free', unitId: to.id, heldBy: null })
      continue
    }
    if (c.status !== 'free') continue

    const unit = anywhere(c.unitId)
    const strikers = [...(struckBy.get(c.unitId) ?? [])].sort()
    const gone = !unit || unit.strength <= 0
    let fallen = false
    if (strikers.length > 0) {
      const share = gone ? 0 : unit.strength / (mustered.get(c.unitId) || unit.strength)
      const chance = gone ? COMMANDER.OVERRUN : share <= COMMANDER.THRESHOLD ? COMMANDER.CHANCE : 0
      if (chance > 0 && random() < chance) {
        fallen = true
        // Death comes only when the unit is cut to a quarter or less, or
        // destroyed; above that, a Commander who falls is taken.
        const mayDie = gone || share <= COMMANDER.DEATH_THRESHOLD
        if (random() < COMMANDER.KILLED_SHARE && mayDie) {
          c.status = 'killed'
          out.push({ type: 'commanderKilled', fields: { side, unitId: c.unitId, by: strikers[0] } })
        } else {
          Object.assign(c, { status: 'held', heldBy: strikers[0] })
          out.push({ type: 'commanderTaken', fields: { side, unitId: c.unitId, by: strikers[0] } })
        }
      }
    }
    if (fallen || !gone) continue
    // His unit is destroyed, or has left the field, and he is still free:
    // he gets away to another, or leaves the field with the last of them.
    const from = unit?.position ?? fledUnits.find(u => u.id === c.unitId)?.position
    const to = refuge(world, broken, side, from)
    if (to) {
      out.push({ type: 'commanderMoved', fields: { side, unitId: to.id, from: c.unitId } })
      c.unitId = to.id
    } else {
      c.status = 'away'
    }
  }
  return out
}

/**
 * What became of a side's Commander once the battle is decided.
 *
 * @param {Object} o  { commanders, world, outcome, bargained }
 *   bargained  { side, unitId } when he bought his freedom mid-battle
 * @returns {{ fate: 'free'|'freed'|'ransomed'|'killed'|'lost', price: string|null }|null}
 *   freed     held, and his army won: the enemy had to give him up
 *   ransomed  a unit was the price of his freedom (`price`, its id)
 *   lost      held, the battle not won, and nothing left to bargain with
 */
function commanderFate({ commanders, world, outcome, bargained = null }, side) {
  const c = commanders?.[side]
  if (!c) return null
  if (c.status === 'killed') return { fate: 'killed', price: null }
  if (bargained?.side === side) return { fate: 'ransomed', price: bargained.unitId }
  if (c.status !== 'held') return { fate: 'free', price: null }
  if (outcome.winner === side) return { fate: 'freed', price: null }
  const best = bargainChips(world, side)[0]
  return best ? { fate: 'ransomed', price: best.id } : { fate: 'lost', price: null }
}

module.exports = { createCommanders, stepCommanders, commanderFate, bargainChips }
