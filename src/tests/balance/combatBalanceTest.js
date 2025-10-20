// Combat Balance Testing Framework for Combat System v2.0
// Tests for realistic + fun balance with 80% competitive threshold

const { resolveCombat } = require('../../game/battleEngine');
const { calculateAttackRating } = require('../../game/combat/attackRatings');
const { calculateDefenseRating } = require('../../game/combat/defenseRatings');
const { calculateChaosLevel } = require('../../game/combat/chaosCalculator');
const { calculatePreparation } = require('../../game/combat/preparationCalculator');
const { applyBreakthroughMechanics } = require('../../game/combat/breakthroughMechanics');
const { RIVER_CROSSING_MAP, initializeDeployment } = require('../../game/maps/riverCrossing');
const { TROOP_QUALITY, LIGHT_WEAPONS, MEDIUM_WEAPONS, HEAVY_WEAPONS, LIGHT_RANGED, MEDIUM_RANGED, ARMOR_CATEGORIES, SHIELD_OPTIONS } = require('../../game/armyData');

// Balance testing configuration
const BALANCE_CONFIG = {
    competitiveThreshold: 0.80, // 80% threshold for balance
    testIterations: 100, // Number of simulation runs per scenario
    maxTotalStrengthRatio: 1.5, // Max acceptable strength imbalance
    cheeseDetectionThreshold: 0.95 // Win rate threshold for cheese detection
};

// Test scenarios for River Crossing map
const TEST_SCENARIOS = {
    basicProfessional: {
        name: 'Roman Professional vs Celtic Warriors',
        description: 'Balanced professional troops engagement',
        army1: {
            culture: 'Roman Republic',
            units: [
                createTestUnit('professional', ['roman_gladius'], 'medium_armor', 'medium_shield', false),
                createTestUnit('professional', ['roman_pilum', 'roman_pugio'], 'medium_armor', 'medium_shield', false),
                createTestUnit('professional', ['spear_professional'], 'light_armor', 'heavy_shield', false)
            ]
        },
        army2: {
            culture: 'Celtic Tribes', 
            units: [
                createTestUnit('tribal_warriors', ['celtic_longsword'], 'light_armor', 'medium_shield', false),
                createTestUnit('tribal_warriors', ['battle_axe'], 'light_armor', 'light_shield', false),
                createTestUnit('tribal_warriors', ['spear_basic'], 'no_armor', 'medium_shield', false)
            ]
        }
    },
    
    cavalryVsInfantry: {
        name: 'Sarmatian Cavalry vs Macedonian Phalanx',
        description: 'Mobile cavalry against defensive formation',
        army1: {
            culture: 'Sarmatian Confederations',
            units: [
                createTestUnit('professional', ['sword_standard'], 'medium_armor', 'light_shield', true),
                createTestUnit('professional', ['mace'], 'light_armor', 'light_shield', true),
                createTestUnit('veteran_mercenary', ['sword_standard'], 'heavy_armor', 'medium_shield', true)
            ]
        },
        army2: {
            culture: 'Macedonian Kingdoms',
            units: [
                createTestUnit('professional', ['macedonian_sarissa'], 'medium_armor', 'no_shield', false),
                createTestUnit('professional', ['macedonian_sarissa'], 'medium_armor', 'no_shield', false),
                createTestUnit('professional', ['greek_xiphos'], 'heavy_armor', 'medium_shield', false)
            ]
        }
    },

    rangedVsMelee: {
        name: 'Han Crossbows vs Germanic Heavy Infantry',
        description: 'Ranged dominance versus heavy melee',
        army1: {
            culture: 'Han Dynasty',
            units: [
                createTestUnit('professional', ['han_chinese_crossbow', 'chinese_dao'], 'light_armor', 'medium_shield', false),
                createTestUnit('professional', ['han_chinese_crossbow', 'daggers'], 'light_armor', 'light_shield', false),
                createTestUnit('militia', ['self_bow_professional', 'daggers'], 'light_armor', 'light_shield', false)
            ]
        },
        army2: {
            culture: 'Germanic Tribes',
            units: [
                createTestUnit('professional', ['germanic_framea'], 'heavy_armor', 'no_shield', false),
                createTestUnit('tribal_warriors', ['great_axe'], 'medium_armor', 'no_shield', false),
                createTestUnit('tribal_warriors', ['battle_axe'], 'medium_armor', 'medium_shield', false)
            ]
        }
    },

    eliteVsNumbers: {
        name: 'Roman Veterans vs Celtic Levy Swarm',
        description: 'Quality versus quantity balance',
        army1: {
            culture: 'Roman Republic',
            units: [
                createTestUnit('veteran_mercenary', ['roman_gladius'], 'heavy_armor', 'medium_shield', false),
                createTestUnit('veteran_mercenary', ['roman_pilum', 'roman_pugio'], 'heavy_armor', 'medium_shield', false)
            ]
        },
        army2: {
            culture: 'Celtic Tribes',
            units: [
                createTestUnit('levy', ['spear_basic'], 'light_armor', 'light_shield', false),
                createTestUnit('levy', ['clubs'], 'no_armor', 'light_shield', false),
                createTestUnit('levy', ['sickle'], 'light_armor', 'no_shield', false),
                createTestUnit('tribal_warriors', ['battle_axe'], 'light_armor', 'medium_shield', false)
            ]
        }
    }
};

// Cheese strategies to detect
const CHEESE_STRATEGIES = {
    heavyArmorSpam: {
        name: 'Heavy Armor Spam',
        description: 'All units in maximum armor',
        detectFn: (army) => army.units.every(u => u.armor === 'heavy_armor')
    },
    
    rangedOnlyArmy: {
        name: 'Pure Ranged Army',
        description: 'No melee capabilities',
        detectFn: (army) => army.units.every(u => u.weapons.every(w => w.range))
    },
    
    eliteSpam: {
        name: 'All Elite Units',
        description: 'Only veteran mercenary quality',
        detectFn: (army) => army.units.every(u => u.qualityType === 'veteran_mercenary')
    },
    
    twoHandedSpam: {
        name: 'Two-Handed Weapon Spam',
        description: 'All units with two-handed weapons, no defense',
        detectFn: (army) => army.units.every(u => u.shield === 'no_shield' && u.weapons.some(w => w.stacking === 'two_handed'))
    }
};

function createTestUnit(qualityType, weaponNames, armorType, shieldType, mounted) {
    const quality = TROOP_QUALITY[qualityType];
    const armor = ARMOR_CATEGORIES[armorType];
    const shield = SHIELD_OPTIONS[shieldType];
    
    return {
        unitId: `test_${qualityType}_${Date.now()}_${Math.random()}`,
        qualityType,
        quality,
        weapons: weaponNames, // Store as simple string array
        armor: armorType, // Store as string
        shield: shieldType, // Store as string
        mounted,
        currentStrength: quality.size,
        maxStrength: quality.size,
        position: 'A1', // Will be set by deployment
        isCommander: false,
        veteranLevel: 0,
        training: {
            archer: { level: 'Basic' },
            swordsman: { level: 'Basic' },
            spear: { level: 'Basic' },
            cavalry: { level: 'Basic' }
        }
    };
}

function initializeRiverCrossingBattle(scenario) {
    const army1Units = initializeDeployment('north', scenario.army1.units);
    const army2Units = initializeDeployment('south', scenario.army2.units);
    
    return {
        scenario: scenario.name,
        description: scenario.description,
        map: RIVER_CROSSING_MAP,
        army1: {
            culture: scenario.army1.culture,
            units: army1Units,
            formation: 'offensive', // Start aggressive
            totalStrength: army1Units.reduce((sum, u) => sum + u.currentStrength, 0)
        },
        army2: {
            culture: scenario.army2.culture,
            units: army2Units,
            formation: 'defensive', // Start defensive
            totalStrength: army2Units.reduce((sum, u) => sum + u.currentStrength, 0)
        },
        turn: 1,
        weather: 'clear',
        timeOfDay: 'day'
    };
}

function runBalanceTest(scenario, iterations = BALANCE_CONFIG.testIterations) {
    console.log(`\n=== Running Balance Test: ${scenario.name} ===`);
    console.log(`Description: ${scenario.description}`);
    console.log(`Iterations: ${iterations}\n`);
    
    const results = {
        army1Wins: 0,
        army2Wins: 0,
        draws: 0,
        battles: [],
        cheeseDetected: [],
        balanceMetrics: {}
    };
    
    for (let i = 0; i < iterations; i++) {
        const battle = initializeRiverCrossingBattle(scenario);
        const battleResult = simulateBattle(battle);
        
        results.battles.push(battleResult);
        
        if (battleResult.winner === 'army1') results.army1Wins++;
        else if (battleResult.winner === 'army2') results.army2Wins++;
        else results.draws++;
        
        // Check for cheese strategies
        const cheeseArmy1 = detectCheeseStrategies(battle.army1);
        const cheeseArmy2 = detectCheeseStrategies(battle.army2);
        
        if (cheeseArmy1.length > 0) results.cheeseDetected.push({ army: 'army1', strategies: cheeseArmy1, battle: i });
        if (cheeseArmy2.length > 0) results.cheeseDetected.push({ army: 'army2', strategies: cheeseArmy2, battle: i });
    }
    
    // Calculate balance metrics
    results.balanceMetrics = calculateBalanceMetrics(results);
    
    return results;
}

function simulateBattle(battle) {
    let turn = 1;
    const maxTurns = 15;
    const battleLog = [];
    const damageHistory = [];
    
    while (turn <= maxTurns) {
        // Calculate chaos for this turn
        const chaosResult = calculateChaosLevel({
            weather: battle.weather,
            time_of_day: battle.timeOfDay,
            terrain: 'plains', // Start with plains terrain
            unit_density: calculateUnitDensityString(battle),
            formation_state: 'intact',
            command_state: 'coordinated'
        });
        
        const chaos = chaosResult.chaosLevel;
        
        // Calculate base combat values
        let army1TotalAttack = calculateArmyTotalAttack(battle.army1, chaos);
        let army1TotalDefense = calculateArmyTotalDefense(battle.army1, chaos);
        let army2TotalAttack = calculateArmyTotalAttack(battle.army2, chaos);
        let army2TotalDefense = calculateArmyTotalDefense(battle.army2, chaos);
        
        // Apply breakthrough mechanics
        const breakthrough = applyBreakthroughMechanics(battle.army1, battle.army2, {
            turn,
            damageHistory,
            map: battle.map
        });
        
        if (breakthrough.breakthroughApplied) {
            army1TotalAttack *= breakthrough.effects.attackingArmy.attackMultiplier;
            army2TotalAttack *= breakthrough.effects.defendingArmy.attackMultiplier;
        }
        
        // Resolve mutual combat
        const army1Damage = Math.max(0, army2TotalAttack - army1TotalDefense);
        const army2Damage = Math.max(0, army1TotalAttack - army2TotalDefense);
        
        // Store damage history for breakthrough detection
        damageHistory.push({
            turn,
            army1Damage,
            army2Damage,
            totalDamage: army1Damage + army2Damage
        });
        
        // Apply casualties
        battle.army1.totalStrength = Math.max(0, battle.army1.totalStrength - army1Damage);
        battle.army2.totalStrength = Math.max(0, battle.army2.totalStrength - army2Damage);
        
        battleLog.push({
            turn,
            chaos,
            breakthrough: breakthrough.breakthroughApplied,
            breakthroughMultipliers: breakthrough.breakthroughApplied ? {
                army1: breakthrough.effects.attackingArmy.attackMultiplier,
                army2: breakthrough.effects.defendingArmy.attackMultiplier
            } : null,
            army1: { attack: army1TotalAttack, defense: army1TotalDefense, damage: army1Damage, remaining: battle.army1.totalStrength },
            army2: { attack: army2TotalAttack, defense: army2TotalDefense, damage: army2Damage, remaining: battle.army2.totalStrength }
        });
        
        // Check victory conditions
        if (battle.army1.totalStrength <= 0 && battle.army2.totalStrength <= 0) {
            return { winner: 'draw', turns: turn, log: battleLog };
        } else if (battle.army1.totalStrength <= 0) {
            return { winner: 'army2', turns: turn, log: battleLog };
        } else if (battle.army2.totalStrength <= 0) {
            return { winner: 'army1', turns: turn, log: battleLog };
        }
        
        turn++;
    }
    
    // Determine winner by remaining strength
    if (battle.army1.totalStrength > battle.army2.totalStrength) {
        return { winner: 'army1', turns: maxTurns, log: battleLog };
    } else if (battle.army2.totalStrength > battle.army1.totalStrength) {
        return { winner: 'army2', turns: maxTurns, log: battleLog };
    } else {
        return { winner: 'draw', turns: maxTurns, log: battleLog };
    }
}

function calculateArmyTotalAttack(army, chaos) {
    let totalAttack = 0;
    
    army.units.forEach(unit => {
        if (unit.currentStrength > 0) {
            // Calculate base attack using unit structure
            const attackUnit = {
                weapons: unit.weapons,
                quality: unit.qualityType,
                formation: army.formation
            };
            const baseAttack = calculateAttackRating(attackUnit, { terrain: 'mixed' });
            
            const preparationResult = calculatePreparation({
                ...unit,
                formation: army.formation
            }, {}, army.culture);
            const preparation = preparationResult.preparationLevel;
            const chaosModifier = Math.max(1, chaos - preparation);
            
            // Apply chaos as multiplicative penalty, but ensure minimum damage
            const effectiveAttack = Math.max(1, baseAttack * (1 - (chaosModifier * 0.05)));
            totalAttack += effectiveAttack * (unit.currentStrength / unit.maxStrength);
        }
    });
    
    return Math.max(1, totalAttack);
}

function calculateArmyTotalDefense(army, chaos) {
    let totalDefense = 0;
    
    army.units.forEach(unit => {
        if (unit.currentStrength > 0) {
            // Calculate base defense using unit structure
            const defenseUnit = {
                armor: unit.armor,
                shield: unit.shield,
                quality: unit.qualityType,
                formation: army.formation
            };
            const baseDefense = calculateDefenseRating(defenseUnit, { terrain: 'mixed' });
            
            const preparationResult = calculatePreparation({
                ...unit,
                formation: army.formation
            }, {}, army.culture);
            const preparation = preparationResult.preparationLevel;
            const chaosModifier = Math.max(1, chaos - preparation);
            
            // Apply chaos as multiplicative penalty
            const effectiveDefense = Math.max(0, baseDefense * (1 - (chaosModifier * 0.05)));
            totalDefense += effectiveDefense * (unit.currentStrength / unit.maxStrength);
        }
    });
    
    return Math.max(0, totalDefense);
}

function calculateUnitDensity(battle) {
    const totalUnits = battle.army1.units.length + battle.army2.units.length;
    const mapSize = 20 * 20; // River crossing map size
    return totalUnits / mapSize;
}

function calculateUnitDensityString(battle) {
    const totalWarriors = battle.army1.totalStrength + battle.army2.totalStrength;
    
    if (totalWarriors < 200) return 'sparse';
    else if (totalWarriors < 400) return 'normal';
    else if (totalWarriors < 600) return 'dense';
    else if (totalWarriors < 800) return 'compressed';
    else return 'crush';
}

function detectCheeseStrategies(army) {
    const detectedCheese = [];
    
    Object.entries(CHEESE_STRATEGIES).forEach(([key, strategy]) => {
        if (strategy.detectFn(army)) {
            detectedCheese.push({
                name: strategy.name,
                description: strategy.description
            });
        }
    });
    
    return detectedCheese;
}

function calculateBalanceMetrics(results) {
    const totalBattles = results.battles.length;
    const army1WinRate = results.army1Wins / totalBattles;
    const army2WinRate = results.army2Wins / totalBattles;
    const drawRate = results.draws / totalBattles;
    
    // Balance score (closer to 0.5 is better)
    const balanceScore = 1 - Math.abs(army1WinRate - 0.5) * 2;
    
    // Competitive threshold check
    const isCompetitive = balanceScore >= BALANCE_CONFIG.competitiveThreshold;
    
    // Average battle length
    const avgBattleLength = results.battles.reduce((sum, battle) => sum + battle.turns, 0) / totalBattles;
    
    // Cheese detection rate
    const cheeseRate = results.cheeseDetected.length / (totalBattles * 2); // 2 armies per battle
    
    return {
        army1WinRate,
        army2WinRate,
        drawRate,
        balanceScore,
        isCompetitive,
        avgBattleLength,
        cheeseRate,
        totalCheese: results.cheeseDetected.length
    };
}

function generateBalanceReport(scenarioResults) {
    console.log('\n' + '='.repeat(60));
    console.log('         COMBAT SYSTEM v2.0 BALANCE REPORT');
    console.log('='.repeat(60));
    
    scenarioResults.forEach(result => {
        const metrics = result.balanceMetrics;
        
        console.log(`\n--- ${result.scenario} ---`);
        console.log(`Army 1 Win Rate: ${(metrics.army1WinRate * 100).toFixed(1)}%`);
        console.log(`Army 2 Win Rate: ${(metrics.army2WinRate * 100).toFixed(1)}%`);
        console.log(`Draw Rate: ${(metrics.drawRate * 100).toFixed(1)}%`);
        console.log(`Balance Score: ${(metrics.balanceScore * 100).toFixed(1)}%`);
        console.log(`Competitive: ${metrics.isCompetitive ? '✓ PASS' : '✗ FAIL'} (${BALANCE_CONFIG.competitiveThreshold * 100}% threshold)`);
        console.log(`Avg Battle Length: ${metrics.avgBattleLength.toFixed(1)} turns`);
        
        if (result.cheeseDetected.length > 0) {
            console.log(`⚠️  Cheese Strategies Detected: ${result.cheeseDetected.length}`);
            const uniqueCheese = [...new Set(result.cheeseDetected.map(c => c.strategies.map(s => s.name)).flat())];
            console.log(`   Types: ${uniqueCheese.join(', ')}`);
        } else {
            console.log('✓ No cheese strategies detected');
        }
    });
    
    // Overall summary
    const overallBalance = scenarioResults.reduce((sum, r) => sum + r.balanceMetrics.balanceScore, 0) / scenarioResults.length;
    const competitiveScenarios = scenarioResults.filter(r => r.balanceMetrics.isCompetitive).length;
    
    console.log('\n' + '='.repeat(60));
    console.log('OVERALL BALANCE SUMMARY');
    console.log('='.repeat(60));
    console.log(`Average Balance Score: ${(overallBalance * 100).toFixed(1)}%`);
    console.log(`Competitive Scenarios: ${competitiveScenarios}/${scenarioResults.length}`);
    console.log(`System Status: ${competitiveScenarios === scenarioResults.length ? '✓ BALANCED' : '⚠️  NEEDS TUNING'}`);
}

// Main test runner
async function runAllBalanceTests() {
    console.log('Starting Combat System v2.0 Balance Testing...\n');
    
    const results = [];
    
    for (const [key, scenario] of Object.entries(TEST_SCENARIOS)) {
        const result = runBalanceTest(scenario, BALANCE_CONFIG.testIterations);
        result.scenario = scenario.name;
        results.push(result);
        
        // Brief progress update
        const metrics = result.balanceMetrics;
        console.log(`${scenario.name}: Balance ${(metrics.balanceScore * 100).toFixed(1)}% ${metrics.isCompetitive ? '✓' : '✗'}`);
    }
    
    generateBalanceReport(results);
    
    return results;
}

module.exports = {
    runAllBalanceTests,
    runBalanceTest,
    TEST_SCENARIOS,
    BALANCE_CONFIG,
    CHEESE_STRATEGIES,
    generateBalanceReport
};