// src/harness/tests/messengers-unchanged.test.js
//
// A battle with no Commander on the field runs exactly as it did before
// orders and news went by rider (docs/design/point-of-view-and-
// messengers.md). The fingerprints are of whole event logs, taken from the
// code just before riders were built (main at 5c37550): Rome against Han,
// the computer on both sides, on two maps, two seeds each, with the number
// of player turns. If one changes, riders changed a battle they should not
// touch.
//
// Retaken when combat and the usual armies changed on purpose (the army
// balance, Recommendation A: docs/design/army-balance.md). Before it they
// were ec82c3c2 17, 1765942a 18, 1690181b 18, 5c67514a 20.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders } = require('../../engine/orchestrator')
const { planTurn } = require('../../opponent/planner')
const { loadScenario } = require('../../adapters/hotseat/scenarios')
const { fieldFactions } = require('../../engine/army/factions')

// FNV-1a: a short, stable fingerprint of a long text.
function fingerprint(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16)
}

const BEFORE = {
  'crownhill 1': 'f8deabe5 20',
  'crownhill 2': '745feb5f 30',
  'ashford 1': 'f7d6da75 32',
  'ashford 2': '6c59381b 38'
}

test('a battle with no Commander on the field runs exactly as before riders, event for event', () => {
  const now = {}
  for (const field of ['crownhill', 'ashford']) for (const seed of [1, 2]) {
    const spec = fieldFactions(loadScenario('meeting-battle', { map: field, deploy: true }), { red: 'rome', blue: 'han' })
    const game = createGame({ ...spec, standingOrders: {} }, { seed })
    for (let t = 0; t < 150 && !game.outcome.decided; t++) {
      const red = planTurn(game, 'red')
      const blue = planTurn(game, 'blue')
      submitOrders(game, 'red', red)
      submitOrders(game, 'blue', blue)
    }
    assert.ok(game.battle.log.all().every(e => !e.type.startsWith('rider')))
    now[`${field} ${seed}`] = `${fingerprint(JSON.stringify(game.battle.log.all()))} ${game.history.length}`
  }
  assert.deepEqual(now, BEFORE)
})
