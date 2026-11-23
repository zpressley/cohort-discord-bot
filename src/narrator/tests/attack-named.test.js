// src/narrator/tests/attack-named.test.js
//
// Telling an attack on a named enemy (review item L10): its read-back words,
// and the line a dispatch carries when the enemy it went for is gone.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { orderWords } = require('../words')
const { fact, visibleEvents } = require('../turnNarrator')
const { resolveMap } = require('../../engine/map/map')

const map = resolveMap('crownhill')

test('an attack on an enemy unit is worded like any attack: "attack the enemy archers"', () => {
  assert.equal(orderWords('say', { action: 'attack' }, 'the enemy archers'), 'attack the enemy archers')
  assert.equal(orderWords('doing', { action: 'attack', careful: true }, 'enemy archers'), 'attacking enemy archers, carefully')
})

test('when the enemy a unit went for is beaten or gone, its own side is told it advanced on the enemy instead', () => {
  const event = { type: 'quarryGone', turn: 4, unitId: 'red_horse', on: 'blue_archers' }
  assert.equal(fact(map, event), 'blue_archers, whom red_horse were sent to attack, are beaten or gone; red_horse advanced on the enemy instead')
  const ownIds = new Set(['red_horse'])
  assert.equal(visibleEvents([event], { ownIds, seenEnemyIds: new Set() }).length, 1)
  assert.equal(visibleEvents([event], { ownIds: new Set(['blue_archers']), seenEnemyIds: new Set(['red_horse']) }).length, 0, 'the other side hears nothing of it')
})
