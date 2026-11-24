// src/harness/tests/no-fight.test.js
//
// Battles that come to nothing (harness/no-fight.js): how a quiet stretch
// is counted, and that two armies led by the computer, or the computer
// against a player who gives no orders, come to grips on every map
// (docs/DECISIONS.md, "How armies were made to come to grips"). The soak
// plays a fifth of the study; this a small slice of it.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { play, battles, quietest } = require('../no-fight')
const { mapChoices } = require('../../adapters/hotseat/scenarios')

test('a quiet stretch is the longest run of ticks in which no unit closed on the enemy, shot, came to blows or took ground', () => {
  const start = [{ id: 'r', side: 'red', position: { x: 0, y: 0 } }, { id: 'b', side: 'blue', position: { x: 10, y: 0 } }]
  const events = [
    { type: 'move', turn: 1, unitId: 'r', to: { x: 2, y: 0 } },   // closer than ever: busy
    { type: 'move', turn: 2, unitId: 'r', to: { x: 1, y: 0 } },   // back again: quiet
    { type: 'move', turn: 3, unitId: 'r', to: { x: 2, y: 0 } },   // no nearer than before: quiet
    { type: 'volley', turn: 9 }                                   // shooting: busy
  ]
  assert.equal(quietest(start, events, 12), 70, 'ticks 2 to 8')
  assert.equal(quietest(start, [], 12), 110, 'nothing at all after the first tick, when the armies first stood where they are')
})

test('two armies led by the computer come to grips on every map, with the ground to fight for and without', () => {
  const maps = mapChoices().map(m => m.id)
  for (const none of [false, true]) {
    for (const b of battles({ maps, rounds: 1 }).filter((_, i) => i % 23 === 0)) {
      const r = play({ ...b, none })
      assert.ok(!r.nothing, `${b.map} ${b.red} v ${b.blue}, ${b.redCharacter} v ${b.character}, seed ${b.seed}${none ? ', no ground' : ''}: night with ${Math.round(100 * r.lost.red)}% / ${Math.round(100 * r.lost.blue)}% lost`)
    }
  }
})

test('against a player who gives no orders the computer comes for him or for the ground', () => {
  const maps = mapChoices().map(m => m.id)
  for (const none of [false, true]) {
    for (const b of battles({ maps, rounds: 1, redPlays: 'idle' }).filter((_, i) => i % 23 === 0)) {
      const r = play({ ...b, redPlays: 'idle', none })
      assert.ok(!r.nothing, `${b.map} ${b.red} v ${b.blue}, ${b.character}, seed ${b.seed}${none ? ', no ground' : ''}: night with no fight`)
      if (!none) assert.ok(r.decided && !r.night, `${b.map} ${b.red} v ${b.blue}: the computer takes the field before night (${r.reason})`)
    }
  }
})
