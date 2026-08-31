// src/phase2-combat/tests/resolve.test.js
//
// The resolver is the only part of combat/ that touches randomness, so these
// tests cover two things: that it honours the harness contract (section 3 of
// PHASE2_COMBAT_PLAN.md), and that the round-loop rules from the notebook —
// the rout floor, the mutual-rout rule, monotonic morale — actually hold.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createCombatResolver, chaosFor, chargeRoundFor, breakingLoser } = require('../combat')
const T = require('../combat/tables')
const { createRng } = require('../harness/rng')
const { createWorld } = require('../harness/world')

function unitSpec(overrides = {}) {
  return {
    id: 'u',
    side: 'red',
    position: 'H10',
    strength: 100,
    maxStrength: 100,
    quality: 'professional',
    primaryWeapon: 'sword_standard',
    armor: 'medium_armor',
    shield: 'medium_shield',
    ...overrides
  }
}

// A pair in contact on plains, plus the engagement record the runner would
// have produced for them.
function pair(aOverrides = {}, bOverrides = {}) {
  const world = createWorld({
    units: [
      unitSpec({ id: 'a', side: 'red', position: 'H10', ...aOverrides }),
      unitSpec({ id: 'b', side: 'blue', position: 'H11', ...bOverrides })
    ]
  })

  const engagements = [{
    aId: 'a', bId: 'b', distance: 1, aTerrain: 'plains', bTerrain: 'plains'
  }]

  return { world, engagements }
}

// Drive a pair for N turns, applying casualties the way the runner does.
function fight(world, engagements, resolver, random, turns) {
  const log = []
  for (let turn = 1; turn <= turns; turn++) {
    const result = resolver({ engagements, world, random, turn })
    for (const casualty of result.casualties) {
      const unit = world.units.find(u => u.id === casualty.unitId)
      unit.strength = Math.max(0, unit.strength - casualty.killed)
    }
    log.push(result)
    if (world.units.some(u => u.strength === 0)) break
  }
  return log
}

// ── The contract ───────────────────────────────────────

test('the resolver returns casualty intent, routs and events, and nothing else', () => {
  // `routed` is an addition to the plan's contract. The runner needs it: morale
  // lives in the resolver, the world model has no rout flag, and without it a
  // battle that ended in a rout — which is how most of them end — reported as
  // `undecided`.
  const { world, engagements } = pair()
  const result = createCombatResolver()({ engagements, world, random: createRng(1), turn: 1 })

  assert.deepEqual(Object.keys(result).sort(), ['casualties', 'events', 'pushes', 'routed'])
  assert.ok(Array.isArray(result.casualties))
  assert.ok(Array.isArray(result.events))
  for (const casualty of result.casualties) {
    assert.deepEqual(Object.keys(casualty).sort(), ['killed', 'unitId'])
  }
})

test('the resolver does not mutate the world — the runner applies casualties', () => {
  const { world, engagements } = pair()
  const before = JSON.stringify(world)

  createCombatResolver()({ engagements, world, random: createRng(1), turn: 1 })
  assert.equal(JSON.stringify(world), before)
})

test('casualties come back sorted by unit id, so reports diff cleanly', () => {
  const { world, engagements } = pair()
  const result = createCombatResolver()({ engagements, world, random: createRng(7), turn: 1 })
  const ids = result.casualties.map(c => c.unitId)
  assert.deepEqual(ids, [...ids].sort())
})

test('events carry no timestamp or wall-clock value', () => {
  const { world, engagements } = pair()
  const result = createCombatResolver()({ engagements, world, random: createRng(3), turn: 1 })

  for (const event of result.events) {
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(event), `date leaked into: ${event}`)
    assert.ok(!/\d{2}:\d{2}:\d{2}/.test(event), `clock time leaked into: ${event}`)
  }
})

test('same seed, same fight — byte for byte', () => {
  const runOnce = () => {
    const { world, engagements } = pair()
    return JSON.stringify(fight(world, engagements, createCombatResolver(), createRng(42), 8))
  }
  assert.equal(runOnce(), runOnce())
})

test('a different seed changes the fight', () => {
  const runWith = (seed) => {
    const { world, engagements } = pair({ quality: 'militia' }, { quality: 'professional' })
    return JSON.stringify(fight(world, engagements, createCombatResolver(), createRng(seed), 8))
  }
  assert.notEqual(runWith(1), runWith(999))
})

test('each resolver carries its own state — one run never leaks into the next', () => {
  // This is why createCombatResolver is a factory. Sharing an instance across a
  // sweep would carry seed 1's exhausted stamina into seed 2 and destroy the
  // reproducibility the harness exists to provide.
  //
  // Checked on the state itself rather than on casualties: in a mirror match
  // both sides fatigue in step, the attack and defense ratings fall together,
  // and the damage ratio comes out unchanged — so a leak is real but invisible
  // in the output. That near-miss is the reason this test reads getState.
  const pool = T.QUALITY_TIERS.professional.staminaPool

  const first = pair()
  const carried = createCombatResolver()
  fight(first.world, first.engagements, carried, createRng(1), 5)
  const drained = carried.getState('a').stamina
  assert.ok(drained < pool, 'the first run must actually have drained something')

  const second = pair()
  const fresh = createCombatResolver()
  fresh({ engagements: second.engagements, world: second.world, random: createRng(1), turn: 1 })
  assert.ok(fresh.getState('a').stamina > drained,
    'a new resolver starts every unit with a full tank')

  const third = pair()
  carried({ engagements: third.engagements, world: third.world, random: createRng(1), turn: 1 })
  assert.ok(carried.getState('a').stamina <= drained,
    'the reused one never refills for a new battle — exactly what must not happen across a sweep')
})

// ── Stamina and morale across rounds ───────────────────

test('stamina drains monotonically and never goes negative', () => {
  const { world, engagements } = pair(
    { armor: 'heavy_armor', shield: 'heavy_shield' },
    { armor: 'heavy_armor', shield: 'heavy_shield' }
  )
  const resolver = createCombatResolver()
  const random = createRng(5)

  let previous = Infinity
  for (let turn = 1; turn <= 12; turn++) {
    resolver({ engagements, world, random, turn })
    const stamina = resolver.getState('a').stamina
    assert.ok(stamina <= previous, 'stamina must never rise mid-engagement')
    assert.ok(stamina >= 0)
    previous = stamina
  }
  assert.equal(previous, 0, 'heavy kit should empty the tank inside twelve rounds')
})

test('morale is monotonic down — locked decision 5', () => {
  const { world, engagements } = pair()
  const resolver = createCombatResolver()
  const random = createRng(11)

  let previous = T.MORALE.START
  for (let turn = 1; turn <= 10; turn++) {
    resolver({ engagements, world, random, turn })
    const morale = resolver.getState('a').morale
    assert.ok(morale <= previous, 'no recovery inside an engagement')
    assert.ok(morale >= 0)
    previous = morale
  }
})

// ── The rout floor ─────────────────────────────────────

test('nothing routs before the floor round, however hopeless', () => {
  // combat-design.md: "even the worst troops (levy) survive at least 1-2 rounds
  // before rout is possible."
  const { world, engagements } = pair(
    { quality: 'levy', primaryWeapon: 'daggers', armor: 'no_armor', shield: 'no_shield' },
    { quality: 'elite', primaryWeapon: 'persian_kontos', armor: 'heavy_armor', shield: 'heavy_shield' }
  )
  const resolver = createCombatResolver()
  const random = createRng(2)

  for (let turn = 1; turn < T.MORALE.ROUT_FLOOR_ROUND; turn++) {
    resolver({ engagements, world, random, turn })
    assert.equal(resolver.getState('a').routed, false,
      `a levy must survive round ${turn} without routing`)
  }
})

test('a hopeless matchup does eventually rout once the floor has passed', () => {
  const { world, engagements } = pair(
    { quality: 'levy', primaryWeapon: 'daggers', armor: 'no_armor', shield: 'no_shield' },
    { quality: 'elite', primaryWeapon: 'persian_kontos', armor: 'heavy_armor', shield: 'heavy_shield' }
  )
  const resolver = createCombatResolver()
  const random = createRng(2)

  let routedOn = null
  for (let turn = 1; turn <= 20 && !routedOn; turn++) {
    const result = resolver({ engagements, world, random, turn })
    for (const casualty of result.casualties) {
      const unit = world.units.find(u => u.id === casualty.unitId)
      unit.strength = Math.max(0, unit.strength - casualty.killed)
    }
    if (resolver.getState('a').routed) routedOn = turn
  }

  assert.ok(routedOn !== null, 'the levy has to break at some point')
  assert.ok(routedOn >= T.MORALE.ROUT_FLOOR_ROUND)
})

// ── The mutual-rout rule ───────────────────────────────

test('both sides are never routed at once — rout requires a loser', () => {
  // locked decision 6, in its exact scope: no round may end with two broken
  // units. It does NOT mean a mutual break is permanent amnesty; the fight
  // "continues until asymmetry emerges", and per-side chaos makes it emerge.
  const { world, engagements } = pair({ quality: 'levy' }, { quality: 'levy' })
  const resolver = createCombatResolver()
  const random = createRng(4)

  for (let turn = 1; turn <= 25; turn++) {
    const result = resolver({ engagements, world, random, turn })
    for (const casualty of result.casualties) {
      const unit = world.units.find(u => u.id === casualty.unitId)
      unit.strength = Math.max(0, unit.strength - casualty.killed)
    }
    assert.ok(!(resolver.getState('a').routed && resolver.getState('b').routed),
      `both sides routed on turn ${turn} — there was nobody to run from`)
    if (world.units.some(u => u.strength === 0)) break
  }
})

test('a mirror match still terminates — the standoff is not a deadlock', () => {
  // The failure this guards against: an earlier reading treated "both below the
  // threshold" as a standing exemption. Morale is monotonic down and floors at
  // zero, so once both were under the line neither could ever rise back above
  // it, no rout was possible again, and every mirror ran forever.
  const { world, engagements } = pair({ quality: 'levy' }, { quality: 'levy' })
  const resolver = createCombatResolver()
  const random = createRng(4)

  let ended = false
  for (let turn = 1; turn <= 30 && !ended; turn++) {
    const result = resolver({ engagements, world, random, turn })
    for (const casualty of result.casualties) {
      const unit = world.units.find(u => u.id === casualty.unitId)
      unit.strength = Math.max(0, unit.strength - casualty.killed)
    }
    ended = resolver.getState('a').routed || resolver.getState('b').routed ||
      world.units.some(u => u.strength === 0)
  }

  assert.ok(ended, 'a mirror match must reach a conclusion')
})

test('when both break together, the one worse off is the one that runs', () => {
  // The tiebreak, in the notebook's own order: worse morale, then fewer men,
  // then — because morale clips at zero and casualties round to whole men —
  // the undamped damage total.
  const unitA = { strength: 50 }
  const unitB = { strength: 50 }

  assert.equal(
    breakingLoser({ morale: 4, moraleDamageTaken: 96 }, { morale: 9, moraleDamageTaken: 91 }, unitA, unitB),
    'a', 'worse morale runs first')

  assert.equal(
    breakingLoser({ morale: 0, moraleDamageTaken: 100 }, { morale: 0, moraleDamageTaken: 100 },
      { strength: 20 }, { strength: 40 }),
    'a', 'equal morale falls through to fewer men')

  assert.equal(
    breakingLoser({ morale: 0, moraleDamageTaken: 130 }, { morale: 0, moraleDamageTaken: 120 }, unitA, unitB),
    'a', 'equal on both, so the undamped damage total decides')

  assert.equal(
    breakingLoser({ morale: 0, moraleDamageTaken: 100 }, { morale: 0, moraleDamageTaken: 100 }, unitA, unitB),
    null, 'and only exact symmetry on every count is a true standoff')
})

test('a routed unit stops fighting', () => {
  const { world, engagements } = pair(
    { quality: 'levy', primaryWeapon: 'daggers', armor: 'no_armor', shield: 'no_shield' },
    { quality: 'elite', primaryWeapon: 'persian_kontos', armor: 'heavy_armor', shield: 'heavy_shield' }
  )
  const resolver = createCombatResolver()
  const random = createRng(2)

  for (let turn = 1; turn <= 20; turn++) {
    const result = resolver({ engagements, world, random, turn })
    for (const casualty of result.casualties) {
      const unit = world.units.find(u => u.id === casualty.unitId)
      unit.strength = Math.max(0, unit.strength - casualty.killed)
    }
    if (resolver.getState('a').routed) {
      const after = resolver({ engagements, world, random, turn: turn + 1 })
      assert.equal(after.casualties.length, 0, 'a broken unit is out of the fight')
      return
    }
  }
  assert.fail('the levy never routed, so the rule was never exercised')
})

// ── Chaos ──────────────────────────────────────────────

test('preparedness subtracts from chaos but can never eliminate it', () => {
  // locked decision 4: "You can mitigate chaos but never eliminate it."
  const loose = chaosFor(4, 'forest', 'meeting_engagement', false)
  const braced = chaosFor(4, 'forest', 'meeting_engagement', true)

  assert.ok(braced < loose)
  assert.ok(braced >= 0)
  assert.equal(chaosFor(0, 'plains', 'prepared', true), 0, 'the floor is zero, not negative')
})

test('rough ground is more chaotic than open ground', () => {
  const plains = chaosFor(2, 'plains', 'meeting_engagement', false)
  const forest = chaosFor(2, 'forest', 'meeting_engagement', false)
  const marsh = chaosFor(2, 'marsh', 'meeting_engagement', false)

  assert.ok(forest > plains)
  assert.ok(marsh > plains)
})

test('an ambush is the most chaotic situation on the table', () => {
  const meeting = chaosFor(1, 'plains', 'meeting_engagement', false)
  const ambush = chaosFor(1, 'plains', 'ambush', false)
  assert.ok(ambush > meeting, 'surprise increases chaos')
})

test('chaos is capped at the scale maximum', () => {
  assert.equal(chaosFor(999, 'marsh', 'ambush', false), T.CHAOS.MAX)
})

// ── The charge, and who is charging ────────────────────

test('only cavalry that moved into contact is charging', () => {
  const horse = { mounted: true }
  const foot = { mounted: false }

  assert.equal(chargeRoundFor(horse, true, 0), 0, 'a horse that closed is at impact')
  assert.equal(chargeRoundFor(horse, false, 0), T.CHARGE.DECAY.length,
    'a horse that stood still is past the curve — cavalry in a melee it did not choose')
  assert.equal(chargeRoundFor(foot, true, 0), 0, 'infantry has no charge either way')
  assert.equal(chargeRoundFor(foot, false, 2), 2)
})

test('cavalry charges on the round of impact', () => {
  // The turn contact is first made is the only turn a charge can happen, and
  // it is also the turn the resolver has no position history. If "unknown"
  // defaulted to "did not move", the charge would never fire at all.
  const { world, engagements } = pair({ mounted: true, armor: 'light_armor' }, {})
  const result = createCombatResolver()({ engagements, world, random: createRng(8), turn: 1 })

  assert.ok(result.events.some(e => e.includes('[charge]')),
    'a cavalry unit arriving in contact is charging')
})

test('the charge does not fire again once the pair is locked together', () => {
  const { world, engagements } = pair({ mounted: true, armor: 'light_armor' }, {})
  const resolver = createCombatResolver()
  const random = createRng(8)

  resolver({ engagements, world, random, turn: 1 })
  const second = resolver({ engagements, world, random, turn: 2 })

  assert.ok(!second.events.some(e => e.includes('[charge]')),
    'momentum is spent — from here the decay curve takes over')
})

test('a mounted unit that never closed is worse off than one that charged', () => {
  // chargeRoundFor hands a stationary horse a round past the end of the curve,
  // so it lands on CHARGE.SUSTAINED: cavalry in a melee it did not choose.
  const charged = pair({ mounted: true, armor: 'light_armor' }, {})
  const chargedResult = createCombatResolver()(
    { engagements: charged.engagements, world: charged.world, random: createRng(8), turn: 1 })

  const waiting = pair({ mounted: true, armor: 'light_armor' }, {})
  const waitingResolver = createCombatResolver()
  const waitingRandom = createRng(8)
  waitingResolver({ engagements: waiting.engagements, world: waiting.world, random: waitingRandom, turn: 1 })
  const waitingResult = waitingResolver(
    { engagements: waiting.engagements, world: waiting.world, random: waitingRandom, turn: 2 })

  const inflicted = (result) => result.casualties.find(c => c.unitId === 'b')?.killed ?? 0
  assert.ok(inflicted(chargedResult) > inflicted(waitingResult),
    'the charge has to be worth something')
})

// ── Multiple engagements ───────────────────────────────

test('two simultaneous engagements each resolve, and casualties accumulate', () => {
  const world = createWorld({
    units: [
      unitSpec({ id: 'a1', side: 'red', position: 'H10' }),
      unitSpec({ id: 'a2', side: 'red', position: 'H12' }),
      unitSpec({ id: 'b1', side: 'blue', position: 'H11' })
    ]
  })
  const engagements = [
    { aId: 'a1', bId: 'b1', distance: 1, aTerrain: 'plains', bTerrain: 'plains' },
    { aId: 'a2', bId: 'b1', distance: 1, aTerrain: 'plains', bTerrain: 'plains' }
  ]

  const result = createCombatResolver()({ engagements, world, random: createRng(6), turn: 1 })
  const b1 = result.casualties.find(c => c.unitId === 'b1')

  assert.ok(b1, 'the unit fighting on two fronts must appear once')
  assert.equal(result.casualties.filter(c => c.unitId === 'b1').length, 1,
    'losses from both engagements accumulate into one entry')
})

test('an engagement naming a unit that no longer exists is skipped, not thrown', () => {
  const { world, engagements } = pair()
  const stale = [...engagements, { aId: 'ghost', bId: 'b', distance: 1, aTerrain: 'plains', bTerrain: 'plains' }]

  assert.doesNotThrow(() => {
    createCombatResolver()({ engagements: stale, world, random: createRng(1), turn: 1 })
  })
})

// ── Elastic time ───────────────────────────────────────

test('roundsPerTurn resolves several ten-minute rounds in one player turn', () => {
  // [Q1] Elastic time: a turn in contact is N rounds. One call, N exchanges.
  const single = pair()
  const multi = pair()

  const oneRound = createCombatResolver({ roundsPerTurn: 1 })
  const threeRounds = createCombatResolver({ roundsPerTurn: 3 })

  const a = oneRound({ engagements: single.engagements, world: single.world, random: createRng(9), turn: 1 })
  const b = threeRounds({ engagements: multi.engagements, world: multi.world, random: createRng(9), turn: 1 })

  const killedIn = (result) => result.casualties.reduce((sum, c) => sum + c.killed, 0)
  assert.ok(killedIn(b) > killedIn(a), 'three rounds must cost more than one')
  assert.equal(b.events.length, 3, 'and produce one event per round')
})
