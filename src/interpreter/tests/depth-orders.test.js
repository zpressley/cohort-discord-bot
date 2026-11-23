// src/interpreter/tests/depth-orders.test.js
//
// Orders with depth, in words: chains ("then"), one condition ("if"), and
// the counsel an experienced officer gives before the Commander commits.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { parseLine } = require('../grammar')
const { interpretLines, interpretText } = require('../orders')
const { createAiClient } = require('../../llm/client')
const { scriptedTransport } = require('../../llm/fixtures')
const { resolveMap } = require('../../engine/map/map')
const { createWorld } = require('../../engine/world')
const { normalizeOrder } = require('../../engine/battle/orders')
const { gridLabel } = require('../../engine/map/grid')

const map = resolveMap('crownhill')
const officer = (name, experience, personality) => ({ name, experience, personality })
const world = createWorld({
  units: [
    { id: 'red_spears', side: 'red', role: 'spearmen', position: 'E7', strength: 100, officer: officer('Marcus', 0, 'bold') },
    { id: 'red_swords', side: 'red', role: 'swordsmen', position: 'E8', strength: 100, officer: officer('Quintus', 8, 'steady') },
    { id: 'red_horse', side: 'red', role: 'cavalry', mounted: true, position: 'E9', strength: 100, officer: officer('Titus', 3, 'cautious') }
  ]
})
const context = { map, units: world.units, enemies: [] }
const read = (line, ctx = context) => interpretLines([line], ctx)

test('grammar: a chain is one order with its steps; "then dig in" ends the step before it', () => {
  const chain = parseLine('swords to C4, then on to the bridge, then dig in')
  assert.equal(chain.action, 'move')
  assert.equal(chain.place, 'C4')
  assert.deepEqual(chain.steps.map(s => [s.action, s.place, s.then]), [['move', 'the bridge', 'hold']])
  assert.equal(parseLine('swords to C4 and hold').steps, undefined, 'a plain defend is not a chain')
  assert.equal(parseLine('spears to the ford then archers hold').deep, undefined, 'two units is not one chain: left for the AI')
})

test('grammar: one condition, and what to do instead', () => {
  const when = (line) => parseLine(line).when
  assert.deepEqual(when('spears to the ford, if their horse is there, hold'),
    { type: 'sees', kind: 'cavalry', near: 'target', do: { kind: 'order', unitRef: 'spears', action: 'hold', place: null, then: null } })
  assert.equal(when('spears advance, if you see their cavalry, fall back').near, null)
  assert.equal(when('spears to the ford, if it is held, hold').kind, null)
  assert.equal(when('archers hold, if you are attacked, fall back to the hill').type, 'attacked')
  assert.deepEqual([when('horse hold, if the spears break fall back').type, when('horse hold, if the spears break fall back').unitRef], ['breaks', 'spears'])
  assert.equal(when('horse hold, if their archers break, charge'), undefined, 'the enemy breaking is not a condition an order can wait on')
})

test('a chain reaches the engine whole, each step placed from where the one before ends', () => {
  const result = read('swords to C4, then on to the bridge, then dig in')
  assert.equal(result.questions.length, 0)
  const [order] = result.orders
  assert.equal(gridLabel(order.target), 'C4')
  assert.equal(map.terrainAt(order.steps[0].target), 'bridge')
  assert.equal(order.steps[0].then, 'hold')
  assert.match(result.understood[0], /^red_swords: march to C4 \(C4-NW\); then march to Harrow Bridge 75 m south-west \(B4-SE\) and hold it$/)
  assert.doesNotThrow(() => normalizeOrder(order), 'and the engine takes it as given')
})

test('a condition reaches the engine with its place and its unit resolved', () => {
  const ford = read('spears to North Ford, if their horse is there, hold')
  const when = ford.orders[0].when
  assert.deepEqual([when.type, when.kind, when.do.action], ['sees', 'cavalry', 'hold'])
  assert.deepEqual(when.near, ford.orders[0].target, '"there" is where the order goes')
  assert.match(ford.understood[0], /; if they see enemy cavalry at [A-J]\d+(?:-[NS][EW])?, hold$/)

  const breaks = read('horse hold, if the spears break fall back')
  assert.deepEqual([breaks.orders[0].when.type, breaks.orders[0].when.unitId, breaks.orders[0].when.do.action], ['breaks', 'red_spears', 'withdraw'])
  assert.match(read('horse hold, if the elephants break fall back').questions[0], /Which of your other units/)
  assert.doesNotThrow(() => normalizeOrder(ford.orders[0]))
})

test('a line broken at "if" or "then" is still one order', async () => {
  const result = await interpretText('spears to North Ford; if their horse is there, hold', context, {})
  assert.equal(result.orders.length, 1)
  assert.equal(result.orders[0].when.type, 'sees')
  const lines = interpretLines(['swords to C4', 'then on to the bridge'], context)
  assert.equal(lines.orders.length, 1)
  assert.equal(lines.orders[0].steps.length, 1)
})

test('chains and conditions the grammar reads never reach the AI', async () => {
  const transport = scriptedTransport(() => { throw new Error('the AI was called') })
  const ai = createAiClient({ transport, retries: 0 })
  for (const line of ['swords to C4, then on to the bridge, then dig in', 'spears to North Ford, if their horse is there, hold']) {
    assert.equal((await interpretText(line, context, { ai })).source, 'grammar')
  }
  assert.equal(transport.calls.length, 0)
})

test('the AI: a condition on an order, and steps as orders for the same unit', async () => {
  const order = (over) => ({
    units: ['red_spears'], action: 'move', place: 'North Ford', then_hold: false, careful: false, against: null, let_pass: 0, regardless: false,
    if_event: 'none', if_there: false, if_unit: null, if_action: null, if_place: null, ...over
  })
  const reply = {
    orders: [
      order({ if_event: 'sees_cavalry', if_there: true, if_action: 'hold' }),
      order({ place: 'Harrow Bridge', then_hold: true }),
      order({ units: ['red_horse'], action: 'hold', place: null, if_event: 'unit_breaks', if_unit: 'red_spears', if_action: 'withdraw' })
    ],
    question: null, note: null, surrender: false
  }
  const ai = createAiClient({ transport: scriptedTransport(() => ({ text: JSON.stringify(reply), usage: { inputTokens: 300, outputTokens: 80 } })), retries: 0 })
  const result = await interpretText('I want the spears at the north ford unless their horse has it, in which case hold, and afterwards the bridge; horse to wait and pull out should the spears run', context, { ai })
  assert.equal(result.source, 'ai')
  assert.equal(result.questions.length, 0)
  const spears = result.orders.find(o => o.unitRef === 'red_spears')
  assert.deepEqual([spears.when.type, spears.when.kind, spears.when.do.action], ['sees', 'cavalry', 'hold'])
  assert.deepEqual(spears.when.near, spears.target)
  assert.deepEqual([spears.steps.length, spears.steps[0].then], [1, 'hold'])
  const horse = result.orders.find(o => o.unitRef === 'red_horse')
  assert.deepEqual([horse.when.type, horse.when.unitId, horse.when.do.action], ['breaks', 'red_spears', 'withdraw'])
})

// ── Counsel ────────────────────────────────────────────

test('counsel: an experienced officer warns that a green one will not hold a deep order', () => {
  const result = read('spears to C4, then on to the bridge')
  assert.equal(result.counsel.length, 1)
  assert.match(result.counsel[0], /^Quintus of red_swords warns: Marcus of red_spears is green\. Expect him to keep "march to C4 \(C4-NW\)" and lose the rest; if he loses the thread, he will advance on the enemy\.$/)
})

test('counsel says nothing of a plain order, or of a veteran, and speaks for itself when it must', () => {
  assert.deepEqual(read('spears to C4').counsel, [])
  assert.deepEqual(read('swords to C4, then on to the bridge, then dig in').counsel, [], 'Quintus is a veteran')
  // The horse's officer is seasoned: one clause he holds, two he may not.
  assert.deepEqual(read('horse to C4, then on to the bridge').counsel, [])
  const two = read('horse to C4, then on to the bridge, if you are attacked, fall back')
  assert.match(two.counsel[0], /^Quintus of red_swords warns: Titus of red_horse should hold the first part of that\. The rest is less sure; if he loses the thread, he will stop and hold\.$/)
})

test('counsel needs an experienced officer to give it, and warns of shaken men sent forward', () => {
  const greens = { ...context, units: world.units.filter(u => u.id === 'red_spears') }
  assert.deepEqual(read('spears to C4, then on to the bridge', greens).counsel, [], 'no one on the field knows better')

  const shaken = { ...context, shaken: ['red_spears'] }
  assert.match(read('spears advance', shaken).counsel[0], /red_spears are at breaking point\. Sent at the enemy now, they will break at the first blow\.$/)
  assert.deepEqual(read('spears hold', shaken).counsel, [])
})
