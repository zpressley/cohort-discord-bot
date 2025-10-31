// src/game/briefingGenerator.js
// AI-powered narrative briefings (Gupta-style)

const { generateASCIIMap, calculateDistance } = require('./maps/mapUtils');
const { callGroqAI } = require('../ai/officerQA');

/**
 * Generate rich AI-powered briefing
 * Players should be able to play without map from this text alone
 */
async function generateRichTextBriefing(battleState, playerSide, commander, eliteUnit, turnNumber, atmosphericOpening) {
    const playerData = battleState[playerSide];
    const officerName = eliteUnit?.officers?.[0]?.name || 'Unit Commander';
    const veteranLevel = eliteUnit?.officers?.[0]?.battlesSurvived || 0;
    
    const lines = [];
    
    // Header
    lines.push('═══════════════════════════════════════');
    lines.push(`🎖️ WAR COUNCIL — Turn ${turnNumber}`);
    
    // Atmospheric opening (if provided, otherwise generate)
    if (atmosphericOpening) {
        lines.push(atmosphericOpening);
    }
    
    lines.push('═══════════════════════════════════════');
    
    // YOUR FORCES section (simple, no AI needed)
    lines.push('YOUR FORCES:');
    lines.push('');
    lines.push(...formatUnitsSimple(playerData.unitPositions));
    
    lines.push('───────────────────────────────────────');
    
    // AI-GENERATED TACTICAL ASSESSMENT
    lines.push(`**${officerName} reports:**`);
    lines.push('');
    
    const tacticalAssessment = await generateOfficerAssessment(
        playerData,
        commander.culture,
        officerName,
        veteranLevel,
        battleState.map
    );
    
    lines.push(tacticalAssessment);
    
    lines.push('═══════════════════════════════════════');
    lines.push('**Type your orders to continue the battle**');
    
    return lines.join('\n');
}

/**
 * Format units simply (no AI needed - just facts)
 */
function formatUnitsSimple(units) {
    return units.map(unit => {
        const icon = getUnitIcon(unit.type);
        const pos = `${unit.position.row}${unit.position.col}`;
        
        let status = unit.activeMission?.status === 'active' ?
            `Advancing to ${unit.activeMission.target.row}${unit.activeMission.target.col}` :
            `Holding position`;
        
        return `${icon} ${unit.name || unit.type} at ${pos} — ${unit.currentStrength}/${unit.maxStrength || 100} — ${status}`;
    }).join('\n');
}

/**
 * Generate AI-powered tactical assessment
 * This is the heart of Gupta-style: officer describes situation narratively
 */
async function generateOfficerAssessment(playerData, culture, officerName, veteranLevel, map) {
    const { callGroqAI } = require('../ai/officerQA');
    
    // Build tactical context
    const friendlyUnits = playerData.unitPositions || [];
    const visibleEnemies = playerData.visibleEnemyPositions || [];
    
    // Describe friendly positions and terrain
    const friendlyContext = friendlyUnits.map(u => {
        const terrain = map?.terrain?.[u.position.row]?.[u.position.col] || 'plains';
        return `- ${u.name || u.type} at ${u.position.row}${u.position.col} (${terrain}, ${u.currentStrength} warriors)`;
    }).join('\n');
    
    // Describe enemy contacts with relative positions
    let enemyContext = 'No enemy forces spotted yet.';
    if (visibleEnemies.length > 0) {
        // Deduplicate
        const seen = new Set();
        // Add null check for position:
        const unique = visibleEnemies.filter(e => {
            if (!e || !e.position) return false;  // Skip if no position
            const key = `${e.position.row}${e.position.col}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        
        enemyContext = unique.map(e => {
            const nearestFriendly = friendlyUnits[0]; // Simplified - use closest
            const dist = calculateDistance(nearestFriendly.position, e.position);
            const direction = getRelativeDirection(nearestFriendly.position, e.position);
            
            return `- Enemy ${e.type || 'troops'} spotted ${direction} at ${e.position.row}${e.position.col}, ${dist} tiles away (estimated ${e.estimatedStrength || '~100'} warriors)`;
        }).join('\n');
    }
    
    const culturalVoice = getCulturalVoice(culture);
    
    const prompt = `You are ${officerName}, a ${veteranLevel >= 6 ? 'veteran' : 'experienced'} officer in a ${culture} army.

Your commander needs a tactical situation report. Describe:
1. What you can see of the terrain and battlefield
2. Enemy positions and movements (if any)
3. Your tactical assessment and recommendations
4. Any concerns or opportunities

Keep your report concise (3-4 sentences) and speak in character for ${culture}. ${culturalVoice}

CURRENT SITUATION:
Your forces:
${friendlyContext}

Enemy intelligence:
${enemyContext}

Provide your tactical report:`;

    try {
        const assessment = await callGroqAI(prompt, 'llama-3.1-8b-instant');
        return `*"${assessment.trim()}"*`;
    } catch (error) {
        console.error('AI assessment failed, using fallback:', error);
        return generateFallbackAssessment(visibleEnemies, culture);
    }
}

/**
 * Cultural voice guidelines for AI
 */
function getCulturalVoice(culture) {
    const voices = {
        'Roman Republic': 'Speak formally and professionally. Use military terminology. Be precise and methodical.',
        'Celtic': 'Speak with passion and poetry. Reference spirits and honor. Be bold and direct.',
        'Han Dynasty': 'Speak with discipline and wisdom. Reference strategy and coordination. Be measured.',
        'Spartan City-State': 'Speak in terse, blunt statements. No flowery language. Direct and stoic.'
    };
    
    return voices[culture] || voices['Roman Republic'];
}

/**
 * Fallback if AI fails
 */
function generateFallbackAssessment(visibleEnemies, culture) {
    if (visibleEnemies.length === 0) {
        return `*"All quiet, Commander. No enemy contact. The men await your orders."*`;
    }
    
    const enemyClose = visibleEnemies.some(e => {
        // Simplified distance check
        return true; // Assume close for fallback
    });
    
    if (culture === 'Spartan City-State') {
        return `*"Enemy sighted. We do not retreat."*`;
    }
    
    if (culture === 'Celtic') {
        return `*"Enemy spotted, Chief! The lads are eager for battle!"*`;
    }
    
    return `*"Enemy forces detected, Commander. Recommend we advance cautiously and maintain formation."*`;
}

/**
 * Get relative direction between two positions
 */
function getRelativeDirection(from, to) {
    const rowDiff = to.row.charCodeAt(0) - from.row.charCodeAt(0);
    const colDiff = to.col - from.col;
    
    let direction = '';
    if (rowDiff > 0) direction += 'south';
    if (rowDiff < 0) direction += 'north';
    if (colDiff > 0) direction += 'east';
    if (colDiff < 0) direction += 'west';
    
    return direction || 'nearby';
}

function getUnitIcon(type) {
    const icons = {
        'elite': '🔷',
        'professional': '🟦',
        'levy': '🔹',
        'cavalry': '🐎',
        'archers': '🏹',
        'default': '⚔️'
    };
    return icons[type?.toLowerCase()] || icons.default;
}

module.exports = {
    generateRichTextBriefing
};