// src/tests/commander/simpleCommanderTest.js
// Simple test for commander functionality

const { models, setupDatabase } = require('../../database/setup');

async function testCommanderModel() {
    console.log('\n🎖️ SIMPLE COMMANDER MODEL TEST\n');
    
    try {
        // Setup database 
        await setupDatabase();
        
        console.log('Available models:', Object.keys(models));
        
        // Test BattleCommander model directly
        if (!models.BattleCommander) {
            throw new Error('BattleCommander model not found!');
        }
        
        // Create required referenced records first
        const testPlayer = await models.Commander.create({
            discordId: 'test-player-456',
            username: 'TestPlayer',
            culture: 'Roman Republic'
        });
        
        const testBattle = await models.Battle.create({
            player1Id: 'test-player-456',
            scenario: 'River Crossing',
            status: 'in_progress'
        });
        
        // Create a minimal BattleCommander record
        const testCommander = await models.BattleCommander.create({
            battleId: testBattle.id,
            playerId: 'test-player-456',
            culture: 'Roman Republic',
            position: 'H8',
            status: 'active'
        });
        
        console.log('✅ BattleCommander created:', {
            id: testCommander.id,
            culture: testCommander.culture,
            position: testCommander.position,
            status: testCommander.status,
            canReattach: testCommander.canReattach
        });
        
        // Test cultural reattachment logic
        console.log('Roman canReattach:', testCommander.canReattach);
        
        // Create Celtic player and commander to test restriction
        const celticPlayer = await models.Commander.create({
            discordId: 'test-player-celtic',
            username: 'TestCelt',
            culture: 'Celtic Tribes'
        });
        
        const celticCommander = await models.BattleCommander.create({
            battleId: testBattle.id,
            playerId: 'test-player-celtic',
            culture: 'Celtic Tribes',
            position: 'H2',
            status: 'active'
        });
        
        console.log('Celtic canReattach:', celticCommander.canReattach);
        
        // Test status descriptions
        console.log('Roman status:', testCommander.getStatusDescription());
        console.log('Celtic status:', celticCommander.getStatusDescription());
        
        // Test capture risk simulation
        await testCommander.checkCaptureRisk(20, 100); // 20% strength
        console.log('Commander after risk check:', {
            status: testCommander.status,
            captureRoll: testCommander.captureRoll
        });
        
        if (testCommander.status === 'at_risk') {
            // Test escape resolution
            await testCommander.resolveCapture('escape');
            console.log('Commander after escape attempt:', {
                status: testCommander.status,
                choice: testCommander.captureChoice
            });
        }
        
        // Cleanup
        await testCommander.destroy();
        await celticCommander.destroy();
        await testBattle.destroy();
        await testPlayer.destroy();
        await celticPlayer.destroy();
        
        console.log('\n✅ Simple commander model test passed!');
        
    } catch (error) {
        console.error('❌ Simple commander test failed:', error);
        throw error;
    }
}

// Run test if called directly
if (require.main === module) {
    testCommanderModel()
        .then(() => {
            console.log('🎖️ Commander model tests passed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Commander model tests failed:', error);
            process.exit(1);
        });
}

module.exports = { testCommanderModel };