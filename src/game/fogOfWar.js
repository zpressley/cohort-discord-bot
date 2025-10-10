// src/game/fogOfWar.js
// Fog of War and Intelligence Gathering System

const { calculateEuclideanDistance } = require('./maps/mapUtils');
const DETECTION_RANGES = {
    // Base spotting (clear weather, ground level)
    standard: 8,      // 400m - can see movement
    scouts: 12,       // 600m - trained observers
    elevated: 4,      // +200m bonus from hills
    
    // Identification threshold (tell unit type)
    identifyDistance: 5,  // 250m
    
    // Detail threshold (exact numbers, equipment)
    detailDistance: 3,    // 150m
    
    // Weather penalties (apply to ALL ranges)
    weatherModifiers: {
        clear: 0,
        lightRain: -2,
        heavyRain: -5,
        fog: -6,
        dust: -3
    },
    
    // Terrain modifiers
    terrainModifiers: {
        denseForest: -3,
        lightForest: -1,
        marsh: -1
    }
};

/**
 * Calculate what a player can see based on unit positions
 * Returns tiered intelligence: spotted → identified → detailed
 * 
 * @param {Array} playerUnits - Player's unit positions
 * @param {Array} enemyUnits - Enemy unit positions  
 * @param {Object} terrain - Map terrain data
 * @param {string} weather - Current weather conditions
 * @returns {Object} Tiered visibility information
 */
function calculateVisibility(playerUnits, enemyUnits, terrain, weather = 'clear') {
    const visibleEnemyPositions = new Set();
    const intelligence = {
        spotted: [],      // Movement detected (long range)
        identified: [],   // Unit type known (medium range)
        detailed: []      // Full intel (short range)
    };
    
    const weatherPenalty = DETECTION_RANGES.weatherModifiers[weather] || 0;
    
    // Check each player unit's detection capability
    playerUnits.forEach(unit => {
        // Calculate unit's effective ranges
        const isScout = unit.unitType?.toLowerCase().includes('scout');
        const isElevated = terrain.hill && terrain.hill.includes(unit.position);
        const unitTerrain = getUnitTerrain(unit.position, terrain);
        
        const baseSpotRange = isScout ? DETECTION_RANGES.scouts : DETECTION_RANGES.standard;
        const elevationBonus = isElevated ? DETECTION_RANGES.elevated : 0;
        const terrainPenalty = DETECTION_RANGES.terrainModifiers[unitTerrain] || 0;
        
        const effectiveSpotRange = baseSpotRange + elevationBonus + weatherPenalty + terrainPenalty;
        const effectiveIdentifyRange = DETECTION_RANGES.identifyDistance + (elevationBonus / 2) + weatherPenalty;
        const effectiveDetailRange = DETECTION_RANGES.detailDistance + weatherPenalty;
        
        // Check each enemy unit
        enemyUnits.forEach(enemy => {
            const distance = calculateEuclideanDistance(unit.position, enemy.position);
            
            // TIER 1: SPOTTING (can see something there)
            if (distance <= Math.max(1, effectiveSpotRange)) {
                visibleEnemyPositions.add(enemy.position);
                
                // TIER 3: DETAILED (full accurate intel)
                if (distance <= Math.max(1, effectiveDetailRange)) {
                    intelligence.detailed.push({
                        position: enemy.position,
                        unitType: enemy.unitType || 'infantry',
                        exactStrength: enemy.currentStrength,
                        equipment: enemy.equipment || 'standard',
                        formation: enemy.formation || 'unknown',
                        morale: enemy.morale || 'unknown',
                        confidence: 'HIGH',
                        distance: Math.round(distance)
                    });
                }
                // TIER 2: IDENTIFIED (know what it is)
                else if (distance <= Math.max(1, effectiveIdentifyRange)) {
                    intelligence.identified.push({
                        position: enemy.position,
                        unitType: enemy.unitType || 'unknown',
                        estimatedStrength: Math.round(enemy.currentStrength / 25) * 25, // Round to 25
                        confidence: 'MEDIUM',
                        distance: Math.round(distance)
                    });
                }
                // TIER 1: SPOTTED (movement only)
                else {
                    intelligence.spotted.push({
                        position: enemy.position,
                        unitType: 'unknown',
                        estimatedStrength: 'unknown',
                        confidence: 'LOW',
                        distance: Math.round(distance)
                    });
                }
            }
        });
    });
    
    return {
        visibleEnemyPositions: Array.from(visibleEnemyPositions),
        intelligence,
        totalEnemiesDetected: visibleEnemyPositions.size,
        detectionRanges: {
            spotting: Math.max(1, effectiveSpotRange),
            identify: Math.max(1, effectiveIdentifyRange),
            detail: Math.max(1, effectiveDetailRange)
        }
    };
}

/**
 * Get terrain type at unit's position
 */
function getUnitTerrain(position, terrain) {
    if (terrain.denseForest && terrain.denseForest.includes(position)) return 'denseForest';
    if (terrain.forest && terrain.forest.includes(position)) return 'lightForest';
    if (terrain.marsh && terrain.marsh.includes(position)) return 'marsh';
    return 'open';
}

/**
 * Generate intelligence report with tiered information
 */
function generateIntelligenceReport(visibility, culture) {
    const reports = [];
    
    // DETAILED intel (closest, most accurate)
    if (visibility.intelligence.detailed.length > 0) {
        visibility.intelligence.detailed.forEach(contact => {
            reports.push(
                `📍 **CONFIRMED: ${contact.unitType.toUpperCase()} at ${contact.position}**\n` +
                `   Exact strength: ${contact.exactStrength} warriors\n` +
                `   Formation: ${contact.formation}\n` +
                `   Distance: ${contact.distance} tiles (${contact.distance * 50}m)\n` +
                `   Confidence: ${contact.confidence}`
            );
        });
    }
    
    // IDENTIFIED intel (medium range)
    if (visibility.intelligence.identified.length > 0) {
        visibility.intelligence.identified.forEach(contact => {
            reports.push(
                `👁️ **${contact.unitType.toUpperCase()} SPOTTED at ${contact.position}**\n` +
                `   Estimated: ~${contact.estimatedStrength} troops\n` +
                `   Distance: ${contact.distance} tiles (${contact.distance * 50}m)\n` +
                `   Confidence: ${contact.confidence}`
            );
        });
    }
    
    // SPOTTED intel (long range, vague)
    if (visibility.intelligence.spotted.length > 0) {
        const positions = visibility.intelligence.spotted.map(s => s.position).join(', ');
        reports.push(
            `⚠️ **MOVEMENT DETECTED**\n` +
            `   Locations: ${positions}\n` +
            `   Details unclear - too distant for identification\n` +
            `   Recommend: Send scouts for closer observation`
        );
    }
    
    // No contact
    if (reports.length === 0) {
        reports.push('🔍 **No Enemy Contact**\n\nNo enemy forces detected within observation range.');
    }
    
    return reports.join('\n\n');
}


/**
 * Get terrain modifier for detection range
 * Hills increase range, forests decrease
 */
function getTerrainDetectionModifier(position, terrain) {
    if (terrain.hill && terrain.hill.includes(position)) return +2;
    if (terrain.forest && terrain.forest.includes(position)) return -1;
    return 0;
}

/**
 * Filter battle state for a specific player (apply fog of war)
 * @param {Object} battleState - Complete battle state
 * @param {string} playerSide - 'player1' or 'player2'
 * @returns {Object} Filtered state with only visible information
 */
function filterBattleStateForPlayer(battleState, playerSide) {
    const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
    
    const playerData = battleState[playerSide];
    const opponentData = battleState[opponentSide];
    
    // Calculate what this player can see
    const visibility = calculateVisibility(
        playerData.unitPositions || [],
        opponentData.unitPositions || [],
        battleState.terrain
    );
    
    // Return filtered state
    return {
        // Full data for your own forces
        yourForces: {
            units: playerData.unitPositions,
            army: playerData.army,
            supplies: playerData.supplies,
            morale: playerData.morale
        },
        
        // Limited data for enemy forces
        enemyForces: {
            detectedUnits: visibility.intelligence.confirmed,
            estimatedUnits: visibility.intelligence.estimated,
            suspectedActivity: visibility.intelligence.suspected,
            totalDetected: visibility.totalEnemiesDetected,
            unknownForces: opponentData.unitPositions.length - visibility.totalEnemiesDetected
        },
        
        // Terrain always visible
        terrain: battleState.terrain,
        weather: battleState.weather,
        
        // Battle info
        turnNumber: battleState.currentTurn,
        objectives: battleState.objectives
    };
}

/**
 * Generate intelligence report for player
 * @param {Object} visibility - Visibility calculation results
 * @param {string} culture - Player's culture for officer voice
 * @returns {string} Formatted intelligence report
 */
function generateIntelligenceReport(visibility, culture) {
    const reports = [];
    
    // Confirmed sightings
    if (visibility.intelligence.confirmed.length > 0) {
        visibility.intelligence.confirmed.forEach(contact => {
            reports.push(
                `📍 **Confirmed Contact at ${contact.position}**\n` +
                `Type: ${contact.unitType}\n` +
                `Strength: ~${contact.estimatedStrength} warriors\n` +
                `Confidence: HIGH`
            );
        });
    }
    
    // Estimated sightings  
    if (visibility.intelligence.estimated.length > 0) {
        visibility.intelligence.estimated.forEach(contact => {
            reports.push(
                `👁️ **Enemy Spotted at ${contact.position}**\n` +
                `Estimated: ~${contact.estimatedStrength} troops\n` +
                `Confidence: MEDIUM`
            );
        });
    }
    
    // Suspected activity
    if (visibility.intelligence.suspected.length > 0) {
        const positions = visibility.intelligence.suspected.map(s => s.position).join(', ');
        reports.push(
            `⚠️ **Possible Activity**\n` +
            `Locations: ${positions}\n` +
            `Details unclear - send scouts for confirmation`
        );
    }
    
    // No contact
    if (reports.length === 0) {
        reports.push('🔍 **No Enemy Contact**\n\nNo enemy forces detected within current observation range.');
    }
    
    return reports.join('\n\n');
}

/**
 * Check if unit can see specific coordinate
 * @param {Object} unit - Unit with position and detectRange
 * @param {string} targetCoord - Coordinate to check
 * @param {Object} terrain - Terrain data
 * @returns {boolean} True if visible
 */
function canSeeCoordinate(unit, targetCoord, terrain) {
    const distance = calculateEuclideanDistance(unit.position, targetCoord);
    const terrainMod = getTerrainDetectionModifier(unit.position, terrain);
    const effectiveRange = (unit.detectRange || 2) + terrainMod;
    
    return distance <= effectiveRange;
}

/**
 * Process scout orders and update intelligence
 * @param {Object} scoutUnit - Scout unit being ordered
 * @param {string} targetArea - Where to scout (coordinate or description)
 * @param {Object} battleState - Current battle state
 * @returns {Object} Scout mission results
 */
function processScoutMission(scoutUnit, targetArea, battleState) {
    const opponentSide = battleState.currentPlayerSide === 'player1' ? 'player2' : 'player1';
    const enemyUnits = battleState[opponentSide].unitPositions || [];
    
    // Scout moves to target area
    const scoutPosition = targetArea; // Assume AI has parsed to coordinate
    
    // Check what scout detects
    const detected = enemyUnits.filter(enemy => {
        const distance = calculateEuclideanDistance(scoutPosition, enemy.position);
        return distance <= 5; // Scouts have 5-tile range
    });
    
    return {
        scoutPosition: scoutPosition,
        detectedEnemies: detected.map(e => ({
            position: e.position,
            unitType: e.unitType,
            strength: e.currentStrength,
            confidence: 'high'
        })),
        reportAvailable: true,
        scoutSurvived: checkScoutSurvival(scoutPosition, enemyUnits)
    };
}

/**
 * Check if scout survives mission (can be intercepted)
 */
function checkScoutSurvival(scoutPos, enemyUnits) {
    // Scout killed if enemy within 1 tile
    const nearby = enemyUnits.filter(e => 
        calculateEuclideanDistance(scoutPos, e.position) <= 1
    );
    
    if (nearby.length > 0) {
        return Math.random() > 0.5; // 50% chance to escape
    }
    
    return true; // Safe if no enemies nearby
}

module.exports = {
    calculateVisibility,
    filterBattleStateForPlayer,
    generateIntelligenceReport,
    canSeeCoordinate,
    processScoutMission,
    getTerrainDetectionModifier,
    DETECTION_RANGES,
    getUnitTerrain
};

