// src/ai/officerQA.js
// AI officer responses to tactical questions

const { filterBattleStateForPlayer } = require('../game/fogOfWar');
const { generateIntelligenceReport } = require('../game/fogOfWar');

/**
 * Answer player's tactical question as cultural officer
 * @param {string} question - Player's question
 * @param {Object} battleState - Current battle state
 * @param {string} playerSide - 'player1' or 'player2'
 * @param {Object} eliteUnit - Player's elite unit with veteran memories
 * @returns {Object} Officer's response
 */
async function answerTacticalQuestion(question, battleState, playerSide, eliteUnit) {
    // Filter battle state to only what this player can see
    const visibleState = filterBattleStateForPlayer(battleState, playerSide);
    
    // Get relevant veteran memories
    const relevantMemories = getRelevantMemories(eliteUnit, question, battleState);
    
    // Build AI prompt
    const prompt = buildOfficerQuestionPrompt(
        question,
        visibleState,
        relevantMemories,
        visibleState.yourForces.army.culture
    );
    
    // Call AI (placeholder for real integration)
    const response = await callAIForQuestion(prompt);
    
    return {
        officerName: getOfficerName(visibleState.yourForces.army.culture),
        response: response.answer,
        confidence: response.confidence,
        basedOn: response.basedOn // What information was used
    };
}

/**
 * Build AI prompt for officer Q&A
 */
function buildOfficerQuestionPrompt(question, visibleState, memories, culture) {
    const culturalPersonality = getCulturalPersonality(culture);
    
    const enemyList = formatVisibleIntel(visibleState.enemyForces);
    
    return `You are ${culturalPersonality.officerName}. Commander asks: "${question}"

VISIBLE ENEMIES:
${enemyList}

WEATHER: ${visibleState.weather} • TURN: ${visibleState.turnNumber}

${memories.length > 0 ? `PAST EXPERIENCE: ${memories[0].description}` : ''}

CRITICAL - MAXIMUM 15 WORDS TOTAL:
- ${culturalPersonality.speechStyle}
- Direct answer only
- Reference positions if relevant
- If unknown: "Haven't seen any, sir"

ONE BRIEF SENTENCE. NO explanations. NO recommendations unless asked.`;
}
function formatVisibleIntel(enemyForces) {
    if (!enemyForces) return 'No enemy contact';
    
    const allUnits = [
        ...(enemyForces.detectedUnits || []),
        ...(enemyForces.estimatedUnits || []),
        ...(enemyForces.suspectedActivity || [])
    ];
    
    if (allUnits.length === 0) return 'No enemy contact';
    
    return allUnits.slice(0, 5).map(e => 
        `- ${e.unitType || e.unitClass || 'Infantry'} at ${e.position}`
    ).join('\n');
}

/**
 * Get cultural officer personality
 */
function getCulturalPersonality(culture) {
    const personalities = {
        'Roman Republic': {
            officerName: 'Centurion Marcus',
            description: 'professional Roman officer, engineering-focused, disciplined',
            speechStyle: 'Professional, direct, formal. Use "sir" frequently.',
            additional: 'Romans value systematic tactics, fortifications, and combined arms coordination.'
        },
        'Celtic': {
            officerName: 'Brennus the Bold',
            description: 'Celtic war chief, honor-obsessed, poetically fierce',
            speechStyle: 'Bold, poetic, honor-focused. Use metaphors and valor language.',
            additional: 'Celts value individual courage, bold charges, and glorious combat.'
        },
        'Spartan City-State': {
            officerName: 'Lochagos Leonidas',
            description: 'Spartan officer, laconic, duty-bound',
            speechStyle: 'Extremely brief. Maximum 1-2 sentences. No elaboration.',
            additional: 'Spartans speak minimally. Never explain or justify. Just facts.'
        },
        'Han Dynasty': {
            officerName: 'General Zhang',
            description: 'Han military scholar, strategic thinker, coordinated tactician',
            speechStyle: 'Scholarly, strategic, emphasizes coordination and discipline.',
            additional: 'Han officers quote strategic texts and emphasize systematic approaches.'
        },
        'Macedonian Kingdoms': {
            officerName: 'Phalangarch Ptolemy',
            description: 'Macedonian officer, Alexander-inspired, combined arms specialist',
            speechStyle: 'Reference Alexander, emphasize phalanx and cavalry coordination.',
            additional: 'Macedonians value the combined arms doctrine of pike and cavalry.'
        },
        'Sarmatian Confederations': {
            officerName: 'Khan Arvan',
            description: 'Sarmatian cavalry lord, mobile warfare expert',
            speechStyle: 'Brief, focused on mobility and horse tactics.',
            additional: 'Sarmatians are steppe cavalry masters, favor speed and archery.'
        },
        'Berber Confederations': {
            officerName: 'Amghar Massin',
            description: 'Berber tribal leader, desert warfare specialist',
            speechStyle: 'Poetic references to desert, wind, and speed.',
            additional: 'Berbers are raiders and desert masters, value mobility.'
        },
        'Kingdom of Kush': {
            officerName: 'Master Archer Kashta',
            description: 'Kushite archery master, descendant of Ta-Seti traditions',
            speechStyle: 'Proud, emphasizes archery supremacy and Nubian heritage.',
            additional: 'Kushites are master archers from "Land of the Bow", value precision.'
        }
    };
    
    return personalities[culture] || {
        officerName: 'Commander',
        description: 'military officer',
        speechStyle: 'Professional and direct',
        additional: ''
    };
}

/**
 * Get relevant memories from elite unit's veteran experience
 */
function getRelevantMemories(eliteUnit, question, battleState) {
    if (!eliteUnit || !eliteUnit.institutionalMemory) return [];
    
    const memories = eliteUnit.institutionalMemory || [];
    const lowerQuestion = question.toLowerCase();
    const opponentCulture = battleState.player1Culture === eliteUnit.culture ? 
        battleState.player2Culture : battleState.player1Culture;
    
    // Find memories relevant to question
    const relevant = memories.filter(memory => {
        // Memories about current enemy culture
        if (memory.enemyCulture === opponentCulture) return true;
        
        // Memories about terrain types
        if (lowerQuestion.includes('river') && memory.terrain === 'river') return true;
        if (lowerQuestion.includes('forest') && memory.terrain === 'forest') return true;
        if (lowerQuestion.includes('hill') && memory.terrain === 'hill') return true;
        
        // Tactical pattern memories
        if (lowerQuestion.includes('flank') && memory.tacticType === 'flanking') return true;
        if (lowerQuestion.includes('cavalry') && memory.enemyUnitType === 'cavalry') return true;
        
        return false;
    });
    
    return relevant.slice(0, 3); // Max 3 most relevant memories
}

/**
 * Call AI for officer question answering
 */
async function callAIForQuestion(prompt) {
    const { generateOfficerResponse } = require('./aiManager');
    
    try {
        const response = await generateOfficerResponse(prompt, 'groq');
        
        return {
            answer: response.trim(),
            confidence: 'medium',
            basedOn: ['visible intel']
        };
    } catch (err) {
        console.error('Officer Q&A failed:', err);
        return {
            answer: 'Apologies, Commander - battle noise interfering. Rephrase?',
            confidence: 'low',
            basedOn: []
        };
    }
}

/**
 * Get officer name by culture
 */
function getOfficerName(culture) {
    return getCulturalPersonality(culture).officerName;
}

module.exports = {
    answerTacticalQuestion,
    buildOfficerQuestionPrompt,
    getCulturalPersonality,
    getRelevantMemories,
    formatVisibleIntel
};