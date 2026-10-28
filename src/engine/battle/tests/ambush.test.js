// src/engine/battle/tests/ambush.test.js
//
// Ambushes (ruled: the player orders them). A unit lies hidden and strikes an
// enemy that passes within reach: by default only one marching, since one on
// guard is not worth it; it can let some go by, pick what to strike, or be
// told to strike whatever happens.
//
// Fixtures on a generated 20x20 plain with a wood filling columns 5-9 of
// rows 5-9. The ambush lies in the wood's west edge at F8 (5,7); columns
// march north up column E, past the trees.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { normalizeOrder } = require('../orders')
const { toLabel } = require('../../map/labels')

const forest = []
for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) forest.push(toLabel({ x, y }))
const MAP = { name: 'ambush-20', width: 20, height: 20, terrain: { forest } }

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 2 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}
const at = (x, y) => ({ x, y })
const of = (state, type) => state.log.ofType(type)
const where = (state, id) => state.world.units.find(u => u.id === id).position

// Turn 1: the ambush hides (the columns are out of sight, south). Then the
// columns march north, one order, as many turns as asked.
function lieInWait(ambush, columns, turns = 1) {
  const state = createBattleState({
    name: 'ambush', map: MAP,
    sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } },
    units: [unit({ id: 'lurker', side: 'blue', position: at(5, 7) }), ...columns],
    maxTurns: 10
  })
  stepTurn(state, { blue: [{ unitRef: 'lurker', action: 'ambush', ...ambush }] })
  assert.equal(state.hidden.has('lurker'), true, 'the ambush is laid')
  stepTurn(state, { red: columns.map(c => ({ unitRef: c.id, target: at(4, 0), ...(c.order ?? {}) })) })
  for (let i = 1; i < turns; i++) stepTurn(state, {})
  return state
}

test('an ambush order carries what to strike, how many to let pass, and whether to strike regardless', () => {
  assert.deepEqual(normalizeOrder({ action: 'ambush' }),
    { action: 'ambush', target: null, then: null, against: null, letPass: 0, regardless: false })
  assert.deepEqual(normalizeOrder({ action: 'ambush', target: 'F8', against: 'cavalry', letPass: 2, regardless: true }),
    { action: 'ambush', target: { x: 5, y: 7 }, then: null, against: 'cavalry', letPass: 2, regardless: true })
})

test('a marching column is caught by the ambush, and taken by surprise', () => {
  const state = lieInWait({}, [unit({ id: 'column', position: at(4, 10) })])
  assert.deepEqual(where(state, 'column'), at(4, 7), 'stopped where it was caught')
  assert.deepEqual(of(state, 'ambush').map(e => [e.unitId, e.on]), [['lurker', 'column']])
  assert.deepEqual(of(state, 'surprise').map(e => [e.unitId, e.by]), [['column', 'lurker']])
  assert.ok(of(state, 'exchange').length > 0)
  assert.deepEqual(of(state, 'revealed').map(e => [e.unitId, e.reason]), [['lurker', 'fought']])
  assert.equal(state.orderBook.get('lurker').action, 'hold', 'a sprung ambush is spent')
})

test('a column on guard is not worth it: the ambush holds and stays hidden', () => {
  const state = lieInWait({}, [unit({ id: 'column', position: at(4, 8), order: { careful: true } })])
  assert.deepEqual(where(state, 'column'), at(4, 7), 'it came right past')
  assert.deepEqual(of(state, 'ambushHeld').map(e => [e.on, e.reason]), [['column', 'on guard']])
  assert.equal(of(state, 'exchange').length, 0)
  assert.equal(state.hidden.has('lurker'), true)
})

test('told to strike whatever happens, it hits the guarded column, without surprise', () => {
  const state = lieInWait({ regardless: true }, [unit({ id: 'column', position: at(4, 8), order: { careful: true } })])
  assert.equal(of(state, 'ambush').length, 1)
  assert.ok(of(state, 'exchange').length > 0)
  assert.equal(of(state, 'surprise').length, 0, 'a unit on guard is not caught unawares')
})

test('let the first one pass, then strike the next', () => {
  const state = lieInWait({ letPass: 1 }, [
    unit({ id: 'a_lead', position: at(4, 10) }),
    unit({ id: 'b_rear', position: at(4, 12) })
  ], 2)
  assert.deepEqual(of(state, 'ambushHeld').map(e => [e.on, e.reason]), [['a_lead', 'letting it pass']])
  assert.deepEqual(of(state, 'ambush').map(e => e.on), ['b_rear'])
  assert.ok(where(state, 'a_lead').y < 7, 'the lead marched on, none the wiser')
})

test('an ambush set for cavalry lets the foot go by and takes the horse', () => {
  const state = lieInWait({ against: 'cavalry' }, [
    unit({ id: 'a_foot', position: at(4, 10) }),
    unit({ id: 'b_horse', mounted: true, armor: 'light_armor', movementRange: 5, position: at(4, 13) })
  ], 2)
  assert.deepEqual(of(state, 'ambush').map(e => e.on), ['b_horse'])
  assert.equal(of(state, 'ambushHeld').length, 0, 'the foot never interested it')
})
