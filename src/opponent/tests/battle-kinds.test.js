// src/opponent/tests/battle-kinds.test.js
//
// The computer on a field with several grounds, some of them to hold
// (ruled 2026-11-25: Crownhill's three fords, two to hold): which it goes
// for, how it shares its army out, and each character's way.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { planTurn, CHARACTERS } = require('../planner')
const { createGame } = require('../../engine/orchestrator')
const { loadScenario } = require('../../adapters/hotseat/scenarios')
const { fieldFactions } = require('../../engine/army/factions')
const { kindSpec } = require('../../data/maps')
const { tileDistance } = require('../../engine/world')

const fords = (character = 'steady', faction = 'rome') => {
  const spec = fieldFactions(loadScenario('meeting-battle', { map: 'crownhill', deploy: true, kind: 'ground' }), { red: faction, blue: faction })
  return createGame({ ...spec, standingOrders: {}, ...kindSpec('crownhill', 'ground'), sides: { ...spec.sides, blue: { ...spec.sides.blue, character } } }, { seed: 3 })
}
// Which ford each order is for (within reach of it, or a tile more), by id.
const fordOf = (game, target) => game.objectives.find(o => o.tiles.some(t => tileDistance(target, t) <= (o.reach ?? 0) + 1))?.id ?? null
const parts = (game, orders) => {
  const by = {}
  for (const o of orders.filter(x => x.target)) {
    const f = fordOf(game, o.target)
    by[f] = (by[f] ?? 0) + 1
  }
  return by
}

test('with two of the three fords to hold, the computer goes for two at once, its army shared out between them, each part on ground that holds its ford', () => {
  const game = fords()
  const orders = planTurn(game, 'blue')
  const by = parts(game, orders)
  assert.equal(Object.keys(by).length, 2, JSON.stringify(by))
  assert.ok(!('null' in by), 'every unit is sent to a ford')
  const counts = Object.values(by)
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, 'as evenly as they go')
  for (const o of orders.filter(x => x.target)) assert.ok(!['river', 'marsh'].includes(game.battle.map.terrainAt(o.target)), `${o.unitRef} on dry ground`)
})

test('it keeps the ford it holds, and goes next for one no one holds before one the enemy holds; a bold Commander for the enemy\'s first', () => {
  for (const [character, wanted] of [['steady', 'ground-1'], ['bold', 'ground-3']]) {
    const game = fords(character)
    // Blue holds Miller's Crossing; red holds the South Ford; the North Ford is no one's.
    game.objectiveHolds['ground-2'] = { side: 'blue', turns: 0, sinceMinute: 0 }
    game.objectiveHolds['ground-3'] = { side: 'red', turns: 0, sinceMinute: 0 }
    const by = parts(game, planTurn(game, 'blue'))
    assert.ok(by['ground-2'] > 0, `${character}: keeps what it holds`)
    assert.ok(by[wanted] > 0, `${character}: goes for ${wanted} (${JSON.stringify(by)})`)
  }
})

test('when the enemy holds two of the fords, one of his is always among those it goes for', () => {
  const game = fords()
  game.objectiveHolds['ground-1'] = { side: 'red', turns: 0, sinceMinute: 0 }
  game.objectiveHolds['ground-3'] = { side: 'red', turns: 0, sinceMinute: 0 }
  const by = parts(game, planTurn(game, 'blue'))
  assert.ok((by['ground-1'] ?? 0) + (by['ground-3'] ?? 0) > 0, JSON.stringify(by))
})

test('a cautious Commander takes the fords one at a time with his whole army, and leaves a part at each he holds', () => {
  assert.equal(CHARACTERS.cautious.oneAtATime, true)
  const game = fords('cautious')
  const first = parts(game, planTurn(game, 'blue'))
  assert.equal(Object.keys(first).length, 1, `all to one ford first: ${JSON.stringify(first)}`)
  const held = Object.keys(first)[0]
  game.objectiveHolds[held] = { side: 'blue', turns: 0, sinceMinute: 0 }
  const then = parts(game, planTurn(game, 'blue'))
  assert.equal(then[held], 1, 'one unit stays')
  assert.equal(Object.keys(then).length, 2, `the rest go on: ${JSON.stringify(then)}`)
})

test('on a field with one ground to fight for the computer plays as before: no army shared out', () => {
  const spec = fieldFactions(loadScenario('meeting-battle', { map: 'thornwood', deploy: true }), { red: 'rome', blue: 'rome' })
  const game = createGame({ ...spec, standingOrders: {}, ...kindSpec('thornwood', 'ground') }, { seed: 3 })
  const by = parts(game, planTurn(game, 'blue'))
  assert.ok(Object.keys(by).length <= 1, JSON.stringify(by))
})
