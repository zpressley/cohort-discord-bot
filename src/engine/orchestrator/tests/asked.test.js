// src/engine/orchestrator/tests/asked.test.js
//
// Asked when wanted (ruled 2026-11-23: "No the game keeps going. This is
// true for two human players as well. If one player gives move command for
// a march taking 3 turns don't notify that commander for 3 turns unless the
// units spot the enemy ... both would only be notified when there are
// commands to give or things happen to them").

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, waitingOn } = require('../orchestrator')
const { COMMAND, DAY } = require('../../combat/tables')

const MAP = { name: 'plain-40', width: 40, height: 20, terrain: {} }
const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 2, y: 2 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
// Red's Commander with the guard and a second unit beside it, in the
// north-west corner; blue far off in the south-east.
const spec = (extra = {}) => ({
  name: 'asked', map: MAP, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {},
  units: [unit({ id: 'guard' }), unit({ id: 'second', position: { x: 2, y: 3 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 37, y: 19 } }), unit({ id: 'foe2', side: 'blue', position: { x: 36, y: 19 } })],
  commanders: { red: { unitId: 'guard' } }, ...extra
})
// Twenty-seven tiles east along the north edge: an hour and a half.
const march = [{ unitRef: 'guard', target: { x: 29, y: 2 } }, { unitRef: 'second', target: { x: 29, y: 3 } }]
const blueHolds = [{ unitRef: 'foe', action: 'hold' }, { unitRef: 'foe2', action: 'hold' }]

// Red gives his orders; the battle goes on, the computer asked whenever it
// is wanted, until red is.
function redTurn(game, orders) {
  const from = game.history.length
  submitOrders(game, 'red', orders)
  for (let i = 0; i < 50 && !game.outcome.decided && !waitingOn(game).includes('red'); i++) submitOrders(game, 'blue', blueHolds)
  return game.history.slice(from)
}

test('a Commander whose men are on a long march with no news is not asked again until they have carried out his orders', () => {
  const game = createGame(spec(), { seed: 1 })
  const stretch = redTurn(game, march)
  const ticks = stretch.flatMap(h => h.ticks).length
  assert.ok(ticks > 6, `one long wait for him: ${ticks * 10} minutes, more than the hour a turn used to run`)
  assert.equal(stretch.at(-1).wanted.red, 'ready')
  assert.ok(stretch.slice(0, -1).every(h => !h.wanted.red), 'the battle stopped only for the computer in between')
  assert.ok(stretch.length > 1, 'and the computer was asked on the way')
  assert.equal(game.calls.red, 1, 'he was asked once')
})

test('a Commander on a march is asked as soon as his units spot the enemy', () => {
  const game = createGame(spec(), { seed: 1 })
  // Marching south-east, they come in sight of the enemy on the way.
  const stretch = redTurn(game, [{ unitRef: 'guard', target: { x: 34, y: 15 } }, { unitRef: 'second', target: { x: 34, y: 16 } }])
  assert.equal(stretch.at(-1).wanted.red, 'sighting')
})

// Ruled 2026-11-24: "Holding for several turns would still get interrupts
// from passing enemy troops".
test(`a Commander whose men only hold is not called back by the clock: with no news he waits ${COMMAND.LONGEST * 10} minutes`, () => {
  const game = createGame(spec(), { seed: 1 })
  const stretch = redTurn(game, [{ unitRef: 'guard', action: 'hold' }, { unitRef: 'second', action: 'hold' }])
  assert.equal(stretch.at(-1).wanted.red, 'long')
  assert.equal(stretch.flatMap(h => h.ticks).length, COMMAND.LONGEST)
  assert.ok(stretch.slice(0, -1).every(h => !h.wanted.red), 'the hour did not call him back')
  assert.ok(stretch.slice(0, -1).every(h => h.wanted.blue), 'the computer is still asked on its own stops in between')
})

test('a Commander whose men only hold is called back when passing enemy troops come in sight', () => {
  const game = createGame(spec(), { seed: 1 })
  submitOrders(game, 'red', [{ unitRef: 'guard', action: 'hold' }, { unitRef: 'second', action: 'hold' }])
  // The enemy marches west along the field, past the holding men.
  const pass = [{ unitRef: 'foe', target: { x: 2, y: 7 } }, { unitRef: 'foe2', target: { x: 3, y: 7 } }]
  const from = game.history.length
  for (let i = 0; i < 50 && !game.outcome.decided && !waitingOn(game).includes('red'); i++) submitOrders(game, 'blue', i === 0 ? pass : [])
  const stretch = game.history.slice(from - 1)
  assert.equal(game.history.at(-1).wanted.red, 'sighting')
  assert.ok(stretch.flatMap(h => h.ticks).length < COMMAND.LONGEST, 'before the longest wait')
})

test('two Commanders who both only hold all day are each asked at the longest wait, and night ends the battle', () => {
  const game = createGame(spec({ commanders: { red: { unitId: 'guard' }, blue: { unitId: 'foe' } }, dayMinutes: DAY.MINUTES }), { seed: 1 })
  const holds = { red: [{ unitRef: 'guard', action: 'hold' }, { unitRef: 'second', action: 'hold' }], blue: blueHolds }
  for (let i = 0; i < 20 && !game.outcome.decided; i++) for (const side of waitingOn(game)) submitOrders(game, side, holds[side])
  assert.equal(game.outcome.reason, 'night fell')
  assert.equal(game.minutesElapsed, DAY.MINUTES)
  // Asked at the start, then every six hours: never left waiting longer.
  assert.deepEqual(game.history.map(h => h.ticks.length), [COMMAND.LONGEST, COMMAND.LONGEST])
  assert.deepEqual(game.history.map(h => h.interrupt), ['long', 'night'])
})

// Two Commanders: red on the long march, blue's men a short step.
const two = () => createGame(spec({ commanders: { red: { unitId: 'guard' }, blue: { unitId: 'foe' } } }), { seed: 1 })
const blueStep = [{ unitRef: 'foe', target: { x: 34, y: 19 } }, { unitRef: 'foe2', target: { x: 33, y: 19 } }]

test('between two Commanders the battle stops only for the one wanted: the other is not asked, nor waited for', () => {
  const game = two()
  assert.deepEqual(waitingOn(game).sort(), ['blue', 'red'], 'at the start, both')
  submitOrders(game, 'red', march)
  submitOrders(game, 'blue', blueStep)
  assert.deepEqual(game.history.at(-1).wanted, { blue: 'ready' }, 'blue\'s men were there first')
  assert.deepEqual(waitingOn(game), ['blue'], 'only blue is asked')
  const ran = submitOrders(game, 'blue', blueHolds)
  assert.equal(ran.status, 'processed', 'the battle moves on as soon as blue has given his orders')
  // Blue's men hold, and he waits for news: the battle goes on, asking
  // neither, until red's men arrive.
  assert.deepEqual(game.history.at(-1).wanted, { red: 'ready' })
  assert.equal(game.calls.red, 1, 'red asked once since his first orders, when they were carried out')
})

// Ruled 2026-11-24: "You can interrupt units mid March. But orders don't
// come over till the end of the turn."
test('you can interrupt units mid march, unasked, but the orders do not go out until the end of the turn in play', () => {
  const game = two()
  submitOrders(game, 'red', march)
  submitOrders(game, 'blue', blueStep)
  assert.deepEqual(waitingOn(game), ['blue'])
  // Red changes his mind, unasked: his men halt where they are.
  assert.equal(submitOrders(game, 'red', [{ unitRef: 'guard', action: 'hold' }, { unitRef: 'second', action: 'hold' }]).status, 'waiting')
  assert.equal(game.battle.orderBook.get('guard').action, 'move', 'not until the battle moves on')
  const where = { ...game.battle.world.units.find(u => u.id === 'guard').position }
  submitOrders(game, 'blue', blueHolds)
  assert.equal(game.battle.orderBook.get('guard').action, 'hold', 'the march is broken off')
  // They went out as the next stretch began: not a step further.
  assert.deepEqual(game.battle.world.units.find(u => u.id === 'guard').position, where)
})

test('the day is counted in battle time when the spec says so, and night ends the battle with no winner', () => {
  const game = createGame(spec({ dayMinutes: 60 }), { seed: 1 })
  for (let i = 0; i < 20 && !game.outcome.decided; i++) redTurn(game, [])
  assert.equal(game.outcome.decided, true)
  assert.equal(game.minutesElapsed, 60)
  assert.equal(game.outcome.reason, 'night fell')
  assert.equal(game.outcome.winner, 'draw')
})

test('a battle saved before the rulings (everyoneAsked) asks every side at every stop, and a turn still ends within the hour', () => {
  const game = createGame(spec({ everyoneAsked: true }), { seed: 1 })
  submitOrders(game, 'red', march)
  assert.deepEqual(submitOrders(game, 'blue', blueHolds).status, 'processed')
  assert.equal(game.history.at(-1).ticks.length, 6)
  assert.equal(game.history.at(-1).wanted, undefined)
  assert.deepEqual(waitingOn(game).sort(), ['blue', 'red'])
})

test(`however busy his men, no Commander waits longer than ${COMMAND.LONGEST * 10} minutes to be asked`, () => {
  // His men are on the long march, and he was last asked (by hand, for the
  // test) all but ten minutes of that long ago.
  const game = createGame(spec(), { seed: 1 })
  game.askedAt.red = -(COMMAND.LONGEST - 1)
  const stretch = redTurn(game, march)
  assert.equal(stretch.at(-1).wanted.red, 'long')
  assert.equal(stretch.flatMap(h => h.ticks).length, 1)
})
