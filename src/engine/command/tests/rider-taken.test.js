// src/engine/command/tests/rider-taken.test.js
//
// The enemy catching a rider and reading the order he carries
// (docs/design/point-of-view-and-messengers.md, "What comes after"; the
// numbers are tables.RIDER_TAKEN; docs/DECISIONS.md, "How the enemy
// catching a rider was built"). A rider keeps clear of the enemy he knows
// of as he sets out; the enemy moves while he rides. One that comes near
// his road may catch him: his order never arrives, his own side is not
// told, and the side that took him reads the order.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../../battle/battle')
const { createGame, submitOrders, gameRecord, replayGame, waitingOn } = require('../../orchestrator/orchestrator')
const { arrivalOf } = require('../../orchestrator/word')
const { rodeOver, catcherOf } = require('../messengers')
const { RIDER_TAKEN } = require('../../combat/tables')
const { createRng } = require('../../rng')
const { visibleEvents, fact } = require('../../../narrator/turnNarrator')
const { forewarned, planTurn } = require('../../../opponent/planner')

const MAP = { name: 'plain-40', width: 40, height: 20, terrain: {} }
const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 2, y: 10 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
// The Commander with the guard at the west edge, a unit 28 tiles off (a
// rider's 30 minutes, straight along row 10), and an enemy beside the road.
const spec = (enemy, extra = {}) => ({
  name: 'taken', map: MAP, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {}, maxTurns: 40,
  units: [unit({ id: 'guard' }), unit({ id: 'far', position: { x: 30, y: 10 } }), unit({ id: 'foe', side: 'blue', ...enemy })],
  commanders: { red: { unitId: 'guard' } }, ...extra
})
const horse = { mounted: true, position: { x: 16, y: 12 } }
const north = { unitRef: 'far', action: 'attack', target: { x: 30, y: 2 } }

// The rolls set to a sure thing (or none), for the length of a test.
function chances(foot, mounted, fn) {
  const was = [RIDER_TAKEN.FOOT.CHANCE, RIDER_TAKEN.HORSE.CHANCE]
  RIDER_TAKEN.FOOT.CHANCE = foot
  RIDER_TAKEN.HORSE.CHANCE = mounted
  try { return fn() } finally { [RIDER_TAKEN.FOOT.CHANCE, RIDER_TAKEN.HORSE.CHANCE] = was }
}
const ticks = (state, n) => { for (let i = 0; i < n; i++) stepTurn(state, {}, { sameTurn: true }) }

test(`enemy horse that come within ${RIDER_TAKEN.HORSE.REACH} tiles of a rider's road may catch him, and his order never arrives`, () => {
  chances(1, 1, () => {
    const state = createBattleState(spec(horse))
    stepTurn(state, { red: [north] })
    ticks(state, 5)
    const taken = state.log.all().filter(e => e.type === 'riderTaken')
    assert.deepEqual(taken.map(e => [e.side, e.unitId, e.from, e.to, e.turn]), [['blue', 'foe', 'red', 'far', 3]])
    assert.deepEqual(taken[0].order, { action: 'attack', target: { x: 30, y: 2 }, then: null }, 'the order he carried, as the engine has it')
    assert.equal(state.orderBook.get('far'), undefined, 'the order never reached them')
    assert.equal(state.riders.length, 0, 'he is off the road')
  })
})

test(`enemy foot must come within ${RIDER_TAKEN.FOOT.REACH} tile of his road; horse reach further, and catch him more often`, () => {
  assert.ok(RIDER_TAKEN.HORSE.REACH > RIDER_TAKEN.FOOT.REACH)
  assert.ok(RIDER_TAKEN.HORSE.CHANCE > RIDER_TAKEN.FOOT.CHANCE)
  const road = { side: 'red', sent: 0, path: Array.from({ length: 12 }, (_, i) => ({ x: 2 + i, y: 10, c: i })) }
  const state = (enemy) => createBattleState(spec(enemy))
  const at = (enemy) => catcherOf(state(enemy), road, 1)
  assert.equal(at({ position: { x: 8, y: 12 } }), null, 'foot two tiles off: he rides by')
  assert.equal(at({ position: { x: 8, y: 11 } }).chance, RIDER_TAKEN.FOOT.CHANCE, 'foot a tile off')
  assert.equal(at({ mounted: true, position: { x: 8, y: 12 } }).chance, RIDER_TAKEN.HORSE.CHANCE, 'horse two tiles off')
  assert.equal(at({ mounted: true, position: { x: 8, y: 13 } }), null, 'horse three tiles off')
  const broken = state({ mounted: true, position: { x: 8, y: 11 } })
  broken.broken.add('foe')
  assert.equal(catcherOf(broken, road, 1), null, 'men running for their lives catch no one')
})

test('a rider is looked for only on the road he rode in the last ten minutes, not where he set out nor at the unit he rides to', () => {
  const road = { side: 'red', sent: 0, path: Array.from({ length: 25 }, (_, i) => ({ x: 2 + i, y: 10, c: i })) }
  assert.deepEqual(rodeOver(road, 1).map(t => t.c), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.deepEqual(rodeOver(road, 2).map(t => t.c), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
  assert.deepEqual(rodeOver(road, 3).map(t => t.c), [21, 22, 23], 'the last tile, the unit itself, is not on it')
  assert.deepEqual(rodeOver({ ...road, path: road.path.slice(0, 2) }, 1), [], 'a ride of a tile has no road between')
})

test('with no enemy near a rider no roll is made, and the battle falls out as before', () => {
  const far = { position: { x: 38, y: 1 } }
  const state = createBattleState(spec(far), { seed: 9 })
  stepTurn(state, { red: [north] })
  ticks(state, 5)
  assert.equal(state.riderRandom(), createRng((Math.imul(9, 3266489917) + 307) >>> 0)(), 'the stream of its own was never drawn on')
  const none = chances(0, 0, () => { const s = createBattleState(spec(far), { seed: 9 }); stepTurn(s, { red: [north] }); ticks(s, 5); return s.log.all() })
  assert.deepEqual(state.log.all(), none)
})

// Both sides with a Commander on the field: blue's rides with a unit far
// from the horse that takes the rider, so word of it comes by rider too.
const both = () => {
  const s = spec(horse, { commanders: { red: { unitId: 'guard' }, blue: { unitId: 'camp' } } })
  return { ...s, units: [...s.units, unit({ id: 'camp', side: 'blue', position: { x: 38, y: 18 } })] }
}
function caught() {
  return chances(1, 1, () => {
    const game = createGame(both(), { seed: 4 })
    submitOrders(game, 'red', [north])
    for (let i = 0; i < 20 && !game.battle.log.all().some(e => e.type === 'riderTaken'); i++) {
      for (const side of waitingOn(game)) submitOrders(game, side, side === 'blue' ? [{ unitRef: 'foe', action: 'hold' }] : [])
    }
    return { game, event: game.battle.log.all().find(e => e.type === 'riderTaken') }
  })
}

test('the side whose rider was caught is not told: no word comes back', () => {
  const { game, event } = caught()
  assert.ok(event)
  assert.equal(arrivalOf(game, 'red', event), Infinity, 'it never reaches his Commander')
  const red = visibleEvents([event], { ownIds: new Set(['guard', 'far']), seenEnemyIds: new Set(['foe']) })
  assert.deepEqual(red, [], 'not in his report, even with the horse that took him in sight')
  assert.equal(game.battle.lostRiders.length, 1, 'kept, so that he believes it on the road until it should have arrived')
})

test('the side that caught him hears of it with the next report of the unit that took him', () => {
  const { game, event } = caught()
  const blue = visibleEvents([event], { ownIds: new Set(['foe', 'camp']), seenEnemyIds: new Set() })
  assert.deepEqual(blue, [event])
  const sent = game.word.blue.sent.foe.find(([t]) => t >= event.turn)
  assert.equal(arrivalOf(game, 'blue', event), sent[1], 'with the horse\'s first report from then on')
  assert.ok(sent[1] > event.turn, 'not at once: the horse is far from his Commander')
})

test('word that his men caught an enemy rider calls their Commander back to give orders', () => {
  const { game, event } = caught()
  const due = arrivalOf(game, 'blue', event)
  chances(1, 1, () => {
    for (let i = 0; i < 20 && game.battle.turn < due && !game.outcome.decided; i++) {
      for (const side of waitingOn(game)) submitOrders(game, side, side === 'blue' ? [{ unitRef: 'foe', action: 'hold' }] : [])
    }
  })
  const stop = game.history.find(h => h.ticks.at(-1)?.battleTurn === due)
  assert.ok(stop?.wanted?.blue, `the battle stopped for him as the word reached him (${JSON.stringify(stop?.wanted)})`)
})

test('what he is told is the order in the game\'s own words, for which unit, and where the rider was taken', () => {
  const { game, event } = caught()
  const line = fact(game.battle.map, event)
  assert.match(line, /^foe took one of the enemy's riders .*\([A-Z]\d+-[NS][EW]\), carrying an order for far: attack [A-Z]\d+-[NS][EW]$/)
})

test('a battle in which a rider was caught plays back the same', () => {
  const { game } = caught()
  const again = chances(1, 1, () => replayGame(JSON.parse(JSON.stringify(gameRecord(game)))))
  assert.deepEqual(again.battle.log.all(), game.battle.log.all())
})

test('the computer takes the place named in an order it caught as where the enemy is going, for an hour', () => {
  const game = createGame(spec({ position: { x: 38, y: 18 } }, { commanders: undefined }), { seed: 2 })
  const taken = { type: 'riderTaken', turn: 1, side: 'blue', unitId: 'foe', from: 'red', to: 'far', at: { x: 9, y: 10 }, order: { action: 'move', target: { x: 20, y: 5 }, then: null } }
  game.battle.log.emit('riderTaken', 1, { side: 'blue', unitId: 'foe', from: 'red', to: 'far', at: taken.at, order: taken.order })
  game.battle.turn = 2
  assert.deepEqual(forewarned(game, 'blue'), [{ x: 20, y: 5 }])
  assert.deepEqual(forewarned(game, 'red'), [], 'the side that lost him learns nothing of it')
  const orders = planTurn(game, 'blue')
  assert.ok(orders.some(o => o.target && Math.abs(o.target.x - 20) <= 6), `it forms up toward the place: ${JSON.stringify(orders)}`)
  game.battle.turn = 8
  assert.deepEqual(forewarned(game, 'blue'), [], 'an hour on, it no longer counts')
})
