// src/game/turnOrchestrator.js
// Master turn resolution orchestrator combining movement, detection, and combat

const { interpretOrders } = require('../ai/orderInterpreter');
const { processMovementPhase } = require('./positionBasedCombat');
const { calculateVisibility } = require('./fogOfWar');
const { resolveCombat } = require('./battleEngine');
const { validateActions } = require('./schemas');
const { validateMovement } = require('./movementSystem');
const { updateCommanderPosition, checkCommanderCaptureRisk } = require('./commandSystem/commanderManager');

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

        // Add battle context for commander actions
        const battleContext = {
            battleId: battle.id,
            player1Id: battle.player1Id,
            player2Id: battle.player2Id
        };
        
        const p1Interpretation = await interpretOrders(player1Order, battleState, 'player1', map, battleContext);
        const p2Interpretation = await interpretOrders(player2Order, battleState, 'player2', map, battleContext);
        
        // Normalize actions before any schema checks
        const { sanitizeAction } = require('./engine/adapters/schemaAdapter');
        p1Interpretation.validatedActions = (p1Interpretation.validatedActions || []).map(sanitizeAction).filter(Boolean);
        p2Interpretation.validatedActions = (p2Interpretation.validatedActions || []).map(sanitizeAction).filter(Boolean);
        
        // PHASE 1.5: Mission Continuation (add this entire block)
        console.log('\n🔄 Phase 1.5: Checking active missions...');
        
        // Helper to continue missions
        const continueMission = (unit, map) => {
            if (!unit.activeMission || unit.activeMission.status !== 'active') {
                return null;
            }
            
            const target = unit.activeMission.target;
            
            // Check if already at destination
            if (unit.position === target) {
                console.log(`  ✅ ${unit.unitId} reached ${target} (mission complete)`);
                unit.activeMission.status = 'complete';
                return null;
            }
            
            // Continue toward target
            console.log(`  🔄 ${unit.unitId} auto-continuing to ${target}`);
            
            const validation = validateMovement(unit, target, map);
            
            if (validation.valid) {
                return {
                    type: 'move',
                    unitId: unit.unitId,
                    currentPosition: unit.position,
                    targetPosition: target,
                    reasoning: `Continuing mission to ${target}`,
                    validation,
                    finalPosition: validation.finalPosition,
                    isMissionContinuation: true
                };
            }
            
            return null;
        };
        
        // Check P1 units for mission continuation
        for (const unit of battleState.player1?.unitPositions || []) {
            // Skip if explicit order given
            const hasOrder = p1Interpretation.validatedActions.some(a => a.unitId === unit.unitId);
            if (hasOrder) continue;
            
            const continuation = continueMission(unit, map);
            if (continuation) {
                p1Interpretation.validatedActions.push(continuation);
            }
        }
        
        // Check P2 units for mission continuation
        for (const unit of battleState.player2?.unitPositions || []) {
            const hasOrder = p2Interpretation.validatedActions.some(a => a.unitId === unit.unitId);
            if (hasOrder) continue;
            
            const continuation = continueMission(unit, map);
            if (continuation) {
                p2Interpretation.validatedActions.push(continuation);
            }
        }
        
        // PHASE 2: Schema validation (gate deterministic core)
        const SCHEMA_STRICT = (process.env.SCHEMA_STRICT || 'true').toLowerCase() !== 'false';
        if (SCHEMA_STRICT) {
            const { adjustActionsForCulture } = require('./culturalRules');
            const p1Val = validateActions(p1Interpretation.validatedActions);
            const p2Val = validateActions(p2Interpretation.validatedActions);
            const p1Cult = battle.player1Culture || battle.battleState?.player1?.culture || null;
            const p2Cult = battle.player2Culture || battle.battleState?.player2?.culture || null;
            const p1CultCheck = adjustActionsForCulture(p1Interpretation.validatedActions, p1Cult);
            const p2CultCheck = adjustActionsForCulture(p2Interpretation.validatedActions, p2Cult);
            const hasErrors = !p1Val.valid || !p2Val.valid || (p1CultCheck.violations.length + p2CultCheck.violations.length) > 0;
            if (hasErrors) {
                return {
                    success: false,
                    error: 'Action validation failed',
                    phase: 'validation_failed',
                    validationErrors: {
                        player1: p1Val.results,
                        player2: p2Val.results
                    },
                    culturalErrors: {
                        player1: p1CultCheck,
                        player2: p2CultCheck
                    }
                };
            }
        }

        // PHASE 3: Execute movements (existing code continues here)
        console.log('\n🚶 Phase 2: Processing movement...');
        const { partitionActions } = require('./engine/adapters/schemaAdapter');
        const p1Parts = partitionActions(p1Interpretation.validatedActions);
        const p2Parts = partitionActions(p2Interpretation.validatedActions);
        const p1Moves = p1Parts.moves;
        const p2Moves = p2Parts.moves;
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
        
        // PHASE 2.5: Update commander positions
        console.log('\n📍 Phase 2.5: Updating commander positions...');
        try {
            // Update P1 commanders
            for (const unit of movementResults.newPositions.player1) {
                await updateCommanderPosition(battle.id, battle.player1Id, unit.unitId, unit.position);
            }
            
            // Update P2 commanders
            for (const unit of movementResults.newPositions.player2) {
                await updateCommanderPosition(battle.id, battle.player2Id, unit.unitId, unit.position);
            }
        } catch (commanderError) {
            console.error('Warning - commander position update failed:', commanderError.message);
            // Continue with battle - commander tracking is optional
        }
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
                attackerUnit: engagement.attacker.unit,  // ← ADD THIS
                defenderUnit: engagement.defender.unit,  // ← ADD THIS
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
        
        // Compute simple state diffs for telemetry
        const diffs = computeStateDiffs(battleState, updatedPositions);

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
            metrics: { diffs },
            narrative,
            victory: victoryCheck,
            phase: 'complete',
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

function applyCasualties(positions, combatResults) {
    console.log('DEBUG applyCasualties INPUT:');
    console.log('  positions.player1:', positions.player1?.length || 0);
    console.log('  positions.player2:', positions.player2?.length || 0);
    console.log('  combatResults:', combatResults.length);
    
    const updated = {
        player1: [...positions.player1],
        player2: [...positions.player2]
    };
    
    let p1UnitsDestroyed = 0;
    let p2UnitsDestroyed = 0;
    
    combatResults.forEach((combat, combatIndex) => {
        // FIX: Use the unit data we added
        const attackerUnitId = combat.attackerUnit?.unitId;
        const defenderUnitId = combat.defenderUnit?.unitId;
        
        console.log(`   Combat at ${combat.location}: ${attackerUnitId} vs ${defenderUnitId}`);
        
        // Access casualties from result
        const casualties = combat.result?.casualties;
        
        if (!casualties) {
            console.warn(`WARNING - No casualties data for combat at ${combat.location}`);
            return;
        }
        
        // Apply attacker casualties
        if (casualties.attacker && casualties.attacker.total > 0) {
            const attackerSide = attackerUnitId?.startsWith('north') ? 'player1' : 'player2';
            const unitIndex = updated[attackerSide].findIndex(u => 
                u.unitId === attackerUnitId
            );
            
            if (unitIndex >= 0) {
                const beforeStrength = updated[attackerSide][unitIndex].currentStrength;
                updated[attackerSide][unitIndex].currentStrength -= casualties.attacker.total;
                const afterStrength = updated[attackerSide][unitIndex].currentStrength;
                
                console.log(`      ${attackerSide} ${attackerUnitId}: ${beforeStrength} -> ${afterStrength} (-${casualties.attacker.total})`);
                
                if (afterStrength <= 0) {
                    if (attackerSide === 'player1') p1UnitsDestroyed++;
                    else p2UnitsDestroyed++;
                }
            }
        }
        
        // Apply defender casualties
        if (casualties.defender && casualties.defender.total > 0) {
            const defenderSide = defenderUnitId?.startsWith('north') ? 'player1' : 'player2';
            const unitIndex = updated[defenderSide].findIndex(u => 
                u.unitId === defenderUnitId
            );
            
            if (unitIndex >= 0) {
                const beforeStrength = updated[defenderSide][unitIndex].currentStrength;
                updated[defenderSide][unitIndex].currentStrength -= casualties.defender.total;
                const afterStrength = updated[defenderSide][unitIndex].currentStrength;
                
                console.log(`      ${defenderSide} ${defenderUnitId}: ${beforeStrength} -> ${afterStrength} (-${casualties.defender.total})`);
                
                if (afterStrength <= 0) {
                    if (defenderSide === 'player1') p1UnitsDestroyed++;
                    else p2UnitsDestroyed++;
                }
            }
        }
    });

    // Remove destroyed units (≤0 strength)
    updated.player1 = updated.player1.filter(u => u.currentStrength > 0);
    updated.player2 = updated.player2.filter(u => u.currentStrength > 0);
    
    console.log(`✅ Casualties applied: P1 -${p1UnitsDestroyed} units destroyed, P2 -${p2UnitsDestroyed} units destroyed`);
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

function extractCasualtySummary(combatResults) {
    let p1Total = 0;
    let p2Total = 0;
    
    combatResults.forEach(combat => {
        // NEW STRUCTURE: casualties.attacker.total and casualties.defender.total
        const attackerCas = combat.result?.casualties?.attacker?.total || 0;
        const defenderCas = combat.result?.casualties?.defender?.total || 0;
        
        p1Total += attackerCas;
        p2Total += defenderCas;
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
    const AI_ENABLED = (process.env.AI_ENABLED || 'false').toLowerCase() === 'true';
    if (AI_ENABLED) {
        try {
            const { generateBattleNarrative } = require('../ai/aiNarrativeEngine');
            const battleContext = { weather: battleState.weather, terrain: battleState.terrain, turnNumber };
            const narrative = await generateBattleNarrative(turnEvents, battleContext, {}, []);
            if (narrative && narrative.mainNarrative?.fullNarrative) {
                return narrative;
            }
        } catch (e) {
            console.warn('AI narrative failed, falling back:', e.message);
        }
    }

    // Fallback deterministic narrative
    const combatLines = turnEvents.combats.map(c => `Combat at ${c.location}: ${c.result.combatResult.result}`);
    return {
        mainNarrative: {
            fullNarrative: `Turn ${turnNumber} — ${turnEvents.combats.length} engagement(s). P1 detected ${turnEvents.intelligence.player1?.total || 0}, P2 detected ${turnEvents.intelligence.player2?.total || 0}.`
        },
        movementSummary: `P1 moves: ${turnEvents.movements?.movementSummary?.player1Moves ?? 'N/A'}, P2 moves: ${turnEvents.movements?.movementSummary?.player2Moves ?? 'N/A'}`,
        combatSummary: combatLines.slice(0, 10).join('\n'),
        casualtySummary: `Casualties: P1 ${turnEvents.casualties.player1}, P2 ${turnEvents.casualties.player2}`,
        nextTurnSetup: { nextTurnPrompt: 'What are your orders for the next turn?' }
    };
}

function computeStateDiffs(prevState, newPositions) {
    const diffOneSide = (before, after) => {
        const moves = [];
        const beforeIdx = Object.fromEntries((before || []).map(u => [u.unitId, u]));
        for (const u of after || []) {
            const prev = beforeIdx[u.unitId];
            if (prev && prev.position !== u.position) {
                moves.push({ unitId: u.unitId, from: prev.position, to: u.position });
            }
        }
        return moves;
    };
    return {
        player1: diffOneSide(prevState.player1?.unitPositions, newPositions.player1),
        player2: diffOneSide(prevState.player2?.unitPositions, newPositions.player2)
    };
}

module.exports = {
    processTurn,
    checkVictoryConditions,
    applyCasualties
};