# Combat System Issues & Correction Plan

**Analysis Date:** October 20, 2025  
**Status:** CRITICAL - Wrong system implemented  
**Severity:** High - Core combat formula incorrect

---

## 🚨 CRITICAL ISSUES

### **ISSUE-001: Battle Engine Using Wrong Formula**
**File:** `src/game/battleEngine.js`  
**Severity:** CRITICAL  
**Status:** Complete rewrite required

**Problem:**
- Line 248: `const combatRatio = finalAttackerPower / finalDefenderPower;`
- Still using OLD ratio-based system that was supposed to be replaced
- Does NOT use approved chaos/preparation system
- Does NOT call `chaosCalculator.js`
- Does NOT call `preparationCalculator.js` 
- Does NOT implement damage accumulation

**Expected Formula (from combat_design_parameters.md):**
```javascript
// 1. Base damage
baseDamage = attacker.attack - defender.defense

// 2. Chaos
chaosLevel = calculateChaosLevel(conditions)
chaosRoll = rollChaosModifier(chaosLevel)

// 3. Preparation
attackerPrep = calculatePreparation(attacker, conditions)
defenderPrep = calculatePreparation(defender, conditions)

// 4. Apply chaos / preparation
attackerChaos = rawChaos / attackerPrep
defenderChaos = rawChaos / defenderPrep

// 5. Effective values
effectiveAttack = attack - attackerChaos
effectiveDefense = defense - defenderChaos

// 6. Final damage
damage = effectiveAttack - effectiveDefense

// 7. Accumulation or casualties
if (damage > 0) casualties = damage * 5
else applyDamageWithAccumulation(unit, damage)
```

**Impact:** Combat doesn't work as designed. Players can't test chaos/preparation system.

---

### **ISSUE-002: Preparation Values Too Rigid**
**File:** `src/game/combat/preparationCalculator.js`  
**Severity:** High  
**Status:** Needs value rebalancing

**Problems:**
1. **Ambush bonus too extreme:** `teutoburg_ambush: 2.0` means prep 3.0, chaos/3.0 = trivial
2. **Asymmetric bonuses too generous:** 6 factors at +0.3 each = +1.8 just from being attacker
3. **Formation bonuses mixed scale:** Old system (+3 phalanx) mixed with new system (+0.3 factors)

**Current Maximum Preparation:**
```
Base: 1.0
+ Time/Position (4 factors): +1.3
+ Intelligence (4 factors): +1.2  
+ Coordination (4 factors): +1.2
+ Environmental (4 factors): +1.2
+ Tactical (4 factors): +1.2
+ Morale (4 factors): +1.2
+ Attacker asymmetric: +2.9 (if ambush)
= 11.2 theoretical max (capped at 4.0)
```

**This defeats the purpose!** With prep 4.0, chaos 10 becomes 2.5 effective - completely negated.

**Expected Maximum (per your design):**
- 2.0 = Well prepared (typical good tactics)
- 2.5 = Very prepared (everything going right)
- 3.0 = Exceptional (Caesar-level, almost impossible)
- 4.0 = Theoretical max (never achievable in practice)

**Fix:** Reduce all bonuses to +0.2, make 3.0+ extremely rare

---

### **ISSUE-003: Preparation Not Tied to Game State**
**File:** `src/game/combat/preparationCalculator.js`  
**Severity:** High  
**Status:** Missing integration

**Problem:**
- Preparation calculator has proper categories (time/position, intelligence, etc.)
- But NO FUNCTION to extract these from actual battle state
- No `calculatePreparationFromGameState()` function
- Tests use `calculatePreparationLegacy()` with random values
- Can't actually use preparation system in real battles

**Missing:**
```javascript
function buildPreparationContext(unit, battleState, combatLocation) {
    return {
        // Extract from unit.hasMoved
        waitedOneTurn: !unit.hasMoved,
        
        // Extract from commander position
        commanderDistance: calculateDistance(unit.position, commander.position),
        commanderPresent: commanderDistance <= 3,
        
        // Extract from fog of war
        scoutsDeployed: hasScoutOrdersThisTurn(unit, battleState),
        
        // Extract from veteran tracking
        foughtThisEnemyBefore: checkInstitutionalMemory(unit, enemyCulture),
        
        // Extract from map
        terrain: map.getTerrainAt(unit.position),
        
        // Extract from position
        fortified: unit.position.fortified || false,
        highGround: compareElevation(unit.position, enemy.position),
        
        // etc...
    };
}
```

**Impact:** Preparation system exists but can't be used in actual battles.

---

### **ISSUE-004: Attack/Defense Ratings Don't Match Army Data**
**File:** `src/game/combat/attackRatings.js`, `defenseRatings.js`  
**Severity:** Medium  
**Status:** Data mismatch

**Problem:**
- Attack/defense ratings use different weapon names than `armyData.js`
- Example: `attackRatings` has `'roman_gladius': 5`
- But `armyData.js` weapon objects have `{ name: 'Gladius', damage: 8, ... }`
- Mapping will fail at runtime

**Example Mismatch:**
```javascript
// attackRatings.js
'roman_gladius': 5
'han_chinese_crossbow': 8

// armyData.js  
{ name: 'Gladius', key: 'gladius', ... }
{ name: 'Crossbow', key: 'crossbow', ... }
```

**Fix:** Need consistent naming between rating tables and army data, or mapping function

---

### **ISSUE-005: Chaos Minimum of 2 Prevents Low-Chaos Scenarios**
**File:** `src/game/combat/chaosCalculator.js`  
**Severity:** Medium  
**Status:** Conflicts with design

**Problem:**
- Line 147: `const baseMinimumChaos = 2;`
- Forces minimum chaos of 2 even on plains in clear weather
- Contradicts design doc examples showing Chaos 0 scenarios

**From combat_design_parameters.md:**
```
Example 1: Plains Battle (Chaos 0)
Attacker: 8 attack, 4 preparation
Defender: 5 defense, 6 preparation
No chaos roll → Pure math
```

**Current Implementation:** Would force this to Chaos 2, changing the math

**Decision Needed:** Should plains/clear really have Chaos 0, or is minimum 2 intentional?

---

### **ISSUE-006: Damage Accumulation Bucket Fills Too Fast**
**File:** `src/game/combat/damageAccumulation.js`  
**Severity:** Low  
**Status:** Balance concern

**Problem:**
- Attack 4 vs Defense 6 = -2 damage
- Current: 2.0 accumulates → immediate overflow → 10 casualties turn 1
- Design doc shows this should accumulate over multiple turns

**From combat_design_parameters.md:**
```
Turn 1: -2 damage → Accumulated: 2
Turn 2: -2 damage → Accumulated: 4  
Turn 3: -2 damage → Accumulated: 6
6 >= 6 (threshold) → BREAKTHROUGH!
```

**Current code:** Threshold is 1.0, not 6.0

**Confusion:** Design doc shows accumulation to 6 before breakthrough, but code uses 1.0 threshold.

**Clarification Needed:** What should the overflow threshold be?

---

## ⚠️ HIGH PRIORITY ISSUES

### **ISSUE-007: Formation Bonuses Appear Twice**
**Files:** `attackRatings.js`, `defenseRatings.js`, `preparationCalculator.js`  
**Severity:** High  
**Status:** Double-counting risk

**Problem:**
- Formation bonuses defined in attack/defense ratings (+2 wedge attack, +4 phalanx defense)
- ALSO defined in preparation calculator (+3 phalanx preparation)
- Risk of double-applying formation bonuses

**Which is correct:**
- Formation affects attack/defense directly? OR
- Formation affects preparation (which affects chaos resistance)?

**Likely Answer:** Formation should affect BOTH:
- Direct bonuses (phalanx +4 defense)
- Preparation (phalanx +0.3 because organized)

But need to ensure they're applied correctly and don't double-count.

---

### **ISSUE-008: Cultural Modifiers Not Integrated**
**File:** `src/game/combat/culturalModifiers.js`  
**Severity:** Medium  
**Status:** Incomplete

**Problem:**
- `battleEngine.js` calls `applyCulturalModifiers()` but uses old ratio system
- Preparation calculator calls `getCulturalPreparationBonus()` but function doesn't exist in culturalModifiers.js
- Cultural modifiers defined but not properly integrated

**Missing Integration:**
- How do cultural bonuses apply to attack/defense ratings?
- How do they apply to preparation?
- How do they interact with chaos?

---

### **ISSUE-009: Test Files Expect Wrong Data Structure**
**Files:** All `/tests/` files  
**Severity:** Medium  
**Status:** Tests won't pass

**Problem:**
- Tests expect `result.combatData.chaosLevel` etc.
- But `resolveCombat()` doesn't return this structure
- Tests will fail because battleEngine doesn't use new system

**Impact:** Can't verify combat system works correctly

---

## 🟡 MEDIUM PRIORITY ISSUES

### **ISSUE-010: Attack/Defense Calculation Functions Don't Match Data**
**Files:** `attackRatings.js`, `defenseRatings.js`  
**Severity:** Medium  
**Status:** Runtime errors likely

**Problem:**
- `calculateAttackRating(unit, situation, targetUnit, isDefender)` expects:
  - `unit.weapons` array
  - `unit.quality` string
  - `unit.formation` string
  
- But actual units from army builder have:
  - `unit.primaryWeapon` object with `.name` 
  - `unit.qualityType` string
  - `unit.formation` might not be set

**Example Runtime Error:**
```javascript
// Line 363: 
const primaryWeapon = unit.weapons?.[0];
// But unit has: unit.primaryWeapon = { name: 'Gladius', key: 'gladius' }
// Result: primaryWeapon = undefined
```

**Fix:** Update functions to match actual unit structure from army builder

---

### **ISSUE-011: No Integration Between Systems**
**Files:** All combat files  
**Severity:** Medium  
**Status:** Files isolated

**Problem:**
- Each combat file (attack, defense, chaos, preparation, accumulation) works independently
- But `battleEngine.js` doesn't call any of them
- No integration point tying systems together

**Missing:** Single `resolveComba

tV2()` function that:
1. Calls `calculateAttackRating()`
2. Calls `calculateDefenseRating()`
3. Calls `calculateChaosLevel()`
4. Calls `rollChaosModifier()`
5. Calls `calculatePreparation()`
6. Applies chaos/preparation
7. Calls `applyDamageWithAccumulation()`

---

## 🟢 LOW PRIORITY ISSUES

### **ISSUE-012: Inconsistent Value Scales**
**Files:** Multiple  
**Severity:** Low  
**Status:** Confusing but functional

**Problem:**
- Attack ratings: 2-12 scale
- Defense ratings: 0-10 scale (but with +8 formation bonuses = 18 possible)
- Preparation: 1.0-4.0 scale
- Chaos: 0-10 scale

**Confusion:** Can defense 18 happen? Does attack 8 - defense 18 = -10 damage?

**Clarification Needed:** What are the actual min/max values in practice?

---

### **ISSUE-013: Veteran Experience System Placeholder**
**File:** `battleEngine.js` line 327  
**Severity:** Low  
**Status:** Not implemented

```javascript
const veteranBonus = 0; // getVeteranBonus(unit.experience || 0);
```

Veteran bonuses commented out, always returns 0.

---

### **ISSUE-014: Asymmetric Bonuses May Create Imbalance**
**File:** `preparationCalculator.js`  
**Severity:** Low  
**Status:** Needs playtesting

**Concern:**
- Attackers get 7 potential bonuses (initiative, momentum, chosen battlefield, etc.)
- Defenders get 5 potential bonuses
- Attackers might be systematically over-prepared

**Requires:** Balance testing to validate

---

## 📋 CORRECTION PLAN

### **Phase 1: Fix Core Combat Engine (CRITICAL - 4-6 hours)**

**Task CMB-FIX-001: Rewrite `resolveCombat()` Function**
- **File:** `src/game/battleEngine.js`
- **Action:** Complete rewrite of combat resolution
- **Use:** Approved formula from combat_design_parameters.md
- **Integration:** Call all the new combat system modules

**Acceptance Criteria:**
- [ ] Uses `calculateAttackRating()` from attackRatings.js
- [ ] Uses `calculateDefenseRating()` from defenseRatings.js
- [ ] Uses `calculateChaosLevel()` from chaosCalculator.js
- [ ] Uses `calculatePreparation()` from preparationCalculator.js
- [ ] Applies: chaos / preparation (divisor system)
- [ ] Final damage = (effectiveAttack) - (effectiveDefense)
- [ ] Uses `applyDamageWithAccumulation()` for casualties
- [ ] Returns structure matching test expectations

---

### **Phase 2: Fix Preparation System (HIGH - 3-4 hours)**

**Task CMB-FIX-002: Rebalance Preparation Values**
- **File:** `src/game/combat/preparationCalculator.js`
- **Action:** Reduce all bonuses to make 3.0+ nearly impossible
- **Changes:**
  - All +0.3 bonuses → +0.2
  - Remove teutoburg_ambush: 2.0 (too extreme)
  - Ambush bonus → +0.8 maximum
  - Asymmetric attacker bonuses → reduce to +0.2 each

**Expected Maximum:**
- Typical good tactics: ~1.8-2.2
- Everything perfect: ~2.5-2.8
- Caesar-level legendary: ~3.0
- 3.5+: Mathematically impossible

**Acceptance Criteria:**
- [ ] 95% of scenarios result in prep 1.0-2.5
- [ ] Prep 3.0+ requires 10+ factors aligned
- [ ] No single factor gives >+0.5

---

**Task CMB-FIX-003: Build Game State Integration**
- **File:** `src/game/combat/preparationCalculator.js`
- **Action:** Create `buildPreparationContext()` function
- **Extracts from:**
  - `unit.hasMoved` → waitedOneTurn
  - `commander.position` → commanderPresent
  - `battleState.scoutOrders` → scoutsDeployed
  - `unit.institutionalMemory` → foughtThisEnemyBefore
  - `map.terrain` → terrain factors
  - `unit.position.fortified` → positional bonuses
  - `combatContext.surprise` → tactical penalties

**Acceptance Criteria:**
- [ ] Function extracts all 24 preparation factors from game state
- [ ] No hardcoded/random values
- [ ] All factors traceable to actual gameplay decisions

---

### **Phase 3: Fix Data Integration (MEDIUM - 2-3 hours)**

**Task CMB-FIX-004: Align Rating Functions with Army Data**
- **Files:** `attackRatings.js`, `defenseRatings.js`
- **Action:** Update functions to read actual unit structure
- **Changes:**
```javascript
// OLD:
const primaryWeapon = unit.weapons?.[0];

// NEW:
const primaryWeapon = unit.primaryWeapon?.key || unit.primaryWeapon?.name;
```

**Map unit structure:**
```javascript
unit = {
    unitId, position, currentStrength,
    mounted, quality, qualityType,
    primaryWeapon: { name, key, damage },
    armor: { name, key, defense },
    shields: { name, key, defense },
    formation, hasMoved, activeMission
}
```

**Acceptance Criteria:**
- [ ] Functions read from actual unit properties
- [ ] No undefined errors at runtime
- [ ] Works with units from army builder

---

**Task CMB-FIX-005: Fix Weapon Name Mapping**
- **Files:** `attackRatings.js`, `defenseRatings.js`
- **Action:** Create mapping between armyData keys and rating keys
- **Create:** `weaponKeyToRatingKey()` function

```javascript
function weaponKeyToRatingKey(weaponKey) {
    const mapping = {
        'gladius': 'roman_gladius',
        'crossbow': 'han_chinese_crossbow',
        'longsword': 'celtic_longsword',
        // ... complete mapping
    };
    return mapping[weaponKey] || weaponKey;
}
```

**Acceptance Criteria:**
- [ ] All weapons in armyData.js map to rating keys
- [ ] No missing/undefined ratings at runtime

---

### **Phase 4: Fix Chaos System (LOW - 1-2 hours)**

**Task CMB-FIX-006: Remove or Justify Minimum Chaos**
- **File:** `chaosCalculator.js`
- **Decision:** Remove `baseMinimumChaos = 2` OR document why it exists
- **Impact:** Allows Chaos 0 scenarios from design doc

**Acceptance Criteria:**
- [ ] Plains + Clear weather = Chaos 0 (or documented why not)
- [ ] Design doc examples work correctly

---

### **Phase 5: Clarify Damage Accumulation (LOW - 1 hour)**

**Task CMB-FIX-007: Clarify Bucket Overflow Threshold**
- **File:** `damageAccumulation.js`
- **Question:** Is threshold 1.0 or 6.0?
- **Design doc shows:** accumulation to 6 before overflow
- **Code implements:** accumulation to 1.0 before overflow

**Decision Needed:**
- Current (1.0 threshold): Faster casualties, less grinding
- Design doc (6.0 threshold): More grinding, slower breakthrough

**Recommendation:** Keep 1.0 for now, test for balance

---

## 📊 Issue Summary

**Critical (Blocks Combat):** 1 issue (battleEngine wrong formula)  
**High (System Broken):** 3 issues (prep values, game state integration, data structure)  
**Medium (Runtime Errors):** 3 issues (data mismatch, integration, tests)  
**Low (Polish):** 3 issues (chaos minimum, accumulation clarity, veterans)

**Total Issues:** 10  
**Estimated Fix Time:** 12-18 hours  
**Priority Order:** Fix in phases 1→2→3→4→5

---

## 🎯 Immediate Action Plan

1. **STOP using current battleEngine.js** - It's wrong
2. **Rewrite resolveCombat()** using approved formula (Phase 1)
3. **Rebalance preparation** to 1.0-3.0 realistic range (Phase 2)  
4. **Connect to game state** so preparation actually works (Phase 2)
5. **Fix data integration** so ratings match army data (Phase 3)
6. **Test and validate** with simple combat scenarios

**Estimated to Working System:** 12-18 hours across 7 tasks

**Current Status:** Combat system files exist but don't implement approved design. Need focused rewrite of battleEngine.js to tie everything together correctly.
