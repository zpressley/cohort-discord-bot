// src/narrator/tests/commander-words.test.js
//
// The Commander is the player: his own side is told what happens to him as
// "you"; the other side hears of it as its own men's doing.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { report } = require('../turnNarrator')

const map = { name: 'plain', width: 20, height: 20, terrainAt: () => 'plains', landmarks: [] }
const events = [
  { type: 'commanderTaken', turn: 3, side: 'red', unitId: 'red_spears', by: 'blue_swords' },
  { type: 'commanderFreed', turn: 5, side: 'red', unitId: 'red_horse', by: 'blue_swords' },
  { type: 'commanderMoved', turn: 6, side: 'red', unitId: 'red_swords', from: 'red_horse' },
  { type: 'commanderKilled', turn: 7, side: 'red', unitId: 'red_swords', by: 'blue_horse' }
]
const side = (own, seen) => report({ map, ownIds: new Set(own), seenEnemyIds: new Set(seen), events })

test('his own side reads it as "you"', () => {
  assert.deepEqual(side(['red_spears', 'red_horse', 'red_swords'], ['blue_swords', 'blue_horse']), [
    'You were taken by blue_swords. You can send no orders; your officers fight on with the ones they have',
    'blue_swords broke, and you got free and reached red_horse',
    'You were killed in the fight with blue_horse',
    'With red_horse gone you got away to red_swords'
  ])
})

test('the other side hears what its own men did, and never where he went', () => {
  assert.deepEqual(side(['blue_swords', 'blue_horse'], ['red_spears', 'red_horse', 'red_swords']), [
    'blue_swords took the enemy Commander',
    'the enemy Commander got free of blue_swords',
    'blue_horse killed the enemy Commander'
  ])
})
