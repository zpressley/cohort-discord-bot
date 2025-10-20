// src/game/combat/culturalModifiers.js
// Cultural combat modifiers for Combat System v2.0
// Defines combat traits and bonuses for the 8 implemented ancient civilizations
// 
// Last Updated: 2025-10-17
// Version: 1.0.0
// Dependencies: attackRatings.js, defenseRatings.js, armyData.js

/**
 * Cultural combat modifiers for the 8 implemented civilizations
 * Based on existing armyData.js cultural modifiers and core_8_cultures.txt
 */
const CULTURAL_COMBAT_MODIFIERS = {
    'Roman Republic': {
        // Based on armyData.js cultural modifiers and core_8_cultures.txt
        preparation_bonus: +2,        // Engineering mastery, professional discipline
        attack_bonuses: {
            'fortified_position': +1, // Engineering advantage when defending
            'systematic_advance': +1  // Coordinated movement
        },
        defense_bonuses: {
            'testudo': +2,           // Shield discipline mastery
            'fortified_position': +2 // Engineering fortifications
        },
        morale_bonus: +1,            // Professional discipline
        special_traits: {
            engineering: true,       // Can build field fortifications
            professional_army: true, // Higher base morale
            auxiliary_recruitment: true // Can recruit defeated enemies
        }
    },

    'Macedonian Kingdoms': {
        // Veterans of war, equipment flexibility
        preparation_bonus: +2,        // Battle-hardened professionals
        attack_bonuses: {
            'phalanx': +1,           // Sarissa pike mastery
            'combined_arms': +1      // Infantry/cavalry coordination
        },
        defense_bonuses: {
            'phalanx': +2,           // Pike wall defense
            'veteran_experience': +1  // 10-battle veteran status
        },
        morale_bonus: +1,            // Alexander's legacy
        special_traits: {
            veteran_start: true,     // Silver Shields start experienced
            equipment_flexibility: true, // Can switch sarissa/spears
            no_militia: true         // Cannot hire militia (professional only)
        }
    },

    'Celtic': {
        // Celtic Tribes (Gallic/British) - Based on core_8_cultures.txt
        preparation_bonus: -1,       // Poor formation discipline
        attack_bonuses: {
            'charging': +2,          // Berserker fury
            'flanking': +2,          // Guerrilla warfare bonus
            'forest_fighting': +1    // Woodland mobility
        },
        defense_bonuses: {
            'forest_cover': +2,      // Woodland warfare mastery
            'individual_combat': +1  // Champion warrior tradition
        },
        morale_bonus: 0,             // Fierce but undisciplined
        special_traits: {
            berserker_fury: true,    // Fear effects on ambush
            guerrilla_warfare: true, // Flanking bonuses
            woodland_mobility: true, // No rough terrain penalties
            poor_archery: true       // Cannot deploy professional+ archers
        }
    },

    'Han Dynasty': {
        // Based on armyData.js (20% unit size bonus) and core_8_cultures.txt
        preparation_bonus: +2,       // Advanced technology and organization
        attack_bonuses: {
            'crossbow_volley': +2,   // Crossbow mastery
            'coordinated_advance': +1 // Mass mobilization
        },
        defense_bonuses: {
            'prepared_defense': +1,  // Systematic planning
            'fortified_position': +1 // Engineering capability
        },
        morale_bonus: +1,            // Mandate of Heaven
        special_traits: {
            advanced_technology: true, // Crossbows and siege equipment
            larger_units: true,      // 120 men vs 100 per block
            assimilation: true       // Conquered units join with 50% perks
        }
    },

    'Sarmatian Confederations': {
        // Based on armyData.js (horse cost 2 vs 3) and core_8_cultures.txt
        preparation_bonus: 0,        // Mobile tactics, less rigid prep
        attack_bonuses: {
            'charging': +2,          // Heavy cavalry charges
            'horse_archery': +2,     // Mobile archery mastery
            'feigned_retreat': +2    // Absorbed from Scythians
        },
        defense_bonuses: {
            'mobile_defense': +2,    // Fighting withdrawal
            'dual_mode': +1          // Switch cavalry/archery modes
        },
        morale_bonus: 0,
        special_traits: {
            cavalry_requirement: true, // 70% must be mounted
            dual_mode_combat: true,  // Switch heavy cav/horse archery
            no_infantry: true        // No foot soldiers unless adapted
        }
    },

    'Mauryan Empire': {
        // War elephants and wootz steel (not in armyData.js yet)
        preparation_bonus: +1,
        attack_bonuses: {
            'elephant_charge': +3,   // War elephant charges
            'wootz_steel': +1        // Superior metallurgy
        },
        defense_bonuses: {
            'combined_arms': +1,     // Patti formations
            'dharmic_discipline': +1 // Buddhist principles
        },
        morale_bonus: +1,
        special_traits: {
            war_elephants: true,     // Tank-like charges
            wootz_steel_mastery: true, // Ignores 10% armor
            no_pursuit: true,        // Cannot pursue routed enemies
            diverse_requirement: true // Must field 3+ unit types
        }
    },

    'Spartan City-State': {
        // Based on armyData.js restrictions and core_8_cultures.txt
        preparation_bonus: +2,       // Ultimate discipline
        attack_bonuses: {
            'phalanx': +2,          // Hoplon and dory mastery
            'last_stand': +3         // Fight to the last man
        },
        defense_bonuses: {
            'phalanx': +3,          // Legendary phalanx
            'never_retreat': +2      // Death before dishonor
        },
        morale_bonus: +2,           // Warrior-bred society
        special_traits: {
            fight_to_last: true,    // Effective until 50% casualties
            no_mercenaries: true,   // Cannot hire mercenaries
            no_adaptation: true,    // Spartan purity prevents learning
            perioeci_militia: true  // Better non-citizen troops
        }
    },

    'Berber Confederations': {
        // Desert raiders and confederation tactics
        preparation_bonus: 0,
        attack_bonuses: {
            'hit_and_run': +2,      // Raid mastery
            'desert_fighting': +2,   // Desert navigation
            'small_unit_tactics': +1 // Confederation bonuses
        },
        defense_bonuses: {
            'desert_terrain': +3,    // Desert survival warfare
            'mobile_defense': +1     // Hit and run defense
        },
        morale_bonus: 0,
        special_traits: {
            desert_navigation: true, // +4 vs desert penalties
            master_raiders: true,    // Upgrade equipment from captures
            forest_penalty: true     // Reduced movement in forest/swamp
        }
    }
};

/**
 * Get cultural combat modifiers for a specific culture
 * @param {string} culture - Culture name
 * @returns {Object} Cultural combat modifiers
 */
function getCulturalModifiers(culture) {
    return CULTURAL_COMBAT_MODIFIERS[culture] || {
        preparation_bonus: 0,
        attack_bonuses: {},
        defense_bonuses: {},
        morale_bonus: 0,
        special_traits: {}
    };
}

/**
 * Apply cultural modifiers to attack rating
 * @param {number} baseAttack - Base attack rating
 * @param {string} culture - Unit culture
 * @param {Object} situation - Combat situation
 * @returns {number} Culturally modified attack rating
 */
function applyCulturalAttackModifiers(baseAttack, culture, situation = {}) {
    const modifiers = getCulturalModifiers(culture);
    let totalAttack = baseAttack;

    // Apply situational attack bonuses
    Object.keys(situation).forEach(situationKey => {
        if (modifiers.attack_bonuses[situationKey]) {
            totalAttack += modifiers.attack_bonuses[situationKey];
        }
    });

    // Special trait modifiers
    if (modifiers.special_traits.wootz_steel && situation.has_wootz_upgrade) {
        totalAttack += 1; // Wootz steel bonus
    }

    return Math.max(1, totalAttack);
}

/**
 * Apply cultural modifiers to defense rating
 * @param {number} baseDefense - Base defense rating
 * @param {string} culture - Unit culture
 * @param {Object} situation - Combat situation
 * @returns {number} Culturally modified defense rating
 */
function applyCulturalDefenseModifiers(baseDefense, culture, situation = {}) {
    const modifiers = getCulturalModifiers(culture);
    let totalDefense = baseDefense;

    // Apply situational defense bonuses
    Object.keys(situation).forEach(situationKey => {
        if (modifiers.defense_bonuses[situationKey]) {
            totalDefense += modifiers.defense_bonuses[situationKey];
        }
    });

    return Math.max(0, totalDefense);
}

/**
 * Get cultural preparation bonus
 * @param {string} culture - Unit culture
 * @returns {number} Preparation bonus for chaos reduction
 */
function getCulturalPreparationBonus(culture) {
    const modifiers = getCulturalModifiers(culture);
    return modifiers.preparation_bonus || 0;
}

/**
 * Check if culture has special trait
 * @param {string} culture - Unit culture
 * @param {string} trait - Special trait name
 * @returns {boolean} True if culture has this trait
 */
function hasCulturalTrait(culture, trait) {
    const modifiers = getCulturalModifiers(culture);
    return modifiers.special_traits[trait] || false;
}

/**
 * Get cultural morale bonus
 * @param {string} culture - Unit culture
 * @returns {number} Morale bonus/penalty
 */
function getCulturalMoraleBonus(culture) {
    const modifiers = getCulturalModifiers(culture);
    return modifiers.morale_bonus || 0;
}

module.exports = {
    CULTURAL_COMBAT_MODIFIERS,
    getCulturalModifiers,
    applyCulturalAttackModifiers,
    applyCulturalDefenseModifiers,
    getCulturalPreparationBonus,
    hasCulturalTrait,
    getCulturalMoraleBonus
};