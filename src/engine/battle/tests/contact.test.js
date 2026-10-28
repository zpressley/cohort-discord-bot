// src/engine/battle/tests/contact.test.js
//
// Stage 3: two units side by side fight only if one of them is looking for a
// fight, and a unit caught marching by an enemy it never saw is surprised.
// Fixtures on a small generated map: a 20x20 plain with a wood filling
// columns 5-9 of rows 5-9 (F6 to J10).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { toLabel } = require('../../map/labels')

const forest = []
for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) forest.push(toLabel({ x, y }))
const MAP = { name: 'contact-20', width: 20, height: 20, terrain: { forest } }

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 2 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}

const battle = (units, extra = {}) => createBattleState({
  name: 'contact', map: MAP,
  sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } },
  units, maxTurns: 10, ...extra
})

const of = (state, type) => state.log.ofType(type)
const where = (state, id) => state.world.units.find(u => u.id === id).position

test('two units holding side by side never come to blows', () => {
  const state = battle([unit({ id: 'a', position: { x: 12, y: 12 } }), unit({ id: 'b', side: 'blue', position: { x: 13, y: 12 } })])
  for (let i = 0; i < 3; i++) stepTurn(state, {})
  assert.equal(of(state, 'exchange').length, 0)
  assert.equal(of(state, 'contact').length, 0)
})

test('a unit on the move walks past an enemy that does not seek a fight', () => {
  const state = battle([
    unit({ id: 'walker', position: { x: 12, y: 16 } }),
    unit({ id: 'sentry', side: 'blue', position: { x: 13, y: 13 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'walker', target: { x: 12, y: 10 } }] })
  stepTurn(state, {})
  assert.deepEqual(where(state, 'walker'), { x: 12, y: 10 }, 'it marched on past')
  assert.equal(of(state, 'exchange').length, 0)
})

test('a unit looking for a fight finds one, and the other fights back', () => {
  const state = battle([
    unit({ id: 'hunter', position: { x: 12, y: 16 } }),
    unit({ id: 'sentry', side: 'blue', position: { x: 12, y: 12 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'hunter', action: 'advance' }] })
  stepTurn(state, {})
  assert.ok(of(state, 'exchange').length > 0)
  assert.equal(of(state, 'contact').length, 1)
})

// The ambush: a force in the wood's west edge (F8), ordered to attack where
// it stands, and a column marching north past the trees along column E.
const ambush = (columnOrder, start = { x: 4, y: 10 }) => {
  const state = battle([
    unit({ id: 'column', position: start }),
    unit({ id: 'lurker', side: 'blue', position: { x: 5, y: 7 } })
  ])
  stepTurn(state, {
    red: [{ unitRef: 'column', target: { x: 4, y: 0 }, ...columnOrder }],
    blue: [{ unitRef: 'lurker', action: 'attack', target: { x: 5, y: 7 } }]
  })
  return state
}

test('a column marching past a wood is surprised by the enemy hidden in it', () => {
  const state = ambush({})
  assert.deepEqual(where(state, 'column'), { x: 4, y: 7 }, 'marched up beside the trees')
  const surprise = of(state, 'surprise')
  assert.deepEqual(surprise.map(e => [e.unitId, e.by, e.posture]), [['column', 'lurker', 'marching']])

  const first = of(state, 'exchange')[0]
  const lurker = first.a.unitId === 'lurker' ? first.a : first.b
  const column = first.a.unitId === 'lurker' ? first.b : first.a
  assert.equal(lurker.surprise, true)
  assert.equal(column.surprise, false)
})

test('the same column marching carefully is not surprised', () => {
  // Careful is half speed, so it starts a tile closer to reach the same spot.
  const state = ambush({ careful: true }, { x: 4, y: 8 })
  assert.deepEqual(where(state, 'column'), { x: 4, y: 7 })
  assert.ok(of(state, 'exchange').length > 0, 'it is still attacked')
  assert.equal(of(state, 'surprise').length, 0, 'but not caught unawares')
})

test('an enemy seen coming is no surprise', () => {
  // Out on the open plain, the raider is in plain view as the turn opens.
  const state = battle([
    unit({ id: 'column', position: { x: 14, y: 16 } }),
    unit({ id: 'raider', side: 'blue', position: { x: 15, y: 13 } })
  ])
  stepTurn(state, {
    red: [{ unitRef: 'column', target: { x: 14, y: 0 } }],
    blue: [{ unitRef: 'raider', action: 'attack', target: { x: 15, y: 13 } }]
  })
  assert.ok(of(state, 'exchange').length > 0)
  assert.equal(of(state, 'surprise').length, 0)
})

test('surprise hurts: the caught column loses more than one that saw it coming', () => {
  const moraleAfter = (careful, start) => {
    const state = ambush(careful ? { careful: true } : {}, start)
    const first = of(state, 'exchange')[0]
    return (first.a.unitId === 'column' ? first.a : first.b).morale
  }
  assert.ok(moraleAfter(false, { x: 4, y: 10 }) < moraleAfter(true, { x: 4, y: 8 }))
})
