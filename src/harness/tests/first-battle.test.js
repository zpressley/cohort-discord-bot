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
const { groundOf, MAPS } = require('../../data/maps')

// Minutes until the first of a side's units, marching alone, sets foot on
// (or within reach of) a piece of the map's ground to fight for.
function firstOn(map, side, faction, ground = groundOf(map)[0]) {
  const all = fieldFactions(loadScenario('meeting-battle', { map, deploy: true, kind: 'ground' }), { red: faction, blue: faction })
  const spec = { ...all, standingOrders: {}, units: all.units.filter(u => u.side === side) }
  const state = createBattleState(spec, { seed: 1 })
  const area = objectiveArea(state.map, ground)
  // Every unit sent to the tile of the ground nearest its middle.
  const tiles = area.tiles.filter(t => state.map.passable(t))
  const mid = tiles.reduce((a, t) => ({ x: a.x + t.x / tiles.length, y: a.y + t.y / tiles.length }), { x: 0, y: 0 })
  const centre = [...tiles].sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y))[0]
  const reach = area.reach ?? 0
  for (let t = 1; t <= 40; t++) {
    stepTurn(state, t === 1 ? { [side]: spec.units.map(u => ({ unitRef: u.id, action: 'move', target: centre })) } : {})
    if (state.world.units.some(u => area.tiles.some(a => Math.abs(a.x - u.position.x) + Math.abs(a.y - u.position.y) <= reach))) return t * 10
  }
  return Infinity
}

// With several pieces of ground and some of them to hold (Crownhill's two
// of three fords, ruled 2026-11-25): as long marching to as many as must
// be held, each side's nearest (the first to the nearest, and the first
// to the second nearest: measured, west 18 and 37 minutes, east 10 and 44,
// from where they form up for it since (Crownhill's deployFor); with the
// east army where it forms up for a pitched battle, its second took 60).
test('on every 1 km field the two armies are as long marching to the ground to fight for: on average over every faction, within ten minutes of each other', () => {
  const factions = Object.keys(FACTIONS)
  for (const map of ['crownhill', 'ashford', 'thornwood', 'ravenridge']) {
    const needed = MAPS[map].hold?.needed ?? 1
    const times = (side) => groundOf(map).map(g => factions.reduce((n, f) => n + firstOn(map, side, f, g), 0) / factions.length).sort((a, b) => a - b)
    const west = times('red')
    const east = times('blue')
    for (let i = 0; i < needed; i++) assert.ok(Math.abs(west[i] - east[i]) <= 10, `${map}, ground ${i + 1} of ${needed}: west ${west[i]} min, east ${east[i]} min`)
  }
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

// (Found by the soak once the two changes of November 24 were put together.)
test('a broken enemy left in sight does not begin a search afresh every ten minutes: the searchers find the army still standing', () => {
  const { createGame, submitOrders } = require('../../engine/orchestrator')
  const { planTurn } = require('../../opponent/planner')
  const { leadUnit } = require('../../engine/command/company')
  const { byCommandPost } = require('../../engine/command/messengers')
  const spec = fieldFactions(loadScenario('meeting-battle', { map: 'ashford', deploy: true }), { red: 'sarmatia', blue: 'germania' })
  const mine = spec.units.filter(u => u.side === 'red')
  const game = createGame({ ...spec, standingOrders: {}, commanders: { red: { unitId: mine[leadUnit(mine)].id } } }, { seed: 27 })
  for (let turns = 0; turns < 150 && !game.outcome.decided; turns++) {
    const red = game.playerTurn === 0 ? [{ unitRef: 'everyone', action: 'advance' }] : []
    const blue = byCommandPost(planTurn(game, 'blue'))
    submitOrders(game, 'red', red)
    submitOrders(game, 'blue', blue)
  }
  assert.ok(game.outcome.decided, 'the battle ends')
})
