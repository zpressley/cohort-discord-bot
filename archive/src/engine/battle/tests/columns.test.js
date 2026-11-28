// src/engine/battle/tests/columns.test.js
//
// Marching in column, and running by the open way (the second playthrough
// of November 24, S5, S7 and S8; docs/DECISIONS.md, "How columns, wavering
// under fire and flight were mended"):
//   - units on the march keep a tile apart: on a road they go in column,
//     each waiting for the tile ahead to clear;
//   - a ford passes one unit at a time, the rest waiting on the bank with
//     their orders;
//   - a unit going at an enemy may still join a friend fighting him;
//   - a broken unit runs for its own edge round an enemy in its way, and cut
//     off from its edge runs from the enemy, where it may rally.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { toLabel } = require('../../map/labels')
const { MARCH } = require('../../combat/tables')

const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 1, y: 4 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
const labels = (tiles) => tiles.map(([x, y]) => toLabel({ x, y }))
const at = (state, id) => state.world.units.find(u => u.id === id)?.position
const sharing = (state, side) => {
  const seen = new Map()
  for (const u of state.world.units.filter(u => u.side === side && u.strength > 0 && !state.broken.has(u.id))) {
    const k = `${u.position.x},${u.position.y}`
    seen.set(k, [...(seen.get(k) ?? []), u.id])
  }
  return [...seen.values()].filter(ids => ids.length > 1)
}

// A road through a wood, west to east, along row 4.
const road = []; const forest = []
for (let x = 0; x < 30; x++) {
  for (let y = 0; y < 9; y++) (y === 4 ? road : forest).push([x, y])
}
const WOOD = { name: 'wood-road', width: 30, height: 9, terrain: { road: labels(road), forest: labels(forest) } }

test('units sent along a road at the same time march in column, one unit to a tile, each waiting for the tile ahead to clear', () => {
  const state = createBattleState({
    name: 'column', map: WOOD, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
    units: [unit({ id: 'one', position: { x: 2, y: 4 } }), unit({ id: 'two', position: { x: 1, y: 3 } }), unit({ id: 'three', position: { x: 1, y: 5 } }),
      unit({ id: 'far', side: 'blue', position: { x: 29, y: 0 } })]
  }, { seed: 1 })
  const orders = { red: [{ unitRef: 'one', target: { x: 26, y: 4 } }, { unitRef: 'two', target: { x: 25, y: 4 } }, { unitRef: 'three', target: { x: 24, y: 4 } }] }
  for (let t = 0; t < 8; t++) {
    stepTurn(state, t === 0 ? orders : {})
    assert.deepEqual(sharing(state, 'red'), [], `no two on one tile after ten minutes ${t + 1}`)
  }
  assert.equal(state.log.ofType('crowding').length, 0, 'never packed')
  assert.deepEqual([at(state, 'one'), at(state, 'two'), at(state, 'three')], [{ x: 26, y: 4 }, { x: 25, y: 4 }, { x: 24, y: 4 }], 'all where they were sent')
})

test('two units of one side marching opposite ways along one road pass each other, rather than each wait for the other for ever', () => {
  const state = createBattleState({
    name: 'passing', map: WOOD, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
    units: [unit({ id: 'east', position: { x: 5, y: 4 } }), unit({ id: 'west', position: { x: 9, y: 4 } }),
      unit({ id: 'far', side: 'blue', position: { x: 29, y: 0 } })]
  }, { seed: 1 })
  stepTurn(state, { red: [{ unitRef: 'east', target: { x: 16, y: 4 } }, { unitRef: 'west', target: { x: 1, y: 4 } }] })
  for (let t = 0; t < 8; t++) stepTurn(state, {})
  assert.deepEqual(at(state, 'east'), { x: 16, y: 4 })
  assert.deepEqual(at(state, 'west'), { x: 1, y: 4 })
})

test('a unit whose road through a wood is held by a friend standing on it, with no way round, goes on through him rather than wait for ever', () => {
  const state = createBattleState({
    name: 'through', map: WOOD, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
    units: [unit({ id: 'holding', position: { x: 10, y: 4 } }), unit({ id: 'going', position: { x: 6, y: 4 } }),
      unit({ id: 'far', side: 'blue', position: { x: 29, y: 0 } })]
  }, { seed: 1 })
  stepTurn(state, { red: [{ unitRef: 'holding', action: 'hold' }, { unitRef: 'going', target: { x: 18, y: 4 } }] })
  for (let t = 0; t < 6; t++) stepTurn(state, {})
  assert.deepEqual(at(state, 'going'), { x: 18, y: 4 })
  assert.deepEqual(at(state, 'holding'), { x: 10, y: 4 })
})

// A brook down column 10, crossed by one ford on row 4.
const brook = []
for (let y = 0; y < 9; y++) if (y !== 4) brook.push([10, y])
const BROOK = { name: 'brook', width: 24, height: 9, terrain: { river: labels(brook), ford: labels([[10, 4]]) } }
const brookSpec = (units) => ({ name: 'brook', map: BROOK, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, units })

test('a ford passes one unit at a time: the rest wait on the bank, not on it', () => {
  assert.ok(MARCH.CROSSINGS.includes('ford'))
  const state = createBattleState(brookSpec([
    unit({ id: 'one', position: { x: 5, y: 3 } }), unit({ id: 'two', position: { x: 5, y: 4 } }), unit({ id: 'three', position: { x: 5, y: 5 } }),
    unit({ id: 'far', side: 'blue', position: { x: 23, y: 8 } })
  ]), { seed: 1 })
  const orders = { red: [{ unitRef: 'one', target: { x: 16, y: 3 } }, { unitRef: 'two', target: { x: 16, y: 4 } }, { unitRef: 'three', target: { x: 16, y: 5 } }] }
  for (let t = 0; t < 10; t++) {
    stepTurn(state, t === 0 ? orders : {})
    const onFord = state.world.units.filter(u => u.position.x === 10 && u.position.y === 4)
    assert.ok(onFord.length <= 1, `one at a time on the ford: ${onFord.map(u => u.id)}`)
  }
  for (const id of ['one', 'two', 'three']) assert.equal(at(state, id).x, 16, `${id} got over`)
})

test('a column held up at a ford by its head in a fight waits on the bank with its orders, and goes on when the way clears', () => {
  const state = createBattleState(brookSpec([
    unit({ id: 'one', position: { x: 6, y: 4 } }), unit({ id: 'two', position: { x: 5, y: 4 } }), unit({ id: 'three', position: { x: 4, y: 4 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 11, y: 4 }, strength: 60, maxStrength: 60, quality: 'levy', armor: 'no_armor', shield: 'no_shield' })
  ]), { seed: 2 })
  const orders = { red: ['one', 'two', 'three'].map(id => ({ unitRef: id, action: 'attack', target: { x: 14, y: 4 } })) }
  let waited = false
  for (let t = 0; t < 12; t++) {
    stepTurn(state, t === 0 ? orders : {})
    const onFord = state.world.units.filter(u => u.position.x === 10 && u.position.y === 4)
    assert.ok(onFord.length <= 1, `one at a time on the ford: ${onFord.map(u => u.id)}`)
    if (state.world.units.some(u => u.id === 'foe') && at(state, 'two')?.x < 10 && at(state, 'three')?.x < 10) waited = true
  }
  assert.ok(waited, 'the rest waited on the near bank while the head fought')
  assert.equal(state.log.ofType('halted').filter(e => e.unitId !== 'one').length, 0, 'and kept their orders')
  assert.ok(['two', 'three'].some(id => at(state, id)?.x > 10), 'and went on over once the way was clear')
})

const OPEN = { name: 'open-30', width: 30, height: 12, terrain: {} }
const openSpec = (units, extra = {}) => ({ name: 'open', map: OPEN, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, units, ...extra })

test('a unit going at an enemy may still step in beside a friend already fighting him', () => {
  const state = createBattleState(openSpec([
    unit({ id: 'fighting', position: { x: 10, y: 5 } }), unit({ id: 'coming', position: { x: 7, y: 5 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 11, y: 5 }, strength: 200, maxStrength: 200 })
  ], { standingOrders: { blue: 'advance' } }), { seed: 1 })
  stepTurn(state, { red: [{ unitRef: 'fighting', action: 'hold' }, { unitRef: 'coming', action: 'attack', enemy: 'foe' }] })
  const foe = at(state, 'foe')
  const coming = at(state, 'coming')
  assert.ok(Math.abs(coming.x - foe.x) + Math.abs(coming.y - foe.y) <= 1 || state.log.ofType('contact').some(e => [e.aId, e.bId].includes('coming')), `it joined the fight: ${JSON.stringify(coming)}`)
})

test('a broken unit runs for its own edge round an enemy in its way, rather than stand and be cut down', () => {
  const state = createBattleState(openSpec([
    unit({ id: 'running', position: { x: 12, y: 5 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 11, y: 5 } })
  ]), { seed: 1 })
  state.broken.add('running')
  stepTurn(state, { blue: [{ unitRef: 'foe', action: 'hold' }] })
  assert.notDeepEqual(at(state, 'running'), { x: 12, y: 5 }, 'it did not stand')
  stepTurn(state, { blue: [{ unitRef: 'foe', action: 'hold' }] })
  assert.ok(!at(state, 'running') || at(state, 'running').x < 11, `past him, westward: ${JSON.stringify(at(state, 'running'))}`)
  assert.equal(state.log.ofType('pursuit').filter(e => e.trapped).length, 0, 'not overrun where it stood')
})

test('two broken units, each in the other\'s way home, both get away', () => {
  const state = createBattleState(openSpec([
    // Each with an enemy in sight not far off, so neither stops to rally.
    unit({ id: 'red', position: { x: 12, y: 5 } }), unit({ id: 'redFriend', position: { x: 13, y: 9 } }),
    unit({ id: 'blue', side: 'blue', position: { x: 11, y: 5 } }), unit({ id: 'blueFriend', side: 'blue', position: { x: 10, y: 9 } })
  ]), { seed: 1 })
  state.broken.add('red')
  state.broken.add('blue')
  const hold = { red: [{ unitRef: 'redFriend', action: 'hold' }], blue: [{ unitRef: 'blueFriend', action: 'hold' }] }
  stepTurn(state, hold)
  stepTurn(state, hold)
  assert.ok(at(state, 'red').x < 11, `red got by: ${JSON.stringify(at(state, 'red'))}`)
  assert.ok(at(state, 'blue').x > 12, `blue got by: ${JSON.stringify(at(state, 'blue'))}`)
})

test('a broken unit cut off from its own edge runs from the enemy instead, and rallies once clear of him', () => {
  // A river down column 4, no crossing: red's way west is gone.
  const river = []
  for (let y = 0; y < 12; y++) river.push([4, y])
  const state = createBattleState(openSpec([
    unit({ id: 'cut', position: { x: 8, y: 5 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 9, y: 5 } }),
    unit({ id: 'friend', position: { x: 1, y: 1 } })
  ], { map: { name: 'cut-off', width: 30, height: 12, terrain: { river: labels(river) } } }), { seed: 1 })
  state.broken.add('cut')
  for (let t = 0; t < 4; t++) stepTurn(state, { blue: [{ unitRef: 'foe', action: 'hold' }] })
  assert.ok(state.log.ofType('rallied').some(e => e.unitId === 'cut'), 'it got clear and rallied')
  assert.ok(!state.log.ofType('destroyed').some(e => e.unitId === 'cut'), 'not cut down')
})
