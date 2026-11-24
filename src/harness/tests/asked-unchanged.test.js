// src/harness/tests/asked-unchanged.test.js
//
// The riders rulings of 2026-11-23 (a Commander notices when no word comes;
// each side is asked only when it is wanted) change only a battle with a
// Commander on the field, and not one saved before them. The fingerprints
// are of whole event logs, taken from the code just before the rulings
// were built (main at ca49eab): Rome against Han, red with his Commander
// riding with his elite and planning as the computer does, blue the
// computer by its command post, on two maps, two seeds each, with the
// number of player turns. If one changes, the rulings changed a battle they
// should not touch.
//
// Retaken when combat and the usual armies changed on purpose (the army
// balance: docs/design/army-balance.md, Recommendation A and part 5). The
// same battles under the old rules were 2f842b7 17, 5350ea95 18, 645c3e91 17,
// 558dd4b1 19 (everyone asked) and ec82c3c2 17, 1765942a 18, 1690181b 18,
// 5c67514a 20 (no Commander).
//
// Retaken for fire and retreat (docs/design/army-balance.md part 7): Han's
// crossbowmen, in mail, now close to shooting distance and stand, and the
// computer presses with them. On ashford the battles were 10fbde01 34, 976d3898 35 (everyone
// asked) and 9b2d3801 31, 551c795d 37 (no Commander).
//
// Retaken for second weapons (docs/design/army-balance.md part 8): Rome's
// legionaries and Praetorians throw pila, and its velites javelins. The
// battles were fdb72ba5 22, 5c62ed49 30, ad618256 34, 56ca8eee 36
// (everyone asked) and 1fb30748 22, abc6d6db 30, 76c134c8 29, 7d98462c 31
// (no Commander).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders } = require('../../engine/orchestrator')
const { planTurn } = require('../../opponent/planner')
const { loadScenario } = require('../../adapters/hotseat/scenarios')
const { fieldFactions } = require('../../engine/army/factions')
const { leadUnit } = require('../../engine/command/company')
const { byCommandPost } = require('../../engine/command/messengers')

// FNV-1a: a short, stable fingerprint of a long text.
function fingerprint(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16)
}

function play(extra, { commander }) {
  const now = {}
  for (const field of ['crownhill', 'ashford']) for (const seed of [1, 2]) {
    const spec = fieldFactions(loadScenario('meeting-battle', { map: field, deploy: true }), { red: 'rome', blue: 'han' })
    const mine = spec.units.filter(u => u.side === 'red')
    const commanders = commander ? { commanders: { red: { unitId: mine[leadUnit(mine)].id } }, turnLimit: 40 } : {}
    const game = createGame({ ...spec, standingOrders: {}, ...commanders, ...extra }, { seed })
    for (let t = 0; t < 150 && !game.outcome.decided; t++) {
      const red = planTurn(game, 'red')
      const blue = planTurn(game, 'blue')
      submitOrders(game, 'red', red)
      submitOrders(game, 'blue', commander ? byCommandPost(blue) : blue)
    }
    now[`${field} ${seed}`] = `${fingerprint(JSON.stringify(game.battle.log.all()))} ${game.history.length}`
  }
  return now
}

test('a battle saved before the riders rulings (marked everyoneAsked) plays back exactly as it was played, event for event', () => {
  assert.deepEqual(play({ everyoneAsked: true }, { commander: true }), {
    'crownhill 1': 'be183ca2 18',
    'crownhill 2': '3b976fdc 25',
    'ashford 1': 'd5b50bd6 25',
    'ashford 2': 'e79ea81f 29'
  })
})

test('a battle with no Commander on the field runs exactly as before the riders rulings, event for event', () => {
  assert.deepEqual(play({}, { commander: false }), {
    'crownhill 1': 'a0fe2488 18',
    'crownhill 2': 'e70e50fe 25',
    'ashford 1': '31e8e9f4 26',
    'ashford 2': '6583ef4f 34'
  })
})
