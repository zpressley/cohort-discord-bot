# Ranged Combat System Implementation


> ⚠️ **Past build notes, this project has moved in new direction, use for reference only not concrete action plan**
>
> Current direction: [`docs/PHASE2_COMBAT_PLAN.md`](../PHASE2_COMBAT_PLAN.md)

**Project:** Cohort Discord Bot  
**Component:** Ranged Combat with Friendly Fire Mechanics  
**Created:** December 2, 2025  
**Estimated Effort:** 21-27 hours over 5 weeks  
**Codebase Compatibility:** ✅ Verified against current implementation

---

## 🎯 Overview

Implement realistic ranged combat allowing archers/crossbowmen/slingers to attack targets at distance (2-14 tiles), with friendly fire risk when shooting into melee engagements.

### Core Principles

1. **All projectiles arc** - Crossbows have flatter trajectory, bows medium arc, slings high arc
2. **Friendly fire from melee engagement** - Shooting at enemies engaged with your troops risks hitting your own men
3. **Range degrades accuracy** - 100% at effective range → 40% at maximum range
4. **Trajectory affects friendly fire** - Flatter = higher risk, higher arc = lower risk

---

## 📐 Friendly Fire Explained

### The Scenario

```
Your Infantry at E7 ⚔️ Enemy Infantry at F7
         (Fighting at tile border)

Your Archers at B5 shoot at enemy in F7
```

**Problem:** Enemy is locked in melee with your troops. Arrows rain down on a chaotic brawl where your men and theirs are intermixed fighting.

### Friendly Fire Risk Table

| Situation | FF Risk | Enemy Damage | Friendly Damage | Morale Impact |
|-----------|---------|--------------|-----------------|---------------|
| **Clear Shot** (target not engaged) | 0% | 100% | 0% | None |
| **Shooting into Melee** (frontal) | 30-40% | 60-70% | 30-40% | -1 morale |
| **Flanking Shot** (perpendicular angle) | 10-15% | 85-90% | 10-15% | None |
| **Elevated Shot** (on hill, down into melee) | 20% | 80% | 20% | None |

### Weapon Trajectory Modifiers

| Weapon Type | Trajectory | Base FF Risk | Notes |
|-------------|------------|--------------|-------|
| Crossbow | Flat | 40% | High velocity, straight path |
| Bow (all types) | Medium | 30% | Moderate arc |
| Sling | High | 20% | Lobbing trajectory, drops vertically |

---

## 📋 Implementation Tasks

### **TASK 1: Ranged Combat Core System**

#### **TASK-1A: Create Range Band System**
**File:** `src/game/rangedCombat.js` (NEW)  
**Effort:** 2 hours  
**Dependencies:** None

**Create weapon range definitions:**

```javascript
// src/game/rangedCombat.js

const RANGE_BANDS = {
  // Thrown weapons - short range
  'light_javelin': { 
    effective: 1,      // 25m tiles
    maximum: 1.5,      
    trajectory: 'flat',
    type: 'thrown'
  },
  'throwing_spear': { 
    effective: 1, 
    maximum: 1.5,
    trajectory: 'flat',
    type: 'thrown'
  },
  'roman_pilum': { 
    effective: 1, 
    maximum: 1.5,
    trajectory: 'flat',
    type: 'thrown'
  },
  
  // Basic bows
  'self_bow_basic': { 
    effective: 3,      // 75m
    maximum: 5,        // 125m
    trajectory: 'medium',
    type: 'bow'
  },
  'self_bow_professional': { 
    effective: 5,      // 125m
    maximum: 9,        // 225m
    trajectory: 'medium',
    type: 'bow'
  },
  
  // Composite bows
  'greek_composite_bow': {
    effective: 5,      // 125m
    maximum: 8,        // 200m
    trajectory: 'medium',
    type: 'bow'
  },
  'persian_recurve_bow': {
    effective: 5,
    maximum: 8,
    trajectory: 'medium',
    type: 'bow'
  },
  'parthian_horse_bow': {
    effective: 5,
    maximum: 7,        // 180m
    trajectory: 'medium',
    type: 'bow'
  },
  
  // Crossbows - flat trajectory
  'han_chinese_crossbow': {
    effective: 4,      // 100m
    maximum: 6,        // 150m
    trajectory: 'flat',
    type: 'crossbow'
  },
  
  // Slings - extreme range, high arc
  'sling': {
    effective: 6,      // 150m
    maximum: 12,       // 300m
    trajectory: 'high',
    type: 'sling'
  },
  'sling_professional': {
    effective: 8,      // 200m
    maximum: 14,       // 350m
    trajectory: 'high',
    type: 'sling'
  }
};

/**
 * Calculate accuracy modifier based on range
 * @param {number} distance - Tiles between shooter and target
 * @param {Object} weaponRange - Range band data for weapon
 * @returns {number} Accuracy multiplier (0.4 to 1.0)
 */
function calculateRangeModifier(distance, weaponRange) {
  if (distance <= weaponRange.effective) {
    return 1.0; // Full damage/accuracy
  }
  if (distance <= weaponRange.maximum) {
    // Linear degradation from effective to max
    const degradation = (distance - weaponRange.effective) / 
                        (weaponRange.maximum - weaponRange.effective);
    return 1.0 - (degradation * 0.6); // 100% → 40%
  }
  return 0; // Out of range
}

/**
 * Get weapon range data from weapon key
 * @param {string} weaponKey - Weapon identifier from armyData.js
 * @returns {Object} Range band data
 */
function getWeaponRange(weaponKey) {
  return RANGE_BANDS[weaponKey] || null;
}

/**
 * Check if unit has ranged capability
 * @param {Object} unit - Unit data with equipment
 * @returns {boolean}
 */
function hasRangedWeapon(unit) {
  const rangedWeaponKeys = Object.keys(RANGE_BANDS);
  return unit.primaryWeapon && rangedWeaponKeys.includes(unit.primaryWeapon);
}

module.exports = {
  RANGE_BANDS,
  calculateRangeModifier,
  getWeaponRange,
  hasRangedWeapon
};
```

**Acceptance Criteria:**
- [ ] All ranged weapons have range bands defined
- [ ] Range modifier calculation returns 0.4-1.0
- [ ] Trajectory types assigned (flat/medium/high)
- [ ] Export functions work correctly

---

#### **TASK-1B: Detect Ranged Combat Opportunities**
**File:** `src/game/positionBasedCombat.js` (MODIFY)  
**Effort:** 2-3 hours  
**Dependencies:** TASK-1A

**Modify `detectCombatTriggers()` to scan full weapon ranges:**

```javascript
// REPLACE THIS SECTION (lines ~15-35):

// OLD CODE:
// Ranged combat within 3 tiles
if (distance > 1 && distance <= 3) {
    if (p1Unit.hasRanged || p2Unit.hasRanged) {
        combats.push({
            location: p1Unit.position,
            attacker: p1Unit,
            defender: p2Unit,
            type: 'ranged',
            distance: distance
        });
    }
}

// NEW CODE:
const { getWeaponRange, hasRangedWeapon } = require('./rangedCombat');

// Check if p1Unit can shoot at p2Unit
if (hasRangedWeapon(p1Unit)) {
    const weaponRange = getWeaponRange(p1Unit.primaryWeapon);
    if (distance > 1 && distance <= weaponRange.maximum) {
        combats.push({
            location: p1Unit.position,
            shooter: p1Unit,
            target: p2Unit,
            type: 'ranged',
            distance: distance,
            weaponRange: weaponRange
        });
    }
}

// Check if p2Unit can shoot at p1Unit
if (hasRangedWeapon(p2Unit)) {
    const weaponRange = getWeaponRange(p2Unit.primaryWeapon);
    if (distance > 1 && distance <= weaponRange.maximum) {
        combats.push({
            location: p2Unit.position,
            shooter: p2Unit,
            target: p1Unit,
            type: 'ranged',
            distance: distance,
            weaponRange: weaponRange
        });
    }
}
```

**Acceptance Criteria:**
- [ ] Ranged units can target up to their maximum range
- [ ] Both players' ranged units detected
- [ ] Weapon range data included in combat object
- [ ] Melee combat still works (distance ≤ 1)

---

#### **TASK-1C: Parse Ranged Orders**
**File:** `src/ai/orderInterpreter.js` (MODIFY)  
**Effort:** 2 hours  
**Dependencies:** TASK-1A

**Add ranged order parsing to `callAIForOrderParsing()`:**

```javascript
// ADD AFTER line ~115 (after movement parsing):

// Parse ranged attack orders
if (lowerOrder.match(/\b(shoot|fire|target|attack|volley)\b/)) {
  const targetMatch = lowerOrder.match(/(?:shoot|fire|target|attack)\s+(?:at\s+)?(?:the\s+)?(\w+)/i);
  
  if (targetMatch) {
    return {
      actions: [{
        type: 'ranged_attack',
        unitId: unit.id,
        targetKeyword: targetMatch[1], // "cavalry", "infantry", "enemy"
        reasoning: `Shooting at ${targetMatch[1]}`
      }],
      validation: { isValid: true, errors: [], warnings: [] },
      officerComment: `Archers readying volleys against ${targetMatch[1]}.`
    };
  }
}
```

**In `interpretOrders()` function, add validation:**

```javascript
// ADD AFTER line ~60 (after move validation):

if (action.type === 'ranged_attack') {
    const { validateRangedAttack } = require('../game/rangedCombat');
    
    const unit = playerUnits.find(u => u.unitId === action.unitId);
    if (!unit) {
        errors.push(`Unit ${action.unitId} not found`);
        continue;
    }
    
    const validation = validateRangedAttack(
        unit, 
        action.targetKeyword,
        battleState,
        playerSide
    );
    
    if (validation.valid) {
        validatedActions.push({
            ...action,
            validation,
            target: validation.target
        });
    } else {
        errors.push({
            unit: unit.unitId,
            error: validation.error
        });
    }
}
```

**Acceptance Criteria:**
- [ ] Recognizes "shoot at X" orders
- [ ] Extracts target keyword
- [ ] Validates target exists and in range
- [ ] Returns validated ranged_attack action

---

### **TASK 2: Melee Engagement Detection**

#### **TASK-2A: Track Adjacent Combats**
**File:** `src/game/positionBasedCombat.js` (MODIFY)  
**Effort:** 1-2 hours  
**Dependencies:** None

**Add engagement tracking to units after combat detection:**

```javascript
// ADD NEW FUNCTION (after detectCombatTriggers):

/**
 * Mark which units are engaged in melee combat
 * @param {Array} combats - Combat triggers from detectCombatTriggers
 * @param {Array} allUnits - All units on battlefield
 * @returns {Map} Map of unitId → {engaged: bool, fightingWith: [unitIds]}
 */
function trackMeleeEngagements(combats, allUnits) {
    const engagements = new Map();
    
    // Initialize all units as not engaged
    allUnits.forEach(unit => {
        engagements.set(unit.unitId, {
            engaged: false,
            fightingWith: [],
            adjacentFriendlies: []
        });
    });
    
    // Mark units in melee combat
    combats.forEach(combat => {
        if (combat.type === 'melee' || combat.distance === 1) {
            const attackerId = combat.attacker.unitId;
            const defenderId = combat.defender.unitId;
            
            engagements.get(attackerId).engaged = true;
            engagements.get(attackerId).fightingWith.push(defenderId);
            
            engagements.get(defenderId).engaged = true;
            engagements.get(defenderId).fightingWith.push(attackerId);
        }
    });
    
    // Find adjacent friendly units for each engaged unit
    allUnits.forEach(unit => {
        if (engagements.get(unit.unitId).engaged) {
            const adjacent = getAdjacentCoords(unit.position);
            const friendlies = allUnits.filter(u => 
                u.side === unit.side &&
                u.unitId !== unit.unitId &&
                adjacent.some(pos => pos === u.position)
            );
            
            engagements.get(unit.unitId).adjacentFriendlies = 
                friendlies.map(f => f.unitId);
        }
    });
    
    return engagements;
}

module.exports = {
    // ... existing exports
    trackMeleeEngagements
};
```

**Acceptance Criteria:**
- [ ] All units marked as engaged/not engaged
- [ ] Fighting partner IDs stored
- [ ] Adjacent friendly units tracked
- [ ] Returns Map data structure

---

#### **TASK-2B: Integrate Engagement Tracking**
**File:** `src/game/turnOrchestrator.js` (MODIFY)  
**Effort:** 1 hour  
**Dependencies:** TASK-2A

**Add engagement tracking to turn processing:**

```javascript
// MODIFY processMovementPhase call (around line 50):

// OLD:
const movementResults = processMovementPhase(
    p1Interpretation.validatedActions.filter(a => a.type === 'move'),
    p2Interpretation.validatedActions.filter(a => a.type === 'move'),
    battleState,
    map
);

// NEW:
const { trackMeleeEngagements } = require('./positionBasedCombat');

const movementResults = processMovementPhase(
    p1Interpretation.validatedActions.filter(a => a.type === 'move'),
    p2Interpretation.validatedActions.filter(a => a.type === 'move'),
    battleState,
    map
);

// Track which units are engaged in melee
const allUnits = [
    ...movementResults.newPositions.player1.map(u => ({...u, side: 'player1'})),
    ...movementResults.newPositions.player2.map(u => ({...u, side: 'player2'}))
];
const meleeEngagements = trackMeleeEngagements(
    movementResults.combatEngagements,
    allUnits
);

// Store in battle state for friendly fire checks
battleState.meleeEngagements = meleeEngagements;
```

**Acceptance Criteria:**
- [ ] Engagement tracking called after movement
- [ ] Stored in battleState
- [ ] Available for friendly fire calculations

---

### **TASK 3: Friendly Fire Calculation**

#### **TASK-3A: Validate Ranged Attacks**
**File:** `src/game/rangedCombat.js` (EXPAND)  
**Effort:** 3 hours  
**Dependencies:** TASK-1A, TASK-2A

**Add validation and friendly fire calculation:**

```javascript
// ADD TO src/game/rangedCombat.js:

const { calculateDistance } = require('./maps/mapUtils');

/**
 * Validate ranged attack order
 * @param {Object} shooter - Shooting unit
 * @param {string} targetKeyword - Target description ("cavalry", "infantry", etc)
 * @param {Object} battleState - Current battle state
 * @param {string} playerSide - 'player1' or 'player2'
 * @returns {Object} Validation result with target and friendly fire data
 */
function validateRangedAttack(shooter, targetKeyword, battleState, playerSide) {
  // Find target
  const enemySide = playerSide === 'player1' ? 'player2' : 'player1';
  const target = findBestTarget(shooter, targetKeyword, battleState[enemySide]);
  
  if (!target) {
    return {
      valid: false,
      error: `Cannot identify target "${targetKeyword}"`
    };
  }
  
  // Check range
  const weaponRange = getWeaponRange(shooter.primaryWeapon);
  if (!weaponRange) {
    return {
      valid: false,
      error: `Unit has no ranged weapon`
    };
  }
  
  const distance = calculateDistance(shooter.position, target.position);
  
  if (distance > weaponRange.maximum) {
    return {
      valid: false,
      error: `Target out of range (${distance} tiles, max ${weaponRange.maximum})`
    };
  }
  
  // Calculate friendly fire risk
  const ffRisk = calculateFriendlyFireRisk(shooter, target, battleState);
  
  return {
    valid: true,
    target: target,
    distance: distance,
    rangeModifier: calculateRangeModifier(distance, weaponRange),
    friendlyFireRisk: ffRisk,
    needsConfirmation: ffRisk.risk > 0.20
  };
}

/**
 * Find best enemy target matching keyword
 */
function findBestTarget(shooter, keyword, enemyState) {
  const enemyUnits = enemyState.unitPositions || [];
  const lowerKeyword = keyword.toLowerCase();
  
  // Match by unit type
  for (const unit of enemyUnits) {
    const unitType = (unit.unitType || '').toLowerCase();
    if (unitType.includes(lowerKeyword)) {
      return unit;
    }
  }
  
  // If keyword is "enemy", return closest
  if (lowerKeyword.includes('enemy')) {
    return enemyUnits.sort((a, b) => {
      const distA = calculateDistance(shooter.position, a.position);
      const distB = calculateDistance(shooter.position, b.position);
      return distA - distB;
    })[0];
  }
  
  return null;
}

/**
 * Calculate friendly fire risk when shooting at target
 * @param {Object} shooter - Shooting unit
 * @param {Object} target - Target enemy unit
 * @param {Object} battleState - Current battle state with meleeEngagements
 * @returns {Object} Risk data
 */
function calculateFriendlyFireRisk(shooter, target, battleState) {
  const engagements = battleState.meleeEngagements;
  
  if (!engagements) {
    return { risk: 0, method: 'clear_shot' };
  }
  
  // Check if target is engaged in melee
  const targetEngagement = engagements.get(target.unitId);
  
  if (!targetEngagement || !targetEngagement.engaged) {
    return { risk: 0, method: 'clear_shot' };
  }
  
  // Target IS engaged - calculate friendly fire risk
  const friendlyUnitsInMelee = targetEngagement.fightingWith
    .map(enemyId => engagements.get(enemyId))
    .filter(e => e); // Filter out undefined
  
  // Base risk by weapon trajectory
  const trajectoryRisk = {
    'flat': 0.40,      // Crossbows
    'medium': 0.30,    // Bows
    'high': 0.20       // Slings
  };
  
  const weaponData = getWeaponRange(shooter.primaryWeapon);
  let baseRisk = trajectoryRisk[weaponData.trajectory] || 0.30;
  
  // Adjust for shooting angle
  const angle = calculateShootingAngle(shooter, target, targetEngagement);
  
  if (angle === 'flanking') {
    baseRisk *= 0.35; // Reduced to 10-15%
  } else if (angle === 'elevated') {
    baseRisk *= 0.65; // Reduced to 20-25%
  }
  // else: frontal/rear = full risk
  
  return {
    risk: baseRisk,
    method: angle || 'shooting_into_melee',
    trajectoryType: weaponData.trajectory,
    friendlyUnitsAtRisk: targetEngagement.adjacentFriendlies || []
  };
}

/**
 * Calculate shooting angle relative to melee
 */
function calculateShootingAngle(shooter, target, engagement) {
  // Get shooter's angle to target
  const { parseCoord } = require('./maps/mapUtils');
  
  const shooterPos = parseCoord(shooter.position);
  const targetPos = parseCoord(target.position);
  
  // Check elevation (shooter on hill)
  // TODO: Add elevation checking when terrain elevation implemented
  // For now, assume plains
  
  // Check if perpendicular to melee line
  // Simplified: if shooter's row OR column matches target, it's flanking
  if (shooterPos.row === targetPos.row || shooterPos.col === targetPos.col) {
    return 'flanking'; // Perpendicular shot
  }
  
  return 'frontal'; // Diagonal/frontal shot
}

module.exports = {
  // ... existing exports
  validateRangedAttack,
  calculateFriendlyFireRisk
};
```

**Acceptance Criteria:**
- [ ] Detects if target engaged in melee
- [ ] Calculates base FF risk by trajectory
- [ ] Adjusts for shooting angle
- [ ] Returns complete risk data

---

#### **TASK-3B: Friendly Fire Warning System**
**File:** `src/game/orderFeedback.js` (NEW)  
**Effort:** 2 hours  
**Dependencies:** TASK-3A

**Create warning system for risky shots:**

```javascript
// src/game/orderFeedback.js (NEW FILE)

/**
 * Generate warning message for friendly fire risk
 * @param {Object} rangedValidation - Validation result from validateRangedAttack
 * @param {Object} shooter - Shooting unit
 * @param {string} culture - Player's culture
 * @returns {Object} Warning message and confirmation requirement
 */
function generateFriendlyFireWarning(rangedValidation, shooter, culture) {
  const ffRisk = rangedValidation.friendlyFireRisk;
  
  if (ffRisk.risk < 0.20) {
    return null; // No warning needed for low risk
  }
  
  const riskPercent = Math.round(ffRisk.risk * 100);
  const friendlyDamage = Math.round(ffRisk.risk * 100); // Rough estimate
  const enemyDamage = 100 - friendlyDamage;
  
  // Cultural officer responses
  const officerName = getOfficerName(shooter, culture);
  const warning = generateCulturalWarning(
    officerName,
    culture,
    riskPercent,
    enemyDamage,
    friendlyDamage,
    ffRisk.friendlyUnitsAtRisk
  );
  
  return {
    requiresConfirmation: true,
    warning: warning,
    risk: ffRisk,
    options: [
      { id: 'confirm', label: '✓ Fire Anyway', value: 'proceed' },
      { id: 'cancel', label: '✗ Hold Fire', value: 'cancel' },
      { id: 'reposition', label: '📍 Reposition First', value: 'suggest_movement' }
    ]
  };
}

/**
 * Generate cultural officer warning
 */
function generateCulturalWarning(officer, culture, risk, enemyDmg, friendlyDmg, friendlyUnits) {
  const warnings = {
    'Roman Republic': 
      `⚠️ **${officer} reports:**\n\n"Commander, the enemy is locked in melee with our troops! Firing into the brawl will strike both sides:\n• ${enemyDmg}% damage to enemy\n• ${friendlyDmg}% to our own men (est. ~${Math.floor(friendlyDmg/2)} casualties)\n• Morale penalty to our engaged troops\n\nDo you wish to proceed?"`,
    
    'Celtic Tribes':
      `⚠️ **${officer} shouts:**\n\n"Chieftain! Our brothers fight blade-to-blade with the enemy! Your arrows will pierce friend and foe alike - the bards will sing of friendly blood if we loose!\n• ${enemyDmg}% will strike the enemy\n• ${friendlyDmg}% will strike our own warriors\n\nWhat is your command?"`,
    
    'Han Dynasty':
      `⚠️ **${officer} bows:**\n\n"Honorable Commander, our soldiers are engaged at close quarters. The Crossbow Manual warns against such shots:\n• Enemy casualties: ${enemyDmg}%\n• Friendly casualties: ${friendlyDmg}%\n• Dishonor to strike our own\n\nYour orders?"`,
    
    'default':
      `⚠️ **${officer}:**\n\n"Commander, our troops are in melee with the enemy! Shooting will hit BOTH sides:\n• ${enemyDmg}% damage to enemy\n• ${friendlyDmg}% to our own troops\n• -1 morale to friendly unit\n\nProceed?"`
  };
  
  return warnings[culture] || warnings['default'];
}

function getOfficerName(unit, culture) {
  // Use actual officer name if available
  if (unit.commanderName) return unit.commanderName;
  
  // Default by culture
  const defaults = {
    'Roman Republic': 'Centurion Marcus',
    'Celtic Tribes': 'Brennus the Bold',
    'Han Dynasty': 'General Wei',
    'Spartan City-State': 'Lochagos Leonidas',
    'Macedonian Kingdoms': 'Phalangarch Philip'
  };
  
  return defaults[culture] || 'Officer';
}

module.exports = {
  generateFriendlyFireWarning
};
```

**Acceptance Criteria:**
- [ ] Generates warnings for risk >20%
- [ ] Cultural officer personalities
- [ ] Shows estimated casualties
- [ ] Provides 3 options (fire/cancel/reposition)

---

### **TASK 4: Combat Resolution Integration**

#### **TASK-4A: Resolve Ranged Attacks**
**File:** `src/game/battleEngine.js` (MODIFY)  
**Effort:** 3-4 hours  
**Dependencies:** TASK-1A, TASK-3A

**Add new function to battleEngine.js:**

```javascript
// ADD AFTER resolveCombat function (line ~200):

/**
 * Resolve ranged attack with friendly fire checking
 * @param {Object} rangedOrder - Validated ranged attack order
 * @param {Object} battleState - Current battle state
 * @returns {Object} Ranged attack results with casualties
 */
async function resolveRangedAttack(rangedOrder, battleState) {
    const { shooter, target, distance, rangeModifier, friendlyFireRisk } = rangedOrder.validation;
    
    // Calculate base damage
    const shooterStats = calculateUnitEffectiveness(
        { units: [shooter], culture: shooter.culture },
        { weather: battleState.weather, terrain: 'plains' },
        'attack'
    );
    
    let baseDamage = shooterStats.attack * rangeModifier;
    
    // Check for friendly fire
    let enemyCasualties = 0;
    let friendlyCasualties = 0;
    let friendlyFireOccurred = false;
    
    if (friendlyFireRisk && friendlyFireRisk.risk > 0) {
        const roll = Math.random();
        
        if (roll < friendlyFireRisk.risk) {
            // FRIENDLY FIRE TRIGGERED
            friendlyFireOccurred = true;
            
            // Split damage
            enemyCasualties = Math.floor(baseDamage * (1 - friendlyFireRisk.risk));
            friendlyCasualties = Math.floor(baseDamage * friendlyFireRisk.risk);
            
            return {
                type: 'ranged_with_friendly_fire',
                shooter: shooter,
                target: target,
                distance: distance,
                enemyCasualties: calculateActualCasualties(target, enemyCasualties),
                friendlyCasualties: distributeFriendlyFireCasualties(
                    friendlyCasualties,
                    friendlyFireRisk.friendlyUnitsAtRisk,
                    battleState
                ),
                moraleImpact: -1, // Friendly units angry
                method: friendlyFireRisk.method,
                trajectoryType: friendlyFireRisk.trajectoryType
            };
        }
    }
    
    // No friendly fire - clean shot
    enemyCasualties = Math.floor(baseDamage);
    
    return {
        type: 'ranged_attack',
        shooter: shooter,
        target: target,
        distance: distance,
        casualties: calculateActualCasualties(target, enemyCasualties),
        method: friendlyFireRisk?.method || 'clear_shot',
        trajectoryType: friendlyFireRisk?.trajectoryType || 'medium'
    };
}

/**
 * Calculate actual casualties from raw damage
 */
function calculateActualCasualties(target, rawDamage) {
    const damageReduction = target.armorValue || 0;
    const effectiveDamage = rawDamage * (1 - damageReduction);
    
    // Casualty rate: ~1 casualty per 10 damage points
    const casualties = Math.floor(effectiveDamage / 10);
    
    return Math.min(casualties, target.currentStrength);
}

/**
 * Distribute friendly fire casualties among engaged units
 */
function distributeFriendlyFireCasualties(totalDamage, friendlyUnitIds, battleState) {
    if (friendlyUnitIds.length === 0) return [];
    
    const casualtiesPerUnit = Math.ceil(totalDamage / friendlyUnitIds.length / 10);
    
    return friendlyUnitIds.map(unitId => ({
        unitId: unitId,
        casualties: casualtiesPerUnit
    }));
}

module.exports = {
  // ... existing exports
  resolveRangedAttack,
  validateRangedAttack
};
```

**Acceptance Criteria:**
- [ ] Validates target and range
- [ ] Calculates friendly fire probability
- [ ] Rolls for friendly fire occurrence
- [ ] Splits damage correctly when FF occurs
- [ ] Returns complete results object

---

#### **TASK-4B: Add Ranged Phase to Turn Resolution**
**File:** `src/game/turnOrchestrator.js` (MODIFY)  
**Effort:** 2-3 hours  
**Dependencies:** TASK-4A

**Insert ranged combat phase between movement and melee:**

```javascript
// INSERT AFTER Phase 3 (around line 70), BEFORE Phase 4 melee combat:

// PHASE 3.5: Resolve ranged attacks
console.log('\n🏹 Phase 3.5: Resolving ranged attacks...');
const rangedResults = [];

const { resolveRangedAttack } = require('./battleEngine');

// Process player 1 ranged attacks
const p1RangedOrders = p1Interpretation.validatedActions.filter(a => a.type === 'ranged_attack');
for (const order of p1RangedOrders) {
    const result = await resolveRangedAttack(order, battleState);
    rangedResults.push({
        ...result,
        shooter: order.validation.target.unitId,
        shooterSide: 'player1'
    });
}

// Process player 2 ranged attacks
const p2RangedOrders = p2Interpretation.validatedActions.filter(a => a.type === 'ranged_attack');
for (const order of p2RangedOrders) {
    const result = await resolveRangedAttack(order, battleState);
    rangedResults.push({
        ...result,
        shooterSide: 'player2'
    });
}

// Apply ranged casualties before melee
const positionsAfterRanged = applyRangedCasualties(
    movementResults.newPositions,
    rangedResults
);

// Update battleState positions for melee phase
movementResults.newPositions = positionsAfterRanged;
```

**Add new helper function:**

```javascript
// ADD NEAR END OF FILE (before module.exports):

/**
 * Apply casualties from ranged attacks
 */
function applyRangedCasualties(positions, rangedResults) {
    const updated = {
        player1: [...positions.player1],
        player2: [...positions.player2]
    };
    
    rangedResults.forEach(result => {
        // Apply enemy casualties
        if (result.casualties) {
            const enemySide = result.shooterSide === 'player1' ? 'player2' : 'player1';
            const targetIndex = updated[enemySide].findIndex(u => 
                u.unitId === result.target.unitId
            );
            
            if (targetIndex >= 0) {
                updated[enemySide][targetIndex].currentStrength -= result.casualties;
            }
        }
        
        // Apply friendly fire casualties
        if (result.friendlyCasualties) {
            const friendlySide = result.shooterSide;
            
            result.friendlyCasualties.forEach(fc => {
                const unitIndex = updated[friendlySide].findIndex(u => 
                    u.unitId === fc.unitId
                );
                
                if (unitIndex >= 0) {
                    updated[friendlySide][unitIndex].currentStrength -= fc.casualties;
                    updated[friendlySide][unitIndex].morale = 
                        (updated[friendlySide][unitIndex].morale || 100) - 1;
                }
            });
        }
    });
    
    // Remove destroyed units
    updated.player1 = updated.player1.filter(u => u.currentStrength > 0);
    updated.player2 = updated.player2.filter(u => u.currentStrength > 0);
    
    return updated;
}
```

**Acceptance Criteria:**
- [ ] Ranged attacks resolve before melee
- [ ] Casualties applied to both enemy and friendlies (if FF)
- [ ] Morale penalties applied
- [ ] Updated positions passed to melee phase

---

### **TASK 5: Player Confirmation Flow**

#### **TASK-5A: DM Handler Confirmation**
**File:** `src/bot/dmHandler.js` (MODIFY)  
**Effort:** 2-3 hours  
**Dependencies:** TASK-3B

**Add confirmation request when friendly fire risk detected:**

```javascript
// MODIFY handleDMCommand function (around line 30-60):

// After order interpretation, check for FF risk
if (interpretation.validatedActions.some(a => a.needsConfirmation)) {
    const riskyAction = interpretation.validatedActions.find(a => a.needsConfirmation);
    const { generateFriendlyFireWarning } = require('../game/orderFeedback');
    
    const warning = generateFriendlyFireWarning(
        riskyAction.validation,
        riskyAction.validation.target,
        battleState[playerSide].culture
    );
    
    if (warning) {
        // Store pending order
        pendingOrders.set(message.author.id, {
            order: orderText,
            action: riskyAction,
            battleId: battle.id,
            timestamp: Date.now()
        });
        
        // Send confirmation request
        const confirmMsg = await message.reply({
            content: warning.warning,
            components: [{
                type: 1,
                components: warning.options.map(opt => ({
                    type: 2,
                    style: opt.id === 'confirm' ? 4 : 2, // Danger for confirm
                    custom_id: `ff_${opt.id}`,
                    label: opt.label
                }))
            }]
        });
        
        return; // Wait for button response
    }
}

// If no confirmation needed, proceed normally
await submitOrder(battle, message.author.id, playerSide, orderText);
```

**Handle button responses:**

```javascript
// ADD NEW FUNCTION:

async function handleFriendlyFireConfirmation(interaction) {
    const userId = interaction.user.id;
    const pending = pendingOrders.get(userId);
    
    if (!pending) {
        return interaction.reply({ content: 'Order expired', ephemeral: true });
    }
    
    const choice = interaction.customId.split('_')[1]; // 'confirm', 'cancel', 'reposition'
    
    if (choice === 'confirm') {
        // Proceed with risky shot
        await submitOrder(
            { id: pending.battleId }, 
            userId, 
            'player1', // Need to determine from battle
            pending.order
        );
        
        await interaction.update({
            content: '✓ Order confirmed - archers will fire into melee.',
            components: []
        });
    } else if (choice === 'cancel') {
        await interaction.update({
            content: '✗ Archers holding fire. Please provide new orders.',
            components: []
        });
    } else if (choice === 'reposition') {
        await interaction.update({
            content: '📍 Suggested: Move archers to flanking position first, or wait for melee to resolve.',
            components: []
        });
    }
    
    pendingOrders.delete(userId);
}
```

**Acceptance Criteria:**
- [ ] Detects risky orders
- [ ] Sends confirmation request with buttons
- [ ] Stores pending order
- [ ] Handles button responses
- [ ] Proceeds or cancels based on choice

---

### **TASK 6: AI Narrative Generation**

#### **TASK-6A: Ranged Attack Narratives**
**File:** `src/ai/aiNarrativeEngine.js` (MODIFY)  
**Effort:** 2-3 hours  
**Dependencies:** TASK-4A

**Add ranged combat narrative generation:**

```javascript
// ADD NEW FUNCTION:

/**
 * Generate narrative for ranged attack
 * @param {Object} rangedResult - Result from resolveRangedAttack
 * @param {Object} battleContext - Current battle state and turn
 * @returns {string} Dramatic narrative
 */
function generateRangedNarrative(rangedResult, battleContext) {
  const { shooter, target, distance, method, trajectoryType } = rangedResult;
  
  if (rangedResult.type === 'ranged_with_friendly_fire') {
    return generateFriendlyFireNarrative(rangedResult, battleContext);
  }
  
  // Clean shot narratives
  const templates = {
    clear_shot: {
      bow: [
        `${shooter.name} draws back their bowstrings! Arrows hiss through the air, arcing gracefully toward ${target.name}. ${rangedResult.casualties} warriors fall as shafts find their marks.`,
        `A cloud of arrows darkens the sky above ${target.name}! The enemy has no time to react - ${rangedResult.casualties} men crumple as iron-tipped death rains down.`
      ],
      crossbow: [
        `${shooter.name} looses their crossbow bolts! The flat trajectory strikes ${target.name} with devastating precision. ${rangedResult.casualties} warriors pierced by unstoppable bolts.`,
        `Crossbow bolts scream across the battlefield! ${target.name} attempts to raise shields but the range is perfect - ${rangedResult.casualties} men fall with bolts buried deep.`
      ],
      sling: [
        `${shooter.name} whirls their slings overhead! Lead bullets whistle through the air in high arcs. ${target.name} watches death descend - ${rangedResult.casualties} skulls cracked by stone and lead.`,
        `The slingers loose! Projectiles arc impossibly high before plummeting onto ${target.name}. Helmets ring and crack - ${rangedResult.casualties} warriors collapse.`
      ]
    },
    
    flanking: {
      bow: [
        `${shooter.name} pours arrows into ${target.name}'s exposed flank! With no shields facing this direction, the enemy is helpless - ${rangedResult.casualties} fall to perfectly aimed shafts.`
      ],
      crossbow: [
        `Crossbow bolts tear into ${target.name}'s unprotected side! The flat trajectory finds gaps in their defense - ${rangedResult.casualties} pierced through.`
      ]
    }
  };
  
  const weaponType = trajectoryType === 'flat' ? 'crossbow' : 
                     trajectoryType === 'high' ? 'sling' : 'bow';
  
  const narrativeSet = templates[method] || templates.clear_shot;
  const options = narrativeSet[weaponType] || narrativeSet.bow;
  
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate friendly fire incident narrative
 */
function generateFriendlyFireNarrative(rangedResult, battleContext) {
  const { shooter, target, enemyCasualties, friendlyCasualties } = rangedResult;
  
  const totalFriendlyCas = friendlyCasualties.reduce((sum, fc) => sum + fc.casualties, 0);
  
  const templates = [
    `${shooter.name} looses their volley into the melee! Arrows rain down on the chaotic brawl where friend and foe are intermixed.
    
    💀 Enemy casualties: ${enemyCasualties}
    💀 FRIENDLY casualties: ${totalFriendlyCas} - struck by your own arrows!
    
    "THE ARCHERS! OUR OWN ARCHERS!" roars a bloodied sergeant as an arrow punches through his shoulder. Your engaged troops fight on grimly, but morale wavers...`,
    
    `Shafts whistle overhead and plunge into the melee! But in the chaos of close combat, ${totalFriendlyCas} arrows find YOUR OWN TROOPS instead of the enemy.
    
    Screams of pain and rage erupt from your infantry: "WHO GAVE THE ORDER TO FIRE?!" Officers struggle to maintain discipline as trust fractures.
    
    Enemy losses: ${enemyCasualties}
    Friendly fire casualties: ${totalFriendlyCas}
    Morale impact: -1 (anger at archers)`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

module.exports = {
  // ... existing exports
  generateRangedNarrative,
  generateFriendlyFireNarrative
};
```

**Acceptance Criteria:**
- [ ] Different narratives for clean shots vs FF
- [ ] Weapon-specific descriptions (bow/crossbow/sling)
- [ ] Casualties clearly stated
- [ ] Morale impact emphasized for FF

---

#### **TASK-6B: Integrate into Turn Narrative**
**File:** `src/game/turnOrchestrator.js` (MODIFY)  
**Effort:** 1 hour  
**Dependencies:** TASK-6A

**Add ranged results to narrative generation:**

```javascript
// MODIFY generateTurnNarrative call (around line 100):

const narrative = await generateTurnNarrative(
    {
        movements: movementResults,
        intelligence: { player1: p1Visibility, player2: p2Visibility },
        rangedAttacks: rangedResults, // ADD THIS
        combats: combatResults,
        casualties: extractCasualtySummary(combatResults, rangedResults) // MODIFY
    },
    battleState,
    battle.currentTurn
);

// MODIFY extractCasualtySummary to include ranged casualties:
function extractCasualtySummary(combatResults, rangedResults = []) {
    let p1Total = 0;
    let p2Total = 0;
    
    // Melee casualties
    combatResults.forEach(combat => {
        combat.result.casualties.attacker.forEach(cas => p1Total += cas.casualties);
        combat.result.casualties.defender.forEach(cas => p2Total += cas.casualties);
    });
    
    // Ranged casualties
    rangedResults.forEach(ranged => {
        if (ranged.shooterSide === 'player1') {
            p2Total += ranged.casualties || ranged.enemyCasualties || 0;
            if (ranged.friendlyCasualties) {
                p1Total += ranged.friendlyCasualties.reduce((sum, fc) => sum + fc.casualties, 0);
            }
        } else {
            p1Total += ranged.casualties || ranged.enemyCasualties || 0;
            if (ranged.friendlyCasualties) {
                p2Total += ranged.friendlyCasualties.reduce((sum, fc) => sum + fc.casualties, 0);
            }
        }
    });
    
    return {
        player1: p1Total,
        player2: p2Total
    };
}
```

**Acceptance Criteria:**
- [ ] Ranged results included in narrative
- [ ] Casualties counted correctly
- [ ] Friendly fire incidents highlighted
- [ ] Turn summary includes ranged phase

---

## 🗂️ File Modification Summary

### New Files (1)
- `src/game/rangedCombat.js` - Range bands, validation, FF calculation
- `src/game/orderFeedback.js` - Warning generation

### Modified Files (5)
- `src/game/positionBasedCombat.js` - Ranged detection, engagement tracking
- `src/ai/orderInterpreter.js` - Parse ranged orders
- `src/game/battleEngine.js` - Ranged attack resolution
- `src/game/turnOrchestrator.js` - Ranged combat phase, casualty tracking
- `src/bot/dmHandler.js` - Confirmation flow
- `src/ai/aiNarrativeEngine.js` - Ranged narratives

---

## ✅ Testing Plan

### Unit Tests
1. **Range calculation** - Verify 100% → 40% degradation
2. **Friendly fire math** - Verify risk percentages (20/30/40%)
3. **Angle detection** - Flanking vs frontal shots
4. **Target finding** - Keyword matching works

### Integration Tests
1. **Clear shot** - Archer shoots unengaged enemy, no FF
2. **Melee shot** - Archer shoots into melee, FF triggers
3. **Flanking shot** - Perpendicular angle reduces FF risk
4. **Out of range** - Order rejected appropriately
5. **Confirmation flow** - Warning → button → proceed/cancel

### Smoke Tests
1. Full turn with ranged and melee combined
2. Multiple ranged units shooting simultaneously
3. Friendly fire cascading effects (morale + casualties)

---

## 📊 Implementation Schedule

| Week | Tasks | Hours | Deliverables |
|------|-------|-------|--------------|
| **Week 1** | TASK-1A, 1B, 1C | 6-7h | Range system, detection, parsing |
| **Week 2** | TASK-2A, 2B | 2-3h | Engagement tracking |
| **Week 3** | TASK-3A, 3B | 5h | FF calculation, warnings |
| **Week 4** | TASK-4A, 4B | 5-7h | Combat resolution, integration |
| **Week 5** | TASK-5A, TASK-6A, 6B | 5-6h | Confirmation flow, narratives |

**Total: 23-28 hours**

---

## 🔍 Compatibility Notes

### Verified Compatible With:
✅ **Current combat flow** - Adds phase 3.5 between movement and melee  
✅ **Order interpretation** - Extends existing validation system  
✅ **Battle state structure** - Uses existing unit position data  
✅ **Casualty application** - Follows existing pattern  
✅ **AI integration** - Plugs into aiNarrativeEngine.js  

### Potential Conflicts:
⚠️ **None identified** - System designed to extend, not replace existing mechanics

### Required Prerequisites:
- Unit equipment data must include `primaryWeapon` field
- Units must have `currentStrength` and `morale` tracked
- Battle state must persist between turns (already implemented)

---

## 🎮 Example Gameplay Flow

### Turn 5: Player Orders Ranged Attack

**Player DM:** "Archers shoot at enemy cavalry"

**Bot Response:**
```
⚠️ Centurion Marcus reports:

"Commander, the enemy cavalry is locked in melee with our 
Northern Infantry! Firing into the brawl will strike both sides:

• 70% damage to enemy cavalry (~35 casualties)
• 30% damage to Northern Infantry (~15 casualties)  
• -1 morale to Northern Infantry (anger at archers)

Do you wish to proceed?"

[✓ Fire Anyway] [✗ Hold Fire] [📍 Reposition First]
```

**Player clicks:** ✓ Fire Anyway

**Turn Resolution:**
```
🏹 RANGED COMBAT PHASE:

Your archers loose their volleys into the melee! Arrows arc 
high before plummeting into the chaotic brawl...

*THUNK* *THUNK* *THUNK*

Enemy cavalry: 37 warriors fall to arrow strikes
FRIENDLY FIRE: Northern Infantry - 18 men struck by friendly arrows!

"WHO ORDERED THIS?!" bellows Sergeant Knox, an arrow lodged 
in his shield arm. The Northern Infantry fight on, but their 
trust in command has wavered...

Northern Infantry morale: 85 → 84 (-1 from friendly fire)
```

---

## 🚀 Ready for Implementation

This document provides complete specification for WARP to implement ranged combat system. All tasks are:
- Clearly defined with specific file locations
- Compatible with existing codebase structure  
- Include code examples for modification
- Have measurable acceptance criteria

**Next Step:** Begin with TASK-1A (Range Band System) as foundation for all subsequent tasks.
