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
            
            // Find user's MOST RECENT active battle
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
                },
                order: [['createdAt', 'DESC']] // Get most recent
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
            
            console.log(`Battle ${battle.id.substring(0, 8)} abandoned by ${interaction.user.id}`);
            
            return interaction.editReply({
                content: `✅ **Battle Abandoned**\n\n` +
                        `Battle ID: ${battle.id.substring(0, 8)}\n\n` +
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