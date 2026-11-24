// src/engine/orchestrator/tests/first-battle.test.js
//
// The first battle, and being asked (the playthrough of November 24, D1 and
// D2; docs/DECISIONS.md, "How the first battle, being asked, and forming up
// were built"):
//   - told to advance with no enemy known, an army makes for the ground to
//     fight for, where the battle has some; with none it goes looking, as
//     before;
//   - light shooting by an enemy he knows of calls a free Commander back
//     once, then not again for an hour unless it grows.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, waitingOn } = require('../orchestrator')
const { FIRE_NEWS } = require('../../combat/tables')

const MAP = { name: 'plain-40', width: 40, height: 20, terrain: {} }
const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 2, y: 2 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})

// ── Advance, with nothing known ──────────────────────

// Red in the west, blue far in the south-east, out of sight; the ground to
// fight for in the north-middle.
const GROUND = [{ id: 'ground-1', name: 'the knoll', tiles: [{ x: 19, y: 1 }, { x: 20, y: 1 }, { x: 19, y: 2 }, { x: 20, y: 2 }] }]
const field = (extra = {}) => ({
  name: 'first', map: MAP, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {},
  units: [unit({ id: 'one', position: { x: 2, y: 8 } }), unit({ id: 'two', position: { x: 2, y: 10 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 38, y: 19 } })],
  ...extra
})
function run(game, ticks, red) {
  for (let i = 0; i < ticks && !game.outcome.decided; i++) {
    for (const side of waitingOn(game)) submitOrders(game, side, side === 'red' && i === 0 ? red : side === 'blue' ? [{ unitRef: 'foe', action: 'hold' }] : [])
  }
}

test('told to advance with no enemy known, an army makes for the ground to fight for, each man to a tile of his own', () => {
  const game = createGame(field({ objectives: GROUND }), { seed: 1 })
  run(game, 12, [{ unitRef: 'everyone', action: 'advance' }])
  const at = ['one', 'two'].map(id => game.battle.world.units.find(u => u.id === id).position)
  for (const p of at) assert.ok(GROUND[0].tiles.some(t => t.x === p.x && t.y === p.y), `on the ground: ${JSON.stringify(p)}`)
  assert.notDeepEqual(at[0], at[1], 'not on one spot')
})

test('told to advance with no ground to fight for and no enemy known, an army goes looking toward the enemy\'s side, as before', () => {
  const game = createGame(field(), { seed: 1 })
  const before = game.battle.world.units.find(u => u.id === 'one').position.x
  run(game, 3, [{ unitRef: 'everyone', action: 'advance' }])
  const after = game.battle.world.units.find(u => u.id === 'one').position
  assert.ok(after.x > before + 3, 'east, toward their side')
})

test('an army that knows where the enemy is advances on him, not on the ground', () => {
  // Blue in sight from the start, south of red; the ground far north.
  const game = createGame(field({ objectives: GROUND, units: [unit({ id: 'one', position: { x: 10, y: 12 } }), unit({ id: 'foe', side: 'blue', position: { x: 11, y: 16 } })] }), { seed: 1 })
  run(game, 1, [{ unitRef: 'one', action: 'advance' }])
  assert.ok(game.battle.world.units.find(u => u.id === 'one').position.y > 12, 'south, toward the enemy')
})

// ── Light shooting ──────────────────────────────────

// Red's Commander with the guard, both his units holding in heavy armour;
// blue's slingers standing within a sling's throw.
const shot = () => createGame({
  name: 'shot', map: MAP, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {},
  units: [unit({ id: 'guard', position: { x: 10, y: 8 }, armor: 'heavy_armor', shield: 'heavy_shield' }),
    unit({ id: 'second', position: { x: 10, y: 9 }, armor: 'heavy_armor', shield: 'heavy_shield' }),
    unit({ id: 'slingers', side: 'blue', position: { x: 16, y: 8 }, primaryWeapon: 'sling', armor: 'no_armor', shield: 'no_shield', quality: 'levy' })],
  commanders: { red: { unitId: 'guard' } }
}, { seed: 3 })
const redHolds = [{ unitRef: 'guard', action: 'hold' }, { unitRef: 'second', action: 'hold' }]
const blueHolds = [{ unitRef: 'slingers', action: 'hold' }]

// Red holds each time he is asked; the battle goes on until it has run as
// long as given. The stops that asked red, and why.
function hold(game, ticks) {
  const asked = []
  let minutes = 0
  for (let i = 0; i < 200 && !game.outcome.decided && game.minutesElapsed < ticks * 10; i++) {
    for (const side of waitingOn(game)) submitOrders(game, side, side === 'red' ? redHolds : blueHolds)
    const h = game.history.at(-1)
    minutes += h.ticks.length * 10
    if (h.wanted?.red) asked.push({ at: minutes, why: h.wanted.red })
  }
  return asked
}

test(`light shooting by an enemy he knows of calls a free Commander back once, then not again for ${FIRE_NEWS.QUIET * 10} minutes unless it grows`, () => {
  const game = createGame({ ...shot().spec }, { seed: 3 })
  const asked = hold(game, 18)
  const volleys = game.battle.log.ofType('volley').filter(v => v.unitId === 'guard' || v.unitId === 'second')
  assert.ok(volleys.length >= 10, 'shot at most of the time')
  assert.ok(volleys.every(v => v.killed < FIRE_NEWS.HEAVY * 100), 'and lightly')
  const forFire = asked.filter(a => a.why === 'fire')
  assert.ok(forFire.length >= 1, 'told of it')
  for (let i = 1; i < forFire.length; i++) assert.ok(forFire[i].at - forFire[i - 1].at >= FIRE_NEWS.QUIET * 10, `not again within the hour: ${JSON.stringify(forFire)}`)
  assert.ok(asked.length <= 4, `asked ${asked.length} times in three hours, not every ten minutes`)
})

test('shooting that costs a unit of his a heavy share of its men calls him back at once', () => {
  const game = shot()
  hold(game, 1)
  // From now on every volley at his men is heavy.
  const was = FIRE_NEWS.HEAVY
  FIRE_NEWS.HEAVY = 0
  try {
    const asked = hold(game, 4)
    assert.ok(asked.filter(a => a.why === 'fire').length >= 2, `asked for each: ${JSON.stringify(asked)}`)
  } finally { FIRE_NEWS.HEAVY = was }
})
