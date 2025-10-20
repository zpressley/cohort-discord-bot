// src/game/combat/attackRatings.js
// Attack rating tables for Combat System v2.0
// Converts weapon damage values to attack ratings (2-12 scale)
// 
// Last Updated: 2025-10-17
// Version: 1.0.0
// Dependencies: armyData.js

/**
 * Base weapon attack ratings (2-12 scale)
 * Derived from damage values in armyData.js, normalized to attack scale
 */
const WEAPON_ATTACK_RATINGS = {
    // Light weapons (damage 5-7 → attack 2-4)
    'clubs': 3,
    'daggers': 2, 
    'spear_basic': 4,
    'sickle': 2,
    'light_javelin': 2,
    'sling': 4,  // High impact energy
    'self_bow_basic': 3,
    'throwing_spear': 3,
    
    // Cultural light weapons
    'germanic_war_scythe': 3,
    'chinese_quarterstaff': 3,
    'roman_pugio': 2,
    'roman_plumbatae': 2,
    'germanic_throwing_axe': 3,
    
    // Medium weapons (damage 7-9 → attack 4-6)
    'spear_professional': 5,
    'battle_axe': 5,
    'mace': 4,  // Lower attack but armor-piercing
    'sword_standard': 4,
    'self_bow_professional': 5,
    'javelin_heavy': 6,
    'sling_professional': 6,  // Extreme impact
    
    // Cultural medium weapons
    'roman_gladius': 5,
    'greek_xiphos': 4,
    'chinese_dao': 5,
    'celtic_longsword': 5,
    'persian_akinakes': 3,
    'roman_pilum': 6,  // Shield-penetrating
    'greek_composite_bow': 6,
    'persian_recurve_bow': 6,
    'han_chinese_crossbow': 8,  // Mechanical advantage
    'parthian_horse_bow': 6,
    
    // Heavy weapons (damage 9-15 → attack 6-12)
    'two_handed_spear': 7,
    'heavy_mace': 9,  // Devastating vs armor
    'great_axe': 8,
    'macedonian_sarissa': 6,  // Formation weapon, not individual
    'thracian_rhomphaia': 8,
    'celtic_champions_sword': 7,
    'chinese_chang_dao': 7,
    'germanic_framea': 6,
    'persian_kontos': 12  // Maximum attack rating - cavalry lance
};

/**
 * Troop quality training bonuses (0-10 scale)
 * Based on experience, discipline, and professional training
 */
const TRAINING_ATTACK_BONUSES = {
    'levy': 0,                // Farmers with minimal training
    'tribal_warriors': 1,     // Natural fighters, limited discipline
    'militia': 2,             // Part-time soldiers, basic training
    'professional': 4,        // Career soldiers, systematic training
    'veteran_mercenary': 6,   // Battle-hardened experts
    'elite_guard': 8,         // Palace/bodyguard units
    'legendary': 10          // Historically famous units
};

/**
 * Formation attack modifiers
 * Positive = formation enhances attack, negative = formation hinders attack
 */
const FORMATION_ATTACK_MODIFIERS = {
    // Defensive formations (reduce attack but improve defense)
    'phalanx': -1,           // Locked in formation, limited mobility
    'testudo': -2,           // Turtle formation, very defensive
    'shield_wall': -1,       // Wall formation, defensive focus
    'square': -1,            // Anti-cavalry square, defensive
    
    // Offensive formations (enhance attack)
    'wedge': +2,             // Concentrated assault formation
    'line': 0,               // Standard battle line, balanced
    'loose': +1,             // Flexible, individual initiative
    'column': 0,             // March formation, neutral
    
    // Special formations
    'crescent': +1,          // Enveloping formation
    'echelon': 0,            // Staggered advance, balanced
    
    // Cultural formations
    'celtic_fury': +3,       // Berserker charge, maximum aggression
    'roman_manipular': +1,   // Disciplined flexibility
    'macedonian_phalanx': -1, // Pike wall, defensive orientation
    'parthian_feint': +2,    // Feigned retreat setup
    'germanic_boar': +2,     // Wedge charge formation
    'chinese_five_elements': 0, // Balanced tactical system
};

/**
 * Situational attack bonuses/penalties
 */
const SITUATIONAL_ATTACK_MODIFIERS = {
    // Positioning
    'high_ground': +1,       // Elevation advantage
    'flanking': +2,          // Attacking from side/rear
    'rear_attack': +4,       // Attacking from behind
    'crossing_obstacle': -2, // Attacking across river/wall
    'in_fortification': -1,  // Attacking from defensive position
    
    // Combat state
    'charging': +2,          // Cavalry/infantry charge
    'pursuing_broken': +3,   // Chasing routed enemy
    'desperate': +1,         // Last stand bonus
    'surprised': -3,         // Caught off guard
    'retreating': -2,        // Fighting withdrawal
    
    // Environmental
    'forest_fighting': -1,   // Dense terrain limits formations
    'night_combat': -2,      // Visibility and coordination issues
    'rain_weather': -1,      // Slippery conditions
    'extreme_heat': -1,      // Exhaustion in armor
    'marsh_terrain': -2,     // Unstable footing
    
    // Range advantage
    'closing_distance_bonus': 0,  // Calculated dynamically
};

/**
 * Check if a weapon is ranged
 * @param {string} weaponName - Name of the weapon
 * @returns {boolean} True if weapon is ranged
 */
function isRangedWeapon(weaponName) {
    const rangedWeapons = [
        'compositeBow', 'bow', 'crossbow', 'sling', 'javelin', 'throwing_axe',
        'han_chinese_crossbow', 'self_bow_professional', 'self_bow_basic',
        'greek_composite_bow', 'persian_recurve_bow', 'parthian_horse_bow',
        'sling_professional', 'javelin_heavy'
    ];
    return rangedWeapons.includes(weaponName);
}

/**
 * Calculate closing distance bonus for ranged units
 * @param {Object} attacker - Attacking unit
 * @param {Object} defender - Defending unit  
 * @param {Object} conditions - Battle conditions
 * @param {boolean} isDefender - True if this unit is the defender
 * @returns {number} Bonus attack rating from range advantage
 */
function calculateClosingDistanceBonus(attacker, defender, conditions = {}, isDefender = false) {
    // Check if attacker has ranged weapons
    const attackerRanged = attacker.weapons && attacker.weapons.some(w => isRangedWeapon(w));
    const defenderRanged = defender.weapons && defender.weapons.some(w => isRangedWeapon(w));
    
    if (!attackerRanged) return 0; // No bonus if attacker isn't ranged
    
    // TEUTOBURG FOREST RULE: Ranged defenders lose range advantage when ambushed
    // Melee attackers get so close that archers can't use their bows effectively
    if (isDefender && conditions.combat_situation === 'ambush' && !defenderRanged) {
        console.log(`Ambush negates range advantage - melee closed distance!`);
        return 0; // No range bonus when surprised by melee
    }
    
    // Base closing distance bonus
    let closingBonus = 0;
    
    if (!defenderRanged) {
        // Ranged vs Melee - Major advantage (6-7 minutes of free volleys)
        closingBonus = 3;
        
        // Reduce bonus based on terrain (harder to maintain range)
        if (conditions.terrain === 'forest') {
            closingBonus = 2; // Trees block some shots, easier to close
        } else if (conditions.terrain === 'urban') {
            closingBonus = 1; // Buildings provide cover
        } else if (conditions.terrain === 'marsh') {
            closingBonus = 2; // Difficult terrain slows advance
        }
        
        // Ambush amplifies advantage (defenders caught in open) - but only for attacker
        if (conditions.combat_situation === 'ambush' && !isDefender) {
            closingBonus += 1; // Reduce ambush bonus to prevent 100/0 outcomes
        }
        
    } else {
        // Ranged vs Ranged - Small advantage for attacker (first volley)
        closingBonus = 1;
        
        if (conditions.combat_situation === 'ambush' && !isDefender) {
            closingBonus += 1; // First shot advantage
        }
    }
    
    // Cap maximum closing distance bonus to prevent extreme outcomes
    return Math.min(closingBonus, 4);
}

/**
 * Calculate total attack rating for a unit
 * @param {Object} unit - Unit with weapon, quality, formation data
 * @param {Object} situation - Combat situation modifiers
 * @param {Object} targetUnit - Target unit for range calculations (optional)
 * @param {boolean} isDefender - Whether this unit is the defender (optional)
 * @returns {number} Total attack rating
 */
function calculateAttackRating(unit, situation = {}, targetUnit = null, isDefender = false) {
    let totalAttack = 0;
    
    // Base weapon attack
    const primaryWeapon = unit.weapons?.[0];
    if (primaryWeapon && WEAPON_ATTACK_RATINGS[primaryWeapon]) {
        totalAttack += WEAPON_ATTACK_RATINGS[primaryWeapon];
    } else {
        totalAttack += 2; // Minimum attack rating
    }
    
    // Training bonus
    const quality = unit.quality || 'levy';
    if (TRAINING_ATTACK_BONUSES[quality]) {
        totalAttack += TRAINING_ATTACK_BONUSES[quality];
    }
    
    // Formation modifier
    const formation = unit.formation || 'line';
    if (FORMATION_ATTACK_MODIFIERS[formation]) {
        totalAttack += FORMATION_ATTACK_MODIFIERS[formation];
    }
    
    // Cavalry vs infantry balance: reduce cavalry bonus vs formed infantry
    if (unit.mounted && targetUnit && !targetUnit.mounted) {
        const defenderFormation = targetUnit.formation || 'line';
        // Well-formed infantry gets defensive bonus vs cavalry
        if (['line', 'phalanx', 'square', 'shield_wall'].includes(defenderFormation)) {
            totalAttack -= 2; // Further reduce cavalry dominance vs prepared infantry
        } else {
            totalAttack -= 1; // Even loose infantry has some anti-cavalry benefit
        }
    }
    
    // Situational modifiers
    Object.keys(situation).forEach(modifier => {
        if (SITUATIONAL_ATTACK_MODIFIERS[modifier]) {
            totalAttack += SITUATIONAL_ATTACK_MODIFIERS[modifier];
        }
    });
    
    // Apply closing distance bonus if target unit provided
    if (targetUnit) {
        const closingBonus = calculateClosingDistanceBonus(unit, targetUnit, situation, isDefender);
        if (closingBonus > 0) {
            totalAttack += closingBonus;
            console.log(`Closing distance bonus: +${closingBonus} (ranged advantage)`);
        }
    }
    
    // Ensure minimum attack of 1
    return Math.max(1, totalAttack);
}

/**
 * Get weapon-specific bonuses vs armor types
 * @param {string} weaponType - Weapon identifier
 * @param {string} targetArmorType - Armor type being attacked
 * @returns {number} Bonus attack rating vs this armor
 */
function getAntiArmorBonus(weaponType, targetArmorType) {
    const antiArmorBonuses = {
        // Blunt weapons vs heavy armor
        'clubs': { heavy_armor: 2, medium_armor: 1 },
        'mace': { heavy_armor: 3, medium_armor: 2 },
        'heavy_mace': { heavy_armor: 4, medium_armor: 3 },
        'sling': { heavy_armor: 2, medium_armor: 1 },
        'sling_professional': { heavy_armor: 3, medium_armor: 2 },
        
        // Piercing weapons vs light armor
        'spear_basic': { no_armor: 1, light_armor: 2 },
        'spear_professional': { no_armor: 2, light_armor: 3 },
        'two_handed_spear': { no_armor: 2, light_armor: 3 },
        'macedonian_sarissa': { no_armor: 2, light_armor: 3 },
        'han_chinese_crossbow': { light_armor: 2, medium_armor: 1 },
        
        // Axes vs shields and medium armor
        'battle_axe': { medium_armor: 1 },
        'great_axe': { medium_armor: 2, heavy_armor: 1 },
        'germanic_throwing_axe': { light_armor: 1 }
    };
    
    return antiArmorBonuses[weaponType]?.[targetArmorType] || 0;
}

module.exports = {
    WEAPON_ATTACK_RATINGS,
    TRAINING_ATTACK_BONUSES,
    FORMATION_ATTACK_MODIFIERS,
    SITUATIONAL_ATTACK_MODIFIERS,
    calculateAttackRating,
    getAntiArmorBonus,
    isRangedWeapon,
    calculateClosingDistanceBonus
};
