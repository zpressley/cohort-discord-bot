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
    // Context may include:
    // { culture, movesText, combats, casualties, detectedEnemies, speakerName, speakerRole,
    //   personality, experienceLevel, concern, recommendation, question }
    try {
        const enemiesDetected = context.detectedEnemies || 0;
        const combats = context.combats || 0;
        const movesText = context.movesText || '';

        // Hard FOW guard: if nothing has been detected and there are no combats,
        // return deterministic, culture-aware templates instead of calling an LLM.
        if (enemiesDetected === 0 && combats === 0) {
            const culture = (context.culture || '').toLowerCase();
            if (movesText.length > 0) {
                // Movement but no sightings this turn.
                if (culture.includes('spartan')) {
                    return 'Units maneuvered; no enemy in sight.';
                }
                return 'Units maneuvered to new positions; no enemy contact reported.';
            }
            // Completely quiet turn.
            if (culture.includes('spartan')) {
                return 'All quiet. No enemy in sight.';
            }
            if (culture.includes('roman')) {
                return 'All quiet, sir; scouts report no enemy contact.';
            }
            return 'All quiet; no enemy contact reported.';
        }

        if (aiProvider === 'auto') aiProvider = (process.env.GROQ_API_KEY ? 'groq' : (process.env.OPENAI_API_KEY ? 'openai' : 'template'));
        const CULTURE_VOICES = {
            'Roman': 'Roman centurion: terse, disciplined, professional, battlefield commands, no flourish.',
            'Celtic': 'Celtic champion: bold, spirited, boastful, but keep it focused.',
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

        const name = context.speakerName || 'your officer';
        const role = context.speakerRole || 'staff officer';
        const concern = context.concern || 'current tactical situation';
        const recommendation = context.recommendation || '';
        const question = context.question || '';

        const systemStyle = `You are ${name}, ${role}, in a ${context.culture || 'Roman'} army. ${voice} ` +
            'Reply in ONE short sentence (max 24 words), present tense, no emojis. ' +
            'Do not restate unit positions or exact numbers; give tactical advice, warning, or a direct question to the commander.';

        const userMsg = `Facts: concern=${concern}; recommendation=${recommendation}; questionToCommander=${question}; combats=${context.combats||0}, casualties=${context.casualties||0}, enemiesDetected=${context.detectedEnemies||0}.`;

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

async function generateOfficerResponse(prompt, provider = 'groq') {
    if (provider === 'groq' && groq) {
        const resp = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.7
        });
        return resp.choices[0].message.content.trim();
    }
    
    if (openai) {
        const resp = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.7
        });
        return resp.choices[0].message.content.trim();
    }
    
    return 'AI not available, Commander.';
}


async function generateOfficerDialogue(officerName, culture, prompt) {
    try {
        if (!openai) {
            throw new Error('OpenAI not initialized');
        }

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: `You are ${officerName}, an officer in a ${culture} army. Speak naturally, in-character, 2-3 sentences.` },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 200
        });
        
        return response.choices[0].message.content;
        
    } catch (error) {
        console.error('generateOfficerDialogue error:', error.message);
        throw error;
    }
}

// ── OFFICER Q&A ────────────────────────────────────────────────────────────────
// Merged from officerQA.js

const { filterBattleStateForPlayer, generateIntelligenceReport } = require('../game/fogOfWar');

/**
 * Answer player's tactical question as cultural officer
 */
async function answerTacticalQuestion(question, battleState, playerSide, eliteUnit) {
    const visibleState = filterBattleStateForPlayer(battleState, playerSide);
    const relevantMemories = getRelevantMemories(eliteUnit, question, battleState);
    const prompt = buildOfficerQuestionPrompt(
        question,
        visibleState,
        relevantMemories,
        visibleState.yourForces.army.culture
    );
    const response = await callAIForQuestion(prompt);
    return {
        officerName: getOfficerName(visibleState.yourForces.army.culture),
        response: response.answer,
        confidence: response.confidence,
        basedOn: response.basedOn
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
    const relevant = memories.filter(memory => {
        if (memory.enemyCulture === opponentCulture) return true;
        if (lowerQuestion.includes('river') && memory.terrain === 'river') return true;
        if (lowerQuestion.includes('forest') && memory.terrain === 'forest') return true;
        if (lowerQuestion.includes('hill') && memory.terrain === 'hill') return true;
        if (lowerQuestion.includes('flank') && memory.tacticType === 'flanking') return true;
        if (lowerQuestion.includes('cavalry') && memory.enemyUnitType === 'cavalry') return true;
        return false;
    });
    return relevant.slice(0, 3);
}

/**
 * Call AI for officer question answering
 */
async function callAIForQuestion(prompt) {
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

/**
 * Generate veteran warning using Groq AI
 */
async function generateVeteranWarning(veteran, triggers, orderText, battleState, playerSide) {
    const triggerContext = triggers.map(t => {
        switch(t.type) {
            case 'historical_knowledge':
                return `You have fought ${t.context.enemyCulture} before and know their tactics`;
            case 'battle_memory':
                return `This reminds you of ${t.context.memory.memory.description} - outcome was ${t.context.memory.outcome}`;
            case 'morale_concern':
                return `Current morale is ${t.context.unitMorale}% - ${t.context.issue}`;
            case 'tactical_risk':
                return `Tactical risk detected: ${t.context.risk}`;
            default:
                return '';
        }
    }).join('. ');

    const prompt = `You are ${veteran.name}, a veteran officer with ${veteran.battles} battles of experience.

Order received: "${orderText}"

Context: ${triggerContext}

Generate a SHORT warning (2-3 sentences max) that:
- Expresses concern about the order
- References specific experience/knowledge
- Stays in character (gruff veteran, not flowery)
- Ends with acknowledgment you'll follow orders if commanded

Example: "Sir, I've seen this before against the Celts at Alesia. They baited us into the woods and slaughtered us. Your call, but I recommend caution."

Generate the warning:`;

    try {
        if (process.env.GROQ_API_KEY) {
            const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
            const response = await groqClient.chat.completions.create({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "You are a gruff, experienced ancient warfare veteran officer. Keep responses brief (2-3 sentences)." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 150,
                temperature: 0.8
            });
            return response.choices[0].message.content.trim();
        }
        throw new Error('Groq API key not configured');
    } catch (error) {
        console.error('AI warning generation failed:', error.message);
        const trigger = triggers[0];
        if (trigger.type === 'battle_memory') {
            return `Sir, this reminds me of ${trigger.context.memory.memory.description}. That ended in ${trigger.context.memory.outcome}. I'll follow your orders, but we should be cautious.`;
        }
        if (trigger.type === 'morale_concern') {
            return `Commander, the men are wavering. Morale is low - this order may break them. Your command is law, but I must warn you.`;
        }
        return `Sir, I have concerns about this order based on my experience. This carries significant risk. But I'll follow your command if you insist.`;
    }
}

/**
 * Call Groq AI directly (legacy helper used by briefing.js and orders.js)
 */
async function callGroqAI(prompt, systemPrompt = null) {
    if (!groq) throw new Error('Groq not initialized');
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages,
        max_tokens: 300,
        temperature: 0.7
    });
    return response.choices[0].message.content.trim();
}

module.exports = {
    initializeAI,
    generateBattleNarrative,
    selectBestProvider,
    generateOfficerTurnSummary,
    generateOrderAcknowledgement,
    generateOfficerDialogue,
    generateOfficerResponse,
    // officer Q&A
    answerTacticalQuestion,
    buildOfficerQuestionPrompt,
    getCulturalPersonality,
    getRelevantMemories,
    generateVeteranWarning,
    formatVisibleIntel,
    getOfficerName,
    callGroqAI
};

