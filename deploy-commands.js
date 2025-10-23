const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'src/bot/commands');

// Check if commands directory exists
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(`⚠️ Command at ${filePath} is missing required "data" or "execute" property.`);
        }
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;

// Deploy commands
(async () => {
    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

        // Register commands globally (takes up to 1 hour to propagate)
        // For faster testing, you can register to a specific guild instead
        const data = await rest.put(
Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();