// src/engine/battle/tests/form-up.test.js
//
// Units sent to one place by one order form up beside one another about it
// (the playthrough of November 24, D11; battle/formUp.js). On the open plain
// of Crownhill's south-middle, as crowding.test.js.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { formUp } = require('../formUp')
const { resolveMap } = require('../../map/map')

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: 'J24',
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}
const spec = (units) => ({ name: 'form-up', sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, units, maxTurns: 10 })
const key = (p) => `${p.x},${p.y}`

test('units sent to one place by one order form up beside one another there, one to a tile, the first on the spot', () => {
  const state = createBattleState(spec([
    unit({ id: 'one', position: 'J22' }), unit({ id: 'two', position: 'J24' }), unit({ id: 'three', position: 'J26' }),
    unit({ id: 'far', side: 'blue', position: 'AC40' })
  ]))
  const spot = { x: 12, y: 24 }
  for (let t = 0; t < 4; t++) stepTurn(state, t === 0 ? { red: [{ unitRef: 'everyone', action: 'defend', target: spot }] } : {})
  const at = ['one', 'two', 'three'].map(id => state.world.units.find(u => u.id === id).position)
  assert.equal(new Set(at.map(key)).size, 3, 'each on a tile of its own')
  assert.ok(at.some(p => key(p) === key(spot)), 'one on the spot itself')
  // A line across the way the enemy lies (east): one column, side by side.
  assert.ok(at.every(p => p.x === spot.x && Math.abs(p.y - spot.y) <= 1), JSON.stringify(at))
  assert.equal(state.log.ofType('crowding').filter(e => e.tier !== 'organized').length, 0, 'never packed')
})

test('units sent into the same fight are not pushed apart: an attack on a place keeps its place', () => {
  const units = [unit({ id: 'one', position: { x: 10, y: 22 } }), unit({ id: 'two', position: { x: 10, y: 24 } })]
  const orders = units.map(u => ({ unitId: u.id, action: 'attack', target: { x: 14, y: 23 } }))
  assert.deepEqual(formUp(orders, { map: resolveMap('crownhill'), units }), orders)
})

test('one unit sent to a place, or units sent to different places, go where they were told', () => {
  const units = [unit({ id: 'one', position: { x: 10, y: 22 } }), unit({ id: 'two', position: { x: 10, y: 24 } })]
  const orders = [{ unitId: 'one', action: 'move', target: { x: 14, y: 23 } }, { unitId: 'two', action: 'move', target: { x: 14, y: 25 } }]
  assert.deepEqual(formUp(orders, { map: resolveMap('crownhill'), units }), orders)
})

test('forming up keeps off water, and to the place\'s own side of it', () => {
  // Beside the river on Crownhill: none of the line on the river or across it.
  const map = resolveMap('crownhill')
  const spot = { x: 19, y: 23 }   // open ground, the river just east of it
  const units = ['a', 'b', 'c', 'd'].map((id, i) => unit({ id, position: { x: 12, y: 20 + i } }))
  const placed = formUp(units.map(u => ({ unitId: u.id, action: 'move', target: spot })), { map, units, enemyEdge: 'east' })
  assert.equal(new Set(placed.map(o => key(o.target))).size, 4)
  for (const o of placed) {
    assert.ok(map.passable(o.target) && map.terrainAt(o.target) !== 'river', JSON.stringify(o.target))
    assert.ok(o.target.x <= spot.x, 'this side of the river')
  }
})
