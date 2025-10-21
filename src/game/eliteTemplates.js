// src/game/eliteTemplates.js
// Create elite unit templates by culture, aligned with docs/Context/final_20_cultures_complete.txt

function getEliteUnitForCulture(culture, eliteSize, allWeapons, TROOP_QUALITY) {
  if (!eliteSize || eliteSize <= 0) return null;

  const map = {
    'Roman Republic': { weaponKey: 'roman_gladius', mounted: false },
    'Macedonian Kingdoms': { weaponKey: 'spear_professional', mounted: false },
    'Spartan City-State': { weaponKey: 'spear_professional', mounted: false },
    'Carthaginian Empire': { weaponKey: 'sword_standard', mounted: false },
    'Kingdom of Kush': { weaponKey: 'self_bow_professional', mounted: false },
    'Berber Confederations': { weaponKey: 'javelin_heavy', mounted: true },
    'Sarmatian Confederations': { weaponKey: 'persian_kontos', mounted: true },
    'Han Dynasty': { weaponKey: 'chinese_dao', mounted: false },
    'Mauryan Empire': { weaponKey: 'spear_professional', mounted: false },
    'Silla Kingdom': { weaponKey: 'greek_composite_bow', mounted: false },
    'Achaemenid Persian': { weaponKey: 'persian_akinakes', mounted: false },
    'Parthian Empire': { weaponKey: 'parthian_horse_bow', mounted: true },
    'Germanic Tribes': { weaponKey: 'germanic_war_scythe', mounted: false },
    'Thracian Odrysians': { weaponKey: 'thracian_rhomphaia', mounted: false },
    'Samnite Federation': { weaponKey: 'roman_gladius', mounted: false },
    'Tibetan Kingdoms': { weaponKey: 'two_handed_spear', mounted: false },
    'Pre-Genghis Mongolia': { weaponKey: 'persian_recurve_bow', mounted: true },
    'Celtic Tribes': { weaponKey: 'celtic_longsword', mounted: false },
    'Bactrian Greeks': { weaponKey: 'macedonian_sarissa', mounted: false },
    'Yayoi Japan': { weaponKey: 'self_bow_professional', mounted: false }
  };

  const cfg = map[culture] || { weaponKey: 'spear_professional', mounted: false };
  const primary = allWeapons[cfg.weaponKey] || allWeapons['spear_professional'];

  return {
    isElite: true,
    quality: TROOP_QUALITY['veteran_mercenary'],
    qualityType: 'veteran_mercenary',
    mounted: !!cfg.mounted,
    mount: cfg.mounted ? { name: 'Horses', cost: 0 } : null,
    primaryWeaponKey: cfg.weaponKey,
    primaryWeapon: primary,
    secondaryWeapons: [],
    rangedWeapons: [],
    currentStrength: eliteSize,
    maxStrength: eliteSize
  };
}

module.exports = { getEliteUnitForCulture };
