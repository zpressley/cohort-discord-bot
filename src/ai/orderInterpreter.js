// src/ai/orderInterpreter.js
// AI-powered natural language order interpretation

const { validateMovement } = require('../game/movementSystem');
const { parseCoord } = require('../game/maps/mapUtils');
const { calculateDistance } = require('../game/maps/mapUtils');

/**
 * Interpret player orders using AI and validate against game rules
 * @param {string} orderText - Natural language order from player
 * @param {Object} battleState - Current battle state
 * @param {string} playerSide - 'player1' or 'player2'
 * @param {Object} map - Map data for validation
 * @returns {Object} Validated actions to execute
 */

async function interpretOrders(orderText, battleState, playerSide, map) {
    const playerUnits = battleState[playerSide].unitPositions || [];
    const { createMission, shouldContinueMission, executeMissionTurn, cancelMission } = require('../game/movementSystem');
    const { getTerrainAt: getTerrainType } = require('../game/maps/riverCrossing');
    
    const validatedActions = [];
    const errors = [];
    const missionReports = [];
    
    // FIRST: Check units with active missions
    for (const unit of playerUnits) {
        if (shouldContinueMission(unit, battleState)) {
            // Execute mission turn
            const missionAction = executeMissionTurn(unit, map, getTerrainType);
            
            if (missionAction.type === 'move') {
                // Validate the mission movement
                const validation = validateMovement(unit, missionAction.targetPosition, map);
                
                if (validation.valid) {
                    validatedActions.push({
                        type: 'move',
                        unitId: unit.unitId,
                        targetPosition: validation.finalPosition || missionAction.targetPosition,
                        validation: validation,
                        missionAction: true,
                        missionProgress: missionAction.missionProgress
                    });
                    
                    missionReports.push(missionAction.officerReport);
                }
            } else if (missionAction.type === 'mission_blocked') {
                errors.push({
                    unit: unit.unitId,
                    error: missionAction.officerReport,
                    reason: 'mission_blocked'
                });
            }
        }
    }
    
    // SECOND: Process new orders (only for units without active missions or new orders override)
    const context = {
        currentTurn: battleState.currentTurn,
        yourUnits: playerUnits,
        mapTerrain: map.terrain,
        movementRules: map.movementCosts,
        culture: battleState[playerSide].culture
    };
    
    const prompt = buildOrderInterpretationPrompt(orderText, context);
    const aiResponse = await callAIForOrderParsing(prompt);
    
    for (const action of aiResponse.actions) {
        if (action.type === 'move') {
            const unit = playerUnits.find(u => u.unitId === action.unitId);
            
            if (!unit) {
                errors.push(`Unit ${action.unitId} not found`);
                continue;
            }
            
            // If unit has active mission, this new order cancels it
            if (unit.activeMission) {
                const cancellation = cancelMission(unit, orderText);
                missionReports.push(cancellation.officerConfirmation);
                // Update unit to remove mission
                unit.activeMission = null;
            }
            
            const validation = validateMovement(unit, action.targetPosition, map);
            
            if (validation.valid) {
                // Check if this creates a new mission (partial movement)
                const newMission = validation.partialMovement 
                    ? createMission(unit, action.targetPosition, battleState.currentTurn)
                    : null;
                
                validatedActions.push({
                    ...action,
                    validation,
                    unitId: unit.unitId,
                    newMission: newMission,
                    finalPosition: validation.finalPosition || action.targetPosition
                });
                
                if (newMission) {
                    missionReports.push(
                        `${unit.unitId} begins mission to ${action.targetPosition}. ` +
                        `Estimated ${Math.ceil(validation.cost / (unit.mounted ? 5 : 3))} turns to arrival.`
                    );
                }
            } else {
                errors.push({
                    unit: unit.unitId,
                    error: validation.error,
                    reason: validation.reason
                });
            }
        }
        
        if (action.type === 'formation') {
            validatedActions.push(action);
        }
        
        if (action.type === 'scout') {
            validatedActions.push(action);
        }
    }
    
    return {
        validatedActions,
        errors,
        missionReports,
        officerComment: aiResponse.officerComment || generateDefaultComment(context.culture),
        rawAIResponse: aiResponse
    };
}

/**
 * Build AI prompt for order interpretation
 */
function buildOrderInterpretationPrompt(orderText, context) {
    return `You are a tactical AI for an ancient warfare game. Parse the player's order into game actions.

**PLAYER ORDER:** "${orderText}"

**CURRENT SITUATION:**
- Turn: ${context.currentTurn}
- Culture: ${context.culture}
- Your Units: ${JSON.stringify(context.yourUnits.map(u => ({
    id: u.unitId,
    type: u.unitType,
    position: u.position,
    strength: u.currentStrength,
    movementRange: u.movementRemaining
})))}

**MAP INFORMATION:**
- Size: 15x15 grid (A1 to O15)
- Terrain: River runs diagonally, fords at F11 and H11
- Hill at B5-C6 region
- Marsh at southeast corner (M-O, 13-15)
- Road runs vertically through H column

**MOVEMENT RULES:**
- Plains: 1 move per tile
- Road: 0.5 move (2x speed)
- Hill: 1.5 move (slower)
- Forest: 2 moves
- Marsh: 3 moves (very slow)
- River: Cannot cross except at fords (F11, H11)

**YOUR TASK:**
Parse the order into specific game actions. Return JSON only:

{
  "actions": [
    {
      "type": "move",
      "unitId": "player1_unit_0",
      "currentPosition": "M9",
      "targetPosition": "H11",
      "reasoning": "Advancing to northern ford as ordered"
    }
  ],
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": ["Moving through marsh will be slow"]
  },
  "officerComment": "Centurion Marcus: Understood, sir. Advancing to the ford."
}

**CRITICAL RULES:**
- DO NOT invent enemy positions
- DO NOT assume movement succeeds (I will validate)
- DO NOT exceed unit movement ranges
- Match the cultural officer personality (Roman=professional, Celtic=bold, etc.)
- Keep officer comment to 1-2 sentences

Return ONLY valid JSON, no other text.`;
}

/**
 * Call AI for order parsing (placeholder for real AI integration)
 */

async function callAIForOrderParsing(prompt) {
    const yourUnits = JSON.parse(prompt.match(/Your Units: (\[.*?\])/s)?.[1] || '[]');
    const orderText = prompt.match(/\*\*PLAYER ORDER:\*\* "(.*?)"/)?.[1] || '';
    
    if (yourUnits.length === 0) {
        return { actions: [], validation: { isValid: true, errors: [], warnings: [] }, officerComment: 'No units available.' };
    }
    
    const unit = yourUnits[0];
    const unitId = unit.id;
    const lowerOrder = orderText.toLowerCase();
    
    // FIRST: Check for explicit coordinates
    const coordMatch = orderText.match(/\b([A-T]\d{1,2})\b/i);
    if (coordMatch) {
        const targetPosition = coordMatch[1].toUpperCase();
        return {
            actions: [{
                type: 'move',
                unitId: unit.id,
                currentPosition: unit.position,
                targetPosition: targetPosition,
                reasoning: `Moving to explicit coordinate ${targetPosition}`
            }],
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `Moving to ${targetPosition}.`
        };
    }
    
    let targetPosition = unit.position; // Default: hold position
    
    // SECOND: Check for named locations (before directional parsing!)
    if (lowerOrder.includes('ford')) {
        // Distinguish between different fords
        if (lowerOrder.includes('northern') || lowerOrder.includes('north ford')) {
            targetPosition = 'L3';  // Northern Crossing from your map
        } else if (lowerOrder.includes('southern') || lowerOrder.includes('south ford')) {
            targetPosition = 'I17';  // Southern Crossing from your map
        } else if (lowerOrder.includes('central') || lowerOrder.includes('bridge')) {
            targetPosition = 'J11';  // Central Bridge
        } else {
            // Default to closest ford (will improve with AI)
            targetPosition = 'J11';  // Central ford as default
        }
        
        return {
            actions: [{
                type: 'move',
                unitId: unitId,  // ← Use extracted unitId
                currentPosition: unit.position,
                targetPosition: targetPosition,
                reasoning: `Moving to ford at ${targetPosition}`
            }],
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `Advancing to the ford.`
        };
    }
    
    if (lowerOrder.includes('hill')) {
        targetPosition = 'H1';  // Hill from your map
        
        return {
            actions: [{
                type: 'move',
                unitId: unitId,  // ← Use extracted unitId
                currentPosition: unit.position,
                targetPosition: targetPosition,
                reasoning: `Moving to hill`
            }],
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `Advancing to high ground.`
        };
    }
    
    // THIRD: Parse cardinal directions (only if no named location found)
    if (lowerOrder.includes('south') && !lowerOrder.includes('southern')) {
        targetPosition = moveInDirection(unit.position, 'south', 3);
    } else if (lowerOrder.includes('north') && !lowerOrder.includes('northern')) {
        targetPosition = moveInDirection(unit.position, 'north', 3);
    } else if (lowerOrder.includes('east') && !lowerOrder.includes('eastern')) {
        targetPosition = moveInDirection(unit.position, 'east', 3);
    } else if (lowerOrder.includes('west') && !lowerOrder.includes('western')) {
        targetPosition = moveInDirection(unit.position, 'west', 3);
    }
    
    return {
        actions: [{
            type: 'move',
            unitId: unitId,  // ← Use extracted unitId
            currentPosition: unit.position,
            targetPosition: targetPosition,
            reasoning: `Moving toward ${targetPosition}`
        }],
        validation: {
            isValid: true,
            errors: [],
            warnings: []
        },
        officerComment: 'Orders acknowledged.'
    };
}

function moveInDirection(fromCoord, direction, distance) {
    const { parseCoord, coordToString } = require('../game/maps/mapUtils');
    const pos = parseCoord(fromCoord);
    
    const vectors = {
        north: { row: -distance, col: 0 },
        south: { row: +distance, col: 0 },
        east: { row: 0, col: +distance },
        west: { row: 0, col: -distance }
    };
    
    const vec = vectors[direction] || { row: 0, col: 0 };
    const newRow = Math.max(0, Math.min(14, pos.row + vec.row));
    const newCol = Math.max(0, Math.min(14, pos.col + vec.col));
    
    return coordToString({ row: newRow, col: newCol });
}

/**
 * Generate default officer comment by culture
 */
function generateDefaultComment(culture) {
    const comments = {
        'Roman Republic': 'Centurion Marcus: Orders received and understood, sir.',
        'Celtic': 'Brennus grins: Aye! The lads are ready!',
        'Spartan City-State': 'Lochagos: It shall be done.',
        'Han Dynasty': 'General bows: Your strategy is sound, Commander.',
        'Macedonian Kingdoms': 'Phalangarch: As you command.',
        'Sarmatian Confederations': 'Khan nods: The riders understand.',
        'Berber Confederations': 'Amghar: Swift as wind.',
        'Kingdom of Kush': 'Master Archer: By Amun, we obey.'
    };
    
    return comments[culture] || 'Orders acknowledged.';
}

/**
 * Detect if message is a question vs an order
 * @param {string} text - Player message
 * @returns {boolean} True if question
 */
function isQuestion(text) {
    const questionWords = ['where', 'what', 'when', 'who', 'how', 'why', 'can', 'should', 'could', 'would'];
    const lowerText = text.toLowerCase();
    
    // Check for question mark
    if (text.includes('?')) return true;
    
    // Check for question words at start
    const firstWord = lowerText.split(' ')[0];
    if (questionWords.includes(firstWord)) return true;
    
    // Check for "do you", "are you", etc.
    if (lowerText.match(/^(do|does|is|are|will|have|has)\s/)) return true;
    
    return false;
}

/**
 * Check for mission interruptions (enemy contact, blocked paths)
 * Called during mission execution in interpretOrders
 */
function checkMissionInterruptions(unit, missionAction, battleState, playerSide) {
    const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
    const enemyUnits = battleState[opponentSide].unitPositions || [];
    
    // Check for enemy contact along path
    const enemiesNearPath = enemyUnits.filter(enemy => {
        const distanceToUnit = calculateDistance(unit.position, enemy.position);
        return distanceToUnit <= 3; // Within detection range
    });
    
    if (enemiesNearPath.length > 0) {
        return {
            interrupted: true,
            reason: 'enemy_contact',
            enemyPositions: enemiesNearPath.map(e => e.position),
            contingencyCheck: checkContingencies(unit.activeMission, 'enemy_contact'),
            officerQuestion: generateEnemyContactQuestion(unit, enemiesNearPath, unit.activeMission.target)
        };
    }
    
    // Check if path is blocked
    if (missionAction.type === 'mission_blocked') {
        return {
            interrupted: true,
            reason: 'path_blocked',
            blockageReason: missionAction.reason,
            officerReport: missionAction.officerReport,
            requiresNewOrders: true
        };
    }
    
    return { interrupted: false };
}

/**
 * Check if mission has contingency for this situation
 */
function checkContingencies(mission, situationType) {
    if (!mission.contingencies || mission.contingencies.length === 0) {
        return { hasContingency: false };
    }
    
    // Check for matching contingency
    const contingency = mission.contingencies.find(c => 
        c.trigger === situationType || c.trigger === 'any_enemy'
    );
    
    if (contingency) {
        return {
            hasContingency: true,
            action: contingency.action,
            message: `Executing contingency: ${contingency.action}`
        };
    }
    
    return { hasContingency: false };
}

/**
 * Generate officer question for enemy contact
 */
function generateEnemyContactQuestion(unit, enemies, missionTarget) {
    const enemyCount = enemies.length;
    const enemyStrength = enemies.reduce((sum, e) => sum + (e.currentStrength || 100), 0);
    const ourStrength = unit.currentStrength || 100;
    const strengthRatio = enemyStrength / ourStrength;
    
    let tacticalAssessment = '';
    if (strengthRatio > 2) {
        tacticalAssessment = 'significantly outnumber us';
    } else if (strengthRatio > 1.3) {
        tacticalAssessment = 'have numerical advantage';
    } else if (strengthRatio < 0.7) {
        tacticalAssessment = 'appear weaker than us';
    } else {
        tacticalAssessment = 'seem evenly matched';
    }
    
    return {
        question: `Commander, enemy forces detected near ${missionTarget}. ` +
                 `Spotted ${enemyCount} unit${enemyCount > 1 ? 's' : ''} - they ${tacticalAssessment}. ` +
                 `Continue to ${missionTarget} or await new orders?`,
        situation: {
            enemyCount,
            estimatedStrength: enemyStrength,
            ourStrength,
            recommendedAction: strengthRatio > 1.5 ? 'withdraw' : strengthRatio < 0.8 ? 'engage' : 'request_orders'
        }
    };
}

/**
 * Process contingency action
 */
function executeContingency(unit, contingency, battleState, map) {
    const actions = {
        'retreat': () => {
            // Find safe position toward commander
            const commanderPos = findCommanderPosition(battleState, unit.side);
            return {
                type: 'move',
                targetPosition: commanderPos,
                reasoning: 'Contingency: Retreating from enemy contact'
            };
        },
        
        'report_and_hold': () => {
            return {
                type: 'hold',
                message: 'Contingency: Holding position, sending runner to report enemy contact',
                messengerSent: true
            };
        },
        
        'engage': () => {
            return {
                type: 'attack',
                reasoning: 'Contingency: Engaging enemy as ordered'
            };
        },
        
        'bypass': () => {
            // Try to find alternate route
            return {
                type: 'find_alternate_route',
                reasoning: 'Contingency: Seeking alternate path to avoid enemy'
            };
        }
    };
    
    const handler = actions[contingency.action];
    return handler ? handler() : { type: 'request_orders', reason: 'unknown_contingency' };
}

/**
 * Find commander position (placeholder - will use actual commander tracking)
 */
function findCommanderPosition(battleState, side) {
    // For now, assume commander with elite unit in deployment zone
    // Will be replaced with actual commander tracking in CMD-001
    const units = battleState[side].unitPositions || [];
    return units[0]?.position || 'A1';
}

module.exports = {
    interpretOrders,
    buildOrderInterpretationPrompt,
    isQuestion,
    generateDefaultComment,
    checkMissionInterruptions,  // New
    executeContingency  // New
};
