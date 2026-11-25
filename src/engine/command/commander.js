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
//     The only total loss: a held Commander is never killed.
//   - Taken: he gives no orders. His units fight on with the orders they
//     have. He is free again if the unit that holds him breaks or is
//     destroyed, or when his army wins.
//   - While taken he may bargain (ruled 2026-11-23: "The captive names a
//     price, the captor rejects or asks for more, this continues each turn
//     til the battle ends or the captive surrenders, or loses their army"):
//     each player turn he may put one offer on the table, any of his units
//     still on the field, or none (the field alone). The captor need not
//     answer; if he accepts, the battle is lost as a yield, the units go to
//     the enemy, and he is free. The game holds the table
//     (orchestrator.js, `parley`); the computer's answers are
//     opponent/captor.js.
//   - While he is held his officers run their own units, each by his nature
//     (ownCommand in command/officers.js; ruled 2026-11-23: "each commander
//     is running his own unit at that point").
//   - He sees only what can be seen from where he is held (heldSight).
//   - If the battle ends, not won, while he is still held and no deal was
//     struck, honor lets him go, with whatever is left of his army at the
//     end of the battle (heldWhenTheBattleEnds; ruled 2026-11-23: "They
//     get whatever is left at the end of the battle"). If nothing is left
//     he is "a commander of none". Held, he is never killed, and cannot
//     yield by his own word: the field is his to offer, or his senior
//     officer's to yield (battle.js, whoYields).
//   - Held, a disloyal officer's men desert; a loyal one goes for the men
//     who hold him (battle.js; LOYALTY in tables.js).
//   - Free, he may ride with another of his units, one within a tile of the
//     unit he is with (canRide; ruled 2026-11-23).
//
// Pure: the caller supplies the random stream and the tick's events.

const { COMMANDER, RIDE, QUALITY_ORDER } = require('../combat/tables')
const { canSee } = require('../map/sight')

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
      // Caught running (his unit broken and pursued) is as bad as overrun.
      const caught = events.some(e => e.type === 'pursuit' && e.unitId === c.unitId)
      const chance = gone ? COMMANDER.OVERRUN
        : Math.max(caught ? COMMANDER.CAUGHT : 0, share <= COMMANDER.THRESHOLD ? COMMANDER.CHANCE : 0)
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
          // (Caught as his men ran: the dispatch says so.)
          out.push({ type: 'commanderTaken', fields: { side, unitId: c.unitId, by: strikers[0], ...(caught && broken.has(c.unitId) ? { running: true } : {}) } })
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
 * A Commander still in the enemy's hands when his battle ends, not won,
 * with no deal struck. Ruled 2026-11-23: "Honor binds a commander from
 * killing his foe, but if he won't surrender the field to save his men
 * then he leaves a commander of none." And, asked what he is left with:
 * "They get whatever is left at the end of the battle." He goes free,
 * alive, with what the battle left him: the officers and units that came
 * through it, by the same fates as any battle. An army fought to nothing
 * leaves him a commander of none; that is the fighting's doing, and no
 * rule's.
 *
 * The one place this rule lives. (First the enemy took his best unit left;
 * then, for a day, every officer left him whatever had come through.)
 */
function heldWhenTheBattleEnds() {
  return { fate: 'released', price: null, prices: [] }
}

/**
 * What became of a side's Commander once the battle is decided.
 *
 * @param {Object} o  { commanders, world, outcome, bargained }
 *   bargained  { side, units } when a deal bought his freedom mid-battle
 *              (units: the ids given; none when he gave the field alone)
 * @returns {{ fate: 'free'|'freed'|'ransomed'|'killed'|'released', price: string|null, prices: string[] }|null}
 *   freed     held, and his army won: the enemy had to give him up
 *   ransomed  his freedom had a price: the units in `prices` (`price`, the
 *             first; none when the field alone was the price)
 *   released  held as the battle ended, not won, with no deal: honor lets
 *             him go, with whatever of his army is left
 *             (heldWhenTheBattleEnds)
 */
function commanderFate({ commanders, world, outcome, bargained = null }, side) {
  const c = commanders?.[side]
  if (!c) return null
  const none = { price: null, prices: [] }
  if (c.status === 'killed') return { fate: 'killed', ...none }
  if (bargained?.side === side) {
    const prices = bargained.units ?? (bargained.unitId ? [bargained.unitId] : [])
    return { fate: 'ransomed', price: prices[0] ?? null, prices: [...prices] }
  }
  if (c.status !== 'held') return { fate: 'free', ...none }
  if (outcome.winner === side) return { fate: 'freed', ...none }
  return heldWhenTheBattleEnds()
}

// The eight tiles round a tile, and the tile itself.
const tilesApart = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

/**
 * May a free Commander ride over to this unit of his? Only to one of his
 * own on the field, not broken, within RIDE.REACH of the unit he is with.
 *
 * @returns {{ ok: true }|{ ok: false, why: 'held'|'not free'|'same'|'not yours'|'gone'|'broken'|'too far', tiles?: number }}
 */
function canRide(commanders, world, broken, side, unitId) {
  const c = commanders?.[side]
  if (!c || c.status === 'held') return { ok: false, why: 'held' }
  if (c.status !== 'free') return { ok: false, why: 'not free' }
  if (c.unitId === unitId) return { ok: false, why: 'same' }
  const to = world.units.find(u => u.id === unitId)
  if (!to || to.side !== side) return { ok: false, why: 'not yours' }
  if (to.strength <= 0) return { ok: false, why: 'gone' }
  if (broken.has(unitId)) return { ok: false, why: 'broken' }
  const from = onField(world, c.unitId)
  const tiles = from ? tilesApart(from.position, to.position) : Infinity
  if (tiles > RIDE.REACH) return { ok: false, why: 'too far', tiles }
  return { ok: true }
}

/**
 * What a held Commander can see from where he is held (ruled 2026-11-23:
 * "You see everything around your position, not everything. You get
 * updates from the captors' point of view... as if you are sitting nearby
 * as reports come in"): the unit that holds him, and every unit, his or
 * theirs, that it can see. Hidden units are seen only as closely as their
 * cover allows, as for any viewer.
 *
 * @returns {{ captor: Object|null, seen: Set<string> }|null}  null when he is not held
 */
function heldSight({ commanders, world, map, hidden = new Map(), fledUnits = [] }, side) {
  const c = commanders?.[side]
  if (!c || c.status !== 'held') return null
  return sightFrom({ world, map, hidden, fledUnits }, c.heldBy)
}

/** Every unit one unit can see, and itself: heldSight from a given captor. */
function sightFrom({ world, map, hidden = new Map(), fledUnits = [] }, captorId) {
  const captor = world.units.find(u => u.id === captorId) ?? fledUnits.find(u => u.id === captorId) ?? null
  const seen = new Set()
  if (!captor) return { captor: null, seen }
  seen.add(captor.id)
  for (const u of world.units) {
    if (u.id === captor.id) continue
    const options = hidden.has(u.id) ? { seenWithin: hidden.get(u.id).seenWithin } : {}
    if (canSee(map, captor, u, options)) seen.add(u.id)
  }
  return { captor, seen }
}

module.exports = { createCommanders, stepCommanders, commanderFate, bargainChips, heldWhenTheBattleEnds, canRide, heldSight, sightFrom }
