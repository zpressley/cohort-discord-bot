// Debug version of balance test with detailed output
const { runBalanceTest, TEST_SCENARIOS } = require('./combatBalanceTest');

// Run just one scenario with debug output
const scenario = TEST_SCENARIOS.basicProfessional;
console.log('=== DEBUG BALANCE TEST ===');
console.log(`Scenario: ${scenario.name}`);
console.log(`Description: ${scenario.description}`);

// Show army compositions
console.log('\nArmy 1 (Roman Republic):');
scenario.army1.units.forEach((unit, i) => {
    console.log(`  Unit ${i}: ${unit.qualityType}, Weapons: ${unit.weapons.join(', ')}, Armor: ${unit.armor}, Shield: ${unit.shield}, Mounted: ${unit.mounted}`);
});

console.log('\nArmy 2 (Celtic Tribes):');
scenario.army2.units.forEach((unit, i) => {
    console.log(`  Unit ${i}: ${unit.qualityType}, Weapons: ${unit.weapons.join(', ')}, Armor: ${unit.armor}, Shield: ${unit.shield}, Mounted: ${unit.mounted}`);
});

// Run the test with just 1 iteration
console.log('\n=== Running 1 test iteration ===');
const result = runBalanceTest(scenario, 1);

console.log('\n=== Battle Details ===');
if (result.battles.length > 0) {
    const battle = result.battles[0];
    console.log(`Winner: ${battle.winner}`);
    console.log(`Turns: ${battle.turns}`);
    
    if (battle.log && battle.log.length > 0) {
        console.log('\nTurn-by-turn log:');
        battle.log.forEach((turn, i) => {
            if (i < 5 || i >= battle.log.length - 5) { // Show first and last 5 turns
                console.log(`Turn ${turn.turn}: Chaos ${turn.chaos}`);
                console.log(`  Army1: Attack ${turn.army1.attack.toFixed(1)}, Defense ${turn.army1.defense.toFixed(1)}, Damage ${turn.army1.damage.toFixed(1)}, Remaining ${turn.army1.remaining.toFixed(1)}`);
                console.log(`  Army2: Attack ${turn.army2.attack.toFixed(1)}, Defense ${turn.army2.defense.toFixed(1)}, Damage ${turn.army2.damage.toFixed(1)}, Remaining ${turn.army2.remaining.toFixed(1)}`);
            } else if (i === 5) {
                console.log('  ... [middle turns omitted] ...');
            }
        });
    }
}

console.log('\n=== Summary ===');
const metrics = result.balanceMetrics;
console.log(`Army 1 Win Rate: ${(metrics.army1WinRate * 100).toFixed(1)}%`);
console.log(`Army 2 Win Rate: ${(metrics.army2WinRate * 100).toFixed(1)}%`);
console.log(`Draw Rate: ${(metrics.drawRate * 100).toFixed(1)}%`);
console.log(`Balance Score: ${(metrics.balanceScore * 100).toFixed(1)}%`);