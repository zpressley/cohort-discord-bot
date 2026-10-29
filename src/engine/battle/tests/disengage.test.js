// src/engine/battle/tests/disengage.test.js
//
// Ruled 2026-10-29:
//   - a fight holds on: breaking contact costs movement, and the enemy gets
//     a parting blow as heavy as chance makes it, lighter for drilled troops
//     and for a careful (orderly) withdrawal;
//   - a hidden unit with an enemy lingering beside it is ever likelier to be
//     noticed;
//   - an ambush told to strike whatever happens shuts the trap on an enemy
//     that stands beside it.
// Fixtures on an open 20x20 plain, with a wood in columns 5-9 of rows 5-9
// for the hiding tests.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { toLabel } = require('../../map/labels')

const forest = []
for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) forest.push(toLabel({ x, y }))
const MAP = { name: 'disengage-20', width: 20, height: 20, terrain: { forest } }

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
const battle = (units, seed = 1) => createBattleState({
  name: 'disengage', map: MAP, seed,
  sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
  units, maxTurns: 10
})
const of = (state, type) => state.log.ofType(type)

// Turn 1: red attacks the blue unit standing beside it. Turn 2: red breaks
// off westward.
function breakOff(quality, careful, seed) {
  const state = battle([
    unit({ id: 'red', quality, position: at(14, 15) }),
    unit({ id: 'blue', side: 'blue', position: at(15, 15) })
  ], seed)
  stepTurn(state, { red: [{ unitRef: 'red', action: 'attack', target: at(14, 15) }] })
  assert.ok(of(state, 'exchange').length > 0, 'they fought')
  const before = state.world.units.find(u => u.id === 'red').strength
  stepTurn(state, { red: [{ unitRef: 'red', target: at(4, 15), ...(careful ? { careful: true } : {}) }] })
  return { state, before }
}

test('breaking contact costs a tile of movement', () => {
  const { state } = breakOff('professional', false, 1)
  assert.deepEqual(state.world.units.find(u => u.id === 'red').position, at(12, 15), 'two tiles, not three')
})

test('the enemy gets a parting blow, and the log says how it went', () => {
  const { state, before } = breakOff('levy', false, 3)
  const [left] = of(state, 'disengage')
  assert.equal(left.unitId, 'red')
  assert.deepEqual(left.from, ['blue'])
  assert.equal(left.orderly, false)
  assert.ok(left.chaos >= 0 && left.chaos <= 10)
  assert.equal(state.world.units.find(u => u.id === 'red').strength, before - left.killed)
})

test('drilled troops and an orderly withdrawal get away more cheaply', () => {
  const cost = (quality, careful) => {
    let men = 0
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = breakOff(quality, careful, seed)
      men += of(state, 'disengage').reduce((s, e) => s + e.killed + e.morale, 0)
    }
    return men
  }
  assert.ok(cost('elite', false) < cost('levy', false), 'the phalanx withdraws in good order')
  assert.ok(cost('levy', true) < cost('levy', false), 'carefully is cheaper than rapidly')
  assert.ok(cost('elite', true) > 0, 'but chance can still bite')
})

test('a hidden unit with an enemy lingering beside it is noticed, sooner or later', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const state = battle([
      unit({ id: 'lurker', position: at(7, 7) }),
      unit({ id: 'sentry', side: 'blue', position: at(14, 14) })
    ], seed)
    stepTurn(state, { red: [{ unitRef: 'lurker', action: 'hide' }] })
    assert.equal(state.hidden.has('lurker'), true)
    state.world.units.find(u => u.id === 'sentry').position = at(7, 8)
    for (let i = 0; i < 4; i++) stepTurn(state, {})
    const noticed = of(state, 'revealed').filter(e => e.reason === 'noticed')
    assert.deepEqual(noticed.map(e => [e.unitId, e.by]), [['lurker', 'sentry']], `seed ${seed}`)
  }
})

test('an ambush told to strike whatever happens shuts the trap on a unit standing beside it', () => {
  const state = battle([
    unit({ id: 'lurker', side: 'blue', position: at(7, 7) }),
    unit({ id: 'idler', position: at(14, 14) })
  ])
  stepTurn(state, { blue: [{ unitRef: 'lurker', action: 'ambush', regardless: true }] })
  assert.equal(state.hidden.has('lurker'), true)
  state.world.units.find(u => u.id === 'idler').position = at(7, 8)
  stepTurn(state, {})
  assert.deepEqual(of(state, 'ambush').map(e => [e.unitId, e.on]), [['lurker', 'idler']])
  assert.ok(of(state, 'exchange').length > 0)
})
