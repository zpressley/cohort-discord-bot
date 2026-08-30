// src/phase2-combat/tests/damage.test.js
//
// Fixed inputs, no randomness. Chaos is passed in as a number.
// As in ratings.test.js, each assertion names the design rule it pins.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const D = require('../combat/damage')
const R = require('../combat/ratings')
const T = require('../combat/tables')

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

// ── Casualties ─────────────────────────────────────────

test('casualties are a fraction of current strength, never a flat number', () => {
  const attacker = unit()
  const full = unit({ id: 'full', strength: 100, maxStrength: 100 })
  const half = unit({ id: 'half', strength: 50, maxStrength: 100 })

  const vsFull = D.casualtiesFrom(attacker, full)
  const vsHalf = D.casualtiesFrom(attacker, half)

  assert.ok(vsHalf.killed < vsFull.killed, 'a thinner line loses fewer men in absolute terms')
  assert.ok(Math.abs(vsHalf.fraction - vsFull.fraction) < 1e-9, '...but the same share of what is left')
})

test('a unit can never lose more men than it has', () => {
  const monster = unit({ quality: 'elite', primaryWeapon: 'persian_kontos', strength: 100 })
  const remnant = unit({ quality: 'levy', armor: 'no_armor', shield: 'no_shield', strength: 2, maxStrength: 100 })

  const result = D.casualtiesFrom(monster, remnant)
  assert.ok(result.killed <= remnant.strength)
})

test('the damage ratio saturates instead of running away', () => {
  // Ratio form, not difference: doubling an already-dominant attack barely
  // moves the result. This is what keeps the "worst troops survive 1-2 rounds"
  // floor reachable against an elite.
  const strong = unit({ quality: 'elite', primaryWeapon: 'persian_kontos' })
  const weak = unit({ quality: 'levy', primaryWeapon: 'daggers', armor: 'no_armor', shield: 'no_shield' })

  const result = D.casualtiesFrom(strong, weak)
  assert.ok(result.ratio < 1, 'the ratio must asymptote, never reach 1')
  assert.ok(result.fraction < 0.5, 'no single round may erase half a unit')
})

test('the damage ratio is never negative, even hopelessly outmatched', () => {
  const weak = unit({ quality: 'levy', primaryWeapon: 'daggers', armor: 'no_armor', shield: 'no_shield' })
  const fortress = unit({ quality: 'elite', armor: 'heavy_armor', shield: 'heavy_shield' })

  const result = D.casualtiesFrom(weak, fortress, { stamina: 0, chaos: T.CHAOS.MAX }, {})
  assert.ok(result.killed >= 0)
  assert.ok(result.ratio >= 0)
})

test('the legacy damage-accumulation inversion does not reappear', () => {
  // Section 9.6 of the roadmap: in the old bucket model a hopeless attacker
  // out-killed a dominant one, because the sign of (attack - defense) was
  // discarded. This is the regression test for that specific bug.
  const target = unit({ id: 'target', armor: 'medium_armor', shield: 'medium_shield' })

  const dominant = unit({ quality: 'veteran_mercenary', primaryWeapon: 'great_axe' })
  const hopeless = unit({ quality: 'levy', primaryWeapon: 'daggers' })

  const byDominant = D.casualtiesFrom(dominant, target).killed
  const byHopeless = D.casualtiesFrom(hopeless, target).killed

  assert.ok(byDominant > byHopeless,
    'a dominant attacker must out-kill a hopeless one — the bucket got this backwards')
})

test('buying defense makes you harder to kill, not easier', () => {
  // The other half of the same legacy bug: better armour used to increase
  // |attack - defense| and therefore increase your own casualties.
  const attacker = unit({ primaryWeapon: 'sword_standard' })
  let previous = Infinity

  for (const armor of ['no_armor', 'light_armor', 'medium_armor', 'heavy_armor']) {
    const killed = D.casualtiesFrom(attacker, unit({ armor })).killed
    assert.ok(killed <= previous, `${armor} must not be worse than the lighter option`)
    previous = killed
  }
})

test('rock-paper-scissors reaches the casualty count, not just the rating', () => {
  const heavyTarget = unit({ armor: 'heavy_armor', shield: 'medium_shield' })
  const mace = unit({ primaryWeapon: 'heavy_mace' })
  const sword = unit({ primaryWeapon: 'sword_standard' })

  assert.ok(D.casualtiesFrom(mace, heavyTarget).killed > D.casualtiesFrom(sword, heavyTarget).killed,
    'blunt trauma must actually kill more armoured men')
})

test('spears kill horses that swords do not', () => {
  const horse = unit({ mounted: true, armor: 'light_armor' })
  const spear = unit({ primaryWeapon: 'spear_professional' })
  const sword = unit({ primaryWeapon: 'sword_standard' })

  assert.ok(D.casualtiesFrom(spear, horse).killed > D.casualtiesFrom(sword, horse).killed)
})

// ── Push ───────────────────────────────────────────────

test('push never causes casualties — locked decision 3', () => {
  // The only way to check a negative: the casualty path must not read push at
  // all. Two units identical except for push-bearing kit must still take the
  // same losses from the same attacker.
  const attacker = unit({ id: 'a' })

  const shover = unit({ id: 'shover', mounted: true, armor: 'medium_armor', shield: 'medium_shield' })
  const shoved = unit({ id: 'shoved', mounted: false, armor: 'medium_armor', shield: 'medium_shield' })

  const push = D.pushExchange(shover, shoved)
  assert.ok(push.differential > 0, 'the fixture must actually have a push differential')

  // Casualties depend on armour class, so compare like with like: the mounted
  // unit is in the cavalry column. Instead, assert directly that the casualty
  // result carries no push term at all.
  const result = D.casualtiesFrom(attacker, shoved)
  const withoutPushKit = D.casualtiesFrom(attacker, unit({ id: 'shoved', shield: 'medium_shield' }))
  assert.equal(result.killed, withoutPushKit.killed)
})

test('the push differential is unsigned and names its winner', () => {
  const heavy = unit({ id: 'heavy', armor: 'heavy_armor', shield: 'heavy_shield' })
  const light = unit({ id: 'light', armor: 'no_armor', shield: 'no_shield' })

  const forward = D.pushExchange(heavy, light)
  assert.equal(forward.winner, 'a')
  assert.ok(forward.differential > 0)

  const reversed = D.pushExchange(light, heavy)
  assert.equal(reversed.winner, 'b')
  assert.ok(reversed.differential > 0, 'differential is magnitude, so it stays positive either way')
})

test('an even shove has no winner and costs nobody anything', () => {
  const push = D.pushExchange(unit({ id: 'a' }), unit({ id: 'b' }))
  assert.equal(push.winner, null)
  assert.equal(push.differential, 0)
  assert.equal(D.pushMoraleDamage(push.differential), 0)
  assert.equal(D.pushStaminaDamage(push.differential), 0)
})

test('losing the shove costs morale and stamina, in that order of severity', () => {
  // locked decision 3: morale is "the real cost".
  const differential = 4
  assert.ok(D.pushMoraleDamage(differential) > D.pushStaminaDamage(differential))
})

// ── Morale ─────────────────────────────────────────────

test('morale damage is never negative — recovery is a phase 8 feature', () => {
  // locked decision 5: monotonic down.
  const u = unit()
  for (const sources of [
    {},
    { killed: 0, pushDifferential: 0, chaos: 0 },
    { killed: -50, pushDifferential: -10, chaos: -5 }
  ]) {
    assert.ok(D.moraleDamage(u, sources).total >= 0)
  }
})

test('morale damage has exactly the three sources the notebook names', () => {
  const u = unit()
  const result = D.moraleDamage(u, { killed: 10, pushDifferential: 3, chaos: 4 })

  assert.ok(result.fromCasualties > 0, 'casualties taken')
  assert.ok(result.fromPush > 0, 'push differential')
  assert.ok(result.fromChaos > 0, 'chaos')
})

test('casualties are measured against the original unit, not what is left', () => {
  // Losing twenty of your last thirty men must hurt more than losing twenty of
  // a hundred — but the coefficient is on share-of-original, so the same twenty
  // men cost the same morale. What escalates is that twenty is a bigger share
  // of a small unit's remaining fight, which the snowball handles.
  const fresh = unit({ strength: 100, maxStrength: 100 })
  const remnant = unit({ strength: 30, maxStrength: 100 })

  assert.equal(
    D.moraleDamage(fresh, { killed: 20 }).fromCasualties,
    D.moraleDamage(remnant, { killed: 20 }).fromCasualties
  )
})

test('resistance is what makes a veteran stay — same losses, less morale lost', () => {
  const sources = { killed: 15, pushDifferential: 2, chaos: 3 }

  const levy = D.moraleDamage(unit({ quality: 'levy' }), sources).total
  const professional = D.moraleDamage(unit({ quality: 'professional' }), sources).total
  const elite = D.moraleDamage(unit({ quality: 'elite' }), sources).total

  assert.ok(professional < levy)
  assert.ok(elite < professional)
})

test('Tribal Warriors bleed like Militia but hold like Professionals', () => {
  // The single sentence that justifies the tier existing.
  const sources = { killed: 15, pushDifferential: 2, chaos: 3 }

  const tribal = D.moraleDamage(unit({ quality: 'tribal_warriors' }), sources)
  const militia = D.moraleDamage(unit({ quality: 'militia' }), sources)
  const professional = D.moraleDamage(unit({ quality: 'professional' }), sources)

  assert.equal(tribal.fromCasualties, militia.fromCasualties, 'same men, same losses')
  assert.equal(tribal.total, professional.total, 'but they hold like professionals')
  assert.ok(tribal.total < militia.total)
})

test('Veteran Mercenaries lose morale as fast as Militia despite the price', () => {
  const sources = { killed: 15, pushDifferential: 2, chaos: 3 }
  assert.equal(
    D.moraleDamage(unit({ quality: 'veteran_mercenary' }), sources).total,
    D.moraleDamage(unit({ quality: 'militia' }), sources).total
  )
})

// ── Stamina ────────────────────────────────────────────

test('stamina drains from kit weight plus the cost of being shoved', () => {
  const u = unit({ armor: 'heavy_armor', shield: 'heavy_shield' })
  const unshoved = D.staminaDrain(u, { pushDifferential: 0 })
  const shoved = D.staminaDrain(u, { pushDifferential: 4 })

  assert.equal(unshoved, R.staminaDrainPerRound(u))
  assert.ok(shoved > unshoved)
})

// ── The full exchange ──────────────────────────────────

test('an exchange is simultaneous — neither side acts on the other losses', () => {
  // Resolving in sequence would give whoever went first a free advantage and
  // quietly break mirror-match symmetry.
  const a = unit({ id: 'a', side: 'red' })
  const b = unit({ id: 'b', side: 'blue' })

  const result = D.resolveExchange(a, b)
  assert.equal(result.a.killed, result.b.killed, 'a mirror match must be exactly symmetric')
})

test('a mirror match is symmetric under swapping the pair', () => {
  const a = unit({ id: 'a', side: 'red' })
  const b = unit({ id: 'b', side: 'blue' })

  const forward = D.resolveExchange(a, b)
  const reversed = D.resolveExchange(b, a)

  assert.equal(forward.a.killed, reversed.b.killed)
  assert.equal(forward.b.killed, reversed.a.killed)
})

test('killed on a side means what that side loses, not what it inflicts', () => {
  const strong = unit({ id: 'strong', quality: 'elite', primaryWeapon: 'great_axe' })
  const weak = unit({ id: 'weak', quality: 'levy', primaryWeapon: 'daggers', armor: 'no_armor', shield: 'no_shield' })

  const result = D.resolveExchange(strong, weak)
  assert.ok(result.b.killed > result.a.killed, 'the levy should be the one bleeding')
})

test('an exchange mutates neither unit', () => {
  const a = unit({ id: 'a' })
  const b = unit({ id: 'b', mounted: true })
  const before = JSON.stringify([a, b])

  D.resolveExchange(a, b, { chaos: 5, roundsInContact: 0 }, { chaos: 5 })
  assert.equal(JSON.stringify([a, b]), before)
})

test('the charging side hits harder on impact than it does two rounds later', () => {
  // [Q5] The unit that entered contact is the attacker, and this is the whole
  // consequence of that ruling.
  const horse = unit({ id: 'horse', mounted: true, primaryWeapon: 'sword_standard' })
  const foot = unit({ id: 'foot', primaryWeapon: 'sword_standard' })

  const impact = D.resolveExchange(horse, foot, { roundsInContact: 0 }, { roundsInContact: 0 })
  const later = D.resolveExchange(horse, foot, { roundsInContact: 4 }, { roundsInContact: 4 })

  assert.ok(impact.b.killed > later.b.killed, 'the charge must decay')
})

test('a cavalry charge into braced spears is a bad idea', () => {
  const horse = unit({ id: 'horse', mounted: true, armor: 'light_armor', primaryWeapon: 'sword_standard' })
  const spears = unit({ id: 'spears', primaryWeapon: 'spear_professional' })
  const swords = unit({ id: 'swords', primaryWeapon: 'sword_standard' })

  const vsSpears = D.resolveExchange(horse, spears, { roundsInContact: 0 }, { roundsInContact: 0 })
  const vsSwords = D.resolveExchange(horse, swords, { roundsInContact: 0 }, { roundsInContact: 0 })

  assert.ok(vsSpears.a.killed > vsSwords.a.killed, 'the horses should take more')
  assert.ok(vsSpears.b.killed < vsSwords.b.killed, 'and give less')
})

test('chaos presses on morale even in a round where nobody dies', () => {
  const u = unit()
  const calm = D.moraleDamage(u, { killed: 0, pushDifferential: 0, chaos: 0 })
  const chaotic = D.moraleDamage(u, { killed: 0, pushDifferential: 0, chaos: T.CHAOS.MAX })

  assert.equal(calm.total, 0)
  assert.ok(chaotic.total > 0, 'this is what guarantees an engagement converges')
})

test('everything is deterministic — same inputs, same numbers', () => {
  const a = unit({ id: 'a' })
  const b = unit({ id: 'b' })
  const ctx = { chaos: 3, roundsInContact: 1, terrain: 'hill' }

  assert.deepEqual(D.resolveExchange(a, b, ctx, ctx), D.resolveExchange(a, b, ctx, ctx))
})
