// src/phase7-army/builder.js
//
// The army builder engine — the headless half of phase 7. The Discord UI
// (block-based builder, progress bars, per-culture screens) renders on top of
// exactly this and adds nothing to the rules.
//
// A unit is built from flat keys (quality, weapon, armour, shield, mount) and
// validated against the salvaged permission tables; an army is a list of
// units priced against the cultural SP budget, plus the free elite. The
// output of toBattleUnits is the phase 4/5 unit spec, so a built army walks
// straight into the orchestrator.
//
// Everything returns { ok, errors } rather than throwing: a builder exists to
// tell players WHY the thing they clicked is not allowed, and the Discord
// layer just prints these strings.

const D = require('./data')
const { tables: T } = require('../phase2-combat/combat')

// The purchase ladder (Q8: quality IS training; elites are not purchasable —
// one arrives free per army, culture-assigned).
const PURCHASABLE = ['levy', 'militia', 'tribal_warriors', 'professional', 'veteran_mercenary']

function qualityRank(quality) {
  return T.QUALITY_ORDER.indexOf(quality)
}

function mountCost(culture) {
  return D.HORSE_CULTURES.includes(culture) ? D.MOUNT_SP_DISCOUNTED : D.MOUNT_SP
}

/**
 * Validate and price one unit.
 *
 * @param {Object} pick { quality, weapon, armor, shield, mounted }
 * @param {string} culture
 * @returns {{ ok, errors, cost, unit }}
 */
function buildUnit(pick, culture) {
  const errors = []
  const {
    quality, weapon,
    armor = 'no_armor', shield = 'no_shield', mounted = false
  } = pick

  const tier = T.QUALITY_TIERS[quality]
  if (!tier || !PURCHASABLE.includes(quality)) {
    errors.push(`"${quality}" is not a purchasable troop quality`)
  }

  // [Q7] Tribal Warriors: the price is availability.
  if (quality === 'tribal_warriors' && !D.TRIBAL_CULTURES.includes(culture)) {
    errors.push(`${culture} cannot field Tribal Warriors — the loyalty bond is tribal identity`)
  }

  const weaponData = D.WEAPONS[weapon]
  if (!weaponData) {
    errors.push(`unknown weapon "${weapon}"`)
  } else {
    if (weaponData.cultures !== 'all' && !weaponData.cultures.includes(culture)) {
      errors.push(`${weapon} is not forged by ${culture}`)
    }
    if (weaponData.minQuality && tier &&
        qualityRank(quality) < qualityRank(weaponData.minQuality)) {
      errors.push(`${weapon} demands ${weaponData.minQuality} training or better`)
    }
    if (mounted && weaponData.cavalryCompatible === false) {
      errors.push(`${weapon} cannot be used from horseback`)
    }
    // Shield permissions come from the weapon.
    if (weaponData.shieldRestriction === 'no_shield' && shield !== 'no_shield') {
      errors.push(`${weapon} takes both hands — no shield`)
    }
    if (weaponData.shieldRestriction === 'medium_shield_max' && shield === 'heavy_shield') {
      errors.push(`${weapon} allows at most a medium shield`)
    }
    // secondary_melee_only restricts what the MELEE hand does; with a single
    // primary weapon slot in this builder it behaves as no-shield-above-light.
    if (weaponData.shieldRestriction === 'secondary_melee_only' &&
        (shield === 'medium_shield' || shield === 'heavy_shield')) {
      errors.push(`${weapon} needs a free hand — light shield at most`)
    }
  }

  // Tier restrictions ([salvage] the quality ladder's own denials).
  const denied = tier?.restrictions ?? []
  if (denied.includes('heavy_armor') && armor === 'heavy_armor') {
    errors.push(`${tier.name} troops cannot bear heavy armor`)
  }
  if (denied.includes('heavy_shield') && shield === 'heavy_shield') {
    errors.push(`${tier.name} troops cannot bear heavy shields`)
  }
  if (denied.includes('heavy_weapons') && weaponData?.stacking === 'two_handed') {
    errors.push(`${tier.name} troops cannot wield heavy weapons`)
  }

  // [salvage] mounted units cannot take heavy shields.
  if (mounted && shield === 'heavy_shield') {
    errors.push('a rider cannot manage a heavy shield')
  }

  if (!(armor in D.ARMOR_SP)) errors.push(`unknown armor "${armor}"`)
  if (!(shield in D.SHIELD_SP)) errors.push(`unknown shield "${shield}"`)

  if (errors.length > 0) return { ok: false, errors, cost: 0, unit: null }

  const cost = tier.cost + weaponData.sp +
    D.ARMOR_SP[armor] + D.SHIELD_SP[shield] +
    (mounted ? mountCost(culture) : 0)

  return {
    ok: true,
    errors: [],
    cost,
    unit: { quality, weapon, armor, shield, mounted, size: tier.size, cost }
  }
}

/**
 * Validate and price an army.
 *
 * @param {Object} spec { culture, units: [pick...] }
 * @returns {{ ok, errors, army }}
 */
function buildArmy(spec) {
  const { culture, units = [] } = spec
  const budget = D.SP_BUDGETS[culture] ?? D.DEFAULT_SP_BUDGET
  const errors = []
  const built = []

  if (units.length === 0) errors.push('an army needs at least one unit')

  units.forEach((pick, index) => {
    const result = buildUnit(pick, culture)
    if (!result.ok) {
      errors.push(...result.errors.map(e => `unit ${index + 1}: ${e}`))
    } else {
      built.push(result.unit)
    }
  })

  const usedSP = built.reduce((sum, u) => sum + u.cost, 0)
  if (usedSP > budget) {
    errors.push(`army costs ${usedSP} SP against a budget of ${budget}`)
  }

  if (errors.length > 0) return { ok: false, errors, army: null }

  return {
    ok: true,
    errors: [],
    army: { culture, budget, usedSP, units: built }
  }
}

/**
 * Turn a built army into phase 4/5 battle unit specs. `eliteFields` is
 * phase 6's eliteBattleFields output when the commander has a persistent
 * elite; omitted, the elite arrives fresh at 80 men (Q6's one elite size).
 *
 * @param {Object} army        from buildArmy
 * @param {Object} deployment  { side, positions: [coord...], eliteWeapon,
 *                               eliteFields }
 */
function toBattleUnits(army, deployment) {
  const { side, positions, eliteWeapon = 'sword_standard', eliteFields = {} } = deployment
  const specs = []

  army.units.forEach((unit, index) => {
    specs.push({
      id: `${side}_unit_${index + 1}`,
      side,
      position: positions[index],
      strength: unit.size,
      maxStrength: unit.size,
      movementRange: unit.mounted ? 5 : 3,
      quality: unit.quality,
      primaryWeapon: unit.weapon,
      armor: unit.armor,
      shield: unit.shield,
      mounted: unit.mounted,
      role: unit.mounted ? 'cavalry' : roleFor(unit.weapon)
    })
  })

  // [salvage] One elite per army, free, always fielded.
  const eliteSize = T.QUALITY_TIERS.elite.size
  specs.push({
    id: `${side}_elite`,
    side,
    position: positions[army.units.length],
    strength: eliteFields.strength ?? eliteSize,
    maxStrength: eliteFields.maxStrength ?? eliteSize,
    movementRange: 3,
    quality: 'elite',
    primaryWeapon: eliteWeapon,
    armor: 'medium_armor',
    shield: 'medium_shield',
    mounted: false,
    role: 'elite_guard',
    ...(eliteFields.veteranResistance ? { veteranResistance: eliteFields.veteranResistance } : {})
  })

  return specs
}

function roleFor(weapon) {
  const data = D.WEAPONS[weapon]
  if (!data) return 'infantry'
  if (data.stacking === 'primary_ranged' || data.stacking === 'stackable_ranged') return 'archers'
  if (weapon.includes('spear') || weapon.includes('sarissa') || weapon.includes('kontos')) return 'spearmen'
  return 'heavy_infantry'
}

module.exports = { buildUnit, buildArmy, toBattleUnits, PURCHASABLE }
