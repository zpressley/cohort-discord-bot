// src/engine/battle/tests/attack-named.test.js
//
// An attack order that names an enemy unit (review item L10): the unit goes
// for that enemy while its side can see it, then for where it was last seen,
// and never by where an enemy no one can see truly stands. Fixtures as in
// review-fixes.test.js: a 20x20 plain with a wood in columns 5-9 of rows 5-9.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { normalizeOrder } = require('../orders')
const { toLabel } = require('../../map/labels')

const forest = []
for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) forest.push(toLabel({ x, y }))
const MAP = { name: 'named-20', width: 20, height: 20, terrain: { forest } }

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 2 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}

const battle = (units) => createBattleState({
  name: 'named', map: MAP,
  sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } },
  units, maxTurns: 20
})

const of = (state, type) => state.log.ofType(type)
const where = (state, id) => state.world.units.find(u => u.id === id).position
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

test('an attack that names an enemy is kept as an attack on that enemy, not turned into an advance', () => {
  assert.deepEqual(normalizeOrder({ unitRef: 'ours', action: 'attack', enemy: 'theirs' }),
    { action: 'attack', target: null, then: null, enemy: 'theirs' })
  assert.deepEqual(normalizeOrder({ unitRef: 'ours', action: 'attack' }),
    { action: 'advance', target: null, then: null }, 'with neither a place nor an enemy it is still advance')
})

test('a unit told to attack a named enemy in sight goes for that one, not the nearest', () => {
  const state = battle([
    unit({ id: 'ours', position: { x: 12, y: 18 } }),
    unit({ id: 'near', side: 'blue', position: { x: 9, y: 18 } }),
    unit({ id: 'far', side: 'blue', position: { x: 16, y: 17 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'ours', action: 'attack', enemy: 'far' }] })
  assert.ok(distance(where(state, 'ours'), { x: 16, y: 17 }) < 4, 'closer to the one it was told to attack')
  assert.ok(where(state, 'ours').x > 12, 'it went east, toward the enemy named; the nearest is west')
  assert.equal(state.orderBook.get('ours').enemy, 'far', 'and the order stands')
})

test('it follows the named enemy while it stays in sight', () => {
  const state = battle([
    unit({ id: 'ours', position: { x: 12, y: 18 }, movementRange: 2 }),
    unit({ id: 'theirs', side: 'blue', position: { x: 12, y: 14 }, movementRange: 1 })
  ])
  stepTurn(state, {
    red: [{ unitRef: 'ours', action: 'attack', enemy: 'theirs' }],
    blue: [{ unitRef: 'theirs', target: { x: 16, y: 14 } }]
  })
  stepTurn(state, {})
  // Blue has stepped east twice; ours, seeing it, turned after it.
  assert.ok(where(state, 'ours').x > 12, `ours went after it: ${JSON.stringify(where(state, 'ours'))}`)
})

test('an attack on an enemy that slips out of sight goes to where it was last seen, not to where it went', () => {
  const state = battle([
    unit({ id: 'ours', position: { x: 12, y: 18 } }),
    unit({ id: 'theirs', side: 'blue', position: { x: 12, y: 13 }, movementRange: 6 })
  ])
  stepTurn(state, {
    red: [{ unitRef: 'ours', action: 'attack', enemy: 'theirs' }],
    blue: [{ unitRef: 'theirs', target: { x: 18, y: 2 } }]
  })
  assert.deepEqual(state.lastSeen.get('red').get('theirs'), { x: 12, y: 13 }, 'seen as the turn opened')
  assert.equal(state.lastSeen.get('red').size, 1)
  // Now out of sight, far to the north-east. Ours makes for the place it was
  // seen, straight up its own column, knowing nothing of where it went.
  stepTurn(state, {})
  assert.equal(where(state, 'ours').x, 12, 'it did not turn toward where the enemy truly is')
  assert.ok(where(state, 'ours').y <= 14, 'it went on to the place it was last seen')
  assert.equal(state.orderBook.get('ours').enemy, 'theirs', 'still looking for it')
})

test('an attack on an enemy no one can see is carried out as an advance would be, whatever the enemy truly does', () => {
  // The same field twice, the enemy unseen: once told to attack it by name,
  // once to advance. Not knowing where it is, the two go alike; and where
  // the unseen enemy truly marches makes no difference to either.
  const run = (order, blueTarget) => {
    const state = battle([
      unit({ id: 'ours', position: { x: 3, y: 16 } }),
      unit({ id: 'theirs', side: 'blue', position: { x: 16, y: 16 } })
    ])
    const path = []
    for (let i = 0; i < 4; i++) {
      stepTurn(state, i === 0 ? { red: [order], blue: [{ unitRef: 'theirs', target: blueTarget, careful: true }] } : {})
      path.push({ ...where(state, 'ours') })
      if (of(state, 'contact').length > 0) break
    }
    return path
  }
  const named = run({ unitRef: 'ours', action: 'attack', enemy: 'theirs' }, { x: 16, y: 19 })
  const advancing = run({ unitRef: 'ours', action: 'advance' }, { x: 16, y: 19 })
  const elsewhere = run({ unitRef: 'ours', action: 'attack', enemy: 'theirs' }, { x: 19, y: 12 })
  assert.deepEqual(named, advancing)
  assert.deepEqual(named, elsewhere, 'it knows nothing of where the unseen enemy went')
})

test('once it has stood where the enemy was seen and found no one, it presses the enemy as advance does', () => {
  const state = battle([
    unit({ id: 'ours', position: { x: 12, y: 18 } }),
    unit({ id: 'theirs', side: 'blue', position: { x: 12, y: 13 }, movementRange: 6 })
  ])
  stepTurn(state, {
    red: [{ unitRef: 'ours', action: 'attack', enemy: 'theirs' }],
    blue: [{ unitRef: 'theirs', target: { x: 18, y: 2 } }]
  })
  for (let i = 0; i < 3; i++) stepTurn(state, {})
  assert.equal(state.lastSeen.get('red').has('theirs'), false, 'having stood there and found no one')
  assert.equal(state.orderBook.get('ours').action, 'attack', 'it keeps the order, to go for it again once seen')
  assert.equal(of(state, 'arrived').filter(e => e.unitId === 'ours').length, 0, 'reaching the place is not the order done')
})

test('when the named enemy breaks or is gone, the order becomes a plain advance', () => {
  const state = battle([
    unit({ id: 'ours', position: { x: 12, y: 18 } }),
    unit({ id: 'near', side: 'blue', position: { x: 12, y: 15 } }),
    unit({ id: 'far', side: 'blue', position: { x: 16, y: 14 } })
  ])
  state.broken.add('far')
  stepTurn(state, { red: [{ unitRef: 'ours', action: 'attack', enemy: 'far', careful: true }] })
  assert.deepEqual(state.orderBook.get('ours'), { action: 'advance', target: null, then: null, careful: true })
  assert.deepEqual(of(state, 'quarryGone').map(e => [e.unitId, e.on]), [['ours', 'far']])
  assert.equal(where(state, 'ours').x, 12, 'it went at the enemy that is left')
})

test('an enemy destroyed or off the field ends the attack on it the same way', () => {
  const state = battle([
    unit({ id: 'ours', position: { x: 12, y: 18 } }),
    unit({ id: 'near', side: 'blue', position: { x: 12, y: 15 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'ours', action: 'attack', enemy: 'nobody here' }] })
  assert.equal(state.orderBook.get('ours').action, 'advance')
  assert.equal(of(state, 'quarryGone').length, 1)
})

test('archers told to attack a named enemy shoot at that one first', () => {
  const archers = { role: 'archers', primaryWeapon: 'greek_composite_bow', armor: 'light_armor', shield: 'no_shield' }
  const state = battle([
    unit({ id: 'bows', ...archers, position: { x: 12, y: 18 }, movementRange: 0 }),
    unit({ id: 'near', side: 'blue', position: { x: 12, y: 15 }, movementRange: 0 }),
    unit({ id: 'far', side: 'blue', position: { x: 14, y: 14 }, movementRange: 0 })
  ])
  stepTurn(state, { red: [{ unitRef: 'bows', action: 'attack', enemy: 'far' }] })
  assert.deepEqual(of(state, 'volley').filter(v => v.by === 'bows').map(v => v.unitId), ['far'])
})
