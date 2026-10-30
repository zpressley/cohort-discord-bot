// src/interpreter/tests/stage3-orders.test.js
//
// The Stage 3 orders in words: hide, check, ambush, attack a place, and
// marching carefully. The grammar reads them without any AI; the AI reader
// fills the same fields, fitting the player's words to what the engine
// knows (the shape-sorter rule); the read-back says what the engine will
// do, in the engine's own terms.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { parseLine } = require('../grammar')
const { interpretLines, interpretText } = require('../orders')
const { createAiClient } = require('../../llm/client')
const { scriptedTransport } = require('../../llm/fixtures')
const { resolveMap } = require('../../engine/map/map')
const { createWorld } = require('../../engine/world')

const map = resolveMap('crownhill')
const world = createWorld({
  units: [
    { id: 'red_spears', side: 'red', role: 'spearmen', position: 'E7', strength: 100 },
    { id: 'red_archers', side: 'red', role: 'archers', position: 'D8', strength: 100 },
    { id: 'red_horse', side: 'red', role: 'cavalry', mounted: true, position: 'E9', strength: 100 }
  ]
})
const context = { map, units: world.units, enemies: [] }

test('grammar: hide, check, ambush, attack a place, carefully', () => {
  const read = (line) => {
    const { kind, unitRef, action, place, ...rest } = parseLine(line)
    delete rest.then
    return { kind, unitRef, action, place, ...rest }
  }
  assert.deepEqual(read('archers hide in the woods'), { kind: 'order', unitRef: 'archers', action: 'hide', place: 'the woods' })
  assert.deepEqual(read('spears take cover'), { kind: 'order', unitRef: 'spears', action: 'hide', place: null })
  assert.deepEqual(read('horse check the woods'), { kind: 'order', unitRef: 'horse', action: 'check', place: 'the woods' })
  assert.deepEqual(read('search C2'), { kind: 'order', unitRef: 'everyone', action: 'check', place: 'C2' })
  assert.deepEqual(read('spears attack the ford'), { kind: 'order', unitRef: 'spears', action: 'attack', place: 'the ford' })
  assert.equal(read('spears attack the enemy').action, 'advance', 'the enemy is not a place')
  assert.deepEqual(read('spears spring the trap'), { kind: 'order', unitRef: 'spears', action: 'advance', place: null })
  assert.equal(read('spring the ambush').action, 'advance')
  assert.deepEqual(read('swords march carefully to the clearing'),
    { kind: 'order', unitRef: 'swords', action: 'move', place: 'the clearing', careful: true })
  assert.deepEqual(read('everyone advance on guard'),
    { kind: 'order', unitRef: 'everyone', action: 'advance', place: null, careful: true })
})

test('grammar: the ways to lay an ambush', () => {
  const read = (line) => {
    const r = parseLine(line)
    return [r.action, r.unitRef, r.place, r.against ?? null, r.letPass ?? 0, Boolean(r.regardless)]
  }
  assert.deepEqual(read('spears ambush in the woods'), ['ambush', 'spears', 'the woods', null, 0, false])
  assert.deepEqual(read('spears hide in the woods and hit anything that passes'), ['ambush', 'spears', 'the woods', null, 0, false])
  assert.deepEqual(read('spears lie in wait in the woods, let two pass'), ['ambush', 'spears', 'the woods', null, 2, false])
  assert.deepEqual(read('spears ambush the cavalry from the woods whatever happens'), ['ambush', 'spears', 'the woods', 'cavalry', 0, true])
  assert.deepEqual(read('archers hide in the woods and hit their bowmen'), ['ambush', 'archers', 'the woods', 'archers', 0, false])
  assert.deepEqual(read('spears lie in wait and let the first one pass'), ['ambush', 'spears', null, null, 1, false])
})

test('the read-back says how well a unit will hide there, in the engine\'s terms', () => {
  // E7 is open field, with the western woods 75 m away.
  const hide = interpretLines(['spears hide in the woods'], context)
  assert.equal(hide.questions.length, 0)
  assert.deepEqual(hide.orders.map(o => o.action), ['hide'])
  assert.match(hide.understood[0], /hidden from anyone who does not search/)

  const horse = interpretLines(['horse hide in the woods'], context)
  assert.match(horse.understood[0], /too many horses to hide well: seen only within 50 m/)

  // D8 has the woods at D9 beside it: the field's edge.
  const edge = interpretLines(['archers hide'], context)
  assert.match(edge.understood[0], /edge of the trees or high ground: seen only within 50 m/)
})

test('an ambush order carries its terms to the engine, and the read-back repeats them', () => {
  const read = interpretLines(['spears ambush the cavalry from the woods, let two pass'], context)
  assert.equal(read.questions.length, 0)
  const [order] = read.orders
  assert.equal(order.action, 'ambush')
  assert.equal(order.against, 'cavalry')
  assert.equal(order.letPass, 2)
  assert.ok(order.target)
  assert.match(read.understood[0], /striking cavalry, letting 2 pass first, only if they come marching/)
})

test('a careful march reaches the engine as careful', () => {
  const read = interpretLines(['spears march carefully to C2'], context)
  assert.equal(read.orders[0].careful, true)
  assert.match(read.understood[0], /move carefully/)
})

test('the AI fits the player\'s words to the engine\'s ambush terms', async () => {
  const ai = createAiClient({
    transport: scriptedTransport(() => ({
      text: JSON.stringify({
        orders: [{ units: 'the spears', action: 'ambush', place: 'the reeds by the woods', then: null, against: 'cavalry', letPass: 1, regardless: false }],
        question: null, surrender: false
      }),
      usage: { inputTokens: 300, outputTokens: 40 }
    })),
    retries: 0
  })
  const read = await interpretText('have the spears lurk among the trees and jump the first horsemen after one has gone by', { ...context }, { ai })
  // "the reeds by the woods" is still ground words; the resolver finds the woods.
  assert.equal(read.source, 'ai')
  assert.equal(read.orders[0].action, 'ambush')
  assert.equal(read.orders[0].against, 'cavalry')
  assert.equal(read.orders[0].letPass, 1)
})

test('an AI reply that invents a kind of target is refused, and the grammar takes over', async () => {
  const ai = createAiClient({
    transport: scriptedTransport(() => ({
      text: JSON.stringify({
        orders: [{ units: 'spears', action: 'ambush', place: 'the woods', then: null, against: 'elephants' }],
        question: null, surrender: false
      }),
      usage: { inputTokens: 300, outputTokens: 40 }
    })),
    retries: 0
  })
  const read = await interpretText('spears ambush in the woods', context, { ai })
  assert.equal(read.source, 'grammar')
  assert.equal(read.orders[0].action, 'ambush')
  assert.equal(read.orders[0].against, undefined)
})

test('a question about a place comes with choices: what to write instead', () => {
  const read = interpretLines(['spears to the ridge'], { ...context, units: [{ ...context.units[0], position: { x: 3, y: 3 } }] })
  assert.equal(read.orders.length, 0)
  assert.equal(read.choices.length, 1)
  const [choice] = read.choices
  assert.equal(choice.place, 'the ridge')
  assert.deepEqual(choice.options.map(o => o.text).sort(), ['Shepherd\'s Ridge', 'The Crownhill'])
  // Writing a choice in makes the order clear.
  const again = interpretLines([`spears to ${choice.options[0].text}`], { ...context, units: [{ ...context.units[0], position: { x: 3, y: 3 } }] })
  assert.equal(again.questions.length, 0)
  assert.equal(again.orders.length, 1)
})
