// src/commanderName/titles/titleManager.js
// Self-contained title progression logic. This does not touch live Discord or DB.

const { TITLE_TIERS } = require('./titleDefinitions');

class TitleManager {
  /**
   * Compute title progression for a commander given previous state and new battle result.
   * This is a pure function: it returns the updated state but does not persist.
   *
   * @param {Object} commander - commander state (archetype, philosophy, battlesCompleted, currentTier, currentTitle, titleHistory)
   * @param {{ outcome?: string }} battleResult
   * @returns {Object} updated commander fields ({ battlesCompleted, currentTier, currentTitle, titleHistory, newlyEarnedTitle })
   */
  checkTitleProgression(commander, battleResult = {}) {
    const prevBattles = commander.battlesCompleted || 0;
    const newBattleCount = prevBattles + 1;

    const prevTier = commander.currentTier || 0;
    let newTier = prevTier;
    let newTitle = null;

    // Simple tier thresholds
    const tierCheck = [
      { tier: 1, battles: TITLE_TIERS.tier1.requirement }
      // Future: add tier2/3/4 here
    ];

    for (const check of tierCheck) {
      if (newBattleCount === check.battles) {
        newTier = check.tier;
        const tierDef = TITLE_TIERS[`tier${check.tier}`];
        const ph = commander.philosophy || 'glory';
        const arch = commander.archetype || 'engineer';
        newTitle = tierDef.titles[ph]?.[arch] || null;
        break;
      }
    }

    const updated = {
      battlesCompleted: newBattleCount,
      currentTier: newTier,
      currentTitle: commander.currentTitle,
      titleHistory: commander.titleHistory ? [...commander.titleHistory] : [],
      newlyEarnedTitle: null
    };

    if (newTitle && newTitle !== commander.currentTitle) {
      updated.currentTitle = newTitle;
      updated.newlyEarnedTitle = newTitle;
      updated.titleHistory.push({
        tier: newTier,
        title: newTitle,
        unlockedAt: new Date()
      });
    }

    return updated;
  }
}

module.exports = new TitleManager();
