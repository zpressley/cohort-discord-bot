// src/game/movementSystem.js
// Movement validation and execution system

// Update validateMovement in src/game/movementSystem.js
// Replace the pathfinding section

const { findPathAStar, calculatePathCost } = require('./maps/mapUtils');

function validateMovement(unit, targetPosition, map) {
    const { getTerrainType } = require('./maps/riverCrossing');
    
    // Find path using A* pathfinding
    const pathResult = findPathAStar(
        unit.position,
        targetPosition,
        map,
        getTerrainType
    );
    
    if (!pathResult.valid) {
        return {
            valid: false,
            error: 'No valid path to target',
            reason: pathResult.reason || 'River or impassable terrain blocks the way'
        };
    }
    
    const path = pathResult.path;
    const movementCost = pathResult.cost;
    
    // Check if unit has enough movement
    const maxMovement = unit.movementRemaining || (unit.mounted ? 5 : 3);
    
    if (movementCost > maxMovement) {
        return {
            valid: false,
            error: `Target too far: requires ${movementCost.toFixed(1)} movement, you have ${maxMovement}`,
            reason: 'insufficient_movement',
            path: path,
            cost: movementCost
        };
    }
    
    // Valid movement!
    return {
        valid: true,
        path: path,
        cost: movementCost,
        movementRemaining: maxMovement - movementCost,
        targetTerrain: getTerrainType(targetPosition)
    };
}

/**
 * Get terrain type at coordinate
 */
function getTerrainType(coord, map) {
    if (map.terrain.river && map.terrain.river.includes(coord)) {
        // Check if it's a ford
        if (map.terrain.fords && map.terrain.fords.some(f => f.coord === coord)) {
            return 'ford';
        }
        return 'river';
    }
    if (map.terrain.hill && map.terrain.hill.includes(coord)) return 'hill';
    if (map.terrain.marsh && map.terrain.marsh.includes(coord)) return 'marsh';
    if (map.terrain.road && map.terrain.road.includes(coord)) return 'road';
    if (map.terrain.forest && map.terrain.forest.includes(coord)) return 'forest';
    return 'plains';
}

/**
 * Execute movement and update unit position
 * @param {Object} unit - Unit to move
 * @param {Object} movementResult - Validated movement from validateMovement
 * @returns {Object} Updated unit
 */
function executeMovement(unit, movementResult) {
    if (!movementResult.valid) {
        throw new Error('Cannot execute invalid movement');
    }
    
    return {
        ...unit,
        position: movementResult.finalPosition,
        movementRemaining: movementResult.movementRemaining,
        hasMoved: true,
        movementPath: movementResult.path
    };
}

/**
 * Parse natural language movement order to target coordinate
 * This is a placeholder for AI integration
 * @param {string} order - Natural language order
 * @param {Object} unit - Unit receiving order
 * @param {Object} map - Map data
 * @returns {Object} Parsed movement intent
 */
function parseMovementOrder(order, unit, map) {
    const lowerOrder = order.toLowerCase();
    
    // Simple keyword parsing (will be replaced by AI)
    // Check for explicit coordinates
    const coordMatch = order.match(/([A-O]\d+)/i);
    if (coordMatch) {
        return {
            targetCoord: coordMatch[1].toUpperCase(),
            intent: 'move_to_coordinate',
            modifiers: extractModifiers(order)
        };
    }
    
    // Check for named locations
    if (lowerOrder.includes('ford')) {
        // Default to nearest ford
        return {
            targetCoord: 'F11', // Will be improved with AI
            intent: 'move_to_ford',
            modifiers: extractModifiers(order)
        };
    }
    
    if (lowerOrder.includes('hill')) {
        return {
            targetCoord: 'B5',
            intent: 'move_to_hill',
            modifiers: extractModifiers(order)
        };
    }
    
    // Directional movement
    const direction = extractDirection(order);
    if (direction) {
        const targetCoord = calculateDirectionalMove(unit.position, direction, unit.maxMovement || 3);
        return {
            targetCoord,
            intent: 'move_direction',
            direction,
            modifiers: extractModifiers(order)
        };
    }
    
    // Default: hold position
    return {
        targetCoord: unit.position,
        intent: 'hold_position',
        modifiers: extractModifiers(order)
    };
}

/**
 * Extract movement modifiers from order
 */
function extractModifiers(order) {
    const modifiers = {};
    const lower = order.toLowerCase();
    
    if (lower.includes('cautious') || lower.includes('carefully')) {
        modifiers.cautious = true;
        modifiers.speedMultiplier = 0.5;
        modifiers.defenseBonus = +1;
    }
    
    if (lower.includes('forced march') || lower.includes('quickly')) {
        modifiers.forcedMarch = true;
        modifiers.speedMultiplier = 1.5;
        modifiers.fatigueNextTurn = -1;
    }
    
    if (lower.includes('stealth') || lower.includes('quietly')) {
        modifiers.stealth = true;
        modifiers.speedMultiplier = 0.7;
        modifiers.detectionPenalty = -2; // Harder for enemy to detect
    }
    
    return modifiers;
}

/**
 * Extract direction from order
 */
function extractDirection(order) {
    const lower = order.toLowerCase();
    
    if (lower.includes('north')) return 'north';
    if (lower.includes('south')) return 'south';
    if (lower.includes('east')) return 'east';
    if (lower.includes('west')) return 'west';
    if (lower.includes('northeast')) return 'northeast';
    if (lower.includes('northwest')) return 'northwest';
    if (lower.includes('southeast')) return 'southeast';
    if (lower.includes('southwest')) return 'southwest';
    
    return null;
}

/**
 * Calculate target coordinate from direction and distance
 */
function calculateDirectionalMove(fromCoord, direction, distance) {
    const pos = parseCoord(fromCoord);
    
    const directionVectors = {
        north: { row: -1, col: 0 },
        south: { row: +1, col: 0 },
        east: { row: 0, col: +1 },
        west: { row: 0, col: -1 },
        northeast: { row: -1, col: +1 },
        northwest: { row: -1, col: -1 },
        southeast: { row: +1, col: +1 },
        southwest: { row: +1, col: -1 }
    };
    
    const vector = directionVectors[direction];
    const newRow = Math.max(0, Math.min(14, pos.row + vector.row * distance));
    const newCol = Math.max(0, Math.min(14, pos.col + vector.col * distance));
    
    return coordToString({ row: newRow, col: newCol });
}

/**
 * Check for unit collisions at target position
 * @param {string} targetCoord - Target position
 * @param {Array} allUnits - All units on map
 * @param {string} movingUnitId - ID of unit trying to move
 * @returns {Object} Collision result
 */
function checkCollision(targetCoord, allUnits, movingUnitId) {
    const unitsAtTarget = allUnits.filter(u => 
        u.position === targetCoord && u.unitId !== movingUnitId
    );
    
    if (unitsAtTarget.length === 0) {
        return { collision: false };
    }
    
    // Friendly unit collision
    if (unitsAtTarget.some(u => u.side === 'friendly')) {
        return {
            collision: true,
            type: 'friendly',
            message: 'Position occupied by friendly unit',
            canStack: true // Allow stacking friendlies (up to 3)
        };
    }
    
    // Enemy unit collision = combat trigger
    return {
        collision: true,
        type: 'enemy',
        message: 'Enemy unit detected at target position',
        triggersCombat: true,
        enemyUnits: unitsAtTarget
    };
}

/**
 * Apply movement modifiers from terrain and order
 */
function applyMovementModifiers(baseMovement, terrain, modifiers = {}) {
    let effectiveMovement = baseMovement;
    
    // Speed modifiers from orders
    if (modifiers.speedMultiplier) {
        effectiveMovement *= modifiers.speedMultiplier;
    }
    
    // Terrain penalties
    const terrainPenalties = {
        marsh: 0.33,  // Very slow
        forest: 0.5,  // Half speed
        hill: 0.66,   // Slower uphill
        road: 2.0     // Double speed on roads
    };
    
    if (terrainPenalties[terrain]) {
        effectiveMovement *= terrainPenalties[terrain];
    }
    
    return Math.floor(effectiveMovement);
}

// Import coordToString
const { coordToString } = require('./maps/mapUtils');

module.exports = {
    validateMovement,
    executeMovement,
    parseMovementOrder,
    checkCollision,
    applyMovementModifiers,
    getTerrainType
};