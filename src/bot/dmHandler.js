// src/bot/dmHandler.js
// Handle Direct Messages for Battle Commands
// 10/23/25 - 1pm

const { EmbedBuilder } = require('discord.js');
const { Op } = require('sequelize');
const { calculateDistance, getAdjacentCoords } = require('../game/maps/mapUtils');
const { sendNextTurnBriefings } = require('../game/briefingSystem');
const { createVictoryAnnouncement, updateCommanderRecords } = require('../game/victorySystem');
const { generateOrderFeedback } = require('../game/orderFeedback');
const { getOfficerRoster } = require('../game/officers/namingSystem');
const { formatOfficerRoster } = require('../game/officers/rosterDisplay');


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
        const { answerTacticalQuestion } = require('../ai/officerQA');
        const userId = message.author.id;

        // 1. Load activeBattle FIRST
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

        // 2. Determine playerSide
        const playerSide = activeBattle.player1Id === userId ? 'player1' : 'player2';

        const isQuestion = (text) => /\?\s*$/.test(text.trim()) || /^(ask|should|do we|can we|what|where|why|how)\b/i.test(text.trim());

        // Status/briefing command
        if (/^(status|sitrep|briefing)$/i.test(message.content.trim())) {
            const { generateBriefingText } = require('../game/briefingGenerator');
            const { models } = require('../database/setup');
            
            const commanderId = playerSide === 'player1' ? 
                activeBattle.player1Id : activeBattle.player2Id;
            const commander = await models.Commander.findByPk(commanderId);
            
            const briefing = await generateBriefingText(
                activeBattle.battleState,
                playerSide,
                commander,
                null,
                activeBattle.currentTurn
            );
            
            await message.reply(`**📋 Turn ${activeBattle.currentTurn} - Current Situation:**\n\n${briefing}`);
            return;
        }

        // Officer roster command
        if (/^officers?$/i.test(message.content.trim())) {
            const roster = getOfficerRoster(activeBattle.battleState, playerSide);
            const formatted = formatOfficerRoster(roster);
            await message.reply(formatted);
            return;
        }

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
        let orderText = message.content;
        const simulate = /^\s*(simulate:|dry-run:)/i.test(orderText);
        if (simulate) {
            orderText = orderText.replace(/^\s*(simulate:|dry-run:)\s*/i, '');
        }
        
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
        
        // Parse order to show what was understood
        const { interpretOrders } = require('../ai/orderInterpreter');
        const { RIVER_CROSSING_MAP } = require('../game/maps/riverCrossing');
        const map = RIVER_CROSSING_MAP; // TODO: Get correct map for scenario

        try {
            const interpretation = await interpretOrders(orderText, battle.battleState, playerSide, map);
            const commander = await models.Commander.findByPk(playerId);
            const units = battle.battleState?.[playerSide]?.unitPositions || [];
            const feedback = await generateOrderFeedback(interpretation.validatedActions, orderText, { units, culture: commander?.culture || 'Roman' });
            
            await message.reply(feedback);
            
        } catch (parseError) {
            console.error('Order parsing error:', parseError);
            // Fallback to basic confirmation
            const commander = await models.Commander.findByPk(playerId);
            const confirmation = getOrderConfirmation(commander?.culture || 'Unknown', orderText);
            await message.reply(confirmation);
        }
        
        
        // Simulation mode: process without committing turn/state
        if (simulate) {
            const { processTurn } = require('../game/turnOrchestrator');
            const { RIVER_CROSSING_MAP } = require('../game/maps/riverCrossing');
            const scenarioMaps = {
                'river_crossing': RIVER_CROSSING_MAP
            };
            const map = scenarioMaps[battle.scenario] || RIVER_CROSSING_MAP;

            const other = playerSide === 'player1' ? battleTurn.player2Command : battleTurn.player1Command;
            const otherOrder = other || 'hold';
            const p1 = playerSide === 'player1' ? orderText : otherOrder;
            const p2 = playerSide === 'player2' ? orderText : otherOrder;
            const result = await processTurn(battle, p1, p2, map);
            try {
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                  .setColor(0x888888)
                  .setTitle(`🧪 SIMULATION — Turn ${battle.currentTurn}`)
                  .setDescription(result?.narrative?.mainNarrative?.fullNarrative || 'Simulated.')
                  .addFields(
                    { name: 'Combats', value: String(result?.turnResults?.combats || 0), inline: true },
                    { name: 'Your casualties (sim)', value: String(result?.turnResults?.casualties?.[playerSide] || 0), inline: true }
                  )
                  .setFooter({ text: 'No state was changed. Remove "simulate:" to execute.' });
                await message.reply({ embeds: [embed] });
            } catch (e) {
                await message.reply('Simulation complete (no state changed).');
            }
            return;
        }

        // Check if both players have submitted orders
        const bothReady = battleTurn.player1Command && battleTurn.player2Command;
        
        // Right before: if (bothReady && !battleTurn.aiResolution) {
        console.log('DEBUG - Turn resolution check:');
        console.log('  bothReady:', bothReady);
        console.log('  p1Command:', battleTurn.player1Command);
        console.log('  p2Command:', battleTurn.player2Command);
        console.log('  aiResolution:', battleTurn.aiResolution);
        console.log('  Will resolve?', bothReady && !battleTurn.aiResolution);
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
        const { BRIDGE_CONTROL_MAP } = require('../game/maps/bridgeControl');
        const { HILL_FORT_ASSAULT_MAP } = require('../game/maps/hillFortAssault');
        const { FOREST_AMBUSH_MAP } = require('../game/maps/forestAmbush');
        const { DESERT_OASIS_MAP } = require('../game/maps/desertOasis');
        
        console.log(`\n⚔️ RESOLVING TURN ${battle.currentTurn} - Battle ${battle.id}`);
        console.log(`Player 1 Order: "${battleTurn.player1Command}"`);
        console.log(`Player 2 Order: "${battleTurn.player2Command}"`);
        
        // Get the map for this scenario
        const scenarioMaps = {
            'river_crossing': RIVER_CROSSING_MAP,
            'bridge_control': BRIDGE_CONTROL_MAP,
            'forest_ambush': FOREST_AMBUSH_MAP,
            'hill_fort_assault': HILL_FORT_ASSAULT_MAP,
            'desert_oasis': DESERT_OASIS_MAP
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
                await notifyValidationErrors(battle, turnResult.validationErrors, client, battleTurn.turnNumber, turnResult.culturalErrors);
                return; // do not advance turn
            }
            throw new Error(turnResult.error);
        }
        
        console.log(`✅ Turn orchestration complete`);
        console.log(`   Movements: P1 ${turnResult.turnResults.movements.player1Moves}, P2 ${turnResult.turnResults.movements.player2Moves}`);
        console.log(`   Combat engagements: ${turnResult.turnResults.combats}`);
        console.log(`   Casualties: P1 ${turnResult.turnResults.casualties.player1}, P2 ${turnResult.turnResults.casualties.player2}`);
        
        // Update battle state transactionally with rollback on error (current code-005)
        const { sequelize } = require('../database/setup');
        const newState = JSON.parse(JSON.stringify(turnResult.newBattleState));
        const diffs = turnResult.metrics?.diffs || {};

        await sequelize.transaction(async (t) => {
            // Persist turn analytics on BattleTurn (reuse aiAnalysis JSON)
            const analysis = {
                ...(battleTurn.aiAnalysis || {}),
                schemaValidation: 'passed',
                diffs
            };
            battleTurn.aiAnalysis = analysis;
            battleTurn.combatResults = turnResult.turnResults || {};
            battleTurn.turnNarrative = turnResult.narrative?.mainNarrative?.fullNarrative || null;
            battleTurn.isResolved = true;
            battleTurn.resolvedAt = new Date();
            await battleTurn.save({ transaction: t });

            // Apply new battle state and advance turn
            await battle.update({
                battleState: newState,
                currentTurn: battle.currentTurn + 1
            }, { transaction: t });
        });

        // Emit telemetry metrics (best-effort)
        try {
            const { appendMetrics } = require('../telemetry/metrics');
            appendMetrics('turn_resolved', {
                battleId: battle.id,
                scenario: battle.scenario,
                turn: battle.currentTurn,
                movements_p1: turnResult.turnResults.movements?.player1Moves || 0,
                movements_p2: turnResult.turnResults.movements?.player2Moves || 0,
                combats: turnResult.turnResults.combats || 0,
                casualties_p1: turnResult.turnResults.casualties?.player1 || 0,
                casualties_p2: turnResult.turnResults.casualties?.player2 || 0
            });
        } catch (e) {
            console.warn('turn metrics failed:', e.message);
        }

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
        const narrativeText = (narrative?.mainNarrative?.fullNarrative || `Turn ${battleTurn.turnNumber} processed.`).slice(0, 900);

        // Structured summaries with safe truncation
        const mvP1 = turnResults.movements?.player1Moves || 0;
        const mvP2 = turnResults.movements?.player2Moves || 0;
        const combats = turnResults.combats || 0;
        const casP1 = turnResults.casualties?.player1 || 0;
        const casP2 = turnResults.casualties?.player2 || 0;

        const combatSummary = (narrative?.combatSummary || `${combats} engagement(s)`).toString().slice(0, 900);
        const casualtySummary = `P1 ${casP1}, P2 ${casP2}`;

        // Recent moves from diffs if present
        const diffs = battleTurn.aiAnalysis?.diffs || battleTurn.turnDiffs || {};
        const p1Moves = (diffs.player1 || []).slice(0, 5).map(m => `${m.unitId}: ${m.from}→${m.to}`);
        const p2Moves = (diffs.player2 || []).slice(0, 5).map(m => `${m.unitId}: ${m.from}→${m.to}`);
        const p1MoveSummary = p1Moves.join('\n').slice(0, 900) || '—';
        const p2MoveSummary = p2Moves.join('\n').slice(0, 900) || '—';
        
// Send to player 1 (skip TEST users)
        if (!battle.player1Id.startsWith('TEST_')) {
            const { queuedDM } = require('./utils/dmQueue');
            const { generateOfficerTurnSummary } = require('../ai/aiManager');
            const fallbackLine = combats > 0 ? `Contact reported. Engagements: ${combats}.` : (mvP1 > 0 ? 'Units maneuvered; no contact.' : 'Holding positions.');
            const movesText = p1MoveSummary === '—' ? '' : p1MoveSummary;
            const aiOfficer = await generateOfficerTurnSummary({
                culture: battle.battleState?.player1?.army?.culture || battle.player1Culture || 'Roman',
                movesText,
                combats,
                casualties: casP1,
                detectedEnemies: turnResults.intelligence?.player1Detected || 0
            });
            const officerLine = aiOfficer || fallbackLine;
            const p1Text = [
                `⚔️ Turn ${battleTurn.turnNumber} — Report`,
                officerLine,
                '',
                narrativeText
            ].join('\n').slice(0, 4000);
            queuedDM(battle.player1Id, p1Text, client);
            // Map will be included in the upcoming War Council briefing to avoid duplicates
            console.log('Results enqueued to player 1');
        }
        
        // Send to player 2 (skip TEST users)
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const { queuedDM } = require('./utils/dmQueue');
            const { generateOfficerTurnSummary: gen2 } = require('../ai/aiManager');
            const fallbackLine2 = combats > 0 ? `Contact reported. Engagements: ${combats}.` : (mvP2 > 0 ? 'Units maneuvered; no contact.' : 'Holding positions.');
            const movesText2 = p2MoveSummary === '—' ? '' : p2MoveSummary;
            const aiOfficer2 = await gen2({
                culture: battle.battleState?.player2?.army?.culture || battle.player2Culture || 'Celtic',
                movesText: movesText2,
                combats,
                casualties: casP2,
                detectedEnemies: turnResults.intelligence?.player2Detected || 0
            });
            const officerLine2 = aiOfficer2 || fallbackLine2;
            const p2Text = [
                `⚔️ Turn ${battleTurn.turnNumber} — Report`,
                officerLine2,
                '',
                narrativeText
            ].join('\n').slice(0, 4000);
            queuedDM(battle.player2Id, p2Text, client);
            // Map will be included in the upcoming War Council briefing to avoid duplicates
            console.log('Results enqueued to player 2');
        }
        
        console.log(`Turn ${battleTurn.turnNumber} results processing complete`);

        // Commander capture negotiation prompt if at risk
        try {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const mkButtons = (battle, side) => {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`commander-choice-escape-${battle.id}-${side}`).setLabel('Attempt Escape').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`commander-choice-die-${battle.id}-${side}`).setLabel('Fight to Death').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`commander-choice-surrender-${battle.id}-${side}`).setLabel('Surrender').setStyle(ButtonStyle.Secondary)
                );
                return [row];
            };
            if (battle.battleState?.player1?.commander?.status === 'at_risk' && !battle.player1Id.startsWith('TEST_')) {
                const p1 = await client.users.fetch(battle.player1Id);
                await p1.send({ content: 'Your commander is at risk. Choose a course of action:', components: mkButtons(battle, 'player1') });
            }
            if (battle.battleState?.player2?.commander?.status === 'at_risk' && battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
                const p2 = await client.users.fetch(battle.player2Id);
                await p2.send({ content: 'Your commander is at risk. Choose a course of action:', components: mkButtons(battle, 'player2') });
            }
        } catch (e) {
            console.warn('Commander negotiation prompt failed:', e.message);
        }
        
    } catch (error) {
        console.error('Error sending turn results:', error);
    }
}


async function notifyValidationErrors(battle, validationErrors, client, turnNumber, culturalErrors = null) {
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

        const p1Msg = summarize(validationErrors.player1) + formatCultural(culturalErrors?.player1);
        const p2Msg = summarize(validationErrors.player2) + formatCultural(culturalErrors?.player2);

        const text = (who, msg) => `❌ Validation failed for your orders (Turn ${turnNumber}).\n\n${msg}\n\nPlease rephrase your command (e.g., specify target unit or position).`;
        function formatCultural(c) {
            if (!c || (!c.violations?.length && !c.warnings?.length)) return '';
            const viol = (c.violations || []).map(v => `• ${v.message}`).join('\n');
            const warn = (c.warnings || []).map(v => `• ${v.message}`).join('\n');
            let out = '';
            if (viol) out += `\n\nCultural restrictions:\n${viol}`;
            if (warn) out += `\n\nCultural notes:\n${warn}`;
            return out;
        }

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
        
        console.log(`🏆 Ending battle ${battle.id}: Winner = ${victory.winner}`);
        
        // Create detailed victory announcement
        const { embed, statistics } = await createVictoryAnnouncement(
            battle,
            victory,
            battle.battleState
        );
        
        // Update commander records (wins/losses)
        await updateCommanderRecords(battle, victory, statistics);
        
        // Update battle status
        await battle.update({
            status: 'completed',
            winner: victory.winner
        });
        
        // Send victory announcement to both players
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            await player1.send({ embeds: [embed] });
            console.log('Victory announcement sent to player 1');
        }
        
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            await player2.send({ embeds: [embed] });
            console.log('Victory announcement sent to player 2');
        }
        
        console.log(`✅ Battle ${battle.id} concluded successfully`);
        
    } catch (error) {
        console.error('Error ending battle:', error);
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
    processTurnResolution,
    sendNextTurnBriefings,
    notifyValidationErrors
};
