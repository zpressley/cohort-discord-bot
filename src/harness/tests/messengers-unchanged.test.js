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
// were ec82c3c2 17, 1765942a 18, 1690181b 18, 5c67514a 20; after A and
// before heavy armour's wind (part 5), f8deabe5 20, 745feb5f 30,
// f7d6da75 32, 6c59381b 38.
//
// Retaken for fire and retreat (docs/design/army-balance.md part 7): Han's
// crossbowmen, in mail, now close to shooting distance and stand, and the
// computer presses with them. On ashford the battles were 9b2d3801 31 and 551c795d 37.
//
// Retaken for second weapons (docs/design/army-balance.md part 8): Rome's
// legionaries and Praetorians throw pila, and its velites javelins, as they
// come to blows. The battles were 1fb30748 22, abc6d6db 30, 76c134c8 29,
// 7d98462c 31.
//
// Retaken for each people's perks (docs/design/army-balance.md part 9):
// Rome's men a little steadier, Han's bought units a fifth larger. The
// battles were a0fe2488 18, e70e50fe 25, 31e8e9f4 26, 6583ef4f 34. Both
// on ashford now run to the 150-turn guard, the armies marching up and
// down either side of the ford; not the perks' doing (it happens without
// them, Mongolia against Tibet on ashford, seed 77), and in the app the
// day ends such a battle.

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
  'crownhill 1': '889c9e1e 18',
  'crownhill 2': '27381837 24',
  'ashford 1': '9de62f89 150',
  'ashford 2': '6d782516 150'
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
