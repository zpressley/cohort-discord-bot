// Debug test to examine stalemate scenarios in detail

const { runBalanceTest, TEST_SCENARIOS } = require('./combatBalanceTest');

console.log('=== STALEMATE ANALYSIS ===\n');

// Test the scenarios that produced 100% draws
const stalemateCandidates = ['cavalryVsInfantry', 'rangedVsMelee'];

stalemateCandidates.forEach(scenarioKey => {
    if (TEST_SCENARIOS[scenarioKey]) {
        const scenario = TEST_SCENARIOS[scenarioKey];
        console.log(`\n=== ${scenario.name} ===`);
        console.log(`Description: ${scenario.description}`);
        
        console.log(`\nArmy 1 (${scenario.army1.culture}):`);
        scenario.army1.units.forEach((unit, i) => {
            console.log(`  Unit ${i}: ${unit.qualityType}, Weapons: ${unit.weapons.join(', ')}, Armor: ${unit.armor}, Shield: ${unit.shield}, Mounted: ${unit.mounted}`);
        });
        
        console.log(`\nArmy 2 (${scenario.army2.culture}):`);
        scenario.army2.units.forEach((unit, i) => {
            console.log(`  Unit ${i}: ${unit.qualityType}, Weapons: ${unit.weapons.join(', ')}, Armor: ${unit.armor}, Shield: ${unit.shield}, Mounted: ${unit.mounted}`);
        });
        
        // Run single test for detailed analysis
        console.log(`\n--- Running single test ---`);
        const result = runBalanceTest(scenario, 1);
        
        if (result.battles.length > 0) {
            const battle = result.battles[0];
            console.log(`Result: ${battle.winner} in ${battle.turns} turns`);
            
            if (battle.log && battle.log.length > 0) {
                console.log(`\nBattle Analysis:`);
                const firstTurn = battle.log[0];
                const lastTurn = battle.log[battle.log.length - 1];
                
                console.log(`Turn 1: Army1 Attack ${firstTurn.army1.attack.toFixed(1)}, Defense ${firstTurn.army1.defense.toFixed(1)}`);
                console.log(`        Army2 Attack ${firstTurn.army2.attack.toFixed(1)}, Defense ${firstTurn.army2.defense.toFixed(1)}`);
                console.log(`        Damage: Army1 takes ${firstTurn.army1.damage.toFixed(1)}, Army2 takes ${firstTurn.army2.damage.toFixed(1)}`);
                
                console.log(`Turn ${lastTurn.turn}: Army1 Remaining ${lastTurn.army1.remaining.toFixed(1)}, Army2 Remaining ${lastTurn.army2.remaining.toFixed(1)}`);
                
                // Calculate damage per turn average
                const totalArmy1Damage = firstTurn.army1.remaining - lastTurn.army1.remaining;
                const totalArmy2Damage = firstTurn.army2.remaining - lastTurn.army2.remaining;
                const avgArmy1DamagePerTurn = totalArmy1Damage / battle.turns;
                const avgArmy2DamagePerTurn = totalArmy2Damage / battle.turns;
                
                console.log(`Average damage per turn: Army1 ${avgArmy1DamagePerTurn.toFixed(2)}, Army2 ${avgArmy2DamagePerTurn.toFixed(2)}`);
                
                // Identify potential stalemate cause
                if (avgArmy1DamagePerTurn < 1 && avgArmy2DamagePerTurn < 1) {
                    console.log(`🔍 STALEMATE CAUSE: Both armies dealing <1 damage/turn - insufficient penetration`);
                } else if (Math.abs(avgArmy1DamagePerTurn - avgArmy2DamagePerTurn) < 0.5) {
                    console.log(`🔍 STALEMATE CAUSE: Nearly equal damage rates - need breakthrough mechanics`);
                } else if (battle.turns >= 15) {
                    console.log(`🔍 STALEMATE CAUSE: Battle timed out - need higher damage multiplier`);
                }
            }
        }
        
        console.log('\n' + '-'.repeat(50));
    }
});

console.log('\n=== STALEMATE SOLUTIONS ===');
console.log('1. Increase casualty multiplier for breakthrough');
console.log('2. Add formation-breaking mechanics');
console.log('3. Add fatigue/morale collapse over time');
console.log('4. Add movement/closing mechanics for ranged vs melee');
console.log('5. Add cavalry charge breakthrough bonuses');