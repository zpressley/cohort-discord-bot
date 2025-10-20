// src/game/combat/preparationCalculator.js
// Preparation calculation system for Combat System v2.0
// Calculates unit preparation level (1.0-4.0) as chaos divisor
// 
// Last Updated: 2025-10-20
// Version: 2.0.0 - Chaos divisor system
// Dependencies: culturalModifiers.js

/**
 * Time & Position preparation bonuses (+0.5 each)
 * Did you set up properly?
 */
const TIME_POSITION_BONUSES = {
    'waitedOneTurn': 0.3,           // Spent turn preparing (not caught moving)
    'defendingPreparedPosition': 0.3, // Pre-positioned defense
    'highGround': 0.3,              // Claimed elevation advantage
    'fortifiedPosition': 0.4        // Behind walls/earthworks (slightly higher)
};

/**
 * Intelligence & Knowledge bonuses (+0.3 each)
 * Do you know what's coming?
 */
const INTELLIGENCE_BONUSES = {
    'scoutsDeployed': 0.3,          // Sent scouts, have intel
    'foughtThisEnemyBefore': 0.3,   // Veterans remember their tactics
    'identifiedEnemyType': 0.3,     // Know what unit type approaching
    'anticipatedAttack': 0.3        // Expected this assault (not surprised)
};

/**
 * Coordination & Command bonuses (+0.3 each)
 * Is everyone working together?
 */
const COORDINATION_BONUSES = {
    'commanderPresent': 0.3,        // Commander within 3 tiles
    'coordinatedAttack': 0.3,       // Multiple units acting together
    'formationIntact': 0.3,         // Formation hasn't been disrupted
    'clearOrders': 0.3              // Unambiguous command received
};

/**
 * Environmental Adaptation bonuses (+0.3 each)
 * Did you adapt to conditions?
 */
const ENVIRONMENTAL_BONUSES = {
    'weatherPreparation': 0.3,      // Torches for night, waxed strings for rain
    'terrainSuited': 0.3,           // Right unit type for terrain
    'environmentalAdvantage': 0.3,  // Wind at back, sun behind, etc.
    'acclimated': 0.3               // Desert culture in desert, mountain culture in mountains
};

/**
 * Tactical Advantage bonuses (+0.3 each)
 * Do you have the right matchup?
 */
const TACTICAL_ADVANTAGE_BONUSES = {
    'formationCountersEnemy': 0.3,  // Phalanx vs cavalry, testudo vs archers
    'weaponAdvantage': 0.3,         // Longer reach, better penetration
    'freshTroops': 0.3,             // Not exhausted from previous combat
    'supplySecure': 0.3             // Baggage train protected, no supply worries
};

/**
 * Morale & Readiness bonuses (+0.3 each)
 * Are your troops mentally prepared?
 */
const MORALE_READINESS_BONUSES = {
    'highMorale': 0.3,              // >80% morale
    'inspiringLeader': 0.3,         // Legendary officer present
    'culturalAdvantage': 0.3,       // Fighting for homeland, sacred ground, etc.
    'recentVictory': 0.3            // Won last engagement (confidence)
};

/**
 * Preparation penalties (negative modifiers)
 * Things that reduce preparedness
 */
const PREPARATION_PENALTIES = {
    // Caught unprepared
    'surprised': -1.0,               // Didn't see it coming
    'ambushed': -0.5,                // Partial surprise
    'caughtMarching': -0.5,          // In column formation
    
    // Wrong conditions
    'disadvantageousTerrain': -0.5,  // Forest cavalry, plains archers
    'badWeatherUnprepared': -0.5,    // Rain with no prep, night with no torches
    
    // Tactical disadvantage
    'flanked': -0.5,                 // Attacked from side
    'surrounded': -1.0,              // Encircled
    'formationBroken': -0.5,         // Lost cohesion
    'assaultingFortification': -0.5, // Attacking prepared defenses
    
    // Knowledge gap
    'unknownEnemy': -0.5,            // Never fought this culture
    'noIntelligence': -0.5,          // Fighting blind
    
    // Exhaustion
    'exhausted': -0.5,               // Multiple combats this turn
    'lowSupplies': -0.5              // Baggage train lost/destroyed
};

/**
 * ASYMMETRIC ATTACKER BONUSES
 * Bonuses only attackers can get - represent initiative and momentum
 * REBALANCED: Reduced from 0.5 to 0.3 each to prevent preparation dominance
 */
const ATTACKER_ASYMMETRIC_BONUSES = {
    'initiativeAdvantage': 0.3,      // Attacker chooses timing of battle
    'momentumCharge': 0.3,           // Forward momentum in assault
    'chosenBattlefield': 0.3,        // Attacker picked engagement point
    'concentratedAssault': 0.3,      // Can mass forces at breakthrough point
    'tacticalSurprise': 0.3,         // Unexpected attack angle/timing
    'ambushAdvantage': 1.2,          // Major advantage from ambush setup
    'firstStrike': 0.8,              // Get first attack in surprise scenario
    'teutoburg_ambush': 2.0          // Teutoburg Forest-style forest ambush bonus
};

/**
 * ASYMMETRIC DEFENDER BONUSES  
 * Bonuses only defenders can get - represent position and preparation
 * REBALANCED: Reduced from 0.5 to 0.3 each to prevent preparation dominance
 */
const DEFENDER_ASYMMETRIC_BONUSES = {
    'preparedPosition': 0.3,         // Had time to set up defenses
    'terrainKnowledge': 0.3,         // Intimate knowledge of battlefield
    'secureSupplies': 0.3,           // Protected baggage train
    'defensiveOptimization': 0.3,    // Formations optimized for defense
    'interiorLines': 0.3             // Shorter movement distances
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
 * Calculate total preparation for a unit (New 1.0-4.0 Divisor System)
 * @param {Object} unit - Unit with training, formation, experience data
 * @param {Object} conditions - Battle conditions and context
 * @returns {Object} Preparation calculation breakdown
 */
function calculatePreparation(unit, conditions = {}) {
    let totalPreparation = 1.0; // Start at 1.0 (no mitigation)
    const breakdown = {
        timePosition: 0,
        intelligence: 0,
        coordination: 0,
        environmental: 0,
        tactical: 0,
        morale: 0,
        penalties: 0,
        factors: []
    };

    // Time & Position bonuses (0.5 each)
    Object.keys(TIME_POSITION_BONUSES).forEach(factor => {
        if (conditions[factor]) {
            const bonus = TIME_POSITION_BONUSES[factor];
            totalPreparation += bonus;
            breakdown.timePosition += bonus;
            breakdown.factors.push(`${factor}: +${bonus}`);
        }
    });

    // Intelligence & Knowledge bonuses (0.5 each)
    Object.keys(INTELLIGENCE_BONUSES).forEach(factor => {
        if (conditions[factor]) {
            const bonus = INTELLIGENCE_BONUSES[factor];
            totalPreparation += bonus;
            breakdown.intelligence += bonus;
            breakdown.factors.push(`${factor}: +${bonus}`);
        }
    });

    // Coordination & Command bonuses (0.5 each)
    Object.keys(COORDINATION_BONUSES).forEach(factor => {
        if (conditions[factor]) {
            const bonus = COORDINATION_BONUSES[factor];
            totalPreparation += bonus;
            breakdown.coordination += bonus;
            breakdown.factors.push(`${factor}: +${bonus}`);
        }
    });

    // Environmental Adaptation bonuses (0.5 each)
    Object.keys(ENVIRONMENTAL_BONUSES).forEach(factor => {
        if (conditions[factor]) {
            const bonus = ENVIRONMENTAL_BONUSES[factor];
            totalPreparation += bonus;
            breakdown.environmental += bonus;
            breakdown.factors.push(`${factor}: +${bonus}`);
        }
    });

    // Tactical Advantage bonuses (0.5 each)
    Object.keys(TACTICAL_ADVANTAGE_BONUSES).forEach(factor => {
        if (conditions[factor]) {
            const bonus = TACTICAL_ADVANTAGE_BONUSES[factor];
            totalPreparation += bonus;
            breakdown.tactical += bonus;
            breakdown.factors.push(`${factor}: +${bonus}`);
        }
    });

    // Morale & Readiness bonuses (0.5 each)
    Object.keys(MORALE_READINESS_BONUSES).forEach(factor => {
        if (conditions[factor]) {
            const bonus = MORALE_READINESS_BONUSES[factor];
            totalPreparation += bonus;
            breakdown.morale += bonus;
            breakdown.factors.push(`${factor}: +${bonus}`);
        }
    });

    // Apply penalties
    Object.keys(PREPARATION_PENALTIES).forEach(penalty => {
        if (conditions[penalty]) {
            const penaltyValue = PREPARATION_PENALTIES[penalty];
            totalPreparation += penaltyValue; // Already negative
            breakdown.penalties += penaltyValue;
            breakdown.factors.push(`${penalty}: ${penaltyValue}`);
        }
    });

    // Apply asymmetric bonuses based on role
    if (conditions.isAttacker) {
        Object.keys(ATTACKER_ASYMMETRIC_BONUSES).forEach(bonus => {
            if (conditions[bonus]) {
                const bonusValue = ATTACKER_ASYMMETRIC_BONUSES[bonus];
                totalPreparation += bonusValue;
                breakdown.tactical += bonusValue;
                breakdown.factors.push(`ATTACKER ${bonus}: +${bonusValue}`);
            }
        });
    }
    
    if (conditions.isDefender) {
        Object.keys(DEFENDER_ASYMMETRIC_BONUSES).forEach(bonus => {
            if (conditions[bonus]) {
                const bonusValue = DEFENDER_ASYMMETRIC_BONUSES[bonus];
                totalPreparation += bonusValue;
                breakdown.tactical += bonusValue;
                breakdown.factors.push(`DEFENDER ${bonus}: +${bonusValue}`);
            }
        });
    }

    // Cap at reasonable bounds (0.5 minimum - even disaster has some prep, 4.0 maximum - legendary)
    const finalPreparation = Math.max(0.5, Math.min(4.0, totalPreparation));

    return {
        preparationLevel: finalPreparation,
        rawTotal: totalPreparation,
        capped: totalPreparation > 4.0 || totalPreparation < 0.5,
        breakdown,
        description: getNewPreparationDescription(finalPreparation)
    };
}

/**
 * Get descriptive text for new preparation divisor system
 * @param {number} preparationLevel - Preparation level 0.5-4.0
 * @returns {string} Description of unit readiness
 */
function getNewPreparationDescription(preparationLevel) {
    if (preparationLevel >= 3.5) {
        return `Legendary preparation (${preparationLevel.toFixed(1)}) - Near-masterful chaos mitigation`;
    } else if (preparationLevel >= 3.0) {
        return `Exceptional preparation (${preparationLevel.toFixed(1)}) - Excellent chaos mitigation (Caesar-level)`;
    } else if (preparationLevel >= 2.5) {
        return `Very well prepared (${preparationLevel.toFixed(1)}) - Strong chaos mitigation`;
    } else if (preparationLevel >= 2.0) {
        return `Well prepared (${preparationLevel.toFixed(1)}) - Good chaos mitigation (halves chaos)`;
    } else if (preparationLevel >= 1.5) {
        return `Adequately prepared (${preparationLevel.toFixed(1)}) - Moderate chaos mitigation`;
    } else if (preparationLevel >= 1.0) {
        return `Basic preparation (${preparationLevel.toFixed(1)}) - Minimal chaos mitigation`;
    } else {
        return `Poorly prepared (${preparationLevel.toFixed(1)}) - Chaos amplified!`;
    }
}

/**
 * Legacy description function for backward compatibility
 */
function getPreparationDescription(preparationLevel) {
    return getNewPreparationDescription(preparationLevel);
}

/**
 * Simple preparation adapter for balance testing with asymmetric bonuses
 * Maps old unit format to new preparation conditions
 * @param {Object} unit - Legacy unit format
 * @param {Object} battleConditions - Battle conditions
 * @param {boolean} isAttacker - Whether this unit is the attacker
 * @returns {Object} Preparation result
 */
function calculatePreparationLegacy(unit, battleConditions = {}, isAttacker = false) {
    const conditions = {
        // Basic conditions for testing with variance
        formationIntact: Math.random() > 0.2,   // 80% chance formation intact
        freshTroops: Math.random() > 0.3,       // 70% chance troops are fresh
        commanderPresent: Math.random() > 0.4,  // 60% chance commander present
        
        // Map from battle conditions if available
        terrainSuited: battleConditions.terrain !== 'forest' || !unit.mounted,
        weatherPreparation: battleConditions.weather === 'clear' && Math.random() > 0.2, // 80% chance if clear weather
        
        // Role designation
        isAttacker: isAttacker,
        isDefender: !isAttacker
    };
    
    // ASYMMETRIC ATTACKER BONUSES
    if (isAttacker) {
        conditions.initiativeAdvantage = true;  // Attackers always choose timing
        conditions.concentratedAssault = true; // Can focus forces
        
        // Conditional attacker bonuses
        conditions.momentumCharge = isChargeCapable(unit);
        conditions.chosenBattlefield = battleConditions.combat_situation !== 'ambush';
        conditions.tacticalSurprise = battleConditions.combat_situation === 'ambush';
        
        // AMBUSH BONUSES - Major attacker advantages
        if (battleConditions.combat_situation === 'ambush') {
            conditions.ambushAdvantage = true;  // Setup advantage
            conditions.firstStrike = true;      // Strike first
            
            // TEUTOBURG FOREST BONUS - Melee ambush in forest gets massive advantage
            if (battleConditions.terrain === 'forest' && !unit.mounted) {
                conditions.teutoburg_ambush = true; // Germanic tribes-style forest ambush
            }
        }
        
        // Attacker penalties
        if (battleConditions.combat_situation === 'siege_assault') {
            conditions.assaultingFortification = true;
        }
    }
    
    // ASYMMETRIC DEFENDER BONUSES
    if (!isAttacker) {
        conditions.terrainKnowledge = true;     // Defenders know the ground
        conditions.secureSupplies = true;      // Shorter supply lines
        
        // Conditional defender bonuses
        conditions.preparedPosition = battleConditions.combat_situation !== 'ambush';
        conditions.defensiveOptimization = isDefensiveFormation(unit.formation);
        conditions.interiorLines = true;       // Generally shorter movement distances
        
        // Defender penalties (from ambush, surprise, etc.)
        if (battleConditions.combat_situation === 'ambush') {
            conditions.surprised = true;
        }
        if (battleConditions.combat_situation === 'flanked') {
            conditions.flanked = true;
        }
        if (battleConditions.combat_situation === 'surrounded') {
            conditions.surrounded = true;
        }
    }
    
    return calculatePreparation(unit, conditions);
}

/**
 * Check if unit is capable of momentum charge
 */
function isChargeCapable(unit) {
    return unit.mounted || 
           ['wedge', 'loose'].includes(unit.formation) ||
           unit.qualityType === 'professional' ||
           unit.qualityType === 'veteran_mercenary';
}

/**
 * Check if formation is primarily defensive
 */
function isDefensiveFormation(formation) {
    return ['phalanx', 'testudo', 'shield_wall', 'square', 'hedgehog'].includes(formation);
}

module.exports = {
    // New preparation system constants
    TIME_POSITION_BONUSES,
    INTELLIGENCE_BONUSES,
    COORDINATION_BONUSES,
    ENVIRONMENTAL_BONUSES,
    TACTICAL_ADVANTAGE_BONUSES,
    MORALE_READINESS_BONUSES,
    PREPARATION_PENALTIES,
    ATTACKER_ASYMMETRIC_BONUSES,
    DEFENDER_ASYMMETRIC_BONUSES,
    
    // Core functions
    calculatePreparation,
    calculatePreparationLegacy, // For backward compatibility in testing
    getPreparationDescription,
    getNewPreparationDescription,
    isChargeCapable,
    isDefensiveFormation
};
