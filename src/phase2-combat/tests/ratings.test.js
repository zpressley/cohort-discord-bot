// src/phase2-combat/tests/ratings.test.js
//
// These tests pin the design decisions, not the arithmetic. Every assertion
// here traces to a line in docs/design/combat-design.md or a ruling in
// docs/design/architecture-roadmap.md section 8, and the test names say which.
//
// Tuning constants are expected to move. If a change to tables.js breaks a test
// here, the change broke a design rule, not a magic number.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const R = require('../combat/ratings')
const T = require('../combat/tables')

// A minimal unit. Only the fields the ratings care about.
function unit(overrides = {}) {
  return {
    id: 'u',
    side: 'red',
    strength: 100,
    maxStrength: 100,
    quality: 'professional',
    primaryWeapon: 'sword_standard',
    armor: 'medium_armor',
    shield: 'medium_shield',
    mounted: false,
    ...overrides
  }
}

// ── The quality ladder ─────────────────────────────────

test('base stats rise with cost across the ladder — no cheap unit dominates', () => {
  // combat-design.md, Balance Framework: "Base stats must increase with cost".
  // Attack and defense are checked; morale is deliberately NOT monotonic and is
  // covered by its own tests below.
  const paidTiers = ['levy', 'militia', 'professional', 'veteran_mercenary']

  for (let i = 1; i < paidTiers.length; i++) {
    const lower = T.QUALITY_TIERS[paidTiers[i - 1]]
    const higher = T.QUALITY_TIERS[paidTiers[i]]

    assert.ok(higher.cost > lower.cost, `${paidTiers[i]} must cost more than ${paidTiers[i - 1]}`)
    assert.ok(higher.attack >= lower.attack, `${paidTiers[i]} attack must not regress`)
    assert.ok(higher.defense >= lower.defense, `${paidTiers[i]} defense must not regress`)
    assert.ok(higher.staminaPool > lower.staminaPool,
      'better trained troops have more stamina (locked decision 2)')
  }
})

test('Q7: Tribal Warriors match Militia on cost and stats, and differ only on morale', () => {
  const tribal = T.QUALITY_TIERS.tribal_warriors
  const militia = T.QUALITY_TIERS.militia
  const professional = T.QUALITY_TIERS.professional

  assert.equal(tribal.cost, militia.cost, 'the loyalty bonus is faction identity, not a price premium')
  assert.equal(tribal.attack, militia.attack)
  assert.equal(tribal.defense, militia.defense)
  assert.equal(tribal.staminaPool, militia.staminaPool)

  assert.equal(tribal.morale, professional.morale, 'morale equal to Professional is the whole bonus')
  assert.ok(tribal.factionGated, 'availability is the cost, so it must be gated')
})

test('Veteran Mercenaries hit hardest and hold worst — Militia morale', () => {
  // combat-design.md: "best Attack in the ladder, but morale of mere Militia.
  // They hit hardest and leave first when losing."
  const vet = T.QUALITY_TIERS.veteran_mercenary
  const paid = ['levy', 'militia', 'tribal_warriors', 'professional']

  for (const key of paid) {
    assert.ok(vet.attack >= T.QUALITY_TIERS[key].attack, `vet merc must out-attack ${key}`)
  }
  assert.equal(vet.morale, T.QUALITY_TIERS.militia.morale)
  assert.ok(vet.morale < T.QUALITY_TIERS.professional.morale,
    'a cheaper tier holds better — that is the trade')
})

test('Elites are the most loyal thing on the field', () => {
  // combat-design.md: elites attack at Veteran Mercenary level with far better
  // morale and loyalty, and are better than Professional across the board.
  const elite = T.QUALITY_TIERS.elite

  assert.equal(elite.attack, T.QUALITY_TIERS.veteran_mercenary.attack)
  assert.ok(elite.defense > T.QUALITY_TIERS.professional.defense)
  for (const key of T.QUALITY_ORDER) {
    if (key === 'elite') continue
    assert.ok(elite.morale > T.QUALITY_TIERS[key].morale, `elite must out-hold ${key}`)
  }
})

test('Q6: standard units are ~100 strong and elites are 80', () => {
  for (const key of T.QUALITY_ORDER) {
    if (key === 'elite') continue
    assert.equal(T.QUALITY_TIERS[key].size, 100,
      'per-100 is the balance normalization unit, so it is also the unit size')
  }
  assert.equal(T.QUALITY_TIERS.elite.size, 80,
    'one elite size, resolving the 300-vs-40-100 contradiction in the legacy code')
})

test('Q8: no quality tier carries a separate training purchase', () => {
  for (const key of T.QUALITY_ORDER) {
    assert.equal(T.QUALITY_TIERS[key].training, undefined,
      'quality tier IS training; the second axis was dropped')
  }
})

// ── Rock-paper-scissors ────────────────────────────────

test('Q4: effectiveness is a multiplier in 0..1, never a raw percentage', () => {
  const attacker = unit({ primaryWeapon: 'heavy_mace' })

  for (const armor of ['no_armor', 'light_armor', 'medium_armor', 'heavy_armor']) {
    const value = R.effectivenessAgainst(attacker, unit({ armor }))
    assert.ok(value > 0 && value <= 1,
      `${armor}: got ${value} — treating the table as a raw percentage inflates damage 100x`)
  }
})

test('a mace beats armour, a spear beats horses, a dagger beats neither', () => {
  // The three-way comparison from the build plan's own worked example.
  const heavyTarget = unit({ armor: 'heavy_armor' })
  const cavalryTarget = unit({ mounted: true })

  const mace = R.effectivenessAgainst(unit({ primaryWeapon: 'heavy_mace' }), heavyTarget)
  const spearVsHeavy = R.effectivenessAgainst(unit({ primaryWeapon: 'spear_basic' }), heavyTarget)
  assert.ok(mace > spearVsHeavy, 'blunt trauma should out-perform a point against plate')

  const spearVsHorse = R.effectivenessAgainst(unit({ primaryWeapon: 'spear_basic' }), cavalryTarget)
  const maceVsHorse = R.effectivenessAgainst(unit({ primaryWeapon: 'heavy_mace' }), cavalryTarget)
  assert.ok(spearVsHorse > maceVsHorse, 'spears beat horses')

  const dagger = unit({ primaryWeapon: 'daggers' })
  assert.ok(R.effectivenessAgainst(dagger, heavyTarget) < mace)
  assert.ok(R.effectivenessAgainst(dagger, cavalryTarget) < spearVsHorse)
})

test('a mounted unit is looked up in the cavalry column whatever it is wearing', () => {
  // This is what makes spears counter horses rather than countering horse armour.
  assert.equal(R.armorClass(unit({ mounted: true, armor: 'heavy_armor' })), 'cavalry')
  assert.equal(R.armorClass(unit({ mounted: true, armor: 'no_armor' })), 'cavalry')
  assert.equal(R.armorClass(unit({ mounted: false, armor: 'heavy_armor' })), 'heavy')
})

test('the anti-cavalry threshold picks out the spear family and nothing else', () => {
  for (const weapon of ['spear_basic', 'spear_professional', 'two_handed_spear', 'macedonian_sarissa']) {
    assert.ok(R.isAntiCavalry(unit({ primaryWeapon: weapon })), `${weapon} should brace`)
  }
  for (const weapon of ['sword_standard', 'heavy_mace', 'daggers', 'roman_gladius']) {
    assert.ok(!R.isAntiCavalry(unit({ primaryWeapon: weapon })), `${weapon} should not brace`)
  }
})

// ── Time: charge decay ─────────────────────────────────

test('the cavalry charge spikes on impact, decays, then settles below parity', () => {
  // combat-design.md: "big early spike, then below-parity" — a horse stuck in
  // a melee is in the wrong place.
  const horse = unit({ mounted: true })

  const impact = R.chargeMultiplier(horse, 0, false)
  const second = R.chargeMultiplier(horse, 1, false)
  const third = R.chargeMultiplier(horse, 2, false)
  const stuck = R.chargeMultiplier(horse, 5, false)

  assert.ok(impact > second, 'the spike must decay')
  assert.ok(second > third)
  assert.ok(third >= 1, 'the charge is never a penalty while it lasts')
  assert.ok(stuck < 1, 'cavalry must be bad in a long melee, not merely unexceptional')
})

test('braced spears suppress the charge spike', () => {
  const horse = unit({ mounted: true })
  const free = R.chargeMultiplier(horse, 0, false)
  const braced = R.chargeMultiplier(horse, 0, true)

  assert.ok(braced < free, 'spears must blunt the impact')
  assert.ok(braced >= 1, 'suppressed, not inverted — the inversion comes from effectiveness')
})

test('infantry never gets a charge multiplier', () => {
  const foot = unit({ mounted: false })
  for (const round of [0, 1, 2, 9]) {
    assert.equal(R.chargeMultiplier(foot, round, false), 1)
  }
})

// ── Stamina and the universal fatigue curve ────────────

test('one universal fatigue curve: flat above 60%, half effectiveness at empty', () => {
  // locked decision 2 — the curve is shared by every unit, and the notebook's
  // two curve *shapes* come from different drain rates crossing it.
  assert.equal(R.fatigueMultiplier(1.0), 1)
  assert.equal(R.fatigueMultiplier(0.8), 1)
  assert.equal(R.fatigueMultiplier(T.STAMINA.FULL_ABOVE), 1)
  assert.equal(R.fatigueMultiplier(0), T.STAMINA.FLOOR_MULTIPLIER)

  // Monotonic in between, with no cliff.
  let previous = 0
  for (let pct = 0; pct <= 1.0001; pct += 0.05) {
    const value = R.fatigueMultiplier(pct)
    assert.ok(value >= previous, `curve must not rise then fall at ${pct}`)
    previous = value
  }
})

test('the fatigue curve clamps outside 0..1 rather than extrapolating', () => {
  assert.equal(R.fatigueMultiplier(-0.5), T.STAMINA.FLOOR_MULTIPLIER)
  assert.equal(R.fatigueMultiplier(2), 1)
})

test('heavy kit drains stamina faster than light kit', () => {
  // combat-design.md: "heavy stuff protects and hurts, but drains stamina
  // faster" — heavies must win before they gas out.
  const light = unit({ armor: 'no_armor', shield: 'no_shield' })
  const medium = unit({ armor: 'medium_armor', shield: 'medium_shield' })
  const heavy = unit({ armor: 'heavy_armor', shield: 'heavy_shield' })

  assert.ok(R.staminaDrainPerRound(heavy) > R.staminaDrainPerRound(medium))
  assert.ok(R.staminaDrainPerRound(medium) > R.staminaDrainPerRound(light))
  assert.ok(R.staminaDrainPerRound(light) > 0, 'fighting costs something even unarmoured')
})

test('a mount adds to the drain — horses tire too', () => {
  const foot = unit()
  const horse = unit({ mounted: true })
  assert.ok(R.staminaDrainPerRound(horse) > R.staminaDrainPerRound(foot))
})

test('heavy kit empties the tank inside the 8-round cap; light kit outlasts it', () => {
  // This is the arc the design is after, checked as a consequence of the two
  // knobs rather than asserted as a curve shape.
  const heavy = unit({ quality: 'professional', armor: 'heavy_armor', shield: 'heavy_shield' })
  const light = unit({ quality: 'professional', armor: 'no_armor', shield: 'no_shield' })

  const heavyRounds = R.staminaPool(heavy) / R.staminaDrainPerRound(heavy)
  const lightRounds = R.staminaPool(light) / R.staminaDrainPerRound(light)

  assert.ok(heavyRounds < 8, 'a heavy unit must feel the clock inside the engagement cap')
  assert.ok(lightRounds > heavyRounds, 'light troops win the long grinds they survive')
})

// ── Morale resistance ──────────────────────────────────

test('morale resistance rises with the tier morale stat', () => {
  const levy = R.moraleResistance(unit({ quality: 'levy' }))
  const militia = R.moraleResistance(unit({ quality: 'militia' }))
  const elite = R.moraleResistance(unit({ quality: 'elite' }))

  assert.equal(levy, 1, 'the bottom of the ladder gets no discount')
  assert.ok(militia > levy)
  assert.ok(elite > militia)
})

test('Tribal Warriors resist morale damage exactly as well as Professionals', () => {
  assert.equal(
    R.moraleResistance(unit({ quality: 'tribal_warriors' })),
    R.moraleResistance(unit({ quality: 'professional' }))
  )
})

// ── Terrain ────────────────────────────────────────────

test('high ground is worth something, and only when the enemy is not also on it', () => {
  // If holding the hill is not worth something, the numbers are wrong —
  // the hill-assault scenario exists for this.
  const onHill = R.terrainModifier('hill', 'plains')
  assert.ok(onHill.defense > 0)
  assert.ok(onHill.attack > 0)

  const bothOnHill = R.terrainModifier('hill', 'hill')
  assert.equal(bothOnHill.defense, 0, 'high ground is relative')
  assert.equal(bothOnHill.attack, 0)
})

test('being caught mid-crossing is punishing on both attack and defense', () => {
  const ford = R.terrainModifier('ford', 'plains')
  assert.ok(ford.attack < 0)
  assert.ok(ford.defense < 0)
})

test('prepared adds defense — the phase 2 stand-in for named formations', () => {
  const loose = R.terrainModifier('plains', 'plains', false)
  const braced = R.terrainModifier('plains', 'plains', true)
  assert.ok(braced.defense > loose.defense)
})

test('every phase 1 terrain key has a chaos value — no silent undefined', () => {
  // The build plan warns that the legacy chaos keys and phase 1's terrain keys
  // do not match. This asserts the mapping is total.
  const { MOVEMENT_COSTS } = require('../../phase1-movement/mapData')
  for (const terrain of Object.keys(MOVEMENT_COSTS)) {
    assert.equal(typeof T.TERRAIN_CHAOS[terrain], 'number', `${terrain} has no chaos value`)
  }
})

// ── The snowball ───────────────────────────────────────

test('a unit that has lost men hits softer', () => {
  // This is what replaces the discarded damage-accumulation bucket as the
  // anti-stalemate mechanism.
  const full = unit({ strength: 100, maxStrength: 100 })
  const mauled = unit({ strength: 40, maxStrength: 100 })

  assert.equal(R.strengthScale(full), 1)
  assert.ok(R.strengthScale(mauled) < 1)
  assert.ok(R.attackRating(mauled) < R.attackRating(full))
})

test('the snowball is softened, not linear — a battered unit still bites', () => {
  const mauled = unit({ strength: 40, maxStrength: 100 })
  assert.ok(R.strengthScale(mauled) > 0.40,
    'exponent 1.0 would let the first bad round decide the fight')
})

test('defense does not scale with the snowball — that would double-count', () => {
  const full = unit({ strength: 100, maxStrength: 100 })
  const mauled = unit({ strength: 40, maxStrength: 100 })
  assert.equal(R.defenseRating(mauled), R.defenseRating(full))
})

// ── Chaos ──────────────────────────────────────────────

test('chaos degrades everything and never inverts a rating', () => {
  assert.equal(R.chaosMultiplier(0), 1)
  assert.ok(R.chaosMultiplier(5) < 1)
  assert.ok(R.chaosMultiplier(T.CHAOS.MAX) < R.chaosMultiplier(5))
  assert.ok(R.chaosMultiplier(T.CHAOS.MAX) > 0, 'chaos must never zero a unit out')
})

test('chaos above the scale maximum is clamped, not extrapolated', () => {
  assert.equal(R.chaosMultiplier(999), R.chaosMultiplier(T.CHAOS.MAX))
})

// ── Ratings, assembled ─────────────────────────────────

test('ratings are never negative even under the worst stacked penalties', () => {
  const wretch = unit({
    quality: 'levy', primaryWeapon: 'daggers', armor: 'no_armor', shield: 'no_shield',
    strength: 1, maxStrength: 100
  })
  const ctx = { stamina: 0, terrain: 'ford', enemyTerrain: 'hill', chaos: T.CHAOS.MAX }

  assert.ok(R.attackRating(wretch, ctx) >= 0)
  assert.ok(R.defenseRating(wretch, ctx) >= 0)
  assert.ok(R.pushRating(wretch, ctx) >= 0)
})

test('ratings are pure — the same inputs give the same answer', () => {
  const u = unit()
  const ctx = { stamina: 50, roundsInContact: 1, terrain: 'hill', chaos: 3 }
  assert.equal(R.attackRating(u, ctx), R.attackRating(u, ctx))
  assert.equal(R.defenseRating(u, ctx), R.defenseRating(u, ctx))
  assert.equal(R.pushRating(u, ctx), R.pushRating(u, ctx))
})

test('ratings do not mutate the unit they are given', () => {
  const u = unit()
  const before = JSON.stringify(u)
  R.attackRating(u, { stamina: 10, chaos: 4, roundsInContact: 2 })
  R.defenseRating(u, { stamina: 10, chaos: 4 })
  R.pushRating(u, { stamina: 10, chaos: 4 })
  assert.equal(JSON.stringify(u), before)
})

test('a unit with no weapon still fights — scenarios predate the weapon tables', () => {
  const bare = unit({ primaryWeapon: null })
  assert.ok(R.attackRating(bare) > 0)
  assert.equal(R.resolveWeapon(bare), T.WEAPONS[T.DEFAULT_WEAPON])
})

test('an unknown quality or kit key falls back instead of throwing', () => {
  const odd = unit({ quality: 'nonesuch', armor: 'nonesuch', shield: 'nonesuch', primaryWeapon: 'nonesuch' })
  assert.doesNotThrow(() => R.attackRating(odd))
  assert.doesNotThrow(() => R.defenseRating(odd))
  assert.ok(R.staminaPool(odd) > 0)
})

test('mass wins the shove: heavier kit and horses push harder', () => {
  // locked decision 3 — push never kills, but it must be a real differential.
  const light = unit({ armor: 'no_armor', shield: 'no_shield' })
  const heavy = unit({ armor: 'heavy_armor', shield: 'heavy_shield' })
  const horse = unit({ mounted: true })

  assert.ok(R.basePushRating(heavy) > R.basePushRating(light))
  assert.ok(R.basePushRating(horse) > R.basePushRating(light))
})
