// src/game/rangedCombat.js
// Ranged Combat System: range bands, validation, and friendly-fire math

const { calculateDistance } = require('./maps/mapUtils');

// Core range bands on 25m tiles (40x40 grid)
// Weapon keys are aligned with armyData.js weapon identifiers
const RANGE_BANDS = {
  // Thrown weapons - very short range
  light_javelin: {
    effective: 1,
    maximum: 1.5,
    trajectory: 'flat',
    type: 'thrown'
  },
  throwing_spear: {
    effective: 1,
    maximum: 1.5,
    trajectory: 'flat',
    type: 'thrown'
  },
  roman_pilum: {
    effective: 1,
    maximum: 1.5,
    trajectory: 'flat',
    type: 'thrown'
  },

  // Basic bows
  self_bow_basic: {
    effective: 3, // 75m
    maximum: 5,   // 125m
    trajectory: 'medium',
    type: 'bow'
  },
  self_bow_professional: {
    effective: 5, // 125m
    maximum: 9,   // 225m
    trajectory: 'medium',
    type: 'bow'
  },

  // Composite bows
  greek_composite_bow: {
    effective: 5,
    maximum: 8,
    trajectory: 'medium',
    type: 'bow'
  },
  persian_recurve_bow: {
    effective: 5,
    maximum: 8,
    trajectory: 'medium',
    type: 'bow'
  },
  parthian_horse_bow: {
    effective: 5,
    maximum: 7, // ~180m
    trajectory: 'medium',
    type: 'bow'
  },

  // Crossbows - flat trajectory
  han_chinese_crossbow: {
    effective: 4, // 100m
    maximum: 6,   // 150m
    trajectory: 'flat',
    type: 'crossbow'
  },

  // Slings - extreme range, high arc
  sling: {
    effective: 6,  // 150m
    maximum: 12,   // 300m
    trajectory: 'high',
    type: 'sling'
  },
  sling_professional: {
    effective: 8,  // 200m
    maximum: 14,   // 350m
    trajectory: 'high',
    type: 'sling'
  }
};

/**
 * Normalize a primary weapon reference on a unit into a RANGE_BANDS key.
 * Accepts several shapes from armyData / unit wiring.
 */
function getUnitPrimaryWeaponKey(unit) {
  if (!unit) return null;

  // Prefer explicit key if present
  if (unit.primaryWeaponKey && typeof unit.primaryWeaponKey === 'string') {
    return unit.primaryWeaponKey;
  }

  const pw = unit.primaryWeapon || {};

  if (typeof pw === 'string') {
    return pw;
  }

  if (pw.key && typeof pw.key === 'string') {
    return pw.key;
  }

  if (pw.name && typeof pw.name === 'string') {
    // armyData style names are typically already normalized (self_bow_basic, sling_professional, etc.)
    return pw.name.replace(/\s+/g, '_').toLowerCase();
  }

  return null;
}

/**
 * Get range band for a given weapon key.
 */
function getWeaponRange(weaponKey) {
  if (!weaponKey) return null;
  const key = weaponKey.toString();
  return RANGE_BANDS[key] || null;
}

/**
 * Get a unit's RANGE_BANDS entry directly.
 */
function getUnitWeaponRange(unit) {
  const key = getUnitPrimaryWeaponKey(unit);
  if (!key) return null;
  return getWeaponRange(key);
}

/**
 * Does this unit have any weapon defined in RANGE_BANDS?
 */
function hasRangedWeapon(unit) {
  return !!getUnitWeaponRange(unit);
}

/**
 * Calculate accuracy / damage modifier based on distance within a weapon's range band.
 * 1.0 at/inside effective; linearly down to 0.4 at maximum; 0 beyond.
 */
function calculateRangeModifier(distance, weaponRange) {
  if (!weaponRange || typeof distance !== 'number') return 0;

  if (distance <= weaponRange.effective) {
    return 1.0;
  }

  if (distance <= weaponRange.maximum) {
    const degradation = (distance - weaponRange.effective) /
                        (weaponRange.maximum - weaponRange.effective || 1);
    // 100% → 40%
    return 1.0 - (degradation * 0.6);
  }

  return 0; // out of range
}

/**
 * Find best enemy target matching a simple keyword ("cavalry", "infantry", "enemy").
 */
function findBestTarget(shooter, keyword, enemyState) {
  const enemyUnits = enemyState?.unitPositions || [];
  if (!enemyUnits.length) return null;

  const lowerKeyword = (keyword || '').toLowerCase();

  // Simple type match first
  if (lowerKeyword && lowerKeyword !== 'enemy') {
    const match = enemyUnits.find(u => {
      const t = (u.unitType || '').toLowerCase();
      return t.includes(lowerKeyword);
    });
    if (match) return match;
  }

  // Fallback: choose closest enemy
  let best = enemyUnits[0];
  let bestDist = calculateDistance(shooter.position, best.position);

  for (let i = 1; i < enemyUnits.length; i++) {
    const u = enemyUnits[i];
    const d = calculateDistance(shooter.position, u.position);
    if (d < bestDist) {
      best = u;
      bestDist = d;
    }
  }

  return best;
}

/**
 * Compute friendly-fire risk for shooting at a specific target.
 * If battleState.meleeEngagements is absent, assume a clear shot.
 */
function calculateFriendlyFireRisk(shooter, target, battleState, weaponRangeOverride) {
  const engagements = battleState?.meleeEngagements;
  const weaponRange = weaponRangeOverride || getUnitWeaponRange(shooter) || { trajectory: 'medium' };

  if (!engagements || typeof engagements.get !== 'function') {
    return {
      risk: 0,
      method: 'clear_shot',
      trajectoryType: weaponRange.trajectory || 'medium',
      friendlyUnitsAtRisk: []
    };
  }

  const targetEngagement = engagements.get(target.unitId);
  if (!targetEngagement || !targetEngagement.engaged) {
    return {
      risk: 0,
      method: 'clear_shot',
      trajectoryType: weaponRange.trajectory || 'medium',
      friendlyUnitsAtRisk: []
    };
  }

  // Base risk by trajectory
  const trajectoryRisk = {
    flat: 0.40,
    medium: 0.30,
    high: 0.20
  };

  let baseRisk = trajectoryRisk[weaponRange.trajectory] ?? 0.30;

  // Adjust for shooting angle
  const angle = calculateShootingAngle(shooter, target);
  if (angle === 'flanking') {
    baseRisk *= 0.35; // ~10–15%
  } else if (angle === 'elevated') {
    baseRisk *= 0.65; // ~20%
  }

  return {
    risk: baseRisk,
    method: angle || 'shooting_into_melee',
    trajectoryType: weaponRange.trajectory || 'medium',
    friendlyUnitsAtRisk: targetEngagement.adjacentFriendlies || []
  };
}

/**
 * Very simple shooting angle heuristic.
 * Currently: if shooter row or col exactly matches target, call it flanking;
 * elevation is TODO once terrain-based elevation is wired in.
 */
function calculateShootingAngle(shooter, target) {
  const { parseCoord } = require('./maps/mapUtils');
  if (!shooter?.position || !target?.position) return 'frontal';

  const s = parseCoord(shooter.position);
  const t = parseCoord(target.position);

  // Placeholder for future elevation check
  // e.g., if shooter on hill, treat as 'elevated'

  if (s.row === t.row || s.col === t.col) {
    return 'flanking';
  }

  return 'frontal';
}

/**
 * Validate a ranged attack order at the rules level.
 * This does NOT execute combat; it only checks target + range and
 * computes a preliminary friendly-fire profile.
 */
function validateRangedAttack(shooter, targetKeyword, battleState, playerSide) {
  const enemySide = playerSide === 'player1' ? 'player2' : 'player1';
  const enemyState = battleState[enemySide];

  if (!shooter || !enemyState) {
    return { valid: false, error: 'Invalid shooter or enemy state' };
  }

  const weaponRange = getUnitWeaponRange(shooter);
  if (!weaponRange) {
    return {
      valid: false,
      error: 'Unit has no ranged weapon'
    };
  }

  const target = findBestTarget(shooter, targetKeyword, enemyState);
  if (!target) {
    return {
      valid: false,
      error: `Cannot identify target "${targetKeyword || 'enemy'}"`
    };
  }

  const distance = calculateDistance(shooter.position, target.position);
  if (distance <= 1) {
    return {
      valid: false,
      error: 'Target is in melee range; use melee orders instead'
    };
  }

  if (distance > weaponRange.maximum) {
    return {
      valid: false,
      error: `Target out of range (${distance} tiles, max ${weaponRange.maximum})`
    };
  }

  const rangeModifier = calculateRangeModifier(distance, weaponRange);
  const friendlyFireRisk = calculateFriendlyFireRisk(shooter, target, battleState, weaponRange);

  return {
    valid: true,
    target,
    distance,
    weaponRange,
    rangeModifier,
    friendlyFireRisk,
    needsConfirmation: friendlyFireRisk.risk > 0.20
  };
}

module.exports = {
  RANGE_BANDS,
  getWeaponRange,
  getUnitWeaponRange,
  hasRangedWeapon,
  calculateRangeModifier,
  validateRangedAttack,
  calculateFriendlyFireRisk,
  getUnitPrimaryWeaponKey
};
