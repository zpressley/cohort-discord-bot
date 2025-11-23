// src/game/officers/veteranProgression.js
// Simple post-battle veteran progression for elite units, their officers, and regular units

const { models } = require('../../database/setup');

/** Map raw veteran battle count → simple tier string for regular units */
function getUnitVeteranLevel(battles) {
  if (battles >= 10) return 'legendary';
  if (battles >= 5) return 'veteran';
  if (battles >= 2) return 'seasoned';
  if (battles >= 1) return 'green';
  return 'fresh';
}

/**
 * Apply veteran progression after a battle completes.
 * - Increments battlesParticipated / experience for each commander's EliteUnit
 * - Increments battlesExperience for each associated VeteranOfficer
 * - Updates per-unit veteranBattles / veteranLevel in each Commander's armyComposition
 */
async function applyPostBattleVeteranProgress(battle) {
  try {
    const commanderIds = [battle.player1Id, battle.player2Id].filter(Boolean);
    const finalState = battle.battleState || {};

    for (const commanderId of commanderIds) {
      const side = commanderId === battle.player1Id ? 'player1' : 'player2';

      // --- Elite unit + officers progression ---
      const elite = await models.EliteUnit.findOne({
        where: { commanderId },
        include: [{ model: models.VeteranOfficer, as: 'officers' }]
      });

      if (elite) {
        // Use survivors (elite currentStrength on map) if we can find the in-battle unit
        let survivors = null;
        const sideUnits = finalState[side]?.unitPositions || [];
        const eliteUnitOnField = sideUnits.find(u => u.isElite);
        if (eliteUnitOnField && typeof eliteUnitOnField.currentStrength === 'number') {
          survivors = eliteUnitOnField.currentStrength;
        }

        try {
          if (typeof elite.addBattleExperience === 'function') {
            await elite.addBattleExperience(survivors || undefined);
          } else {
            elite.battlesParticipated = (elite.battlesParticipated || 0) + 1;
            await elite.save();
          }
        } catch (e) {
          console.warn('Elite veteran progression failed:', e.message);
        }

        if (elite.officers && elite.officers.length > 0) {
          for (const officer of elite.officers) {
            officer.battlesExperience = (officer.battlesExperience || 0) + 1;
            await officer.save();
          }
        }
      }

      // --- Regular unit veteranBattles / veteranLevel ---
      const commander = await models.Commander.findByPk(commanderId);
      if (!commander || !commander.armyComposition) continue;

      let comp = commander.armyComposition;
      if (typeof comp === 'string') {
        try {
          comp = JSON.parse(comp);
        } catch {
          comp = { units: [] };
        }
      }
      if (!Array.isArray(comp.units)) comp.units = [];

      const finalUnits = (finalState[side]?.unitPositions || []);
      const aliveIds = new Set(finalUnits.map(u => u.unitId));
      const sidePrefix = side === 'player1' ? 'north' : 'south';

      comp.units = comp.units.map((unit, index) => {
        const battlefieldId = `${sidePrefix}_unit_${index}`;
        const survived = aliveIds.has(battlefieldId);
        const updated = { ...unit };

        const currentBattles = updated.veteranBattles || 0;
        if (survived) {
          updated.veteranBattles = currentBattles + 1;
        } else {
          updated.veteranBattles = currentBattles; // later we can mark destroyed
        }
        updated.veteranLevel = getUnitVeteranLevel(updated.veteranBattles);
        return updated;
      });

      commander.armyComposition = comp;
      await commander.save();
    }
  } catch (err) {
    console.warn('applyPostBattleVeteranProgress failed:', err.message);
  }
}

module.exports = {
  applyPostBattleVeteranProgress,
  getUnitVeteranLevel
};
