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
//
// Retaken when the east army on Crownhill was moved to form up further
// south, at (30, 29), so that both armies are as long marching to the
// Crownhill (docs/DECISIONS.md, "How the first battle, being asked, and
// forming up were built"). Nothing else changed these battles: with the old
// forming-up place they were as before. On crownhill they were 889c9e1e 18 and 27381837 24.
//
// Retaken when armies were made to come to grips (docs/DECISIONS.md, "How
// armies were made to come to grips"): a unit going in across a ford steps
// into it, a side that knows nothing of the enemy looks for him at the
// map's ground and then where he would hold, and an army of horse forms its
// line of horse. The ashford battles now meet at the Old Mill Bridge and are
// over in 13 and 23 turns. The battles were 889c9e1e 18, 27381837 24,
// 9de62f89 150, 6d782516 150.
//
// Retaken when the two were put together (the east army's new place on
// Crownhill, forming up, advance to the ground, and the planner's coming to
// grips, with its step into a crossing moved into the engine for every
// unit). Alone, the planner's change had made them 61e100aa 25, 824d0cc9 27, 15f2219b 13,
// 4fa3b601 23.
//
// Retaken when armies marched in column, a ford took one unit at a time,
// broken units ran round the enemy, skirmishers stood with their backs
// to the edge, and Ashford's east army formed up a tile further back and
// Thornwood's west a tile nearer, and a Commander caught running may be
// taken (docs/DECISIONS.md, "How columns,
// wavering under fire and flight were mended"). The battles were b01c713a 25, 39ecf1e5 26,
// 15f2219b 13, 842dd7c2 23.

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
  'crownhill 1': 'f15578bb 16',
  'crownhill 2': '3749bac6 18',
  'ashford 1': 'ccfaaf84 14',
  'ashford 2': '7e232cf6 17'
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
