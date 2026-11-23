// src/engine/command/tests/commander.test.js
//
// The Commander on the field: when he can fall, what being taken does, how
// he gets free, and what a battle's end makes of him.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../../battle/battle')
const { createGame, submitOrders, commanderOf } = require('../../orchestrator/orchestrator')
const { stepCommanders, commanderFate, bargainChips } = require('../commander')
const { COMMANDER } = require('../../combat/tables')

const MAP = { name: 'plain-20', width: 20, height: 20, terrain: {} }
function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 2 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}
const spec = (units, extra = {}) => ({
  name: 'commander', map: MAP,
  sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } },
  units, maxTurns: 40, commanders: { red: { unitId: 'guard' } }, ...extra
})

// The pieces of a tick, by hand.
const world = (units) => ({ units })
const tick = (o) => stepCommanders({
  broken: new Set(), fledUnits: [], events: [], mustered: new Map([['guard', 100], ['line', 100], ['foe', 100]]),
  random: () => 0, ...o
})
const fight = (a, b) => ({ type: 'exchange', a: { unitId: a }, b: { unitId: b } })

test('he cannot fall while his unit is above the threshold, however hard it is struck', () => {
  const commanders = { red: { unitId: 'guard', status: 'free', heldBy: null } }
  const units = [unit({ id: 'guard', strength: 51 }), unit({ id: 'foe', side: 'blue' })]
  assert.deepEqual(tick({ commanders, world: world(units), events: [fight('guard', 'foe')] }), [])
  assert.equal(commanders.red.status, 'free')
})

test('under the threshold he falls only when his unit is struck, and then only by a low roll', () => {
  const units = [unit({ id: 'guard', strength: 50 }), unit({ id: 'foe', side: 'blue' })]
  const fresh = () => ({ red: { unitId: 'guard', status: 'free', heldBy: null } })

  let commanders = fresh()
  assert.deepEqual(tick({ commanders, world: world(units) }), [], 'no one struck them this tick')

  commanders = fresh()
  assert.deepEqual(tick({ commanders, world: world(units), events: [fight('guard', 'foe')], random: () => COMMANDER.CHANCE }), [], 'the roll came up high')

  // Low rolls: he falls. The second roll says which way.
  const rolls = (list) => { let i = 0; return () => list[i++] }
  commanders = fresh()
  assert.deepEqual(tick({ commanders, world: world(units), events: [fight('guard', 'foe')], random: rolls([0, COMMANDER.KILLED_SHARE]) }),
    [{ type: 'commanderTaken', fields: { side: 'red', unitId: 'guard', by: 'foe' } }])
  assert.deepEqual(commanders.red, { unitId: 'guard', status: 'held', heldBy: 'foe' })

  // At half strength the worst roll still only sees him taken: death needs
  // the unit at a quarter or less.
  commanders = fresh()
  assert.deepEqual(tick({ commanders, world: world(units), events: [{ type: 'pursuit', unitId: 'guard', by: 'foe' }], random: rolls([0, 0]) }),
    [{ type: 'commanderTaken', fields: { side: 'red', unitId: 'guard', by: 'foe' } }])
  const remnant = [unit({ id: 'guard', strength: 25 }), unit({ id: 'foe', side: 'blue' })]
  commanders = fresh()
  assert.deepEqual(tick({ commanders, world: world(remnant), events: [{ type: 'pursuit', unitId: 'guard', by: 'foe' }], random: rolls([0, 0]) }),
    [{ type: 'commanderKilled', fields: { side: 'red', unitId: 'guard', by: 'foe' } }], 'cut down as his unit ran')
  assert.equal(commanders.red.status, 'killed')
  commanders = fresh()
  tick({ commanders, world: world([unit({ id: 'guard', strength: 26 }), unit({ id: 'foe', side: 'blue' })]), events: [fight('guard', 'foe')], random: rolls([0, 0]) })
  assert.equal(commanders.red.status, 'held', 'a man over the quarter, and he lives')
})

test('his unit destroyed around him, he gets away to another if he comes through it', () => {
  const units = [unit({ id: 'guard', strength: 0 }), unit({ id: 'line', position: { x: 4, y: 2 } }), unit({ id: 'foe', side: 'blue' })]
  const commanders = { red: { unitId: 'guard', status: 'free', heldBy: null } }
  assert.deepEqual(tick({ commanders, world: world(units), events: [fight('guard', 'foe')], random: () => COMMANDER.OVERRUN }),
    [{ type: 'commanderMoved', fields: { side: 'red', unitId: 'line', from: 'guard' } }])
  assert.deepEqual(commanders.red, { unitId: 'line', status: 'free', heldBy: null })
})

test('held, he is free again when the men who hold him break or are destroyed', () => {
  const units = [unit({ id: 'guard', strength: 20 }), unit({ id: 'foe', side: 'blue' })]
  const commanders = { red: { unitId: 'guard', status: 'held', heldBy: 'foe' } }
  assert.deepEqual(tick({ commanders, world: world(units) }), [], 'they hold him still')
  assert.deepEqual(tick({ commanders, world: world(units), broken: new Set(['foe']) }),
    [{ type: 'commanderFreed', fields: { side: 'red', unitId: 'guard', by: 'foe' } }])
  assert.equal(commanders.red.status, 'free')
})

test('a battle: a Commander with a beaten unit is taken or killed in time, and a killed one loses the battle', () => {
  // His guard is a remnant set against a full unit: it is under the
  // threshold from the first blow.
  let taken = 0
  let killed = 0
  const battles = 400
  for (let seed = 1; seed <= battles; seed++) {
    const state = createBattleState(spec([
      unit({ id: 'guard', strength: 20, position: { x: 10, y: 10 } }),
      unit({ id: 'line', position: { x: 2, y: 18 } }),
      unit({ id: 'foe', side: 'blue', position: { x: 10, y: 9 } })
    ]), { seed })
    state.mustered.set('guard', 100)
    for (let i = 0; i < 12 && !state.outcome.decided && state.commanders.red.status === 'free'; i++) {
      stepTurn(state, i === 0 ? { blue: [{ unitRef: 'foe', action: 'advance' }] } : {})
    }
    if (state.commanders.red.status === 'held') taken += 1
    if (state.commanders.red.status === 'killed') {
      killed += 1
      assert.deepEqual([state.outcome.winner, state.outcome.reason], ['blue', 'enemy commander killed'])
    }
  }
  assert.ok(taken > killed && killed > 0, `taken ${taken}, killed ${killed}: taken more often than killed, and both happen`)
  assert.ok(taken + killed < battles * 0.6, 'and often neither, even for a remnant left in the fight: the odds are low')
})

test('held, he gives no orders: a steady officer carries on with the one he has', () => {
  const state = createBattleState(spec([
    unit({ id: 'guard', position: { x: 2, y: 2 } }),
    unit({ id: 'line', position: { x: 2, y: 18 }, officer: { name: 'Varro', experience: 3, personality: 'steady' } }),
    unit({ id: 'foe', side: 'blue', position: { x: 18, y: 2 } })
  ]))
  stepTurn(state, { red: [{ unitRef: 'line', target: { x: 12, y: 18 } }] })
  const where = () => state.world.units.find(u => u.id === 'line').position
  assert.deepEqual(where(), { x: 5, y: 18 })
  Object.assign(state.commanders.red, { status: 'held', heldBy: 'foe' })
  stepTurn(state, { red: [{ unitRef: 'line', target: { x: 2, y: 18 } }] })
  assert.deepEqual(where(), { x: 8, y: 18 }, 'still marching east: the new order never reached them')
})

test('a battle saved with the old bargain (one unit, always taken) plays back as it was played', () => {
  const game = createGame(spec([
    unit({ id: 'guard', position: { x: 2, y: 2 } }),
    unit({ id: 'line', quality: 'elite', position: { x: 2, y: 18 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 18, y: 2 } })
  ]), { seed: 5 })
  assert.deepEqual(bargainChips(game.battle.world, 'red').map(u => u.id), ['line', 'guard'], 'the best first')

  // Free, he has nothing to bargain for: it is read as no orders.
  submitOrders(game, 'red', { bargain: 'guard' })
  submitOrders(game, 'blue', [])
  assert.equal(game.outcome.decided, false)

  Object.assign(game.battle.commanders.red, { status: 'held', heldBy: 'foe' })
  submitOrders(game, 'red', { bargain: 'foe' })
  submitOrders(game, 'blue', [])
  assert.equal(game.outcome.decided, false, 'not his to give')

  const result = submitOrders(game, 'red', { bargain: 'guard' })
  assert.equal(result.status, 'finished')
  assert.deepEqual([game.outcome.winner, game.outcome.reason], ['blue', 'enemy commander bargained'])
  assert.deepEqual(commanderOf(game, 'red'), { fate: 'ransomed', price: 'guard', prices: ['guard'] })
  assert.equal(commanderOf(game, 'blue'), null, 'that side has no Commander on the field')
})

test('when the battle ends held: freed by a victory; otherwise free, alive, a commander of none, whatever he has left', () => {
  const held = { red: { unitId: 'guard', status: 'held', heldBy: 'foe' } }
  const field = world([unit({ id: 'guard', strength: 10 }), unit({ id: 'line', quality: 'elite', strength: 40 })])
  const lost = { decided: true, winner: 'blue', reason: 'enemy army broken' }
  assert.deepEqual(commanderFate({ commanders: held, world: field, outcome: { ...lost, winner: 'red' } }, 'red'), { fate: 'freed', price: null, prices: [] })
  assert.deepEqual(commanderFate({ commanders: held, world: field, outcome: lost }, 'red'), { fate: 'stripped', price: null, prices: [] },
    'no unit is taken as a price')
  assert.deepEqual(commanderFate({ commanders: held, world: world([unit({ id: 'guard', strength: 0 })]), outcome: lost }, 'red'), { fate: 'stripped', price: null, prices: [] },
    'nothing left on the field, and still he is not lost')
  assert.deepEqual(commanderFate({ commanders: { red: { unitId: 'guard', status: 'free' } }, world: field, outcome: lost }, 'red'), { fate: 'free', price: null, prices: [] })
  assert.deepEqual(commanderFate({ commanders: { red: { unitId: 'guard', status: 'killed' } }, world: field, outcome: lost }, 'red'), { fate: 'killed', price: null, prices: [] })
})

test('a battle with no Commanders on the field runs as it always did', () => {
  const run = (extra) => {
    const state = createBattleState(spec([
      unit({ id: 'guard', position: { x: 10, y: 10 } }),
      unit({ id: 'foe', side: 'blue', position: { x: 10, y: 9 } })
    ], extra), { seed: 9 })
    for (let i = 0; i < 30 && !state.outcome.decided; i++) stepTurn(state, i === 0 ? { blue: [{ unitRef: 'foe', action: 'advance' }] } : {})
    return state.log.all().filter(e => !e.type.startsWith('commander')).map(e => JSON.stringify(e))
  }
  const withOne = run({})
  const without = run({ commanders: undefined })
  assert.ok(without.length > 5)
  // The fighting is the same blow for blow until a Commander's death ends it.
  const shared = Math.min(withOne.length, without.length) - 1
  assert.deepEqual(withOne.slice(0, shared), without.slice(0, shared))
})

test('a Commander who only gets away to another unit does not stop the turn for the enemy to notice', () => {
  // Red's guard is destroyed by hand as the turn opens; red's Commander
  // comes through it and gets away to the line. Nothing else happens.
  const game = createGame(spec([
    unit({ id: 'guard', position: { x: 2, y: 2 } }),
    unit({ id: 'line', position: { x: 2, y: 18 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 18, y: 18 } })
  ]), { seed: 5 })
  game.battle.world.units.find(u => u.id === 'guard').strength = 0
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  assert.ok(game.battle.log.all().some(e => e.type === 'commanderMoved'), 'he moved')
  assert.notEqual(game.history.at(-1).interrupt, 'commander')
})
