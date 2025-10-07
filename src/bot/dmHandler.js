// src/bot/dmHandler.js
// Handle Direct Messages for Battle Commands

const { EmbedBuilder } = require('discord.js');
const { Op } = require('sequelize');

// Track processed messages to prevent duplicates
const processedMessages = new Set();

/**
 * Handle DM commands during active battles
 */
async function handleDMCommand(message, client) {
    try {
        if (processedMessages.has(message.id)) return;
        processedMessages.add(message.id);
        setTimeout(() => processedMessages.delete(message.id), 60000);
        
        const { models } = require('../database/setup');
        const { isQuestion } = require('../ai/orderInterpreter');
        const { answerTacticalQuestion } = require('../ai/officerQA');
        const userId = message.author.id;
        
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
        
        // Check if this is a question or an order
        if (isQuestion(message.content)) {
            // Answer question as officer
            const eliteUnit = await models.EliteUnit.findOne({
                where: { commanderId: userId }
            });
            
            const answer = await answerTacticalQuestion(
                message.content,
                activeBattle.battleState,
                playerSide,
                eliteUnit
            );
            
            await message.reply(
                `**${answer.officerName}:**\n\n${answer.response}\n\n` +
                `*Confidence: ${answer.confidence}*`
            );
            return;
        }
        
        // Process as order
        await processPlayerOrder(message, activeBattle, userId, playerSide, client);
        
    } catch (error) {
        console.error('DM handler error:', error);
        await message.reply('Error processing your command.');
    }
}

/**
 * Process individual player order submission
 */
async function processPlayerOrder(message, battle, playerId, playerSide, client) {
    try {
        const { models } = require('../database/setup');
        const orderText = message.content;
        
        console.log(`Processing order for ${playerSide}: "${orderText}"`);
        
        // Create or update battle turn record
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
        
        // Store player command
        if (playerSide === 'player1') {
            battleTurn.player1Command = orderText;
        } else {
            battleTurn.player2Command = orderText;
        }
        
        await battleTurn.save();
        
        // Send order confirmation with cultural flavor
        const commander = await models.Commander.findByPk(playerId);
        const confirmation = getOrderConfirmation(commander?.culture || 'Unknown', orderText);
        
        await message.reply(confirmation);
        
        // Check if both players have submitted orders
        const bothReady = battleTurn.player1Command && battleTurn.player2Command;
        
        if (bothReady && !battleTurn.aiResolution) {
            console.log(`🎲 Both players ready for Turn ${battle.currentTurn} - Battle ${battle.id}`);
            await processTurnResolution(battle, battleTurn, client);
        } else {
            console.log(`Waiting for other player orders - Battle ${battle.id}, Turn ${battle.currentTurn}`);
        }
        
    } catch (error) {
        console.error('Order processing error:', error);
        throw error;
    }
}

/**
 * Process complete turn resolution with both player orders
 */
async function processTurnResolution(battle, battleTurn, client) {
    try {
        const { models } = require('../database/setup');
        const { processTurn } = require('../game/turnOrchestrator');
        const { RIVER_CROSSING_MAP } = require('../game/maps/riverCrossing');
        
        console.log(`\n⚔️ RESOLVING TURN ${battle.currentTurn} - Battle ${battle.id}`);
        console.log(`Player 1 Order: "${battleTurn.player1Command}"`);
        console.log(`Player 2 Order: "${battleTurn.player2Command}"`);
        
        // Get the map for this scenario
        const scenarioMaps = {
            'river_crossing': RIVER_CROSSING_MAP,
            // Add other maps as you build them
            'bridge_control': RIVER_CROSSING_MAP, // Placeholder
            'forest_ambush': RIVER_CROSSING_MAP,  // Placeholder
            'hill_fort_assault': RIVER_CROSSING_MAP, // Placeholder
            'desert_oasis': RIVER_CROSSING_MAP // Placeholder
        };
        
        const map = scenarioMaps[battle.scenario] || RIVER_CROSSING_MAP;
        
        // Process complete turn with orchestrator
        const turnResult = await processTurn(
            battle,
            battleTurn.player1Command,
            battleTurn.player2Command,
            map
        );
        
        if (!turnResult.success) {
            throw new Error(turnResult.error);
        }
        
        console.log(`✅ Turn orchestration complete`);
        console.log(`   Movements: P1 ${turnResult.turnResults.movements.player1Moves}, P2 ${turnResult.turnResults.movements.player2Moves}`);
        console.log(`   Combat engagements: ${turnResult.turnResults.combats}`);
        console.log(`   Casualties: P1 ${turnResult.turnResults.casualties.player1}, P2 ${turnResult.turnResults.casualties.player2}`);
        
        // Update battle state - deep clone to force Sequelize to detect change
        const newState = JSON.parse(JSON.stringify(turnResult.newBattleState));

        await battle.update({
            battleState: newState,
            currentTurn: battle.currentTurn + 1
        });
        const reloaded = await models.Battle.findByPk(battle.id);   

        await battleTurn.save();
        
        // Send results to both players
        await sendTurnResults(battle, battleTurn, turnResult.narrative, turnResult.turnResults, client);
        
        // Check victory
        if (turnResult.victory.achieved) {
            await endBattle(battle, turnResult.victory, client);
        } else {
            await sendNextTurnBriefings(battle, turnResult.newBattleState, client);
        }
        
    } catch (error) {
        console.error('Turn resolution error:', error);
        throw error;
    }
}

/**
 * Send turn results to both players via DM
 */
async function sendTurnResults(battle, battleTurn, narrative, turnResults, client) {
    try {
        const narrativeText = narrative?.mainNarrative?.fullNarrative || 
                             `Turn ${battleTurn.turnNumber} processed.\n\n` +
                             `Movements: ${turnResults.movements?.player1Moves || 0} vs ${turnResults.movements?.player2Moves || 0}\n` +
                             `Combat engagements: ${turnResults.combats || 0}\n` +
                             `Casualties: P1 ${turnResults.casualties?.player1 || 0}, P2 ${turnResults.casualties?.player2 || 0}`;
        
        // Send to player 1 (skip TEST users)
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            const p1Embed = new EmbedBuilder()
                .setColor(0x8B0000)
                .setTitle(`⚔️ Turn ${battleTurn.turnNumber} - Battle Resolution`)
                .setDescription(narrativeText)
                .addFields(
                    {
                        name: '📊 Turn Summary',
                        value: `Movements: ${turnResults.movements?.player1Moves || 0}\n` +
                               `Combats: ${turnResults.combats || 0}\n` +
                               `Your Casualties: ${turnResults.casualties?.player1 || 0}`,
                        inline: true
                    },
                    {
                        name: '🎯 Intelligence',
                        value: `Enemy units detected: ${turnResults.intelligence?.player1Detected || 0}`,
                        inline: true
                    }
                )
                .setFooter({ text: `Awaiting orders for Turn ${battle.currentTurn}` });
            
            await player1.send({ embeds: [p1Embed] });
            console.log('Results sent to player 1');
        }
        
        // Send to player 2 (skip TEST users)
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            const p2Embed = new EmbedBuilder()
                .setColor(0x00008B)
                .setTitle(`⚔️ Turn ${battleTurn.turnNumber} - Battle Resolution`)
                .setDescription(narrativeText)
                .addFields(
                    {
                        name: '📊 Turn Summary',
                        value: `Movements: ${turnResults.movements?.player2Moves || 0}\n` +
                               `Combats: ${turnResults.combats || 0}\n` +
                               `Your Casualties: ${turnResults.casualties?.player2 || 0}`,
                        inline: true
                    },
                    {
                        name: '🎯 Intelligence',
                        value: `Enemy units detected: ${turnResults.intelligence?.player2Detected || 0}`,
                        inline: true
                    }
                )
                .setFooter({ text: `Awaiting orders for Turn ${battle.currentTurn}` });
            
            await player2.send({ embeds: [p2Embed] });
            console.log('Results sent to player 2');
        }
        
        console.log(`Turn ${battleTurn.turnNumber} results processing complete`);
        
    } catch (error) {
        console.error('Error sending turn results:', error);
    }
}

/**
 * Send briefings for next turn
 */
async function sendNextTurnBriefings(battle, battleState, client) {
    try {
        const briefing = `⚡ **Turn ${battle.currentTurn} - Awaiting Orders**\n\n` +
            `Your units are positioned. Enemy contact status unknown.\n\n` +
            `Send orders: "move south", "advance to ford", etc.`;
        
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            await player1.send(briefing);
        }
        
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            await player2.send(briefing);
        }
    } catch (error) {
        console.error('Error sending briefings:', error);
    }
}

/**
 * Load complete battle context - PROPERLY LOAD CULTURES
 */
async function loadBattleContext(battle) {
    const { models } = require('../database/setup');
    
    // Load commander records to get cultures
    const player1Commander = await models.Commander.findByPk(battle.player1Id);
    const player2Commander = await models.Commander.findByPk(battle.player2Id);
    
    if (!player1Commander || !player2Commander) {
        throw new Error('Cannot load commander data for battle');
    }
    
    return {
        battleId: battle.id,
        scenario: battle.scenario,
        currentTurn: battle.currentTurn,
        weather: battle.weather || 'clear',
        terrain: typeof battle.terrain === 'object' ? battle.terrain.primary : (battle.terrain || 'plains'),  // Extract primary terrain
        
        player1: {
        id: battle.player1Id,
        culture: player1Commander.culture,
        army: battle.battleState?.player1?.army?.units || [],  // Extract units array
        morale: battle.battleState?.player1?.morale || 100
        },

        player2: {
            id: battle.player2Id,
            culture: player2Commander.culture,
            army: battle.battleState?.player2?.army?.units || [],  // Extract units array
            morale: battle.battleState?.player2?.morale || 100
        }
            };
        }

/**
 * Build combat force from battle context and orders
 */
function buildCombatForce(playerData, parsedOrders) {
    return {
        units: playerData.army || [],  // Now it's already the units array
        culture: playerData.culture,
        formation: parsedOrders.validatedOrders?.commands[0]?.formation?.type || 'standard',
        equipment: {},
        currentMorale: playerData.morale || 100
    };
}

/**
 * Get culturally appropriate order confirmation
 */
function getOrderConfirmation(culture, orderText) {
    const confirmations = {
        'Roman Republic': '⚔️ **Orders Acknowledged**\n\n*Centurion salutes:* "Sir, orders received and understood. The legion stands ready."',
        'Celtic': '⚔️ **Orders Received**\n\n*The war chief grins:* "Aye! The lads are eager for battle!"',
        'Han Dynasty': '⚔️ **Commands Received**\n\n*General bows:* "Your strategy is sound, Commander. We shall execute with precision."',
        'Macedonian Kingdoms': '⚔️ **Orders Confirmed**\n\n*Phalangarch nods:* "As Alexander taught us. The phalanx is ready."',
        'Sarmatian Confederations': '⚔️ **Commands Heard**\n\n*Khan raises hand:* "The riders understand. We move as one."',
        'Berber Confederations': '⚔️ **Orders Received**\n\n*Amghar smiles:* "Swift as the desert wind, we shall strike."',
        'Spartan City-State': '⚔️ **Acknowledged**\n\n*Lochagos:* "It shall be done."',
        'Kingdom of Kush': '⚔️ **Orders Received**\n\n*Master archer bows:* "By Amun, we shall not fail."',
        'Carthaginian Empire': '⚔️ **Orders Received**\n\n*Sacred Band commander:* "For Carthage and victory!"'
    };
    
    const confirmation = confirmations[culture] || '⚔️ **Orders Received**\n\nYour commands have been acknowledged.';
    
    return `${confirmation}\n\n*Waiting for enemy response...*\n\n` +
           `*Once both commanders have submitted orders, the turn will be resolved with dramatic battle narrative!*`;
}

/**
 * Check victory conditions
 */
function checkVictory(battle, combatResult) {
    // Simple decisive victory check
    //if (combatResult.combatResult.intensity === 'decisive') {
    //    return {
    //        achieved: true,
    //        winner: combatResult.combatResult.result.includes('attacker') ? 'player1' : 'player2',
    //        reason: 'decisive_victory'
    //    };
    //}
    
    // Time limit
    if (battle.currentTurn >= (battle.maxTurns || 12)) {
        return {
            achieved: true,
            winner: 'draw',
            reason: 'time_limit'
        };
    }
    
    return { achieved: false };
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
            .setDescription(`**Scenario:** ${battle.scenario}\n**Total Turns:** ${battle.currentTurn}\n**Victor:** ${victory.winner}`)
            .setFooter({ text: 'Experience gained! Use /lobby to start your next battle.' });
        
        // Send to real players only
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            await player1.send({ embeds: [resultEmbed] });
        }
        
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            await player2.send({ embeds: [resultEmbed] });
        }
        
        console.log(`Battle ${battle.id} concluded: Winner = ${victory.winner}`);
        
    } catch (error) {
        console.error('End battle error:', error);
    }
}

module.exports = {
    handleDMCommand,
    processTurnResolution
};