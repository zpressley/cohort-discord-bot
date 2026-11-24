// src/interpreter/tests/kinds.test.js
//
// Units by the kind the Army tab shows (narrator/words.js, kindWords), in
// orders (interpreter/kinds.js; docs/DECISIONS.md, "How kinds of unit in
// orders and the follow order were built"). Checked for every faction's
// usual army and elite, and for a bought army.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { FACTIONS, factionUnits } = require('../../engine/army/factions')
const { standardUnits } = require('../../engine/army/standard')
const { kindParts } = require('../../narrator/words')
const { unitName } = require('../../web/battles')
const { resolveUnitsWide } = require('../resolve')
const { KIND_SAID } = require('../kinds')

// The army as the app gives it to the order reader (web/battles.js, context).
const asReader = (units) => units.map(u => ({ ...u, aliases: [unitName(u).toLowerCase(), ...(u.aliases ?? [])] }))
const own = (u) => [u.id.replace(/^red_/, '').replace(/_/g, ' '), ...(u.aliases ?? [])].map(n => n.toLowerCase())

// Every way he may say each kind his Army tab shows, with "the" and with
// its quality, must find exactly the units shown under it: unless a unit's
// own name is those words, which keeps them (the rule for names since the
// grammar was widened).
function check(units, label) {
  const shownKinds = new Set(units.map(u => kindParts(u).kind))
  for (const kind of shownKinds) {
    const forms = KIND_SAID.find(([k]) => k === kind)?.[1]
    if (!forms) continue
    for (const form of forms) {
      for (const said of [form, `the ${form}`]) {
        const named = units.filter(u => own(u).includes(form))
        const meant = named.length ? named : units.filter(u => kindParts(u).kind === kind || kindParts(u).kind.endsWith(' ' + kind))
        const got = resolveUnitsWide(said, units).units.map(u => u.id).sort()
        assert.deepEqual(got, meant.map(u => u.id).sort(), `${label}: "${said}"`)
      }
    }
    for (const u of units.filter(x => kindParts(x).kind === kind)) {
      const said = `${kindParts(u).quality} ${kind}`
      if (units.some(x => own(x).includes(said))) continue
      const meant = units.filter(x => kindParts(x).quality === kindParts(u).quality && (kindParts(x).kind === kind || kindParts(x).kind.endsWith(' ' + kind)))
      assert.deepEqual(resolveUnitsWide(said, units).units.map(x => x.id).sort(), meant.map(x => x.id).sort(), `${label}: "${said}"`)
    }
  }
}

test('every kind word on the Army tab finds exactly the units shown under it, in all twenty factions\' usual armies and elites', () => {
  assert.equal(Object.keys(FACTIONS).length, 20)
  for (const key of Object.keys(FACTIONS)) check(asReader(factionUnits(key, 'red')), key)
})

test('every kind word finds exactly the units shown under it in a bought army', () => {
  const bought = standardUnits('rome', [
    { name: 'stone throwers', quality: 'levy', weapon: 'sling' },
    { name: 'long spears', quality: 'professional', weapon: 'two_handed_spear' },
    { name: 'riders', quality: 'levy', weapon: 'sword_standard', second: 'light_javelin', armor: 'light_armor', mounted: true },
    { name: 'runners', quality: 'levy', weapon: 'sword_standard', second: 'light_javelin', armor: 'light_armor', shield: 'light_shield' }
  ], 'red')
  check(asReader(bought), 'bought')
  const units = asReader(bought)
  const ids = (said) => resolveUnitsWide(said, units).units.map(u => u.id).sort()
  assert.deepEqual(ids('slingers'), ['red_stone_throwers'])
  assert.deepEqual(ids('the pikes'), ['red_long_spears'])
  assert.deepEqual(ids('light horse'), ['red_riders'])
  assert.deepEqual(ids('skirmishers'), ['red_runners'])
})

test('where the old role and the word on the screen disagree, the screen wins: Rome\'s velites are skirmishers, not heavy infantry', () => {
  const units = asReader(factionUnits('rome', 'red'))
  const ids = (said) => resolveUnitsWide(said, units).units.map(u => u.id).sort()
  assert.deepEqual(ids('skirmishers'), ['red_velites'])
  assert.deepEqual(ids('heavy infantry'), ['red_hastati', 'red_legionaries', 'red_praetorian_guard'])
})

test('"the infantry", "the foot", "the cavalry" and "the horse" are every unit on foot and every unit on horse', () => {
  const rome = asReader(factionUnits('rome', 'red'))
  const ids = (units, said) => resolveUnitsWide(said, units).units.map(u => u.id).sort()
  assert.deepEqual(ids(rome, 'the infantry'), rome.map(u => u.id).sort())
  assert.deepEqual(ids(rome, 'the foot'), rome.map(u => u.id).sort())
  const parthia = asReader(factionUnits('parthia', 'red'))
  const horse = parthia.filter(u => u.mounted).map(u => u.id).sort()
  assert.deepEqual(ids(parthia, 'the cavalry'), horse, 'horse archers and lancers are cavalry too')
  assert.deepEqual(ids(parthia, 'the horse'), horse)
})

test('a unit whose own name is a kind word keeps it: Thrace\'s "spearmen" are its unit called Spearmen', () => {
  const units = asReader(factionUnits('thrace', 'red'))
  const ids = (said) => resolveUnitsWide(said, units).units.map(u => u.id).sort()
  assert.deepEqual(ids('spearmen'), ['red_spearmen'])
  assert.deepEqual(ids('skirmishers'), ['red_peltast_guard', 'red_spearmen'], 'both shown as skirmishers')
})
