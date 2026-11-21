// src/game/officers/speakerSelection.js
// Choose which officer speaks for a side each turn

const { models } = require('../../database/setup');
const { ensureEliteOfficersForCommander } = require('./eliteOfficerBootstrap');

function experienceLevelFromBattles(battlesExperience) {
  const exp = battlesExperience || 0;
  if (exp >= 11) return 'Legendary';
  if (exp >= 6) return 'Elite Veteran';
  if (exp >= 3) return 'Veteran';
  if (exp >= 1) return 'Seasoned';
  return 'Recruit';
}

/**
 * Pick a primary speaking officer for the given side based on elite officers.
 * Later this can fall back to line commanders when no elites exist.
 */
async function selectSpeakerForSide(battle, battleState, side) {
  try {
    const commanderId = side === 'player1' ? battle.player1Id : battle.player2Id;
    const commander = await models.Commander.findByPk(commanderId);
    if (!commander) return null;

    const elite = await ensureEliteOfficersForCommander(commanderId, commander.culture);
    let candidates = elite?.officers || [];

    // Alive only
    candidates = candidates.filter(o => o && o.isAlive !== false);
    if (candidates.length === 0) return null;

    // Highest battlesExperience first
    candidates.sort((a, b) => (b.battlesExperience || 0) - (a.battlesExperience || 0));
    const chosen = candidates[0];

    return {
      id: chosen.id,
      name: chosen.name,
      role: chosen.rank || 'Veteran Officer',
      source: 'elite',
      personalityArchetype: chosen.specialization || 'Combat Leadership',
      tone: 'formal',
      battlesExperience: chosen.battlesExperience || 0,
      experienceLevel: experienceLevelFromBattles(chosen.battlesExperience || 0)
    };
  } catch (err) {
    console.warn('selectSpeakerForSide failed:', err.message);
    return null;
  }
}

module.exports = {
  selectSpeakerForSide
};
