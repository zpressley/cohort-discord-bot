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
 * Determine which units an order targets
 * @param {string} orderText - The order string
 * @param {Array} yourUnits - All available units
 * @returns {Array} Filtered units
 */
function determineTargetUnits(orderText, yourUnits) {
    const lowerOrder = orderText.toLowerCase();
    
    console.log(`  👥 Targeting: `, { end: '' });
    
    // Check for "all units" keyword
    if (lowerOrder.includes('all units') || lowerOrder.includes('everyone')) {
        console.log('ALL units');
        return yourUnits;
    }
    
    // Check for cavalry/mounted keyword
    if (lowerOrder.includes('cavalry') || lowerOrder.includes('horse')) {
        const cavalry = yourUnits.filter(u => u.mounted === true);
        console.log(`Cavalry (${cavalry.length} units)`);
        return cavalry.length > 0 ? cavalry : yourUnits;
    }
    
    // Check for infantry keyword
    if (lowerOrder.includes('infantry') || lowerOrder.includes('foot')) {
        const infantry = yourUnits.filter(u => !u.mounted);
        console.log(`Infantry (${infantry.length} units)`);
        return infantry.length > 0 ? infantry : yourUnits;
    }
    
    // Check for position-based "unit at X"
    const posMatch = orderText.match(/unit at ([A-T]\d{1,2})/i);
    if (posMatch) {
        const pos = posMatch[1].toUpperCase();
        const filtered = yourUnits.filter(u => u.position.toUpperCase() === pos);
        console.log(`Unit at ${pos}`);
        return filtered.length > 0 ? filtered : yourUnits;
    }
    
    // Check for "northern/southern/eastern/western unit"
    if (lowerOrder.includes('northern unit') || lowerOrder.includes('northernmost')) {
        // Find unit with LOWEST row number (northernmost)
        const { parseCoord } = require('../game/maps/mapUtils');
        const northernmost = yourUnits.reduce((north, u) => {
            const uCoord = parseCoord(u.position);
            const nCoord = parseCoord(north.position);
            return uCoord.row < nCoord.row ? u : north;
        });
        console.log(`Northern unit (${northernmost.id})`);
        return [northernmost];
    }
    
    if (lowerOrder.includes('southern unit') || lowerOrder.includes('southernmost')) {
        // Find unit with HIGHEST row number (southernmost)
        const { parseCoord } = require('../game/maps/mapUtils');
        const southernmost = yourUnits.reduce((south, u) => {
            const uCoord = parseCoord(u.position);
            const sCoord = parseCoord(south.position);
            return uCoord.row > sCoord.row ? u : south;
        });
        console.log(`Southern unit (${southernmost.id})`);
        return [southernmost];
    }
    
    // Default: first unit only
    console.log('Default (first unit)');
    return [yourUnits[0]];
}

/**
 * Enhanced callAIForOrderParsing - handles multiple units, position filters, and overrides
 */
async function callAIForOrderParsing(prompt) {
    const yourUnits = JSON.parse(prompt.match(/Your Units: (\[.*?\])/s)?.[1] || '[]');
    const orderText = prompt.match(/\*\*PLAYER ORDER:\*\* "(.*?)"/)?.[1] || '';
    
    console.log('  🔍 Parsing order:', orderText);
    
    if (yourUnits.length === 0) {
        return { 
            actions: [], 
            validation: { isValid: true, errors: [], warnings: [] }, 
            officerComment: 'No units available.' 
        };
    }
    
    const lowerOrder = orderText.toLowerCase().trim();
    
    // Determine which units this order targets
    let targetUnits = determineTargetUnits(orderText, yourUnits);
    
    // Check for overrides (e.g., "all units move south, northern unit hold")
    const overrideMatch = orderText.match(/,\s*(.+?)\s+(hold|stay|wait)/i);
    if (overrideMatch && targetUnits.length > 1) {
        const overridePhrase = overrideMatch[1].toLowerCase();
        console.log(`  🚫 Override detected: "${overridePhrase} ${overrideMatch[2]}"`);
        
        // Determine which unit to EXCLUDE from the main order
        let excludeUnit = null;
        
        if (overridePhrase.includes('northern')) {
            const { parseCoord } = require('../game/maps/mapUtils');
            excludeUnit = targetUnits.reduce((north, u) => {
                const uCoord = parseCoord(u.position);
                const nCoord = parseCoord(north.position);
                return uCoord.row < nCoord.row ? u : north;
            });
        } else if (overridePhrase.includes('southern')) {
            const { parseCoord } = require('../game/maps/mapUtils');
            excludeUnit = targetUnits.reduce((south, u) => {
                const uCoord = parseCoord(u.position);
                const sCoord = parseCoord(south.position);
                return uCoord.row > sCoord.row ? u : south;
            });
        }
        
        if (excludeUnit) {
            console.log(`    Excluding ${excludeUnit.id} from movement`);
            targetUnits = targetUnits.filter(u => u.id !== excludeUnit.id);
        }
    }
    
    // Check for mission continuation (applies to units with active missions)
    const continueKeywords = ['continue', 'resume', 'proceed', 'carry on'];
    const hasContinue = continueKeywords.some(keyword => lowerOrder.includes(keyword));
    
    if (hasContinue || lowerOrder === 'yes' || lowerOrder === 'proceed') {
        console.log('  🔄 Mission continuation command detected');
        
        // Create continue_mission actions for each targeted unit
        const actions = targetUnits.map(unit => ({
            type: 'continue_mission',
            unitId: unit.id,
            currentPosition: unit.position,
            reasoning: 'Commander orders mission continuation'
        }));
        
        return {
            actions,
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `${targetUnits.length} unit(s) resuming mission.`
        };
    }
    
    // Check for position-filtered orders (e.g., "unit at F5 move to M5")
    const positionFilter = orderText.match(/unit at ([A-T]\d{1,2})/i);
    
    if (positionFilter) {
        const filterPos = positionFilter[1].toUpperCase();
        console.log(`  📍 Position filter detected: ${filterPos}`);
        
        // Find the unit at this position
        const filteredUnit = yourUnits.find(u => u.position.toUpperCase() === filterPos);
        
        if (!filteredUnit) {
            return {
                actions: [],
                validation: { isValid: false, errors: [`No unit found at ${filterPos}`], warnings: [] },
                officerComment: `No unit at position ${filterPos}.`
            };
        }
        
        // Look for destination AFTER the filter phrase
        const afterFilter = orderText.substring(
            orderText.indexOf(positionFilter[0]) + positionFilter[0].length
        );
        
        let targetPosition = null;
        
        // Check for coordinate after filter
        const destMatch = afterFilter.match(/\b([A-T]\d{1,2})\b/i);
        if (destMatch) {
            targetPosition = destMatch[1].toUpperCase();
            console.log(`  🎯 Destination found: ${targetPosition}`);
        } else {
            // Check for direction after filter
            const afterLower = afterFilter.toLowerCase();
            if (afterLower.includes('east')) targetPosition = moveInDirection(filterPos, 'east', 3);
            else if (afterLower.includes('west')) targetPosition = moveInDirection(filterPos, 'west', 3);
            else if (afterLower.includes('north')) targetPosition = moveInDirection(filterPos, 'north', 3);
            else if (afterLower.includes('south')) targetPosition = moveInDirection(filterPos, 'south', 3);
            else {
                // No clear destination - hold position
                targetPosition = filterPos;
            }
        }
        
        return {
            actions: [{
                type: 'move',
                unitId: filteredUnit.id,
                currentPosition: filteredUnit.position,
                targetPosition: targetPosition,
                reasoning: `Unit at ${filterPos} moving to ${targetPosition}`
            }],
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `Unit moving from ${filterPos} to ${targetPosition}.`
        };
    }
    
    // Check for explicit coordinates (no position filter)
    const coordMatch = orderText.match(/\b([A-T]\d{1,2})\b/i);
    if (coordMatch) {
        const targetPosition = coordMatch[1].toUpperCase();
        
        // Create move actions for all targeted units
        const actions = targetUnits.map(unit => ({
            type: 'move',
            unitId: unit.id,
            currentPosition: unit.position,
            targetPosition: targetPosition,
            reasoning: `Moving to explicit coordinate ${targetPosition}`
        }));
        
        return {
            actions,
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `${targetUnits.length} unit(s) moving to ${targetPosition}.`
        };
    }
    
    // Direction-based movement
    let direction = null;
    if (lowerOrder.includes('south')) direction = 'south';
    else if (lowerOrder.includes('north')) direction = 'north';
    else if (lowerOrder.includes('east')) direction = 'east';
    else if (lowerOrder.includes('west')) direction = 'west';
    
    if (direction) {
        const actions = targetUnits.map(unit => ({
            type: 'move',
            unitId: unit.id,
            currentPosition: unit.position,
            targetPosition: moveInDirection(unit.position, direction, 3),
            reasoning: `Moving ${direction}`
        }));
        
        return {
            actions,
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `${targetUnits.length} unit(s) advancing ${direction}.`
        };
    }
    
    // Landmark-based
    let landmark = null;
    if (lowerOrder.includes('ford')) landmark = 'I11';
    if (lowerOrder.includes('hill')) landmark = 'B5';
    
    if (landmark) {
        const actions = targetUnits.map(unit => ({
            type: 'move',
            unitId: unit.id,
            currentPosition: unit.position,
            targetPosition: landmark,
            reasoning: 'Moving to landmark'
        }));
        
        return {
            actions,
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `${targetUnits.length} unit(s) moving to objective.`
        };
    }
    
    // Default: hold position
    const actions = targetUnits.map(unit => ({
        type: 'move',
        unitId: unit.id,
        currentPosition: unit.position,
        targetPosition: unit.position,
        reasoning: 'Holding position'
    }));
    
    return {
        actions,
        validation: { isValid: true, errors: [], warnings: [] },
        officerComment: 'Holding position.'
    };
}

function moveInDirection(fromCoord, direction, distance) {
    const { parseCoord, coordToString } = require('../game/maps/mapUtils');
    const pos = parseCoord(fromCoord);
    
    // GRID LAYOUT: A1 (top-left) to T20 (bottom-right)
    // Row numbers INCREASE going DOWN (south)
    // Column letters INCREASE going RIGHT (east)
    
    const vectors = {
        north: { row: -distance, col: 0 },   // UP = decrease row (K5 → K2)
        south: { row: +distance, col: 0 },   // DOWN = increase row (K2 → K5)  
        east: { row: 0, col: +distance },    // RIGHT = increase column (F5 → I5)
        west: { row: 0, col: -distance }     // LEFT = decrease column (I5 → F5)
    };
    
    const vec = vectors[direction] || { row: 0, col: 0 };
    
    // parseCoord returns {row: 0-19, col: 0-19}
    const newRow = Math.max(0, Math.min(19, pos.row + vec.row));
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

/**
 * Determine which units the order applies to
 * Handles: "all units", "cavalry", "unit at M4", "northern unit", etc.
 */
function determineTargetUnits(orderText, allUnits) {
    const lower = orderText.toLowerCase();
    
    // "all units" or "everyone" or "both"
    if (lower.includes('all units') || 
        lower.includes('all forces') ||
        lower.includes('everyone') || 
        lower.includes('both units')) {
        console.log('  👥 Targeting: ALL units');
        return allUnits;
    }
    
    // "unit at M4" - specific position
    const posMatch = orderText.match(/unit at ([A-T]\d{1,2})/i);
    if (posMatch) {
        const position = posMatch[1].toUpperCase();
        const unit = allUnits.find(u => u.position === position);
        console.log(`  👥 Targeting: Unit at ${position}`);
        return unit ? [unit] : [];
    }
    
    // "cavalry" or "mounted" - type-based
    if ((lower.includes('cavalry') || lower.includes('mounted')) && 
        !lower.includes('all')) {
        const cavalry = allUnits.filter(u => u.mounted === true);
        console.log(`  👥 Targeting: Cavalry (${cavalry.length} units)`);
        return cavalry.length > 0 ? cavalry : [allUnits[0]];
    }
    
    // "infantry" - type-based
    if (lower.includes('infantry') && !lower.includes('cavalry') && !lower.includes('all')) {
        const infantry = allUnits.filter(u => !u.mounted);
        console.log(`  👥 Targeting: Infantry (${infantry.length} units)`);
        return infantry.length > 0 ? infantry : [allUnits[0]];
    }
    
    // "northern unit" or "north forces"
    if (lower.includes('northern') || lower.includes('north unit')) {
        // Find northernmost unit (lowest row number)
        const sorted = [...allUnits].sort((a, b) => {
            const aRow = parseInt(a.position.match(/\d+/)[0]);
            const bRow = parseInt(b.position.match(/\d+/)[0]);
            return aRow - bRow;
        });
        console.log(`  👥 Targeting: Northern unit at ${sorted[0]?.position}`);
        return [sorted[0]];
    }
    
    // "southern unit" or "south forces"
    if (lower.includes('southern') || lower.includes('south unit')) {
        const sorted = [...allUnits].sort((a, b) => {
            const aRow = parseInt(a.position.match(/\d+/)[0]);
            const bRow = parseInt(b.position.match(/\d+/)[0]);
            return bRow - aRow;
        });
        console.log(`  👥 Targeting: Southern unit at ${sorted[0]?.position}`);
        return [sorted[0]];
    }
    
    // "first unit" or "second unit"
    if (lower.includes('first unit')) {
        console.log(`  👥 Targeting: First unit`);
        return [allUnits[0]];
    }
    if (lower.includes('second unit') && allUnits.length > 1) {
        console.log(`  👥 Targeting: Second unit`);
        return [allUnits[1]];
    }
    
    // "elite" or "commander" - elite unit only
    if (lower.includes('elite') || lower.includes('commander')) {
        const elite = allUnits.find(u => u.isElite || u.isCommander);
        console.log(`  👥 Targeting: Elite unit`);
        return elite ? [elite] : [allUnits[0]];
    }
    
    // Default: first unit only (backwards compatible)
    console.log(`  👥 Targeting: Default (first unit)`);
    return [allUnits[0]];
}

module.exports = {
    interpretOrders,
    checkMissionInterruption,
    buildOrderInterpretationPrompt,
    isQuestion,
    generateDefaultComment
};