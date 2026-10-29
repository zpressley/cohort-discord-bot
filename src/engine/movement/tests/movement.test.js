// src/engine/movement/tests/movement.test.js
//
// Phase 3's rules, pinned. The roadmap's exit criterion — six units a side
// through five turns with zero collision anomalies — is the last test in the
// file; the ones before it pin the individual rules that make it hold.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createWorld, livingUnits } = require('../../world')
const {
  resolveSimultaneousMovement: resolveOn,
  initiativeTier, inInitiativeOrder,
  buildOccupancy, canEnter, crowdingTier, crowdingByUnit, crowdedRange,
  resolveUnitReference, expandOrders
} = require('../index')
const { resolveMap } = require('../../map/map')
const { toLabel, toPosition } = require('../../map/labels')
const { CROWDING } = require('../../combat/tables')

// These rules were written on Crownhill. Positions are compared as labels so
// the expected values stay readable.
const map = resolveMap('crownhill')
const resolveSimultaneousMovement = (world, orders) => resolveOn(world, orders, map)

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

// The invariant every movement test closes with: enemies never share a tile,
// and no tile holds more men than the crowding cap. This is the "zero
// collision anomalies" the exit criterion names. (Before Stage 3 the rule was
// one unit per tile; friends may now share.)
function assertNoCoOccupancy(world, label = '') {
  const tiles = new Map()
  for (const u of livingUnits(world)) {
    const key = toLabel(u.position)
    if (!tiles.has(key)) tiles.set(key, [])
    tiles.get(key).push(u)
  }
  for (const [tile, units] of tiles) {
    const sidesHere = new Set(units.map(u => u.side))
    assert.equal(sidesHere.size, 1, `${label} enemies share ${tile}: ${units.map(u => u.id).join(', ')}`)
    const men = units.reduce((sum, u) => sum + u.strength, 0)
    assert.ok(men <= CROWDING.CAP, `${label} ${tile} holds ${men} men, over the cap`)
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

test('the occupancy index: enemies refused, friends admitted while there is room', () => {
  const world = createWorld({
    units: [unit({ id: 'a', position: 'D4' }), unit({ id: 'b', side: 'blue', position: 'D5' })]
  })
  const occ = buildOccupancy(world)

  assert.equal(canEnter(occ, world.units[0], toPosition('D6')).ok, true)
  const enemy = canEnter(occ, world.units[0], toPosition('D5'))
  assert.equal(enemy.ok, false)
  assert.equal(enemy.reason, 'enemy')

  const friend = createWorld({ units: [unit({ id: 'a', position: 'D4' }), unit({ id: 'f', position: 'D5' })] })
  const shared = canEnter(buildOccupancy(friend), friend.units[0], toPosition('D5'))
  assert.equal(shared.ok, true, 'friends share while there is room')
  assert.equal(shared.shared, true)
})

test('a destroyed unit does not hold ground', () => {
  const world = createWorld({
    units: [unit({ id: 'a' }), unit({ id: 'dead', side: 'blue', position: 'D5', strength: 0 })]
  })
  const occ = buildOccupancy(world)
  assert.equal(canEnter(occ, world.units[0], toPosition('D5')).ok, true)
})

// ── Simultaneous resolution ────────────────────────────

test('two friends racing for one tile both get there and share it', () => {
  // scout (tier 0) and heavy infantry (tier 4), equidistant from F4. Before
  // Stage 3 the scout took the tile and the heavy was shut out.
  const world = createWorld({
    units: [
      unit({ id: 'zz_scout', role: 'scout', armor: 'no_armor', position: 'F2', side: 'red' }),
      unit({ id: 'aa_heavy', armor: 'heavy_armor', position: 'F6', side: 'red' })
    ]
  })
  resolveSimultaneousMovement(world, [
    { unitId: 'zz_scout', target: 'F4' },
    { unitId: 'aa_heavy', target: 'F4' }
  ])
  const at = (id) => toLabel(world.units.find(u => u.id === id).position)
  assert.equal(at('zz_scout'), 'F4')
  assert.equal(at('aa_heavy'), 'F4')
  assert.equal(crowdingByUnit(world).get('aa_heavy').name, 'compressed', '200 men on one tile')
  assertNoCoOccupancy(world)
})

test('a full tile: the fastest fill it, the next is shut out', () => {
  // Three 100-man units already make 300, the cap. A fourth cannot join.
  const world = createWorld({
    units: [
      unit({ id: 'a', position: 'F4' }), unit({ id: 'b', position: 'F4' }), unit({ id: 'c', position: 'F4' }),
      unit({ id: 'late', position: 'F6' })
    ]
  })
  resolveSimultaneousMovement(world, [
    { unitId: 'a', target: 'hold' }, { unitId: 'b', target: 'hold' }, { unitId: 'c', target: 'hold' },
    { unitId: 'late', target: 'F4' }
  ])
  assert.notEqual(toLabel(world.units.find(u => u.id === 'late').position), 'F4')
  assertNoCoOccupancy(world)
})

test('crowding: tiers by men on a shared tile, never for a unit alone', () => {
  assert.equal(crowdingTier(100, 1).name, 'organized')
  assert.equal(crowdingTier(300, 1).name, 'organized', 'a lone unit is never crowded')
  assert.equal(crowdingTier(140, 2).name, 'crowded', 'two worn units crowd cheaply')
  assert.equal(crowdingTier(200, 2).name, 'compressed')
  assert.equal(crowdingTier(240, 3).name, 'crushing')
  assert.equal(crowdingTier(300, 3).name, 'critical')
})

test('crowding slows a unit a little, never below one tile of open ground', () => {
  // Ruled 2026-10-29: crowding punishes fighting packed together more than
  // moving. Movement losses are 0/10/25/50%.
  const unit3 = { movementRange: 3 }
  assert.equal(crowdedRange(unit3, crowdingTier(100, 1)), 3)
  assert.equal(crowdedRange(unit3, crowdingTier(140, 2)), 3, 'crowded: no slower')
  assert.equal(crowdedRange(unit3, crowdingTier(200, 2)), 2.7)
  assert.equal(crowdedRange(unit3, crowdingTier(300, 3)), 1.5)
  assert.equal(crowdedRange({ movementRange: 1.5 }, crowdingTier(300, 3)), 1, 'the floor is 1')

  // On the map: two units share H4 and are compressed, so each moves 2.7,
  // two tiles of open field, where alone it would move three.
  const world = createWorld({ units: [unit({ id: 'a', position: 'H4' }), unit({ id: 'b', position: 'H4' })] })
  const results = resolveSimultaneousMovement(world, [{ unitId: 'a', target: 'H10' }])
  assert.equal(results.find(r => r.unitId === 'a').tilesMoved, 2)
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

  const at = (id) => toLabel(world.units.find(u => u.id === id).position)
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

  const at = (id) => toLabel(world.units.find(u => u.id === id).position)
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

  assert.equal(toLabel(a.to), 'D5', 'stopped adjacent to the enemy')
  assert.equal(a.blockedBy, 'wall')
})

test('an enemy that comes up beside a unit stops it: it turns to fight, not walk on', () => {
  // The horse (faster, moves first) steps next to the infantry. The
  // infantry, ordered to where the horse stood, must not walk away out of
  // contact. Before this rule the two could circle each other for ever.
  const world = createWorld({
    units: [
      unit({ id: 'horse', mounted: true, armor: 'light_armor', position: 'J7', side: 'red', movementRange: 5 }),
      // One step a turn, as if packed in a crowd: it can step away but not round.
      unit({ id: 'foot', position: 'K8', side: 'blue', movementRange: 1 })
    ]
  })
  // Diagonal neighbours, each ordered onto the other's tile: the meeting
  // battle that once ran 20 turns without a blow, reduced to two units.
  resolveSimultaneousMovement(world, [
    { unitId: 'horse', target: 'K8' },
    { unitId: 'foot', target: 'J7' }
  ])
  const at = (id) => world.units.find(u => u.id === id).position
  const { tileDistance } = require('../../world')
  assert.equal(tileDistance(at('horse'), at('foot')), 1, 'they end in contact')
})

test('a unit already in contact may still step away (a withdrawal)', () => {
  const world = createWorld({
    units: [unit({ id: 'a', position: 'D4', side: 'red' }), unit({ id: 'b', position: 'D5', side: 'blue' })]
  })
  resolveSimultaneousMovement(world, [{ unitId: 'a', target: 'D1' }])
  assert.equal(toLabel(world.units.find(u => u.id === 'a').position), 'D1')
})

test('a unit walks around a friend who holds its path', () => {
  // Paths are planned over an empty field; a friend standing in the way is
  // stepped around rather than waited on forever.
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
  assert.ok(mover.tilesMoved > 0, 'it went around')
  assert.equal(toLabel(world.units.find(u => u.id === 'still').position), 'D5')
  assertNoCoOccupancy(world)
})

test('with no way around a full tile of friends, the mover gives up after one tick', () => {
  // A 5x3 field split by a river with a single ford, and the ford packed to
  // the cap by a 300-man friend. (Before Stage 3, any friend on the ford
  // blocked it.)
  const { createMap } = require('../../map/map')
  const ford = createMap({
    name: 'one-ford', width: 5, height: 3,
    cells: { C2: { terrain: 'ford' } },
    terrain: { river: ['C1', 'C3'] }
  })
  const world = createWorld({
    units: [unit({ id: 'mover', position: 'A2' }), unit({ id: 'still', position: 'C2', strength: 300, maxStrength: 300 })]
  })
  const results = resolveOn(world, [
    { unitId: 'mover', target: 'E2' },
    { unitId: 'still', target: 'hold' }
  ], ford)
  const mover = results.find(r => r.unitId === 'mover')
  assert.equal(toLabel(mover.to), 'B2', 'up to the ford and no further')
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
        assert.equal(dist, 1, `turn ${turn}: ${r.unitId} jumped ${toLabel(prev)} -> ${toLabel(step.coord)}`)
        prev = step.coord
      }
      assert.equal(toLabel(prev), toLabel(r.to), `turn ${turn}: ${r.unitId} report does not end where the unit stands`)
    }
  }

  // After five turns of converging through a shared corridor, no enemies
  // share a tile, no tile is over the cap, and every unit still exists.
  assert.equal(livingUnits(world).length, 12)
  assertNoCoOccupancy(world, 'final:')
})

function tileDistanceStr(a, b) {
  const { tileDistance } = require('../../world')
  return tileDistance(a, b)
}
