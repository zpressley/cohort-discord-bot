const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');
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
    ],
    partials: [Partials.Channel]
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

// Handle all interactions via central router
client.on(Events.InteractionCreate, async (interaction) => {
    const { handle } = require('./bot/interactionRouter');
    await handle(interaction, client);
});

// Handle Direct Message orders (DMs)
client.on(Events.MessageCreate, async (message) => {
    try {
        // Only handle DMs from users (not in guilds, not bots)
        if (message.guild || message.author.bot) return;
        const { handleDMCommand } = require('./bot/dmHandler');
        await handleDMCommand(message, client);
    } catch (e) {
        console.error('DM handling error:', e);
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


// Export client for other modules that may need it
module.exports.client = client;

// Initialize and start bot
initializeBot().then(() => {
    client.login(process.env.DISCORD_TOKEN);
});
