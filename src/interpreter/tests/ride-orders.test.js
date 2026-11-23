// src/interpreter/tests/ride-orders.test.js
//
// "I ride with the horse": the Commander goes over to another of his units
// (ruled 2026-11-23: "a commander needed to be adjacent to another unit to
// switch"). The grammar reads it, at no AI cost; the read-back says what
// will happen, or why it cannot, and how far.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { parseLine } = require('../grammar')
const { interpretText } = require('../orders')
const { resolveMap } = require('../../engine/map/map')
const { createWorld } = require('../../engine/world')
const { canRide } = require('../../engine/command/commander')

const map = resolveMap('crownhill')
const world = createWorld({
  units: [
    { id: 'red_spears', side: 'red', role: 'spearmen', position: { x: 10, y: 10 }, strength: 100, aliases: ['spears'] },
    { id: 'red_horse', side: 'red', role: 'cavalry', mounted: true, position: { x: 11, y: 11 }, strength: 100, aliases: ['horse'] },
    { id: 'red_companions', side: 'red', role: 'cavalry', mounted: true, position: { x: 16, y: 10 }, strength: 100, aliases: ['companions'] }
  ]
})
const context = (status = 'free', broken = new Set()) => {
  const commanders = { red: { unitId: 'red_spears', status, heldBy: status === 'held' ? 'blue_swords' : null } }
  return {
    map, units: world.units.filter(u => !broken.has(u.id)), enemies: [], allOwn: world.units,
    ride: (id) => canRide(commanders, world, broken, 'red', id), ridingWith: 'red_spears'
  }
}
// An AI that must never be asked.
const ai = { configured: true, complete: () => { throw new Error('the AI was asked') } }

test('grammar: "I ride with the horse", "commander to the companions", "ride with the spears" are the Commander riding over', () => {
  assert.deepEqual(parseLine('I ride with the horse'), { kind: 'ride', unitRef: 'horse' })
  assert.deepEqual(parseLine('commander to the companions'), { kind: 'ride', unitRef: 'companions' })
  assert.deepEqual(parseLine('The commander rides with the horse.'), { kind: 'ride', unitRef: 'horse' })
  assert.deepEqual(parseLine('ride with the spears'), { kind: 'ride', unitRef: 'spears' })
  assert.equal(parseLine('horse ride north').kind, 'order', 'a unit riding somewhere is an order to it')
})

test('riding with a unit beside his own is read back in the app\'s words, with no AI', async () => {
  const read = await interpretText('I ride with the horse\nspears hold', context(), { ai })
  assert.deepEqual(read.orders[0], { ride: 'red_horse' })
  assert.deepEqual(read.understood, ['You: ride with red_horse', 'red_spears: hold'])
  assert.equal(read.source, 'grammar')
})

test('too far, the read-back says so and how far; broken or held, it says why', async () => {
  const far = await interpretText('commander to the companions', context(), { ai })
  assert.deepEqual(far.orders, [])
  assert.match(far.questions[0], /red_companions are 6 tiles \(about 150 m\) from red_spears, whom you ride with: you can ride over only to a unit beside them/)
  const broken = await interpretText('I ride with the horse', context('free', new Set(['red_horse'])), { ai })
  assert.match(broken.questions[0], /red_horse are broken and running/)
  const held = await interpretText('I ride with the horse', context('held'), { ai })
  assert.match(held.questions[0], /You are held by the enemy/)
  const same = await interpretText('ride with the spears', context(), { ai })
  assert.match(same.questions[0], /You ride with red_spears already/)
})
