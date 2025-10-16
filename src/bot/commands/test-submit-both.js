// src/bot/commands/test-submit-both.js
// Developer command to simulate both players submitting orders and resolve turn

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-submit-both')
        .setDescription('DEV: Submit orders for both players and resolve turn')
        .addStringOption(option =>
            option.setName('player1-order')
                .setDescription('Player 1 order (your order)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('player2-order')
                .setDescription('Player 2 order (test opponent order)')
                .setRequired(true)),
    
    // In test-submit-both.js

    async execute(interaction) {
        try {
            const { models } = require('../../database/setup');
            
            // DON'T defer - reply immediately with status
            await interaction.reply({
                content: `⚙️ Processing turn resolution...`,
                ephemeral: true
            });
            
            // Find active battle
            const battle = await models.Battle.findOne({
                where: {
                    player1Id: interaction.user.id,
                    status: 'in_progress'
                },
                order: [['createdAt', 'DESC']]
            });
            
            if (!battle) {
                return interaction.editReply({
                    content: 'No active battle found. Create one and use /test-join first.'
                });
            }
            
            const player1Order = interaction.options.getString('player1-order');
            const player2Order = interaction.options.getString('player2-order');
            
            console.log(`\n🎲 TEST TURN RESOLUTION`);
            console.log(`Battle: ${battle.id}`);
            console.log(`Turn: ${battle.currentTurn}`);
            console.log(`Player 1 Order: "${player1Order}"`);
            console.log(`Player 2 Order: "${player2Order}"`);
            
            // Create turn record
            const [battleTurn, created] = await models.BattleTurn.findOrCreate({
                where: {
                    battleId: battle.id,
                    turnNumber: battle.currentTurn
                },
                defaults: {
                    battleId: battle.id,
                    turnNumber: battle.currentTurn
                }
            });
            
            battleTurn.player1Command = player1Order;
            battleTurn.player2Command = player2Order;
            await battleTurn.save();
            
            console.log('Both orders saved to database');
            
            // Trigger turn resolution
            const { processTurnResolution } = require('../dmHandler');
            await processTurnResolution(battle, battleTurn, interaction.client);
            
            // Edit with success message
            return interaction.editReply({
                content: `✅ **Turn ${battle.currentTurn} Resolved!**\n\n` +
                        `Player 1: "${player1Order}"\n` +
                        `Player 2: "${player2Order}"\n\n` +
                        `Check console for results!`
            });
            
        } catch (error) {
            console.error('Test submit both error:', error);
            try {
                return interaction.editReply({
                    content: `❌ Test failed: ${error.message}\n\nCheck terminal for details.`
                });
            } catch {
                console.error('Could not edit reply - interaction expired');
            }
        }
    }
};

