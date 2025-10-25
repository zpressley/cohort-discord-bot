// src/game/briefingGenerator.js - FIXED VERSION
// Remove map from embed to avoid 1024 character limit

const { EmbedBuilder } = require('discord.js');
const { generateASCIIMap } = require('./maps/mapUtils');
const { calculateDistance } = require('./maps/mapUtils');

/**
 * Generate turn briefing TEXT (no embeds) for mobile readability
 */
async function generateBriefingText(battleState, playerSide, commander, eliteUnit, turnNumber) {
    const playerData = battleState[playerSide] || {};
    const officerName = eliteUnit?.officers?.[0]?.name || 'Unit Commander';

    const intelligence = generateIntelligenceReport(playerData, battleState);
    const officerComment = generateOfficerComment(
        intelligence,
        commander?.culture || 'default',
        officerName
    );

    const unitsText = formatUnitList(
        Array.isArray(playerData.unitPositions) ? playerData.unitPositions : [],
        battleState.map?.terrain
    );

    const lines = [];
    lines.push(`🎖️ WAR COUNCIL — Turn ${turnNumber}`);
    lines.push('');
    lines.push('YOUR FORCES:');
    lines.push(unitsText || '—');
    lines.push('');
    lines.push('INTELLIGENCE:');
    lines.push(intelligence);
    lines.push('');
    lines.push(`${officerName} reports:`);
    lines.push(officerComment);
    lines.push('');
    lines.push('Send your orders to continue the battle.');
    return lines.join('\n');
}

/**
 * Legacy embed generator (kept for compatibility if needed)
 */
async function generateBriefingEmbed(battleState, playerSide, commander, eliteUnit, turnNumber) {
    const playerData = battleState[playerSide];
    const officerName = eliteUnit?.officers?.[0]?.name || 'Unit Commander';
    const intelligence = generateIntelligenceReport(playerData, battleState);
    const officerComment = generateOfficerComment(
        intelligence,
        commander.culture,
        officerName
    );
    const embed = new EmbedBuilder()
        .setColor(playerSide === 'player1' ? 0x8B0000 : 0x00008B)
        .setTitle(`🎖️ WAR COUNCIL - Turn ${turnNumber}`)
        .setDescription(`**Your Forces:**\n${formatUnitList(playerData.unitPositions)}`)
        .addFields(
            { name: '👁️ INTELLIGENCE:', value: intelligence, inline: false },
            { name: `🎖️ ${officerName} reports:`, value: officerComment, inline: false }
        )
        .setFooter({ text: 'Send your orders to continue the battle' });
    return embed;
}

/**
 * Generate ASCII map separately (as code block message)
 */
function generateMapMessage(battleState, playerSide, view = 'default') {
    const playerData = battleState[playerSide] || {};

    const friendlyUnits = Array.isArray(playerData.unitPositions) ? playerData.unitPositions : [];

    const visibleEnemyCoords = Array.isArray(playerData.visibleEnemyPositions)
        ? playerData.visibleEnemyPositions
        : [];
    const visibleEnemyUnits = visibleEnemyCoords.map(coord => ({ position: coord }));

    const terrain = battleState.map?.terrain || require('./maps/riverCrossing').RIVER_CROSSING_MAP.terrain;

    const mapData = {
        terrain,
        player1Units: friendlyUnits,
        player2Units: visibleEnemyUnits
    };

    // Viewport based on preference
    const { parseCoord, generateEmojiMapViewport } = require('./maps/mapUtils');
    const GRID = 20, H = 15, W = 15;
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    let top = 0, left = 0;
    if (view === 'center') {
        top = Math.floor((GRID - H) / 2); left = Math.floor((GRID - W) / 2);
    } else if (view === 'nw') { top = 0; left = 0; }
    else if (view === 'ne') { top = 0; left = GRID - W; }
    else if (view === 'sw') { top = GRID - H; left = 0; }
    else if (view === 'se') { top = GRID - H; left = GRID - W; }
    else { // default follow commander
        const commanderPos = playerData?.commander?.position || friendlyUnits[0]?.position || 'K10';
        const p = parseCoord(commanderPos) || { row: 9, col: 9 };
        top = clamp(p.row - Math.floor(H / 2), 0, GRID - H);
        left = clamp(p.col - Math.floor(W / 2), 0, GRID - W);
    }

    // Build overlays: X for intel older than 1 turn
    const overlays = Array.isArray(playerData.intelMemory)
      ? playerData.intelMemory.filter(e => (battleState.currentTurn - (e.lastSeenTurn || 0)) >= 2).map(e => e.position)
      : [];
    const mapView = generateEmojiMapViewport(mapData, { top, left, width: W, height: H }, overlays);
    return `**MAP:**\n\`\`\`\n${mapView}\n\`\`\``;
}

/**
 * Generate intelligence report from visibility data
 */
function generateIntelligenceReport(playerData, battleState) {
    const mem = Array.isArray(playerData.intelMemory) ? playerData.intelMemory : [];
    
    if (mem.length === 0) {
        return '❓ No enemy contact';
    }

    const currentTurn = battleState.currentTurn || 0;
    
    // Load formatters
    const { getUnitTypeEmoji, formatIntelConfidence, formatStrengthEstimate } = require('./briefingFormatters');
    
    const lines = mem
        .sort((a, b) => (b.lastSeenTurn || 0) - (a.lastSeenTurn || 0))
        .slice(0, 8)
        .map(entry => {
            // Get emoji
            const emoji = getUnitTypeEmoji(entry.unitClass);
            
            // Format unit type
            const unitClass = entry.unitClass || 'Infantry';
            const unitType = unitClass.split('_').map(w => 
                w.charAt(0).toUpperCase() + w.slice(1)
            ).join(' ');
            
            // Format strength
            const strength = formatStrengthEstimate(
                entry.estimatedStrength, 
                entry.detailLevel
            );
            
            // Format position confidence
            const turnsSince = currentTurn - (entry.lastSeenTurn || currentTurn);
            const positionPhrase = formatIntelConfidence(
                entry.detailLevel,
                turnsSince
            );
            
            // Get terrain
            const terrain = getTerrainAtPosition(battleState.map?.terrain, entry.position);
            
            return `${emoji} Enemy ${unitType} — ${strength} — ${positionPhrase} ${entry.position} (${terrain})`;
        });

    return lines.join('\n');
}

/**
 * Generate culturally appropriate officer commentary
 */
function generateOfficerComment(intelligence, culture, officerName) {
    const hasEnemies = intelligence.includes('Enemy Spotted');
    
    const comments = {
        'Roman Republic': hasEnemies ? 
            `"Sir, enemy forces spotted ahead! The legion stands ready. Recommend we maintain formation and advance cautiously."` :
            `"No contact yet, Commander. The men are alert and in good order."`,
        
        'Celtic': hasEnemies ?
            `"Enemy ahead, Chief! The lads are eager for battle. Give the word and we'll smash their lines!"` :
            `"Quiet out there, Chief. Too quiet. The spirits whisper of coming battle."`,
        
        'Han Dynasty': hasEnemies ?
            `"Commander, enemy forces detected. Recommend coordinated advance with crossbow support."` :
            `"All quiet, Commander. The men maintain discipline and await your orders."`,
        
        'Spartan City-State': hasEnemies ?
            `"Enemy sighted. Spartans do not retreat."` :
            `"We wait."`,
        
        'default': hasEnemies ?
            `"Commander, enemy forces ahead. Awaiting your tactical orders."` :
            `"All clear, Commander. Units ready for orders."`
    };
    
    return comments[culture] || comments['default'];
}

/**
 * Format unit list for briefing - show actual unit types and details
 */
function formatUnitList(units, terrain) {
    if (!Array.isArray(units) || units.length === 0) {
        return 'No units deployed';
    }

    return units.map(unit => {
        const { getFriendlyUnitEmoji } = require('./briefingFormatters');
        const emoji = getFriendlyUnitEmoji(unit);
        const weapon = simplifyWeaponName(unit.primaryWeapon?.name);
        const typeBase = unit.mounted ? 'Cavalry' : 'Infantry';
        const eliteSuffix = unit.isElite ? ` (${unit.eliteName || 'Elite'})` : '';
        const type = unit.isElite ? `Elite ${typeBase}${eliteSuffix}` : `${typeBase}${weapon ? ` (${weapon})` : ''}`;
        const pos = unit.position;
        const terr = getTerrainAtPosition(terrain, pos);
        const mission = unit.activeMission?.status === 'active' ? ` → Mission: ${unit.activeMission.target}` : '';
        return `${emoji} ${type} at ${pos} - ${unit.currentStrength} men - (${terr})${mission}`;
    }).join('\n');
}

function getTerrainAtPosition(terrain, coord) {
    if (!terrain || !coord) return 'plains';
    const inList = (arr, c) => Array.isArray(arr) && (arr.includes(c) || arr.some(x => typeof x === 'object' && x?.coord === c));
    if (inList(terrain.fords, coord)) return 'ford';
    if (inList(terrain.river, coord)) return 'river';
    if (inList(terrain.hill, coord)) return 'hill';
    if (inList(terrain.forest, coord)) return 'forest';
    if (inList(terrain.marsh, coord)) return 'marsh';
    if (inList(terrain.road, coord)) return 'road';
    return 'plains';
}

function getUnitTypeDescription(unit) {
    if (!unit) return 'Unit';
    const type = unit.mounted ? 'Cavalry' : 'Infantry';
    return unit.isElite ? `Elite ${type}` : type;
}

function simplifyWeaponName(name) {
    if (!name) return '';
    const n = name.toLowerCase();
    if (n.includes('spear') || n.includes('sarissa') || n.includes('dory')) return 'Spears';
    if (n.includes('gladius') || n.includes('sword') || n.includes('xiphos') || n.includes('dao') || n.includes('jian')) return 'Swords';
    if (n.includes('bow') || n.includes('crossbow')) return 'Bows';
    if (n.includes('javelin') || n.includes('pilum')) return 'Javelins';
    if (n.includes('mace')) return 'Maces';
    if (n.includes('axe')) return 'Axes';
    return name.split('(')[0].trim();
}

module.exports = {
    generateBriefingText,
    generateBriefingEmbed,
    generateMapMessage,
    generateIntelligenceReport,
    generateOfficerComment
};
