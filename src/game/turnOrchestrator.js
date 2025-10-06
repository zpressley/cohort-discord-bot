// src/game/turnOrchestrator.js
// Master turn resolution orchestrator combining movement, detection, and combat

const { interpretOrders } = require('../ai/orderInterpreter');
const { processMovementPhase } = require('./positionBasedCombat');
const { calculateVisibility } = require('./fogOfWar');
const { resolveCombat } = require('./battleEngine');

/**
 * Process complete turn with both players' orders
 * Handles: movement → detection → combat → state update
 * @param {Object} battle - Battle record from database
 * @param {string} player1Order - Player 1's order text
 * @param {string} player2Order - Player 2's order text
 * @param {Object} map - Map data for scenario
 * @returns {Object} Complete turn results
 */
async function processTurn(battle, player1Order, player2Order, map) {
    const battleState = battle.battleState;
    
    console.log(`\n🎲 TURN ${battle.currentTurn} ORCHESTRATION`);
    console.log(`P1 Order: "${player1Order}"`);
    console.log(`P2 Order: "${player2Order}"`);
    
    try {
        // PHASE 1: Interpret orders (AI parses natural language)
        console.log('\n📝 Phase 1: Interpreting orders...');
        const p1Interpretation = await interpretOrders(player1Order, battleState, 'player1', map);
        const p2Interpretation = await interpretOrders(player2Order, battleState, 'player2', map);
        
        // PHASE 2: Execute movements
        console.log('\n🚶 Phase 2: Processing movement...');
        const movementResults = processMovementPhase(
            p1Interpretation.validatedActions.filter(a => a.type === 'move'),
            p2Interpretation.validatedActions.filter(a => a.type === 'move'),
            battleState,
            map
        );
        
        // PHASE 3: Update visibility (fog of war)
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
        
        // PHASE 4: Resolve combat (if any engagements detected)
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
                result: result,
                tacticalSituation: engagement.tacticalSituation
            });
        }
        
        // PHASE 5: Update unit strengths (casualties)
        console.log('\n💀 Phase 5: Applying casualties...');
        const updatedPositions = applyCasualties(
            movementResults.newPositions,
            combatResults
        );
        
        // PHASE 6: Check victory conditions
        console.log('\n🏆 Phase 6: Checking victory conditions...');
        const victoryCheck = checkVictoryConditions(
            updatedPositions,
            battle.currentTurn,
            map.objectives
        );
        
        // PHASE 7: Generate turn narrative
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
        
        return {
            success: true,
            newBattleState: {
                ...battleState,
                player1: {
                    ...battleState.player1,
                    unitPositions: updatedPositions.player1,
                    visibleEnemyPositions: p1Visibility.visibleEnemyPositions
                },
                player2: {
                    ...battleState.player2,
                    unitPositions: updatedPositions.player2,
                    visibleEnemyPositions: p2Visibility.visibleEnemyPositions
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
 * Build combat force from positioned unit
 */
function buildForceFromUnit(unitData, battleState) {
    const side = unitData.unit.unitId.startsWith('player1') ? 'player1' : 'player2';
    const armyData = battleState[side].army;
    
    return {
        units: [unitData.unit],
        culture: armyData.culture,
        formation: 'standard', // Will be extracted from orders
        equipment: {}, // Will be populated from unit data
        currentMorale: battleState[side].morale || 100,
        positionModifiers: unitData.positionModifiers
    };
}

/**
 * Apply casualties from combat to unit positions
 */
function applyCasualties(positions, combatResults) {
    const updated = {
        player1: [...positions.player1],
        player2: [...positions.player2]
    };
    
    combatResults.forEach(combat => {
        // Find units involved
        const attackerSide = combat.result.casualties.attacker[0]?.side || 'player1';
        const defenderSide = attackerSide === 'player1' ? 'player2' : 'player1';
        
        // Apply attacker casualties
        combat.result.casualties.attacker.forEach(cas => {
            const unitIndex = updated[attackerSide].findIndex(u => 
                u.position === combat.location
            );
            if (unitIndex >= 0) {
                updated[attackerSide][unitIndex].currentStrength -= cas.casualties;
            }
        });
        
        // Apply defender casualties
        combat.result.casualties.defender.forEach(cas => {
            const unitIndex = updated[defenderSide].findIndex(u => 
                u.position === combat.location
            );
            if (unitIndex >= 0) {
                updated[defenderSide][unitIndex].currentStrength -= cas.casualties;
            }
        });
    });
    
    // Remove destroyed units (≤0 strength)
    updated.player1 = updated.player1.filter(u => u.currentStrength > 0);
    updated.player2 = updated.player2.filter(u => u.currentStrength > 0);
    
    return updated;
}

/**
 * Check victory conditions
 */
function checkVictoryConditions(positions, turnNumber, objectives) {
    // Calculate total strength remaining
    const p1Strength = positions.player1.reduce((sum, u) => sum + u.currentStrength, 0);
    const p2Strength = positions.player2.reduce((sum, u) => sum + u.currentStrength, 0);
    
    const p1Original = positions.player1.reduce((sum, u) => sum + (u.maxStrength || u.currentStrength), 0);
    const p2Original = positions.player2.reduce((sum, u) => sum + (u.maxStrength || u.currentStrength), 0);
    
    // Annihilation victory
    if (p1Strength <= 0) {
        return { achieved: true, winner: 'player2', reason: 'enemy_destroyed' };
    }
    if (p2Strength <= 0) {
        return { achieved: true, winner: 'player1', reason: 'enemy_destroyed' };
    }
    
    // Casualties > 75% = defeat
    if (p1Strength < p1Original * 0.25) {
        return { achieved: true, winner: 'player2', reason: 'catastrophic_casualties' };
    }
    if (p2Strength < p2Original * 0.25) {
        return { achieved: true, winner: 'player1', reason: 'catastrophic_casualties' };
    }
    
    // Objective-based victory (will be enhanced with control point tracking)
    // TODO: Check ford control, hill control, etc.
    
    return { achieved: false };
}

/**
 * Extract casualty summary for narrative
 */
function extractCasualtySummary(combatResults) {
    let p1Total = 0;
    let p2Total = 0;
    
    combatResults.forEach(combat => {
        combat.result.casualties.attacker.forEach(cas => p1Total += cas.casualties);
        combat.result.casualties.defender.forEach(cas => p2Total += cas.casualties);
    });
    
    return {
        player1: p1Total,
        player2: p2Total
    };
}

/**
 * Generate turn narrative from all events
 */
async function generateTurnNarrative(turnEvents, battleState, turnNumber) {
    // This will call AI narrative engine
    // For now, return structured summary
    
    return {
        mainNarrative: {
            fullNarrative: `Turn ${turnNumber} - Movement and combat processed. ${turnEvents.combats.length} engagement(s).`
        },
        movementSummary: `Units repositioned across the battlefield.`,
        combatSummary: turnEvents.combats.map(c => 
            `Combat at ${c.location}: ${c.result.combatResult.result}`
        ).join('\n'),
        casualtySummary: `Casualties: P1 ${turnEvents.casualties.player1}, P2 ${turnEvents.casualties.player2}`,
        nextTurnSetup: {
            nextTurnPrompt: 'What are your orders for the next turn?'
        }
    };
}

module.exports = {
    processTurn,
    checkVictoryConditions,
    applyCasualties
};