// src/engine/battle/tests/review-fixes.test.js
//
// Fixes from the November 2026 review (docs/REVIEW-2026-11.md), each pinned
// by the case that showed it. Fixtures as in contact.test.js: a 20x20 plain
// with a wood filling columns 5-9 of rows 5-9 (F6 to J10).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { toLabel } = require('../../map/labels')

const forest = []
for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) forest.push(toLabel({ x, y }))
const MAP = { name: 'review-20', width: 20, height: 20, terrain: { forest } }

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
  name: 'review', map: MAP,
  sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } },
  units, maxTurns: 10, ...extra
})

const of = (state, type) => state.log.ofType(type)
const where = (state, id) => state.world.units.find(u => u.id === id).position

// ── B1 ─────────────────────────────────────────────────
// Careful is half speed: 1.5 for a unit of range 3. A wood costs 2 a tile.
// The unit stood outside the trees for ever.

test('a careful unit can enter a wood: any unit makes at least one tile a turn', () => {
  const state = battle([unit({ id: 'scouts', position: { x: 4, y: 7 } })])
  stepTurn(state, { red: [{ unitRef: 'scouts', target: { x: 7, y: 7 }, careful: true }] })
  assert.deepEqual(where(state, 'scouts'), { x: 5, y: 7 }, 'one tile into the trees')
  stepTurn(state, {})
  assert.deepEqual(where(state, 'scouts'), { x: 6, y: 7 }, 'and one more the next turn')
})

test('the free tile is the first one only: rough ground still slows a march', () => {
  const state = battle([unit({ id: 'column', position: { x: 3, y: 7 } })])
  stepTurn(state, { red: [{ unitRef: 'column', target: { x: 7, y: 7 } }] })
  // Range 3: a tile of plain (1), a tile of wood (2), and no more.
  assert.deepEqual(where(state, 'column'), { x: 5, y: 7 })
})

// ── B2 ─────────────────────────────────────────────────

test('a broken unit does not cut down a fleeing enemy', () => {
  const pair = () => battle([
    unit({ id: 'ours', position: { x: 12, y: 12 } }),
    unit({ id: 'theirs', side: 'blue', position: { x: 13, y: 12 } })
  ])

  const bothRunning = pair()
  bothRunning.broken.add('ours')
  bothRunning.broken.add('theirs')
  stepTurn(bothRunning, {})
  assert.equal(of(bothRunning, 'pursuit').length, 0, 'two mobs running from each other')

  const oneRunning = pair()
  oneRunning.broken.add('theirs')
  stepTurn(oneRunning, {})
  assert.ok(of(oneRunning, 'pursuit').every(p => p.by === 'ours' && p.unitId === 'theirs'))
})

// ── L7, and the sidestep ───────────────────────────────
// Two slow units three tiles apart and a row off, each making for the other
// at a tile a turn (as in a wood; here in the open, where each can see the
// other and so knows where to go).

const closing = (units) => {
  const state = battle(units)
  const orders = { red: [{ unitRef: 'ours', action: 'advance' }], blue: [{ unitRef: 'theirs', action: 'advance' }] }
  for (let i = 0; i < 6 && of(state, 'contact').length === 0; i++) stepTurn(state, i === 0 ? orders : {})
  return state
}

test('two units making for each other meet, and do not sidestep for ever', () => {
  // Each used to step a row down as the other stepped a row up, every turn.
  const state = closing([
    unit({ id: 'ours', position: { x: 12, y: 12 }, movementRange: 1 }),
    unit({ id: 'theirs', side: 'blue', position: { x: 15, y: 13 }, movementRange: 1 })
  ])
  assert.equal(of(state, 'contact').length, 1)
})

test('two columns that blunder into each other in a wood are not both surprised', () => {
  // Neither can see the other until they touch; each is making for where
  // the other was last seen.
  const state = battle([
    unit({ id: 'ours', position: { x: 5, y: 6 } }),
    unit({ id: 'theirs', side: 'blue', position: { x: 8, y: 7 } })
  ])
  state.lastSeen.set('red', new Map([['theirs', { x: 8, y: 7 }]]))
  state.lastSeen.set('blue', new Map([['ours', { x: 5, y: 6 }]]))
  const orders = { red: [{ unitRef: 'ours', action: 'advance' }], blue: [{ unitRef: 'theirs', action: 'advance' }] }
  for (let i = 0; i < 6 && of(state, 'contact').length === 0; i++) stepTurn(state, i === 0 ? orders : {})
  assert.equal(of(state, 'contact').length, 1, 'they met')
  assert.equal(of(state, 'surprise').length, 0, 'neither was ready for the other')
})

// ── L12: a unit does not know where an unseen enemy stands ─────────────

test('told to advance with no enemy in sight, a unit goes straight ahead to look, not at an enemy no one has seen', () => {
  // The enemy stands far off to one side, out of sight. Red's home edge is
  // the south, so "their side of the field" is north.
  const state = battle([
    unit({ id: 'ours', position: { x: 3, y: 16 } }),
    unit({ id: 'theirs', side: 'blue', position: { x: 16, y: 16 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'ours', action: 'advance' }] })
  assert.deepEqual(where(state, 'ours'), { x: 3, y: 13 }, 'north, straight ahead; before, it turned east at once')
})

test('it goes at an enemy it can see, then at where it last saw one, and gives that up once it has stood there', () => {
  const state = battle([
    unit({ id: 'ours', position: { x: 12, y: 18 } }),
    unit({ id: 'theirs', side: 'blue', position: { x: 12, y: 13 }, movementRange: 6 })
  ])
  stepTurn(state, { red: [{ unitRef: 'ours', action: 'advance' }], blue: [{ unitRef: 'theirs', target: { x: 18, y: 2 } }] })
  assert.deepEqual(state.lastSeen.get('red').get('theirs'), { x: 12, y: 13 }, 'seen as the turn opened')
  assert.equal(where(state, 'ours').y, 15, 'and made for')
  // The enemy has gone, out of sight; ours goes on to where it was.
  for (let i = 0; i < 3; i++) stepTurn(state, {})
  assert.equal(state.lastSeen.get('red').has('theirs'), false, 'having stood there and found no one')
})

test('men who are shot at know where it came from, though they cannot see the archers', () => {
  // Archers in the edge of the wood (F8) see out; the swords in the open
  // three tiles west cannot see in.
  const state = battle([
    unit({ id: 'archers', role: 'archers', primaryWeapon: 'greek_composite_bow', armor: 'light_armor', shield: 'no_shield', position: { x: 5, y: 7 } }),
    unit({ id: 'theirs', side: 'blue', position: { x: 2, y: 7 } })
  ])
  stepTurn(state, {})
  assert.equal(of(state, 'volley').length, 1)
  assert.deepEqual(state.lastSeen.get('blue').get('archers'), { x: 5, y: 7 }, 'the place is remembered')
  // Told to press the enemy, they go at the place the arrows come from.
  stepTurn(state, { blue: [{ unitRef: 'theirs', action: 'advance' }] })
  assert.deepEqual(of(state, 'contact').map(e => [e.aId, e.bId]), [['archers', 'theirs']], 'up to the trees, where they find them')
})
