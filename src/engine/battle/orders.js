// src/engine/battle/orders.js
//
// What an order can say, and how long it lasts.
//
// An order is { unitRef, action, target?, then? }:
//   move      go to target. On arrival the unit returns to its side's
//             standing orders, or holds if then is 'hold'.
//   hold      stand where you are. A unit that holds is prepared from the
//             next tick (the combat resolver infers it from not moving).
//   defend    go to target if one is given, then hold there. "Set up a
//             defensive position."
//   advance   press the nearest enemy, every tick, until told otherwise.
//   attack    go to target looking for a fight (Stage 3); without a target
//             it is advance.
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

const ACTIONS = ['move', 'hold', 'defend', 'advance', 'attack', 'withdraw', 'hide', 'check', 'ambush']
const SEEKING = ['advance', 'attack']

/**
 * Bring any accepted order shape to { action, target, then }.
 * Throws on an unknown action: a typo here would otherwise mean a unit that
 * silently does nothing.
 */
function normalizeOrder(order) {
  if (order.action) {
    if (!ACTIONS.includes(order.action)) throw new Error(`unknown order action: ${order.action}`)
    const target = order.target && order.target !== 'hold' ? toPosition(order.target) : null
    const holdsAfter = order.action === 'defend' || order.action === 'withdraw'
    const then = order.then ?? (holdsAfter ? 'hold' : null)
    if (order.action === 'defend' && !target) return { action: 'hold', target: null, then: null }
    if (order.action === 'move' && !target) throw new Error('a move order needs a target')
    if (order.action === 'attack' && !target) return withCareful({ action: 'advance', target: null, then: null }, order)
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
 * @param {Object} context          { fresh, nearestEnemy(unit), homeTarget(unit) }
 *   fresh: the order was submitted this player turn
 * @returns {{ move: {unitId, target}|null, order: Object|undefined }}
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

    case 'move':
    case 'attack':
    case 'defend':
    case 'withdraw': {
      const target = order.target ?? context.homeTarget(unit)
      if (!samePosition(target, unit.position)) {
        return { move: { unitId: unit.id, target }, order }
      }
      // At the target. In the turn it was given, the order stands (the unit
      // simply has nowhere to go, as before Stage 2). Afterwards it is done:
      // dig in if told to, else back to the side's standing orders.
      if (context.fresh) return { move: { unitId: unit.id, target }, order }
      if (order.then === 'hold') {
        const holding = { action: 'hold', target: null, then: null }
        return { move: { unitId: unit.id, target: 'hold' }, order: holding }
      }
      return { move: null, order: undefined }
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

module.exports = { normalizeOrder, planUnit, isSeeking, ACTIONS, SEEKING }
