// src/engine/map/tests/grid.test.js
//
// The player grid (ruled 2026-10-21): 100 m squares on every map, each split
// into four 50 m quarters. Letters for columns, numbers for rows.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { gridLabel, gridSize, isGridRef, parseGridRef, gridTarget, SQUARE_TILES } = require('../grid')
const { resolveMap, createMap } = require('../map')
const { fromLabel } = require('../labels')

const crownhill = resolveMap('crownhill')
const twoKm = createMap({ name: 'open-80', width: 80, height: 80 })

test('every square is 100 m: Crownhill (1 km) is 10x10, a 2 km map is 20x20', () => {
  assert.equal(SQUARE_TILES * 25, 100)
  assert.deepEqual(gridSize(crownhill), { columns: 10, rows: 10 })
  assert.deepEqual(gridSize(twoKm), { columns: 20, rows: 20 })
  assert.equal(gridLabel({ x: 79, y: 79 }), 'T20', 'the far corner of a 2 km map')
})

test('a tile names its square and quarter', () => {
  assert.equal(gridLabel({ x: 0, y: 0 }), 'A1')
  assert.equal(gridLabel({ x: 3, y: 3 }), 'A1')
  assert.equal(gridLabel({ x: 4, y: 0 }), 'B1')
  assert.equal(gridLabel({ x: 0, y: 0 }, { quarter: true }), 'A1-NW')
  assert.equal(gridLabel({ x: 3, y: 0 }, { quarter: true }), 'A1-NE')
  assert.equal(gridLabel({ x: 0, y: 3 }, { quarter: true }), 'A1-SW')
  assert.equal(gridLabel({ x: 3, y: 3 }, { quarter: true }), 'A1-SE')
  assert.equal(gridLabel(fromLabel('T2'), { quarter: true }), 'E1-NE', 'The Crownhill crest')
})

test('grid references read in the ways people write them', () => {
  for (const text of ['C7', 'c7', 'C7-NE', 'c7 ne', 'C7NE', 'C7 north-east', 'C7 northeast']) {
    assert.ok(isGridRef(text), text)
  }
  assert.equal(parseGridRef('c7 ne').label, 'C7-NE')
  assert.deepEqual(parseGridRef('C7').tiles, { minX: 8, maxX: 11, minY: 24, maxY: 27 })
  assert.deepEqual(parseGridRef('C7-SE').tiles, { minX: 10, maxX: 11, minY: 26, maxY: 27 })
  for (const text of ['the ridge', 'C', '7', 'C0', 'C7-UP']) assert.equal(parseGridRef(text), null, text)
})

test('an order to a square goes to the passable tile nearest its middle', () => {
  const target = gridTarget(crownhill, 'C2')
  assert.equal(gridLabel(target.position), 'C2')
  assert.ok(crownhill.passable(target.position))
  const quarter = gridTarget(crownhill, 'C2-NE')
  assert.equal(gridLabel(quarter.position, { quarter: true }), 'C2-NE')
})

test('off the map, or nowhere to stand, is a reason, not a guess', () => {
  assert.match(gridTarget(crownhill, 'K1').none, /off the map/)
  const water = createMap({
    name: 'lake', width: 8, height: 8,
    terrain: { river: Array.from({ length: 16 }, (_, i) => `${String.fromCharCode(65 + (i % 4))}${Math.floor(i / 4) + 1}`) }
  })
  assert.match(gridTarget(water, 'A1').none, /cannot be entered/)
})
