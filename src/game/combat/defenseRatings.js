// src/game/combat/defenseRatings.js
// Defense rating tables for Combat System v2.0
// Converts armor/shield values to defense ratings (0-10 scale)
// 
// Last Updated: 2025-10-17
// Version: 1.0.0
// Dependencies: armyData.js

/**
 * Base armor defense ratings (0-10 scale)
 * Converted from damage_reduction percentages in armyData.js
 */
const ARMOR_DEFENSE_RATINGS = {
    'no_armor': 0,        // 0% reduction → 0 defense
    'light_armor': 3,     // 30% reduction → 3 defense  
    'medium_armor': 6,    // 60% reduction → 6 defense
    'heavy_armor': 9      // 85% reduction → 9 defense (near maximum)
};

/**
 * Shield defense bonuses (0-3 scale, same as armyData.js)
 * Adds to total defense rating
 */
const SHIELD_DEFENSE_BONUSES = {
    'no_shield': 0,       // No protection
    'light_shield': 1,    // Buckler, parrying shield
    'medium_shield': 2,   // Standard round/oval shields
    'heavy_shield': 3     // Tower shields, maximum protection
};

/**
 * Troop quality training defense bonuses (0-10 scale)
 * Based on discipline, formation keeping, tactical awareness
 */
const TRAINING_DEFENSE_BONUSES = {
    'levy': 0,            // Farmers, break formation easily
    'tribal_warriors': 1, // Fierce but undisciplined
    'militia': 2,         // Basic formation training
    'professional': 4,    // Systematic defensive training
    'veteran_mercenary': 6, // Battle-hardened experience
    'elite_guard': 8,     // Palace troops, maximum training
    'legendary': 10       // Historically famous defensive prowess
};

/**
 * Formation defense modifiers
 * Positive = formation improves defense, negative = formation weakens defense
 */
const FORMATION_DEFENSE_MODIFIERS = {
    // Defensive formations (major defense bonus)
    'phalanx': +4,           // Overlapping shields, spear hedge
    'testudo': +6,           // Turtle formation, maximum protection
    'shield_wall': +3,       // Interlocked shields
    'square': +2,            // All-around defense vs cavalry
    'hedgehog': +5,          // Spears out in all directions
    
    // Standard formations (neutral to minor bonus)
    'line': +1,              // Basic battle line
    'column': 0,             // March formation, not defensive
    'echelon': +1,           // Staggered defense
    
    // Offensive formations (defense penalty for aggression)
    'wedge': -2,             // Concentrated attack, exposed flanks
    'loose': -1,             // Individual fighting, less mutual support
    'crescent': 0,           // Balanced envelopment
    
    // Cultural formations
    'celtic_fury': -3,       // Berserker charge, no defense
    'roman_manipular': +2,   // Disciplined flexibility with defense
    'macedonian_phalanx': +4, // Pike wall defensive focus
    'parthian_feint': -1,    // Mobile tactics, less armored
    'germanic_boar': -2,     // Wedge charge, aggressive focus
    'chinese_five_elements': +1, // Balanced defensive system
};

/**
 * Situational defense bonuses/penalties
 */
const SITUATIONAL_DEFENSE_MODIFIERS = {
    // Positioning advantages
    'high_ground': +2,       // Elevation makes attacks harder
    'fortified_position': +4, // Behind walls/earthworks
    'river_bank': +1,        // Defender advantage at crossing
    'forest_cover': +1,      // Trees break up attacks
    'marsh_defender': +2,    // Attacker has bad footing
    
    // Combat state
    'prepared_defense': +2,  // Ready for attack
    'fighting_retreat': +1,  // Organized withdrawal
    'desperate_last_stand': +2, // Fight to the death
    'surprised': -4,         // Caught off guard
    'flanked': -3,           // Attacked from side
    'rear_attack': -5,       // Attacked from behind
    'broken_formation': -3,  // Formation disrupted
    
    // Environmental factors
    'night_combat': -1,      // Harder to coordinate defense
    'rain_weather': -1,      // Slippery shields and weapons
    'extreme_heat': -2,      // Heavy armor becomes liability
    'dust_storm': +1,        // Hard for enemy to target
};

/**
 * Armor effectiveness vs weapon types
 * Some armor types better vs certain attack methods
 */
const ARMOR_TYPE_EFFECTIVENESS = {
    'no_armor': {
        // No protection against anything
        blunt: 0, piercing: 0, slashing: 0
    },
    'light_armor': {
        // Leather/hide good vs slashing, poor vs piercing
        blunt: 2, piercing: 1, slashing: 4
    },
    'medium_armor': {
        // Scale/ring mail balanced protection
        blunt: 3, piercing: 5, slashing: 6
    },
    'heavy_armor': {
        // Chain/plate excellent vs piercing/slashing, vulnerable to blunt
        blunt: 4, piercing: 8, slashing: 9
    }
};

/**
 * Calculate total defense rating for a unit
 * @param {Object} unit - Unit with armor, shield, quality, formation data
 * @param {Object} situation - Combat situation modifiers
 * @returns {number} Total defense rating
 */
function calculateDefenseRating(unit, situation = {}) {
    let totalDefense = 0;
    
    // Base armor defense
    const armor = unit.armor || 'no_armor';
    if (ARMOR_DEFENSE_RATINGS[armor]) {
        totalDefense += ARMOR_DEFENSE_RATINGS[armor];
    }
    
    // Shield bonus
    const shield = unit.shield || 'no_shield';
    if (SHIELD_DEFENSE_BONUSES[shield]) {
        totalDefense += SHIELD_DEFENSE_BONUSES[shield];
    }
    
    // Training bonus
    const quality = unit.quality || 'levy';
    if (TRAINING_DEFENSE_BONUSES[quality]) {
        totalDefense += TRAINING_DEFENSE_BONUSES[quality];
    }
    
    // Formation modifier
    const formation = unit.formation || 'line';
    if (FORMATION_DEFENSE_MODIFIERS[formation]) {
        totalDefense += FORMATION_DEFENSE_MODIFIERS[formation];
    }
    
    // Situational modifiers
    Object.keys(situation).forEach(modifier => {
        if (SITUATIONAL_DEFENSE_MODIFIERS[modifier]) {
            totalDefense += SITUATIONAL_DEFENSE_MODIFIERS[modifier];
        }
    });
    
    // Defense cannot go below 0
    return Math.max(0, totalDefense);
}

/**
 * Get armor effectiveness vs specific weapon type
 * @param {string} armorType - Armor type
 * @param {string} weaponDamageType - blunt, piercing, or slashing
 * @returns {number} Effective defense rating vs this weapon type
 */
function getArmorEffectiveness(armorType, weaponDamageType) {
    const effectiveness = ARMOR_TYPE_EFFECTIVENESS[armorType];
    if (!effectiveness) return 0;
    
    return effectiveness[weaponDamageType] || effectiveness.piercing || 0;
}

/**
 * Weapon damage type classifications
 * Used to determine armor effectiveness
 */
const WEAPON_DAMAGE_TYPES = {
    // Blunt weapons (good vs heavy armor)
    'clubs': 'blunt',
    'mace': 'blunt', 
    'heavy_mace': 'blunt',
    'sling': 'blunt',
    'sling_professional': 'blunt',
    
    // Piercing weapons (good vs light armor, poor vs heavy)
    'spear_basic': 'piercing',
    'spear_professional': 'piercing',
    'two_handed_spear': 'piercing',
    'macedonian_sarissa': 'piercing',
    'germanic_framea': 'piercing',
    'light_javelin': 'piercing',
    'javelin_heavy': 'piercing',
    'roman_pilum': 'piercing',
    'throwing_spear': 'piercing',
    'persian_kontos': 'piercing',
    'han_chinese_crossbow': 'piercing',
    'self_bow_basic': 'piercing',
    'self_bow_professional': 'piercing',
    'greek_composite_bow': 'piercing',
    'persian_recurve_bow': 'piercing',
    'parthian_horse_bow': 'piercing',
    
    // Slashing weapons (good vs medium armor)
    'sword_standard': 'slashing',
    'roman_gladius': 'slashing',
    'greek_xiphos': 'slashing',
    'chinese_dao': 'slashing',
    'celtic_longsword': 'slashing',
    'persian_akinakes': 'slashing',
    'battle_axe': 'slashing',
    'great_axe': 'slashing',
    'thracian_rhomphaia': 'slashing',
    'celtic_champions_sword': 'slashing',
    'chinese_chang_dao': 'slashing',
    'daggers': 'slashing',
    'sickle': 'slashing',
    'germanic_war_scythe': 'slashing',
    'chinese_quarterstaff': 'slashing',
    'roman_pugio': 'slashing',
    'germanic_throwing_axe': 'slashing',
    'roman_plumbatae': 'slashing'
};

/**
 * Get weapon damage type for armor effectiveness calculations
 * @param {string} weaponType - Weapon identifier
 * @returns {string} Damage type: 'blunt', 'piercing', or 'slashing'
 */
function getWeaponDamageType(weaponType) {
    return WEAPON_DAMAGE_TYPES[weaponType] || 'slashing';
}

module.exports = {
    ARMOR_DEFENSE_RATINGS,
    SHIELD_DEFENSE_BONUSES,
    TRAINING_DEFENSE_BONUSES,
    FORMATION_DEFENSE_MODIFIERS,
    SITUATIONAL_DEFENSE_MODIFIERS,
    ARMOR_TYPE_EFFECTIVENESS,
    WEAPON_DAMAGE_TYPES,
    calculateDefenseRating,
    getArmorEffectiveness,
    getWeaponDamageType
};