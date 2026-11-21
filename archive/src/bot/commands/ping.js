const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Test if Cohort is responding'),
    async execute(interaction) {
        const sent = await interaction.reply({ 
            content: '🏺 Testing connection...', 
            fetchReply: true 
        });
        
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        
        await interaction.editReply(
            `🏺 **Cohort is online and ready for ancient warfare!**\n` +
            `📡 Latency: ${latency}ms\n` +
            `💓 API Heartbeat: ${Math.round(interaction.client.ws.ping)}ms`
        );
    },
};