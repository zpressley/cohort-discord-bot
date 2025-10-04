// src/ai/aiNarrativeEngine.js
// AI Narrative Integration - Convert Mathematical Combat to Historical Stories

const aiManager = require('./aiManager');

/**
 * AI Narrative Engine
 * Transforms mathematical combat results into immersive historical narratives
 * using cultural authenticity, officer personalities, and historical precedents
 */

// Cultural speech patterns and personality templates
const CULTURAL_PERSONALITIES = {
    'Roman': {
        officers: [
            { rank: 'Centurion', personality: 'professional_disciplined', speech: 'formal_military' },
            { rank: 'Optio', personality: 'experienced_practical', speech: 'direct_tactical' },
            { rank: 'Signifer', personality: 'proud_traditional', speech: 'honor_focused' }
        ],
        speechPatterns: {
            victory: ["The legion has prevailed", "Discipline conquers all", "For Rome and the Eagle"],
            defeat: ["We withdraw in good order", "The standards remain intact", "Rome remembers"],
            tactical: ["Form testudo", "Hold the line", "Maintain formation"],
            casualty: ["He died as a soldier should", "His service honors Rome", "The legion mourns"]
        },
        narrative_style: 'professional_systematic'
    },
    
    'Celtic': {
        officers: [
            { rank: 'Rí', personality: 'honor_obsessed', speech: 'poetic_fierce' },
            { rank: 'Champion', personality: 'battle_hungry', speech: 'boastful_heroic' },
            { rank: 'Bard', personality: 'memory_keeper', speech: 'storytelling_wise' }
        ],
        speechPatterns: {
            victory: ["The gods smile upon us!", "Our ancestors feast tonight!", "Blood and glory!"],
            defeat: ["We die as warriors should!", "The spirits call us home", "Honor in death!"],
            tactical: ["Charge like the wild hunt!", "Break their lines!", "For the tribe!"],
            casualty: ["He joins the eternal feast", "His song will be sung", "The heroes welcome him"]
        },
        narrative_style: 'heroic_passionate'
    },
    
    'Han Chinese': {
        officers: [
            { rank: 'General', personality: 'scholarly_strategic', speech: 'classical_wise' },
            { rank: 'Captain', personality: 'disciplined_loyal', speech: 'respectful_precise' },
            { rank: 'Sergeant', personality: 'veteran_practical', speech: 'experienced_direct' }
        ],
        speechPatterns: {
            victory: ["Heaven smiles upon the righteous", "Harmony through strength", "The Mandate holds"],
            defeat: ["We withdraw to fight another day", "Wisdom in retreat", "The cycle turns"],
            tactical: ["Crossbows, volley fire!", "Maintain formation!", "Coordinate advance!"],
            casualty: ["He served with honor", "His family will be remembered", "The dynasty mourns"]
        },
        narrative_style: 'strategic_philosophical'
    },
    
    'Macedonian': {
        officers: [
            { rank: 'Phalangarch', personality: 'alexander_inspired', speech: 'confident_tactical' },
            { rank: 'Lochagos', personality: 'veteran_experienced', speech: 'battle_hardened' },
            { rank: 'Taxiarch', personality: 'noble_professional', speech: 'aristocratic_military' }
        ],
        speechPatterns: {
            victory: ["As Alexander taught us!", "The sarissa conquers all!", "Macedonia triumphant!"],
            defeat: ["We fought with honor", "The phalanx holds", "Alexander would be proud"],
            tactical: ["Sarissas forward!", "Hold formation!", "Companions, charge!"],
            casualty: ["He died a Macedonian", "His valor echoes Alexander", "The phalanx remembers"]
        },
        narrative_style: 'heroic_tactical'
    },
    
    'Sarmatian': {
        officers: [
            { rank: 'Khan', personality: 'steppe_noble', speech: 'proud_nomadic' },
            { rank: 'Warrior', personality: 'horse_master', speech: 'fierce_mobile' },
            { rank: 'Shaman', personality: 'spirit_touched', speech: 'mystical_wise' }
        ],
        speechPatterns: {
            victory: ["Swift as wind, fierce as wolves!", "The steppe remembers!", "Iron scales triumph!"],
            defeat: ["Like smoke before wind", "The endless sky calls", "We ride to other battles"],
            tactical: ["Feigned retreat!", "Circle and strike!", "Horse and bow as one!"],
            casualty: ["He rides the eternal steppe", "His arrows find their mark in the sky", "The horses mourn"]
        },
        narrative_style: 'mobile_mystical'
    },
    
    'Berber': {
        officers: [
            { rank: 'Amghar', personality: 'desert_wise', speech: 'poetic_independent' },
            { rank: 'Warrior', personality: 'raid_master', speech: 'confident_mobile' },
            { rank: 'Guide', personality: 'survival_expert', speech: 'practical_desert' }
        ],
        speechPatterns: {
            victory: ["The desert winds carry us!", "Swift as the sandstorm!", "Free as the endless dunes!"],
            defeat: ["Like sand through fingers", "The winds change direction", "We vanish like mirages"],
            tactical: ["Strike and fade!", "The desert is our ally!", "Swift raid, swifter retreat!"],
            casualty: ["The sands claim another son", "He returns to the eternal desert", "His spirit rides the winds"]
        },
        narrative_style: 'nomadic_poetic'
    },
    
    'Spartan': {
        officers: [
            { rank: 'Lochagos', personality: 'laconic_disciplined', speech: 'terse_military' },
            { rank: 'Enomotarch', personality: 'veteran_hard', speech: 'brief_commanding' },
            { rank: 'Polemarch', personality: 'noble_warrior', speech: 'honor_absolute' }
        ],
        speechPatterns: {
            victory: ["Sparta stands.", "As was foretold.", "The law prevails."],
            defeat: ["We return with our shields.", "Sparta remembers.", "Death before dishonor."],
            tactical: ["Hold the line.", "Shields up.", "Forward, for Sparta."],
            casualty: ["He died well.", "Sparta honors him.", "His mother will be proud."]
        },
        narrative_style: 'laconic_absolute'
    },
    
    'Mauryan': {
        officers: [
            { rank: 'Senapati', personality: 'dharmic_wise', speech: 'philosophical_strategic' },
            { rank: 'Nayaka', personality: 'elephant_master', speech: 'confident_coordinated' },
            { rank: 'Adhyaksha', personality: 'administrative_precise', speech: 'organized_detailed' }
        ],
        speechPatterns: {
            victory: ["Dharma guides us to victory", "The wheel of law turns", "Righteousness prevails"],
            defeat: ["All things pass", "Wisdom in withdrawal", "The path teaches patience"],
            tactical: ["Elephants forward!", "Maintain formation!", "Coordinate the advance!"],
            casualty: ["His duty is fulfilled", "The wheel turns for all", "His dharma was complete"]
        },
        narrative_style: 'philosophical_organized'
    }
};

// Historical battle precedents database for narrative parallels
const HISTORICAL_PRECEDENTS = {
    'river_crossing_victory': {
        battles: ['Battle of Granicus (334 BCE)', 'Battle of Hydaspes (326 BCE)'],
        narrative_elements: [
            'swift current threatens crossing',
            'defenders hold opposite bank', 
            'cavalry charges through water',
            'formation disrupted by river'
        ]
    },
    'phalanx_vs_individual': {
        battles: ['Battle of Marathon (490 BCE)', 'Battle of Plataea (479 BCE)'],
        narrative_elements: [
            'bronze wall of spears',
            'individual warriors break on formation',
            'discipline defeats courage',
            'shield wall impenetrable'
        ]
    },
    'cavalry_breakthrough': {
        battles: ['Battle of Gaugamela (331 BCE)', 'Battle of Carrhae (53 BCE)'],
        narrative_elements: [
            'thundering hooves',
            'formation gaps exploited',
            'mobile strike force',
            'pursuit and harassment'
        ]
    },
    'defensive_victory': {
        battles: ['Battle of Thermopylae (480 BCE)', 'Battle of Watling Street (61 CE)'],
        narrative_elements: [
            'terrain advantage exploited',
            'disciplined defense',
            'numerical disadvantage overcome',
            'tactical positioning decisive'
        ]
    }
};

// Turn narrative templates based on combat intensity and result
const NARRATIVE_TEMPLATES = {
    'attacker_major_victory': {
        opening: "Steel rings against steel as {attacker_culture} forces surge forward...",
        development: "The {defender_formation} formation wavers under the devastating assault...",
        climax: "What began as resistance becomes rout as {tactical_development}...",
        resolution: "The battlefield belongs to {attacker_culture}, their victory complete."
    },
    'attacker_victory': {
        opening: "Battle cries echo across the {terrain} as {attacker_culture} advances...",
        development: "{Defender_culture} warriors fight with desperate courage but...",
        climax: "The tide turns decisively when {key_moment}...", 
        resolution: "Hard-fought victory goes to {attacker_culture} as {defender_culture} withdraws."
    },
    'stalemate': {
        opening: "Neither side yields as {attacker_culture} meets {defender_culture} in brutal combat...",
        development: "For every advance, a counter-advance; for every charge, a defense...",
        climax: "The melee reaches its peak as {tactical_moment} decides nothing...",
        resolution: "Both armies bloodied, neither defeated, as battle continues..."
    },
    'defender_victory': {
        opening: "{Attacker_culture} forces crash against {defender_culture} positions...",
        development: "Initial momentum fades as {defender_formation} holds firm...",
        climax: "The tables turn when {defensive_moment} breaks the attack...",
        resolution: "{Defender_culture} stands victorious as {attacker_culture} falls back."
    }
};

/**
 * Main AI Narrative Generation Function
 * @param {Object} combatResult - Mathematical combat resolution results
 * @param {Object} battleContext - Battle state, units, formations, terrain
 * @param {Object} officerMemories - Individual officer experiences and knowledge
 * @param {Object} turnHistory - Previous turn outcomes for continuity
 * @returns {Object} Rich narrative with officer reports and dramatic resolution
 */
async function generateBattleNarrative(combatResult, battleContext, officerMemories = {}, turnHistory = []) {
    try {
        // Step 1: Identify historical parallel
        const historicalParallel = findHistoricalParallel(combatResult, battleContext);
        
        // Step 2: Generate cultural officer perspectives
        const officerReports = generateOfficerReports(
            combatResult,
            battleContext,
            officerMemories
        );
        
        // Step 3: Create main battle narrative
        const mainNarrative = await generateMainNarrative(
            combatResult,
            battleContext,
            historicalParallel,
            turnHistory
        );
        
        // Step 4: Generate tactical situation analysis
        const tacticalAnalysis = generateTacticalAnalysis(
            combatResult,
            battleContext,
            officerMemories
        );
        
        // Step 5: Create next turn setup
        const nextTurnSetup = generateNextTurnSetup(
            combatResult,
            battleContext,
            tacticalAnalysis
        );
        
        return {
            mainNarrative,
            officerReports,
            tacticalAnalysis,
            nextTurnSetup,
            historicalParallel: historicalParallel.reference
        };
        
    } catch (error) {
        console.error('AI Narrative generation error:', error);
        // Fallback to basic narrative
        return generateFallbackNarrative(combatResult, battleContext);
    }
}

/**
 * Find closest historical battle parallel for authentic narrative context
 */
function findHistoricalParallel(combatResult, battleContext) {
    const { attackerCulture, defenderCulture, terrain, formations } = battleContext;
    
    // Match based on multiple factors
    let bestMatch = null;
    let matchScore = 0;
    
    for (const [key, precedent] of Object.entries(HISTORICAL_PRECEDENTS)) {
        let score = 0;
        
        // Terrain match
        if (key.includes(terrain)) score += 3;
        
        // Formation interaction match
        if (key.includes(formations.attacker) || key.includes(formations.defender)) score += 2;
        
        // Combat result match
        if (key.includes(combatResult.result.split('_')[1])) score += 2;
        
        // Cultural match (bonus for historical enemies)
        if ((attackerCulture === 'Roman' && defenderCulture === 'Celtic') ||
            (attackerCulture === 'Macedonian' && defenderCulture === 'Persian')) {
            score += 1;
        }
        
        if (score > matchScore) {
            matchScore = score;
            bestMatch = { key, ...precedent };
        }
    }
    
    return bestMatch || {
        key: 'generic_ancient_battle',
        reference: 'Ancient warfare precedent',
        narrative_elements: ['clash of arms', 'tactical discipline', 'warrior courage']
    };
}

/**
 * Generate officer reports from cultural perspectives
 */
function generateOfficerReports(combatResult, battleContext, officerMemories) {
    const reports = {};
    
    // Attacker officer report
    const attackerCulture = CULTURAL_PERSONALITIES[battleContext.attackerCulture];
    if (attackerCulture) {
        const officer = attackerCulture.officers[0]; // Senior officer
        reports.attacker = generateOfficerPerspective(
            officer,
            attackerCulture,
            combatResult,
            'attacker',
            officerMemories.attacker
        );
    }
    
    // Defender officer report  
    const defenderCulture = CULTURAL_PERSONALITIES[battleContext.defenderCulture];
    if (defenderCulture) {
        const officer = defenderCulture.officers[0]; // Senior officer
        reports.defender = generateOfficerPerspective(
            officer,
            defenderCulture,
            combatResult,
            'defender',
            officerMemories.defender
        );
    }
    
    return reports;
}

/**
 * Generate individual officer perspective based on cultural personality
 */
function generateOfficerPerspective(officer, culture, combatResult, side, memories = {}) {
    const isWinner = (side === 'attacker' && combatResult.result.includes('attacker')) ||
                    (side === 'defender' && combatResult.result.includes('defender'));
    
    const speechType = isWinner ? 'victory' : (combatResult.result === 'stalemate' ? 'tactical' : 'defeat');
    const speechPattern = culture.speechPatterns[speechType];
    
    // Select appropriate speech based on officer personality and memories
    let officerSpeech = speechPattern[Math.floor(Math.random() * speechPattern.length)];
    
    // Add personal touch based on memories
    let memoryContext = '';
    if (memories.battleExperience > 5) {
        memoryContext = "The veteran's eyes narrow - ";
    } else if (memories.battleExperience < 2) {
        memoryContext = "Young but determined, ";
    }
    
    // Add tactical analysis based on cultural fighting style
    let tacticalNote = '';
    if (culture.narrative_style === 'professional_systematic') {
        tacticalNote = generateRomanTacticalNote(combatResult);
    } else if (culture.narrative_style === 'heroic_passionate') {
        tacticalNote = generateCelticHeroicNote(combatResult);
    }
    
    return {
        officerName: memories.name || `${officer.rank} ${generateOfficerName(culture)}`,
        rank: officer.rank,
        speech: `${memoryContext}"${officerSpeech}${tacticalNote}"`,
        personality: officer.personality,
        experience: memories.battleExperience || 1
    };
}

/**
 * Generate main battle narrative using AI with structured context
 */
async function generateMainNarrative(combatResult, battleContext, historicalParallel, turnHistory) {
    // Use fallback for now until AI is properly configured
    return generateFallbackNarrative(combatResult, battleContext);
}

/**
 * Build comprehensive AI prompt for narrative generation
 */
function buildNarrativePrompt(context) {
    const { combatResult, battleContext, historicalParallel, template } = context;
    
    return `Generate an immersive ancient battle narrative based on this combat resolution:

COMBAT RESULT:
- Winner: ${combatResult.result}
- Intensity: ${combatResult.intensity}
- Combat Ratio: ${combatResult.combatRatio.toFixed(2)}

BATTLE CONTEXT:
- Attacker: ${battleContext.attackerCulture} (${battleContext.formations.attacker} formation)
- Defender: ${battleContext.defenderCulture} (${battleContext.formations.defender} formation) 
- Terrain: ${battleContext.terrain}
- Turn: ${battleContext.turnNumber}

HISTORICAL PARALLEL: ${historicalParallel.reference}
Use these authentic elements: ${historicalParallel.narrative_elements.join(', ')}

NARRATIVE TEMPLATE:
${template.opening}
${template.development}
${template.climax}
${template.resolution}

REQUIREMENTS:
1. Use authentic ancient warfare terminology and tactics
2. Reference specific weapons, formations, and cultural fighting styles
3. Include visceral combat descriptions but avoid excessive gore
4. Maintain historical authenticity - no anachronisms
5. Create emotional weight through character details
6. Length: 200-300 words
7. Write in present tense for immediacy

Generate the narrative now:`;
}

/**
 * Generate tactical analysis for next turn planning
 */
function generateTacticalAnalysis(combatResult, battleContext, officerMemories) {
    const analysis = {
        keyDevelopments: [],
        tacticalOpportunities: [],
        threats: [],
        recommendations: []
    };
    
    // Analyze combat result implications
    if (combatResult.intensity === 'decisive') {
        analysis.keyDevelopments.push('Formation integrity compromised');
        analysis.tacticalOpportunities.push('Exploitation of gaps possible');
    }
    
    if (combatResult.result.includes('attacker')) {
        analysis.keyDevelopments.push('Attacking forces gain momentum');
        analysis.threats.push('Defender morale weakening');
    }
    
    // Add officer-specific insights based on experience
    if (officerMemories.attacker && officerMemories.attacker.battleExperience > 3) {
        analysis.recommendations.push('Veteran advice: Press advantage while enemy regroups');
    }
    
    return analysis;
}

/**
 * Generate setup for next turn based on current results
 */
function generateNextTurnSetup(combatResult, battleContext, tacticalAnalysis) {
    return {
        battlefieldState: `${combatResult.result} creates new tactical situation`,
        nextTurnPrompt: `Turn ${battleContext.turnNumber + 1} - What are your orders, Commander?`,
        tacticalSuggestions: tacticalAnalysis.recommendations,
        availableActions: generateAvailableActions(combatResult, battleContext)
    };
}

/**
 * Generate list of tactical actions available based on battle state
 */
function generateAvailableActions(combatResult, battleContext) {
    const actions = ['advance', 'hold position', 'retreat', 'flank left', 'flank right'];
    
    // Add situation-specific actions
    if (combatResult.intensity === 'decisive') {
        if (combatResult.result.includes('attacker')) {
            actions.push('pursue routed enemy', 'consolidate gains');
        } else {
            actions.push('rally troops', 'defensive withdrawal');
        }
    }
    
    // Add terrain-specific actions
    if (battleContext.terrain === 'river') {
        actions.push('secure crossing', 'contest ford');
    }
    
    return actions;
}

/**
 * Fallback narrative for when AI fails
 */
function generateFallbackNarrative(combatResult, battleContext) {
    const winner = combatResult.result.includes('attacker') ? battleContext.attackerCulture : 
                  combatResult.result.includes('defender') ? battleContext.defenderCulture : 'Neither side';
    
    return {
        mainNarrative: {
            fullNarrative: `The clash of arms echoes across the ${battleContext.terrain} as ${battleContext.attackerCulture} forces engage ${battleContext.defenderCulture} defenders. After fierce fighting, ${winner} emerges victorious in this ${combatResult.intensity} engagement.`,
            template: 'fallback',
            historicalReference: 'Ancient warfare'
        },
        officerReports: {
            attacker: { speech: '"The battle is decided."', rank: 'Commander' },
            defender: { speech: '"We fight with honor."', rank: 'Commander' }
        },
        tacticalAnalysis: { keyDevelopments: ['Combat resolved'] },
        nextTurnSetup: { nextTurnPrompt: 'What are your next orders?' }
    };
}

/**
 * Helper functions for cultural-specific tactical notes
 */
function generateRomanTacticalNote(combatResult) {
    if (combatResult.intensity === 'decisive') return ' We must consolidate our gains systematically.';
    if (combatResult.result.includes('defeat')) return ' An orderly withdrawal preserves the legion.';
    return ' Discipline will see us through.';
}

function generateCelticHeroicNote(combatResult) {
    if (combatResult.intensity === 'decisive') return ' The spirits of war favor the brave!';
    if (combatResult.result.includes('defeat')) return ' We die with songs on our lips!';
    return ' Courage conquers all!';
}

/**
 * Generate culturally appropriate officer names
 */
function generateOfficerName(culture) {
    const names = {
        'Roman': ['Marcus', 'Gaius', 'Lucius', 'Quintus', 'Titus'],
        'Celtic': ['Brennus', 'Vercingetorix', 'Ambiorix', 'Caratacus', 'Boudicca'],
        'Han Chinese': ['Wei', 'Liu', 'Zhang', 'Wang', 'Li'],
        'Macedonian': ['Alexander', 'Philip', 'Parmenion', 'Cleitus', 'Hephaestion'],
        'Sarmatian': ['Arsaces', 'Tiridates', 'Vologases', 'Pacorus', 'Orodes'],
        'Berber': ['Massinissa', 'Jugurtha', 'Tacfarinas', 'Firmus', 'Gildo'],
        'Spartan': ['Leonidas', 'Pausanias', 'Cleomenes', 'Agesilaus', 'Lysander'],
        'Mauryan': ['Chandragupta', 'Bindusara', 'Ashoka', 'Pushyamitra', 'Brihadratha']
    };
    
    const culturalNames = names[culture] || names['Roman'];
    return culturalNames[Math.floor(Math.random() * culturalNames.length)];
}

module.exports = {
    generateBattleNarrative,
    generateOfficerReports,
    findHistoricalParallel,
    CULTURAL_PERSONALITIES,
    HISTORICAL_PRECEDENTS,
    NARRATIVE_TEMPLATES
};