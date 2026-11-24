// src/engine/orchestrator/tests/objectives.test.js
//
// Objective control (Stage 3 plan F, for testing): ground worth holding,
// named by grid square, map feature or tile. Holding every objective for an
// hour of battle time wins; when the time limit runs out, more objectives
// held wins before fewer losses.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, objectiveController } = require('../index')
const { objectiveArea } = require('../victory')
const { resolveMap } = require('../../map/map')
const { createWorld } = require('../../world')
const { toLabel } = require('../../map/labels')

const map = resolveMap('crownhill')

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: 'J24',
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}
const gameSpec = (overrides = {}) => ({
  name: 'objectives', seed: 1,
  sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
  units: [], turns: [], ...overrides
})
// Both sides stand still; each player turn is one ten-minute tick.
const playTurns = (game, n) => {
  for (let i = 0; i < n && !game.outcome.decided; i++) {
    submitOrders(game, 'red', [])
    submitOrders(game, 'blue', [])
  }
}

test('an objective can be a tile, a grid square, or a named feature', () => {
  const tile = objectiveArea(map, { id: 'ford', coord: 'W6' })
  assert.equal(tile.single, true)
  assert.equal(toLabel(tile.tiles[0]), 'W6')

  const square = objectiveArea(map, { id: 'field', square: 'C6' })
  assert.equal(square.tiles.length, 16, 'a 100 m square is 4x4 tiles')
  assert.equal(square.name, 'C6')

  const bridge = objectiveArea(map, { id: 'bridge', feature: 'harrow bridge' })
  assert.equal(bridge.name, 'Harrow Bridge')
  assert.ok(bridge.tiles.every(t => map.terrainAt(t) === 'bridge'))

  assert.throws(() => objectiveArea(map, { id: 'x', feature: 'the moon' }), /no feature named/)
  assert.throws(() => objectiveArea(map, { id: 'x' }), /names no ground/)
})

test('an area is held from inside it, and only by one side', () => {
  const field = objectiveArea(map, { id: 'field', square: 'C6' }) // tiles I21-L24
  const holders = (units) => objectiveController(createWorld({ units }), new Set(), field)
  assert.equal(holders([unit({ position: 'J24' })]), 'red')
  assert.equal(holders([unit({ position: 'J25' })]), null, 'beside the square is not in it')
  assert.equal(holders([unit({ position: 'J24' }), unit({ id: 'b', side: 'blue', position: 'K22' })]), null, 'contested')
})

test('holding every objective for an hour of battle time wins', () => {
  const game = createGame(gameSpec({
    units: [unit({ id: 'holder', position: 'J24' }), unit({ id: 'far', side: 'blue', position: 'AA35' })],
    objectives: [{ id: 'field', square: 'C6' }]
  }))
  playTurns(game, 6)
  assert.equal(game.outcome.decided, false, 'fifty minutes is not enough')
  playTurns(game, 1)
  assert.equal(game.outcome.decided, true)
  assert.equal(game.outcome.winner, 'red')
  assert.equal(game.outcome.reason, 'objectives held')
  assert.equal(game.minutesElapsed, 70, 'taken at the first tick, held a full hour after')

  const taken = game.battle.log.ofType('objective').filter(e => !e.close)
  assert.deepEqual(taken.map(e => [e.objectiveId, e.side, e.was]), [['field', 'red', null]])
})

test('half an hour before holding the ground decides the battle, every side is told, and the battle stops for them', () => {
  const game = createGame(gameSpec({
    units: [unit({ id: 'holder', position: 'J24' }), unit({ id: 'far', side: 'blue', position: 'AA35' })],
    objectives: [{ id: 'field', square: 'C6', name: 'the field' }]
  }))
  playTurns(game, 3)
  assert.equal(game.battle.log.ofType('objective').filter(e => e.close).length, 0, 'held twenty minutes: not yet')
  playTurns(game, 1)
  const close = game.battle.log.ofType('objective').filter(e => e.close)
  assert.deepEqual(close.map(e => [e.side, e.name, e.close]), [['red', 'the field', 30]], 'held thirty minutes: thirty to go')
  assert.equal(game.history.at(-1).interrupt, 'objective')
  playTurns(game, 2)
  assert.equal(game.battle.log.ofType('objective').filter(e => e.close).length, 1, 'told once a hold')
})

test('ground given a reach is held from that near it: a crossing from on it or at either end', () => {
  const ford = objectiveArea(map, { id: 'ford', feature: "Miller's Crossing", reach: 1 })
  assert.equal(ford.reach, 1)
  const holders = (units) => objectiveController(createWorld({ units }), new Set(), ford)
  assert.equal(holders([unit({ position: { x: 19, y: 20 } })]), 'red', 'at the west end')
  assert.equal(holders([unit({ position: { x: 18, y: 20 } })]), null, 'a tile short is not at it')
  assert.equal(holders([unit({ position: { x: 19, y: 20 } }), unit({ id: 'b', side: 'blue', position: { x: 22, y: 21 } })]), null, 'one at each end: contested')
  const onIt = objectiveArea(map, { id: 'ford', feature: "Miller's Crossing" })
  assert.equal(objectiveController(createWorld({ units: [unit({ position: { x: 19, y: 20 } })] }), new Set(), onIt), null, 'with no reach, only on it')
})

test('holding one objective of two wins nothing', () => {
  const game = createGame(gameSpec({
    units: [unit({ id: 'holder', position: 'J24' }), unit({ id: 'far', side: 'blue', position: 'AA35' })],
    objectives: [{ id: 'field', square: 'C6' }, { id: 'bridge', feature: 'Harrow Bridge' }]
  }))
  playTurns(game, 12)
  assert.equal(game.outcome.decided, false)
})

test('when time runs out, more objectives held wins before fewer losses', () => {
  const game = createGame(gameSpec({
    units: [unit({ id: 'holder', position: 'J24' }), unit({ id: 'far', side: 'blue', position: 'AA35' })],
    objectives: [{ id: 'field', square: 'C6' }, { id: 'bridge', feature: 'Harrow Bridge' }],
    timeLimitMinutes: 30
  }))
  playTurns(game, 5)
  assert.deepEqual([game.outcome.winner, game.outcome.reason], ['red', 'time ran out: held more objectives'])
})
