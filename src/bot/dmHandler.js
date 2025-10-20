// src/bot/dmHandler.js
// Handle Direct Messages for Battle Commands
// 10:47

const { EmbedBuilder } = require('discord.js');
const { Op } = require('sequelize');
const { calculateDistance, getAdjacentCoords } = require('../game/maps/mapUtils');

// Track processed messages to prevent duplicates
const processedMessages = new Set();

/**
 * Generate unit description from properties
 */
function getUnitDescription(unit) {
    let desc = '';
    
    if (unit.mounted) {
        desc = `${unit.quality?.name || 'Professional'} ${unit.mount?.name || 'Cavalry'}`;
    } else {
        desc = `${unit.quality?.name || 'Professional'} Infantry`;
    }
    
    if (unit.primaryWeapon?.name && !unit.primaryWeapon.name.includes('Standard')) {
        desc += ` (${unit.primaryWeapon.name})`;
    }
    
    if (unit.isElite) {
        desc = 'Elite ' + desc;
    }
    
    return desc;
}

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
            // Surface validation errors to both players if available
            if (turnResult.phase === 'validation_failed' && turnResult.validationErrors) {
                await notifyValidationErrors(battle, turnResult.validationErrors, client, battleTurn.turnNumber);
                return; // do not advance turn
            }
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
            await sendNextTurnBriefings(battle, turnResult.newBattleState, turnResult, client);
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


async function notifyValidationErrors(battle, validationErrors, client, turnNumber) {
    try {
        const summarize = (results) => {
            if (!Array.isArray(results)) return 'Unknown error';
            const msgs = [];
            results.forEach((r, idx) => {
                if (r && r.valid === false) {
                    const errs = (r.errors || []).slice(0, 3).map(e => `${e.instancePath || ''} ${e.message}`).join('; ');
                    msgs.push(`Action ${idx + 1}: ${errs || 'invalid'}`);
                }
            });
            return msgs.length ? msgs.join('\n') : 'No actionable errors';
        };

        const p1Msg = summarize(validationErrors.player1);
        const p2Msg = summarize(validationErrors.player2);

        const text = (who, msg) => `❌ Validation failed for your orders (Turn ${turnNumber}).\n\n${msg}\n\nPlease rephrase your command (e.g., specify target unit or position).`;

        if (!battle.player1Id.startsWith('TEST_')) {
            const p1 = await client.users.fetch(battle.player1Id);
            await p1.send(text('Player 1', p1Msg));
        }
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const p2 = await client.users.fetch(battle.player2Id);
            await p2.send(text('Player 2', p2Msg));
        }
    } catch (e) {
        console.error('Failed to notify validation errors:', e);
    }
}

// Clean briefing structure in dmHandler.js
// Four sections: Units → Intelligence → Officer → Map

/**
 * Get terrain name for coordinate
 */
function getTerrainName(position, map) {
    const terrain = map.terrain;
    
    if (terrain.fords?.some(f => (typeof f === 'string' ? f : f.coord) === position)) {
        return 'ford';
    }
    if (terrain.river?.includes(position)) return 'river';
    if (terrain.hill?.includes(position)) return 'hill';
    if (terrain.marsh?.includes(position)) return 'marsh';
    if (terrain.forest?.includes(position)) return 'forest';
    if (terrain.road?.includes(position)) return 'road';
    
    return 'plains';
}

/**
 * Get terrain description with context
 */
function getTerrainDescription(position, map) {
    const mainTerrain = getTerrainName(position, map);
    const adjacent = [];
    
    // Check adjacent notable terrain
    const { getAdjacentCoords } = require('../game/maps/mapUtils');
    const neighbors = getAdjacentCoords(position);
    
    if (neighbors.some(n => map.terrain.river?.includes(n))) {
        adjacent.push('near river');
    }
    if (neighbors.some(n => map.terrain.hill?.includes(n))) {
        adjacent.push('near hills');
    }
    if (neighbors.some(n => map.terrain.forest?.includes(n))) {
        adjacent.push('near forest');
    }
    
    let desc = `on ${mainTerrain}`;
    if (adjacent.length > 0) {
        desc += ` ${adjacent[0]}`;
    }
    
    return desc;
}

/**
 * Get intelligence detail level based on distance
 */
function getIntelDetail(distance) {
    if (distance <= 3) return 'detailed';      // Full intel
    if (distance <= 5) return 'identified';    // Know type
    return 'spotted';                          // Movement only
}

/**
 * Format enemy intelligence report
 */
function formatEnemyIntel(enemyPos, playerPos, map, detailLevel = 'identified') {
    const distance = playerPos ? calculateDistance(playerPos, enemyPos) : '?';
    const terrainDesc = getTerrainDescription(enemyPos, map);
    
    // Detail level determines what we know
    if (detailLevel === 'detailed' || distance <= 3) {
        // Close range - full intel
        return `👁️ Enemy infantry ~100 strong ${terrainDesc} [${enemyPos}] (${distance} tiles)`;
    } else if (detailLevel === 'identified' || distance <= 5) {
        // Medium range - unit type known
        return `👁️ Enemy forces ${terrainDesc} [${enemyPos}] (${distance} tiles)`;
    } else {
        // Long range - movement only
        return `👁️ Enemy movement detected [${enemyPos}] (${distance} tiles)`;
    }
}

/**
 * Generate unit description from properties
 */
function getUnitDescription(unit) {
    let desc = '';
    
    if (unit.mounted) {
        desc = `${unit.quality?.name || 'Professional'} ${unit.mount?.name || 'Cavalry'}`;
    } else {
        desc = `${unit.quality?.name || 'Professional'} Infantry`;
    }
    
    if (unit.primaryWeapon?.name && !unit.primaryWeapon.name.includes('Standard')) {
        const weaponName = unit.primaryWeapon.name.replace(/\s*\(.*?\)/g, '');
        desc += ` (${weaponName})`;
    }
    
    if (unit.isElite) {
        desc = 'Elite ' + desc;
    }
    
    return desc;
}

/**
 * Send clean 4-section briefings
 */
async function sendNextTurnBriefings(battle, battleState, turnResult, client) {
    try {
        const { generateEmojiMap, getUnitEmoji } = require('../game/maps/mapUtils');
        const { calculateDistance } = require('../game/maps/mapUtils');
        const { models } = require('../database/setup');
        const { RIVER_CROSSING_MAP } = require('../game/maps/riverCrossing');
        
        const map = RIVER_CROSSING_MAP;
        
        // ===== PLAYER 1 BRIEFING =====
        if (!battle.player1Id.startsWith('TEST_')) {
            const p1Data = battleState.player1;
            const p1Commander = await models.Commander.findByPk(battle.player1Id);
            
            // 1. UNIT LIST
            const unitList = (p1Data.unitPositions || []).map(u => {
                const emoji = getUnitEmoji(u, 'friendly');
                const desc = getUnitDescription(u);
                const terrainDesc = getTerrainDescription(u.position, map);
                return `[${u.position}] ${emoji} ${desc} (${u.currentStrength}) - ${terrainDesc}`;
            }).join('\n');
            
            // 2. INTELLIGENCE
            const visibleEnemies = p1Data.visibleEnemyPositions || [];
            let intelligence = '';
            
            if (visibleEnemies.length === 0) {
                intelligence = '👁️ No enemy contact';
            } else {
                const playerPos = p1Data.unitPositions[0]?.position;
                intelligence = visibleEnemies.map(enemyPos => {
                    const distance = playerPos ? calculateDistance(playerPos, enemyPos) : '?';
                    return formatEnemyIntel(enemyPos, playerPos, map);
                }).join('\n');
            }
            
            // 3. OFFICER REPORT
            const culture = p1Commander?.culture || 'Roman Republic';
            let officerReport = '';
            
            if (visibleEnemies.length === 0) {
                const noContactComments = {
                    'Roman Republic': '"All quiet, Commander. The men stand ready."',
                    'Celtic': '"No sign of them yet, Chief. The lads grow restless."',
                    'Han Dynasty': '"No enemy detected. Maintaining discipline."',
                    'Spartan City-State': '"We wait."',
                    'default': '"No contact. Units ready."'
                };
                officerReport = noContactComments[culture] || noContactComments['default'];
            } else {
                const nearestEnemy = visibleEnemies[0];
                const distance = p1Data.unitPositions[0]?.position 
                    ? calculateDistance(p1Data.unitPositions[0].position, nearestEnemy) 
                    : '?';
                
                const enemyComments = {
                    'Roman Republic': `"Enemy at ${nearestEnemy}, ${distance} tiles. Legion stands ready."`,
                    'Celtic': `"Enemy spotted at ${nearestEnemy}! ${distance} tiles. Ready to charge!"`,
                    'Han Dynasty': `"Forces detected at ${nearestEnemy}. ${distance} tiles distant."`,
                    'Spartan City-State': `"Enemy at ${nearestEnemy}. We do not retreat."`,
                    'default': `"Enemy at ${nearestEnemy}, ${distance} tiles away."`
                };
                officerReport = enemyComments[culture] || enemyComments['default'];
            }
            
            // Add mission interruption questions if any
            if (turnResult?.p1Interpretation?.missionInterruptions?.length > 0) {
                const interruption = turnResult.p1Interpretation.missionInterruptions[0];
                officerReport += `\n\n⚠️ "${interruption.question}"`;
            }
            
            // 4. MAP
            const p1Map = generateEmojiMap({
                terrain: map.terrain,
                player1Units: p1Data.unitPositions || [],
                player2Units: (p1Data.visibleEnemyPositions || []).map(pos => ({
                    position: pos,
                    currentStrength: 100,
                    unitType: 'unknown'
                }))
            });
            
            // Assemble briefing
            const briefing = 
`🏺 **WAR COUNCIL - Turn ${battle.currentTurn}**

**YOUR FORCES:**
${unitList}

**INTELLIGENCE:**
${intelligence}

**OFFICER REPORT:**
${officerReport}

**MAP:**
\`\`\`
${p1Map}
\`\`\`

**AWAITING ORDERS**`;
            
            await (await client.users.fetch(battle.player1Id)).send(briefing);
        }
        
        // ===== PLAYER 2 BRIEFING ===== (Same structure)
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const p2Data = battleState.player2;
            const p2Commander = await models.Commander.findByPk(battle.player2Id);
            
            const unitList = (p2Data.unitPositions || []).map(u => {
                const emoji = getUnitEmoji(u, 'friendly');
                const desc = getUnitDescription(u);
                const terrainDesc = getTerrainDescription(u.position, map);
                return `[${u.position}] ${emoji} ${desc} (${u.currentStrength}) - ${terrainDesc}`;
            }).join('\n');
            
            const visibleEnemies = p2Data.visibleEnemyPositions || [];
            let intelligence = '';
            
            if (visibleEnemies.length === 0) {
                intelligence = '👁️ No enemy contact';
            } else {
                const playerPos = p2Data.unitPositions[0]?.position;
                intelligence = visibleEnemies.map(enemyPos => {
                    return formatEnemyIntel(enemyPos, playerPos, map);
                }).join('\n');
            }
            
            const culture = p2Commander?.culture || 'Roman Republic';
            let officerReport = '';
            
            if (visibleEnemies.length === 0) {
                const noContactComments = {
                    'Roman Republic': '"All quiet, Commander. The men stand ready."',
                    'Celtic': '"No sign of them yet, Chief. The lads grow restless."',
                    'Han Dynasty': '"No enemy detected. Maintaining discipline."',
                    'Spartan City-State': '"We wait."',
                    'default': '"No contact. Units ready."'
                };
                officerReport = noContactComments[culture] || noContactComments['default'];
            } else {
                const nearestEnemy = visibleEnemies[0];
                const distance = p2Data.unitPositions[0]?.position 
                    ? calculateDistance(p2Data.unitPositions[0].position, nearestEnemy) 
                    : '?';
                
                const enemyComments = {
                    'Roman Republic': `"Enemy at ${nearestEnemy}, ${distance} tiles. Legion stands ready."`,
                    'Celtic': `"Enemy spotted at ${nearestEnemy}! ${distance} tiles. Ready to charge!"`,
                    'Han Dynasty': `"Forces detected at ${nearestEnemy}. ${distance} tiles distant."`,
                    'Spartan City-State': `"Enemy at ${nearestEnemy}. We do not retreat."`,
                    'default': `"Enemy at ${nearestEnemy}, ${distance} tiles away."`
                };
                officerReport = enemyComments[culture] || enemyComments['default'];
            }
            
            if (turnResult?.p2Interpretation?.missionInterruptions?.length > 0) {
                const interruption = turnResult.p2Interpretation.missionInterruptions[0];
                officerReport += `\n\n⚠️ "${interruption.question}"`;
            }
            
            const p2Map = generateEmojiMap({
                terrain: map.terrain,
                player1Units: (p2Data.visibleEnemyPositions || []).map(pos => ({
                    position: pos,
                    currentStrength: 100,
                    unitType: 'unknown'
                })),
                player2Units: p2Data.unitPositions || []
            });
            
            const briefing = 
`🏺 **WAR COUNCIL - Turn ${battle.currentTurn}**

**YOUR FORCES:**
${unitList}

**INTELLIGENCE:**
${intelligence}

**OFFICER REPORT:**
${officerReport}

**MAP:**
\`\`\`
${p2Map}
\`\`\`

**AWAITING ORDERS**`;
            
            await (await client.users.fetch(battle.player2Id)).send(briefing);
        }
        
    } catch (error) {
        console.error('Error sending briefings:', error);
        
        // Fallback
        const simple = `⚡ Turn ${battle.currentTurn} - Orders required`;
        try {
            if (!battle.player1Id.startsWith('TEST_')) {
                await (await client.users.fetch(battle.player1Id)).send(simple);
            }
            if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
                await (await client.users.fetch(battle.player2Id)).send(simple);
            }
        } catch (fallbackError) {
            console.error('Fallback failed:', fallbackError);
        }
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

/**
 * Generate mission status report for briefing
 */
function generateMissionReport(units) {
    const reports = [];
    
    units.forEach(unit => {
        if (unit.activeMission && unit.activeMission.status === 'active') {
            const mission = unit.activeMission;
            const distance = calculateDistance(unit.position, mission.target);
            
            reports.push(
                `📋 **${unit.unitType || 'Unit'} - Mission Active**\n` +
                `   Target: ${mission.target}\n` +
                `   Current: ${unit.position}\n` +
                `   Remaining: ~${distance} tiles\n` +
                `   *Continuing automatically next turn...*`
            );
        }
    });
    
    return reports.length > 0 
        ? reports.join('\n\n')
        : '';
}

/**
 * Generate officer questions section for briefing
 */
function generateOfficerQuestions(interpretation) {
    if (!interpretation.errors || interpretation.errors.length === 0) {
        return '';
    }
    
    const questions = interpretation.errors.filter(e => 
        e.type === 'mission_interrupted_enemy' || e.requiresResponse
    );
    
    if (questions.length === 0) return '';
    
    const questionText = questions.map(q => {
        const strengthAssessment = q.situation ? 
            `\n   Enemy strength: ~${q.situation.estimatedStrength} vs our ${q.situation.ourStrength}` : '';
        
        return `❓ **${q.unit} at ${q.position}**\n` +
               `   ${q.question}${strengthAssessment}\n` +
               `   *Awaiting your orders...*`;
    }).join('\n\n');
    
    return `\n**⚠️ OFFICERS REQUEST GUIDANCE:**\n${questionText}\n`;
}

/**
 * Generate mission reports section
 */
function generateMissionReports(interpretation) {
    if (!interpretation.missionReports || interpretation.missionReports.length === 0) {
        return '';
    }
    
    return `\n**📋 MISSION STATUS:**\n${interpretation.missionReports.join('\n')}\n`;
}

/**
 * Get simple terrain description for friendly units
 * Format: Just the terrain type, no fluff
 */
function getTerrainDescription(position, map) {
    // Check terrain in priority order
    if (map.terrain.fords?.some(f => (typeof f === 'string' ? f : f.coord) === position)) {
        return 'ford';
    }
    if (map.terrain.hill?.includes(position)) return 'hill';
    if (map.terrain.forest?.includes(position)) return 'forest';
    if (map.terrain.marsh?.includes(position)) return 'marsh';
    if (map.terrain.road?.includes(position)) return 'road';
    if (map.terrain.river?.includes(position)) return 'river';
    
    return 'plains'; // Default
}

/**
 * Get unit description (quality + type + weapon)
 */
function getUnitDescription(unit) {
    const quality = unit.qualityType || 'Professional';
    const type = unit.mounted ? 'Horses' : 'Infantry';
    const weapon = unit.primaryWeaponKey ? `(${unit.primaryWeaponKey})` : '';
    
    return `${quality} ${type} ${weapon}`.trim();
}

/**
 * Format enemy intelligence with natural language terrain context
 * Scouts report what they see in descriptive terms
 */
function formatEnemyIntel(enemyPos, playerPos, map) {
    const { parseCoord, calculateDistance } = require('../game/maps/mapUtils');
    const distance = playerPos ? calculateDistance(playerPos, enemyPos) : '?';
    
    // Get terrain at enemy position
    const terrain = getSimpleTerrain(enemyPos, map);
    
    // Get adjacent terrain features for context
    const context = getNearbyTerrainContext(enemyPos, map);
    
    // Build natural language description
    let location = '';
    
    if (terrain === 'ford') {
        location = 'holding the ford crossing';
    } else if (terrain === 'hill') {
        location = 'positioned on the hilltop';
    } else if (terrain === 'forest') {
        location = 'concealed in the forest';
    } else if (terrain === 'marsh') {
        location = 'moving through the marshland';
    } else if (terrain === 'road') {
        location = 'advancing along the road';
    } else {
        // Plains - use nearby context
        if (context.includes('river')) {
            const direction = getRelativeDirection(enemyPos, findNearestRiverTile(enemyPos, map));
            location = `on the ${direction} bank of the river`;
        } else if (context.includes('hill')) {
            location = 'at the base of the hills';
        } else if (context.includes('forest')) {
            location = 'at the forest edge';
        } else {
            location = 'on open ground';
        }
    }
    
    return `👁️ Enemy forces ${location} at ${enemyPos} (${distance} tiles away)`;
}

/**
 * Get simple terrain type at position
 */
function getSimpleTerrain(position, map) {
    if (map.terrain.fords?.includes(position)) return 'ford';
    if (map.terrain.hill?.includes(position)) return 'hill';
    if (map.terrain.forest?.includes(position)) return 'forest';
    if (map.terrain.marsh?.includes(position)) return 'marsh';
    if (map.terrain.road?.includes(position)) return 'road';
    if (map.terrain.river?.includes(position)) return 'river';
    return 'plains';
}

/**
 * Get nearby terrain features for context
 */
function getNearbyTerrainContext(position, map) {
    const { parseCoord, calculateDistance } = require('../game/maps/mapUtils');
    const nearby = [];
    
    // Check adjacent tiles (1 tile away)
    const allTerrainTypes = ['river', 'hill', 'forest', 'marsh'];
    
    for (const terrainType of allTerrainTypes) {
        const tiles = map.terrain[terrainType] || [];
        for (const tile of tiles) {
            if (calculateDistance(position, tile) <= 1) {
                if (!nearby.includes(terrainType)) {
                    nearby.push(terrainType);
                }
            }
        }
    }
    
    return nearby;
}

/**
 * Find nearest river tile to position
 */
function findNearestRiverTile(position, map) {
    const { calculateDistance } = require('../game/maps/mapUtils');
    const riverTiles = map.terrain.river || [];
    
    if (riverTiles.length === 0) return position;
    
    return riverTiles.reduce((nearest, tile) => {
        const distToTile = calculateDistance(position, tile);
        const distToNearest = calculateDistance(position, nearest);
        return distToTile < distToNearest ? tile : nearest;
    });
}

/**
 * Get relative direction from position to target
 */
function getRelativeDirection(from, to) {
    const { parseCoord } = require('../game/maps/mapUtils');
    const fromPos = parseCoord(from);
    const toPos = parseCoord(to);
    
    const dx = toPos.col - fromPos.col;
    const dy = toPos.row - fromPos.row;
    
    // Determine primary direction
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 'western' : 'eastern';
    } else {
        return dy > 0 ? 'northern' : 'southern';
    }
}

module.exports = {
    handleDMCommand,
    processTurnResolution
};