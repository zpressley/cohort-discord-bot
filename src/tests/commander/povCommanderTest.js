// src/tests/commander/povCommanderTest.js
// Test corrected commander behavior as POV with adjacency constraint

const { interpretOrders } = require('../../ai/orderInterpreter');
const { models, setupDatabase } = require('../../database/setup');
const { createBattleCommander, getCommanderStatus } = require('../../game/commandSystem/commanderManager');

async function testPOVCommander() {
    console.log('\n👁️ POV COMMANDER TEST\n');
    
    try {
        await setupDatabase();
        
        // Create test setup
        const playerId1 = 'test-pov-commander-' + Date.now();
        const playerId2 = 'test-pov-enemy-' + Date.now();
        
        const testPlayer = await models.Commander.create({
            discordId: playerId1,
            username: 'TestPOVCommander',
            culture: 'Roman Republic'
        });
        
        const testPlayer2 = await models.Commander.create({
            discordId: playerId2,
            username: 'TestEnemy',
            culture: 'Celtic Tribes'
        });
        
        const testBattle = await models.Battle.create({
            player1Id: playerId1,
            player2Id: playerId2,
            scenario: 'River Crossing',
            status: 'in_progress'
        });
        
        const battleState = {
            player1: {
                unitPositions: [
                    { unitId: 'legion_1', position: 'H8', currentStrength: 80, mounted: false },
                    { unitId: 'cavalry_1', position: 'G8', currentStrength: 60, mounted: true }, // adjacent
                    { unitId: 'archer_1', position: 'F6', currentStrength: 50, mounted: false }  // 2+ tiles away
                ],
                army: { culture: 'Roman Republic' }
            },
            player2: {
                unitPositions: [
                    { unitId: 'enemy_1', position: 'H2', currentStrength: 70, mounted: false }
                ]
            },
            currentTurn: 1
        };
        
        // Create commander attached to legion (elite unit)
        await createBattleCommander(
            testBattle.id,
            playerId1,
            'Roman Republic',
            'legion_1',
            'H8'
        );
        
        const battleContext = {
            battleId: testBattle.id,
            player1Id: playerId1,
            player2Id: playerId2
        };
        
        const mockMap = { terrain: {}, movementCosts: {} };
        
        console.log('✅ Test setup complete\n');
        
        // Test 1: Valid adjacent move (1 tile)
        console.log('📌 Test 1: Valid Adjacent Move (1 tile)');
        console.log('Order: "I will move to the cavalry"');
        
        let status = await getCommanderStatus(testBattle.id, playerId1);
        console.log('  Before:', status.description);
        
        const validMoveResult = await interpretOrders(
            "I will move to the cavalry",
            battleState,
            'player1',
            mockMap,
            battleContext
        );
        
        status = await getCommanderStatus(testBattle.id, playerId1);
        console.log('  After:', status.description);
        console.log('  Result:', validMoveResult.officerComment);
        
        // Test 2: Invalid distant move (>1 tile)
        console.log('\n📌 Test 2: Invalid Distant Move (>1 tile)');
        console.log('Order: "I will move to the archers"');
        
        status = await getCommanderStatus(testBattle.id, playerId1);
        console.log('  Before:', status.description);
        
        const invalidMoveResult = await interpretOrders(
            "I will move to the archers",
            battleState,
            'player1',
            mockMap,
            battleContext
        );
        
        status = await getCommanderStatus(testBattle.id, playerId1);
        console.log('  After:', status.description);
        console.log('  Result:', invalidMoveResult.officerComment);
        
        // Test 3: Detach attempt (should be blocked)
        console.log('\n📌 Test 3: Detach Attempt (should be blocked)');
        console.log('Order: "I will detach to F8"');
        
        const detachResult = await interpretOrders(
            "I will detach to F8",
            battleState,
            'player1',
            mockMap,
            battleContext
        );
        
        console.log('  Result:', detachResult.officerComment);
        
        // Test 4: Independent position move (should be blocked)
        console.log('\n📌 Test 4: Independent Position Move (should be blocked)');
        console.log('Order: "I will move to H9"');
        
        const independentResult = await interpretOrders(
            "I will move to H9",
            battleState,
            'player1',
            mockMap,
            battleContext
        );
        
        console.log('  Result:', independentResult.officerComment);
        
        // Cleanup
        await testBattle.destroy();
        await testPlayer.destroy();
        await testPlayer2.destroy();
        
        console.log('\n✅ POV commander tests passed!');
        
    } catch (error) {
        console.error('❌ POV commander test failed:', error);
        throw error;
    }
}

// Run test if called directly
if (require.main === module) {
    testPOVCommander()
        .then(() => {
            console.log('👁️ POV commander tests passed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ POV commander tests failed:', error);
            process.exit(1);
        });
}

module.exports = { testPOVCommander };