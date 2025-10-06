// src/game/fogOfWar.js
// Fog of War and Intelligence Gathering System

const { calculateEuclideanDistance, getCoordsInRange } = require('./maps/mapUtils');

/**
 * Calculate what a player can see based on unit positions
 * @param {Array} playerUnits - Player's unit positions
 * @param {Array} enemyUnits - Enemy unit positions  
 * @param {Object} terrain - Map terrain data
 * @returns {Object} Visible information for this player
 */
function calculateVisibility(playerUnits, enemyUnits, terrain) {
    const visibleEnemyUnits = [];
    const detectedPositions = new Set();
    const intelligence = {
        confirmed: [],      // Detailed info (within close range)
        estimated: [],      // Approximate info (at max range)
        suspected: []       // Very vague (old intel, edge of range)
    };
    
    // Check each player unit's detection range
    playerUnits.forEach(unit => {
        const detectionRange = unit.detectRange || 2;
        const terrainMod = getTerrainDetectionModifier(unit.position, terrain);
        const effectiveRange = detectionRange + terrainMod;
        
        // Check each enemy unit
        enemyUnits.forEach(enemy => {
            const distance = calculateEuclideanDistance(unit.position, enemy.position);
            
            if (distance <= effectiveRange) {
                detectedPositions.add(enemy.position);
                
                // Detailed intel if close
                if (distance <= effectiveRange * 0.5) {
                    intelligence.confirmed.push({
                        position: enemy.position,
                        unitType: enemy.unitType,
                        estimatedStrength: enemy.currentStrength,
                        confidence: 'high'
                    });
                }
                // Approximate intel at medium range
                else if (distance <= effectiveRange * 0.8) {
                    intelligence.estimated.push({
                        position: enemy.position,
                        unitType: 'unknown',
                        estimatedStrength: Math.round(enemy.currentStrength / 20) * 20, // Round to nearest 20
                        confidence: 'medium'
                    });
                }
                // Vague intel at max range
                else {
                    intelligence.suspected.push({
                        position: enemy.position,
                        unitType: 'unknown',
                        estimatedStrength: 'unknown',
                        confidence: 'low'
                    });
                }
            }
        });
    });
    
    return {
        visibleEnemyPositions: Array.from(detectedPositions),
        intelligence,
        totalEnemiesDetected: detectedPositions.size
    };
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
    getTerrainDetectionModifier
};