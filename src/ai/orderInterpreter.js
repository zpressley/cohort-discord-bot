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
    
    // Validate AI-suggested actions against rules
    const validatedActions = [];
    const errors = [];
    
    for (const action of aiResponse.actions) {
        if (action.type === 'move') {
            const unit = playerUnits.find(u => u.unitId === action.unitId);
            if (!unit) {
                errors.push(`Unit ${action.unitId} not found`);
                continue;
            }
            
            const validation = validateMovement(unit, action.targetPosition, map);
            
            if (validation.valid) {
                validatedActions.push({
                    ...action,
                    validation,
                    unitId: unit.unitId
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
    // TODO: Connect to aiManager.generateContent()
    // For now, return structured template
    
    // This will be replaced with:
    // const aiManager = require('./aiManager');
    // const response = await aiManager.generateContent(prompt, 'gpt-4o-mini');
    // return JSON.parse(response);
    
    return {
        actions: [
            {
                type: 'move',
                unitId: 'player1_unit_0',
                targetPosition: 'H11',
                reasoning: 'Template response - AI not connected yet'
            }
        ],
        validation: {
            isValid: true,
            errors: [],
            warnings: []
        },
        officerComment: 'Orders acknowledged.'
    };
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