// src/interpreter/tests/orders.test.js
//
// From typed words to engine orders: the fixed grammar, place and unit
// resolution, and the AI reader with its fallbacks. No network: the AI is a
// scripted transport replying the way a model would.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { parseLine } = require('../grammar')
const { interpretLines, interpretText } = require('../orders')
const { briefing, REPLY_SCHEMA } = require('../aiReader')
const { createAiClient } = require('../../llm/client')
const { scriptedTransport } = require('../../llm/fixtures')
const { resolveMap } = require('../../engine/map/map')
const { createWorld } = require('../../engine/world')
const { toLabel } = require('../../engine/map/labels')
const { gridLabel } = require('../../engine/map/grid')

const map = resolveMap('crownhill')
const world = createWorld({
  units: [
    { id: 'red_spears', side: 'red', role: 'spearmen', position: 'E7' },
    { id: 'red_archers', side: 'red', role: 'archers', position: 'D8' },
    { id: 'red_horse', side: 'red', role: 'cavalry', mounted: true, position: 'E9' }
  ]
})
const context = {
  map,
  units: world.units,
  enemies: [{ id: 'blue_swords', position: { x: 13, y: 7 }, status: 'visible', seenOnTurn: 2 }]
}

const aiReplying = (json) => createAiClient({
  transport: scriptedTransport(() => ({ text: JSON.stringify(json), usage: { inputTokens: 300, outputTokens: 40 } })),
  retries: 0
})

// ── The grammar ────────────────────────────────────────

test('grammar: the ways a commander gives each kind of order', () => {
  const cases = {
    'spears to the ridge to the east': ['spears', 'move', 'the ridge to the east', null],
    'swords approach the woods': ['swords', 'move', 'the woods', null],
    'spears to the clearing and hold': ['spears', 'defend', 'the clearing', 'hold'],
    'stop at the clearing and set up a defensive position': ['everyone', 'defend', 'the clearing', 'hold'],
    'archers defend the ford': ['archers', 'defend', 'the ford', null],
    'the horse dig in at the clearing': ['the horse', 'defend', 'the clearing', null],
    'spears march to the woods north of the ford, then hold': ['spears', 'defend', 'the woods north of the ford', 'hold'],
    'the archers hold': ['the archers', 'hold', null, null],
    hold: ['everyone', 'hold', null, null],
    'everyone advance': ['everyone', 'advance', null, null],
    'the cavalry charge': ['the cavalry', 'advance', null, null],
    'swords withdraw': ['swords', 'withdraw', null, null],
    'fall back to C7': ['everyone', 'withdraw', 'C7', null]
  }
  for (const [line, [unitRef, action, place, then]] of Object.entries(cases)) {
    assert.deepEqual(parseLine(line), { kind: 'order', unitRef, action, place, then }, line)
  }
  assert.equal(parseLine('surrender').kind, 'surrender')
  assert.equal(parseLine('done').kind, 'done')
  assert.equal(parseLine('blah blah').kind, 'ask')
})

// ── Resolution ─────────────────────────────────────────

test('units are found by nickname, a word of their name, or "everyone"', () => {
  assert.deepEqual(interpretLines(['spears hold'], context).orders, [{ unitRef: 'red_spears', action: 'hold' }])
  assert.deepEqual(interpretLines(['horse hold'], context).orders, [{ unitRef: 'red_horse', action: 'hold' }])
  assert.equal(interpretLines(['everyone hold'], context).orders.length, 3)
  const unknown = interpretLines(['elephants hold'], context)
  assert.equal(unknown.orders.length, 0)
  assert.match(unknown.questions[0], /Who do you mean by "elephants"/)
})

test('places resolve from where the units stand, and the player gets a read-back', () => {
  const read = interpretLines(['spears to the ridge to the east'], context)
  assert.equal(read.questions.length, 0)
  assert.equal(toLabel(read.orders[0].target), 'T2', 'The Crownhill')
  assert.match(read.understood[0], /red_spears: move The Crownhill \d+ m east \(E1-NE\)/,
    'the read-back gives the grid quarter')

  const defend = interpretLines(['archers defend the woods'], context)
  assert.equal(defend.orders[0].action, 'defend')
  assert.equal(map.terrainAt(defend.orders[0].target), 'forest')
})

test("an unclear place becomes the place-finder's question", () => {
  // From D4, The Crownhill and Shepherd's Ridge are about equally near.
  const scout = createWorld({ units: [{ id: 'red_scouts', side: 'red', position: 'D4' }] })
  const read = interpretLines(['everyone to the ridge'], { map, units: scout.units })
  assert.equal(read.orders.length, 0)
  assert.match(read.questions[0], /Which ridge/)
})

test('a move with nowhere to go asks where', () => {
  assert.match(interpretLines(['spears to'], context).questions[0], /follow|Where/)
})

// ── The AI reader ──────────────────────────────────────

test('AI: free text is read into orders, then resolved exactly like the grammar', async () => {
  const ai = aiReplying({
    orders: [
      { units: 'the spears', action: 'defend', place: 'the ridge to the east', then: 'hold' },
      { units: 'archers', action: 'hold', place: null, then: null }
    ],
    question: null,
    surrender: false
  })
  const read = await interpretText('Spears, take the eastern heights and dig in. Archers stay where you are.', context, { ai })
  assert.equal(read.source, 'ai')
  assert.equal(read.questions.length, 0)
  assert.deepEqual(read.orders.map(o => [o.unitRef, o.action, o.target && toLabel(o.target)]),
    [['red_spears', 'defend', 'T2'], ['red_archers', 'hold', undefined]])
})

test('AI: a question from the model goes to the player, and nothing is submitted', async () => {
  const ai = aiReplying({ orders: [], question: 'Which unit should cross the river?', surrender: false })
  const read = await interpretText('cross the river', context, { ai })
  assert.equal(read.source, 'ai')
  assert.deepEqual(read.questions, ['Which unit should cross the river?'])
})

test('AI: a reply that breaks the schema falls back to the grammar', async () => {
  const ai = aiReplying({ orders: [{ units: 'spears', action: 'teleport', place: 'C2', then: null }], question: null, surrender: false })
  const read = await interpretText('spears to C2', context, { ai })
  assert.equal(read.source, 'grammar', 'unknown action rejected, grammar used instead')
  assert.equal(gridLabel(read.orders[0].target), 'C2')
})

test('AI: down, missing or slow, the grammar takes over', async () => {
  const down = createAiClient({ transport: scriptedTransport(() => { throw new Error('503') }), retries: 0 })
  assert.equal((await interpretText('spears hold', context, { ai: down })).source, 'grammar')
  assert.equal((await interpretText('spears hold', context, {})).source, 'grammar')
  const slow = createAiClient({
    transport: scriptedTransport(() => new Promise(r => setTimeout(() => r({ text: '{}' }), 300))),
    timeoutMs: 20, retries: 0
  })
  const read = await interpretText('spears hold', context, { ai: slow })
  assert.equal(read.source, 'grammar')
  assert.deepEqual(read.orders, [{ unitRef: 'red_spears', action: 'hold' }])
})

test('AI briefing: own units and the ground in words, seen enemies only, no coordinates', () => {
  const text = briefing(context, 'hold')
  assert.match(text, /red_spears \(spearmen\)/)
  assert.match(text, /the woods \d+ m (west|south|north|east)/)
  assert.match(text, /blue_swords, \d+ m east \(in sight\)/)
  assert.ok(!/\b[A-Z]{1,2}\d{1,2}\b/.test(text.replace(/Orders: .*/, '')), 'no map labels for the model to echo')
  assert.ok(!/blue_archers|blue_horse/.test(text), 'enemies the side has not seen are not mentioned')
})

test('the reply schema allows exactly the actions the engine knows', () => {
  const { ACTIONS } = require('../../engine/battle/orders')
  assert.deepEqual([...REPLY_SCHEMA.properties.orders.items.properties.action.enum].sort(), [...ACTIONS].sort())
})
