// src/game/combat/breakthroughMechanics.js
// Breakthrough mechanics to prevent stalemates in Combat System v2.0
// Addresses specific issues: cavalry vs phalanx stalemates, ranged vs melee grinding

/**
 * Breakthrough thresholds and multipliers
 */
const BREAKTHROUGH_CONFIG = {
    // Damage threshold - if damage per turn is below this, apply breakthrough mechanics
    minDamageThreshold: 5.0, // Increased from 2.0 to 5.0
    
    // Stalemate detection - if both armies deal similar damage
    stalemateThreshold: 0.5, // If damage difference < 0.5 per turn
    
    // Turn thresholds for breakthrough escalation
    earlyBreakthroughTurn: 3, // Earlier breakthrough trigger
    lateBreakthroughTurn: 7,
    
    // Multipliers
    baseBreakthroughMultiplier: 2.0, // Increased from 1.5
    lateBreakthroughMultiplier: 3.0, // Increased from 2.0
    desperationMultiplier: 4.0 // Increased from 2.5
};

/**
 * Formation breakthrough bonuses
 * Some formations are better at breaking through enemy lines
 */
const FORMATION_BREAKTHROUGH_BONUSES = {
    // Offensive formations excel at breakthrough
    'wedge': 3,              // Concentrated assault, maximum breakthrough
    'germanic_boar': 3,      // Wedge charge formation
    'celtic_fury': 4,        // Berserker charge, ignores defense
    'loose': 1,              // Individual fighting, minor breakthrough
    'crescent': 1,           // Envelopment, minor breakthrough
    
    // Defensive formations poor at breakthrough but resist it
    'phalanx': -2,           // Rigid formation, poor breakthrough
    'testudo': -3,           // Turtle formation, minimal breakthrough
    'shield_wall': -2,       // Wall formation, defensive
    'square': -1,            // Anti-cavalry, defensive
    
    // Balanced formations
    'line': 0,               // Standard battle line
    'column': -1,            // March formation
    'echelon': 0,            // Staggered formation
    
    // Cultural formations
    'roman_manipular': 1,    // Disciplined flexibility
    'macedonian_phalanx': -2, // Pike wall, defensive
    'parthian_feint': 2,     // Mobile tactics, breakthrough via mobility
    'chinese_five_elements': 0 // Balanced system
};

/**
 * Unit type breakthrough modifiers
 * Different unit types have different breakthrough capabilities
 */
const UNIT_BREAKTHROUGH_MODIFIERS = {
    // Mounted units excel at breakthrough
    mounted: {
        attackMultiplier: 2.0,    // Cavalry charge breakthrough
        defenseReduction: 0.7,    // Harder to stop mounted breakthrough
        specialRules: ['charge_bonus', 'formation_disruption']
    },
    
    // Heavy infantry can break through with momentum
    heavy_infantry: {
        attackMultiplier: 1.5,
        defenseReduction: 0.9,
        specialRules: ['armor_penetration']
    },
    
    // Ranged units poor at breakthrough but can suppress
    ranged_primary: {
        attackMultiplier: 0.8,
        defenseReduction: 1.2,    // Easier to break through ranged lines
        specialRules: ['suppression_fire']
    },
    
    // Elite units better at breakthrough
    elite: {
        attackMultiplier: 1.3,
        defenseReduction: 0.8,
        specialRules: ['elite_training']
    }
};

/**
 * Special breakthrough rules for specific matchups
 */
const MATCHUP_BREAKTHROUGH_RULES = {
    // Cavalry vs Anti-cavalry formations
    'cavalry_vs_phalanx': {
        condition: (attacker, defender) => attacker.mounted && defender.formation === 'phalanx',
        rule: 'flanking_attempt',
        effect: {
            description: 'Cavalry attempts to flank phalanx',
            chaosIncrease: 2,
            breakthroughBonus: 2,
            specialText: 'Cavalry seeks gaps in pike wall'
        }
    },
    
    'cavalry_vs_spears': {
        condition: (attacker, defender) => attacker.mounted && defender.weapons.some(w => w.includes('spear')),
        rule: 'anti_cavalry_defense',
        effect: {
            description: 'Spears form hedge against cavalry',
            attackPenalty: -3,
            defensiveBonus: 2,
            specialText: 'Spear points deter cavalry charges'
        }
    },
    
    // Infantry vs Ranged
    'infantry_vs_ranged': {
        condition: (attacker, defender) => !attacker.mounted && isRangedPrimary(defender),
        rule: 'closing_distance',
        effect: {
            description: 'Infantry closes distance on ranged units',
            turnProgressionBonus: 1.5, // Gets stronger each turn
            breakthroughBonus: 1,
            specialText: 'Infantry advances under arrow fire'
        }
    },
    
    // Berserkers vs Formations
    'berserker_vs_formation': {
        condition: (attacker, defender) => attacker.formation === 'celtic_fury',
        rule: 'berserker_frenzy',
        effect: {
            description: 'Berserkers ignore formation discipline',
            ignoreDefenseBonus: 0.5, // Ignore half of formation defense bonuses
            moraleBonus: 2,
            specialText: 'Wild charge breaks formation lines'
        }
    }
};

/**
 * Determine if a unit is primarily ranged
 */
function isRangedPrimary(unit) {
    if (!unit.weapons || unit.weapons.length === 0) return false;
    const primaryWeapon = unit.weapons[0];
    const rangedWeapons = ['bow', 'crossbow', 'sling', 'javelin', 'plumbatae'];
    return rangedWeapons.some(ranged => primaryWeapon.includes(ranged));
}

/**
 * Determine if a unit is heavy infantry
 */
function isHeavyInfantry(unit) {
    return !unit.mounted && 
           (unit.armor === 'heavy_armor' || unit.armor === 'medium_armor') &&
           unit.qualityType !== 'levy';
}

/**
 * Get unit breakthrough classification
 */
function getUnitBreakthroughType(unit) {
    if (unit.mounted) return 'mounted';
    if (isRangedPrimary(unit)) return 'ranged_primary';
    if (isHeavyInfantry(unit)) return 'heavy_infantry';
    if (unit.qualityType === 'veteran_mercenary' || unit.qualityType === 'elite_guard') return 'elite';
    return 'standard';
}

/**
 * Calculate breakthrough multiplier for a unit
 */
function calculateBreakthroughMultiplier(unit, situation = {}) {
    let multiplier = 1.0;
    
    // Base unit type modifier
    const unitType = getUnitBreakthroughType(unit);
    if (UNIT_BREAKTHROUGH_MODIFIERS[unitType]) {
        multiplier *= UNIT_BREAKTHROUGH_MODIFIERS[unitType].attackMultiplier;
    }
    
    // Formation modifier
    const formation = unit.formation || 'line';
    const formationBonus = FORMATION_BREAKTHROUGH_BONUSES[formation] || 0;
    multiplier += formationBonus * 0.1; // Convert to multiplier (e.g., +3 becomes +0.3)
    
    // Turn progression (breakthrough gets stronger over time in stalemates)
    if (situation.turn >= BREAKTHROUGH_CONFIG.earlyBreakthroughTurn) {
        const progressionBonus = Math.min(
            (situation.turn - BREAKTHROUGH_CONFIG.earlyBreakthroughTurn) * 0.1,
            0.5 // Cap at +50%
        );
        multiplier += progressionBonus;
    }
    
    // Desperation bonus (last stand when heavily damaged)
    const strengthRatio = unit.currentStrength / unit.maxStrength;
    if (strengthRatio < 0.3) {
        multiplier *= BREAKTHROUGH_CONFIG.desperationMultiplier;
    } else if (strengthRatio < 0.5) {
        multiplier *= 1.5;
    }
    
    return Math.max(0.5, multiplier); // Minimum 0.5x multiplier
}

/**
 * Apply breakthrough mechanics to combat resolution
 */
function applyBreakthroughMechanics(attackingArmy, defendingArmy, battleState) {
    const turn = battleState.turn || 1;
    const battleHistory = battleState.damageHistory || [];
    
    // Check if breakthrough conditions are met
    const needsBreakthrough = detectStalemate(battleHistory, turn);
    
    if (!needsBreakthrough) {
        return { breakthroughApplied: false };
    }
    
    // Calculate breakthrough effects
    const breakthroughEffects = {
        attackingArmy: {
            attackMultiplier: 1.0,
            defenseModifier: 1.0,
            specialRules: []
        },
        defendingArmy: {
            attackMultiplier: 1.0,
            defenseModifier: 1.0,
            specialRules: []
        }
    };
    
    // Apply unit-specific breakthrough bonuses
    attackingArmy.units.forEach(unit => {
        if (unit.currentStrength > 0) {
            const breakthrough = calculateBreakthroughMultiplier(unit, { turn });
            breakthroughEffects.attackingArmy.attackMultiplier = Math.max(
                breakthroughEffects.attackingArmy.attackMultiplier,
                breakthrough
            );
        }
    });
    
    defendingArmy.units.forEach(unit => {
        if (unit.currentStrength > 0) {
            const breakthrough = calculateBreakthroughMultiplier(unit, { turn });
            breakthroughEffects.defendingArmy.attackMultiplier = Math.max(
                breakthroughEffects.defendingArmy.attackMultiplier,
                breakthrough
            );
        }
    });
    
    // Check for special matchup rules
    const specialRules = detectSpecialMatchupRules(attackingArmy, defendingArmy);
    specialRules.forEach(rule => {
        applySpecialRule(rule, breakthroughEffects, turn);
    });
    
    return {
        breakthroughApplied: true,
        effects: breakthroughEffects,
        specialRules,
        turn
    };
}

/**
 * Detect if breakthrough mechanics should trigger
 */
function detectStalemate(battleHistory, turn) {
    if (turn < BREAKTHROUGH_CONFIG.earlyBreakthroughTurn) return false;
    
    // Check recent damage history
    if (battleHistory.length < 3) return true; // Early trigger if no history
    
    const recentDamage = battleHistory.slice(-3);
    const avgDamage = recentDamage.reduce((sum, turn) => {
        return sum + (turn.army1Damage || 0) + (turn.army2Damage || 0);
    }, 0) / recentDamage.length;
    
    return avgDamage < BREAKTHROUGH_CONFIG.minDamageThreshold;
}

/**
 * Detect special matchup rules
 */
function detectSpecialMatchupRules(army1, army2) {
    const rules = [];
    
    Object.entries(MATCHUP_BREAKTHROUGH_RULES).forEach(([ruleName, rule]) => {
        // Check army1 vs army2
        if (checkMatchupCondition(army1, army2, rule.condition)) {
            rules.push({ ...rule, attacker: 'army1', defender: 'army2' });
        }
        // Check army2 vs army1  
        if (checkMatchupCondition(army2, army1, rule.condition)) {
            rules.push({ ...rule, attacker: 'army2', defender: 'army1' });
        }
    });
    
    return rules;
}

/**
 * Check if a matchup condition is met
 */
function checkMatchupCondition(attacker, defender, conditionFn) {
    // Simplified check using army majority characteristics
    const attackerMajority = getMajorityCharacteristics(attacker);
    const defenderMajority = getMajorityCharacteristics(defender);
    
    return conditionFn(attackerMajority, defenderMajority);
}

/**
 * Get majority characteristics of an army
 */
function getMajorityCharacteristics(army) {
    const totalStrength = army.units.reduce((sum, unit) => sum + unit.currentStrength, 0);
    let mountedStrength = 0;
    let rangedStrength = 0;
    const formations = {};
    const weapons = [];
    
    army.units.forEach(unit => {
        const strength = unit.currentStrength;
        if (unit.mounted) mountedStrength += strength;
        if (isRangedPrimary(unit)) rangedStrength += strength;
        
        const formation = unit.formation || army.formation || 'line';
        formations[formation] = (formations[formation] || 0) + strength;
        
        if (unit.weapons) weapons.push(...unit.weapons);
    });
    
    const majorityFormation = Object.keys(formations).reduce((a, b) => 
        formations[a] > formations[b] ? a : b
    );
    
    return {
        mounted: mountedStrength / totalStrength > 0.5,
        rangedPrimary: rangedStrength / totalStrength > 0.5,
        formation: majorityFormation,
        weapons,
        culture: army.culture
    };
}

/**
 * Apply a special rule effect
 */
function applySpecialRule(rule, effects, turn) {
    const effect = rule.effect;
    const target = effects[rule.attacker === 'army1' ? 'attackingArmy' : 'defendingArmy'];
    
    if (!target) return; // Safety check
    
    if (effect.breakthroughBonus) {
        target.attackMultiplier += effect.breakthroughBonus * 0.1;
    }
    
    if (effect.attackPenalty) {
        target.attackMultiplier += effect.attackPenalty * 0.1;
    }
    
    if (effect.turnProgressionBonus) {
        const progression = Math.min(turn * effect.turnProgressionBonus * 0.05, 0.5);
        target.attackMultiplier += progression;
    }
    
    if (effect.specialText) {
        target.specialRules.push(effect.specialText);
    }
}

module.exports = {
    BREAKTHROUGH_CONFIG,
    FORMATION_BREAKTHROUGH_BONUSES,
    UNIT_BREAKTHROUGH_MODIFIERS,
    MATCHUP_BREAKTHROUGH_RULES,
    applyBreakthroughMechanics,
    calculateBreakthroughMultiplier,
    detectStalemate,
    isRangedPrimary,
    isHeavyInfantry
};