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
  assert.deepEqual(read('spears spring the trap'), { kind: 'order', unitRef: 'spears', action: 'advance', place: null, spring: true })
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
  assert.match(read.understood[0], /march carefully to/)
})

test('the AI fits the player\'s words to the engine\'s ambush terms', async () => {
  const ai = createAiClient({
    transport: scriptedTransport(() => ({
      text: JSON.stringify({
        orders: [{ units: ['red_spears'], action: 'ambush', place: 'the woods', then_hold: false, careful: false, against: 'cavalry', let_pass: 1, regardless: false }],
        question: null, note: null, surrender: false
      }),
      usage: { inputTokens: 300, outputTokens: 40 }
    })),
    retries: 0
  })
  const read = await interpretText('have the spears lurk among the trees and jump the first horsemen after one has gone by', { ...context }, { ai })
  assert.equal(read.source, 'ai')
  assert.equal(read.orders[0].action, 'ambush')
  assert.equal(read.orders[0].against, 'cavalry')
  assert.equal(read.orders[0].letPass, 1)
})

test('an AI reply that invents a kind of target is refused, and the grammar takes over', async () => {
  const ai = createAiClient({
    transport: scriptedTransport(() => ({
      text: JSON.stringify({
        orders: [{ units: ['red_spears'], action: 'ambush', place: 'the woods', then_hold: false, careful: false, against: 'elephants', let_pass: 0, regardless: false }],
        question: null, note: null, surrender: false
      }),
      usage: { inputTokens: 300, outputTokens: 40 }
    })),
    retries: 0
  })
  const read = await interpretText('have the spears lurk in the woods for their elephants', context, { ai })
  assert.equal(read.source, 'grammar')
  assert.equal(read.orders.length, 0, 'nothing is ordered on the strength of a reply that broke the rules')
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

// ── Review, November 2026 ──────────────────────────────

test('"spring the trap" is for the units lying in wait, not the whole army', () => {
  const waiting = { ...context, lyingInWait: ['red_spears'] }
  const read = interpretLines(['spring the trap'], waiting)
  assert.deepEqual(read.orders, [{ unitRef: 'red_spears', action: 'advance' }], 'the horse in reserve stays where it is')

  const named = interpretLines(['horse spring the trap'], waiting)
  assert.deepEqual(named.orders.map(o => o.unitRef), ['red_horse'], 'a unit named is the unit meant')

  const noTrap = interpretLines(['spring the trap'], { ...context, lyingInWait: [] })
  assert.equal(noTrap.orders.length, 0)
  assert.match(noTrap.questions[0], /no trap to spring/)
})

test('seek and destroy, attack on sight: a unit hunts only when told to', async () => {
  for (const words of ['horse seek and destroy', 'horse attack on sight', 'horse hunt them down', 'horse engage at will']) {
    const read = interpretLines([words], context)
    assert.deepEqual(read.orders, [{ unitRef: 'red_horse', action: 'advance' }], words)
  }
  // Read whole by the grammar: no AI call for it, though it holds an "and".
  const transport = scriptedTransport(() => { throw new Error('the AI was called') })
  const ai = createAiClient({ transport, retries: 0 })
  const read = await interpretText('everyone seek and destroy', context, { ai })
  assert.equal(read.source, 'grammar')
  assert.equal(transport.calls.length, 0)
  assert.equal(read.orders.length, 3)
})

// ── Missile troops (ruled 2026-11-21) ──────────────────

test('shoot, shoot the horse first, hold fire: orders for missile troops', async () => {
  const bowmen = { ...context, units: context.units.map(u => u.id === 'red_archers' ? { ...u, primaryWeapon: 'greek_composite_bow' } : u) }
  const read = (line) => interpretLines([line], bowmen)

  assert.deepEqual(read('archers shoot').orders, [{ unitRef: 'red_archers', action: 'hold' }])
  assert.match(read('archers shoot').understood[0], /shoot at any enemy they can see within 200 m$/)
  assert.deepEqual(read('archers loose at their cavalry').orders, [{ unitRef: 'red_archers', action: 'hold', against: 'cavalry' }])
  assert.match(read('archers shoot the horse').understood[0], /cavalry first$/)
  assert.deepEqual(read('archers hold fire').orders, [{ unitRef: 'red_archers', action: 'hold', holdFire: true }])
  // With no one named, the order is for those who can shoot.
  assert.deepEqual(read('everyone hold fire').orders.map(o => o.unitRef), ['red_archers'])
  // A unit with nothing to shoot with is a question, not an order dropped.
  assert.match(read('spears shoot the horse').questions[0], /red_spears cannot shoot/)
  assert.match(interpretLines(['everyone shoot'], context).questions[0], /None of your units has bows or slings/)

  // All read by the grammar: no AI call.
  const transport = scriptedTransport(() => { throw new Error('the AI was called') })
  const ai = createAiClient({ transport, retries: 0 })
  assert.equal((await interpretText('archers shoot the horse', bowmen, { ai })).source, 'grammar')
  assert.equal((await interpretText('archers hide in the woods and jump any bowmen that pass', bowmen, { ai })).source, 'grammar')
  assert.equal(transport.calls.length, 0)
})

test('the AI\'s own "shoot" and "hold_fire" become a hold for missile troops', async () => {
  const bowmen = { ...context, units: context.units.map(u => u.id === 'red_archers' ? { ...u, primaryWeapon: 'greek_composite_bow' } : u) }
  const reply = (action, against = null) => ({
    orders: [{ units: ['red_archers'], action, place: null, then_hold: false, careful: false, against, let_pass: 0, regardless: false }],
    question: null, note: null, surrender: false
  })
  const replies = [reply('shoot', 'cavalry'), reply('hold_fire')]
  const ai = createAiClient({
    transport: scriptedTransport((request, n) => ({ text: JSON.stringify(replies[n - 1]), usage: { inputTokens: 300, outputTokens: 40 } })),
    retries: 0
  })
  const shoot = await interpretText('have the archers loose at their horse, please', bowmen, { ai })
  assert.deepEqual(shoot.orders, [{ unitRef: 'red_archers', action: 'hold', against: 'cavalry' }])
  const cease = await interpretText('tell the archers they should stop loosing', bowmen, { ai })
  assert.deepEqual(cease.orders, [{ unitRef: 'red_archers', action: 'hold', holdFire: true }])
})

test('fall back a distance in a compass direction is read by the grammar, and stops there', () => {
  assert.deepEqual(parseLine('archers fall back 100 metres to the west'),
    { kind: 'order', unitRef: 'archers', action: 'withdraw', place: '100 m west', then: null })
  assert.equal(parseLine('archers pull back south').place, '200 m south', 'no distance given: 200 m')
  assert.equal(parseLine('archers fall back to the ridge to the east').place, 'the ridge to the east',
    'a place that ends in a direction is still a place')

  const horse = world.units.find(u => u.id === 'red_horse')
  const read = interpretLines(['horse fall back 100 metres to the west'], context)
  assert.equal(read.questions.length, 0)
  assert.equal(read.source, 'grammar')
  assert.equal(read.orders[0].action, 'withdraw')
  assert.deepEqual(read.orders[0].target, { x: horse.position.x - 4, y: horse.position.y }, '100 m is four tiles')
})
