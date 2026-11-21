// src/game/orders.js
// AI-powered natural language order interpretation with mission interruption

const { validateMovement } = require('./movement');
const { parseCoord } = require('./maps/mapUtils');
const { calculateVisibility } = require('./fogOfWar');
const { calculateDistance } = require('./maps/mapUtils');
const { 
    getCommanderStatus,
    resolveCommanderCapture
} = require('./commandSystem/commanderManager');

// ── MISSION INTERRUPTION ───────────────────────────────

/**
 * Check if unit's active mission should be interrupted
 * Uses fog of war - unit only reacts to what it can SEE
 */
function checkMissionInterruption(unit, battleState, playerSide, map) {
    if (!unit.activeMission || unit.activeMission.status !== 'active') {
        return { interrupted: false };
    }
    
    const enemySide = playerSide === 'player1' ? 'player2' : 'player1';
    const enemyUnits = battleState[enemySide].unitPositions || [];
    
    const weather = battleState.weather || 'clear';
    const visibility = calculateVisibility(
        [unit],
        enemyUnits,
        map.terrain,
        weather
    );
    
    if (visibility.totalEnemiesDetected > 0) {
        const nearestEnemy = visibility.intelligence.identified[0] || 
                            visibility.intelligence.detailed[0] ||
                            visibility.intelligence.spotted[0];
        
        if (!nearestEnemy) return { interrupted: false };
        
        const nearestEnemyPos = nearestEnemy.position;
        const distance = nearestEnemy.distance;
        
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

// ── RANGED ORDER DETECTION ─────────────────────────────

/**
 * Try deterministic parsing for simple ranged orders
 */
function tryRangedOrder(orderText, battleState, playerSide, map, playerUnits, context) {
    if (!orderText || !playerUnits || playerUnits.length === 0) return null;

    const lower = orderText.toLowerCase();
    if (!/(shoot|fire|volley|rain arrows|loose)/.test(lower)) {
        return null;
    }

    const { hasRangedWeapon } = require('./battleEngine');
    const shooters = playerUnits.filter(u => hasRangedWeapon(u));
    if (shooters.length === 0) return null;

    const match = lower.match(/(?:shoot|fire|target|attack|volley)\s+(?:at\s+)?(?:the\s+)?(\w+)/i);
    const targetKeyword = match ? match[1] : 'enemy';

    const actions = shooters.map(u => ({
        type: 'ranged_attack',
        unitId: u.unitId,
        targetKeyword,
        reasoning: `Ranged attack order against ${targetKeyword}`
    }));

    return {
        actions,
        validation: { isValid: true, errors: [], warnings: [] },
        officerComment: generateDefaultComment(context.culture)
    };
}

// ── KEYWORD FALLBACK PARSER ────────────────────────────

function determineTargetUnits(orderText, yourUnits) {
    const lowerOrder = orderText.toLowerCase();
    const leadCoord = orderText.match(/^\s*([A-T]\d{1,2})\b/i)?.[1]?.toUpperCase();
    if (leadCoord) {
        const match = yourUnits.filter(u => (u.position || '').toUpperCase() === leadCoord);
        if (match.length > 0) return match;
    }
    
    console.log(`  👥 Targeting: `, { end: '' });
    
    if (lowerOrder.includes('all units') || 
        lowerOrder.includes('everyone') ||
        lowerOrder.match(/^units\s+/)) {
        console.log('ALL units');
        return yourUnits;
    }
    
    if (lowerOrder.includes('elite') || lowerOrder.includes('guard') || lowerOrder.includes('veteran')) {
        const elites = yourUnits.filter(u => u.isElite === true || (u.veteranTier || '').toLowerCase().includes('veteran'));
        console.log(`Elite units (${elites.length} units)`);
        return elites.length > 0 ? elites : [yourUnits[0]];
    }
    
    if (lowerOrder.includes('cavalry') || lowerOrder.includes('horse') || lowerOrder.includes('mounted') || lowerOrder.includes('horsemen')) {
        const cavalry = yourUnits.filter(u => u.mounted === true);
        console.log(`Cavalry (${cavalry.length} units)`);
        if (cavalry.length === 0) {
            console.log('No mounted units available for cavalry order');
            return [];
        }
        return cavalry;
    }
    
    if (lowerOrder.includes('infantry') || lowerOrder.includes('foot')) {
        const infantry = yourUnits.filter(u => u.mounted === false);
        console.log(`Infantry (${infantry.length} units)`);
        return infantry.length > 0 ? infantry : [yourUnits[0]];
    }
    
    let posMatch = orderText.match(/(?:\b(?:unit|infantry|cavalry)\s+at\s+|\bat\s+)([A-T]\d{1,2})/i);
    if (!posMatch) posMatch = orderText.match(/\b([A-T]\d{1,2})\b\s+unit\b/i);
    if (posMatch) {
        const pos = posMatch[1].toUpperCase();
        const filtered = yourUnits.filter(u => u.position.toUpperCase() === pos);
        console.log(`Unit at ${pos} (${filtered.length} found)`);
        return filtered.length > 0 ? filtered : yourUnits;
    }
    
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
    
    console.log('Default: ALL units');
    return yourUnits;
}

function splitMultipleOrders(orderText) {
    if (!orderText.includes(',')) return [orderText];
    if (/,\s*\w+\s+unit\s+(hold|stay|wait)/i.test(orderText)) return [orderText];
    if (/\w+,\s+take\s+(?:the\s+)?[\w\s]+\s+and\s+[\w\s]+/i.test(orderText)) return [orderText];
    return orderText.split(',').map(s => s.trim());
}

function normalizeOrderText(text) {
    if (!text) return '';
    return text.replace(/\btot\b/gi, ' to ').replace(/\s+/g, ' ').trim();
}

function moveInDirection(fromCoord, direction, distance) {
    const { parseCoord: pc, coordToString } = require('./maps/mapUtils');
    const pos = pc(fromCoord);
    const vectors = {
        north: { row: -distance, col: 0 }, south: { row: +distance, col: 0 },
        east: { row: 0, col: +distance }, west: { row: 0, col: -distance },
        northeast: { row: -distance, col: +distance }, northwest: { row: -distance, col: -distance },
        southeast: { row: +distance, col: +distance }, southwest: { row: +distance, col: -distance }
    };
    const vec = vectors[direction] || { row: 0, col: 0 };
    const newRow = Math.max(0, Math.min(19, pos.row + vec.row));
    const newCol = Math.max(0, Math.min(19, pos.col + vec.col));
    return coordToString({ row: newRow, col: newCol });
}

function simpleKeywordActions(orderText, targetUnits, map) {
    const lower = normalizeOrderText(orderText).toLowerCase();
    const actions = [];
    const coord = orderText.match(/\b([A-T]\d{1,2})\b/i)?.[1]?.toUpperCase();
    if (coord) {
        targetUnits.forEach(u => actions.push({ type: 'move', unitId: u.unitId, currentPosition: u.position, targetPosition: coord, reasoning: `Move to ${coord}` }));
        return actions;
    }
    if (lower.includes('hold') || lower.includes('stay') || lower.includes('defend')) {
        targetUnits.forEach(u => actions.push({ type: 'move', unitId: u.unitId, currentPosition: u.position, targetPosition: u.position, reasoning: 'Hold position' }));
        return actions;
    }
    if (lower.includes('retreat') || lower.includes('withdraw') || lower.includes('fall back')) {
        targetUnits.forEach(u => {
            const dest = moveInDirection(u.position, 'south', 3);
            actions.push({ type: 'move', unitId: u.unitId, currentPosition: u.position, targetPosition: dest, reasoning: 'Retreat / fall back' });
        });
        return actions;
    }
    let dir = null;
    if (lower.includes('north')) dir = 'north';
    else if (lower.includes('south')) dir = 'south';
    else if (lower.includes('east')) dir = 'east';
    else if (lower.includes('west')) dir = 'west';
    if (dir) {
        const { coordToString, parseCoord: pc2 } = require('./maps/mapUtils');
        targetUnits.forEach(u => {
            const pos = pc2(u.position); let row = pos.row, col = pos.col;
            if (dir==='north') row -= 3; if (dir==='south') row += 3; if (dir==='east') col += 3; if (dir==='west') col -= 3;
            row = Math.max(0, Math.min(19, row)); col = Math.max(0, Math.min(19, col));
            actions.push({ type: 'move', unitId: u.unitId, currentPosition: u.position, targetPosition: coordToString({row, col}), reasoning: `Move ${dir}` });
        });
        return actions;
    }
    targetUnits.forEach(u => actions.push({ type: 'move', unitId: u.unitId, currentPosition: u.position, targetPosition: u.position, reasoning: 'Hold position' }));
    return actions;
}

function tryGenericOrder(orderText, yourUnits, map, context) {
    if (!orderText || !yourUnits || yourUnits.length === 0) return null;
    const normalized = normalizeOrderText(orderText);
    const lower = normalized.toLowerCase();
    const hasGlobalKeyword = /\b(all units|everyone|everybody|the army|our forces|our troops|my army)\b/.test(lower);
    const hasCoord = /\b([A-T]\d{1,2})\b/i.test(orderText);
    const hasDirection = /\b(north|south|east|west)\b/.test(lower);
    const hasHold = /\b(hold|stay|defend)\b/.test(lower);
    const hasRetreat = /\b(retreat|withdraw|fall back)\b/.test(lower);
    const hasSpecificUnitKeyword = /\b(elite|guard|veteran|cavalry|infantry|archer|archers|horse|scout|northern unit|southern unit|eastern unit|western unit|unit at|units at)\b/.test(lower);
    const looksGeneric = (hasGlobalKeyword || hasCoord || hasDirection || hasHold || hasRetreat) && !lower.includes(',');
    if (!looksGeneric) return null;
    let targetUnits;
    if (hasSpecificUnitKeyword && !hasGlobalKeyword) {
        targetUnits = determineTargetUnits(orderText, yourUnits);
    } else {
        targetUnits = yourUnits;
    }
    const actions = simpleKeywordActions(orderText, targetUnits, map);
    return { actions, validation: { isValid: true, errors: [], warnings: [] }, officerComment: generateDefaultComment(context.culture) };
}

function selectTargetUnits(orderText, units) {
    const lower = orderText.toLowerCase();
    if (/\b(all|everyone|army|force|troops)\b/.test(lower)) {
        console.log('  Matched: ALL units');
        return units;
    }
    const matched = [];
    if (/\b(cavalry|horsemen|horse|rider|mounted|mount|chariot)\b/.test(lower)) {
        console.log('  Keyword matched: cavalry');
        const cavMatches = units.filter(u => {
            if (u.mounted) return true;
            const unitType = (u.type || '').toLowerCase();
            return unitType.includes('cavalry') || unitType.includes('horse');
        });
        console.log(`    Found ${cavMatches.length} cavalry unit(s)`);
        matched.push(...cavMatches);
    }
    if (/\b(archer|bow|shoot|missile|sling)\b/.test(lower)) {
        console.log('  Keyword matched: archers');
        const archMatches = units.filter(u => {
            const unitType = (u.type || '').toLowerCase();
            return unitType.includes('archer') || unitType.includes('bow');
        });
        console.log(`    Found ${archMatches.length} archer unit(s)`);
        matched.push(...archMatches);
    }
    if (/\b(elite|guard|veteran|champion|praetorian|immortal|sacred)\b/.test(lower)) {
        console.log('  Keyword matched: elite');
        const eliteMatches = units.filter(u => {
            const unitType = (u.type || '').toLowerCase();
            return unitType.includes('elite') || unitType.includes('guard') || unitType.includes('veteran');
        });
        console.log(`    Found ${eliteMatches.length} elite unit(s)`);
        matched.push(...eliteMatches);
    }
    if (/\b(infantry|foot|legion|phalanx|spear|sword)\b/.test(lower)) {
        console.log('  Keyword matched: infantry');
        const infMatches = units.filter(u => {
            const unitType = (u.type || '').toLowerCase();
            if (unitType.includes('infantry') || unitType.includes('legion') || unitType.includes('phalanx')) return true;
            const isSpecialized = unitType.includes('cavalry') || unitType.includes('horse') || unitType.includes('archer') || unitType.includes('bow') || unitType.includes('elite') || unitType.includes('guard');
            return unitType.length > 0 && !isSpecialized;
        });
        console.log(`    Found ${infMatches.length} infantry unit(s)`);
        matched.push(...infMatches);
    }
    const unique = [...new Map(matched.map(u => [u.id || u.unitId, u])).values()];
    return unique;
}

function generateOfficerComment(actions, affectedUnits) {
    if (actions.length === 0) return 'Awaiting orders, Commander.';
    if (actions.length === 1) {
        const action = actions[0];
        if (action.type === 'hold') return 'Holding position.';
        return `Acknowledged. Moving to ${action.targetPosition}.`;
    }
    if (actions.length === affectedUnits) return `All units moving into position.`;
    return `${actions.length} unit(s) moving as ordered.`;
}

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

function fallbackOrderParsing(prompt) {
    const yourUnits = JSON.parse(prompt.match(/Your Units: (\[.*?\])/s)?.[1] || '[]');
    const orderText = prompt.match(/\*\*PLAYER ORDER:\*\* "(.*?)"/)?.[1] || '';
    console.log(`Fallback parsing: "${orderText}" for ${yourUnits.length} units`);
    if (yourUnits.length === 0) {
        return { actions: [], validation: { isValid: true, errors: [], warnings: ['No units available'] }, officerComment: 'No units to command.' };
    }
    const lowerOrder = orderText.toLowerCase();
    let unitsToCommand = [];
    if (lowerOrder.includes('cavalry')) {
        unitsToCommand = yourUnits.filter(u => u.type?.toLowerCase().includes('cavalry') || u.type?.toLowerCase().includes('horse'));
        if (unitsToCommand.length === 0) return { actions: [], validation: { isValid: true, errors: [], warnings: ['No cavalry available'] }, officerComment: 'Sir, we have no cavalry units.' };
    } else if (lowerOrder.includes('archer') || lowerOrder.includes('bowmen')) {
        unitsToCommand = yourUnits.filter(u => u.type?.toLowerCase().includes('archer') || u.type?.toLowerCase().includes('bow'));
        if (unitsToCommand.length === 0) return { actions: [], validation: { isValid: true, errors: [], warnings: ['No archers available'] }, officerComment: 'Sir, we have no archer units.' };
    } else if (lowerOrder.includes('infantry')) {
        unitsToCommand = yourUnits.filter(u => u.type?.toLowerCase().includes('infantry') || u.type?.toLowerCase().includes('levy') || u.type?.toLowerCase().includes('militia') || u.type?.toLowerCase().includes('soldier'));
    } else if (lowerOrder.includes('all') || lowerOrder.includes('everyone') || lowerOrder.includes('everybody')) {
        unitsToCommand = yourUnits;
    } else {
        unitsToCommand = yourUnits;
    }
    console.log(`Commanding ${unitsToCommand.length} units`);
    const actions = [];
    for (const unit of unitsToCommand) {
        let targetPosition = null;
        let actionType = 'move';
        const coordMatch = orderText.match(/\b([A-T]\d{1,2})\b/i);
        if (coordMatch) targetPosition = coordMatch[1].toUpperCase();
        else if (lowerOrder.includes('hold') || lowerOrder.includes('defend') || lowerOrder.includes('stay')) { targetPosition = unit.position; actionType = 'hold'; }
        else if (lowerOrder.includes('north')) targetPosition = moveInDirection(unit.position, 'north', 3);
        else if (lowerOrder.includes('south')) targetPosition = moveInDirection(unit.position, 'south', 3);
        else if (lowerOrder.includes('east')) targetPosition = moveInDirection(unit.position, 'east', 3);
        else if (lowerOrder.includes('west')) targetPosition = moveInDirection(unit.position, 'west', 3);
        else if (lowerOrder.includes('ford') || lowerOrder.includes('crossing')) targetPosition = 'F11';
        else if (lowerOrder.includes('river')) targetPosition = 'F11';
        else if (lowerOrder.includes('hill')) targetPosition = 'B5';
        else if (lowerOrder.includes('attack') || lowerOrder.includes('advance') || lowerOrder.includes('charge')) targetPosition = moveInDirection(unit.position, 'north', 3);
        else if (lowerOrder.includes('retreat') || lowerOrder.includes('withdraw') || lowerOrder.includes('fall back')) targetPosition = moveInDirection(unit.position, 'south', 3);
        if (targetPosition) actions.push({ type: actionType, unitId: unit.id, currentPosition: unit.position, targetPosition, reasoning: `Interpreting "${orderText}"` });
    }
    console.log(`Fallback generated ${actions.length} actions`);
    return { actions, validation: { isValid: true, errors: [], warnings: actions.length === 0 ? ['Could not interpret - holding position'] : [] }, officerComment: actions.length > 0 ? 'Orders understood, sir.' : 'Unclear orders - holding position.' };
}

function isQuestion(text) {
    const questionWords = ['where', 'what', 'when', 'who', 'how', 'why', 'can', 'should', 'could', 'would'];
    const lowerText = text.toLowerCase();
    if (text.includes('?')) return true;
    const firstWord = lowerText.split(' ')[0];
    if (questionWords.includes(firstWord)) return true;
    if (lowerText.match(/^(do|does|is|are|will|have|has)\s/)) return true;
    return false;
}

function findUnitByDescription(description, units) {
    const desc = description.toLowerCase();
    const typeMatches = {
        'cavalry': ['cavalry', 'horse', 'horsemen', 'mounted', 'riders'],
        'infantry': ['infantry', 'foot', 'soldiers'],
        'spear': ['spear', 'spearmen', 'spears', 'phalanx'],
        'sword': ['sword', 'swordsmen', 'swords', 'legion'],
        'archer': ['archer', 'archers', 'bow', 'ranged'],
        'elite': ['elite', 'guard', 'praetorian']
    };
    for (const [unitType, keywords] of Object.entries(typeMatches)) {
        if (keywords.some(keyword => desc.includes(keyword))) {
            const matchingUnit = units.find(unit => unit.unitId.toLowerCase().includes(unitType) || unit.unitId.toLowerCase().includes(desc) || (unit.equipment && JSON.stringify(unit.equipment).toLowerCase().includes(unitType)));
            if (matchingUnit) return matchingUnit;
        }
    }
    const directMatch = units.find(unit => unit.unitId.toLowerCase().includes(desc) || desc.includes(unit.unitId.toLowerCase().split('_')[0]));
    if (directMatch) return directMatch;
    const nameMatch = units.find(unit => unit.officerName && unit.officerName.toLowerCase().includes(desc));
    if (nameMatch) return nameMatch;
    if (desc.includes('northern') || desc.includes('north')) return units.reduce((n, u) => parseCoord(u.position).row < parseCoord(n.position).row ? u : n);
    if (desc.includes('southern') || desc.includes('south')) return units.reduce((s, u) => parseCoord(u.position).row > parseCoord(s.position).row ? u : s);
    if (desc.includes('unit') || desc.includes('troops') || desc.includes('men')) return units[0];
    return null;
}

// ── AI ORDER PARSING (Groq) ────────────────────────────

function buildOrderInterpretationPrompt(orderText, context) {
    return `You are a tactical AI for an ancient warfare game. Parse the player's order into game actions.

**PLAYER ORDER:** "${orderText}"

**CURRENT SITUATION:**
- Turn: ${context.currentTurn}
- Culture: ${context.culture}
- Your Units: ${JSON.stringify(context.yourUnits.map(u => ({
    id: u.unitId, type: u.type || u.unitType, position: u.position,
    strength: u.currentStrength, movementRange: u.movementRemaining
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

async function callAIForOrderParsing(prompt) {
    try {
        if (!process.env.GROQ_API_KEY) {
            console.log('No Groq API key - using fallback parser');
            return fallbackOrderParsing(prompt);
        }
        const Groq = require('groq-sdk');
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                { role: "system", content: "You are a tactical order interpreter for ancient warfare. Parse player orders into game actions. Return ONLY valid JSON, no other text." },
                { role: "user", content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.3
        });
        const aiText = (response.choices?.[0]?.message?.content || '').trim();
        if (!aiText) { console.log('AI response empty - using fallback'); return fallbackOrderParsing(prompt); }
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { console.log('AI response not JSON - using fallback'); return fallbackOrderParsing(prompt); }
        let parsed;
        try { parsed = JSON.parse(jsonMatch[0]); } catch (parseErr) { console.log('AI JSON parse failed - using fallback:', parseErr.message); return fallbackOrderParsing(prompt); }
        if (!Array.isArray(parsed.actions)) parsed.actions = [];
        if (typeof parsed.validation !== 'object' || parsed.validation === null) parsed.validation = { isValid: true, errors: [], warnings: [] };
        if (!Array.isArray(parsed.validation.errors)) parsed.validation.errors = [];
        if (!Array.isArray(parsed.validation.warnings)) parsed.validation.warnings = [];
        if (typeof parsed.officerComment !== 'string') parsed.officerComment = 'Orders acknowledged.';
        console.log(`AI parsed ${parsed.actions.length} actions from order`);
        return parsed;
    } catch (error) {
        console.error('AI order parsing failed:', error.message);
        console.log('Using fallback parser');
        return fallbackOrderParsing(prompt);
    }
}

// ── MAIN ENTRY POINTS ──────────────────────────────────

async function interpretOrders(orderText, battleState, playerSide, map) {
    const playerUnits = battleState[playerSide].unitPositions || [];
    const playerArmy = battleState[playerSide].army || {};
    const context = {
        currentTurn: battleState.currentTurn,
        yourUnits: playerUnits,
        mapTerrain: map.terrain,
        movementRules: map.movementCosts,
        culture: battleState[playerSide].culture
    };
    
    let aiResponse = tryRangedOrder(orderText, battleState, playerSide, map, playerUnits, context);
    if (!aiResponse) aiResponse = tryGenericOrder(orderText, playerUnits, map, context);
    if (!aiResponse) {
        const prompt = buildOrderInterpretationPrompt(orderText, context);
        aiResponse = await callAIForOrderParsing(prompt);
    }
    
    const validatedActions = [];
    const errors = [];
    
    for (const action of aiResponse.actions) {
        console.log('  Validating action:', action.type, action.unitId, '→', action.targetPosition);
        if (action.type === 'attack' && action.targetPosition) {
            console.log('  Converting ATTACK into MOVE+engagement toward', action.targetPosition);
            action.type = 'move';
        }
        if (action.type === 'ranged_attack') {
            const unit = playerUnits.find(u => u.unitId === action.unitId);
            if (!unit) { errors.push(`Unit ${action.unitId} not found`); continue; }
            try {
                const { validateRangedAttack } = require('./battleEngine');
                const validation = validateRangedAttack(unit, action.targetKeyword, battleState, playerSide);
                if (validation.valid) {
                    validatedActions.push({ ...action, validation, unitId: unit.unitId });
                } else {
                    errors.push({ unit: unit.unitId, error: validation.error });
                }
            } catch (error) {
                errors.push({ unit: action.unitId, error: error.message, reason: 'ranged_validation_exception' });
            }
        } else if (action.type === 'move') {
            const unit = playerUnits.find(u => u.unitId === action.unitId);
            console.log('  Unit found:', !!unit);
            if (!unit) { errors.push(`Unit ${action.unitId} not found`); continue; }
            try {
                const { validateMovement, createMission } = require('./movement');
                const validation = validateMovement(unit, action.targetPosition, map);
                console.log('  Movement validation:', validation.valid);
                if (validation.valid) {
                    const validated = { ...action, validation, unitId: unit.unitId };
                    if (validation.partialMovement && validation.originalTarget && validation.finalPosition !== validation.originalTarget) {
                        validated.newMission = createMission(unit, validation.originalTarget, battleState.currentTurn || 1);
                    }
                    validatedActions.push(validated);
                    console.log('  ✅ Action validated');
                } else {
                    console.log('  ❌ Movement invalid:', validation.error);
                    errors.push({ unit: unit.unitId, error: validation.error, reason: validation.reason });
                }
            } catch (error) {
                console.log('  ❌ Validation error:', error.message);
                errors.push({ unit: unit.unitId, error: error.message, reason: 'validation_exception' });
            }
        } else {
            validatedActions.push(action);
        }
    }
    
    return { validatedActions, errors, officerComment: aiResponse.officerComment || generateDefaultComment(context.culture), rawAIResponse: aiResponse };
}

async function parseCommanderActions(orderText, battleState, playerSide, context) {
    const lowerOrder = orderText.toLowerCase().trim();
    if (!context?.battleId || !context?.playerId) return null;
    const battleId = context.battleId;
    const playerId = context.playerId;
    if (!battleId || !playerId) return null;
    
    const commanderMovePattern = /(?:i will|i'll|i) (?:move to|join|go to) (?:the )?(.+?)$/i;
    const commanderMove = orderText.match(commanderMovePattern);
    if (commanderMove) {
        const target = commanderMove[1].trim();
        const playerUnits = battleState[playerSide].unitPositions || [];
        const targetUnit = findUnitByDescription(target, playerUnits);
        if (targetUnit) {
            try {
                const { models } = require('../database/setup');
                const currentCommander = await models.BattleCommander.findOne({ where: { battleId, playerId } });
                if (!currentCommander) return { actions: [], validation: { isValid: false, errors: ['No commander found'], warnings: [] }, officerComment: 'No commander found in this battle.' };
                const playerUnits2 = battleState[playerSide].unitPositions || [];
                const attachedUnit = playerUnits2.find(u => u.unitId === currentCommander.attachedToUnitId);
                if (!attachedUnit) return { actions: [], validation: { isValid: false, errors: ['Current attached unit not found'], warnings: [] }, officerComment: 'Current attached unit not found.' };
                const distance = require('./maps/mapUtils').calculateDistance(attachedUnit.position, targetUnit.position);
                if (distance > 1) return { actions: [], validation: { isValid: false, errors: ['Target unit is too far'], warnings: [] }, officerComment: `Commander can only move to a unit within 1 tile (current: ${distance}).` };
                await currentCommander.attachToUnit(targetUnit.unitId, targetUnit.position);
                return { actions: [{ type: 'commander_move_pov', unitId: targetUnit.unitId, reasoning: `Commander moving (POV) to ${targetUnit.unitId}` }], validation: { isValid: true, errors: [], warnings: [] }, officerComment: `Commander joined ${targetUnit.unitId}.` };
            } catch (error) {
                return { actions: [], validation: { isValid: false, errors: [error.message], warnings: [] }, officerComment: `Cannot reposition commander: ${error.message}` };
            }
        }
    }
    
    const commanderMovePositionPattern = /(?:i will|i'll|i) (?:move|go) (?:to|at) ([A-T]\d{1,2})/i;
    const commanderPositionMove = orderText.match(commanderMovePositionPattern);
    if (commanderPositionMove) return { actions: [], validation: { isValid: false, errors: ['Commander must remain with a unit'], warnings: [] }, officerComment: 'Commander must remain with a unit. Say "I will move to the cavalry/legion/etc."' };
    
    const detachPattern = /(?:i will|i'll|i) (?:detach|move independently|leave the unit)(?:\s+(?:to|at)\s+([A-T]\d{1,2}))?/i;
    const detachMatch = orderText.match(detachPattern);
    if (detachMatch) return { actions: [], validation: { isValid: false, errors: ['Commander cannot detach'], warnings: [] }, officerComment: 'Commander cannot detach. Move to a nearby unit instead (within one tile).' };
    
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
            const outcomeMessages = { escaped: 'successfully escaped to a nearby unit', captured: 'was captured during the escape attempt', killed: 'died fighting heroically', surrendered: 'surrendered to the enemy' };
            if (result.status === 'escaped') {
                const playerUnits = battleState[playerSide].unitPositions || [];
                const nearestUnit = playerUnits.find(unit => unit.currentStrength > 0);
                if (nearestUnit && nearestUnit.unitId !== result.attachedToUnitId) {
                    const { models } = require('../database/setup');
                    const commander = await models.BattleCommander.findOne({ where: { battleId, playerId } });
                    if (commander) await commander.attachToUnit(nearestUnit.unitId, nearestUnit.position);
                }
            }
            return { actions: [{ type: 'commander_capture_resolution', choice: captureChoice, result: result.status, reasoning: `Commander ${outcomeMessages[result.status] || 'fate determined'}` }], validation: { isValid: true, errors: [], warnings: [] }, officerComment: `Commander ${outcomeMessages[result.status] || 'fate has been decided'}.` };
        } catch (error) {
            return { actions: [], validation: { isValid: false, errors: [error.message], warnings: [] }, officerComment: `Cannot resolve commander situation: ${error.message}` };
        }
    }
    
    const delegationPattern = /([\w]+),\s+take\s+(?:the\s+)?([\w\s]+)\s+and\s+([\w\s]+)/i;
    const delegation = orderText.match(delegationPattern);
    if (delegation) {
        const officerName = delegation[1];
        const unitDescription = delegation[2];
        const command = delegation[3];
        const playerUnits = battleState[playerSide].unitPositions || [];
        const targetUnit = findUnitByDescription(unitDescription, playerUnits);
        if (targetUnit) {
            let targetPosition = targetUnit.position;
            if (command.includes('bridge') || command.includes('ford')) targetPosition = 'I11';
            else if (command.includes('hill')) targetPosition = 'B5';
            return { actions: [{ type: 'move', unitId: targetUnit.unitId, currentPosition: targetUnit.position, targetPosition, reasoning: `${officerName} commanding ${unitDescription} to ${command}` }], validation: { isValid: true, errors: [], warnings: [] }, officerComment: `${officerName} acknowledged. ${unitDescription} will ${command}.` };
        }
    }
    
    return null;
}

module.exports = {
    interpretOrders,
    parseCommanderActions
};
