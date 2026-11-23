// src/web/tests/describe-attack.test.js
//
// The Army tab's line for a unit attacking a named enemy (review item L10).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { describeOrder } = require('../battles')

test('the Army tab says which enemy a unit is attacking, by the name its side knows it by', () => {
  const name = (id) => (id === 'blue_archers' ? 'enemy archers' : id)
  assert.equal(describeOrder({ action: 'attack', target: null, then: null, enemy: 'blue_archers' }, null, name), 'attacking enemy archers')
  assert.equal(describeOrder({ action: 'advance', target: null, then: null }), 'advancing on the enemy', 'an advance is unchanged')
})
