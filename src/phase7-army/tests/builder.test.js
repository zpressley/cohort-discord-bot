// src/phase7-army/tests/builder.test.js
//
// The headless half of phase 7: the army-builder economy under the Q6-Q8
// rulings. The final test walks a built army into the phase 5 orchestrator
// and fights it, which is the whole point of the builder existing.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { buildUnit, buildArmy, toBattleUnits, PURCHASABLE } = require('../builder')
const { createGame, submitOrders } = require('../../phase5-orchestration')

const legionary = {
  quality: 'professional', weapon: 'roman_gladius',
  armor: 'medium_armor', shield: 'heavy_shield'
}

// ── Pricing ────────────────────────────────────────────

test('a legionary prices out: 7 quality + 2 gladius + 1 armor + 2 shield = 12 SP', () => {
  const result = buildUnit(legionary, 'Roman Republic')
  assert.ok(result.ok, result.errors.join('; '))
  assert.equal(result.cost, 12)
  assert.equal(result.unit.size, 100, 'Q6: a unit is one hundred men')
})

test('horse cultures pay 2 SP for the mount, everyone else pays 3', () => {
  const rider = { quality: 'professional', weapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield', mounted: true }
  const roman = buildUnit(rider, 'Roman Republic')
  const parthian = buildUnit(rider, 'Parthian Empire')
  assert.equal(roman.cost - parthian.cost, 1)
})

test('Q8: there is no training purchase — the builder has no such field to pay into', () => {
  // A pick carrying the legacy training field is simply ignored: it prices
  // identically to one without, because quality IS training.
  const withDeadField = buildUnit({ ...legionary, training: { type: 'expert', cost: 6 } }, 'Roman Republic')
  const without = buildUnit(legionary, 'Roman Republic')
  assert.equal(withDeadField.cost, without.cost)
  assert.ok(!PURCHASABLE.includes('elite'), 'and elites are never bought')
})

// ── Permission rules ───────────────────────────────────

test('Q7: only tribal cultures may field Tribal Warriors', () => {
  const tribal = { quality: 'tribal_warriors', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' }
  assert.ok(buildUnit(tribal, 'Celtic Tribes').ok)
  const denied = buildUnit(tribal, 'Roman Republic')
  assert.ok(!denied.ok)
  assert.ok(denied.errors[0].includes('Tribal Warriors'))
})

test('levies cannot bear heavy anything', () => {
  const overloaded = buildUnit(
    { quality: 'levy', weapon: 'great_axe', armor: 'heavy_armor', shield: 'heavy_shield' },
    'Roman Republic')
  assert.ok(!overloaded.ok)
  assert.equal(overloaded.errors.length, 5,
    'heavy weapon, heavy armor, heavy shield, the min-quality gate, and the two-hands/shield conflict all refuse')
})

test('a two-handed weapon refuses a shield; a rider refuses a heavy one', () => {
  const pike = buildUnit(
    { quality: 'professional', weapon: 'two_handed_spear', armor: 'light_armor', shield: 'light_shield' },
    'Roman Republic')
  assert.ok(!pike.ok)
  assert.ok(pike.errors[0].includes('both hands'))

  const rider = buildUnit(
    { quality: 'professional', weapon: 'sword_standard', armor: 'light_armor', shield: 'heavy_shield', mounted: true },
    'Roman Republic')
  assert.ok(!rider.ok)
})

test('cultural weapons stay cultural, and quality gates admit better troops', () => {
  const stolen = buildUnit({ ...legionary }, 'Han Dynasty')
  assert.ok(!stolen.ok, 'a gladius is not forged in Chang’an')

  const militiaPike = buildUnit(
    { quality: 'militia', weapon: 'two_handed_spear', armor: 'light_armor', shield: 'no_shield' },
    'Roman Republic')
  assert.ok(!militiaPike.ok, 'militia cannot manage the two-handed spear')

  const vetPike = buildUnit(
    { quality: 'veteran_mercenary', weapon: 'two_handed_spear', armor: 'light_armor', shield: 'no_shield' },
    'Roman Republic')
  assert.ok(vetPike.ok, 'the gate is min-quality — better troops pass it')
})

test('a spear-armed unit cannot ride: the anti-cavalry weapons are infantry weapons', () => {
  const lancerAttempt = buildUnit(
    { quality: 'professional', weapon: 'spear_professional', armor: 'light_armor', shield: 'no_shield', mounted: true },
    'Roman Republic')
  assert.ok(!lancerAttempt.ok)
  assert.ok(lancerAttempt.errors[0].includes('horseback'))
})

// ── The budget ─────────────────────────────────────────

test('Sparta fields less: 25 SP against the standard 30', () => {
  const twoUnits = {
    culture: 'Spartan City-State',
    units: [
      { quality: 'professional', weapon: 'greek_xiphos', armor: 'medium_armor', shield: 'heavy_shield' }, // 12
      { quality: 'professional', weapon: 'greek_xiphos', armor: 'medium_armor', shield: 'heavy_shield' }  // 12
    ]
  }
  assert.ok(buildArmy(twoUnits).ok, '24 SP fits in 25')

  const three = { ...twoUnits, units: [...twoUnits.units, { quality: 'levy', weapon: 'clubs', armor: 'no_armor', shield: 'no_shield' }] }
  const over = buildArmy(three)
  assert.ok(!over.ok, '28 SP does not')
  assert.ok(over.errors[0].includes('budget of 25'))

  // The same 28 SP army fits Carthage's 32 — provided Carthage may buy the
  // kit. Swap the Spartan blades for common ones to isolate the budget rule.
  const carthaginian = {
    culture: 'Carthaginian Empire',
    units: three.units.map(u => u.weapon === 'greek_xiphos' ? { ...u, weapon: 'sword_standard' } : u)
  }
  assert.ok(buildArmy(carthaginian).ok, 'the richest budget takes what Sparta cannot')
})

test('an army budget buys 3-4 real units, which is the Q6 army shape', () => {
  const army = buildArmy({
    culture: 'Roman Republic',
    units: [
      { quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' }, // 12
      { quality: 'militia', weapon: 'spear_professional', armor: 'light_armor', shield: 'medium_shield' }, // 8
      { quality: 'militia', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield' }          // 6
    ]
  })
  assert.ok(army.ok, army.errors.join('; '))
  assert.equal(army.army.usedSP, 26)
  // Plus the free elite: 4 units of ~100 on the field, per the design's
  // "armies become 4-6 units of ~100" consequence of Q6.
})

// ── Into battle ────────────────────────────────────────

test('a built army walks straight into the orchestrator and fights', () => {
  const roman = buildArmy({
    culture: 'Roman Republic',
    units: [
      { quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' },
      { quality: 'militia', weapon: 'spear_professional', armor: 'light_armor', shield: 'medium_shield' }
    ]
  })
  const celt = buildArmy({
    culture: 'Celtic Tribes',
    units: [
      { quality: 'tribal_warriors', weapon: 'celtic_longsword', armor: 'light_armor', shield: 'medium_shield' },
      { quality: 'tribal_warriors', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' }
    ]
  })
  assert.ok(roman.ok && celt.ok)

  const units = [
    ...toBattleUnits(roman.army, { side: 'red', positions: ['E7', 'E8', 'E9'] }),
    ...toBattleUnits(celt.army, { side: 'blue', positions: ['N7', 'N8', 'N9'] })
  ]
  assert.equal(units.length, 6, 'two bought units and one free elite per side')
  assert.ok(units.some(u => u.id === 'red_elite' && u.maxStrength === 80))

  const game = createGame({
    name: 'builder-battle',
    seed: 5,
    sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
    standingOrders: { red: 'advance', blue: 'advance' },
    units,
    turns: []
  })

  let outcome = null
  for (let round = 0; round < 40 && !game.outcome.decided; round++) {
    submitOrders(game, 'red', [])
    outcome = submitOrders(game, 'blue', [])
  }

  assert.ok(game.outcome.decided, 'the built armies must fight to a verdict')
  assert.ok(['red', 'blue', 'draw'].includes(game.outcome.winner))
})

test('a persistent elite carries its veteran resistance onto the field', () => {
  const army = buildArmy({
    culture: 'Roman Republic',
    units: [{ quality: 'militia', weapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield' }]
  })
  const specs = toBattleUnits(army.army, {
    side: 'red', positions: ['E7', 'E8'],
    eliteFields: { veteranResistance: 0.6, strength: 58, maxStrength: 58 }
  })
  const elite = specs.find(s => s.id === 'red_elite')
  assert.equal(elite.veteranResistance, 0.6)
  assert.equal(elite.strength, 58, 'the survivors of the last battle, not a fresh 80')
})
