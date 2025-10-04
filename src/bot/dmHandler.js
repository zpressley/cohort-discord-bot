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
        // Prevent duplicate processing
        if (processedMessages.has(message.id)) return;
        processedMessages.add(message.id);
        setTimeout(() => processedMessages.delete(message.id), 60000);
        
        const { models } = require('../database/setup');
        const userId = message.author.id;
        
        // Check if player is in an active battle
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
                '📜 You are not currently in an active battle.\n\n' +
                'Use `/lobby` in a server channel to create or join battles!'
            );
            return;
        }
        
        console.log(`Battle order received from ${userId} for battle ${activeBattle.id}`);
        
        // Get current turn
        const currentTurn = await models.BattleTurn.findOne({
            where: {
                battleId: activeBattle.id,
                turnNumber: activeBattle.currentTurn
            }
        });
        
        // Check if player already submitted orders this turn
        const playerSide = activeBattle.player1Id === userId ? 'player1' : 'player2';
        const hasSubmitted = currentTurn && 
            (playerSide === 'player1' ? currentTurn.player1Command : currentTurn.player2Command);
        
        if (hasSubmitted) {
            await message.reply(
                '⚠️ You have already submitted orders for this turn.\n\n' +
                'Waiting for your opponent to submit their commands...'
            );
            return;
        }
        
        // Process the order
        await processPlayerOrder(message, activeBattle, userId, playerSide, client);
        
    } catch (error) {
        console.error('DM handler error:', error);
        await message.reply(
            '❌ Error processing your command. Please try again or use `/abandon-battle` if stuck.'
        );
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
        
        console.log(`\n⚔️ RESOLVING TURN ${battle.currentTurn} - Battle ${battle.id}`);
        console.log(`Player 1 Order: "${battleTurn.player1Command}"`);
        console.log(`Player 2 Order: "${battleTurn.player2Command}"`);
        
        // Load battle context with proper culture lookup
        const battleContext = await loadBattleContext(battle);
        
        console.log(`Cultures loaded: ${battleContext.player1.culture} vs ${battleContext.player2.culture}`);
        
        // Parse player orders
        const { parsePlayerOrders } = require('../game/orderParser');
        
        const player1Orders = await parsePlayerOrders(
            battleTurn.player1Command,
            battleContext.player1.army,
            battleContext.player1.culture,
            battleContext
        );
        
        const player2Orders = await parsePlayerOrders(
            battleTurn.player2Command,
            battleContext.player2.army,
            battleContext.player2.culture,
            battleContext
        );
        
        console.log('Orders parsed successfully');
        
        // Resolve combat
        const { resolveCombat } = require('../game/battleEngine');
        
        const combatResult = await resolveCombat(
            buildCombatForce(battleContext.player1, player1Orders),
            buildCombatForce(battleContext.player2, player2Orders),
            { weather: battleContext.weather, terrain: battleContext.terrain, scenario: battleContext.scenario },
            { turnNumber: battleContext.currentTurn, morale: { attacker: 100, defender: 100 } }
        );
        
        console.log(`Combat resolved: ${combatResult.combatResult.result}`);
        
        // Generate AI narrative
        const { generateBattleNarrative } = require('../ai/aiNarrativeEngine');
        
        const narrative = await generateBattleNarrative(
            combatResult.combatResult,
            {
                attackerCulture: battleContext.player1.culture,
                defenderCulture: battleContext.player2.culture,
                terrain: battleContext.terrain,
                formations: {
                    attacker: player1Orders.validatedOrders.commands[0]?.formation?.type || 'standard',
                    defender: player2Orders.validatedOrders.commands[0]?.formation?.type || 'standard'
                },
                turnNumber: battleContext.currentTurn
            },
            {},
            []
        );
        
        console.log('AI narrative generated');
        
        // Store resolution in database
        battleTurn.aiResolution = narrative.mainNarrative.fullNarrative;
        battleTurn.combatResults = JSON.stringify(combatResult);
        battleTurn.isResolved = true;
        await battleTurn.save();
        
        // Send results to both players (skip TEST users)
        await sendTurnResults(battle, battleTurn, narrative, combatResult, client);
        
        // Update battle state
        battle.currentTurn += 1;
        await battle.save();
        
        // Check victory conditions
        const victory = checkVictory(battle, combatResult);
        if (victory.achieved) {
            await endBattle(battle, victory, client);
        } else {
            await sendNextTurnBriefings(battle, client);
        }
        
    } catch (error) {
        console.error('Turn resolution error:', error);
        
        // Try to notify real players
        try {
            const { models } = require('../database/setup');
            
            if (!battle.player1Id.startsWith('TEST_')) {
                const player1 = await client.users.fetch(battle.player1Id);
                await player1.send('❌ Error processing turn. Battle paused.');
            }
            if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
                const player2 = await client.users.fetch(battle.player2Id);
                await player2.send('❌ Error processing turn. Battle paused.');
            }
        } catch (notifyError) {
            console.error('Could not notify players of error:', notifyError);
        }
    }
}

/**
 * Send turn results to both players via DM
 */
async function sendTurnResults(battle, battleTurn, narrative, combatResult, client) {
    try {
        const narrativeText = narrative?.mainNarrative?.fullNarrative || 
                             `Combat resolved: ${combatResult.combatResult.result}`;
        
        // Only send to real Discord users, skip TEST users
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            const p1Embed = new EmbedBuilder()
                .setColor(0x8B0000)
                .setTitle(`⚔️ Turn ${battleTurn.turnNumber} - Battle Resolution`)
                .setDescription(narrativeText)
                .addFields({
                    name: '📊 Combat Summary',
                    value: `Result: ${combatResult.combatResult.result}\nIntensity: ${combatResult.combatResult.intensity}`,
                    inline: true
                })
                .setFooter({ text: 'Send your next orders for Turn ' + (battle.currentTurn + 1) });
            
            await player1.send({ embeds: [p1Embed] });
            console.log('Results sent to player 1');
        } else {
            console.log('Skipped TEST user for player 1 results');
        }
        
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            const p2Embed = new EmbedBuilder()
                .setColor(0x00008B)
                .setTitle(`⚔️ Turn ${battleTurn.turnNumber} - Battle Resolution`)
                .setDescription(narrativeText)
                .addFields({
                    name: '📊 Combat Summary',
                    value: `Result: ${combatResult.combatResult.result}\nIntensity: ${combatResult.combatResult.intensity}`,
                    inline: true
                })
                .setFooter({ text: 'Send your next orders for Turn ' + (battle.currentTurn + 1) });
            
            await player2.send({ embeds: [p2Embed] });
            console.log('Results sent to player 2');
        } else {
            console.log('Skipped TEST user for player 2 results');
        }
        
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            const p2Embed = new EmbedBuilder()
                .setColor(0x00008B)
                .setTitle(`⚔️ Turn ${battleTurn.turnNumber} - Battle Resolution`)
                .setDescription(narrative.mainNarrative.fullNarrative)
                .addFields({
                    name: '📊 Combat Summary',
                    value: `Result: ${combatResult.combatResult.result}\nIntensity: ${combatResult.combatResult.intensity}`,
                    inline: true
                })
                .setFooter({ text: 'Send your next orders for Turn ' + (battle.currentTurn + 1) });
            
            await player2.send({ embeds: [p2Embed] });
            console.log('Results sent to player 2');
        } else {
            console.log('Skipped TEST user for player 2 results');
        }
        
        console.log(`Turn ${battleTurn.turnNumber} results processing complete`);
        
    } catch (error) {
        console.error('Error sending turn results:', error);
    }
}

/**
 * Send briefings for next turn
 */
async function sendNextTurnBriefings(battle, client) {
    try {
        const briefingText = `\n⚡ **Turn ${battle.currentTurn} - Awaiting Orders**\n\n` +
            `Send your tactical commands in natural language.\n` +
            `Example: "advance infantry to center, archers provide covering fire"`;
        
        // Skip TEST users
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            await player1.send(briefingText);
        }
        
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            await player2.send(briefingText);
        }
        
    } catch (error) {
        console.error('Error sending next turn briefings:', error);
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
            army: [],
            morale: 100
        },
        
        player2: {
            id: battle.player2Id,
            culture: player2Commander.culture,
            army: [],
            morale: 100
        }
    };
}

/**
 * Build combat force from battle context and orders
 */
function buildCombatForce(playerData, parsedOrders) {
    return {
        units: [],
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