// src/game/officers/progression.js
// Veteran progression and tactical warning system
// Merged from: veteranProgression.js + veteranWarnings.js

const { models } = require('../../database/setup');

// ── VETERAN PROGRESSION ────────────────────────────────────────────────────────

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
          updated.veteranBattles = currentBattles;
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

// ── VETERAN WARNINGS ───────────────────────────────────────────────────────────

/**
 * Check if veteran officers should warn about risky orders
 */
function shouldVeteransWarn(orderText, battleState, playerSide, veterans) {
    if (veterans.length === 0) return null;

    const triggers = [];
    const intel = battleState[playerSide]?.intelMemory || [];
    const myUnits = battleState[playerSide]?.units || [];
    const enemyCulture = battleState[playerSide === 'player1' ? 'player2' : 'player1']?.culture;

    // Trigger 1: Historical enemy knowledge
    if (enemyCulture && hasFacedCultureBefore(veterans, enemyCulture)) {
        triggers.push({
            type: 'historical_knowledge',
            severity: 'medium',
            context: {
                enemyCulture,
                veteranExperience: getMostExperiencedAgainst(veterans, enemyCulture),
                orderText
            }
        });
    }

    // Trigger 2: Similar past battle situation
    const similarMemory = findSimilarBattleMemory(veterans, orderText, battleState);
    if (similarMemory) {
        triggers.push({
            type: 'battle_memory',
            severity: 'high',
            context: {
                memory: similarMemory,
                orderText,
                situation: describeCurrentSituation(battleState, playerSide)
            }
        });
    }

    // Trigger 3: Morale/insubordination risk
    const moraleRisk = checkMoraleRisk(orderText, myUnits, battleState[playerSide]);
    if (moraleRisk) {
        triggers.push({
            type: 'morale_concern',
            severity: moraleRisk.severity,
            context: {
                issue: moraleRisk.issue,
                orderText,
                unitMorale: battleState[playerSide]?.morale || 100
            }
        });
    }

    // Trigger 4: Obvious tactical mistakes
    const tacticalRisk = detectObviousTacticalRisk(orderText, intel, myUnits);
    if (tacticalRisk) {
        triggers.push({
            type: 'tactical_risk',
            severity: tacticalRisk.severity,
            context: tacticalRisk.context
        });
    }

    return triggers.length > 0 ? {
        veteran: getMostExperienced(veterans),
        triggers
    } : null;
}

function hasFacedCultureBefore(veterans, culture) {
    return veterans.some(v =>
        v.memories?.some(m =>
            m.enemyCulture === culture ||
            m.keywords?.includes(culture.toLowerCase())
        )
    );
}

function getMostExperiencedAgainst(veterans, culture) {
    const experienced = veterans.filter(v =>
        v.memories?.some(m => m.enemyCulture === culture)
    );
    return experienced.length > 0
        ? experienced.sort((a, b) => b.battles - a.battles)[0]
        : veterans[0];
}

function findSimilarBattleMemory(veterans, orderText, battleState) {
    for (const veteran of veterans) {
        if (!veteran.memories) continue;

        for (const memory of veteran.memories) {
            if (memory.keywords?.some(k =>
                new RegExp(k, 'i').test(orderText)
            )) {
                return {
                    veteran,
                    memory,
                    outcome: memory.outcome
                };
            }
        }
    }
    return null;
}

function checkMoraleRisk(orderText, myUnits, playerState) {
    const morale = playerState?.morale || 100;

    if (/retreat|withdraw|fall back/i.test(orderText) && morale < 30) {
        return {
            severity: 'critical',
            issue: 'retreat_low_morale',
            description: 'Men are already wavering - retreat order may cause rout'
        };
    }

    if (/hold to death|last stand|no retreat/i.test(orderText) && morale < 50) {
        return {
            severity: 'high',
            issue: 'suicide_mission',
            description: 'Ordering men to die when morale is shaky - may refuse'
        };
    }

    if (/charge|attack|assault/i.test(orderText) && morale < 40) {
        return {
            severity: 'medium',
            issue: 'attack_low_morale',
            description: 'Men are fearful - aggressive orders may not be followed'
        };
    }

    return null;
}

function detectObviousTacticalRisk(orderText, intel, myUnits) {
    const enemyCavalry = intel.filter(i => /cavalry|horse/i.test(i.unitClass));
    if (enemyCavalry.length > 0 && /advance|charge|attack/i.test(orderText)) {
        return {
            severity: 'high',
            context: {
                risk: 'cavalry_flank',
                cavalryPositions: enemyCavalry.map(c => c.position),
                orderText
            }
        };
    }

    if (/cross|ford/i.test(orderText)) {
        const defendedCrossing = intel.filter(i =>
            /11|12/.test(i.position) && /infantry/i.test(i.unitClass)
        );
        if (defendedCrossing.length > 0) {
            return {
                severity: 'high',
                context: {
                    risk: 'defended_crossing',
                    defenderCount: defendedCrossing.length,
                    orderText
                }
            };
        }
    }

    return null;
}

function describeCurrentSituation(battleState, playerSide) {
    const intel = battleState[playerSide]?.intelMemory || [];
    const myUnits = battleState[playerSide]?.units || [];

    return {
        enemyUnitsDetected: intel.length,
        myUnitCount: myUnits.length,
        morale: battleState[playerSide]?.morale || 100,
        terrain: battleState.terrain || 'unknown'
    };
}

function getMostExperienced(veterans) {
    return veterans.sort((a, b) => b.battles - a.battles)[0];
}

module.exports = {
    applyPostBattleVeteranProgress,
    getUnitVeteranLevel,
    shouldVeteransWarn
};
