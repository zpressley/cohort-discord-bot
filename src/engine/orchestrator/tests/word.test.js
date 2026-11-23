// src/engine/orchestrator/tests/word.test.js
//
// News by rider (docs/design/point-of-view-and-messengers.md, step 2): the
// Commander knows his units near him as they are, those beyond as they
// were when word left them, and nothing of a unit cut off; the turn stops
// when news reaches him, not when it happens.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, gameRecord, replayGame, waitingOn } = require('../orchestrator')
const { newsBetween, arrivalOf, wordFromCaptivity } = require('../word')

const MAP = { name: 'plain-40', width: 40, height: 20, terrain: {} }
const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 2, y: 10 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
// The Commander with the guard; one unit beside him, one 26 tiles off (a
// rider's 30 minutes), and an enemy coming for that one.
const spec = (more = [], extra = {}) => ({
  name: 'word', map: MAP, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {},
  units: [unit({ id: 'guard' }), unit({ id: 'near', position: { x: 5, y: 10 } }), unit({ id: 'far', position: { x: 28, y: 10 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 37, y: 10 } }), ...more],
  commanders: { red: { unitId: 'guard' } }, ...extra
})
// One of red's turns: his orders, then the computer's whenever the battle
// stops for it alone, until it stops for him (each side is asked only when
// wanted). The ticks are all of those he waited through.
const turn = (game, red = []) => {
  const from = game.history.length
  submitOrders(game, 'red', red)
  for (let i = 0; i < 50 && !game.outcome.decided && !waitingOn(game).includes('red'); i++) {
    submitOrders(game, 'blue', [{ unitRef: 'foe', action: 'attack', enemy: 'far' }])
  }
  const stretch = game.history.slice(from)
  return { interrupt: stretch.at(-1).wanted?.red ?? stretch.at(-1).interrupt, ticks: stretch.flatMap(h => h.ticks) }
}

test('he knows the units about him as they are, and a distant unit as it was when word left it', () => {
  const game = createGame(spec(), { seed: 1 })
  turn(game)
  const word = game.word.red
  const now = game.battle.turn
  assert.equal(word.units.near.heard, now, 'the unit beside him: word of this very tick')
  assert.equal(word.units.near.live, true)
  assert.deepEqual(word.units.near.position, game.battle.world.units.find(u => u.id === 'near').position)
  assert.equal(word.units.far.heard, now - 3, '26 tiles off: word thirty minutes old')
  assert.equal(word.units.far.live, false)
})

test('an enemy only a distant unit sees reaches his map as it stood when the report left, and the turn stops when it reaches him', () => {
  const game = createGame(spec(), { seed: 1 })
  const first = turn(game)
  // The far unit sees the enemy at once; word of it takes thirty minutes.
  assert.ok(first.ticks[0].sightings.includes('foe'), 'his side saw it in the first ten minutes')
  assert.deepEqual([first.interrupt, first.ticks.length], ['sighting', 4], 'he hears of it in the fourth')
  assert.equal(game.word.red.enemies.foe.seenOnTurn, 1, 'as it stood when the far unit saw it')
  assert.equal(game.word.red.enemies.foe.status, 'ghost', 'not in his own sight')
})

test('a fight far off stops the turn when word of it arrives, not when it starts', () => {
  const game = createGame(spec(), { seed: 1 })
  turn(game)
  const second = turn(game)
  const contact = game.battle.log.all().find(e => e.type === 'contact')
  assert.equal(contact.turn, 3, 'blows were struck in the third ten minutes, while he had no word of it')
  assert.equal(second.interrupt, 'contact')
  assert.equal(second.ticks.at(-1).battleTurn, 6, 'and he heard of it thirty minutes later')
  assert.equal(arrivalOf(game, 'red', contact), 6)
  assert.ok(newsBetween(game, 'red', 4, 6).some(n => n.event === contact))
})

test('a battle with no Commander on the field keeps no ledger, and stops the moment his side sees the enemy, as before', () => {
  const game = createGame(spec([], { commanders: undefined }), { seed: 1 })
  const first = turn(game)
  assert.deepEqual(game.word, {})
  assert.deepEqual([first.interrupt, first.ticks.length], ['sighting', 1])
})

// A wall of enemy between him and the far unit, out of his sight and theirs.
const wall = () => Array.from({ length: 10 }, (_, i) => unit({ id: `wall${i}`, side: 'blue', position: { x: 16, y: i * 2 + 1 } }))
const holdWall = (game) => {
  submitOrders(game, 'red', [])
  for (let i = 0; i < 50 && !waitingOn(game).includes('red'); i++) submitOrders(game, 'blue', wall().map(w => ({ unitRef: w.id, action: 'hold' })))
}

test('a unit cut off is not announced: he notices only when the word that should have come has not', () => {
  const game = createGame(spec(wall()), { seed: 1 })
  holdWall(game)
  const far = game.word.red.units.far
  assert.equal(far.heard, 0, 'no word since the battle began')
  assert.equal(game.battle.log.all().filter(e => e.type === 'cutOff' || e.type === 'inTouch').length, 0, 'nothing tells him')
  assert.equal(far.cutOff, false, 'his ledger holds no truth he could not know')
  assert.ok(game.battle.turn > 3 + 2, 'longer than a rider from where they last were takes, and the slack')
  assert.equal(far.overdue, true, 'he notices that no word has come')
})

test('a unit merely far off, whose word comes as it should, is not overdue', () => {
  const game = createGame(spec(), { seed: 1 })
  turn(game)
  assert.ok(game.battle.turn - game.word.red.units.far.heard >= 3, 'its word is half an hour old')
  assert.equal(game.word.red.units.far.overdue, false)
})

test('when word comes again from a unit he had no word of, it simply arrives, and is marked as come again', () => {
  const game = createGame(spec(wall()), { seed: 1 })
  holdWall(game)
  assert.equal(game.word.red.units.far.overdue, true)
  // The wall goes; riders get through again.
  for (const w of wall()) game.battle.world.units.find(u => u.id === w.id).position = { x: 39, y: w.position.y }
  holdWall(game)
  assert.equal(game.word.red.units.far.overdue, false)
  assert.deepEqual((game.word.red.back ?? []).map(b => b.unitId), ['far'])
  assert.equal(game.battle.log.all().filter(e => e.type === 'inTouch').length, 0)
})

test('a battle saved before the riders rulings (everyoneAsked) still tells him at once that a unit is cut off', () => {
  const game = createGame({ ...spec(wall()), everyoneAsked: true }, { seed: 1 })
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', wall().map(w => ({ unitRef: w.id, action: 'hold' })))
  const far = game.word.red.units.far
  assert.equal(far.cutOff, true)
  assert.equal(far.heard, 0, 'no word since the battle began')
  assert.equal(far.overdue, undefined)
})

test('word on the road survives a saved battle played back', () => {
  const game = createGame(spec(), { seed: 2 })
  turn(game)
  turn(game)
  const again = replayGame(JSON.parse(JSON.stringify(gameRecord(game))))
  assert.deepEqual(again.word, game.word)
  assert.deepEqual(again.history.map(h => h.interrupt), game.history.map(h => h.interrupt))
})

test('the battle still stops for the computer within the hour, with every unit of his far off and every order an hour away', () => {
  const far = (id, y) => unit({ id, position: { x: 38, y } })
  const game = createGame({ ...spec(), units: [unit({ id: 'guard', position: { x: 0, y: 0 } }), far('a', 19), far('b', 18), unit({ id: 'foe', side: 'blue', position: { x: 20, y: 0 } })] }, { seed: 1 })
  for (let t = 0; t < 5; t++) {
    submitOrders(game, 'red', [{ unitRef: 'a', action: 'advance' }, { unitRef: 'b', action: 'hold' }])
    submitOrders(game, 'blue', [])
    assert.ok(game.history.at(-1).ticks.length <= 6)
  }
  assert.equal(game.playerTurn, 5, 'five turns ran')
  assert.ok(game.battle.log.all().some(e => e.type === 'riderSent' && e.minutes >= 50), 'orders took most of an hour')
})

test('held, no rider reaches him and his ledger stands still; freed, he brings out where every enemy stood', () => {
  const game = createGame(spec([unit({ id: 'foe2', side: 'blue', position: { x: 36, y: 2 } })]), { seed: 1 })
  Object.assign(game.battle.commanders.red, { status: 'held', heldBy: 'foe' })
  const before = JSON.stringify(game.word.red.units)
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  assert.equal(JSON.stringify(game.word.red.units), before, 'no word of his own units while he is held')
  Object.assign(game.battle.commanders.red, { status: 'free', heldBy: null })
  wordFromCaptivity(game, 'red')
  for (const id of ['foe', 'foe2']) assert.equal(game.word.red.enemies[id].seenOnTurn, game.battle.turn, `${id}: known where it stood as he left`)
  const news = { type: 'exchange', turn: game.battle.turn - 1, a: { unitId: 'far' }, b: { unitId: 'foe' } }
  assert.equal(arrivalOf(game, 'red', news), Infinity, 'what his army did while he was held he heard from his captors, not by his riders')
})
