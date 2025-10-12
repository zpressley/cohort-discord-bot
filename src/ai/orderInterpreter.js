// src/ai/orderInterpreter.js
// AI-powered natural language order interpretation with mission interruption

const { validateMovement } = require('../game/movementSystem');
const { parseCoord } = require('../game/maps/mapUtils');
const { calculateVisibility } = require('../game/fogOfWar');
const { calculateDistance } = require('../game/maps/mapUtils');

/**
 * Check if unit's active mission should be interrupted
 * Uses fog of war - unit only reacts to what it can SEE
 * 
 * @param {Object} unit - Unit with possible active mission
 * @param {Object} battleState - Current battle state  
 * @param {string} playerSide - 'player1' or 'player2'
 * @param {Object} map - Map with terrain data
 * @returns {Object} Interruption status and officer question if interrupted
 */
function checkMissionInterruption(unit, battleState, playerSide, map) {
    // No mission = no interruption
    if (!unit.activeMission || unit.activeMission.status !== 'active') {
        return { interrupted: false };
    }
    
    const enemySide = playerSide === 'player1' ? 'player2' : 'player1';
    const enemyUnits = battleState[enemySide].unitPositions || [];
    
    // Check what THIS UNIT can see (not entire army)
    const weather = battleState.weather || 'clear';
    const visibility = calculateVisibility(
        [unit], // Just this one unit's vision
        enemyUnits,
        map.terrain,
        weather // Pass weather for accurate vision
    );
    
    // Enemy spotted within detection range?
    if (visibility.totalEnemiesDetected > 0) {
        // Get closest identified or spotted enemy
        const nearestEnemy = visibility.intelligence.identified[0] || 
                            visibility.intelligence.detailed[0] ||
                            visibility.intelligence.spotted[0];
        
        if (!nearestEnemy) return { interrupted: false };
        
        const nearestEnemyPos = nearestEnemy.position;
        const distance = nearestEnemy.distance;
        
        // Interrupt if enemy within IDENTIFICATION range (can tell what it is)
        if (distance <= 5) {
            return {
                interrupted: true,
                reason: 'enemy_contact',
                enemyPosition: nearestEnemyPos,
                distance: distance,
                estimatedStrength: nearestEnemy.estimatedStrength || nearestEnemy.exactStrength || '~100',
                unitType: nearestEnemy.unitType || 'unknown',
                question: `Enemy ${nearestEnemy.unitType || 'forces'} spotted at ${nearestEnemyPos}, ${distance} tiles away. ` +
                         `Current mission to ${unit.activeMission.target} will bring us into contact. ` +
                         `Continue mission or await new orders?`,
                type: 'mission_interrupted_enemy',
                requiresResponse: true
            };
        }
    }
    
    return { interrupted: false };
}

/**
 * Interpret player orders using AI and validate against game rules
 * Checks for mission interruptions FIRST if order is "hold"
 * 
 * @param {string} orderText - Natural language order from player
 * @param {Object} battleState - Current battle state
 * @param {string} playerSide - 'player1' or 'player2'
 * @param {Object} map - Map data for validation
 * @returns {Object} Validated actions to execute
 */
async function interpretOrders(orderText, battleState, playerSide, map) {
    const playerUnits = battleState[playerSide].unitPositions || [];
    const playerArmy = battleState[playerSide].army || {};
    
    // STEP 1: If order is "hold", check for mission interruptions FIRST
    const interruptions = [];
    if (orderText.toLowerCase().trim() === 'hold') {
        for (const unit of playerUnits) {
            const check = checkMissionInterruption(unit, battleState, playerSide, map);
            if (check.interrupted) {
                interruptions.push({
                    unit: unit.unitId,
                    position: unit.position,
                    ...check
                });
            }
        }
        
        // If missions interrupted, return questions instead of executing
        if (interruptions.length > 0) {
            return {
                validatedActions: [], // Don't execute any actions
                errors: interruptions, // Show as questions in briefing
                missionInterruptions: interruptions,
                requiresPlayerDecision: true
            };
        }
    }
    
    // STEP 2: Normal order processing
    const context = {
        currentTurn: battleState.currentTurn,
        yourUnits: playerUnits,
        mapTerrain: map.terrain,
        movementRules: map.movementCosts,
        culture: battleState[playerSide].culture
    };
    
    const prompt = buildOrderInterpretationPrompt(orderText, context);
    const aiResponse = await callAIForOrderParsing(prompt);

    // Validate AI-suggested actions against rules
    const validatedActions = [];
    const errors = [];
    
    for (const action of aiResponse.actions) {
        // Handle mission continuation
        if (action.type === 'continue_mission') {
            const unit = playerUnits.find(u => u.unitId === action.unitId);
            
            if (!unit || !unit.activeMission) {
                errors.push({ 
                    unit: action.unitId, 
                    error: 'No active mission to continue',
                    reason: 'no_mission'
                });
                continue;
            }
            
            // Execute movement toward mission target
            const validation = validateMovement(unit, unit.activeMission.target, map);
            
            if (validation.valid) {
                validatedActions.push({
                    type: 'move',
                    unitId: unit.unitId,
                    currentPosition: unit.position,
                    targetPosition: unit.activeMission.target,
                    validation,
                    missionAction: true, // Flag this as mission continuation
                    finalPosition: validation.finalPosition || unit.activeMission.target,
                    reasoning: `Continuing mission to ${unit.activeMission.target}`
                });
            } else {
                errors.push({
                    unit: unit.unitId,
                    error: `Cannot continue mission: ${validation.error}`,
                    reason: validation.reason
                });
            }
            continue;
        }
        
        if (action.type === 'move') {
            const unit = playerUnits.find(u => u.unitId === action.unitId);
            
            if (!unit) {
                errors.push(`Unit ${action.unitId} not found`);
                continue;
            }
            
            const validation = validateMovement(unit, action.targetPosition, map);
            
            if (validation.valid) {
                // Create mission if partial movement (destination not reached)
                let newMission = null;
                if (validation.partialMovement && validation.originalTarget) {
                    newMission = {
                        type: 'move_to_destination',
                        target: validation.originalTarget,
                        startTurn: battleState.currentTurn,
                        status: 'active',
                        contingencies: [],
                        progress: { 
                            startPosition: unit.position, 
                            lastReportTurn: battleState.currentTurn 
                        }
                    };
                }
                
                validatedActions.push({
                    ...action,
                    validation,
                    unitId: unit.unitId,
                    newMission: newMission,
                    finalPosition: validation.finalPosition || action.targetPosition
                });
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
        missionInterruptions: interruptions, // Always include (empty if none)
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
- Size: 20x20 grid (A1 to T20)
- Terrain: River runs diagonally, fords at various points
- Hills, forests, marshes, roads

**MOVEMENT RULES:**
- Plains: 1 move per tile
- Road: 0.5 move (2x speed)
- Hill: 1.5 move (slower)
- Forest: 2 moves
- Marsh: 3 moves (very slow)
- River: Cannot cross except at fords

**YOUR TASK:**
Parse the order into specific game actions. Return JSON only:

{
  "actions": [
    {
      "type": "move",
      "unitId": "north_unit_0",
      "currentPosition": "M9",
      "targetPosition": "H11",
      "reasoning": "Advancing to northern ford as ordered"
    }
  ],
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": []
  },
  "officerComment": "Orders acknowledged."
}

**CRITICAL RULES:**
- DO NOT invent enemy positions
- DO NOT assume movement succeeds
- DO NOT exceed unit movement ranges
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
        return { 
            actions: [], 
            validation: { isValid: true, errors: [], warnings: [] }, 
            officerComment: 'No units available.' 
        };
    }
    
    const unit = yourUnits[0];
    const lowerOrder = orderText.toLowerCase();
    
    // Check for explicit coordinates (e.g., "move to N17")
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
    
    // Fallback to direction parsing
    let targetPosition = unit.position; // Default: hold position
    
    if (lowerOrder.includes('south')) targetPosition = moveInDirection(unit.position, 'south', 3);
    if (lowerOrder.includes('north')) targetPosition = moveInDirection(unit.position, 'north', 3);
    if (lowerOrder.includes('east')) targetPosition = moveInDirection(unit.position, 'east', 3);
    if (lowerOrder.includes('west')) targetPosition = moveInDirection(unit.position, 'west', 3);
    
    if (lowerOrder.includes('ford')) targetPosition = 'I11'; // Central ford
    if (lowerOrder.includes('hill')) targetPosition = 'B5';
    
    return {
        actions: [{
            type: 'move',
            unitId: unit.id,
            currentPosition: unit.position,
            targetPosition: targetPosition,
            reasoning: `Moving toward ${targetPosition}`
        }],
        validation: { isValid: true, errors: [], warnings: [] },
        officerComment: 'Orders acknowledged.'
    };
}

/**
 * Helper: Move coordinate in direction
 */
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
    const newRow = Math.max(0, Math.min(19, pos.row + vec.row)); // 20x20 grid
    const newCol = Math.max(0, Math.min(19, pos.col + vec.col));
    
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
 */
function isQuestion(text) {
    const questionWords = ['where', 'what', 'when', 'who', 'how', 'why', 'can', 'should', 'could', 'would'];
    const lowerText = text.toLowerCase();
    
    if (text.includes('?')) return true;
    
    const firstWord = lowerText.split(' ')[0];
    if (questionWords.includes(firstWord)) return true;
    
    if (lowerText.match(/^(do|does|is|are|will|have|has)\s/)) return true;
    
    return false;
}

module.exports = {
    interpretOrders,
    checkMissionInterruption,
    buildOrderInterpretationPrompt,
    isQuestion,
    generateDefaultComment
};