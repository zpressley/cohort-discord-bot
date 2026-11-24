// src/interpreter/tests/safe-reader.test.js
//
// The order reader made safe (docs/REVIEW-2026-11.md, S1 to S4, and the
// orders of the AI benchmark the grammar read wrongly): whatever is typed,
// the reader answers in bounded time with orders, a question or a plain
// "I could not follow that", never a hang or a crash.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { parseLine } = require('../grammar')
const { interpretText, grammarIntents } = require('../orders')
const { contextFor, MAPS } = require('./fixtures/score')
const { mangledOrders } = require('./fixtures/mangled')
const { createBattleStore } = require('../../web/battles')
const bench = require('../../harness/ai-bench')

const store = createBattleStore({})
const fields = new Map()
const field = (map = 'crownhill') => {
  if (!fields.has(map)) fields.set(map, contextFor(store, map, 'rome'))
  return fields.get(map)
}
const read = (text, ctx = field()) => interpretText(text, ctx, {})
const ids = (r, action) => r.orders.filter(o => !action || o.action === action).map(o => o.unitRef).sort()
const timed = async (fn) => {
  const start = process.hrtime.bigint()
  const out = await fn()
  return { out, ms: Number(process.hrtime.bigint() - start) / 1e6 }
}
// What any one line may take, at most. Lines read in a few milliseconds;
// the longest the reader takes (600 letters of names, cut every way) is
// well under a second.
const BOUND_MS = 3000

test('no order, however mangled, hangs or crashes the reader: on every field each gets orders, a question or a refusal', async () => {
  let lines = 0
  let slowest = 0
  for (const map of MAPS) {
    const ctx = field(map)
    for (const line of mangledOrders(ctx, 20261124 + map.length, 500)) {
      assert.doesNotThrow(() => parseLine(line), `the grammar alone threw on ${JSON.stringify(line)}`)
      const { out, ms } = await timed(() => read(line, ctx))
      slowest = Math.max(slowest, ms)
      assert.ok(ms < BOUND_MS, `${map}: ${Math.round(ms)} ms for ${JSON.stringify(line)}`)
      // "done" ends the orders, and a line with no words ("?") is none.
      const nothing = ['done', 'empty'].includes(parseLine(line.split(/\n|;/)[0]).kind)
      assert.ok(out.orders.length > 0 || out.questions.length > 0 || out.surrender || nothing, `${map}: no answer to ${JSON.stringify(line)}`)
      lines++
    }
  }
  assert.equal(lines, 2500)
})

test('a line that is only "if" or "then", or ends on one, is read without the grammar calling itself for ever', async () => {
  for (const said of ['if', 'then', 'if if if then then', 'legionaries hold then', 'legionaries hold if', 'after that']) {
    assert.doesNotThrow(() => parseLine(said), said)
    const r = await read(said)
    assert.ok(r.orders.length > 0 || r.questions.length > 0, said)
  }
  assert.deepEqual(ids(await read('legionaries hold then'), 'hold'), ['red_legionaries'], 'a word left hanging is dropped')
})

test('a line too long or too tangled to read is answered "I could not follow that", with orders that are read', async () => {
  for (const said of [Array(300).fill('if').join(' '), Array(80).fill('legionaries hastati').join(' ')]) {
    const r = await read(said)
    assert.equal(r.orders.length, 0)
    assert.match(r.questions[0], /^I could not follow that/, said.slice(0, 40))
    assert.match(r.questions[0], /Orders read like: .*Legionaries advance/i)
  }
})

test('an order to hold, and to fall back if another unit breaks, is read as one order with that condition (S1)', async () => {
  const r = await read('I want the legionaries to stay put, but if the hastati break, pull the legionaries back')
  assert.equal(r.questions.length, 0, r.questions.join(' '))
  assert.deepEqual(r.orders.map(o => [o.unitRef, o.action, o.when?.type, o.when?.unitId, o.when?.do?.action]),
    [['red_legionaries', 'hold', 'breaks', 'red_hastati', 'withdraw']])
  assert.match(r.understood[0], /hold; if red_hastati break, fall back/)
})

test('riding with a unit and an order to it on one line are read as the two orders they are (S2)', () => {
  const intents = grammarIntents(['ride with the velites, velites advance'], field())
  assert.deepEqual(intents.map(i => i.kind === 'ride' ? ['ride', i.unitRef] : [i.unitRef, i.action]), [['ride', 'velites'], ['velites', 'advance']])
})

test('"the enemy on the hill" is the enemy his side has seen on it (S3)', async () => {
  const ctx = field('crownhill')
  const hill = ctx.ground[0].tiles[Math.floor(ctx.ground[0].tiles.length / 2)]
  const seen = { ...ctx, enemies: [
    { id: 'blue_one', name: 'troops', position: { ...hill }, status: 'visible', seenOnTurn: 3 },
    { id: 'blue_far', name: 'troops', position: { x: 2, y: ctx.map.height - 2 }, status: 'visible', seenOnTurn: 3 }
  ] }
  for (const said of ['the legion charges the enemy on the hill', 'legionaries attack the enemy at the Crownhill', 'legionaries attack the enemy near the hill']) {
    const r = await read(said, seen)
    assert.deepEqual(r.orders.map(o => [o.unitRef, o.action, o.enemy]), [['red_legionaries', 'attack', 'blue_one']], said)
  }
})

test('"attack the enemy on the hill" with no enemy seen there sends the men to the hill to fight whoever they find, and says so (S3, S12)', async () => {
  const ctx = field('crownhill')
  for (const enemies of [[], [{ id: 'blue_far', name: 'troops', position: { x: 2, y: ctx.map.height - 2 }, status: 'visible', seenOnTurn: 3 }]]) {
    const r = await read('legionaries attack the enemy on the hill', { ...ctx, enemies })
    assert.equal(r.questions.length, 0, r.questions.join(' '))
    assert.equal(r.orders.length, 1)
    assert.equal(r.orders[0].action, 'attack')
    assert.ok(ctx.ground[0].tiles.some(t => Math.max(Math.abs(t.x - r.orders[0].target.x), Math.abs(t.y - r.orders[0].target.y)) <= 1), 'to the Crownhill')
    assert.match(r.understood[0], /attack the Crownhill.*fight whoever they find there: you have seen no enemy on it/)
  }
})

test('the first turn\'s card shows "everyone else hold" only after an order that names a unit, so tapped it is read whole (S4)', async () => {
  const app = fs.readFileSync(path.join(__dirname, '../../web/public/app.js'), 'utf8')
  assert.doesNotMatch(app, /^\s*'everyone else hold',$/m)
  assert.match(app, /`\$\{a\.name\} advance, everyone else hold`/)
  const r = await read('Legionaries advance, everyone else hold')
  assert.equal(r.questions.length, 0)
  assert.deepEqual(ids(r, 'advance'), ['red_legionaries'])
})

test('the orders of the AI benchmark the grammar once read wrongly are read rightly with no AI', async () => {
  const cases = [
    'Archers, hold your ground. If anyone attacks you, get back to the bridge.',
    'Send the spears to the bridge, hide the archers in the woods, and keep the horse back.',
    'spears and swords advance carefully while the archers hold',
    'Have the archers loose at their cavalry while the spears stand fast',
    'It is over. We yield.',
    'I want the horse to stay put, but if the spears break, pull the horse back'
  ]
  for (const say of cases) {
    const testCase = bench.CASES.find(c => c.say === say)
    assert.ok(testCase, say)
    assert.equal(bench.judge(testCase, await interpretText(say, bench.context, {})), null, say)
  }
})

test('every order of the AI benchmark gets an answer from the grammar step, in bounded time', async () => {
  assert.ok(bench.CASES.length >= 50)
  for (const testCase of bench.CASES) {
    const { out, ms } = await timed(() => interpretText(testCase.say, bench.context, {}))
    assert.ok(ms < BOUND_MS, testCase.say)
    assert.ok(out.orders.length > 0 || out.questions.length > 0 || out.surrender, testCase.say)
  }
})
