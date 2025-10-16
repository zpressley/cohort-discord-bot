# Cohort Development Task List

**Last Updated:** October 16, 2025  
**Current Sprint:** Multi-001 Complete, Combat System v2.0 Next  
**Version:** Game Core v0.2.0

---

## 🎯 ACTIVE SPRINT - Combat System v2.0

### **CMB-001: Define Attack/Defense Rating Tables**
- **Priority:** Critical
- **Estimate:** 2-3 hours
- **Status:** Not Started
- **Description:** Create attack/defense value tables for all equipment, training, cultures
- **Files to Create:**
  - `src/game/combat/attackRatings.js`
  - `src/game/combat/defenseRatings.js`
  - `src/game/combat/culturalModifiers.js`
- **Acceptance Criteria:**
  - [ ] Weapon attack values defined (2-12 range)
  - [ ] Armor defense values defined (0-10 range)
  - [ ] Training bonuses (levy 0 → legendary 10)
  - [ ] Formation bonuses/penalties
  - [ ] Cultural modifiers for 20 civilizations
- **Example:**
```javascript
WEAPONS = {
  spear: 4,
  sword: 5,
  pike_sarissa: 8,
  warElephant: 12
}
```
- **Dependencies:** None
- **Labels:** `combat`, `critical`, `data-tables`

---

### **CMB-002: Chaos Calculation System**
- **Priority:** Critical  
- **Estimate:** 3-4 hours
- **Status:** Not Started
- **Description:** Build chaos level calculator from battlefield conditions
- **Files to Create:**
  - `src/game/combat/chaosCalculator.js`
- **Acceptance Criteria:**
  - [ ] Chaos level 0-10 from conditions (terrain, weather, density, etc.)
  - [ ] Environmental factors: fog +3, forest +2, night +4
  - [ ] Unit density: compressed = +3 chaos
  - [ ] Combat situation: ambush +4, flanked +2
- **Example:**
```javascript
chaosLevel = calculateChaos({
  terrain: 'forest',     // +2
  weather: 'fog',        // +3
  density: 'compressed', // +3
  situation: 'standard'  // 0
}); // = 8
```
- **Dependencies:** None
- **Labels:** `combat`, `critical`

---

### **CMB-003: Preparation Modifier System**
- **Priority:** Critical
- **Estimate:** 2-3 hours
- **Status:** Not Started
- **Description:** Calculate unit preparation to negate chaos
- **Files to Create:**
  - `src/game/combat/preparationCalculator.js`
- **Acceptance Criteria:**
  - [ ] Formation bonuses (phalanx +6, testudo +4)
  - [ ] Experience bonuses (veteran +3, legendary +5)
  - [ ] Defensive position bonuses (fortified +4)
  - [ ] Surprise penalties (ambushed -6)
- **Example:**
```javascript
preparation = calculatePreparation({
  formation: 'phalanx',      // +6
  experience: 'veteran',     // +3
  position: 'defensive',     // +2
  surprised: false           // 0
}); // = 11 (can negate chaos 8 + reduce by 3)
```
- **Dependencies:** CMB-001
- **Labels:** `combat`, `critical`

---

### **CMB-004: Combat Engine Rewrite**
- **Priority:** Critical
- **Estimate:** 4-6 hours
- **Status:** Not Started
- **Description:** Replace ratio system with chaos-modified attack/defense
- **Files to Modify:**
  - `src/game/battleEngine.js` - Complete rewrite of resolveCombat()
- **New Formula:**
```javascript
// Base damage
baseDamage = attacker.attack - defender.defense

// Roll chaos (1d[chaosLevel])
chaosRoll = random(1, chaosLevel)
rawChaos = chaosRoll - (chaosLevel / 2)

// Apply preparation
attackerChaos = max(0, rawChaos - attacker.preparation)
defenderChaos = max(0, rawChaos - defender.preparation)

// Modified values
effectiveAttack = attack - attackerChaos
effectiveDefense = defense - defenderChaos

// Final damage
damage = effectiveAttack - effectiveDefense
casualties = max(0, damage) * (strength/100) * 5
```
- **Acceptance Criteria:**
  - [ ] Chaos-modified combat working
  - [ ] Preparation properly reduces chaos impact
  - [ ] Negative damage handled via accumulation
  - [ ] Results stored in turn data
- **Dependencies:** CMB-001, CMB-002, CMB-003
- **Labels:** `combat`, `critical`, `core-rewrite`

---

### **CMB-005: Damage Accumulation System**
- **Priority:** High
- **Estimate:** 2 hours
- **Status:** Not Started
- **Description:** Handle negative damage via bucket overflow
- **Files to Create:**
  - `src/game/combat/damageAccumulation.js`
- **Logic:**
```javascript
// Turn 1: Attack 6, Defense 8 = -2 damage
accumulatedDamage = -2 (stored on unit)

// Turn 2: Attack 6, Defense 8 = -2 damage  
accumulatedDamage = -4

// Turn 3: Attack 10, Defense 8 = +2 damage
net = accumulated(-4) + current(+2) = -2
// Still no casualties, accumulation = -2

// Turn 4: Attack 12, Defense 8 = +4 damage
net = accumulated(-2) + current(+4) = +2
// 2 damage * 5 = 10 casualties
```
- **Acceptance Criteria:**
  - [ ] Negative damage stored per unit
  - [ ] Accumulation carries between turns
  - [ ] Overflow triggers casualties
  - [ ] Resets when positive damage dealt
- **Dependencies:** CMB-004
- **Labels:** `combat`, `high-priority`

---

### **CMB-006: Combat Balance Testing**
- **Priority:** High
- **Estimate:** 4-6 hours
- **Status:** Not Started
- **Description:** Test all combat scenarios for balance
- **Test Scenarios:**
  1. Plains battle, clear weather (Chaos 0)
  2. Forest ambush (Chaos 6)
  3. Night assault (Chaos 8)
  4. Phalanx vs cavalry (formation effectiveness)
  5. Veteran vs levy (experience matters)
  6. Baldwin IV scenario (prepared underdog vs unprepared superior force)
- **Acceptance Criteria:**
  - [ ] Predictable outcomes in low chaos
  - [ ] Preparation matters in high chaos
  - [ ] Superior forces usually win
  - [ ] Underdogs can win with good tactics
  - [ ] No exploits or degenerate strategies
- **Dependencies:** CMB-004, CMB-005
- **Labels:** `testing`, `balance`

---

### **CMB-007: Chaos Display in Combat Results**
- **Priority:** Medium
- **Estimate:** 1 hour
- **Status:** Not Started
- **Description:** Show chaos and preparation in battle results
- **Files to Modify:**
  - `src/bot/dmHandler.js` - Add chaos info to turn results
- **Display Format:**
```
⚔️ COMBAT RESULT:
Attacker: 45 → 31 (-14 casualties)
Defender: 50 → 42 (-8 casualties)

Battlefield Chaos: 6/10 (forest terrain + unit density)
Attacker Preparation: 4 (veteran phalanx)
Defender Preparation: 2 (militia, no formation)
```
- **Acceptance Criteria:**
  - [ ] Chaos level shown
  - [ ] Preparation shown for both sides
  - [ ] Players understand why results occurred
- **Dependencies:** CMB-004
- **Labels:** `ui`, `combat`

---

### **CMB-008: Store Chaos in Battle Turn**
- **Priority:** Medium
- **Estimate:** 1 hour
- **Status:** Not Started  
- **Description:** Save chaos data for historical analysis
- **Files to Modify:**
  - `src/database/models/BattleTurn.js` - Add chaos fields
- **Schema Changes:**
```javascript
BattleTurn.init({
  // ... existing fields
  chaosLevel: DataTypes.INTEGER,
  chaosRoll: DataTypes.INTEGER,
  attackerPreparation: DataTypes.INTEGER,
  defenderPreparation: DataTypes.INTEGER,
  combatConditions: DataTypes.JSON
});
```
- **Acceptance Criteria:**
  - [ ] Chaos data saved per combat
  - [ ] Can query historical chaos levels
  - [ ] AI can reference in narratives
- **Dependencies:** CMB-004
- **Labels:** `database`, `analytics`

---

### **CMB-009: AI Narrative Integration**
- **Priority:** Medium
- **Estimate:** 2-3 hours
- **Status:** Not Started
- **Description:** AI references chaos in battle narratives
- **Files to Modify:**
  - `src/ai/aiNarrativeEngine.js`
- **Narrative Examples:**
```
Chaos 2: "In the clear morning air, formations clashed with deadly precision..."
Chaos 6: "The forest's confusion scattered careful plans as trees became obstacles..."
Chaos 9: "Night's chaos reigned - friend fought friend in the darkness..."
```
- **Acceptance Criteria:**
  - [ ] AI mentions chaos when relevant
  - [ ] Preparation differences explained narratively
  - [ ] Historical battle parallels referenced
- **Dependencies:** CMB-004, CMB-007
- **Labels:** `ai`, `narrative`

---

### **CMB-010: Formation Effectiveness Charts**
- **Priority:** Low
- **Estimate:** 2 hours
- **Status:** Not Started
- **Description:** Document optimal formations per situation
- **Files to Create:**
  - `docs/combat/formation-guide.md`
- **Content:**
  - Phalanx: Best on plains vs cavalry, terrible when flanked
  - Testudo: Anti-missile, slow movement
  - Loose: Forest fighting, ambush
  - Cultural formations (Celtic fury, Roman discipline)
- **Dependencies:** CMB-006
- **Labels:** `documentation`, `player-guide`

---

### **CMB-011: Equipment Upgrade Costs**
- **Priority:** Low
- **Estimate:** 1 hour
- **Status:** Not Started
- **Description:** Define SP costs for attack/defense upgrades
- **Files to Create:**
  - `src/game/armyBuilding/equipmentCosts.js`
- **Example:**
```javascript
UPGRADES = {
  armor: {
    none: 0,
    light: +1 SP per 100 men,
    medium: +2 SP,
    heavy: +4 SP
  }
}
```
- **Dependencies:** CMB-001
- **Labels:** `army-building`, `balance`

---

### **CMB-012: Cultural Combat Traits**
- **Priority:** Low
- **Estimate:** 2 hours
- **Status:** Not Started
- **Description:** Unique combat behaviors per culture
- **Examples:**
  - Roman: +2 preparation in formations
  - Celtic: +2 attack on charges, -2 defense
  - Spartan: Never break before 50% casualties
  - Scythian: +4 attack on feigned retreat
- **Dependencies:** CMB-001, CMB-003
- **Labels:** `cultural`, `combat`

---

### **CMB-013: Siege Equipment Combat**
- **Priority:** Low
- **Estimate:** 3 hours
- **Status:** Not Started
- **Description:** Implement siege equipment attack values
- **Equipment:**
  - Battering ram: Attack 15 vs gates/doors only
  - Ballista: Attack 12, anti-personnel, range 6 tiles
  - Catapult: Attack 10, area damage, wall breaking
- **Dependencies:** CMB-004
- **Labels:** `siege`, `combat`

---

### **CMB-014: Weather Effect Integration**
- **Priority:** Low
- **Estimate:** 2 hours
- **Status:** Not Started
- **Description:** Weather impacts on chaos and combat
- **Effects:**
  - Rain: +2 chaos, bow effectiveness -4
  - Fog: +3 chaos, visibility reduced
  - Heat: Heavy armor -2 defense after 5 turns
  - Cold: Metal weapons +15% breakage chance
- **Dependencies:** CMB-002, CMB-004
- **Labels:** `environmental`, `combat`

---

## 🟢 IN PROGRESS

### **MULTI-001: Multi-Turn Mission System** ✅ COMPLETE
- **Priority:** Critical
- **Estimate:** 4-5 hours
- **Status:** ✅ Complete
- **Description:** Units continue toward destinations over multiple turns
- **Completed:**
  - [x] Mission creation on partial movement
  - [x] Mission persistence in database (activeMission field)
  - [x] Auto-continuation in Phase 1.5 when "hold" ordered
  - [x] Mission completion detection
  - [x] Natural language: "continue mission", "hold" auto-continues
- **Files Modified:**
  - `src/game/positionBasedCombat.js` - Mission creation
  - `src/game/turnOrchestrator.js` - Phase 1.5 continuation
  - `src/ai/orderInterpreter.js` - "hold" returns empty actions
- **Labels:** `movement`, `critical`, `✅ complete`

---

### **MULTI-002: "Units" Keyword Recognition**
- **Priority:** Medium
- **Estimate:** 15 minutes
- **Status:** Ready to Implement
- **Description:** Recognize "units move to X" as "all units" command
- **Files to Modify:**
  - `src/ai/orderInterpreter.js` - `determineTargetUnits()` function
- **Change:**
```javascript
if (lowerOrder.includes('all units') || 
    lowerOrder.includes('everyone') ||
    lowerOrder.match(/^units\s+/)) {  // ADD THIS LINE
    console.log('ALL units');
    return yourUnits;
}
```
- **Dependencies:** None
- **Labels:** `parsing`, `quick-win`

---

## 🔵 BACKLOG - Command & Control

### **CMD-001: Commander Entity Foundation**
- **Priority:** High
- **Estimate:** 3-4 hours
- **Status:** Not Started
- **Description:** Create commander as non-combatant entity attached to elite unit
- **Properties:**
```javascript
commander = {
  isUnit: false,
  attachedTo: 'elite_unit_id',
  position: 'sameAsAttachedUnit',
  canReattach: true,
  captureRisk: true
}
```
- **Acceptance Criteria:**
  - [ ] Commander moves with attached unit
  - [ ] Can detach and reattach (Romans/Han, not Celtic/Germanic)
  - [ ] Capture mechanics when elite <25% strength
  - [ ] Player choices: escape/die/surrender
- **Dependencies:** None
- **Labels:** `command-control`, `high-priority`

---

### **CMD-002: Command Range Zones**
- **Priority:** High
- **Estimate:** 3-4 hours
- **Status:** Not Started
- **Description:** Three-tier command system based on distance
- **Zones:**
  - Instant (1-3 tiles): Same-turn execution
  - Messenger (5-10 tiles): 1-turn delay
  - Out of Contact (>10 tiles): 2-3 turn delay, autonomy AI
- **Files to Create:**
  - `src/game/commandSystem/commandRanges.js`
- **Dependencies:** CMD-001
- **Labels:** `command-control`, `high-priority`

---

### **AUTO-001: Sun Tzu Autonomy AI**
- **Priority:** High
- **Estimate:** 4-5 hours
- **Status:** Not Started
- **Description:** Units act independently when out of command range
- **Logic:**
```javascript
if (orders) execute();
else if (canImprovise) improvise();
else if (enemy) evaluateStrength();
else returnToCommander();
```
- **Strength Evaluation:**
  - Enemy <70% → Attack aggressively
  - Enemy 70-90% → Attack cautiously
  - Enemy 90-130% → Defensive, request orders
  - Enemy 130-200% → Fighting withdrawal
  - Enemy >200% → Full retreat or last stand
- **Dependencies:** CMD-002
- **Labels:** `autonomy`, `ai`

---

### **MSG-001: Messenger System**
- **Priority:** Medium
- **Estimate:** 2-3 hours
- **Status:** Not Started
- **Description:** Travel time for orders and reports
- **Calculation:**
  - 1 turn per 5 tiles distance
  - Round trip = 2x travel time
- **Dependencies:** CMD-002
- **Labels:** `command-control`, `realism`

---

### **AUTO-002: Officer Questions**
- **Priority:** Medium
- **Estimate:** 2-3 hours
- **Status:** Not Started
- **Description:** Officers ask for clarification on ambiguous orders
- **Examples:**
  - Order: "Secure river crossing"
  - Situation: 3 fords detected
  - Question: "Commander, which ford? All three or split forces?"
- **Dependencies:** AUTO-001
- **Labels:** `autonomy`, `ai`

---

## 🟡 BACKLOG - Veterans & Progression

### **VET-001: Named Units (Battle 3+)**
- **Priority:** Medium
- **Estimate:** 2 hours
- **Status:** Not Started
- **Description:** Units earn names after 3 battles
- **Examples:** "The Ford Takers", "Iron Shields", "Blood Spears"
- **Dependencies:** Database veteran tracking
- **Labels:** `veterans`, `progression`

---

### **VET-002: Lead Officer Named (Battle 5+)**
- **Priority:** Medium
- **Estimate:** 2-3 hours
- **Status:** Not Started
- **Description:** Officers get names and personalities
- **Examples:** "Centurion Marcus the Steady", "Decanus Titus Ironfist"
- **Dependencies:** VET-001
- **Labels:** `veterans`, `narrative`

---

### **VET-003: Legendary Status (Battle 10+)**
- **Priority:** Medium
- **Estimate:** 2 hours
- **Status:** Not Started
- **Description:** +1 morale to nearby units, enhanced autonomy
- **Dependencies:** VET-002
- **Labels:** `veterans`, `morale`

---

## 🟢 POLISH & ENHANCEMENT

### **FORM-001: Formation Change Mechanics**
- **Priority:** Low
- **Estimate:** 2-3 hours
- **Status:** Not Started
- **Description:** Orders to change formations mid-battle
- **Timing:**
  - Phalanx: 0 turns (always in formation)
  - Testudo: 1 turn to form
  - Loose order: 1 turn
- **Dependencies:** CMB-003
- **Labels:** `formations`, `tactics`

---

### **STACK-001: Density Penalties**
- **Priority:** Low
- **Estimate:** 2 hours
- **Status:** Not Started
- **Description:** Penalties for over-stacking units
- **Tiers:**
  - 0-400: Normal
  - 401-600: -25% move, -1 combat
  - 601-800: -50% move, -2 combat (Cannae compression)
  - 801+: -75% move, -3 combat
- **Dependencies:** None
- **Labels:** `movement`, `anti-cheese`

---

### **MARCH-001: March Formation Orders**
- **Priority:** Low
- **Estimate:** 2-3 hours
- **Status:** Not Started
- **Description:** Column orders affecting speed/vulnerability
- **Types:**
  - Tight: -25% speed, 0 turn deploy, no ambush penalty
  - Standard: Normal speed, 1 turn deploy, -1 ambush
  - Extended: +25% speed, 2 turn deploy, -3 ambush (Teutoburg risk)
- **Dependencies:** FORM-001
- **Labels:** `movement`, `tactics`

---

### **LOCK-001: Defensive Lock Mechanic**
- **Priority:** Low
- **Estimate:** 1-2 hours
- **Status:** Not Started
- **Description:** Hold chokepoint (Thermopylae)
- **Command:** `/defend-position` or "Hold this ground at all costs!"
- **Effect:** Unit blocks tile completely, even friendly units cannot pass
- **Dependencies:** None
- **Labels:** `tactics`, `defensive`

---

## ✅ COMPLETED EPICS

### **Infrastructure (CB-001 through CB-006)**
- Database models, Sequelize setup, sync handling
- Commander, Battle, BattleTurn, EliteUnit, VeteranOfficer models
- No corruption, conditional sync working

### **Army Building (AB-001 through AB-007)**
- 5-step SP-based builder
- 8 starting cultures with restrictions
- Equipment compatibility validation
- Visual progress bars and embeds

### **Battle Creation (BC-001 through BC-006)**
- 5 battle scenarios
- Random weather generation
- Public announcements with join buttons
- Private DM briefings
- Test infrastructure

### **Initial Combat (BS-001 through BS-011)**
- Mathematical combat engine (ratio-based, to be replaced)
- Formation matrices
- Environmental effects
- Natural language parsing
- Turn-by-turn progression
- Victory conditions

### **Movement & Positioning**
- **PATH-001:** A* pathfinding with terrain costs ✅
- **PART-001:** Partial movement toward distant goals ✅
- **VIC-001:** Cumulative casualty application ✅
- **MAP-013:** ASCII maps in DMs ✅
- **CLEAN-001:** Debug log cleanup ✅

### **Mission System (MULTI-001)**
- **MISS-001:** Multi-turn destination orders ✅
- **MISS-002:** Mission interruption on enemy contact ✅
- **FOG-001:** Tiered visibility (8-5-3 tile ranges) ✅
- Mission persistence across turns ✅
- Auto-continuation on "hold" ✅
- Mission completion detection ✅

---

## 📊 Progress Summary

**Completed:** ~60 tasks (infrastructure, army building, basic combat, movement, missions)  
**Active Sprint:** Combat System v2.0 (14 tasks)  
**Backlog:** Command & Control (6 tasks), Veterans (3 tasks), Polish (4 tasks)  

**Total Remaining:** ~27 tasks to full feature set  
**Estimated Time:** ~60-80 hours at current pace  
**Timeline:** 6-8 weeks at 10-12 hours/week

---

## 🎯 Next Immediate Actions

1. **MULTI-002:** Add "units" keyword (15 min)
2. **CMB-001:** Define attack/defense ratings (2-3h)
3. **CMB-002:** Build chaos calculator (3-4h)
4. **CMB-003:** Build preparation calculator (2-3h)
5. **CMB-004:** Rewrite combat engine (4-6h)

**Estimated to Combat v2.0 Complete:** ~15-20 hours

**Current Status:** Mission system complete and working. Ready to revolutionize combat with chaos-modified attack/defense system that rewards tactical preparation while maintaining realistic unpredictability.
