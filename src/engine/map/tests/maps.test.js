// src/engine/map/tests/maps.test.js
//
// Every authored map is a fair field: it loads, its named places are where
// they say and are found by name, rivers can be crossed, the road is one
// road, and both scenarios' armies form up on open ground and fight to a
// verdict.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { MAPS } = require('../../../data/maps')
const { resolveMap } = require('../map')
const { detectFeatures } = require('../features')
const { findPlace } = require('../places')
const { deployArmies } = require('../deploy')
const { positionKey, toPosition } = require('../labels')
const { loadScenario } = require('../../../adapters/hotseat/scenarios')
const { runBattle } = require('../../battle/battle')

const names = Object.keys(MAPS)

test('there are several maps, each 1 km square', () => {
  assert.ok(names.length >= 4)
  for (const name of names) {
    const map = resolveMap(name)
    assert.equal(map.width, 40, name)
    assert.equal(map.height, 40, name)
    assert.ok(MAPS[name].title, `${name} has a title`)
  }
})

for (const name of names) {
  test(`${name}: every landmark stands on its own ground and is found by name`, () => {
    const map = resolveMap(name)
    const landmarks = map.landmarks()
    assert.ok(landmarks.length >= 4, 'enough named places to talk about')
    for (const l of landmarks) {
      assert.equal(map.terrainAt(l.position), l.terrain, `${l.landmark} is on ${l.terrain}`)
      const found = findPlace(map, { x: 20, y: 20 }, l.landmark)
      assert.ok(found.feature || found.position, `"${l.landmark}" resolves`)
    }
  })

  test(`${name}: every river can be crossed, and the road is one road`, () => {
    const map = resolveMap(name)
    const features = detectFeatures(map)
    const rivers = features.filter(f => f.kind === 'river')
    const crossings = features.filter(f => f.kind === 'ford' || f.kind === 'bridge')
    if (rivers.length > 0) assert.ok(crossings.length >= 1, 'at least one ford or bridge')
    assert.equal(features.filter(f => f.kind === 'road').length, 1, 'the road is unbroken')
  })

  test(`${name}: both scenarios form up on open ground, one unit to a tile`, () => {
    for (const scenario of ['meeting-battle', 'legions-vs-celts']) {
      const spec = loadScenario(scenario, { map: name })
      const map = resolveMap(spec.map ?? 'crownhill')
      const seen = new Set()
      for (const unit of spec.units) {
        const at = toPosition(unit.position)
        assert.ok(map.passable(at), `${scenario}: ${unit.id} can stand there`)
        assert.ok(!['river', 'marsh', 'ford', 'bridge'].includes(map.terrainAt(at)), `${scenario}: ${unit.id} is not in the water`)
        const key = positionKey(at)
        assert.ok(!seen.has(key), `${scenario}: ${unit.id} has its own tile`)
        seen.add(key)
      }
    }
  })

  test(`${name}: a meeting battle reaches a verdict`, () => {
    for (let seed = 1; seed <= 3; seed++) {
      const result = runBattle({ ...loadScenario('meeting-battle', { map: name }), maxTurns: 60 }, { seed })
      assert.ok(result.outcome.decided, `seed ${seed}`)
    }
  })
}

test('deployment keeps a formation and never puts an army in the water', () => {
  const map = resolveMap('ashford')
  const units = [
    { id: 'a', side: 'red', position: { x: 4, y: 6 } },
    { id: 'b', side: 'red', position: { x: 4, y: 7 } },
    { id: 'c', side: 'red', position: { x: 3, y: 7 } }
  ]
  const placed = deployArmies(map, units, { red: { homeEdge: 'west' } })
  const [a, b, c] = placed.map(u => u.position)
  assert.deepEqual({ x: b.x - a.x, y: b.y - a.y }, { x: 0, y: 1 }, 'the same shape')
  assert.deepEqual({ x: c.x - b.x, y: c.y - b.y }, { x: -1, y: 0 })
  assert.ok(a.x < 20, 'on the west side of the field')
  assert.equal(JSON.stringify(deployArmies(map, units, { red: { homeEdge: 'west' } })), JSON.stringify(placed), 'the same every time')
})

test('Crownhill keeps the scenarios as drawn', () => {
  const drawn = loadScenario('meeting-battle')
  const onCrownhill = loadScenario('meeting-battle', { map: 'crownhill' })
  assert.deepEqual(onCrownhill.units, drawn.units)
  assert.equal(loadScenario('meeting-battle', { map: 'atlantis' }), null)
})
