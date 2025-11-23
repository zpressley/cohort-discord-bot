// src/game/battleEngine.js
// Combat System v2.0 - Chaos-Modified Attack/Defense Engine
// Replaces ratio-based system with structured attack/defense calculations

const { calculateAttackRating, WEAPON_ATTACK_RATINGS } = require('./combat/attackRatings');
const { calculateDefenseRating, ARMOR_DEFENSE_RATINGS } = require('./combat/defenseRatings');
const { calculateChaosLevel } = require('./combat/chaosCalculator');
const { calculatePreparationLegacy } = require('./combat/preparationCalculator');
const { getCulturalCombatModifiers } = require('./combat/culturalModifiers');
const { applyDamageWithAccumulation, getDamageAccumulationStatus } = require('./combat/damageAccumulation');
const { checkMorale } = require('./morale');

/**
 * Calculate total attack rating for an entire force
 * @param {Object} force - Force with units, formation, and experience data
 * @param {Object} targetForce - Target force for range calculations
 * @param {Object} conditions - Battle conditions
 * @param {boolean} isDefender - Whether this force is the defender
 * @returns {number} Total attack rating
 */
function calculateTotalAttackRating(force, targetForce = null, conditions = {}, isDefender = false) {
    if (!force.units || force.units.length === 0) {
        return 1; // Minimum attack rating
    }
    
    let totalAttack = 0;
    
    // Sum attack ratings for all units
    force.units.forEach(unit => {
        // Convert unit data structure to match combat system
        const combatUnit = {
            weapons: unit.primaryWeapon?.name ? [unit.primaryWeapon.name] : ['unarmed'],
            quality: unit.qualityType || 'levy',
            formation: force.formation || 'line',
            mounted: unit.mounted || false
        };
        
        // Create target unit for range calculations
        let targetUnit = null;
        if (targetForce && targetForce.units && targetForce.units.length > 0) {
            const firstTarget = targetForce.units[0];
            targetUnit = {
                weapons: firstTarget.primaryWeapon?.name ? [firstTarget.primaryWeapon.name] : ['unarmed'],
                quality: firstTarget.qualityType || 'levy',
                formation: targetForce.formation || 'line',
                mounted: firstTarget.mounted || false
            };
        }
        
        const unitAttack = calculateAttackRating(combatUnit, conditions, targetUnit, isDefender);
        
        // Weight by unit size
        const unitSize = unit.quality?.size || 100;
        totalAttack += unitAttack * (unitSize / 100);
    });
    
    return Math.max(1, Math.round(totalAttack));
}

/**
 * Calculate total defense rating for an entire force
 * @param {Object} force - Force with units array and formation data
 * @returns {number} Total defense rating
 */
function calculateTotalDefenseRating(force) {
    if (!force.units || force.units.length === 0) {
        return 0; // No defense
    }
    
    let totalDefense = 0;
    
    // Sum defense ratings for all units
    force.units.forEach(unit => {
        
        // Convert unit data structure to match combat system
        // FIX: Handle both .key and .name properties for equipment
        const combatUnit = {
            armor: unit.armor?.key || unit.armor?.name || 'no_armor',
            shield: unit.shields?.key || unit.shields?.name || 'no_shield', 
            quality: unit.qualityType || 'levy',
            formation: force.formation || 'line'
        };
        
        
        let unitDefense = calculateDefenseRating(combatUnit, {});
        
        // Morale penalty for broken units
        if (unit.isBroken || unit.status === 'broken') {
            unitDefense = Math.max(0, Math.round(unitDefense * 0.5));
        }
        // Formation change vulnerability
        if (unit.formationChanging && unit.formationChanging.remaining > 0) {
            unitDefense = Math.max(0, unitDefense + (unit.formationChanging.penalty || -3));
        }
        
        // Weight by unit size
        const unitSize = unit.quality?.size || 100;
        totalDefense += unitDefense * (unitSize / 100);
    });
    
    
    return Math.max(0, Math.round(totalDefense));
}

/**
 * Calculate total preparation level for an entire force
 * @param {Object} force - Force with units, formation, and experience data
 * @param {Object} conditions - Battle conditions
 * @param {boolean} isAttacker - Whether this force is the attacker
 * @returns {number} Total preparation level (1.0-4.0 scale)
 */
function calculateTotalPreparation(force, conditions, isAttacker = false) {
    if (!force.units || force.units.length === 0) {
        return 1.0; // Minimum preparation
    }
    
    let totalPreparation = 0;
    
    // Sum preparation for all units
    force.units.forEach(unit => {
        // Convert unit data structure to match combat system
        const combatUnit = {
            training: unit.training?.type ? `${unit.training.type}_${unit.training.level}` : 'none',
            formation: force.formation || 'line',
            experience: force.experience || 'regular',
            position: 'neutral', // Default position
            cultural_traits: [], // Could be enhanced
            mounted: unit.mounted || false
        };
        
        const preparationResult = calculatePreparationLegacy(combatUnit, conditions, isAttacker);
        let unitPreparation = preparationResult.preparationLevel || 1.0;
        
        // FIX: Normalize preparation to 1.0-4.0 scale if needed
        // If calculatePreparationLegacy returns 0-10 scale, convert it
        if (unitPreparation > 4.0) {
            // Assume 0-10 scale, normalize to 1.0-4.0
            unitPreparation = 1.0 + (unitPreparation / 10) * 3.0;
        }
        
        // Weight by unit size
        const unitSize = unit.quality?.size || 100;
        totalPreparation += unitPreparation * (unitSize / 100);
    });
    
    // Return average preparation, clamped to valid range
    const avgPreparation = totalPreparation / force.units.length;
    return Math.max(1.0, Math.min(4.0, avgPreparation));
}

/**
 * Combat System v2.0 - Main Resolution Function
 * Uses chaos-modified attack/defense ratings with preparation modifiers
 * 
 * @param {Object} attackingForce - Attacking units with equipment and formations
 * @param {Object} defendingForce - Defending units with equipment and formations  
 * @param {Object} battleConditions - Terrain, weather, and environmental factors
 * @param {Object} tacticalContext - Turn number, morale, special conditions
 * @returns {Object} Combat results with casualties, chaos data, and tactical developments
 */
async function resolveCombat(attackingForce, defendingForce, battleConditions, tacticalContext) {
    try {
        console.log('=== Combat System v2.0 - Starting Resolution ===');
        
        // STEP 1: Calculate Attack and Defense Ratings (with range bonuses)
        const attackerAttack = calculateTotalAttackRating(attackingForce, defendingForce, battleConditions, false);
        const attackerDefense = calculateTotalDefenseRating(attackingForce);
        const defenderAttack = calculateTotalAttackRating(defendingForce, attackingForce, battleConditions, true);
        const defenderDefense = calculateTotalDefenseRating(defendingForce);
        
        console.log(`Attack Ratings - Attacker: ${attackerAttack}, Defender: ${defenderAttack}`);
        console.log(`Defense Ratings - Attacker: ${attackerDefense}, Defender: ${defenderDefense}`);
        
        // STEP 2: Calculate Battlefield Chaos Level
        const chaosResult = calculateChaosLevel(battleConditions);
        const chaosLevel = chaosResult.chaosLevel;
        console.log(`Battlefield Chaos Level: ${chaosLevel}/10`);
        console.log(`Chaos Factors: ${chaosResult.breakdown.factors.join(', ') || 'None'}`);
        
        // STEP 3: Calculate Preparation Levels (Asymmetric)
        const attackerPreparation = calculateTotalPreparation(attackingForce, battleConditions, true);
        const defenderPreparation = calculateTotalPreparation(defendingForce, battleConditions, false);
        
        console.log(`Preparation - Attacker: ${attackerPreparation.toFixed(2)}, Defender: ${defenderPreparation.toFixed(2)}`);
        
        // STEP 4: Roll Chaos and Calculate Raw Chaos
        let chaosRoll = rollChaos(chaosLevel);
        const rawChaos = chaosRoll - (chaosLevel / 2); // Center around 0
        
        console.log(`Chaos Roll: ${chaosRoll}, Raw Chaos: ${rawChaos}`);
        
        // STEP 5: Apply Preparation as DIVISOR (App Dev 006 Approved Design)
        // Preparation: 1.0 = full chaos, 2.0 = half chaos, 3.0 = third, 4.0 = quarter
        // FIX: Changed from SUBTRACTION to DIVISION
        let attackerChaos = rawChaos / Math.max(1.0, attackerPreparation);
        let defenderChaos = rawChaos / Math.max(1.0, defenderPreparation);
        
        // In ambush scenarios, defenders suffer additional chaos penalty
        if (battleConditions.combat_situation === 'ambush') {
            defenderChaos = defenderChaos * 1.5; // 50% more chaos impact on surprised defenders
            console.log(`Ambush detected: Defender chaos amplified by 50%`);
        }
        
        console.log(`Applied Chaos - Attacker: ${attackerChaos.toFixed(2)}, Defender: ${defenderChaos.toFixed(2)}`);
        
        // Log preparation effectiveness (avoid division by zero)
        if (rawChaos !== 0) {
            const attackerReduction = ((1 - (attackerChaos / rawChaos)) * 100).toFixed(0);
            const defenderReduction = ((1 - (defenderChaos / rawChaos)) * 100).toFixed(0);
            console.log(`Preparation Effect - Attacker chaos reduced by ${attackerReduction}%, Defender by ${defenderReduction}%`);
        } else {
            console.log(`Preparation Effect - No chaos to reduce (clear conditions)`);
        }
        
        // STEP 6: Calculate Modified Attack/Defense Values
        const attackerEffectiveAttack = attackerAttack - attackerChaos;
        const attackerEffectiveDefense = attackerDefense - attackerChaos;
        const defenderEffectiveAttack = defenderAttack - defenderChaos;
        const defenderEffectiveDefense = defenderDefense - defenderChaos;
        
        console.log(`Effective Values:`);
        console.log(`  Attacker: Attack ${attackerEffectiveAttack.toFixed(2)}, Defense ${attackerEffectiveDefense.toFixed(2)}`);
        console.log(`  Defender: Attack ${defenderEffectiveAttack.toFixed(2)}, Defense ${defenderEffectiveDefense.toFixed(2)}`);
        
        // STEP 7: Calculate Damage
        const attackerDamage = attackerEffectiveAttack - defenderEffectiveDefense;
        const defenderDamage = defenderEffectiveAttack - attackerEffectiveDefense;
        
        console.log(`Raw Damage - Attacker deals: ${attackerDamage.toFixed(2)}, Defender deals: ${defenderDamage.toFixed(2)}`);
        
        // STEP 8: Apply Damage Using Accumulation System
        const casualties = applyDamageWithAccumulationToForces(
            attackerDamage, 
            defenderDamage, 
            attackingForce, 
            defendingForce,
            tacticalContext.turn || 1
        );
        
        // STEP 9: Determine Combat Result
        const combatResult = determineCombatResult(attackerDamage, defenderDamage, casualties);
        
        // STEP 10: Calculate Morale Effects
        const moraleChanges = calculateMoraleFromResult(combatResult);
        
        console.log(`=== Combat Resolution Complete ===`);
        console.log(`Result: ${combatResult.result}`);
        console.log(`Casualties: Attacker ${casualties.attacker.total}, Defender ${casualties.defender.total}`);
        
        return {
            // Combat System v2.0 Data
            combatData: {
                chaosLevel,
                chaosRoll,
                rawChaos,
                attackerPreparation,
                defenderPreparation,
                attackerChaos,
                defenderChaos,
                attackerAttack,
                defenderAttack,
                attackerDefense,
                defenderDefense,
                effectiveAttack: {
                    attacker: attackerEffectiveAttack,
                    defender: defenderEffectiveAttack
                },
                effectiveDefense: {
                    attacker: attackerEffectiveDefense,
                    defender: defenderEffectiveDefense
                },
                rawDamage: {
                    attacker: attackerDamage,
                    defender: defenderDamage
                },
                // Damage Accumulation System (CMB-005) data
                damageAccumulation: {
                    attacker: casualties.attacker.accumulationData || [],
                    defender: casualties.defender.accumulationData || [],
                    hasAccumulatedDamage: {
                        attacker: casualties.attacker.accumulationData?.some(unit => unit.accumulatedAfter < 0) || false,
                        defender: casualties.defender.accumulationData?.some(unit => unit.accumulatedAfter < 0) || false
                    },
                    overflowUnits: {
                        attacker: casualties.attacker.accumulationData?.filter(unit => unit.overflow).length || 0,
                        defender: casualties.defender.accumulationData?.filter(unit => unit.overflow).length || 0
                    }
                }
            },
            
            // Legacy Compatibility
            combatResult,
            casualties,
            moraleChanges,
            
            // Additional Data
            tacticalDevelopments: determineTacticalDevelopments(combatResult, casualties),
            nextTurnModifiers: calculateNextTurnEffects(combatResult, battleConditions)
        };
        
    } catch (error) {
        console.error('Combat System v2.0 Error:', error);
        throw new Error(`Combat resolution failed: ${error.message}`);
    }
}

/**
 * Combat System v2.0 Supporting Functions
 */

/**
 * Roll chaos dice - 1d[chaosLevel]
 * @param {number} chaosLevel - Chaos level (0-10)
 * @returns {number} Chaos roll result
 */
function rollChaos(chaosLevel) {
    if (chaosLevel <= 0) return 0;
    return Math.floor(Math.random() * chaosLevel) + 1;
}

/**
 * Apply damage to forces using accumulation system
 * @param {number} attackerDamage - Damage dealt by attacker
 * @param {number} defenderDamage - Damage dealt by defender
 * @param {Object} attackingForce - Attacking force data
 * @param {Object} defendingForce - Defending force data
 * @param {number} turnNumber - Current turn number
 * @returns {Object} Casualty breakdown with accumulation data
 */
function applyDamageWithAccumulationToForces(attackerDamage, defenderDamage, attackingForce, defendingForce, turnNumber) {
    const casualties = {
        attacker: { casualties: 0, total: 0, units: [], accumulationData: [] },
        defender: { casualties: 0, total: 0, units: [], accumulationData: [] }
    };

    // Global scaling factors to tame casualty tempo without changing
    // the underlying chaos / preparation relationships.
    const ATTACKER_DAMAGE_SCALE = 0.5;
    const DEFENDER_DAMAGE_SCALE = 0.5;

    // Scale raw damage before distributing to units. We keep the sign so
    // that being outmatched can still accumulate long-term damage, but
    // the magnitude is reduced to avoid overly bloody exchanges.
    const scaledAttackerDamage = attackerDamage * ATTACKER_DAMAGE_SCALE;
    const scaledDefenderDamage = defenderDamage * DEFENDER_DAMAGE_SCALE;
    
    // Apply damage to defending force (from attacker's damage)
    if (defendingForce.units && defendingForce.units.length > 0) {
        const damagePerUnit = scaledAttackerDamage / defendingForce.units.length;
        
        defendingForce.units.forEach((unit, index) => {
            const result = applyDamageWithAccumulation(unit, damagePerUnit, turnNumber);
            
            // Morale 1.0: check if this unit breaks/routes based on casualties
            const maxStr = unit.quality?.size || unit.maxStrength || 100;
            checkMorale(unit, result.casualties, { /* TODO: pass local commander context */ });
            unit.maxStrength = maxStr;
            
            casualties.defender.casualties += result.casualties;
            casualties.defender.total += result.casualties;
            
            casualties.defender.units.push({
                casualties: result.casualties,
                type: unit.qualityType || 'professional',
                strength: maxStr,
                accumulated: result.accumulatedAfter,
                overflow: result.overflow
            });
            
            casualties.defender.accumulationData.push({
                unitIndex: index,
                ...result
            });
        });
    }
    
    // Apply damage to attacking force (from defender's damage)
    if (attackingForce.units && attackingForce.units.length > 0) {
        const damagePerUnit = scaledDefenderDamage / attackingForce.units.length;
        
        attackingForce.units.forEach((unit, index) => {
            const result = applyDamageWithAccumulation(unit, damagePerUnit, turnNumber);
            
            const maxStr = unit.quality?.size || unit.maxStrength || 100;
            checkMorale(unit, result.casualties, { /* TODO: commander context */ });
            unit.maxStrength = maxStr;
            
            casualties.attacker.casualties += result.casualties;
            casualties.attacker.total += result.casualties;
            
            casualties.attacker.units.push({
                casualties: result.casualties,
                type: unit.qualityType || 'professional',
                strength: maxStr,
                accumulated: result.accumulatedAfter,
                overflow: result.overflow
            });
            
            casualties.attacker.accumulationData.push({
                unitIndex: index,
                ...result
            });
        });
    }
    
    return casualties;
}

/**
 * Determine overall combat result from damage values
 * @param {number} attackerDamage - Attacker's damage output
 * @param {number} defenderDamage - Defender's damage output
 * @param {Object} casualties - Casualty data
 * @returns {Object} Combat result classification
 */
function determineCombatResult(attackerDamage, defenderDamage, casualties) {
    let result = 'stalemate';
    let intensity = 'moderate';
    
    const damageDifference = attackerDamage - defenderDamage;
    
    // Determine result based on damage differential (REBALANCED: Lower thresholds)
    if (damageDifference >= 4) {
        result = 'attacker_major_victory';
        intensity = 'decisive';
    } else if (damageDifference >= 2) {
        result = 'attacker_victory';
        intensity = 'significant';
    } else if (damageDifference >= 0.5) {
        result = 'attacker_advantage';
        intensity = 'slight';
    } else if (damageDifference <= -4) {
        result = 'defender_major_victory';
        intensity = 'decisive';
    } else if (damageDifference <= -2) {
        result = 'defender_victory';
        intensity = 'significant';
    } else if (damageDifference <= -0.5) {
        result = 'defender_advantage';
        intensity = 'slight';
    }
    
    return {
        result,
        intensity,
        damageDifference,
        attackerDamage,
        defenderDamage
    };
}

/**
 * Calculate morale effects from combat result
 * @param {Object} combatResult - Result of combat resolution
 * @returns {Object} Morale changes for both sides
 */
function calculateMoraleFromResult(combatResult) {
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
 * Simplified tactical developments for Combat System v2.0
 * @param {Object} combatResult - Combat result data
 * @param {Object} casualties - Casualty data
 * @returns {Array} List of tactical developments
 */
function determineTacticalDevelopments(combatResult, casualties) {
    const developments = [];
    
    // Formation disruption from decisive battles
    if (combatResult.intensity === 'decisive') {
        developments.push('formation_disruption');
    }
    
    // Tactical opportunities from casualties
    if (casualties.attacker.total > casualties.defender.total * 2) {
        developments.push('defender_advantage');
    } else if (casualties.defender.total > casualties.attacker.total * 2) {
        developments.push('attacker_advantage');
    }
    
    return developments;
}

/**
 * Calculate next turn effects (simplified for v2.0)
 * @param {Object} combatResult - Combat result
 * @param {Object} conditions - Battle conditions
 * @returns {Object} Next turn modifiers
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
    
    return effects;
}

// Combat System v2.0 Exports
module.exports = {
    // Main function
    resolveCombat,
    
    // Supporting functions
    rollChaos,
    calculateTotalAttackRating,
    calculateTotalDefenseRating,
    calculateTotalPreparation,
    applyDamageWithAccumulationToForces,
    determineCombatResult,
    calculateMoraleFromResult,
    determineTacticalDevelopments,
    calculateNextTurnEffects
};