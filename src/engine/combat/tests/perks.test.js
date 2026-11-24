// src/engine/combat/tests/perks.test.js
//
// Each people's perks in battle (docs/design/army-balance.md, part 9;
// tables.PERKS; combat/perks.js). Each test is one perk, against the same
// unit without it.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const T = require('../tables')
const R = require('../ratings')
const P = require('../perks')
const ranged = require('../ranged')
const { createCombatResolver } = require('../resolve')
const { createWorld } = require('../../world')
const { createRng } = require('../../rng')

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 5, y: 5 }, strength: 100, maxStrength: 100,
    quality: 'professional', primaryWeapon: 'spear_basic', armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}
const withPerk = (perk, overrides = {}) => unit({ perks: [perk], ...overrides })

test('a unit with no perks fights exactly as before: every perk function gives nothing', () => {
  const u = unit()
  assert.equal(P.moraleEdge(u), 0)
  assert.equal(P.veterancyFloor(u), 0)
  assert.equal(P.routLine(u), T.MORALE.ROUT_THRESHOLD)
  assert.deepEqual(P.fightEdge(u, { terrain: 'hill' }), { attack: 0, defense: 0 })
  assert.equal(P.armorLeft(u), 1)
  assert.equal(P.saved(u), 0)
  assert.equal(P.onTheMove(u), T.MISSILES.ON_THE_MOVE)
  assert.equal(P.moveCost(u, 'forest', 2), 2)
  assert.equal(P.disengageWeight(u), 1)
  assert.equal(P.surpriseWeight(u), 1)
})

test('Rome, discipline: its men hold their nerve a little longer (more morale resistance)', () => {
  assert.ok(R.moraleResistance(withPerk('discipline')) > R.moraleResistance(unit()))
  assert.ok(Math.abs(R.moraleResistance(withPerk('discipline')) - R.moraleResistance(unit()) - T.PERKS.discipline.morale) < 1e-9)
})

test('Macedon, veterans of war: the Silver Shields fight as seasoned men without a battle behind them', () => {
  const shields = withPerk('old_soldiers', { quality: 'elite' })
  assert.equal(R.veteranEdge(shields).fight, 0.5)
  assert.ok(R.attackRating(shields) > R.attackRating({ ...shields, perks: undefined }))
})

test('a unit already more veteran than its perk keeps its own veterancy', () => {
  assert.equal(R.veteranEdge(withPerk('old_soldiers', { veterancy: 20 })).fight, 1)
})

test('Sparta, to the last man: its men break only when their morale is lower than other men\'s', () => {
  assert.equal(P.routLine(unit()), T.MORALE.ROUT_THRESHOLD)
  assert.ok(P.routLine(withPerk('last_man')) < T.MORALE.ROUT_THRESHOLD)
})

test('Sparta, the perioeci: its levy and militia fight as seasoned men', () => {
  assert.equal(R.veteranEdge(withPerk('perioeci', { quality: 'levy' })).fight, 0.5)
})

test('Samnium, courage: its men break lower than others, and the Sacred Spring Warriors lower still', () => {
  const men = P.routLine(withPerk('samnite_bravery'))
  const elite = P.routLine(withPerk('samnite_bravery', { quality: 'elite' }))
  assert.ok(men < T.MORALE.ROUT_THRESHOLD && elite < men, `${men}, ${elite}`)
})

test('men who break lower stand longer in a losing melee', () => {
  // Spears against swordsmen as well trained: the spears lose. With "to the
  // last man" they stand longer (here, until the swordsmen break first).
  const fight = (perks) => {
    const world = createWorld({ units: [
      unit({ id: 'a', perks }),
      unit({ id: 'b', side: 'blue', position: { x: 5, y: 6 }, primaryWeapon: 'roman_gladius' })
    ] })
    const resolve = createCombatResolver()
    const random = createRng(7)
    const engagements = [{ aId: 'a', bId: 'b', aTerrain: 'plains', bTerrain: 'plains' }]
    for (let turn = 1; turn <= 30; turn++) {
      const r = resolve({ world, engagements, random, turn })
      for (const c of r.casualties) world.units.find(u => u.id === c.unitId).strength -= c.killed
      if (r.routed.some(x => x.unitId === 'a')) return { turn, men: world.units.find(u => u.id === 'a').strength }
    }
    return { turn: Infinity, men: 0 }
  }
  const without = fight(undefined)
  const firm = fight(['last_man'])
  assert.ok(without.turn < Infinity, 'without the perk the spears break')
  assert.ok(firm.turn > without.turn, `broke on turn ${firm.turn}, not ${without.turn}`)
})

test('Silla, mountain fighters: on a hill its men fight harder and stand firmer, and on the flat as before', () => {
  const silla = withPerk('mountain_warfare')
  assert.ok(R.attackRating(silla, { terrain: 'hill' }) > R.attackRating(unit(), { terrain: 'hill' }))
  assert.ok(R.defenseRating(silla, { terrain: 'hill' }) > R.defenseRating(unit(), { terrain: 'hill' }))
  assert.equal(R.attackRating(silla, { terrain: 'plains' }), R.attackRating(unit(), { terrain: 'plains' }))
})

test('Thrace, hill men: on a hill its men stand firmer', () => {
  assert.equal(R.defenseRating(withPerk('hill_defence'), { terrain: 'hill' }) - R.defenseRating(unit(), { terrain: 'hill' }), T.PERKS.hill_defence.defense)
})

test('Samnium, hill and forest fighters: its men fight harder on hills and in woods', () => {
  for (const terrain of ['hill', 'forest']) {
    assert.ok(R.attackRating(withPerk('guerrilla'), { terrain }) > R.attackRating(unit(), { terrain }), terrain)
  }
})

test('Parthia, horse of the plains: its horse fight harder on open ground, not on a hill', () => {
  const horse = withPerk('plains_horse', { mounted: true })
  assert.ok(R.attackRating(horse, { terrain: 'plains' }) > R.attackRating({ ...horse, perks: undefined }, { terrain: 'plains' }))
  assert.equal(R.attackRating(horse, { terrain: 'hill' }), R.attackRating({ ...horse, perks: undefined }, { terrain: 'hill' }))
})

test('the Berbers, small bands: its men fight harder against a unit bigger than their own', () => {
  const band = withPerk('small_bands', { strength: 80 })
  assert.ok(R.attackRating(band, { enemy: unit({ strength: 100 }) }) > R.attackRating({ ...band, perks: undefined }, { enemy: unit({ strength: 100 }) }))
  assert.equal(R.attackRating(band, { enemy: unit({ strength: 60 }) }), R.attackRating({ ...band, perks: undefined }, { enemy: unit({ strength: 60 }) }))
})

test('Bactria, noble horse: its horse fight harder against an enemy already in a fight', () => {
  const horse = withPerk('noble_cavalry', { mounted: true })
  const flank = { bonusAttack: T.FLANKING.ATTACK_PER_EXTRA_ENGAGEMENT }
  assert.ok(R.attackRating(horse, flank) > R.attackRating({ ...horse, perks: undefined }, flank))
  assert.equal(R.attackRating(horse, {}), R.attackRating({ ...horse, perks: undefined }, {}))
})

test('Maurya, wootz steel: its blows leave the enemy a tenth less of his armour', () => {
  const target = unit({ armor: 'heavy_armor' })
  const lost = R.defenseRating(target, { enemy: unit() }) - R.defenseRating(target, { enemy: withPerk('wootz') })
  assert.ok(Math.abs(lost - T.ARMOR.heavy_armor.defense * 0.1) < 1e-9, `${lost}`)
})

test('Persia, surgeons: of the men a blow would fell, one in twenty is saved', () => {
  assert.equal(P.saved(withPerk('surgeons')), 0.05)
})

test('the Parthian shot: horse archers with it shoot as hard riding as standing', () => {
  const archers = unit({ primaryWeapon: 'parthian_horse_bow', mounted: true, armor: 'light_armor', shield: 'no_shield', strength: 60 })
  const target = unit({ side: 'blue' })
  const still = ranged.volley(archers, target, { distance: 3 })
  assert.ok(ranged.volley(archers, target, { distance: 3, moved: true }) < still)
  assert.equal(ranged.volley({ ...archers, perks: ['parthian_shot'] }, target, { distance: 3, moved: true }), still)
})

test('Kush, bow and horse: its bowmen shoot a quarter harder with its own horse right beside them', () => {
  const bows = unit({ id: 'bows', primaryWeapon: 'self_bow_professional', armor: 'light_armor', shield: 'no_shield', perks: ['bow_and_horse'] })
  const horse = unit({ id: 'horse', mounted: true, position: { x: 5, y: 6 } })
  const far = { ...horse, position: { x: 5, y: 8 } }
  const enemyHorse = { ...horse, side: 'blue' }
  assert.equal(ranged.alongside(bows, [bows, horse]), 1.25)
  assert.equal(ranged.alongside(bows, [bows, far]), 1, 'not two tiles off')
  assert.equal(ranged.alongside(bows, [bows, enemyHorse]), 1, 'not the enemy\'s horse')
  assert.equal(ranged.alongside({ ...bows, perks: undefined }, [bows, horse]), 1)
})

test('Yayoi, bow and spear: its archers shoot harder with its own spearmen right beside them, not swordsmen', () => {
  const bows = unit({ id: 'bows', primaryWeapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield', perks: ['bow_and_spear'] })
  const spears = unit({ id: 'spears', position: { x: 6, y: 5 } })
  const swords = { ...spears, primaryWeapon: 'sword_standard' }
  assert.equal(ranged.alongside(bows, [bows, spears]), 1.25)
  assert.equal(ranged.alongside(bows, [bows, swords]), 1)
})

test('woodsmen (Germania, the Celts) cross woods at the cost of open ground; the Berbers pay half as much again in woods and marsh', () => {
  assert.equal(P.moveCost(withPerk('woodland'), 'forest', 2), 1)
  assert.equal(P.moveCost(withPerk('woodland'), 'hill', 1.5), 1.5)
  assert.equal(P.moveCost(withPerk('dense_ground'), 'forest', 2), 3)
  assert.equal(P.moveCost(withPerk('dense_ground'), 'marsh', 3), 4.5)
  assert.equal(P.moveCost(withPerk('dense_ground'), 'plains', 1), 1)
})

test('Sarmatia, feigned retreat: its horse take the parting blow at half its weight', () => {
  assert.equal(P.disengageWeight(withPerk('feigned_retreat')), 0.5)
})

test('the Celts, fury: an enemy they catch by surprise is shaken half as much again', () => {
  assert.equal(P.surpriseWeight(withPerk('berserker')), 1.5)
})

test('Yayoi, quick to dig in: men who held their ground to receive the enemy are harder to break into; men who moved are not', () => {
  const yayoi = withPerk('rapid_fortification')
  assert.ok(R.defenseRating(yayoi, { prepared: true }) > R.defenseRating(unit(), { prepared: true }))
  assert.equal(R.defenseRating(yayoi, { prepared: false }), R.defenseRating(unit(), { prepared: false }))
})

test('Kush, men of the hot lands: its men spend less wind in a fight', () => {
  assert.ok(R.staminaDrainPerRound(withPerk('sun_hardened')) < R.staminaDrainPerRound(unit()))
})

test('Parthia, horse of the plains: more of its charge lives through a braced spear wall', () => {
  const horse = unit({ mounted: true })
  assert.ok(R.chargeMultiplier({ ...horse, perks: ['plains_horse'] }, 0, true) > R.chargeMultiplier(horse, 0, true))
  assert.equal(R.chargeMultiplier({ ...horse, perks: ['plains_horse'] }, 0, false), R.chargeMultiplier(horse, 0, false), 'against men who do not brace, a charge as any other')
})
