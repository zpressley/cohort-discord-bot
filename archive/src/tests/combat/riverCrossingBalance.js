// src/game/combat/tests/riverCrossingBalance.js
// River Crossing Balance Testing Framework
// Tests Combat System v2.0 balance using approved river crossing scenarios
// Target: 80% competitive threshold (neither side wins >80% of time)
// 
// Version: 1.0.0
// Created: 2025-10-20

const { resolveCombat } = require('../../../game/battleEngine');

/**
 * River Crossing Scenario Definitions
 * Based on historical river crossing battles for balance testing
 */
const RIVER_CROSSING_SCENARIOS = {
    // Basic scenarios - similar forces, different tactical positions
    'equal_forces_defender_advantage': {
        description: 'Equal forces, defender has fortified river crossing',
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
            formation: 'phalanx'
        },
        conditions: {
            terrain: 'marsh',        // +2 chaos
            weather: 'clear',        // +0 chaos
            unit_density: 'normal',  // +0 chaos
            combat_situation: 'river_crossing' // +2 chaos
        },
        expectedBalance: 'defender_favored', // Defender should win 60-70% due to position
        expectedWinRate: { attacker: 0.3, defender: 0.7 }
    },

    'professional_vs_militia': {
        description: 'Professional attackers vs militia defenders at river crossing',
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
                primaryWeapon: { name: 'spear' },
                armor: { name: 'leather' },
                shields: { name: 'roundShield' },
                qualityType: 'militia',
                training: { type: 'spear', level: 'basic' },
                quality: { size: 100 }
            }],
            formation: 'phalanx'
        },
        conditions: {
            terrain: 'plains',       // +0 chaos
            weather: 'clear',        // +0 chaos  
            unit_density: 'normal',  // +0 chaos
            combat_situation: 'river_crossing' // +2 chaos
        },
        expectedBalance: 'competitive', // Should be close due to training vs position
        expectedWinRate: { attacker: 0.55, defender: 0.45 }
    },

    'cavalry_crossing_attempt': {
        description: 'Cavalry attempting river crossing vs spear wall',
        attacker: {
            units: [{
                primaryWeapon: { name: 'spear' }, // Cavalry spear
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
            terrain: 'marsh',        // +2 chaos (muddy crossing)
            weather: 'clear',        // +0 chaos
            unit_density: 'normal',  // +0 chaos
            combat_situation: 'river_crossing' // +2 chaos
        },
        expectedBalance: 'defender_favored', // Pike wall should counter cavalry
        expectedWinRate: { attacker: 0.25, defender: 0.75 }
    },

    'elite_vs_levy_crossing': {
        description: 'Elite forces crossing against levy troops',
        attacker: {
            units: [{
                primaryWeapon: { name: 'longsword' },
                armor: { name: 'loricaSegmentata' },
                shields: { name: 'scutum' },
                qualityType: 'veteran_mercenary',
                training: { type: 'swordsman', level: 'expert' },
                quality: { size: 100 }
            }],
            formation: 'testudo'
        },
        defender: {
            units: [{
                primaryWeapon: { name: 'spear' },
                armor: { name: 'none' },
                shields: { name: 'buckler' },
                qualityType: 'levy',
                training: { type: 'none', level: 'none' },
                quality: { size: 150 } // More troops but lower quality
            }],
            formation: 'line'
        },
        conditions: {
            terrain: 'plains',       // +0 chaos
            weather: 'light_rain',   // +1 chaos
            unit_density: 'normal',  // +0 chaos
            combat_situation: 'river_crossing' // +2 chaos
        },
        expectedBalance: 'attacker_favored', // Elite should overcome numbers
        expectedWinRate: { attacker: 0.8, defender: 0.2 }
    },

    'balanced_heavy_infantry': {
        description: 'Balanced heavy infantry engagement at river crossing',
        attacker: {
            units: [{
                primaryWeapon: { name: 'axe' },
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
                armor: { name: 'scale' },
                shields: { name: 'scutum' },
                qualityType: 'professional',
                training: { type: 'swordsman', level: 'technical' },
                quality: { size: 100 }
            }],
            formation: 'shield_wall'
        },
        conditions: {
            terrain: 'forest',       // +2 chaos
            weather: 'clear',        // +0 chaos
            unit_density: 'normal',  // +0 chaos
            combat_situation: 'river_crossing' // +2 chaos
        },
        expectedBalance: 'competitive', // Should be very close
        expectedWinRate: { attacker: 0.45, defender: 0.55 }
    }
};

/**
 * Cheese Strategy Detection
 * Identify potentially unbalanced strategies
 */
const CHEESE_STRATEGIES = {
    // Strategy definitions for detection
    'overwhelming_elite': {
        description: 'Elite units with maxed equipment dominating everything',
        detect: (force) => {
            const hasEliteQuality = force.units.some(u => 
                u.qualityType === 'veteran_mercenary' || u.qualityType === 'elite_guard'
            );
            const hasTopTierEquipment = force.units.some(u => 
                u.armor?.name === 'loricaSegmentata' || u.armor?.name === 'cataphract'
            );
            return hasEliteQuality && hasTopTierEquipment;
        },
        threshold: 0.9 // Wins >90% of battles
    },

    'mass_levy_spam': {
        description: 'Overwhelming numbers of cheap levy troops',
        detect: (force) => {
            const totalSize = force.units.reduce((sum, u) => sum + (u.quality?.size || 100), 0);
            const isLevyMajority = force.units.filter(u => u.qualityType === 'levy').length > force.units.length / 2;
            return totalSize > 300 && isLevyMajority;
        },
        threshold: 0.85
    },

    'invincible_defense': {
        description: 'Defensive formation that never loses',
        detect: (force) => {
            const hasMaxDefense = force.units.some(u => 
                u.armor?.name === 'combined' && u.shields?.name === 'towerShield'
            );
            const isDefensiveFormation = ['phalanx', 'testudo', 'shield_wall'].includes(force.formation);
            return hasMaxDefense && isDefensiveFormation;
        },
        threshold: 0.95
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
            console.log(`  Damage: Att ${result.combatData.rawDamage.attacker} vs Def ${result.combatData.rawDamage.defender}`);
            console.log(`  Casualties: Att ${result.casualties.attacker.total} vs Def ${result.casualties.defender.total}`);
            console.log(`  Result: ${result.combatResult.result}`);
        }

        return {
            winner: result.combatResult.result.includes('attacker') ? 'attacker' : 
                   result.combatResult.result.includes('defender') ? 'defender' : 'draw',
            result: result.combatResult.result,
            intensity: result.combatResult.intensity,
            attackerCasualties: result.casualties.attacker.total,
            defenderCasualties: result.casualties.defender.total,
            chaosLevel: result.combatData.chaosLevel,
            rawDamage: result.combatData.rawDamage
        };
        
    } catch (error) {
        console.error(`Battle simulation failed: ${error.message}`);
        return null;
    }
}

/**
 * Run balance test for a scenario
 */
async function runScenarioBalance(scenarioName, scenario, iterations = 50) {
    console.log(`\n=== Testing: ${scenario.description} ===`);
    console.log(`Expected: ${scenario.expectedBalance} (A:${scenario.expectedWinRate.attacker*100}% D:${scenario.expectedWinRate.defender*100}%)`);
    
    const results = {
        attacker_wins: 0,
        defender_wins: 0,
        draws: 0,
        battles: [],
        cheese_detected: false
    };
    
    for (let i = 0; i < iterations; i++) {
        const battle = await simulateBattle(scenario, false);
        if (!battle) continue;
        
        results.battles.push(battle);
        
        switch (battle.winner) {
            case 'attacker': results.attacker_wins++; break;
            case 'defender': results.defender_wins++; break;
            default: results.draws++; break;
        }
    }
    
    const total = results.attacker_wins + results.defender_wins + results.draws;
    const attackerWinRate = results.attacker_wins / total;
    const defenderWinRate = results.defender_wins / total;
    
    // Check for cheese strategies
    const attackerCheese = detectCheeseStrategies(scenario.attacker, attackerWinRate);
    const defenderCheese = detectCheeseStrategies(scenario.defender, defenderWinRate);
    
    if (attackerCheese.length > 0 || defenderCheese.length > 0) {
        results.cheese_detected = true;
        results.cheese_strategies = [...attackerCheese, ...defenderCheese];
    }
    
    // Check balance (neither side >80% win rate)
    const isBalanced = attackerWinRate <= 0.8 && defenderWinRate <= 0.8;
    const meetsExpectation = Math.abs(attackerWinRate - scenario.expectedWinRate.attacker) < 0.2;
    
    console.log(`Results after ${total} battles:`);
    console.log(`  Attacker wins: ${results.attacker_wins} (${(attackerWinRate*100).toFixed(1)}%)`);
    console.log(`  Defender wins: ${results.defender_wins} (${(defenderWinRate*100).toFixed(1)}%)`);
    console.log(`  Draws: ${results.draws} (${(results.draws/total*100).toFixed(1)}%)`);
    console.log(`  Balanced: ${isBalanced ? '✅' : '❌'} (neither >80%)`);
    console.log(`  Expected: ${meetsExpectation ? '✅' : '❌'} (within 20% of prediction)`);
    
    if (results.cheese_detected) {
        console.log(`  🧀 CHEESE DETECTED:`);
        results.cheese_strategies.forEach(cheese => {
            console.log(`    - ${cheese}`);
        });
    }
    
    return {
        scenario: scenarioName,
        attackerWinRate,
        defenderWinRate,
        drawRate: results.draws / total,
        isBalanced,
        meetsExpectation,
        cheeseDetected: results.cheese_detected,
        cheeseStrategies: results.cheese_strategies || [],
        battleDetails: results.battles
    };
}

/**
 * Detect cheese strategies
 */
function detectCheeseStrategies(force, winRate) {
    const detectedCheese = [];
    
    Object.entries(CHEESE_STRATEGIES).forEach(([strategyName, strategy]) => {
        if (strategy.detect(force) && winRate >= strategy.threshold) {
            detectedCheese.push(`${strategy.description} (${(winRate*100).toFixed(1)}% win rate)`);
        }
    });
    
    return detectedCheese;
}

/**
 * Run full balance test suite
 */
async function runFullBalanceTest() {
    console.log('=== Combat System v2.0 Balance Testing ===');
    console.log('Target: 80% competitive threshold (no strategy >80% win rate)');
    console.log('River Crossing scenarios for tactical variety\n');
    
    const results = [];
    let totalTests = 0;
    let balancedTests = 0;
    let accurateTests = 0;
    let cheeseDetected = 0;
    
    for (const [scenarioName, scenario] of Object.entries(RIVER_CROSSING_SCENARIOS)) {
        const result = await runScenarioBalance(scenarioName, scenario, 100);
        results.push(result);
        
        totalTests++;
        if (result.isBalanced) balancedTests++;
        if (result.meetsExpectation) accurateTests++;
        if (result.cheeseDetected) cheeseDetected++;
    }
    
    console.log('\n\n=== Balance Test Summary ===');
    console.log(`Total scenarios tested: ${totalTests}`);
    console.log(`Balanced scenarios: ${balancedTests}/${totalTests} (${(balancedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`Accurate predictions: ${accurateTests}/${totalTests} (${(accurateTests/totalTests*100).toFixed(1)}%)`);
    console.log(`Cheese strategies found: ${cheeseDetected}`);
    
    const overallBalance = balancedTests / totalTests;
    const passingGrade = overallBalance >= 0.8;
    
    console.log(`\nOverall Balance Grade: ${(overallBalance*100).toFixed(1)}%`);
    console.log(`Status: ${passingGrade ? '✅ PASSED' : '❌ NEEDS WORK'} (Target: 80%+)`);
    
    if (cheeseDetected > 0) {
        console.log('\n🧀 Cheese Strategies Detected:');
        results.forEach(result => {
            if (result.cheeseDetected) {
                console.log(`  ${result.scenario}:`);
                result.cheeseStrategies.forEach(cheese => {
                    console.log(`    - ${cheese}`);
                });
            }
        });
    }
    
    return {
        totalTests,
        balancedTests,
        accurateTests,
        cheeseDetected,
        overallBalance,
        passingGrade,
        results
    };
}

/**
 * Quick balance check for debugging
 */
async function quickBalanceCheck(scenarioName = 'balanced_heavy_infantry', iterations = 10) {
    console.log(`=== Quick Balance Check: ${scenarioName} ===`);
    
    const scenario = RIVER_CROSSING_SCENARIOS[scenarioName];
    if (!scenario) {
        console.log('Scenario not found!');
        return;
    }
    
    console.log(`Testing ${iterations} battles...`);
    
    for (let i = 0; i < iterations; i++) {
        const battle = await simulateBattle(scenario, true);
        console.log(`Battle ${i+1}: ${battle?.winner || 'error'} (${battle?.result || 'failed'})`);
    }
}

// Export functions
module.exports = {
    RIVER_CROSSING_SCENARIOS,
    CHEESE_STRATEGIES,
    simulateBattle,
    runScenarioBalance,
    runFullBalanceTest,
    quickBalanceCheck
};

// Run full test if called directly
if (require.main === module) {
    runFullBalanceTest().then(results => {
        console.log('\nBalance testing complete!');
    }).catch(error => {
        console.error('Balance testing failed:', error);
    });
}
