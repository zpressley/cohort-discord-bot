// src/game/briefingSystem.js
// Comprehensive briefing generation system
// Version: 1.0.0

const { EmbedBuilder } = require('discord.js');
const { generateBriefingEmbed, generateMapMessage } = require('./briefingGenerator');
const { generateOpeningNarrative } = require('../ai/openingNarrative');

/**
 * Send initial battle briefings when battle starts
 * @param {Object} battle - Battle record
 * @param {Object} battleState - Initialized battle state
 * @param {Object} client - Discord client
 */
async function sendInitialBriefings(battle, battleState, client) {
    const { models } = require('../database/setup');
    
    console.log('📬 Sending initial battle briefings...');
    
    try {
        // Generate opening narrative with AI
        const p1Commander = await models.Commander.findByPk(battle.player1Id);
        const p2Commander = await models.Commander.findByPk(battle.player2Id);
        
        const openingNarrative = await generateOpeningNarrative(
            battle,
            p1Commander,
            p2Commander
        );
        
        // Get elite units for officer names
        const p1Elite = await models.EliteUnit.findOne({ 
            where: { commanderId: battle.player1Id }
        });
        const p2Elite = await models.EliteUnit.findOne({ 
            where: { commanderId: battle.player2Id }
        });
        
        // Send to Player 1
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            
            // Opening narrative
            const openingEmbed = new EmbedBuilder()
                .setColor(0x8B0000)
                .setTitle('⚔️ THE BATTLE BEGINS')
                .setDescription(openingNarrative)
                .setFooter({ text: `Turn 1 of ${battle.maxTurns}` });
            
            await player1.send({ embeds: [openingEmbed] });
            
            // Tactical briefing
            const briefing = await generateBriefingEmbed(
                battleState,
                'player1',
                p1Commander,
                p1Elite,
                1
            );
            
            const map = generateMapMessage(battleState, 'player1');
            
            await player1.send({ embeds: [briefing] });
            await player1.send(map);
            
            console.log('  ✅ Player 1 briefing sent');
        }
        
        // Send to Player 2
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            
            // Opening narrative
            const openingEmbed = new EmbedBuilder()
                .setColor(0x00008B)
                .setTitle('⚔️ THE BATTLE BEGINS')
                .setDescription(openingNarrative)
                .setFooter({ text: `Turn 1 of ${battle.maxTurns}` });
            
            await player2.send({ embeds: [openingEmbed] });
            
            // Tactical briefing
            const briefing = await generateBriefingEmbed(
                battleState,
                'player2',
                p2Commander,
                p2Elite,
                1
            );
            
            const map = generateMapMessage(battleState, 'player2');
            
            await player2.send({ embeds: [briefing] });
            await player2.send(map);
            
            console.log('  ✅ Player 2 briefing sent');
        }
        
        console.log('✅ Initial briefings complete');
        
    } catch (error) {
        console.error('Error sending initial briefings:', error);
        throw error;
    }
}

/**
 * Send turn briefings using existing briefingGenerator
 * @param {Object} battle - Battle record
 * @param {Object} battleState - Current battle state
 * @param {Object} client - Discord client
 */
async function sendNextTurnBriefings(battle, battleState, client) {
    const { models } = require('../database/setup');
    
    try {
        // Get commanders and elite units
        const p1Commander = await models.Commander.findByPk(battle.player1Id);
        const p2Commander = await models.Commander.findByPk(battle.player2Id);
        const p1Elite = await models.EliteUnit.findOne({ 
            where: { commanderId: battle.player1Id }
        });
        const p2Elite = await models.EliteUnit.findOne({ 
            where: { commanderId: battle.player2Id }
        });
        
        // Player 1 briefing
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            const p1Embed = await generateBriefingEmbed(
                battleState,
                'player1',
                p1Commander,
                p1Elite,
                battle.currentTurn
            );
            const p1Map = generateMapMessage(battleState, 'player1');
            
            await player1.send({ embeds: [p1Embed] });
            await player1.send(p1Map);
        }
        
        // Player 2 briefing
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            const p2Embed = await generateBriefingEmbed(
                battleState,
                'player2',
                p2Commander,
                p2Elite,
                battle.currentTurn
            );
            const p2Map = generateMapMessage(battleState, 'player2');
            
            await player2.send({ embeds: [p2Embed] });
            await player2.send(p2Map);
        }
        
        console.log(`✅ Turn ${battle.currentTurn} briefings sent`);
        
    } catch (error) {
        console.error('Error sending turn briefings:', error);
    }
}

module.exports = {
    sendInitialBriefings,
    sendNextTurnBriefings
};