// src/engine/battle/tests/flight.test.js
//
// Running by the open way (the second playthrough of November 24, S7;
// docs/DECISIONS.md, "How columns, wavering under fire and flight were
// mended", part 2): a broken unit runs for its own edge round an enemy in
// its way, and cut off from its edge runs from the enemy, where it may
// rally. (Moved here from columns.test.js when its marching rule was
// withdrawn, November 28: archive/src/engine/battle/tests/columns.test.js.)

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { toLabel } = require('../../map/labels')

const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 1, y: 4 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
const labels = (tiles) => tiles.map(([x, y]) => toLabel({ x, y }))
const at = (state, id) => state.world.units.find(u => u.id === id)?.position

const OPEN = { name: 'open-30', width: 30, height: 12, terrain: {} }
const openSpec = (units, extra = {}) => ({ name: 'open', map: OPEN, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, units, ...extra })

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
