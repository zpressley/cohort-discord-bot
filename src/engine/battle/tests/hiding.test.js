// src/engine/battle/tests/hiding.test.js
//
// Hiding and checking (ruled 2026-10-22 and 28). Hiding takes a turn
// standing still; the ground and the unit decide how well it works; moving
// or fighting gives a unit away; checking takes a turn and finds what the
// checker could see if no one were hiding.
//
// Fixtures on a generated 20x20 plain: a wood fills columns 5-9 of rows 5-9,
// a marsh columns 15-17 of rows 15-17, and one ford at M3 (12,2).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { coverFor } = require('../hiding')
const { createMap } = require('../../map/map')
const { canSee } = require('../../map/sight')
const { toLabel } = require('../../map/labels')

const block = (x0, x1, y0, y1) => {
  const out = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(toLabel({ x, y }))
  return out
}
const DEF = {
  name: 'hiding-20', width: 20, height: 20,
  cells: { M3: { terrain: 'ford' } },
  terrain: { forest: block(5, 9, 5, 9), marsh: block(15, 17, 15, 17) }
}
const map = createMap(DEF)

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
  name: 'hiding', map: DEF,
  sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } },
  units, maxTurns: 10, ...extra
})
const of = (state, type) => state.log.ofType(type)
const at = (x, y) => ({ x, y })

// ── The table ──────────────────────────────────────────

test('the ground decides how well a unit hides', () => {
  const row = (x, y, extra = {}) => coverFor(map, unit({ position: at(x, y), ...extra }))
  assert.equal(row(7, 7).name, 'woods')
  assert.equal(row(7, 7).seenWithin, 0, 'in the woods only a search finds it')
  assert.equal(row(16, 16).name, 'marsh')
  assert.ok(row(16, 16).cost.staminaPerTurn > 0, 'the marsh wears men down')
  assert.equal(row(4, 7).name, 'edge', 'the field beside the trees')
  assert.equal(row(4, 7).seenWithin, 2)
  assert.equal(row(12, 14).name, 'open')
  assert.equal(row(12, 14).seenWithin, 4)
  assert.equal(row(12, 2).seenWithin, null, 'no hiding on a ford')
})

test('cavalry and big bodies of men hide one row worse', () => {
  const horse = coverFor(map, unit({ position: at(7, 7), mounted: true }))
  assert.equal(horse.name, 'woods')
  assert.equal(horse.seenWithin, 2, 'horses in the trees are seen from 2 tiles')
  assert.match(horse.words, /horses/)
  assert.equal(coverFor(map, unit({ position: at(12, 14), strength: 200 })).seenWithin, null,
    'a 200-man body cannot hide in open ground')
})

// ── Hiding in a battle ─────────────────────────────────

test('hiding takes a turn; then even an enemy 1 tile away does not see the unit', () => {
  const state = battle([unit({ id: 'lurker', position: at(7, 7) }), unit({ id: 'far', side: 'blue', position: at(18, 2) })])
  stepTurn(state, { red: [{ unitRef: 'lurker', action: 'hide' }] })
  assert.deepEqual(of(state, 'hidden').map(e => [e.unitId, e.cover]), [['lurker', 'woods']])

  const cover = state.hidden.get('lurker')
  const neighbour = unit({ side: 'blue', position: at(7, 8) })
  assert.equal(canSee(map, neighbour, state.world.units[0], { seenWithin: cover.seenWithin }), false)
})

test('told to hide somewhere else, it goes there first and hides the turn after', () => {
  const state = battle([unit({ id: 'lurker', position: at(3, 7) }), unit({ id: 'far', side: 'blue', position: at(18, 2) })])
  stepTurn(state, { red: [{ unitRef: 'lurker', action: 'hide', target: at(5, 7) }] })
  assert.equal(of(state, 'hidden').length, 0, 'still on the move')
  stepTurn(state, {})
  assert.equal(of(state, 'hidden').length, 1)
})

test('moving gives a hidden unit away', () => {
  const state = battle([unit({ id: 'lurker', position: at(7, 7) }), unit({ id: 'far', side: 'blue', position: at(18, 2) })])
  stepTurn(state, { red: [{ unitRef: 'lurker', action: 'hide' }] })
  stepTurn(state, { red: [{ unitRef: 'lurker', target: at(7, 9) }] })
  assert.deepEqual(of(state, 'revealed').map(e => [e.unitId, e.reason]), [['lurker', 'moved']])
  assert.equal(state.hidden.has('lurker'), false)
})

test('an enemy looking for a fight walks right past a hidden unit', () => {
  // Blue advances on red's only visible unit, down column E past the hidden
  // force in the wood's edge at F8.
  const state = battle([
    unit({ id: 'lurker', position: at(5, 7) }),
    unit({ id: 'bait', position: at(4, 1) }),
    unit({ id: 'hunter', side: 'blue', position: at(4, 12) })
  ])
  stepTurn(state, { red: [{ unitRef: 'lurker', action: 'hide' }, { unitRef: 'bait', target: 'hold' }] })
  assert.equal(state.hidden.has('lurker'), true)
  for (let i = 0; i < 2; i++) stepTurn(state, { blue: [{ unitRef: 'hunter', action: 'advance' }] })
  const hunter = state.world.units.find(u => u.id === 'hunter')
  assert.ok(hunter.position.y < 7, 'it went on past the trees')
  assert.equal(of(state, 'exchange').filter(e => [e.a.unitId, e.b.unitId].includes('lurker')).length, 0)
  assert.equal(state.hidden.has('lurker'), true, 'and never knew')
})

test('checking finds what is hidden within sight: in a wood, 1 tile', () => {
  const setup = (scoutAt) => {
    const state = battle([
      unit({ id: 'lurker', position: at(7, 7) }),
      unit({ id: 'scout', side: 'blue', role: 'scout', position: at(14, 2) }),
      unit({ id: 'far', side: 'blue', position: at(18, 18) })
    ])
    stepTurn(state, { red: [{ unitRef: 'lurker', action: 'hide' }], blue: [{ unitRef: 'scout', target: 'hold' }] })
    assert.equal(state.hidden.has('lurker'), true)
    // The scout comes up while the lurker lies hidden (placed, to keep the
    // fixture to the search itself).
    state.world.units.find(u => u.id === 'scout').position = scoutAt
    stepTurn(state, { blue: [{ unitRef: 'scout', action: 'check' }] })
    return state
  }
  const close = setup(at(7, 9))
  assert.equal(close.hidden.has('lurker'), true, 'two tiles off in the trees: not found')

  const state = setup(at(7, 8))
  const checked = of(state, 'checked')
  assert.deepEqual(checked.map(e => [e.unitId, e.found]), [['scout', ['lurker']]])
  assert.deepEqual(of(state, 'revealed').map(e => [e.unitId, e.reason, e.by]), [['lurker', 'found', 'scout']])
  assert.equal(state.orderBook.get('scout').action, 'hold', 'a search is one turn, then the scout holds')
})

test('no hiding where there is no cover, and none in plain view of the enemy', () => {
  const ford = battle([unit({ id: 'wader', position: at(12, 2) }), unit({ id: 'far', side: 'blue', position: at(18, 18) })])
  stepTurn(ford, { red: [{ unitRef: 'wader', action: 'hide' }] })
  assert.deepEqual(of(ford, 'hideFailed').map(e => e.reason), ['no cover'])
  assert.equal(ford.orderBook.get('wader').action, 'hold')

  const watched = battle([unit({ id: 'lurker', position: at(4, 7) }), unit({ id: 'eyes', side: 'blue', position: at(4, 12) })])
  stepTurn(watched, { red: [{ unitRef: 'lurker', action: 'hide' }] })
  assert.deepEqual(of(watched, 'hideFailed').map(e => [e.reason, e.by]), [['watched', 'eyes']])
  assert.equal(watched.orderBook.get('lurker').action, 'hide', 'it keeps trying')
})

test('hiding in the marsh wears a unit down', () => {
  const state = battle([unit({ id: 'reeds', position: at(16, 16) }), unit({ id: 'far', side: 'blue', position: at(2, 2) })])
  const fresh = state.resolver.snapshot().reeds
  stepTurn(state, { red: [{ unitRef: 'reeds', action: 'hide' }] })
  stepTurn(state, {})
  const after = state.resolver.snapshot().reeds
  assert.equal(fresh, undefined, 'untouched before')
  assert.ok(after.stamina < require('../../combat/ratings').staminaPool(state.world.units[0]))
})

test('walking into a hidden unit gives it away', () => {
  const state = battle([
    unit({ id: 'lurker', position: at(7, 7) }),
    unit({ id: 'walker', side: 'blue', position: at(7, 9), movementRange: 6 }),
    unit({ id: 'far', side: 'red', position: at(18, 18) })
  ])
  stepTurn(state, { red: [{ unitRef: 'lurker', action: 'hide' }], blue: [{ unitRef: 'walker', target: 'hold' }] })
  // Hidden from 2 tiles in the trees.
  assert.equal(state.hidden.has('lurker'), true)
  stepTurn(state, { blue: [{ unitRef: 'walker', target: at(7, 5) }] })
  assert.deepEqual(of(state, 'revealed').map(e => [e.unitId, e.reason, e.by]), [['lurker', 'stumbled on', 'walker']])
})
