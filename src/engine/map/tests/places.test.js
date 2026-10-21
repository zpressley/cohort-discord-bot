// src/engine/map/tests/places.test.js
//
// "The ridge to the east", "the clearing", "the woods north of the South
// Ford": the ground as players describe it (ruling of 2026-10-21). Pinned on
// Crownhill, where each answer can be checked against the drawn map.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { resolveMap } = require('../map')
const { parsePlace, findPlace } = require('../places')
const { fromLabel, toLabel } = require('../labels')

const map = resolveMap('crownhill')
const at = (label, words) => findPlace(map, fromLabel(label), words)

// ── Reading the words ──────────────────────────────────

test('words become a place reference: kind, direction, nearest, part', () => {
  assert.deepEqual(parsePlace('approach the ridge to the north east'), {
    kinds: ['hill'], word: 'ridge', direction: 'north-east', nearest: false, name: null, from: null, part: null
  })
  assert.deepEqual(parsePlace('the heights').kinds, ['hill'])
  assert.deepEqual(parsePlace('the high ground').kinds, ['hill'])
  assert.deepEqual(parsePlace('into the trees').kinds, ['woods'])
  assert.deepEqual(parsePlace('the crossing').kinds, ['ford', 'bridge'])
  assert.equal(parsePlace('the nearest clearing').nearest, true)
  assert.equal(parsePlace('the edge of the woods').part, 'near')
  assert.equal(parsePlace('the top of the hill').part, 'centre')
  assert.equal(parsePlace('the woods to the southwest').direction, 'south-west')
})

test('an anchored phrase keeps its anchor: "the woods north of the ford"', () => {
  const ref = parsePlace('the woods north of the ford')
  assert.deepEqual(ref.kinds, ['woods'])
  assert.equal(ref.direction, 'north')
  assert.deepEqual(ref.from.kinds, ['ford'])
})

test('words with no ground in them are not a place', () => {
  assert.equal(parsePlace('over there somewhere'), null)
  assert.equal(parsePlace(''), null)
  assert.ok(at('D4', 'the fields of asphodel').none)
})

// ── Finding it ─────────────────────────────────────────

test('"the ridge" from the north-west field is a question, never a guess', () => {
  // The Crownhill (east) and Shepherd's Ridge (south) are nearly the same
  // distance from D4.
  const result = at('D4', 'the ridge')
  assert.ok(result.question, 'two ridges are about equally near')
  assert.match(result.question, /The Crownhill/)
  assert.match(result.question, /Shepherd's Ridge/)
  assert.equal(result.options.length, 2)
})

test('a direction settles it: the ridge to the east, the ridge to the south', () => {
  assert.equal(at('D4', 'the ridge to the east').feature.name, 'The Crownhill')
  assert.equal(at('D4', 'the ridge to the south').feature.name, "Shepherd's Ridge")
  assert.match(at('D4', 'the ridge to the east').description, /east/)
})

test('a direction with nothing that way says so', () => {
  assert.match(at('D4', 'the marsh to the west').none, /no marsh lies west/)
})

test('"stop at the clearing" finds the clearing near the unit', () => {
  assert.ok(at('D27', 'the clearing').feature.tiles.some(t => toLabel(t) === 'C30'))
  assert.ok(at('K15', 'stop at the clearing').feature.tiles.some(t => toLabel(t) === 'K18'))
})

test('the nearest ford is chosen when it is clearly nearest', () => {
  assert.equal(at('V18', 'the ford').feature.name, "Miller's Crossing")
})

test('a named landmark resolves by its exact name, ahead of reading the words', () => {
  // "Miller's Crossing" contains "crossing"; the name must win over "the
  // nearest crossing".
  assert.equal(at('X30', "Miller's Crossing").feature.name, "Miller's Crossing")
  assert.equal(at('W10', 'North Ford').feature.name, 'North Ford')
  assert.equal(at('D4', 'harrow bridge').feature.name, 'Harrow Bridge')
  // An alias is NOT a name: "the ridge" is read as ground, not as Shepherd's
  // Ridge (the old landmark clash).
  assert.ok(at('D4', 'the ridge').question)
})

test('an anchor can be a landmark name: the woods east of Harrow Bridge', () => {
  const result = at('D4', 'the woods east of harrow bridge')
  assert.equal(result.feature.kind, 'woods')
  const bridge = fromLabel('H15')
  assert.ok(result.feature.centre.x > bridge.x, 'the wood chosen lies east of the bridge')
})

test('where in the feature: up on a hill, the near edge of woods, the bank of a river', () => {
  const hill = at('D4', 'the ridge to the east')
  assert.deepEqual(hill.position, hill.feature.centre, 'a hill means its crest')

  const woods = at('D4', 'the woods')
  assert.equal(map.terrainAt(woods.position), 'forest')
  assert.equal(toLabel(woods.position), 'B4', 'the edge nearest the unit')

  const river = at('S8', 'the river')
  assert.notEqual(map.terrainAt(river.position), 'river', 'nobody stands in the river')
  assert.ok(map.passable(river.position))
  assert.ok(map.neighbors(river.position).some(n => map.terrainAt(n) === 'river'), 'on the bank')
})

test('every answer is a tile a unit can stand on', () => {
  const asks = ['the ridge to the east', 'the woods', 'the river', 'the ford', 'the clearing',
    'the road', 'the marsh', 'Harrow Bridge', 'the crossing to the north']
  for (const from of ['D4', 'K15', 'V18', 'X30', 'AE10']) {
    for (const words of asks) {
      const result = at(from, words)
      const answers = result.options ?? (result.position ? [result] : [])
      for (const answer of answers) {
        assert.ok(map.passable(answer.position), `${words} from ${from} -> ${toLabel(answer.position)} is not passable`)
      }
    }
  }
})

test('the same question always gets the same answer', () => {
  assert.equal(JSON.stringify(at('D4', 'the ridge')), JSON.stringify(at('D4', 'the ridge')))
  assert.equal(JSON.stringify(at('K15', 'the woods to the north')), JSON.stringify(at('K15', 'the woods to the north')))
})
