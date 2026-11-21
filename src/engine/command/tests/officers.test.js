// src/engine/command/tests/officers.test.js
//
// Officers: experience buys depth, a seeded roll decides what is kept of an
// order, and personality decides what a lost thread turns into.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { gradeOf, clauses, grasp, losingTheThread, chanceToKeep } = require('../officers')
const { normalizeOrder } = require('../../battle/orders')
const { createRng } = require('../../rng')

const officer = (experience, personality = 'steady') => ({ name: 'Marcus', experience, personality })
const deep = () => normalizeOrder({
  action: 'move', target: 'C4',
  when: { type: 'sees', kind: 'cavalry', do: { action: 'hold' } },
  steps: [{ action: 'move', target: 'H15' }, { action: 'defend', target: 'K20' }]
})

test('grade comes from battles come through, and nothing else', () => {
  assert.deepEqual([0, 1, 2, 4, 5, 12].map(n => gradeOf(officer(n))), ['green', 'green', 'seasoned', 'seasoned', 'veteran', 'veteran'])
  assert.equal(gradeOf(null), 'green')
})

test('a plain order is carried whole by anyone, with no roll', () => {
  const plain = normalizeOrder({ action: 'move', target: 'C4', then: 'hold' })
  let rolls = 0
  const kept = grasp(plain, officer(0), () => { rolls++; return 0.99 })
  assert.deepEqual(kept, { order: plain, clauses: 0, kept: 0 })
  assert.equal(rolls, 0)
})

test('the deeper the order, the less a green officer keeps; a veteran holds the chain', () => {
  assert.equal(clauses(deep()), 3)
  const keptOver = (experience) => {
    const random = createRng(7)
    let kept = 0
    for (let i = 0; i < 400; i++) kept += grasp(deep(), officer(experience), random).kept
    return kept / 400
  }
  const green = keptOver(0), seasoned = keptOver(3), veteran = keptOver(8)
  assert.ok(green < 0.7, `a green officer keeps ${green.toFixed(2)} of 3 clauses`)
  assert.ok(seasoned > green + 0.8 && seasoned < veteran)
  assert.ok(veteran > 2.6, `a veteran keeps ${veteran.toFixed(2)} of 3`)
  assert.ok(chanceToKeep(officer(0), 1) > chanceToKeep(officer(0), 2), 'each clause more is harder to hold')
})

test('a lost condition stays on the order, marked; a lost step takes the later steps with it', () => {
  // Rolls: condition lost, first step kept, second step lost.
  const rolls = [0.99, 0.0, 0.99]
  const { order, kept } = grasp(deep(), officer(3), () => rolls.shift())
  assert.equal(kept, 1)
  assert.equal(order.when.lost, true)
  assert.equal(order.steps.length, 1)
  assert.equal(order.lostAfter, true)

  const first = grasp(deep(), officer(3), () => 0.99).order
  assert.equal(first.steps, undefined, 'the first step lost: nothing after the plain order')
  assert.equal(first.lostAfter, true)
  assert.equal(grasp(deep(), null, () => 0.99).kept, 3, 'a unit with no officer carries any order whole')
})

test('the same seed keeps the same clauses: the roll is the engine\'s, and repeatable', () => {
  const once = grasp(deep(), officer(3), createRng(42))
  const twice = grasp(deep(), officer(3), createRng(42))
  assert.deepEqual(once, twice)
})

test('losing the thread: the bold attack, the cautious dig in, the steady carry on', () => {
  assert.equal(losingTheThread(officer(0, 'bold'), 'condition', true), 'advance')
  assert.equal(losingTheThread(officer(0, 'bold'), 'steps', false), 'hold', 'no one in sight to go at')
  assert.equal(losingTheThread(officer(0, 'cautious'), 'condition', true), 'hold')
  assert.equal(losingTheThread(officer(0, 'steady'), 'condition', true), 'carry on')
  assert.equal(losingTheThread(officer(0, 'steady'), 'steps', true), 'hold', 'nothing left of the order to carry on with')
})
