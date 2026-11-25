// src/narrator/tests/battle-kinds.test.js
//
// The words for the kinds of battle (ruled 2026-11-25): several grounds,
// some of them to hold, told to each side as his own or the enemy's; and
// the pitched battle's end at nightfall.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { report } = require('../turnNarrator')
const { resolveMap } = require('../../engine/map/map')
const { KINDS, BATTLE_OVER } = require('../words')

const map = resolveMap('crownhill')
const told = (side, events) => report({ map, side, ownIds: new Set([`${side}_spears`]), seenEnemyIds: new Set(), events })
const some = { needed: 2, of: 3, called: 'fords' }

test('with two of the three fords to hold, a ford taken is told with how many each side holds, and what that means', () => {
  const events = [
    { type: 'objective', turn: 3, objectiveId: 'ground-1', name: 'the North Ford', side: 'red', was: null, holding: { red: 1 }, ...some },
    { type: 'objective', turn: 5, objectiveId: 'ground-2', name: 'Miller\'s Crossing', side: 'red', was: null, holding: { red: 2 }, ...some }
  ]
  assert.deepEqual(told('red', events), [
    'you took the North Ford, and hold one of the three fords: hold two and the field is yours',
    'you took Miller\'s Crossing, and hold two of the three fords: hold them alone and the field is yours'
  ])
  assert.deepEqual(told('blue', events), [
    'the enemy took the North Ford, and holds one of the three fords',
    'the enemy took Miller\'s Crossing, and holds two of the three fords: take one from him, or the field is his'
  ])
})

test('half an hour before a side holding two of the fords takes the field, both sides are told once, with the fords he holds', () => {
  const close = { type: 'objective', turn: 9, objectiveId: 'field', name: 'the North Ford, Miller\'s Crossing', names: ['the North Ford', 'Miller\'s Crossing'], side: 'red', was: 'red', close: 30, ...some }
  assert.deepEqual(told('red', [close]), ['hold the North Ford and Miller\'s Crossing 30 min more and the field is yours'])
  assert.deepEqual(told('blue', [close]), ['the enemy has held the North Ford and Miller\'s Crossing long: unless you take one from him within 30 min, the field is his'])
})

test('a pitched battle won at nightfall is told as the field held, in each side\'s own words', () => {
  assert.equal(BATTLE_OVER.line('field held at nightfall', true), 'The battle is over: night fell with your army still standing and the enemy\'s beaten. The field is yours')
  assert.equal(BATTLE_OVER.line('field held at nightfall', false), 'The battle is over: night fell with the enemy\'s army still standing and yours beaten. The field is the enemy\'s')
  assert.match(KINDS.pitched.tent(0.5), /half the men it began the day with/)
})
