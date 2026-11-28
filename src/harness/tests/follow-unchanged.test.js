// src/harness/tests/follow-unchanged.test.js
//
// A battle in which no unit is told to keep by another (the follow order;
// docs/DECISIONS.md, "How kinds of unit in orders and the follow order were
// built") runs exactly as before that order existed. The fingerprints are
// of whole event logs, taken from the code just before the order was added
// (main at 832d94e): the computer against itself, faction against faction,
// on three fields.
//
// Retaken when armies marched in column, a ford took one unit at a time,
// broken units ran round the enemy, skirmishers stood with their backs
// to the edge, Ashford's east army formed up a tile further back,
// Crownhill's five tiles north, Elderby's bridge was made four abreast,
// Thornwood's west a tile nearer, and a Commander caught running may be
// taken (docs/DECISIONS.md, "How columns,
// wavering under fire and flight were mended"). They were 1d9ca512 26, 9d62f154 15, 3d0c58e3 12.
//
// Retaken when ties of who steps first, which fight is taken first and
// which volley lands first were made a seeded draw of their own instead of
// the units' names, so that a side called "red" is no longer ahead of one
// called "blue" (docs/DECISIONS.md, "How the kinds of battle were built",
// round two). They were 7675a063 11 (greywater rome germania 5), 150f188e
// 16 (ravenridge thrace sarmatia 4), 3c83cec6 25 (thornwood macedon
// parthia 3).
//
// Retaken when units of one side were let share a tile and pass through
// one another again, the marching in column withdrawn (ruled November 28;
// docs/DECISIONS.md, "How sharing a tile and passing through were
// restored"). They were 24ae0710 16 (greywater rome germania 5), dcef9521 44 (ravenridge thrace sarmatia 4), 192f4dc9 32 (thornwood macedon parthia 3).

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

const BATTLES = [
  ['thornwood', 'macedon', 'parthia', 3],
  ['ravenridge', 'thrace', 'sarmatia', 4],
  ['greywater', 'rome', 'germania', 5]
]

const BEFORE = {
  'thornwood macedon parthia 3': '118333b6 24',
  'ravenridge thrace sarmatia 4': '535e7ced 15',
  'greywater rome germania 5': '7f743ff6 12'
}

function fight([field, red, blue, seed]) {
  const spec = fieldFactions(loadScenario('meeting-battle', { map: field, deploy: true }), { red, blue })
  const game = createGame({ ...spec, standingOrders: {} }, { seed })
  for (let t = 0; t < 150 && !game.outcome.decided; t++) {
    submitOrders(game, 'red', planTurn(game, 'red'))
    submitOrders(game, 'blue', planTurn(game, 'blue'))
  }
  return game
}

test('a battle in which no unit is told to keep by another runs exactly as before, event for event', () => {
  const now = {}
  for (const battle of BATTLES) {
    const game = fight(battle)
    assert.ok(game.battle.log.all().every(e => e.type !== 'followLost'))
    now[battle.join(' ')] = `${fingerprint(JSON.stringify(game.battle.log.all()))} ${game.battle.turn}`
  }
  if (process.env.PRINT_FINGERPRINTS) console.log(JSON.stringify(now, null, 2))
  assert.deepEqual(now, BEFORE)
})
