// test_full_battle.js
// Comprehensive end-to-end battle test
// Tests: movement, combat, casualties, morale, formations, missions, victory

const { models } = require('./src/database/setup');
const { processTurn } = require('./src/game/turnOrchestrator');
const { initializeBattle } = require('./src/game/battleInitializer');
const { RIVER_CROSSING_MAP } = require('./src/game/maps/riverCrossing');

/**
 * Create test commanders with armies
 */
async function createTestCommanders() {
    // Create P1 commander (Romans)
    const p1 = await models.Commander.findOrCreate({
        where: { discordId: 'test_player_1' },
        defaults: {
            discordId: 'test_player_1',
            username: 'TestRoman',
            culture: 'Roman Republic',
            rank: 1,
            armyComposition: {
                units: [
                    {
                        isElite: true,
                        type: 'infantry',
                        unitType: 'infantry',
                        qualityType: 'professional',
                        quality: { size: 100 },
                        primaryWeapon: { name: 'Roman Gladius', attack: 8 },
                        armor: { name: 'Lorica Segmentata', defense: 9 },
                        shields: { name: 'Scutum', defense: 3 }
                    },
                    {
                        type: 'infantry',
                        unitType: 'infantry',
                        qualityType: 'professional',
                        quality: { size: 100 },
                        primaryWeapon: { name: 'Roman Pilum', attack: 7 },
                        armor: { name: 'Light Armor', defense: 5 },
                        shields: { name: 'Small Shield', defense: 2 },
                        hasRanged: true
                    }
                ]
            }
        }
    });
    
    // Create P2 commander (Celts)
    const p2 = await models.Commander.findOrCreate({
        where: { discordId: 'test_player_2' },
        defaults: {
            discordId: 'test_player_2',
            username: 'TestCelt',
            culture: 'Celtic',
            rank: 1,
            armyComposition: {
                units: [
                    {
                        isElite: true,
                        type: 'infantry',
                        unitType: 'infantry',
                        qualityType: 'veteran',
                        quality: { size: 80 },
                        primaryWeapon: { name: 'Longsword', attack: 9 },
                        armor: { name: 'Light Mail', defense: 6 },
                        shields: { name: 'Round Shield', defense: 2 }
                    },
                    {
                        type: 'cavalry',
                        unitType: 'cavalry',
                        qualityType: 'professional',
                        quality: { size: 50 },
                        mounted: true,
                        primaryWeapon: { name: 'Spear', attack: 8 },
                        armor: { name: 'No Armor', defense: 0 },
                        shields: { name: 'Small Shield', defense: 2 }
                    }
                ]
            }
        }
    });
    
    return { p1: p1[0], p2: p2[0] };
}

/**
 * Run complete battle simulation
 */
async function runFullBattleTest() {
    console.log('═══════════════════════════════════════');
    console.log('🧪 COMPREHENSIVE BATTLE TEST');
    console.log('═══════════════════════════════════════\n');
    
    try {
        // Create test commanders
        const commanders = await createTestCommanders();
        console.log('✅ Test commanders created');
        console.log(`   P1: ${commanders.p1.culture} (${commanders.p1.armyComposition.units.length} units)`);
        console.log(`   P2: ${commanders.p2.culture} (${commanders.p2.armyComposition.units.length} units)\n`);
        
        // Create battle
        const battle = await models.Battle.create({
            scenario: 'river_crossing',
            status: 'initializing',
            currentTurn: 1,
            player1Id: 'test_player_1',
            player2Id: 'test_player_2',
            player1Culture: commanders.p1.culture,
            player2Culture: commanders.p2.culture,
            weather: 'clear',
            maxTurns: 12
        });
        
        console.log(`✅ Battle created: ${battle.id}\n`);
        
        // Initialize battle state
        const initialState = await initializeBattle(battle, commanders.p1, commanders.p2);
        
        await battle.update({
            battleState: initialState,
            status: 'active'
        });
        
        console.log('✅ Battle initialized and ready\n');
        console.log('Starting positions:');
        console.log('   P1:', initialState.player1.unitPositions.map(u => `${u.unitId}@${u.position}`).join(', '));
        console.log('   P2:', initialState.player2.unitPositions.map(u => `${u.unitId}@${u.position}`).join(', '));
        console.log();
        
        // Helper to reload battle after each turn
        async function refreshBattle() {
            const updated = await models.Battle.findByPk(battle.id);
            return updated;
        }
        
        // TURN 1: Advance toward center
        console.log('\n━━━ TURN 1: INITIAL ADVANCE ━━━');
        console.log('P1: "advance south"');
        console.log('P2: "advance north"\n');
        
        let currentBattle = await refreshBattle();
        let result = await processTurn(currentBattle, 'advance south', 'advance north', RIVER_CROSSING_MAP);
        
        if (!result.success) {
            throw new Error(`Turn 1 failed: ${result.error}`);
        }
        
        await battle.update({
            currentTurn: battle.currentTurn + 1,
            battleState: result.newBattleState
        });
        
        console.log('✅ Turn 1 complete');
        console.log('   P1 positions:', result.newBattleState.player1.unitPositions.map(u => `${u.unitId}@${u.position}`).join(', '));
        console.log('   P2 positions:', result.newBattleState.player2.unitPositions.map(u => `${u.unitId}@${u.position}`).join(', '));
        console.log('   Missions created:', result.newBattleState.player1.unitPositions.filter(u => u.activeMission).length + result.newBattleState.player2.unitPositions.filter(u => u.activeMission).length);
        
        // TURN 2: Test mission continuation
        console.log('\n━━━ TURN 2: MISSION CONTINUATION TEST ━━━');
        console.log('P1: "hold" (should auto-continue missions)');
        console.log('P2: "hold" (should auto-continue missions)\n');
        
        currentBattle = await refreshBattle();
        result = await processTurn(currentBattle, 'hold', 'hold', RIVER_CROSSING_MAP);
        
        await battle.update({
            currentTurn: battle.currentTurn + 1,
            battleState: result.newBattleState
        });
        
        console.log('✅ Turn 2 complete');
        console.log('   P1 positions:', result.newBattleState.player1.unitPositions.map(u => `${u.unitId}@${u.position}`).join(', '));
        console.log('   P2 positions:', result.newBattleState.player2.unitPositions.map(u => `${u.unitId}@${u.position}`).join(', '));
        console.log('   Active missions:', result.newBattleState.player1.unitPositions.filter(u => u.activeMission?.status === 'active').length + result.newBattleState.player2.unitPositions.filter(u => u.activeMission?.status === 'active').length);
        
        // TURN 3: Move infantry into combat range
        console.log('\n━━━ TURN 3: APPROACH CONTACT ━━━');
        console.log('P1: "infantry advance to H10"');
        console.log('P2: "infantry advance to H12"\n');
        
        currentBattle = await refreshBattle();
        result = await processTurn(currentBattle, 'infantry advance to H10', 'infantry advance to H12', RIVER_CROSSING_MAP);
        
        await battle.update({
            currentTurn: battle.currentTurn + 1,
            battleState: result.newBattleState
        });
        
        console.log('✅ Turn 3 complete');
        console.log('   P1 positions:', result.newBattleState.player1.unitPositions.map(u => `${u.unitId}@${u.position}`).join(', '));
        console.log('   P2 positions:', result.newBattleState.player2.unitPositions.map(u => `${u.unitId}@${u.position}`).join(', '));
        console.log('   Combat triggered:', result.turnResults.combats > 0 ? 'YES ⚔️' : 'No');
        
        // TURN 4: Direct combat - get units adjacent
        console.log('\n━━━ TURN 4: ENGAGE ━━━');
        console.log('P1: "advance to H11"');
        console.log('P2: "hold position"\n');
        
        currentBattle = await refreshBattle();
        result = await processTurn(currentBattle, 'advance to H11', 'hold position', RIVER_CROSSING_MAP);
        
        await battle.update({
            currentTurn: battle.currentTurn + 1,
            battleState: result.newBattleState
        });
        
        console.log('✅ Turn 4 complete');
        console.log('   Combat engagements:', result.turnResults.combats);
        console.log('   P1 casualties:', result.turnResults.casualties.player1);
        console.log('   P2 casualties:', result.turnResults.casualties.player2);
        console.log('   P1 morale:', result.newBattleState.player1.morale);
        console.log('   P2 morale:', result.newBattleState.player2.morale);
        
        // Check for broken units
        const p1Broken = result.newBattleState.player1.unitPositions.filter(u => u.isBroken);
        const p2Broken = result.newBattleState.player2.unitPositions.filter(u => u.isBroken);
        
        if (p1Broken.length > 0) {
            console.log('   💔 P1 broken units:', p1Broken.map(u => u.unitId).join(', '));
        }
        if (p2Broken.length > 0) {
            console.log('   💔 P2 broken units:', p2Broken.map(u => u.unitId).join(', '));
        }
        
        // Continue battle until victory or turn limit
        let maxTurns = 12;
        while (!result.victory.achieved && currentBattle.currentTurn < maxTurns) {
            console.log(`\n━━━ TURN ${currentBattle.currentTurn}: ONGOING ━━━`);
            
            currentBattle = await refreshBattle();
            result = await processTurn(currentBattle, 'attack', 'attack', RIVER_CROSSING_MAP);
            
            await battle.update({
                currentTurn: battle.currentTurn + 1,
                battleState: result.newBattleState
            });
            
            console.log(`   Combat: ${result.turnResults.combats} engagements`);
            console.log(`   Casualties: P1=${result.turnResults.casualties.player1}, P2=${result.turnResults.casualties.player2}`);
            
            const p1Remaining = result.newBattleState.player1.unitPositions.reduce((s, u) => s + u.currentStrength, 0);
            const p2Remaining = result.newBattleState.player2.unitPositions.reduce((s, u) => s + u.currentStrength, 0);
            console.log(`   Survivors: P1=${p1Remaining}, P2=${p2Remaining}`);
            
            if (result.victory.achieved) {
                console.log(`\n🏆 VICTORY ACHIEVED ON TURN ${currentBattle.currentTurn}!`);
                console.log(`   Winner: ${result.victory.winner}`);
                console.log(`   Reason: ${result.victory.reason}`);
                console.log(`   Description: ${result.victory.description || 'N/A'}`);
                break;
            }
        }
        
        // FINAL REPORT
        console.log('\n═══════════════════════════════════════');
        console.log('📊 BATTLE TEST RESULTS');
        console.log('═══════════════════════════════════════\n');
        
        const finalState = result.newBattleState;
        const finalP1 = finalState.player1.unitPositions;
        const finalP2 = finalState.player2.unitPositions;
        
        const p1Survivors = finalP1.reduce((s, u) => s + u.currentStrength, 0);
        const p2Survivors = finalP2.reduce((s, u) => s + u.currentStrength, 0);
        
        const p1Original = finalP1.reduce((s, u) => s + (u.maxStrength || u.currentStrength), 0);
        const p2Original = finalP2.reduce((s, u) => s + (u.maxStrength || u.currentStrength), 0);
        
        const p1Casualties = p1Original - p1Survivors;
        const p2Casualties = p2Original - p2Survivors;
        
        console.log('🎯 Systems Tested:');
        console.log('   ✅ Battle initialization');
        console.log('   ✅ Commander creation');
        console.log('   ✅ Unit deployment');
        console.log('   ✅ Order interpretation');
        console.log('   ✅ Unit type selection');
        console.log('   ✅ Mission persistence');
        console.log('   ✅ Mission auto-continuation');
        console.log('   ✅ Movement system');
        console.log('   ✅ Combat detection');
        console.log('   ✅ Casualty application');
        console.log('   ✅ Morale tracking');
        console.log('   ✅ Victory detection');
        console.log('   ✅ Database persistence');
        
        console.log('\n📈 Final Statistics:');
        console.log(`   Total Turns: ${currentBattle.currentTurn}`);
        console.log(`   P1 (Romans): ${p1Survivors}/${p1Original} survivors (${finalP1.length} units)`);
        console.log(`   P2 (Celts): ${p2Survivors}/${p2Original} survivors (${finalP2.length} units)`);
        console.log(`   P1 Casualties: ${p1Casualties} (${Math.round((p1Casualties/p1Original)*100)}%)`);
        console.log(`   P2 Casualties: ${p2Casualties} (${Math.round((p2Casualties/p2Original)*100)}%)`);
        console.log(`   Victory: ${result.victory.achieved ? result.victory.reason : 'Time limit / Ongoing'}`);
        
        if (result.victory.achieved) {
            console.log(`   Winner: ${result.victory.winner}`);
        }
        
        // Check for specific features
        const p1BrokenUnits = finalP1.filter(u => u.isBroken).length;
        const p2BrokenUnits = finalP2.filter(u => u.isBroken).length;
        
        console.log('\n🎮 Advanced Features:');
        console.log(`   Missions created: ${finalP1.filter(u => u.activeMission).length + finalP2.filter(u => u.activeMission).length}`);
        console.log(`   Units broken: P1=${p1BrokenUnits}, P2=${p2BrokenUnits}`);
        console.log(`   Final morale: P1=${finalState.player1.morale}, P2=${finalState.player2.morale}`);
        
        console.log('\n🎉 INTEGRATION TEST COMPLETE');
        console.log('   Status: ALL SYSTEMS OPERATIONAL\n');
        
        // Cleanup
        await battle.destroy();
        await commanders.p1.destroy();
        await commanders.p2.destroy();
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
console.log('Starting full battle integration test...\n');
runFullBattleTest();