// src/game/battleInitializer.js
// Initialize battles with proper unit deployment and state setup
// Version: 1.0.1 - Fixed commander creation order

const { RIVER_CROSSING_MAP } = require('./maps/riverCrossing');

/**
 * Initialize battle when both players have joined
 * @param {Object} battle - Battle database record
 * @param {Object} player1Commander - Player 1 commander record
 * @param {Object} player2Commander - Player 2 commander record
 * @returns {Object} Complete initialized battle state
 */
async function initializeBattle(battle, player1Commander, player2Commander) {
    console.log('🎬 Initializing battle...');
    console.log(`  Scenario: ${battle.scenario}`);
    console.log(`  P1 Culture: ${player1Commander.culture}`);
    console.log(`  P2 Culture: ${player2Commander.culture}`);
    
    // Get map for this scenario
    const map = getMapForScenario(battle.scenario);
    
    // Validate both players have armies
    if (!player1Commander.armyComposition || !player1Commander.armyComposition.units) {
        throw new Error('Player 1 has not built an army');
    }
    if (!player2Commander.armyComposition || !player2Commander.armyComposition.units) {
        throw new Error('Player 2 has not built an army');
    }
    
    // Ensure a cultural elite unit is present for each side (≈80 warriors)
    try {
        const { getEliteUnitForCulture } = require('./eliteTemplates');
        const { getAllWeapons, TROOP_QUALITY } = require('./armyData');
        const allWeapons = getAllWeapons();
        const eliteSize = 80;
        
        const normalize = (ac) => (typeof ac === 'string' ? JSON.parse(ac) : ac) || { units: [] };
        player1Commander.armyComposition = normalize(player1Commander.armyComposition);
        player2Commander.armyComposition = normalize(player2Commander.armyComposition);
        
        if (!Array.isArray(player1Commander.armyComposition.units)) {
            player1Commander.armyComposition.units = [];
        }
        if (!Array.isArray(player2Commander.armyComposition.units)) {
            player2Commander.armyComposition.units = [];
        }
        
        const hasElite1 = player1Commander.armyComposition.units.some(u => u && u.isElite);
        if (!hasElite1) {
            const elite = getEliteUnitForCulture(player1Commander.culture, eliteSize, allWeapons, TROOP_QUALITY);
            if (elite) player1Commander.armyComposition.units.unshift(elite);
        }
        
        const hasElite2 = player2Commander.armyComposition.units.some(u => u && u.isElite);
        if (!hasElite2) {
            const elite = getEliteUnitForCulture(player2Commander.culture, eliteSize, allWeapons, TROOP_QUALITY);
            if (elite) player2Commander.armyComposition.units.unshift(elite);
        }
    } catch (e) {
        console.warn('Elite unit injection skipped:', e.message);
    }
    
    // Deploy units to starting positions
    const p1Units = deployUnitsToStartingPositions(
        player1Commander.armyComposition,
        map.deployment.north.coords,
        'player1'
    );
    
    const p2Units = deployUnitsToStartingPositions(
        player2Commander.armyComposition,
        map.deployment.south.coords,
        'player2'
    );
    
    console.log('DEBUG P1 UNITS:', JSON.stringify(p1Units, null, 2));
    console.log('DEBUG P2 UNITS:', JSON.stringify(p2Units, null, 2));
    console.log(`  Deployed: P1 ${p1Units.length} units, P2 ${p2Units.length} units`);
    
    // Initialize complete battle state
    const battleState = {
        map: {
            scenario: battle.scenario,
            terrain: map.terrain,
            size: map.size
        },
        weather: battle.weather || 'clear',
        scenario: battle.scenario,
        
        player1: {
            army: player1Commander.armyComposition,
            unitPositions: p1Units,
            commander: {
                position: p1Units[0].position, // Start with first unit (usually elite)
                attachedTo: p1Units[0].unitId,
                status: 'active'
            },
            morale: 100,
            supplies: 100,
            visibleEnemyPositions: [], // Will be populated after first visibility check
            culture: player1Commander.culture
        },
        
        player2: {
            army: player2Commander.armyComposition,
            unitPositions: p2Units,
            commander: {
                position: p2Units[0].position,
                attachedTo: p2Units[0].unitId,
                status: 'active'
            },
            morale: 100,
            supplies: 100,
            visibleEnemyPositions: [],
            culture: player2Commander.culture
        },
        
        currentTurn: 1,
        turnHistory: [],
        objectives: parseObjectives(battle.victoryConditions)
    };
    
    // Compute initial visibility so each player can see their own forces and any spotted enemies
    try {
        const { calculateVisibility } = require('./fogOfWar');
        const p1Vis = calculateVisibility(
            battleState.player1.unitPositions, 
            battleState.player2.unitPositions, 
            map.terrain, 
            battle.weather || 'clear'
        );
        const p2Vis = calculateVisibility(
            battleState.player2.unitPositions, 
            battleState.player1.unitPositions, 
            map.terrain, 
            battle.weather || 'clear'
        );
        battleState.player1.visibleEnemyPositions = p1Vis.visibleEnemyPositions;
        battleState.player2.visibleEnemyPositions = p2Vis.visibleEnemyPositions;
    } catch (e) {
        console.warn('Initial visibility calculation failed:', e.message);
    }
    
    console.log('✅ Battle state initialized');
    
    // Create battle commanders in database (AFTER battleState is built)
    try {
        const { createBattleCommander } = require('./commandSystem/commanderManager');
        
        // Find elite units (first unit is usually elite due to unshift above)
        const p1Elite = battleState.player1.unitPositions.find(u => 
            u.isElite || u.unitId.includes('elite')
        ) || battleState.player1.unitPositions[0];
        
        const p2Elite = battleState.player2.unitPositions.find(u => 
            u.isElite || u.unitId.includes('elite')
        ) || battleState.player2.unitPositions[0];
        
        // Create P1 commander in database
        await createBattleCommander(
            battle.id,
            battle.player1Id,
            battleState.player1.culture,
            p1Elite.unitId,
            p1Elite.position
        );
        
        // Create P2 commander in database
        await createBattleCommander(
            battle.id,
            battle.player2Id,
            battleState.player2.culture,
            p2Elite.unitId,
            p2Elite.position
        );
        
        console.log('✅ Battle commanders created in database');
    } catch (err) {
        console.warn('⚠️ Commander creation failed:', err.message);
        // Continue anyway - in-memory commander state exists in battleState
    }
    
    return battleState;
}

/**
 * Get map data for a scenario
 */
function getMapForScenario(scenarioKey) {
    const scenarioMaps = {
        'river_crossing': RIVER_CROSSING_MAP,
        'bridge_control': RIVER_CROSSING_MAP, // TODO: Create dedicated map
        'forest_ambush': RIVER_CROSSING_MAP,  // TODO: Create dedicated map
        'hill_fort_assault': RIVER_CROSSING_MAP, // TODO: Create dedicated map
        'desert_oasis': RIVER_CROSSING_MAP // TODO: Create dedicated map
    };
    
    return scenarioMaps[scenarioKey] || RIVER_CROSSING_MAP;
}

/**
 * Deploy army units to starting positions
 * @param {Object} armyComposition - Army data from build-army
 * @param {Array} startingZone - Array of starting position coords
 * @param {string} side - 'player1' or 'player2'
 * @returns {Array} Deployed units with positions and full state
 */
function deployUnitsToStartingPositions(armyComposition, startingZone, side) {
    // Safety check
    if (!armyComposition || !armyComposition.units || armyComposition.units.length === 0) {
        throw new Error(`${side} has no units in army composition`);
    }
    
    const units = armyComposition.units;
    const deployed = [];
    
    console.log(`  Deploying ${units.length} units for ${side}:`);
    
    // Deploy each unit to a starting position
    units.forEach((unit, index) => {
        // Get position from starting zone (wrap around if more units than positions)
        const positionIndex = index % startingZone.length;
        const position = startingZone[positionIndex];
        
        const deployedUnit = {
            // Identity
            unitId: `${side === 'player1' ? 'north' : 'south'}_unit_${index}`,
            position: position,
            side: side,
            
            // Type - use both fields for compatibility
            type: unit.type || unit.unitType || 'infantry',
            unitType: unit.unitType || unit.type || 'infantry',
            
            // Strength
            currentStrength: unit.quality?.size || 100,
            maxStrength: unit.quality?.size || 100,
            
            // Equipment (preserve original structure from army builder)
            primaryWeapon: unit.primaryWeapon,
            armor: unit.armor,
            shields: unit.shields,
            training: unit.training,
            
            // Unit properties
            quality: unit.quality,
            qualityType: unit.qualityType || 'professional',
            mounted: unit.mounted || false,
            hasRanged: isRangedUnit(unit.primaryWeapon),
            isElite: unit.isElite || false,
            
            // Movement state
            movementRemaining: unit.mounted ? 5 : 3,
            canMove: true,
            hasMoved: false,
            
            // Mission state
            activeMission: null,
            
            // Combat state
            formation: 'standard',
            morale: 100,
            
            // Damage accumulation (CMB-005)
            accumulatedDamage: 0
        };
        
        console.log(`    ${deployedUnit.unitId} at ${position} (${unit.qualityType}, ${unit.primaryWeapon?.name || 'unarmed'})`);
        
        deployed.push(deployedUnit);
    });
    
    return deployed;
}

/**
 * Check if unit has ranged weapons
 */
function isRangedUnit(primaryWeapon) {
    if (!primaryWeapon || !primaryWeapon.name) return false;
    
    const rangedWeapons = [
        'Composite Bow', 'Self Bow', 'Crossbow', 'Han Chinese Crossbow',
        'Self-Bow', // Handle hyphenated versions
        'Sling', 'Javelin', 'Heavy Javelin', 'Light Javelin', 'Roman Pilum',
        'Throwing Axe', 'Throwing Spear'
    ];
    
    return rangedWeapons.some(w => primaryWeapon.name.includes(w));
}

/**
 * Parse victory conditions from battle record
 */
function parseObjectives(victoryConditions) {
    if (!victoryConditions) {
        return {
            type: 'elimination',
            description: 'Destroy enemy army'
        };
    }
    
    return {
        type: 'scenario_specific',
        description: victoryConditions.objective || 'Complete mission objective',
        specialRules: victoryConditions.specialRules || []
    };
}

/**
 * Validate battle state before initialization
 */
function validateBattleReadiness(battle, player1Commander, player2Commander) {
    const errors = [];
    
    if (!player1Commander) {
        errors.push('Player 1 commander not found');
    } else if (!player1Commander.armyComposition || !player1Commander.armyComposition.units) {
        errors.push('Player 1 has not built an army');
    }
    
    if (!player2Commander) {
        errors.push('Player 2 commander not found');
    } else if (!player2Commander.armyComposition || !player2Commander.armyComposition.units) {
        errors.push('Player 2 has not built an army');
    }
    
    if (!battle.scenario) {
        errors.push('Battle scenario not set');
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

module.exports = {
    initializeBattle,
    deployUnitsToStartingPositions,
    validateBattleReadiness,
    getMapForScenario
};