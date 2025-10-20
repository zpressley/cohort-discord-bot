// src/game/combat/damageAccumulation.js
// Damage Accumulation System for Combat System v2.0
// Handles negative damage via bucket overflow mechanics
// 
// Last Updated: 2025-10-17
// Version: 1.0.0
// Part of: CMB-005 Implementation

/**
 * Damage Accumulation System
 * 
 * Core Mechanic:
 * - Negative damage is stored as "accumulated damage" on units
 * - Accumulated damage carries between turns until it overflows
 * - When net damage becomes positive, casualties are calculated
 * - System prevents "chipping away" at heavily armored units
 * 
 * Example Flow:
 * Turn 1: Attack 6, Defense 8 = -2 damage → accumulate -2
 * Turn 2: Attack 6, Defense 8 = -2 damage → accumulate -4  
 * Turn 3: Attack 10, Defense 8 = +2 damage → net = -4 + 2 = -2 (still negative)
 * Turn 4: Attack 12, Defense 8 = +4 damage → net = -2 + 4 = +2 → 10 casualties
 */

/**
 * Initialize damage tracking for a unit
 * @param {Object} unit - Unit object to track damage for
 * @returns {Object} Unit with damage tracking initialized
 */
function initializeDamageTracking(unit) {
    if (!unit.damageAccumulation) {
        unit.damageAccumulation = {
            accumulated: 0,        // Running total of negative damage
            totalDamageReceived: 0, // Historical damage tracking
            turnsWithNegativeDamage: 0,
            lastPositiveDamage: 0,
            damageHistory: []
        };
    }
    return unit;
}

/**
 * Apply damage to a unit using accumulation system
 * @param {Object} unit - Target unit
 * @param {number} rawDamage - Raw damage value (can be negative)
 * @param {number} turnNumber - Current turn number
 * @returns {Object} Damage application result
 */
function applyDamageWithAccumulation(unit, rawDamage, turnNumber = 1) {
    // Ensure unit has damage tracking
    initializeDamageTracking(unit);
    
    const result = {
        rawDamage,
        accumulatedBefore: unit.damageAccumulation.accumulated,
        netDamage: 0,
        casualties: 0,
        accumulatedAfter: 0,
        overflow: false,
        description: ""
    };
    
    // Record this damage in history
    unit.damageAccumulation.damageHistory.push({
        turn: turnNumber,
        rawDamage: rawDamage,
        accumulated: unit.damageAccumulation.accumulated
    });
    
    if (rawDamage <= 0) {
        // Negative or zero damage - add to accumulation
        unit.damageAccumulation.accumulated += rawDamage;
        unit.damageAccumulation.turnsWithNegativeDamage++;
        
        result.accumulatedAfter = unit.damageAccumulation.accumulated;
        result.description = `Damage ${rawDamage} accumulated. Total: ${result.accumulatedAfter}`;
        
    } else {
        // Positive damage - check for overflow
        const netDamage = unit.damageAccumulation.accumulated + rawDamage;
        
        if (netDamage > 0) {
            // Overflow! Calculate casualties
            const casualties = calculateCasualtiesFromDamage(netDamage);
            
            result.netDamage = netDamage;
            result.casualties = casualties;
            result.overflow = true;
            result.accumulatedAfter = 0; // Reset accumulation after overflow
            
            // Reset unit accumulation
            unit.damageAccumulation.accumulated = 0;
            unit.damageAccumulation.lastPositiveDamage = rawDamage;
            unit.damageAccumulation.totalDamageReceived += netDamage;
            
            result.description = `Damage overflow! ${rawDamage} damage + ${result.accumulatedBefore} accumulated = ${netDamage} net damage = ${casualties} casualties`;
            
        } else {
            // Still negative overall - add to accumulation
            unit.damageAccumulation.accumulated = netDamage;
            result.accumulatedAfter = netDamage;
            result.description = `Damage ${rawDamage} vs accumulation ${result.accumulatedBefore} = ${netDamage} total accumulated`;
        }
    }
    
    return result;
}

/**
 * Convert net positive damage to casualties
 * @param {number} netDamage - Net positive damage after accumulation
 * @returns {number} Number of casualties
 */
function calculateCasualtiesFromDamage(netDamage) {
    if (netDamage <= 0) return 0;
    
    // 5 casualties per point of net damage (from Combat System v2.0)
    return Math.max(1, Math.round(netDamage * 5));
}

/**
 * Get damage accumulation status for a unit
 * @param {Object} unit - Unit to check
 * @returns {Object} Accumulation status
 */
function getDamageAccumulationStatus(unit) {
    if (!unit.damageAccumulation) {
        return {
            hasAccumulation: false,
            accumulated: 0,
            turnsWithNegative: 0,
            description: "No damage accumulation"
        };
    }
    
    const acc = unit.damageAccumulation;
    
    return {
        hasAccumulation: acc.accumulated < 0,
        accumulated: acc.accumulated,
        turnsWithNegative: acc.turnsWithNegativeDamage,
        totalReceived: acc.totalDamageReceived,
        lastPositive: acc.lastPositiveDamage,
        historyLength: acc.damageHistory.length,
        description: acc.accumulated < 0 ? 
            `${Math.abs(acc.accumulated)} damage accumulated over ${acc.turnsWithNegativeDamage} turns` :
            "No accumulated damage"
    };
}

/**
 * Apply damage accumulation to multiple units (for battle resolution)
 * @param {Array} units - Array of units to apply damage to
 * @param {Array} damageValues - Corresponding damage values
 * @param {number} turnNumber - Current turn number
 * @returns {Object} Battle damage application results
 */
function applyBattleDamage(units, damageValues, turnNumber = 1) {
    const results = {
        totalCasualties: 0,
        unitsWithOverflow: 0,
        unitsWithAccumulation: 0,
        detailedResults: []
    };
    
    units.forEach((unit, index) => {
        const damage = damageValues[index] || 0;
        const unitResult = applyDamageWithAccumulation(unit, damage, turnNumber);
        
        results.totalCasualties += unitResult.casualties;
        if (unitResult.overflow) results.unitsWithOverflow++;
        if (unit.damageAccumulation && unit.damageAccumulation.accumulated < 0) {
            results.unitsWithAccumulation++;
        }
        
        results.detailedResults.push({
            unitId: unit.id || index,
            unitType: unit.qualityType || 'unknown',
            ...unitResult
        });
    });
    
    return results;
}

/**
 * Calculate theoretical damage needed to penetrate accumulated defense
 * @param {Object} unit - Unit with damage accumulation
 * @returns {number} Damage needed to cause first casualty
 */
function getDamageThreshold(unit) {
    if (!unit.damageAccumulation || unit.damageAccumulation.accumulated >= 0) {
        return 1; // Any positive damage causes casualties
    }
    
    // Need enough damage to overcome accumulation + cause 1 net damage
    return Math.abs(unit.damageAccumulation.accumulated) + 1;
}

/**
 * Simulate damage accumulation for planning
 * @param {number} currentAccumulation - Current accumulated damage
 * @param {Array} futureDamageValues - Sequence of damage values to simulate
 * @returns {Object} Simulation results
 */
function simulateDamageAccumulation(currentAccumulation, futureDamageValues) {
    let accumulated = currentAccumulation;
    const simulation = {
        steps: [],
        firstCasualtyTurn: null,
        totalCasualties: 0
    };
    
    futureDamageValues.forEach((damage, turn) => {
        const stepResult = {
            turn: turn + 1,
            damageApplied: damage,
            accumulatedBefore: accumulated,
            casualties: 0,
            overflow: false
        };
        
        if (damage <= 0) {
            accumulated += damage;
        } else {
            const netDamage = accumulated + damage;
            if (netDamage > 0) {
                stepResult.casualties = calculateCasualtiesFromDamage(netDamage);
                stepResult.overflow = true;
                accumulated = 0;
                simulation.totalCasualties += stepResult.casualties;
                if (simulation.firstCasualtyTurn === null) {
                    simulation.firstCasualtyTurn = turn + 1;
                }
            } else {
                accumulated = netDamage;
            }
        }
        
        stepResult.accumulatedAfter = accumulated;
        simulation.steps.push(stepResult);
    });
    
    return simulation;
}

/**
 * Reset damage accumulation for a unit (for testing or special events)
 * @param {Object} unit - Unit to reset
 * @returns {Object} Reset confirmation
 */
function resetDamageAccumulation(unit) {
    const previousState = unit.damageAccumulation ? { ...unit.damageAccumulation } : null;
    
    unit.damageAccumulation = {
        accumulated: 0,
        totalDamageReceived: 0,
        turnsWithNegativeDamage: 0,
        lastPositiveDamage: 0,
        damageHistory: []
    };
    
    return {
        reset: true,
        previousAccumulated: previousState?.accumulated || 0,
        description: `Reset accumulation (was ${previousState?.accumulated || 0})`
    };
}

module.exports = {
    initializeDamageTracking,
    applyDamageWithAccumulation,
    calculateCasualtiesFromDamage,
    getDamageAccumulationStatus,
    applyBattleDamage,
    getDamageThreshold,
    simulateDamageAccumulation,
    resetDamageAccumulation
};