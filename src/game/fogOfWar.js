// src/game/fogOfWar.js
// Fog of War and Intelligence Gathering System

const { calculateEuclideanDistance } = require('./maps/mapUtils');

const DETECTION_RANGES = {
    // Base spotting (clear weather, ground level)
    // Tactical scale: 50m/tile. We want:
    // - Detailed intel ≤3 tiles (~150m)
    // - Identification up to ~6 tiles (~300m)
    // - Long-range "movement detected" up to ~8 tiles (~400m)
    standard: 8,      // max spotting range for regular troops
    scouts: 10,       // scouts see slightly farther
    elevated: 2,      // modest hill bonus
    
    // Identification threshold (tell unit type)
    identifyDistance: 6,
    
    // Detail threshold (exact numbers, equipment)
    detailDistance: 3,
    
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
    // Validate inputs
    if (!Array.isArray(playerUnits)) playerUnits = [];
    if (!Array.isArray(enemyUnits)) enemyUnits = [];
    if (!terrain || typeof terrain !== 'object') {
        terrain = { hill: [], forest: [], marsh: [], river: [], road: [] };
    }
    
    const visibleEnemyPositions = new Set();
    const intelligence = {
        spotted: [],      // Movement detected (long range)
        identified: [],   // Unit type known (medium range)
        detailed: []      // Full intel (short range)
    };
    
    const weatherKey = normalizeWeatherKey(weather);
    const weatherPenalty = DETECTION_RANGES.weatherModifiers[weatherKey] || 0;
    
    // Check each player unit's detection capability
    playerUnits.forEach(unit => {
        // Calculate unit's effective ranges
        const isScout = unit.unitType?.toLowerCase().includes('scout');
        const isElevated = terrain?.hill?.includes(unit.position) || false;
        const unitTerrain = getUnitTerrain(unit.position, terrain);
        
        const baseSpotRange = isScout ? DETECTION_RANGES.scouts : DETECTION_RANGES.standard;
        const elevationBonus = isElevated ? DETECTION_RANGES.elevated : 0;
        const terrainPenalty = DETECTION_RANGES?.terrainModifiers?.[unitTerrain] || 0;
        
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
                        unitId: enemy.unitId,
                        unitType: enemy.unitType || 'infantry',
                        isElite: !!enemy.isElite,
                        mounted: !!enemy.mounted,
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
                        unitId: enemy.unitId,
                        unitType: enemy.unitType || 'unknown',
                        isElite: !!enemy.isElite,
                        mounted: !!enemy.mounted,
                        estimatedStrength: Math.round(enemy.currentStrength / 25) * 25, // Round to 25
                        confidence: 'MEDIUM',
                        distance: Math.round(distance)
                    });
                }
                // TIER 1: SPOTTED (movement only)
                else {
                    intelligence.spotted.push({
                        position: enemy.position,
                        unitId: enemy.unitId,
                        unitType: 'unknown',
                        isElite: !!enemy.isElite,
                        mounted: !!enemy.mounted,
                        estimatedStrength: null,
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
        totalEnemiesDetected: visibleEnemyPositions.size
    };
}

/** Normalize weather keys from battleState (e.g. light_rain) to FOW table keys */
function normalizeWeatherKey(weather) {
    const w = (weather || '').toLowerCase();
    if (w.includes('fog')) return 'fog';
    if (w.includes('heavy') && w.includes('rain')) return 'heavyRain';
    if (w.includes('light') && w.includes('rain')) return 'lightRain';
    if (w.includes('rain')) return 'lightRain';
    if (w.includes('dust')) return 'dust';
    return 'clear';
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
 * Get terrain modifier for detection range
 * Hills increase range, forests decrease
 */
function getTerrainDetectionModifier(position, terrain) {
    if (terrain.hill && terrain.hill.includes(position)) return DETECTION_RANGES.elevated;
    const unitTerrain = getUnitTerrain(position, terrain);
    return DETECTION_RANGES.terrainModifiers[unitTerrain] || 0;
}

/**
 * Filter battle state for a specific player (apply fog of war)
 */
function filterBattleStateForPlayer(battleState, playerSide) {
    const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
    
    const playerData = battleState[playerSide];
    const opponentData = battleState[opponentSide];
    
    const visibility = calculateVisibility(
        playerData.unitPositions || [],
        opponentData.unitPositions || [],
        battleState.terrain,
        battleState.weather || 'clear'
    );
    
    return {
        yourForces: {
            units: playerData.unitPositions,
            army: playerData.army,
            supplies: playerData.supplies,
            morale: playerData.morale
        },
        
        enemyForces: {
            detectedUnits: visibility.intelligence.detailed,
            estimatedUnits: visibility.intelligence.identified,
            suspectedActivity: visibility.intelligence.spotted,
            totalDetected: visibility.totalEnemiesDetected,
            unknownForces: opponentData.unitPositions.length - visibility.totalEnemiesDetected
        },
        
        terrain: battleState.terrain,
        weather: battleState.weather,
        turnNumber: battleState.currentTurn,
        objectives: battleState.objectives
    };
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
                `📍 **CONFIRMED: ${(contact.unitType || 'UNIT').toUpperCase()} at ${contact.position}**\n` +
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
                `👁️ **${(contact.unitType || 'FORCES').toUpperCase()} SPOTTED at ${contact.position}**\n` +
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
 * Check if unit can see specific coordinate
 */
function canSeeCoordinate(unit, targetCoord, terrain, weather = 'clear') {
    const distance = calculateEuclideanDistance(unit.position, targetCoord);
    
    const isScout = unit.unitType?.toLowerCase().includes('scout');
    const isElevated = terrain.hill && terrain.hill.includes(unit.position);
    const unitTerrain = getUnitTerrain(unit.position, terrain);
    
    const baseSpotRange = isScout ? DETECTION_RANGES.scouts : DETECTION_RANGES.standard;
    const elevationBonus = isElevated ? DETECTION_RANGES.elevated : 0;
    const weatherKey = normalizeWeatherKey(weather);
    const weatherPenalty = DETECTION_RANGES.weatherModifiers[weatherKey] || 0;
    const terrainPenalty = DETECTION_RANGES.terrainModifiers[unitTerrain] || 0;
    
    const effectiveRange = baseSpotRange + elevationBonus + weatherPenalty + terrainPenalty;
    
    return distance <= Math.max(1, effectiveRange);
}

/**
 * Process scout orders and update intelligence
 */
function processScoutMission(scoutUnit, targetArea, battleState) {
    const opponentSide = battleState.currentPlayerSide === 'player1' ? 'player2' : 'player1';
    const enemyUnits = battleState[opponentSide].unitPositions || [];
    
    const scoutPosition = targetArea;
    
    const detected = enemyUnits.filter(enemy => {
        const distance = calculateEuclideanDistance(scoutPosition, enemy.position);
        return distance <= DETECTION_RANGES.scouts;
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
    const nearby = enemyUnits.filter(e => 
        calculateEuclideanDistance(scoutPos, e.position) <= 1
    );
    
    if (nearby.length > 0) {
        return Math.random() > 0.5;
    }
    
    return true;
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