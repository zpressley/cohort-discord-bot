// src/game/turnOrchestrator.js
// Master turn resolution orchestrator

const { interpretOrders } = require('../ai/orderInterpreter');
const { processMovementPhase } = require('./positionBasedCombat');
const { calculateVisibility } = require('./fogOfWar');
const { resolveCombat } = require('./battleEngine');
const { validateMovement } = require('./movementSystem');
const { checkVictoryConditions } = require('./victorySystem');
const { checkCommanderCaptureRisk, updateCommanderPosition } = require('./commandSystem/commanderManager');

async function processTurn(battle, player1Order, player2Order, map) {
    const battleState = battle.battleState;

    // Normalize map: prefer battleState.map if present
    const effectiveMap = battleState.map || map;
    if (!effectiveMap || !effectiveMap.terrain) {
        console.warn('processTurn: map/terrain missing; using empty terrain as fallback');
    }
    // Ensure current weather is visible to downstream systems (movement, FOW, combat)
    if (battleState.weather && !effectiveMap.weather) {
        effectiveMap.weather = battleState.weather;
    }
    
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
        
        const p1Interpretation = await interpretOrders(player1Order, battleState, 'player1', effectiveMap || {});
        const p2Interpretation = await interpretOrders(player2Order, battleState, 'player2', effectiveMap || {});
        
        // PHASE 1.5: Mission continuation
        console.log('\n🔄 Phase 1.5: Checking active missions...');
        
        addMissionContinuations(battleState.player1?.unitPositions, p1Interpretation, effectiveMap || {});
        addMissionContinuations(battleState.player2?.unitPositions, p2Interpretation, effectiveMap || {});
        
        // Filter actions by type
        const p1Moves = p1Interpretation.validatedActions.filter(a => a.type === 'move');
        const p2Moves = p2Interpretation.validatedActions.filter(a => a.type === 'move');
        
        // PHASE 2: Execute movements
        console.log('\n🚶 Phase 2: Processing movement...');
        const movementResults = processMovementPhase(p1Moves, p2Moves, battleState, effectiveMap || {});

        // Keep commander POV with elite unit (current rule: commander always
        // rides with elite). We resync DB commander position to the elite's
        // new position after movement.
        try {
            const eliteP1 = movementResults.newPositions.player1.find(u => u.isElite || u.unitId.includes('elite'));
            if (eliteP1 && battle.player1Id && !battle.player1Id.startsWith('TEST_')) {
                await updateCommanderPosition(battle.id, battle.player1Id, eliteP1.unitId, eliteP1.position);
            }
            const eliteP2 = movementResults.newPositions.player2.find(u => u.isElite || u.unitId.includes('elite'));
            if (eliteP2 && battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
                await updateCommanderPosition(battle.id, battle.player2Id, eliteP2.unitId, eliteP2.position);
            }
        } catch (cmdErr) {
            console.warn('Commander position sync failed:', cmdErr.message);
        }
        
        // PHASE 3: Update visibility
        console.log('\n👁️ Phase 3: Updating intelligence...');
        const p1Visibility = calculateVisibility(
            movementResults.newPositions.player1,
            movementResults.newPositions.player2,
            (effectiveMap && effectiveMap.terrain) || {}
        );
        
        const p2Visibility = calculateVisibility(
            movementResults.newPositions.player2,
            movementResults.newPositions.player1,
            (effectiveMap && effectiveMap.terrain) || {}
        );
        
        console.log('DEBUG P1 Visibility keys:', Object.keys(p1Visibility));
        console.log('DEBUG P1 detectedEnemies:', JSON.stringify(p1Visibility.detectedEnemies, null, 2));
        console.log('DEBUG P2 Visibility keys:', Object.keys(p2Visibility));
        console.log('DEBUG P2 detectedEnemies:', JSON.stringify(p2Visibility.detectedEnemies, null, 2));

        // Flatten visibility objects into arrays suitable for briefings
        const p1EnemyDetails = flattenVisibilityForBriefing(p1Visibility, battle.currentTurn);
        const p2EnemyDetails = flattenVisibilityForBriefing(p2Visibility, battle.currentTurn);

        // Update intel memory / last-known positions for ghost contacts (FOW-002)
        const p1IntelState = updateIntelMemory(
            battleState.player1?.intelMemory || [],
            p1EnemyDetails,
            battle.currentTurn
        );
        const p2IntelState = updateIntelMemory(
            battleState.player2?.intelMemory || [],
            p2EnemyDetails,
            battle.currentTurn
        );

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

        // Snapshot strengths before casualties for capture-risk checks
        const preStrengths = buildStrengthIndex(movementResults.newPositions);

        const updatedPositions = applyCasualties(
            movementResults.newPositions,
            combatResults
        );

        // Commander capture risk: if a unit hosting a commander drops below 25%
        // strength this turn, flag the commander as at risk.
        try {
            await evaluateCommanderCaptureRisk(battle, preStrengths, updatedPositions);
        } catch (capErr) {
            console.warn('Commander capture risk evaluation failed:', capErr.message);
        }
        
        // PHASE 6: Check victory
        console.log('\n🏆 Phase 6: Checking victory conditions...');
        const victoryCheck = checkVictoryConditions(
            updatedPositions,
            battle.currentTurn,
            (effectiveMap && effectiveMap.objectives) || battle.battleState.objectives || {},
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
        
        const newBattleState = {
            ...battleState,
            player1: {
                ...battleState.player1,
                unitPositions: updatedPositions.player1,
                visibleEnemyPositions: p1Visibility.visibleEnemyPositions,
                visibleEnemyDetails: p1EnemyDetails,
                intelMemory: p1IntelState.contacts,
                ghostPositions: p1IntelState.ghostPositions
            },
            player2: {
                ...battleState.player2,
                unitPositions: updatedPositions.player2,
                visibleEnemyPositions: p2Visibility.visibleEnemyPositions,
                visibleEnemyDetails: p2EnemyDetails,
                intelMemory: p2IntelState.contacts,
                ghostPositions: p2IntelState.ghostPositions
            }
        };

        const sideSummaries = {
            player1: buildSideTurnSummary(battleState, newBattleState, battle.currentTurn, 'player1', movementResults, combatResults),
            player2: buildSideTurnSummary(battleState, newBattleState, battle.currentTurn, 'player2', movementResults, combatResults)
        };
        
        return {
            success: true,
            newBattleState,
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
            sideSummaries,
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

function flattenVisibilityForBriefing(visibility, currentTurn) {
    if (!visibility || !visibility.intelligence) return [];
    const { detailed = [], identified = [], spotted = [] } = visibility.intelligence;

    // Deduplicate per enemy unit (or per position when unitId missing), keeping
    // the highest-quality contact so we don't inflate strength by counting
    // multiple observers / tiers in the same turn.
    const byUnit = new Map(); // key: unitId or fallback key

    function upsert(contact, baseQuality, priority) {
        if (!contact || !contact.position) return;

        const key = contact.unitId || `pos:${contact.position}`;
        const existing = byUnit.get(key);

        const distance = contact.distance;
        let quality = baseQuality;
        if (typeof distance === 'number' && distance <= 2) {
            quality = 'high';
        }

        const estStrength =
            typeof contact.exactStrength === 'number'
                ? contact.exactStrength
                : typeof contact.estimatedStrength === 'number'
                    ? contact.estimatedStrength
                    : undefined;

        const record = {
            position: contact.position,
            unitId: contact.unitId,
            unitType: contact.unitType || (baseQuality === 'high' ? 'infantry' : 'unknown'),
            isElite: !!contact.isElite,
            mounted: !!contact.mounted,
            exactStrength: typeof contact.exactStrength === 'number' ? contact.exactStrength : undefined,
            estimatedStrength: estStrength,
            confidence: contact.confidence || quality.toUpperCase(),
            quality,
            distance,
            lastSeenTurn: currentTurn,
            isRouting: contact.isRouting || false,
            hasDeserted: contact.hasDeserted || false,
            qualityType: contact.qualityType || null
        };

        if (!existing || priority > existing.priority) {
            byUnit.set(key, { contact: record, priority });
        } else {
            // Upgrade existing record with any better numeric strength and flags
            const merged = { ...existing.contact };
            if (typeof record.estimatedStrength === 'number') {
                merged.estimatedStrength = record.estimatedStrength;
            }
            if (typeof record.exactStrength === 'number') {
                merged.exactStrength = record.exactStrength;
            }
            merged.lastSeenTurn = currentTurn;
            if (record.isRouting) merged.isRouting = true;
            if (record.hasDeserted) merged.hasDeserted = true;
            merged.qualityType = record.qualityType || merged.qualityType;
            merged.quality = record.quality || merged.quality;
            byUnit.set(key, { contact: merged, priority: existing.priority });
        }
    }

    detailed.forEach(c => upsert(c, 'high', 3));
    identified.forEach(c => upsert(c, 'medium', 2));
    spotted.forEach(c => upsert(c, 'low', 1));

    return Array.from(byUnit.values()).map(v => v.contact);
}

function buildStrengthIndex(positions) {
    const index = new Map(); // unitId -> { side, maxStrength, strength }

    const add = (side, arr) => {
        (arr || []).forEach(u => {
            if (!u || !u.unitId) return;
            index.set(u.unitId, {
                side,
                maxStrength: u.maxStrength || u.quality?.size || 100,
                strength: u.currentStrength || 0
            });
        });
    };

    add('player1', positions.player1);
    add('player2', positions.player2);

    return index;
}

async function evaluateCommanderCaptureRisk(battle, preStrengths, updatedPositions) {
    if (!preStrengths || !(preStrengths instanceof Map)) return;

    const post = buildStrengthIndex(updatedPositions);

    for (const [unitId, before] of preStrengths.entries()) {
        const after = post.get(unitId);
        if (!after) continue;

        const maxStr = after.maxStrength || before.maxStrength || 100;
        const prevFrac = (before.strength || 0) / maxStr;
        const newFrac = (after.strength || 0) / maxStr;

        // Only trigger when crossing from >=50% to <50% in a single turn.
        // This guarantees the unit took casualties *this turn* and is now
        // too weak to reliably extract the commander from harm's way.
        if (prevFrac >= 0.5 && newFrac < 0.5) {
            const playerId = after.side === 'player1' ? battle.player1Id : battle.player2Id;
            try {
                const commander = await checkCommanderCaptureRisk(
                    battle.id,
                    playerId,
                    unitId,
                    after.strength,
                    maxStr
                );

                if (commander && commander.status === 'at_risk') {
                    console.log(`⚠️ Commander at risk in battle ${battle.id} (player ${playerId}) attached to ${unitId}`);
                    try {
                        const { client } = require('../index');
                        if (client && !playerId.startsWith('TEST_')) {
                            const user = await client.users.fetch(playerId);
                            await user.send(
                                '⚠️ **Commander at Risk**\n\n' +
                                `Your commander, attached to unit **${unitId}**, is at risk of capture ` +
                                `after heavy casualties (below 50% strength).\n` +
                                'You may issue orders like "I will escape", "I will die with honor", or "I will surrender" to resolve their fate.'
                            );
                            console.log(`✉️ Commander-at-risk DM sent to player ${playerId}`);
                        }
                    } catch (dmErr) {
                        console.warn('Could not DM commander-at-risk warning:', dmErr.message);
                    }
                }
            } catch (err) {
                console.warn(`checkCommanderCaptureRisk failed for ${unitId}:`, err.message);
            }
        }
    }
}

// Intel persistence helper for FOW-002
function updateIntelMemory(previousContacts, currentContacts, currentTurn) {
    const byUnit = new Map(); // key: unitId (or fallback), value: contact record

    // Seed with previous intel
    (previousContacts || []).forEach(c => {
        if (!c) return;
        const key = c.unitId || `pos:${c.position}`;
        byUnit.set(key, { ...c, seenThisTurn: false });
    });

    // Merge current contacts (fresh intel)
    (currentContacts || []).forEach(c => {
        if (!c) return;
        const key = c.unitId || `pos:${c.position}`;
        const existing = byUnit.get(key) || {};
        byUnit.set(key, {
            ...existing,
            ...c,
            lastSeenTurn: currentTurn,
            staleLevel: 'fresh',
            seenThisTurn: true
        });
    });

    const contacts = [];

    for (const contact of byUnit.values()) {
        const seenTurn = typeof contact.lastSeenTurn === 'number' ? contact.lastSeenTurn : currentTurn;
        const age = Math.max(0, currentTurn - seenTurn);
        let staleLevel = 'fresh';
        // Age 0 = this turn; age 1-5 = stale; >5 = very stale
        if (age >= 1 && age <= 5) staleLevel = 'stale';
        else if (age > 5) staleLevel = 'very_stale';
        contact.staleLevel = staleLevel;
        contact.lastSeenTurn = seenTurn;
        contact.seenThisTurn = !!contact.seenThisTurn;
        contacts.push(contact);
    }

    // Ghost positions = tiles of units we have intel for but did not see this turn
    const ghostSet = new Set();
    contacts.forEach(c => {
        if (!c.seenThisTurn && c.position) {
            ghostSet.add(c.position);
        }
    });

    const ghostPositions = Array.from(ghostSet);

    return { contacts, ghostPositions };
}

function buildSideTurnSummary(oldBattleState, newBattleState, turnNumber, side, movementResults, combatResults) {
    const previousUnits = oldBattleState[side]?.unitPositions || [];
    const currentUnits = newBattleState[side]?.unitPositions || [];
    const previousById = new Map(previousUnits.map(u => [u.unitId, u]));

    const movements = [];
    for (const u of currentUnits) {
        const prev = previousById.get(u.unitId);
        if (!prev || !prev.position || !u.position) continue;
        if (prev.position === u.position) continue;
        const terrainFrom = getTerrainAtPosition(prev.position, newBattleState.map);
        const terrainTo = getTerrainAtPosition(u.position, newBattleState.map);
        movements.push({
            unitId: u.unitId,
            from: prev.position,
            to: u.position,
            terrainFrom,
            terrainTo,
            descriptor: u.name || u.unitType || 'unit',
            wasMissionContinuation: !!u.activeMission && u.activeMission.status === 'active'
        });
    }

    const ownLine = currentUnits.map(u => {
        const prev = previousById.get(u.unitId);
        const strengthBefore = prev ? prev.currentStrength : u.currentStrength;
        const strengthAfter = u.currentStrength;
        const terrain = getTerrainAtPosition(u.position, newBattleState.map);
        let status = 'steady';
        if (u.isRouting) status = 'routing';
        else if (u.isBroken) status = 'shaken';
        return {
            unitId: u.unitId,
            descriptor: u.name || u.unitType || 'unit',
            pos: u.position,
            strengthBefore,
            strengthAfter,
            status,
            terrain
        };
    });

    const playerData = newBattleState[side] || {};
    let enemyIntel = playerData.intelMemory || playerData.visibleEnemyDetails || [];
    if (!Array.isArray(enemyIntel)) enemyIntel = Object.values(enemyIntel);

    const enemyContacts = (enemyIntel || []).filter(c => c && c.position).map(c => ({
        pos: c.position,
        type: c.unitType || 'unknown',
        estStrength: typeof c.estimatedStrength === 'number' ? c.estimatedStrength : undefined,
        quality: c.quality || 'low',
        terrain: getTerrainAtPosition(c.position, newBattleState.map),
        seenThisTurn: !!c.seenThisTurn
    }));

    const combat = summarizeCombatForSide(combatResults, side);

    return {
        turnNumber,
        side,
        movements,
        ownLine,
        enemyContacts,
        enemyRumors: [],
        combat
    };
}

function getTerrainAtPosition(position, map) {
    const { parseCoord } = require('./maps/mapUtils');
    const pos = typeof position === 'string' ? parseCoord(position) : position;
    if (!pos || !map?.terrain) return 'plains';

    const terrain = map.terrain;

    const matches = (list) => (list || []).some(c => {
        const p = parseCoord(c);
        return p && p.row === pos.row && p.col === pos.col;
    });

    if (matches(terrain.forest)) return 'forest';
    if (matches(terrain.hill)) return 'hill';
    if (matches(terrain.marsh)) return 'marsh';
    if (matches(terrain.river)) return 'river';
    if (matches(terrain.road)) return 'road';
    return 'plains';
}

function summarizeCombatForSide(combatResults, side) {
    const engagements = [];
    let ourTotalLosses = 0;
    let enemyEstLosses = 0;

    // Unit IDs are currently of the form north_unit_X / south_unit_X
    const sidePrefix = side === 'player1' ? 'north_' : 'south_';

    for (const combat of combatResults || []) {
        const attackerId = combat.attackerUnit?.unitId || '';
        const defenderId = combat.defenderUnit?.unitId || '';
        const isAttacker = attackerId.startsWith(sidePrefix);
        const isDefender = defenderId.startsWith(sidePrefix);
        if (!isAttacker && !isDefender) continue;

        const result = combat.result || {};
        const ourCasualties = isAttacker
            ? (result.casualties?.attacker?.total || 0)
            : (result.casualties?.defender?.total || 0);
        const enemyCasualties = isAttacker
            ? (result.casualties?.defender?.total || 0)
            : (result.casualties?.attacker?.total || 0);

        ourTotalLosses += ourCasualties;
        enemyEstLosses += enemyCasualties;

        engagements.push({
            location: combat.location,
            terrain: combat.tacticalSituation?.terrain || 'unknown',
            ourUnits: [{
                unitId: isAttacker ? attackerId : defenderId,
                casualties: ourCasualties
            }],
            enemyUnits: [{ casualties: enemyCasualties }],
            advantage: result.outcome || 'unknown'
        });
    }

    return { engagements, ourTotalLosses, enemyEstLosses };
}

async function generateTurnNarrative(turnEvents, battleState, turnNumber) {
    const lines = [];

    lines.push(`Turn ${turnNumber} - ${turnEvents.combats.length} engagement(s).`);
    lines.push(`Casualties: P1 ${turnEvents.casualties.player1}, P2 ${turnEvents.casualties.player2}.`);

    // Simple routing/desertion hooks based on current state
    const p1Units = battleState.player1?.unitPositions || [];
    const p2Units = battleState.player2?.unitPositions || [];
    const p1Enemies = battleState.player1?.visibleEnemyDetails || [];
    const p2Enemies = battleState.player2?.visibleEnemyDetails || [];

    const routingHooks = [];

    // Our forces routing/regrouping
    p1Units.forEach(u => {
        if (u.isRouting) {
            routingHooks.push(`Our ${u.unitType || 'troops'} near ${u.position} are routing toward the rear.`);
        } else if (u.regroupedAtCamp && u.campPosition) {
            routingHooks.push(`Our ${u.unitType || 'troops'} have regrouped at the camp at ${u.campPosition}.`);
        }
    });

    // Enemy routing/desertion from P1 POV intel
    p1Enemies.forEach(e => {
        if (e.hasDeserted && (e.qualityType || '').toLowerCase() === 'veteran_mercenary') {
            routingHooks.push(`Enemy veteran mercenaries near ${e.position} have deserted the field.`);
        } else if (e.isRouting) {
            routingHooks.push(`Enemy ${e.unitType || 'troops'} near ${e.position} appear to be routing.`);
        }
    });

    if (routingHooks.length > 0) {
        lines.push(...routingHooks);
    }

    return {
        mainNarrative: {
            fullNarrative: lines.join(' ')
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