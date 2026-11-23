// src/engine/command/tests/messengers.test.js
//
// Orders by rider (docs/design/point-of-view-and-messengers.md, step 1):
// within the Commander's immediate range an order arrives at once; beyond
// it a rider carries it, and the unit carries on with what it had until he
// arrives; no rider crosses ground beside the enemy.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../../battle/battle')
const { createGame, submitOrders, gameRecord, replayGame } = require('../../orchestrator/orchestrator')
const { riders, riderCosts, orderDelays, byCommandPost, commandPost } = require('../messengers')
const { COMMAND } = require('../../combat/tables')

const MAP = { name: 'plain-40', width: 40, height: 20, terrain: {} }
function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 10 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}
const spec = (units, extra = {}) => ({
  name: 'riders', map: MAP,
  sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
  units, maxTurns: 40, commanders: { red: { unitId: 'guard' } }, ...extra
})
// The Commander with the guard; one unit beside him, one across the field.
const army = (more = []) => [
  unit({ id: 'guard', position: { x: 2, y: 10 } }),
  unit({ id: 'near', position: { x: 6, y: 10 } }),
  unit({ id: 'far', position: { x: 30, y: 10 } }),
  unit({ id: 'foe', side: 'blue', position: { x: 38, y: 1 } }),
  ...more
]
const at = (state, id) => ({ ...state.world.units.find(u => u.id === id).position })
const north = (state, id) => ({ unitRef: id, target: { x: at(state, id).x, y: 2 } })

test(`an order to a unit within ${COMMAND.IMMEDIATE} tiles of the Commander arrives at once`, () => {
  const state = createBattleState(spec(army()))
  stepTurn(state, { red: [north(state, 'near')] })
  assert.ok(at(state, 'near').y < 10, 'it moved in the first ten minutes')
  assert.equal(state.log.all().filter(e => e.type === 'riderSent').length, 0)
})

test('beyond it a rider carries the order, at his pace over the ground, and the unit carries on until he arrives', () => {
  const state = createBattleState(spec(army()))
  // 28 tiles of open ground at 10 a ten minutes: 30 minutes.
  stepTurn(state, { red: [north(state, 'far')] })
  const sent = state.log.all().find(e => e.type === 'riderSent')
  assert.deepEqual([sent.unitId, sent.minutes], ['far', 30])
  assert.deepEqual(at(state, 'far'), { x: 30, y: 10 })
  stepTurn(state, {}, { sameTurn: true })
  stepTurn(state, {}, { sameTurn: true })
  assert.deepEqual(at(state, 'far'), { x: 30, y: 10 }, 'still where it was after twenty minutes')
  stepTurn(state, {}, { sameTurn: true })
  assert.ok(at(state, 'far').y < 10, 'the order took effect as the rider arrived')
})

test('woods slow a rider as they slow horse', () => {
  const woods = { ...MAP, name: 'wooded-40', terrain: { forest: Array.from({ length: 20 }, (_, y) => [10, 11, 12, 13].map(x => `${String.fromCharCode(65 + (x >= 26 ? 0 : x))}${y + 1}`)).flat() } }
  const open = createBattleState(spec(army()))
  const wooded = createBattleState({ ...spec(army()), map: woods })
  const far = (s) => riders(s, 'red').ticks(s.world.units.find(u => u.id === 'far'))
  assert.equal(far(open), 3)
  assert.ok(far(wooded) > far(open), `${far(wooded)} ten minutes through the woods, against ${far(open)} in the open`)
})

test('no rider crosses ground within a tile of the enemy: an army cut off by an enemy line gets no order, and the Commander is told', () => {
  // A wall of enemy across the field between the Commander and the far unit.
  const wall = Array.from({ length: 10 }, (_, i) => unit({ id: `wall${i}`, side: 'blue', position: { x: 20, y: i * 2 + 1 } }))
  const state = createBattleState(spec([...army(), ...wall]))
  assert.equal(orderDelays(state, 'red', ['far']).far, Infinity)
  stepTurn(state, { red: [north(state, 'far')] })
  assert.deepEqual(state.log.all().filter(e => e.type === 'riderBlocked').map(e => e.unitId), ['far'])
  for (let i = 0; i < 6; i++) stepTurn(state, {}, { sameTurn: true })
  assert.notEqual(state.orderBook.get('far')?.action, 'move', 'the order never reached them')
})

test('a rider rides into a unit in a fight, but not on through the enemy beside it', () => {
  const state = createBattleState(spec(army([unit({ id: 'foe2', side: 'blue', position: { x: 31, y: 10 } })])))
  const costs = riderCosts({ map: state.map, world: state.world, side: 'red', from: { x: 2, y: 10 } })
  assert.ok(Number.isFinite(costs[10 * 40 + 30]), 'the unit beside the enemy can be reached')
  assert.ok(costs[10 * 40 + 33] > 31, `beyond the enemy only the long way round (${costs[10 * 40 + 33]}), not straight through (31)`)
})

test('a unit destroyed before the rider arrives never gets the order', () => {
  const state = createBattleState(spec(army()))
  stepTurn(state, { red: [north(state, 'far')] })
  state.world.units.find(u => u.id === 'far').strength = 0
  for (let i = 0; i < 4; i++) stepTurn(state, {}, { sameTurn: true })
  assert.equal(state.orderBook.get('far'), undefined)
  assert.equal(state.riders.length, 0, 'the rider is off the road')
})

test('a newer order does not overtake an older one on the road: both arrive, in the order given', () => {
  const state = createBattleState(spec(army()))
  stepTurn(state, { red: [north(state, 'far')] })
  // The Commander is now beside them (as if he had ridden there): the
  // second order would arrive at once, but waits for the first.
  state.world.units.find(u => u.id === 'guard').position = { x: 26, y: 10 }
  stepTurn(state, { red: [{ unitRef: 'far', action: 'hold' }] })
  const sent = state.log.all().filter(e => e.type === 'riderSent').map(e => [e.turn, e.minutes])
  assert.deepEqual(sent, [[1, 30], [2, 20]], 'the second arrives with the first, at turn 4')
  stepTurn(state, {}, { sameTurn: true })
  assert.equal(state.orderBook.get('far'), undefined)
  stepTurn(state, {}, { sameTurn: true })
  assert.equal(state.orderBook.get('far').action, 'hold', 'the later order stands, given last')
})

test('what an officer keeps of a deep order is rolled when the rider arrives', () => {
  const officer = { name: 'Varro', experience: 2, personality: 'steady' }
  const state = createBattleState(spec(army().map(u => u.id === 'far' ? { ...u, officer } : u)))
  const deep = { unitRef: 'far', action: 'move', target: { x: 30, y: 4 }, steps: [{ action: 'move', target: { x: 26, y: 4 } }, { action: 'move', target: { x: 26, y: 8 } }] }
  stepTurn(state, { red: [deep] })
  assert.equal(state.log.all().filter(e => e.type === 'grasp').length, 0, 'nothing rolled as it is sent')
  for (let i = 0; i < 3; i++) stepTurn(state, {}, { sameTurn: true })
  const rolled = state.log.all().filter(e => e.type === 'grasp')
  assert.deepEqual(rolled.map(e => [e.unitId, e.turn]), [['far', 4]])
})

test('the read-back says how long a rider takes, from the unit he will ride with if he rides first', () => {
  const state = createBattleState(spec(army()))
  assert.deepEqual(orderDelays(state, 'red', ['guard', 'near', 'far']), { guard: 0, near: 0, far: 30 })
  assert.deepEqual(orderDelays(state, 'red', ['far'], { from: 'near' }), { far: 30 }, '24 tiles from the near unit: still 30')
  state.commanders.red.status = 'held'
  assert.equal(orderDelays(state, 'red', ['far']), null, 'held, he sends none')
})

test('orders on the road survive a saved battle played back', () => {
  const game = createGame(spec(army()), { seed: 3 })
  submitOrders(game, 'red', [north(game.battle, 'far'), north(game.battle, 'near')])
  submitOrders(game, 'blue', [])
  submitOrders(game, 'red', [{ unitRef: 'far', action: 'hold' }])
  submitOrders(game, 'blue', [])
  const again = replayGame(JSON.parse(JSON.stringify(gameRecord(game))))
  assert.deepEqual(again.battle.log.all(), game.battle.log.all())
  assert.deepEqual(again.battle.riders, game.battle.riders)
})

test('a side with no Commander on the field gives every order at once, however far', () => {
  const state = createBattleState({ ...spec(army()), commanders: undefined })
  stepTurn(state, { red: [north(state, 'far')] })
  assert.ok(at(state, 'far').y < 10)
  assert.equal(state.riders, undefined)
})

// ── The computer's side (step 3) ──────────────────────

test('the computer\'s orders, marked as from its command post, go by rider from its best unit', () => {
  const blue = [
    unit({ id: 'b_elite', side: 'blue', quality: 'elite', position: { x: 37, y: 18 } }),
    unit({ id: 'b_near', side: 'blue', position: { x: 35, y: 16 } }),
    unit({ id: 'b_far', side: 'blue', position: { x: 37, y: 1 } })
  ]
  const state = createBattleState({ ...spec(blue.concat([unit({ id: 'guard', position: { x: 2, y: 10 } })])) })
  stepTurn(state, { blue: byCommandPost([{ unitRef: 'b_near', action: 'hold' }, { unitRef: 'b_far', target: { x: 30, y: 1 } }]) })
  assert.equal(commandPost(state, 'blue').unitId, 'b_elite', 'its best unit is its command post')
  assert.equal(state.orderBook.get('b_near').action, 'hold', 'within its immediate range: at once')
  assert.equal(state.orderBook.get('b_near').fromPost, undefined, 'the mark is not part of the order')
  const sent = state.log.all().filter(e => e.type === 'riderSent')
  assert.deepEqual(sent.map(e => [e.side, e.unitId, e.minutes]), [['blue', 'b_far', 20]], '17 tiles: twenty minutes')
})

test('the computer\'s orders unmarked go at once, however far, as before', () => {
  const state = createBattleState({ ...spec(army()), commanders: undefined })
  stepTurn(state, { blue: [{ unitRef: 'foe', target: { x: 30, y: 1 } }] })
  assert.equal(state.orderBook.get('foe').action, 'move')
  assert.equal(state.posts, undefined)
})

test('a unit cut off is told to its Commander once, and so is its coming back in touch', () => {
  const wall = Array.from({ length: 10 }, (_, i) => unit({ id: `wall${i}`, side: 'blue', position: { x: 20, y: i * 2 + 1 } }))
  const game = createGame({ ...spec([...army(), ...wall]), standingOrders: {} }, { seed: 1 })
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', wall.map(w => ({ unitRef: w.id, action: 'hold' })))
  const told = (type) => game.battle.log.all().filter(e => e.type === type).map(e => e.unitId)
  assert.deepEqual(told('cutOff'), ['far'])
  // The wall goes; riders get through again.
  for (const w of wall) game.battle.world.units.find(u => u.id === w.id).position = { x: 39, y: w.position.y }
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  assert.deepEqual(told('inTouch'), ['far'])
  assert.deepEqual(told('cutOff'), ['far'], 'told once')
})

test('a battle saved before riders (its spec marked messengers: false) plays back with every order at once and no ledger', () => {
  const game = createGame({ ...spec(army()), standingOrders: {}, messengers: false }, { seed: 1 })
  assert.deepEqual(game.word, {})
  submitOrders(game, 'red', [north(game.battle, 'far')])
  submitOrders(game, 'blue', byCommandPost([{ unitRef: 'foe', action: 'hold' }]))
  assert.equal(game.battle.log.all().filter(e => e.type.startsWith('rider')).length, 0)
  assert.ok(at(game.battle, 'far').y < 10, 'the far unit moved at once')
  assert.equal(orderDelays(game.battle, 'red', ['far']), null, 'and the read-back says nothing of riders')
})
