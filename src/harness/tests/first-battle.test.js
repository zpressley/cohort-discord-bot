// src/harness/tests/first-battle.test.js
//
// A new player's first battle on Crownhill, the field the muster offers
// first (the playthrough of November 24, D1; docs/DECISIONS.md, "How the
// first battle, being asked, and forming up were built").

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { play } = require('../first-battle')
const { createBattleState, stepTurn } = require('../../engine/battle/battle')
const { objectiveArea } = require('../../engine/orchestrator/victory')
const { loadScenario } = require('../../adapters/hotseat/scenarios')
const { fieldFactions, FACTIONS } = require('../../engine/army/factions')
const { groundOf } = require('../../data/maps')

// Minutes until the first of a side's units, marching alone, sets foot on
// the map's ground to fight for.
function firstOn(map, side, faction) {
  const all = fieldFactions(loadScenario('meeting-battle', { map, deploy: true }), { red: faction, blue: faction })
  const spec = { ...all, standingOrders: {}, units: all.units.filter(u => u.side === side) }
  const state = createBattleState(spec, { seed: 1 })
  const area = objectiveArea(state.map, groundOf(map)[0])
  const centre = { x: 19, y: 1 }
  for (let t = 1; t <= 40; t++) {
    stepTurn(state, t === 1 ? { [side]: spec.units.map(u => ({ unitRef: u.id, action: 'move', target: centre })) } : {})
    if (state.world.units.some(u => area.tiles.some(a => a.x === u.position.x && a.y === u.position.y))) return t * 10
  }
  return Infinity
}

test('on Crownhill the two armies are as long marching to the Crownhill: on average over every faction, within ten minutes of each other', () => {
  const factions = Object.keys(FACTIONS)
  const mean = (side) => factions.reduce((n, f) => n + firstOn('crownhill', side, f), 0) / factions.length
  const west = mean('red')
  const east = mean('blue')
  assert.ok(Math.abs(west - east) <= 10, `west ${west} min, east ${east} min`)
})

test('a new player who orders "everyone advance" on Crownhill and nothing more gets a real battle: blows struck, and some won', async () => {
  const battles = []
  for (let i = 0; i < 8; i++) battles.push(await play({ map: 'crownhill', faction: ['rome', 'sparta', 'carthage', 'persia'][i % 4], seed: 101 + i * 977, how: 'advance' }))
  assert.ok(battles.every(b => b.decided), 'every one ends')
  assert.ok(battles.every(b => b.blows), 'blows struck in every one')
  assert.ok(battles.some(b => b.winner === 'red'), 'he wins some')
})

test('a new player is never lost by the ground on Crownhill without being asked while the enemy held it', async () => {
  for (const how of ['advance', 'take']) {
    for (let i = 0; i < 6; i++) {
      const b = await play({ map: 'crownhill', faction: 'rome', seed: 7 + i * 131, how })
      if (b.reason === 'objectives held' && b.winner === 'blue') assert.ok(b.askedWhileHeld, `${how}, seed ${7 + i * 131}`)
    }
  }
})
