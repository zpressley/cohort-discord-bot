// src/engine/army/tests/standard.test.js
//
// A standard army a player bought: checked through the builder (budget,
// culture's kit, the elite not for sale), every unit with a name of its
// own, formed up on every map; and the computer's faction by lot, the
// player's own among them.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { usualArmy, checkStandard, standardUnits, fieldArmies, anyFaction } = require('../standard')
const { FACTIONS, factionUnits, fieldFactions } = require('../factions')
const { loadScenario, SCENARIOS, mapChoices } = require('../../../adapters/hotseat/scenarios')
const { resolveUnitReference } = require('../../movement/unitResolver')
const { armyChanged, musterOfficers, createCompany, unitsOf } = require('../../command/company')
const { createGame } = require('../../orchestrator')

const keys = Object.keys(FACTIONS)
const slingers = (n) => Array.from({ length: n }, (_, i) => ({ name: i ? `slingers ${i + 1}` : 'slingers', quality: 'levy', weapon: 'sling' }))

test('an army over its budget is refused with the builder\'s reason', () => {
  const rich = Array.from({ length: 3 }, (_, i) => ({ name: `swords ${i + 1}`, quality: 'veteran_mercenary', weapon: 'sword_standard', armor: 'heavy_armor', shield: 'heavy_shield' }))
  const checked = checkStandard('rome', rich)
  assert.equal(checked.ok, false)
  assert.deepEqual(checked.errors, ['army costs 45 SP against a budget of 30'])
})

test('an army with kit its culture may not field is refused with the builder\'s reason', () => {
  const checked = checkStandard('rome', [{ name: 'pikes', quality: 'professional', weapon: 'macedonian_sarissa', armor: 'light_armor' }])
  assert.deepEqual(checked.errors, ['unit 1: macedonian_sarissa is not forged by Roman Republic'])
  assert.match(checkStandard('han', [{ name: 'spears', quality: 'tribal_warriors', weapon: 'spear_basic' }]).errors[0], /cannot field Tribal Warriors/)
})

test('the elite is not for sale: it cannot be bought, its name cannot be taken, and it comes with every army', () => {
  assert.match(checkStandard('rome', [{ name: 'guard', quality: 'elite', weapon: 'roman_gladius' }]).errors[0], /"elite" is not a purchasable troop quality/)
  assert.match(checkStandard('rome', [{ name: 'praetorian guard', quality: 'levy', weapon: 'sling' }]).errors[0], /the elite's name/)
  for (const key of keys) {
    const units = standardUnits(key, slingers(2), 'red')
    assert.equal(units.filter(u => u.quality === 'elite').length, 1, key)
    assert.equal(units.at(-1).aliases[0], FACTIONS[key].elite.name)
  }
  assert.equal(checkStandard('rome', []).errors[0], 'an army needs at least one unit', 'the elite alone is no army to buy')
})

test('a faction\'s usual army, as a list a player could have bought, fields exactly as the faction\'s own army', () => {
  for (const key of keys) {
    assert.ok(checkStandard(key, usualArmy(key)).ok, key)
    assert.deepEqual(standardUnits(key, usualArmy(key), 'blue'), factionUnits(key, 'blue'), key)
  }
})

test('bought units have distinct names; one numbered is told apart, and a name all of whose units are numbered orders them all', () => {
  assert.match(checkStandard('rome', [...slingers(1), ...slingers(1)]).errors[0], /two units are called "slingers"/)
  for (const bad of ['', 'everyone!', 'four words are too many', 'Spears']) {
    assert.ok(!checkStandard('rome', [{ name: bad, quality: 'levy', weapon: 'sling' }]).ok, `"${bad}" is refused`)
  }
  const units = standardUnits('rome', [...slingers(3), { name: 'spears 1', quality: 'levy', weapon: 'spear_basic' }, { name: 'spears 2', quality: 'levy', weapon: 'spear_basic' }], 'red')
  const find = (words) => resolveUnitReference(words, units).units.map(u => u.id)
  assert.deepEqual(find('slingers'), ['red_slingers'])
  assert.deepEqual(find('slingers 3'), ['red_slingers_3'])
  assert.deepEqual(find('spears 2'), ['red_spears_2'])
  assert.deepEqual(find('spears'), ['red_spears_1', 'red_spears_2'])
  assert.deepEqual(find('praetorian guard'), ['red_praetorian_guard'])
})

test('a bought army forms up on every map, where the scenario puts its side, and a game can be made', () => {
  // Seven units, the most a Roman budget buys: levy archers at 4 SP each.
  const archers = Array.from({ length: 7 }, (_, i) => ({ name: i ? `archers ${i + 1}` : 'archers', quality: 'levy', weapon: 'self_bow_basic', armor: 'light_armor' }))
  const big = { rome: archers, sarmatia: Array.from({ length: 3 }, (_, i) => ({ name: i ? `horse archers ${i + 1}` : 'horse archers', quality: 'tribal_warriors', weapon: 'self_bow_basic', armor: 'light_armor', mounted: true })) }
  for (const map of mapChoices().map(m => m.id)) {
    for (const scenario of Object.keys(SCENARIOS)) {
      const spec = fieldArmies(loadScenario(scenario, { map, deploy: true }), { red: { faction: 'rome', units: big.rome }, blue: { faction: 'sarmatia', units: big.sarmatia } })
      const at = new Set(spec.units.map(u => `${u.position.x},${u.position.y}`))
      assert.equal(at.size, spec.units.length, `${map}: no two units on one tile`)
      assert.equal(spec.units.length, 8 + 4)
      assert.doesNotThrow(() => createGame(spec, { seed: 1 }), map)
    }
  }
})

test('with no army bought, a side fields its faction\'s usual army exactly as before', () => {
  const base = loadScenario('meeting-battle', { map: 'thornwood', deploy: true })
  assert.deepEqual(fieldArmies(base, { red: { faction: 'han', units: null }, blue: { faction: 'rome', units: null } }), fieldFactions(base, { red: 'han', blue: 'rome' }))
})

test('the same faction may fight on both sides: each army its own, told apart by side', () => {
  const spec = fieldArmies(loadScenario('meeting-battle', { map: 'ashford', deploy: true }), { red: { faction: 'rome', units: slingers(2) }, blue: { faction: 'rome', units: null } })
  const ids = spec.units.map(u => u.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('red_praetorian_guard') && ids.includes('blue_praetorian_guard'))
  assert.doesNotThrow(() => createGame(spec, { seed: 3 }))
})

test('the computer\'s faction by lot is any faction, the player\'s own among them, the same for the same seed', () => {
  const drawn = new Set(Array.from({ length: 600 }, (_, s) => anyFaction(s + 1)))
  assert.deepEqual([...drawn].sort(), [...keys].sort())
  assert.equal(anyFaction(17), anyFaction(17))
})

test('changing the army keeps a kept unit\'s officer and count, drops a dismissed unit\'s count, and makes no officer', () => {
  const company = {
    ...createCompany(),
    battles: 3,
    officers: [
      { id: 'o1', name: 'Gaius', experience: 9, personality: 'steady', leads: 'praetorian guard', status: 'fit', record: [] },
      { id: 'o2', name: 'Marcus', experience: 4, personality: 'bold', leads: 'legionaries', status: 'fit', record: [] }
    ],
    units: { hastati: 3, slingers: 2 },
    nextId: 3
  }
  // Kept: legionaries (their kit changed) and slingers. Dismissed: hastati. Bought: spears.
  const after = armyChanged(company, ['legionaries', 'slingers', 'spears', 'praetorian guard'])
  assert.deepEqual(unitsOf(after).map(u => [u.kind, u.battles]), [['slingers', 2]], 'the dismissed unit takes its battles with it')
  assert.deepEqual(after.officers, company.officers, 'officers stay with the company')
  const units = standardUnits('rome', [
    { name: 'legionaries', quality: 'veteran_mercenary', weapon: 'roman_gladius', armor: 'heavy_armor', shield: 'medium_shield' },
    { name: 'slingers', quality: 'levy', weapon: 'sling' },
    { name: 'spears', quality: 'levy', weapon: 'spear_basic' }
  ], 'red').map(u => ({ ...u, kind: u.aliases[0] }))
  const led = musterOfficers(after, units, 5)
  const by = Object.fromEntries(led.units.map(u => [u.kind, u.officer.headless ? null : u.officer.name]))
  assert.deepEqual(by, { legionaries: 'Marcus', slingers: null, spears: null, 'praetorian guard': 'Gaius' })
  const battlesOf = Object.fromEntries(unitsOf(led.company).map(u => [u.kind, u.battles]))
  assert.deepEqual([battlesOf.slingers, battlesOf.spears], [2, 0], 'the new unit starts from nothing')

  // Legionaries dismissed: Marcus stays, and leads the best unit without an officer.
  const without = armyChanged(company, ['slingers', 'spears', 'praetorian guard'])
  const again = musterOfficers(without, standardUnits('rome', [{ name: 'slingers', quality: 'levy', weapon: 'sling' }, { name: 'spears', quality: 'militia', weapon: 'spear_basic' }], 'red').map(u => ({ ...u, kind: u.aliases[0] })), 5)
  assert.equal(again.units.find(u => u.kind === 'spears').officer.name, 'Marcus')
  assert.equal(again.company.officers.length, 2, 'no officer is made by changing the army')
})
