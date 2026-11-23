// src/engine/command/tests/held.test.js
//
// A Commander in the enemy's hands (ruled 2026-11-23): the table between
// him and his captors, his officers running their own units, his loyal and
// disloyal officers, what he can see; and riding with another unit.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../../battle/battle')
const { createGame, submitOrders, commanderOf, gameRecord, replayGame, checkAnswer } = require('../../orchestrator/orchestrator')
const { ownCommand, loyaltyOf } = require('../officers')
const { canRide, heldSight } = require('../commander')
const { LOYALTY, PARLEY } = require('../../combat/tables')

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
  name: 'held', map: MAP,
  sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } },
  units, maxTurns: 40, commanders: { red: { unitId: 'guard' } }, ...extra
})
const officer = (personality, more = {}) => ({ name: `Officer ${personality}`, experience: 3, personality, ...more })

// Red's guard, line and reserve; blue's foe holds him, far off.
const army = (overrides = {}) => [
  unit({ id: 'guard', position: { x: 2, y: 2 }, officer: officer('steady'), ...overrides.guard }),
  unit({ id: 'line', position: { x: 2, y: 18 }, officer: { headless: true }, ...overrides.line }),
  unit({ id: 'reserve', position: { x: 3, y: 18 }, officer: officer('steady'), ...overrides.reserve }),
  unit({ id: 'foe', side: 'blue', position: { x: 18, y: 2 } })
]
const heldGame = (units = army(), seed = 5) => {
  const game = createGame(spec(units), { seed })
  Object.assign(game.battle.commanders.red, { status: 'held', heldBy: 'foe' })
  return game
}
const ids = (game) => game.battle.world.units.map(u => `${u.id}:${u.strength}:${u.position.x},${u.position.y}`)

// ── The table ─────────────────────────────────────────

test('an offer refused, or ignored, changes nothing in the battle', () => {
  const twin = heldGame()
  const refused = heldGame()
  const ignored = heldGame()
  assert.equal(submitOrders(refused, 'red', { offer: { units: ['line'] } }).status, 'parley')
  assert.equal(submitOrders(ignored, 'red', { offer: { units: ['line'] } }).status, 'parley')
  assert.equal(submitOrders(refused, 'blue', { answer: { offer: 1, refuse: true } }).status, 'parley')
  for (const game of [twin, refused, ignored]) {
    for (let i = 0; i < 4; i++) { submitOrders(game, 'red', []); submitOrders(game, 'blue', [{ unitRef: 'foe', action: 'advance' }]) }
  }
  assert.deepEqual(ids(refused), ids(twin))
  assert.deepEqual(ids(ignored), ids(twin))
  assert.deepEqual(refused.battle.log.all(), twin.battle.log.all(), 'blow for blow')
  assert.equal(refused.outcome.decided, false)
  assert.deepEqual(refused.parley.red.answer, { kind: 'refused', to: 1, turn: 0 })
  assert.equal(refused.parley.red.offer, null, 'an answered offer is off the table')
})

test('one offer a turn, of his own units still on the field, replacing the one before', () => {
  const game = heldGame()
  assert.equal(submitOrders(game, 'red', { offer: { units: ['foe'] } }).refused, 'that is not yours to give')
  assert.equal(submitOrders(game, 'red', { offer: { units: ['line', 'line'] } }).refused, 'name each unit once')
  assert.equal(submitOrders(game, 'red', { offer: { units: ['line'] } }).status, 'parley')
  assert.equal(submitOrders(game, 'red', { offer: { units: [] } }).refused, 'one offer a turn: wait for the turn to run')
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  assert.equal(submitOrders(game, 'red', { offer: { units: [] } }).status, 'parley')
  assert.deepEqual(game.parley.red.offer, { id: 2, units: [], turn: 1 }, 'the field alone, in place of the first')
  assert.equal(checkAnswer(game, 'blue', { offer: 1, accept: true }), 'there is no such offer on the table', 'the old one is gone')
  const free = createGame(spec(army()), { seed: 5 })
  assert.equal(submitOrders(free, 'red', { offer: { units: [] } }).refused, 'you are not held')
})

test('an accepted offer of several units ends the battle as his yield: he is free, and every unit named goes to the enemy', () => {
  const game = heldGame()
  submitOrders(game, 'red', { offer: { units: ['line', 'reserve'] } })
  const result = submitOrders(game, 'blue', { answer: { offer: 1, accept: true } })
  assert.equal(result.status, 'finished')
  assert.deepEqual([game.outcome.winner, game.outcome.reason], ['blue', 'enemy commander bargained'])
  assert.deepEqual(commanderOf(game, 'red'), { fate: 'ransomed', price: 'line', prices: ['line', 'reserve'] })
  assert.equal(game.battle.commanders.red.status, 'free')
})

test('the field alone, accepted, costs him no unit', () => {
  const game = heldGame()
  submitOrders(game, 'red', { offer: { units: [] } })
  submitOrders(game, 'blue', { answer: { offer: 1, accept: true } })
  assert.equal(game.outcome.winner, 'blue')
  assert.deepEqual(commanderOf(game, 'red'), { fate: 'ransomed', price: null, prices: [] })
})

test('asked for more, he goes free at once by giving all that was asked, and only while the counter stands', () => {
  const met = heldGame()
  for (const id of ['line', 'reserve']) met.intel.blue.known[id] = { status: 'ghost', strength: 100, position: { x: 3, y: 18 } }
  submitOrders(met, 'red', { offer: { units: ['line'] } })
  assert.equal(checkAnswer(met, 'blue', { offer: 1, more: { units: ['line', 'guard'] } }), 'you can ask only for enemy units your side has seen')
  assert.equal(submitOrders(met, 'blue', { answer: { offer: 1, more: { units: ['line', 'reserve'] } } }).status, 'parley')
  submitOrders(met, 'red', [])
  submitOrders(met, 'blue', [])
  assert.equal(submitOrders(met, 'red', { offer: { units: ['reserve', 'line'] } }).status, 'finished', 'the counter, met')
  assert.deepEqual(commanderOf(met, 'red').prices, ['reserve', 'line'])

  const late = heldGame()
  for (const id of ['line', 'reserve']) late.intel.blue.known[id] = { status: 'ghost', strength: 100, position: { x: 3, y: 18 } }
  submitOrders(late, 'red', { offer: { units: ['line'] } })
  submitOrders(late, 'blue', { answer: { offer: 1, more: { units: ['line', 'reserve'] } } })
  for (let i = 0; i <= PARLEY.COUNTER_LASTS; i++) { submitOrders(late, 'red', []); submitOrders(late, 'blue', []) }
  assert.equal(submitOrders(late, 'red', { offer: { units: ['reserve', 'line'] } }).status, 'parley', 'too late: it is only an offer now')
  assert.equal(late.outcome.decided, false)
})

test('held, he cannot yield by his own word', () => {
  const game = heldGame()
  submitOrders(game, 'red', { surrender: true })
  submitOrders(game, 'blue', [])
  assert.equal(game.outcome.decided, false)
  assert.equal(game.surrendered, null)
})

test('a battle with offers, a counter and an acceptance plays back from its record exactly', () => {
  // Taken in the fighting, not by hand, so that the record holds it.
  const units = [
    unit({ id: 'guard', strength: 20, position: { x: 10, y: 10 }, officer: officer('steady') }),
    unit({ id: 'line', position: { x: 2, y: 18 }, officer: { headless: true } }),
    unit({ id: 'foe', side: 'blue', position: { x: 10, y: 9 } })
  ]
  let game = null
  for (let seed = 1; seed < 400; seed++) {
    const g = createGame({ ...spec(units), maxTurns: 99 }, { seed })
    g.battle.mustered.set('guard', 100)
    for (let i = 0; i < 6 && !g.outcome.decided && g.battle.commanders.red.status !== 'held'; i++) {
      submitOrders(g, 'red', [])
      submitOrders(g, 'blue', [{ unitRef: 'foe', action: 'advance' }])
    }
    if (g.battle.commanders.red.status === 'held' && !g.outcome.decided) { game = g; break }
  }
  assert.ok(game, 'a seed where he is taken')
  submitOrders(game, 'red', { offer: { units: [] } })
  submitOrders(game, 'blue', { answer: { offer: 1, more: { units: ['guard'] } } })
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  if (!game.outcome.decided && game.battle.commanders.red.status === 'held') {
    submitOrders(game, 'red', { offer: { units: ['line'] } })
    submitOrders(game, 'blue', { answer: { offer: 2, accept: true } })
  }
  assert.deepEqual(commanderOf(game, 'red'), { fate: 'ransomed', price: 'line', prices: ['line'] }, 'the second offer was accepted')
  const record = JSON.parse(JSON.stringify(gameRecord(game)))
  // (replayGame, with the guard's mustered strength set as above.)
  const again = createGame(record.spec, { seed: record.seed })
  again.battle.mustered.set('guard', 100)
  for (const entry of record.orderLog) submitOrders(again, entry.side, entry.orders)
  assert.ok(record.orderLog.some(e => e.orders?.offer) && record.orderLog.some(e => e.orders?.answer?.more), 'offers and a counter are in the record')
  assert.deepEqual(again.battle.log.all(), game.battle.log.all())
  assert.deepEqual(again.outcome, game.outcome)
  assert.deepEqual(again.parley, game.parley)
  assert.deepEqual(commanderOf(again, 'red'), commanderOf(game, 'red'))
})

// ── His officers run their own units ──────────────────

test('each officer runs his own unit by his nature: the bold go at the enemy, the cautious hold, the steady carry on, the leaderless stand', () => {
  assert.equal(ownCommand(officer('bold'), true), 'advance')
  assert.equal(ownCommand(officer('bold'), false), 'carry on', 'nothing in sight to go at')
  assert.equal(ownCommand(officer('steady'), true), 'carry on')
  assert.equal(ownCommand(officer('cautious'), true), 'hold')
  assert.equal(ownCommand({ headless: true }, true), 'hold')
  assert.equal(ownCommand(null, true), 'hold')

  const units = [
    unit({ id: 'guard', position: { x: 2, y: 2 }, officer: officer('steady') }),
    unit({ id: 'bold', position: { x: 10, y: 14 }, officer: officer('bold') }),
    unit({ id: 'cautious', position: { x: 4, y: 18 }, officer: officer('cautious') }),
    unit({ id: 'steady', position: { x: 6, y: 18 }, officer: officer('steady') }),
    unit({ id: 'line', position: { x: 8, y: 18 }, officer: { headless: true } }),
    unit({ id: 'foe', side: 'blue', position: { x: 10, y: 10 } })
  ]
  const state = createBattleState(spec(units))
  const east = { x: 18, y: 18 }
  stepTurn(state, { red: ['cautious', 'steady', 'line'].map(id => ({ unitRef: id, target: east })) })
  const at = (id) => ({ ...state.world.units.find(u => u.id === id).position })
  const before = { cautious: at('cautious'), steady: at('steady'), line: at('line') }
  Object.assign(state.commanders.red, { status: 'held', heldBy: 'foe' })
  stepTurn(state, {})
  const told = state.log.all().filter(e => e.type === 'ownCommand').map(e => [e.unitId, e.did])
  assert.deepEqual(told, [['guard', 'carry on'], ['bold', 'advance'], ['cautious', 'hold'], ['steady', 'carry on'], ['line', 'hold']])
  assert.deepEqual(at('cautious'), before.cautious, 'the cautious halt')
  assert.deepEqual(at('line'), before.line, 'with no officer they stand where they are')
  assert.ok(at('steady').x > before.steady.x, 'the steady march on east')
  assert.equal(state.orderBook.get('bold').action, 'advance')
  stepTurn(state, {})
  assert.equal(state.log.all().filter(e => e.type === 'ownCommand').length, 5, 'told once, not every turn')
})

test('his officers stop running their own units once he is free: they keep what they were doing until he orders them', () => {
  const state = createBattleState(spec(army({ reserve: { officer: officer('cautious') } })))
  stepTurn(state, { red: [{ unitRef: 'reserve', target: { x: 18, y: 18 } }] })
  Object.assign(state.commanders.red, { status: 'held', heldBy: 'foe' })
  stepTurn(state, {})
  assert.equal(state.orderBook.get('reserve').action, 'hold')
  Object.assign(state.commanders.red, { status: 'free', heldBy: null })
  stepTurn(state, {})
  stepTurn(state, { red: [{ unitRef: 'reserve', target: { x: 18, y: 18 } }] })
  assert.equal(state.orderBook.get('reserve').action, 'move', 'his word reaches them again')
  assert.equal(state.ownCommand.size, 0)
  // Taken again: they decide again.
  Object.assign(state.commanders.red, { status: 'held', heldBy: 'foe' })
  stepTurn(state, {})
  assert.equal(state.log.all().filter(e => e.type === 'ownCommand' && e.unitId === 'reserve').length, 2)
})

test('loyalty: a loyal officer goes for the men who hold his Commander, whatever his nature, and his shaken men take heart', () => {
  assert.equal(loyaltyOf(officer('steady')), LOYALTY.NEUTRAL, 'no loyalty yet: neutral')
  assert.equal(loyaltyOf({ headless: true, loyalty: 99 }), LOYALTY.NEUTRAL)
  assert.equal(ownCommand(officer('cautious', { loyalty: LOYALTY.LOYAL }), false), 'rescue')
  assert.equal(ownCommand(officer('bold', { loyalty: LOYALTY.LOYAL - 1 }), true), 'advance', 'short of loyal, his nature')

  const state = createBattleState(spec(army({ reserve: { officer: officer('cautious', { loyalty: 90 }) } })))
  state.lastSeen.set('red', new Map([['foe', { x: 18, y: 2 }]]))
  // His men rallied once, and still at the breaking point.
  state.rallied.set('reserve', 1)
  state.resolver.hearten(state.world.units.find(u => u.id === 'reserve'), -80)
  assert.equal(state.isShaken(state.world.units.find(u => u.id === 'reserve')), true)
  Object.assign(state.commanders.red, { status: 'held', heldBy: 'foe' })
  stepTurn(state, {})
  const order = state.orderBook.get('reserve')
  assert.deepEqual([order.action, order.enemy], ['attack', 'foe'])
  const e = state.log.all().find(x => x.type === 'ownCommand' && x.unitId === 'reserve')
  assert.deepEqual([e.did, e.on, e.morale], ['rescue', 'foe', 20 + LOYALTY.RALLY_MORALE])
  assert.equal(state.isShaken(state.world.units.find(u => u.id === 'reserve')), false, 'heartened, they will stand a blow')
})

test('loyalty: a disloyal officer\'s men desert, a share every ten minutes he is held, and no one deserts while he is free', () => {
  const run = (held) => {
    const state = createBattleState(spec(army({ line: { officer: officer('steady', { loyalty: LOYALTY.DISLOYAL }) } })))
    if (held) Object.assign(state.commanders.red, { status: 'held', heldBy: 'foe' })
    for (let i = 0; i < 3; i++) stepTurn(state, {}, { sameTurn: i > 0 })
    return state
  }
  const held = run(true)
  const gone = held.log.all().filter(e => e.type === 'deserted' && e.unitId === 'line')
  assert.deepEqual(gone.map(e => [e.men, e.strength]), [[3, 97], [2, 95], [2, 93]])
  assert.equal(held.log.all().filter(e => e.type === 'deserted' && e.unitId !== 'line').length, 0, 'the neutral and leaderless stay')
  assert.equal(run(false).log.all().filter(e => e.type === 'deserted').length, 0)
})

test('a battle in which no Commander is held runs exactly as before: no officer runs his own unit, no one deserts', () => {
  const units = army({ line: { officer: officer('bold', { loyalty: 0 }) }, reserve: { officer: officer('cautious', { loyalty: 100 }) } })
  const plain = army()
  const run = (u) => {
    const state = createBattleState(spec(u), { seed: 9 })
    for (let i = 0; i < 8; i++) stepTurn(state, i === 0 ? { blue: [{ unitRef: 'foe', action: 'advance' }], red: [{ unitRef: 'line', target: { x: 10, y: 18 } }] } : {})
    return state
  }
  const a = run(units)
  const b = run(plain)
  assert.equal(a.log.all().some(e => e.type === 'ownCommand' || e.type === 'deserted'), false)
  assert.deepEqual(a.world.units.map(u => [u.id, u.strength, u.position]), b.world.units.map(u => [u.id, u.strength, u.position]))
})

// ── What he sees ──────────────────────────────────────

test('held, he sees what the men who hold him can see, and nothing beyond', () => {
  const game = heldGame([
    unit({ id: 'guard', position: { x: 17, y: 2 } }),
    unit({ id: 'line', position: { x: 2, y: 18 } }),
    unit({ id: 'friend', side: 'blue', position: { x: 16, y: 4 } }),
    unit({ id: 'far', side: 'blue', position: { x: 2, y: 12 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 18, y: 2 } })
  ])
  const sight = heldSight(game.battle, 'red')
  assert.equal(sight.captor.id, 'foe')
  assert.deepEqual([...sight.seen].sort(), ['foe', 'friend', 'guard'])
  assert.equal(heldSight(createGame(spec(army())).battle, 'red'), null, 'free, he is not held anywhere')
})

// ── Riding with another unit ──────────────────────────

test('he rides with another of his units only when it is beside the one he is with, not broken, and not while he is held', () => {
  const units = [
    unit({ id: 'guard', position: { x: 5, y: 5 } }),
    unit({ id: 'beside', position: { x: 6, y: 6 } }),
    unit({ id: 'far', position: { x: 9, y: 5 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 18, y: 18 } })
  ]
  const game = createGame(spec(units), { seed: 3 })
  const { commanders, world, broken } = game.battle
  assert.deepEqual(canRide(commanders, world, broken, 'red', 'far'), { ok: false, why: 'too far', tiles: 4 })
  assert.deepEqual(canRide(commanders, world, broken, 'red', 'foe'), { ok: false, why: 'not yours' })
  assert.deepEqual(canRide(commanders, world, broken, 'red', 'beside'), { ok: true })
  broken.add('beside')
  assert.equal(canRide(commanders, world, broken, 'red', 'beside').why, 'broken')
  broken.delete('beside')

  submitOrders(game, 'red', [{ ride: 'far' }])
  submitOrders(game, 'blue', [])
  assert.equal(game.battle.commanders.red.unitId, 'guard', 'too far: he stays where he is')
  submitOrders(game, 'red', [{ ride: 'beside' }, { unitRef: 'guard', target: 'hold' }])
  submitOrders(game, 'blue', [])
  assert.equal(game.battle.commanders.red.unitId, 'beside')
  const rode = game.battle.log.all().filter(e => e.type === 'commanderRode')
  assert.deepEqual(rode.map(e => [e.side, e.from, e.unitId]), [['red', 'guard', 'beside']])
  assert.deepEqual(replayGame(gameRecord(game)).battle.commanders, game.battle.commanders, 'it is in the record')

  Object.assign(game.battle.commanders.red, { status: 'held', heldBy: 'foe' })
  assert.equal(canRide(game.battle.commanders, world, broken, 'red', 'guard').why, 'held')
  submitOrders(game, 'red', [{ ride: 'guard' }])
  submitOrders(game, 'blue', [])
  assert.equal(game.battle.commanders.red.heldBy, 'foe', 'held, he rides with no one')
})
