// src/bot/dmHandler.js
// Handle Direct Messages - ROUTING ONLY

const { EmbedBuilder } = require('discord.js');
const { Op } = require('sequelize');
const { processTurn } = require('../game/turnOrchestrator');

const processedMessages = new Set();

/**
 * Handle DM commands - Routes to appropriate handler
 */
async function handleDMCommand(message, client) {
    try {
        // Prevent duplicate processing
        if (processedMessages.has(message.id)) return;
        processedMessages.add(message.id);
        setTimeout(() => processedMessages.delete(message.id), 60000);
        
        const { models } = require('../database/setup');
        const userId = message.author.id;
        
        // Check if player is in active battle
        const activeBattle = await models.Battle.findOne({
            where: {
                status: 'in_progress',
                [Op.or]: [
                    { player1Id: userId },
                    { player2Id: userId }
                ]
            }
        });
        
        if (!activeBattle) {
            await message.reply(
                'You are not currently in an active battle.\n\n' +
                'Use `/lobby` in a server channel to create or join battles!'
            );
            return;
        }
        
        const playerSide = activeBattle.player1Id === userId ? 'player1' : 'player2';
        
        // Route questions to officer Q&A
        if (isQuestion(message.content)) {
            await handleQuestion(message, activeBattle, playerSide, userId);
            return;
        }
        
        // Route orders to order processor
        await processPlayerOrder(message, activeBattle, userId, playerSide, client);
        
    } catch (error) {
        console.error('DM handler error:', error);
        await message.reply('Error processing your command. Please try again.');
    }
}

/**
 * Handle tactical questions
 */
async function handleQuestion(message, battle, playerSide, userId) {
    const { models } = require('../database/setup');
    const { answerTacticalQuestion } = require('../ai/officerQA');
    
    const eliteUnit = await models.EliteUnit.findOne({
        where: { commanderId: userId },
        include: [{ model: models.VeteranOfficer, as: 'officers' }]
    });
    
    const answer = await answerTacticalQuestion(
        message.content,
        battle.battleState,
        playerSide,
        eliteUnit
    );
    
    await message.reply(
        `**${answer.officerName}:**\n\n${answer.response}\n\n` +
        `*Confidence: ${answer.confidence}*`
    );
}

/**
 * Process player order - Store and check if both ready
 * NO VALIDATION - Just accept and store
 */
async function processPlayerOrder(message, battle, playerId, playerSide, client) {
    try {
        const { models } = require('../database/setup');
        const orderText = message.content.trim();
        
        console.log(`📝 Storing order for ${playerSide}: "${orderText}"`);
        
        // Store order in database
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
        
        if (playerSide === 'player1') {
            battleTurn.player1Command = orderText;
        } else {
            battleTurn.player2Command = orderText;
        }
        
        await battleTurn.save();
        
        // Send cultural confirmation
        const commander = await models.Commander.findByPk(playerId);
        const confirmation = getOrderConfirmation(commander?.culture || 'Unknown');
        await message.reply(confirmation);
        
        // Check if both players ready
        const bothReady = battleTurn.player1Command && battleTurn.player2Command;
        
        if (bothReady && !battleTurn.aiResolution) {
            console.log(`⚔️ Both players ready - Processing Turn ${battle.currentTurn}`);
            await processTurnResolution(battle, battleTurn, client);
        } else {
            console.log(`⏳ Waiting for opponent's orders...`);
        }
        
    } catch (error) {
        console.error('Order processing error:', error);
        await message.reply('Error storing your order. Please try again.');
    }
}

/**
 * Process complete turn resolution
 */
async function processTurnResolution(battle, battleTurn, client) {
    try {
        const { models } = require('../database/setup');
        const { processTurn } = require('../game/turnOrchestrator');
        const { RIVER_CROSSING_MAP } = require('../game/maps/riverCrossing');
        
        console.log(`\n⚔️ RESOLVING TURN ${battle.currentTurn} - Battle ${battle.id}`);
        console.log(`   P1 Order: "${battleTurn.player1Command}"`);
        console.log(`   P2 Order: "${battleTurn.player2Command}"`);
        
        // Get map for scenario
        const scenarioMaps = {
            'river_crossing': RIVER_CROSSING_MAP,
            'bridge_control': RIVER_CROSSING_MAP,
            'forest_ambush': RIVER_CROSSING_MAP,
            'hill_fort_assault': RIVER_CROSSING_MAP,
            'desert_oasis': RIVER_CROSSING_MAP
        };
        
        const map = scenarioMaps[battle.scenario] || RIVER_CROSSING_MAP;
        
        // Process turn (orchestrator handles validation)
        const turnResult = await processTurn(
            battle,
            battleTurn.player1Command,
            battleTurn.player2Command,
            map
        );
        
        if (!turnResult.success) {
            // Turn orchestrator provides helpful error
            console.error('Turn resolution failed:', turnResult.error);
            
            // Send error to players
            await notifyPlayersOfError(battle, turnResult.error, client);
            return;
        }
        
        console.log(`✅ Turn ${battle.currentTurn} complete`);
        
        // Update battle state
        const newState = JSON.parse(JSON.stringify(turnResult.newBattleState));
        await battle.update({
            battleState: newState,
            currentTurn: battle.currentTurn + 1
        });
        
        await battleTurn.save();
        
        // Send results
        await sendTurnResults(battle, battleTurn, turnResult, client);
        
        // Check victory
        if (turnResult.victory?.achieved) {
            await endBattle(battle, turnResult.victory, client);
        } else {
            // Send next turn briefings
            const { sendNextTurnBriefings } = require('../game/briefingSystem');
            await sendNextTurnBriefings(battle, turnResult.newBattleState, client);
        }
        
    } catch (error) {
        console.error('Turn resolution error:', error);
        await notifyPlayersOfError(battle, 'Unexpected error during turn resolution', client);
    }
}

/**
 * Send turn results to players
 */
async function sendTurnResults(battle, battleTurn, turnResult, client) {
    const narrative = turnResult.narrative?.mainNarrative?.fullNarrative || 
                     `Turn ${battleTurn.turnNumber} processed.`;
    
    const p1Embed = new EmbedBuilder()
        .setColor(0x8B0000)
        .setTitle(`⚔️ Turn ${battleTurn.turnNumber} Resolution`)
        .setDescription(narrative)
        .setFooter({ text: `Turn ${battle.currentTurn} - Awaiting orders` });
    
    const p2Embed = new EmbedBuilder()
        .setColor(0x00008B)
        .setTitle(`⚔️ Turn ${battleTurn.turnNumber} Resolution`)
        .setDescription(narrative)
        .setFooter({ text: `Turn ${battle.currentTurn} - Awaiting orders` });
    
    if (!battle.player1Id.startsWith('TEST_')) {
        const player1 = await client.users.fetch(battle.player1Id);
        await player1.send({ embeds: [p1Embed] });
    }
    
    if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
        const player2 = await client.users.fetch(battle.player2Id);
        await player2.send({ embeds: [p2Embed] });
    }
}

/**
 * Notify players of errors
 */
async function notifyPlayersOfError(battle, errorMessage, client) {
    const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Turn Processing Error')
        .setDescription(errorMessage)
        .setFooter({ text: 'Please submit new orders' });
    
    if (!battle.player1Id.startsWith('TEST_')) {
        const player1 = await client.users.fetch(battle.player1Id);
        await player1.send({ embeds: [errorEmbed] });
    }
    
    if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
        const player2 = await client.users.fetch(battle.player2Id);
        await player2.send({ embeds: [errorEmbed] });
    }
}

/**
 * End battle and announce results
 */
async function endBattle(battle, victory, client) {
    try {
        const { models } = require('../database/setup');
        
        battle.status = 'completed';
        battle.winner = victory.winner;
        await battle.save();
        
        const resultEmbed = new EmbedBuilder()
            .setColor(victory.winner === 'draw' ? 0x808080 : 0xFFD700)
            .setTitle('🏆 BATTLE CONCLUDED')
            .setDescription(
                `**Scenario:** ${battle.scenario}\n` +
                `**Total Turns:** ${battle.currentTurn}\n` +
                `**Victor:** ${victory.winner}\n` +
                `**Reason:** ${victory.reason}`
            )
            .setFooter({ text: 'Use /lobby to start your next battle!' });
        
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            await player1.send({ embeds: [resultEmbed] });
        }
        
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            await player2.send({ embeds: [resultEmbed] });
        }
        
        console.log(`🏆 Battle ${battle.id} concluded: ${victory.winner}`);
        
    } catch (error) {
        console.error('End battle error:', error);
    }
}

/**
 * Cultural order confirmations
 */
function getOrderConfirmation(culture) {
    const confirmations = {
        'Roman Republic': '⚔️ **Orders Received**\n\n*Centurion salutes:* "Orders understood, sir. The legion stands ready."',
        'Celtic': '⚔️ **Orders Received**\n\n*War chief grins:* "Aye! The lads are eager!"',
        'Han Dynasty': '⚔️ **Commands Received**\n\n*General bows:* "We shall execute with precision, Commander."',
        'Spartan City-State': '⚔️ **Acknowledged**\n\n*Lochagos:* "It shall be done."',
        'Macedonian Kingdoms': '⚔️ **Orders Confirmed**\n\n*Phalangarch:* "The phalanx is ready."',
        'Kingdom of Kush': '⚔️ **Orders Received**\n\n*Master archer:* "By Amun, we obey."',
        'default': '⚔️ **Orders Received**\n\nYour commands have been acknowledged.'
    };
    
    return (confirmations[culture] || confirmations.default) + 
           '\n\n*Waiting for your opponent...*';
}

/**
 * Detect if message is question vs order
 */
function isQuestion(text) {
    const questionWords = ['where', 'what', 'when', 'who', 'how', 'why', 'can', 'should', 'could', 'would'];
    const lowerText = text.toLowerCase().trim();
    
    if (text.includes('?')) return true;
    
    const firstWord = lowerText.split(' ')[0];
    if (questionWords.includes(firstWord)) return true;
    
    if (lowerText.match(/^(do|does|is|are|will|have|has)\s/)) return true;
    
    return false;
}

module.exports = {
    handleDMCommand,
    processTurnResolution
};