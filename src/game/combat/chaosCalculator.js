// src/game/combat/chaosCalculator.js
// Chaos calculation system for Combat System v2.0
// Calculates battlefield chaos level (0-10) from environmental and tactical conditions
// 
// Last Updated: 2025-10-17
// Version: 1.0.0
// Dependencies: none

/**
 * Environmental chaos factors
 * Each factor contributes to total battlefield chaos
 */
const ENVIRONMENTAL_CHAOS = {
    // Terrain factors
    terrain: {
        'plains': 0,         // Open field, clear visibility
        'hill': 1,           // Elevation changes, limited visibility
        'forest': 2,         // Dense trees, broken sightlines
        'marsh': 2,          // Unstable footing, difficult movement
        'mountain': 2,       // Steep terrain, rockfall hazards
        'river': 1,          // Water obstacles, crossing difficulties
        'desert': 1,         // Heat, sand, navigation challenges
        'urban': 3           // Buildings, narrow streets, civilian chaos
    },

    // Weather conditions
    weather: {
        'clear': 0,          // Perfect visibility, no impediments
        'overcast': 0,       // Cloudy but no interference
        'light_rain': 1,     // Slippery conditions, some visibility loss
        'heavy_rain': 2,     // Poor visibility, equipment difficulties
        'fog': 3,            // Severe visibility reduction
        'snow': 2,           // Cold, slippery, visibility issues
        'sandstorm': 4,      // Near-zero visibility, equipment damage
        'thunderstorm': 3    // Lightning, noise, panic
    },

    // Time of day
    time_of_day: {
        'dawn': 1,           // Limited visibility, confusion
        'morning': 0,        // Good conditions
        'midday': 0,         // Clear visibility
        'afternoon': 0,      // Still good conditions
        'dusk': 1,           // Fading light
        'night': 4,          // Darkness, friend-or-foe confusion
        'midnight': 4        // Deep darkness
    }
};

/**
 * Tactical chaos factors
 * Based on battlefield situation and unit positioning
 */
const TACTICAL_CHAOS = {
    // Unit density (units per tile area)
    unit_density: {
        'sparse': 0,         // <200 warriors per area, plenty of room
        'normal': 0,         // 200-400 warriors, standard density
        'dense': 1,          // 400-600 warriors, crowded
        'compressed': 3,     // 600+ warriors, Cannae-style compression
        'crush': 5           // 800+ warriors, deadly overcrowding
    },

    // Combat situation
    combat_situation: {
        'prepared': 0,       // Both sides ready, organized
        'meeting_engagement': 1, // Unexpected contact
        'ambush': 4,         // Surprise attack, confusion
        'pursuit': 2,        // Chasing/fleeing, disorganized
        'siege_assault': 2,  // Storming walls, urban combat
        'river_crossing': 2, // Attacking across water
        'night_raid': 3,     // Darkness operation
        'retreat': 3         // Organized withdrawal under pressure
    },

    // Formation disruption
    formation_state: {
        'intact': 0,         // All units in proper formation
        'partially_disrupted': 1, // Some units out of position
        'mixed': 2,          // Half units disrupted
        'mostly_disrupted': 3,    // Few units in formation
        'broken': 4          // No organized formations
    },

    // Command and control
    command_state: {
        'coordinated': 0,    // Clear command structure
        'delayed': 1,        // Messenger delays
        'confused': 2,       // Mixed signals
        'interrupted': 3,    // Command structure damaged
        'leaderless': 4      // No effective command
    }
};

/**
 * Special chaos modifiers
 * Unique situations that add chaos
 */
const SPECIAL_CHAOS_MODIFIERS = {
    // Multi-sided combat
    'three_way_battle': +2,      // Three or more factions
    'civil_war': +1,             // Same culture fighting
    
    // Terrain combinations
    'forest_night': +1,          // Forest + night = extreme confusion
    'marsh_fog': +2,             // Marsh + fog = navigation nightmare
    'urban_fire': +3,            // City battle with fires
    
    // Psychological factors
    'war_elephants_present': +1, // Elephant terror and unpredictability
    'first_battle': +1,          // Green troops, first combat
    'blood_feud': -1,            // Focused hatred reduces chaos
    'religious_fervor': -1,      // Divine purpose focus
    
    // Equipment failures
    'weapon_breakage': +1,       // Mass equipment failure
    'supply_shortage': +1,       // Hunger, thirst effects
    'communication_failure': +2   // Horn/drum signals lost
};

/**
 * Calculate total battlefield chaos level
 * @param {Object} conditions - Battlefield conditions
 * @returns {Object} Chaos calculation with breakdown
 */
function calculateChaosLevel(conditions) {
    let totalChaos = 0;
    const breakdown = {
        environmental: 0,
        tactical: 0,
        special: 0,
        factors: []
    };

    // Environmental factors
    if (conditions.terrain) {
        const terrainChaos = ENVIRONMENTAL_CHAOS.terrain[conditions.terrain] || 0;
        totalChaos += terrainChaos;
        breakdown.environmental += terrainChaos;
        if (terrainChaos > 0) {
            breakdown.factors.push(`Terrain (${conditions.terrain}): +${terrainChaos}`);
        }
    }

    if (conditions.weather) {
        const weatherChaos = ENVIRONMENTAL_CHAOS.weather[conditions.weather] || 0;
        totalChaos += weatherChaos;
        breakdown.environmental += weatherChaos;
        if (weatherChaos > 0) {
            breakdown.factors.push(`Weather (${conditions.weather}): +${weatherChaos}`);
        }
    }

    if (conditions.time_of_day) {
        const timeChaos = ENVIRONMENTAL_CHAOS.time_of_day[conditions.time_of_day] || 0;
        totalChaos += timeChaos;
        breakdown.environmental += timeChaos;
        if (timeChaos > 0) {
            breakdown.factors.push(`Time (${conditions.time_of_day}): +${timeChaos}`);
        }
    }

    // Tactical factors
    if (conditions.unit_density) {
        const densityChaos = TACTICAL_CHAOS.unit_density[conditions.unit_density] || 0;
        totalChaos += densityChaos;
        breakdown.tactical += densityChaos;
        if (densityChaos > 0) {
            breakdown.factors.push(`Unit density (${conditions.unit_density}): +${densityChaos}`);
        }
    }

    if (conditions.combat_situation) {
        const situationChaos = TACTICAL_CHAOS.combat_situation[conditions.combat_situation] || 0;
        totalChaos += situationChaos;
        breakdown.tactical += situationChaos;
        if (situationChaos > 0) {
            breakdown.factors.push(`Situation (${conditions.combat_situation}): +${situationChaos}`);
        }
    }

    if (conditions.formation_state) {
        const formationChaos = TACTICAL_CHAOS.formation_state[conditions.formation_state] || 0;
        totalChaos += formationChaos;
        breakdown.tactical += formationChaos;
        if (formationChaos > 0) {
            breakdown.factors.push(`Formation (${conditions.formation_state}): +${formationChaos}`);
        }
    }

    if (conditions.command_state) {
        const commandChaos = TACTICAL_CHAOS.command_state[conditions.command_state] || 0;
        totalChaos += commandChaos;
        breakdown.tactical += commandChaos;
        if (commandChaos > 0) {
            breakdown.factors.push(`Command (${conditions.command_state}): +${commandChaos}`);
        }
    }

    // Special modifiers
    if (conditions.special_modifiers) {
        conditions.special_modifiers.forEach(modifier => {
            const specialChaos = SPECIAL_CHAOS_MODIFIERS[modifier] || 0;
            totalChaos += specialChaos;
            breakdown.special += specialChaos;
            if (specialChaos !== 0) {
                const sign = specialChaos > 0 ? '+' : '';
                breakdown.factors.push(`${modifier}: ${sign}${specialChaos}`);
            }
        });
    }

    // Add minimum base chaos (2) even in perfect conditions to prevent deterministic outcomes
    const baseMinimumChaos = 2;
    const chaosWithMinimum = Math.max(baseMinimumChaos, totalChaos);
    
    // Cap chaos at maximum 10
    const finalChaos = Math.min(10, chaosWithMinimum);

    // Track if minimum chaos was applied
    const minimumApplied = totalChaos < baseMinimumChaos;
    if (minimumApplied) {
        breakdown.factors.push(`Minimum battlefield uncertainty: +${baseMinimumChaos}`);
    }

    return {
        chaosLevel: finalChaos,
        rawTotal: totalChaos,
        capped: chaosWithMinimum > 10,
        minimumApplied: minimumApplied,
        breakdown,
        description: getChaosDescription(finalChaos)
    };
}

/**
 * Get descriptive text for chaos level
 * @param {number} chaosLevel - Chaos level 0-10
 * @returns {string} Description of battlefield conditions
 */
function getChaosDescription(chaosLevel) {
    const descriptions = {
        0: "Perfect conditions - clear field, good weather, organized forces",
        1: "Minor complications - light weather or terrain effects", 
        2: "Noticeable disorder - weather, terrain, or tactical issues",
        3: "Moderate chaos - multiple complicating factors",
        4: "Significant confusion - poor visibility or major disruption",
        5: "High chaos - dangerous conditions, formations breaking",
        6: "Severe disorder - multiple critical factors, friend-foe confusion",
        7: "Extreme chaos - sandstorm/night combat with disrupted command",
        8: "Near-total confusion - multiple severe factors combined",
        9: "Catastrophic disorder - barely organized combat",
        10: "Complete chaos - battle is more melee than organized warfare"
    };
    
    return descriptions[chaosLevel] || `Chaos level ${chaosLevel}`;
}

/**
 * Roll chaos modifier for combat
 * Uses chaos level to determine random battlefield effects
 * @param {number} chaosLevel - Current battlefield chaos (0-10)
 * @returns {Object} Chaos roll result
 */
function rollChaosModifier(chaosLevel) {
    if (chaosLevel === 0) {
        return {
            roll: 0,
            modifier: 0,
            description: "Perfect conditions - no random effects"
        };
    }

    // Roll 1d[chaosLevel]
    const roll = Math.floor(Math.random() * chaosLevel) + 1;
    
    // Center around 0: modifier = roll - (chaosLevel/2)
    const centerPoint = chaosLevel / 2;
    const rawModifier = roll - centerPoint;
    const modifier = Math.round(rawModifier);

    return {
        roll,
        modifier,
        chaosLevel,
        description: `Rolled ${roll} on d${chaosLevel} (${modifier >= 0 ? '+' : ''}${modifier} chaos modifier)`
    };
}

/**
 * Get chaos factors for current battle state
 * Analyzes battle state to determine chaos conditions
 * @param {Object} battleState - Current battle state
 * @param {Object} map - Map data
 * @param {Array} unitPositions - All unit positions
 * @returns {Object} Chaos conditions object
 */
function analyzeBattleForChaos(battleState, map, unitPositions) {
    const conditions = {
        terrain: battleState.terrain || 'plains',
        weather: battleState.weather || 'clear',
        time_of_day: 'midday', // Default, could be enhanced
        special_modifiers: []
    };

    // Analyze unit density
    const totalUnits = unitPositions.length;
    const mapArea = (map.width || 20) * (map.height || 20);
    const averageStrength = unitPositions.reduce((sum, unit) => sum + (unit.currentStrength || 100), 0) / totalUnits;
    const totalWarriors = totalUnits * averageStrength;
    const density = totalWarriors / mapArea;

    if (density < 1) conditions.unit_density = 'sparse';
    else if (density < 2) conditions.unit_density = 'normal';
    else if (density < 3) conditions.unit_density = 'dense';
    else if (density < 4) conditions.unit_density = 'compressed';
    else conditions.unit_density = 'crush';

    // Analyze formation state
    const unitsInFormation = unitPositions.filter(unit => 
        unit.formation && unit.formation !== 'loose'
    ).length;
    const formationRatio = unitsInFormation / totalUnits;

    if (formationRatio >= 0.8) conditions.formation_state = 'intact';
    else if (formationRatio >= 0.6) conditions.formation_state = 'partially_disrupted';
    else if (formationRatio >= 0.4) conditions.formation_state = 'mixed';
    else if (formationRatio >= 0.2) conditions.formation_state = 'mostly_disrupted';
    else conditions.formation_state = 'broken';

    // Check for special conditions
    if (battleState.turn === 1) {
        conditions.special_modifiers.push('first_battle');
    }

    // Could add more analysis based on battle state

    return conditions;
}

module.exports = {
    ENVIRONMENTAL_CHAOS,
    TACTICAL_CHAOS,
    SPECIAL_CHAOS_MODIFIERS,
    calculateChaosLevel,
    getChaosDescription,
    rollChaosModifier,
    analyzeBattleForChaos
};