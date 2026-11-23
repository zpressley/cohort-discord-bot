// src/engine/veterans/tests/veterancy-in-battle.test.js
//
// A unit's veterancy in a battle (docs/design/army-balance.md, part 4;
// taken 2026-11-23): its level, and what the computer's army takes to
// match a Commander's, up to seasoned.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { veterancyLevel, matchedVeterancy } = require('../veterancy')
const T = require('../../combat/tables')
const { createUnit } = require('../../world')

test('a unit\'s veterancy is raw below four battles a man, then green, seasoned, veteran and legendary at the steps an officer\'s grades use', () => {
  assert.equal(veterancyLevel(undefined), 'raw')
  assert.equal(veterancyLevel(0), 'raw')
  assert.equal(veterancyLevel(3.99), 'raw')
  assert.equal(veterancyLevel(4), 'green')
  assert.equal(veterancyLevel(7.5), 'green')
  assert.equal(veterancyLevel(8), 'seasoned')
  assert.equal(veterancyLevel(13), 'veteran')
  assert.equal(veterancyLevel(20), 'legendary')
  assert.equal(veterancyLevel(30), 'legendary')
  assert.deepEqual(T.VETERANCY.STEPS.map(s => veterancyLevel(s.from)), ['green', 'seasoned', 'veteran', 'legendary'])
})

test('the computer matches the average veterancy of the units a Commander fields, each unit counting once, the elite among them', () => {
  // Three units of different sizes: the numbers do not weigh.
  assert.equal(matchedVeterancy([{ veterancy: 2, strength: 40 }, { veterancy: 4, strength: 100 }, { veterancy: 6, strength: 80, quality: 'elite' }]), 4)
  // A unit raised new counts, as nothing.
  assert.equal(matchedVeterancy([{ veterancy: 6 }, {}]), 3)
  assert.equal(matchedVeterancy([{ veterancy: 1 }, { veterancy: 1 }, { veterancy: 0 }]), 0.67)
})

test('the computer never matches above seasoned, however long-lived the Commander', () => {
  assert.equal(T.VETERANCY.MATCH_UP_TO, 8)
  assert.equal(veterancyLevel(T.VETERANCY.MATCH_UP_TO), 'seasoned')
  assert.equal(matchedVeterancy([{ veterancy: 30 }, { veterancy: 20 }]), 8)
  assert.equal(matchedVeterancy([{ veterancy: 8.5 }]), 8)
})

test('a Commander who fields no veterancy, or no units, gives the computer none', () => {
  assert.equal(matchedVeterancy([]), 0)
  assert.equal(matchedVeterancy(null), 0)
  assert.equal(matchedVeterancy([{}, { veterancy: 0 }]), 0)
})

test('a unit\'s veterancy in the battle\'s spec reaches the field, and a unit with none carries none', () => {
  const base = { id: 'red_spears', side: 'red', type: 'infantry', strength: 100, position: { x: 1, y: 1 } }
  assert.equal(createUnit({ ...base, veterancy: 12.5 }).veterancy, 12.5)
  assert.equal('veterancy' in createUnit(base), false)
  assert.equal('veterancy' in createUnit({ ...base, veterancy: 0 }), false)
})
