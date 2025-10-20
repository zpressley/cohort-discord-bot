// src/game/combat/preparationCalculator.js
// Preparation calculation system for Combat System v2.0
// Calculates unit preparation level (0-8) to reduce battlefield chaos
// 
// Last Updated: 2025-10-17
// Version: 1.0.0
// Dependencies: culturalModifiers.js

/**
 * Training level preparation bonuses
 * Based on new 6th step army building training system
 */
const TRAINING_PREPARATION_BONUSES = {
    // No training
    'none': 0,
    
    // Archer Training (ranged combat preparation)
    'archer_basic': 2,       // 2 SP - Basic archery drills
    'archer_technical': 3,   // 4 SP - Advanced shooting techniques  
    'archer_expert': 4,      // 6 SP - Master archer coordination
    
    // Swordsman Training (melee combat preparation)
    'swordsman_basic': 2,    // 2 SP - Basic sword drills
    'swordsman_technical': 3, // 4 SP - Advanced sword techniques
    'swordsman_expert': 4,   // 6 SP - Master swordsman skills
    
    // Spear Training (formation combat preparation)
    'spear_basic': 2,        // 2 SP - Basic spear drills
    'spear_technical': 3,    // 4 SP - Advanced spear techniques
    'spear_expert': 4,       // 6 SP - Master spear formation work
    
    // Cavalry Training (mounted combat preparation)  
    'cavalry_basic': 2,      // 2 SP - Basic riding and combat
    'cavalry_technical': 3,  // 4 SP - Advanced mounted tactics
    'cavalry_expert': 4      // 6 SP - Master cavalry coordination
};

/**
 * Formation preparation bonuses
 * Organized formations provide preparation against chaos
 */
const FORMATION_PREPARATION_BONUSES = {
    // Defensive formations (high preparation)
    'phalanx': 3,            // Rigid discipline, overlapping shields
    'testudo': 2,            // Turtle formation, coordinated movement
    'shield_wall': 2,        // Interlocked shields, mutual support
    'square': 2,             // All-around defense formation
    'hedgehog': 3,           // Spears out, maximum defensive prep
    
    // Standard formations (moderate preparation)
    'line': 1,               // Basic battle line organization
    'column': 0,             // March formation, minimal organization
    'echelon': 1,            // Staggered formation
    
    // Offensive formations (lower preparation, focused on attack)
    'wedge': 0,              // Concentrated assault, no defensive prep
    'loose': -1,             // Individual fighting, reduces preparation
    'crescent': 0,           // Envelopment formation
    
    // Cultural formations
    'celtic_fury': -2,       // Berserker charge, abandons preparation
    'roman_manipular': 2,    // Disciplined Roman flexibility
    'macedonian_phalanx': 3, // Pike wall, maximum preparation
    'parthian_feint': 0,     // Mobile tactics, no preparation change
    'germanic_boar': -1,     // Wedge charge, abandons defensive prep
    'chinese_five_elements': 2 // Balanced tactical system
};

/**
 * Experience level preparation bonuses
 * Veteran units better prepared for chaos of battle
 */
const EXPERIENCE_PREPARATION_BONUSES = {
    'Recruit': 0,            // 0 battles average - no experience bonus
    'Seasoned': 0,           // 1-2 battles average - minimal experience
    'Veteran': 1,            // 3-5 battles average - some experience
    'Elite Veteran': 2,      // 6-10 battles average - solid experience
    'Legendary': 3           // 11+ battles average - maximum experience
};

/**
 * Positional preparation bonuses
 * Defensive positions provide preparation advantages
 */
const POSITIONAL_PREPARATION_BONUSES = {
    // Fortified positions
    'fortified_position': 2,     // Behind walls/earthworks
    'field_fortification': 1,    // Hastily built defenses
    'prepared_defense': 1,       // Pre-planned defensive positions
    
    // Terrain advantages  
    'high_ground': 1,            // Elevation defensive bonus
    'river_bank_defender': 1,    // Defending river crossing
    
    // Disadvantages (negative preparation)
    'crossing_obstacle': -1,     // Attacking across water/wall
    'surprised': -3,             // Caught completely off guard
    'ambushed': -2,              // Surprise attack penalty
    'retreating': -1,            // Fighting withdrawal, disorganized
    'broken_formation': -2       // Formation disrupted by enemy action
};

/**
 * Calculate total preparation for a unit
 * @param {Object} unit - Unit with training, formation, experience data
 * @param {Object} position - Positional situation
 * @param {string} culture - Unit culture for cultural bonuses
 * @returns {Object} Preparation calculation breakdown
 */
function calculatePreparation(unit, position = {}, culture = null) {
    let totalPreparation = 0;
    const breakdown = {
        training: 0,
        formation: 0,
        experience: 0,
        position: 0,
        cultural: 0,
        factors: []
    };

    // Training preparation bonus
    const training = unit.training || 'none';
    if (TRAINING_PREPARATION_BONUSES[training] !== undefined) {
        const trainingBonus = TRAINING_PREPARATION_BONUSES[training];
        totalPreparation += trainingBonus;
        breakdown.training += trainingBonus;
        if (trainingBonus > 0) {
            breakdown.factors.push(`Training (${training}): +${trainingBonus}`);
        }
    }

    // Formation preparation bonus
    const formation = unit.formation || 'line';
    if (FORMATION_PREPARATION_BONUSES[formation] !== undefined) {
        const formationBonus = FORMATION_PREPARATION_BONUSES[formation];
        totalPreparation += formationBonus;
        breakdown.formation += formationBonus;
        if (formationBonus !== 0) {
            const sign = formationBonus > 0 ? '+' : '';
            breakdown.factors.push(`Formation (${formation}): ${sign}${formationBonus}`);
        }
    }

    // Experience preparation bonus
    const experience = unit.veteranLevel || 'Recruit';
    if (EXPERIENCE_PREPARATION_BONUSES[experience] !== undefined) {
        const experienceBonus = EXPERIENCE_PREPARATION_BONUSES[experience];
        totalPreparation += experienceBonus;
        breakdown.experience += experienceBonus;
        if (experienceBonus > 0) {
            breakdown.factors.push(`Experience (${experience}): +${experienceBonus}`);
        }
    }

    // Positional preparation bonuses/penalties
    Object.keys(position).forEach(situationKey => {
        if (POSITIONAL_PREPARATION_BONUSES[situationKey] !== undefined) {
            const positionBonus = POSITIONAL_PREPARATION_BONUSES[situationKey];
            totalPreparation += positionBonus;
            breakdown.position += positionBonus;
            if (positionBonus !== 0) {
                const sign = positionBonus > 0 ? '+' : '';
                breakdown.factors.push(`Position (${situationKey}): ${sign}${positionBonus}`);
            }
        }
    });

    // Cultural preparation bonus (from culturalModifiers.js)
    if (culture) {
        const { getCulturalPreparationBonus } = require('./culturalModifiers');
        const culturalBonus = getCulturalPreparationBonus(culture);
        totalPreparation += culturalBonus;
        breakdown.cultural += culturalBonus;
        if (culturalBonus !== 0) {
            const sign = culturalBonus > 0 ? '+' : '';
            breakdown.factors.push(`Culture (${culture}): ${sign}${culturalBonus}`);
        }
    }

    // Cap preparation at maximum 8, minimum 0
    const finalPreparation = Math.max(0, Math.min(8, totalPreparation));

    return {
        preparationLevel: finalPreparation,
        rawTotal: totalPreparation,
        capped: totalPreparation > 8 || totalPreparation < 0,
        breakdown,
        description: getPreparationDescription(finalPreparation)
    };
}

/**
 * Get descriptive text for preparation level
 * @param {number} preparationLevel - Preparation level 0-8
 * @returns {string} Description of unit readiness
 */
function getPreparationDescription(preparationLevel) {
    const descriptions = {
        0: "Unprepared - maximum chaos vulnerability",
        1: "Minimal preparation - very vulnerable to chaos", 
        2: "Basic preparation - some chaos resistance",
        3: "Adequate preparation - moderate chaos resistance",
        4: "Good preparation - solid chaos resistance",
        5: "Well prepared - strong chaos resistance", 
        6: "Very well prepared - excellent chaos resistance",
        7: "Exceptionally prepared - near-maximum chaos resistance",
        8: "Perfectly prepared - maximum chaos resistance (but never immune)"
    };
    
    return descriptions[preparationLevel] || `Preparation level ${preparationLevel}`;
}

/**
 * Apply preparation to chaos modifier
 * This is the core chaos-preparation interaction
 * Preparation reduces chaos but never eliminates it completely
 * @param {number} rawChaosModifier - Raw chaos penalty from chaos roll
 * @param {number} preparationLevel - Unit's preparation level
 * @returns {Object} Final chaos modifier after preparation
 */
function applyPreparationToChaos(rawChaosModifier, preparationLevel) {
    // Preparation reduces chaos impact, but minimum 1 chaos remains if rawChaos > 0
    let finalChaosModifier;
    
    if (rawChaosModifier <= 0) {
        // No chaos or negative chaos - preparation doesn't matter
        finalChaosModifier = rawChaosModifier;
    } else {
        // Positive chaos - preparation reduces it but leaves minimum 1
        const reducedChaos = rawChaosModifier - preparationLevel;
        finalChaosModifier = Math.max(1, reducedChaos);
    }
    
    const chaosReduced = rawChaosModifier - finalChaosModifier;
    
    return {
        rawChaos: rawChaosModifier,
        preparation: preparationLevel,
        chaosReduced: chaosReduced,
        finalChaosModifier: finalChaosModifier,
        description: `Raw chaos ${rawChaosModifier} - Preparation ${preparationLevel} = Final chaos ${finalChaosModifier} (min 1 if positive)`
    };
}

/**
 * Calculate training requirements for weapon combinations
 * Determines what training types are valid for a unit's equipment
 * @param {Object} unit - Unit with weapon loadout
 * @returns {Array} Valid training options for this unit
 */
function getValidTrainingOptions(unit) {
    const validTraining = ['none']; // Always can have no training
    const weapons = unit.weapons || [];
    const mounted = unit.mounted || false;
    
    // Check for ranged weapons (archer training)
    const hasRangedWeapon = weapons.some(weapon => 
        weapon.includes('bow') || weapon.includes('crossbow') || 
        weapon.includes('sling') || weapon.includes('javelin')
    );
    if (hasRangedWeapon) {
        validTraining.push('archer_basic', 'archer_technical', 'archer_expert');
    }
    
    // Check for melee weapons (swordsman training)
    const hasSword = weapons.some(weapon => 
        weapon.includes('sword') || weapon.includes('gladius') || 
        weapon.includes('dao') || weapon.includes('xiphos')
    );
    if (hasSword) {
        validTraining.push('swordsman_basic', 'swordsman_technical', 'swordsman_expert');
    }
    
    // Check for spear weapons (spear training)
    const hasSpear = weapons.some(weapon => 
        weapon.includes('spear') || weapon.includes('sarissa') || 
        weapon.includes('pike') || weapon.includes('pilum')
    );
    if (hasSpear) {
        validTraining.push('spear_basic', 'spear_technical', 'spear_expert');
    }
    
    // Check if mounted (cavalry training)
    if (mounted) {
        validTraining.push('cavalry_basic', 'cavalry_technical', 'cavalry_expert');
    }
    
    return validTraining;
}

/**
 * Get training cost for army builder
 * @param {string} trainingType - Training type
 * @returns {number} SP cost
 */
function getTrainingCost(trainingType) {
    if (trainingType.includes('basic')) return 2;
    if (trainingType.includes('technical')) return 4;
    if (trainingType.includes('expert')) return 6;
    return 0; // 'none' costs nothing
}

module.exports = {
    TRAINING_PREPARATION_BONUSES,
    FORMATION_PREPARATION_BONUSES,
    EXPERIENCE_PREPARATION_BONUSES,
    POSITIONAL_PREPARATION_BONUSES,
    calculatePreparation,
    getPreparationDescription,
    applyPreparationToChaos,
    getValidTrainingOptions,
    getTrainingCost
};