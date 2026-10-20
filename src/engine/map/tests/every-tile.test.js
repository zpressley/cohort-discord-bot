// src/engine/map/tests/every-tile.test.js
//
// Every tile on every map must have a label that translates back to the same
// position. An earlier copy of parseCoord collapsed two-letter columns (AA-AN)
// onto single letters and left the eastern part of the map unreachable; the
// recovered branch fixed it, and Stage 1 replaced the parser with labels.js.
//
// Sizes come from the maps themselves, never a literal, so this keeps covering
// every tile as maps change size.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { MAPS } = require('../../../data/maps')
const { resolveMap, createMap } = require('../map')
const { toLabel, fromLabel, toPosition } = require('../labels')
const legacy = require('../../../game/maps/mapUtils')

function everyTile(map) {
  const tiles = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) tiles.push({ x, y })
  }
  return tiles
}

for (const name of Object.keys(MAPS)) {
  const map = resolveMap(name)

  test(`${name}: the map declares a positive size`, () => {
    assert.ok(Number.isInteger(map.width) && map.width > 0)
    assert.ok(Number.isInteger(map.height) && map.height > 0)
  })

  test(`${name}: every tile's label round-trips and names one tile only`, () => {
    const seen = new Set()
    for (const position of everyTile(map)) {
      const label = toLabel(position)
      assert.deepEqual(fromLabel(label), position, `round-trip failed for ${label}`)
      assert.ok(map.inBounds(fromLabel(label)))
      seen.add(label)
    }
    assert.equal(seen.size, map.width * map.height)
  })

  test(`${name}: the far east column and south row are on the map, one past is not`, () => {
    for (let y = 0; y < map.height; y++) assert.ok(map.inBounds({ x: map.width - 1, y }))
    for (let x = 0; x < map.width; x++) assert.ok(map.inBounds({ x, y: map.height - 1 }))
    assert.ok(!map.inBounds({ x: map.width, y: 0 }))
    assert.ok(!map.inBounds({ x: 0, y: map.height }))
    assert.ok(!map.inBounds({ x: -1, y: 0 }))
  })
}

test('labels work for any width: 2 km maps and far beyond', () => {
  const big = createMap({ name: 'big', width: 800, height: 800 })
  for (const x of [0, 25, 26, 79, 701, 702, 799]) {
    const position = { x, y: 799 }
    assert.deepEqual(fromLabel(toLabel(position)), position)
    assert.ok(big.inBounds(position))
  }
  assert.equal(toLabel({ x: 25, y: 0 }), 'Z1')
  assert.equal(toLabel({ x: 26, y: 0 }), 'AA1')
  assert.equal(toLabel({ x: 79, y: 79 }), 'CB80', 'the far corner of an 80x80 map')
  assert.equal(toLabel({ x: 702, y: 0 }), 'AAA1', 'three-letter columns past ZZ')
})

test('labels are read case-blind; anything else is refused, not guessed', () => {
  assert.deepEqual(fromLabel('aa12'), { x: 26, y: 11 })
  assert.deepEqual(toPosition({ x: 3, y: 4 }), { x: 3, y: 4 })
  for (const bad of ['', 'A0', '12', 'A-1', 'A1B', null, { x: 1.5, y: 0 }]) {
    assert.throws(() => toPosition(bad), `${JSON.stringify(bad)} must be refused`)
  }
})

test('the live bot\'s mapUtils labels agree with the engine on Crownhill', () => {
  // The legacy Discord bot still parses coordinates itself. Until it runs on
  // the engine, the two must name every tile the same way.
  const map = resolveMap('crownhill')
  for (const { x, y } of everyTile(map)) {
    const label = legacy.coordToString({ row: y, col: x })
    assert.equal(label, toLabel({ x, y }))
    assert.deepEqual(legacy.parseCoord(label), { row: y, col: x })
  }
})
