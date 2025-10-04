// src/game/battleEngine.js
// Complete combat resolution system based on historical research

const { Op } = require('sequelize');

/**
 * Core Combat Resolution Engine
 * Implements historically-accurate combat mathematics with formation interactions,
 * weapon effectiveness, environmental modifiers, and cultural bonuses
 */

// Formation interaction matrix - historically researched bonuses/penalties
const FORMATION_INTERACTIONS = {
    // Attacker formation vs Defender formation = modifier
    'phalanx_vs_cavalry': { attack: +8, defense: +3 },
    'phalanx_vs_flanking': { attack: -6, defense: -4 },
    'phalanx_vs_phalanx': { attack: 0, defense: +2 },
    'phalanx_vs_individual': { attack: +4, defense: +2 },
    
    'testudo_vs_missiles': { attack: 0, defense: +6 },
    'testudo_vs_melee': { attack: -3, defense: +1 },
    'testudo_movement': { movement: -50 },
    
    'cavalry_charge_vs_infantry': { attack: +6, requires_movement: 3 },
    'cavalry_vs_spears': { attack: -4, defense: -2 },
    'cavalry_vs_archers': { attack: +4, defense: +1 },
    
    'berserker_fury': { attack: +4, defense: -2, immune_fear: true },
    'shield_wall': { defense: +3, missile_defense: +2 }
};

// Weapon effectiveness vs armor types (penetration percentages)
const WEAPON_EFFECTIVENESS = {
    // Weapon type vs armor type = effectiveness modifier
    'composite_bow_vs_no_armor': 0.90,
    'composite_bow_vs_light_armor': 0.60,
    'composite_bow_vs_heavy_armor': 0.40,
    'composite_bow_vs_mail': 0.40, // 40% at 100m from research
    
    'crossbow_vs_no_armor': 0.95,
    'crossbow_vs_light_armor': 0.80,
    'crossbow_vs_heavy_armor': 0.70,
    'crossbow_vs_mail': 0.90, // Ignores most armor
    
    'sarissa_vs_cavalry': 0.85, // Near immunity to frontal charges
    'sarissa_vs_infantry': 0.75,
    'sarissa_vs_flanking': 0.20, // Major vulnerability
    
    'gladius_vs_no_armor': 0.85,
    'gladius_vs_light_armor': 0.70,
    'gladius_vs_heavy_armor': 0.55,
    
    'falx_vs_shields': 1.0, // Ignores shields, two-handed
    'falx_vs_armor': 0.80,
    
    'wootz_steel_vs_any': 0.90, // Superior metallurgy ignores 10% of armor
};

// Environmental modifiers based on research data
const ENVIRONMENTAL_EFFECTS = {
    weather: {
        clear: { all: 1.0 },
        light_rain: { 
            composite_bow: 0.8, // -2 range from wet strings
            movement: 0.9, // -1 from muddy ground
            visibility: 0.9 
        },
        heavy_rain: {
            composite_bow: 0.4, // -4 range, strings lose tension
            wooden_shields: { weight: 1.5, defense: 0.9 }, // +50% weight, -1 defense
            heavy_armor_movement: 0.9, // mud interaction
            formation_coordination: 0.8 // -2 formation bonus
        },
        fog: {
            visibility: 0.6, // -4 hexes
            ambush_bonus: 1.4, // +4 attack
            formation_coordination: 0.7, // -3 formation
            ranged_targeting: 0.8 // -2 ranged
        },
        extreme_heat: {
            heavy_armor: { endurance: 0.5, turns_before_penalty: 5 }, // 2.1x energy expenditure
            desert_culture_immunity: true
        },
        wind: {
            archery_with_wind: 1.2, // +2 with wind
            archery_against_wind: 0.8, // -2 against wind
            fire_weapons: 1.3, // +3 spread
            dust_visibility: 0.8 // -2 visibility in dry terrain
        },
        cold: {
            metal_weapon_breakage: 1.15, // +15% breakage
            bronze_equipment_failure: 1.20 // +20% failure
        }
    },
    
    terrain: {
        open_plains: { 
            cavalry_charge: 1.2, // +2 effectiveness
            formation_bonus: 1.0, // optimal conditions
            visibility: 1.0
        },
        light_hills: {
            uphill_attack: 0.7, // -3 penalty attacking uphill
            elevated_missile: 1.1, // +1 range for elevated units
            elevated_defense: 1.2 // +2 defense on high ground
        },
        steep_mountains: {
            heavy_movement: 0.4, // -3 movement heavy units
            medium_movement: 0.6, // -2 movement medium units  
            light_movement: 0.8, // -1 movement light units
            formation_fighting: 0.2, // -5 formation effectiveness
            defensive_multiplier: 1.4 // +4 for defenders
        },
        light_forest: {
            formation_fighting: 0.8, // -2 effectiveness
            cavalry_charge: 0.8, // -2 movement and charge
            ambush_bonus: 1.2, // +2 for light troops
            ranged_cover: 0.9 // -1 due to tree cover
        },
        dense_forest: {
            formation_fighting: 0.2, // -5 impossible to maintain
            cavalry_effectiveness: 0.2, // -4 horses cannot maneuver
            ambush_bonus: 1.6, // +6 for forest specialists
            ranged_effectiveness: 0.4 // -3 trees block shots
        },
        marshland: {
            heavy_movement: 0.4, // -3 movement (sinking)
            formation_stability: 0.4, // -3 unstable ground
            disease_risk: 0.15, // +15% per turn
            light_penalty: 0.9 // only -1 for light units
        }
    }
};

// Cultural bonuses and immunities
const CULTURAL_MODIFIERS = {
    'Roman': {
        formation_discipline: 1.1,
        engineering_bonus: 1.2,
        tactical_flexibility: 1.1
    },
    'Macedonian': {
        sarissa_bonus: 1.3,
        combined_arms: 1.1
    },
    'Celtic': {
        charge_bonus: 1.1,
        intimidation: 1.1,
        forest_bonus: 1.2
    },
    'Han Chinese': {
        crossbow_coordination: 1.2,
        siege_bonus: 1.1
    },
    'Sarmatian': {
        horse_archery: 1.2,
        feigned_retreat: 1.3
    },
    'Berber': {
        desert_immunity: true,
        raid_bonus: 1.2
    },
    'Spartan': {
        phalanx_discipline: 1.3,
        never_retreat: true
    },
    'Mauryan': {
        elephant_coordination: 1.4,
        wootz_steel: 1.1
    }
};

/**
 * Main combat resolution function
 * @param {Object} attackingForce - Attacking units with equipment and formations
 * @param {Object} defendingForce - Defending units with equipment and formations  
 * @param {Object} battleConditions - Terrain, weather, and environmental factors
 * @param {Object} tacticalContext - Turn number, morale, special conditions
 * @returns {Object} Combat results with casualties, morale changes, tactical developments
 */
async function resolveCombat(attackingForce, defendingForce, battleConditions, tacticalContext) {
    try {
        // Step 1: Calculate base combat values
        const attackerStats = calculateUnitEffectiveness(attackingForce, battleConditions, 'attack');
        const defenderStats = calculateUnitEffectiveness(defendingForce, battleConditions, 'defense');
        
        // Step 2: Apply formation interactions
        const formationModifiers = calculateFormationInteractions(
            attackingForce.formation, 
            defendingForce.formation
        );
        
        // Step 3: Apply environmental effects
        const environmentalModifiers = calculateEnvironmentalEffects(
            battleConditions,
            attackingForce,
            defendingForce
        );
        
        // Step 4: Calculate weapon vs armor effectiveness
        const weaponEffectiveness = calculateWeaponEffectiveness(
            attackingForce.equipment,
            defendingForce.equipment
        );
        
        // Step 5: Apply cultural bonuses
        const culturalEffects = applyCulturalModifiers(
            attackingForce.culture,
            defendingForce.culture,
            battleConditions
        );
        
        // Step 6: Calculate final combat resolution
        const combatResult = calculateCombatOutcome(
            attackerStats,
            defenderStats,
            formationModifiers,
            environmentalModifiers,
            weaponEffectiveness,
            culturalEffects,
            tacticalContext
        );
        
        // Step 7: Determine casualties and morale effects
        const casualties = calculateCasualties(combatResult, attackingForce, defendingForce);
        const moraleChanges = calculateMoraleEffects(combatResult, tacticalContext);
        
        // Step 8: Generate tactical developments
        const tacticalDevelopments = determineTacticalDevelopments(
            combatResult,
            battleConditions,
            casualties
        );
        
        return {
            combatResult,
            casualties,
            moraleChanges,
            tacticalDevelopments,
            environmentalEffects: environmentalModifiers,
            nextTurnModifiers: calculateNextTurnEffects(combatResult, battleConditions)
        };
        
    } catch (error) {
        console.error('Combat resolution error:', error);
        throw new Error(`Combat resolution failed: ${error.message}`);
    }
}

/**
 * Calculate unit effectiveness based on equipment, training, and current state
 */
function calculateUnitEffectiveness(force, conditions, combatType) {
    let effectiveness = {
        attack: 0,
        defense: 0,
        mobility: 0,
        morale: force.currentMorale || 100
    };
    
    // Base stats from unit type and equipment
    force.units.forEach(unit => {
        const baseStats = getUnitBaseStats(unit.type, unit.equipment);
        const veteranBonus = getVeteranBonus(unit.experience);
        const sizeMultiplier = unit.currentStrength / unit.maxStrength;
        
        effectiveness.attack += (baseStats.attack + veteranBonus) * sizeMultiplier;
        effectiveness.defense += (baseStats.defense + veteranBonus) * sizeMultiplier;
        effectiveness.mobility += baseStats.mobility * sizeMultiplier;
    });
    
    return effectiveness;
}

/**
 * Calculate formation interaction bonuses and penalties
 */
function calculateFormationInteractions(attackerFormation, defenderFormation) {
    const key = `${attackerFormation}_vs_${defenderFormation}`;
    return FORMATION_INTERACTIONS[key] || { attack: 0, defense: 0 };
}

/**
 * Apply environmental effects based on weather and terrain
 */
function calculateEnvironmentalEffects(conditions, attackingForce, defendingForce) {
    const effects = {
        attacker: { attack: 1.0, defense: 1.0, mobility: 1.0 },
        defender: { attack: 1.0, defense: 1.0, mobility: 1.0 }
    };
    
    // Weather effects
    const weatherEffects = ENVIRONMENTAL_EFFECTS.weather[conditions.weather] || {};
    
    // Terrain effects
    const terrainEffects = ENVIRONMENTAL_EFFECTS.terrain[conditions.terrain] || {};
    
    // Apply cultural immunities
    if (weatherEffects.desert_culture_immunity && 
        (attackingForce.culture === 'Berber' || defendingForce.culture === 'Berber')) {
        // Desert cultures immune to heat effects
    }
    
    // Combine all environmental effects
    Object.assign(effects.attacker, weatherEffects, terrainEffects);
    Object.assign(effects.defender, weatherEffects, terrainEffects);
    
    return effects;
}

/**
 * Calculate weapon effectiveness vs armor types
 */
function calculateWeaponEffectiveness(attackerEquipment, defenderEquipment) {
    let effectiveness = 1.0;
    
    // Primary weapon vs primary armor
    const weaponType = attackerEquipment.primaryWeapon;
    const armorType = defenderEquipment.armor || 'no_armor';
    
    const key = `${weaponType}_vs_${armorType}`;
    effectiveness *= WEAPON_EFFECTIVENESS[key] || 0.7;
    
    // Special weapon properties
    if (weaponType === 'wootz_steel') {
        effectiveness = Math.max(effectiveness, 0.9); // Always 90% minimum
    }
    
    if (weaponType === 'falx' && defenderEquipment.shield) {
        effectiveness = 1.0; // Ignores shields
    }
    
    return effectiveness;
}

/**
 * Apply cultural modifiers and special abilities
 */
function applyCulturalModifiers(attackerCulture, defenderCulture, conditions) {
    const attackerMods = CULTURAL_MODIFIERS[attackerCulture] || {};
    const defenderMods = CULTURAL_MODIFIERS[defenderCulture] || {};
    
    let modifiers = {
        attacker: { ...attackerMods },
        defender: { ...defenderMods }
    };
    
    // Apply conditional cultural bonuses
    if (conditions.terrain === 'desert' && attackerMods.desert_immunity) {
        modifiers.attacker.all_stats = 1.2;
    }
    
    if (conditions.terrain.includes('forest') && attackerMods.forest_bonus) {
        modifiers.attacker.attack *= attackerMods.forest_bonus;
    }
    
    return modifiers;
}

/**
 * Calculate final combat outcome from all modifiers
 */
function calculateCombatOutcome(attackerStats, defenderStats, formationMods, 
                               environmentalMods, weaponEffectiveness, culturalMods, context) {
    
    // Apply all modifiers to base stats
    const finalAttackerPower = attackerStats.attack * 
        (1 + formationMods.attack / 10) *
        environmentalMods.attacker.attack *
        weaponEffectiveness *
        (culturalMods.attacker.attack || 1.0);
        
    const finalDefenderPower = defenderStats.defense *
        (1 + formationMods.defense / 10) *
        environmentalMods.defender.defense *
        (culturalMods.defender.defense || 1.0);
    
    // Calculate combat ratio and outcome
    const combatRatio = finalAttackerPower / finalDefenderPower;
    
    // Determine tactical result based on combat ratio
    let result = 'stalemate';
    let intensity = 'moderate';
    
    if (combatRatio > 1.5) {
        result = 'attacker_major_victory';
        intensity = 'decisive';
    } else if (combatRatio > 1.2) {
        result = 'attacker_victory';
        intensity = 'significant';
    } else if (combatRatio > 1.0) {
        result = 'attacker_advantage';
        intensity = 'slight';
    } else if (combatRatio > 0.8) {
        result = 'defender_advantage';  
        intensity = 'slight';
    } else if (combatRatio > 0.6) {
        result = 'defender_victory';
        intensity = 'significant';
    } else {
        result = 'defender_major_victory';
        intensity = 'decisive';
    }
    
    return {
        result,
        intensity,
        combatRatio,
        attackerPower: finalAttackerPower,
        defenderPower: finalDefenderPower
    };
}

/**
 * Calculate casualties based on combat outcome
 */
function calculateCasualties(combatResult, attackingForce, defendingForce) {
    const baseCasualtyRate = {
        'decisive': { winner: 0.05, loser: 0.25 },
        'significant': { winner: 0.08, loser: 0.18 },
        'slight': { winner: 0.10, loser: 0.15 },
        'moderate': { winner: 0.12, loser: 0.12 }
    };
    
    const rates = baseCasualtyRate[combatResult.intensity];
    
    let attackerCasualties = [];
    let defenderCasualties = [];
    
    // Determine winner/loser for casualty calculation
    const attackerIsWinner = combatResult.result.includes('attacker');
    const attackerRate = attackerIsWinner ? rates.winner : rates.loser;
    const defenderRate = attackerIsWinner ? rates.loser : rates.winner;
    
    // Calculate casualties per unit
    attackingForce.units.forEach(unit => {
        const casualties = Math.floor(unit.currentStrength * attackerRate * (Math.random() * 0.4 + 0.8));
        attackerCasualties.push({
            unitId: unit.id,
            casualties: Math.min(casualties, unit.currentStrength),
            type: unit.type
        });
    });
    
    defendingForce.units.forEach(unit => {
        const casualties = Math.floor(unit.currentStrength * defenderRate * (Math.random() * 0.4 + 0.8));
        defenderCasualties.push({
            unitId: unit.id,
            casualties: Math.min(casualties, unit.currentStrength),
            type: unit.type
        });
    });
    
    return {
        attacker: attackerCasualties,
        defender: defenderCasualties
    };
}

/**
 * Calculate morale effects from combat
 */
function calculateMoraleEffects(combatResult, context) {
    const baseMoraleChanges = {
        'attacker_major_victory': { attacker: +15, defender: -20 },
        'attacker_victory': { attacker: +10, defender: -15 },
        'attacker_advantage': { attacker: +5, defender: -8 },
        'stalemate': { attacker: -2, defender: -2 },
        'defender_advantage': { attacker: -8, defender: +5 },
        'defender_victory': { attacker: -15, defender: +10 },
        'defender_major_victory': { attacker: -20, defender: +15 }
    };
    
    return baseMoraleChanges[combatResult.result] || { attacker: 0, defender: 0 };
}

/**
 * Determine tactical developments for next turn
 */
function determineTacticalDevelopments(combatResult, conditions, casualties) {
    const developments = [];
    
    // Formation changes
    if (combatResult.intensity === 'decisive') {
        developments.push('formation_disruption');
    }
    
    // Environmental changes
    if (conditions.weather === 'fog' && combatResult.result.includes('advantage')) {
        developments.push('visibility_clearing');
    }
    
    // Tactical opportunities
    if (casualties.attacker.length > casualties.defender.length) {
        developments.push('flanking_opportunity');
    }
    
    return developments;
}

/**
 * Calculate effects that carry into next turn
 */
function calculateNextTurnEffects(combatResult, conditions) {
    const effects = {
        moraleModifiers: {},
        positionChanges: {},
        specialConditions: []
    };
    
    // Winners may gain positional advantage
    if (combatResult.intensity === 'significant' || combatResult.intensity === 'decisive') {
        effects.positionChanges.winner_advance = true;
    }
    
    // Environmental effects that persist
    if (conditions.weather === 'heavy_rain') {
        effects.specialConditions.push('muddy_terrain');
    }
    
    return effects;
}

/**
 * Helper function to get base unit statistics
 */
function getUnitBaseStats(unitType, equipment) {
    const baseStats = {
        'professional': { attack: 8, defense: 7, mobility: 6 },
        'militia': { attack: 5, defense: 5, mobility: 7 },
        'levy': { attack: 3, defense: 4, mobility: 8 },
        'cavalry': { attack: 9, defense: 6, mobility: 10 },
        'archers': { attack: 7, defense: 4, mobility: 7 },
        'elite': { attack: 10, defense: 9, mobility: 8 }
    };
    
    const stats = baseStats[unitType] || baseStats['militia'];
    
    // Equipment modifiers
    if (equipment.heavyArmor) {
        stats.defense += 3;
        stats.mobility -= 2;
    }
    if (equipment.shields) {
        stats.defense += 2;
    }
    if (equipment.pikes || equipment.spears) {
        stats.attack += 2;
        stats.defense += 1;
    }
    
    return stats;
}

/**
 * Calculate veteran experience bonus
 */
function getVeteranBonus(experience) {
    if (experience >= 11) return 3; // Legendary
    if (experience >= 6) return 2;  // Elite veteran
    if (experience >= 3) return 1;  // Veteran
    if (experience >= 1) return 0;  // Seasoned
    return -1; // Recruit penalty
}

module.exports = {
    resolveCombat,
    calculateUnitEffectiveness,
    calculateFormationInteractions,
    calculateEnvironmentalEffects,
    FORMATION_INTERACTIONS,
    WEAPON_EFFECTIVENESS,
    ENVIRONMENTAL_EFFECTS,
    CULTURAL_MODIFIERS
};