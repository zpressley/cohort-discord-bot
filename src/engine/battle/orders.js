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
//   withdraw  fall back toward your own home edge, or to target if given,
//             then hold.
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

const ACTIONS = ['move', 'hold', 'defend', 'advance', 'withdraw']

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
    return { action: order.action, target, then }
  }
  if (!order.target || order.target === 'hold') return { action: 'hold', target: null, then: null }
  return { action: 'move', target: toPosition(order.target), then: null }
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

    case 'move':
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

module.exports = { normalizeOrder, planUnit, ACTIONS }
