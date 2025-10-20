const { Client, GatewayIntentBits, Events } = require('discord.js');
const { setupDatabase } = require('./database/setup');
const { loadCommands } = require('./bot/commandLoader');
const { initializeAI } = require('./ai/aiManager');
require('dotenv').config();

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
    ]
});

// Store commands in client for easy access
client.commands = new Map();

async function initializeBot() {
    try {
        console.log('🏺 Cohort - Ancient Warfare Strategy Bot Starting...');
        
        // Initialize database
        console.log('📚 Setting up database...');
        await setupDatabase();
        
        // Initialize AI systems
        console.log('🤖 Initializing AI providers...');
        await initializeAI();
        
        // Load commands
        console.log('⚔️ Loading battle commands...');
        await loadCommands(client);
        
        // Scenario key alignment assertion
        try {
            const { assertScenarioKeys } = require('./game/validation/scenarioKeyAssert');
            assertScenarioKeys();
            console.log('🧭 Scenario keys aligned with map modules.');
        } catch (e) {
            console.error('❌ Scenario key assertion failed:', e.message);
            process.exit(1);
        }

        console.log('✅ Initialization complete!');
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        process.exit(1);
    }
}

// Event handlers
client.once(Events.ClientReady, async (readyClient) => {
    console.log(`🏛️ Cohort is online! Logged in as ${readyClient.user.tag}`);
    console.log(`📊 Serving ${readyClient.guilds.cache.size} servers`);
    
    // Set bot presence
    client.user.setPresence({
        activities: [{ name: 'Ancient Warfare Strategy', type: 0 }],
        status: 'online'
    });
});

// Handle all interactions (slash commands, buttons, select menus)
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isCommand()) {
            // Handle slash commands
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            
            await command.execute(interaction);
            
        } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select-culture') {
        // Route to army handler
        const { handleArmyBuilderInteractions } = require('./bot/armyInteractionHandler');
        await handleArmyBuilderInteractions(interaction);
                
            } else if (interaction.customId === 'scenario-selection') {
                // Battle scenario selection
                const { handleGameInteractions } = require('./bot/gameInteractionHandler');
                await handleGameInteractions(interaction);
                
            } else {
                // Army building select menus
                const { handleArmyBuilderInteractions } = require('./bot/armyInteractionHandler');
                await handleArmyBuilderInteractions(interaction);
            }
            
        } else if (interaction.isButton()) {
            // Route buttons to appropriate handlers based on prefix
            if (interaction.customId.startsWith('lobby-')) {
                const { handleLobbyInteractions } = require('./bot/lobbyInteractionHandler');
                await handleLobbyInteractions(interaction);
            } else if (interaction.customId === 'select-culture') {
                const { handleArmyInteractions } = require('./bot/armyInteractionHandler');
                await handleArmyInteractions(interaction);
            } else if (interaction.customId.startsWith('join-battle-') ||
                       interaction.customId.startsWith('ready-for-battle-') ||
                       interaction.customId.startsWith('abandon-battle-') ||
                       interaction.customId === 'create-bridge-control' ||
                       interaction.customId === 'create-hill-fort' ||
                       interaction.customId === 'create-forest-ambush' ||
                       interaction.customId === 'create-river-crossing' ||
                       interaction.customId === 'create-desert-oasis' ||
                       interaction.customId.startsWith('quick-')) {
                const { handleGameInteractions } = require('./bot/gameInteractionHandler');
                await handleGameInteractions(interaction);
            } else if (interaction.customId === 'back-to-lobby') {
                const { showMainLobby } = require('./bot/commands/lobby');
                const { models } = require('./database/setup');
                const commander = await models.Commander.findByPk(interaction.user.id);
                const isNewPlayer = !commander || !commander.culture;
                await showMainLobby(interaction, commander, isNewPlayer);
            } else {
                const { handleArmyBuilderInteractions } = require('./bot/armyInteractionHandler');
                await handleArmyBuilderInteractions(interaction);
            }
        }
        
    } catch (error) {
        console.error('Interaction handler error:', error);
        const errorMessage = 'There was an error processing this interaction!';
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});



// Unified DM handler (removes duplicates)
client.on(Events.MessageCreate, async (message) => {
    try {
        if (message.author.bot) return;
        if (!message.channel.isDMBased && typeof message.channel.isDMBased !== 'function') return;
        if (!message.channel.isDMBased()) return;
        const { handleDMCommand } = require('./bot/dmHandler');
        await handleDMCommand(message, client);
    } catch (e) {
        console.error('DM handler error:', e);
    }
});

// Error handling
client.on(Events.Error, error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('SIGINT', () => {
    console.log('🏺 Cohort shutting down gracefully...');
    client.destroy();
    process.exit(0);
});


// Initialize and start bot
initializeBot().then(() => {
    client.login(process.env.DISCORD_TOKEN);
});