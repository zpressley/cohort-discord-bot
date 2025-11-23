// src/game/morale.js
// Morale 1.0 - basic break / routing checks per unit

/**
 * Break thresholds by training level (casualty fraction of max strength)
 * Values are midpoints of the ranges in the design notes.
 */
const BASE_BREAK_THRESHOLDS = {
  levy: 0.18,           // 15–20%
  militia: 0.18,        // treat similar to levy for now
  professional: 0.30,   // 25–35%
  veteran: 0.40,        // 35–45%
  elite: 0.48,          // 45–50%
  legendary: 0.55       // 50%+, only under special conditions
};

/**
 * Compute an adjusted break threshold for a unit given local modifiers.
 * context can include:
 * - commanderNearby: boolean
 * - legendaryNearby: boolean
 * - commanderLost: boolean (captured/killed)
 * - alliesRoutingNearby: number of nearby routing allies
 */
function getAdjustedBreakThreshold(unit, context = {}) {
  const quality = (unit.qualityType || unit.quality || 'professional').toLowerCase();
  let base = BASE_BREAK_THRESHOLDS[quality] ?? BASE_BREAK_THRESHOLDS.professional;

  let modifier = 0;

  // Veteran status (regular units)
  const vb = unit.veteranBattles || 0;
  if (vb >= 10) modifier += 0.10;        // Legendary line vets: +10% break threshold
  else if (vb >= 5) modifier += 0.06;    // Veteran: +6%
  else if (vb >= 2) modifier += 0.03;    // Seasoned: +3%
  else if (vb === 1) modifier += 0.01;   // Green but blooded: +1%

  // Elite unit veteran tier (from eliteVeteranLevel / veteranTier)
  const eliteTier = (unit.veteranTier || '').toLowerCase();
  if (eliteTier === 'seasoned') modifier += 0.03;
  else if (eliteTier === 'veteran') modifier += 0.05;
  else if (eliteTier === 'elite veteran') modifier += 0.07;
  else if (eliteTier === 'legendary') modifier += 0.10;

  // Commander / nearby effects
  if (context.commanderNearby) modifier += 0.10;        // +10%
  if (context.legendaryNearby) modifier += 0.05;        // +5%
  if (context.commanderLost) modifier -= 0.10;          // -10%
  if (context.alliesRoutingNearby && context.alliesRoutingNearby > 0) {
    modifier -= 0.05;                                   // -5% if any routing nearby
  }

  // Legendary units by quality type: only break if commander lost
  if (quality === 'legendary' && !context.commanderLost) {
    modifier += 1.0; // effectively impossible to break otherwise
  }

  const threshold = Math.max(0.05, base + modifier);
  return threshold;
}

/**
 * Check morale for a single unit after casualties this turn.
 * Mutates the unit in-place with isBroken / isRouting flags.
 */
function checkMorale(unit, casualtiesThisTurn, context = {}) {
  if (!unit || !unit.maxStrength) return unit;

  const casualtyRate = casualtiesThisTurn / unit.maxStrength;
  const threshold = getAdjustedBreakThreshold(unit, context);

  if (unit.isRouting) {
    // Already routing: allow rally check later (handled elsewhere)
    return unit;
  }

  if (casualtyRate >= threshold && !unit.isBroken) {
    unit.isBroken = true;
    unit.isRouting = true; // For v1, breaking implies immediate rout
    unit.morale = Math.min(unit.morale ?? 100, 20);
  }

  return unit;
}

module.exports = {
  checkMorale,
  getAdjustedBreakThreshold,
  BASE_BREAK_THRESHOLDS
};
