// src/engine/battle/tests/skirmish.test.js
//
// Fire and retreat (ruled 2026-11-24; docs/design/army-balance.md part 7):
// a missile unit pressing the enemy closes to where it can shoot, stands and
// shoots, and falls back before men it can outmarch who come at it; it
// shoots again when it stands. Red's home edge is the south (y 19), so red
// falls back southward.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { canSkirmish, outruns, fallBack } = require('../skirmish')
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
const horseArchers = (overrides = {}) => slingers({ id: 'riders', primaryWeapon: 'self_bow_basic', mounted: true, movementRange: 5, ...overrides })
const foe = (overrides = {}) => unit({ id: 'foe', side: 'blue', position: { x: 10, y: 6 }, ...overrides })

const SPEC = { name: 'skirmish', map: MAP, sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } }, maxTurns: 40 }
const battle = (units, extra = {}) => createBattleState({ ...SPEC, units, ...extra })
const of = (state, type) => state.log.ofType(type)
const get = (state, id) => state.world.units.find(u => u.id === id)
const stamina = (state, id) => state.resolver.getState(id)?.stamina ?? R.staminaPool(get(state, id))
const press = (...ids) => ({ red: ids.filter(i => i !== 'foe').map(unitRef => ({ unitRef, action: 'advance' })), blue: [{ unitRef: 'foe', action: 'advance' }] })

// ── Who falls back, and from whom ──────────────────────

test('every missile unit fires and retreats, whatever its armour; men with no missile weapon do not', () => {
  assert.equal(canSkirmish(slingers()), true)
  assert.equal(canSkirmish(slingers({ armor: 'medium_armor' })), true, 'crossbowmen in mail too')
  assert.equal(canSkirmish(unit({ armor: 'light_armor' })), false, 'spearmen do not shoot')
})

test('a unit falls back only from men its march beats: horse from foot; no kit makes a man slower', () => {
  assert.equal(outruns(horseArchers(), foe({ armor: 'heavy_armor' })), true)
  assert.equal(outruns(horseArchers(), foe({ armor: 'light_armor' })), true)
  assert.equal(outruns(slingers(), foe({ armor: 'heavy_armor' })), false, 'hoplites ran at Marathon')
  assert.equal(outruns(slingers(), foe({ armor: 'light_armor' })), false)
  assert.equal(outruns(horseArchers(), foe({ mounted: true, movementRange: 5 })), false)
})

// ── Fire and retreat ───────────────────────────────────

test('horse archers pressing the enemy fall back before foot coming at them, and are not caught', () => {
  const state = battle([horseArchers(), foe()])
  stepTurn(state, press('riders'))
  for (let i = 0; i < 3; i++) stepTurn(state, {})
  const gave = of(state, 'gaveGround')
  assert.ok(gave.length >= 1, `fell back ${gave.length} times`)
  assert.deepEqual(gave[0].from, ['foe'])
  assert.ok(get(state, 'riders').position.y > 10, 'toward their own side of the field')
  assert.equal(of(state, 'contact').length, 0)
})

test('horse archers shoot as they ride, as they did before fire and retreat', () => {
  const state = battle([horseArchers(), foe()])
  stepTurn(state, press('riders'))
  for (let i = 0; i < 3; i++) stepTurn(state, {})
  const shotAt = new Set(of(state, 'volley').filter(v => v.by === 'riders').map(v => v.turn))
  assert.ok(of(state, 'gaveGround').some(g => shotAt.has(g.turn)), 'a tick they fell back and shot')
})

test('falling back costs no more than any march', () => {
  const state = battle([horseArchers(), foe()])
  const full = stamina(state, 'riders')
  const chaser = stamina(state, 'foe')
  stepTurn(state, press('riders'))
  assert.equal(of(state, 'gaveGround').length, 1)
  assert.equal(stamina(state, 'riders'), full)
  assert.equal(stamina(state, 'foe'), chaser, 'nor does the chase')
})

test('men on foot do not shoot on the move: foot that fall back shoot only when they stand again', () => {
  // A foot unit made faster than the men chasing it, to see it fall back.
  const state = battle([slingers({ movementRange: 4 }), foe()])
  stepTurn(state, press('slingers'))
  assert.equal(of(state, 'gaveGround').length, 1)
  assert.equal(of(state, 'volley').filter(v => v.by === 'slingers').length, 0)
})

test('foot missile troops stand before foot coming at them, shoot, and are caught', () => {
  const state = battle([slingers(), foe({ armor: 'heavy_armor', shield: 'light_shield', position: { x: 10, y: 4 } })])
  stepTurn(state, press('slingers'))
  for (let i = 0; i < 4; i++) stepTurn(state, {})
  assert.equal(of(state, 'gaveGround').length, 0)
  assert.ok(of(state, 'volley').filter(v => v.by === 'slingers').length >= 1)
  assert.ok(of(state, 'contact').length > 0)
})

test('horse archers stand before horse, and are caught', () => {
  const state = battle([horseArchers(), foe({ mounted: true, movementRange: 5, position: { x: 10, y: 4 } })])
  stepTurn(state, press('riders'))
  for (let i = 0; i < 3; i++) stepTurn(state, {})
  assert.equal(of(state, 'gaveGround').length, 0)
  assert.ok(of(state, 'contact').length > 0)
})

test('a unit told to hold its ground does not fall back', () => {
  const state = battle([horseArchers(), foe()])
  stepTurn(state, { red: [{ unitRef: 'riders', action: 'hold' }], blue: [{ unitRef: 'foe', action: 'advance' }] })
  for (let i = 0; i < 2; i++) stepTurn(state, {})
  assert.equal(of(state, 'gaveGround').length, 0)
  assert.ok(of(state, 'contact').length > 0)
})

test('a unit already fighting does not fall back', () => {
  const state = battle([horseArchers(), foe({ position: { x: 10, y: 9 } })])
  stepTurn(state, { red: [{ unitRef: 'riders', action: 'hold' }], blue: [{ unitRef: 'foe', action: 'advance' }] })
  assert.ok(of(state, 'contact').length > 0)
  stepTurn(state, press('riders'))
  assert.equal(of(state, 'gaveGround').length, 0)
})

test('with the edge of the field at their backs they have nowhere to go, and stand', () => {
  const corridor = resolveMap({ name: 'corridor', width: 1, height: 20, terrain: {} })
  const here = horseArchers({ position: { x: 0, y: 19 } })
  const there = foe({ position: { x: 0, y: 16 } })
  assert.equal(fallBack(here, [there], { map: corridor }), null)
  const open = resolveMap(MAP)
  assert.ok(fallBack({ ...here, position: { x: 10, y: 15 } }, [{ ...there, position: { x: 10, y: 12 } }], { map: open }))
})

test('missile troops told to press close to shooting distance, not to blows', () => {
  const state = battle([slingers({ position: { x: 10, y: 18 } }), foe({ position: { x: 10, y: 2 } })])
  stepTurn(state, { red: [{ unitRef: 'slingers', action: 'advance' }] })
  for (let i = 0; i < 8; i++) stepTurn(state, {})
  const gap = get(state, 'slingers').position.y - get(state, 'foe').position.y
  assert.ok(gap >= 4, `they stop ${gap} tiles off`)
  assert.equal(of(state, 'contact').length, 0)
  assert.ok(of(state, 'volley').filter(v => v.by === 'slingers').length >= 2)
})

test('a battle with no missile troops in it has no falling back', () => {
  const state = battle([unit({ id: 'line' }), foe()])
  stepTurn(state, { red: [{ unitRef: 'line', action: 'advance' }], blue: [{ unitRef: 'foe', action: 'advance' }] })
  for (let i = 0; i < 4; i++) stepTurn(state, {})
  assert.equal(of(state, 'gaveGround').length, 0)
  assert.ok(of(state, 'contact').length > 0)
})
