// src/engine/battle/tests/thrown.test.js
//
// Second weapons (docs/design/army-balance.md, part 8): javelins, pila and
// the like, carried beside a hand weapon, are thrown once as a unit comes
// to blows, closing or closed on, and a unit has only so many throws.
// Fixtures on an open 20x20 plain.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { tables: T, ranged } = require('../../combat')

const MAP = { name: 'thrown-20', width: 20, height: 20, terrain: {} }
const SPEC = { name: 'thrown', map: MAP, sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } }, maxTurns: 40 }

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 10, y: 14 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'roman_gladius',
    armor: 'medium_armor', shield: 'heavy_shield',
    ...overrides
  }
}
const legion = (overrides = {}) => unit({ id: 'legion', thrown: 'roman_pilum', ...overrides })
const foe = (overrides = {}) => unit({ id: 'foe', side: 'blue', position: { x: 10, y: 10 }, primaryWeapon: 'spear_basic', quality: 'militia', shield: 'medium_shield', ...overrides })
const battle = (units) => createBattleState({ ...SPEC, units })
const get = (state, id) => state.world.units.find(u => u.id === id)
const thrownBy = (state, id) => state.log.ofType('thrown').filter(e => e.by === id)

test('a unit with pila throws them once as it closes, then fights hand to hand', () => {
  const state = battle([legion(), foe()])
  stepTurn(state, { red: [{ unitRef: 'legion', action: 'advance' }] })
  stepTurn(state, {})
  stepTurn(state, {})
  const throws = thrownBy(state, 'legion')
  assert.equal(throws.length, 1, 'one throw at contact, not one a tick')
  assert.deepEqual([throws[0].unitId, throws[0].weapon], ['foe', 'roman_pilum'])
  assert.ok(throws[0].killed > 0, `${throws[0].killed} men felled`)
  const contact = state.log.ofType('contact')[0]
  assert.equal(throws[0].turn, contact.turn, 'thrown on the tick they came to blows')
  assert.ok(state.log.ofType('exchange').length >= 2, 'and the fight goes on hand to hand')
  assert.equal(get(state, 'legion').throws, T.THROWN.THROWS - 1)
})

test('a unit closed on throws too: the javelins meet the charge', () => {
  const state = battle([legion({ position: { x: 10, y: 14 } }), foe({ position: { x: 10, y: 10 } })])
  stepTurn(state, { red: [{ unitRef: 'legion', action: 'hold' }], blue: [{ unitRef: 'foe', action: 'advance' }] })
  stepTurn(state, {})
  assert.equal(thrownBy(state, 'legion').length, 1)
})

test('throwing in the charge is not firing on the move: men on foot who marched to contact still throw', () => {
  const state = battle([legion({ position: { x: 10, y: 14 } }), foe({ position: { x: 10, y: 11 } })])
  stepTurn(state, { red: [{ unitRef: 'legion', action: 'advance' }], blue: [{ unitRef: 'foe', action: 'hold' }] })
  const moved = state.log.ofType('move').some(m => m.unitId === 'legion')
  assert.ok(moved, 'the legion marched this tick')
  assert.equal(thrownBy(state, 'legion').length, 1)
})

test('a unit has only so many throws: with none left it closes without throwing', () => {
  const state = battle([legion({ throws: 0 }), foe()])
  for (let i = 0; i < 3; i++) stepTurn(state, { red: [{ unitRef: 'legion', action: 'advance' }] })
  assert.equal(thrownBy(state, 'legion').length, 0)
  assert.ok(T.THROWN.THROWS >= 1 && T.THROWN.THROWS <= 3, 'a few, not a quiver')
})

test('a unit carrying javelins it has no throws left of fights exactly as one that never had them', () => {
  const run = (u) => {
    const state = battle([u, foe()])
    for (let i = 0; i < 8; i++) stepTurn(state, { red: [{ unitRef: 'legion', action: 'advance' }] })
    return JSON.stringify(state.log.all().map(({ ...e }) => e))
  }
  assert.equal(run(legion({ throws: 0 })), run(unit({ id: 'legion' })))
})

test('a thrown volley is a close volley of its own weapon: pila tell on armour as light javelins do not', () => {
  const at = foe()
  const pila = ranged.thrownVolley(legion({ throws: 2 }), at)
  const light = ranged.thrownVolley(legion({ thrown: 'light_javelin', throws: 2 }), at)
  assert.ok(pila > light, `pila ${pila.toFixed(1)}, light javelins ${light.toFixed(1)}`)
  assert.ok(pila > 4 && pila < 15, `a hundred legionaries fell ${pila.toFixed(1)} men in mail with their pila`)
  assert.equal(ranged.thrownVolley(legion({ throws: 0 }), at), 0)
  assert.equal(ranged.thrownVolley(unit(), at), 0, 'nothing to throw')
})

test('thrown weapons are no missile weapon: a unit with javelins does not shoot from a distance', () => {
  const state = battle([legion({ position: { x: 10, y: 14 } }), foe({ position: { x: 10, y: 12 } })])
  stepTurn(state, { red: [{ unitRef: 'legion', action: 'hold' }], blue: [{ unitRef: 'foe', action: 'hold' }] })
  assert.equal(state.log.ofType('volley').length, 0)
  assert.equal(thrownBy(state, 'legion').length, 0)
  assert.equal(ranged.missileRange(legion()), 0)
})
