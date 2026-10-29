// src/engine/map/tests/sight.test.js
//
// Who can see whom (ruled 2026-10-22): range, woods and hills. Pinned on a
// small generated map where each answer can be counted by hand, and on
// Crownhill.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createMap, resolveMap } = require('../map')
const { toLabel } = require('../labels')
const { canSee, lineOfSight, tilesBetween, visionRange } = require('../sight')

// 20x20 plain. A wood fills columns 5-9 of rows 5-9 (F6 to J10). A ridge
// runs down column 14 (O1-O20).
const forest = []
for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) forest.push(toLabel({ x, y }))
const ridge = []
for (let y = 0; y < 20; y++) ridge.push(toLabel({ x: 14, y }))
const map = createMap({ name: 'sight-20', width: 20, height: 20, terrain: { forest, hill: ridge } })

const at = (x, y, extra = {}) => ({ position: { x, y }, ...extra })

test('a sight line is the same both ways and never includes its ends', () => {
  const a = { x: 2, y: 3 }
  const b = { x: 9, y: 7 }
  assert.deepEqual(tilesBetween(a, b), tilesBetween(b, a))
  for (const t of tilesBetween(a, b)) {
    assert.ok(!(t.x === a.x && t.y === a.y) && !(t.x === b.x && t.y === b.y))
  }
  assert.deepEqual(tilesBetween({ x: 0, y: 0 }, { x: 3, y: 0 }), [{ x: 1, y: 0 }, { x: 2, y: 0 }])
})

test('range: 6 tiles, then nothing, on open ground', () => {
  assert.ok(canSee(map, at(0, 15), at(6, 15)))
  assert.ok(!canSee(map, at(0, 15), at(7, 15)))
  assert.ok(canSee(map, at(0, 15, { role: 'scout' }), at(10, 15)))
})

test('woods: a unit in the trees is seen only from 1 tile away', () => {
  // The wood's west edge is column 5. A watcher on open ground at column 2.
  assert.ok(!canSee(map, at(2, 7), at(5, 7)), '3 tiles off, on the edge of the wood: unseen')
  assert.ok(canSee(map, at(4, 7), at(5, 7)), 'right beside it: seen')
  assert.ok(!canSee(map, at(4, 7), at(6, 7)), 'one tile into the trees, two away: unseen')
})

test('woods: from the edge a unit sees out; from deep inside it sees 1 tile', () => {
  assert.ok(canSee(map, at(5, 7), at(1, 7)), 'the edge looks out over open ground')
  assert.ok(!canSee(map, at(7, 7), at(1, 7)), 'deep in the wood the trees block the view')
  assert.ok(canSee(map, at(7, 7), at(7, 8)), 'but the next tile is in plain view')
})

test('woods: a force in the trees can miss another coming through them behind it', () => {
  // Hidden at the east edge, watching the open ground east. An enemy creeps
  // through the trees from the west, two tiles behind.
  const lurker = at(9, 7)
  const flanker = at(7, 7)
  assert.ok(!canSee(map, lurker, flanker))
  assert.ok(!canSee(map, flanker, lurker), 'and neither sees the other until they are close')
  assert.ok(canSee(map, at(8, 7), lurker), 'one tile away, they meet')
})

test('a trees-free line is clear; a line through the wood is blocked', () => {
  assert.ok(lineOfSight(map, { x: 0, y: 2 }, { x: 12, y: 2 }))
  assert.ok(!lineOfSight(map, { x: 3, y: 7 }, { x: 11, y: 7 }))
})

test('hills: a ridge between two units blocks the view, unless one stands on it', () => {
  // Either side of the ridge at column 14.
  assert.ok(!canSee(map, at(12, 15), at(16, 15)), 'the reverse slope hides them')
  assert.ok(canSee(map, at(14, 15), at(16, 15)), 'from the crest they are in view')
  assert.ok(canSee(map, at(14, 15), at(10, 15)), 'and the crest sees both ways')
})

test('high ground adds 4 to range', () => {
  assert.equal(visionRange(at(14, 3), map), 10)
  assert.equal(visionRange(at(3, 3), map), 6)
})

test('Crownhill: the woods south of the north road hide what is in them', () => {
  const crownhill = resolveMap('crownhill')
  // H11 and H12 are forest (drawn map); H10 is open field above them.
  assert.ok(!canSee(crownhill, at(7, 9), at(7, 13)), 'H10 cannot see H14 through the wood')
  assert.ok(canSee(crownhill, at(7, 9), at(7, 10)), 'but sees the first trees')
})
