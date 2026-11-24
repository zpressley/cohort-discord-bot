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
// broken units ran round the enemy and skirmishers stood with their backs
// to the edge (docs/DECISIONS.md, "How columns, wavering under fire and
// flight were mended"). They were 1d9ca512 26, 9d62f154 15, 3d0c58e3 12.

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
  'thornwood macedon parthia 3': 'e8d535c9 27',
  'ravenridge thrace sarmatia 4': '150f188e 16',
  'greywater rome germania 5': 'bfaa5b8d 20'
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
