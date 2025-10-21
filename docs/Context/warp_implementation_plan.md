# Warp Agent Implementation Plan - Combat System Fix

**Date:** October 20, 2025  
**Objective:** Fix combat system to match approved design in `combat_design_parameters.md`  
**Estimated Time:** 12-18 hours across 7 tasks  
**Priority:** Complete in order - each phase builds on previous

---

## 🎯 MISSION BRIEF FOR WARP

You are fixing a combat system that was implemented incorrectly. The approved design is in:
- `docs/Context/combat_design_parameters.md` ← **THE AUTHORITATIVE SOURCE**

Your current implementation in `src/game/battleEngine.js` uses the OLD ratio system. You need to replace it with the APPROVED attack-defense-chaos-preparation system.

**Core Formula You Must Implement:**
```javascript
baseDamage = attacker.attack - defender.defense
chaosLevel = calculateChaos(conditions)
chaosRoll = random(1, chaosLevel)
rawChaos = chaosRoll - (chaosLevel / 2)
attackerChaos = rawChaos / attackerPrep
defenderChaos = rawChaos / defenderPrep
effectiveAttack = attack - attackerChaos
effectiveDefense = defense - defenderChaos
damage = effectiveAttack - effectiveDefense
if (damage > 0) casualties = damage * 5
else applyDamageWithAccumulation(unit, damage)
```

---

## 📋 PHASE 1: CRITICAL - Fix Battle Engine (4-6 hours)

### **Task 1.1: Rewrite `resolveCombat()` Function**

**File:** `src/game/battleEngine.js`  
**Action:** Replace entire `resolveCombat()` function

**Required Steps:**

1. **Import the new combat modules at top of file:**
```javascript
const { calculateAttackRating } = require('./combat/attackRatings');
const { calculateDefenseRating } = require('./combat/defenseRatings');
const { calculateChaosLevel, rollChaosModifier } = require('./combat/chaosCalculator');
const { calculatePreparation } = require('./combat/preparationCalculator');
const { applyDamageWithAccumulation } = require('./combat/damageAccumulation');
```

2. **Rewrite `resolveCombat()` to use approved formula:**

```javascript
async function resolveCombat(attackingForce, defendingForce, battleConditions, tacticalContext) {
    // STEP 1: Calculate attack ratings for both sides
    const attackerUnit = attackingForce.units[0]; // Primary unit
    const defenderUnit = defendingForce.units[0];
    
    const attackerAttackRating = calculateAttackRating(
        attackerUnit, 
        battleConditions,
        defenderUnit,
        false // isDefender = false
    );
    
    const defenderAttackRating = calculateAttackRating(
        defenderUnit,
        battleConditions, 
        attackerUnit,
        true // isDefender = true
    );
    
    // STEP 2: Calculate defense ratings
    const attackerDefenseRating = calculateDefenseRating(attackerUnit, battleConditions);
    const defenderDefenseRating = calculateDefenseRating(defenderUnit, battleConditions);
    
    // STEP 3: Calculate chaos level
    const chaosData = calculateChaosLevel({
        terrain: battleConditions.terrain || 'plains',
        weather: battleConditions.weather || 'clear',
        time_of_day: 'midday',
        unit_density: 'normal',
        combat_situation: battleConditions.combat_situation || 'prepared',
        formation_state: 'intact'
    });
    
    // STEP 4: Roll chaos modifier
    const chaosRoll = rollChaosModifier(chaosData.chaosLevel);
    
    // STEP 5: Calculate preparation (placeholder - will be enhanced in Phase 2)
    const attackerPrepData = calculatePreparation(attackerUnit, {
        isAttacker: true,
        ...battleConditions
    });
    
    const defenderPrepData = calculatePreparation(defenderUnit, {
        isDefender: true,
        ...battleConditions
    });
    
    // STEP 6: Apply chaos divided by preparation
    const attackerChaos = chaosRoll.modifier / attackerPrepData.preparationLevel;
    const defenderChaos = chaosRoll.modifier / defenderPrepData.preparationLevel;
    
    // STEP 7: Calculate effective values
    const effectiveAttackerAttack = attackerAttackRating - attackerChaos;
    const effectiveDefenderAttack = defenderAttackRating - defenderChaos;
    const effectiveAttackerDefense = attackerDefenseRating - defenderChaos;
    const effectiveDefenderDefense = defenderDefenseRating - attackerChaos;
    
    // STEP 8: Calculate raw damage (both sides attack)
    const attackerDamage = effectiveAttackerAttack - effectiveDefenderDefense;
    const defenderDamage = effectiveDefenderAttack - effectiveAttackerDefense;
    
    // STEP 9: Apply damage with accumulation
    const attackerCasualties = applyDamageWithAccumulation(
        defenderUnit, 
        attackerDamage,
        tacticalContext.turnNumber
    );
    
    const defenderCasualties = applyDamageWithAccumulation(
        attackerUnit,
        defenderDamage, 
        tacticalContext.turnNumber
    );
    
    // STEP 10: Return structured result for tests
    return {
        combatData: {
            // Chaos data
            chaosLevel: chaosData.chaosLevel,
            chaosRoll: chaosRoll.roll,
            rawChaos: chaosRoll.modifier,
            
            // Preparation
            attackerPreparation: attackerPrepData.preparationLevel,
            defenderPreparation: defenderPrepData.preparationLevel,
            
            // Applied chaos
            attackerChaos: attackerChaos,
            defenderChaos: defenderChaos,
            
            // Ratings
            attackerAttack: attackerAttackRating,
            defenderAttack: defenderAttackRating,
            attackerDefense: attackerDefenseRating,
            defenderDefense: defenderDefenseRating,
            
            // Effective values
            effectiveAttack: {
                attacker: effectiveAttackerAttack,
                defender: effectiveDefenderAttack
            },
            effectiveDefense: {
                attacker: effectiveAttackerDefense,
                defender: effectiveDefenderDefense
            },
            
            // Raw damage
            rawDamage: {
                attacker: attackerDamage,
                defender: defenderDamage
            }
        },
        
        casualties: {
            attacker: {
                total: defenderCasualties.casualties,
                accumulated: defenderCasualties.accumulatedAfter
            },
            defender: {
                total: attackerCasualties.casualties,
                accumulated: attackerCasualties.accumulatedAfter
            }
        },
        
        combatResult: {
            result: determineWinner(attackerDamage, defenderDamage, 
                                   attackerCasualties, defenderCasualties),
            intensity: determineIntensity(attackerDamage, defenderDamage)
        }
    };
}

// Helper function to determine winner
function determineWinner(attackerDamage, defenderDamage, attackerCas, defenderCas) {
    if (attackerCas.casualties > defenderCas.casualties * 2) {
        return 'defender_major_victory';
    } else if (attackerCas.casualties > defenderCas.casualties) {
        return 'defender_victory';
    } else if (defenderCas.casualties > attackerCas.casualties * 2) {
        return 'attacker_major_victory';
    } else if (defenderCas.casualties > attackerCas.casualties) {
        return 'attacker_victory';
    }
    return 'stalemate';
}

// Helper function to determine intensity
function determineIntensity(attackerDmg, defenderDmg) {
    const totalDamage = Math.abs(attackerDmg) + Math.abs(defenderDmg);
    if (totalDamage > 8) return 'decisive';
    if (totalDamage > 5) return 'significant';
    if (totalDamage > 2) return 'moderate';
    return 'light';
}
```

3. **Remove old ratio-based code:** Delete everything from lines 100-350 that calculates ratios

4. **Update exports:** Keep same export structure

**Testing:**
```bash
node src/game/combat/tests/simpleCombatTest.js
```

**Expected Output:**
- Chaos Level: 2/10
- Preparations calculated
- Damage = attack - defense - chaos adjustments
- Casualties from accumulation bucket
- No ratio calculations anywhere

**Success Criteria:**
- [ ] Test passes with expected casualty values
- [ ] No ratio calculations in code
- [ ] Uses all 5 new combat modules
- [ ] Returns data structure matching test expectations

---

## 📋 PHASE 2: HIGH - Fix Preparation System (3-4 hours)

### **Task 2.1: Rebalance Preparation Bonuses**

**File:** `src/game/combat/preparationCalculator.js`  
**Action:** Reduce all bonus values

**Changes Required:**

1. **Reduce all +0.3 bonuses to +0.2:**
```javascript
// OLD:
const TIME_POSITION_BONUSES = {
    'waitedOneTurn': 0.3,
    'defendingPreparedPosition': 0.3,
    // ...
};

// NEW:
const TIME_POSITION_BONUSES = {
    'waitedOneTurn': 0.2,
    'defendingPreparedPosition': 0.2,
    'highGround': 0.2,
    'fortifiedPosition': 0.3  // Keep slightly higher
};
```

2. **Reduce asymmetric bonuses:**
```javascript
// OLD:
const ATTACKER_ASYMMETRIC_BONUSES = {
    'initiativeAdvantage': 0.3,
    'momentumCharge': 0.3,
    'teutoburg_ambush': 2.0,  // ← TOO HIGH!
    // ...
};

// NEW:
const ATTACKER_ASYMMETRIC_BONUSES = {
    'initiativeAdvantage': 0.2,
    'momentumCharge': 0.2,
    'chosenBattlefield': 0.2,
    'concentratedAssault': 0.2,
    'tacticalSurprise': 0.2,
    'ambushAdvantage': 0.6,    // Reduced from 1.2
    'firstStrike': 0.4,        // Reduced from 0.8
    'teutoburg_ambush': 0.8    // Reduced from 2.0
};
```

3. **Apply all 6 categories:**
- TIME_POSITION_BONUSES: All → 0.2 (except fortified 0.3)
- INTELLIGENCE_BONUSES: All → 0.2
- COORDINATION_BONUSES: All → 0.2
- ENVIRONMENTAL_BONUSES: All → 0.2
- TACTICAL_ADVANTAGE_BONUSES: All → 0.2
- MORALE_READINESS_BONUSES: All → 0.2

**Target Maximum:**
- 6 categories × 4 factors × 0.2 = 4.8 theoretical
- Capped at 4.0 maximum
- Realistic scenarios: 1.5-2.5
- Exceptional: 2.8-3.2
- Legendary (3.5+): Nearly impossible

**Success Criteria:**
- [ ] No bonus greater than 0.6 (except penalties)
- [ ] Maximum realistic prep = 2.5-3.0
- [ ] Prep 3.5+ requires 15+ factors aligned

---

### **Task 2.2: Build Game State Integration Function**

**File:** `src/game/combat/preparationCalculator.js`  
**Action:** Add new function to extract preparation factors from actual battle state

**Add this function:**

```javascript
/**
 * Build preparation context from actual game state
 * Extracts real battlefield conditions instead of using placeholders
 * @param {Object} unit - Unit from battleState.unitPositions
 * @param {Object} battleState - Complete battle state
 * @param {Object} combatContext - Immediate combat situation
 * @param {Object} map - Map data
 * @param {boolean} isAttacker - True if this unit is attacking
 * @returns {Object} Preparation conditions for calculatePreparation()
 */
function buildPreparationContext(unit, battleState, combatContext, map, isAttacker) {
    const conditions = {
        isAttacker: isAttacker,
        isDefender: !isAttacker
    };
    
    // TIME & POSITION
    if (!unit.hasMoved) {
        conditions.waitedOneTurn = true;
    }
    
    if (isAttacker && battleState.commanderPosition) {
        const distance = require('../maps/mapUtils').calculateDistance(
            unit.position,
            battleState.commanderPosition
        );
        if (distance <= 3) {
            conditions.commanderPresent = true;
        }
    }
    
    const terrain = map.terrain;
    const unitTerrain = getTerrainAt(unit.position, terrain);
    
    if (combatContext.fortified) {
        conditions.fortifiedPosition = true;
    }
    
    if (combatContext.elevation > 0) {
        conditions.highGround = true;
    }
    
    // INTELLIGENCE & KNOWLEDGE
    if (battleState.scoutingOrders?.includes(unit.unitId)) {
        conditions.scoutsDeployed = true;
    }
    
    if (unit.institutionalMemory?.foughtCultures?.includes(combatContext.enemyCulture)) {
        conditions.foughtThisEnemyBefore = true;
    }
    
    if (combatContext.enemyIdentified) {
        conditions.identifiedEnemyType = true;
    }
    
    if (!combatContext.surprised) {
        conditions.anticipatedAttack = true;
    }
    
    // COORDINATION & COMMAND  
    if (combatContext.coordinatedUnits > 1) {
        conditions.coordinatedAttack = true;
    }
    
    if (!unit.formationDisrupted) {
        conditions.formationIntact = true;
    }
    
    // ENVIRONMENTAL
    if (checkWeatherPreparation(battleState.weather, unit)) {
        conditions.weatherPreparation = true;
    }
    
    if (checkTerrainSuited(unitTerrain, unit)) {
        conditions.terrainSuited = true;
    }
    
    // TACTICAL
    if (checkFormationCounters(unit.formation, combatContext.enemyFormation)) {
        conditions.formationCountersEnemy = true;
    }
    
    if (!combatContext.previousCombatThisTurn) {
        conditions.freshTroops = true;
    }
    
    // MORALE
    if (unit.morale > 80) {
        conditions.highMorale = true;
    }
    
    // PENALTIES
    if (combatContext.surprised) {
        conditions.surprised = true;
    }
    
    if (combatContext.flanked) {
        conditions.flanked = true;
    }
    
    if (combatContext.ambushed) {
        conditions.ambushed = true;
    }
    
    // ASYMMETRIC BONUSES
    if (isAttacker) {
        conditions.initiativeAdvantage = true;
        conditions.concentratedAssault = true;
        
        if (combatContext.combat_situation === 'ambush') {
            conditions.ambushAdvantage = true;
            conditions.tacticalSurprise = true;
            
            if (unitTerrain === 'forest' && !unit.mounted) {
                conditions.teutoburg_ambush = true;
            }
        }
    }
    
    if (!isAttacker) {
        conditions.preparedPosition = combatContext.combat_situation !== 'ambush';
        conditions.terrainKnowledge = true;
    }
    
    return conditions;
}

// Helper functions
function getTerrainAt(position, terrainData) {
    if (terrainData.hill?.includes(position)) return 'hill';
    if (terrainData.forest?.includes(position)) return 'forest';
    if (terrainData.marsh?.includes(position)) return 'marsh';
    return 'plains';
}

function checkWeatherPreparation(weather, unit) {
    // Check if unit prepared for weather (placeholder - enhance later)
    return weather === 'clear' || Math.random() > 0.5;
}

function checkTerrainSuited(terrain, unit) {
    if (unit.mounted) return terrain === 'plains' || terrain === 'road';
    if (unit.heavy) return terrain !== 'marsh' && terrain !== 'forest';
    return true; // Light infantry suited everywhere
}

function checkFormationCounters(myFormation, enemyFormation) {
    const counters = {
        'phalanx': ['cavalry', 'wedge'],
        'testudo': ['loose', 'archery'],
        'loose': ['phalanx', 'testudo']
    };
    return counters[myFormation]?.includes(enemyFormation);
}
```

3. **Add to module.exports:**
```javascript
module.exports = {
    resolveCombat,
    buildPreparationContext  // Add this
};
```

**Validation:**
- Run `node src/game/combat/tests/simpleCombatTest.js`
- Should show chaos/preparation calculations
- Should show attack-defense math (not ratios)
- Should show bucket accumulation

---

## 📋 PHASE 2: HIGH - Connect to Real Game State (2-3 hours)

### **Task 2.1: Update Unit Data Extraction**

**Files:** `src/game/combat/attackRatings.js`, `defenseRatings.js`  
**Action:** Fix functions to read actual unit structure

**In `calculateAttackRating()` function:**

```javascript
// CURRENT (WRONG):
const primaryWeapon = unit.weapons?.[0];

// REPLACE WITH:
const primaryWeapon = unit.primaryWeapon?.key || unit.primaryWeapon?.name?.toLowerCase();
```

**In `calculateDefenseRating()` function:**

```javascript
// CURRENT (WRONG):
const armor = unit.armor || 'no_armor';
const shield = unit.shield || 'no_shield';

// REPLACE WITH:
const armor = unit.armor?.key || unit.armor?.name?.toLowerCase() || 'no_armor';
const shield = unit.shields?.key || unit.shields?.name?.toLowerCase() || 'no_shield';
```

**Success Criteria:**
- [ ] Functions work with units from army builder
- [ ] No undefined errors
- [ ] Correct ratings extracted from unit data

---

### **Task 2.2: Create Weapon/Armor Key Mapping**

**File:** `src/game/combat/attackRatings.js`  
**Action:** Add mapping function for mismatched names

**Add function:**

```javascript
/**
 * Map army data weapon keys to rating table keys
 * @param {string} weaponKey - Key from armyData.js
 * @returns {string} Key for rating table lookup
 */
function mapWeaponKeyToRatingKey(weaponKey) {
    const mapping = {
        'gladius': 'roman_gladius',
        'xiphos': 'greek_xiphos',
        'dao': 'chinese_dao',
        'longsword': 'celtic_longsword',
        'crossbow': 'han_chinese_crossbow',
        'compositeBow': 'greek_composite_bow',
        'spear': 'spear_professional',
        // Add more mappings as needed
    };
    
    return mapping[weaponKey] || weaponKey;
}
```

**Use in `calculateAttackRating()`:**
```javascript
const weaponKey = mapWeaponKeyToRatingKey(primaryWeapon);
if (WEAPON_ATTACK_RATINGS[weaponKey]) {
    totalAttack += WEAPON_ATTACK_RATINGS[weaponKey];
}
```

---

## 📋 PHASE 3: MEDIUM - Fix Preparation Values (1-2 hours)

### **Task 3.1: Remove Minimum Chaos (If Not Justified)**

**File:** `src/game/combat/chaosCalculator.js`  
**Action:** Remove or document minimum chaos

**Line 147-148:**
```javascript
// CURRENT:
const baseMinimumChaos = 2;
const chaosWithMinimum = Math.max(baseMinimumChaos, totalChaos);

// DECISION NEEDED:
// Option A: Remove minimum (allows Chaos 0 per design doc)
const finalChaos = Math.min(10, totalChaos);

// Option B: Keep minimum but document why
// (prevents completely deterministic outcomes)
const finalChaos = Math.min(10, Math.max(2, totalChaos));
```

**Recommendation:** Remove minimum, allow Chaos 0 as shown in design doc examples.

---

### **Task 3.2: Clarify Bucket Threshold**

**File:** `src/game/combat/damageAccumulation.js`  
**Action:** Confirm threshold is correct

**Current Implementation:** Threshold = 1.0  
**Design Doc Example:** Shows accumulation to 6 before overflow

**Question to resolve:** Which is correct?
- Code (1.0 threshold): Faster casualties
- Design doc (6.0 threshold): More grinding

**Recommendation:** Keep 1.0 threshold, update design doc examples to match.

---

## 📋 PHASE 4: Testing & Validation (2-3 hours)

### **Task 4.1: Run All Combat Tests**

**Commands:**
```bash
node src/game/combat/tests/simpleCombatTest.js
node src/game/combat/tests/comprehensiveBalanceTest.js
```

**Expected Results:**
- ✅ Attack 8 vs Defense 5 = 3 base damage
- ✅ Chaos rolls and divides by preparation
- ✅ Bucket accumulation works as designed
- ✅ No ratio calculations
- ✅ Casualties reasonable (5-15 per turn typical)

**If tests fail:**
1. Check combat formula step-by-step
2. Verify attack/defense extraction from units
3. Check chaos/preparation calculations
4. Validate bucket overflow logic

---

### **Task 4.2: Integration Test with Real Battle**

**Command:**
```bash
node src/bot/commands/test-submit-both.js
```

**Test Scenario:**
```
Turn 1: "all units advance to ford"
Turn 2: Units reach enemies, combat triggers
Turn 3: Check casualties applied correctly
```

**Success Criteria:**
- [ ] Combat uses new formula
- [ ] Casualties realistic (not 0, not 100)
- [ ] Preparation factors from actual game state
- [ ] Damage accumulation persists

---

## 📋 PHASE 5: Documentation & Cleanup (1 hour)

### **Task 5.1: Update Version Headers**

**All Combat Files:**
```javascript
// Last Updated: 2025-10-20
// Version: 2.0.0 - Combat System v2.0 Complete
```

### **Task 5.2: Remove Old Code**

**File:** `src/game/battleEngine.js`  
**Action:** Delete all ratio-based calculation code (lines ~100-350)

### **Task 5.3: Update Task List**

Mark complete:
- [x] CMB-001 through CMB-005
- [x] CMB-FIX-001 through CMB-FIX-007

---

## 🎯 CRITICAL SUCCESS CRITERIA

### **Must Have (Non-Negotiable):**

1. **No Ratios:** `resolveCombat()` uses attack-defense subtraction, NOT division
2. **Chaos System:** Calls `calculateChaosLevel()` and `rollChaosModifier()`
3. **Preparation System:** Calls `calculatePreparation()` for both sides
4. **Chaos Divisor:** Applies `rawChaos / preparation` (not subtraction)
5. **Damage Accumulation:** Negative damage uses bucket system
6. **Test Passing:** `simpleCombatTest.js` shows expected values

### **Should Have (Important):**

7. **Preparation 1.0-3.0:** Typical values in this range
8. **Game State Integration:** Preparation from actual unit.hasMoved, commander.position, etc.
9. **Balanced:** Better army wins 90% in low chaos, underdogs can win in high chaos
10. **Documented:** Version headers on all modified files

### **Could Have (Nice to Have):**

11. **Veteran bonuses:** Actually applied (currently commented out)
12. **Cultural modifiers:** Integrated with new system
13. **Formation interactions:** Work with new formula

---

## ⚠️ GUARDRAILS FOR WARP

### **DO:**
- ✅ Follow the formula in `combat_design_parameters.md` EXACTLY
- ✅ Use existing combat modules (attack, defense, chaos, prep, accumulation)
- ✅ Test after each phase
- ✅ Ask questions if design doc unclear
- ✅ Preserve working mission system (don't touch orderInterpreter, turnOrchestrator)

### **DON'T:**
- ❌ Invent new combat mechanics not in design doc
- ❌ Use ratios anywhere
- ❌ Make preparation too easy to achieve (max 3.0 realistic)
- ❌ Break existing working systems
- ❌ Skip testing

---

## 📞 CHECKPOINTS

After each phase, verify:

**After Phase 1:**
```bash
node src/game/combat/tests/simpleCombatTest.js
```
Expected: Chaos/prep calculations visible, no ratios

**After Phase 2:**
```bash
node src/game/combat/tests/simpleCombatTest.js
```
Expected: Preparations 1.5-2.5 range, realistic values

**After Phase 3:**
Test in actual battle - combat should feel balanced

**After Phase 4:**
All tests pass, ready for real gameplay

---

## 🎯 DEFINITION OF DONE

Combat system is complete when:
- [ ] `resolveCombat()` uses approved attack-defense-chaos formula
- [ ] Chaos divides by preparation (not subtracts)
- [ ] Damage accumulation bucket works
- [ ] Preparation values realistic (1.0-3.0 typical)
- [ ] Preparation extracted from real game state
- [ ] All tests pass
- [ ] No ratio calculations anywhere
- [ ] Version headers updated

**Estimated Total Time:** 12-18 hours  
**Current Status:** 0/7 tasks complete  
**Blocking Issue:** ISSUE-001 (wrong formula in battleEngine.js)

---

**START WITH PHASE 1, TASK 1.1 - Rewrite resolveCombat() function. Everything else depends on this.**
