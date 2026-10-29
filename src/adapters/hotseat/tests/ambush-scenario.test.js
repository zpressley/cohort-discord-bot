// src/adapters/hotseat/tests/ambush-scenario.test.js
//
// Stage 3 end to end, on Crownhill, with orders typed the way a player
// would: a force lies in the woods beside the north road (G11), and a column
// comes down the road from the north. Marching, it is caught; on guard, the
// ambush lets it by.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createSession } = require('../session')

const unit = (overrides) => ({
  strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'spear_basic',
  armor: 'medium_armor', shield: 'medium_shield',
  ...overrides
})

function roadAmbush(columnOrder) {
  const session = createSession({
    name: 'road-ambush',
    sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'north' } },
    units: [
      unit({ id: 'red_spears', side: 'red', role: 'spearmen', position: 'G11' }),
      unit({ id: 'blue_column', side: 'blue', role: 'infantry', position: 'F5' })
    ],
    turns: []
  }, { seed: 1 })

  const laid = session.submitLines('red', ['spears ambush'])
  assert.match(laid.understood[0], /hidden from anyone who does not search/)
  session.submitLines('blue', ['column hold'])

  for (let turn = 0; turn < 4 && !session.finished(); turn++) {
    session.submitLines('red', [])
    session.submitLines('blue', turn === 0 ? [columnOrder] : [])
  }
  return session.game.battle.log
}

test('a column marching down the road is ambushed from the woods, and the fight goes on', () => {
  const log = roadAmbush('column to B4')
  assert.deepEqual(log.ofType('ambush').map(e => [e.unitId, e.on]), [['red_spears', 'blue_column']])
  assert.deepEqual(log.ofType('surprise').map(e => e.unitId), ['blue_column'])
  const fightingTurns = new Set(log.ofType('exchange').map(e => e.turn))
  assert.ok(fightingTurns.size >= 2, 'the ambushers press the attack after the first blow')
})

test('the same column marching carefully is let by, and never knows', () => {
  const log = roadAmbush('column march carefully to B4')
  assert.deepEqual(log.ofType('ambushHeld').map(e => [e.on, e.reason]), [['blue_column', 'on guard']])
  assert.equal(log.ofType('exchange').length, 0)
  assert.equal(log.ofType('revealed').length, 0)
})
