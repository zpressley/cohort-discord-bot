// src/engine/battle/orders.js
//
// What an order can say, and how long it lasts.
//
// An order is { unitRef, action, target?, then? }:
//   move      go to target. On arrival the unit returns to its side's
//             standing orders, or holds if then is 'hold'.
//   hold      stand where you are. A unit that holds is prepared from the
//             next tick (the combat resolver infers it from not moving).
//             Missile troops shoot from where they stand, whatever their
//             order, at any enemy in reach: holdFire stops them, and
//             against (as for ambush) names what to shoot first.
//   defend    go to target if one is given, then hold there. "Set up a
//             defensive position."
//   advance   press the nearest enemy, every tick, until told otherwise.
//   attack    go to target looking for a fight (Stage 3); without a target
//             it is advance. Or (enemy: an enemy unit's id) go for that
//             enemy: at it while the unit's side can see it, else at where
//             its side last saw it (lastSeen), and when no one knows where
//             it went, on the enemy as advance does, until it is seen again.
//             An enemy destroyed, broken or gone from the field: the order
//             becomes advance. It never finishes, as advance does not.
//   withdraw  fall back toward your own home edge, or to target if given,
//             then hold.
//   hide      go to target if one is given, then hide there. Hiding takes a
//             turn standing still; how well it works is the ground's and the
//             unit's (hiding.js). Moving or fighting gives the unit away.
//   check     go to target if one is given, then spend a turn searching the
//             ground: hidden enemies the unit could see if they were not
//             hiding are found. Then hold.
//   ambush    hide (as hide), then lie in wait and strike an enemy that
//             passes within reach (ruled: the player orders ambushes). Once
//             sprung it becomes advance: the unit presses the attack.
//             against: what to strike (null for anything; 'cavalry',
//             'infantry', 'archers', 'scouts', or a unit name); letPass: how
//             many to let go by first; regardless: strike even a unit on
//             guard (by default an ambush springs only on a unit marching,
//             since one on guard is not worth it). An enemy that stops
//             beside the ambush is not struck: the player springs the
//             trap, with any order to attack (ruled 2026-10-29).
//   follow    keep station by another unit of its own side (friend: its id)
//             as it moves: keep 'beside' it (a tile to one side, across the
//             way to the enemy) or 'behind' it (two tiles off, on the side
//             away from the enemy as its side knows him), at its own pace.
//             guard: go at an enemy fighting the unit it keeps by. A unit
//             fighting itself stands and fights. The unit followed broken,
//             gone, or out of sight and not where it was last seen: the
//             order becomes hold, and its side is told (followLost). It
//             never finishes, as hold does not.
//   pitch     a camp battle's (battle/camp.js): pitch the camp at target, or
//             where the unit stands. The unit carrying it goes there and
//             pitches it; another goes to the camp first (pitched or
//             dropped), takes it up, and carries it there. Then hold.
//   strike    a camp battle's: go to the camp and take it up, and carry it
//             (then hold, with it). Neither does anything in a battle with
//             no camps: the unit holds.
//
// Depth (November 2026, docs/design/officers-memory-delegation.md). An order
// may hold more than one thing to do:
//   steps   what to do next, in turn, each a plain order: "to C4, then on to
//           the bridge, then dig in". A step is taken up when the one before
//           it is done (the unit arrived, or finished its search). Standing
//           fast, hiding and pressing the enemy never finish, so nothing
//           after them is reached.
//   when    one condition, and what to do instead if it comes true:
//           { type, do } with type
//             'sees'     the unit sees an enemy (kind: which, as for an
//                        ambush's `against`; near: only within NEAR_TILES
//                        of this place, "if their horse is at the ford")
//             'attacked' it was fought or shot at last turn
//             'breaks'   a named unit of its own side (unitId) has broken
//           It holds through every step until it fires, once.
// How much of this a unit's officer keeps is command/officers.js; a clause
// he lost is marked on the order (when.lost, lostAfter).
//
// Any order that moves may be careful (Stage 3): the unit marches on guard,
// at half speed, and cannot be caught by surprise. Otherwise a moving unit is
// marching.
//
// Seeking a fight (Stage 3, ruled direction): only advance and attack, or a
// unit with no order on a side whose standing order is to advance, look for
// a fight. Two enemy units side by side fight only if one of them is
// seeking one (or they were already fighting).
//
// The older shape still works: { unitRef, target } is a move, and
// { unitRef, target: 'hold' } is a hold.
//
// Orders persist. A unit keeps its last order until it is given a new one
// or the order is done (a move that arrived). Before Stage 2 an order lasted
// one player turn, so a unit sent to a hill three turns away forgot it the
// moment its commander said nothing. Orders submitted in a turn replace the
// unit's order; units never ordered follow their side's standing orders.
//
// Targets here are positions or map labels. Words ("the ridge to the
// east") are turned into positions before an order reaches the engine, by
// whoever can ask the player a question when the words are unclear.

const { toPosition, samePosition } = require('../map/labels')
const { MAX_STEPS } = require('../command/officers')

const ACTIONS = ['move', 'hold', 'defend', 'advance', 'attack', 'withdraw', 'hide', 'check', 'ambush', 'follow', 'pitch', 'strike']
const SEEKING = ['advance', 'attack']

/**
 * Bring any accepted order shape to { action, target, then }.
 * Throws on an unknown action: a typo here would otherwise mean a unit that
 * silently does nothing.
 */
function normalizeOrder(order) {
  const out = normalizeOne(order)
  const steps = (order.steps ?? []).slice(0, MAX_STEPS).map(normalizeOne)
  if (steps.length > 0) out.steps = steps
  if (order.when) out.when = normalizeWhen(order.when)
  if (order.lostAfter) out.lostAfter = true
  return out
}

const WHEN_TYPES = ['sees', 'attacked', 'breaks']
// How near a place an enemy must be for "if they are there".
const NEAR_TILES = 3

function normalizeWhen(when) {
  if (!WHEN_TYPES.includes(when.type)) throw new Error(`unknown order condition: ${when.type}`)
  if (!when.do) throw new Error('an order condition needs something to do')
  if (when.type === 'breaks' && !when.unitId) throw new Error('"if a unit breaks" needs the unit')
  return {
    type: when.type,
    ...(when.type === 'sees' ? { kind: when.kind ?? null, near: when.near ? toPosition(when.near) : null } : {}),
    ...(when.type === 'breaks' ? { unitId: when.unitId } : {}),
    do: normalizeOne(when.do),
    ...(when.lost ? { lost: true } : {})
  }
}

// The order a unit takes up when the one it has is done: the next step, with
// the rest of the chain and its condition; null when nothing follows.
function nextStep(order) {
  if (!order?.steps?.length) return null
  const [next, ...rest] = order.steps
  const out = { ...next }
  if (rest.length > 0) out.steps = rest
  if (order.when) out.when = order.when
  if (order.lostAfter) out.lostAfter = true
  return out
}

function normalizeOne(order) {
  if (order.action) {
    if (!ACTIONS.includes(order.action)) throw new Error(`unknown order action: ${order.action}`)
    const target = order.target && order.target !== 'hold' ? toPosition(order.target) : null
    const holdsAfter = order.action === 'defend' || order.action === 'withdraw'
    const then = order.then ?? (holdsAfter ? 'hold' : null)
    if (order.action === 'defend' && !target) return { action: 'hold', target: null, then: null }
    if (order.action === 'move' && !target) throw new Error('a move order needs a target')
    // An attack on a named enemy goes where that enemy is, not to a place.
    if (order.action === 'attack' && order.enemy) return withCareful({ action: 'attack', target: null, then: null }, order)
    if (order.action === 'attack' && !target) return withCareful({ action: 'advance', target: null, then: null }, order)
    // Keeping by another unit goes where that unit is, not to a place.
    if (order.action === 'follow') {
      if (!order.friend) throw new Error('a follow order needs the unit to follow')
      return withCareful({
        action: 'follow', target: null, then: null, friend: order.friend,
        keep: order.keep === 'behind' ? 'behind' : 'beside', ...(order.guard ? { guard: true } : {})
      }, order)
    }
    return withCareful({ action: order.action, target, then }, order)
  }
  if (!order.target || order.target === 'hold') return { action: 'hold', target: null, then: null }
  return withCareful({ action: 'move', target: toPosition(order.target), then: null }, order)
}

/**
 * Decide this tick's movement order for one unit from its standing order.
 *
 * @param {Object} unit
 * @param {Object|undefined} order  normalized, from the battle's order book
 * @param {Object} context          { fresh, nearestEnemy(unit), homeTarget(unit), namedEnemy(unit, id), followed(unit, order) }
 *   fresh: the order was submitted this player turn
 *   namedEnemy: where the unit's side knows that enemy to be ({ position }),
 *   null when it has lost it, { gone: true } when it is beaten or gone
 *   followed: for a follow order, { to } where to stand (null: where it
 *   is), { join } an enemy to go at, or { lost } why it can keep by it no
 *   longer; seenAt where it last saw the unit it keeps by
 * @returns {{ move: {unitId, target}|null, order: Object|undefined, quarryGone?: string, joins?: boolean, followLost?: { on, why } }}
 *   move null means "use the side's standing orders"; order is what the
 *   unit's standing order becomes (undefined when it is done)
 */
function planUnit(unit, order, context) {
  if (!order) return { move: null, order: undefined }

  switch (order.action) {
    case 'hold':
      return { move: { unitId: unit.id, target: 'hold' }, order }

    case 'advance': {
      const enemy = context.nearestEnemy(unit)
      return { move: enemy ? { unitId: unit.id, target: enemy.position } : { unitId: unit.id, target: 'hold' }, order }
    }

    case 'hide':
    case 'ambush':
    case 'check': {
      // Go there first, if told where; then stand still for the turn the
      // hiding or the search takes. The battle settles both at turn's end.
      if (order.target && !samePosition(order.target, unit.position)) {
        return { move: { unitId: unit.id, target: order.target }, order }
      }
      return { move: { unitId: unit.id, target: 'hold' }, order }
    }

    case 'attack':
      if (order.enemy) {
        const quarry = context.namedEnemy?.(unit, order.enemy) ?? null
        if (quarry?.gone) {
          // Beaten or gone: press the enemy instead, as advance does.
          const { enemy, ...rest } = order
          return { ...planUnit(unit, { ...rest, action: 'advance', target: null }, context), quarryGone: enemy }
        }
        // In sight or last seen: at it. Lost: on the enemy, as advance does,
        // still keeping the order, so it goes for it again once it is seen.
        const at = quarry ?? context.nearestEnemy(unit)
        return { move: at ? { unitId: unit.id, target: at.position } : { unitId: unit.id, target: 'hold' }, order }
      }
    // falls through: an attack on a place is a move looking for a fight
    case 'move':
    case 'defend':
    case 'withdraw': {
      const target = order.target ?? context.homeTarget(unit)
      if (!samePosition(target, unit.position)) {
        return { move: { unitId: unit.id, target }, order }
      }
      // At the target, with more to do: take up the next step at once. With
      // more that the officer has lost, say so (the battle decides what he
      // does instead).
      const next = nextStep(order)
      if (next) return planUnit(unit, next, context)
      if (order.lostAfter) return { move: null, order: undefined, lostThread: true }
      // At the target. In the turn it was given, the order stands (the unit
      // simply has nowhere to go, as before Stage 2). Afterwards it is done:
      // dig in if told to, else back to the side's standing orders.
      if (context.fresh) return { move: { unitId: unit.id, target }, order }
      if (order.then === 'hold') {
        const holding = withCareful({ action: 'hold', target: null, then: null }, { holdFire: order.holdFire, against: order.against })
        return { move: { unitId: unit.id, target: 'hold' }, order: holding }
      }
      return { move: null, order: undefined }
    }

    case 'pitch':
    case 'strike': {
      // Where the camp work takes the unit this tick (battle/camp.js):
      // the camp to take up, or the place to pitch it. The battle settles
      // the taking up and the pitching at the tick's end.
      const to = context.campWay?.(unit, order) ?? null
      if (to && !samePosition(to, unit.position)) return { move: { unitId: unit.id, target: to }, order }
      return { move: { unitId: unit.id, target: 'hold' }, order }
    }

    case 'follow': {
      const way = context.followed?.(unit, order) ?? { lost: 'gone' }
      if (way.lost) {
        return { move: { unitId: unit.id, target: 'hold' }, order: { action: 'hold', target: null, then: null }, followLost: { on: order.friend, why: way.lost } }
      }
      const kept = way.seenAt && !samePosition(way.seenAt, order.seenAt ?? { x: -1, y: -1 }) ? { ...order, seenAt: { ...way.seenAt } } : order
      if (way.join) return { move: { unitId: unit.id, target: way.join }, order: kept, joins: true }
      if (!way.to || samePosition(way.to, unit.position)) return { move: { unitId: unit.id, target: 'hold' }, order: kept }
      return { move: { unitId: unit.id, target: way.to }, order: kept }
    }

    default:
      throw new Error(`unknown order action: ${order.action}`)
  }
}

// The optional parts of an order are carried only when set, so plain orders
// keep their old shape.
function withCareful(normalized, order) {
  const out = { ...normalized }
  if (order.careful) out.careful = true
  // Missile troops: hold their fire, or shoot a kind of enemy first.
  if (order.holdFire) out.holdFire = true
  if (order.against && normalized.action !== 'ambush') out.against = order.against
  // The enemy unit an attack is aimed at.
  if (order.enemy && normalized.action === 'attack') out.enemy = order.enemy
  if (normalized.action === 'ambush') {
    out.against = order.against ?? null
    out.letPass = Math.max(0, Math.floor(order.letPass ?? 0))
    out.regardless = Boolean(order.regardless)
  }
  return out
}

// Is this unit looking for a fight? Its own order decides; a unit with none
// follows its side's standing order.
function isSeeking(order, standingOrder) {
  if (order) return SEEKING.includes(order.action)
  return standingOrder === 'advance'
}

module.exports = { normalizeOrder, planUnit, nextStep, isSeeking, ACTIONS, SEEKING, WHEN_TYPES, NEAR_TILES }
