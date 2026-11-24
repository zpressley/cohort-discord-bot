// src/engine/army/builder.js
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
const { tables: T } = require('../combat')

// The purchase ladder (Q8: quality IS training; elites are not purchasable —
// one arrives free per army, culture-assigned).
// How many men a unit is raised with: its quality tier's number, except
// horse archers, who are fewer (ruled 2026-11-21; MISSILES.HORSE_ARCHER_NUMBERS).
function unitSize(tier, weapon, mounted) {
  const shoots = (T.WEAPONS[weapon]?.range ?? 0) >= T.MISSILES.MIN_RANGE_M
  return mounted && shoots ? Math.round(tier.size * T.MISSILES.HORSE_ARCHER_NUMBERS) : tier.size
}

const PURCHASABLE = ['levy', 'militia', 'tribal_warriors', 'professional', 'veteran_mercenary']

function qualityRank(quality) {
  return T.QUALITY_ORDER.indexOf(quality)
}

function mountCost(culture) {
  return D.HORSE_CULTURES.includes(culture) ? D.MOUNT_SP_DISCOUNTED : D.MOUNT_SP
}

// Second weapons (docs/design/army-balance.md, part 8). What kind of second
// weapon a weapon is: 'thrown' (javelins, pila, plumbatae, throwing axes:
// the data's stackable_ranged with a reach too short to shoot), 'sidearm'
// (a sword: data.js, `sidearm`), or null (it is no second weapon).
const reach = (weapon) => T.WEAPONS[weapon]?.range ?? 0
function secondKind(weapon) {
  const data = D.WEAPONS[weapon]
  if (!data) return null
  if (data.stacking === 'stackable_ranged' && reach(weapon) < T.MISSILES.MIN_RANGE_M) return 'thrown'
  if (data.sidearm) return 'sidearm'
  return null
}

// What a second weapon costs: its own price, or `secondSp` where the data
// gives one for it as a second weapon (data.js).
function secondPrice(second) {
  const data = D.WEAPONS[second]
  return data.secondSp ?? data.sp
}

// What a second weapon is in a battle unit's spec: a sword is the unit's
// `sidearm` (combat/ratings.js, handWeapon), a thrown weapon its `thrown`
// (battle/battle.js, the throw at contact). None: nothing.
function secondFields(second) {
  const kind = second ? secondKind(second) : null
  if (kind === 'sidearm') return { sidearm: second }
  if (kind === 'thrown') return { thrown: second }
  return {}
}

/**
 * Validate and price one unit.
 *
 * @param {Object} pick { quality, weapon, armor, shield, mounted, second }
 *   `second`: a second weapon, or none
 * @param {string} culture
 * @param {Object} [o]  { elite: true } checks a faction's own elite unit,
 *   which is never sold: only what its culture may field and carry, not the
 *   rule on missile troops' armour
 * @returns {{ ok, errors, cost, unit }}
 */
function buildUnit(pick, culture, { elite = false } = {}) {
  const errors = []
  const {
    quality, weapon,
    armor = 'no_armor', shield = 'no_shield', mounted = false,
    second = null
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
    // Missile troops are light troops; a crossbowman may be armoured to
    // medium (docs/design/army-balance.md, Recommendation A). A faction's
    // elite is not bought: the doc's armoured horse archers stand.
    if (!elite && weaponData.armorMax && (armor in D.ARMOR_SP) &&
        Object.keys(D.ARMOR_SP).indexOf(armor) > Object.keys(D.ARMOR_SP).indexOf(weaponData.armorMax)) {
      errors.push(`${weapon} is carried by men in ${weaponData.armorMax.replace('_armor', '')} armor at most`)
    }
    // A sidearm or a thrown weapon is carried beside another weapon, not
    // alone (Recommendation A): it is bought as a unit's second weapon
    // (below). The faction elites that carried javelins alone carry them
    // now beside a sword (src/data/factions.js).
    if (weaponData.stacking === 'secondary' ||
        (weaponData.stacking === 'stackable_ranged' && reach(weapon) < T.MISSILES.MIN_RANGE_M)) {
      errors.push(`${weapon} is carried beside another weapon, not alone`)
    }
  }

  // A second weapon (docs/design/army-balance.md, part 8): one, beside the
  // main one, by the weapon data's own stacking. A thrown weapon beside a
  // one-handed hand weapon (the shield arm throws, then takes the shield);
  // a sword beside a missile weapon, to fight hand to hand with in place of
  // the knife. Its culture, training and horse rules are any weapon's.
  const secondData = second ? D.WEAPONS[second] : null
  if (second && !secondData) {
    errors.push(`unknown weapon "${second}"`)
  } else if (secondData) {
    const kind = secondKind(second)
    const shoots = reach(weapon) >= T.MISSILES.MIN_RANGE_M
    if (!kind) {
      errors.push(`${second} cannot be carried as a second weapon`)
    } else if (kind === 'thrown' && !(weaponData?.stacking === 'primary' && !shoots)) {
      errors.push(`${second} can only be thrown beside a one-handed weapon`)
    } else if (kind === 'sidearm' && weaponData && !shoots) {
      errors.push(`${second} is a sidearm for men who shoot`)
    }
    if (secondData.cultures !== 'all' && !secondData.cultures.includes(culture)) {
      errors.push(`${second} is not forged by ${culture}`)
    }
    if (secondData.minQuality && tier &&
        qualityRank(quality) < qualityRank(secondData.minQuality)) {
      errors.push(`${second} demands ${secondData.minQuality} training or better`)
    }
    if (mounted && secondData.cavalryCompatible === false) {
      errors.push(`${second} cannot be used from horseback`)
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

  const cost = tier.cost + weaponData.sp + (secondData ? secondPrice(second) : 0) +
    D.ARMOR_SP[armor] + D.SHIELD_SP[shield] +
    (mounted ? mountCost(culture) : 0)

  return {
    ok: true,
    errors: [],
    cost,
    unit: { quality, weapon, ...(second ? { second } : {}), armor, shield, mounted, size: unitSize(tier, weapon, mounted), cost }
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
      ...secondFields(unit.second),
      role: unit.mounted ? 'cavalry' : roleFor(unit.weapon),
      ...(army.culture ? { culture: army.culture } : {})
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
    ...(army.culture ? { culture: army.culture } : {}),
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

module.exports = { buildUnit, buildArmy, toBattleUnits, roleFor, unitSize, mountCost, secondKind, secondFields, secondPrice, PURCHASABLE }
