// src/bot/commands/test-join.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-join')
        .setDescription('Test joining your own battle as second player (DEV ONLY)'),
    
    async execute(interaction) {
        try {
            const { models } = require('../../database/setup');
            const { Battle, Commander } = models;
            const { RIVER_CROSSING_MAP, initializeDeployment } = require('../../game/maps/riverCrossing');
            const { createBattleCommander } = require('../../game/commandSystem/commanderManager');
            
            await interaction.deferReply({ ephemeral: true });
            
            console.log(`Test-join: Looking for battles by player ${interaction.user.id}`);
            
            // Find YOUR waiting battle
            const battle = await Battle.findOne({
                where: {
                    player1Id: interaction.user.id,
                    status: 'waiting_for_players'
                },
                order: [['createdAt', 'DESC']]
            });
            
            console.log('Test-join: Battle found:', battle ? battle.id : 'NONE');
            
            if (!battle) {
                const allBattles = await Battle.findAll();
                console.log('All battles in database:', allBattles.length);
                
                return interaction.editReply({
                    content: `No waiting battle found.\n\n` +
                            `Create one first with \`/create-game\`\n` +
                            `(Found ${allBattles.length} total battles in database)`
                });
            }
            
            // Get your commander
            const commander = await Commander.findByPk(interaction.user.id);
            
            if (!commander) {
                return interaction.editReply({
                    content: 'Commander not found. Build an army first.'
                });
            }
            
            console.log(`Test-join: Joining battle ${battle.id} as second player`);
            
            // Create test commander for Player 2
            const testPlayer2Id = 'TEST_' + Date.now();
            const testCulture = getRandomOpposingCulture(battle.player1Culture);
            
            let testCommander = await Commander.findByPk(testPlayer2Id);
            if (!testCommander) {
                console.log('Creating test commander...');
                testCommander = await Commander.create({
                    discordId: testPlayer2Id,
                    username: 'TEST_OPPONENT',
                    culture: testCulture,
                    armyComposition: commander.armyComposition,
                    rank: 'Recruit',
                    battlesWon: 0,
                    battlesLost: 0
                });
                console.log('Test commander created:', testPlayer2Id);
            }
            
            // Get current battle state
            const currentState = battle.battleState || {};
            
            // Helper to include elite unit if configured
            const { getAllWeapons, TROOP_QUALITY } = require('../../game/armyData');
            const { getEliteUnitForCulture } = require('../../game/eliteTemplates');
            const allWeapons = getAllWeapons();
            function addEliteIfAny(units, eliteSize, culture) {
                const elite = getEliteUnitForCulture(culture, eliteSize, allWeapons, require('../../game/armyData').TROOP_QUALITY);
                return elite ? [elite, ...units] : units;
            }

            const p1ArmyUnits = currentState.player1?.army?.units || [];
            const p1EliteSize = currentState.player1?.army?.eliteSize || 0;
            const p2ArmyUnits = commander.armyComposition?.units || [];
            const p2EliteSize = commander.armyComposition?.eliteSize || 0;

            // Initialize unit positions on the map
            const p1Units = initializeDeployment(
                'north', 
                addEliteIfAny(p1ArmyUnits, p1EliteSize, battle.player1Culture)
            );
            
            const p2Units = initializeDeployment(
                'south',
                addEliteIfAny(p2ArmyUnits, p2EliteSize, testCulture)
            );
            
            console.log(`Initialized positions: P1 ${p1Units.length} units, P2 ${p2Units.length} units`);
            
            // Update battle with test player and positions
            battle.player2Id = testPlayer2Id;
            battle.player2Culture = testCulture;
            battle.battleState = {
                ...currentState,
                player1: {
                    ...currentState.player1,
                    unitPositions: p1Units,
                    visibleEnemyPositions: []
                },
                player2: {
                    army: commander.armyComposition || {},
                    positions: {},
                    supplies: 100,
                    morale: 100,
                    unitPositions: p2Units,
                    visibleEnemyPositions: []
                },
                terrain: RIVER_CROSSING_MAP.terrain,
                weather: battle.weather,
                currentTurn: battle.currentTurn
            };
            battle.status = 'in_progress';
            
            await battle.save();

            // Ensure Turn 1 record exists
            const { BattleTurn } = models;
            const existingTurn = await BattleTurn.findOne({ where: { battleId: battle.id, turnNumber: 1 } });
            if (!existingTurn) {
                await BattleTurn.create({ battleId: battle.id, turnNumber: 1, player1Command: null, player2Command: null });
            }
            
            // Create battle commanders for both players
            try {
                // Get player 1 culture from existing battle state
                const p1Culture = currentState.player1?.army?.culture || 'Roman Republic';
                
                // Create commander for Player 1 (attached to first unit)
                const p1FirstUnit = p1Units[0];
                if (p1FirstUnit) {
                    await createBattleCommander(
                        battle.id,
                        battle.player1Id,
                        p1Culture,
                        p1FirstUnit.unitId,
                        p1FirstUnit.position
                    );
                }
                
                // Create commander for Player 2 (TEST) (attached to first unit)
                const p2FirstUnit = p2Units[0];
                if (p2FirstUnit) {
                    await createBattleCommander(
                        battle.id,
                        testPlayer2Id,
                        testCulture,
                        p2FirstUnit.unitId,
                        p2FirstUnit.position
                    );
                }
                
                console.log('✅ Battle commanders created for both players');
            } catch (commanderError) {
                console.error('Error creating battle commanders:', commanderError);
                // Continue with battle - commanders are optional for now
            }
            
            console.log(`Test-join: Battle ${battle.id} now active with positioned units and commanders`);

            // Send initial briefings with map to both players (best-effort)
            try {
                const { sendNextTurnBriefings } = require('../dmHandler');
                const client = interaction.client;
                await sendNextTurnBriefings(battle, battle.battleState, { p1Interpretation:{}, p2Interpretation:{} }, client);
            } catch (e) {
                console.warn('test-join: initial briefing send failed:', e.message);
            }
            
            return interaction.editReply({
                content: `**Test Battle Started!**\n\n` +
                        `**Player 1:** ${battle.player1Culture} (You)\n` +
                        `  - ${p1Units.length} units deployed in northern zone\n` +
                        `  - Starting positions: ${p1Units.map(u => u.position).join(', ')}\n\n` +
                        `**Player 2 (TEST):** ${battle.player2Culture} (AI Opponent)\n` +
                        `  - ${p2Units.length} units deployed in southern zone\n` +
                        `  - Starting positions: ${p2Units.map(u => u.position).join(', ')}\n\n` +
                        `**Scenario:** ${battle.scenario}\n` +
                        `**Map:** 15x15 grid (A1-O15)\n\n` +
                        `Battle is active! Check your DMs for tactical briefing with map.`
            });
            
        } catch (error) {
            console.error('Test join error:', error);
            return interaction.editReply({
                content: `Test failed: ${error.message}\n\nCheck terminal for details.`
            });
        }
    }
};

function getRandomOpposingCulture(player1Culture) {
    const cultures = [
        'Roman Republic', 'Celtic', 'Han Dynasty', 'Macedonian Kingdoms',
        'Sarmatian Confederations', 'Berber Confederations', 'Spartan City-State', 'Kingdom of Kush'
    ];
    
    const available = cultures.filter(c => c !== player1Culture);
    return available[Math.floor(Math.random() * available.length)];
}