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
    
    // DEBUG: Check if missions loaded from database
    console.log('DEBUG Loaded from DB:');
    console.log('  P1 unit 0 mission:', battleState.player1?.unitPositions?.[0]?.activeMission);
    console.log('  P2 unit 0 mission:', battleState.player2?.unitPositions?.[0]?.activeMission);
    
    // Reset movement for all units at turn start
    if (battleState.player1?.unitPositions) {
        battleState.player1.unitPositions.forEach(unit => {
            unit.movementRemaining = unit.mounted ? 5 : 3;
            unit.canMove = true;
            unit.hasMoved = false;
        });
    }
    
    if (battleState.player2?.unitPositions) {
        battleState.player2.unitPositions.forEach(unit => {
            unit.movementRemaining = unit.mounted ? 5 : 3;
            unit.canMove = true;
            unit.hasMoved = false;
        });
    }
    
    console.log(`\n🎲 TURN ${battle.currentTurn} ORCHESTRATION`);
    console.log(`P1 Order: "${player1Order}"`);
    console.log(`P2 Order: "${player2Order}"`);
    
    try {
        // PHASE 1: Interpret orders (AI parses natural language)
        console.log('\n📝 Phase 1: Interpreting orders...');
        // Add debug in turnOrchestrator.js after interpretOrders calls (line ~46-47)

        const p1Interpretation = await interpretOrders(player1Order, battleState, 'player1', map);
        const p2Interpretation = await interpretOrders(player2Order, battleState, 'player2', map);
        
        // DEBUG: Check what interpretOrders returned
        console.log('DEBUG P1 Interpretation:');
        console.log('  validatedActions:', p1Interpretation.validatedActions.length);
        console.log('  errors:', p1Interpretation.errors.length);
        if (p1Interpretation.validatedActions.length > 0) {
            console.log('  First action:', p1Interpretation.validatedActions[0]);
        }
        if (p1Interpretation.errors.length > 0) {
            console.log('  Errors:', p1Interpretation.errors);
        }
        
        console.log('DEBUG P2 Interpretation:');
        console.log('  validatedActions:', p2Interpretation.validatedActions.length);
        if (p2Interpretation.validatedActions.length > 0) {
            console.log('  First action:', p2Interpretation.validatedActions[0]);
        }
        
        // PHASE 2: Execute movements
        console.log('\n🚶 Phase 2: Processing movement...');
        const p1Moves = p1Interpretation.validatedActions.filter(a => a.type === 'move');
        const p2Moves = p2Interpretation.validatedActions.filter(a => a.type === 'move');
        console.log('  Filtered P1 moves:', p1Moves.length);
        console.log('  Filtered P2 moves:', p2Moves.length);
        
        const movementResults = processMovementPhase(
            p1Moves,
            p2Moves,
            battleState,
            map
        );
        console.log('P1 new positions:', movementResults.newPositions.player1.map(u => 
            `${u.unitId} at ${u.position}`
        ));
        console.log('P2 new positions:', movementResults.newPositions.player2.map(u => 
            `${u.unitId} at ${u.position}`
        ));
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
            combatResults,
            movementResults
        )
        
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
        // DEBUG: Check what we're returning
        const newBattleState = {
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
        };
        
         // DEBUG: Check if missions are being saved  ← ADD HERE
        console.log('DEBUG Missions before save:');
        console.log('  P1 unit 0 mission:', updatedPositions.player1[0]?.activeMission);
        console.log('  P2 unit 0 mission:', updatedPositions.player2[0]?.activeMission);
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
            phase: 'complete',
            // ADD THESE TWO LINES:
            p1Interpretation: p1Interpretation,  
            p2Interpretation: p2Interpretation
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
 * FIXED: Uses combat engagement data which has the unit references
 */
function applyCasualties(positions, combatResults, movementResults) {
    const updated = {
        player1: [...positions.player1],
        player2: [...positions.player2]
    };
    
    // Track total casualties for logging
    let p1TotalCasualties = 0;
    let p2TotalCasualties = 0;
    
    combatResults.forEach((combat, combatIndex) => {
        const casualties = combat.result.casualties;
        
        // Get the original engagement which has unit data
        const engagement = movementResults?.combatEngagements?.[combatIndex];
        
        if (!engagement) {
            console.log(`   ⚠️  Combat ${combatIndex}: No matching engagement found`);
            return;
        }
        
        // Determine sides from unitId prefixes in the engagement
        const attackerUnitId = engagement.attacker.unit.unitId;
        const defenderUnitId = engagement.defender.unit.unitId;
        
        const attackerSide = attackerUnitId.startsWith('north') ? 'player1' : 'player2';
        const defenderSide = attackerSide === 'player1' ? 'player2' : 'player1';
        
        console.log(`   Combat at ${combat.location}: ${attackerSide} ${attackerUnitId} vs ${defenderSide} ${defenderUnitId}`);
        
        // Apply attacker casualties
        const attackerCasualties = casualties.attacker[0]?.casualties || 0;
        if (attackerCasualties > 0) {
            const unitIndex = updated[attackerSide].findIndex(u => 
                u.unitId === attackerUnitId
            );
            
            if (unitIndex >= 0) {
                const unit = updated[attackerSide][unitIndex];
                const oldStrength = unit.currentStrength;
                unit.currentStrength = Math.max(0, oldStrength - attackerCasualties);
                
                console.log(`   ${attackerSide} ${attackerUnitId}: ${oldStrength} → ${unit.currentStrength} (-${attackerCasualties})`);
                
                if (attackerSide === 'player1') p1TotalCasualties += attackerCasualties;
                else p2TotalCasualties += attackerCasualties;
            }
        }
        
        // Apply defender casualties
        const defenderCasualties = casualties.defender[0]?.casualties || 0;
        if (defenderCasualties > 0) {
            const unitIndex = updated[defenderSide].findIndex(u => 
                u.unitId === defenderUnitId
            );
            
            if (unitIndex >= 0) {
                const unit = updated[defenderSide][unitIndex];
                const oldStrength = unit.currentStrength;
                unit.currentStrength = Math.max(0, oldStrength - defenderCasualties);
                
                console.log(`   ${defenderSide} ${defenderUnitId}: ${oldStrength} → ${unit.currentStrength} (-${defenderCasualties})`);
                
                if (defenderSide === 'player1') p1TotalCasualties += defenderCasualties;
                else p2TotalCasualties += defenderCasualties;
            }
        }
    });

    // Remove destroyed units (≤0 strength)
    const p1Before = updated.player1.length;
    const p2Before = updated.player2.length;
    
    updated.player1 = updated.player1.filter(u => u.currentStrength > 0);
    updated.player2 = updated.player2.filter(u => u.currentStrength > 0);
    
    const p1Destroyed = p1Before - updated.player1.length;
    const p2Destroyed = p2Before - updated.player2.length;
    
    console.log(`✅ Casualties applied: P1 -${p1TotalCasualties} (${p1Destroyed} units destroyed), P2 -${p2TotalCasualties} (${p2Destroyed} units destroyed)`);
    console.log(`   Remaining: P1 ${updated.player1.length} units, P2 ${updated.player2.length} units`);
    
    return updated;
}


/**
 * Check victory conditions
 */
function checkVictoryConditions(positions, turnNumber, objectives) {
    // Don't end battle in first 3 turns unless complete annihilation
    if (turnNumber < 3) {
        return { achieved: false };
    }
    
    // Rest of function...
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