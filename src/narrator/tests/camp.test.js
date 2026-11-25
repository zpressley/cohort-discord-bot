// src/narrator/tests/camp.test.js
//
// A camp battle's news, told to each side as it could know it (engine/
// battle/camp.js; docs/DECISIONS.md, "How camps were built").

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { report, visibleEvents } = require('../turnNarrator')
const { wordEvent } = require('../../adapters/hotseat/render')
const { resolveMap } = require('../../engine/map/map')

const map = resolveMap('greywater')
const at = { x: 10, y: 41 }
const tell = (side, events, own, seen = []) => report({ map, side, ownIds: new Set(own), seenEnemyIds: new Set(seen), events }).join('\n')

test('his camp burned undefended is told to him at once in Zach\'s words; the enemy who burned it sees the smoke', () => {
  const events = [{ type: 'campBurned', turn: 5, side: 'red', by: 'blue_horse', undefended: true, at }]
  assert.match(tell('red', events, ['red_spears']), /Your camp lay undefended: you can see the flames rising, and you know your men will have no rest tonight/)
  assert.match(tell('blue', events, ['blue_horse']), /blue_horse burned the enemy's camp .*: the smoke is rising over it, and his men will have no rest tonight/)
})

test('his camp falling though defended is told too: its guard could hold it no longer', () => {
  const events = [{ type: 'campBurned', turn: 5, side: 'red', by: 'blue_horse', undefended: false, at }]
  assert.match(tell('red', events, ['red_spears']), /Your camp has fallen: its guard could hold it no longer/)
})

test('the enemy\'s camp found is his own side\'s news, and the enemy is not told it was found', () => {
  const events = [{ type: 'campFound', turn: 5, side: 'red', unitId: 'red_horse', of: 'blue', status: 'pitched', at }]
  assert.match(tell('red', events, ['red_horse']), /red_horse found the enemy's camp/)
  assert.equal(visibleEvents(events, { ownIds: new Set(['blue_spears']), seenEnemyIds: new Set(['red_horse']), side: 'blue' }).length, 0)
})

test('the night is told to both, and each army\'s rest only to its own side', () => {
  const events = [
    { type: 'nightPassed', turn: 72, day: 2 },
    { type: 'campRest', turn: 72, side: 'red', rested: true, why: 'pitched', wind: 0.4 },
    { type: 'campRest', turn: 72, side: 'blue', rested: false, why: 'burned', wind: 0.3 }
  ]
  const red = tell('red', events, ['red_spears'])
  assert.match(red, /Dawn: the second day of the battle begins/)
  assert.match(red, /Your men rested in camp, and will be fresh at first light/)
  assert.doesNotMatch(red, /no rest/)
  assert.match(tell('blue', events, ['blue_spears']), /Your camp is burned: your men have no rest tonight/)
})

test('every camp event has a line in the hotseat terminal', () => {
  for (const e of [
    { type: 'campPitched', side: 'red', unitId: 'r', at },
    { type: 'campStruck', side: 'red', unitId: 'r', at },
    { type: 'campDropped', side: 'red', unitId: 'r', at },
    { type: 'campFound', side: 'red', unitId: 'r', of: 'blue', at },
    { type: 'campAssailed', side: 'red', by: 'b', hits: 1, of: 3, at },
    { type: 'campBurned', side: 'red', by: 'b', undefended: true, at },
    { type: 'campTiring', side: 'red' },
    { type: 'campRest', side: 'red', rested: true },
    { type: 'nightPassed', day: 2 }
  ]) assert.ok(wordEvent(e), e.type)
})
