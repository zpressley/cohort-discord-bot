// src/engine/battle/tests/ranged.test.js
//
// Missile fire (ruled 2026-11-21): who shoots, at whom, when, and what it
// does. Fixtures on an open 20x20 plain with a wood in columns 5-9 of rows
// 5-9.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { createGame, submitOrders } = require('../../orchestrator')
const { tables: T, ranged } = require('../../combat')
const { toLabel } = require('../../map/labels')

const forest = []
for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) forest.push(toLabel({ x, y }))
const MAP = { name: 'ranged-20', width: 20, height: 20, terrain: { forest } }

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 2 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}
const archers = (overrides = {}) => unit({
  id: 'archers', role: 'archers', primaryWeapon: 'greek_composite_bow', armor: 'light_armor', shield: 'no_shield', ...overrides
})

const SPEC = { name: 'ranged', map: MAP, sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } }, maxTurns: 40 }
const battle = (units, extra = {}) => createBattleState({ ...SPEC, units, ...extra })
const of = (state, type) => state.log.ofType(type)
const get = (state, id) => state.world.units.find(u => u.id === id)
const morale = (state, id) => state.resolver.getState(id)?.morale ?? T.MORALE.START

// ── Who shoots, and how far ────────────────────────────

test('bows, slings and crossbows shoot; javelins and swords do not', () => {
  assert.equal(ranged.missileRange(archers()), 8, 'a composite bow reaches 200 m')
  assert.equal(ranged.missileRange(unit({ primaryWeapon: 'self_bow_basic' })), 5)
  assert.equal(ranged.missileRange(unit({ primaryWeapon: 'sling' })), 8, 'a sling reaches 200 m, as a composite bow does')
  assert.equal(ranged.missileRange(unit({ primaryWeapon: 'roman_pilum' })), 0, 'thrown in the charge, not shot')
  assert.equal(ranged.missileRange(unit()), 0)
})

test('a volley is light, and lighter against armour, shields, distance and trees', () => {
  const shot = (target, about = {}) => ranged.volley(archers(), unit(target), { distance: 3, ...about })
  const base = shot({})
  assert.ok(base > 2 && base < 5, `a hundred bowmen fell ${base.toFixed(1)} men in medium armour`)
  assert.ok(shot({ armor: 'no_armor' }) > base)
  assert.ok(shot({ armor: 'heavy_armor' }) < base)
  assert.ok(shot({ shield: 'heavy_shield' }) < base)
  assert.ok(shot({}, { distance: 7 }) < base, 'past half its reach')
  assert.ok(shot({}, { targetTerrain: 'forest' }) < base)
  assert.ok(shot({}, { inMelee: true }) < base)
  assert.equal(shot({}, { distance: 9 }), 0, 'out of reach')
})

// ── The missile step ───────────────────────────────────

test('archers standing still shoot the enemy in reach, every tick, and it tells on morale', () => {
  const state = battle([archers({ position: { x: 12, y: 15 } }), unit({ id: 'foe', side: 'blue', position: { x: 12, y: 11 } })])
  for (let i = 0; i < 3; i++) stepTurn(state, {})
  const volleys = of(state, 'volley')
  assert.equal(volleys.length, 3)
  assert.deepEqual([volleys[0].unitId, volleys[0].by, volleys[0].distance], ['foe', 'archers', 4])
  const felled = volleys.reduce((n, v) => n + v.killed, 0)
  assert.equal(get(state, 'foe').strength, 100 - felled)
  assert.ok(felled >= 6 && felled <= 12, `${felled} men in three volleys`)
  assert.ok(morale(state, 'foe') < 100)
  assert.equal(get(state, 'archers').strength, 100, 'swordsmen do not shoot back')
})

test('no volley: out of reach, out of sight, on the march, in a melee, hidden, or told to hold fire', () => {
  const volleysAfter = (units, orders = {}, ticks = 1) => {
    const state = battle(units)
    for (let i = 0; i < ticks; i++) stepTurn(state, i === 0 ? orders : {})
    return of(state, 'volley').filter(v => v.by === 'archers').length
  }
  const foe = (position) => unit({ id: 'foe', side: 'blue', position })
  const here = { x: 12, y: 15 }

  assert.equal(volleysAfter([archers({ position: here }), foe({ x: 12, y: 5 })]), 0, 'ten tiles off: out of sight and reach')
  assert.equal(volleysAfter([archers({ position: here }), foe({ x: 7, y: 7 })]), 0, 'deep in the wood: not seen')
  assert.equal(volleysAfter([archers({ position: here }), foe({ x: 12, y: 11 })], { red: [{ unitRef: 'archers', target: { x: 14, y: 15 } }] }), 0, 'marching')
  assert.equal(volleysAfter([archers({ position: here }), foe({ x: 12, y: 11 })], { red: [{ unitRef: 'archers', action: 'hold', holdFire: true }] }, 3), 0, 'holding fire, and still holding it')
  assert.equal(volleysAfter([archers({ position: here }), foe({ x: 12, y: 14 })], { blue: [{ unitRef: 'foe', action: 'advance' }] }), 0, 'in a melee themselves')
  assert.equal(volleysAfter([archers({ position: here, mounted: true }), foe({ x: 12, y: 11 })], { red: [{ unitRef: 'archers', target: { x: 14, y: 15 } }] }), 1, 'horse archers shoot as they ride')
})

test('an enemy locked in a melee can be shot at, to less effect, and no friend is harmed', () => {
  const state = battle([
    archers({ position: { x: 12, y: 16 } }),
    unit({ id: 'line', position: { x: 12, y: 13 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 12, y: 12 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'line', action: 'advance' }] })
  const [volley] = of(state, 'volley')
  assert.deepEqual([volley.unitId, volley.by], ['foe', 'archers'])
  const exchange = of(state, 'exchange')[0]
  const line = exchange.a.unitId === 'line' ? exchange.a : exchange.b
  assert.equal(get(state, 'line').strength, 100 - line.killed, 'the line lost only what the melee cost it')
})

test('told what to shoot first, they shoot it though another enemy is nearer', () => {
  const field = (order) => {
    const state = battle([
      archers({ position: { x: 12, y: 15 } }),
      unit({ id: 'foot', side: 'blue', position: { x: 12, y: 12 } }),
      unit({ id: 'horse', side: 'blue', position: { x: 14, y: 12 }, mounted: true })
    ])
    stepTurn(state, order ? { red: [order] } : {})
    return of(state, 'volley')[0].unitId
  }
  assert.equal(field(null), 'foot', 'the nearest, left to themselves')
  assert.equal(field({ unitRef: 'archers', action: 'hold', against: 'cavalry' }), 'horse')
})

test('a unit already near breaking breaks under fire, and those who see it take heart', () => {
  const state = battle([
    archers({ position: { x: 12, y: 15 } }),
    unit({ id: 'friend', position: { x: 14, y: 15 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 12, y: 11 } }),
    unit({ id: 'anchor', side: 'blue', position: { x: 2, y: 1 } })
  ])
  state.resolver.shake(get(state, 'foe'), 72)
  state.resolver.shake(get(state, 'friend'), 30)
  stepTurn(state, {})
  assert.deepEqual(of(state, 'rout').map(e => [e.unitId, e.by]), [['foe', 'archers']])
  assert.equal(state.broken.has('foe'), true)
  assert.equal(morale(state, 'friend'), 70 + T.HEART.MORALE)
})

test('archers told to press the enemy close to shooting range and stand there', () => {
  const state = battle([
    archers({ position: { x: 12, y: 18 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 12, y: 4 } })
  ])
  stepTurn(state, { red: [{ unitRef: 'archers', action: 'advance' }] })
  for (let i = 0; i < 6; i++) stepTurn(state, {})
  const gap = get(state, 'foe').position.y - get(state, 'archers').position.y
  assert.ok(Math.abs(gap) >= 4, `they stand off ${Math.abs(gap)} tiles and do not close to a melee`)
  assert.ok(of(state, 'volley').length >= 3)
  assert.equal(of(state, 'contact').length, 0)
})

test('a volley ends the player turn, like contact', () => {
  const game = createGame({ ...SPEC, seed: 1, turns: [], units: [archers({ position: { x: 12, y: 15 } }), unit({ id: 'foe', side: 'blue', position: { x: 12, y: 11 } })] })
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  assert.equal(game.history[0].interrupt, 'fire')
  assert.equal(game.history[0].ticks.length, 1)
})
