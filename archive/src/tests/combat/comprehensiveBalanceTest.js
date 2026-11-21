// src/game/combat/tests/comprehensiveBalanceTest.js
// Comprehensive Combat Balance Testing
// Tests diverse tactical situations, not just river crossings
// 
// Version: 1.0.0
// Created: 2025-10-20

const { resolveCombat } = require('../../../game/battleEngine');

/**
 * Diverse Combat Scenarios
 * Testing different terrains, situations, unit types
 */
const COMPREHENSIVE_SCENARIOS = {
    // HEAD-TO-HEAD ON PLAINS - Pure unit vs unit
    'plains_professional_vs_professional': {
        description: 'Professional infantry head-to-head on open plains',
        attacker: {
            units: [{
                primaryWeapon: { name: 'sword' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'swordsman', level: 'technical' },
                quality: { size: 100 }
            }],
            formation: 'line'
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
            formation: 'line'
        },
        conditions: {
            terrain: 'plains',           // +0 chaos
            weather: 'clear',            // +0 chaos
            unit_density: 'normal',      // +0 chaos
            combat_situation: 'prepared' // +0 chaos
        },
        expectedBalance: 'perfectly_balanced',
        expectedWinRate: { attacker: 0.5, defender: 0.5 }
    },

    'plains_cavalry_vs_infantry': {
        description: 'Cavalry charge vs infantry line on open plains',
        attacker: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'cavalry', level: 'technical' },
                quality: { size: 100 },
                mounted: true
            }],
            formation: 'wedge'
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'leather' },
                shields: { name: 'roundShield' },
                qualityType: 'militia',
                training: { type: 'spear', level: 'basic' },
                quality: { size: 100 }
            }],
            formation: 'line'
        },
        conditions: {
            terrain: 'plains',           // +0 chaos - Perfect for cavalry
            weather: 'clear',            // +0 chaos
            unit_density: 'normal',      // +0 chaos
            combat_situation: 'prepared' // +0 chaos
        },
        expectedBalance: 'attacker_favored',
        expectedWinRate: { attacker: 0.7, defender: 0.3 }
    },

    'plains_phalanx_vs_cavalry': {
        description: 'Phalanx pike wall vs cavalry charge on plains',
        attacker: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'cavalry', level: 'technical' },
                quality: { size: 100 },
                mounted: true
            }],
            formation: 'wedge'
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'pike_sarissa' },
                armor: { name: 'bronze' },
                shields: { name: 'hoplon' },
                qualityType: 'professional',
                training: { type: 'spear', level: 'expert' },
                quality: { size: 100 }
            }],
            formation: 'phalanx'
        },
        conditions: {
            terrain: 'plains',           // +0 chaos
            weather: 'clear',            // +0 chaos
            unit_density: 'normal',      // +0 chaos
            combat_situation: 'prepared' // +0 chaos
        },
        expectedBalance: 'defender_favored',
        expectedWinRate: { attacker: 0.25, defender: 0.75 }
    },

    // FOREST BATTLES
    'forest_ambush_archers': {
        description: 'Archer ambush in dense forest',
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
            formation: 'line'
        },
        conditions: {
            terrain: 'forest',           // +2 chaos
            weather: 'clear',            // +0 chaos
            unit_density: 'normal',      // +0 chaos
            combat_situation: 'ambush'   // +4 chaos
        },
        expectedBalance: 'attacker_favored',
        expectedWinRate: { attacker: 0.8, defender: 0.2 }
    },

    'forest_infantry_melee': {
        description: 'Infantry melee in forest - terrain neutralizes formations',
        attacker: {
            units: [{
                primaryWeapon: { name: 'axe' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'swordsman', level: 'technical' },
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
            formation: 'line'
        },
        conditions: {
            terrain: 'forest',           // +2 chaos
            weather: 'clear',            // +0 chaos
            unit_density: 'normal',      // +0 chaos
            combat_situation: 'prepared' // +0 chaos
        },
        expectedBalance: 'competitive',
        expectedWinRate: { attacker: 0.55, defender: 0.45 }
    },

    // NIGHT BATTLES
    'night_raid': {
        description: 'Night raid - chaos vs preparation',
        attacker: {
            units: [{
                primaryWeapon: { name: 'sword' },
                armor: { name: 'leather' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'swordsman', level: 'expert' },
                quality: { size: 100 }
            }],
            formation: 'loose'
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'militia',
                training: { type: 'spear', level: 'basic' },
                quality: { size: 100 }
            }],
            formation: 'line'
        },
        conditions: {
            terrain: 'plains',              // +0 chaos
            weather: 'clear',               // +0 chaos
            unit_density: 'normal',         // +0 chaos
            combat_situation: 'night_raid', // +3 chaos
            time_of_day: 'night'            // +4 chaos
        },
        expectedBalance: 'high_chaos',
        expectedWinRate: { attacker: 0.6, defender: 0.4 }
    },

    // DIFFERENT UNIT TYPES
    'elite_vs_levy': {
        description: 'Elite veterans vs levy troops on plains',
        attacker: {
            units: [{
                primaryWeapon: { name: 'longsword' },
                armor: { name: 'loricaSegmentata' },
                shields: { name: 'scutum' },
                qualityType: 'veteran_mercenary',
                training: { type: 'swordsman', level: 'expert' },
                quality: { size: 100 }
            }],
            formation: 'line'
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'none' },
                shields: { name: 'buckler' },
                qualityType: 'levy',
                training: { type: 'none', level: 'none' },
                quality: { size: 200 } // Double the numbers
            }],
            formation: 'line'
        },
        conditions: {
            terrain: 'plains',           // +0 chaos
            weather: 'clear',            // +0 chaos
            unit_density: 'normal',      // +0 chaos
            combat_situation: 'prepared' // +0 chaos
        },
        expectedBalance: 'attacker_favored',
        expectedWinRate: { attacker: 0.85, defender: 0.15 }
    },

    'archers_vs_cavalry': {
        description: 'Mounted archers vs heavy cavalry',
        attacker: {
            units: [{
                primaryWeapon: { name: 'compositeBow' },
                armor: { name: 'leather' },
                shields: { name: 'buckler' },
                qualityType: 'professional',
                training: { type: 'archer', level: 'expert' },
                quality: { size: 100 },
                mounted: true
            }],
            formation: 'loose'
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'cataphract' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'cavalry', level: 'expert' },
                quality: { size: 100 },
                mounted: true
            }],
            formation: 'wedge'
        },
        conditions: {
            terrain: 'plains',           // +0 chaos
            weather: 'clear',            // +0 chaos
            unit_density: 'normal',      // +0 chaos
            combat_situation: 'prepared' // +0 chaos
        },
        expectedBalance: 'competitive',
        expectedWinRate: { attacker: 0.45, defender: 0.55 }
    },

    // WEATHER AND TERRAIN COMBINATIONS
    'marsh_storm_battle': {
        description: 'Infantry battle in marsh during thunderstorm',
        attacker: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'leather' },
                shields: { name: 'roundShield' },
                qualityType: 'militia',
                training: { type: 'spear', level: 'basic' },
                quality: { size: 100 }
            }],
            formation: 'line'
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'leather' },
                shields: { name: 'roundShield' },
                qualityType: 'militia',
                training: { type: 'spear', level: 'basic' },
                quality: { size: 100 }
            }],
            formation: 'line'
        },
        conditions: {
            terrain: 'marsh',               // +3 chaos
            weather: 'thunderstorm',        // +3 chaos
            unit_density: 'normal',         // +0 chaos
            combat_situation: 'prepared'    // +0 chaos
        },
        expectedBalance: 'extreme_chaos',
        expectedWinRate: { attacker: 0.4, defender: 0.6 }
    },

    // FLANKING SCENARIOS
    'cavalry_flank_maneuver': {
        description: 'Cavalry flanking infantry line',
        attacker: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'cavalry', level: 'technical' },
                quality: { size: 100 },
                mounted: true
            }],
            formation: 'wedge'
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'sword' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'swordsman', level: 'basic' },
                quality: { size: 100 }
            }],
            formation: 'line'
        },
        conditions: {
            terrain: 'plains',           // +0 chaos
            weather: 'clear',            // +0 chaos
            unit_density: 'normal',      // +0 chaos
            combat_situation: 'flanked'  // Defender penalty
        },
        expectedBalance: 'attacker_favored',
        expectedWinRate: { attacker: 0.75, defender: 0.25 }
    },

    'infantry_flanking_archers': {
        description: 'Infantry flanking archer formation',
        attacker: {
            units: [{
                primaryWeapon: { name: 'sword' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'swordsman', level: 'technical' },
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
            terrain: 'plains',           // +0 chaos
            weather: 'clear',            // +0 chaos
            unit_density: 'normal',      // +0 chaos
            combat_situation: 'flanked'  // Defender penalty
        },
        expectedBalance: 'attacker_favored',
        expectedWinRate: { attacker: 0.8, defender: 0.2 }
    },

    'double_envelopment': {
        description: 'Double envelopment - defender surrounded',
        attacker: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'chainmail' },
                shields: { name: 'roundShield' },
                qualityType: 'professional',
                training: { type: 'spear', level: 'technical' },
                quality: { size: 150 } // More troops for envelopment
            }],
            formation: 'crescent'
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
            formation: 'square' // Defensive formation against encirclement
        },
        conditions: {
            terrain: 'plains',              // +0 chaos
            weather: 'clear',               // +0 chaos
            unit_density: 'dense',          // +1 chaos (troops packed tight)
            combat_situation: 'surrounded'  // Major defender penalty
        },
        expectedBalance: 'attacker_favored',
        expectedWinRate: { attacker: 0.9, defender: 0.1 }
    }
};

/**
 * Run a single battle simulation
 */
async function simulateBattle(scenario, verbose = false) {
    const tacticalContext = {
        turn: Math.floor(Math.random() * 3) + 1 // Random turn 1-3 for variety
    };
    
    try {
        const result = await resolveCombat(
            scenario.attacker,
            scenario.defender, 
            scenario.conditions,
            tacticalContext
        );

        if (verbose) {
            console.log(`Battle Turn ${tacticalContext.turn}:`);
            console.log(`  Chaos: ${result.combatData.chaosLevel} (roll: ${result.combatData.chaosRoll})`);
            console.log(`  Prep: Att ${result.combatData.attackerPreparation.toFixed(1)} vs Def ${result.combatData.defenderPreparation.toFixed(1)}`);
            console.log(`  Damage: Att ${result.combatData.rawDamage.attacker.toFixed(1)} vs Def ${result.combatData.rawDamage.defender.toFixed(1)}`);
            console.log(`  Result: ${result.combatResult.result}`);
        }

        return {
            winner: result.combatResult.result.includes('attacker') ? 'attacker' : 
                   result.combatResult.result.includes('defender') ? 'defender' : 'draw',
            result: result.combatResult.result,
            chaosLevel: result.combatData.chaosLevel,
            rawDamage: result.combatData.rawDamage,
            preparation: {
                attacker: result.combatData.attackerPreparation,
                defender: result.combatData.defenderPreparation
            }
        };
        
    } catch (error) {
        console.error(`Battle simulation failed: ${error.message}`);
        return null;
    }
}

/**
 * Test a single scenario
 */
async function testScenario(scenarioName, scenario, battles = 20) {
    console.log(`\n=== ${scenario.description} ===`);
    console.log(`Expected: ${scenario.expectedBalance} (A:${(scenario.expectedWinRate.attacker*100).toFixed(0)}% D:${(scenario.expectedWinRate.defender*100).toFixed(0)}%)`);
    
    const results = { attacker: 0, defender: 0, draw: 0 };
    let totalChaos = 0;
    let totalPrepDiff = 0;
    
    for (let i = 0; i < battles; i++) {
        const battle = await simulateBattle(scenario, false);
        if (!battle) continue;
        
        results[battle.winner]++;
        totalChaos += battle.chaosLevel;
        totalPrepDiff += Math.abs(battle.preparation.attacker - battle.preparation.defender);
    }
    
    const attackerWinRate = results.attacker / battles;
    const defenderWinRate = results.defender / battles;
    const avgChaos = totalChaos / battles;
    const avgPrepDiff = totalPrepDiff / battles;
    
    console.log(`Results: A:${results.attacker} (${(attackerWinRate*100).toFixed(0)}%) D:${results.defender} (${(defenderWinRate*100).toFixed(0)}%) Draw:${results.draw} (${(results.draw/battles*100).toFixed(0)}%)`);
    console.log(`Avg Chaos: ${avgChaos.toFixed(1)}/10, Avg Prep Diff: ${avgPrepDiff.toFixed(1)}`);
    
    const balanced = attackerWinRate <= 0.8 && defenderWinRate <= 0.8;
    const meetsExpectation = Math.abs(attackerWinRate - scenario.expectedWinRate.attacker) < 0.3;
    
    console.log(`Balanced: ${balanced ? '✅' : '❌'} Expected: ${meetsExpectation ? '✅' : '❌'}`);
    
    return {
        scenarioName,
        attackerWinRate,
        defenderWinRate,
        avgChaos,
        balanced,
        meetsExpectation
    };
}

/**
 * Run comprehensive balance test
 */
async function runComprehensiveTest() {
    console.log('=== COMPREHENSIVE COMBAT BALANCE TEST ===');
    console.log('Testing diverse scenarios: plains, forest, night, different units');
    
    const results = [];
    let balancedCount = 0;
    let expectedCount = 0;
    
    for (const [name, scenario] of Object.entries(COMPREHENSIVE_SCENARIOS)) {
        const result = await testScenario(name, scenario, 25);
        results.push(result);
        
        if (result.balanced) balancedCount++;
        if (result.meetsExpectation) expectedCount++;
    }
    
    console.log('\n=== OVERALL RESULTS ===');
    console.log(`Scenarios tested: ${results.length}`);
    console.log(`Balanced: ${balancedCount}/${results.length} (${(balancedCount/results.length*100).toFixed(0)}%)`);
    console.log(`Met expectations: ${expectedCount}/${results.length} (${(expectedCount/results.length*100).toFixed(0)}%)`);
    
    console.log('\n=== SCENARIO BREAKDOWN ===');
    results.forEach(r => {
        console.log(`${r.scenarioName}: A:${(r.attackerWinRate*100).toFixed(0)}% D:${((1-r.attackerWinRate-results.find(res => res.scenarioName === r.scenarioName)?.drawRate || 0)*100).toFixed(0)}% Chaos:${r.avgChaos.toFixed(1)} ${r.balanced ? '✅' : '❌'}`);
    });
    
    return results;
}

// Export for use
module.exports = {
    COMPREHENSIVE_SCENARIOS,
    simulateBattle,
    testScenario,
    runComprehensiveTest
};

// Run if called directly
if (require.main === module) {
    runComprehensiveTest().catch(console.error);
}