// src/game/turnOrchestrator.js
// Master turn resolution orchestrator

const { interpretOrders } = require('../ai/orderInterpreter');
const { processMovementPhase } = require('./positionBasedCombat');
const { calculateVisibility } = require('./fogOfWar');
const { resolveCombat } = require('./battleEngine');
const { validateMovement } = require('./movementSystem');
const { checkVictoryConditions } = require('./victorySystem');

async function processTurn(battle, player1Order, player2Order, map) {
    const battleState = battle.battleState;
    
    // Reset movement at turn start
    ['player1', 'player2'].forEach(side => {
        (battleState[side]?.unitPositions || []).forEach(unit => {
            unit.movementRemaining = unit.mounted ? 5 : 3;
            unit.canMove = true;
            unit.hasMoved = false;
        });
    });
    
    console.log(`\n🎲 TURN ${battle.currentTurn} ORCHESTRATION`);
    console.log(`P1 Order: "${player1Order}"`);
    console.log(`P2 Order: "${player2Order}"`);
    
    try {
        // PHASE 1: Interpret orders
        console.log('\n📝 Phase 1: Interpreting orders...');
        
        const p1Interpretation = await interpretOrders(player1Order, battleState, 'player1', map);
        const p2Interpretation = await interpretOrders(player2Order, battleState, 'player2', map);
        
        // PHASE 1.5: Mission continuation
        console.log('\n🔄 Phase 1.5: Checking active missions...');
        
        addMissionContinuations(battleState.player1?.unitPositions, p1Interpretation, map);
        addMissionContinuations(battleState.player2?.unitPositions, p2Interpretation, map);
        
        // Filter actions by type
        const p1Moves = p1Interpretation.validatedActions.filter(a => a.type === 'move');
        const p2Moves = p2Interpretation.validatedActions.filter(a => a.type === 'move');
        
        // PHASE 2: Execute movements
        console.log('\n🚶 Phase 2: Processing movement...');
        const movementResults = processMovementPhase(p1Moves, p2Moves, battleState, map);
        
        // PHASE 3: Update visibility
        console.log('\n👁️ Phase 3: Updating intelligence...');
        const p1Visibility = calculateVisibility(
            movementResults.newPositions.player1,
            movementResults.newPositions.player2,
            map.terrain
        );
        
        const p2Visibility = calculateVisibility(
            movementResults.newPositions.player2,
            movementResults.newPositions.player1,
            map.terrain
        );
        
        console.log('DEBUG P1 Visibility keys:', Object.keys(p1Visibility));
        console.log('DEBUG P1 detectedEnemies:', JSON.stringify(p1Visibility.detectedEnemies, null, 2));
        console.log('DEBUG P2 Visibility keys:', Object.keys(p2Visibility));
        console.log('DEBUG P2 detectedEnemies:', JSON.stringify(p2Visibility.detectedEnemies, null, 2));

        // PHASE 4: Resolve combat
        console.log('\n⚔️ Phase 4: Resolving combat...');
        const combatResults = [];
        
        for (const engagement of movementResults.combatEngagements) {
            const result = await resolveCombat(
                buildForceFromUnit(engagement.attacker, battleState),
                buildForceFromUnit(engagement.defender, battleState),
                {
                    weather: battleState.weather,
                    terrain: engagement.terrain,
                    positionModifiers: {
                        attacker: engagement.attacker.positionModifiers,
                        defender: engagement.defender.positionModifiers
                    }
                },
                {
                    turnNumber: battle.currentTurn,
                    location: engagement.location
                }
            );
            
            combatResults.push({
                location: engagement.location,
                attackerUnit: engagement.attacker.unit,
                defenderUnit: engagement.defender.unit,
                result: result,
                tacticalSituation: engagement.tacticalSituation
            });
        }
        
        // PHASE 5: Apply casualties
        console.log('\n💀 Phase 5: Applying casualties...');
        const updatedPositions = applyCasualties(
            movementResults.newPositions,
            combatResults
        );
        
        // PHASE 6: Check victory
        console.log('\n🏆 Phase 6: Checking victory conditions...');
        const victoryCheck = checkVictoryConditions(
            updatedPositions,
            battle.currentTurn,
            map.objectives,
            battle.maxTurns
        );
        
        // PHASE 7: Generate narrative
        console.log('\n📖 Phase 7: Generating narrative...');
        const narrative = await generateTurnNarrative(
            {
                movements: movementResults,
                intelligence: { player1: p1Visibility, player2: p2Visibility },
                combats: combatResults,
                casualties: extractCasualtySummary(combatResults)
            },
            battleState,
            battle.currentTurn
        );
        
        console.log('✅ Turn processing complete');
        
        return {
            success: true,
            newBattleState: {
                ...battleState,
                player1: {
                    ...battleState.player1,
                    unitPositions: updatedPositions.player1,
                    visibleEnemyPositions: p1Visibility.visibleEnemyPositions,
                    visibleEnemyDetails: p1Visibility.intelligence || []
                },
                player2: {
                    ...battleState.player2,
                    unitPositions: updatedPositions.player2,
                    visibleEnemyPositions: p2Visibility.visibleEnemyPositions,
                    visibleEnemyDetails: p2Visibility.intelligence || []
                }
            },
            turnResults: {
                movements: movementResults.movementSummary,
                intelligence: {
                    player1Detected: p1Visibility.totalEnemiesDetected,
                    player2Detected: p2Visibility.totalEnemiesDetected
                },
                combats: combatResults.length,
                casualties: extractCasualtySummary(combatResults)
            },
            narrative,
            victory: victoryCheck,
            phase: 'complete'
        };
        
    } catch (error) {
        console.error('Turn orchestration error:', error);
        return {
            success: false,
            error: error.message,
            phase: 'failed'
        };
    }
}

/**
 * Add mission continuations for units with active missions
 */
function addMissionContinuations(units, interpretation, map) {
    if (!units) return;
    
    for (const unit of units) {
        // Skip if explicit order given
        const hasOrder = interpretation.validatedActions.some(a => a.unitId === unit.unitId);
        if (hasOrder) continue;
        
        // Skip if no active mission
        if (!unit.activeMission || unit.activeMission.status !== 'active') continue;
        
        const target = unit.activeMission.target;
        
        // Already at destination?
        if (unit.position === target) {
            unit.activeMission.status = 'complete';
            continue;
        }
        
        // Continue toward target
        const validation = validateMovement(unit, target, map);
        
        if (validation.valid) {
            interpretation.validatedActions.push({
                type: 'move',
                unitId: unit.unitId,
                currentPosition: unit.position,
                targetPosition: target,
                reasoning: `Continuing mission to ${target}`,
                validation,
                finalPosition: validation.finalPosition,
                isMissionContinuation: true
            });
        }
    }
}

function buildForceFromUnit(unitData, battleState) {
    const side = unitData.unit.unitId.startsWith('player1') ? 'player1' : 'player2';
    const armyData = battleState[side].army;
    
    return {
        units: [unitData.unit],
        culture: armyData.culture,
        formation: 'standard',
        equipment: {},
        currentMorale: battleState[side].morale || 100,
        positionModifiers: unitData.positionModifiers
    };
}

function applyCasualties(positions, combatResults) {
    const updated = {
        player1: [...positions.player1],
        player2: [...positions.player2]
    };
    
    combatResults.forEach(combat => {
        const attackerUnitId = combat.attackerUnit?.unitId;
        const defenderUnitId = combat.defenderUnit?.unitId;
        
        if (!attackerUnitId || !defenderUnitId) return;
        
        const attackerSide = updated.player1.some(u => u.unitId === attackerUnitId) ? 'player1' : 'player2';
        const defenderSide = updated.player1.some(u => u.unitId === defenderUnitId) ? 'player1' : 'player2';
        
        const attackerCasualties = combat.result?.casualties?.attacker?.total || 0;
        const defenderCasualties = combat.result?.casualties?.defender?.total || 0;
        
        if (attackerCasualties > 0) {
            const idx = updated[attackerSide].findIndex(u => u.unitId === attackerUnitId);
            if (idx >= 0) {
                updated[attackerSide][idx].currentStrength = Math.max(0, 
                    updated[attackerSide][idx].currentStrength - attackerCasualties
                );
            }
        }
        
        if (defenderCasualties > 0) {
            const idx = updated[defenderSide].findIndex(u => u.unitId === defenderUnitId);
            if (idx >= 0) {
                updated[defenderSide][idx].currentStrength = Math.max(0,
                    updated[defenderSide][idx].currentStrength - defenderCasualties
                );
            }
        }
    });
    
    updated.player1 = updated.player1.filter(u => u.currentStrength > 0);
    updated.player2 = updated.player2.filter(u => u.currentStrength > 0);
    
    return updated;
}

function extractCasualtySummary(combatResults) {
    let p1Total = 0;
    let p2Total = 0;
    
    combatResults.forEach(combat => {
        p1Total += combat.result?.casualties?.attacker?.total || 0;
        p2Total += combat.result?.casualties?.defender?.total || 0;
    });
    
    return { player1: p1Total, player2: p2Total };
}

async function generateTurnNarrative(turnEvents, battleState, turnNumber) {
    return {
        mainNarrative: {
            fullNarrative: `Turn ${turnNumber} - ${turnEvents.combats.length} engagement(s). Casualties: P1 ${turnEvents.casualties.player1}, P2 ${turnEvents.casualties.player2}`
        },
        movementSummary: `Units repositioned.`,
        combatSummary: turnEvents.combats.map(c => `Combat at ${c.location}`).join('\n'),
        casualtySummary: `P1: ${turnEvents.casualties.player1}, P2: ${turnEvents.casualties.player2}`
    };
}

module.exports = {
    processTurn,
    applyCasualties
};