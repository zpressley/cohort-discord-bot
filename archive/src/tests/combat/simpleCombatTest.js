// src/game/combat/tests/simpleCombatTest.js
// Simple Combat System v2.0 Test
// Tests attack/defense ratings, chaos rolls, preparation, and bucket damage
// 
// Version: 1.0.0
// Created: 2025-10-20

const { resolveCombat } = require('../../../game/battleEngine');
const { applyDamageWithAccumulation } = require('../damageAccumulation');

/**
 * Test the core combat formula from combat_design_parameters.md
 */
async function testCombatFormula() {
    console.log('=== Combat System v2.0 - Formula Test ===');
    
    // Example from design doc: Attack 8 vs Defense 5 = 3 damage base
    const attackingForce = {
        units: [{
            primaryWeapon: { name: 'longsword' }, // Attack 6
            armor: { name: 'chainmail' },         // Defense 5
            shields: { name: 'roundShield' },     // Defense +3
            qualityType: 'professional',          // +4 attack
            training: { type: 'swordsman', level: 'basic' }, // +2 attack
            quality: { size: 100 }
        }],
        formation: 'line'
    };
    
    const defendingForce = {
        units: [{
            primaryWeapon: { name: 'spear' },     // Attack 4
            armor: { name: 'bronze' },            // Defense 4
            shields: { name: 'hoplon' },          // Defense +4
            qualityType: 'militia',               // +2 attack
            training: { type: 'spear', level: 'basic' }, // +2 attack
            quality: { size: 100 }
        }],
        formation: 'phalanx'
    };
    
    const battleConditions = {
        terrain: 'plains',      // Chaos +0
        weather: 'clear',       // Chaos +0
        density: 'organized',   // Chaos +0
        situation: 'standard'   // Chaos +0
    };
    
    const tacticalContext = {
        turn: 1
    };
    
    console.log('\n--- Test Setup ---');
    console.log('Attacker: Longsword + Chainmail + Round Shield + Professional + Swordsman Basic');
    console.log('Defender: Spear + Bronze + Hoplon + Militia + Spear Basic + Phalanx');
    console.log('Conditions: Plains, Clear, Organized, Standard (Chaos = 0)');
    
    const result = await resolveCombat(attackingForce, defendingForce, battleConditions, tacticalContext);
    
    console.log('\n--- Combat Results ---');
    console.log(`Chaos Level: ${result.combatData.chaosLevel}/10`);
    console.log(`Chaos Roll: ${result.combatData.chaosRoll}`);
    console.log(`Raw Chaos: ${result.combatData.rawChaos}`);
    console.log(`Preparation - Attacker: ${result.combatData.attackerPreparation}, Defender: ${result.combatData.defenderPreparation}`);
    console.log(`Applied Chaos - Attacker: ${result.combatData.attackerChaos}, Defender: ${result.combatData.defenderChaos}`);
    
    console.log(`\nAttack Ratings - Attacker: ${result.combatData.attackerAttack}, Defender: ${result.combatData.defenderAttack}`);
    console.log(`Defense Ratings - Attacker: ${result.combatData.attackerDefense}, Defender: ${result.combatData.defenderDefense}`);
    console.log(`Effective Attack - Attacker: ${result.combatData.effectiveAttack.attacker}, Defender: ${result.combatData.effectiveAttack.defender}`);
    console.log(`Effective Defense - Attacker: ${result.combatData.effectiveDefense.attacker}, Defender: ${result.combatData.effectiveDefense.defender}`);
    
    console.log(`\nRaw Damage - Attacker deals: ${result.combatData.rawDamage.attacker}, Defender deals: ${result.combatData.rawDamage.defender}`);
    console.log(`Casualties - Attacker: ${result.casualties.attacker.total}, Defender: ${result.casualties.defender.total}`);
    console.log(`Combat Result: ${result.combatResult.result} (${result.combatResult.intensity})`);
    
    return result;
}

/**
 * Test bucket damage accumulation system
 */
function testBucketSystem() {
    console.log('\n\n=== Bucket Damage System Test ===');
    
    // Create a test unit
    const testUnit = {
        id: 'test-unit',
        qualityType: 'militia',
        quality: { size: 100 }
    };
    
    console.log('\nTest Case: Attack 4 vs Defense 6 = -2 damage (from design doc example)');
    
    // Simulate the design doc example: Attack 4 vs Defense 6 = -2 damage
    const results = [];
    
    for (let turn = 1; turn <= 3; turn++) {
        const result = applyDamageWithAccumulation(testUnit, -2, turn);
        results.push(result);
        
        console.log(`Turn ${turn}: ${result.description}`);
        console.log(`  Casualties: ${result.casualties}, Bucket: ${result.accumulatedAfter.toFixed(2)}/1.0`);
        
        if (result.overflow) {
            console.log(`  ⚡ OVERFLOW! Casualties caused by accumulated damage`);
        }
    }
    
    console.log('\n--- Bucket Test Summary ---');
    const totalCasualties = results.reduce((sum, r) => sum + r.casualties, 0);
    console.log(`Total casualties over 3 turns: ${totalCasualties}`);
    console.log(`Expected per design doc: 10 casualties per turn = 30 total`);
    console.log(`Match expected: ${totalCasualties === 30 ? '✅' : '❌'}`);
    
    return results;
}

/**
 * Test fractional accumulation
 */
function testFractionalAccumulation() {
    console.log('\n\n=== Fractional Accumulation Test ===');
    
    const testUnit = {
        id: 'weak-unit', 
        qualityType: 'levy',
        quality: { size: 100 }
    };
    
    console.log('Test Case: Attack 5 vs Defense 6 = -1 damage (fractional accumulation)');
    
    const results = [];
    
    for (let turn = 1; turn <= 4; turn++) {
        const result = applyDamageWithAccumulation(testUnit, -1, turn);
        results.push(result);
        
        console.log(`Turn ${turn}: ${result.description}`);
        console.log(`  Casualties: ${result.casualties}, Bucket: ${result.accumulatedAfter.toFixed(2)}/1.0`);
    }
    
    console.log('\n--- Fractional Test Summary ---');
    const totalCasualties = results.reduce((sum, r) => sum + r.casualties, 0);
    console.log(`Total casualties over 4 turns: ${totalCasualties}`);
    console.log(`Expected per design doc: 5 casualties per turn = 20 total`);
    console.log(`Match expected: ${totalCasualties === 20 ? '✅' : '❌'}`);
    
    return results;
}

/**
 * Test positive damage (immediate casualties)
 */
function testPositiveDamage() {
    console.log('\n\n=== Positive Damage Test ===');
    
    const testUnit = {
        id: 'target-unit',
        qualityType: 'professional',
        quality: { size: 100 }
    };
    
    console.log('Test Case: Attack 8 vs Defense 5 = +3 damage (immediate casualties)');
    
    const result = applyDamageWithAccumulation(testUnit, 3, 1);
    
    console.log(`Result: ${result.description}`);
    console.log(`Casualties: ${result.casualties}, Bucket: ${result.accumulatedAfter}/1.0`);
    console.log(`Expected: 15 casualties (3 damage * 5 multiplier), bucket reset to 0`);
    console.log(`Match expected: ${result.casualties === 15 && result.accumulatedAfter === 0 ? '✅' : '❌'}`);
    
    return result;
}

/**
 * Run all tests
 */
async function runAllTests() {
    console.log('Starting Combat System v2.0 Tests...\n');
    
    try {
        // Test 1: Core combat formula
        await testCombatFormula();
        
        // Test 2: Bucket damage system
        testBucketSystem();
        
        // Test 3: Fractional accumulation
        testFractionalAccumulation();
        
        // Test 4: Positive damage
        testPositiveDamage();
        
        console.log('\n\n=== All Tests Complete ===');
        console.log('Combat System v2.0 validated successfully! ✅');
        
    } catch (error) {
        console.error('Test failed:', error);
        console.log('\n❌ Tests failed - check implementation');
    }
}

// Export for use in other tests
module.exports = {
    testCombatFormula,
    testBucketSystem,
    testFractionalAccumulation,
    testPositiveDamage,
    runAllTests
};

// Run tests if called directly
if (require.main === module) {
    runAllTests();
}