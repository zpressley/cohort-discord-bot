// test_veteran_ai_warnings.js
// Test veteran warning triggers (without AI generation)

const { shouldVeteransWarn } = require('../../game/officers/veteranWarnings');

console.log('=== TESTING VETERAN WARNING TRIGGERS ===\n');

// Test 1: Historical enemy knowledge
console.log('TEST 1: Historical Enemy Knowledge');
const veteransWithHistory = [{
    name: 'Marcus the Scarred',
    battles: 10,
    memories: [
        {
            enemyCulture: 'Celtic',
            keywords: ['celtic', 'ambush', 'forest'],
            description: 'Celtic ambush at Teutoburg',
            outcome: 'disaster'
        }
    ]
}];

const battleVsCelts = {
    player1: {
        culture: 'Roman Republic',
        intelMemory: [],
        units: [{ class: 'infantry', strength: 100 }],
        morale: 80
    },
    player2: {
        culture: 'Celtic',
        units: []
    }
};

const celticWarning = shouldVeteransWarn(
    "advance infantry through the forest",
    battleVsCelts,
    'player1',
    veteransWithHistory
);

if (celticWarning) {
    console.log('✅ Trigger detected:');
    console.log('   Veteran:', celticWarning.veteran.name);
    console.log('   Triggers:', celticWarning.triggers.map(t => t.type).join(', '));
} else {
    console.log('❌ No trigger (FAILED)');
}

// Test 2: Battle memory - similar situation
console.log('\nTEST 2: Battle Memory Recognition');
const veteranWithMemory = [{
    name: 'Titus the Wise',
    battles: 8,
    memories: [
        {
            keywords: ['ford', 'crossing', 'river'],
            description: 'Defended ford crossing at Rubicon',
            outcome: 'disaster',
            enemyCulture: 'Germanic Confederations'
        }
    ]
}];

const fordBattle = {
    player1: {
        intelMemory: [
            { unitClass: 'infantry', position: '11' },
            { unitClass: 'infantry', position: '12' }
        ],
        units: [{ class: 'infantry', strength: 100 }],
        morale: 70
    },
    player2: {
        culture: 'Germanic Confederations'
    }
};

const fordWarning = shouldVeteransWarn(
    "cross the ford and attack",
    fordBattle,
    'player1',
    veteranWithMemory
);

if (fordWarning) {
    console.log('✅ Trigger detected:');
    console.log('   Memory matched:', fordWarning.triggers.find(t => t.type === 'battle_memory') ? 'YES' : 'NO');
} else {
    console.log('❌ No trigger (FAILED)');
}

// Test 3: Morale concern - low morale retreat
console.log('\nTEST 3: Morale Concern - Low Morale');
const standardVeteran = [{
    name: 'Gaius',
    battles: 6,
    memories: []
}];

const lowMoraleBattle = {
    player1: {
        intelMemory: [],
        units: [{ class: 'infantry', strength: 50 }],
        morale: 25  // Very low
    },
    player2: {
        culture: 'Han Dynasty'
    }
};

const moraleWarning = shouldVeteransWarn(
    "all units retreat to safety",
    lowMoraleBattle,
    'player1',
    standardVeteran
);

if (moraleWarning) {
    console.log('✅ Trigger detected:');
    console.log('   Morale trigger:', moraleWarning.triggers.find(t => t.type === 'morale_concern') ? 'YES' : 'NO');
} else {
    console.log('❌ No trigger (FAILED)');
}

// Test 4: Tactical risk - cavalry threat
console.log('\nTEST 4: Tactical Risk - Cavalry Threat');
const cavalryBattle = {
    player1: {
        intelMemory: [
            { unitClass: 'cavalry', position: 'J13' },
            { unitClass: 'cavalry', position: 'K14' }
        ],
        units: [{ class: 'infantry', strength: 100 }],
        morale: 80
    },
    player2: {
        culture: 'Sarmatian Confederations'
    }
};

const cavalryWarning = shouldVeteransWarn(
    "advance all infantry to ford",
    cavalryBattle,
    'player1',
    standardVeteran
);

if (cavalryWarning) {
    console.log('✅ Trigger detected:');
    console.log('   Tactical risk:', cavalryWarning.triggers.find(t => t.type === 'tactical_risk') ? 'YES' : 'NO');
} else {
    console.log('❌ No trigger (FAILED)');
}

// Test 5: No veterans = no warnings
console.log('\nTEST 5: No Veterans = No Warnings');
const noVeteranWarning = shouldVeteransWarn(
    "charge into certain death",
    cavalryBattle,
    'player1',
    [] // No veterans
);

if (!noVeteranWarning) {
    console.log('✅ Correctly no warning when no veterans');
} else {
    console.log('❌ Warning triggered without veterans (FAILED)');
}

console.log('\n=== TEST COMPLETE ===');
console.log('Expected: 4 ✅ triggers + 1 ✅ no-veteran check');