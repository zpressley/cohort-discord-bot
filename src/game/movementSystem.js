// src/game/movementSystem.js - COMPLETE FILE WITH MISSIONS
// Movement validation, execution, and mission tracking

const { findPathAStar, calculateDistance, coordToString, parseCoord } = require('./maps/mapUtils');

/**
 * Validate movement with partial movement support
 */
function validateMovement(unit, targetPosition, map) {
    // Use generic terrain getter bound to the current map
    const getTerrainTypeBound = (coord) => getTerrainType(coord, map);
    
    // Find path using A* pathfinding
    const pathResult = findPathAStar(
        unit.position,
        targetPosition,
        map,
        getTerrainTypeBound
    );
    
    if (!pathResult.valid) {
        return {
            valid: false,
            error: 'No valid path to target',
            reason: pathResult.reason || 'River or impassable terrain blocks the way'
        };
    }
    
    const fullPath = pathResult.path;
    const fullCost = pathResult.cost;
    const maxMovement = unit.movementRemaining || (unit.mounted ? 5 : 3);
    
    // If target too far, move as far as possible along path
    if (fullCost > maxMovement) {
        let reachableIndex = 1;
        let costSoFar = 0;
        
        for (let i = 1; i < fullPath.length; i++) {
            const stepCost = 1; // Simplified
            costSoFar += stepCost;
            
            if (costSoFar <= maxMovement) {
                reachableIndex = i;
            } else {
                break;
            }
        }
        
        const partialPath = fullPath.slice(0, reachableIndex + 1);
        const reachablePosition = fullPath[reachableIndex];
        
        return {
            valid: true,
            path: partialPath,
            cost: maxMovement,
            movementRemaining: 0,
            targetTerrain: getTerrainTypeBound(reachablePosition),
            partialMovement: true,
            finalPosition: reachablePosition,
            originalTarget: targetPosition,
            message: `Moving toward ${targetPosition}, reached ${reachablePosition}`
        };
    }
    
    // Target reachable in one turn
        return {
            valid: true,
            path: fullPath,
            cost: fullCost,
            movementRemaining: maxMovement - fullCost,
            targetTerrain: getTerrainTypeBound(targetPosition),
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
    const maxMovement = unit.movementRemaining || (unit.mounted ? 5 : 3);
    
    let reachableIndex = 1;
    let costSoFar = 0;
    
    for (let i = 1; i < fullPath.length; i++) {
        const stepCost = 1;
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