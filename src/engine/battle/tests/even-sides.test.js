// src/engine/battle/tests/even-sides.test.js
//
// Neither side has a role, and both act at once: so no side is ahead for
// its name. Found by the camps work (November 25): on Greywater with the
// same armies, the west won about 4 points more when called "red" than
// when called "blue", for ties of who steps first and which fight is taken
// first were settled by name ("blue_" sorts before "red_"). They are
// settled now by a seeded draw of their own (rng.js, tieBreak).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, waitingOn } = require('../../orchestrator')
const { factionUnits } = require('../../army/factions')
const { inInitiativeOrder } = require('../../movement/initiative')
const { tieBreak } = require('../../rng')

const PLAIN = { name: 'plain-31', width: 31, height: 21, terrain: {} }

// The same army on each side of an empty field, the same distance from the
// middle, both told to press the enemy; `west` names the side in the west.
function mirrored(seed, west, faction = 'rome') {
  const east = west === 'red' ? 'blue' : 'red'
  const army = (side, edge) => factionUnits(faction, side, edge).map((u, k) => ({ ...u, position: { x: edge === 'west' ? 5 : 25, y: 7 + k * 2 } }))
  const game = createGame({
    name: 'mirror', map: PLAIN, seed, turns: [],
    units: [...army(west, 'west'), ...army(east, 'east')],
    sides: { [west]: { homeEdge: 'west' }, [east]: { homeEdge: 'east' } },
    standingOrders: { [west]: 'advance', [east]: 'advance' },
    turnLimit: 60
  }, { seed })
  for (let stops = 0; stops < 300 && !game.outcome.decided; stops++) {
    for (const side of [west, east]) if (!game.outcome.decided && waitingOn(game).includes(side)) submitOrders(game, side, [])
  }
  return game.outcome.winner === west ? 1 : game.outcome.winner === east ? 0 : 0.5
}

test('mirrored armies on a mirrored field win about evenly, and the same with the names swapped', () => {
  for (const faction of ['rome', 'macedon']) {
    for (const west of ['red', 'blue']) {
      let share = 0
      for (let seed = 1; seed <= 200; seed++) share += mirrored(seed, west, faction)
      share /= 200
      // (Measured: 52% and 49% for Rome, 47% and 49% for Macedon, over 800
      // battles each. Within 10 points here: 200 battles.)
      assert.ok(share >= 0.4 && share <= 0.6, `${faction}, the west called ${west}: ${Math.round(share * 100)}%`)
    }
  }
})

test('who steps first within a speed tier is a seeded draw each turn, not the units\' names: each side leads about half the turns', () => {
  const units = [{ id: 'red_spears', armor: 'medium_armor' }, { id: 'blue_spears', armor: 'medium_armor' }]
  let redFirst = 0
  for (let turn = 1; turn <= 400; turn++) {
    if (inInitiativeOrder(units, (u) => tieBreak(7, turn, u.id))[0].id === 'red_spears') redFirst++
  }
  assert.ok(redFirst > 160 && redFirst < 240, `red first in ${redFirst} of 400`)
  // With no draw given (the duel harness and the balance matrix), by name, as before.
  assert.equal(inInitiativeOrder(units)[0].id, 'blue_spears')
})
