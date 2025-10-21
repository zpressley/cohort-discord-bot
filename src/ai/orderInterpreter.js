// src/ai/orderInterpreter.js
// AI-powered natural language order interpretation with mission interruption

const { validateMovement } = require('../game/movementSystem');
const { parseCoord } = require('../game/maps/mapUtils');
const { calculateVisibility } = require('../game/fogOfWar');
const { calculateDistance } = require('../game/maps/mapUtils');
const { 
    getCommanderStatus,
    resolveCommanderCapture
} = require('../game/commandSystem/commanderManager');

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
async function interpretOrders(orderText, battleState, playerSide, map, battleContext = null) {
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
        // Otherwise, treat HOLD as "no new orders" so mission continuation logic can run
        return {
            validatedActions: [],
            errors: [],
            missionInterruptions: interruptions,
            officerComment: 'No enemy detected. Maintaining discipline.'
        };
    }
    
    // STEP 2: Check for commander actions first (before AI parsing)
    if (battleContext) {
        const commanderContext = {
            battleId: battleContext.battleId,
            playerId: playerSide === 'player1' ? battleContext.player1Id : battleContext.player2Id
        };
        
        const commanderAction = await parseCommanderActions(orderText, battleState, playerSide, commanderContext);
        if (commanderAction) {
            return commanderAction;
        }
    }
    
    // STEP 3: Normal AI order processing
    const context = {
        currentTurn: battleState.currentTurn,
        yourUnits: playerUnits,
        mapTerrain: map.terrain,
        movementRules: map.movementCosts,
        culture: battleState[playerSide].culture
    };
    
  const prompt = buildOrderInterpretationPrompt(orderText, context);
  let aiResponse;
  const AI_ENABLED = (process.env.AI_ENABLED || 'false').toLowerCase() === 'true';
  if (AI_ENABLED) {
    aiResponse = await callAIForOrderParsing(prompt, playerUnits);
  } else {
    aiResponse = { actions: simpleKeywordActions(orderText, playerUnits, map) };
  }

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
 * @param {Array} yourUnits - All available units (from battle state, not prompt)
 * @returns {Array} Filtered units
 */
function determineTargetUnits(orderText, yourUnits) {
    const lowerOrder = orderText.toLowerCase();
    
    console.log(`  👥 Targeting: `, { end: '' });
    
    // Check for "all units" keyword
    if (lowerOrder.includes('all units') || 
        lowerOrder.includes('everyone') ||
        lowerOrder.match(/^units\s+/)) {  // MULTI-002: Recognize "units move to X"
        console.log('ALL units');
        return yourUnits;
    }
    
    // Check for cavalry/mounted keyword
    if (lowerOrder.includes('cavalry') || lowerOrder.includes('horse') || lowerOrder.includes('mounted')) {
        const cavalry = yourUnits.filter(u => u.mounted === true);
        console.log(`Cavalry (${cavalry.length} units)`);
        return cavalry.length > 0 ? cavalry : [yourUnits[0]];
    }
    
    // Check for infantry keyword
    if (lowerOrder.includes('infantry') || lowerOrder.includes('foot')) {
        const infantry = yourUnits.filter(u => u.mounted === false);
        console.log(`Infantry (${infantry.length} units)`);
        return infantry.length > 0 ? infantry : [yourUnits[0]];
    }
    
    // Check for position-based "unit at X"
    const posMatch = orderText.match(/unit at ([A-T]\d{1,2})/i);
    if (posMatch) {
        const pos = posMatch[1].toUpperCase();
        const filtered = yourUnits.filter(u => u.position.toUpperCase() === pos);
        console.log(`Unit at ${pos} (${filtered.length} found)`);
        return filtered.length > 0 ? filtered : yourUnits;
    }
    
    // Check for "northern/southern/eastern/western unit"
    if (lowerOrder.includes('northern unit') || lowerOrder.includes('northernmost')) {
        const northernmost = yourUnits.reduce((north, u) => {
            const uCoord = parseCoord(u.position);
            const nCoord = parseCoord(north.position);
            return uCoord.row < nCoord.row ? u : north;
        });
        console.log(`Northern unit (${northernmost.unitId})`);
        return [northernmost];
    }
    
    if (lowerOrder.includes('southern unit') || lowerOrder.includes('southernmost')) {
        const southernmost = yourUnits.reduce((south, u) => {
            const uCoord = parseCoord(u.position);
            const sCoord = parseCoord(south.position);
            return uCoord.row > sCoord.row ? u : south;
        });
        console.log(`Southern unit (${southernmost.unitId})`);
        return [southernmost];
    }
    
    if (lowerOrder.includes('western unit') || lowerOrder.includes('westernmost')) {
        const westernmost = yourUnits.reduce((west, u) => {
            const uCoord = parseCoord(u.position);
            const wCoord = parseCoord(west.position);
            return uCoord.col < wCoord.col ? u : west;
        });
        console.log(`Western unit (${westernmost.unitId})`);
        return [westernmost];
    }
    
    if (lowerOrder.includes('eastern unit') || lowerOrder.includes('easternmost')) {
        const easternmost = yourUnits.reduce((east, u) => {
            const uCoord = parseCoord(u.position);
            const eCoord = parseCoord(east.position);
            return uCoord.col > eCoord.col ? u : east;
        });
        console.log(`Eastern unit (${easternmost.unitId})`);
        return [easternmost];
    }
    
    // Default: first unit only
    console.log('Default (first unit)');
    return [yourUnits[0]];
}

/**
 * Split comma-separated orders into multiple discrete orders
 * Handles: "cavalry north, infantry east" → ["cavalry north", "infantry east"]
 * Preserves: "all units south, northern unit hold" (override pattern)
 */
function splitMultipleOrders(orderText) {
    if (!orderText.includes(',')) {
        return [orderText]; // Single order
    }
    
    // Detect override pattern: "all units X, [directional] unit [hold/stay/wait]"
    if (/,\s*\w+\s+unit\s+(hold|stay|wait)/i.test(orderText)) {
        return [orderText]; // Don't split, handle as override
    }
    
    // Detect delegation pattern: "[Name], take the [unit] and [command]"
    if (/\w+,\s+take\s+(?:the\s+)?[\w\s]+\s+and\s+[\w\s]+/i.test(orderText)) {
        return [orderText]; // Don't split, handle as delegation
    }
    
    // Split on commas
    return orderText.split(',').map(s => s.trim());
}

/**
 * Enhanced callAIForOrderParsing - handles multiple units and orders
 */
async function callAIForOrderParsing(prompt, realBattleUnits = null) {
    // Use real battle units if provided, otherwise parse from prompt
    const yourUnits = realBattleUnits || JSON.parse(prompt.match(/Your Units: (\[.*?\])/s)?.[1] || '[]');
    const orderText = prompt.match(/\*\*PLAYER ORDER:\*\* "(.*?)"/)?.[1] || '';
    
    console.log('  🔍 Parsing order:', orderText);
    
    if (yourUnits.length === 0) {
        return { 
            actions: [], 
            validation: { isValid: true, errors: [], warnings: [] }, 
            officerComment: 'No units available.' 
        };
    }
    
    // Check for multi-orders separated by commas
    const orders = splitMultipleOrders(orderText);
    
    if (orders.length > 1) {
        console.log(`  📋 Multi-order detected: ${orders.length} commands`);
        
        // Process each sub-order separately
        const allActions = [];
        for (const singleOrder of orders) {
            const singlePrompt = prompt.replace(orderText, singleOrder);
            const result = await callAIForOrderParsing(singlePrompt, realBattleUnits);
            allActions.push(...result.actions);
        }
        
        return {
            actions: allActions,
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `${allActions.length} unit(s) executing orders.`
        };
    }
    
    // Single order processing
    const lowerOrder = orderText.toLowerCase().trim();
    
    // Determine target units (pass actual battle units with mounted property)
    let targetUnits = determineTargetUnits(orderText, yourUnits);
    
    // Check for overrides (e.g., "all units move south, northern unit hold")
    const overrideMatch = orderText.match(/,\s*(\w+)\s+unit\s+(hold|stay|wait)/i);
    if (overrideMatch && targetUnits.length > 1) {
        const direction = overrideMatch[1].toLowerCase();
        console.log(`  🚫 Override: ${direction} unit to ${overrideMatch[2]}`);
        
        let excludeUnit = null;
        
        if (direction === 'northern' || direction === 'northernmost') {
            excludeUnit = targetUnits.reduce((n, u) => 
                parseCoord(u.position).row < parseCoord(n.position).row ? u : n
            );
        } else if (direction === 'southern' || direction === 'southernmost') {
            excludeUnit = targetUnits.reduce((s, u) => 
                parseCoord(u.position).row > parseCoord(s.position).row ? u : s
            );
        } else if (direction === 'western' || direction === 'westernmost') {
            excludeUnit = targetUnits.reduce((w, u) => 
                parseCoord(u.position).col < parseCoord(w.position).col ? u : w
            );
        } else if (direction === 'eastern' || direction === 'easternmost') {
            excludeUnit = targetUnits.reduce((e, u) => 
                parseCoord(u.position).col > parseCoord(e.position).col ? u : e
            );
        }
        
        if (excludeUnit) {
            console.log(`    Excluding ${excludeUnit.unitId}`);
            targetUnits = targetUnits.filter(u => u.unitId !== excludeUnit.unitId);
        }
    }
    
    
    // Check for explicit "hold" - return empty to let Phase 1.5 handle missions
    if (lowerOrder === 'hold' || lowerOrder === 'wait' || lowerOrder === 'stay') {
        return {
            actions: [],
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: 'Standing by.'
        };
    }
    
    // Check for mission continuation keywords
    const continueKeywords = ['continue', 'resume', 'proceed', 'carry on'];
    const hasContinue = continueKeywords.some(kw => lowerOrder.includes(kw));
    
    if (hasContinue || lowerOrder === 'yes') {
        console.log('  🔄 Mission continuation detected');
        
        const actions = targetUnits.map(unit => ({
            type: 'continue_mission',
            unitId: unit.unitId,
            currentPosition: unit.position,
            reasoning: 'Continuing mission as ordered'
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
        console.log(`  📍 Position filter: ${filterPos}`);
        
        // Find ALL units at this position (handles stacked units)
        const filteredUnits = targetUnits.filter(u => u.position.toUpperCase() === filterPos);
        
        if (filteredUnits.length === 0) {
            return {
                actions: [],
                validation: { isValid: false, errors: [`No unit at ${filterPos}`], warnings: [] },
                officerComment: `No unit found at ${filterPos}.`
            };
        }
        
        // Extract destination AFTER the position filter phrase
        const afterFilter = orderText.substring(
            orderText.indexOf(positionFilter[0]) + positionFilter[0].length
        );
        
        let targetPosition = null;
        
        // Look for coordinate after filter
        const destMatch = afterFilter.match(/\b([A-T]\d{1,2})\b/i);
        if (destMatch) {
            targetPosition = destMatch[1].toUpperCase();
            console.log(`  🎯 Destination: ${targetPosition}`);
        } else {
            // Check for direction after filter
            const afterLower = afterFilter.toLowerCase();
            if (afterLower.includes('north')) targetPosition = moveInDirection(filteredUnits[0].position, 'north', 3);
            else if (afterLower.includes('south')) targetPosition = moveInDirection(filteredUnits[0].position, 'south', 3);
            else if (afterLower.includes('east')) targetPosition = moveInDirection(filteredUnits[0].position, 'east', 3);
            else if (afterLower.includes('west')) targetPosition = moveInDirection(filteredUnits[0].position, 'west', 3);
            else targetPosition = filteredUnits[0].position;
        }
        
        // Create actions for ALL filtered units
        const actions = filteredUnits.map(unit => ({
            type: 'move',
            unitId: unit.unitId,
            currentPosition: unit.position,
            targetPosition: targetPosition,
            reasoning: `Unit at ${filterPos} → ${targetPosition}`
        }));
        
        return {
            actions,
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `${filteredUnits.length} unit(s) at ${filterPos} → ${targetPosition}.`
        };
    }
    
    // Check for explicit coordinates (no position filter)
    const coordMatch = orderText.match(/\b([A-T]\d{1,2})\b/i);
    if (coordMatch) {
        const targetPosition = coordMatch[1].toUpperCase();
        const isGroupMarch = /(march together|advance together|keep formation|move as one|group march)/i.test(orderText);
        
        const actions = targetUnits.map(unit => ({
            type: 'move',
            unitId: unit.unitId,
            currentPosition: unit.position,
            targetPosition: targetPosition,
            modifier: isGroupMarch ? { groupMarch: true } : undefined,
            reasoning: isGroupMarch ? `Group march to ${targetPosition}` : `Moving to ${targetPosition}`
        }));
        
        return {
            actions,
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `${targetUnits.length} unit(s) ${isGroupMarch ? 'march together' : '→'} ${targetPosition}.`
        };
    }
    
    // Direction-based movement
    let direction = null;
    if (lowerOrder.includes('south')) direction = 'south';
    else if (lowerOrder.includes('north')) direction = 'north';
    else if (lowerOrder.includes('east')) direction = 'east';
    else if (lowerOrder.includes('west')) direction = 'west';
    
    if (direction) {
        const isGroupMarch = /(march together|advance together|keep formation|move as one|group march)/i.test(orderText);
        const step = isGroupMarch ? 1 : 3;
        const actions = targetUnits.map(unit => ({
            type: 'move',
            unitId: unit.unitId,
            currentPosition: unit.position,
            targetPosition: moveInDirection(unit.position, direction, step),
            modifier: isGroupMarch ? { groupMarch: true } : undefined,
            reasoning: isGroupMarch ? `Group march ${direction}` : `Moving ${direction}`
        }));
        
        return {
            actions,
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: isGroupMarch ? `${targetUnits.length} unit(s) march ${direction} together.` : `${targetUnits.length} unit(s) → ${direction}.`
        };
    }
    
    // Landmark-based
    if (lowerOrder.includes('ford')) {
        const actions = targetUnits.map(unit => ({
            type: 'move',
            unitId: unit.unitId,
            currentPosition: unit.position,
            targetPosition: 'I11',
            reasoning: 'Moving to ford'
        }));
        
        return {
            actions,
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `${targetUnits.length} unit(s) → ford.`
        };
    }
    
    if (lowerOrder.includes('hill')) {
        const actions = targetUnits.map(unit => ({
            type: 'move',
            unitId: unit.unitId,
            currentPosition: unit.position,
            targetPosition: 'B5',
            reasoning: 'Moving to hill'
        }));
        
        return {
            actions,
            validation: { isValid: true, errors: [], warnings: [] },
            officerComment: `${targetUnits.length} unit(s) → hill.`
        };
    }
    
    // Default: hold position for unrecognized orders
    const actions = targetUnits.map(unit => ({
        type: 'move',
        unitId: unit.unitId,
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

function simpleKeywordActions(orderText, targetUnits, map) {
  const lower = orderText.toLowerCase();
  const actions = [];
  // coordinate match
  const coord = orderText.match(/\b([A-T]\d{1,2})\b/i)?.[1]?.toUpperCase();
  if (coord) {
    targetUnits.forEach(u => actions.push({ type: 'move', unitId: u.unitId, currentPosition: u.position, targetPosition: coord, reasoning: `Move to ${coord}` }));
    return actions;
  }
  // landmarks
  if (lower.includes('ford')) {
    const dest = 'I11';
    targetUnits.forEach(u => actions.push({ type: 'move', unitId: u.unitId, currentPosition: u.position, targetPosition: dest, reasoning: 'Move to ford' }));
    return actions;
  }
  if (lower.includes('hill')) {
    const dest = 'B5';
    targetUnits.forEach(u => actions.push({ type: 'move', unitId: u.unitId, currentPosition: u.position, targetPosition: dest, reasoning: 'Move to hill' }));
    return actions;
  }
  // directions (3 tiles)
  let dir = null;
  if (lower.includes('north')) dir = 'north';
  else if (lower.includes('south')) dir = 'south';
  else if (lower.includes('east')) dir = 'east';
  else if (lower.includes('west')) dir = 'west';
  if (dir) {
    const { coordToString, parseCoord } = require('../game/maps/mapUtils');
    targetUnits.forEach(u => {
      const pos = parseCoord(u.position); let row = pos.row, col = pos.col;
      if (dir==='north') row -= 3; if (dir==='south') row += 3; if (dir==='east') col += 3; if (dir==='west') col -= 3;
      row = Math.max(0, Math.min(19, row)); col = Math.max(0, Math.min(19, col));
      actions.push({ type: 'move', unitId: u.unitId, currentPosition: u.position, targetPosition: coordToString({row, col}), reasoning: `Move ${dir}` });
    });
    return actions;
  }
  // default hold
  targetUnits.forEach(u => actions.push({ type: 'move', unitId: u.unitId, currentPosition: u.position, targetPosition: u.position, reasoning: 'Hold position' }));
  return actions;
}

function moveInDirection(fromCoord, direction, distance) {
    const { parseCoord, coordToString } = require('../game/maps/mapUtils');
    const pos = parseCoord(fromCoord);
    
    // Grid: A1 (top-left) to T20 (bottom-right)
    const vectors = {
        // Cardinals
        north: { row: -distance, col: 0 },
        south: { row: +distance, col: 0 },
        east: { row: 0, col: +distance },
        west: { row: 0, col: -distance },
        
        // Intercardinals (diagonal movement)
        northeast: { row: -distance, col: +distance },
        northwest: { row: -distance, col: -distance },
        southeast: { row: +distance, col: +distance },
        southwest: { row: +distance, col: -distance }
    };
    
    const vec = vectors[direction] || { row: 0, col: 0 };
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
 * Parse natural language commander actions
 * @param {string} orderText - The order text
 * @param {Object} battleState - Battle state with battleId
 * @param {string} playerSide - 'player1' or 'player2'
 * @returns {Object|null} Commander action result or null if no commander action detected
 */
async function parseCommanderActions(orderText, battleState, playerSide, context) {
    const lowerOrder = orderText.toLowerCase().trim();
    
    // We need battle context from the turn orchestrator to get battle ID and player ID
    // For now, we'll need to pass this through the context or get it another way
    // This is a limitation we'll need to address in the integration
    if (!context?.battleId || !context?.playerId) {
        return null; // Can't process commander actions without battle context
    }
    
    const battleId = context.battleId;
    const playerId = context.playerId;
    
    if (!battleId || !playerId) {
        return null; // Can't process commander actions without these
    }
    
    // Pattern: "I will move to the cavalry" or "I move to Marcus"
    const commanderMovePattern = /(?:i will|i'll|i) (?:move to|join|go to) (?:the )?(.+?)$/i;
    const commanderMove = orderText.match(commanderMovePattern);
    
    if (commanderMove) {
        const target = commanderMove[1].trim();
        
        // Find unit that matches the target description
        const playerUnits = battleState[playerSide].unitPositions || [];
        const targetUnit = findUnitByDescription(target, playerUnits);
        
        if (targetUnit) {
            try {
                const { models } = require('../database/setup');
                
                // Fetch current commander attachment
                const currentCommander = await models.BattleCommander.findOne({
                    where: { battleId, playerId }
                });
                if (!currentCommander) {
                    return {
                        actions: [],
                        validation: { isValid: false, errors: ['No commander found'], warnings: [] },
                        officerComment: 'No commander found in this battle.'
                    };
                }
                
                // Find the currently attached unit's position
                const playerUnits = battleState[playerSide].unitPositions || [];
                const attachedUnit = playerUnits.find(u => u.unitId === currentCommander.attachedToUnitId);
                if (!attachedUnit) {
                    return {
                        actions: [],
                        validation: { isValid: false, errors: ['Current attached unit not found'], warnings: [] },
                        officerComment: 'Current attached unit not found.'
                    };
                }
                
                // Enforce 1-tile adjacency rule
                const distance = require('../game/maps/mapUtils').calculateDistance(attachedUnit.position, targetUnit.position);
                if (distance > 1) {
                    return {
                        actions: [],
                        validation: { isValid: false, errors: ['Target unit is too far'], warnings: [] },
                        officerComment: `Commander can only move to a unit within 1 tile (current: ${distance}).`
                    };
                }
                
                // Attach commander to the new target unit (always attached; no detach state)
                await currentCommander.attachToUnit(targetUnit.unitId, targetUnit.position);
                
                return {
                    actions: [{
                        type: 'commander_move_pov',
                        unitId: targetUnit.unitId,
                        reasoning: `Commander moving (POV) to ${targetUnit.unitId}`
                    }],
                    validation: { isValid: true, errors: [], warnings: [] },
                    officerComment: `Commander joined ${targetUnit.unitId}.`
                };
            } catch (error) {
                return {
                    actions: [],
                    validation: { isValid: false, errors: [error.message], warnings: [] },
                    officerComment: `Cannot reposition commander: ${error.message}`
                };
            }
        }
    }
    
    // Pattern: "I will detach" or "I'll move independently to H8"
    const detachPattern = /(?:i will|i'll|i) (?:detach|move independently|leave the unit)(?:\s+(?:to|at)\s+([A-T]\d{1,2}))?/i;
    const detachMatch = orderText.match(detachPattern);
    
    // Pattern: "I will move to H8" (independent commander movement)
    const commanderMovePositionPattern = /(?:i will|i'll|i) (?:move|go) (?:to|at) ([A-T]\d{1,2})/i;
    const commanderPositionMove = orderText.match(commanderMovePositionPattern);
    
    // Independent commander movement is not allowed; commander must always be with a unit
    if (commanderPositionMove) {
        return {
            actions: [],
            validation: { isValid: false, errors: ['Commander must remain with a unit'], warnings: [] },
            officerComment: 'Commander must remain with a unit. Say “I will move to the cavalry/legion/etc.”'
        };
    }
    
    // Detach is not allowed; commander is a point-of-view attached to a unit
    if (detachMatch) {
        return {
            actions: [],
            validation: { isValid: false, errors: ['Commander cannot detach'], warnings: [] },
            officerComment: 'Commander cannot detach. Move to a nearby unit instead (within one tile).'
        };
    }
    
    // Pattern: "I will escape" or "I choose to fight to the death" (capture resolution)
    const escapePattern = /(?:i will|i choose to|i) (?:escape|flee|run)/i;
    const diePattern = /(?:i will|i choose to|i) (?:die|fight to (?:the )?death|stand and fight)/i;
    const surrenderPattern = /(?:i will|i choose to|i) surrender/i;
    
    let captureChoice = null;
    if (escapePattern.test(lowerOrder)) captureChoice = 'escape';
    else if (diePattern.test(lowerOrder)) captureChoice = 'die';
    else if (surrenderPattern.test(lowerOrder)) captureChoice = 'surrender';
    
    if (captureChoice) {
        try {
            const result = await resolveCommanderCapture(battleId, playerId, captureChoice);
            
            const outcomeMessages = {
                escaped: 'successfully escaped to a nearby unit',
                captured: 'was captured during the escape attempt',
                killed: 'died fighting heroically',
                surrendered: 'surrendered to the enemy'
            };
            
            // If escaped, commander needs to be moved to nearest friendly unit
            if (result.status === 'escaped') {
                // Find nearest friendly unit to escape to
                const playerUnits = battleState[playerSide].unitPositions || [];
                const nearestUnit = playerUnits.find(unit => unit.currentStrength > 0);
                
                if (nearestUnit && nearestUnit.unitId !== result.attachedToUnitId) {
                    // Move commander to nearest unit
                    const { models } = require('../database/setup');
                    const commander = await models.BattleCommander.findOne({
                        where: { battleId, playerId }
                    });
                    
                    if (commander) {
                        await commander.attachToUnit(nearestUnit.unitId, nearestUnit.position);
                    }
                }
            }
            
            return {
                actions: [{
                    type: 'commander_capture_resolution',
                    choice: captureChoice,
                    result: result.status,
                    reasoning: `Commander ${outcomeMessages[result.status] || 'fate determined'}`
                }],
                validation: { isValid: true, errors: [], warnings: [] },
                officerComment: `Commander ${outcomeMessages[result.status] || 'fate has been decided'}.`
            };
        } catch (error) {
            return {
                actions: [],
                validation: { isValid: false, errors: [error.message], warnings: [] },
                officerComment: `Cannot resolve commander situation: ${error.message}`
            };
        }
    }
    
    // Pattern: Command delegation - "Marcus, take the praetorian guard and attack the bridge"
    const delegationPattern = /([\w]+),\s+take\s+(?:the\s+)?([\w\s]+)\s+and\s+([\w\s]+)/i;
    const delegation = orderText.match(delegationPattern);
    
    if (delegation) {
        const officerName = delegation[1];
        const unitDescription = delegation[2];
        const command = delegation[3];
        
        // Find the unit being delegated to
        const playerUnits = battleState[playerSide].unitPositions || [];
        const targetUnit = findUnitByDescription(unitDescription, playerUnits);
        
        if (targetUnit) {
            // This is delegation - the commander stays where they are
            // The unit executes the command independently
            
            // Parse the delegated command (basic movement for now)
            let targetPosition = targetUnit.position; // Default to staying
            
            if (command.includes('bridge') || command.includes('ford')) {
                targetPosition = 'I11'; // Ford position
            } else if (command.includes('hill')) {
                targetPosition = 'B5'; // Hill position
            }
            
            return {
                actions: [{
                    type: 'move',
                    unitId: targetUnit.unitId,
                    currentPosition: targetUnit.position,
                    targetPosition: targetPosition,
                    reasoning: `${officerName} commanding ${unitDescription} to ${command}`
                }],
                validation: { isValid: true, errors: [], warnings: [] },
                officerComment: `${officerName} acknowledged. ${unitDescription} will ${command}.`
            };
        }
    }
    
    return null; // No commander action detected
}

/**
 * Find unit by natural language description
 * @param {string} description - Description like "cavalry", "praetorian guard", "spearmen"
 * @param {Array} units - Array of unit objects
 * @returns {Object|null} Matching unit or null
 */
function findUnitByDescription(description, units) {
    const desc = description.toLowerCase();
    
    // Direct unit type matches
    const typeMatches = {
        'cavalry': ['cavalry', 'horse', 'mounted'],
        'infantry': ['infantry', 'foot', 'soldiers'],
        'spear': ['spear', 'spearmen', 'spears', 'phalanx'],
        'sword': ['sword', 'swordsmen', 'swords', 'legion'],
        'archer': ['archer', 'archers', 'bow', 'ranged'],
        'elite': ['elite', 'guard', 'praetorian']
    };
    
    for (const [unitType, keywords] of Object.entries(typeMatches)) {
        if (keywords.some(keyword => desc.includes(keyword))) {
            const matchingUnit = units.find(unit => 
                unit.unitId.toLowerCase().includes(unitType) ||
                unit.unitId.toLowerCase().includes(desc) || // Direct description match
                (unit.equipment && JSON.stringify(unit.equipment).toLowerCase().includes(unitType))
            );
            if (matchingUnit) return matchingUnit;
        }
    }
    
    // Also try direct partial match on unitId
    const directMatch = units.find(unit => 
        unit.unitId.toLowerCase().includes(desc) ||
        desc.includes(unit.unitId.toLowerCase().split('_')[0])
    );
    if (directMatch) return directMatch;
    
    // Officer name matches (if units have officer names)
    const nameMatch = units.find(unit => 
        unit.officerName && unit.officerName.toLowerCase().includes(desc)
    );
    if (nameMatch) return nameMatch;
    
    // Positional matches ("northern unit", "leftmost unit")
    if (desc.includes('northern') || desc.includes('north')) {
        return units.reduce((n, u) => 
            parseCoord(u.position).row < parseCoord(n.position).row ? u : n
        );
    }
    if (desc.includes('southern') || desc.includes('south')) {
        return units.reduce((s, u) => 
            parseCoord(u.position).row > parseCoord(s.position).row ? u : s
        );
    }
    
    // Fallback: first unit if description is generic
    if (desc.includes('unit') || desc.includes('troops') || desc.includes('men')) {
        return units[0];
    }
    
    return null;
}

module.exports = {
    interpretOrders
};
