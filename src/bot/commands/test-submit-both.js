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
    
    async execute(interaction) {
        try {
            const { models } = require('../../database/setup');
            
            await interaction.deferReply({ ephemeral: true });
            
            // Find active battle for this player
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
            const battleState = battle.battleState;

            console.log("\n=== UNIT STRUCTURE DEBUG ===");
            console.log("P1 Units:");
            battleState.player1.unitPositions.forEach((unit, i) => {
            console.log(`  Unit ${i}:`, JSON.stringify({
                unitId: unit.unitId,
                position: unit.position,
                type: unit.type,
                unitType: unit.unitType,
                mounted: unit.mounted,
                allKeys: Object.keys(unit)
            }, null, 2));
            });
            const player1Order = interaction.options.getString('player1-order');
            const player2Order = interaction.options.getString('player2-order');
            
            console.log(`\n🎲 TEST TURN RESOLUTION`);
            console.log(`Battle: ${battle.id}`);
            console.log(`Turn: ${battle.currentTurn}`);
            console.log(`Player 1 Order: "${player1Order}"`);
            console.log(`Player 2 Order: "${player2Order}"`);
            
            // Create turn record with both orders
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
            
            return interaction.editReply({
                content: `✅ **Turn ${battle.currentTurn} Resolved!**\n\n` +
                        `Player 1: "${player1Order}"\n` +
                        `Player 2: "${player2Order}"\n\n` +
                        `Check your DMs for battle results!`
            });
            
        } catch (error) {
            console.error('Test submit both error:', error);
            return interaction.editReply({
                content: `❌ Test failed: ${error.message}\n\nCheck terminal for details.`
            });
        }
    }
};

