// src/engine/battle/tests/pace.test.js
//
// The rulings of 2026-11-21 on how long a battle lasts and what becomes of
// broken units: a tick of a battle is a share of a combat round, a unit
// fighting several enemies splits its effort, a broken unit that gets clear
// rallies (once, with the morale it had), and morale comes back only when an
// enemy breaks nearby. Fixtures on an open 20x20 plain.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn, checkBattleOutcome } = require('../battle')
const { tables: T } = require('../../combat')

const MAP = { name: 'pace-20', width: 20, height: 20, terrain: {} }

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 2 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}

const battle = (units, extra = {}) => createBattleState({
  name: 'pace', map: MAP,
  sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } },
  units, maxTurns: 40, ...extra
})

const of = (state, type) => state.log.ofType(type)
const get = (state, id) => state.world.units.find(u => u.id === id)
const morale = (state, id) => state.resolver.getState(id)?.morale ?? T.MORALE.START
const advance = (id) => ({ unitRef: id, action: 'advance' })

// ── Pace ───────────────────────────────────────────────

const ticksToFirstRout = (extra) => {
  const state = battle([
    unit({ id: 'ours', position: { x: 10, y: 10 } }),
    unit({ id: 'theirs', side: 'blue', position: { x: 11, y: 10 } })
  ], extra)
  for (let tick = 1; tick <= 40; tick++) {
    stepTurn(state, tick === 1 ? { red: [advance('ours')], blue: [advance('theirs')] } : {})
    if (of(state, 'rout').length > 0) return tick
  }
  return Infinity
}

test('an even fight lasts the better part of an hour, not three ticks', () => {
  const ticks = ticksToFirstRout()
  assert.ok(ticks >= 5 && ticks <= 12, `first rout after ${ticks} ticks`)
  assert.ok(ticksToFirstRout({ combatPace: 1 }) < ticks, 'a whole round a tick, the old pace, is quicker')
})

// ── Split effort ───────────────────────────────────────

test('a unit fighting two enemies deals each less, and suffers more, than in a duel', () => {
  const after = (withSecond) => {
    const units = [
      unit({ id: 'one', side: 'blue', position: { x: 10, y: 10 } }),
      unit({ id: 'left', position: { x: 9, y: 10 } })
    ]
    if (withSecond) units.push(unit({ id: 'right', position: { x: 11, y: 10 } }))
    const state = battle(units)
    stepTurn(state, { red: [{ unitRef: 'everyone', action: 'advance' }] })
    return state
  }
  const duel = after(false)
  const twoOnOne = after(true)
  assert.ok(morale(twoOnOne, 'left') > morale(duel, 'left'), 'the one cannot give each enemy its full weight')
  assert.ok(morale(twoOnOne, 'one') < morale(duel, 'one'), 'and takes the blows of both')
})

// ── Rallying ───────────────────────────────────────────

// A slow unit (one tile a tick) broken three tiles from a standing enemy,
// running north for its edge.
const routedUnit = (overrides = {}) => {
  const state = battle([
    unit({ id: 'runner', side: 'blue', position: { x: 10, y: 10 }, movementRange: 1, ...overrides }),
    unit({ id: 'victor', position: { x: 10, y: 13 } })
  ])
  state.broken.add('runner')
  state.resolver.shake(get(state, 'runner'), 80)
  return state
}

test('a broken unit that gets clear of the enemy rallies, with the morale it had and no order', () => {
  const state = routedUnit()
  for (let i = 0; i < 6; i++) stepTurn(state, {})
  const rallied = of(state, 'rallied')
  assert.equal(rallied.length, 1)
  // Three tiles away at the start, one more each tick: clear (more than
  // SAFE_TILES off) on the fourth.
  assert.equal(rallied[0].turn, 4)
  assert.equal(state.broken.has('runner'), false)
  assert.equal(morale(state, 'runner'), 20, 'rallying brings back order, not heart')
  assert.equal(state.orderBook.get('runner'), undefined)
  assert.deepEqual(get(state, 'runner').position, rallied[0].at, 'it stands where it formed up')
})

test('it rallies once: a unit that breaks again is gone, and one cut to pieces never forms up', () => {
  const state = routedUnit()
  for (let i = 0; i < 6; i++) stepTurn(state, {})
  state.broken.add('runner')
  for (let i = 0; i < 6 && !state.outcome.decided; i++) stepTurn(state, {})
  assert.equal(of(state, 'rallied').length, 1)
  assert.deepEqual(state.outcome, { decided: true, winner: 'red', reason: 'enemy army broken' })

  const remnant = routedUnit({ strength: 25 })
  stepTurn(remnant, {})
  assert.equal(of(remnant, 'rallied').length, 0)
  assert.equal(remnant.outcome.decided, true, 'with no one able to rally, the field is lost at once')
})

test('the field is not won while a broken enemy may yet rally', () => {
  const state = routedUnit()
  stepTurn(state, {})
  assert.equal(state.outcome.decided, false)
  assert.equal(checkBattleOutcome(state.world, state.broken, state.rallied).decided, false)
})

// ── Taking heart ───────────────────────────────────────

test('an enemy breaking lifts the morale of those near enough to see it, and no one else', () => {
  const state = battle([
    unit({ id: 'wall', position: { x: 10, y: 10 }, quality: 'elite', primaryWeapon: 'great_axe' }),
    unit({ id: 'near', position: { x: 10, y: 13 } }),
    unit({ id: 'far', position: { x: 2, y: 18 } }),
    unit({ id: 'levy', side: 'blue', position: { x: 11, y: 10 }, quality: 'levy', armor: 'no_armor', shield: 'no_shield', primaryWeapon: 'daggers' })
  ])
  state.resolver.shake(get(state, 'near'), 30)
  state.resolver.shake(get(state, 'far'), 30)
  for (let i = 0; i < 20 && of(state, 'rout').length === 0; i++) stepTurn(state, i === 0 ? { red: [advance('wall')] } : {})

  assert.equal(of(state, 'rout')[0].unitId, 'levy')
  assert.deepEqual(of(state, 'heartened').map(e => e.unitId), ['near', 'wall'])
  assert.equal(morale(state, 'near'), 70 + T.HEART.MORALE)
  assert.equal(morale(state, 'far'), 70, 'too far off to know of it')
  assert.ok(morale(state, 'wall') <= T.MORALE.START, 'never above where it began')
})

// ── A shaken unit and the standing advance ─────────────

test('a rallied unit still shaken keeps out of a standing advance while steadier units remain', () => {
  const field = (withSteady) => {
    const units = [
      unit({ id: 'shaken', side: 'blue', position: { x: 10, y: 3 } }),
      unit({ id: 'enemy', position: { x: 10, y: 17 } })
    ]
    if (withSteady) units.push(unit({ id: 'steady', side: 'blue', position: { x: 12, y: 3 } }))
    const state = battle(units, { standingOrders: { blue: 'advance' } })
    state.rallied.set('shaken', 1)
    state.resolver.shake(get(state, 'shaken'), 80)
    stepTurn(state, {})
    return state
  }
  const behind = field(true)
  assert.deepEqual(get(behind, 'shaken').position, { x: 10, y: 3 }, 'it holds behind the line')
  assert.notDeepEqual(get(behind, 'steady').position, { x: 12, y: 3 }, 'the steady unit goes forward')

  const alone = field(false)
  assert.notDeepEqual(get(alone, 'shaken').position, { x: 10, y: 3 }, 'with no one to stand behind, it goes forward')
})
