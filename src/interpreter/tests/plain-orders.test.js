// src/interpreter/tests/plain-orders.test.js
//
// Plain orders a new player types with no AI (docs/REVIEW-2026-11.md, D4
// and D13): read rightly, or answered with a clear question. The fixture
// (fixtures/plain-orders.js) is run on every field with a real army; each
// rule below is one of the ways it was widened.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { interpretText } = require('../orders')
const { parseLine } = require('../grammar')
const { scoreAll, tally, contextFor } = require('./fixtures/score')
const { createBattleStore } = require('../../web/battles')
const { PLACE } = require('../../narrator/words')
const { gridLabel } = require('../../engine/map/grid')

const store = createBattleStore({})
const fields = new Map()
const field = (map, army = 'rome') => {
  const key = `${map}/${army}`
  if (!fields.has(key)) fields.set(key, contextFor(store, map, army))
  return fields.get(key)
}
const read = (text, map = 'crownhill', army = 'rome') => interpretText(text, field(map, army), {})
const ids = (r, action) => r.orders.filter(o => !action || o.action === action).map(o => o.unitRef).sort()
const all = (map = 'crownhill', army = 'rome') => field(map, army).units.map(u => u.id).sort()

test('the plain orders of the fixture are read rightly or met with a fair "which do you mean?", and none is read wrongly', async () => {
  const results = await scoreAll()
  const t = tally(results)
  // Measured when the grammar was widened (docs/DECISIONS.md, "How the
  // grammar was widened"): 1,508 of 1,609 right, 101 asked which, none
  // wrong, none unread. Before: 784 right, 68 wrong, 681 not read.
  assert.equal(t.wrong, 0, results.filter(r => r.verdict === 'wrong').map(r => `${r.map}: ${r.entry.say}`).join('\n'))
  assert.equal(t.unread, 0, results.filter(r => r.verdict === 'unread').map(r => `${r.map}: ${r.entry.say}`).join('\n'))
  assert.ok(t.right / t.total >= 0.9, `right ${t.right} of ${t.total}`)
  assert.ok(t.total >= 1500 && new Set(results.map(r => r.entry.say)).size >= 300, 'the fixture keeps its size')
})

test('"everyone else hold" orders every unit not named in the same set of orders', async () => {
  const r = await read('legionaries advance\neveryone else hold')
  assert.deepEqual(ids(r, 'advance'), ['red_legionaries'])
  assert.deepEqual(ids(r, 'hold'), all().filter(id => id !== 'red_legionaries'))
  assert.equal(r.questions.length, 0)
})

test('"the rest", "the others" and "everyone else" on the same line as the order they follow mean the same', async () => {
  for (const said of ['velites to C5\nthe rest hold', 'velites to C5, the others hold', 'velites to C5. everyone else hold']) {
    const r = await read(said)
    assert.deepEqual(ids(r, 'move'), ['red_velites'], said)
    assert.deepEqual(ids(r, 'hold'), all().filter(id => id !== 'red_velites'), said)
  }
})

test('"everyone except the velites" and "all but the velites" are every unit but those', async () => {
  for (const said of ['everyone except the velites advance', 'all but the velites advance']) {
    assert.deepEqual(ids(await read(said), 'advance'), all().filter(id => id !== 'red_velites'), said)
  }
})

test('"everyone else" with no one else named is a question, not every unit', async () => {
  const r = await read('everyone else hold')
  assert.equal(r.orders.length, 0)
  assert.match(r.questions[0], /every unit not named in your other orders/)
})

test('"go north 300m" marches 300 m north of where the unit stands, with or without a space, either side of the way', async () => {
  for (const said of ['legionaries go north 300m', 'legionaries go north 300 m', 'legionaries move 300m north', 'legionaries go 3 squares north', 'legionaries go n 300m']) {
    const r = await read(said)
    assert.match(r.understood[0], /march 300 m north/, said)
  }
})

test('"fall back 200 m" falls back toward his own edge of the field', async () => {
  const r = await read('legionaries fall back 200 m')
  const own = field('crownhill').units.find(u => u.id === 'red_legionaries')
  assert.equal(r.orders[0].action, 'withdraw')
  assert.ok(r.orders[0].target.x < own.position.x, 'west, the red edge')
  assert.match(r.understood[0], /fall back 200 m west/)
})

test('"guard", "secure", "defend", "take" and "occupy" a place go there and hold it', async () => {
  for (const said of ['legionaries guard c5', 'legionaries secure c5', 'legionaries defend c5', 'legionaries take c5', 'legionaries occupy c5']) {
    const r = await read(said)
    assert.equal(r.orders[0].action, 'defend', said)
    assert.equal(gridLabel(r.orders[0].target), 'C5', said)
  }
})

test('"the hill" on a field whose ground to fight for is a hill is that ground, and the read-back says so', async () => {
  const r = await read('everyone take the hill', 'crownhill')
  assert.match(r.understood[0], /march to the Crownhill, the ground to fight for, \d+ m north/)
  const bridge = await read('take the bridge', 'ashford')
  assert.match(bridge.understood[0], /the Old Mill Bridge, the ground to fight for/)
  const gap = await read('everyone hold the gap', 'ravenridge')
  assert.match(gap.understood[0], /Raven Gap, the ground to fight for/)
  const ground = await read('take the ground', 'greywater')
  assert.match(ground.understood[0], /Elderby, the ground to fight for/)
})

test('"the hill" on a field whose ground to fight for is no hill is the nearest hill he knows, as before', async () => {
  const r = await read('everyone take the hill', 'ashford')
  assert.match(r.understood[0], /the Low Downs \d+ m/)
  assert.doesNotMatch(r.understood[0], /ground to fight for/)
})

test('a unit\'s name a letter or two off is read, when only one unit is that near', async () => {
  for (const [said, id] of [['legionnaires hold', 'red_legionaries'], ['legionares hold', 'red_legionaries'], ['hastatti hold', 'red_hastati'], ['pretorian guard hold', 'red_praetorian_guard'], ['legionary hold', 'red_legionaries'], ['the legion hold', 'red_legionaries']]) {
    assert.deepEqual(ids(await read(said)), [id], said)
  }
})

test('an order word a letter off is read: "evryone avdance", "legionaries hlod", "go nroth"', async () => {
  assert.deepEqual(ids(await read('evryone avdance'), 'advance'), all())
  assert.deepEqual(ids(await read('legionaries hlod'), 'hold'), ['red_legionaries'])
  assert.match((await read('legionaries go nroth')).understood[0], /north/)
})

test('a word a letter off from a unit\'s or a place\'s name is never "put right" into an order word', () => {
  // "mill" is a letter from "hill"; "slingers" two from "slings".
  assert.equal(parseLine('take the mill bridge', { names: ['Old Mill Bridge'] }).place, 'the mill bridge')
  assert.equal(parseLine('horse attack their slingers').enemyRef, 'slingers')
})

test('"velites throw javelins": men who throw at blows are told so, and offered advancing or holding', async () => {
  const r = await read('velites throw javelins')
  assert.equal(r.orders.length, 0)
  assert.match(r.questions[0], /throw their light javelins as they come to blows/)
  assert.deepEqual(r.choices[0].options.map(o => o.text), ['velites advance', 'velites hold'])
  assert.equal(r.choices[0].place, 'velites throw javelins')
})

test('"skirmish" for men with bows is fire and retreat: they advance, read back as the engine does it', async () => {
  const r = await read('horse archers skirmish', 'crownhill', 'parthia')
  assert.deepEqual(r.orders.map(o => [o.unitRef, o.action]), [['red_horse_archers', 'advance']])
  assert.match(r.understood[0], /advance on the enemy until in shot, shoot, and fall back before any who come at them on foot/)
  const foot = await read('velites skirmish')
  assert.equal(foot.orders.length, 0, 'velites have no bows: a question')
})

test('"stay with the legionaries" is a question: no order keeps one unit with another, and the two nearest orders are offered', async () => {
  const r = await read('velites stay with the legionaries')
  assert.equal(r.orders.length, 0)
  assert.match(r.questions[0], /no order to keep one unit with another/)
  const [there, both] = r.choices[0].options
  assert.match(there.text, /^velites to [A-J]\d+-[NS][EW]$/)
  assert.equal(both.text, 'velites and legionaries advance')
})

test('"go around their left" is a question offering the ends of the enemy he has seen, by the compass', async () => {
  const r = await read('legionaries go around their left')
  assert.equal(r.orders.length, 0)
  assert.match(r.questions[0], /your officers will not guess it/)
  assert.ok(r.choices[0].options.length >= 1)
  for (const o of r.choices[0].options) assert.match(o.label, /^round the [a-z-]+ end of the enemy you have seen$/)
  const blind = await interpretText('legionaries go around their left', { ...field('crownhill'), enemies: [] }, {})
  assert.match(blind.questions[0], /You have seen no enemy/)
})

test('an order not understood says which part, and offers orders in his own units\' names', async () => {
  const r = await read('legionaries go nuts')
  assert.match(r.questions[0], /^I know red_legionaries, but I don't follow what you want of them: "go nuts"\. Orders read like: /)
  assert.match(r.questions[0], /legionaries advance/)
  assert.match(r.questions[0], /everyone take the Crownhill/)
  const none = await read('blah blah')
  assert.match(none.questions[0], /^I don't follow "blah blah"\. Orders read like: /)
})

test('several orders on one line, each beginning with a unit, are read as several', async () => {
  for (const said of ['legionaries to c5, hastati to d6', 'legionaries to c5 hastati to d6', 'legionaries to c5 and hastati to d6']) {
    const r = await read(said)
    assert.deepEqual(r.orders.map(o => [o.unitRef, gridLabel(o.target)]), [['red_legionaries', 'C5'], ['red_hastati', 'D6']], said)
  }
})

test('kinds of his own troops: "the horse" is every unit on horse, "the foot" every unit on foot, "the pikes" every unit with a pike', async () => {
  assert.deepEqual(ids(await read('the horse hold', 'crownhill', 'parthia')), ['red_horse_archers', 'red_light_horse', 'red_savaran'])
  assert.deepEqual(ids(await read('the foot hold', 'crownhill', 'parthia')), ['red_levy_spears_1', 'red_levy_spears_2'])
  assert.deepEqual(ids(await read('the pikes hold', 'crownhill', 'macedon')), ['red_sarissa_foot_1', 'red_sarissa_foot_2'])
  assert.deepEqual(ids(await read('spears 2 hold', 'crownhill', 'parthia')), ['red_levy_spears_2'])
})

test('the first line is every unit but the second line', async () => {
  const r = await read('first line advance', 'greywater')
  assert.deepEqual(ids(r), all('greywater').filter(id => !id.startsWith('red_second_')))
})

test('a place\'s name is said one way everywhere: "the" in small letters, taken by a name that describes the place (D13)', () => {
  assert.equal(PLACE.name('The Crownhill'), 'the Crownhill')
  assert.equal(PLACE.name('Old Mill Bridge'), 'the Old Mill Bridge')
  assert.equal(PLACE.name('North Ford'), 'the North Ford')
  assert.equal(PLACE.name('Harrow Bridge'), 'Harrow Bridge')
  assert.equal(PLACE.name('Raven Gap'), 'Raven Gap')
})

test('the read-back names places by that rule: "march to the Crownhill", "the Old Mill Bridge", "the North Ford"', async () => {
  assert.match((await read('legionaries to the crownhill')).understood[0], /march to the Crownhill/)
  assert.match((await read('legionaries to old mill bridge', 'ashford')).understood[0], /march to the Old Mill Bridge/)
  assert.match((await read('legionaries to the north ford')).understood[0], /march to the North Ford/)
  assert.match((await read('legionaries to harrow bridge')).understood[0], /march to Harrow Bridge/)
})

test('a place\'s name loosely written is read: no apostrophe, run together or apart, or in part', async () => {
  assert.match((await read('velites to millers crossing')).understood[0], /Miller's Crossing/)
  assert.match((await read('velites to the crown hill')).understood[0], /the Crownhill/)
  assert.match((await read('velites to the mill bridge', 'ashford')).understood[0], /the Old Mill Bridge/)
})
