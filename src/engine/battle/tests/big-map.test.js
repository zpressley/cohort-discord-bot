// src/engine/battle/tests/big-map.test.js
//
// The engine is not tied to Crownhill's 40x40. A 2 km battlefield (80x80 at
// 25 m tiles) is generated here, not designed: open ground, a river down the
// middle with one ford, and a hill on the east bank. Two armies start 60
// tiles apart and fight it out through the full game loop. No authored map
// is involved, so anything that still assumed 40 would show up as a unit
// stuck at column 39, a flight that stops short of the edge, or a crash.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createMap } = require('../../map/map')
const { toLabel } = require('../../map/labels')
const { runBattle } = require('../battle')
const { createGame, submitOrders, gameRecord, replayGame } = require('../../orchestrator')

const SIZE = 80
const RIVER_X = 40
const FORD_Y = 40

function openMap() {
  const river = []
  for (let y = 0; y < SIZE; y++) {
    if (y !== FORD_Y) river.push(toLabel({ x: RIVER_X, y }))
  }
  const hill = []
  for (let y = 36; y <= 44; y++) {
    for (let x = 50; x <= 54; x++) hill.push(toLabel({ x, y }))
  }
  return {
    name: 'generated-80',
    width: SIZE,
    height: SIZE,
    cells: {
      [toLabel({ x: RIVER_X, y: FORD_Y })]: {
        terrain: 'ford', landmark: 'The Long Ford', aliases: ['the ford'], tags: ['ford']
      }
    },
    terrain: { river, hill }
  }
}

function soldier(id, side, x, y, extra = {}) {
  return {
    id, side, position: { x, y },
    strength: 100, maxStrength: 100, movementRange: 4,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...extra
  }
}

function spec(overrides = {}) {
  return {
    name: 'two kilometres',
    map: openMap(),
    standingOrders: { red: 'advance', blue: 'advance' },
    sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
    units: [
      soldier('red_1', 'red', 8, 38), soldier('red_2', 'red', 8, 40), soldier('red_3', 'red', 8, 42),
      soldier('red_levy', 'red', 6, 40, { quality: 'levy', armor: 'light_armor' }),
      soldier('blue_1', 'blue', 70, 38), soldier('blue_2', 'blue', 70, 40), soldier('blue_3', 'blue', 70, 42),
      soldier('blue_levy', 'blue', 73, 40, { quality: 'levy', armor: 'light_armor' })
    ],
    maxTurns: 80,
    ...overrides
  }
}

test('the generated map is 80x80 and knows its own ground', () => {
  const map = createMap(openMap())
  assert.equal(map.width, 80)
  assert.equal(map.height, 80)
  assert.equal(map.terrainAt({ x: RIVER_X, y: 10 }), 'river')
  assert.equal(map.terrainAt({ x: RIVER_X, y: FORD_Y }), 'ford')
  assert.equal(map.terrainAt({ x: 79, y: 79 }), 'plains')
  assert.ok(!map.inBounds({ x: 80, y: 0 }))
})

test('a full battle runs on a 2 km map: both armies cross the old 40-column limit', () => {
  const result = runBattle(spec(), { seed: 7 })

  assert.ok(result.outcome.decided, `the battle must reach a verdict: ${result.outcome.reason}`)

  const moves = result.events.filter(e => e.type === 'move')
  assert.ok(moves.some(e => e.unitId.startsWith('red') && e.to.x > RIVER_X),
    'red must get across the river, past column 40')
  assert.ok(moves.some(e => e.to.x >= 60), 'units move in the far east of the map')

  // Nothing ever stood on the river or off the map. The river fills its
  // whole column except the ford, so every crossing went through the ford.
  const map = createMap(openMap())
  for (const move of moves) {
    assert.ok(map.inBounds(move.to), `${move.unitId} left the map`)
    assert.notEqual(map.terrainAt(move.to), 'river', `${move.unitId} stood in the river`)
  }
})

test('a broken unit on a 2 km map flees all the way to its own edge', () => {
  // A doomed blue levy right next to a red elite, close to blue's east edge.
  // It must break, run east and leave the field at x = 79, not at 39.
  const result = runBattle(spec({
    standingOrders: { red: 'advance' },
    units: [
      soldier('red_elite', 'red', 72, 20, { quality: 'elite', primaryWeapon: 'great_axe' }),
      soldier('red_anchor', 'red', 10, 70),
      soldier('blue_levy', 'blue', 73, 20, {
        quality: 'levy', armor: 'no_armor', shield: 'no_shield', primaryWeapon: 'daggers'
      }),
      soldier('blue_anchor', 'blue', 60, 75)
    ],
    maxTurns: 30
  }), { seed: 3 })

  const rout = result.events.find(e => e.type === 'rout' && e.unitId === 'blue_levy')
  assert.ok(rout, 'the levy must break')
  const fled = result.fled.find(u => u.id === 'blue_levy')
  assert.ok(fled, 'with this seed the levy outruns the elite and escapes')
  assert.equal(fled.position.x, 79, 'it left over the east edge of the 80-wide map')
})

test('a game on the 2 km map replays byte for byte', () => {
  const game = createGame(spec(), { seed: 11 })
  for (let i = 0; i < 40 && !game.outcome.decided; i++) {
    submitOrders(game, 'red', i === 0 ? [{ unitRef: 'everyone', target: { x: 39, y: FORD_Y } }] : [])
    submitOrders(game, 'blue', [])
  }
  const replayed = replayGame(JSON.parse(JSON.stringify(gameRecord(game))))
  assert.equal(JSON.stringify(replayed.battle.log.all()), JSON.stringify(game.battle.log.all()))
})
