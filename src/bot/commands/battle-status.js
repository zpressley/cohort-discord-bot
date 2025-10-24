// src/bot/commands/battle-status.js
// Check current battle status and tactical situation
// Version: 1.0.0

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('battle-status')
        .setDescription('Check your current battle status and tactical situation'),
    
    async execute(interaction) {
        try {
const { models } = require('../../database/setup');
            const { generateBriefingText, generateMapMessage } = require('../../game/briefingGenerator');
            
            // Find active battle
            const battle = await models.Battle.findOne({
                where: {
                    status: 'in_progress',
                    [Op.or]: [
                        { player1Id: interaction.user.id },
                        { player2Id: interaction.user.id }
                    ]
                }
            });
            
            if (!battle) {
                await interaction.reply({
                    content: '📋 **No Active Battle**\n\nYou are not currently in an active battle.\n\n' +
                             'Use `/lobby` or `/create-game` to start a new battle!',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            // Determine player side
            const playerSide = battle.player1Id === interaction.user.id ? 'player1' : 'player2';
            
            // Get commander and elite unit
            const commander = await models.Commander.findByPk(interaction.user.id);
            const eliteUnit = await models.EliteUnit.findOne({ 
                where: { commanderId: interaction.user.id }
            });
            
// Generate current briefing
            const text = await generateBriefingText(
                battle.battleState,
                playerSide,
                commander,
                eliteUnit,
                battle.currentTurn
            );
            const meta = `\n⏱️ Battle Info\nScenario: ${battle.scenario.replace('_', ' ')}\nTurn: ${battle.currentTurn} / ${battle.maxTurns}\nWeather: ${battle.weather.replace('_', ' ')}`;
            const viewPref = (commander?.preferences && commander.preferences.mapView) || 'default';
            const map = generateMapMessage(battle.battleState, playerSide, viewPref);
            
            await interaction.reply({ content: text + '\n' + meta, flags: MessageFlags.Ephemeral });
            await interaction.followUp({ content: map, flags: MessageFlags.Ephemeral });
            
        } catch (error) {
            console.error('Battle status command error:', error);
            await interaction.reply({
                content: '❌ Error retrieving battle status.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};