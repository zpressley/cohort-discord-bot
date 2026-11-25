// src/interpreter/tests/camp.test.js
//
// Orders for the camp, in plain words, read by the grammar (a camp battle's:
// engine/battle/camp.js; docs/DECISIONS.md, "How camps were built").

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { parseLine } = require('../grammar')
const { interpretLines } = require('../orders')
const { resolveMap } = require('../../engine/map/map')

const unit = (o) => ({
  side: 'red', strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
const map = resolveMap('greywater')
const units = [unit({ id: 'velites', quality: 'levy', position: { x: 14, y: 41 } }), unit({ id: 'hastati', position: { x: 15, y: 40 } }), unit({ id: 'horse', mounted: true, position: { x: 13, y: 43 } })]
const context = (camps) => ({ map, units, homeEdge: 'west', camps })
const CARRIED = { own: { status: 'carried', carrier: 'velites', at: null, tiles: null }, enemy: null }
const PITCHED = { own: { status: 'pitched', carrier: null, at: { x: 10, y: 41 }, tiles: [] }, enemy: { status: 'pitched', at: { x: 66, y: 38 } } }

test('the grammar reads the camp orders: pitch it there or here, move it, strike it, burn theirs, guard it, fall back to it', () => {
  const read = (line) => { const r = parseLine(line); return [r.unitRef, r.action, r.place] }
  assert.deepEqual(read('velites pitch the camp at the Long Down'), ['velites', 'pitch', 'the Long Down'])
  assert.deepEqual(read('pitch the camp here'), ['everyone', 'pitch', null])
  assert.deepEqual(read('make camp'), ['everyone', 'pitch', null])
  assert.deepEqual(read('move the camp to C5'), ['everyone', 'pitch', 'C5'])
  assert.deepEqual(read('strike the camp'), ['everyone', 'strike', null])
  assert.deepEqual(read('horse burn their camp'), ['horse', 'attack', 'their camp'])
  assert.deepEqual(read('take the enemy camp'), ['everyone', 'attack', 'their camp'])
  assert.deepEqual(read('hastati guard the camp'), ['hastati', 'defend', 'the camp'])
  assert.deepEqual(read('fall back to the camp'), ['everyone', 'withdraw', 'the camp'])
})

test('"pitch the camp" with no one named is for the unit carrying it, and the read-back names it', () => {
  const out = interpretLines(['pitch the camp at the Long Down'], context(CARRIED))
  assert.deepEqual(out.questions, [])
  assert.equal(out.orders.length, 1)
  assert.equal(out.orders[0].unitRef, 'velites')
  assert.equal(out.orders[0].action, 'pitch')
  assert.match(out.understood[0], /^velites: pitch the camp at the Long Down/)
  const here = interpretLines(['pitch the camp here'], context(CARRIED))
  assert.deepEqual(here.orders[0].target, { x: 14, y: 41 })
  assert.match(here.understood[0], /^velites: pitch the camp where they stand/)
})

test('"move the camp" with the camp pitched sends the unit nearest it to take it up and carry it there', () => {
  const out = interpretLines(['move the camp to C5'], context(PITCHED))
  assert.deepEqual(out.questions, [])
  assert.equal(out.orders[0].action, 'pitch')
  assert.equal(out.orders[0].unitRef, 'horse')
})

test('the camp is a place: his own wherever it stands, the enemy\'s only once his men have found it', () => {
  const guard = interpretLines(['hastati guard the camp'], context(PITCHED))
  assert.deepEqual(guard.orders[0].target, { x: 10, y: 41 })
  const raid = interpretLines(['horse burn their camp'], context(PITCHED))
  assert.deepEqual(raid.orders[0], { unitRef: 'horse', action: 'attack', target: { x: 66, y: 38 } })
  const notFound = interpretLines(['horse burn their camp'], context(CARRIED))
  assert.equal(notFound.orders.length, 0)
  assert.match(notFound.questions[0], /not found the enemy's camp/)
  const carried = interpretLines(['fall back to the camp'], context(CARRIED))
  assert.match(carried.questions[0], /not pitched: velites are carrying it/)
})

test('with no camps in the battle, "the camp" is no place the grammar invents', () => {
  const out = interpretLines(['hastati guard the camp'], context(undefined))
  assert.equal(out.orders.length, 0)
  assert.equal(out.questions.length, 1)
})

test('"everyone advance" beside an order to pitch the camp leaves the unit carrying it to its camp work', () => {
  const out = interpretLines(['pitch the camp here', 'everyone advance'], context(CARRIED))
  assert.deepEqual(out.orders.filter(o => o.unitRef === 'velites').map(o => o.action), ['pitch'])
  assert.ok(out.orders.some(o => o.unitRef === 'hastati' && o.action === 'advance'))
  assert.doesNotMatch(out.understood[1], /velites/)
})

test('"pitch the camp here, everyone guard the camp": the camp to guard is where it is being pitched', () => {
  const out = interpretLines(['pitch the camp here', 'hastati guard the camp'], context(CARRIED))
  assert.deepEqual(out.questions, [])
  assert.deepEqual(out.orders.find(o => o.unitRef === 'hastati').target, { x: 14, y: 41 })
})
