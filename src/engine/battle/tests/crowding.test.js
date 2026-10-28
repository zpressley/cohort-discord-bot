// src/engine/battle/tests/crowding.test.js
//
// Stacking (ruled 2026-10-21): friends may share a tile, and pay for it once
// it is crowded. Fixtures on the open plain in Crownhill's south-middle.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
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

const spec = (units, extra = {}) => ({
  name: 'crowding',
  sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
  units,
  maxTurns: 10,
  ...extra
})

test('friends sent to one spot share it, and the log says they are packed', () => {
  const state = createBattleState(spec([
    unit({ id: 'one', position: 'J24' }),
    unit({ id: 'two', position: 'J26' }),
    unit({ id: 'far', side: 'blue', position: 'AC40' })
  ]))
  stepTurn(state, { red: [{ unitRef: 'one', target: 'J25' }, { unitRef: 'two', target: 'J25' }] })
  const pos = (id) => toLabel(state.world.units.find(u => u.id === id).position)
  assert.equal(pos('one'), 'J25')
  assert.equal(pos('two'), 'J25')

  const crowded = state.log.ofType('crowding')
  assert.deepEqual(crowded.map(e => [e.unitId, e.tier, e.men]).sort(),
    [['one', 'compressed', 200], ['two', 'compressed', 200]])

  // Spread out again, and the log says so.
  stepTurn(state, { red: [{ unitRef: 'two', target: 'J27' }] })
  const loosened = state.log.forTurn(2).filter(e => e.type === 'crowding')
  assert.ok(loosened.some(e => e.unitId === 'one' && e.tier === 'organized' && e.was === 'compressed'))
})

test('packed ranks fight worse: the crowding penalty reaches every exchange', () => {
  const state = createBattleState(spec([
    unit({ id: 'one', position: 'P24' }),
    unit({ id: 'two', position: 'P24' }),
    unit({ id: 'foe', side: 'blue', position: 'Q24' })
  ]))
  stepTurn(state, { red: [{ unitRef: 'one', target: 'hold' }, { unitRef: 'two', target: 'hold' }] })
  const exchanges = state.log.ofType('exchange')
  assert.ok(exchanges.length > 0, 'they fought')
  for (const e of exchanges) {
    const red = e.a.unitId === 'foe' ? e.b : e.a
    const blue = e.a.unitId === 'foe' ? e.a : e.b
    assert.equal(red.crowding, 2, 'compressed: -2 to attack and defense')
    assert.equal(blue.crowding, 0, 'the lone enemy is not crowded')
  }
})

test('a lone unit, however large, is never crowded', () => {
  const state = createBattleState(spec([
    unit({ id: 'big', position: 'P24', strength: 280, maxStrength: 280 }),
    unit({ id: 'foe', side: 'blue', position: 'Q24' })
  ]))
  stepTurn(state, {})
  assert.equal(state.log.ofType('crowding').length, 0)
  for (const e of state.log.ofType('exchange')) {
    assert.equal(e.a.crowding, 0)
    assert.equal(e.b.crowding, 0)
  }
})
