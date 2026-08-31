// src/phase3-movement/tests/movement.test.js
//
// Phase 3's rules, pinned. The roadmap's exit criterion — six units a side
// through five turns with zero collision anomalies — is the last test in the
// file; the ones before it pin the individual rules that make it hold.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createWorld, livingUnits } = require('../../phase2-combat/harness/world')
const {
  resolveSimultaneousMovement,
  initiativeTier, inInitiativeOrder,
  buildOccupancy, canEnter,
  resolveUnitReference, expandOrders
} = require('../index')

function unit(overrides = {}) {
  return {
    id: 'u',
    side: 'red',
    position: 'D4',
    strength: 100,
    maxStrength: 100,
    movementRange: 3,
    quality: 'professional',
    armor: 'medium_armor',
    shield: 'medium_shield',
    role: 'heavy_infantry',
    ...overrides
  }
}

// The invariant every movement test closes with: no two living units share a
// tile. This is the "zero collision anomalies" the exit criterion names.
function assertNoCoOccupancy(world, label = '') {
  const seen = new Map()
  for (const u of livingUnits(world)) {
    const holder = seen.get(u.position)
    assert.ok(!holder, `${label} ${holder} and ${u.id} both stand on ${u.position}`)
    seen.set(u.position, u.id)
  }
}

// ── Initiative ─────────────────────────────────────────

test('initiative runs scouts, cavalry, light, medium, heavy, siege — in that order', () => {
  const roster = [
    unit({ id: 'siege', role: 'siege', armor: 'no_armor' }),
    unit({ id: 'heavy', armor: 'heavy_armor' }),
    unit({ id: 'horse', mounted: true, armor: 'heavy_armor' }),
    unit({ id: 'light', armor: 'light_armor' }),
    unit({ id: 'medium', armor: 'medium_armor' }),
    unit({ id: 'scout', role: 'scout', armor: 'no_armor' })
  ]
  assert.deepEqual(inInitiativeOrder(roster).map(u => u.id),
    ['scout', 'horse', 'light', 'medium', 'heavy', 'siege'])
})

test('a mounted unit is cavalry-fast whatever armour it wears', () => {
  assert.equal(initiativeTier(unit({ mounted: true, armor: 'heavy_armor' })), 1)
})

test('ties inside a tier break by unit id, not roster order', () => {
  const a = unit({ id: 'alpha' })
  const b = unit({ id: 'beta' })
  assert.deepEqual(inInitiativeOrder([b, a]).map(u => u.id), ['alpha', 'beta'])
  assert.deepEqual(inInitiativeOrder([a, b]).map(u => u.id), ['alpha', 'beta'])
})

// ── Occupancy ──────────────────────────────────────────

test('one unit per tile: the occupancy index refuses nobody but tells the truth', () => {
  const world = createWorld({
    units: [unit({ id: 'a', position: 'D4' }), unit({ id: 'b', side: 'blue', position: 'D5' })]
  })
  const occ = buildOccupancy(world)

  assert.equal(canEnter(occ, world.units[0], 'D6').ok, true)
  const enemy = canEnter(occ, world.units[0], 'D5')
  assert.equal(enemy.ok, false)
  assert.equal(enemy.reason, 'enemy')
})

test('a destroyed unit does not hold ground', () => {
  const world = createWorld({
    units: [unit({ id: 'a' }), unit({ id: 'dead', side: 'blue', position: 'D5', strength: 0 })]
  })
  const occ = buildOccupancy(world)
  assert.equal(canEnter(occ, world.units[0], 'D5').ok, true)
})

// ── Simultaneous resolution ────────────────────────────

test('two units racing for one tile: the faster one takes it', () => {
  // scout (tier 0) and heavy infantry (tier 4), equidistant from F4.
  const world = createWorld({
    units: [
      unit({ id: 'zz_scout', role: 'scout', armor: 'no_armor', position: 'F2', side: 'red' }),
      unit({ id: 'aa_heavy', armor: 'heavy_armor', position: 'F6', side: 'red' })
    ]
  })
  const results = resolveSimultaneousMovement(world, [
    { unitId: 'zz_scout', target: 'F4' },
    { unitId: 'aa_heavy', target: 'F4' }
  ])

  const scout = results.find(r => r.unitId === 'zz_scout')
  const heavy = results.find(r => r.unitId === 'aa_heavy')

  assert.equal(scout.to, 'F4', 'the scout claims the tile despite sorting later by id')
  assert.notEqual(heavy.to, 'F4')
  assert.equal(heavy.blockedBy, 'zz_scout')
  assertNoCoOccupancy(world)
})

test('a column follows its own vanguard through the same ground', () => {
  // Three friendlies nose-to-tail, all ordered forward. Unit-by-unit
  // resolution would leave the followers blocked by a leader that has already
  // finished; tick interleaving lets the column flow.
  const world = createWorld({
    units: [
      unit({ id: 'a_lead', position: 'D5' }),
      unit({ id: 'b_mid', position: 'D4' }),
      unit({ id: 'c_rear', position: 'D3' })
    ]
  })
  resolveSimultaneousMovement(world, [
    { unitId: 'a_lead', target: 'D8' },
    { unitId: 'b_mid', target: 'D7' },
    { unitId: 'c_rear', target: 'D6' }
  ])

  const at = (id) => world.units.find(u => u.id === id).position
  assert.equal(at('a_lead'), 'D8')
  assert.equal(at('b_mid'), 'D7')
  assert.equal(at('c_rear'), 'D6')
  assertNoCoOccupancy(world)
})

test('head-on units cannot swap tiles — they stop facing each other', () => {
  const world = createWorld({
    units: [
      unit({ id: 'a', position: 'D4', side: 'red' }),
      unit({ id: 'b', position: 'D5', side: 'blue' })
    ]
  })
  resolveSimultaneousMovement(world, [
    { unitId: 'a', target: 'D5' },
    { unitId: 'b', target: 'D4' }
  ])

  const at = (id) => world.units.find(u => u.id === id).position
  assert.equal(at('a'), 'D4')
  assert.equal(at('b'), 'D5')
  assertNoCoOccupancy(world)
})

test('an enemy in the path stops the move at once — walking into an enemy is contact, not movement', () => {
  const world = createWorld({
    units: [
      unit({ id: 'a', position: 'D4', side: 'red' }),
      unit({ id: 'wall', position: 'D6', side: 'blue' })
    ]
  })
  const results = resolveSimultaneousMovement(world, [{ unitId: 'a', target: 'D8' }])
  const a = results.find(r => r.unitId === 'a')

  assert.equal(a.to, 'D5', 'stopped adjacent to the enemy')
  assert.equal(a.blockedBy, 'wall')
})

test('a friendly blocker gets one tick to clear before the mover gives up', () => {
  // 'still' holds its ground and never moves; 'mover' should stop rather than
  // wait forever.
  const world = createWorld({
    units: [
      unit({ id: 'mover', position: 'D4' }),
      unit({ id: 'still', position: 'D5' })
    ]
  })
  const results = resolveSimultaneousMovement(world, [
    { unitId: 'mover', target: 'D7' },
    { unitId: 'still', target: 'hold' }
  ])
  const mover = results.find(r => r.unitId === 'mover')

  assert.equal(mover.to, 'D4', 'no way through a friend who is holding')
  assert.equal(mover.blockedBy, 'still')
})

test('movement budgets and terrain costs are respected exactly as in phase 1', () => {
  const world = createWorld({ units: [unit({ id: 'a', position: 'D4', movementRange: 3 })] })
  const results = resolveSimultaneousMovement(world, [{ unitId: 'a', target: 'D10' }])
  const a = results[0]

  assert.ok(a.tilesMoved <= 3, 'plains cost 1 each; range 3 moves at most 3 tiles')
  assert.ok(a.movementRemaining >= 0)
})

test('orders for missing or dead units are skipped, never thrown', () => {
  const world = createWorld({ units: [unit({ id: 'dead', strength: 0 })] })
  assert.doesNotThrow(() => {
    const results = resolveSimultaneousMovement(world, [
      { unitId: 'ghost', target: 'D5' },
      { unitId: 'dead', target: 'D5' }
    ])
    assert.equal(results.find(r => r.unitId === 'ghost').skipped, 'no such unit')
    assert.equal(results.find(r => r.unitId === 'dead').skipped, 'destroyed')
  })
})

test('movement is deterministic — same world, same orders, same result', () => {
  const build = () => createWorld({
    units: [
      unit({ id: 'a', position: 'D4' }),
      unit({ id: 'b', position: 'F4', armor: 'light_armor' }),
      unit({ id: 'c', position: 'H4', side: 'blue' })
    ]
  })
  const orders = [
    { unitId: 'a', target: 'G4' },
    { unitId: 'b', target: 'G4' },
    { unitId: 'c', target: 'E4' }
  ]
  const once = resolveSimultaneousMovement(build(), orders)
  const twice = resolveSimultaneousMovement(build(), orders)
  assert.deepEqual(once, twice)
})

// ── Multi-unit addressing ──────────────────────────────

test('"everyone" addresses the whole side and only that side', () => {
  const mine = [unit({ id: 'a' }), unit({ id: 'b' })]
  const match = resolveUnitReference('everyone', mine)
  assert.equal(match.units.length, 2)
  assert.equal(match.matchedBy, 'everyone')
})

test('aliases from unitState resolve, article and case ignored', () => {
  const legion = unit({ id: 'rom1', aliases: ['the legionaries', 'the romans'] })
  const match = resolveUnitReference('The Legionaries', [legion, unit({ id: 'other' })])
  assert.deepEqual(match.units.map(u => u.id), ['rom1'])
  assert.equal(match.matchedBy, 'alias')
})

test('"the archers" matches every archer unit, singular or plural', () => {
  const roster = [
    unit({ id: 'arch1', role: 'archers' }),
    unit({ id: 'arch2', role: 'archer' }),
    unit({ id: 'foot', role: 'heavy_infantry' })
  ]
  const match = resolveUnitReference('the archers', roster)
  assert.deepEqual(match.units.map(u => u.id).sort(), ['arch1', 'arch2'])
})

test('a reference matching nothing comes back with a reason, not a throw', () => {
  const match = resolveUnitReference('the elephants', [unit({ id: 'a' })])
  assert.equal(match.units.length, 0)
  assert.ok(match.reason.includes('elephants'))
})

test('expandOrders: a later order countermands an earlier one for the same unit', () => {
  const roster = [unit({ id: 'arch1', role: 'archers' })]
  const { orders } = expandOrders([
    { unitRef: 'everyone', target: 'D9' },
    { unitRef: 'the archers', target: 'F2' }
  ], roster)
  assert.deepEqual(orders, [{ unitId: 'arch1', target: 'F2' }])
})

test('expandOrders reports unresolved references instead of dropping them silently', () => {
  const { orders, unresolved } = expandOrders([
    { unitRef: 'the war elephants', target: 'D9' }
  ], [unit({ id: 'a' })])
  assert.equal(orders.length, 0)
  assert.equal(unresolved.length, 1)
})

// ── The exit criterion ─────────────────────────────────

test('exit: six units a side, five turns, zero collision anomalies', () => {
  // Two forces converge on the map centre through each other's space —
  // deliberately congested so every rule above gets exercised at once.
  const red = [
    unit({ id: 'red_scout', role: 'scout', armor: 'no_armor', position: 'C3', movementRange: 5 }),
    unit({ id: 'red_horse', mounted: true, armor: 'light_armor', position: 'C5', movementRange: 5 }),
    unit({ id: 'red_arch', role: 'archers', armor: 'light_armor', position: 'C7' }),
    unit({ id: 'red_inf1', position: 'C9' }),
    unit({ id: 'red_inf2', position: 'C11' }),
    unit({ id: 'red_heavy', armor: 'heavy_armor', position: 'C13' })
  ]
  const blue = [
    unit({ id: 'blue_scout', side: 'blue', role: 'scout', armor: 'no_armor', position: 'T3', movementRange: 5 }),
    unit({ id: 'blue_horse', side: 'blue', mounted: true, armor: 'light_armor', position: 'T5', movementRange: 5 }),
    unit({ id: 'blue_arch', side: 'blue', role: 'archers', armor: 'light_armor', position: 'T7' }),
    unit({ id: 'blue_inf1', side: 'blue', position: 'T9' }),
    unit({ id: 'blue_inf2', side: 'blue', position: 'T11' }),
    unit({ id: 'blue_heavy', side: 'blue', armor: 'heavy_armor', position: 'T13' })
  ]
  const world = createWorld({ units: [...red, ...blue] })

  const targets = { red: 'N8', blue: 'H8' } // past each other — they must interpenetrate
  for (let turn = 1; turn <= 5; turn++) {
    const orders = livingUnits(world).map(u => ({ unitId: u.id, target: targets[u.side] }))
    const results = resolveSimultaneousMovement(world, orders)

    assertNoCoOccupancy(world, `turn ${turn}:`)

    for (const r of results) {
      if (r.skipped || r.held || r.failed) continue
      // Paths must be contiguous: each traversed tile adjacent to the last.
      let prev = r.from
      for (const step of r.tilesTraversed) {
        const dist = tileDistanceStr(prev, step.coord)
        assert.equal(dist, 1, `turn ${turn}: ${r.unitId} jumped ${prev} -> ${step.coord}`)
        prev = step.coord
      }
      assert.equal(prev, r.to, `turn ${turn}: ${r.unitId} report does not end where the unit stands`)
    }
  }

  // After five turns of converging through a shared corridor, everybody is
  // still exactly one-per-tile and every unit still exists.
  assert.equal(livingUnits(world).length, 12)
  assertNoCoOccupancy(world, 'final:')
})

function tileDistanceStr(a, b) {
  const { tileDistance } = require('../../phase2-combat/harness/world')
  return tileDistance(a, b)
}
