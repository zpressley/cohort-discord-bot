const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Op } = require('sequelize');
// Store pending orders for warning confirmations
const pendingOrders = new Map();

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
        // ===== ADD THESE NEW HANDLERS =====
        else if (interaction.customId.startsWith('confirm_order_')) {
            await handleWarningConfirmation(interaction);
        } else if (interaction.customId.startsWith('cancel_order_')) {
            await handleWarningCancellation(interaction);
        }
        // ===== END NEW HANDLERS =====
        
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
    
    // UUID has hyphens, so we need to extract everything after "join-battle-"
    const battleId = interaction.customId.replace('join-battle-', '');
    console.log('DEBUG - Attempting to join battle:', battleId);

    // Check if user can join this battle
    const commander = await models.Commander.findByPk(interaction.user.id);
    console.log('DEBUG - Commander found:', !!commander);
    console.log('DEBUG - Commander has culture:', !!commander?.culture);
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
    // ADD DEBUG:
    console.log('DEBUG - Battle found:', !!battle);
    console.log('DEBUG - Battle status:', battle?.status);
    console.log('DEBUG - Battle player2Id:', battle?.player2Id);
    if (!battle) {
        // ADD MORE DEBUG:
        const allBattles = await models.Battle.findAll({
            where: { status: 'waiting_for_players' }
        });
        console.log('DEBUG - All waiting battles:', allBattles.map(b => ({
            id: b.id,
            status: b.status,
            player1: b.player1Id,
            player2: b.player2Id
        })));
        
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
            [Op.or]: [
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
                value: 'Battle initializing...',
                inline: false
            }
        )
        .setFooter({ text: 'Check your DMs for tactical briefings!' });

    // Reply to interaction first
    await interaction.reply({
        content: '✅ Battle joined! Initializing...',
        ephemeral: true
    });

    // Update the original battle message if we have it
    if (battle.messageId && battle.channelId) {
        try {
            const channel = await interaction.client.channels.fetch(battle.channelId);
            const message = await channel.messages.fetch(battle.messageId);
            await message.edit({
                embeds: [updatedEmbed],
                components: [] // Remove join button
            });
        } catch (e) {
            console.warn('Could not update original battle message:', e.message);
        }
    }

    // Send private briefings to both players
    const player1 = await models.Commander.findByPk(battle.player1Id);
    const player1User = interaction.client.users.cache.get(battle.player1Id);
    const player2User = interaction.user;

    if (player1User) {
        await sendPrivateBriefing(player1User, battle, scenario, player1, 'player1');
    }
    await sendPrivateBriefing(player2User, battle, scenario, commander, 'player2');

    // Initialize and start battle immediately
    const { initializeBattle } = require('../game/battleInitializer');
    const { sendInitialBriefings } = require('../game/briefingSystem');

    try {
        const initialState = await initializeBattle(battle, player1, commander);
        
        await battle.update({
            battleState: initialState,
            status: 'in_progress',
            currentTurn: 1
        });
        
        await battle.reload();
        
        await models.BattleTurn.create({
            battleId: battle.id,
            turnNumber: 1
        });
        
        await sendInitialBriefings(battle, initialState, interaction.client);
        
        console.log('✅ Battle initialized and started');
        
    } catch (initError) {
        console.error('Battle initialization failed:', initError);
        await interaction.user.send(`❌ Error starting battle: ${initError.message}`);
        if (player1User) {
            await player1User.send(`❌ Error starting battle: ${initError.message}`);
        }
    }
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
    const { initializeBattle } = require('../game/battleInitializer');
    const { sendInitialBriefings } = require('../game/briefingSystem');
    
    console.log(`🎬 Starting battle phase for ${battle.id}`);
    
    try {
        // Get both commanders
        const p1Commander = await models.Commander.findByPk(battle.player1Id);
        const p2Commander = await models.Commander.findByPk(battle.player2Id);
        
        if (!p1Commander || !p2Commander) {
            throw new Error('Cannot find commander records');
        }
        
        // Initialize battle with proper unit deployment
        const initialState = await initializeBattle(battle, p1Commander, p2Commander);
        
        // Update battle with initialized state
        await battle.update({
            battleState: initialState,
            status: 'in_progress',
            currentTurn: 1
        });
        
        // Reload to get updated state
        await battle.reload();
        
        // Create Turn 1 record
        await models.BattleTurn.create({
            battleId: battle.id,
            turnNumber: 1,
            player1Command: null,
            player2Command: null
        });
        
        // Send initial briefings with opening narrative
        const client = require('../index').client;
        await sendInitialBriefings(battle, initialState, client);
        
        console.log(`✅ Battle ${battle.id} initialized and briefings sent`);
        
    } catch (error) {
        console.error('Error starting battle phase:', error);
        
        // Notify players of error
        try {
            const client = require('../index').client;
            const p1 = await client.users.fetch(battle.player1Id);
            const p2 = battle.player2Id ? await client.users.fetch(battle.player2Id) : null;
            
            const errorMsg = `❌ Error initializing battle: ${error.message}\n\nPlease report this issue.`;
            await p1.send(errorMsg);
            if (p2) await p2.send(errorMsg);
        } catch (dmError) {
            console.error('Could not send error DMs:', dmError);
        }
    }
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

/**
 * Handle veteran warning confirmation - proceed with risky orders
 */
async function handleWarningConfirmation(interaction) {
    const { models } = require('../database/setup');
    
    const battleId = parseInt(interaction.customId.split('_')[2]);
    const battle = await models.Battle.findByPk(battleId);
    
    if (!battle) {
        await interaction.reply({ 
            content: 'Battle not found. It may have ended.', 
            ephemeral: true 
        });
        return;
    }
    
    const playerSide = battle.player1Id === interaction.user.id ? 'player1' : 'player2';
    const orderKey = `${battleId}_${playerSide}`;
    const pendingOrder = pendingOrders.get(orderKey);
    
    if (!pendingOrder) {
        await interaction.reply({ 
            content: 'Order expired. Please resubmit your command.', 
            ephemeral: true 
        });
        return;
    }
    
    // Update the warning message to show confirmation
    await interaction.update({ 
        content: `✅ **Proceeding with orders despite warnings...**\n\n` +
                 `*Order:* "${pendingOrder}"\n\n` +
                 `*Your officers salute and prepare to execute your commands.*`, 
        components: [] 
    });
    
    // Process the order by importing dmHandler's processPlayerOrder
    const { processPlayerOrder } = require('./dmHandler');
    
    // Create a fake message object that processPlayerOrder expects
    const fakeMessage = {
        content: pendingOrder,
        author: interaction.user,
        id: `${interaction.id}_confirmed`,
        reply: async (content) => {
            // Send as followUp so it appears as a new message
            return interaction.followUp(content);
        }
    };
    
    console.log(`Processing confirmed order for ${playerSide}: "${pendingOrder}"`);
    
    try {
        await processPlayerOrder(fakeMessage, battle, interaction.user.id, playerSide, interaction.client);
        pendingOrders.delete(orderKey);
    } catch (error) {
        console.error('Error processing confirmed order:', error);
        await interaction.followUp({
            content: '⚠️ Error processing your order. Please try again.',
            ephemeral: true
        });
    }
}

/**
 * Handle veteran warning cancellation - cancel risky orders
 */
async function handleWarningCancellation(interaction) {
    const { models } = require('../database/setup');
    
    const battleId = parseInt(interaction.customId.split('_')[2]);
    const battle = await models.Battle.findByPk(battleId);
    
    if (!battle) {
        await interaction.reply({ 
            content: 'Battle not found.', 
            ephemeral: true 
        });
        return;
    }
    
    const playerSide = battle.player1Id === interaction.user.id ? 'player1' : 'player2';
    const orderKey = `${battleId}_${playerSide}`;
    
    // Update the message to show cancellation
    await interaction.update({ 
        content: `❌ **Orders cancelled.**\n\n` +
                 `*Your officers await new commands.*\n\n` +
                 `Submit revised orders in this DM when ready.`, 
        components: [] 
    });
    
    // Clear the pending order
    pendingOrders.delete(orderKey);
    
    console.log(`Order cancelled by ${playerSide} in battle ${battleId}`);
}

module.exports = {
    handleGameInteractions,
    pendingOrders
};