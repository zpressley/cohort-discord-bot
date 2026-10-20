// src/engine/map/tests/every-tile.test.js
//
// Every tile on the current map must parse and round-trip. An earlier copy of
// parseCoord collapsed two-letter columns (AA-AN) onto single letters and left
// the eastern part of the map unreachable; the recovered branch fixed it.
//
// The map size comes from the map data, never a literal, so this test keeps
// covering every tile when the map changes size.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { MAP_SIZE } = require('../mapData')
const engine = require('../../movement/pathfinding')
const legacy = require('../../../game/maps/mapUtils')

function everyTile() {
  const tiles = []
  for (let row = 0; row < MAP_SIZE.height; row++) {
    for (let col = 0; col < MAP_SIZE.width; col++) tiles.push({ row, col })
  }
  return tiles
}

test('the map data declares its size', () => {
  assert.ok(Number.isInteger(MAP_SIZE.width) && MAP_SIZE.width > 0)
  assert.ok(Number.isInteger(MAP_SIZE.height) && MAP_SIZE.height > 0)
})

for (const [name, impl] of [['phase 1 movementEngine', engine], ['live bot mapUtils', legacy]]) {
  test(`${name}: every tile on the map parses and round-trips`, () => {
    const seen = new Set()
    for (const pos of everyTile()) {
      const coord = impl.coordToString(pos)
      assert.deepEqual(impl.parseCoord(coord), pos, `round-trip failed for ${coord}`)
      seen.add(coord)
    }
    // No two tiles may share a name, or one of them is unreachable.
    assert.equal(seen.size, MAP_SIZE.width * MAP_SIZE.height)
  })

  test(`${name}: the far east column is addressable`, () => {
    const eastEdge = MAP_SIZE.width - 1
    for (let row = 0; row < MAP_SIZE.height; row++) {
      const coord = impl.coordToString({ row, col: eastEdge })
      assert.equal(impl.parseCoord(coord).col, eastEdge, `${coord} did not reach the east edge`)
    }
  })

  test(`${name}: tiles just off the map are rejected`, () => {
    assert.throws(() => impl.parseCoord(impl.coordToString({ row: 0, col: MAP_SIZE.width })))
    assert.throws(() => impl.parseCoord(impl.coordToString({ row: MAP_SIZE.height, col: 0 })))
  })
}
