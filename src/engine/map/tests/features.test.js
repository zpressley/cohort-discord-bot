// src/engine/map/tests/features.test.js
//
// The map finds its own features from terrain. Pinned on Crownhill, where
// the answers can be checked by eye against the drawn map, and on a
// generated map no one authored.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { resolveMap, createMap } = require('../map')
const { detectFeatures, featuresAt, KINDS } = require('../features')
const { toLabel, fromLabel, positionKey, distance } = require('../labels')

const crownhill = resolveMap('crownhill')
const features = detectFeatures(crownhill)
const ofKind = (kind) => features.filter(f => f.kind === kind)
const named = (name) => features.find(f => f.name === name)

const TERRAIN_OF = {
  hill: ['hill'], woods: ['forest'], marsh: ['marsh'], river: ['river'],
  ford: ['ford'], bridge: ['bridge'], road: ['road'], clearing: ['plains']
}

test('every feature is well formed: known kind, its own terrain, centre on the feature', () => {
  for (const f of features) {
    assert.ok(KINDS.includes(f.kind), `unknown kind ${f.kind}`)
    assert.equal(f.size, f.tiles.length)
    for (const tile of f.tiles) {
      assert.ok(TERRAIN_OF[f.kind].includes(crownhill.terrainAt(tile)),
        `${f.id} includes ${toLabel(tile)} which is ${crownhill.terrainAt(tile)}`)
    }
    assert.ok(f.tiles.some(t => positionKey(t) === positionKey(f.centre)), `${f.id} centre is off the feature`)
    const { minX, maxX, minY, maxY } = f.bounds
    assert.ok(f.tiles.every(t => t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY))
  }
})

test('no tile belongs to two features of the same kind', () => {
  for (const kind of KINDS) {
    const seen = new Set()
    for (const f of ofKind(kind)) {
      for (const tile of f.tiles) {
        assert.ok(!seen.has(positionKey(tile)), `${toLabel(tile)} is in two ${kind} features`)
        seen.add(positionKey(tile))
      }
    }
  }
})

test('Crownhill: both hills are found and carry their landmark names', () => {
  const crown = named('The Crownhill')
  const ridge = named("Shepherd's Ridge")
  assert.equal(crown?.kind, 'hill')
  assert.equal(ridge?.kind, 'hill')
  assert.ok(crown.tiles.some(t => toLabel(t) === 'Q1'))
  assert.ok(ridge.tiles.some(t => toLabel(t) === 'A20'))
  // Shape is a description, not a gate: a player may call either a ridge.
  for (const hill of ofKind('hill')) assert.ok(['hill', 'ridge'].includes(hill.shape))
})

test('Crownhill: the three fords and the bridge are found and named', () => {
  assert.deepEqual(ofKind('ford').map(f => f.name).sort(),
    ['Miller\'s Crossing', 'North Ford', 'South Ford'])
  assert.deepEqual(ofKind('bridge').map(f => f.name), ['Harrow Bridge'])
})

test('Crownhill: the river is one river and the road one road, through their crossings', () => {
  const count = (terrain) => {
    let n = 0
    for (let y = 0; y < crownhill.height; y++) {
      for (let x = 0; x < crownhill.width; x++) if (crownhill.terrainAt({ x, y }) === terrain) n++
    }
    return n
  }
  assert.equal(ofKind('river').length, 1)
  assert.equal(ofKind('river')[0].size, count('river'), 'every river tile is in it')
  assert.equal(ofKind('road').length, 1)
  assert.equal(ofKind('road')[0].size, count('road'))
  assert.equal(ofKind('road')[0].name, 'The Merchant Road')
})

test('Crownhill: exactly the two clearings ringed by woods', () => {
  // Drawn map: the open pocket at J19/K18-K19 and the one at C30-D31, both
  // wholly surrounded by forest. The big open fields are not clearings.
  const clearings = ofKind('clearing')
  assert.equal(clearings.length, 2)
  const labels = clearings.map(c => c.tiles.map(toLabel))
  assert.ok(labels.some(l => l.includes('K18') && l.includes('J19')))
  assert.ok(labels.some(l => l.includes('C30') && l.includes('D31')))
})

test('small scraps are not features: no woods under 4 tiles, no hill under 3', () => {
  for (const f of ofKind('woods')) assert.ok(f.size >= 4)
  for (const f of ofKind('hill')) assert.ok(f.size >= 3)
})

test('featuresAt answers what a tile is part of', () => {
  const at = featuresAt(crownhill, fromLabel('W6')).map(f => f.name)
  assert.deepEqual(at, ['North Ford'])
  assert.deepEqual(featuresAt(crownhill, fromLabel('D4')), [], 'open field belongs to nothing')
})

test('detection is deterministic and cached per map', () => {
  const again = detectFeatures(resolveMap('crownhill'))
  assert.equal(again, features, 'same map, same cached answer')
  const fresh = detectFeatures(createMap(require('../../../data/maps/crownhill')))
  assert.equal(JSON.stringify(fresh), JSON.stringify(features), 'a rebuilt map finds the same features')
})

test('a generated map with no names still gets its features', () => {
  // 30x30: a river down column 15 with one ford, a long ridge, a wood with a
  // clearing cut into it.
  const river = []
  for (let y = 0; y < 30; y++) if (y !== 12) river.push(toLabel({ x: 15, y }))
  const ridge = []
  for (let y = 4; y <= 20; y++) for (let x = 20; x <= 21; x++) ridge.push(toLabel({ x, y }))
  const forest = []
  for (let y = 2; y <= 9; y++) {
    for (let x = 2; x <= 9; x++) {
      const inClearing = x >= 5 && x <= 6 && y >= 5 && y <= 6
      if (!inClearing) forest.push(toLabel({ x, y }))
    }
  }
  const map = createMap({
    name: 'generated-30', width: 30, height: 30,
    cells: { [toLabel({ x: 15, y: 12 })]: { terrain: 'ford' } },
    terrain: { river, hill: ridge, forest }
  })
  const found = detectFeatures(map)
  const kinds = (k) => found.filter(f => f.kind === k)

  assert.equal(kinds('river').length, 1)
  assert.equal(kinds('ford').length, 1)
  assert.equal(kinds('hill').length, 1)
  assert.equal(kinds('hill')[0].shape, 'ridge', 'a 2x17 hill is a ridge')
  assert.equal(kinds('woods').length, 1)
  assert.equal(kinds('clearing').length, 1)
  assert.equal(kinds('clearing')[0].size, 4)
  assert.ok(distance(kinds('clearing')[0].centre, { x: 5, y: 5 }) <= 1)
  assert.ok(found.every(f => f.name === null), 'nothing is named, and nothing needs to be')
})
