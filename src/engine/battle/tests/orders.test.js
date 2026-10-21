// src/engine/battle/tests/orders.test.js
//
// What an order can say (move, hold, defend, advance, withdraw) and how long
// it lasts. Orders persist until replaced or done. Fixtures sit on the open
// plain in Crownhill's south-middle (rows 23-26, columns J-T).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { normalizeOrder } = require('../orders')
const { createBattleState, stepTurn, runBattle } = require('../battle')
const { toLabel } = require('../../map/labels')

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: 'J24',
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}

function spec(overrides = {}) {
  return {
    name: 'orders',
    sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
    units: [unit({ id: 'mover' }), unit({ id: 'far_enemy', side: 'blue', position: 'AC40' })],
    maxTurns: 10,
    ...overrides
  }
}

const where = (state, id) => toLabel(state.world.units.find(u => u.id === id).position)
const eventsOf = (state, type, id) => state.log.all().filter(e => e.type === type && e.unitId === id)

// ── Shapes ─────────────────────────────────────────────

test('order shapes: the old { target } form, the new actions, and refusals', () => {
  assert.deepEqual(normalizeOrder({ unitRef: 'x', target: 'D4' }), { action: 'move', target: { x: 3, y: 3 }, then: null })
  assert.deepEqual(normalizeOrder({ unitRef: 'x', target: 'hold' }), { action: 'hold', target: null, then: null })
  assert.deepEqual(normalizeOrder({ action: 'defend', target: 'D4' }), { action: 'defend', target: { x: 3, y: 3 }, then: 'hold' })
  assert.deepEqual(normalizeOrder({ action: 'defend' }), { action: 'hold', target: null, then: null },
    'defend with nowhere to go is: hold here')
  assert.deepEqual(normalizeOrder({ action: 'withdraw' }), { action: 'withdraw', target: null, then: 'hold' })
  assert.deepEqual(normalizeOrder({ action: 'move', target: 'D4', then: 'hold' }).then, 'hold')
  assert.throws(() => normalizeOrder({ action: 'dance' }), /unknown order action/)
  assert.throws(() => normalizeOrder({ action: 'move' }), /needs a target/)
})

// ── Persistence ────────────────────────────────────────

test('a move order lasts until the unit arrives, with no new orders needed', () => {
  // J24 to S24 is 9 tiles of plain: three turns at 3 a turn. Orders only on
  // turn one; before Stage 2 the unit stopped after the first turn.
  const state = createBattleState(spec())
  stepTurn(state, { red: [{ unitRef: 'mover', target: 'S24' }] })
  assert.equal(where(state, 'mover'), 'M24')
  stepTurn(state, {})
  stepTurn(state, {})
  assert.equal(where(state, 'mover'), 'S24', 'it kept marching on turns two and three')

  const arrived = eventsOf(state, 'arrived', 'mover')
  assert.equal(arrived.length, 1)
  assert.equal(arrived[0].then, 'standing', 'a plain move hands back to standing orders')
  assert.equal(state.orderBook.has('mover'), true, 'still held on the turn it arrived')
  stepTurn(state, {})
  assert.equal(state.orderBook.has('mover'), false, 'and done after')
})

test('defend: go there, then hold, even when the side would otherwise advance', () => {
  const state = createBattleState(spec({ standingOrders: { red: 'advance' } }))
  stepTurn(state, { red: [{ unitRef: 'mover', action: 'defend', target: 'M24' }] })
  assert.equal(where(state, 'mover'), 'M24')
  assert.equal(eventsOf(state, 'arrived', 'mover')[0].then, 'hold')

  for (let i = 0; i < 3; i++) stepTurn(state, {})
  assert.equal(where(state, 'mover'), 'M24', 'dug in; standing orders do not drag it forward')
  assert.equal(state.orderBook.get('mover').action, 'hold')
})

test('hold lasts until countermanded (before Stage 2 it lasted one turn)', () => {
  const state = createBattleState(spec({ standingOrders: { red: 'advance' } }))
  stepTurn(state, { red: [{ unitRef: 'mover', target: 'hold' }] })
  stepTurn(state, {})
  stepTurn(state, {})
  assert.equal(where(state, 'mover'), 'J24')

  stepTurn(state, { red: [{ unitRef: 'mover', target: 'L24' }] })
  assert.equal(where(state, 'mover'), 'L24', 'a new order replaces the hold')
})

test('advance presses the nearest enemy, turn after turn', () => {
  const state = createBattleState(spec({
    units: [unit({ id: 'mover' }), unit({ id: 'foe', side: 'blue', position: 'T24' })]
  }))
  stepTurn(state, { red: [{ unitRef: 'mover', action: 'advance' }] })
  stepTurn(state, {})
  assert.equal(where(state, 'mover'), 'P24', 'six tiles closer after two turns')
  assert.equal(state.orderBook.get('mover').action, 'advance')
})

test('withdraw falls back toward the home edge, then holds', () => {
  const state = createBattleState(spec({ units: [unit({ id: 'mover', position: 'P24' }), unit({ id: 'far_enemy', side: 'blue', position: 'AC40' })] }))
  stepTurn(state, { red: [{ unitRef: 'mover', action: 'withdraw', target: 'K24' }] })
  stepTurn(state, {})
  assert.equal(where(state, 'mover'), 'K24')
  assert.equal(eventsOf(state, 'arrived', 'mover')[0].then, 'hold')
  stepTurn(state, {})
  assert.equal(state.orderBook.get('mover').action, 'hold')

  // With no target it heads west, red's home edge.
  const open = createBattleState(spec({ units: [unit({ id: 'mover', position: 'P24' }), unit({ id: 'far_enemy', side: 'blue', position: 'AC40' })] }))
  stepTurn(open, { red: [{ unitRef: 'mover', action: 'withdraw' }] })
  assert.ok(open.world.units[0].position.x < 15, 'moved west')
})

test('an order that gets nowhere is given up, and the log says why', () => {
  // A friend holds the destination. The mover stops beside it; on the next
  // turn the carried-over order makes no progress and is dropped.
  const state = createBattleState(spec({
    units: [
      unit({ id: 'mover' }),
      unit({ id: 'squatter', position: 'L24' }),
      unit({ id: 'far_enemy', side: 'blue', position: 'AC40' })
    ]
  }))
  stepTurn(state, { red: [{ unitRef: 'mover', target: 'L24' }, { unitRef: 'squatter', target: 'hold' }] })
  stepTurn(state, {})
  const halted = eventsOf(state, 'halted', 'mover')
  assert.equal(halted.length, 1)
  assert.equal(halted[0].reason, 'blocked')
  assert.equal(halted[0].blockedBy, 'squatter')
  assert.equal(state.orderBook.has('mover'), false)
})

test('broken units ignore their orders and flee', () => {
  const result = runBattle(spec({
    standingOrders: { red: 'advance' },
    units: [
      unit({ id: 'levy', side: 'red', position: 'P24', quality: 'levy', armor: 'no_armor', shield: 'no_shield', primaryWeapon: 'daggers' }),
      unit({ id: 'anchor', side: 'red', position: 'J40' }),
      unit({ id: 'wall', side: 'blue', position: 'Q24', quality: 'elite', primaryWeapon: 'great_axe' })
    ],
    turns: [{ red: [{ unitRef: 'levy', action: 'defend' }] }],
    maxTurns: 12
  }), { seed: 2 })
  const rout = result.events.find(e => e.type === 'rout' && e.unitId === 'levy')
  assert.ok(rout, 'the levy breaks')
  const later = result.events.filter(e => e.type === 'move' && e.unitId === 'levy' && e.turn > rout.turn)
  assert.ok(later.some(e => e.to.x < e.from.x), 'and runs west despite its order to hold')
})
