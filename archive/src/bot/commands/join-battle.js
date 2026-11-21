const { SlashCommandBuilder } = require('discord.js');
const { Op } = require('sequelize');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join-battle')
        .setDescription('Quickly join an available battle'),
    
    async execute(interaction) {
        try {
            const { models } = require('../../database/setup');
            
            // Check if user has an army
            const commander = await models.Commander.findByPk(interaction.user.id);
            if (!commander || !commander.culture) {
                await interaction.reply({
                    content: 'You need to build an army first! Use `/build-army` to create your forces.',
                    ephemeral: true
                });
                return;
            }

            // Find available battles
            const availableBattles = await models.Battle.findAll({
                where: {
                    status: 'waiting_for_players',
                    player2Id: null,
                    player1Id: { [Op.ne]: interaction.user.id }
                },
                include: ['player1'],
                limit: 5,
                order: [['createdAt', 'DESC']]
            });

            if (availableBattles.length === 0) {
                await interaction.reply({
                    content: 'No battles available to join. Use `/create-game` to create one!',
                    ephemeral: true
                });
                return;
            }

            // Auto-join the most recent battle
            const battle = availableBattles[0];
            
            // Update battle with player 2
            await battle.update({
                player2Id: interaction.user.id,
                status: 'army_building'
            });

            await interaction.reply({
                content: `Joined battle: **${battle.scenario.replace('_', ' ')}** vs **${battle.player1.culture}**\n\nCheck your DMs for tactical briefing!`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Join battle command error:', error);
            await interaction.reply({
                content: 'Error joining battle.',
                ephemeral: true
            });
        }
    }
};