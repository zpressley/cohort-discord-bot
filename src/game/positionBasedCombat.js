// src/game/positionBasedCombat.js
// Combat resolution with tactical positioning modifiers

const { calculateDistance, getAdjacentCoords, parseCoord, coordToString, getDirection } = require('./maps/mapUtils');

/**
 * Detect combat triggers based on unit positions
 * @param {Array} player1Units - Player 1 unit positions
 * @param {Array} player2Units - Player 2 unit positions
 * @returns {Array} Array of combat engagements
 */
function detectCombatTriggers(player1Units, player2Units) {
    const { getUnitWeaponRange, hasRangedWeapon } = require('./rangedCombat');
    const combats = [];
    
    player1Units.forEach(p1Unit => {
        player2Units.forEach(p2Unit => {
            const p1Pos = parseCoord(p1Unit.position);
            const p2Pos = parseCoord(p2Unit.position);
            const dx = Math.abs(p1Pos.col - p2Pos.col);
            const dy = Math.abs(p1Pos.row - p2Pos.row);
            const manhattan = dx + dy;                 // N/S/E/W adjacency only
            const chebyshev = Math.max(dx, dy);        // for ranged distance
            
            // Melee only when units share an edge (no diagonal contact)
            if (manhattan === 1) {
                combats.push({
                    location: p1Unit.position,
                    attacker: p1Unit,
                    defender: p2Unit,
                    type: 'melee',
                    distance: manhattan
                });
            }
            
            // Ranged combat: each side may be able to shoot the other based on
            // its own weapon's maximum range (2–14 tiles depending on weapon).
            if (chebyshev > 1) {
                const p1Range = hasRangedWeapon(p1Unit) ? getUnitWeaponRange(p1Unit) : null;
                const p2Range = hasRangedWeapon(p2Unit) ? getUnitWeaponRange(p2Unit) : null;

                if (p1Range && chebyshev <= p1Range.maximum) {
                    combats.push({
                        location: p1Unit.position,
                        shooter: p1Unit,
                        target: p2Unit,
                        type: 'ranged',
                        distance: chebyshev,
                        weaponRange: p1Range
                    });
                }

                if (p2Range && chebyshev <= p2Range.maximum) {
                    combats.push({
                        location: p2Unit.position,
                        shooter: p2Unit,
                        target: p1Unit,
                        type: 'ranged',
                        distance: chebyshev,
                        weaponRange: p2Range
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

    // Facing + formation directional bonuses (front / flank / rear)
    const attackDir = getAttackCardinalDirection(attacker.position, defender.position);
    const facingBonus = getFormationDefenseBonus(defender, attackDir);
    if (facingBonus !== 0) {
        modifiers.defender.defense += facingBonus;
        if (facingBonus > 0) {
            modifiers.description.push(`Formation facing advantage (${attackDir} vs ${defender.facing || 'N'}): +${facingBonus} defense`);
        } else {
            modifiers.description.push(`Hit from flank/rear (${attackDir} vs ${defender.facing || 'N'}): ${facingBonus} defense`);
        }
    }

    // Marching column frontal penalty: when a marching unit is hit in the head
    if ((defender.formationStatus || 'deployed') === 'marching' && attackDir) {
        const defFacing = (defender.facing || 'N').toUpperCase();
        if (attackDir === defFacing) {
            const strength = defender.currentStrength || defender.maxStrength || 400;
            const tilesDeep = Math.max(1, Math.min(4, Math.ceil(strength / 100)));
            const frontagePenalty = (tilesDeep - 1) * 2; // 100→0, 300→4, 400→6
            if (frontagePenalty > 0) {
                modifiers.defender.defense -= frontagePenalty;
                modifiers.description.push(
                    `March column head hit: only 1/${tilesDeep} of men can fight; defense ${-frontagePenalty}`
                );
            }
        }
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
    
    // Enemy units of defender that are adjacent (other than this attacker)
    const adjacentEnemies = allUnits.filter(unit => 
        unit.side !== defender.side &&
        unit.unitId !== attacker.unitId &&
        adjacent.includes(unit.position)
    );
    
    if (adjacentEnemies.length === 0) return 0;
    
    // Determine distinct attack directions (N/S/E/W buckets, diagonals collapsed)
    const directions = new Set();
    adjacentEnemies.forEach(unit => {
        const dir = getAttackCardinalDirection(unit.position, defenderPos);
        if (dir) directions.add(dir);
    });
    
    const attackDirections = directions.size;
    if (attackDirections <= 1) return 0;     // front-only pressure
    if (attackDirections === 2) return +3;   // flanked
    if (attackDirections === 3) return +6;   // U-shaped attack
    if (attackDirections >= 4) return +8;    // surrounded on all sides
    
    return 0;
}

/**
 * Mark melee engagements so ranged combat can reason about "shooting into melee".
 * Returns Map<unitId, { engaged, fightingWith: string[], adjacentFriendlies: string[] }>.
 */
function trackMeleeEngagements(combats, allUnits) {
    const engagements = new Map();

    // Initialize all units as not engaged
    allUnits.forEach(unit => {
        if (!unit || !unit.unitId) return;
        engagements.set(unit.unitId, {
            engaged: false,
            fightingWith: [],
            adjacentFriendlies: []
        });
    });

    // Mark units in melee combat
    combats.forEach(combat => {
        if (combat.type !== 'melee') return;
        const attackerId = combat.attacker.unitId;
        const defenderId = combat.defender.unitId;

        if (!engagements.has(attackerId) || !engagements.has(defenderId)) return;

        const att = engagements.get(attackerId);
        const def = engagements.get(defenderId);

        att.engaged = true;
        def.engaged = true;
        att.fightingWith.push(defenderId);
        def.fightingWith.push(attackerId);
    });

    // For each engaged unit, record adjacent friendly units (for FF distribution)
    allUnits.forEach(unit => {
        if (!unit || !unit.unitId) return;
        const entry = engagements.get(unit.unitId);
        if (!entry || !entry.engaged) return;

        const adj = getAdjacentCoords(unit.position);
        const friendlies = allUnits.filter(u =>
            u.side === unit.side &&
            u.unitId !== unit.unitId &&
            adj.includes(u.position)
        );

        entry.adjacentFriendlies = friendlies.map(f => f.unitId);
    });

    return engagements;
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

    // NOTE: Stacking is allowed for deployed units. Marching columns must still
    // respect collision/stacking rules along their entire footprint.
    
        // Execute moves in initiative order
        for (const item of combined) {
            const { side, unit, move } = item;
            let nextPos = move.finalPosition || move.targetPosition;
            let movementRemaining = move.validation.movementRemaining;
            if (move.modifier?.groupMarch && Array.isArray(move.validation.path) && move.validation.path.length > 1) {
                nextPos = move.validation.path[1];
                movementRemaining = Math.max(0, (unit.movementRemaining || 3) - 1);
            }

            // MOV-ENEMY-EXCLUSION: Prevent movement paths from entering tiles
            // currently occupied by an enemy unit. If the validated path would
            // step onto an enemy tile before reaching nextPos, clamp nextPos to
            // the last safe tile before that contact.
            const pathForMove = Array.isArray(move.validation?.path) ? move.validation.path : null;
            const enemyUnitsNow = side === 'player1'
                ? Array.from(p2Map.values())
                : Array.from(p1Map.values());
            const enemyPosSet = new Set(
                enemyUnitsNow
                    .map(u => u && u.position)
                    .filter(Boolean)
            );

            if (pathForMove && pathForMove.length > 1 && enemyPosSet.size > 0) {
                // Find index of this turn's destination in the path
                let destIndex = pathForMove.lastIndexOf(nextPos);
                if (destIndex === -1) destIndex = pathForMove.length - 1;

                // Scan forward from the first step up to destIndex; if any step
                // is an enemy tile, stop one tile short of it.
                for (let i = 1; i <= destIndex; i++) {
                    const stepCoord = pathForMove[i];
                    if (enemyPosSet.has(stepCoord)) {
                        nextPos = pathForMove[i - 1];
                        break;
                    }
                }
            }

        // Marching column collision/stacking: ensure the *column* can occupy the
        // intended footprint at nextPos. If not, fall back to the last valid
        // front tile along the validated path.
        let finalPos = nextPos;
        const movingStatus = unit.formationStatus || 'deployed';
        if (movingStatus === 'marching' && pathForMove && pathForMove.length > 1) {
            const { calculateOccupiedTiles, checkStackingViolation } = require('./formations/formationStatus');
            const path = pathForMove;
            const allUnits = [
                ...Array.from(p1Map.values()).map(u => ({ ...u, side: 'player1' })),
                ...Array.from(p2Map.values()).map(u => ({ ...u, side: 'player2' }))
            ];

            // Walk backwards along the validated path to find the furthest
            // front tile where the column footprint is collision-legal.
            for (let i = path.length - 1; i >= 1; i--) {
                const testFront = path[i];
                const virtual = { ...unit, position: testFront };
                const occupied = calculateOccupiedTiles(virtual);
                let blocked = false;
                for (const tile of occupied) {
                    const stack = checkStackingViolation(tile, virtual, allUnits);
                    if (!stack.allowed) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    finalPos = testFront;
                    break;
                }
            }
        }

        // Track from-where-this-unit-approached its final tile so we can form
        // natural trailing columns when multiple units converge on the same
        // destination.
        let approachFrom = unit.position;
        if (pathForMove && pathForMove.length >= 2) {
            let idx = pathForMove.lastIndexOf(finalPos);
            if (idx === -1) idx = pathForMove.length - 1;
            if (idx > 0) {
                approachFrom = pathForMove[idx - 1];
            }
        }

        const updated = {
            ...unit,
            position: finalPos,
            movementRemaining,
            hasMoved: true,
            approachFrom
        };

        // Update facing based on direction of movement (only when the unit actually changes tile)
        if (unit.position && finalPos && unit.position !== finalPos) {
            const moveDir = getAttackCardinalDirection(unit.position, finalPos);
            if (moveDir) {
                updated.facing = moveDir;
            }
        }

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

    // Friendly unstacking: after all moves, try to ensure one friendly unit per
    // tile when space exists nearby. This respects:
    // - Passing through friends during movement (unchanged)
    // - Not pulling units off tiles that also contain enemies (those tiles are
    //   combat hotspots and should not be "auto-resolved" away)
    function unstackFriendlyUnits(friendlyUnits, enemyUnits) {
        const enemyPos = new Set(
            (enemyUnits || [])
                .map(u => u && u.position)
                .filter(Boolean)
        );

        const byTile = new Map();
        (friendlyUnits || []).forEach(u => {
            if (!u || !u.position) return;
            const key = u.position;
            if (!byTile.has(key)) byTile.set(key, []);
            byTile.get(key).push(u);
        });

        const occupied = new Set();
        const result = [];

        // Helper: relative speed tier (reuse movement initiative tiers)
        const tierOf = (unit) => {
            const qt = (unit.qualityType || '').toLowerCase();
            if (qt.includes('scout')) return 1;
            if (unit.mounted) return 2;
            if (qt.includes('light')) return 3;
            if (qt.includes('heavy')) return 4;
            return 3;
        };

        // Helper: BFS fallback if behind slots are blocked
        function findNearestFreeTile(origin, occupiedSet) {
            const base = parseCoord(origin);
            if (!base) return origin;

            const maxRadius = 3;
            for (let r = 1; r <= maxRadius; r++) {
                for (let dr = -r; dr <= r; dr++) {
                    for (let dc = -r; dc <= r; dc++) {
                        if (Math.abs(dr) + Math.abs(dc) !== r) continue; // diamond ring
                        const row = base.row + dr;
                        const col = base.col + dc;
                        if (row < 0 || row >= 40 || col < 0 || col >= 40) continue;
                        const coord = coordToString({ row, col });
                        if (occupiedSet.has(coord)) continue;
                        if (enemyPos.has(coord)) continue;
                        return coord;
                    }
                }
            }
            return origin;
        }

        // For each tile, keep fastest as anchor, trail others along their
        // individual approach vectors when possible.
        byTile.forEach((arr, tile) => {
            if (!arr || arr.length === 0) return;

            // If enemies occupy this tile too, leave all friendlies in place so
            // combat resolution sees the correct contact geometry.
            if (enemyPos.has(tile) || arr.length === 1) {
                arr.forEach(u => {
                    result.push(u);
                    occupied.add(u.position);
                });
                return;
            }

            const sorted = [...arr].sort((a, b) => tierOf(a) - tierOf(b));
            const anchor = sorted[0];
            result.push(anchor);
            occupied.add(anchor.position);

            const anchorCoord = parseCoord(tile);
            sorted.slice(1).forEach((u, idx) => {
                const stepIndex = idx + 1; // 1 tile back for 2nd, 2 tiles for 3rd, etc.
                let placed = false;

                const fromPos = u.approachFrom || tile;
                const fromCoord = parseCoord(fromPos);
                if (anchorCoord && fromCoord) {
                    let dr = anchorCoord.row - fromCoord.row;
                    let dc = anchorCoord.col - fromCoord.col;
                    if (dr !== 0) dr = dr > 0 ? 1 : -1;
                    if (dc !== 0) dc = dc > 0 ? 1 : -1;

                    if (dr !== 0 || dc !== 0) {
                        for (let k = 1; k <= stepIndex; k++) {
                            const row = anchorCoord.row + dr * k;
                            const col = anchorCoord.col + dc * k;
                            if (row < 0 || row >= 40 || col < 0 || col >= 40) break;
                            const coord = coordToString({ row, col });
                            if (occupied.has(coord)) continue;
                            if (enemyPos.has(coord)) continue;
                            const updated = { ...u, position: coord };
                            result.push(updated);
                            occupied.add(coord);
                            placed = true;
                            break;
                        }
                    }
                }

                if (!placed) {
                    const fallback = findNearestFreeTile(tile, occupied);
                    const updated = { ...u, position: fallback };
                    result.push(updated);
                    occupied.add(fallback);
                }
            });
        });

        // Include any units that never appeared in byTile (no position)
        friendlyUnits.forEach(u => {
            if (!u || !u.position) {
                result.push(u);
            }
        });

        return result;
    }

    newPlayer1Positions = unstackFriendlyUnits(newPlayer1Positions, newPlayer2Positions);
    newPlayer2Positions = unstackFriendlyUnits(newPlayer2Positions, newPlayer1Positions);

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

    // Split into melee and ranged engagements
    const meleeTriggers = combatTriggers.filter(c => c.type === 'melee');
    const rangedTriggers = combatTriggers.filter(c => c.type === 'ranged');

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

    // Build combat contexts and mark missions complete for engaged units (melee only).
    const combatContexts = meleeTriggers.map(combat => {
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
        },
        rangedEngagements: rangedTriggers,
        meleeEngagements: trackMeleeEngagements(meleeTriggers, [
            ...newPlayer1Positions.map(u => ({ ...u, side: 'player1' })),
            ...newPlayer2Positions.map(u => ({ ...u, side: 'player2' }))
        ])
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
 * Derive a coarse cardinal attack direction (N/S/E/W) from attacker to defender.
 * Diagonals are collapsed to their dominant axis.
 */
function getAttackCardinalDirection(attackerPos, defenderPos) {
    const dirStr = getDirection(attackerPos, defenderPos); // e.g. 'northwest'
    if (!dirStr || typeof dirStr !== 'string') return null;
    const d = dirStr.toLowerCase();
    if (d.includes('north') && !d.includes('east') && !d.includes('west')) return 'N';
    if (d.includes('south') && !d.includes('east') && !d.includes('west')) return 'S';
    if (d.includes('east')  && !d.includes('north') && !d.includes('south')) return 'E';
    if (d.includes('west')  && !d.includes('north') && !d.includes('south')) return 'W';
    // Diagonals: choose dominant axis by row/col delta
    const from = parseCoord(attackerPos);
    const to = parseCoord(defenderPos);
    if (!from || !to) return null;
    const dRow = to.row - from.row; // + = south, - = north
    const dCol = to.col - from.col; // + = east,  - = west
    if (Math.abs(dRow) >= Math.abs(dCol)) {
        return dRow >= 0 ? 'S' : 'N';
    } else {
        return dCol >= 0 ? 'E' : 'W';
    }
}

/**
 * Facing-aware formation defense bonuses.
 * Currently focuses on phalanx-style formations but can be extended.
 */
function getFormationDefenseBonus(defender, attackDirection) {
    const facing = (defender.facing || 'N').toUpperCase();
    const formation = (defender.formation || '').toLowerCase();

    if (!attackDirection) return 0;

    // Helper: is this a flank relative to facing?
    const isFlank = (face, atk) => {
        if (face === 'N' || face === 'S') {
            return atk === 'E' || atk === 'W';
        } else {
            return atk === 'N' || atk === 'S';
        }
    };

    const isRear = (face, atk) => {
        if (face === 'N' && atk === 'S') return true;
        if (face === 'S' && atk === 'N') return true;
        if (face === 'E' && atk === 'W') return true;
        if (face === 'W' && atk === 'E') return true;
        return false;
    };

    // Example directional formations: phalanx-style and similar
    if (formation === 'phalanx' || formation === 'shield_wall' || formation === 'roman_manipular') {
        if (attackDirection === facing) {
            // Strong to the front
            return +4;
        }
        if (isFlank(facing, attackDirection)) {
            // Vulnerable on flanks
            return -4;
        }
        if (isRear(facing, attackDirection)) {
            // Very vulnerable from rear
            return -6;
        }
    }

    // Default: no directional modifier
    return 0;
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

    // Step one tile toward camp in row, then column if needed.
    // current.row / campCoord.row are 0-based numeric indices; move +/-1.
    if (current.row !== campCoord.row) {
        if (current.row > campCoord.row) {
            step.row = current.row - 1;
        } else if (current.row < campCoord.row) {
            step.row = current.row + 1;
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
