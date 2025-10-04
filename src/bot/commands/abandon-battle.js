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
            
            // Find user's active battle
            const battle = await models.Battle.findOne({
                where: {
                    [Op.or]: [
                        { status: 'waiting_for_players' },
                        { status: 'in_progress' }
                    ],
                    [Op.or]: [
                        { player1Id: interaction.user.id },
                        { player2Id: interaction.user.id }
                    ]
                }
            });
            
            if (!battle) {
                return interaction.editReply({
                    content: '❌ You are not in any active battle.'
                });
            }
            
            // Mark as abandoned
            battle.status = 'abandoned';
            battle.winner = battle.player1Id === interaction.user.id ? 
                battle.player2Id : battle.player1Id;
            await battle.save();
            await battle.reload(); // Force database sync
            console.log(`Battle ${battle.id} status updated to: ${battle.status}`);
            return interaction.editReply({
                content: `✅ **Battle Abandoned**\n\n` +
                        `You have forfeited the battle.\n` +
                        `Battle ID: ${battle.id}\n\n` +
                        `You can now create or join a new battle.`
            });
            
        } catch (error) {
            console.error('Abandon battle error:', error);
            return interaction.editReply({
                content: '❌ Error abandoning battle. Please try again.'
            });
        }
    }
};