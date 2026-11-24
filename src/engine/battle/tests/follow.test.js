// src/engine/battle/tests/follow.test.js
//
// The follow order (docs/DECISIONS.md, "How kinds of unit in orders and the
// follow order were built"): a unit told to keep by another of its own side
// keeps station beside or behind it as it moves, at its own pace; goes at
// an enemy fighting it when told to guard it; stands and fights when it is
// fought itself; and holds, and says so, when the unit it keeps by breaks,
// is gone, or is lost from sight. Fixtures as in attack-named.test.js: a
// 20x20 plain with a wood in columns 5-9 of rows 5-9; red's edge is south.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { normalizeOrder } = require('../orders')
const { grasp } = require('../../command/officers')
const { toLabel } = require('../../map/labels')

const forest = []
for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) forest.push(toLabel({ x, y }))
const MAP = { name: 'follow-20', width: 20, height: 20, terrain: { forest } }

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 2 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}

const battle = (units, more = {}) => createBattleState({
  name: 'follow', map: MAP,
  sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } },
  units, maxTurns: 40, ...more
})

const of = (state, type) => state.log.ofType(type)
const where = (state, id) => state.world.units.find(u => u.id === id).position
const apart = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
const fought = (state, id) => of(state, 'contact').some(e => e.aId === id || e.bId === id)

test('a follow order is kept as an order to keep by that unit, beside it unless told behind', () => {
  assert.deepEqual(normalizeOrder({ unitRef: 'velites', action: 'follow', friend: 'legion', guard: true }),
    { action: 'follow', target: null, then: null, friend: 'legion', keep: 'beside', guard: true })
  assert.deepEqual(normalizeOrder({ unitRef: 'velites', action: 'follow', friend: 'legion', keep: 'behind' }),
    { action: 'follow', target: null, then: null, friend: 'legion', keep: 'behind' })
  assert.throws(() => normalizeOrder({ unitRef: 'velites', action: 'follow' }), /needs the unit to follow/)
})

test('a unit told to keep beside another keeps station by it as it marches, a tile or two off', () => {
  const state = battle([
    unit({ id: 'legion', position: { x: 3, y: 15 } }),
    unit({ id: 'velites', position: { x: 3, y: 17 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'legion', target: { x: 16, y: 15 } }, { unitRef: 'velites', action: 'follow', friend: 'legion' }] })
  for (let t = 0; t < 6; t++) {
    stepTurn(state, {})
    assert.ok(apart(where(state, 'legion'), where(state, 'velites')) <= 2, `turn ${t}: still by them, ${JSON.stringify(where(state, 'velites'))} and ${JSON.stringify(where(state, 'legion'))}`)
  }
  assert.deepEqual(where(state, 'legion'), { x: 16, y: 15 })
  const v = where(state, 'velites')
  assert.ok(apart(v, { x: 16, y: 15 }) <= 2 && apart(v, { x: 16, y: 15 }) >= 1, `beside them where they stopped: ${JSON.stringify(v)}`)
  assert.equal(state.orderBook.get('velites').action, 'follow', 'and the order stands: it never finishes')
})

test('a unit told to keep behind another stands on the side away from the enemy its side has seen', () => {
  const state = battle([
    unit({ id: 'pikes', position: { x: 12, y: 13 } }),
    unit({ id: 'archers', position: { x: 15, y: 11 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 12, y: 4 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'pikes', action: 'hold' }, { unitRef: 'archers', action: 'follow', friend: 'pikes', keep: 'behind' }], blue: [{ unitRef: 'foe', action: 'hold' }] })
  for (let t = 0; t < 3; t++) stepTurn(state, {})
  const a = where(state, 'archers')
  assert.ok(a.y > 13, `behind the pikes, away from the enemy to the north: ${JSON.stringify(a)}`)
  assert.ok(apart(a, { x: 12, y: 13 }) <= 3, `and near them: ${JSON.stringify(a)}`)
})

test('foot told to follow horse fall behind at their own pace, and keep after them', () => {
  const state = battle([
    unit({ id: 'horse', position: { x: 2, y: 15 }, mounted: true, movementRange: 6 }),
    unit({ id: 'foot', position: { x: 2, y: 16 }, movementRange: 2 })
  ])
  stepTurn(state, { red: [{ unitRef: 'horse', target: { x: 18, y: 15 } }, { unitRef: 'foot', action: 'follow', friend: 'horse', keep: 'behind' }] })
  stepTurn(state, {})
  assert.ok(apart(where(state, 'horse'), where(state, 'foot')) > 2, 'the horse have drawn ahead')
  assert.ok(where(state, 'foot').x > 2, 'the foot went after them')
  assert.equal(state.orderBook.get('foot').action, 'follow')
})

test('when the unit followed breaks, the follower holds where it is and its side is told', () => {
  const state = battle([
    unit({ id: 'legion', position: { x: 10, y: 15 } }),
    unit({ id: 'velites', position: { x: 12, y: 16 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'velites', action: 'follow', friend: 'legion' }] })
  state.broken.add('legion')
  stepTurn(state, {})
  const lost = of(state, 'followLost')
  assert.equal(lost.length, 1)
  assert.deepEqual({ unitId: lost[0].unitId, on: lost[0].on, why: lost[0].why }, { unitId: 'velites', on: 'legion', why: 'broken' })
  assert.equal(state.orderBook.get('velites').action, 'hold')
})

test('when the unit followed is destroyed or gone from the field, the follower holds and says so', () => {
  const state = battle([
    unit({ id: 'legion', position: { x: 10, y: 15 } }),
    unit({ id: 'velites', position: { x: 12, y: 16 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'velites', action: 'follow', friend: 'legion' }] })
  state.world.units.find(u => u.id === 'legion').strength = 0
  stepTurn(state, {})
  assert.equal(of(state, 'followLost')[0]?.why, 'gone')
  assert.equal(state.orderBook.get('velites').action, 'hold')
})

test('a unit that loses sight of the one it follows goes to where it last saw it, then holds and says so', () => {
  const state = battle([
    unit({ id: 'legion', position: { x: 7, y: 11 } }),
    unit({ id: 'velites', position: { x: 7, y: 15 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'legion', action: 'hold' }, { unitRef: 'velites', action: 'follow', friend: 'legion', keep: 'behind' }] })
  // Into the wood, where no one sees them from more than a tile off.
  state.world.units.find(u => u.id === 'legion').position = { x: 7, y: 6 }
  for (let t = 0; t < 4 && of(state, 'followLost').length === 0; t++) stepTurn(state, {})
  const lost = of(state, 'followLost')
  assert.equal(lost[0]?.why, 'out of sight')
  assert.ok(apart(where(state, 'velites'), { x: 7, y: 11 }) <= 1, `it went to where it last saw them: ${JSON.stringify(where(state, 'velites'))}`)
})

test('a unit told to guard another goes at an enemy that comes to blows with it', () => {
  const state = battle([
    unit({ id: 'legion', position: { x: 10, y: 12 } }),
    unit({ id: 'guard', position: { x: 13, y: 14 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 10, y: 10 } })
  ])
  stepTurn(state, {
    red: [{ unitRef: 'legion', action: 'hold' }, { unitRef: 'guard', action: 'follow', friend: 'legion', guard: true }],
    blue: [{ unitRef: 'foe', action: 'attack', enemy: 'legion' }]
  })
  for (let t = 0; t < 4 && !fought(state, 'guard'); t++) stepTurn(state, {})
  assert.ok(fought(state, 'legion'), 'the legion was fought')
  assert.ok(fought(state, 'guard'), 'and the guard went in to them')
  assert.equal(state.orderBook.get('guard').action, 'follow', 'still keeping by them')
})

test('a unit told to keep behind another keeps out of its fight', () => {
  const state = battle([
    unit({ id: 'legion', position: { x: 10, y: 12 } }),
    unit({ id: 'archers', position: { x: 10, y: 15 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 10, y: 10 } })
  ])
  stepTurn(state, {
    red: [{ unitRef: 'legion', action: 'hold' }, { unitRef: 'archers', action: 'follow', friend: 'legion', keep: 'behind' }],
    blue: [{ unitRef: 'foe', action: 'attack', enemy: 'legion' }]
  })
  for (let t = 0; t < 4; t++) stepTurn(state, {})
  assert.ok(fought(state, 'legion'), 'the legion was fought')
  assert.ok(!fought(state, 'archers'), 'the ones behind kept out of it')
})

test('a battle with no follow order has no follow in it', () => {
  const state = battle([
    unit({ id: 'legion', position: { x: 10, y: 12 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 10, y: 10 } })
  ])
  for (let t = 0; t < 3; t++) stepTurn(state, { red: [{ unitRef: 'legion', action: 'advance' }] })
  assert.equal(of(state, 'followLost').length, 0)
})

test('guarding is a clause an officer may lose: he then keeps by the unit and no more', () => {
  const order = normalizeOrder({ unitRef: 'guard', action: 'follow', friend: 'legion', guard: true })
  const green = { name: 'Gaius', experience: 0, personality: 'steady' }
  const lost = grasp(order, green, () => 0.99)
  assert.equal(lost.clauses, 1)
  assert.equal(lost.order.guard, undefined)
  assert.equal(lost.order.action, 'follow')
  const kept = grasp(order, green, () => 0)
  assert.equal(kept.order.guard, true)
  const behind = grasp(normalizeOrder({ unitRef: 'a', action: 'follow', friend: 'legion', keep: 'behind' }), green, () => 0.99)
  assert.equal(behind.clauses, 0, 'keeping behind is the plain order alone')
})
