// src/game/briefingGenerator.js
// AI-powered narrative briefings (Gupta-style)

const { generateASCIIMap, calculateDistance, parseCoord } = require('./maps/mapUtils');
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
    lines.push(formatUnitsSimple(playerData.unitPositions, battleState.map));
    
    lines.push('');
    lines.push('───────────────────────────────────────');
    lines.push('');

    // INTELLIGENCE
    lines.push('🔍 INTELLIGENCE:');
    lines.push('');

    const visibleEnemies = playerData.visibleEnemyPositions || [];
    if (visibleEnemies.length === 0) {
        lines.push('  No enemy forces spotted');
    } else {
        visibleEnemies.forEach(posStr => {
            const terrain = getTerrainAtPosition(posStr, battleState.map);
            lines.push(`  🔴 ${posStr} Enemy forces detected (${terrain})`);
        });
    }

    lines.push('');
    lines.push('───────────────────────────────────────');
    lines.push('');
    
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
 * Get unit icon matching map display
 */
function getUnitIcon(unit, isFriendly = true) {
    const color = isFriendly ? '🔵' : '🟠';
    
    // Elite units get diamond
    if (unit.isElite) {
        return isFriendly ? '🔷' : '🔶';
    }
    
    // Mounted units get circle
    if (unit.mounted || unit.type === 'cavalry') {
        return color;
    }
    
    // Infantry (archer or melee) get square
    return isFriendly ? '🟦' : '🟧';
}

/**
 * Format units with detailed info
 * Format: [emoji][coords] Name (Weapon) - Size - Mission (Terrain)
 */
function formatUnitsSimple(units, map) {
    return units.map(unit => {
        const icon = getUnitIcon(unit);
        const pos = unit.position; // String like "N4"
        
        // Get unit name (veteran name or descriptor)
        let unitName = unit.name || getUnitDescriptor(unit);
        
        // Get main weapon and flip parenthetical format
        let weapon = unit.primaryWeapon?.name || 'Standard Arms';
        if (weapon.includes('(') && weapon.includes(')')) {
            const match = weapon.match(/(.+?)\s*\((.+?)\)/);
            if (match) {
                weapon = `${match[2]} ${match[1]}`; // "Self-Bow (Professional)" → "Professional Self-Bow"
            }
        }
        
        // Get terrain at position
        const terrain = getTerrainAtPosition(pos, map);
        
        // Build line: [emoji][coords] Name (Weapon) - CurrentSize
        let line = `${icon} ${pos} ${unitName} (${weapon}) — ${unit.currentStrength}`;
        
        // Only add mission if actively moving
        if (unit.activeMission?.status === 'active') {
            line += ` — Advancing to ${unit.activeMission.target}`;
        }
        
        line += ` (${terrain})`;
        
        return line;
    }).join('\n');
}

/**
 * Get unit descriptor based on equipment
 */
function getUnitDescriptor(unit) {
    if (unit.mounted) {
        if (unit.hasRanged) return 'Horse Archers';
        return 'Cavalry';
    }
    
    if (unit.hasRanged) {
        return 'Archers';
    }
    
    // Check armor weight for infantry
    const armorType = unit.armor?.name || '';
    if (armorType.includes('Heavy')) return 'Heavy Infantry';
    if (armorType.includes('Medium')) return 'Medium Infantry';
    return 'Infantry';
}

/**
 * Get terrain type at position
 */
function getTerrainAtPosition(position, map) {
    const pos = typeof position === 'string' ? parseCoord(position) : position;
    if (!pos || !map?.terrain) return 'plains';
    
    const terrain = map.terrain;
    
    // Check each terrain type
    if (terrain.forest?.some(c => parseCoord(c)?.row === pos.row && parseCoord(c)?.col === pos.col)) {
        return 'forest';
    }
    if (terrain.hill?.some(c => parseCoord(c)?.row === pos.row && parseCoord(c)?.col === pos.col)) {
        return 'hill';
    }
    if (terrain.marsh?.some(c => parseCoord(c)?.row === pos.row && parseCoord(c)?.col === pos.col)) {
        return 'marsh';
    }
    if (terrain.river?.some(c => parseCoord(c)?.row === pos.row && parseCoord(c)?.col === pos.col)) {
        return 'river';
    }
    if (terrain.road?.some(c => parseCoord(c)?.row === pos.row && parseCoord(c)?.col === pos.col)) {
        return 'road';
    }
    
    return 'plains';
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

module.exports = {
    generateRichTextBriefing
};