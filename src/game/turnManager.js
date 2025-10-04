// src/game/turnManager.js
// Complete Turn Management System with Discord DM Integration

const { Op } = require('sequelize');
const { Battle, Commander, EliteUnit } = require('../database/models');
const { resolveCombat } = require('./battleEngine');
const { generateBattleNarrative } = require('../ai/aiNarrativeEngine');
const { parsePlayerOrders } = require('./orderParser');
const { EmbedBuilder } = require('discord.js');

/**
 * Turn Manager - Handles complete turn lifecycle
 * 1. Send private briefings to players via DM
 * 2. Collect orders through natural language processing
 * 3. Process simultaneous combat resolution
 * 4. Generate culturally authentic narratives
 * 5. Update battle state and send private results
 */
class TurnManager {
    constructor(client) {
        this.client = client;
        this.activeBattles = new Map(); // battleId -> BattleState
        this.pendingOrders = new Map(); // battleId -> { player1: orders, player2: orders }
        this.waitingForOrders = new Map(); // battleId -> Set[playerId]
    }

    /**
     * Initialize new battle and send first turn briefings
     */
    async initializeBattle(battleId) {
        try {
            console.log(`Initializing battle ${battleId}`);
            
            // Load battle data from database
            const battle = await Battle.findByPk(battleId, {
                include: [
                    { model: Commander, as: 'player1Commander' },
                    { model: Commander, as: 'player2Commander' },
                    { model: EliteUnit, as: 'eliteUnits' }
                ]
            });

            if (!battle) {
                throw new Error(`Battle ${battleId} not found`);
            }

            // Initialize battle state
            const battleState = await this.createInitialBattleState(battle);
            this.activeBattles.set(battleId, battleState);
            
            // Initialize order tracking
            this.pendingOrders.set(battleId, {});
            this.waitingForOrders.set(battleId, new Set([battle.player1Id, battle.player2Id]));

            // Send initial briefings
            await this.sendTurnBriefings(battleId, 1);

            console.log(`Battle ${battleId} initialized, briefings sent`);
            return { success: true, message: 'Battle initialized successfully' };

        } catch (error) {
            console.error(`Failed to initialize battle ${battleId}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create initial battle state from database battle record
     */
    async createInitialBattleState(battle) {
        // Parse army compositions from JSON
        const player1Army = JSON.parse(battle.player1Army || '{}');
        const player2Army = JSON.parse(battle.player2Army || '{}');
        
        // Load elite units
        const eliteUnits = battle.eliteUnits || [];
        
        return {
            battleId: battle.id,
            scenario: battle.scenario,
            currentTurn: 1,
            weather: battle.weather || 'clear',
            terrain: battle.terrain || 'river_crossing',
            
            // Player 1 (Attacker)
            player1: {
                id: battle.player1Id,
                culture: battle.player1Culture,
                commander: battle.player1Commander,
                army: this.initializeUnits(player1Army, battle.player1Culture),
                eliteUnit: eliteUnits.find(unit => unit.commanderId === battle.player1Id),
                morale: 100,
                position: 'south_bank',
                orders: null,
                intelligence: {
                    enemyUnitsSpotted: [],
                    terrainKnowledge: ['river_ford_locations'],
                    weatherForecast: battle.weather
                }
            },
            
            // Player 2 (Defender) 
            player2: {
                id: battle.player2Id,
                culture: battle.player2Culture,
                commander: battle.player2Commander,
                army: this.initializeUnits(player2Army, battle.player2Culture),
                eliteUnit: eliteUnits.find(unit => unit.commanderId === battle.player2Id),
                morale: 100,
                position: 'north_bank',
                orders: null,
                intelligence: {
                    enemyUnitsSpotted: [],
                    terrainKnowledge: ['defensive_positions', 'river_ford_locations'],
                    weatherForecast: battle.weather
                }
            },
            
            // Battle history for narrative continuity
            turnHistory: [],
            tacticalDevelopments: [],
            
            // Victory conditions based on scenario
            victoryConditions: this.getVictoryConditions(battle.scenario),
            
            // Scenario-specific data
            scenarioState: this.initializeScenarioState(battle.scenario)
        };
    }

    /**
     * Initialize unit objects from army composition data
     */
    initializeUnits(armyData, culture) {
        const units = [];
        let unitId = 1;

        // Process each unit type from army builder
        Object.entries(armyData.units || {}).forEach(([unitType, count]) => {
            for (let i = 0; i < count; i++) {
                units.push({
                    id: `${culture}_${unitType}_${unitId++}`,
                    type: unitType,
                    culture: culture,
                    maxStrength: this.getUnitSize(unitType),
                    currentStrength: this.getUnitSize(unitType),
                    morale: 100,
                    experience: 0,
                    equipment: armyData.equipment || {},
                    formation: 'standard',
                    position: { x: 0, y: 0 },
                    status: 'ready',
                    veteranBonus: 0
                });
            }
        });

        return units;
    }

    /**
     * Get standard unit sizes based on type
     */
    getUnitSize(unitType) {
        const unitSizes = {
            'levy': 100,
            'militia': 100, 
            'professional': 100,
            'cavalry': 80,
            'archers': 100,
            'elite': 80
        };
        return unitSizes[unitType] || 100;
    }

    /**
     * Send private briefings to both players via DM
     */
    async sendTurnBriefings(battleId, turnNumber) {
        try {
            const battleState = this.activeBattles.get(battleId);
            if (!battleState) {
                throw new Error(`Battle state not found for ${battleId}`);
            }

            // Send briefing to Player 1
            await this.sendPrivateBriefing(
                battleState.player1.id,
                battleState,
                'player1',
                turnNumber
            );

            // Send briefing to Player 2  
            await this.sendPrivateBriefing(
                battleState.player2.id,
                battleState,
                'player2', 
                turnNumber
            );

            console.log(`Turn ${turnNumber} briefings sent for battle ${battleId}`);

        } catch (error) {
            console.error(`Failed to send briefings for battle ${battleId}:`, error);
            throw error;
        }
    }

    /**
     * Send private war council briefing to individual player
     */
    async sendPrivateBriefing(playerId, battleState, playerSide, turnNumber) {
        try {
            const user = await this.client.users.fetch(playerId);
            const playerData = battleState[playerSide];
            const enemySide = playerSide === 'player1' ? 'player2' : 'player1';
            const enemyData = battleState[enemySide];

            // Generate cultural briefing embed
            const briefingEmbed = this.createBriefingEmbed(
                playerData,
                enemyData,
                battleState,
                turnNumber
            );

            // Send to player's DM
            await user.send({ embeds: [briefingEmbed] });

            // Send follow-up with officer advice if elite unit present
            if (playerData.eliteUnit) {
                const officerAdvice = await this.generateOfficerAdvice(
                    playerData,
                    battleState,
                    turnNumber
                );
                
                await user.send({ 
                    content: `**${playerData.eliteUnit.name} - Officer's Counsel:**\n${officerAdvice}` 
                });
            }

            console.log(`Private briefing sent to ${playerId} for turn ${turnNumber}`);

        } catch (error) {
            console.error(`Failed to send private briefing to ${playerId}:`, error);
            throw error;
        }
    }

    /**
     * Create rich embed for battle briefing
     */
    createBriefingEmbed(playerData, enemyData, battleState, turnNumber) {
        const culture = playerData.culture;
        const scenario = battleState.scenario;
        
        // Cultural briefing titles
        const culturalTitles = {
            'Roman': '🏛️ **War Council - Roman Command**',
            'Celtic': '⚔️ **Clan Gathering - Celtic Warband**', 
            'Han Chinese': '🐉 **Strategic Conference - Imperial Forces**',
            'Macedonian': '🛡️ **Phalanx Assembly - Macedonian Guard**',
            'Sarmatian': '🐎 **Tribal Council - Steppe Warriors**',
            'Berber': '🏜️ **Desert Conclave - Nomad Raiders**',
            'Spartan': '⚔️ **Laconian Assembly - Spartan Phalanx**',
            'Mauryan': '🐘 **Royal Council - Imperial Army**'
        };

        const embed = new EmbedBuilder()
            .setColor(this.getCulturalColor(culture))
            .setTitle(culturalTitles[culture] || '⚔️ **War Council**')
            .setDescription(`*Turn ${turnNumber} - ${this.getScenarioDescription(scenario)}*`)
            .setTimestamp();

        // Battlefield situation
        embed.addFields({
            name: '🗺️ **Battlefield Situation**',
            value: this.generateSituationDescription(battleState, playerData.position),
            inline: false
        });

        // Your forces
        const forcesList = this.generateForcesList(playerData.army, playerData.eliteUnit);
        embed.addFields({
            name: '👥 **Your Forces**', 
            value: forcesList,
            inline: true
        });

        // Enemy intelligence (limited)
        const enemyIntel = this.generateEnemyIntelligence(
            playerData.intelligence,
            enemyData,
            turnNumber
        );
        embed.addFields({
            name: '🔍 **Enemy Intelligence**',
            value: enemyIntel,
            inline: true
        });

        // Mission objective
        embed.addFields({
            name: '🎯 **Mission Objective**',
            value: this.getObjectiveDescription(scenario, playerData.position),
            inline: false
        });

        // Weather and terrain
        embed.addFields({
            name: '🌤️ **Conditions**',
            value: `**Weather:** ${battleState.weather}\n**Terrain:** ${battleState.terrain}`,
            inline: true
        });

        // Order prompt
        embed.addFields({
            name: '⚡ **Awaiting Your Orders**',
            value: `Send your tactical commands in natural language.\n*Example: "advance infantry to ford, archers provide cover"*`,
            inline: false
        });

        return embed;
    }

    /**
     * Process player order submission
     */
    async processPlayerOrders(playerId, battleId, orderText) {
        try {
            console.log(`Processing orders from ${playerId} for battle ${battleId}: ${orderText}`);

            const battleState = this.activeBattles.get(battleId);
            if (!battleState) {
                throw new Error(`Battle ${battleId} not found`);
            }

            const waitingPlayers = this.waitingForOrders.get(battleId);
            if (!waitingPlayers || !waitingPlayers.has(playerId)) {
                throw new Error(`Not waiting for orders from player ${playerId}`);
            }

            // Parse natural language orders
            const playerSide = battleState.player1.id === playerId ? 'player1' : 'player2';
            const playerData = battleState[playerSide];
            
            const parsedOrders = await parsePlayerOrders(
                orderText,
                playerData.army,
                playerData.culture,
                battleState
            );

            // Validate orders
            const validatedOrders = this.validateOrders(parsedOrders, playerData, battleState);

            // Store orders
            let pendingOrders = this.pendingOrders.get(battleId) || {};
            pendingOrders[playerSide] = validatedOrders;
            this.pendingOrders.set(battleId, pendingOrders);

            // Mark player as ready
            waitingPlayers.delete(playerId);

            // Send order confirmation
            await this.sendOrderConfirmation(playerId, validatedOrders, playerData.culture);

            // Check if both players ready
            if (waitingPlayers.size === 0) {
                console.log(`Both players ready for battle ${battleId}, processing turn`);
                await this.processCombatTurn(battleId);
            } else {
                console.log(`Waiting for remaining player orders for battle ${battleId}`);
            }

            return { success: true, message: 'Orders received and processed' };

        } catch (error) {
            console.error(`Failed to process orders for battle ${battleId}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Process combat turn when both players have submitted orders
     */
    async processCombatTurn(battleId) {
        try {
            console.log(`Processing combat turn for battle ${battleId}`);

            const battleState = this.activeBattles.get(battleId);
            const pendingOrders = this.pendingOrders.get(battleId);

            if (!battleState || !pendingOrders) {
                throw new Error(`Missing battle state or orders for ${battleId}`);
            }

            // Apply orders to battle state
            this.applyOrdersToBattleState(battleState, pendingOrders);

            // Build combat context
            const combatContext = {
                attackingForce: this.buildCombatForce(battleState.player1, 'attacker'),
                defendingForce: this.buildCombatForce(battleState.player2, 'defender'),
                battleConditions: {
                    weather: battleState.weather,
                    terrain: battleState.terrain,
                    scenario: battleState.scenario
                },
                tacticalContext: {
                    turnNumber: battleState.currentTurn,
                    morale: {
                        attacker: battleState.player1.morale,
                        defender: battleState.player2.morale
                    }
                }
            };

            // Resolve combat using battle engine
            const combatResult = await resolveCombat(
                combatContext.attackingForce,
                combatContext.defendingForce, 
                combatContext.battleConditions,
                combatContext.tacticalContext
            );

            console.log(`Combat resolved for battle ${battleId}:`, combatResult.combatResult.result);

            // Apply combat results to battle state
            this.applyCombatResults(battleState, combatResult);

            // Generate AI narratives
            const narrative = await this.generateTurnNarrative(battleState, combatResult);

            // Send results to players
            await this.sendTurnResults(battleId, battleState, combatResult, narrative);

            // Update database
            await this.updateBattleDatabase(battleId, battleState, combatResult);

            // Check victory conditions
            const victoryResult = this.checkVictoryConditions(battleState);
            if (victoryResult.gameEnded) {
                await this.endBattle(battleId, victoryResult);
                return;
            }

            // Prepare next turn
            await this.prepareNextTurn(battleId, battleState);

        } catch (error) {
            console.error(`Failed to process combat turn for battle ${battleId}:`, error);
            throw error;
        }
    }

    /**
     * Send turn results privately to each player
     */
    async sendTurnResults(battleId, battleState, combatResult, narrative) {
        try {
            // Send to Player 1
            await this.sendPrivateTurnResult(
                battleState.player1.id,
                battleState,
                combatResult,
                narrative,
                'player1'
            );

            // Send to Player 2
            await this.sendPrivateTurnResult(
                battleState.player2.id,
                battleState,
                combatResult,
                narrative,
                'player2'
            );

            console.log(`Turn results sent for battle ${battleId}`);

        } catch (error) {
            console.error(`Failed to send turn results for battle ${battleId}:`, error);
            throw error;
        }
    }

    /**
     * Send private turn result to individual player
     */
    async sendPrivateTurnResult(playerId, battleState, combatResult, narrative, playerSide) {
        try {
            const user = await this.client.users.fetch(playerId);
            const playerData = battleState[playerSide];

            // Main narrative embed
            const resultEmbed = new EmbedBuilder()
                .setColor(this.getCulturalColor(playerData.culture))
                .setTitle(`⚔️ **Turn ${battleState.currentTurn} - Battle Resolution**`)
                .setDescription(narrative.mainNarrative.fullNarrative)
                .setTimestamp();

            // Officer report (if available)
            if (narrative.officerReports && narrative.officerReports[playerSide]) {
                const officer = narrative.officerReports[playerSide];
                resultEmbed.addFields({
                    name: `👤 **${officer.officerName} Reports**`,
                    value: officer.speech,
                    inline: false
                });
            }

            // Unit status
            const unitStatus = this.generateUnitStatusReport(playerData.army);
            resultEmbed.addFields({
                name: '📊 **Force Status**',
                value: unitStatus,
                inline: true
            });

            // Tactical analysis
            if (narrative.tacticalAnalysis) {
                const analysis = narrative.tacticalAnalysis.keyDevelopments.slice(0, 3).join('\n• ');
                if (analysis) {
                    resultEmbed.addFields({
                        name: '🎯 **Tactical Developments**',
                        value: `• ${analysis}`,
                        inline: true
                    });
                }
            }

            await user.send({ embeds: [resultEmbed] });

        } catch (error) {
            console.error(`Failed to send private turn result to ${playerId}:`, error);
            throw error;
        }
    }

    /**
     * Prepare for next turn
     */
    async prepareNextTurn(battleId, battleState) {
        // Increment turn
        battleState.currentTurn++;

        // Reset order tracking
        this.pendingOrders.set(battleId, {});
        this.waitingForOrders.set(battleId, new Set([
            battleState.player1.id,
            battleState.player2.id
        ]));

        // Clear previous orders
        battleState.player1.orders = null;
        battleState.player2.orders = null;

        // Send next turn briefings
        await this.sendTurnBriefings(battleId, battleState.currentTurn);
    }

    /**
     * Helper methods for embed generation and game state management
     */
    getCulturalColor(culture) {
        const colors = {
            'Roman': '#800080',      // Imperial purple
            'Celtic': '#008000',     // Forest green  
            'Han Chinese': '#FF0000', // Imperial red
            'Macedonian': '#0000FF', // Royal blue
            'Sarmatian': '#696969',  // Iron gray
            'Berber': '#DAA520',     // Desert gold
            'Spartan': '#8B0000',    // Dark red
            'Mauryan': '#FF8C00'     // Saffron orange
        };
        return colors[culture] || '#808080';
    }

    generateForcesList(army, eliteUnit) {
        let forcesList = '';
        
        // Regular army units
        const unitCounts = {};
        army.forEach(unit => {
            const key = unit.type;
            if (!unitCounts[key]) {
                unitCounts[key] = { count: 0, totalStrength: 0, maxStrength: 0 };
            }
            unitCounts[key].count++;
            unitCounts[key].totalStrength += unit.currentStrength;
            unitCounts[key].maxStrength += unit.maxStrength;
        });

        Object.entries(unitCounts).forEach(([type, data]) => {
            const percentage = Math.round((data.totalStrength / data.maxStrength) * 100);
            forcesList += `**${data.count}x ${type}:** ${data.totalStrength}/${data.maxStrength} (${percentage}%)\n`;
        });

        // Elite unit
        if (eliteUnit) {
            forcesList += `**Elite ${eliteUnit.name}:** Ready\n`;
        }

        return forcesList || 'No forces available';
    }

    generateEnemyIntelligence(playerIntelligence, enemyData, turnNumber) {
        // Limited intelligence based on scouting and previous turns
        let intel = '';
        
        if (turnNumber === 1) {
            intel = '• Enemy forces detected across battlefield\n';
            intel += `• ${enemyData.culture} military formations identified\n`;
            intel += '• Strength and composition unknown';
        } else {
            intel = '• Enemy positions confirmed\n';
            intel += '• Active resistance expected\n';
            intel += '• Tactical assessment ongoing';
        }

        return intel;
    }

    // Additional helper methods would continue here...
    // (Truncated for brevity - full implementation would include all helper methods)

}

module.exports = TurnManager;