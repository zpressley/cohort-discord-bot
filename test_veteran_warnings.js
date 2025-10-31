// test_veteran_warnings.js
// Test veteran warning system

const { checkCulturalViolations } = require('./src/game/officers/culturalTraditions');
const { detectTacticalRisks } = require('./src/game/officers/veteranWarnings');

console.log('=== TESTING VETERAN WARNING SYSTEM ===\n');

// Test 1: Spartan retreat warning
console.log('TEST 1: Spartan Cultural Restriction');
const spartanOfficers = [{
    name: 'Leonidas',
    battles: 5,
    memories: []
}];

const retreatOrder = "all units fall back to defensive positions";
const spartanWarnings = checkCulturalViolations(retreatOrder, 'Spartan City-State', spartanOfficers);

if (spartanWarnings.length > 0) {
    console.log('✅ Warning triggered:');
    console.log(`   ${spartanWarnings[0].message}`);
} else {
    console.log('❌ No warning (FAILED)');
}

// Test 2: Celtic defensive warning (low severity, needs veteran)
console.log('\nTEST 2: Celtic Cultural Preference');
const celticOfficers = [
    { name: 'Brennus', battles: 2, memories: [] },
    { name: 'Vercingetorix', battles: 4, memories: [] }
];

const defensiveOrder = "hold position and defend the hill";
const celticWarnings = checkCulturalViolations(defensiveOrder, 'Celtic', celticOfficers);

if (celticWarnings.length > 0) {
    console.log('✅ Warning triggered:');
    console.log(`   ${celticWarnings[0].message}`);
} else {
    console.log('❌ No warning (needs veteran with 3+ battles)');
}

// Test 3: Tactical risk - cavalry threat
console.log('\nTEST 3: Tactical Warning - Cavalry Threat');
const veteranOfficer = [{
    name: 'Marcus',
    battles: 8,
    memories: [
        { 
            keywords: ['cavalry', 'flank'], 
            description: 'Cavalry flanking at Alesia nearly destroyed us' 
        }
    ]
}];

const battleState = {
    player1: {
        intelMemory: [
            { unitClass: 'cavalry', position: 'J13' },
            { unitClass: 'cavalry', position: 'K14' }
        ],
        units: []
    }
};

const advanceOrder = "advance all infantry to ford";
const tacticalWarnings = detectTacticalRisks(advanceOrder, battleState, 'player1', veteranOfficer);

if (tacticalWarnings.length > 0) {
    console.log('✅ Warning triggered:');
    console.log(`   ${tacticalWarnings[0].message}`);
} else {
    console.log('❌ No warning (FAILED)');
}

// Test 4: Defended ford crossing
console.log('\nTEST 4: Tactical Warning - Defended Crossing');
const fordBattle = {
    player1: {
        intelMemory: [
            { unitClass: 'infantry', position: '11' },
            { unitClass: 'infantry', position: '12' }
        ],
        units: []
    }
};

const crossingOrder = "cross the ford and attack";
const fordWarnings = detectTacticalRisks(crossingOrder, fordBattle, 'player1', veteranOfficer);

if (fordWarnings.length > 0) {
    console.log('✅ Warning triggered:');
    console.log(`   ${fordWarnings[0].message}`);
} else {
    console.log('❌ No warning (FAILED)');
}

console.log('\n=== TEST COMPLETE ===');
console.log('Run this test after implementing to verify functionality.');