// src/engine/battle/tests/camp.test.js
//
// The camp (ruled 2026-11-25: docs/DECISIONS.md, "Rulings, November 25, 2026
// (camps)"; engine/battle/camp.js). Each test's title is the rule.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, sideView } = require('../../orchestrator')
const { createBattleState, stepTurn, checkBattleOutcome } = require('../battle')
const camps = require('../camp')
const { CAMP } = require('../../combat/tables')
const R = require('../../combat/ratings')

const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 5, y: 5 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
const FIELD = { name: 'field', width: 40, height: 12, terrain: {} }
const spec = (units, more = {}) => ({
  map: FIELD, units, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {}, camps: true, ...more
})
const wind = (state, id) => state.resolver.getState(id)?.stamina ?? null

test('a camp starts packed up, carried by the unit least use in the line: not the one its Commander rides with, not horse while there is foot', () => {
  const units = [
    unit({ id: 'red_guard', quality: 'elite' }),
    unit({ id: 'red_levy', quality: 'levy', position: { x: 5, y: 6 } }),
    unit({ id: 'red_horse', quality: 'levy', mounted: true, position: { x: 5, y: 7 } }),
    unit({ id: 'blue_a', side: 'blue', position: { x: 35, y: 5 } })
  ]
  const state = createBattleState(spec(units, { commanders: { red: { unitId: 'red_levy' } } }), { seed: 1 })
  assert.equal(state.camps.red.status, 'carried')
  assert.equal(state.camps.red.carrier, 'red_guard', 'the levy carries the Commander, the horse are horse')
  const plain = createBattleState(spec(units), { seed: 1 })
  assert.equal(plain.camps.red.carrier, 'red_levy')
  // The Commander may name who carries it.
  assert.equal(createBattleState(spec(units, { camps: { red: { carrier: 'red_horse' } } }), { seed: 1 }).camps.red.carrier, 'red_horse')
})

test('a battle with no camps has none: nothing of the camp is in its state, its view or its log', () => {
  const units = [unit({ id: 'red_a' }), unit({ id: 'blue_a', side: 'blue', position: { x: 35, y: 5 } })]
  const game = createGame(spec(units, { camps: undefined }), { seed: 1 })
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  assert.equal(game.battle.camps, undefined)
  assert.equal('camps' in sideView(game, 'red'), false)
  assert.equal(game.day, undefined)
  assert.ok(game.battle.log.all().every(e => !e.type.startsWith('camp')))
})

test('the unit carrying the camp marches at half its pace, and fights worse for it', () => {
  const units = [unit({ id: 'red_a' }), unit({ id: 'red_b', position: { x: 5, y: 8 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 38, y: 5 } })]
  const state = createBattleState(spec(units, { camps: { red: { carrier: 'red_a' } } }), { seed: 1 })
  stepTurn(state, { red: [{ unitRef: 'red_a', target: { x: 20, y: 5 } }, { unitRef: 'red_b', target: { x: 20, y: 8 } }] })
  const a = state.world.units.find(u => u.id === 'red_a')
  const b = state.world.units.find(u => u.id === 'red_b')
  assert.ok(b.position.x - 5 >= 2 * (a.position.x - 5) - 1, `carrier ${a.position.x - 5} tiles, the other ${b.position.x - 5}`)
  assert.ok(a.position.x > 5, 'it still moves')
  // Its fighting: the burden off its attack and its defence.
  assert.ok(R.attackRating(a, { burden: CAMP.BURDEN }) < R.attackRating(a, {}))
  assert.ok(R.defenseRating(a, { burden: CAMP.BURDEN }) < R.defenseRating(a, {}))
  const e = { aId: 'red_a', bId: 'blue_a' }
  camps.markEngagements(state, [e])
  assert.equal(e.aBurden, CAMP.BURDEN)
})

test('a camp is pitched where it is ordered: the unit carrying it goes there and pitches it, a few tiles across', () => {
  const units = [unit({ id: 'red_a' }), unit({ id: 'blue_a', side: 'blue', position: { x: 38, y: 5 } })]
  const game = createGame(spec(units), { seed: 1 })
  for (let i = 0; i < 6 && game.battle.camps.red.status !== 'pitched'; i++) {
    submitOrders(game, 'red', i === 0 ? [{ unitRef: 'red_a', action: 'pitch', target: { x: 8, y: 5 } }] : [])
    submitOrders(game, 'blue', [])
  }
  const camp = game.battle.camps.red
  assert.equal(camp.status, 'pitched')
  assert.deepEqual(camp.at, { x: 8, y: 5 })
  assert.equal(camp.tiles.length, (2 * CAMP.RADIUS + 1) ** 2)
  assert.equal(game.battle.orderBook.get('red_a').action, 'hold', 'then it holds')
  assert.equal(game.battle.log.ofType('campPitched').length, 1)
})

test('while the camp is carried the whole army sheds wind each ten minutes, after a spell of grace for the opening march', () => {
  const units = [unit({ id: 'red_a' }), unit({ id: 'red_b', position: { x: 5, y: 8 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 38, y: 5 } })]
  const state = createBattleState(spec(units), { seed: 1 })
  const ticks = CAMP.GRACE_MINUTES / 10
  for (let i = 0; i < ticks; i++) stepTurn(state, {})
  const pool = R.staminaPool(units[1])
  assert.equal(wind(state, 'red_b') ?? pool, pool, 'no wind lost in the grace')
  stepTurn(state, {})
  stepTurn(state, {})
  assert.equal(wind(state, 'red_b'), pool - 2 * CAMP.CARRIED_DRAIN)
  assert.equal(wind(state, 'red_a'), pool - 2 * CAMP.CARRIED_DRAIN, 'the carrier as well')
  assert.equal(state.log.ofType('campTiring').filter(e => e.side === 'red').length, 1, 'told once')
  // Pitched, the loss stops; struck and carried again, it begins at once.
  state.orderBook.set('red_a', { action: 'pitch', target: null, then: null })
  stepTurn(state, {})
  assert.equal(state.camps.red.status, 'pitched')
  const after = wind(state, 'red_b')
  stepTurn(state, {})
  assert.equal(wind(state, 'red_b'), after)
  state.orderBook.set('red_b', { action: 'strike', target: null, then: null })
  stepTurn(state, {})
  stepTurn(state, {})
  assert.equal(state.camps.red.carrier, 'red_b')
  assert.ok(wind(state, 'red_a') < after, 'no grace for a camp moved')
})

test('an undefended camp with an enemy in it is burned in one tick, and its own side knows at once: "your camp lay undefended"', () => {
  const units = [unit({ id: 'red_a', position: { x: 20, y: 5 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 7, y: 6 } })]
  const state = createBattleState(spec(units, { camps: { red: { at: { x: 6, y: 6 } } } }), { seed: 1 })
  stepTurn(state, {})
  assert.equal(state.camps.red.status, 'burned')
  const burned = state.log.ofType('campBurned')[0]
  assert.equal(burned.undefended, true)
  assert.equal(burned.by, 'blue_a')
  const { report } = require('../../../narrator/turnNarrator')
  const told = report({ map: state.map, side: 'red', ownIds: new Set(['red_a']), seenEnemyIds: new Set(), events: state.log.all() }).join('\n')
  assert.match(told, /Your camp lay undefended: you can see the flames rising, and you know your men will have no rest tonight/)
})

test('a defended camp takes a few hits: it falls only after CAMP.HITS ten-minute ticks with an enemy inside it', () => {
  const units = [unit({ id: 'red_a', position: { x: 6, y: 6 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 7, y: 6 } })]
  const state = createBattleState(spec(units, { camps: { red: { at: { x: 6, y: 6 } } } }), { seed: 1 })
  for (let i = 1; i < CAMP.HITS; i++) {
    stepTurn(state, { red: [{ unitRef: 'red_a', target: 'hold' }], blue: [{ unitRef: 'blue_a', target: 'hold' }] })
    assert.equal(state.camps.red.status, 'pitched', `still standing after ${i}`)
  }
  stepTurn(state, {})
  assert.equal(state.camps.red.status, 'burned')
  assert.equal(state.log.ofType('campAssailed').length, CAMP.HITS - 1)
  assert.equal(state.log.ofType('campBurned')[0].undefended, false)
})

test('a unit fighting from inside its own camp has a defensive bonus', () => {
  const units = [unit({ id: 'red_a', position: { x: 6, y: 6 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 8, y: 6 } })]
  const state = createBattleState(spec(units, { camps: { red: { at: { x: 6, y: 6 } } } }), { seed: 1 })
  const e = { aId: 'red_a', bId: 'blue_a' }
  camps.markEngagements(state, [e])
  assert.equal(e.aCampDefense, CAMP.DEFENSE)
  assert.equal(e.bCampDefense, undefined)
  assert.ok(R.defenseRating(units[0], { bonusDefense: CAMP.DEFENSE }) > R.defenseRating(units[0], {}))
})

test('broken troops run to their own camp, not for the field\'s edge, stop there, and rally the more easily', () => {
  // Its camp lies east, away from its own (west) edge; an enemy close
  // behind it, so it does not rally on the way.
  const units = [unit({ id: 'red_a', position: { x: 25, y: 5 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 22, y: 5 } })]
  const state = createBattleState(spec(units, { camps: { red: { at: { x: 30, y: 5 } } } }), { seed: 1 })
  state.broken.add('red_a')
  stepTurn(state, {})
  const a = state.world.units.find(u => u.id === 'red_a')
  assert.ok(a.position.x > 25, `it ran east, to its camp (at ${a.position.x})`)
  for (let i = 0; i < 6 && !camps.inOwnCamp(state, a); i++) stepTurn(state, {})
  assert.ok(camps.inOwnCamp(state, a), 'it reached its camp')
  assert.equal(state.fledUnits.length, 0)
  // Rallied there (no enemy within CAMP.SAFE_TILES), said to be in camp.
  for (let i = 0; i < 3 && state.broken.has('red_a'); i++) stepTurn(state, {})
  assert.equal(state.broken.has('red_a'), false)
  assert.equal(state.log.ofType('rallied').at(-1).inCamp, true)
})

test('with no camp standing, broken troops flee for the field\'s edge as before', () => {
  const units = [unit({ id: 'red_a', position: { x: 4, y: 5 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 6, y: 5 } })]
  const state = createBattleState(spec(units), { seed: 1 })
  state.broken.add('red_a')
  stepTurn(state, {})
  stepTurn(state, {})
  assert.equal(state.fledUnits.length, 1)
})

test('the unit carrying the camp breaking drops it where it stood: its own may take it up again, the enemy burn it', () => {
  // (An enemy near enough that the carrier does not rally at once.)
  const units = [unit({ id: 'red_a', position: { x: 10, y: 5 } }), unit({ id: 'red_b', position: { x: 10, y: 9 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 12, y: 5 } })]
  const state = createBattleState(spec(units, { camps: { red: { carrier: 'red_a' } } }), { seed: 1 })
  state.broken.add('red_a')
  stepTurn(state, {})
  assert.equal(state.camps.red.status, 'dropped')
  assert.deepEqual(state.camps.red.at, state.world.units.find(u => u.id === 'red_a').position, 'where they stood as the tick ended')
  const dropped = { ...state.camps.red.at }
  state.orderBook.set('red_b', { action: 'pitch', target: { x: 12, y: 9 }, then: null })
  for (let i = 0; i < 16 && state.camps.red.status !== 'pitched'; i++) stepTurn(state, {})
  assert.equal(state.log.ofType('campStruck')[0].unitId, 'red_b')
  assert.equal(state.camps.red.status, 'pitched')
  assert.deepEqual(state.camps.red.at, { x: 12, y: 9 })
  // Dropped again, with the enemy standing on it and none of its own
  // beside: burned.
  Object.assign(state.camps.red, { status: 'dropped', at: dropped, tiles: null })
  state.world.units.find(u => u.id === 'blue_a').position = { ...dropped }
  state.world.units.find(u => u.id === 'red_a').position = { x: 30, y: 2 }
  state.world.units.find(u => u.id === 'red_b').position = { x: 30, y: 10 }
  stepTurn(state, {})
  assert.equal(state.camps.red.status, 'burned')
})

test('an army with no steady unit left is not beaten while its camp stands to rally in; with it burned, it is', () => {
  const units = [unit({ id: 'red_a' }), unit({ id: 'blue_a', side: 'blue', position: { x: 35, y: 5 } })]
  const state = createBattleState(spec(units, { camps: { red: { at: { x: 2, y: 5 } }, blue: { at: { x: 38, y: 5 } } } }), { seed: 1 })
  const broken = new Set(['red_a'])
  const holds = (side) => camps.holdsOut(state, side)
  assert.equal(checkBattleOutcome(state.world, broken, () => false, holds).decided, false)
  state.camps.red.status = 'burned'
  assert.deepEqual(checkBattleOutcome(state.world, broken, () => false, holds), { decided: true, winner: 'blue', reason: 'enemy army broken' })
})

test('night does not end a camp battle: an army rests in its camp, wind and heart back; an army with none has no rest tonight', () => {
  const units = [unit({ id: 'red_a' }), unit({ id: 'blue_a', side: 'blue', position: { x: 35, y: 5 } })]
  const game = createGame(spec(units, { dayMinutes: 60, camps: { red: { at: { x: 5, y: 5 } } } }), { seed: 1 })
  game.battle.resolver.tire(units[0], 30)
  game.battle.resolver.shake(units[0], 40)
  game.battle.resolver.tire(units[1], 30)
  for (let i = 0; i < 12 && game.day === 1; i++) {
    submitOrders(game, 'red', [])
    submitOrders(game, 'blue', [])
  }
  assert.equal(game.outcome.decided, false)
  assert.equal(game.day, 2)
  assert.equal(game.history.at(-1).interrupt, 'night')
  const red = game.battle.resolver.getState('red_a')
  assert.equal(red.stamina, R.staminaPool(units[0]), 'rested: full wind')
  assert.equal(red.morale, 100, 'and heart')
  assert.ok(game.battle.resolver.getState('blue_a').stamina < R.staminaPool(units[1]) - 29, 'no rest: as tired as at nightfall')
  const rests = game.battle.log.ofType('campRest')
  assert.deepEqual(rests.map(r => [r.side, r.rested]), [['blue', false], ['red', true]])
  assert.equal(game.battle.log.ofType('nightPassed')[0].day, 2)
  assert.equal(game.battle.log.ofType('nightfall').length, 0, 'not the night that ends a battle')
})

test('a camp battle goes on day after day until CAMP.MAX_DAYS, and then ends as a draw, so every battle ends', () => {
  const units = [unit({ id: 'red_a' }), unit({ id: 'blue_a', side: 'blue', position: { x: 35, y: 5 } })]
  const game = createGame(spec(units, { dayMinutes: 30 }), { seed: 1 })
  for (let i = 0; i < 200 && !game.outcome.decided; i++) {
    submitOrders(game, 'red', [])
    submitOrders(game, 'blue', [])
  }
  assert.equal(game.outcome.decided, true)
  assert.deepEqual([game.outcome.winner, game.outcome.reason], ['draw', 'the days ran out'])
  assert.equal(game.day, CAMP.MAX_DAYS)
  assert.equal(game.battle.log.ofType('nightPassed').length, CAMP.MAX_DAYS - 1)
})

test('the enemy\'s camp is on a side\'s map only once its men have seen it; its own, always', () => {
  const units = [unit({ id: 'red_a', position: { x: 2, y: 5 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 38, y: 5 } })]
  const game = createGame(spec(units, { camps: { red: { at: { x: 3, y: 5 } }, blue: { at: { x: 37, y: 5 } } } }), { seed: 1 })
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  assert.equal(sideView(game, 'red').camps.enemy, null)
  assert.deepEqual(sideView(game, 'red').camps.own.at, { x: 3, y: 5 })
  // Walk up to it.
  for (let i = 0; i < 20 && !sideView(game, 'red').camps.enemy; i++) {
    submitOrders(game, 'red', i === 0 ? [{ unitRef: 'red_a', target: { x: 30, y: 5 } }] : [])
    submitOrders(game, 'blue', [])
  }
  assert.deepEqual(sideView(game, 'red').camps.enemy.at, { x: 37, y: 5 })
  assert.equal(game.battle.log.ofType('campFound')[0].side, 'red')
  assert.equal(sideView(game, 'blue').camps.enemy, null, 'the other side has not found red\'s')
})

test('a Commander among his own tents is not taken or killed while his camp stands', () => {
  const { stepCommanders } = require('../../command/commander')
  const world = { units: [unit({ id: 'red_a', strength: 10 }), unit({ id: 'blue_a', side: 'blue', position: { x: 6, y: 5 } })] }
  const events = [{ type: 'pursuit', unitId: 'red_a', by: 'blue_a' }]
  const run = (sheltered) => {
    const commanders = { red: { unitId: 'red_a', status: 'free', heldBy: null } }
    stepCommanders({ commanders, world, broken: new Set(['red_a']), fledUnits: [], events, mustered: new Map([['red_a', 100]]), random: () => 0, sheltered })
    return commanders.red.status
  }
  assert.notEqual(run(null), 'free', 'outside the camp, as before')
  assert.equal(run(() => true), 'free')
})

test('a Commander whose army is broken and holds out by its camp is safe as if in it; the camp\'s fall ends the battle', () => {
  const units = [unit({ id: 'red_a', position: { x: 20, y: 5 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 35, y: 5 } })]
  const state = createBattleState(spec(units, { camps: { red: { at: { x: 5, y: 5 } } } }), { seed: 1 })
  assert.equal(camps.sheltered(state, units[0]), false)
  state.broken.add('red_a')
  assert.equal(camps.sheltered(state, state.world.units[0]), true)
  state.camps.red.status = 'burned'
  assert.equal(camps.sheltered(state, state.world.units[0]), false)
})

test('at first light a Commander riding with a unit fought down to half its men or fewer rides out with his strongest unit', () => {
  const units = [unit({ id: 'red_a', strength: 30 }), unit({ id: 'red_b', position: { x: 5, y: 7 }, strength: 90 }), unit({ id: 'blue_a', side: 'blue', position: { x: 35, y: 5 } })]
  const game = createGame(spec(units, { dayMinutes: 30, commanders: { red: { unitId: 'red_a' } }, camps: { red: { at: { x: 5, y: 5 } } } }), { seed: 1 })
  game.battle.mustered.set('red_a', 100)
  game.battle.mustered.set('red_b', 100)
  for (let i = 0; i < 10 && game.day === 1; i++) {
    submitOrders(game, 'red', [])
    submitOrders(game, 'blue', [])
  }
  assert.equal(game.battle.commanders.red.unitId, 'red_b')
  const rode = game.battle.log.ofType('commanderRode').at(-1)
  assert.deepEqual([rode.from, rode.unitId, rode.atNight], ['red_a', 'red_b', true])
})

test('an army broken and sheltering in its standing camp is told so, and so is the enemy: "take the camp and the field is yours"', () => {
  const units = [unit({ id: 'red_a', position: { x: 5, y: 5 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 35, y: 5 } })]
  const state = createBattleState(spec(units, { camps: { red: { at: { x: 5, y: 5 } }, blue: { at: { x: 36, y: 5 } } } }), { seed: 1 })
  // Broken with no heart left: rallied there, it is still shaken.
  state.broken.add('red_a')
  state.resolver.shake(units[0], 90)
  stepTurn(state, {})
  stepTurn(state, {})
  assert.equal(state.log.ofType('campHoldsOut').length, 1, 'told once a spell')
  const { report } = require('../../../narrator/turnNarrator')
  const events = state.log.all()
  assert.match(report({ map: state.map, side: 'blue', ownIds: new Set(['blue_a']), seenEnemyIds: new Set(), events }).join('\n'), /Their army is broken and shelters in its camp: take the camp and the field is yours/)
  assert.match(report({ map: state.map, side: 'red', ownIds: new Set(['red_a']), seenEnemyIds: new Set(), events }).join('\n'), /Your army is broken and shelters in your camp/)
})

test('the computer comes and takes the camp of an army with no steady unit left, so a battle cannot hang on it', () => {
  const { planTurn } = require('../../../opponent/planner')
  const units = [
    unit({ id: 'red_a', position: { x: 5, y: 5 }, strength: 40 }),
    unit({ id: 'blue_a', side: 'blue', position: { x: 30, y: 5 } }), unit({ id: 'blue_b', side: 'blue', position: { x: 30, y: 7 } })
  ]
  const game = createGame(spec(units, { camps: { red: { at: { x: 5, y: 5 } }, blue: { at: { x: 36, y: 5 } } } }), { seed: 1 })
  game.battle.broken.add('red_a')
  for (let i = 0; i < 300 && !game.outcome.decided; i++) {
    submitOrders(game, 'red', [])
    submitOrders(game, 'blue', planTurn(game, 'blue'))
  }
  assert.equal(game.outcome.winner, 'blue')
  assert.equal(game.battle.camps.red.status, 'burned')
  assert.equal(game.day, 1, 'the same day')
})

test('a Commander whose own unit breaks, with his camp standing, rides back to it ahead of his men and is not caught running', () => {
  const units = [unit({ id: 'red_a', position: { x: 20, y: 5 } }), unit({ id: 'red_b', position: { x: 20, y: 7 } }), unit({ id: 'blue_a', side: 'blue', position: { x: 35, y: 5 } })]
  const state = createBattleState(spec(units, { camps: { red: { at: { x: 5, y: 5 } } } }), { seed: 1 })
  state.broken.add('red_a')
  assert.equal(camps.sheltered(state, state.world.units[0]), true, 'his men broken, the rest of the army steady')
  assert.equal(camps.sheltered(state, state.world.units[1]), false)
  state.camps.red.status = 'burned'
  assert.equal(camps.sheltered(state, state.world.units[0]), false, 'with no camp, as in any battle')
})

