// src/ai/openingNarrative.js
// Generate atmospheric opening narratives for battles
// Version: 1.0.0

const Groq = require('groq-sdk');

const GROQ_ENABLED = !!process.env.GROQ_API_KEY;

/**
 * Generate opening narrative when battle begins
 * @param {Object} battle - Battle record
 * @param {Object} player1Commander - Player 1 commander
 * @param {Object} player2Commander - Player 2 commander
 * @returns {Promise<string>} Opening narrative
 */
async function generateOpeningNarrative(battle, player1Commander, player2Commander) {
    const prompt = buildOpeningPrompt(battle, player1Commander, player2Commander);
    
    if (!GROQ_ENABLED) {
        console.log('ℹ️ No AI available - using template opening');
        return generateTemplateOpening(battle, player1Commander, player2Commander);
    }
    
    try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        
        console.log('🤖 Generating opening narrative with Groq...');
        
        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content: 'You are a master storyteller of ancient warfare. Create atmospheric, historically authentic opening scenes for battles. Write in present tense. Set the scene with vivid sensory details - sights, sounds, smells. Introduce both sides with their cultural character. Build anticipation. 2-3 paragraphs maximum.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 400,
            temperature: 0.9 // Higher creativity for scene-setting
        });
        
        return response.choices[0].message.content;
        
    } catch (error) {
        console.warn('⚠️ Opening narrative AI failed:', error.message);
        return generateTemplateOpening(battle, player1Commander, player2Commander);
    }
}

/**
 * Build AI prompt for opening narrative
 */
function buildOpeningPrompt(battle, player1Commander, player2Commander) {
    const scenarioDescriptions = {
        'river_crossing': 'a strategic river crossing with multiple stone fords',
        'bridge_control': 'an ancient stone bridge spanning a swift river',
        'forest_ambush': 'dense woodland where ambushers wait in the shadows',
        'hill_fort_assault': 'a fortified hilltop position with steep approaches',
        'desert_oasis': 'a vital desert oasis, the only water source for miles'
    };
    
    const weatherDescriptions = {
        'clear': 'Dawn breaks clear and bright',
        'light_rain': 'Light rain falls, creating muddy conditions',
        'heavy_rain': 'Heavy rain pounds the battlefield, limiting visibility',
        'fog': 'Dense morning fog shrouds the terrain',
        'extreme_heat': 'The sun beats down mercilessly',
        'wind': 'Strong winds whip across the battlefield',
        'cold': 'Bitter cold grips the morning air',
        'storm': 'A violent storm rages overhead'
    };
    
    return `Create a dramatic opening scene for an ancient battle:

**SETTING:**
Scenario: ${scenarioDescriptions[battle.scenario] || battle.scenario}
Weather: ${weatherDescriptions[battle.weather] || battle.weather}
Time: Dawn of the first day

**FORCES:**
Commander 1: ${player1Commander.culture}
- Army: ${player1Commander.armyComposition.units.length} units
- Cultural identity: ${getCulturalIdentity(player1Commander.culture)}

Commander 2: ${player2Commander.culture}
- Army: ${player2Commander.armyComposition.units.length} units  
- Cultural identity: ${getCulturalIdentity(player2Commander.culture)}

**TASK:**
Write the opening scene in 2-3 paragraphs:
1. Set the atmospheric scene with sensory details
2. Introduce both commanders and their forces
3. Build anticipation for the coming clash

Use historically authentic details. Present tense. No dialogue yet - save that for battle.`;
}

/**
 * Get cultural identity description for AI context
 */
function getCulturalIdentity(culture) {
    const identities = {
        'Roman Republic': 'Disciplined legionaries, professional soldiers, systematic tactics',
        'Celtic Tribes': 'Fierce warriors, individual courage, wild battle fury',
        'Han Dynasty': 'Coordinated forces, crossbow volleys, strategic precision',
        'Macedonian Kingdoms': 'Sarissa phalanx, combined arms mastery, Alexandrian tactics',
        'Spartan City-State': 'Elite hoplites, never retreat, absolute discipline',
        'Sarmatian Confederations': 'Heavy cavalry, horse archery, steppe mobility',
        'Berber Confederations': 'Desert raiders, swift cavalry, hit-and-run masters',
        'Kingdom of Kush': 'Master archers, Nubian bows, desert warfare experts',
        'Carthaginian Empire': 'Mercenary coordination, war elephants, wealthy professionals'
    };
    
    return identities[culture] || 'Ancient warriors';
}

/**
 * Template opening for when AI unavailable
 */
function generateTemplateOpening(battle, player1Commander, player2Commander) {
    const weatherDesc = {
        'clear': 'a clear morning',
        'light_rain': 'light rain falling',
        'fog': 'thick morning fog',
        'heavy_rain': 'torrential rain'
    };
    
    return `Dawn breaks over the battlefield under ${weatherDesc[battle.weather] || 'uncertain skies'}. ` +
           `${player1Commander.culture} forces take position on one side, while ${player2Commander.culture} warriors ` +
           `array themselves opposite. The air crackles with tension as both armies prepare for the coming clash. ` +
           `Soon, steel will ring against steel and the fate of this engagement will be decided by courage, ` +
           `tactics, and the fortunes of war.`;
}

module.exports = {
    initializeBattle,
    deployUnitsToStartingPositions,
    generateOpeningNarrative
};