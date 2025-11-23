// src/game/positionBasedCombat.js
// Combat resolution with tactical positioning modifiers

const { calculateDistance, getAdjacentCoords, parseCoord, coordToString } = require('./maps/mapUtils');

/**
 * Detect combat triggers based on unit positions
 * @param {Array} player1Units - Player 1 unit positions
 * @param {Array} player2Units - Player 2 unit positions
 * @returns {Array} Array of combat engagements
 */
function detectCombatTriggers(player1Units, player2Units) {
    const combats = [];
    
    player1Units.forEach(p1Unit => {
        player2Units.forEach(p2Unit => {
            const distance = calculateDistance(p1Unit.position, p2Unit.position);
            
            // Adjacent units trigger combat
            if (distance <= 1) {
                combats.push({
                    location: p1Unit.position,
                    attacker: p1Unit,
                    defender: p2Unit,
                    type: 'melee',
                    distance: distance
                });
            }
            
            // Ranged combat within 3 tiles
            if (distance > 1 && distance <= 3) {
                if (p1Unit.hasRanged || p2Unit.hasRanged) {
                    combats.push({
                        location: p1Unit.position,
                        attacker: p1Unit,
                        defender: p2Unit,
                        type: 'ranged',
                        distance: distance
                    });
                }
            }
        });
    });
    
    return combats;
}

/**
 * Calculate tactical position modifiers for combat
 * @param {Object} attacker - Attacking unit with position
 * @param {Object} defender - Defending unit with position
 * @param {Object} allUnits - All units on battlefield
 * @param {Object} map - Map terrain data
 * @returns {Object} Combat modifiers from positioning
 */
function calculatePositionalModifiers(attacker, defender, allUnits, map) {
    // Apply formation change vulnerability to defense directly on defender
    if (defender.formationChanging && defender.formationChanging.remaining > 0) {
        defender.positionModifiers = defender.positionModifiers || {};
        defender.positionModifiers.defense = (defender.positionModifiers.defense || 0) - 3;
    }
    const modifiers = {
        attacker: { attack: 0, defense: 0 },
        defender: { attack: 0, defense: 0 },
        description: []
    };
    
    // Flanking bonus - check if friendly units attack from multiple sides
    const flankingBonus = calculateFlankingBonus(attacker, defender, allUnits);
    if (flankingBonus > 0) {
        modifiers.attacker.attack += flankingBonus;
        modifiers.description.push(`Flanking attack: +${flankingBonus} attack`);
    }
    
    // High ground advantage
    const elevationMod = calculateElevationAdvantage(attacker.position, defender.position, map);
    if (elevationMod.defender > 0) {
        modifiers.defender.defense += elevationMod.defender;
        modifiers.description.push(`High ground defense: +${elevationMod.defender}`);
    }
    if (elevationMod.attacker > 0) {
        modifiers.attacker.attack += elevationMod.attacker;
        modifiers.description.push(`Downhill attack: +${elevationMod.attacker}`);
    }
    
    // River crossing penalty
    if (isCrossingRiver(attacker.position, defender.position, map)) {
        modifiers.attacker.attack -= 4;
        modifiers.defender.defense += 3;
        modifiers.description.push('Attacking across ford: -4 attack, defender +3 defense');
    }
    
    // Forest combat modifiers
    const defenderTerrain = getTerrainType(defender.position, map);
    if (defenderTerrain === 'forest') {
        modifiers.defender.defense += 2;
        modifiers.description.push('Forest cover: +2 defense');
        
        if (attacker.mounted) {
            modifiers.attacker.attack -= 4;
            modifiers.description.push('Cavalry in forest: -4 attack');
        }
    }
    
    // Marsh penalties
    if (defenderTerrain === 'marsh') {
        modifiers.defender.defense -= 2;
        modifiers.attacker.attack -= 2;
        modifiers.description.push('Fighting in marsh: both sides -2');
    }
    
    return modifiers;
}

/**
 * Calculate flanking bonus from friendly units
 */
function calculateFlankingBonus(attacker, defender, allUnits) {
    const defenderPos = defender.position;
    const adjacent = getAdjacentCoords(defenderPos);
    
    // Count friendly units adjacent to defender
    const friendlyUnitsAttacking = allUnits.filter(unit => 
        unit.side === attacker.side &&
        unit.unitId !== attacker.unitId &&
        adjacent.includes(unit.position)
    );
    
    if (friendlyUnitsAttacking.length === 0) return 0;
    if (friendlyUnitsAttacking.length === 1) return +2; // 2-sided attack
    if (friendlyUnitsAttacking.length >= 2) return +4; // 3+ sided attack (surrounded)
    
    return 0;
}

/**
 * Calculate elevation advantage
 */
function calculateElevationAdvantage(attackerPos, defenderPos, map) {
    const { getTerrainType } = require('./movementSystem');
    
    const attackerTerrain = getTerrainType(attackerPos, map);
    const defenderTerrain = getTerrainType(defenderPos, map);
    
    const attackerElevation = attackerTerrain === 'hill' ? 1 : 0;
    const defenderElevation = defenderTerrain === 'hill' ? 1 : 0;
    
    if (defenderElevation > attackerElevation) {
        return { defender: +2, attacker: 0 }; // Defender on high ground
    }
    if (attackerElevation > defenderElevation) {
        return { attacker: +2, defender: 0 }; // Attacker on high ground (rare)
    }
    
    return { attacker: 0, defender: 0 };
}

/**
 * Check if attacker is crossing river to attack
 */
function isCrossingRiver(attackerPos, defenderPos, map) {
    const { getTerrainType } = require('./movementSystem');
    const { isFord } = require('./maps/riverCrossing');
    
    // Check if defender is at a ford
    if (!isFord(defenderPos)) return false;
    
    // Check if attacker is on opposite side of river
    const distance = calculateDistance(attackerPos, defenderPos);
    if (distance !== 1) return false; // Must be adjacent
    
    // If attacker is not at ford but defender is, attacker is crossing
    return !isFord(attackerPos);
}

/**
 * Build combat context with positional data
 * @param {Object} combat - Combat engagement from detectCombatTriggers
 * @param {Object} battleState - Full battle state
 * @param {Object} map - Map data
 * @returns {Object} Enhanced combat context for battle engine
 */
function buildCombatContext(combat, battleState, map) {
    const allUnits = [
        ...(battleState.player1.unitPositions || []).map(u => ({...u, side: 'player1'})),
        ...(battleState.player2.unitPositions || []).map(u => ({...u, side: 'player2'}))
    ];
    
    const positionMods = calculatePositionalModifiers(
        combat.attacker,
        combat.defender,
        allUnits,
        map
    );
    
    return {
        attacker: {
            unit: combat.attacker,
            positionModifiers: positionMods.attacker,
            position: combat.attacker.position
        },
        defender: {
            unit: combat.defender,
            positionModifiers: positionMods.defender,
            position: combat.defender.position
        },
        location: combat.location,
        terrain: getTerrainType(combat.location, map),
        combatType: combat.type,
        tacticalSituation: positionMods.description
    };
}

/**
 * Process movement phase and detect all combat triggers
 * @param {Array} player1Movements - Validated movement actions for P1
 * @param {Array} player2Movements - Validated movement actions for P2
 * @param {Object} battleState - Current state
 * @param {Object} map - Map data
 * @returns {Object} New positions and combat triggers
 */

// Replace ENTIRE processMovementPhase function in positionBasedCombat.js
// This is the clean version with proper debug

function processMovementPhase(player1Movements, player2Movements, battleState, map) {
    // Debug: Show what we received
    if (player1Movements.length > 0) {
        console.log('  P1 movement[0]:');
        console.log('    unitId:', player1Movements[0].unitId);
        console.log('    target:', player1Movements[0].targetPosition);
        console.log('    validation.valid:', player1Movements[0].validation?.valid);
    }
    if (player2Movements.length > 0) {
        console.log('  P2 movement[0]:');
        console.log('    unitId:', player2Movements[0].unitId);  
        console.log('    target:', player2Movements[0].targetPosition);
        console.log('    validation.valid:', player2Movements[0].validation?.valid);
    }
    if (battleState.player1?.unitPositions?.[0]) {
        console.log('  P1 battleState unit[0] unitId:', battleState.player1.unitPositions[0].unitId);
    }
    if (battleState.player2?.unitPositions?.[0]) {
        console.log('  P2 battleState unit[0] unitId:', battleState.player2.unitPositions[0].unitId);
    }

    // Initiative-based movement ordering (MOVE-002)
    function speedTierFor(unit) {
        const qt = (unit.qualityType || '').toLowerCase();
        if (qt.includes('scout')) return 1;           // scouts first
        if (unit.mounted) return 2;                   // cavalry
        if (qt.includes('light')) return 3;           // light infantry
        if (qt.includes('heavy')) return 4;           // heavy infantry
        return 3;                                     // default infantry
    }

    // Working copies of positions for collision checks
    const p1Map = new Map((battleState.player1.unitPositions || []).map(u => [u.unitId, { ...u }]));
    const p2Map = new Map((battleState.player2.unitPositions || []).map(u => [u.unitId, { ...u }]));

    // First, apply automatic routing movement before normal orders.
    function applyRoutingForSide(side, unitMap) {
        for (const unit of unitMap.values()) {
            if (!unit.isRouting) continue;
            const updated = handleRoutingMovement(unit, side, battleState, map);
            unitMap.set(unit.unitId, updated);
        }
    }

    applyRoutingForSide('player1', p1Map);
    applyRoutingForSide('player2', p2Map);

    // Build combined move list with initiative (routing units ignore explicit orders)
    const combined = [];
    for (const m of player1Movements) {
        const u = p1Map.get(m.unitId);
        if (!u || !m.validation?.valid) continue;
        if (u.isRouting) continue; // routing units do not take normal orders
        combined.push({ side: 'player1', unit: u, move: m, tier: speedTierFor(u), rand: Math.random() });
    }
    for (const m of player2Movements) {
        const u = p2Map.get(m.unitId);
        if (!u || !m.validation?.valid) continue;
        if (u.isRouting) continue; // routing units do not take normal orders
        combined.push({ side: 'player2', unit: u, move: m, tier: speedTierFor(u), rand: Math.random() });
    }

    // Sort by tier asc, then random for tie-break
    combined.sort((a, b) => (a.tier - b.tier) || (a.rand - b.rand));

    // NOTE: Stacking is allowed. We no longer prevent multiple friendly units
    // from ending on the same tile here; instead, Stack-001 compression logic
    // below applies movement penalties when units stack.

    // Execute moves in initiative order
    for (const item of combined) {
        const { side, unit, move } = item;
        let nextPos = move.finalPosition || move.targetPosition;
        let movementRemaining = move.validation.movementRemaining;
        if (move.modifier?.groupMarch && Array.isArray(move.validation.path) && move.validation.path.length > 1) {
            nextPos = move.validation.path[1];
            movementRemaining = Math.max(0, (unit.movementRemaining || 3) - 1);
        }

        const updated = {
            ...unit,
            position: nextPos,
            movementRemaining,
            hasMoved: true
        };

        if (move.newMission) {
            updated.activeMission = move.newMission;
            console.log(`    📋 New mission assigned: ${move.newMission.target}`);
        } else if (unit.activeMission) {
            updated.activeMission = unit.activeMission;
        }

        if (side === 'player1') p1Map.set(unit.unitId, updated);
        else p2Map.set(unit.unitId, updated);
    }

    let newPlayer1Positions = Array.from(p1Map.values());
    let newPlayer2Positions = Array.from(p2Map.values());

    // Remove units that have deserted (veteran mercenaries exiting the field)
    newPlayer1Positions = newPlayer1Positions.filter(u => !u.hasDeserted);
    newPlayer2Positions = newPlayer2Positions.filter(u => !u.hasDeserted);

    // Stack-001: compression penalties for stacked friendly units
    function applyStackCompression(units) {
        const byTile = new Map();
        units.forEach(u => {
            const key = u.position;
            if (!byTile.has(key)) byTile.set(key, []);
            byTile.get(key).push(u);
        });
        const compressed = [];
        byTile.forEach((arr, tile) => {
            if (arr.length > 1) {
                arr.forEach(u => {
                    u.movementRemaining = Math.max(0, (u.movementRemaining || 0) - (arr.length - 1));
                    u.compressionLevel = arr.length - 1; // annotate for downstream systems
                    compressed.push({ unitId: u.unitId, tile, level: u.compressionLevel });
                });
            }
        });
        return compressed;
    }

    const p1Compressed = applyStackCompression(newPlayer1Positions);
    const p2Compressed = applyStackCompression(newPlayer2Positions);

    // Detect combat triggers
    const combatTriggers = detectCombatTriggers(newPlayer1Positions, newPlayer2Positions);

    // Mark missions complete when units reach their target or enter combat.
    function completeMissionsForEngagementUnit(unit) {
        if (unit && unit.activeMission && unit.activeMission.status === 'active') {
            unit.activeMission.status = 'complete';
        }
    }

    // Arrival: if unit is now at its mission target, mark complete.
    [newPlayer1Positions, newPlayer2Positions].forEach(sideUnits => {
        sideUnits.forEach(u => {
            if (u.activeMission && u.activeMission.status === 'active' && u.position === u.activeMission.target) {
                u.activeMission.status = 'complete';
            }
        });
    });

    // Build combat contexts and mark missions complete for engaged units.
    const combatContexts = combatTriggers.map(combat => {
        completeMissionsForEngagementUnit(combat.attacker);
        completeMissionsForEngagementUnit(combat.defender);

        return buildCombatContext(combat, {
            ...battleState,
            player1: { ...battleState.player1, unitPositions: newPlayer1Positions },
            player2: { ...battleState.player2, unitPositions: newPlayer2Positions }
        }, map);
    });
    
    return {
        newPositions: {
            player1: newPlayer1Positions,
            player2: newPlayer2Positions
        },
        combatEngagements: combatContexts,
        movementSummary: {
            player1Moves: player1Movements.filter(m => m.validation?.valid).length,
            player2Moves: player2Movements.filter(m => m.validation?.valid).length
        },
        compression: {
            player1: p1Compressed,
            player2: p2Compressed
        }
    };
}

/**
 * Helper to get terrain type (imported from movementSystem)
 */
function getTerrainType(coord, map) {
    const { getTerrainType: getTerrain } = require('./movementSystem');
    return getTerrain(coord, map);
}

/**
 * Routing movement handler
 * - Veteran mercenaries (qualityType === 'veteran_mercenary') attempt to
 *   leave the field toward their friendly map edge and are removed once
 *   they reach it.
 * - All other routing units fall back toward their campPosition and, upon
 *   arrival, stop routing but remain broken.
 */
function handleRoutingMovement(unit, side, battleState, map) {
    const current = parseCoord(unit.position);
    if (!current) return unit;

    const size = map?.size || { rows: 20, cols: 20 };
    const maxRowIndex = (size.rows || size.height || 20) - 1;

    const updated = { ...unit };

    // Veteran mercenaries desert the field
    if ((unit.qualityType || '').toLowerCase() === 'veteran_mercenary') {
        updated.routingTarget = 'edge';
        let rowIndex = current.row;      // 0..19
        const colIndex = current.col;    // 0..19

        if (side === 'player1') {
            // Retreat north (toward row 0)
            if (rowIndex === 0) {
                // Already at north edge: next step would leave the field
                updated.hasDeserted = true;
                return updated;
            }
            rowIndex = Math.max(0, rowIndex - 1);
        } else {
            // Retreat south (toward last row)
            if (rowIndex === maxRowIndex) {
                updated.hasDeserted = true;
                return updated;
            }
            rowIndex = Math.min(maxRowIndex, rowIndex + 1);
        }

        const next = { row: rowIndex, col: colIndex };
        updated.position = coordToString(next);
        return updated;
    }

    // All other routing units fall back toward camp
    const camp = battleState[side]?.campPosition || unit.campPosition;
    if (!camp) return unit;

    const campCoord = parseCoord(camp);
    if (!campCoord) return unit;

    updated.routingTarget = 'camp';

    const step = { row: current.row, col: current.col };

    // Step one tile toward camp in row, then column if needed
    if (current.row !== campCoord.row) {
        if (current.row > campCoord.row) {
            step.row = String.fromCharCode(current.row.charCodeAt(0) - 1);
        } else if (current.row < campCoord.row) {
            step.row = String.fromCharCode(current.row.charCodeAt(0) + 1);
        }
    } else if (current.col !== campCoord.col) {
        if (current.col > campCoord.col) {
            step.col = current.col - 1;
        } else if (current.col < campCoord.col) {
            step.col = current.col + 1;
        }
    }

    updated.position = coordToString(step);

    // If we have arrived at camp, stop routing but remain broken
    if (updated.position === camp) {
        updated.isRouting = false;
        updated.isBroken = true;
        updated.regroupedAtCamp = true;
    }

    return updated;
}

module.exports = {
    detectCombatTriggers,
    calculatePositionalModifiers,
    buildCombatContext,
    processMovementPhase,
    calculateFlankingBonus,
    calculateElevationAdvantage,
    isCrossingRiver
};
