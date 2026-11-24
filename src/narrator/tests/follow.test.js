// src/narrator/tests/follow.test.js
//
// Telling the follow order: its words in the read-back and on the Army tab,
// and the line a report carries when a unit can keep by the other no longer.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { orderWords } = require('../words')
const { fact, visibleEvents } = require('../turnNarrator')
const { resolveMap } = require('../../engine/map/map')
const { describeOrder } = require('../../web/battles')
const { wordEvent } = require('../../adapters/hotseat/render')

const map = resolveMap('crownhill')

test('a follow order is worded "keep beside" or "keep behind" the unit kept by', () => {
  assert.equal(orderWords('say', { action: 'follow', keep: 'beside' }, 'the legionaries'), 'keep beside the legionaries')
  assert.equal(orderWords('doing', { action: 'follow', keep: 'behind' }, 'Legionaries'), 'keeping behind Legionaries')
})

test('the Army tab says whom a unit keeps by, by its name', () => {
  const name = (id) => (id === 'red_legionaries' ? 'Legionaries' : id)
  assert.equal(describeOrder({ action: 'follow', target: null, then: null, friend: 'red_legionaries', keep: 'beside', guard: true }, null, name), 'keeping beside Legionaries')
})

test('when the unit kept by breaks, is gone or is lost from sight, its own side is told the follower holds where it is', () => {
  const lost = (why) => fact(map, { type: 'followLost', turn: 4, unitId: 'red_velites', on: 'red_legionaries', why })
  assert.equal(lost('broken'), 'red_legionaries broke, and red_velites, who were keeping by them, hold where they are')
  assert.equal(lost('gone'), 'red_legionaries are gone from the field, and red_velites, who were keeping by them, hold where they are')
  assert.equal(lost('out of sight'), 'red_velites lost sight of red_legionaries, whom they were keeping by, and hold where they are')
  const event = { type: 'followLost', turn: 4, unitId: 'red_velites', on: 'red_legionaries', why: 'broken' }
  assert.equal(visibleEvents([event], { ownIds: new Set(['red_velites', 'red_legionaries']), seenEnemyIds: new Set() }).length, 1)
  assert.equal(visibleEvents([event], { ownIds: new Set(['blue_x']), seenEnemyIds: new Set(['red_velites', 'red_legionaries']) }).length, 0, 'the other side hears nothing of it')
})

test('the hotseat tells it too', () => {
  assert.match(wordEvent({ type: 'followLost', turn: 4, unitId: 'red_velites', on: 'red_legionaries', why: 'out of sight' }), /red_velites: can keep by red_legionaries no longer \(out of sight\); it holds where it is/)
})
