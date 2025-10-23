// src/game/eliteTemplates.js
// Create elite unit templates by culture, aligned with docs/Context/final_20_cultures_complete.txt

function getEliteUnitForCulture(culture, eliteSize, allWeapons, TROOP_QUALITY) {
  // Load canonical elite sizes from docs (if present)
  let ELITE_DB = null;
  try { ELITE_DB = require('../../docs/Context/elite_units_warp_format.js'); } catch (_) {}

  // Resolve size from DB by culture if available
  let sizeFromDocs = null;
  if (ELITE_DB) {
    for (const key of Object.keys(ELITE_DB)) {
      const entry = ELITE_DB[key];
      if (entry && entry.culture && entry.culture.toLowerCase().includes(culture.toLowerCase())) {
        sizeFromDocs = entry.size;
        break;
      }
    }
  }

  const effectiveSize = sizeFromDocs || eliteSize || 80;

  const map = {
    'Roman Republic': { weaponKey: 'roman_gladius', mounted: false },
    'Macedonian Kingdoms': { weaponKey: 'spear_professional', mounted: false },
    'Spartan City-State': { weaponKey: 'spear_professional', mounted: false },
    'Carthaginian Empire': { weaponKey: 'spear_professional', mounted: false },
    'Kingdom of Kush': { weaponKey: 'self_bow_professional', mounted: false },
    'Berber Confederations': { weaponKey: 'light_javelin', mounted: true },
    'Sarmatian Confederations': { weaponKey: 'persian_kontos', mounted: true },
    'Han Dynasty': { weaponKey: 'chinese_dao', mounted: false },
    'Celtic Tribes': { weaponKey: 'celtic_longsword', mounted: false }
  };

  const cfg = map[culture] || { weaponKey: 'spear_professional', mounted: false };
  const primary = allWeapons[cfg.weaponKey] || allWeapons['spear_professional'];

  // Try to carry elite display name from docs if available
  let eliteName = null;
  if (ELITE_DB) {
    for (const key of Object.keys(ELITE_DB)) {
      const entry = ELITE_DB[key];
      if (entry && entry.culture && entry.culture.toLowerCase().includes(culture.toLowerCase())) {
        eliteName = entry.name;
        break;
      }
    }
  }

  return {
    isElite: true,
    eliteName: eliteName || 'Elite Unit',
    quality: TROOP_QUALITY['veteran_mercenary'],
    qualityType: 'veteran_mercenary',
    mounted: !!cfg.mounted,
    mount: cfg.mounted ? { name: 'Horses', cost: 0 } : null,
    primaryWeaponKey: cfg.weaponKey,
    primaryWeapon: primary,
    secondaryWeapons: [],
    rangedWeapons: [],
    currentStrength: effectiveSize,
    maxStrength: effectiveSize
  };
}

module.exports = { getEliteUnitForCulture };
