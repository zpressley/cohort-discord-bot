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
    
    // YOUR FORCES section
    lines.push('YOUR FORCES:');
    lines.push('');
    lines.push(formatUnitsSimple(playerData.unitPositions, battleState.map));
    
    lines.push('');
    lines.push('───────────────────────────────────────');
    lines.push('');

    // ENEMY INTELLIGENCE
    lines.push('🔍 INTELLIGENCE:');
    lines.push('');

    let enemyIntel = playerData.visibleEnemyDetails || [];

    // Handle if it's an object instead of array
    if (!Array.isArray(enemyIntel)) {
        enemyIntel = Object.values(enemyIntel);
    }

    if (enemyIntel.length === 0) {
        lines.push('  No enemy forces spotted');
    } else {
        enemyIntel.forEach(intel => {
            const emoji = getEnemyIntelEmoji(intel);
            const terrain = getTerrainAtPosition(intel.position, battleState.map);
            const strengthEstimate = getStrengthEstimate(intel);
            const qualityIndicator = getQualityIndicator(intel.quality);
            
            lines.push(`  ${emoji} ${intel.position} ${intel.unitType || 'Unknown forces'} ${strengthEstimate} (${terrain}) ${qualityIndicator}`);
        });
    }

    lines.push('');
    lines.push('───────────────────────────────────────');
    lines.push('');
    
    // BATTLEFIELD MAP
    lines.push('🗺️ BATTLEFIELD:');
    lines.push('');
    
    const mapDisplay = await generateBattlefieldMapForBriefing(battleState, playerSide);
    lines.push('```');
    lines.push(mapDisplay);
    lines.push('```');
    lines.push('*Use /map to adjust view*');
    
    lines.push('');
    lines.push('───────────────────────────────────────');
    lines.push('');
    
    // OFFICER ASSESSMENT
    lines.push(`💬 ${officerName} reports:`);
    lines.push('');
    
    const tacticalAssessment = await generateOfficerAssessment(
        playerData,
        commander.culture,
        officerName,
        veteranLevel,
        battleState.map
    );
    
    lines.push(`"${tacticalAssessment}"`);
    
    lines.push('');
    lines.push('═══════════════════════════════════════');
    lines.push('**Type your orders to continue the battle**');
    
    return lines.join('\n');
}

/**
 * Generate battlefield map for briefing (with proper centering)
 */
async function generateBattlefieldMapForBriefing(battleState, playerSide) {
    const { generateEmojiMapViewport, parseCoord } = require('./maps/mapUtils');
    const playerData = battleState[playerSide];
    
    const units = playerData.unitPositions || [];
    
    // Calculate viewport centered on player units
    let centerRow = 10, centerCol = 10;
    
    if (units.length > 0) {
        const positions = units.map(u => {
            return typeof u.position === 'string' ? parseCoord(u.position) : u.position;
        }).filter(p => p);
        
        if (positions.length > 0) {
            centerRow = Math.floor(positions.reduce((sum, p) => sum + p.row, 0) / positions.length);
            centerCol = Math.floor(positions.reduce((sum, p) => sum + p.col, 0) / positions.length);
        }
    }
    
    const view = {
        top: Math.max(0, centerRow - 7),
        left: Math.max(0, centerCol - 7),
        width: 15,
        height: 15
    };
    
    // Build map data
    const enemyPositionObjects = (playerData.visibleEnemyPositions || []).map(posStr => ({
        position: posStr,
        side: playerSide === 'player1' ? 'player2' : 'player1'
    }));
    
    const mapData = {
        terrain: battleState.map?.terrain || {},
        player1Units: playerSide === 'player1' ? units : enemyPositionObjects,
        player2Units: playerSide === 'player2' ? units : enemyPositionObjects
    };
    
    return generateEmojiMapViewport(mapData, view, [], playerSide);
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

/**
 * Get enemy intel emoji based on unit type and elite status
 */
function getEnemyIntelEmoji(intel) {
    if (intel.isElite) return '🔶';
    if (intel.unitType === 'cavalry') return '🟠';
    return '🟧'; // infantry/archers
}

/**
 * Get strength estimate based on intel quality
 */
function getStrengthEstimate(intel) {
    if (intel.quality === 'high') {
        // Accurate count (within 5%)
        return `~${intel.estimatedStrength || '100'} warriors`;
    } else if (intel.quality === 'medium') {
        // Range estimate (±25%)
        const base = intel.estimatedStrength || 100;
        const low = Math.floor(base * 0.75);
        const high = Math.ceil(base * 1.25);
        return `~${low}-${high} warriors`;
    } else {
        // Vague description
        const strength = intel.estimatedStrength || 100;
        if (strength > 150) return 'Large force';
        if (strength > 75) return 'Medium force';
        return 'Small force';
    }
}

/**
 * Get quality indicator for intel
 */
function getQualityIndicator(quality) {
    if (quality === 'high') return '📍'; // Close range, accurate
    if (quality === 'medium') return '👁️'; // Medium range, estimated
    return '🌫️'; // Long range, uncertain
}


module.exports = {
    generateRichTextBriefing
};