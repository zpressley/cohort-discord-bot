// src/engine/orchestrator/tests/night.test.js
//
// The end of the day. Ruled 2026-11-24: "10 hours is fine... might as well
// make it 12 armies did not fight in the dark", and, asked whether a side
// should still win at the day's end on fewer losses, "No the day just ends
// the battle, you can choose to fight again the next day."

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, evaluateVictory } = require('../index')
const { createWorld } = require('../../world')
const { DAY } = require('../../combat/tables')

const unit = (o) => ({
  id: 'u', side: 'red', position: 'H10', strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})

test('the day is twelve hours of battle', () => {
  assert.equal(DAY.MINUTES, 720)
})

test('night ends the battle and neither side has won, even the side that lost fewer men', () => {
  const world = createWorld({
    units: [unit({ id: 'r', strength: 70 }), unit({ id: 'b', side: 'blue', position: 'H20', strength: 90 })]
  })
  const ctx = { world, broken: new Set(), startingStrength: { red: 100, blue: 100 }, minutesElapsed: 720, dayOver: true }
  const outcome = evaluateVictory(ctx)
  assert.equal(outcome.decided, true)
  assert.equal(outcome.winner, 'draw')
  assert.equal(outcome.reason, 'night fell')
  // Who was ahead is kept for the harness's tables, never as a win.
  assert.equal(outcome.ahead, 'blue')
})

test('night falls on a battle counted in turns as on one counted in battle time', () => {
  const meeting = require('../../../harness/scenarios/meeting-battle')
  const game = createGame({ ...meeting, standingOrders: {}, turnLimit: 2 }, { seed: 1 })
  for (let i = 0; i < 5 && !game.outcome.decided; i++) {
    submitOrders(game, 'red', [{ unitRef: 'everyone', target: 'hold' }])
    submitOrders(game, 'blue', [{ unitRef: 'everyone', target: 'hold' }])
  }
  assert.deepEqual([game.outcome.winner, game.outcome.reason], ['draw', 'night fell'])
  assert.equal(game.history.at(-1).interrupt, 'night')
  // Both sides see the dark come down: it is in the log, for everyone.
  assert.equal(game.battle.log.all().filter(e => e.type === 'nightfall').length, 1)
})

test('a battle with no end of day has no night', () => {
  const meeting = require('../../../harness/scenarios/meeting-battle')
  const game = createGame({ ...meeting, standingOrders: {}, timeLimitMinutes: 60 }, { seed: 1 })
  for (let i = 0; i < 20 && !game.outcome.decided; i++) {
    submitOrders(game, 'red', [{ unitRef: 'everyone', target: 'hold' }])
    submitOrders(game, 'blue', [{ unitRef: 'everyone', target: 'hold' }])
  }
  assert.equal(game.outcome.reason, 'time ran out: equal losses', 'the time limit, a testing aid, is as it was')
  assert.equal(game.battle.log.all().filter(e => e.type === 'nightfall').length, 0)
})
