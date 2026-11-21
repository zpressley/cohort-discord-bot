const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Op } = require('sequelize');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lobby')
        .setDescription('Open the main Cohort game lobby'),
    
    async execute(interaction) {
        try {
            const { models } = require('../../database/setup');
            
            // Get commander info
            const commander = await models.Commander.findByPk(interaction.user.id, {
                include: ['eliteUnits']
            });

            const isNewPlayer = !commander || !commander.culture;
            
            await showMainLobby(interaction, commander, isNewPlayer);

        } catch (error) {
            console.error('Lobby command error:', error);
            await interaction.reply({
                content: 'Error loading lobby. Please try again.',
                ephemeral: true
            });
        }
    }
};

async function showMainLobby(interaction, commander, isNewPlayer) {
    const { models } = require('../../database/setup');
    
    // Get player stats
    let statsText = 'New Commander - No battles yet';
    let armyStatus = 'No army built';
    
    if (commander) {
        const winRate = commander.getWinRate();
        statsText = `Battles: ${commander.totalBattles} | Wins: ${commander.battlesWon} | Win Rate: ${winRate}%`;
        
        if (commander.culture) {
            // Check if player has saved army composition
            armyStatus = `${commander.culture} forces ready`;
        }
    }

    // Check for active battles
    let activeBattleText = 'No active battles';
    if (commander) {
        const activeBattle = await models.Battle.findOne({
            where: {
                status: ['waiting_for_players', 'army_building', 'in_progress'],
                [Op.or]: [
                    { player1Id: commander.discordId },
                    { player2Id: commander.discordId }
                ]
            }
        });
        
        if (activeBattle) {
            activeBattleText = `Active: ${activeBattle.scenario.replace('_', ' ')} (Turn ${activeBattle.currentTurn})`;
        }
    }

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('⚔️ COHORT - Ancient Warfare Strategy')
        .setDescription('*Command armies from 3000 BC to 500 AD in tactical Discord battles*')
        .addFields(
            {
                name: '👤 Commander Status',
                value: `**Name:** ${interaction.user.username}\n**Culture:** ${commander?.culture || 'Not selected'}\n**Stats:** ${statsText}`,
                inline: true
            },
            {
                name: '🏛️ Army Status',
                value: armyStatus,
                inline: true
            },
            {
                name: '⚔️ Battle Status',
                value: activeBattleText,
                inline: true
            },
            {
                name: '🎮 How to Play',
                value: '1. **Build Army** - Choose culture and create forces\n2. **Create Battle** - Select scenario and wait for opponent\n3. **Fight** - Give orders via DM, AI narrates results\n4. **Victory** - Means your veterans live to fight another day!',
                inline: false
            }
        )
        .setFooter({ text: 'Use buttons below or equivalent slash commands' });

    // Main lobby buttons
    const mainButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('lobby-build-army')
                .setLabel(isNewPlayer ? 'Choose Culture & Build Army' : 'Modify Army')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🏗️'),
            new ButtonBuilder()
                .setCustomId('lobby-create-battle')
                .setLabel('Create Battle')
                .setStyle(ButtonStyle.Success)
                .setEmoji('⚔️')
                .setDisabled(isNewPlayer),
            new ButtonBuilder()
                .setCustomId('lobby-join-battle')
                .setLabel('Join Battle')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🛡️')
                .setDisabled(isNewPlayer)
        );

    const utilityButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('lobby-my-stats')
                .setLabel('My Stats')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📊')
                .setDisabled(isNewPlayer),
            new ButtonBuilder()
                .setCustomId('lobby-battle-history')
                .setLabel('Battle History')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📜')
                .setDisabled(isNewPlayer),
            new ButtonBuilder()
                .setCustomId('lobby-help')
                .setLabel('Help & Commands')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❓')
        );

    await interaction.reply({
        embeds: [embed],
        components: [mainButtons, utilityButtons],
        ephemeral: true
    });
}

// Export for use in other handlers
module.exports.showMainLobby = showMainLobby;
