// src/engine/army/tests/factions.test.js
//
// Factions at the muster: every faction in the owner's doc
// (docs/Context/final_20_cultures_complete.txt) has an entry with the doc's
// elite unit; each default army is bought within its culture's budget and
// kit through the builder, its elite unit is its own and free, its units
// have names a player can type, and it forms up on every map.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { FACTIONS, buildFaction, factionUnits, fieldFactions, enemyFaction } = require('../factions')
const { buildArmy } = require('../builder')
const D = require('../data')
const { tables: T } = require('../../combat')
const { missileRange } = require('../../combat/ranged')
const { leadUnit, musterOfficers, ridesWith, createCompany } = require('../../command/company')
const { loadScenario, SCENARIOS, mapChoices } = require('../../../adapters/hotseat/scenarios')
const { resolveUnitReference } = require('../../movement/unitResolver')
const { createGame } = require('../../orchestrator')
const { NAMES } = require('../../../data/officers')
const fs = require('node:fs')
const path = require('node:path')

const keys = Object.keys(FACTIONS)

// The doc's cultures: "### **1. ROMAN REPUBLIC**", then the elite as
// "**PRAETORIAN GUARD** (80 elite legionnaires)".
const DOC = fs.readFileSync(path.resolve(__dirname, '../../../../docs/Context/final_20_cultures_complete.txt'), 'utf8')
const docCultures = DOC.split(/^### \*\*\d+\. /m).slice(1).map(part => {
  const elite = part.match(/\*\*([^*]+)\*\* \((\d+)/)
  return { heading: part.split('**')[0].trim(), elite: elite[1], size: Number(elite[2]) }
})
const words = (text) => text.toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').map(w => w.replace(/s$/, ''))
// A faction's elite is the doc's when every word of its name is in the doc's.
const isDocElite = (name, doc) => words(name).every(w => words(doc.elite).includes(w))

test('every faction in the owner\'s doc has an entry, with the doc\'s elite unit at the doc\'s size', () => {
  assert.equal(docCultures.length, 20)
  assert.equal(keys.length, 20)
  for (const doc of docCultures) {
    const matched = keys.filter(k => isDocElite(FACTIONS[k].elite.name, doc))
    assert.equal(matched.length, 1, `${doc.heading}: one faction with the ${doc.elite}`)
    assert.equal(FACTIONS[matched[0]].elite.size, doc.size, `${doc.heading}: ${doc.size} men`)
    assert.ok(FACTIONS[matched[0]].fights && FACTIONS[matched[0]].title, doc.heading)
  }
})

test('Macedon\'s elite is the Silver Shields, on foot', () => {
  const elite = factionUnits('macedon', 'red').find(u => u.quality === 'elite')
  assert.equal(elite.id, 'red_silver_shields')
  assert.equal(elite.mounted, false)
})

test('the builder has every faction\'s culture: its budget as the doc gives it, and officers\' names for it', () => {
  for (const key of keys) {
    const culture = FACTIONS[key].culture
    assert.ok(culture in D.SP_BUDGETS, `${culture} has a budget`)
    const names = NAMES[culture]
    assert.ok(names && names.length >= 12, `${culture} has officers' names`)
    assert.equal(new Set(names).size, names.length, `${culture}: no two names alike`)
    assert.ok(names.every(n => /^[A-Z][a-z]+$/.test(n)), `${culture}: one plain word each`)
  }
  // "Begin with 25 SP instead of 30", "only 26 SP", "32 total vs 30 standard".
  assert.equal(D.SP_BUDGETS['Silla Kingdom'], 25)
  assert.equal(D.SP_BUDGETS['Tibetan Kingdoms'], 25)
  assert.equal(D.SP_BUDGETS['Samnite Federation'], 26)
  assert.equal(D.SP_BUDGETS['Carthaginian Empire'], 32)
  assert.equal(D.SP_BUDGETS['Spartan City-State'], 25)
})

test('every faction\'s default army is legal under the builder: its budget, and only kit its culture may field', () => {
  assert.ok(keys.length >= 3)
  for (const key of keys) {
    const built = buildFaction(key)
    assert.ok(built.ok, `${key}: ${built.errors.join('; ')}`)
    assert.ok(built.army.usedSP <= (D.SP_BUDGETS[FACTIONS[key].culture] ?? D.DEFAULT_SP_BUDGET), key)
    assert.equal(built.army.culture, FACTIONS[key].culture)
  }
})

test('the builder refuses a faction army that is over budget or carries another culture\'s kit', () => {
  FACTIONS.test_greedy = {
    culture: 'Macedonian Kingdoms', title: 'Greed', fights: '',
    elite: { name: 'guard', weapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield' },
    army: Array.from({ length: 4 }, () => ({ name: 'pikes', quality: 'veteran_mercenary', weapon: 'macedonian_sarissa', armor: 'heavy_armor', shield: 'no_shield' }))
  }
  FACTIONS.test_thief = {
    culture: 'Roman Republic', title: 'Thief', fights: '',
    elite: { name: 'guard', weapon: 'chinese_dao', armor: 'medium_armor', shield: 'medium_shield' },
    army: [{ name: 'pikes', quality: 'militia', weapon: 'macedonian_sarissa', armor: 'light_armor', shield: 'no_shield' }]
  }
  try {
    assert.match(buildFaction('test_greedy').errors.join(), /budget/)
    const thief = buildFaction('test_thief').errors.join()
    assert.match(thief, /macedonian_sarissa is not forged by Roman Republic/)
    assert.match(thief, /the guard: chinese_dao is not forged by Roman Republic/, 'the elite\'s kit is checked too')
    assert.throws(() => factionUnits('test_thief', 'red'))
  } finally {
    delete FACTIONS.test_greedy
    delete FACTIONS.test_thief
  }
})

test('the elite unit is free and is the faction\'s own: one per army, raised at the elite\'s size, in the faction\'s kit', () => {
  for (const key of keys) {
    const units = factionUnits(key, 'red')
    const elites = units.filter(u => u.quality === 'elite')
    assert.equal(elites.length, 1, key)
    const [elite] = elites
    const kit = FACTIONS[key].elite
    assert.equal(elite.primaryWeapon, kit.weapon)
    assert.equal(elite.armor, kit.armor)
    assert.equal(elite.mounted, Boolean(kit.mounted))
    assert.equal(elite.strength, kit.size ?? T.QUALITY_TIERS.elite.size)
    assert.equal(elite.maxStrength, elite.strength)
    assert.equal(elite.culture, FACTIONS[key].culture)
    // Free: the bill is the bought units' alone.
    const bill = buildArmy({ culture: FACTIONS[key].culture, units: FACTIONS[key].army }).army.usedSP
    assert.equal(buildFaction(key).army.usedSP, bill)
    assert.equal(units.length, FACTIONS[key].army.length + 1)
  }
  // Each faction's elite is its own.
  assert.equal(new Set(keys.map(k => FACTIONS[k].elite.name)).size, keys.length)
})

test('a new Commander\'s veteran leads the elite unit, and he rides with it', () => {
  for (const key of keys) {
    const units = factionUnits(key, 'red').map(u => ({ ...u, kind: u.id.replace(/^red_/, '').replace(/_/g, ' ') }))
    assert.equal(units[leadUnit(units)].quality, 'elite', key)
    const led = musterOfficers(createCompany(), units, 7)
    const veteran = led.units.find(u => u.officer && !u.officer.headless)
    assert.equal(veteran.quality, 'elite', key)
    assert.equal(led.units.find(u => u.id === ridesWith(led.units)).quality, 'elite', key)
  }
})

test('unit names are distinct; two of a kind are numbered, and the name alone orders both', () => {
  for (const key of keys) {
    const units = factionUnits(key, 'blue')
    assert.equal(new Set(units.map(u => u.id)).size, units.length, key)
    for (const unit of units) {
      assert.match(unit.id, /^blue_[a-z_]+(_\d)?$/, 'a name a player can type')
      assert.deepEqual(resolveUnitReference(unit.id.replace(/^blue_/, '').replace(/_/g, ' '), units).units.map(u => u.id), [unit.id])
    }
  }
  const macedon = factionUnits('macedon', 'red')
  assert.deepEqual(macedon.filter(u => u.id.startsWith('red_sarissa_foot')).map(u => u.id), ['red_sarissa_foot_1', 'red_sarissa_foot_2'])
  assert.deepEqual(resolveUnitReference('sarissa foot', macedon).units.map(u => u.id), ['red_sarissa_foot_1', 'red_sarissa_foot_2'])
  assert.deepEqual(resolveUnitReference('silver shields', macedon).units.map(u => u.id), ['red_silver_shields'])
})

test('built units are sorted by the computer as it expects: horse are mounted, missile troops shoot', () => {
  const sarmatia = factionUnits('sarmatia', 'red')
  assert.ok(sarmatia.filter(u => u.id.includes('horse_archers')).every(u => u.mounted && missileRange(u) > 0 && u.movementRange === 5))
  const han = factionUnits('han', 'red')
  assert.ok(han.filter(u => u.id.includes('crossbows')).every(u => !u.mounted && missileRange(u) > 0 && u.role === 'archers'))
  const riders = factionUnits('sarmatia', 'red').find(u => u.quality === 'elite')
  assert.equal(riders.mounted, true)
  assert.equal(riders.role, 'cavalry')
  assert.ok(factionUnits('sarmatia', 'red').every(u => u.mounted), 'no foot for the Sarmatians')
  const bows = factionUnits('kush', 'red').find(u => u.quality === 'elite')
  assert.ok(!bows.mounted && missileRange(bows) > 0 && bows.role === 'archers', 'the Golden Bows shoot')
  assert.equal(factionUnits('rome', 'red').find(u => u.quality === 'elite').role, 'heavy_infantry')
})

test('faction armies form up on every map, where the scenario puts each side, and a game can be made', () => {
  // Every faction, on each side in turn: the factions two by two.
  const pairs = keys.filter((_, i) => i % 2 === 0).map((k, i) => [k, keys[2 * i + 1]])
  mapChoices().map(m => m.id).forEach((map, m) => {
    for (const scenario of Object.keys(SCENARIOS)) {
      const base = loadScenario(scenario, { map, deploy: true })
      for (const [a, b] of pairs) {
        const [red, blue] = m % 2 ? [b, a] : [a, b]
        const spec = fieldFactions(base, { red, blue })
        const at = new Set(spec.units.map(u => `${u.position.x},${u.position.y}`))
        assert.equal(at.size, spec.units.length, `${map}: no two units on one tile`)
        for (const side of ['red', 'blue']) {
          const theirs = spec.units.filter(u => u.side === side)
          const was = base.units.filter(u => u.side === side)
          const cx = (list) => list.reduce((s, u) => s + u.position.x, 0) / list.length
          assert.ok(Math.abs(cx(theirs) - cx(was)) <= 3, `${map} ${side}: on the scenario's ground`)
        }
        assert.doesNotThrow(() => createGame(spec, { seed: 1 }))
      }
    }
  })
})

test('changing one side\'s faction leaves the other side\'s army where it stands', () => {
  const both = fieldFactions(loadScenario('meeting-battle', { map: 'ashford', deploy: true }), { red: 'rome', blue: 'han' })
  const again = fieldFactions(both, { blue: 'sarmatia' })
  assert.deepEqual(again.units.filter(u => u.side === 'red'), both.units.filter(u => u.side === 'red'))
  assert.ok(again.units.filter(u => u.side === 'blue').every(u => u.faction === 'sarmatia'))
})

test('the enemy\'s faction, when none is chosen, is another faction, the same for the same seed', () => {
  for (const key of keys) {
    for (let seed = 1; seed < 30; seed++) {
      assert.notEqual(enemyFaction(key, seed), key)
      assert.equal(enemyFaction(key, seed), enemyFaction(key, seed))
    }
  }
  const drawn = new Set(Array.from({ length: 300 }, (_, s) => enemyFaction('rome', s + 1)))
  assert.equal(drawn.size, keys.length - 1, 'each of the others comes up')
})

test('Kush\'s Golden Bows carry a sword for the melee, and no other unit carries a second weapon', () => {
  // Ruled 2026-11-24: "They don't hit hard from range? They can have a sword".
  const spec = fieldFactions(loadScenario('meeting-battle', { map: 'ashford', deploy: true }), { red: 'kush', blue: 'rome' })
  const bows = spec.units.find(u => u.id === 'red_golden_bows')
  assert.equal(bows.primaryWeapon, 'self_bow_professional')
  assert.equal(bows.sidearm, 'sword_standard')
  assert.deepEqual(spec.units.filter(u => u.sidearm).map(u => u.id), ['red_golden_bows'])
  const game = require('../../orchestrator').createGame({ ...spec, standingOrders: {} }, { seed: 1 })
  assert.equal(game.battle.world.units.find(u => u.id === 'red_golden_bows').sidearm, 'sword_standard', 'and take it into battle')
})

test('an elite\'s sidearm must be a hand weapon its culture may field', () => {
  const was = FACTIONS.kush.elite.sidearm
  try {
    FACTIONS.kush.elite.sidearm = 'roman_gladius'
    assert.equal(buildFaction('kush').ok, false, 'not a Roman sword')
    FACTIONS.kush.elite.sidearm = 'sling'
    assert.equal(buildFaction('kush').ok, false, 'not a second missile weapon')
  } finally { FACTIONS.kush.elite.sidearm = was }
  assert.equal(buildFaction('kush').ok, true)
})
