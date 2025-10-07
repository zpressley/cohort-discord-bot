// src/ai/orderInterpreter.js
// AI-powered natural language order interpretation

const { validateMovement } = require('../game/movementSystem');
const { parseCoord } = require('../game/maps/mapUtils');

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
    const playerArmy = battleState[playerSide].army || {};
    
    // Build context for AI
    const context = {
        currentTurn: battleState.currentTurn,
        yourUnits: playerUnits,
        mapTerrain: map.terrain,
        movementRules: map.movementCosts,
        culture: battleState[playerSide].culture
    };
    
    // Generate AI prompt
    const prompt = buildOrderInterpretationPrompt(orderText, context);
    
    // Call AI (placeholder - will connect to aiManager)
    const aiResponse = await callAIForOrderParsing(prompt);
    
    console.log('DEBUG interpretOrders:');
    console.log('  AI returned actions:', aiResponse.actions.length);
    if (aiResponse.actions.length > 0) {
        console.log('  Action[0]:', aiResponse.actions[0].unitId, '→', aiResponse.actions[0].targetPosition);
    }

    // Validate AI-suggested actions against rules
    const validatedActions = [];
    const errors = [];
    
    for (const action of aiResponse.actions) {
    console.log('  Validating action:', action.type, action.unitId, '→', action.targetPosition);
    
    if (action.type === 'move') {
        const unit = playerUnits.find(u => u.unitId === action.unitId);
        console.log('  Unit found:', !!unit);
        
        if (!unit) {
            errors.push(`Unit ${action.unitId} not found`);
            continue;
        }
        
        const validation = validateMovement(unit, action.targetPosition, map);
        console.log('  Validation result:', validation.valid);
        
        if (validation.valid) {
            validatedActions.push({
                ...action,
                validation,
                unitId: unit.unitId
            });
            console.log('  ✅ Action added to validatedActions');
        } else {
            console.log('  ❌ Validation failed:', validation.error);
            errors.push({
                unit: unit.unitId,
                error: validation.error,
                reason: validation.reason
            });
        }
    }
        
        if (action.type === 'formation') {
            validatedActions.push(action); // Formation changes always valid
        }
        
        if (action.type === 'scout') {
            validatedActions.push(action); // Scout orders validated separately
        }
    }
    
    return {
        validatedActions,
        errors,
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
    const lowerOrder = orderText.toLowerCase();
    
    // FIRST: Check for explicit coordinates in order
    const coordMatch = orderText.match(/\b([A-O]\d{1,2})\b/i);
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
    
    // THEN: Fall back to direction/keyword parsing
    let targetPosition = unit.position; // Default: hold position
    
    // Parse direction
    if (lowerOrder.includes('south')) targetPosition = moveInDirection(unit.position, 'south', 3);
    if (lowerOrder.includes('north')) targetPosition = moveInDirection(unit.position, 'north', 3);
    if (lowerOrder.includes('east')) targetPosition = moveInDirection(unit.position, 'east', 3);
    if (lowerOrder.includes('west')) targetPosition = moveInDirection(unit.position, 'west', 3);
    
    // Parse specific targets
    if (lowerOrder.includes('river')) targetPosition = 'F11'; // Move toward ford
    if (lowerOrder.includes('ford')) targetPosition = 'F11';
    if (lowerOrder.includes('hill')) targetPosition = 'B5';
    
    return {
        actions: [{
            type: 'move',
            unitId: unit.id,
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

module.exports = {
    interpretOrders,
    buildOrderInterpretationPrompt,
    isQuestion,
    generateDefaultComment
};