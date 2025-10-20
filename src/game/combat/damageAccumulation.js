// src/game/combat/damageAccumulation.js
// Damage Accumulation System for Combat System v2.0
// Implements "Bucket Model" per combat_design_parameters.md
// 
// Last Updated: 2025-10-20
// Version: 1.1.0 - Updated to match approved bucket system design
// Part of: CMB-005 Implementation

/**
 * Damage Accumulation System - "Bucket" Model
 * 
 * Core Mechanic (from combat_design_parameters.md):
 * - Defense acts like a cup/bucket that fills with incoming damage
 * - When bucket overflows (accumulated >= 1.0), casualties occur
 * - Remainder stays in bucket for next turn
 * - Even weak attacks eventually cause casualties through accumulation
 * 
 * Example Flow (Attack 4 vs Defense 6 = -2 damage):
 * Turn 1: -2 damage → Fill bucket: 2.0 → Overflow! 2 damage = 10 casualties, remainder 0
 * Turn 2: -2 damage → Fill bucket: 2.0 → Overflow! 2 damage = 10 casualties
 * Turn 3: -2 damage → Fill bucket: 2.0 → Overflow! 2 damage = 10 casualties
 */

/**
 * Initialize damage tracking for a unit
 * @param {Object} unit - Unit object to track damage for
 * @returns {Object} Unit with damage tracking initialized
 */
function initializeDamageTracking(unit) {
    if (!unit.damageAccumulation) {
        unit.damageAccumulation = {
            accumulated: 0.0,      // Bucket level (0.0 to 1.0+)
            totalDamageReceived: 0, // Historical damage tracking
            turnsWithNegativeDamage: 0,
            lastPositiveDamage: 0,
            damageHistory: []
        };
    }
    return unit;
}

/**
 * Apply damage to a unit using accumulation system (Bucket Model)
 * @param {Object} unit - Target unit
 * @param {number} rawDamage - Raw damage value (from effectiveAttack - effectiveDefense)
 * @param {number} turnNumber - Current turn number
 * @returns {Object} Damage application result
 */
function applyDamageWithAccumulation(unit, rawDamage, turnNumber = 1) {
    // Ensure unit has damage tracking
    initializeDamageTracking(unit);
    
    const result = {
        rawDamage,
        accumulatedBefore: unit.damageAccumulation.accumulated,
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
    
    if (rawDamage > 0) {
        // POSITIVE DAMAGE: Immediate casualties, reset bucket
        const casualties = calculateCasualtiesFromDamage(rawDamage);
        
        result.casualties = casualties;
        result.accumulatedAfter = 0; // Reset bucket
        result.overflow = true;
        
        // Reset unit accumulation
        unit.damageAccumulation.accumulated = 0;
        unit.damageAccumulation.lastPositiveDamage = rawDamage;
        unit.damageAccumulation.totalDamageReceived += rawDamage;
        
        result.description = `Positive damage: ${rawDamage} = ${casualties} casualties. Bucket reset.`;
        
    } else if (rawDamage < 0) {
        // NEGATIVE DAMAGE: Fill the bucket with absolute value
        const damageAmount = Math.abs(rawDamage);
        unit.damageAccumulation.accumulated += damageAmount;
        unit.damageAccumulation.turnsWithNegativeDamage++;
        
        // Check if bucket overflows (>= 1.0)
        if (unit.damageAccumulation.accumulated >= 1.0) {
            // Overflow! Extract casualties
            const overflowDamage = Math.floor(unit.damageAccumulation.accumulated);
            const casualties = overflowDamage * 5; // 5 casualties per damage point
            
            // Keep remainder in bucket
            unit.damageAccumulation.accumulated = unit.damageAccumulation.accumulated % 1.0;
            unit.damageAccumulation.totalDamageReceived += overflowDamage;
            
            result.casualties = casualties;
            result.accumulatedAfter = unit.damageAccumulation.accumulated;
            result.overflow = true;
            
            result.description = `Bucket overflow! ${damageAmount} added, ${overflowDamage} overflow = ${casualties} casualties. Remainder: ${result.accumulatedAfter.toFixed(1)}`;
        } else {
            // No overflow, damage accumulates in bucket
            result.accumulatedAfter = unit.damageAccumulation.accumulated;
            result.description = `Bucket filling: +${damageAmount} = ${result.accumulatedAfter.toFixed(1)}/1.0`;
        }
    } else {
        // Zero damage - no change
        result.accumulatedAfter = unit.damageAccumulation.accumulated;
        result.description = "No damage applied";
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
    // Increase minimum to 2 to reduce excessive stalemates
    return Math.max(2, Math.round(netDamage * 5));
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
            bucketLevel: 0,
            turnsWithNegative: 0,
            description: "No damage accumulation"
        };
    }
    
    const acc = unit.damageAccumulation;
    
    return {
        hasAccumulation: acc.accumulated > 0,
        accumulated: acc.accumulated,
        bucketLevel: acc.accumulated,
        bucketFull: acc.accumulated >= 1.0,
        turnsWithNegative: acc.turnsWithNegativeDamage,
        totalReceived: acc.totalDamageReceived,
        lastPositive: acc.lastPositiveDamage,
        historyLength: acc.damageHistory.length,
        description: acc.accumulated > 0 ? 
            `Bucket ${(acc.accumulated * 100).toFixed(1)}% full (${acc.accumulated.toFixed(2)}/1.0)` :
            "Empty bucket"
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