// src/harness/tests/attack-named-unchanged.test.js
//
// A battle that never gives an attack on a named enemy (review item L10)
// runs exactly as it did before that order existed. The fingerprints are of
// whole event logs, taken from the code as it stood just before the order
// was added (the `campaign` branch at 0c577eb): the computer's side against
// itself on two maps, and the closed-loop meeting battle. If one changes,
// something other than the new order changed how battles fall out.
//
// Retaken when combat changed on purpose (the army balance, Recommendation
// A: docs/design/army-balance.md): the same battles, the same code but the
// rules. Before it they were f0ebadb3, 2cec0402, e92384f2, 4aaa5698,
// e424a274, a2f07cdf, d567a781.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders } = require('../../engine/orchestrator')
const { planTurn } = require('../../opponent/planner')
const { loadScenario } = require('../../adapters/hotseat/scenarios')
const { runBattle } = require('../../engine/battle/battle')
const meeting = require('../scenarios/meeting-battle')

// FNV-1a: a short, stable fingerprint of a long text.
function fingerprint(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16)
}

const BEFORE = {
  'crownhill 1': '7dd10867',
  'crownhill 2': '987939aa',
  'thornwood 1': 'aeded69a',
  'thornwood 2': 'b2a4ce2b',
  'meeting 1': 'df860211',
  'meeting 2': 'ade1ebaa',
  'meeting 3': '29c7796a'
}

test('a battle in which no unit is told to attack a named enemy runs exactly as before', () => {
  const now = {}
  for (const field of ['crownhill', 'thornwood']) for (const seed of [1, 2]) {
    const scenario = loadScenario('meeting-battle', { map: field, deploy: true })
    const game = createGame({ ...scenario, standingOrders: {} }, { seed })
    for (let t = 0; t < 150 && !game.outcome.decided; t++) {
      const red = planTurn(game, 'red')
      const blue = planTurn(game, 'blue')
      submitOrders(game, 'red', red)
      submitOrders(game, 'blue', blue)
    }
    assert.ok(game.battle.log.all().every(e => e.type !== 'quarryGone'))
    now[`${field} ${seed}`] = fingerprint(JSON.stringify(game.battle.log.all()))
  }
  for (const seed of [1, 2, 3]) now[`meeting ${seed}`] = fingerprint(JSON.stringify(runBattle(meeting, { seed }).turns))
  assert.deepEqual(now, BEFORE)
})
