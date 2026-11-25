// src/engine/orchestrator/tests/battle-kinds.test.js
//
// The kinds of battle (ruled 2026-11-25): the pitched battle, won as any
// battle is or, at nightfall, by the army still standing with half the men
// it began the day with; and the battle for ground, now with several
// grounds and some of them to hold ("controlling 2 fords wins the game").

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders } = require('../index')
const { evaluateVictory } = require('../victory')
const { createWorld } = require('../../world')
const T = require('../../combat/tables')

const PLAIN = { name: 'plain-30', width: 30, height: 30, terrain: {} }
function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 2 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}
const spec = (overrides = {}) => ({
  name: 'kinds', map: PLAIN, seed: 1, turns: [],
  sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
  units: [], ...overrides
})
// Both sides stand still; each player turn is one stretch of the battle.
const playTurns = (game, n) => {
  for (let i = 0; i < n && !game.outcome.decided; i++) {
    submitOrders(game, 'red', [])
    submitOrders(game, 'blue', [])
  }
}
// A world with each side's men as given, for the end of the day.
const atNightfall = (red, blue, kind) => evaluateVictory({
  world: createWorld({ units: [unit({ id: 'r', strength: red }), unit({ id: 'b', side: 'blue', position: { x: 20, y: 20 }, strength: blue })] }),
  broken: new Set(),
  startingStrength: { red: 100, blue: 100 },
  allSides: ['red', 'blue'],
  dayOver: true,
  minutesElapsed: 720,
  ...(kind ? { kind } : {})
})

test('the nightfall share of a pitched battle is a half, set in the tables', () => {
  assert.equal(T.PITCHED.STAND_SHARE, 0.5)
})

test('in a pitched battle the army still standing at nightfall with half the men it began the day with, when the other\'s is not, has held the field and won', () => {
  assert.deepEqual(atNightfall(60, 40, 'pitched'), { decided: true, winner: 'red', reason: 'field held at nightfall' })
  assert.deepEqual(atNightfall(45, 50, 'pitched'), { decided: true, winner: 'blue', reason: 'field held at nightfall' })
})

test('in a pitched battle both armies standing at nightfall with half their men or more is a tie, and so is neither', () => {
  for (const [red, blue] of [[90, 95], [50, 50], [30, 25]]) {
    const o = atNightfall(red, blue, 'pitched')
    assert.equal(o.winner, 'draw', `${red} and ${blue}`)
    assert.equal(o.reason, 'night fell', 'a tie, after which either side may call the next day')
  }
})

test('a battle of no kind, or a battle for ground, ends at nightfall with no winner whatever the men left, as before', () => {
  for (const kind of [null, 'ground']) {
    const o = atNightfall(60, 25, kind)
    assert.equal(o.winner, 'draw')
    assert.equal(o.reason, 'night fell')
  }
})

test('the men in a broken unit do not stand at nightfall', () => {
  const world = createWorld({ units: [unit({ id: 'r' }), unit({ id: 'r2', strength: 50 }), unit({ id: 'b', side: 'blue', position: { x: 20, y: 20 } })] })
  const o = evaluateVictory({ world, broken: new Set(['r']), startingStrength: { red: 150, blue: 100 }, allSides: ['red', 'blue'], dayOver: true, kind: 'pitched', isShaken: () => false })
  assert.deepEqual(o, { decided: true, winner: 'blue', reason: 'field held at nightfall' })
})

test('in a pitched battle surrendering the field is a loss: a side that yields has lost, and so has one whose every unit has left the field', () => {
  const both = createWorld({ units: [unit({ id: 'r' }), unit({ id: 'b', side: 'blue', position: { x: 20, y: 20 } })] })
  const yielded = evaluateVictory({ world: both, broken: new Set(), surrendered: 'red', startingStrength: { red: 100, blue: 100 }, kind: 'pitched' })
  assert.deepEqual([yielded.winner, yielded.reason], ['blue', 'enemy surrendered'])
  // Every red unit gone from the field (fled off its edge): only blue is left.
  const gone = createWorld({ units: [unit({ id: 'b', side: 'blue', position: { x: 20, y: 20 } })] })
  const left = evaluateVictory({ world: gone, broken: new Set(), startingStrength: { red: 100, blue: 100 }, allSides: ['red', 'blue'], kind: 'pitched' })
  assert.deepEqual([left.decided, left.winner], [true, 'blue'])
})

test('a pitched battle in the app ends at nightfall as ruled: the day\'s end with both armies whole is a tie, and the nightfall line is told', () => {
  const game = createGame(spec({
    kind: 'pitched', dayMinutes: 60,
    units: [unit({ id: 'red_a', position: { x: 2, y: 2 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 27, y: 27 } })]
  }), { seed: 1 })
  playTurns(game, 20)
  assert.deepEqual([game.outcome.winner, game.outcome.reason], ['draw', 'night fell'])
  assert.ok(game.battle.log.ofType('nightfall').length === 1)
})

// Three grounds, two to hold.
const THREE = [
  { id: 'a', name: 'the North Ford', coord: { x: 10, y: 3 } },
  { id: 'b', name: 'Miller\'s Crossing', coord: { x: 10, y: 15 } },
  { id: 'c', name: 'the South Ford', coord: { x: 10, y: 27 } }
]
const fords = (red, blue, overrides = {}) => createGame(spec({
  kind: 'ground', objectives: THREE, objectivesNeeded: 2, groundCalled: 'fords', dayMinutes: 720,
  units: [
    ...red.map((p, i) => unit({ id: `red_${i}`, position: p })),
    ...blue.map((p, i) => unit({ id: `blue_${i}`, side: 'blue', position: p }))
  ],
  ...overrides
}), { seed: 1 })

test('with several grounds and two of them to hold, a side holding two, each alone, for an hour of battle has taken the field', () => {
  const game = fords([{ x: 10, y: 3 }, { x: 10, y: 15 }], [{ x: 25, y: 27 }])
  playTurns(game, 30)
  assert.deepEqual([game.outcome.winner, game.outcome.reason], ['red', 'objectives held'])
  assert.ok(game.minutesElapsed >= 60 && game.minutesElapsed <= 70, `${game.minutesElapsed} minutes`)
})

test('holding one of three when two must be held wins nothing, however long it is held', () => {
  const game = fords([{ x: 10, y: 3 }], [{ x: 10, y: 27 }], { dayMinutes: 240 })
  playTurns(game, 60)
  assert.equal(game.outcome.reason, 'night fell')
})

test('the hour runs while a side holds two, whichever two, and starts again when it holds fewer', () => {
  // Red holds two; at 40 minutes blue takes one of them back by standing
  // on it, and red has one: the hour stops. Then red holds two again.
  const game = fords([{ x: 10, y: 3 }, { x: 10, y: 15 }], [{ x: 25, y: 27 }])
  playTurns(game, 4)
  assert.equal(game.fieldHold?.side, 'red')
  const since = game.fieldHold.sinceMinute
  // Blue onto Miller's Crossing beside red: it is no one's alone.
  game.battle.world.units.find(u => u.id === 'blue_0').position = { x: 11, y: 15 }
  playTurns(game, 1)
  assert.equal(game.fieldHold, undefined, 'red holds only one now')
  // Red takes the South Ford too: two again, and the hour starts afresh.
  game.battle.world.units.find(u => u.id === 'red_1').position = { x: 10, y: 27 }
  playTurns(game, 1)
  assert.equal(game.fieldHold?.side, 'red')
  assert.ok(game.fieldHold.sinceMinute > since, 'the hour started again')
  assert.equal(game.outcome.decided, false)
})

test('both sides are told once, half an hour before, that a side holding two is close to taking the field, with the grounds it holds', () => {
  const game = fords([{ x: 10, y: 3 }, { x: 10, y: 15 }], [{ x: 25, y: 27 }])
  playTurns(game, 30)
  const close = game.battle.log.ofType('objective').filter(e => e.close)
  assert.equal(close.length, 1)
  assert.deepEqual(close[0].names, ['the North Ford', 'Miller\'s Crossing'])
  assert.equal(close[0].side, 'red')
  assert.equal(close[0].needed, 2)
})

test('each change of hands with several grounds says how many each side holds after it', () => {
  const game = fords([{ x: 10, y: 3 }, { x: 10, y: 15 }], [{ x: 10, y: 27 }])
  playTurns(game, 1)
  const took = game.battle.log.ofType('objective').filter(e => e.side && !e.close)
  assert.equal(took.length, 3)
  for (const e of took) assert.deepEqual(e.holding, { red: 2, blue: 1 })
  assert.ok(took.every(e => e.needed === 2 && e.of === 3 && e.called === 'fords'))
})

test('a battle with one ground, or with every ground to hold, runs exactly as before: no count of how many each side holds', () => {
  const game = fords([{ x: 10, y: 3 }, { x: 10, y: 15 }], [{ x: 10, y: 27 }], { objectivesNeeded: undefined })
  playTurns(game, 1)
  const took = game.battle.log.ofType('objective')
  assert.ok(took.every(e => e.holding === undefined && e.needed === undefined))
  assert.equal(game.fieldHold, undefined)
})
