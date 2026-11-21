// Debug test to isolate rating calculation issues

const { calculateAttackRating } = require('../../game/combat/attackRatings');
const { calculateDefenseRating } = require('../../game/combat/defenseRatings');

// Create a simple test unit
const testUnit = {
    weapons: ['roman_gladius'],
    quality: 'professional',
    armor: 'medium_armor',
    shield: 'medium_shield',
    formation: 'line'
};

console.log('Test unit:', testUnit);

// Test attack rating
console.log('\n=== Attack Rating Test ===');
const attackRating = calculateAttackRating(testUnit, { terrain: 'mixed' });
console.log('Attack rating:', attackRating);

// Test defense rating  
console.log('\n=== Defense Rating Test ===');
const defenseRating = calculateDefenseRating(testUnit, { terrain: 'mixed' });
console.log('Defense rating:', defenseRating);

// Test the data structures from our test units
const { TROOP_QUALITY } = require('../../game/armyData');

function createTestUnit(qualityType, weaponNames, armorType, shieldType, mounted) {
    const quality = TROOP_QUALITY[qualityType];
    
    return {
        unitId: `test_${qualityType}_${Date.now()}_${Math.random()}`,
        qualityType,
        quality,
        weapons: weaponNames, // Store as simple string array
        armor: armorType, // Store as string
        shield: shieldType, // Store as string
        mounted,
        currentStrength: quality.size,
        maxStrength: quality.size
    };
}

console.log('\n=== Test Unit from createTestUnit ===');
const ourTestUnit = createTestUnit('professional', ['roman_gladius'], 'medium_armor', 'medium_shield', false);

console.log('Our test unit structure:');
console.log('- qualityType:', ourTestUnit.qualityType);
console.log('- weapons:', ourTestUnit.weapons);
console.log('- armor:', ourTestUnit.armor);
console.log('- shield:', ourTestUnit.shield);

// Try the actual conversion
const convertedUnit = {
    weapons: ourTestUnit.weapons,
    quality: ourTestUnit.qualityType,
    armor: ourTestUnit.armor,
    shield: ourTestUnit.shield,
    formation: 'line'
};

console.log('\nConverted unit for rating calculation:', convertedUnit);

const attackRating2 = calculateAttackRating(convertedUnit, { terrain: 'mixed' });
const defenseRating2 = calculateDefenseRating(convertedUnit, { terrain: 'mixed' });

console.log('Attack rating:', attackRating2);
console.log('Defense rating:', defenseRating2);