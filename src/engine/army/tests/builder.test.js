// src/engine/army/tests/builder.test.js
//
// The headless half of phase 7: the army-builder economy under the Q6-Q8
// rulings. The final test walks a built army into the phase 5 orchestrator
// and fights it, which is the whole point of the builder existing.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { buildUnit, buildArmy, toBattleUnits, PURCHASABLE } = require('../builder')
const { createGame, submitOrders } = require('../../orchestrator')

const legionary = {
  quality: 'professional', weapon: 'roman_gladius',
  armor: 'medium_armor', shield: 'heavy_shield'
}

// ── Pricing ────────────────────────────────────────────

test('a legionary prices out: 7 quality + 2 gladius + 2 medium armour + 2 shield = 13 SP', () => {
  const result = buildUnit(legionary, 'Roman Republic')
  assert.ok(result.ok, result.errors.join('; '))
  assert.equal(result.cost, 13)
  assert.equal(result.unit.size, 100, 'Q6: a unit is one hundred men')
})

test('horse cultures pay 1 SP for the mount, everyone else pays 2', () => {
  const rider = { quality: 'professional', weapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield', mounted: true }
  const foot = buildUnit({ ...rider, mounted: false }, 'Roman Republic').cost
  assert.equal(buildUnit(rider, 'Roman Republic').cost - foot, 2)
  assert.equal(buildUnit(rider, 'Parthian Empire').cost - foot, 1)
})

// ── What is sold (Recommendation A, docs/design/army-balance.md) ─────

test('a sling costs what a bow costs, and a crossbow one more', () => {
  const price = (weapon, quality = 'levy', culture = 'Roman Republic') => buildUnit({ quality, weapon, armor: 'light_armor' }, culture).cost
  assert.equal(price('sling'), 5)
  assert.equal(price('sling') - price('self_bow_basic'), 1, 'the sling outshoots the levy bow, so it costs a point more')
  assert.equal(price('sling_professional', 'professional') - price('self_bow_professional', 'professional'), 1)
  assert.equal(price('han_chinese_crossbow', 'professional', 'Han Dynasty'), 10)
})

test('archers and slingers are light troops; a crossbowman may wear medium armour', () => {
  const kit = (weapon, armor, culture = 'Roman Republic') => buildUnit({ quality: 'professional', weapon, armor }, culture)
  assert.ok(kit('sling', 'light_armor').ok)
  assert.match(kit('sling', 'medium_armor').errors.join(), /light armor at most/)
  assert.match(kit('self_bow_professional', 'heavy_armor').errors.join(), /light armor at most/)
  assert.ok(kit('han_chinese_crossbow', 'medium_armor', 'Han Dynasty').ok)
  assert.match(kit('han_chinese_crossbow', 'heavy_armor', 'Han Dynasty').errors.join(), /medium armor at most/)
})

test('a sidearm or a thrown weapon is not sold alone, nor carried alone by an elite; an elite keeps the doc\'s armour', () => {
  for (const weapon of ['daggers', 'sickle', 'light_javelin', 'throwing_spear', 'roman_pilum']) {
    const r = buildUnit({ quality: 'professional', weapon }, 'Roman Republic')
    assert.match(r.errors.join(), /beside another weapon, not alone/, weapon)
  }
  // Now there are second weapons, the Peltast Guard carry their javelins
  // beside a sword; the Eternal Sky Riders' armour is the doc's, and stands.
  assert.ok(!buildUnit({ quality: 'veteran_mercenary', weapon: 'javelin_heavy', armor: 'light_armor', shield: 'light_shield' }, 'Thracian Odrysians', { elite: true }).ok)
  assert.ok(buildUnit({ quality: 'veteran_mercenary', weapon: 'sword_standard', second: 'javelin_heavy', armor: 'light_armor', shield: 'light_shield' }, 'Thracian Odrysians', { elite: true }).ok)
  assert.ok(buildUnit({ quality: 'veteran_mercenary', weapon: 'self_bow_professional', armor: 'medium_armor', mounted: true }, 'Pre-Genghis Mongolia', { elite: true }).ok)
  // ...but what it may not field at all, it still may not.
  assert.ok(!buildUnit({ quality: 'veteran_mercenary', weapon: 'roman_gladius' }, 'Thracian Odrysians', { elite: true }).ok)
})

// ── Second weapons (docs/design/army-balance.md, part 8) ──────────────

test('a unit may take a thrown weapon beside a one-handed hand weapon, at the thrown weapon\'s price', () => {
  const legion = buildUnit({ ...legionary, second: 'roman_pilum' }, 'Roman Republic')
  assert.ok(legion.ok, legion.errors.join('; '))
  assert.equal(legion.cost, buildUnit(legionary, 'Roman Republic').cost + 2, 'the pilum costs its 2 SP')
  assert.equal(legion.unit.second, 'roman_pilum')
  for (const second of ['light_javelin', 'throwing_spear', 'roman_plumbatae', 'javelin_heavy']) {
    assert.ok(buildUnit({ ...legionary, second }, 'Roman Republic').ok, second)
  }
  assert.ok(buildUnit({ quality: 'tribal_warriors', weapon: 'battle_axe', second: 'germanic_throwing_axe', armor: 'light_armor', shield: 'light_shield' }, 'Germanic Tribes').ok)
  assert.ok(buildUnit({ quality: 'militia', weapon: 'sword_standard', second: 'light_javelin', armor: 'light_armor', shield: 'light_shield', mounted: true }, 'Carthaginian Empire').ok, 'Numidian horse: javelins from horseback')
})

test('a missile unit may take a sword beside its bow or sling, at a sidearm\'s price of 1', () => {
  const slingers = { quality: 'levy', weapon: 'sling', armor: 'light_armor' }
  const r = buildUnit({ ...slingers, second: 'sword_standard' }, 'Roman Republic')
  assert.ok(r.ok, r.errors.join('; '))
  assert.equal(r.cost, buildUnit(slingers, 'Roman Republic').cost + 1, 'a sword at a bowman\'s belt costs 1, where a swordsman\'s costs 2')
  assert.ok(buildUnit({ quality: 'professional', weapon: 'persian_recurve_bow', second: 'persian_akinakes', armor: 'light_armor' }, 'Achaemenid Persian').ok)
  assert.ok(buildUnit({ quality: 'professional', weapon: 'self_bow_professional', second: 'sword_standard', armor: 'light_armor', mounted: true }, 'Parthian Empire').ok, 'horse archers too')
})

test('a second weapon keeps to the stacking rules: no javelins beside a bow or a two-handed weapon, no sword beside a hand weapon, no knife', () => {
  const why = (pick, culture = 'Roman Republic') => buildUnit(pick, culture).errors.join()
  assert.match(why({ quality: 'levy', weapon: 'sling', second: 'light_javelin' }), /only be thrown beside a one-handed weapon/)
  assert.match(why({ quality: 'professional', weapon: 'two_handed_spear', second: 'light_javelin' }), /only be thrown beside a one-handed weapon/)
  assert.match(why({ quality: 'professional', weapon: 'roman_gladius', second: 'sword_standard' }), /sidearm for men who shoot/)
  assert.match(why({ quality: 'levy', weapon: 'sling', second: 'daggers' }), /cannot be carried as a second weapon/, 'every missile unit has its knife already')
  assert.match(why({ quality: 'levy', weapon: 'sling', second: 'self_bow_basic' }), /cannot be carried as a second weapon/, 'no second missile weapon')
  assert.match(why({ quality: 'levy', weapon: 'light_javelin', second: 'sword_standard' }), /not alone/, 'the javelins are the second weapon, not the first')
})

test('a second weapon is held to its culture, its training and the horse, as any weapon', () => {
  const why = (pick, culture) => buildUnit(pick, culture).errors.join()
  assert.match(why({ quality: 'professional', weapon: 'sword_standard', second: 'roman_pilum' }, 'Celtic Tribes'), /not forged by Celtic Tribes/)
  assert.match(why({ quality: 'militia', weapon: 'roman_gladius', second: 'roman_pilum' }, 'Roman Republic'), /demands professional training/)
  assert.match(why({ quality: 'militia', weapon: 'sword_standard', second: 'roman_pilum', mounted: true }, 'Roman Republic'), /cannot be used from horseback/)
})

test('a unit with no second weapon is built and priced exactly as before', () => {
  const r = buildUnit(legionary, 'Roman Republic')
  assert.equal(r.cost, 13)
  assert.ok(!('second' in r.unit))
  const [spec] = toBattleUnits({ culture: 'Roman Republic', units: [r.unit] }, { side: 'red', positions: ['E7', 'E8'] })
  assert.ok(!('sidearm' in spec) && !('thrown' in spec))
})

test('in battle, a bought sword is the unit\'s sidearm and bought javelins its thrown weapon', () => {
  const army = buildArmy({
    culture: 'Roman Republic',
    units: [
      { ...legionary, second: 'roman_pilum' },
      { quality: 'levy', weapon: 'sling', second: 'sword_standard', armor: 'light_armor' }
    ]
  })
  assert.ok(army.ok, army.errors.join('; '))
  const [legion, slingers] = toBattleUnits(army.army, { side: 'red', positions: ['E7', 'E8', 'E9'] })
  assert.equal(legion.thrown, 'roman_pilum')
  assert.equal(slingers.sidearm, 'sword_standard')
  assert.equal(slingers.primaryWeapon, 'sling')
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
      { quality: 'professional', weapon: 'greek_xiphos', armor: 'light_armor', shield: 'heavy_shield' }, // 11
      { quality: 'professional', weapon: 'greek_xiphos', armor: 'light_armor', shield: 'heavy_shield' }  // 11
    ]
  }
  assert.ok(buildArmy(twoUnits).ok, '22 SP fits in 25')

  const three = { ...twoUnits, units: [...twoUnits.units, { quality: 'levy', weapon: 'clubs', armor: 'no_armor', shield: 'no_shield' }] }
  const over = buildArmy(three)
  assert.ok(!over.ok, '26 SP does not')
  assert.ok(over.errors[0].includes('budget of 25'))

  // The same 26 SP army fits Carthage's 32 — provided Carthage may buy the
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
      { quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' }, // 13
      { quality: 'militia', weapon: 'spear_professional', armor: 'light_armor', shield: 'medium_shield' }, // 8
      { quality: 'militia', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield' }          // 6
    ]
  })
  assert.ok(army.ok, army.errors.join('; '))
  assert.equal(army.army.usedSP, 27)
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

test('horse archers are raised in reduced numbers; other cavalry and foot archers are not', () => {
  const { tables: T } = require('../../combat')
  const size = (pick) => buildUnit(pick, 'Parthian Empire').unit.size
  const bow = { quality: 'professional', weapon: 'parthian_horse_bow', armor: 'light_armor', shield: 'no_shield' }
  assert.equal(size({ ...bow, mounted: true }), Math.round(100 * T.MISSILES.HORSE_ARCHER_NUMBERS))
  assert.equal(size({ ...bow, mounted: false }), 100)
  assert.equal(size({ quality: 'professional', weapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield', mounted: true }), 100)
})
