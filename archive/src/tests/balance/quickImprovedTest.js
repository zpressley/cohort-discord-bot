// Quick test of improved balance framework

const { runBalanceTest, TEST_SCENARIOS } = require('./combatBalanceTest');
const { detectAutowins, calculateScenarioDiversity } = require('./improvedBalanceFramework');

console.log('=== QUICK IMPROVED BALANCE TEST ===\n');

// Test one scenario
const scenario = TEST_SCENARIOS.basicProfessional;
console.log(`Testing: ${scenario.name}`);
console.log(`Running 10 iterations for quick check...`);

const result = runBalanceTest(scenario, 10);
console.log(`Result: Army 1 ${(result.balanceMetrics.army1WinRate * 100).toFixed(1)}% wins, Army 2 ${(result.balanceMetrics.army2WinRate * 100).toFixed(1)}% wins, ${(result.balanceMetrics.drawRate * 100).toFixed(1)}% draws`);

// Test improved metrics
const testResults = [{
    scenario: scenario.name,
    culture1: scenario.army1.culture,
    culture2: scenario.army2.culture, 
    culture1WinRate: result.balanceMetrics.army1WinRate,
    culture2WinRate: result.balanceMetrics.army2WinRate,
    drawRate: result.balanceMetrics.drawRate
}];

const autowiNs = detectAutowins(testResults);
console.log(`Auto-wins detected: ${autowiNs.count}`);

const romanDiversity = calculateScenarioDiversity('Roman Republic', testResults);
console.log(`Roman diversity: ${romanDiversity.score}/${romanDiversity.threshold} scenarios`);

const celticDiversity = calculateScenarioDiversity('Celtic Tribes', testResults);
console.log(`Celtic diversity: ${celticDiversity.score}/${celticDiversity.threshold} scenarios`);

console.log('\n✅ Quick test completed successfully!');