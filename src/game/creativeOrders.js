// src/game/creativeOrders.js
// Creative environmental tactics with deterministic requirements + AI novel evaluation

const CREATIVE_TACTICS = {
    'swimming_crossing': {
        patterns: [/swim|wade through river(?! crossing)/i],
        requirements: {
            terrain: ['river'],
            unitType: 'light_only',
            weather: 'not_freezing',
            time: 1
        },
        effects: {
            casualties_immediate: 20, // 20% drown
            formation_broken: true,
            surprise_bonus: 2,
            equipment_penalty: -1 // Waterlogged shields
        },
        historical: "Caesar's Rhine crossings involved swimming scouts, heavy casualties",
        officerWarning: "Sir, swimming in armor means drowning. We'll lose one in five men before we even fight. Light troops only, and even then...",
        mechanicsNote: 'Apply 20% casualties, break formation, +2 surprise if enemy unaware'
    },
    
    'ambush_concealment': {
        patterns: [/hide in|conceal in|ambush from (mud|marsh|forest|brush|bog)/i],
        requirements: {
            terrain: ['forest', 'marsh'],
            unitType: 'light_infantry',
            turns_early: 1
        },
        effects: {
            ambush_attack: 4,
            detection_penalty: -3,
            mobility_while_hidden: -2,
            revealed_on_attack: true
        },
        historical: "Teutoburg Forest (9 AD) - Germanic ambushes from forest",
        officerWarning: "Classic ambush. We hide, wait, strike first. But we're committed - can't reposition once hidden.",
        mechanicsNote: 'Unit gains +4 first attack, enemy -3 to detect, but -2 mobility while concealed'
    },
    
    'fire_tactics': {
        patterns: [/set fire|burn|fire arrows|flaming|torch/i],
        requirements: {
            equipment: ['engineers', 'oil', 'combustibles'],
            weather: 'not_rain',
            target: 'flammable'
        },
        effects: {
            area_damage: 3, // 3-tile radius
            morale_panic: -2,
            backfire_wind: 'check_wind',
            duration_turns: 3
        },
        historical: "Red Cliffs (208 AD) - Fire ships destroyed Cao Cao's fleet",
        officerWarning: "Fire is chaos, Commander. Wins battles or burns us alive. Wind direction decides which.",
        mechanicsNote: 'Check wind, apply area damage if wind favorable, backfire if not'
    },
    
    'field_fortifications': {
        patterns: [/dig|trench|fortify|earthworks|rampart|build defens/i],
        requirements: {
            equipment: ['engineers'],
            time: 2,
            terrain: 'not_rock_or_water'
        },
        effects: {
            defense_when_complete: 3,
            vulnerable_during: -2,
            immobile_while_building: true
        },
        historical: "Standard Roman practice - dig in before nightfall",
        officerWarning: "Two turns to dig in properly. We're vulnerable while digging, but once done, we're a fortress.",
        mechanicsNote: 'Turns 1-2: -2 defense, cannot move. Turn 3+: +3 defense'
    },
    
    'feigned_retreat': {
        patterns: [/feign|fake retreat|false retreat|pretend to flee|tactical withdrawal/i],
        requirements: {
            morale: 70,
            discipline: 'professional',
            space_behind: 'open_ground'
        },
        effects: {
            enemy_pursuit_chance: 60,
            counterattack_bonus: 4,
            backfire_if_low_morale: 'route_becomes_real'
        },
        historical: "Parthian standard tactic at Carrhae (53 BC), Mongol doctrine",
        officerWarning: "Iron discipline required. If morale breaks during 'retreat', it becomes real and we're finished. But if they pursue...",
        mechanicsNote: 'Morale check: pass = enemy may pursue, fail = actual rout'
    }
};

/**
 * Check if order matches known creative tactic pattern
 */
function matchesKnownTactic(orderText) {
    const lowerOrder = orderText.toLowerCase();
    
    for (const [tacticName, tactic] of Object.entries(CREATIVE_TACTICS)) {
        if (tactic.patterns.some(pattern => pattern.test(lowerOrder))) {
            return { matched: true, tactic: tacticName, data: tactic };
        }
    }
    
    return { matched: false };
}

/**
 * Check if order is potentially creative (not standard military command)
 */
function isPotentiallyCreative(orderText) {
    const standardCommands = /^(move|advance|retreat|hold|attack|defend|charge|flank|form|all units)/i;
    
    // If starts with standard command, not creative
    if (standardCommands.test(orderText.trim())) {
        return false;
    }
    
    // Check for creative keywords
    const creativeKeywords = [
        /hide|conceal|ambush|surprise/i,
        /fire|burn|flame/i,
        /dig|build|construct|fortify/i,
        /swim|wade|climb|crawl/i,
        /feign|fake|trick|deceive/i,
        /unusual|creative|clever/i
    ];
    
    return creativeKeywords.some(pattern => pattern.test(orderText));
}

/**
 * Check if requirements are met for known tactic
 */
function checkTacticRequirements(tactic, battleState, playerSide, map) {
    const player = battleState[playerSide];
    const unmet = [];
    
    // Terrain requirement
    if (tactic.requirements.terrain) {
        const currentTerrain = map.terrain?.primary || 'plains';
        if (!tactic.requirements.terrain.includes(currentTerrain)) {
            unmet.push(`Requires ${tactic.requirements.terrain.join(' or ')} terrain`);
        }
    }
    
    // Equipment requirement
    if (tactic.requirements.equipment) {
        const hasEngineers = player.army?.support?.some(s => s.includes('engineer'));
        if (tactic.requirements.equipment.includes('engineers') && !hasEngineers) {
            unmet.push('Requires engineers in support staff');
        }
    }
    
    // Weather requirement
    if (tactic.requirements.weather) {
        const weather = battleState.weather || 'clear';
        if (tactic.requirements.weather === 'not_rain' && weather.includes('rain')) {
            unmet.push('Cannot use fire in rain');
        }
        if (tactic.requirements.weather === 'not_freezing' && weather.includes('cold')) {
            unmet.push('Swimming in freezing water is suicide');
        }
    }
    
    // Morale requirement
    if (tactic.requirements.morale) {
        const morale = player.morale || 100;
        if (morale < tactic.requirements.morale) {
            unmet.push(`Requires ${tactic.requirements.morale}% morale (current: ${morale}%)`);
        }
    }
    
    // Unit type requirement  
    if (tactic.requirements.unitType) {
        const units = player.unitPositions || [];
        if (tactic.requirements.unitType === 'light_only') {
            const hasHeavy = units.some(u => u.unitType?.includes('heavy') || u.unitType?.includes('elite'));
            if (hasHeavy) {
                unmet.push('Only light troops can execute this (heavy armor = drowning)');
            }
        }
        if (tactic.requirements.unitType === 'light_infantry') {
            const hasLight = units.some(u => 
                u.unitType?.includes('light') || u.unitType?.includes('levy')
            );
            if (!hasLight) {
                unmet.push('Requires light infantry units');
            }
        }
    }
    
    return {
        canExecute: unmet.length === 0,
        unmetRequirements: unmet,
        effects: tactic.effects,
        mechanicsNote: tactic.mechanicsNote
    };
}

/**
 * Evaluate novel/unknown creative tactic using AI
 */
async function evaluateNovelTactic(orderText, battleState, playerSide, officer) {
    const prompt = `You are ${officer.name}, a ${officer.rank || 'veteran officer'} with ${officer.battles || 5} battles of experience.

**Commander's Order:** "${orderText}"

**Current Situation:**
- Terrain: ${battleState.terrain || 'plains'}
- Weather: ${battleState.weather || 'clear'}
- Your culture: ${battleState[playerSide].culture}
- Your morale: ${battleState[playerSide].morale || 100}%
- Turn: ${battleState.currentTurn}

**Your Task:** Assess if this tactic is:
1. Physically possible in ancient warfare (3000 BC - 500 AD)
2. Has historical precedent (if any)
3. What could go wrong
4. How it translates to game mechanics

**Stay in character:** Be honest. If it's stupid, say so respectfully. If it's brilliant, acknowledge it.

Return ONLY JSON:
{
  "officerReaction": "Your 2-3 sentence response in character",
  "feasible": true/false,
  "reasoning": "Why this works or doesn't",
  "historicalExample": "Battle name (Year)" or null,
  "gameEffect": {
    "attack": +2 or -2,
    "defense": +1 or -3,
    "special": "description of special effect",
    "casualties_upfront": 10,
    "duration": 2,
    "risks": "what could go wrong"
  } or null
}`;

    try {
        const Groq = require('groq-sdk');
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        
        const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                { 
                    role: "system", 
                    content: "You are an experienced ancient warfare officer. Be honest - call out stupid ideas, praise clever ones. Return ONLY JSON." 
                },
                { role: "user", content: prompt }
            ],
            max_tokens: 400,
            temperature: 0.7
        });
        
        const aiText = response.choices[0].message.content.trim();
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
            throw new Error('AI did not return JSON');
        }
        
        return JSON.parse(jsonMatch[0]);
        
    } catch (error) {
        console.error('Novel tactic evaluation failed:', error.message);
        // Conservative fallback
        return {
            officerReaction: `Sir, this is... unconventional. I've never seen it attempted. I cannot guarantee results.`,
            feasible: false,
            reasoning: 'Untested tactic with unknown outcomes',
            historicalExample: null,
            gameEffect: null
        };
    }
}

/**
 * Main entry point - check if order is creative and handle appropriately
 */
async function processCreativeOrder(orderText, battleState, playerSide, officer) {
    // First check if it matches known tactic
    const knownMatch = matchesKnownTactic(orderText);
    
    if (knownMatch.matched) {
        const requirements = checkTacticRequirements(
            knownMatch.data,
            battleState,
            playerSide,
            {} // map passed separately
        );
        
        return {
            type: 'known_tactic',
            tacticName: knownMatch.tactic,
            canExecute: requirements.canExecute,
            requirements: requirements.unmetRequirements,
            effects: requirements.effects,
            officerWarning: knownMatch.data.officerWarning,
            historical: knownMatch.data.historical
        };
    }
    
    // Check if potentially creative (not standard military command)
    if (isPotentiallyCreative(orderText)) {
        // Evaluate as novel tactic with AI
        const evaluation = await evaluateNovelTactic(orderText, battleState, playerSide, officer);
        
        return {
            type: 'novel_tactic',
            evaluation: evaluation,
            requiresPlayerConfirmation: evaluation.feasible
        };
    }
    
    // Not creative - proceed with standard order processing
    return {
        type: 'standard_order',
        proceed: true
    };
}

module.exports = {
    CREATIVE_TACTICS,
    processCreativeOrder,
    matchesKnownTactic,
    isPotentiallyCreative,
    evaluateNovelTactic,
    checkTacticRequirements
};