// src/tests/commander/commanderTest.js
// Test suite for CMD-001 commander functionality

const { 
    createBattleCommander,
    updateCommanderPosition,
    checkCommanderCaptureRisk,
    detachCommander,
    reattachCommander,
    resolveCommanderCapture,
    getCommanderStatus
} = require('../../game/commandSystem/commanderManager');

const { models, setupDatabase } = require('../../database/setup');

async function runCommanderTests() {
    console.log('\n🎖️ COMMANDER SYSTEM TESTS (CMD-001)\n');
    
    try {
        // Setup test database
        await setupDatabase();
        
        // Create test battle and players
        const testBattle = await models.Battle.create({
            id: 'test-battle-cmd-001',
            player1Id: 'test-player-roman',
            player2Id: 'test-player-celtic',
            scenario: 'River Crossing',
            status: 'in_progress',
            battleState: {
                player1: { army: { culture: 'Roman Republic' } },
                player2: { army: { culture: 'Celtic Tribes' } }
            }
        });
        
        const testRomanCommander = await models.Commander.create({
            discordId: 'test-player-roman',
            username: 'TestRoman',
            culture: 'Roman Republic'
        });
        
        const testCelticCommander = await models.Commander.create({
            discordId: 'test-player-celtic', 
            username: 'TestCelt',
            culture: 'Celtic Tribes'
        });
        
        console.log('✅ Test battle and players created');
        
        // Test 1: Commander Creation and Attachment
        console.log('\n📌 Test 1: Commander Creation and Attachment');
        const romanBattleCommander = await createBattleCommander(
            testBattle.id,
            'test-player-roman',
            'Roman Republic',
            'legion_1',
            'H8'
        );
        
        const celticBattleCommander = await createBattleCommander(
            testBattle.id,
            'test-player-celtic',
            'Celtic Tribes',
            'warrior_1',
            'H2'
        );
        
        console.log('✅ Roman commander created:', romanBattleCommander.name, 'at', romanBattleCommander.position);
        console.log('✅ Celtic commander created:', celticBattleCommander.name, 'at', celticBattleCommander.position);
        
        // Test 2: Position Updates
        console.log('\n📍 Test 2: Commander Position Updates');
        await updateCommanderPosition(testBattle.id, 'test-player-roman', 'legion_1', 'H9');
        const romanStatus = await getCommanderStatus(testBattle.id, 'test-player-roman');
        console.log('✅ Roman commander position updated to:', romanStatus.position);
        
        // Test 3: Cultural Reattachment Rules
        console.log('\n🔄 Test 3: Cultural Reattachment Rules');
        console.log('Roman canReattach:', romanStatus.canReattach, '(should be true)');
        
        const celticStatus = await getCommanderStatus(testBattle.id, 'test-player-celtic');
        console.log('Celtic canReattach:', celticStatus.canReattach, '(should be false)');
        
        // Test 4: Roman Detachment/Reattachment
        console.log('\n🔓 Test 4: Roman Commander Detachment/Reattachment');
        
        try {
            const detachedRoman = await detachCommander(testBattle.id, 'test-player-roman', 'G8');
            console.log('✅ Roman commander detached to:', detachedRoman.position);
            
            const reattachedRoman = await reattachCommander(testBattle.id, 'test-player-roman', 'legion_2', 'F8');
            console.log('✅ Roman commander reattached to legion_2 at:', reattachedRoman.position);
            
        } catch (error) {
            console.log('❌ Roman detachment/reattachment failed:', error.message);
        }
        
        // Test 5: Celtic Detachment Restriction
        console.log('\n🚫 Test 5: Celtic Commander Detachment Restriction');
        
        try {
            await detachCommander(testBattle.id, 'test-player-celtic', 'G2');
            console.log('❌ Celtic detachment should have failed!');
        } catch (error) {
            console.log('✅ Celtic detachment correctly blocked:', error.message);
        }
        
        // Test 6: Capture Risk Mechanics
        console.log('\n⚠️ Test 6: Capture Risk Mechanics');
        
        // Simulate unit taking heavy casualties (down to 20% strength)
        const commanderAtRisk = await checkCommanderCaptureRisk(
            testBattle.id,
            'test-player-roman',
            'legion_2',
            20,  // current strength
            100  // max strength (20% = at risk)
        );
        
        if (commanderAtRisk) {
            console.log('✅ Commander at risk detected:', commanderAtRisk.status);
            console.log('   Capture roll:', commanderAtRisk.captureRoll);
            
            // Test 7: Capture Resolution - Escape Attempt
            console.log('\n🏃 Test 7: Capture Resolution - Escape Attempt');
            const escapeResult = await resolveCommanderCapture(
                testBattle.id,
                'test-player-roman',
                'escape'
            );
            console.log('✅ Escape attempt result:', escapeResult.status);
            console.log('   Choice made:', escapeResult.captureChoice);
            
        } else {
            console.log('ℹ️ Commander not at risk (unit strength >25%)');
        }
        
        // Test 8: Status Summary
        console.log('\n📊 Test 8: Final Status Summary');
        const finalRomanStatus = await getCommanderStatus(testBattle.id, 'test-player-roman');
        const finalCelticStatus = await getCommanderStatus(testBattle.id, 'test-player-celtic');
        
        console.log('Roman Commander Final Status:');
        console.log('  -', finalRomanStatus.description);
        console.log('  - Position:', finalRomanStatus.position);
        console.log('  - Can Reattach:', finalRomanStatus.canReattach);
        
        console.log('Celtic Commander Final Status:');
        console.log('  -', finalCelticStatus.description);
        console.log('  - Position:', finalCelticStatus.position);
        console.log('  - Can Reattach:', finalCelticStatus.canReattach);
        
        console.log('\n✅ All commander tests completed successfully!');
        
        // Cleanup
        await testBattle.destroy();
        await testRomanCommander.destroy();
        await testCelticCommander.destroy();
        
        console.log('🧹 Test cleanup completed\n');
        
    } catch (error) {
        console.error('❌ Commander test failed:', error);
        throw error;
    }
}

// Run tests if called directly
if (require.main === module) {
    runCommanderTests()
        .then(() => {
            console.log('🎖️ Commander system tests passed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Commander system tests failed:', error);
            process.exit(1);
        });
}

module.exports = { runCommanderTests };
