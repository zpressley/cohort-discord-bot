// src/phase7-army/data.js
//
// The army-builder economy, rebuilt clean per rulings Q6-Q8. Data only.
//
// [salvage] Everything here is transcribed from the legacy armyData.js —
// which the recovered plan names "authoritative for the Phase 7 army builder,
// AFTER Q4-Q8 rulings" — with the rulings now applied:
//
//   Q6  units are ~100 men; the salvaged SP costs were authored "per 100-man
//       unit" (armyData's own header), so they land on the new scale as-is
//   Q7  tribal_warriors is priced and statted in phase 2's QUALITY_TIERS
//       (equal to militia, morale the differentiator) and is FACTION-GATED
//       here — availability is the cost
//   Q8  there is no training purchase. The field does not exist in this
//       builder, and nothing will ever read one.
//
// Combat stats (damage, effectiveness) live in phase 2's tables and are NOT
// duplicated here — this file is prices and permissions, that one is math.
// The two are joined by weapon/armour/shield KEY.
//
// Open flags, deliberately carried rather than solved:
//   - SP costs are salvaged verbatim; re-derivation against the balance
//     harness (cost parity per SP across kit, not just quality) is tuning
//     work for when the builder meets players. persian_kontos at 3 SP is the
//     known outlier (roadmap phase-2 completion notes).
//   - SUPPORT_SPECIALISTS stay out until their effects are real mechanics —
//     the legacy versions were prose that nothing parsed.

// [salvage] CULTURAL_SP_BUDGETS, verbatim.
const SP_BUDGETS = {
  'Roman Republic': 30,
  'Macedonian Kingdoms': 30,
  'Spartan City-State': 25,
  'Carthaginian Empire': 32,
  'Kingdom of Kush': 30,
  'Berber Confederations': 30,
  'Sarmatian Confederations': 30,
  'Han Dynasty': 30
}
const DEFAULT_SP_BUDGET = 30

// [Q7] Which cultures may field Tribal Warriors. The notebook calls the
// morale bonus "faction identity"; the legacy data never encoded the gate, so
// the tribal/confederation cultures from the weapon tables' own culture lists
// seed it. Phase 9's culture dataset owns the final word.
const TRIBAL_CULTURES = [
  'Celtic Tribes',
  'Germanic Tribes',
  'Berber Confederations',
  'Sarmatian Confederations',
  'Thracian Odrysians'
]

// [salvage] armyData weapon costs and permissions, all 39, verbatim.
//   sp                 supply point cost
//   stacking           primary | secondary | two_handed | primary_ranged | stackable_ranged
//   minQuality         quality-tier gate (ordered ladder, gate admits better)
//   shieldRestriction  no_shield | secondary_melee_only | medium_shield_max
//   cavalryCompatible  false = cannot be taken mounted
//   cultures           'all' or the list that may buy it
const WEAPONS = {
  clubs: { sp: 1, stacking: 'primary', cavalryCompatible: false, cultures: 'all' },
  daggers: { sp: 1, stacking: 'secondary', cultures: 'all' },
  spear_basic: { sp: 1, stacking: 'primary', cavalryCompatible: false, cultures: 'all' },
  sickle: { sp: 1, stacking: 'secondary', cavalryCompatible: false, cultures: 'all' },
  light_javelin: { sp: 1, stacking: 'stackable_ranged', cultures: 'all' },
  germanic_war_scythe: { sp: 1, stacking: 'primary', cavalryCompatible: false, cultures: ['Germanic Tribes'] },
  chinese_quarterstaff: { sp: 1, stacking: 'primary', shieldRestriction: 'no_shield', cavalryCompatible: false, cultures: ['Han Dynasty'] },
  roman_pugio: { sp: 1, stacking: 'secondary', cultures: ['Roman Republic'] },

  spear_professional: { sp: 2, stacking: 'primary', cavalryCompatible: false, cultures: 'all' },
  battle_axe: { sp: 2, stacking: 'primary', cavalryCompatible: false, cultures: 'all' },
  mace: { sp: 2, stacking: 'primary', cultures: 'all' },
  sword_standard: { sp: 2, stacking: 'primary', cultures: 'all' },
  roman_gladius: { sp: 2, stacking: 'primary', cavalryCompatible: false, cultures: ['Roman Republic'] },
  greek_xiphos: { sp: 2, stacking: 'primary', cavalryCompatible: false, cultures: ['Spartan City-State', 'Macedonian Kingdoms'] },
  chinese_dao: { sp: 2, stacking: 'primary', cultures: ['Han Dynasty'] },
  celtic_longsword: { sp: 2, stacking: 'primary', cultures: ['Celtic Tribes'] },
  persian_akinakes: { sp: 2, stacking: 'secondary', cultures: ['Achaemenid Persian', 'Parthian Empire'] },

  two_handed_spear: { sp: 3, stacking: 'two_handed', minQuality: 'professional', shieldRestriction: 'no_shield', cavalryCompatible: false, cultures: 'all' },
  heavy_mace: { sp: 3, stacking: 'two_handed', minQuality: 'professional', shieldRestriction: 'no_shield', cavalryCompatible: false, cultures: 'all' },
  great_axe: { sp: 3, stacking: 'two_handed', minQuality: 'professional', shieldRestriction: 'no_shield', cavalryCompatible: false, cultures: 'all' },
  macedonian_sarissa: { sp: 3, stacking: 'two_handed', shieldRestriction: 'no_shield', cavalryCompatible: false, cultures: ['Macedonian Kingdoms'] },
  thracian_rhomphaia: { sp: 3, stacking: 'two_handed', shieldRestriction: 'no_shield', cavalryCompatible: false, cultures: ['Thracian Odrysians'] },
  celtic_champions_sword: { sp: 3, stacking: 'two_handed', shieldRestriction: 'no_shield', cavalryCompatible: false, cultures: ['Celtic Tribes'] },
  chinese_chang_dao: { sp: 3, stacking: 'two_handed', shieldRestriction: 'no_shield', cavalryCompatible: false, cultures: ['Han Dynasty'] },
  germanic_framea: { sp: 3, stacking: 'two_handed', shieldRestriction: 'no_shield', cavalryCompatible: false, cultures: ['Germanic Tribes'] },
  persian_kontos: { sp: 3, stacking: 'two_handed', shieldRestriction: 'no_shield', cultures: ['Achaemenid Persian', 'Parthian Empire'] },

  sling: { sp: 1, stacking: 'stackable_ranged', cultures: 'all' },
  self_bow_basic: { sp: 1, stacking: 'primary_ranged', shieldRestriction: 'secondary_melee_only', cultures: 'all' },
  throwing_spear: { sp: 1, stacking: 'stackable_ranged', cultures: 'all' },
  roman_plumbatae: { sp: 1, stacking: 'stackable_ranged', cultures: ['Roman Republic'] },
  germanic_throwing_axe: { sp: 1, stacking: 'stackable_ranged', cavalryCompatible: false, cultures: ['Germanic Tribes'] },
  self_bow_professional: { sp: 2, stacking: 'primary_ranged', minQuality: 'professional', shieldRestriction: 'secondary_melee_only', cultures: 'all' },
  javelin_heavy: { sp: 2, stacking: 'stackable_ranged', minQuality: 'professional', cultures: 'all' },
  sling_professional: { sp: 2, stacking: 'stackable_ranged', minQuality: 'professional', cultures: 'all' },
  roman_pilum: { sp: 2, stacking: 'stackable_ranged', minQuality: 'professional', cavalryCompatible: false, cultures: ['Roman Republic'] },
  greek_composite_bow: { sp: 2, stacking: 'primary_ranged', minQuality: 'professional', shieldRestriction: 'secondary_melee_only', cultures: ['Spartan City-State', 'Macedonian Kingdoms'] },
  persian_recurve_bow: { sp: 2, stacking: 'primary_ranged', minQuality: 'professional', shieldRestriction: 'secondary_melee_only', cultures: ['Achaemenid Persian'] },
  han_chinese_crossbow: { sp: 2, stacking: 'primary_ranged', minQuality: 'professional', shieldRestriction: 'medium_shield_max', cavalryCompatible: false, cultures: ['Han Dynasty'] },
  parthian_horse_bow: { sp: 2, stacking: 'primary_ranged', minQuality: 'professional', shieldRestriction: 'secondary_melee_only', cultures: ['Parthian Empire'] }
}

// [salvage] ARMOR_CATEGORIES / SHIELD_OPTIONS SP costs (the combat values for
// the same keys live in phase 2's tables).
const ARMOR_SP = { no_armor: 0, light_armor: 0, medium_armor: 1, heavy_armor: 2 }
const SHIELD_SP = { no_shield: 0, light_shield: 0, medium_shield: 1, heavy_shield: 2 }

// [salvage] MOUNT_OPTIONS: 3 SP standard, 2 for the horse cultures.
const MOUNT_SP = 3
const MOUNT_SP_DISCOUNTED = 2
const HORSE_CULTURES = ['Sarmatian Confederations', 'Parthian Empire']

module.exports = {
  SP_BUDGETS,
  DEFAULT_SP_BUDGET,
  TRIBAL_CULTURES,
  WEAPONS,
  ARMOR_SP,
  SHIELD_SP,
  MOUNT_SP,
  MOUNT_SP_DISCOUNTED,
  HORSE_CULTURES
}
