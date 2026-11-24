// src/engine/army/tests/perks.test.js
//
// Each people's perks at the muster, and its restrictions on the army it
// buys (docs/design/army-balance.md, part 9).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { FACTIONS } = require('../../../data/factions')
const T = require('../../combat/tables')
const { factionUnits } = require('../factions')
const { standardUnits, usualArmy } = require('../standard')
const { buildUnit, qualityCost } = require('../builder')
const { checkRestrictions } = require('../restrictions')

const kit = (k) => ({ armor: 'no_armor', shield: 'no_shield', mounted: false, ...k })

test('every faction has at least one perk, and every perk it names is one the game knows', () => {
  for (const [key, f] of Object.entries(FACTIONS)) {
    assert.ok(Array.isArray(f.perks) && f.perks.length > 0, `${key} has no perk`)
    for (const p of f.perks) assert.ok(T.PERKS[p], `${key}: no perk "${p}"`)
  }
})

test('every faction\'s usual army keeps to its own restrictions', () => {
  for (const key of Object.keys(FACTIONS)) assert.deepEqual(checkRestrictions(key, usualArmy(key)), [], key)
})

test('a faction\'s own units carry the perks that are theirs, and only those, at the muster', () => {
  const sparta = factionUnits('sparta', 'red')
  const helots = sparta.find(u => u.id === 'red_helots')
  const hoplites = sparta.find(u => u.id === 'red_hoplites')
  assert.deepEqual(helots.perks, ['last_man', 'perioeci'])
  assert.deepEqual(hoplites.perks, ['last_man'], 'the perioeci perk is for levy and militia only')
  const macedon = factionUnits('macedon', 'red')
  assert.deepEqual(macedon.find(u => u.quality === 'elite').perks, ['old_soldiers'])
  assert.equal(macedon.find(u => u.quality !== 'elite').perks, undefined, 'veterans of war is for the Silver Shields alone')
})

test('a perk true of the game already (crossbows, merchant wealth) is not carried into battle', () => {
  for (const u of factionUnits('carthage', 'red')) assert.equal(u.perks, undefined)
})

test('Han and Mongolia, more men: every unit they buy is raised a fifth larger; the elite is not', () => {
  const han = factionUnits('han', 'red')
  assert.equal(han.find(u => u.id === 'red_crossbows').strength, 120)
  assert.equal(han.find(u => u.quality === 'elite').strength, FACTIONS.han.elite.size)
})

test('a bought army gets its people\'s perks; a unit taken from another people does not', () => {
  const units = standardUnits('sarmatia', usualArmy('sarmatia'), 'red', 'west', {
    gained: [{ name: 'spears', ...kit({ quality: 'militia', weapon: 'spear_basic' }), culture: 'Roman Republic' }]
  })
  assert.deepEqual(units.find(u => u.id === 'red_horse_archers_1').perks, ['feigned_retreat'])
  assert.equal(units.find(u => u.id === 'red_spears').perks, undefined)
})

test('a battle unit with no faction carries no perks (scenarios and the balance duels play as before)', () => {
  const { createUnit } = require('../../world')
  assert.equal(createUnit({ id: 'x', side: 'red', position: { x: 1, y: 1 } }).perks, undefined)
})

test('Tibet, hired swords: veteran mercenaries cost Tibet 7 supply points; others pay 9', () => {
  assert.equal(qualityCost('veteran_mercenary', 'Tibetan Kingdoms'), 7)
  assert.equal(qualityCost('veteran_mercenary', 'Roman Republic'), 9)
  const pick = kit({ quality: 'veteran_mercenary', weapon: 'spear_basic' })
  assert.equal(buildUnit(pick, 'Roman Republic').cost - buildUnit(pick, 'Tibetan Kingdoms').cost, 2)
})

// ── Restrictions ──────────────────────────────────

const legion = kit({ quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' })
const levy = kit({ quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'light_shield' })
const slingers = kit({ quality: 'levy', weapon: 'sling' })

test('Rome: at least half the army, the elite counted, must be heavy foot', () => {
  assert.deepEqual(checkRestrictions('rome', [legion, levy, levy]), [])
  assert.match(checkRestrictions('rome', [levy, levy, levy])[0], /at least half of the army must be foot/)
})

test('Macedon fields no levy or militia', () => {
  assert.match(checkRestrictions('macedon', [levy])[0], /does not field levy troops/)
  assert.deepEqual(checkRestrictions('macedon', [kit({ quality: 'professional', weapon: 'spear_basic' })]), [])
})

test('Sparta and Thrace hire no veteran mercenaries', () => {
  for (const key of ['sparta', 'thrace']) {
    assert.match(checkRestrictions(key, [kit({ quality: 'veteran_mercenary', weapon: 'spear_basic' })])[0], /veteran mercenary troops/, key)
  }
})

test('Carthage fields at most two units of professionals or veteran mercenaries', () => {
  const pro = kit({ quality: 'professional', weapon: 'spear_basic' })
  assert.deepEqual(checkRestrictions('carthage', [pro, pro]), [])
  assert.match(checkRestrictions('carthage', [pro, pro, pro])[0], /at most 2 units/)
})

test('Kush and Yayoi field no men in heavy armour', () => {
  for (const key of ['kush', 'yayoi']) {
    assert.match(checkRestrictions(key, [kit({ quality: 'professional', weapon: 'spear_basic', armor: 'heavy_armor' })])[0], /heavy armour/, key)
  }
})

test('Sarmatia and Mongolia field no foot', () => {
  for (const key of ['sarmatia', 'mongolia']) {
    assert.match(checkRestrictions(key, [kit({ quality: 'militia', weapon: 'sword_standard' })])[0], /no foot/, key)
  }
})

test('Maurya needs foot, bowmen or slingers, and horse in its army', () => {
  assert.match(checkRestrictions('maurya', [levy, levy])[0], /every arm together/)
  assert.deepEqual(checkRestrictions('maurya', [slingers, kit({ quality: 'militia', weapon: 'sword_standard', mounted: true })]), [])
})

test('Parthia: at least 10 supply points on levy, and at least half the army on horses', () => {
  const horse = kit({ quality: 'militia', weapon: 'self_bow_basic', mounted: true })
  assert.match(checkRestrictions('parthia', [horse, horse])[0], /levy/)
  assert.match(checkRestrictions('parthia', [levy, levy, levy])[0], /must be horse/)
  assert.deepEqual(checkRestrictions('parthia', [levy, levy, levy, horse, horse]), [], 'three levy units (12 points), and three of six on horses')
})

test('Thrace has no armour or shields above light', () => {
  assert.match(checkRestrictions('thrace', [kit({ quality: 'tribal_warriors', weapon: 'spear_basic', shield: 'medium_shield' })])[0], /above light/)
})

test('the Celts have no bowmen or slingers of professional training or better', () => {
  assert.match(checkRestrictions('celts', [kit({ quality: 'professional', weapon: 'sling' })])[0], /professional bowmen or slingers/)
  assert.deepEqual(checkRestrictions('celts', [slingers]), [])
})

test('Bactria: no more than 30% of the army, the elite counted, may be heavy foot', () => {
  assert.deepEqual(checkRestrictions('bactria', [levy, levy, slingers]), [])
  assert.match(checkRestrictions('bactria', [kit({ quality: 'professional', weapon: 'spear_basic', armor: 'medium_armor' }), levy])[0], /no more than 30%/)
})

test('Yayoi fields at most one unit of horse', () => {
  const horse = kit({ quality: 'militia', weapon: 'sword_standard', mounted: true })
  assert.deepEqual(checkRestrictions('yayoi', [horse]), [])
  assert.match(checkRestrictions('yayoi', [horse, horse])[0], /at most 1 unit of horse/)
})
