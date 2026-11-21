// src/engine/battle/tests/pace.test.js
//
// The rulings of 2026-11-21 on how a battle can last and what becomes of
// broken units: a unit fighting several enemies splits its effort, a broken
// unit that gets clear rallies (as often as it is fit to, with the morale it
// had), and morale comes back only when an enemy breaks nearby. Damage a
// tick is as it was. Fixtures on an open 20x20 plain.

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

test('a tick of a battle is a whole combat round, unless the battle asks for a slower pace', () => {
  const ticks = ticksToFirstRout()
  assert.ok(ticks <= 6, `first rout after ${ticks} ticks: the fighting is as sharp as it was`)
  assert.ok(ticksToFirstRout({ combatPace: 0.4 }) > ticks, 'combatPace slows every fight')
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
// running north for its edge. A steady unit of its side stands far off, so
// the battle goes on.
const routedUnit = (overrides = {}, others = [unit({ id: 'anchor', side: 'blue', position: { x: 18, y: 1 } })]) => {
  const state = battle([
    unit({ id: 'runner', side: 'blue', position: { x: 10, y: 10 }, movementRange: 1, ...overrides }),
    unit({ id: 'victor', position: { x: 10, y: 13 } }),
    ...others
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

test('it can rally again: what stops a unit is how worn it is, not how often it has run', () => {
  const state = routedUnit()
  for (let i = 0; i < 6; i++) stepTurn(state, {})
  state.broken.add('runner')
  for (let i = 0; i < 2; i++) stepTurn(state, {})
  assert.equal(of(state, 'rallied').length, 2)
  assert.equal(state.rallied.get('runner'), 2)
  assert.equal(state.outcome.decided, false)
})

test('a unit too worn does not form up', () => {
  // Professionals need 30% of their men when fresh.
  const remnant = routedUnit({ strength: 25 })
  for (let i = 0; i < 6; i++) stepTurn(remnant, {})
  assert.equal(of(remnant, 'rallied').length, 0)

  const holdingOn = routedUnit({ strength: 35 })
  for (let i = 0; i < 6; i++) stepTurn(holdingOn, {})
  assert.equal(of(holdingOn, 'rallied').length, 1)
})

test('an army is beaten when it has no steady unit left: shaken units cannot carry a battle', () => {
  // The same rout with no one else on the field: the runner's side is beaten
  // the moment it breaks, and rallying would not change that.
  const alone = routedUnit({}, [])
  stepTurn(alone, {})
  assert.deepEqual(alone.outcome, { decided: true, winner: 'red', reason: 'enemy army broken' })

  // With a steady unit beside it, the side fights on; when that unit breaks
  // too, the rallied one does not keep the battle going.
  const state = routedUnit()
  for (let i = 0; i < 6; i++) stepTurn(state, {})
  assert.equal(state.isShaken(get(state, 'runner')), true)
  assert.equal(state.outcome.decided, false)
  state.broken.add('anchor')
  stepTurn(state, {})
  assert.deepEqual(state.outcome, { decided: true, winner: 'red', reason: 'enemy army broken' })
})

test('experience lowers the bar, and fatigue raises it', () => {
  const fit = (overrides, tire = 0) => {
    const state = battle([unit({ id: 'x', ...overrides }), unit({ id: 'foe', side: 'blue', position: { x: 18, y: 18 } })])
    if (tire) state.resolver.tire(get(state, 'x'), tire)
    return state.resolver.canRally(get(state, 'x'))
  }
  // Half their men gone.
  assert.equal(fit({ strength: 50, quality: 'levy' }), false, 'levies do not come back from that')
  assert.equal(fit({ strength: 50, quality: 'professional' }), true)
  assert.equal(fit({ strength: 25, quality: 'professional' }), false)
  assert.equal(fit({ strength: 25, quality: 'elite' }), true, 'the best re-form from a quarter')
  // What a veteran unit has earned counts like its tier.
  assert.equal(fit({ strength: 50, quality: 'levy', veteranResistance: 0.5 }), true)
  // Spent men need more of their number: 35 fresh professionals rally, 35
  // exhausted ones do not.
  assert.equal(fit({ strength: 35 }), true)
  assert.equal(fit({ strength: 35 }, 10000), false)
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

test('a rallied unit still shaken keeps out of a standing advance; heart taken, it rejoins', () => {
  const state = battle([
    unit({ id: 'shaken', side: 'blue', position: { x: 10, y: 3 } }),
    unit({ id: 'steady', side: 'blue', position: { x: 12, y: 3 } }),
    unit({ id: 'enemy', position: { x: 10, y: 17 } })
  ], { standingOrders: { blue: 'advance' } })
  state.rallied.set('shaken', 1)
  state.resolver.shake(get(state, 'shaken'), 80)
  stepTurn(state, {})
  assert.deepEqual(get(state, 'shaken').position, { x: 10, y: 3 }, 'it holds behind the line')
  assert.notDeepEqual(get(state, 'steady').position, { x: 12, y: 3 }, 'the steady unit goes forward')

  state.resolver.hearten(get(state, 'shaken'), 10)
  stepTurn(state, {})
  assert.notDeepEqual(get(state, 'shaken').position, { x: 10, y: 3 }, 'above the rout line again, it goes forward too')
})
