# Cohort Discord Bot - Implementation Guide & Fix Roadmap

**Generated:** December 2024  
**Current Version:** 0.2.0  
**Status:** Critical fixes needed, then feature implementation


---

## 🚨 SECTION 1: CURRENT CORE STATUS & TRUE CRITICALS

### ✅ Deployment & Battle Start *(DONE)*

- `startBattlePhase(battle)` is called from `handleBattleJoin` once Player 2 joins.
- `initializeBattle` + `initializeDeployment` correctly create `battleState.player1.unitPositions` and `battleState.player2.unitPositions`.

### ✅ Victory Conditions No Longer Auto-End on Turn 1 *(DONE)*

- `checkVictoryConditions` in `src/game/victorySystem.js` skips pre-deployment and prevents early auto-wins.

### ✅ Map Display in Briefings *(DONE)*

- `sendInitialBriefings` + `generateRichTextBriefing` already embed a single ASCII map per briefing.

### ✅ Order Execution & Unit IDs *(DONE)*

- `initializeDeployment` and `interpretOrders` agree on unit IDs (e.g., `north_unit_0`), and movement resolves via `processMovementPhase`.

### ✅ Missing Validation File Reference *(DONE)*

- `src/index.js` no longer references any non-existent validation modules.

---

## 📋 SECTION 2: CORE SYSTEMS – WHAT’S ALREADY BUILT

The original guide assumed these systems were missing; in reality they are mostly implemented.

### 🟡 Movement System & Initiative (MOVE-002)

**Status:** Implemented.

- Initiative and speed tiers are handled in `processMovementPhase` (`src/game/positionBasedCombat.js`) via `speedTierFor(unit)`.
- Partial movement, pathfinding, and mission continuation live in `src/game/movementSystem.js`.
- Stacking is allowed; Stack-001 compression applies penalties when multiple friendly units occupy the same tile.

**Next steps (optional):**
- Surface stack/compression information in briefings (e.g., "Units congested at J11; movement reduced").
- Add culture-specific movement quirks (e.g., scouts ignoring some terrain penalties).

---

### 🟡 Fog of War (FOW-002)

**Status:** Implemented.

- `src/game/fogOfWar.js` provides tiered visibility (spotted / identified / detailed) with weather and terrain modifiers.
- `calculateVisibility` is already used in the turn orchestrator and order interpreter.

**Next steps (design-aligned):**
- Add "ghost" last-known enemy positions if you want persistent intel trails.
- Integrate `generateIntelligenceReport` output into WAR COUNCIL briefings for richer recon text.

---

### 🟡 Combat Resolution

**Status:** Implemented (Combat System v2.0).

- `src/game/battleEngine.js` implements the chaos-modified attack/defense system with preparation, damage accumulation, and morale deltas.
- Engagement detection and positional modifiers live in `src/game/positionBasedCombat.js`.

**Next steps:**
- Tune thresholds in `determineCombatResult` for desired lethality and advantage bands.
- Add terrain- and culture-specific tactical flavor hooks to feed the narrative layer.

---

## 🛠️ SECTION 3: MINI-ROADMAP (BASED ON CURRENT CODE)

This section replaces the older Week 1–6 schedule with a plan grounded in the existing implementation.

### 3.1 Short-Term (Stability & Clarity)

1. **Order Interpreter Guardrails**  
   - Files: `src/ai/orderInterpreter.js`.  
   - Goals:
     - Harden JSON parsing in `callAIForOrderParsing` and expand tests for fallback parsing.
     - Make "all units" and major subgroup phrases (infantry, cavalry, archers) predictable and logged.

2. **Battle State Normalization**  
   - Files: `src/game/turnOrchestrator.js`, `src/game/fogOfWar.js`, `src/game/movementSystem.js`, `src/game/maps/*`.  
   - Goals:
     - Standardize on `battle.battleState.map` as the single map/terrain source.
     - Ensure fog-of-war, movement, and map rendering all read from that structure.

3. **Briefing UX Polish**  
   - Files: `src/game/briefingSystem.js`, `src/game/briefingGenerator.js`.  
   - Goals:
     - Ensure exactly one map per briefing per turn.
     - Optionally inject stack/compression warnings and simple intel summaries.

---

### 3.2 Medium-Term (Deeper Systems)

1. **Morale 1.0 (Per-Unit Behavior)**  
   - Files: `src/game/morale.js`, hooks in `battleEngine` and `briefingGenerator`.  
   - Status: **Phase 2 started** — basic break/routing flags are integrated into combat and visible in WAR COUNCIL (Shaken/ROUTING!).  
   - Next: incorporate commander proximity and allies-routing modifiers when commander context is wired, and eventually constrain routing units’ movement.

2. **Commander POV & Capture Integration**  
   - Files: `src/ai/orderInterpreter.js`, `src/game/commandSystem/*`, `src/game/battleInitializer.js`, `src/game/battleEngine.js`, database models.  
   - Goals:
     - Ensure the Commander entity (player POV) is always attached to an elite unit at battle start (already true in `battleInitializer`).
     - Keep Commander DB position in sync with host unit moves.
     - Trigger capture risk when the Commander’s host unit drops below 25% strength (Commander `status: at_risk`).
     - Resolve capture with natural language commands (escape / die with honor / surrender) via `parseCommanderActions` → `resolveCommanderCapture`.

3. **Weather Effects 1.0**  
   - Files: new `src/game/weatherEffects.js`, integrations in `movementSystem`, `fogOfWar`, and `battleEngine`.  
   - Goals:
     - Apply simple, predictable movement and visibility modifiers per weather type (e.g., light_rain, fog).
     - Optionally add a few equipment-specific adjustments for bows/shields.

---

### 3.3 Long-Term (Polish & Depth)

1. **Veteran & Officer Progression**  
   - Deepen how `EliteUnit` and `VeteranOfficer` feed into combat ratings, morale resilience, and narrative.

2. **Formation & Terrain Specialization**  
   - More meaningful formation changes with clear pros/cons per terrain and culture.

3. **Narrative Enrichment**  
   - Use the existing AI hooks to generate multi-turn narrative arcs, not just per-turn summaries.

### Feature 3.1: Morale System (MORALE-001)

**Priority:** High  
**Estimate:** 6-8 hours  
**New File:** `src/game/morale.js`

```javascript
// src/game/morale.js
const MORALE_THRESHOLDS = {
    levy: { break: 0.20, rally: 0.10 },      // 20% casualties to break
    militia: { break: 0.25, rally: 0.30 },
    professional: { break: 0.35, rally: 0.50 },
    veteran: { break: 0.45, rally: 0.60 },
    elite: { break: 0.50, rally: 0.70 }
};

function checkMorale(unit, casualties, friendlyCommander, enemyPresence) {
    const casualtyRate = casualties / unit.maxStrength;
    const threshold = MORALE_THRESHOLDS[unit.quality || 'professional'];
    
    if (casualtyRate >= threshold.break && !unit.isBroken) {
        // Unit breaks!
        unit.isBroken = true;
        unit.morale = 20;
        unit.combatEffectiveness *= 0.5;
        
        // Check rally chance
        const rallyBonus = friendlyCommander ? 0.2 : 0;
        if (Math.random() < threshold.rally + rallyBonus) {
            unit.isRallying = true; // Will rally next turn
        } else {
            unit.isRouting = true; // Fleeing battlefield
        }
    }
    
    return unit;
}
```

### Feature 3.2: Commander System (CMD-003)

**Priority:** High  
**Estimate:** 6-8 hours  
**New Files:** 
- `src/game/commandSystem/commanderEntity.js`
- `src/game/capture/captureSystem.js`

```javascript
// src/game/commandSystem/commanderEntity.js
class Commander {
    constructor(playerId, culture, attachedUnit) {
        this.playerId = playerId;
        this.culture = culture;
        this.attachedTo = attachedUnit;
        this.position = null; // Derives from attached unit
        this.captured = false;
        this.commandRadius = 5; // tiles
    }
    
    checkCapture(battleState) {
        const unit = this.getAttachedUnit(battleState);
        if (unit.currentStrength < unit.maxStrength * 0.25) {
            const adjacentEnemies = this.getAdjacentEnemies(battleState);
            if (adjacentEnemies.length > 0) {
                return {
                    canCapture: true,
                    options: ['surrender', 'attempt_escape', 'die_with_honor']
                };
            }
        }
        return { canCapture: false };
    }
}
```

### Feature 3.3: Weather Effects (WEATHER-002)

**Priority:** Medium  
**Estimate:** 4-5 hours  
**New File:** `src/game/weatherEffects.js`

```javascript
// src/game/weatherEffects.js
const WEATHER_EFFECTS = {
    clear: {},
    light_rain: {
        compositeBows: { effectiveness: 0.5 },
        movement: { all: -1 },
        visibility: { range: -1 }
    },
    heavy_rain: {
        compositeBows: { effectiveness: 0.2 },
        crossbows: { effectiveness: 0.7 },
        shields: { weight: 1.5, defense: -1 },
        movement: { all: -2 },
        visibility: { range: -3 }
    },
    fog: {
        visibility: { range: -2 },
        ambush: { bonus: 4 },
        formations: { effectiveness: 0.7 }
    }
};

function applyWeatherEffects(unit, weather, equipment) {
    const effects = WEATHER_EFFECTS[weather];
    if (!effects) return unit;
    
    // Apply equipment-specific effects
    if (equipment.includes('composite_bow') && effects.compositeBows) {
        unit.rangedEffectiveness *= effects.compositeBows.effectiveness;
    }
    
    // Apply movement penalties
    if (effects.movement) {
        unit.movementRemaining -= effects.movement.all || 0;
    }
    
    return unit;
}
```

---

## 📊 SECTION 4: IMPLEMENTATION SCHEDULE (UPDATED)

### Phase 1: Stabilization
- [ ] Harden order interpreter & AI fallback (`orderInterpreter.js`).
- [ ] Normalize battle state map/terrain usage across systems.
- [x] Polish briefing UX (single map, clearer intel & stacking notes). *(baseline DONE – further polish optional)*

### Phase 2: Core Depth
- [x] Implement Morale 1.0 (per-unit breaking/routing behavior). *(initial implementation DONE – commander-aware modifiers and routing movement TBD)*
- [X] Fully integrate Commander POV, movement, and capture outcomes.
- [ ] Implement Weather Effects 1.0 and wire into movement/FOW/combat.

**Phase 2 Completed Items (so far):**
- Morale 1.0 basics: break/routing thresholds by quality, defense penalties for broken units, and Shaken/ROUTING! indicators in YOUR FORCES.

### Phase 3: Strategic Depth & Polish
- [ ] Veteran & officer progression feeding into combat/narrative.
- [ ] Rich formation/terrain interactions.
- [ ] Narrative arc improvements across multiple turns.

---

## 🧪 SECTION 5: TESTING CHECKLIST

### After Each Fix:
1. **Unit Deployment Test**
   - Create battle → Join battle → Check units exist in positions
   - Command `/battle-status` should show units on map

2. **Movement Test**
   - Send "move north" → Units should change position
   - Send "move to H10" → Specific tile movement

3. **Combat Test**
   - Move units adjacent → Combat should trigger
   - Check casualties apply correctly

4. **Victory Test**
   - Battle should NOT end on turn 1
   - Should end when one side eliminated

5. **Map Display Test**
   - Every briefing should include ASCII map
   - Player positions marked with 🔵
   - Enemy positions marked with 🔴 (if visible)

---

## 🚀 SECTION 6: QUICK START COMMANDS

### For Testing After Fixes:

```bash
# Start bot
npm start

# In Discord:
/build-army
# Select culture, build forces

/create-game
# Select scenario

# Have second account join via button

# In DMs:
"move south"
"advance to ford"
"attack enemy position"

# Check status:
/battle-status
```

### Database Reset (if needed):

```bash
# Delete database and restart fresh
rm data/database.db
npm start
```

---

## 📝 SECTION 7: COMMON ERRORS & SOLUTIONS

### Error: "You are not currently in an active battle"
**Fix:** Change status check in dmHandler.js to include 'army_building'

### Error: "Unit found: false"
**Fix:** Ensure units are deployed when battle starts (startBattlePhase)

### Error: "Unknown Message" when joining
**Fix:** This is cosmetic - interaction.update() fails on simulated messages

### Error: Battle ends immediately
**Fix:** Check victory conditions aren't triggering on empty arrays

### Error: No map in briefing
**Fix:** Ensure briefingSystem.sendInitialBriefings is called with correct params

---

## 🎯 SECTION 8: DEFINITION OF DONE

A feature is complete when:

1. **Functionally Working** - Core mechanics operate as designed
2. **Integrated** - Works with existing systems without breaking them
3. **Tested** - Manual testing confirms expected behavior
4. **Documented** - Code comments explain non-obvious logic
5. **Error Handled** - Graceful failures with helpful error messages

---

## 📚 SECTION 9: HELPFUL RESOURCES

### File Structure:
```
src/
├── ai/           # Order interpretation, narrative
├── bot/          # Discord interaction handling
├── database/     # Models and setup
├── game/         # Core game logic
│   ├── maps/     # Map definitions
│   ├── combat/   # Combat calculations
│   └── officers/ # Veteran system
└── tests/        # Test files
```

### Key Functions:
- `processTurn()` - Main turn orchestration
- `interpretOrders()` - Parse player commands
- `processMovementPhase()` - Execute movements
- `resolveCombat()` - Calculate combat results
- `calculateVisibility()` - Fog of war
- `checkVictoryConditions()` - Determine battle end

### Database Models:
- `Battle` - Battle state and metadata
- `Commander` - Player profiles
- `BattleTurn` - Turn-by-turn commands
- `EliteUnit` - Special units
- `VeteranOfficer` - Officer progression

---

**Last Updated:** December 2024  
**Next Review:** After Week 1 fixes complete