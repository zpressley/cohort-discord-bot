// src/game/turnOrchestrator.js
// Master turn resolution orchestrator combining movement, detection, and combat

const { interpretOrders } = require('../ai/orderInterpreter');
const { processMovementPhase } = require('./positionBasedCombat');
const { calculateVisibility } = require('./fogOfWar');
const { resolveCombat } = require('./battleEngine');
const { validateActions } = require('./schemas');
const { validateMovement } = require('./movementSystem');
const { updateCommanderPosition, checkCommanderCaptureRisk } = require('./commandSystem/commanderManager');
const { checkVictoryConditions } = require('./victorySystem');

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

        // FORM-002: Apply formation changes and block movement if changing
        try {
            const { applyFormationActions } = require('./formations');
            const updatedP1 = applyFormationActions(battleState, 'player1', p1Parts.formations, map);
            const updatedP2 = applyFormationActions(battleState, 'player2', p2Parts.formations, map);
            battleState.player1.unitPositions = updatedP1;
            battleState.player2.unitPositions = updatedP2;
        } catch (e) {
            console.warn('Formation application failed:', e.message);
        }

        let p1Moves = p1Parts.moves;
        let p2Moves = p2Parts.moves;
        // Remove moves for units currently changing formation
        const isChanging = (side, unitId) => {
            const arr = battleState[side]?.unitPositions || [];
            const u = arr.find(x => x.unitId === unitId);
            return !!(u && u.formationChanging && u.formationChanging.remaining > 0);
        };
        p1Moves = p1Moves.filter(m => !isChanging('player1', m.unitId));
        p2Moves = p2Moves.filter(m => !isChanging('player2', m.unitId));
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
        
        // PHASE 3.5: Update commander positions
        console.log('\n📍 Phase 3.5: Updating commander positions...');
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

        // Update per-side intel memory (FOW-002)
        function updateIntelMemory(side, visibility, currentTurn) {
            const mem = Array.isArray(battleState[side].intelMemory) ? battleState[side].intelMemory : [];
            const byPos = new Map(mem.map(m => [m.position, m]));
            function upsert(entry, level) {
                const pos = entry.position;
                const prev = byPos.get(pos) || { position: pos, firstSeenTurn: currentTurn };
                const unitType = (entry.unitType || '').toLowerCase();
                const unitClass = unitType.includes('cav') || unitType.includes('horse') ? 'cavalry' : (unitType ? 'infantry' : 'unknown');
                const est = entry.exactStrength || entry.estimatedStrength || prev.estimatedStrength || 'unknown';
                const out = {
                    ...prev,
                    position: pos,
                    unitClass,
                    detailLevel: level, // 'high' | 'medium' | 'low'
                    lastSeenTurn: currentTurn,
                    estimatedStrength: est,
                    confidence: (entry.confidence || (level==='high'?'HIGH':level==='medium'?'MEDIUM':'LOW'))
                };
                byPos.set(pos, out);
            }
            (visibility.intelligence.detailed || []).forEach(c => upsert(c, 'high'));
            (visibility.intelligence.identified || []).forEach(c => upsert(c, 'medium'));
            (visibility.intelligence.spotted || []).forEach(c => upsert(c, 'low'));
            battleState[side].intelMemory = Array.from(byPos.values());
        }
        try {
            updateIntelMemory('player1', p1Visibility, battle.currentTurn);
            updateIntelMemory('player2', p2Visibility, battle.currentTurn);
        } catch (e) {
            console.warn('Intel memory update failed:', e.message);
        }
        
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
        let updatedPositions = applyCasualties(
            movementResults.newPositions,
            combatResults,
            movementResults
        )

        // Morale checks (MORALE-001)
        try {
            const { evaluateAndFlagBreaks } = require('./morale');
            updatedPositions = evaluateAndFlagBreaks(updatedPositions);
        } catch (e) {
            console.warn('Morale evaluation failed:', e.message);
        }

        // Commander capture risk (CMD-003)
        try {
            const { getAdjacentCoords } = require('./maps/mapUtils');
            function markAtRisk(side) {
                const commanderState = battleState[side]?.commander;
                if (!commanderState) return;
                const unit = updatedPositions[side].find(u => u.unitId === commanderState.attachedTo);
                if (!unit) return;
                const max = unit.maxStrength || 100; const cur = Math.max(0, unit.currentStrength || 0);
                const strengthPct = cur / max;
                if (strengthPct >= 0.25) return;
                // Enemy adjacency
                const enemySide = side === 'player1' ? 'player2' : 'player1';
                const adj = new Set(getAdjacentCoords(unit.position));
                const enemyAdjacent = (updatedPositions[enemySide] || []).some(eu => adj.has(eu.position));
                if (enemyAdjacent) {
                    battleState[side].commander.status = 'at_risk';
                }
            }
            markAtRisk('player1');
            markAtRisk('player2');
        } catch (e) {
            console.warn('Commander capture risk check failed:', e.message);
        }
        // PHASE 5.5: Check commander capture risk
        console.log('\n⚠️ Phase 5.5: Checking commander status...');
        try {
            const { checkCommanderCaptureRisk } = require('./commandSystem/commanderManager');
            
            const captureEvents = [];
            
            // Check each player's units for commander risk
            for (const unit of updatedPositions.player1) {
                const risk = await checkCommanderCaptureRisk(
                    battle.id,
                    battle.player1Id,
                    unit.unitId,
                    unit.currentStrength,
                    unit.maxStrength || unit.currentStrength
                );
                if (risk) {
                    captureEvents.push({ 
                        player: 'player1', 
                        commander: risk,
                        unit: unit 
                    });
                }
            }
            
            for (const unit of updatedPositions.player2) {
                const risk = await checkCommanderCaptureRisk(
                    battle.id,
                    battle.player2Id,
                    unit.unitId,
                    unit.currentStrength,
                    unit.maxStrength || unit.currentStrength
                );
                if (risk) {
                    captureEvents.push({ 
                        player: 'player2', 
                        commander: risk,
                        unit: unit 
                    });
                }
            }
            
            if (captureEvents.length > 0) {
                console.log(`  🚨 ${captureEvents.length} commander(s) at risk of capture!`);
                // TODO: Trigger player decision prompt via Discord
                // For now, store in turn results for later handling
                turnResults.commanderAtRisk = captureEvents;
            }
        } catch (err) {
            console.warn('  Commander capture check failed:', err.message);
        }

        // PHASE 6: Check victory conditions
        console.log('\n🏆 Phase 6: Checking victory conditions...');
        const victoryCheck = checkVictoryConditions(
            updatedPositions,
            battle.currentTurn,
            map.objectives,
            battle.maxTurns
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
        
        // PHASE 8: Officer name assignments (Battle 3+)
        console.log('\n👤 Phase 8: Officer name assignments...');
        try {
            const { assignOfficerNames } = require('./officers/namingSystem');
            
            newBattleState.player1.unitPositions = assignOfficerNames(
                newBattleState.player1.unitPositions,
                newBattleState.player1.culture
            );
            
            newBattleState.player2.unitPositions = assignOfficerNames(
                newBattleState.player2.unitPositions,
                newBattleState.player2.culture
            );
        } catch (err) {
            console.warn('Officer naming skipped:', err.message);
        }

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
    console.log('\n💀 Applying casualties...');
    console.log('  Input: P1 units:', positions.player1?.length, 'P2 units:', positions.player2?.length);
    console.log('  Combat results to process:', combatResults.length);
    
    const updated = {
        player1: [...positions.player1],
        player2: [...positions.player2]
    };
    
    combatResults.forEach((combat, idx) => {
        console.log(`\n  Processing combat ${idx + 1}/${combatResults.length}:`);
        
        // Extract unit IDs from combat engagement context
        const attackerUnitId = combat.attackerUnit?.unitId;
        const defenderUnitId = combat.defenderUnit?.unitId;
        
        if (!attackerUnitId || !defenderUnitId) {
            console.error(`    ⚠️ Combat ${idx} missing unit IDs - skipping`);
            console.error('    Combat structure:', JSON.stringify(combat, null, 2).slice(0, 300));
            return;
        }
        
        console.log(`    Units: ${attackerUnitId} vs ${defenderUnitId}`);
        
        // Determine sides by finding which array contains each unit
        const attackerSide = updated.player1.some(u => u.unitId === attackerUnitId) ? 'player1' : 'player2';
        const defenderSide = updated.player1.some(u => u.unitId === defenderUnitId) ? 'player1' : 'player2';
        
        console.log(`    Sides: attacker in ${attackerSide}, defender in ${defenderSide}`);
        
        // Extract total casualties from new structure
        const attackerCasualties = combat.result?.casualties?.attacker?.total || 0;
        const defenderCasualties = combat.result?.casualties?.defender?.total || 0;
        
        console.log(`    Casualties to apply: Attacker=${attackerCasualties}, Defender=${defenderCasualties}`);
        
        // Apply attacker casualties by UNIT ID
        if (attackerCasualties > 0) {
            const attackerIndex = updated[attackerSide].findIndex(u => u.unitId === attackerUnitId);
            if (attackerIndex >= 0) {
                const before = updated[attackerSide][attackerIndex].currentStrength;
                updated[attackerSide][attackerIndex].currentStrength = Math.max(0, before - attackerCasualties);
                const after = updated[attackerSide][attackerIndex].currentStrength;
                
                console.log(`    ${attackerUnitId}: ${before} → ${after} (-${attackerCasualties})`);
            } else {
                console.warn(`    ⚠️ Attacker ${attackerUnitId} not found in ${attackerSide}`);
            }
        }
        
        // Apply defender casualties by UNIT ID
        if (defenderCasualties > 0) {
            const defenderIndex = updated[defenderSide].findIndex(u => u.unitId === defenderUnitId);
            if (defenderIndex >= 0) {
                const before = updated[defenderSide][defenderIndex].currentStrength;
                updated[defenderSide][defenderIndex].currentStrength = Math.max(0, before - defenderCasualties);
                const after = updated[defenderSide][defenderIndex].currentStrength;
                
                console.log(`    ${defenderUnitId}: ${before} → ${after} (-${defenderCasualties})`);
            } else {
                console.warn(`    ⚠️ Defender ${defenderUnitId} not found in ${defenderSide}`);
            }
        }
    });

    // Remove destroyed units (strength ≤ 0)
    const p1Before = updated.player1.length;
    const p2Before = updated.player2.length;
    
    updated.player1 = updated.player1.filter(u => u.currentStrength > 0);
    updated.player2 = updated.player2.filter(u => u.currentStrength > 0);
    
    const p1Destroyed = p1Before - updated.player1.length;
    const p2Destroyed = p2Before - updated.player2.length;
    
    if (p1Destroyed > 0) console.log(`\n  💀 Player 1: ${p1Destroyed} unit(s) destroyed`);
    if (p2Destroyed > 0) console.log(`  💀 Player 2: ${p2Destroyed} unit(s) destroyed`);
    
    console.log(`  Final: P1=${updated.player1.length} units, P2=${updated.player2.length} units`);
    
    return updated;
}

// Delete this function entirely - use the one from victorySystem.js
// The import at the top will provide the new implementation

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