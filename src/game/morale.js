// src/game/morale.js
// Morale System (MORALE-001) - basic implementation

const MORALE_BREAKS = {
  levy: { threshold: 0.8 },          // 20% remaining
  militia: { threshold: 0.7 },       // 30% remaining
  professional: { threshold: 0.65 }, // 35% remaining
  veteran: { threshold: 0.6 },       // 40% remaining
  elite: { threshold: 0.55 }         // 45% remaining
};

function getBreakThreshold(unit) {
  const qt = (unit.qualityType || '').toLowerCase();
  if (qt.includes('elite')) return MORALE_BREAKS.elite.threshold;
  if (qt.includes('veteran')) return MORALE_BREAKS.veteran.threshold;
  if (qt.includes('professional')) return MORALE_BREAKS.professional.threshold;
  if (qt.includes('militia')) return MORALE_BREAKS.militia.threshold;
  return MORALE_BREAKS.levy.threshold;
}

// Evaluate morale after casualties and flag broken units
function evaluateAndFlagBreaks(positions) {
  const mark = (arr) => {
    return (arr || []).map(u => {
      const max = u.maxStrength || 100;
      const cur = Math.max(0, u.currentStrength || 0);
      const remainingRatio = cur / max; // 1.0 = fresh
      const breakAt = 1 - getBreakThreshold(u); // convert threshold to casualty percent
      const broken = (1 - remainingRatio) >= breakAt; // casualties >= threshold
      if (broken) {
        return { ...u, status: 'broken', isBroken: true };
      }
      return u;
    });
  };

  return {
    player1: mark(positions.player1),
    player2: mark(positions.player2)
  };
}

module.exports = {
  MORALE_BREAKS,
  evaluateAndFlagBreaks
};
