// src/game/orderParser.js
// Natural Language Order Processing System

/**
 * Natural Language Order Parser
 * Converts player text commands into structured tactical orders
 * Handles cultural restrictions and validates against unit capabilities
 */

// Command vocabulary and synonyms
const COMMAND_VOCABULARY = {
    // Movement commands
    movement: {
        'advance': ['advance', 'move forward', 'push', 'attack', 'charge', 'go', 'march'],
        'retreat': ['retreat', 'withdraw', 'fall back', 'pull back', 'disengage'],
        'flank': ['flank', 'outflank', 'circle', 'go around', 'bypass'],
        'hold': ['hold', 'stay', 'remain', 'keep position', 'defend', 'guard'],
        'maneuver': ['maneuver', 'reposition', 'shift', 'adjust', 'move']
    },

    // Formation commands  
    formations: {
        'phalanx': ['phalanx', 'spear wall', 'pike formation', 'sarissa'],
        'testudo': ['testudo', 'turtle', 'shield wall', 'tortoise'],
        'wedge': ['wedge', 'triangle', 'arrow', 'point'],
        'line': ['line', 'battle line', 'formation', 'ranks'],
        'column': ['column', 'march column', 'file'],
        'loose': ['loose', 'skirmish', 'open order', 'scattered']
    },

    // Tactical actions
    actions: {
        'attack': ['attack', 'assault', 'strike', 'engage', 'charge'],
        'defend': ['defend', 'block', 'parry', 'resist', 'hold'],
        'support': ['support', 'assist', 'help', 'cover', 'aid'],
        'harass': ['harass', 'skirmish', 'raid', 'hit and run'],
        'pursue': ['pursue', 'chase', 'follow', 'hunt down'],
        'feint': ['feint', 'fake', 'deceive', 'trick', 'pretend']
    },

    // Targets and locations
    targets: {
        'ford': ['ford', 'crossing', 'river crossing', 'bridge'],
        'flank': ['flank', 'side', 'wing', 'left', 'right'],
        'center': ['center', 'middle', 'main force'],
        'rear': ['rear', 'back', 'behind'],
        'hill': ['hill', 'height', 'elevation', 'ridge'],
        'forest': ['forest', 'woods', 'trees'],
        'enemy': ['enemy', 'foe', 'opposition', 'them', 'their forces']
    },

    // Unit types
    units: {
        'infantry': ['infantry', 'footmen', 'soldiers', 'troops', 'men'],
        'cavalry': ['cavalry', 'horses', 'riders', 'mounted'],
        'archers': ['archers', 'bowmen', 'arrows', 'ranged'],
        'elite': ['elite', 'guard', 'veterans', 'champions'],
        'all': ['all', 'everyone', 'entire force', 'whole army']
    }
};

// Cultural tactical preferences and restrictions
const CULTURAL_TACTICS = {
    'Roman': {
        preferredFormations: ['testudo', 'line', 'wedge'],
        restrictedFormations: [],
        specialTactics: ['engineering', 'systematic_advance', 'fortification'],
        commandStyle: 'disciplined'
    },
    'Celtic': {
        preferredFormations: ['loose', 'wedge'],
        restrictedFormations: ['testudo', 'phalanx'],
        specialTactics: ['berserker_charge', 'individual_combat'],
        commandStyle: 'heroic'
    },
    'Han Chinese': {
        preferredFormations: ['line', 'column'],
        restrictedFormations: [],
        specialTactics: ['crossbow_volley', 'coordinated_advance'],
        commandStyle: 'coordinated'
    },
    'Macedonian': {
        preferredFormations: ['phalanx', 'line'],
        restrictedFormations: ['loose'],
        specialTactics: ['sarissa_wall', 'combined_arms'],
        commandStyle: 'tactical'
    },
    'Sarmatian': {
        preferredFormations: ['loose', 'wedge'],
        restrictedFormations: ['testudo', 'phalanx'],
        specialTactics: ['feigned_retreat', 'horse_archery'],
        commandStyle: 'mobile'
    },
    'Berber': {
        preferredFormations: ['loose', 'column'],
        restrictedFormations: ['phalanx', 'testudo'],
        specialTactics: ['hit_and_run', 'desert_maneuver'],
        commandStyle: 'raiding'
    },
    'Spartan': {
        preferredFormations: ['phalanx', 'line'],
        restrictedFormations: ['loose'],
        specialTactics: ['disciplined_advance', 'never_retreat'],
        commandStyle: 'laconic'
    },
       'Kingdom of Kush': {
        preferredFormations: ['loose', 'line'],
        restrictedFormations: [],
        specialTactics: ['archer_mastery', 'desert_warfare'],
        commandStyle: 'disciplined'
    },
    
    'Carthaginian Empire': {
        preferredFormations: ['line', 'wedge'],
        restrictedFormations: [],
        specialTactics: ['mercenary_coordination', 'elephant_warfare'],
        commandStyle: 'professional'
    }
};

/**
 * Main order parsing function
 * @param {string} orderText - Natural language command from player
 * @param {Array} playerArmy - Available units for validation
 * @param {string} culture - Player's cultural identity for restrictions
 * @param {Object} battleState - Current battle situation for context
 * @returns {Object} Parsed and validated tactical orders
 */
async function parsePlayerOrders(orderText, playerArmy, culture, battleState) {
    try {
        console.log(`Parsing orders for ${culture}: "${orderText}"`);

        // Clean and normalize input
        const normalizedText = normalizeOrderText(orderText);

        // Split into individual commands (handle multiple orders)
        const commandPhrases = splitIntoCommands(normalizedText);

        // Parse each command phrase
        const parsedCommands = [];
        for (const phrase of commandPhrases) {
            const command = await parseIndividualCommand(phrase, playerArmy, culture, battleState);
            if (command) {
                parsedCommands.push(command);
            }
        }

        // Validate command combinations
        const validatedOrders = validateCommandCombination(parsedCommands, culture, playerArmy);

        // Add cultural flavor and officer advice
        const culturalOrders = applyCulturalContext(validatedOrders, culture, battleState);

        console.log(`Successfully parsed ${parsedCommands.length} commands for ${culture}`);

        return {
            originalText: orderText,
            parsedCommands: parsedCommands,
            validatedOrders: culturalOrders,
            culture: culture,
            timestamp: new Date()
        };

    } catch (error) {
        console.error(`Failed to parse orders: ${orderText}`, error);
        throw new Error(`Order parsing failed: ${error.message}`);
    }
}

/**
 * Normalize order text for consistent parsing
 */
function normalizeOrderText(text) {
    return text
        .toLowerCase()
        .replace(/[,;]/g, ' ') // Replace punctuation with spaces
        .replace(/\s+/g, ' ')  // Normalize multiple spaces
        .trim();
}

/**
 * Split complex orders into individual commands
 */
function splitIntoCommands(text) {
    // Split on coordinating conjunctions and command separators
    const separators = /\s+and\s+|\s+then\s+|\s+while\s+|\s+but\s+|\./g;
    return text
        .split(separators)
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0);
}

/**
 * Parse individual command phrase into structured command
 */
async function parseIndividualCommand(phrase, playerArmy, culture, battleState) {
    console.log(`Parsing individual command: "${phrase}"`);

    const command = {
        originalPhrase: phrase,
        unitTargets: [],
        action: null,
        formation: null,
        target: null,
        modifier: null,
        confidence: 0
    };

    // Extract unit targets
    command.unitTargets = extractUnitTargets(phrase, playerArmy);

    // Extract primary action
    command.action = extractAction(phrase);

    // Extract formation if specified
    command.formation = extractFormation(phrase);

    // Extract target/location
    command.target = extractTarget(phrase, battleState);

    // Extract modifiers (speed, caution, etc.)
    command.modifier = extractModifiers(phrase);

    // Calculate parsing confidence
    command.confidence = calculateParsingConfidence(command);

    // Validate minimum requirements
    if (command.confidence < 0.3) {
        console.warn(`Low confidence command ignored: "${phrase}"`);
        return null;
    }

    return command;
}

/**
 * Extract unit targets from command text
 */
function extractUnitTargets(text, playerArmy) {
    const targets = [];
    
    // Check for specific unit mentions
    for (const [unitType, synonyms] of Object.entries(COMMAND_VOCABULARY.units)) {
        for (const synonym of synonyms) {
            if (text.includes(synonym)) {
                // Find matching units in player army
                const matchingUnits = findUnitsOfType(unitType, playerArmy);
                if (matchingUnits.length > 0) {
                    targets.push({
                        type: unitType,
                        units: matchingUnits,
                        synonym: synonym
                    });
                }
            }
        }
    }

    // Default to all units if no specific targets found
    if (targets.length === 0) {
        targets.push({
            type: 'all',
            units: playerArmy,
            synonym: 'all forces'
        });
    }

    return targets;
}

/**
 * Extract primary action from command text
 */
function extractAction(text) {
    for (const [action, synonyms] of Object.entries(COMMAND_VOCABULARY.actions)) {
        for (const synonym of synonyms) {
            if (text.includes(synonym)) {
                return { type: action, synonym: synonym };
            }
        }
    }

    // Check movement commands
    for (const [movement, synonyms] of Object.entries(COMMAND_VOCABULARY.movement)) {
        for (const synonym of synonyms) {
            if (text.includes(synonym)) {
                return { type: movement, synonym: synonym, category: 'movement' };
            }
        }
    }

    return { type: 'advance', synonym: 'advance', category: 'movement', inferred: true };
}

/**
 * Extract formation commands
 */
function extractFormation(text) {
    for (const [formation, synonyms] of Object.entries(COMMAND_VOCABULARY.formations)) {
        for (const synonym of synonyms) {
            if (text.includes(synonym)) {
                return { type: formation, synonym: synonym };
            }
        }
    }
    return null;
}

/**
 * Extract target locations or objectives
 */
function extractTarget(text, battleState) {
    for (const [target, synonyms] of Object.entries(COMMAND_VOCABULARY.targets)) {
        for (const synonym of synonyms) {
            if (text.includes(synonym)) {
                return { 
                    type: target, 
                    synonym: synonym,
                    available: isTargetAvailable(target, battleState)
                };
            }
        }
    }
    return null;
}

/**
 * Extract command modifiers (speed, caution, etc.)
 */
function extractModifiers(text) {
    const modifiers = {};
    
    if (text.includes('quick') || text.includes('fast') || text.includes('rapid')) {
        modifiers.speed = 'fast';
    }
    if (text.includes('slow') || text.includes('careful') || text.includes('cautious')) {
        modifiers.speed = 'cautious';
    }
    if (text.includes('silent') || text.includes('stealth')) {
        modifiers.stealth = true;
    }
    if (text.includes('cover') || text.includes('support')) {
        modifiers.support = true;
    }

    return Object.keys(modifiers).length > 0 ? modifiers : null;
}

/**
 * Find units of specified type in player army
 */
function findUnitsOfType(unitType, playerArmy) {
    if (unitType === 'all') {
        return playerArmy;
    }

    return playerArmy.filter(unit => {
        if (unitType === 'infantry') {
            return ['levy', 'militia', 'professional'].includes(unit.type);
        }
        if (unitType === 'cavalry') {
            return unit.type === 'cavalry';
        }
        if (unitType === 'archers') {
            return unit.type === 'archers';
        }
        if (unitType === 'elite') {
            return unit.type === 'elite';
        }
        return unit.type === unitType;
    });
}

/**
 * Check if target is available in current battle state
 */
function isTargetAvailable(targetType, battleState) {
    const scenario = battleState.scenario;
    
    if (targetType === 'ford' && scenario === 'river_crossing') {
        return true;
    }
    if (targetType === 'hill' && scenario === 'hill_fort_assault') {
        return true;
    }
    if (targetType === 'forest' && scenario === 'forest_ambush') {
        return true;
    }
    
    // Generic targets usually available
    return ['enemy', 'center', 'flank', 'rear'].includes(targetType);
}

/**
 * Calculate parsing confidence based on recognized elements
 */
function calculateParsingConfidence(command) {
    let confidence = 0;

    // Base confidence for having units and action
    if (command.unitTargets.length > 0) confidence += 0.3;
    if (command.action) confidence += 0.3;

    // Bonus for specific formations
    if (command.formation) confidence += 0.2;

    // Bonus for clear targets
    if (command.target && command.target.available) confidence += 0.2;

    // Penalty for inferred elements
    if (command.action && command.action.inferred) confidence -= 0.1;

    return Math.min(1.0, confidence);
}

/**
 * Validate combination of commands for tactical coherence
 */
function validateCommandCombination(commands, culture, playerArmy) {
    const culturalTactics = CULTURAL_TACTICS[culture];
    if (!culturalTactics) {
        console.warn(`No cultural tactics defined for ${culture}`);
        return commands;
    }

    // Validate formations against cultural restrictions
    const validatedCommands = commands.map(command => {
        if (command.formation) {
            const formationType = command.formation.type;
            
            // Check if formation is restricted for this culture
            if (culturalTactics.restrictedFormations.includes(formationType)) {
                console.warn(`${culture} cannot use ${formationType} formation`);
                command.culturalPenalty = 'restricted_formation';
                command.confidence *= 0.5; // Reduce confidence but allow
            }

            // Bonus for preferred formations
            if (culturalTactics.preferredFormations.includes(formationType)) {
                command.culturalBonus = 'preferred_formation';
                command.confidence = Math.min(1.0, command.confidence * 1.2);
            }
        }

        return command;
    });

    return validatedCommands;
}

/**
 * Apply cultural context and officer advice to orders
 */
function applyCulturalContext(orders, culture, battleState) {
    const culturalTactics = CULTURAL_TACTICS[culture] || {
        preferredFormations: ['line'],
        restrictedFormations: [],
        specialTactics: [],
        commandStyle: 'standard'
    };
    
    return {
        commands: orders,
        culture: culture,
        commandStyle: culturalTactics.commandStyle,
        culturalAdvice: generateCulturalAdvice(orders, culture, battleState),
        specialTactics: culturalTactics.specialTactics,
        processedAt: new Date()
    };
}

/**
 * Generate cultural-specific tactical advice
 */
function generateCulturalAdvice(orders, culture, battleState) {
    const advice = [];

    if (culture === 'Roman') {
        advice.push("Roman discipline requires coordinated movement");
        if (orders.some(cmd => cmd.formation && cmd.formation.type === 'testudo')) {
            advice.push("Testudo formation excellent for missile protection");
        }
    } else if (culture === 'Celtic') {
        advice.push("Celtic warriors fight best with freedom to charge");
        if (orders.some(cmd => cmd.action && cmd.action.type === 'attack')) {
            advice.push("The spirits of war favor bold assault");
        }
    } else if (culture === 'Sarmatian') {
        advice.push("Horse and bow - movement is life");
        if (orders.some(cmd => cmd.action && cmd.action.type === 'retreat')) {
            advice.push("Feigned retreat can become devastating counter-attack");
        }
    }

    return advice;
}

/**
 * Generate parsing error messages with cultural flavor
 */
function generateParsingError(orderText, culture, error) {
    const culturalResponses = {
        'Roman': "Centurion seeks clarification of orders, Commander.",
        'Celtic': "The war chief requests clearer battle-words, Lord.",
        'Han Chinese': "This humble general requires more precise instructions.",
        'Sarmatian': "The wind carries unclear words - speak again, Khan.",
        'Berber': "The desert speaks in riddles - clarify your will.",
        'Spartan': "Speak plainly.",
        'Mauryan': "Respectfully requesting clarification, General.",
        'Macedonian': "The phalanx awaits clearer commands."
    };

    return {
        error: error.message,
        culturalResponse: culturalResponses[culture] || "Orders unclear, please rephrase.",
        suggestions: generateOrderSuggestions(orderText, culture),
        originalText: orderText
    };
}

/**
 * Generate helpful order suggestions based on failed parsing
 */
function generateOrderSuggestions(failedText, culture) {
    const suggestions = [
        `Try: "advance ${culture === 'Sarmatian' ? 'cavalry' : 'infantry'} to enemy"`,
        `Try: "hold defensive position"`,
        `Try: "${culture === 'Roman' ? 'form testudo' : 'charge forward'}"`
    ];

    return suggestions;
}

module.exports = {
    parsePlayerOrders,
    generateParsingError,
    COMMAND_VOCABULARY,
    CULTURAL_TACTICS
};