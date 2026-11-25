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
//
// Retaken for each people's perks (docs/design/army-balance.md part 9):
// Rome's men a little steadier, Han's bought units a fifth larger. The
// battles were be183ca2 18, 3b976fdc 25, d5b50bd6 25, e79ea81f 29
// (everyone asked) and a0fe2488 18, e70e50fe 25, 31e8e9f4 26, 6583ef4f 34
// (no Commander). On ashford with no Commander both now run to the 150-turn
// guard: the two armies march up and down either side of the ford and
// never cross. That is not the perks' doing (the same happens without
// them, Mongolia against Tibet on ashford, seed 77); in the app the day
// ends such a battle.
//
// Retaken when the east army on Crownhill was moved to form up further
// south, at (30, 29), so that both armies are as long marching to the
// Crownhill (docs/DECISIONS.md, "How the first battle, being asked, and
// forming up were built"). Nothing else changed these battles: with the old
// forming-up place they were as before. On crownhill they were ae680b96
// 18, 6261aa5e 26 (everyone asked) and 889c9e1e 18, 27381837 24 (no
// Commander).
//
// Retaken when armies were made to come to grips (docs/DECISIONS.md, "How
// armies were made to come to grips"): a unit going in across a ford steps
// into it, a side that knows nothing of the enemy looks for him at the
// map's ground and then where he would hold, and an army of horse forms its
// line of horse. With no Commander the ashford battles now meet at the Old
// Mill Bridge and are over in 13 and 23 turns. The battles were ae680b96
// 18, 6261aa5e 26, c401099d 33, 556641ef 31 (everyone asked) and 889c9e1e
// 18, 27381837 24, 9de62f89 150, 6d782516 150 (no Commander).
//
// Retaken when the two were put together (the east army's new place on
// Crownhill, forming up, advance to the ground, and the planner's coming to
// grips, with its step into a crossing moved into the engine for every
// unit). Alone, the planner's change had made them 1ec586ea 25,
// 2570d8ea 26, b73254c7 12, 7ea53132 23 (everyone asked) and 61e100aa 25,
// 824d0cc9 27, 15f2219b 13, 4fa3b601 23 (no Commander).
//
// Retaken when armies marched in column, a ford took one unit at a time,
// broken units ran round the enemy, skirmishers stood with their backs
// to the edge, and Ashford's east army formed up a tile further back and
// Thornwood's west two tiles nearer (docs/DECISIONS.md, "How columns,
// wavering under fire and flight were mended"). The battles were 48be1b7d 26, 630cf9be 32,
// b73254c7 12, c80e8547 23 (everyone asked) and b01c713a 25, 39ecf1e5 26,
// 15f2219b 13, 842dd7c2 23 (no Commander).

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
    'crownhill 1': '215377e2 16',
    'crownhill 2': '32628ef1 18',
    'ashford 1': '3bdcf14e 13',
    'ashford 2': '25a80714 16'
  })
})

test('a battle with no Commander on the field runs exactly as before the riders rulings, event for event', () => {
  assert.deepEqual(play({}, { commander: false }), {
    'crownhill 1': 'f15578bb 16',
    'crownhill 2': '3749bac6 18',
    'ashford 1': 'ccfaaf84 14',
    'ashford 2': '7e232cf6 17'
  })
})
