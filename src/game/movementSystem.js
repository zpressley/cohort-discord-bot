// src/game/movementSystem.js - COMPLETE FILE WITH MISSIONS
// Movement validation, execution, and mission tracking

const { findPathAStar, calculateDistance, coordToString, parseCoord } = require('./maps/mapUtils');

/**
 * Validate movement with partial movement support
 */
function validateMovement(unit, targetPosition, map) {
    const { getTerrainAt: getTerrainType } = require('./maps/riverCrossing');
    
    const weather = map.weather || 'clear';
    const weatherFactors = {
        clear: 1.0,
        overcast: 1.0,
        light_rain: 1.1,
        heavy_rain: 1.25,
        fog: 1.0,
        snow: 1.25,
        sandstorm: 1.2,
        thunderstorm: 1.15
    };
    const weatherFactor = weatherFactors[weather] || 1.0;

    const { calculateOccupiedTiles } = require('./formations/formationStatus');
    
    // Base movement rates per turn in tiles (25m/tile). These replace the
    // previous implicit 3/5 tile assumptions from the 50m grid.
    const BASE_MOVEMENT_RATES = {
        infantry: 6,  // 150m/turn
        cavalry: 10   // 250m/turn (scouts can be treated as fast cavalry)
    };
    
    // Find path using A* pathfinding (terrain-based costs only)
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
    
    const fullPath = pathResult.path;
    const fullCost = pathResult.cost * weatherFactor;
    const baseRate = unit.mounted ? BASE_MOVEMENT_RATES.cavalry : BASE_MOVEMENT_RATES.infantry;

    // Marching units move 50% faster (handled as a simple multiplier here)
    const isMarching = (unit.formationStatus || 'deployed') === 'marching';
    const movementBonus = isMarching ? 1.5 : 1.0;

    const maxMovement = (unit.movementRemaining || baseRate) * movementBonus;
    
    // If target too far, move as far as possible along path
    if (fullCost > maxMovement) {
        let reachableIndex = 1;
        let costSoFar = 0;
        
        for (let i = 1; i < fullPath.length; i++) {
            const stepCost = 1 * weatherFactor; // Weather slows or speeds effective progress
            costSoFar += stepCost;
            
            if (costSoFar <= maxMovement) {
                reachableIndex = i;
            } else {
                break;
            }
        }
        
        const partialPath = fullPath.slice(0, reachableIndex + 1);
        const reachablePosition = fullPath[reachableIndex];

        // For marching units, ensure the column (depth based on strength) can
        // occupy the reachable tile; otherwise, fall back to the last tile that
        // kept the entire column on-map.
        let finalReachable = reachablePosition;
        if (isMarching) {
            for (let i = reachableIndex; i >= 1; i--) {
                const testFront = fullPath[i];
                const virtual = { ...unit, position: testFront };
                const occupied = calculateOccupiedTiles(virtual);
                // Basic map bounds check for all column tiles
                const allOnMap = occupied.every(c => {
                    try {
                        const p = parseCoord(c);
                        return p.row >= 0 && p.row < 40 && p.col >= 0 && p.col < 40;
                    } catch {
                        return false;
                    }
                });
                if (allOnMap) {
                    finalReachable = testFront;
                    break;
                }
            }
        }
        
        return {
            valid: true,
            path: partialPath,
            cost: maxMovement,
            movementRemaining: 0,
            targetTerrain: getTerrainType(finalReachable),
            partialMovement: true,
            finalPosition: finalReachable,
            originalTarget: targetPosition,
            message: `Moving toward ${targetPosition}, reached ${finalReachable}`
        };
    }
    
    // Target reachable in one turn
    return {
        valid: true,
        path: fullPath,
        cost: fullCost,
        movementRemaining: maxMovement - fullCost,
        targetTerrain: getTerrainType(targetPosition),
        finalPosition: targetPosition,
        partialMovement: false
    };
}

/**
 * Create mission from movement order
 */
function createMission(unit, targetPosition, currentTurn, contingencies = []) {
    return {
        type: 'move_to_destination',
        target: targetPosition,
        startTurn: currentTurn,
        status: 'active',
        contingencies: contingencies,
        progress: {
            startPosition: unit.position,
            lastReportTurn: currentTurn
        }
    };
}

/**
 * Check if unit should continue mission
 */
function shouldContinueMission(unit, battleState) {
    if (!unit.activeMission) return false;
    if (unit.activeMission.status !== 'active') return false;
    if (unit.position === unit.activeMission.target) return false;
    return true;
}

/**
 * Execute mission turn - move toward destination
 */
function executeMissionTurn(unit, map, getTerrainType) {
    const mission = unit.activeMission;
    
    const pathResult = findPathAStar(
        unit.position,
        mission.target,
        map,
        getTerrainType
    );
    
    if (!pathResult.valid) {
        return {
            type: 'mission_blocked',
            missionTarget: mission.target,
            reason: pathResult.reason,
            action: 'request_new_orders',
            officerReport: `Commander, cannot reach ${mission.target}. ${pathResult.reason}`
        };
    }
    
    const fullPath = pathResult.path;
    const baseRate = unit.mounted ? BASE_MOVEMENT_RATES.cavalry : BASE_MOVEMENT_RATES.infantry;
    const maxMovement = unit.movementRemaining || baseRate;
    
    let reachableIndex = 1;
    let costSoFar = 0;
    
    for (let i = 1; i < fullPath.length; i++) {
        const stepCost = 1; // Missions currently ignore weather for simplicity
        costSoFar += stepCost;
        
        if (costSoFar <= maxMovement) {
            reachableIndex = i;
        } else {
            break;
        }
    }
    
    const reachedPosition = fullPath[reachableIndex];
    const remainingDistance = fullPath.length - reachableIndex - 1;
    const missionComplete = reachedPosition === mission.target;
    
    return {
        type: 'move',
        unitId: unit.unitId,
        targetPosition: reachedPosition,
        missionContinues: !missionComplete,
        missionProgress: {
            target: mission.target,
            current: reachedPosition,
            remaining: remainingDistance,
            complete: missionComplete
        },
        officerReport: missionComplete 
            ? `${mission.target} reached, sir. Holding position.`
            : `Advancing to ${mission.target}, ${remainingDistance} tiles remaining.`
    };
}

/**
 * Complete mission
 */
function completeMission(unit, reason = 'destination_reached') {
    return {
        ...unit,
        activeMission: {
            ...unit.activeMission,
            status: 'complete',
            completionReason: reason
        }
    };
}

/**
 * Cancel mission
 */
function cancelMission(unit, newOrder) {
    const mission = unit.activeMission;
    
    return {
        canceled: true,
        previousTarget: mission.target,
        officerConfirmation: `Canceling advance to ${mission.target}. New orders: "${newOrder}"`,
        updatedUnit: {
            ...unit,
            activeMission: null
        }
    };
}

function getTerrainType(coord, map) {
    if (map.terrain.river && map.terrain.river.includes(coord)) {
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

module.exports = {
    validateMovement,
    getTerrainType,
    createMission,
    shouldContinueMission,
    executeMissionTurn,
    completeMission,
    cancelMission
};