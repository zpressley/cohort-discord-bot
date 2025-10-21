const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function handleGameInteractions(interaction) {
    console.log('Game interaction received:', interaction.customId);
    
    try {
        const { models } = require('../database/setup');
        const { BATTLE_SCENARIOS, createBattleWithScenario, sendPrivateBriefing } = require('./commands/create-game');
        
        if (interaction.customId === 'scenario-selection') {
            await handleScenarioSelection(interaction);
        } else if (interaction.customId.startsWith('join-battle-')) {
            await handleBattleJoin(interaction);
        } else if (interaction.customId.startsWith('ready-for-battle-')) {
            await handleReadyForBattle(interaction);
        }
        
    } catch (error) {
        console.error('Game interaction error:', error);
        await interaction.reply({
            content: 'Error processing game interaction.',
            ephemeral: true
        });
    }
}

async function handleScenarioSelection(interaction) {
    const { models } = require('../database/setup');
    const { createBattleWithScenario } = require('./commands/create-game');
    
    const scenarioKey = interaction.values[0];
    const commander = await models.Commander.findByPk(interaction.user.id);
    
    console.log('Scenario selection - Commander found:', commander ? 'YES' : 'NO');
    console.log('Commander data:', JSON.stringify(commander?.toJSON(), null, 2));
    
    if (!commander) {
        return interaction.reply({
            content: '❌ Commander not found. Try building an army again with `/lobby`',
            ephemeral: true
        });
    }
    
    await createBattleWithScenario(interaction, scenarioKey, commander);
}

async function handleBattleJoin(interaction) {
    const { models } = require('../database/setup');
    const { BATTLE_SCENARIOS, sendPrivateBriefing } = require('./commands/create-game');
    
    const battleId = interaction.customId.split('-')[2];
    
    // Check if user can join this battle
    const commander = await models.Commander.findByPk(interaction.user.id);
    if (!commander || !commander.culture) {
        await interaction.reply({
            content: 'You need to build an army first! Use `/build-army` to create your forces.',
            ephemeral: true
        });
        return;
    }

    // Get the battle
    const battle = await models.Battle.findByPk(battleId, {
        include: ['player1', 'player2']
    });

    if (!battle) {
        await interaction.reply({
            content: 'Battle not found or has been cancelled.',
            ephemeral: true
        });
        return;
    }

    if (battle.player1Id === interaction.user.id) {
        await interaction.reply({
            content: 'You cannot join your own battle!',
            ephemeral: true
        });
        return;
    }

    if (battle.player2Id) {
        await interaction.reply({
            content: 'This battle is already full!',
            ephemeral: true
        });
        return;
    }

    // Check if user has active battles
    const userActiveBattle = await models.Battle.findOne({
        where: {
            status: ['waiting_for_players', 'army_building', 'in_progress'],
            [models.sequelize.Op.or]: [
                { player1Id: interaction.user.id },
                { player2Id: interaction.user.id }
            ]
        }
    });

    if (userActiveBattle) {
        await interaction.reply({
            content: 'You already have an active battle! Finish or abandon it first.',
            ephemeral: true
        });
        return;
    }

    // Join the battle
    await battle.update({
        player2Id: interaction.user.id,
        status: 'army_building'
    });

    // Generate initial weather for battle
    await battle.generateWeather();
    
    const scenario = BATTLE_SCENARIOS[battle.scenario];
    
    // Update the original message
    const updatedEmbed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle(`⚔️ BATTLE "${scenario.name.toUpperCase()}" - COMMANDERS READY!`)
        .setDescription(`${scenario.description}`)
        .addFields(
            {
                name: '🗺️ Battlefield',
                value: `**Terrain:** ${scenario.terrain.replace('_', ' ')}\n**Weather:** ${battle.weather.replace('_', ' ')}\n**Max Turns:** ${scenario.maxTurns}`,
                inline: true
            },
            {
                name: '🎯 Victory Conditions',
                value: scenario.objective,
                inline: true
            },
            {
                name: '⚡ Special Rules',
                value: scenario.specialRules,
                inline: false
            },
            {
                name: '👤 Commander 1',
                value: `**${battle.player1.culture}**\n${battle.player1.username}`,
                inline: true
            },
            {
                name: '👤 Commander 2',
                value: `**${commander.culture}**\n${commander.username}`,
                inline: true
            },
            {
                name: '⏳ Status',
                value: 'Both commanders reviewing their armies...',
                inline: false
            }
        )
        .setFooter({ text: 'Commanders will receive private tactical briefings shortly!' });

    const readyButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`ready-for-battle-${battle.id}`)
                .setLabel('Ready for Battle')
                .setStyle(ButtonStyle.Success)
                .setEmoji('⚔️'),
            new ButtonBuilder()
                .setCustomId(`abandon-battle-${battle.id}`)
                .setLabel('Abandon Battle')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚪')
        );

    await interaction.update({
        embeds: [updatedEmbed],
        components: [readyButtons]
    });

    // Send private briefings to both players
    const player1 = await models.Commander.findByPk(battle.player1Id);
    const player1User = interaction.client.users.cache.get(battle.player1Id);
    const player2User = interaction.user;

    if (player1User) {
        await sendPrivateBriefing(player1User, battle, scenario, player1, 'player1');
    }
    await sendPrivateBriefing(player2User, battle, scenario, commander, 'player2');

    await interaction.followUp({
        content: 'Battle joined! Check your DMs for your private tactical briefing.',
        ephemeral: true
    });
}

async function handleReadyForBattle(interaction) {
    const { models } = require('../database/setup');
    
    const battleId = interaction.customId.split('-')[3];
    const battle = await models.Battle.findByPk(battleId, {
        include: ['player1', 'player2']
    });

    if (!battle) {
        await interaction.reply({
            content: 'Battle not found.',
            ephemeral: true
        });
        return;
    }

    // Mark player as ready (you could track this in battle state)
    const isPlayer1 = battle.player1Id === interaction.user.id;
    const playerRole = isPlayer1 ? 'player1' : 'player2';
    
    // Update battle state to show player is ready
    const newBattleState = { ...battle.battleState };
    newBattleState[playerRole].ready = true;
    
    await battle.update({
        battleState: newBattleState,
        status: 'in_progress' // Both players joined, battle can begin
    });

    await interaction.reply({
        content: `You are ready for battle! Once both commanders confirm readiness, detailed tactical briefings will be sent and Turn 1 will begin.`,
        ephemeral: true
    });

    // Check if both players are ready
    if (newBattleState.player1.ready && newBattleState.player2.ready) {
        await startBattlePhase(battle);
    }
}

async function startBattlePhase(battle) {
    const { models } = require('../database/setup');
    const { BATTLE_SCENARIOS } = require('./commands/create-game');
    
    // Create first turn
    await models.BattleTurn.create({
        battleId: battle.id,
        turnNumber: 1,
        player1Command: null,
        player2Command: null
    });

    const scenario = BATTLE_SCENARIOS[battle.scenario];
    
    // Send initial map/briefings to both players
    const { handleDMCommand } = require('./dmHandler');
    try {
        const client = require('../index').client || interaction?.client; // best-effort
        const { sendNextTurnBriefings } = require('./dmHandler');
        await sendNextTurnBriefings(battle, battle.battleState, { p1Interpretation:{}, p2Interpretation:{} }, client);
    } catch (e) {
        console.log('Initial briefing send skipped:', e.message);
    }

    console.log(`Battle ${battle.id} - ${scenario.name} has begun!`);
    console.log(`Weather: ${battle.weather}, Turn 1 awaiting commands`);
}

function createDetailedTacticalBriefing(battle, scenario) {
    return {
        title: `Turn 1 - ${scenario.name}`,
        description: 'Detailed tactical situation with officer advice...',
        weather: battle.weather,
        terrain: scenario.terrain,
        specialInstructions: 'This would contain the rich AI-generated briefing from your sample documents'
    };
}

module.exports = {
    handleGameInteractions
};