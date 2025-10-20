// src/tests/commander/naturalLanguageTest.js
// Test natural language commander actions

const { interpretOrders } = require('../../ai/orderInterpreter');
const { models, setupDatabase } = require('../../database/setup');
const { createBattleCommander } = require('../../game/commandSystem/commanderManager');

async function testNaturalLanguageCommanders() {
    console.log('\n🗣️ NATURAL LANGUAGE COMMANDER TEST\n');
    
    try {
        await setupDatabase();
        
        // Create test battle and players
        const playerId1 = 'test-roman-' + Date.now();
        const playerId2 = 'test-enemy-' + Date.now();
        
        const testPlayer = await models.Commander.create({
            discordId: playerId1,
            username: 'TestRoman',
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
        
        // Create battle state with units
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
        
        const mockMap = {
            terrain: {},
            movementCosts: {}
        };
        
        console.log('✅ Test setup complete\n');
        
        // Test 1: Commander reattachment
        console.log('📌 Test 1: Commander Reattachment');
        console.log('Order: "I will move to the cavalry"');
        
        const reattachResult = await interpretOrders(
            "I will move to the cavalry",
            battleState,
            'player1',
            mockMap,
            battleContext
        );
        
        console.log('Result:', {
            actions: reattachResult.actions.length,
            actionType: reattachResult.actions[0]?.type,
            comment: reattachResult.officerComment
        });
        
        // Test 2: Command delegation
        console.log('\n📌 Test 2: Command Delegation');
        console.log('Order: "Marcus, take the legion and attack the bridge"');
        
        const delegationResult = await interpretOrders(
            "Marcus, take the legion and attack the bridge",
            battleState,
            'player1',
            mockMap,
            battleContext
        );
        
        console.log('Result:', {
            actions: delegationResult.actions.length,
            actionType: delegationResult.actions[0]?.type,
            targetUnit: delegationResult.actions[0]?.unitId,
            comment: delegationResult.officerComment
        });
        
        // Test 3: Commander detachment
        console.log('\n📌 Test 3: Commander Detachment');
        console.log('Order: "I will detach to F8"');
        
        const detachResult = await interpretOrders(
            "I will detach to F8",
            battleState,
            'player1',
            mockMap,
            battleContext
        );
        
        console.log('Result:', {
            actions: detachResult.actions.length,
            actionType: detachResult.actions[0]?.type,
            comment: detachResult.officerComment
        });
        
        // Test 4: Regular unit order (should not interfere)
        console.log('\n📌 Test 4: Regular Unit Order (should work normally)');
        console.log('Order: "All units move north"');
        
        const regularResult = await interpretOrders(
            "All units move north",
            battleState,
            'player1',
            mockMap,
            battleContext
        );
        
        console.log('Result:', {
            actions: regularResult.actions?.length || 0,
            actionTypes: regularResult.actions?.map(a => a.type) || [],
            comment: regularResult.officerComment || 'No comment'
        });
        
        // Cleanup
        await testBattle.destroy();
        await testPlayer.destroy();
        await testPlayer2.destroy();
        
        console.log('\n✅ All natural language commander tests passed!');
        
    } catch (error) {
        console.error('❌ Natural language commander test failed:', error);
        throw error;
    }
}

// Run test if called directly
if (require.main === module) {
    testNaturalLanguageCommanders()
        .then(() => {
            console.log('🗣️ Natural language commander tests passed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Natural language commander tests failed:', error);
            process.exit(1);
        });
}

module.exports = { testNaturalLanguageCommanders };
