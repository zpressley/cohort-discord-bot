const fs = require('fs');
const path = require('path');

async function loadCommands(client) {
    const commandsPath = path.join(__dirname, 'commands');
    
    // Create commands directory if it doesn't exist
    if (!fs.existsSync(commandsPath)) {
        fs.mkdirSync(commandsPath, { recursive: true });
        console.log('📁 Created commands directory');
        
        // Create a basic ping command for testing
        const pingCommand = `const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Test if Cohort is responding'),
    async execute(interaction) {
        await interaction.reply('🏺 Cohort is online and ready for ancient warfare!');
    },
};`;
        
        fs.writeFileSync(path.join(commandsPath, 'ping.js'), pingCommand);
        console.log('✅ Created basic ping command');
        return;
    }
    
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠️ Command at ${filePath} is missing required "data" or "execute" property.`);
        }
    }
}

module.exports = { loadCommands };