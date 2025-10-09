// src/game/briefingGenerator.js
// Generate officer briefings with intelligence reports

const { EmbedBuilder } = require('discord.js');
const { renderAsciiMap } = require('./maps/mapUtils');

/**
 * Generate turn briefing embed with officer commentary
 */
async function generateBriefingEmbed(battleState, playerSide, commander, eliteUnit, turnNumber) {
    const playerData = battleState[playerSide];
    const enemySide = playerSide === 'player1' ? 'player2' : 'player1';
    
    // Get officer name
    const officerName = eliteUnit?.officers?.[0]?.name || 'Unit Commander';
    
    // Generate intelligence report
    const intelligence = generateIntelligenceReport(playerData, battleState);
    
    // Generate officer commentary
    const officerComment = generateOfficerComment(
        intelligence,
        commander.culture,
        officerName
    );
    
    // Generate ASCII map
    const mapView = renderAsciiMap(
        battleState.map || require('./maps/riverCrossing').RIVER_CROSSING_MAP,
        playerData.unitPositions,
        playerData.visibleEnemyPositions || []
    );
    
    const embed = new EmbedBuilder()
        .setColor(playerSide === 'player1' ? 0x8B0000 : 0x00008B)
        .setTitle(`🎖️ WAR COUNCIL - Turn ${turnNumber}`)
        .setDescription(`**Your Forces:**\n${formatUnitList(playerData.unitPositions)}`)
        .addFields(
            {
                name: '👁️ INTELLIGENCE:',
                value: intelligence,
                inline: false
            },
            {
                name: `🎖️ ${officerName} reports:`,
                value: officerComment,
                inline: false
            },
            {
                name: '🗺️ MAP:',
                value: `\`\`\`\n${mapView}\n\`\`\``,
                inline: false
            }
        )
        .setFooter({ text: 'Send your orders to continue the battle' });
    
    return embed;
}

/**
 * Generate intelligence report from visibility data
 */
function generateIntelligenceReport(playerData, battleState) {
    const visibleEnemies = playerData.visibleEnemyPositions || [];
    
    if (visibleEnemies.length === 0) {
        return '👁️ No enemy contact\n' +
               'No enemy forces detected. They may be beyond visual range or concealed.';
    }
    
    const reports = visibleEnemies.map(enemy => {
        const distance = Math.abs(
            parseInt(enemy.position[0]) - parseInt(playerData.unitPositions[0].position[0])
        );
        
        return `👁️ **Enemy Spotted at ${enemy.position}**\n` +
               `   Estimated: ~${enemy.estimatedStrength || 100} troops\n` +
               `   Confidence: ${enemy.confidence || 'MEDIUM'}`;
    });
    
    return reports.join('\n\n');
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
 * Format unit list for briefing
 */
function formatUnitList(units) {
    return units.map(unit => {
        const health = Math.round((unit.currentStrength / (unit.maxStrength || 100)) * 100);
        const healthBar = '🟩'.repeat(Math.floor(health / 20)) + '⬜'.repeat(5 - Math.floor(health / 20));
        
        return `🔵 **Unit at ${unit.position}** - ${unit.currentStrength}/${unit.maxStrength || 100} (${health}%)\n` +
               `   ${healthBar}`;
    }).join('\n');
}

module.exports = {
    generateBriefingEmbed,
    generateIntelligenceReport,
    generateOfficerComment
};