# Cohort: Updated Task List from Resolved Issues

**Last Updated:** 10/23/25
**Source:** Resolved Issues → Implementation Tasks  
**Total Tasks:** 26 (15 new, 8 expand existing, 3 complete)

---

## 🔥 CRITICAL PRIORITY - Must Implement First (5 Tasks)

### **CMD-003: Commander Entity & Capture System**
- **Priority:** Critical
- **Estimate:** 6-8 hours
- **Status:** Not Started
- **Source:** Issue #1 (Commander Capture Mechanics)
- **Description:** Commander as non-combatant entity with capture mechanics
- **Files to Create:**
  - `src/game/commandSystem/commanderEntity.js`
  - `src/game/capture/captureSystem.js`
  - `src/game/capture/culturalNegotiations.js`
- **Acceptance Criteria:**
  - [ ] Commander attached to elite unit, moves with it
  - [ ] Capture triggers when elite <25% + enemy adjacent
  - [ ] Player choice: surrender/allow rescue
  - [ ] Observer mode for captured commander
  - [ ] Cultural negotiation system (Roman/Celtic/Nomadic/Han)
- **Dependencies:** AUTO-001 (Unit autonomy)
- **Labels:** `command-control`, `critical`, `capture`

---

### **MOVE-002: Initiative-Based Movement Resolution**
- **Priority:** Critical
- **Estimate:** 4-5 hours
- **Status:** Not Started
- **Source:** Issue #2 (Simultaneous Movement)
- **Description:** Speed-based initiative prevents collision conflicts
- **Files to Modify:**
  - `src/game/movementSystem.js` - Add initiative resolution
  - `src/game/turnOrchestrator.js` - Phase 1 movement by speed tiers
- **Speed Hierarchy:**
  ```javascript
  SPEED_TIERS = {
    scouts: 1,           // Move first
    lightCavalry: 1,
    mediumCavalry: 2,
    lightInfantry: 3,
    heavyInfantry: 4,
    siegeEquipment: 5    // Move last
  }
  ```
- **Acceptance Criteria:**
  - [ ] Units move in speed order (fastest first)
  - [ ] Collisions resolved by speed (faster arrives first)
  - [ ] Equal speed: Random 50/50 per turn
  - [ ] Path crossing handled correctly
- **Dependencies:** None
- **Labels:** `movement`, `critical`, `collision`

---

### **VIC-002: Expanded Victory Conditions**
- **Priority:** Critical
- **Estimate:** 3-4 hours
- **Status:** Not Started
- **Source:** Issue #3 (Victory Specifics)
- **Description:** Add objective capture, morale collapse, surrender mechanics
- **Files to Modify:**
  - `src/game/battleEngine.js` - Expand `checkVictoryConditions()`
- **New Victory Triggers:**
  ```javascript
  VICTORY_CONDITIONS = {
    objectiveCapture: "Control majority 3+ turns",
    armyDestruction: "Enemy <20% strength OR commander captured",
    moraleCollapse: "50%+ units broken + commander isolated",
    surrender: "Player explicit surrender"
  }
  ```
- **Acceptance Criteria:**
  - [ ] Objective control tracking (bridges/fords/hills)
  - [ ] Consecutive turn control requirement
  - [ ] Morale collapse detection
  - [ ] Player surrender command
  - [ ] Cultural reputation impact (honorable/shameful)
- **Dependencies:** MORALE-001
- **Labels:** `victory`, `critical`

---

### **MORALE-001: Complete Morale System**
- **Priority:** Critical
- **Estimate:** 6-8 hours
- **Status:** Not Started
- **Source:** Issue #4 (Morale Rout Mechanics)
- **Description:** Break thresholds, rout behavior, rally system
- **Files to Create:**
  - `src/game/morale.js` - Complete morale mechanics
  - `src/game/pursuit.js` - Pursuit system (Issue #14)
- **Break Thresholds:**
  ```javascript
  MORALE_BREAKS = {
    levy: "15-20% casualties",
    professional: "25-35% casualties",
    veteran: "35-45% casualties",
    elite: "45-50% casualties"
  }
  ```
- **Acceptance Criteria:**
  - [ ] Break threshold checks per training level
  - [ ] Rout behavior (flee toward map edge)
  - [ ] Rally attempts (10-70% based on training)
  - [ ] Rally modifiers (commander proximity, elite nearby)
  - [ ] Broken unit combat penalties (-50% defense)
  - [ ] Fleeing off map after 5 turns (if not rallied)
- **Dependencies:** None
- **Labels:** `morale`, `critical`, `combat`

---

### **FORM-002: Formation Change Mechanics**
- **Priority:** Critical
- **Estimate:** 4-5 hours
- **Status:** Not Started
- **Source:** Issue #5 (Formation Change Timing)
- **Description:** Formation switching with timing and vulnerability
- **Files to Create:**
  - `src/game/formations.js` - Formation system
- **Formation Change Times:**
  ```javascript
  FORMATION_CHANGES = {
    instant: ["phalanx→synaspismos", "loose→standard"],
    oneTurn: ["standard→phalanx", "standard→testudo"],
    vulnerable: "-3 defense during change"
  }
  ```
- **Acceptance Criteria:**
  - [ ] Formation change timing (instant/1 turn)
  - [ ] Vulnerability during change (-3 defense)
  - [ ] Terrain restrictions (no phalanx in forest)
  - [ ] Strength requirement (50%+ to maintain formations)
  - [ ] Cultural bonuses (Roman instant testudo)
  - [ ] Cannot move while changing formation
- **Dependencies:** None
- **Labels:** `formations`, `critical`, `tactics`

---

## 🟡 HIGH PRIORITY - Core Tactical Systems (9 Tasks)

### **MISS-002: Mission Interruption System**
- **Priority:** High
- **Estimate:** 3-4 hours
- **Status:** Expand Existing
- **Source:** Issue #6 (Mission Interruption)
- **Description:** Contingency orders, officer questions, autonomy AI integration
- **Files to Modify:**
  - `src/game/turnOrchestrator.js` - Expand mission system
  - `src/ai/orderInterpreter.js` - Parse contingencies
- **Acceptance Criteria:**
  - [ ] Parse contingency orders ("If enemy, report")
  - [ ] Execute contingencies automatically
  - [ ] Generate officer questions when ambiguous
  - [ ] 1-turn timeout, then autonomy AI
  - [ ] Mission resumption after resolution
- **Dependencies:** AUTO-001 (Sun Tzu AI)
- **Labels:** `missions`, `high-priority`, `autonomy`

---

### **TERRAIN-001: Complete Terrain Modifier System**
- **Priority:** High
- **Estimate:** 3-4 hours
- **Status:** Expand Existing
- **Source:** Issue #7 (Terrain Modifiers)
- **Description:** Hard-code all terrain effects with AI narrative layer
- **Files to Modify:**
  - `src/game/maps/mapUtils.js` - Add all terrain effects
  - `src/game/battleEngine.js` - Apply terrain modifiers
- **Hard-Coded Modifiers:**
  ```javascript
  TERRAIN_MODIFIERS = {
    elevation: "+2 defense per tier",
    forest: "-4 formation, -2 cavalry",
    marsh: "-2 movement, -1 attack",
    riverCrossing: "-4 effectiveness during crossing"
  }
  ```
- **Acceptance Criteria:**
  - [ ] All terrain movement costs defined
  - [ ] Combat modifiers applied automatically
  - [ ] Formation restrictions enforced
  - [ ] AI references terrain in narratives
- **Dependencies:** None
- **Labels:** `terrain`, `high-priority`

---

### **FOW-002: Information Persistence System**
- **Priority:** High
- **Estimate:** 3-4 hours
- **Status:** Expand Existing
- **Source:** Issue #9 (Fog of War Persistence)
- **Description:** Track last known enemy positions and intel degradation
- **Files to Modify:**
  - `src/game/fogOfWar.js` - Add memory tracking
- **Persistence Rules:**
  ```javascript
  INTEL_PERSISTENCE = {
    lastKnownPosition: "Show as ghost until re-observed",
    strengthEstimate: "Large/Medium/Small (does not update)",
    degradation: ">5 turns = low confidence, >10 = very uncertain"
  }
  ```
- **Acceptance Criteria:**
  - [ ] Store last known enemy positions
  - [ ] Display as "ghost" units (faded/outlined)
  - [ ] Label with turn last seen
  - [ ] Strength estimates don't auto-update
  - [ ] Officer warnings about stale intel
- **Dependencies:** None
- **Labels:** `fog-of-war`, `high-priority`

---

### **ELEV-001: Reverse Slope Mechanics**
- **Priority:** High
- **Estimate:** 2-3 hours
- **Status:** Not Started
- **Source:** Issue #10 (Reverse Slope)
- **Description:** Elevation blocks LOS, enabling Wellington-style tactics
- **Files to Modify:**
  - `src/game/fogOfWar.js` - Add elevation LOS blocking
- **Elevation Rules:**
  ```javascript
  ELEVATION_LOS = {
    rule: "Higher elevation blocks LOS to units behind",
    example: "Plains → Hill → Plains (hidden)",
    crest: "Unit on crest visible to all"
  }
  ```
- **Acceptance Criteria:**
  - [ ] LOS calculation checks elevation
  - [ ] Units behind hills hidden from plains
  - [ ] Crest positions visible to all
  - [ ] Reverse slope hiding works correctly
- **Dependencies:** None
- **Labels:** `elevation`, `tactics`, `high-priority`

---

### **STACK-002: Density Penalty System**
- **Priority:** High
- **Estimate:** 2-3 hours
- **Status:** Not Started
- **Source:** Issue #11 (Stacking Penalties)
- **Description:** Prevent death balls through over-stacking penalties
- **Files to Modify:**
  - `src/game/movementSystem.js` - Add capacity checks
  - `src/game/battleEngine.js` - Apply density penalties
- **Density Tiers:**
  ```javascript
  DENSITY_PENALTIES = {
    organized: "0-400: No penalties",
    crowded: "401-600: -25% move, -1 combat",
    compressed: "601-800: -50% move, -2 combat (Cannae)",
    crushing: "801-1000: -75% move, -3 combat",
    critical: "1001-1200: -90% move, -4 combat, -2 morale"
  }
  ```
- **Acceptance Criteria:**
  - [ ] Calculate total warriors per tile
  - [ ] Apply penalties by density tier
  - [ ] Hard cap at 1200 warriors
  - [ ] Display density status to players
- **Dependencies:** None
- **Labels:** `stacking`, `anti-cheese`, `high-priority`

---

### **WEATHER-002: Equipment Degradation System**
- **Priority:** High
- **Estimate:** 4-5 hours
- **Status:** Expand Existing
- **Source:** Issue #12 (Weather Effects) + Issue #26 (Weapon Interactions)
- **Description:** Historical weather-equipment interactions
- **Files to Create:**
  - `src/game/weatherEffects.js` - Comprehensive system
- **Key Effects:**
  ```javascript
  WEATHER_EQUIPMENT = {
    compositeBows: {
      lightRain: "-50% effectiveness",
      heavyRain: "-80% effectiveness"
    },
    woodenShields: {
      rain: "+150% weight when waterlogged, -1 defense"
    },
    ironWeapons: {
      cold: "+40% breakage chance <-10°C"
    }
  }
  ```
- **Acceptance Criteria:**
  - [ ] Rain affects composite bow strings
  - [ ] Shields gain weight when wet
  - [ ] Cold increases weapon breakage
  - [ ] Heat exhausts heavy armor
  - [ ] Cultural immunities (desert/mountain cultures)
- **Dependencies:** None
- **Labels:** `weather`, `equipment`, `high-priority`

---

### **MERC-001: Carthage Mercenary System**
- **Priority:** High
- **Estimate:** 3-4 hours
- **Status:** Not Started
- **Source:** Issue #13 (Carthage Mercenaries)
- **Description:** Mid-battle mercenary recruitment for Carthage
- **Files to Create:**
  - `src/game/cultures/carthage.js` - Special mechanics
- **Mercenary Mechanics:**
  ```javascript
  CARTHAGE_MERCS = {
    startingSP: 32,  // +2 merchant wealth
    saveSP: "Unused SP = mercenary budget",
    recruitment: "2-3 turn delivery",
    types: ["Numidian cavalry", "Balearic slingers", "Iberian infantry"]
  }
  ```
- **Acceptance Criteria:**
  - [ ] Carthage starts with 32 SP
  - [ ] Can save unused SP for mid-battle
  - [ ] Recruit command triggers delivery
  - [ ] 2-3 turn delay before arrival
  - [ ] Mercenaries enter at map edge
  - [ ] Loyalty mechanics (retreat first when broken)
- **Dependencies:** None
- **Labels:** `cultural`, `carthage`, `high-priority`

---

### **PURSUIT-001: Routing & Pursuit System**
- **Priority:** High
- **Estimate:** 4-5 hours
- **Status:** Not Started
- **Source:** Issue #14 (Routing/Pursuit)
- **Description:** Rout behavior and pursuit mechanics
- **Files to Create:**
  - `src/game/pursuit.js` - Pursuit mechanics
- **Integrated with:** MORALE-001
- **Pursuit Options:**
  ```javascript
  PURSUIT_TYPES = {
    aggressive: "+2 attack vs routing, -3 defense (no formation)",
    controlled: "Maintain formation, standard movement",
    noRestraint: "Auto-pursuit unless ordered otherwise"
  }
  ```
- **Acceptance Criteria:**
  - [ ] Routing units flee toward map edge
  - [ ] Pursue command breaks formation
  - [ ] Controlled pursuit maintains formation
  - [ ] Vulnerability when pursuing (-5 if ambushed)
  - [ ] Historical parallels (Cannae trap, Watling Street success)
- **Dependencies:** MORALE-001
- **Labels:** `morale`, `pursuit`, `high-priority`

---

### **AUTO-001: Sun Tzu Autonomy AI**
- **Priority:** High
- **Estimate:** 5-6 hours
- **Status:** Not Started
- **Source:** Issue #6 (Mission Interruption) - Autonomy logic
- **Description:** Units act independently when out of command range
- **Files to Create:**
  - `src/game/autonomy/sunTzuAI.js`
- **Decision Tree:**
  ```javascript
  AUTONOMY_LOGIC = {
    step1: "Follow existing orders if possible",
    step2: "Improvise within framework + send messenger",
    step3: "Sun Tzu strength evaluation",
    step4: "Morale modifiers affect behavior"
  }
  ```
- **Strength Evaluation:**
  ```javascript
  SUN_TZU_THRESHOLDS = {
    dominant: "Enemy <70%: Attack aggressively",
    favorable: "70-90%: Attack cautiously",
    even: "90-130%: Defensive + request orders",
    outnumbered: "130-200%: Fighting withdrawal",
    desperate: ">200%: Full retreat OR last stand"
  }
  ```
- **Acceptance Criteria:**
  - [ ] Units follow orders first
  - [ ] Improvise when orders impossible
  - [ ] Strength evaluation logic
  - [ ] Morale affects decision-making
  - [ ] Generate officer questions for ambiguity
  - [ ] Return to commander if no enemy
- **Dependencies:** None (but required by CMD-003, MISS-002)
- **Labels:** `autonomy`, `ai`, `high-priority`

---

## 🟢 MEDIUM PRIORITY - Polish & Special Features (12 Tasks)

### **NIGHT-001: Night Battle Scenario**
- **Priority:** Medium
- **Estimate:** 2-3 hours
- **Source:** Issue #15
- **Files to Create:**
  - `src/game/specialScenarios/nightBattle.js`
- **Description:** Night as special scenario with severe penalties
- **Labels:** `special-scenario`, `night`

---

### **BAG-001: Baggage Train Raid System**
- **Priority:** Medium
- **Estimate:** 3-4 hours
- **Source:** Issue #16
- **Files to Create:**
  - `src/game/baggage.js`
- **Description:** Baggage positioning, raid mechanics, recovery
- **Labels:** `baggage`, `logistics`

---

### **VET-004: Officer Death Impact**
- **Priority:** Medium
- **Estimate:** 2 hours
- **Source:** Issue #17
- **Files to Modify:**
  - `src/game/veteranTracking.js`
- **Description:** Knowledge loss when officer dies during mission
- **Labels:** `veterans`, `missions`

---

### **TERRAIN-002: Simple Terrain Destruction**
- **Priority:** Medium
- **Estimate:** 2-3 hours
- **Source:** Issue #18
- **Files to Create:**
  - `src/game/terrainDamage.js`
- **Description:** Bridges, forests, fortifications can be damaged
- **Labels:** `terrain`, `destruction`

---

### **VET-005: Cross-Battle Persistence**
- **Priority:** Medium
- **Estimate:** 2-3 hours
- **Source:** Issue #19
- **Files to Modify:**
  - `src/database/models/VeteranOfficer.js`
  - `src/game/veteranTracking.js`
- **Description:** Full veteran system integration across battles
- **Labels:** `veterans`, `persistence`

---

### **ADAPT-001: Cultural Adaptation System**
- **Priority:** Medium
- **Estimate:** 4-5 hours
- **Source:** Issue #20
- **Files to Create:**
  - `src/game/culturalAdaptation.js`
- **Description:** Cultures unlock tactics/equipment from defeated enemies
- **Labels:** `cultural`, `adaptation`

---

### **SIEGE-002: Siege Equipment Mobility**
- **Priority:** Medium
- **Estimate:** 2 hours
- **Source:** Issue #21
- **Files to Create:**
  - `src/game/siegeEquipment.js`
- **Description:** Movement rates, setup times, operational restrictions
- **Labels:** `siege`, `mobility`

---

### **MORALE-002: Morale Recovery System**
- **Priority:** Medium
- **Estimate:** 2-3 hours
- **Source:** Issue #22
- **Files to Modify:**
  - `src/game/morale.js`
- **Description:** Rally, recovery, commander inspiration
- **Labels:** `morale`, `recovery`

---

### **FF-001: Friendly Fire System**
- **Priority:** Medium
- **Estimate:** 2-3 hours
- **Source:** Issue #23
- **Files to Create:**
  - `src/game/friendlyFire.js`
- **Description:** Risk calculation, officer warnings, override mechanics
- **Labels:** `friendly-fire`, `safety`

---

### **CMD-004: Command Range Zones**
- **Priority:** Medium
- **Estimate:** 2-3 hours
- **Source:** Issue #24
- **Files to Create:**
  - `src/game/commandSystem/commandRanges.js`
- **Description:** Instant/messenger/out-of-contact zones
- **Labels:** `command-control`, `range`

---

### **CTX-001: Battle Context Scaling**
- **Priority:** Medium
- **Estimate:** 3-4 hours
- **Source:** Issue #25
- **Files to Create:**
  - `src/game/contextManagement.js`
- **Description:** Optimize context for battles >20 turns
- **Labels:** `optimization`, `context`

---

### **WEATHER-003: Detailed Weapon Interactions**
- **Priority:** Medium (Integrated with WEATHER-002)
- **Estimate:** Included in WEATHER-002
- **Source:** Issue #26
- **Description:** Complete historical weather-weapon effects
- **Labels:** `weather`, `weapons`, `detail`

---

## 📊 Summary

**Total Tasks:** 26  
- **Critical:** 5 tasks (~25-35 hours)
- **High:** 9 tasks (~30-40 hours)
- **Medium:** 12 tasks (~25-35 hours)

**Estimated Total:** 80-110 hours

**Implementation Priority:**
1. **Phase 1 (Critical):** Commander, movement, victory, morale, formations
2. **Phase 2 (High):** Missions, terrain, pursuit, weather, mercenaries, autonomy AI
3. **Phase 3 (Medium):** Polish features, special scenarios, optimizations

**Next Immediate Actions:**
1. CMD-003: Commander entity (foundational)
2. MOVE-002: Initiative system (prevents conflicts)
3. MORALE-001: Complete morale system (required by several others)
4. AUTO-001: Autonomy AI (required by commander capture)
5. VIC-002: Expanded victory conditions

**Timeline Estimate:** 8-12 weeks at 10-12 hours/week