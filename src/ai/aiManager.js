// Multi-provider AI management system
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');

let openai, anthropic, groq;

async function initializeAI() {
    try {
        // Initialize OpenAI (primary provider)
        if (process.env.OPENAI_API_KEY) {
            openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
            console.log('✅ OpenAI initialized');
        }
        
        // Initialize Anthropic (premium battles)
        if (process.env.ANTHROPIC_API_KEY) {
            anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY
            });
            console.log('✅ Anthropic initialized');
        }
        
        // Initialize Groq (simple scenarios)
        if (process.env.GROQ_API_KEY) {
            groq = new Groq({
                apiKey: process.env.GROQ_API_KEY
            });
            console.log('✅ Groq initialized');
        }
        
        if (!openai && !anthropic && !groq) {
            console.log('⚠️ No AI providers configured - battles will use template responses');
        }
        
    } catch (error) {
        console.error('❌ Error initializing AI providers:', error);
        throw error;
    }
}

async function generateBattleNarrative(battleContext, aiProvider = 'auto') {
    try {
        // Auto-select provider based on complexity
        if (aiProvider === 'auto') {
            aiProvider = selectBestProvider(battleContext);
        }
        
        switch (aiProvider) {
            case 'openai':
                return await generateWithOpenAI(battleContext);
            case 'anthropic':
                return await generateWithAnthropic(battleContext);
            case 'groq':
                return await generateWithGroq(battleContext);
            default:
                return generateTemplateResponse(battleContext);
        }
    } catch (error) {
        console.error('AI generation error:', error);
        return generateTemplateResponse(battleContext);
    }
}

function selectBestProvider(battleContext) {
    // Cost-optimized selection based on complexity
    const complexity = calculateBattleComplexity(battleContext);
    
    if (complexity >= 8 && anthropic) return 'anthropic';   // 5% complex battles
    if (complexity <= 3 && groq) return 'groq';           // 15% simple battles  
    if (openai) return 'openai';                           // 80% standard battles
    
    return 'template';
}

function calculateBattleComplexity(context) {
    let complexity = 1;
    
    // Add complexity for various factors
    if (context.eliteUnits > 1) complexity += 2;
    if (context.weather !== 'clear') complexity += 1;
    if (context.terrain !== 'plains') complexity += 1;
    if (context.turn > 8) complexity += 2;
    if (context.veteranOfficers > 5) complexity += 1;
    
    return complexity;
}

async function generateWithOpenAI(context) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: "You are the narrator for an ancient warfare strategy game. Generate dramatic, historically accurate battle narratives based on mathematical combat results."
            },
            {
                role: "user", 
                content: createBattlePrompt(context)
            }
        ],
        max_tokens: 800,
        temperature: 0.7
    });
    
    return response.choices[0].message.content;
}

async function generateWithAnthropic(context) {
    const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 800,
        messages: [
            {
                role: "user",
                content: `As the master narrator of ancient warfare, create a dramatic battle narrative: ${createBattlePrompt(context)}`
            }
        ]
    });
    
    return response.content[0].text;
}

async function generateWithGroq(context) {
    const response = await groq.chat.completions.create({
        model: "llama3-70b-8192",
        messages: [
            {
                role: "system",
                content: "Generate dramatic ancient battle narratives"
            },
            {
                role: "user",
                content: createBattlePrompt(context)
            }
        ],
        max_tokens: 600,
        temperature: 0.8
    });
    
    return response.choices[0].message.content;
}

function createBattlePrompt(context) {
    return `
Turn ${context.turn} - ${context.scenario}
Weather: ${context.weather}
Terrain: ${context.terrain}

Player Commands:
- Player 1: ${context.player1Command}
- Player 2: ${context.player2Command}

Mathematical Results:
${context.combatResults}

Create a 150-200 word narrative that:
1. Converts math into drama
2. Shows officer personalities
3. References weather/terrain effects
4. Ends with tactical setup for next turn
`;
}

function generateTemplateResponse(context) {
    // Fallback template system for when AI is unavailable
    return `⚔️ **TURN ${context.turn} RESOLUTION**

The battle rages across ${context.terrain} as ${context.weather} conditions affect the engagement.

${context.player1Command} while ${context.player2Command}.

**Combat Results:**
${context.combatResults || 'Battle continues with both sides holding position.'}

*The commanders prepare their next moves as the ancient warfare continues...*`;
}

async function generateOfficerTurnSummary(context, aiProvider = 'auto') {
    // Context: { culture, movesText, combats, casualties, detectedEnemies, tone }
    try {
        if (aiProvider === 'auto') aiProvider = (process.env.GROQ_API_KEY ? 'groq' : (process.env.OPENAI_API_KEY ? 'openai' : 'template'));
        const CULTURE_VOICES = {
            'Roman': 'Roman centurion: terse, disciplined, professional, battlefield commands, no flourish.',
            'Celtic': 'Celtic champion: bold, spirited, boastful, poetic edge, but keep one sentence.',
            'Han': 'Han Chinese general: formal, precise, strategic, measured diction.',
            'Macedonian': 'Macedonian officer: confident, tactical, phalanx-minded.',
            'Spartan': 'Spartan lochagos: laconic, minimal words, absolute resolve.',
            'Sarmatian': 'Steppe cavalry officer: mobile, situational, succinct.',
            'Berber': 'Desert raider: practical, terrain-aware, swift cadence.'
        };
        const culture = (context.culture || '').toLowerCase();
        let voice = CULTURE_VOICES.Roman;
        if (culture.includes('roman')) voice = CULTURE_VOICES.Roman;
        else if (culture.includes('celt')) voice = CULTURE_VOICES.Celtic;
        else if (culture.includes('han')) voice = CULTURE_VOICES.Han;
        else if (culture.includes('macedon')) voice = CULTURE_VOICES.Macedonian;
        else if (culture.includes('spartan')) voice = CULTURE_VOICES.Spartan;
        else if (culture.includes('sarmatian')) voice = CULTURE_VOICES.Sarmatian;
        else if (culture.includes('berber')) voice = CULTURE_VOICES.Berber;

        const systemStyle = `You are a ${context.culture || 'Roman'} officer. ${voice} Reply in ONE short sentence (max 18 words), present tense, no emojis.`;
        const userMsg = `Turn summary: moves=\n${context.movesText || 'none'}\ncombats=${context.combats||0}, casualties=${context.casualties||0}, enemiesDetected=${context.detectedEnemies||0}.`;

        if (aiProvider === 'groq' && groq) {
            const resp = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [ { role: 'system', content: systemStyle }, { role: 'user', content: userMsg } ],
                max_tokens: 50, temperature: 0.5
            });
            return resp.choices?.[0]?.message?.content?.trim();
        }
        if (aiProvider === 'openai' && openai) {
            const resp = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [ { role: 'system', content: systemStyle }, { role: 'user', content: userMsg } ],
                max_tokens: 40, temperature: 0.5
            });
            return resp.choices?.[0]?.message?.content?.trim();
        }
        // Template fallback
        if ((context.combats||0) > 0) return 'Contact made; lines engaged and holding.';
        if ((context.movesText||'').length > 0) return 'Units maneuvered to new positions; no contact reported.';
        return 'Holding positions; scouts report nothing significant.';
    } catch (e) {
        console.warn('Officer summary AI failed:', e.message);
        if ((context.combats||0) > 0) return 'Contact made; lines engaged and holding.';
        if ((context.movesText||'').length > 0) return 'Units maneuvered to new positions; no contact reported.';
        return 'Holding positions; scouts report nothing significant.';
    }
}

async function generateOrderAcknowledgement(context, aiProvider = 'auto') {
    // context: { culture, phrases }
    try {
        if (aiProvider === 'auto') aiProvider = (process.env.GROQ_API_KEY ? 'groq' : (process.env.OPENAI_API_KEY ? 'openai' : 'template'));
        const CULTURE_VOICES = {
            'Roman': 'Roman centurion: disciplined, professional, concise, first-person plural where fitting.',
            'Celtic': 'Celtic champion: spirited, confident, plain words, one sentence.',
            'Han': 'Han officer: formal, precise, one sentence.',
            'Macedonian': 'Macedonian phalangarch: confident and tactical.',
            'Spartan': 'Spartan: laconic, very short.',
            'Sarmatian': 'Steppe rider: practical, direct.',
            'Berber': 'Desert captain: terrain-aware, brisk.'
        };
        const culture = (context.culture || '').toLowerCase();
        let voice = CULTURE_VOICES.Roman;
        if (culture.includes('roman')) voice = CULTURE_VOICES.Roman;
        else if (culture.includes('celt')) voice = CULTURE_VOICES.Celtic;
        else if (culture.includes('han')) voice = CULTURE_VOICES.Han;
        else if (culture.includes('macedon')) voice = CULTURE_VOICES.Macedonian;
        else if (culture.includes('spartan')) voice = CULTURE_VOICES.Spartan;
        else if (culture.includes('sarmatian')) voice = CULTURE_VOICES.Sarmatian;
        else if (culture.includes('berber')) voice = CULTURE_VOICES.Berber;

        const systemStyle = `You are an officer acknowledging orders. ${voice} Reply in ONE sentence, present tense, no emojis. Quote-style not needed, start directly.`;
        const userMsg = `Orders summary: ${context.phrases}`;

        if (aiProvider === 'groq' && groq) {
            const resp = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [ { role: 'system', content: systemStyle }, { role: 'user', content: userMsg } ],
                max_tokens: 70, temperature: 0.5
            });
            return resp.choices?.[0]?.message?.content?.trim();
        }
        if (aiProvider === 'openai' && openai) {
            const resp = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [ { role: 'system', content: systemStyle }, { role: 'user', content: userMsg } ],
                max_tokens: 70, temperature: 0.5
            });
            return resp.choices?.[0]?.message?.content?.trim();
        }
        // Template fallback
        return `Yes, sir: ${context.phrases}.`;
    } catch (e) {
        console.warn('Order acknowledgement AI failed:', e.message);
        return `Yes, sir: ${context.phrases}.`;
    }
}

module.exports = {
    initializeAI,
    generateBattleNarrative,
    selectBestProvider,
    generateOfficerTurnSummary,
    generateOrderAcknowledgement
};
