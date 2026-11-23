// src/engine/battle/tests/skirmish.test.js
//
// Skirmishing (a proposal, docs/design/army-balance.md part 6; not yet
// ruled): light missile troops pressing the enemy give ground before slower
// men who come at them, and shoot as they go. Red's home edge is the south
// (y 19), so red gives ground southward.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { canSkirmish, outruns, fallBack } = require('../skirmish')
const { tables: T, ranged } = require('../../combat')
const { resolveMap } = require('../../map/map')
const R = require('../../combat/ratings')

const MAP = { name: 'skirmish-20', width: 20, height: 20, terrain: {} }

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 10, y: 10 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'spear_basic',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}
const slingers = (overrides = {}) => unit({ id: 'slingers', primaryWeapon: 'sling', armor: 'light_armor', shield: 'no_shield', ...overrides })
const foe = (overrides = {}) => unit({ id: 'foe', side: 'blue', position: { x: 10, y: 6 }, ...overrides })

const SPEC = { name: 'skirmish', map: MAP, sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } }, maxTurns: 40 }
const battle = (units, extra = {}) => createBattleState({ ...SPEC, units, ...extra })
const of = (state, type) => state.log.ofType(type)
const get = (state, id) => state.world.units.find(u => u.id === id)
const stamina = (state, id) => state.resolver.getState(id)?.stamina ?? R.staminaPool(get(state, id))
const press = (...ids) => ({ red: ids.filter(i => i !== 'foe').map(unitRef => ({ unitRef, action: 'advance' })), blue: [{ unitRef: 'foe', action: 'advance' }] })

// ── Who skirmishes ─────────────────────────────────────

test('a skirmisher is a missile unit in light armour or none', () => {
  assert.equal(canSkirmish(slingers()), true)
  assert.equal(canSkirmish(slingers({ armor: 'no_armor' })), true)
  assert.equal(canSkirmish(slingers({ armor: 'medium_armor' })), false, 'crossbowmen in mail stand')
  assert.equal(canSkirmish(unit({ armor: 'light_armor' })), false, 'spearmen do not shoot')
})

test('horse outrun foot; light foot outrun foot in mail or plate; nothing outruns horse or light foot', () => {
  const horseArchers = slingers({ primaryWeapon: 'self_bow_basic', mounted: true, movementRange: 5 })
  assert.equal(outruns(horseArchers, foe({ armor: 'light_armor' })), true)
  assert.equal(outruns(slingers(), foe({ armor: 'medium_armor' })), true)
  assert.equal(outruns(slingers(), foe({ armor: 'heavy_armor' })), true)
  assert.equal(outruns(slingers(), foe({ armor: 'light_armor' })), false)
  assert.equal(outruns(slingers(), foe({ mounted: true, movementRange: 5, armor: 'heavy_armor' })), false)
  assert.equal(outruns(horseArchers, foe({ mounted: true, movementRange: 5 })), false)
})

// ── Giving ground ──────────────────────────────────────

test('light missile troops pressing the enemy give ground before slower men coming at them, and are not caught', () => {
  const state = battle([slingers(), foe()])
  stepTurn(state, press('slingers'))
  for (let i = 0; i < 3; i++) stepTurn(state, {})
  const gave = of(state, 'gaveGround')
  assert.ok(gave.length >= 3, `gave ground ${gave.length} times`)
  assert.deepEqual(gave[0].from, ['foe'])
  assert.ok(get(state, 'slingers').position.y > 10, 'toward their own side of the field')
  assert.equal(of(state, 'contact').length, 0)
})

test('foot who gave ground shoot as they go, at a lesser rate than standing', () => {
  const state = battle([slingers(), foe()])
  stepTurn(state, press('slingers'))
  const shot = of(state, 'volley').filter(v => v.by === 'slingers')
  assert.equal(shot.length, 1)
  const target = foe()
  const standing = ranged.volley(slingers(), target, { distance: 4 })
  const running = ranged.volley(slingers(), target, { distance: 4, moved: true })
  assert.equal(running, standing * T.SKIRMISH.ON_FOOT)
})

test('they stand before men as fast as they are, and are caught', () => {
  const state = battle([slingers(), foe({ armor: 'light_armor', shield: 'light_shield' })])
  stepTurn(state, press('slingers'))
  for (let i = 0; i < 3; i++) stepTurn(state, {})
  assert.equal(of(state, 'gaveGround').length, 0)
  assert.ok(of(state, 'contact').length > 0)
})

test('horse archers give ground before any foot', () => {
  const horseArchers = slingers({ id: 'riders', primaryWeapon: 'self_bow_basic', mounted: true, movementRange: 5 })
  const state = battle([horseArchers, foe({ armor: 'light_armor', shield: 'light_shield' })])
  stepTurn(state, press('riders'))
  for (let i = 0; i < 3; i++) stepTurn(state, {})
  assert.ok(of(state, 'gaveGround').length >= 1)
  assert.equal(of(state, 'contact').length, 0)
})

test('a unit told to hold its ground does not give ground', () => {
  const state = battle([slingers(), foe()])
  stepTurn(state, { red: [{ unitRef: 'slingers', action: 'hold' }], blue: [{ unitRef: 'foe', action: 'advance' }] })
  for (let i = 0; i < 2; i++) stepTurn(state, {})
  assert.equal(of(state, 'gaveGround').length, 0)
  assert.ok(of(state, 'contact').length > 0)
})

test('a unit already fighting does not give ground', () => {
  const state = battle([slingers(), foe({ position: { x: 10, y: 9 } })])
  stepTurn(state, { red: [{ unitRef: 'slingers', action: 'hold' }], blue: [{ unitRef: 'foe', action: 'advance' }] })
  assert.ok(of(state, 'contact').length > 0)
  stepTurn(state, press('slingers'))
  assert.equal(of(state, 'gaveGround').length, 0)
})

test('running tires them, and spent men run no more', () => {
  const state = battle([slingers(), foe()])
  const full = stamina(state, 'slingers')
  stepTurn(state, press('slingers'))
  assert.equal(stamina(state, 'slingers'), full - T.SKIRMISH.WIND)

  const spent = battle([slingers(), foe()])
  const pool = stamina(spent, 'slingers')
  spent.resolver.tire(get(spent, 'slingers'), pool * (1 - T.SKIRMISH.SPENT) + 1)
  stepTurn(spent, press('slingers'))
  assert.equal(of(spent, 'gaveGround').length, 0)
})

test('men who chase skirmishers they cannot catch are winded, the heavier their kit the more', () => {
  const winded = (kit) => {
    const state = battle([slingers(), foe(kit)])
    const full = stamina(state, 'foe')
    stepTurn(state, press('slingers'))
    assert.equal(of(state, 'gaveGround').length, 1)
    return full - stamina(state, 'foe')
  }
  const mail = winded({ armor: 'medium_armor', shield: 'medium_shield' })
  const plate = winded({ armor: 'heavy_armor', shield: 'heavy_shield' })
  assert.ok(mail > 0)
  assert.ok(plate > mail, `${plate} against ${mail}`)
})

test('with the edge of the field at their backs they have nowhere to go, and stand', () => {
  const corridor = resolveMap({ name: 'corridor', width: 1, height: 20, terrain: {} })
  const here = slingers({ position: { x: 0, y: 19 } })
  const there = foe({ position: { x: 0, y: 16 } })
  assert.equal(fallBack(here, [there], { map: corridor }), null)
  const open = resolveMap(MAP)
  assert.ok(fallBack({ ...here, position: { x: 10, y: 15 } }, [{ ...there, position: { x: 10, y: 12 } }], { map: open }))
})

test('skirmishers told to press close to shooting distance, not to blows', () => {
  const state = battle([slingers({ position: { x: 10, y: 18 } }), foe({ position: { x: 10, y: 2 } })])
  stepTurn(state, { red: [{ unitRef: 'slingers', action: 'advance' }] })
  for (let i = 0; i < 5; i++) stepTurn(state, {})
  const gap = get(state, 'slingers').position.y - get(state, 'foe').position.y
  assert.ok(gap >= ranged.missileRange(slingers()) - 1, `they stop ${gap} tiles off`)
  assert.equal(of(state, 'contact').length, 0)
})

test('a battle with no skirmisher in it has no giving ground', () => {
  const state = battle([unit({ id: 'line' }), foe()])
  stepTurn(state, { red: [{ unitRef: 'line', action: 'advance' }], blue: [{ unitRef: 'foe', action: 'advance' }] })
  for (let i = 0; i < 4; i++) stepTurn(state, {})
  assert.equal(of(state, 'gaveGround').length, 0)
  assert.ok(of(state, 'contact').length > 0)
})
