// Test script for 4 ambush scenarios with new range mechanics
const { testScenario } = require('./src/game/combat/tests/comprehensiveBalanceTest.js');

// Create the 4 test scenarios
const AMBUSH_TEST_SCENARIOS = {
    'archers_ambush_swordsmen': {
        description: 'Archers ambush swordsmen (ranged vs melee)',
        attacker: {
            units: [{
                primaryWeapon: { name: 'compositeBow' },
                armor: { name: 'leather' },
                shields: { name: 'buckler' },
                qualityType: 'professional',
                training: { type: 'archer', level: 'expert' },
                quality: { size: 100 }
            }],
            formation: 'loose'
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'sword' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'swordsman', level: 'technical' },
                quality: { size: 100 }
            }],
            formation: 'line' // Caught in formation, not marching
        },
        conditions: {
            terrain: 'forest',
            weather: 'clear',
            unit_density: 'normal',
            combat_situation: 'ambush'
        },
        expectedBalance: 'attacker_favored',
        expectedWinRate: { attacker: 0.8, defender: 0.2 }
    },

    'archers_ambush_archers': {
        description: 'Archers ambush archers (ranged vs ranged)',
        attacker: {
            units: [{
                primaryWeapon: { name: 'compositeBow' },
                armor: { name: 'leather' },
                shields: { name: 'buckler' },
                qualityType: 'professional',
                training: { type: 'archer', level: 'expert' },
                quality: { size: 100 }
            }],
            formation: 'loose'
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'compositeBow' },
                armor: { name: 'leather' },
                shields: { name: 'buckler' },
                qualityType: 'professional',
                training: { type: 'archer', level: 'expert' },
                quality: { size: 100 }
            }],
            formation: 'loose'
        },
        conditions: {
            terrain: 'forest',
            weather: 'clear',
            unit_density: 'normal',
            combat_situation: 'ambush'
        },
        expectedBalance: 'attacker_slight_advantage',
        expectedWinRate: { attacker: 0.65, defender: 0.35 }
    },

    'swordsmen_ambush_archers': {
        description: 'Swordsmen ambush archers (melee vs ranged)',
        attacker: {
            units: [{
                primaryWeapon: { name: 'sword' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'swordsman', level: 'technical' },
                quality: { size: 100 }
            }],
            formation: 'loose' // Stealth approach
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'compositeBow' },
                armor: { name: 'leather' },
                shields: { name: 'buckler' },
                qualityType: 'professional',
                training: { type: 'archer', level: 'expert' },
                quality: { size: 100 }
            }],
            formation: 'line' // Caught unprepared
        },
        conditions: {
            terrain: 'forest',
            weather: 'clear',
            unit_density: 'normal',
            combat_situation: 'ambush'
        },
        expectedBalance: 'competitive',
        expectedWinRate: { attacker: 0.6, defender: 0.4 }
    },

    'swordsmen_ambush_swordsmen': {
        description: 'Swordsmen ambush swordsmen (melee vs melee)',
        attacker: {
            units: [{
                primaryWeapon: { name: 'sword' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'swordsman', level: 'technical' },
                quality: { size: 100 }
            }],
            formation: 'loose' // Stealth approach
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'sword' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'swordsman', level: 'technical' },
                quality: { size: 100 }
            }],
            formation: 'line' // Standard formation
        },
        conditions: {
            terrain: 'forest',
            weather: 'clear',
            unit_density: 'normal',
            combat_situation: 'ambush'
        },
        expectedBalance: 'attacker_slight_advantage',
        expectedWinRate: { attacker: 0.65, defender: 0.35 }
    }
};

async function runAllAmbushTests() {
    console.log('=== AMBUSH SCENARIOS WITH RANGE MECHANICS ===');
    console.log('Testing closing distance bonuses and ambush advantages\\n');
    
    for (const [name, scenario] of Object.entries(AMBUSH_TEST_SCENARIOS)) {
        console.log(`\\n--- Testing: ${scenario.description} ---`);
        await testScenario(name, scenario, 15);
    }
    
    console.log('\\n=== SUMMARY ===');
    console.log('Expected outcomes:');
    console.log('1. Archers vs Swordsmen: 80% attacker wins (massive range advantage)');
    console.log('2. Archers vs Archers: 65% attacker wins (first shot advantage)');  
    console.log('3. Swordsmen vs Archers: 60% attacker wins (surprise negates range)');
    console.log('4. Swordsmen vs Swordsmen: 65% attacker wins (ambush advantage only)');
}

// Run if called directly
if (require.main === module) {
    runAllAmbushTests().catch(console.error);
}

module.exports = {
    AMBUSH_TEST_SCENARIOS,
    runAllAmbushTests
};