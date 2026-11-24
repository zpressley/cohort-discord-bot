// src/engine/orchestrator/tests/loose-ends.test.js
//
// Taking ground, news of the ground, and rallying (docs/DECISIONS.md, "How
// taking ground, news of the ground, and rallying were mended"):
//   - a unit sent to take the ground to fight for fights for it: it goes at
//     an enemy standing on it, rather than stand beside him and watch him
//     hold it;
//   - the ground changing hands calls a side the first time, and after
//     that only when it matters, not at every sway of a fight over it;
//   - a unit rallied with no heart left will not go at the enemy: told to,
//     it holds where it stands, and its report says why.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, waitingOn, groundCalls } = require('../orchestrator')
const { tables: T } = require('../../combat')

const MAP = { name: 'plain-30', width: 30, height: 20, terrain: {} }
const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 2, y: 2 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
// The ground: a row of three tiles mid-field. Red to its west, blue on it.
const GROUND = [{ id: 'ground-1', name: 'the knoll', tiles: [{ x: 15, y: 9 }, { x: 15, y: 10 }, { x: 15, y: 11 }] }]
const field = (units, extra = {}) => createGame({
  name: 'loose', map: MAP, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {},
  objectives: GROUND, units, ...extra
}, { seed: 2 })
function run(game, ticks, red, blue = [{ unitRef: 'foe', action: 'hold' }]) {
  for (let i = 0; i < ticks && !game.outcome.decided; i++) {
    for (const side of waitingOn(game)) submitOrders(game, side, side === 'red' ? (i === 0 ? red : []) : blue)
  }
}
const contacts = (game) => game.battle.log.ofType('contact').filter(e => [e.aId, e.bId].includes('one'))

// ── Taking ground ───────────────────────────────────

test('a unit sent to take the ground to fight for goes at an enemy standing on it, rather than stand beside him and watch him hold it', () => {
  const game = field([unit({ id: 'one', position: { x: 11, y: 10 } }), unit({ id: 'foe', side: 'blue', position: { x: 15, y: 10 } })])
  run(game, 6, [{ unitRef: 'one', action: 'defend', target: { x: 15, y: 10 } }])
  assert.ok(contacts(game).length > 0, 'it came to blows with the enemy on the ground')
})

test('a unit sent to stand off the ground, beside an enemy on it, lets him be, as before', () => {
  const game = field([unit({ id: 'one', position: { x: 11, y: 10 } }), unit({ id: 'foe', side: 'blue', position: { x: 15, y: 10 } })])
  run(game, 6, [{ unitRef: 'one', action: 'defend', target: { x: 14, y: 10 } }])
  assert.equal(contacts(game).length, 0, 'no blow struck')
})

test('a unit holding the ground it took does not chase an enemy standing off it', () => {
  const game = field([unit({ id: 'one', position: { x: 15, y: 10 } }), unit({ id: 'foe', side: 'blue', position: { x: 17, y: 10 } })])
  run(game, 6, [{ unitRef: 'one', action: 'defend', target: { x: 15, y: 10 } }])
  assert.equal(contacts(game).length, 0, 'no blow struck')
  assert.deepEqual(game.battle.world.units.find(u => u.id === 'one').position, { x: 15, y: 10 }, 'still on the ground')
})

test('a unit told to hold where it stands on the ground fights for it too', () => {
  const game = field([unit({ id: 'one', position: { x: 15, y: 9 } }), unit({ id: 'foe', side: 'blue', position: { x: 17, y: 11 } })])
  run(game, 6, [{ unitRef: 'one', action: 'hold' }], [{ unitRef: 'foe', action: 'defend', target: { x: 15, y: 11 } }])
  assert.ok(contacts(game).length > 0, 'it came to blows with the enemy who stepped onto the ground')
})

// ── News of the ground ──────────────────────────────

// A game stand-in: the ground's news this tick, and the sides.
function newsOf(game, turn, events) {
  game.battle.turn = turn
  game.battle.log = { forTurn: (t) => (t === turn ? events.map(e => ({ type: 'objective', objectiveId: 'ground-1', ...e })) : []) }
  return [...groundCalls(game)].sort()
}
const stand = () => ({ battle: { world: { units: [{ id: 'r', side: 'red' }, { id: 'b', side: 'blue' }] } } })

test('the ground changing hands calls every side the first time, then a fight swaying over it does not call them again at every change', () => {
  const game = stand()
  assert.deepEqual(newsOf(game, 1, [{ side: 'blue' }]), ['blue', 'red'], 'the first time: everyone')
  assert.deepEqual(newsOf(game, 2, [{ side: null, was: 'blue' }]), [], 'contested: no one')
  assert.deepEqual(newsOf(game, 3, [{ side: 'blue' }]), [], 'the enemy\'s again, as red was last told: no one')
  assert.deepEqual(newsOf(game, 4, [{ side: null, was: 'blue' }]), [], 'contested again: no one')
})

test('the ground changing hands: the enemy taking it alone calls him, his winning it back calls him, the enemy close to winning by it calls everyone', () => {
  const game = stand()
  newsOf(game, 1, [{ side: 'red' }])
  assert.ok(newsOf(game, 2, [{ side: 'blue' }]).includes('red'), 'the enemy takes it: red called')
  assert.ok(newsOf(game, 3, [{ side: 'red' }]).includes('red'), 'he wins it back alone: red called')
  assert.ok(newsOf(game, 4, [{ side: 'blue' }]).includes('red'), 'the enemy takes it again: red called')
  assert.deepEqual(newsOf(game, 5, [{ side: 'blue', was: 'blue', close: T.GROUND.CLOSE_MINUTES }]), ['blue', 'red'], 'close: everyone')
})

// ── Rallying ────────────────────────────────────────

// Red's one unit rallied at no heart (shaken), the enemy near.
function shaken() {
  const game = createGame({
    name: 'rally', map: MAP, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {},
    units: [unit({ id: 'one', position: { x: 10, y: 10 } }), unit({ id: 'two', position: { x: 10, y: 12 } }), unit({ id: 'foe', side: 'blue', position: { x: 14, y: 10 } })]
  }, { seed: 2 })
  const one = game.battle.world.units.find(u => u.id === 'one')
  game.battle.rallied.set('one', 1)
  game.battle.resolver.hearten(one, -100)
  assert.ok(game.battle.isShaken(one))
  return game
}

test('a unit rallied with no heart left will not go at the enemy: told to, it holds where it stands and its report says why', () => {
  const game = shaken()
  run(game, 3, [{ unitRef: 'one', action: 'advance' }])
  assert.deepEqual(game.battle.world.units.find(u => u.id === 'one').position, { x: 10, y: 10 }, 'it held')
  assert.equal(contacts(game).length, 0, 'no blow struck')
  const told = game.battle.log.ofType('heldBack').filter(e => e.unitId === 'one')
  assert.equal(told.length, 1, 'said once for the order')
  const { fact } = require('../../../narrator/turnNarrator')
  assert.match(fact(game.battle.map, told[0]), /no heart left, and will not go at the enemy/)
})

test('a unit rallied with no heart left keeps the order, and goes at the enemy once its men take heart', () => {
  const game = shaken()
  run(game, 1, [{ unitRef: 'one', action: 'advance' }])
  const one = game.battle.world.units.find(u => u.id === 'one')
  game.battle.resolver.hearten(one, 100)
  run(game, 3, [])
  assert.ok(contacts(game).length > 0, 'in, once heartened')
})

test('a unit rallied with no heart left can still be moved, and a steady unit beside it goes in as told', () => {
  const game = shaken()
  run(game, 2, [{ unitRef: 'one', action: 'move', target: { x: 6, y: 10 } }, { unitRef: 'two', action: 'advance' }])
  assert.ok(game.battle.world.units.find(u => u.id === 'one').position.x < 10, 'it moved back')
  assert.ok(game.battle.world.units.find(u => u.id === 'two').position.x > 10, 'the steady one went in')
  assert.equal(game.battle.log.ofType('heldBack').length, 0)
})
