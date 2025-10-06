//This abaandons all active battles for the user!!!

const { SlashCommandBuilder } = require('discord.js');
const { Op } = require('sequelize');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('abandon-battle')
        .setDescription('Leave your current battle (forfeit)'),
    
    async execute(interaction) {
        try {
            const { models } = require('../../database/setup');
            
            await interaction.deferReply({ ephemeral: true });
            
            // Find ALL user's active battles and abandon them
            const battles = await models.Battle.findAll({
                where: {
                    [Op.or]: [
                        { player1Id: interaction.user.id },
                        { player2Id: interaction.user.id }
                    ],
                    status: {
                        [Op.in]: ['waiting_for_players', 'in_progress']
                    }
                }
            });
            
            if (battles.length === 0) {
                return interaction.editReply({
                    content: 'You are not in any active battles.'
                });
            }
            
            // Abandon all found battles
            for (const battle of battles) {
                battle.status = 'abandoned';
                battle.winner = battle.player1Id === interaction.user.id ? 
                    battle.player2Id : battle.player1Id;
                await battle.save();
            }
            
            return interaction.editReply({
                content: `Battle${battles.length > 1 ? 's' : ''} abandoned. You can now create a new battle.`
            });
            
        } catch (error) {
            console.error('Abandon battle error:', error);
            return interaction.editReply({
                content: 'Error abandoning battle.'
            });
        }
    }
};