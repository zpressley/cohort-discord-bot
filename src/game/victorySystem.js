// src/game/victorySystem.js
// Comprehensive victory detection and announcement system
// Version: 1.0.0

const { EmbedBuilder } = require('discord.js');

/**
 * Check all victory conditions
 * @param {Object} positions - Current unit positions
 * @param {number} turnNumber - Current turn number
 * @param {Object} objectives - Scenario objectives
 * @param {number} maxTurns - Maximum battle duration
 * @returns {Object} Victory status
 */
function checkVictoryConditions(positions, turnNumber, objectives, maxTurns = 12) {
    const p1Units = positions.player1 || [];
    const p2Units = positions.player2 || [];
    
    // ANNIHILATION VICTORY - All units destroyed
    if (p1Units.length === 0) {
        return { 
            achieved: true, 
            winner: 'player2', 
            reason: 'enemy_annihilated',
            description: 'All enemy forces destroyed'
        };
    }
    if (p2Units.length === 0) {
        return { 
            achieved: true, 
            winner: 'player1', 
            reason: 'enemy_annihilated',
            description: 'All enemy forces destroyed'
        };
    }
    
    // Calculate total strength
    const p1Strength = p1Units.reduce((sum, u) => sum + u.currentStrength, 0);
    const p2Strength = p2Units.reduce((sum, u) => sum + u.currentStrength, 0);
    
    const p1Original = p1Units.reduce((sum, u) => sum + (u.maxStrength || 100), 0);
    const p2Original = p2Units.reduce((sum, u) => sum + (u.maxStrength || 100), 0);
    
    // ROUTE VICTORY - >75% casualties
    if (p1Strength < p1Original * 0.25) {
        return { 
            achieved: true, 
            winner: 'player2', 
            reason: 'enemy_routed',
            description: 'Enemy forces routed - over 75% casualties'
        };
    }
    if (p2Strength < p2Original * 0.25) {
        return { 
            achieved: true, 
            winner: 'player1', 
            reason: 'enemy_routed',
            description: 'Enemy forces routed - over 75% casualties'
        };
    }
    
    // TIME LIMIT - Tactical victory or draw
    if (turnNumber >= maxTurns) {
        const strengthRatio = p1Strength / p2Strength;
        
        if (strengthRatio > 1.5) {
            return { 
                achieved: true, 
                winner: 'player1', 
                reason: 'tactical_victory',
                description: 'Tactical superiority at time limit'
            };
        } else if (strengthRatio < 0.67) {
            return { 
                achieved: true, 
                winner: 'player2', 
                reason: 'tactical_victory',
                description: 'Tactical superiority at time limit'
            };
        } else {
            return { 
                achieved: true, 
                winner: 'draw', 
                reason: 'stalemate',
                description: 'Neither side achieved decisive advantage'
            };
        }
    }
    
    // Battle continues
    return { achieved: false };
}

/**
 * Create detailed victory announcement
 */
async function createVictoryAnnouncement(battle, victory, battleState) {
    const p1Units = battleState.player1.unitPositions || [];
    const p2Units = battleState.player2.unitPositions || [];
    
    // Calculate final statistics
    const p1Survivors = p1Units.reduce((sum, u) => sum + u.currentStrength, 0);
    const p2Survivors = p2Units.reduce((sum, u) => sum + u.currentStrength, 0);
    
    const p1Original = p1Units.reduce((sum, u) => sum + (u.maxStrength || 100), 0);
    const p2Original = p2Units.reduce((sum, u) => sum + (u.maxStrength || 100), 0);
    
    const p1Casualties = p1Original - p1Survivors;
    const p2Casualties = p2Original - p2Survivors;
    
    const p1CasualtyPercent = Math.round((p1Casualties / p1Original) * 100);
    const p2CasualtyPercent = Math.round((p2Casualties / p2Original) * 100);
    
    // Determine colors
    let embedColor = 0x808080; // Gray for draw
    if (victory.winner === 'player1') embedColor = 0x8B0000; // Dark red
    if (victory.winner === 'player2') embedColor = 0x00008B; // Dark blue
    
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle('🏆 BATTLE CONCLUDED')
        .setDescription(
            `**${battle.scenario.replace('_', ' ').toUpperCase()}**\n\n` +
            `${victory.description}\n\n` +
            `**Victor:** ${getVictorName(victory.winner, battleState)}`
        )
        .addFields(
            {
                name: '📊 Battle Statistics',
                value: `**Total Turns:** ${battle.currentTurn}\n` +
                       `**Weather:** ${battle.weather.replace('_', ' ')}\n` +
                       `**Duration:** ${battle.currentTurn} turns`,
                inline: true
            },
            {
                name: `💀 ${battleState.player1.culture} Casualties`,
                value: `**Losses:** ${p1Casualties} / ${p1Original}\n` +
                       `**Casualty Rate:** ${p1CasualtyPercent}%\n` +
                       `**Survivors:** ${p1Survivors}\n` +
                       `**Units Remaining:** ${p1Units.length}`,
                inline: true
            },
            {
                name: `💀 ${battleState.player2.culture} Casualties`,
                value: `**Losses:** ${p2Casualties} / ${p2Original}\n` +
                       `**Casualty Rate:** ${p2CasualtyPercent}%\n` +
                       `**Survivors:** ${p2Survivors}\n` +
                       `**Units Remaining:** ${p2Units.length}`,
                inline: true
            },
            {
                name: '⚔️ Tactical Summary',
                value: getTacticalSummary(victory, p1CasualtyPercent, p2CasualtyPercent),
                inline: false
            }
        )
        .setFooter({ 
            text: 'Experience gained! Use /build-army to prepare for your next battle.' 
        });
    
    return { embed, statistics: { p1Casualties, p2Casualties, p1Survivors, p2Survivors } };
}

/**
 * Get victor name with cultural title
 */
function getVictorName(winner, battleState) {
    if (winner === 'draw') return 'Draw - Honorable Stalemate';
    if (winner === 'player1') return `${battleState.player1.culture} Commander`;
    if (winner === 'player2') return `${battleState.player2.culture} Commander`;
    return 'Unknown';
}

/**
 * Generate tactical summary based on victory type
 */
function getTacticalSummary(victory, p1Casualties, p2Casualties) {
    if (victory.reason === 'enemy_annihilated') {
        return '⚔️ **Complete Annihilation** - Total battlefield dominance';
    }
    
    if (victory.reason === 'enemy_routed') {
        return '🏃 **Routing Victory** - Enemy broke and fled';
    }
    
    if (victory.reason === 'tactical_victory') {
        const casualtyDiff = Math.abs(p1Casualties - p2Casualties);
        return `📊 **Tactical Victory** - Superior strategy with ${casualtyDiff}% casualty advantage`;
    }
    
    if (victory.reason === 'stalemate') {
        return '⚖️ **Stalemate** - Both sides fought to exhaustion with no decisive victor';
    }
    
    return 'Battle concluded';
}

/**
 * Update commander records with battle results
 */
async function updateCommanderRecords(battle, victory, statistics) {
    const { models } = require('../database/setup');
    
    const p1Commander = await models.Commander.findByPk(battle.player1Id);
    const p2Commander = await models.Commander.findByPk(battle.player2Id);
    
    if (!p1Commander || !p2Commander) {
        console.warn('Cannot update commander records - commanders not found');
        return;
    }
    
    // Update wins/losses
    if (victory.winner === 'player1') {
        await p1Commander.increment('victories');
        await p2Commander.increment('defeats');
    } else if (victory.winner === 'player2') {
        await p2Commander.increment('victories');
        await p1Commander.increment('defeats');
    }
    // Draws don't increment anything
    
    // Could also track: total_casualties, battles_fought, etc.
    
    console.log(`✅ Commander records updated`);
}

module.exports = {
    checkVictoryConditions,
    createVictoryAnnouncement,
    updateCommanderRecords,
    getVictorName,
    getTacticalSummary
};