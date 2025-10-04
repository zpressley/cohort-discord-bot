const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle , StringSelectMenuBuilder} = require('discord.js');
const { Op } = require('sequelize');

async function handleLobbyInteractions(interaction) {
    console.log('Lobby interaction received:', interaction.customId);
    
    try {
        const { models } = require('../database/setup');
        
        if (interaction.customId === 'lobby-build-army') {
            // Redirect to army builder
            const { showMainArmyBuilder } = require('./commands/build-army');
            const commander = await models.Commander.findByPk(interaction.user.id);
            
            if (!commander || !commander.culture) {
                // Show culture selection first
                await interaction.reply({
                    content: 'First, choose your ancient civilization:',
                    components: [createCultureSelectMenu()],
                    ephemeral: true
                });
            } else {
            // Initialize army composition if modifying existing army
            const { armyCompositions } = require('./commands/build-army');
            
            // Check if composition exists, if not create one
            if (!armyCompositions.has(interaction.user.id)) {
                armyCompositions.set(interaction.user.id, {
                    culture: commander.culture,
                    units: [],
                    equipment: {},
                    support: [],
                    usedSP: 0,
                    totalSP: 30 // Will be adjusted for culture
                });
            }
            
            const { showMainArmyBuilder } = require('./commands/build-army');
            await showMainArmyBuilder(interaction, commander);
        }
                    
        } else if (interaction.customId === 'lobby-create-battle') {
            await showBattleCreation(interaction);
            
        } else if (interaction.customId === 'lobby-join-battle') {
            await showAvailableBattles(interaction);
            
        } else if (interaction.customId === 'lobby-my-stats') {
            await showPlayerStats(interaction);
            
        } else if (interaction.customId === 'lobby-battle-history') {
            await showBattleHistory(interaction);
            
        } else if (interaction.customId === 'lobby-help') {
            await showHelpAndCommands(interaction);
            
        } else if (interaction.customId === 'quick-create-battle') {
            await handleQuickBattleCreation(interaction);
            
        } else if (interaction.customId.startsWith('quick-join-')) {
            await handleQuickJoin(interaction);
        }
        
    } catch (error) {
        console.error('Lobby interaction error:', error);
        await interaction.reply({
            content: 'Error in lobby system.',
            ephemeral: true
        });
    }
}

async function showBattleCreation(interaction) {
    const { models } = require('../database/setup');
    const { BATTLE_SCENARIOS } = require('./commands/create-game');
    
    // Get commander for cultural advantages
    const commander = await models.Commander.findByPk(interaction.user.id);
    
    if (!commander) {
        return interaction.reply({
            content: '❌ Build an army first!',
            ephemeral: true
        });
    }
    
    // Use the same scenario selection as /create-game command
    const { StringSelectMenuBuilder } = require('discord.js');
    
    const options = Object.entries(BATTLE_SCENARIOS).map(([scenarioKey, scenario]) => {
        const advantages = scenario.culturalAdvantages.includes(commander.culture) ? ' ⭐' : '';
        return {
            label: scenario.name + advantages,
            description: scenario.description,
            value: scenarioKey
        };
    });

    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('scenario-selection')
                .setPlaceholder('Choose your battlefield...')
                .addOptions(options)
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle(`${commander.culture} - Battle Creation`)
        .setDescription('Select a battlefield scenario for your ancient warfare engagement:')
        .addFields(
            Object.entries(BATTLE_SCENARIOS).slice(0, 5).map(([scenarioKey, scenario]) => {
                const advantage = scenario.culturalAdvantages.includes(commander.culture) ? '\n⭐ **Cultural Advantage**' : '';
                return {
                    name: scenario.name,
                    value: `${scenario.description}\n**Objective:** ${scenario.objective}${advantage}`,
                    inline: true
                };
            })
        )
        .setFooter({ text: '⭐ indicates your culture has advantages in this terrain' });

    await interaction.reply({
        embeds: [embed],
        components: [selectMenu],
        ephemeral: true
    });
}

async function showAvailableBattles(interaction) {
    const { models } = require('../database/setup');
    
    // Find available battles to join
    const availableBattles = await models.Battle.findAll({
        where: {
            status: 'waiting_for_players',
            player2Id: null,
            player1Id: { [Op.ne]: interaction.user.id } // Not their own battle
        },
        include: ['player1'],
        limit: 10,
        order: [['createdAt', 'DESC']]
    });

    if (availableBattles.length === 0) {
        await interaction.update({
            content: '🏺 **No battles available to join**\n\nThere are currently no open battles waiting for opponents. Create your own battle to get started!',
            embeds: [],
            components: [createBackToLobbyButton()]
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('🛡️ Available Battles')
        .setDescription('Join an existing battle created by another commander:')
        .addFields(
            availableBattles.slice(0, 5).map(battle => {
                const scenario = battle.scenario.replace('_', ' ');
                const timeAgo = Math.round((Date.now() - new Date(battle.createdAt)) / (1000 * 60));
                return {
                    name: `${scenario} vs ${battle.player1.culture}`,
                    value: `**Creator:** ${battle.player1.username}\n**Weather:** ${battle.weather.replace('_', ' ')}\n**Created:** ${timeAgo}m ago`,
                    inline: true
                };
            })
        );

    // Create join buttons for each battle
    const joinButtons = new ActionRowBuilder()
        .addComponents(
            ...availableBattles.slice(0, 3).map(battle => 
                new ButtonBuilder()
                    .setCustomId(`quick-join-${battle.id}`)
                    .setLabel(`Join ${battle.scenario.replace('_', ' ')}`)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('⚔️')
            )
        );

    const backButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back-to-lobby')
                .setLabel('Back to Lobby')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🏛️')
        );

    const components = [joinButtons, backButton];
    if (availableBattles.length > 3) {
        // Add more join buttons if needed
        const moreButtons = new ActionRowBuilder()
            .addComponents(
                ...availableBattles.slice(3, 5).map(battle =>
                    new ButtonBuilder()
                        .setCustomId(`quick-join-${battle.id}`)
                        .setLabel(`Join ${battle.scenario.replace('_', ' ')}`)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('⚔️')
                )
            );
        components.splice(1, 0, moreButtons);
    }

    await interaction.update({
        embeds: [embed],
        components: components
    });
}

async function showPlayerStats(interaction) {
    const { models } = require('../database/setup');
    
    const commander = await models.Commander.findByPk(interaction.user.id, {
        include: ['eliteUnits']
    });

    if (!commander) {
        await interaction.reply({
            content: 'No commander profile found. Use `/build-army` to get started!',
            ephemeral: true
        });
        return;
    }

    const winRate = commander.getWinRate();
    const rank = commander.rank;
    
    // Calculate elite unit stats
    let eliteUnitStats = 'No elite units';
    if (commander.eliteUnits && commander.eliteUnits.length > 0) {
        const eliteUnit = commander.eliteUnits[0];
        eliteUnitStats = `${eliteUnit.name} (${eliteUnit.currentStrength}/${eliteUnit.size})\nVeteran Level: ${eliteUnit.veteranLevel}\nBattles: ${eliteUnit.battlesParticipated}`;
    }

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle(`📊 Commander Profile - ${commander.username}`)
        .addFields(
            {
                name: '🏛️ Civilization',
                value: commander.culture || 'Not selected',
                inline: true
            },
            {
                name: '🎖️ Rank',
                value: rank,
                inline: true
            },
            {
                name: '💯 Reputation',
                value: `${commander.reputation}/200`,
                inline: true
            },
            {
                name: '⚔️ Battle Record',
                value: `**Total:** ${commander.totalBattles}\n**Wins:** ${commander.battlesWon}\n**Losses:** ${commander.battlesLost}\n**Win Rate:** ${winRate}%`,
                inline: true
            },
            {
                name: '🏺 Elite Unit',
                value: eliteUnitStats,
                inline: true
            },
            {
                name: '🎯 Tactical Preferences',
                value: `**Aggressive:** ${commander.preferredTactics.aggressive}\n**Defensive:** ${commander.preferredTactics.defensive}\n**Mobile:** ${commander.preferredTactics.mobile}\n**Formation:** ${commander.preferredTactics.formation}`,
                inline: true
            }
        )
        .setFooter({ text: 'Stats update after each battle' });

    await interaction.update({
        embeds: [embed],
        components: [createBackToLobbyButton()]
    });
}

async function showHelpAndCommands(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('❓ Cohort Help & Commands')
        .setDescription('**Hybrid Interface System** - Use buttons OR commands, your choice!')
        .addFields(
            {
                name: '🎮 Main Actions (Buttons + Commands)',
                value: '**Button:** Use lobby interface\n**Commands:**\n• `/lobby` - Open main lobby\n• `/build-army` - Army builder\n• `/create-game [scenario]` - Create battle\n• `/join-battle` - Find battles',
                inline: false
            },
            {
                name: '⚔️ Battle Commands (DM Only)',
                value: '**Natural Language Orders:**\n• "advance infantry to bridge"\n• "archers target enemy cavalry"\n• "form testudo and push forward"\n• "cavalry flank through woods"\n\n**Quick Commands:**\n• `advance` - General advance\n• `defend` - Hold positions\n• `retreat` - Tactical withdrawal',
                inline: false
            },
            {
                name: '🏺 Army Building (Visual + Commands)',
                value: '**Visual:** Step-by-step button interface\n**Commands:**\n• `/build-army` - Open army builder\n• `/save-army` - Save current composition\n• `/army-templates` - Quick army builds',
                inline: false
            },
            {
                name: '📊 Information Commands',
                value: '• `/stats` - Your commander profile\n• `/battles` - Battle history\n• `/leaderboard` - Top commanders\n• `/cultures` - Culture information\n• `/help` - This help message',
                inline: false
            }
        )
        .setFooter({ text: 'New players: Use buttons. Experienced: Use commands for speed.' });

    await interaction.update({
        embeds: [embed],
        components: [createBackToLobbyButton()]
    });
}

async function handleQuickBattleCreation(interaction) {
    // Quick random battle creation
    const scenarios = ['bridge_control', 'hill_fort_assault', 'forest_ambush', 'river_crossing', 'desert_oasis'];
    const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    
    const { createBattleWithScenario } = require('./commands/create-game');
    const { models } = require('../database/setup');
    
    const commander = await models.Commander.findByPk(interaction.user.id);
    await createBattleWithScenario(interaction, randomScenario, commander);
}

async function handleQuickJoin(interaction) {
    const battleId = interaction.customId.split('-')[2];
    
    // Use existing join battle logic
    const { handleGameInteractions } = require('./gameInteractionHandler');
    
    // Simulate join-battle interaction
    const simulatedInteraction = {
        ...interaction,
        customId: `join-battle-${battleId}`
    };
    
    await handleGameInteractions(simulatedInteraction);
}

function createCultureSelectMenu() {
    const { CULTURES } = require('./commands/build-army');
    
    const options = Object.entries(CULTURES).map(([culture, data]) => ({
        label: culture,
        description: `Elite: ${data.elite} (${data.size} warriors)`,
        value: culture
    }));

    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select-culture')
                .setPlaceholder('Choose your ancient civilization...')
                .addOptions(options)
        );
}

function createBackToLobbyButton() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back-to-lobby')
                .setLabel('Back to Lobby')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🏛️')
        );
}

module.exports = {
    handleLobbyInteractions
};

async function showBattleHistory(interaction) {
    await interaction.reply({
        content: 'Battle history coming soon! This will show your past engagements and veteran progression.',
        ephemeral: true
    });
}