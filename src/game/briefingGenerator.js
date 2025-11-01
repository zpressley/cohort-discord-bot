// src/game/briefingGenerator.js
// AI-powered narrative briefings (Gupta-style)

const { generateASCIIMap, calculateDistance } = require('./maps/mapUtils');
const { callGroqAI } = require('../ai/officerQA');
const { generateOfficerDialogue } = require('../ai/aiManager');

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
    lines.push(formatUnitsSimple(playerData.unitPositions));
    
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

async function generateOfficerAssessment(playerData, culture, officerName, veteranLevel, map) {
    const friendlyUnits = playerData.unitPositions || [];
    const visibleEnemies = playerData.visibleEnemyPositions || [];
    
    // Simple template-based assessment (no AI call needed)
    let assessment = `${officerName} reports: `;
    
    if (friendlyUnits.length > 0) {
        assessment += `Our ${friendlyUnits.length} units are in position. `;
    }
    
    if (visibleEnemies.length > 0) {
        assessment += `Enemy forces detected at ${visibleEnemies.length} location${visibleEnemies.length > 1 ? 's' : ''}. `;
    } else {
        assessment += `No enemy contact yet. `;
    }
    
    assessment += `Awaiting your orders, Commander.`;
    
    return assessment;
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