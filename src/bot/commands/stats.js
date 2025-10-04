const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View your commander profile and battle statistics'),
    
    async execute(interaction) {
        try {
            const { models } = require('../../database/setup');
            
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
            
            const embed = new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle(`📊 ${commander.username} - Commander Profile`)
                .addFields(
                    {
                        name: '🏛️ Civilization',
                        value: commander.culture || 'Not selected',
                        inline: true
                    },
                    {
                        name: '🎖️ Rank',
                        value: commander.rank,
                        inline: true
                    },
                    {
                        name: '⚔️ Battle Record',
                        value: `${commander.battlesWon}W - ${commander.battlesLost}L (${winRate}%)`,
                        inline: true
                    }
                );

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

        } catch (error) {
            console.error('Stats command error:', error);
            await interaction.reply({
                content: 'Error loading stats.',
                ephemeral: true
            });
        }
    }
};