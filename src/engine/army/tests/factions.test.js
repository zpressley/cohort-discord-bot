// src/engine/army/tests/factions.test.js
//
// Factions at the muster: each faction's default army is bought within its
// culture's budget and kit through the builder, its elite unit is its own
// and free, its units have names a player can type, and it forms up on
// every map.

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

const keys = Object.keys(FACTIONS)

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
    assert.equal(elite.strength, T.QUALITY_TIERS.elite.size)
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
  assert.deepEqual(resolveUnitReference('companions', macedon).units.map(u => u.id), ['red_companions'])
})

test('built units are sorted by the computer as it expects: horse are mounted, missile troops shoot', () => {
  const sarmatia = factionUnits('sarmatia', 'red')
  assert.ok(sarmatia.filter(u => u.id.includes('horse_archers')).every(u => u.mounted && missileRange(u) > 0 && u.movementRange === 5))
  const han = factionUnits('han', 'red')
  assert.ok(han.filter(u => u.id.includes('crossbows')).every(u => !u.mounted && missileRange(u) > 0 && u.role === 'archers'))
  const companions = factionUnits('macedon', 'red').find(u => u.quality === 'elite')
  assert.equal(companions.mounted, true)
  assert.equal(companions.role, 'cavalry')
  assert.equal(factionUnits('rome', 'red').find(u => u.quality === 'elite').role, 'heavy_infantry')
})

test('faction armies form up on every map, where the scenario puts each side, and a game can be made', () => {
  for (const map of mapChoices().map(m => m.id)) {
    for (const scenario of Object.keys(SCENARIOS)) {
      const base = loadScenario(scenario, { map, deploy: true })
      for (const [red, blue] of [['rome', 'sarmatia'], ['macedon', 'han']]) {
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
  }
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
  const drawn = new Set(Array.from({ length: 60 }, (_, s) => enemyFaction('rome', s + 1)))
  assert.equal(drawn.size, keys.length - 1, 'each of the others comes up')
})
