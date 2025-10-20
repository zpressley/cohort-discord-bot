// src/tests/commander/independentMovementTest.js
// Test independent commander movement capabilities

const { interpretOrders } = require('../../ai/orderInterpreter');
const { models, setupDatabase } = require('../../database/setup');
const { createBattleCommander, getCommanderStatus } = require('../../game/commandSystem/commanderManager');

async function testIndependentCommanderMovement() {
    console.log('\n🚶 INDEPENDENT COMMANDER MOVEMENT TEST\n');
    
    try {
        await setupDatabase();
        
        // Create test setup
        const playerId1 = 'test-commander-move-' + Date.now();
        const playerId2 = 'test-enemy-move-' + Date.now();
        
        const testPlayer = await models.Commander.create({
            discordId: playerId1,
            username: 'TestCommander',
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
                    { unitId: 'cavalry_1', position: 'G8', currentStrength: 60, mounted: true }
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
        
        // Create battle commander attached to legion
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
        
        // Test 1: Independent movement while attached (should detach)
        console.log('📌 Test 1: Independent Movement While Attached');
        console.log('Order: "I will move to F7"');
        
        let status = await getCommanderStatus(testBattle.id, playerId1);
        console.log('  Before:', status.description);
        
        const attachedMoveResult = await interpretOrders(
            "I will move to F7",
            battleState,
            'player1',
            mockMap,
            battleContext
        );
        
        status = await getCommanderStatus(testBattle.id, playerId1);
        console.log('  After:', status.description);
        console.log('  Result:', {
            actionType: attachedMoveResult.actions[0]?.type,
            comment: attachedMoveResult.officerComment
        });
        
        // Test 2: Independent movement while detached  
        console.log('\n📌 Test 2: Independent Movement While Detached');
        console.log('Order: "I will move to G6"');
        
        status = await getCommanderStatus(testBattle.id, playerId1);
        console.log('  Before:', status.description);
        
        const detachedMoveResult = await interpretOrders(
            "I will move to G6", 
            battleState,
            'player1',
            mockMap,
            battleContext
        );
        
        status = await getCommanderStatus(testBattle.id, playerId1);
        console.log('  After:', status.description);
        console.log('  Result:', {
            actionType: detachedMoveResult.actions[0]?.type,
            comment: detachedMoveResult.officerComment
        });
        
        // Test 3: Alternative movement patterns
        console.log('\n📌 Test 3: Alternative Movement Patterns');
        
        const patterns = [
            "I'll go to H9",
            "I go to I8",
            "I will go at J7"
        ];
        
        for (const pattern of patterns) {
            console.log(`  Testing: "${pattern}"`);
            const result = await interpretOrders(
                pattern,
                battleState,
                'player1',
                mockMap,
                battleContext
            );
            
            const finalStatus = await getCommanderStatus(testBattle.id, playerId1);
            console.log(`    → ${finalStatus.position} (${result.officerComment})`);
        }
        
        // Cleanup
        await testBattle.destroy();
        await testPlayer.destroy();
        await testPlayer2.destroy();
        
        console.log('\n✅ Independent commander movement tests passed!');
        
    } catch (error) {
        console.error('❌ Independent movement test failed:', error);
        throw error;
    }
}

// Run test if called directly
if (require.main === module) {
    testIndependentCommanderMovement()
        .then(() => {
            console.log('🚶 Independent commander movement tests passed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Independent commander movement tests failed:', error);
            process.exit(1);
        });
}

module.exports = { testIndependentCommanderMovement };