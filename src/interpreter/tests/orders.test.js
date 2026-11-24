// src/interpreter/tests/orders.test.js
//
// From typed words to engine orders: the fixed grammar, place and unit
// resolution, and the AI reader with its fallbacks. No network: the AI is a
// scripted transport replying the way a model would.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { parseLine } = require('../grammar')
const { interpretLines, interpretText } = require('../orders')
const { briefing, REPLY_SCHEMA, SYSTEM } = require('../aiReader')
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
  assert.match(read.understood[0], /red_spears: march to The Crownhill \d+ m east \(E1-NE\)/,
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
      { units: ['red_spears'], action: 'defend', place: 'the ridge to the east', then_hold: true, careful: false, against: null, let_pass: 0, regardless: false },
      { units: ['red_archers'], action: 'hold', place: null, then_hold: false, careful: false, against: null, let_pass: 0, regardless: false }
    ],
    question: null, note: null,
    surrender: false
  })
  const read = await interpretText('Spears, get up onto the eastern heights and dig in. Archers stay where you are.', context, { ai })
  assert.equal(read.source, 'ai')
  assert.equal(read.questions.length, 0)
  assert.deepEqual(read.orders.map(o => [o.unitRef, o.action, o.target && toLabel(o.target)]),
    [['red_spears', 'defend', 'T2'], ['red_archers', 'hold', undefined]])
})

test('AI: a question from the model goes to the player, and nothing is submitted', async () => {
  const ai = aiReplying({ orders: [], question: 'Which unit should cross the river?', note: null, surrender: false })
  const read = await interpretText('cross the river', context, { ai })
  assert.equal(read.source, 'ai')
  assert.deepEqual(read.questions, ['Which unit should cross the river?'])
})

test('AI: a reply that breaks the schema falls back to the grammar', async () => {
  const ai = aiReplying({ orders: [{ units: ['red_spears'], action: 'teleport', place: 'C2', then_hold: false, careful: false, against: null, let_pass: 0, regardless: false }], question: null, note: null, surrender: false })
  const read = await interpretText('kindly get the spears over to C2', context, { ai })
  assert.equal(read.source, 'grammar', 'unknown action rejected, the grammar\'s own answer stands')
  assert.equal(read.orders.length, 0)
  assert.equal(read.questions.length, 1)
})

test('AI: a unit that is not on the field is a question, never a guess', async () => {
  const ai = aiReplying({ orders: [{ units: ['red_elephants'], action: 'advance', place: null, then_hold: false, careful: false, against: null, let_pass: 0, regardless: false }], question: null, note: null, surrender: false })
  const read = await interpretText('send in the big grey ones, please', context, { ai })
  assert.equal(read.orders.length, 0)
  assert.match(read.questions[0], /red_elephants/)
})

test('AI: a name for an id is accepted when it means one unit, and a second order to a unit is the next step of a chain', async () => {
  const step = (place) => ({ units: ['spears'], action: 'move', place, then_hold: false, careful: false, against: null, let_pass: 0, regardless: false })
  const ai = aiReplying({ orders: [step('C2'), step('Harrow Bridge')], question: null, note: null, surrender: false })
  const read = await interpretText('get the spears over to C2 and after that on to the bridge', context, { ai })
  assert.equal(read.questions.length, 0)
  assert.equal(read.orders.length, 1, 'one order a unit, with what comes after inside it')
  assert.equal(read.orders[0].unitRef, 'red_spears')
  assert.equal(gridLabel(read.orders[0].target), 'C2')
  assert.equal(read.orders[0].steps.length, 1)
  assert.equal(map.terrainAt(read.orders[0].steps[0].target), 'bridge')
  assert.match(read.understood[0], /^red_spears: march to C2 \(C2-NW\); then march to Harrow Bridge/)
})

test('plain orders never reach the AI; only what the grammar cannot read does', async () => {
  const transport = scriptedTransport(() => ({
    text: JSON.stringify({ orders: [{ units: ['red_horse'], action: 'hold', place: null, then_hold: false, careful: false, against: null, let_pass: 0, regardless: false }], question: null, note: null, surrender: false }),
    usage: { inputTokens: 900, outputTokens: 40 }
  }))
  const ai = createAiClient({ transport, retries: 0 })

  const plain = await interpretText('spears to C2\narchers hold\neveryone advance carefully', context, { ai })
  assert.equal(plain.source, 'grammar')
  assert.equal(transport.calls.length, 0, 'three plain orders, no AI call')

  const mixed = await interpretText('spears to C2\nthe horse will wait behind in reserve', context, { ai })
  assert.equal(mixed.source, 'grammar+ai')
  assert.equal(transport.calls.length, 1)
  assert.match(transport.calls[0].user, /wait behind in reserve/)
  assert.doesNotMatch(transport.calls[0].user, /spears to C2/, 'only the hard line is sent')
  assert.deepEqual(mixed.orders.map(o => [o.unitRef, o.action]), [['red_spears', 'move'], ['red_horse', 'hold']])
})

test('a line that says two things goes to the AI even though the grammar could read half of it', async () => {
  const transport = scriptedTransport(() => ({
    text: JSON.stringify({ orders: [
      { units: ['red_spears'], action: 'move', place: 'Harrow Bridge', then_hold: false, careful: false, against: null, let_pass: 0, regardless: false },
      { units: ['red_archers'], action: 'hide', place: 'the woods', then_hold: false, careful: false, against: null, let_pass: 0, regardless: false }
    ], question: null, note: null, surrender: false }),
    usage: { inputTokens: 900, outputTokens: 60 }
  }))
  const ai = createAiClient({ transport, retries: 0 })
  const read = await interpretText('spears to the bridge and archers hide in the woods', context, { ai })
  assert.equal(transport.calls.length, 1)
  assert.deepEqual(read.orders.map(o => [o.unitRef, o.action]), [['red_spears', 'move'], ['red_archers', 'hide']])
})

test('two units named with "and" are both ordered, even when one name is also a kind of unit', async () => {
  const read = await interpretText('spears and archers hold', context, {})
  assert.deepEqual(read.orders.map(o => [o.unitRef, o.action]), [['red_spears', 'hold'], ['red_archers', 'hold']])
  assert.deepEqual(read.questions, [])
  // A kind alone still answers for every unit of that kind.
  assert.deepEqual((await interpretText('archers hold', context, {})).orders.map(o => o.unitRef), ['red_archers'])
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
  // A line only the AI could read, with the AI down: the grammar's question.
  const lost = await interpretText('the horse will wait behind in reserve', context, { ai: down })
  assert.equal(lost.source, 'grammar')
  assert.equal(lost.questions.length, 1)
})

test('AI briefing: own units by id, named places, seen enemies only, all by grid square', () => {
  const text = briefing(context, 'hold')
  assert.match(text, /- red_spears \(called: spearmen\), at B2-SW/)
  assert.match(text, /- red_horse \(called: cavalry\), mounted, at B3-NW/)
  assert.match(text, /- Harrow Bridge \(bridge, B4-SE\)/)
  assert.match(text, /- blue_swords at D2-SW, \d+ m east \(in sight\)/)
  assert.ok(!/blue_archers|blue_horse/.test(text), 'enemies the side has not seen are not mentioned')
  assert.match(text, /The commander says:\nhold$/)
})

test('the standing instructions say nothing about this battle, so they can be cached', () => {
  assert.doesNotMatch(SYSTEM, /red_|blue_|Crownhill|Harrow/)
})

test('the reply schema allows exactly the actions the engine knows', () => {
  const { ACTIONS } = require('../../engine/battle/orders')
  // The engine's actions, plus the two the reader turns into a hold for
  // missile troops (shooting, or holding fire).
  assert.deepEqual([...REPLY_SCHEMA.properties.orders.items.properties.action.enum].sort(), [...ACTIONS, 'shoot', 'hold_fire'].sort())
})

test('grammar: an order can name the ground to fight for: take it, occupy it, or hold it (to seize or storm it is to attack it)', () => {
  const cases = {
    'spears take the Old Mill Bridge': ['spears', 'defend', 'the Old Mill Bridge'],
    'hold the bridge': ['everyone', 'defend', 'the bridge'],
    'swords take Raven Gap': ['swords', 'defend', 'Raven Gap'],
    'everyone occupy the Crownhill': ['everyone', 'defend', 'the Crownhill'],
    'horse hold the ford': ['horse', 'defend', 'the ford']
  }
  for (const [line, [unitRef, action, place]] of Object.entries(cases)) {
    assert.deepEqual(parseLine(line), { kind: 'order', unitRef, action, place, then: null }, line)
  }
  // Holding still is still holding still.
  for (const line of ['hold', 'archers hold', 'spears hold the line', 'hold fast']) assert.equal(parseLine(line).action, 'hold', line)
})

test('a map\'s ground is found by its name: the Old Mill Bridge, Raven Gap (on the road, not the nearest stretch of it), Thorn Knoll and the knoll', () => {
  const spears = (at) => createWorld({ units: [{ id: 'red_spears', side: 'red', role: 'spearmen', position: at }] }).units
  const target = (name, line, at = { x: 8, y: 22 }) => interpretLines([line], { map: resolveMap(name), units: spears(at), enemies: [] }).orders[0]?.target
  assert.deepEqual(target('ashford', 'spears take the Old Mill Bridge'), { x: 20, y: 20 })
  assert.deepEqual(target('ravenridge', 'spears take Raven Gap'), { x: 20, y: 20 })
  assert.ok(target('thornwood', 'spears hold the knoll'))
  assert.deepEqual(target('thornwood', 'spears take Thorn Knoll'), target('thornwood', 'spears hold the knoll'))
  assert.deepEqual(target('crownhill', 'spears take the Crownhill'), { x: 19, y: 1 })
})
