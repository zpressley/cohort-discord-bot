# Cohort Development Task List

**Last Updated:** October 20, 2025  
**Current Sprint:** Combat System v2.0 Complete, Command & Control v1.0 Next  
**Version:** Game Core v0.3.0

---

## 📌 Project Guide — current code Task List (Core-first, free-AI optional)

### Priority Roadmap (remaining)
- High: current code-017 (DB model alignment/migrations), current code-015 (central router), current code-009 (keyword-only orchestrator)
- Medium: current code-020 (telemetry/replay), current code-025 (lint/typecheck finish), current code-024 (docs polish)
- Optional: current code-029/030/031 (free AI provider)

### current code-002: Define Command Catalog and JSON Schemas
- Priority: Critical
- Estimate: 4-6 hours
- Status: ✅ Complete
- Description: Define strict, versioned schemas for deterministic commands (move, formation, attack, support, conditional) and build a validation helper.
- Files to Create:
  - `src/game/schemas/command.move.json`, `src/game/schemas/command.formation.json`, ...
  - `src/game/schemas/index.js` (validator factory using Ajv or similar)
- Acceptance Criteria:
  - [ ] Schemas published and versioned
  - [ ] Validator returns structured errors (path, code, message)
  - [ ] Unit tests for valid/invalid payloads
- Dependencies: current code-001
- Labels: core, schemas, deterministic

### current code-032: Align Existing Turn Engine To Schemas
- Priority: Critical
- Estimate: 4-6 hours
- Status: ✅ Complete
- Description: Add adapters so the existing turn engine only accepts validated commands; outputs normalized state diffs + metrics.
- Files to Modify/Create:
  - `src/game/turnOrchestrator.js`, `src/game/battleEngine.js`
  - `src/game/engine/adapters/schemaAdapter.js`
- Acceptance Criteria:
  - [ ] Rejects malformed actions pre-exec with clear reasons
  - [ ] Produces `{ newState, diffs, metrics }`
  - [ ] Smoke test resolves a turn end-to-end using schema-valid input
- Dependencies: current code-002
- Labels: core, engine, adapters

### current code-004: Scenario Maps and Terrain Modifiers
- Priority: High
- Estimate: 4-6 hours
- Status: ✅ Complete
- Description: Provide map modules for all scenarios; unify API with existing `riverCrossing.js`; include movement costs and LOS helpers.
- Files to Create:
  - `src/game/maps/bridge_control.js`, `hill_fort_assault.js`, `forest_ambush.js`, `desert_oasis.js`
  - Ensure parity with `src/game/maps/riverCrossing.js`
- Acceptance Criteria:
  - [ ] Common interface: `getTiles()`, `movementCost()`, `hasLOS(a,b)`
  - [ ] Tests for movement and LOS edge-cases
- Dependencies: current code-032
- Labels: maps, movement, LOS

### current code-005: Transaction + Rollback Mechanism for State Updates
- Priority: High
- Estimate: 3-4 hours
- Status: ✅ Complete
- Description: Pre-turn snapshot; rollback on failure; persist audit diffs for replay.
- Files to Modify/Create:
  - `src/game/turnOrchestrator.js` (snapshot/commit/rollback)
  - `src/database/models/BattleTurn.js` (diffs/metrics fields as needed)
- Acceptance Criteria:
  - [ ] Failed turn restores prior state
  - [ ] Audit log persisted per turn
- Dependencies: current code-032
- Labels: reliability, audit, db

### current code-017: Battle Model Alignment and Migrations
- Priority: High
- Estimate: 3-4 hours
- Status: Not Started
- Description: Ensure DB fields used in code exist; add/alter migrations and startup checks.
- Files to Modify/Create:
  - Sequelize migrations for `weather`, `terrain`, `victoryConditions`, `battleState.pendingOrders`, `messageId`
  - Validation in `src/database/setup.js`
- Acceptance Criteria:
  - [ ] Migrations applied cleanly
  - [ ] Startup asserts models match expectations
- Dependencies: current code-004, current code-005
- Labels: database, migrations

### current code-012: Turn Results: Structured Output + Narrative
- Priority: High
- Estimate: 3-4 hours
- Status: ✅ Complete
- Description: Standardize the per-turn outputs and build DM embeds; include deterministic narrative fallback hooks.
- Files to Modify/Create:
  - `src/bot/dmHandler.js` (result packaging)
  - `src/game/briefingGenerator.js` or new `src/game/resultFormatters.js`
- Acceptance Criteria:
  - [ ] Result object includes movement, combat, casualties, intel
  - [ ] Embeds respect Discord limits
  - [ ] Fallback narrative used when AI disabled
- Dependencies: current code-032
- Labels: output, ux

### current code-022: Unit and Property Tests for Core Engine
- Priority: High
- Estimate: 4-6 hours
- Status: ✅ Complete
- Description: Tests for movement legality, combat math invariants, idempotent diffs.
- Files to Modify/Create:
  - `src/tests/**` (extend existing `tests/balance` and `game/combat/tests`)
- Acceptance Criteria:
  - [ ] Movement legality suite
  - [ ] Combat invariants suite
  - [ ] Diffs idempotency on reapply
- Dependencies: current code-004, current code-012
- Labels: tests, core

### current code-014: Consolidate Duplicate MessageCreate Handlers
- Priority: Medium
- Estimate: 30-45 minutes
- Status: ✅ Complete
- Description: Unify to a single DM handler registration in `src/index.js`.
- Files to Modify:
  - `src/index.js`
- Acceptance Criteria:
  - [ ] One MessageCreate listener
  - [ ] DM flow test passes
- Dependencies: None
- Labels: cleanup, routing, quick-fix

### current code-015: Refactor Interaction Routing To interactionHandler
- Priority: Medium
- Estimate: 1-2 hours
- Status: Not Started
- Description: Centralize routing and remove duplicated lobby branching.
- Files to Modify:
  - `src/index.js`, `src/bot/interactionHandler.js`
- Acceptance Criteria:
  - [ ] All prefixes mapped in one place
  - [ ] Duplicates removed, covered by tests
- Dependencies: current code-014
- Labels: routing, cleanup

### current code-026: Quick Fix — Remove duplicated lobby branch in index.js
- Priority: Medium
- Estimate: 15-30 minutes
- Status: ✅ Complete
- Description: Eliminate repeated lobby branch in button handling.
- Files to Modify:
  - `src/index.js`
- Acceptance Criteria:
  - [ ] Single lobby branch remains
  - [ ] Add a test to ensure route coverage
- Dependencies: current code-015
- Labels: quick-fix, cleanup

### current code-009: Hybrid Orchestrator In dmHandler (Keyword-Only Phase)
- Priority: Medium
- Estimate: 2-3 hours
- Status: Not Started
- Description: Use keyword parser → validate against schemas → build execution plan → optional dry-run, no paid AI.
- Files to Modify:
  - `src/bot/dmHandler.js`
- Acceptance Criteria:
  - [ ] Low-confidence/invalid orders return actionable feedback
  - [ ] Validated plan executes via turn orchestrator
- Dependencies: current code-002, current code-007
- Labels: parsing, orchestrator

### current code-011: Cultural Rules Validation Layer
- Priority: Medium
- Estimate: 2-3 hours
- Status: ✅ Complete
- Description: Apply culture constraints/bonuses post-parse and pre-exec; adjust confidence and warnings.
- Files to Modify/Create:
  - `src/game/orderParser.js` (integration)
  - `src/game/culturalRules.js`
- Acceptance Criteria:
  - [ ] Restricted formations penalized or rejected per culture
  - [ ] Preferred tactics increase confidence
- Dependencies: current code-002, current code-009
- Labels: culture, validation

### current code-021: Safeguards: Confidence Thresholds and Sandbox “Dry‑Run”
- Priority: Medium
- Estimate: 2-3 hours
- Status: ✅ Complete
- Description: Simulate turn without commit and show diffs; require confirmation below thresholds.
- Files to Modify/Create:
  - `src/bot/dmHandler.js` (dry-run and confirm)
  - `src/game/turnOrchestrator.js` (simulate path)
- Acceptance Criteria:
  - [ ] Dry-run path returns deterministic results
  - [ ] Confirmation flow blocks risky exec
- Dependencies: current code-009, current code-012
- Labels: safety, ux

### current code-019: Rate Limiting and DM Queueing
- Priority: Medium
- Estimate: 1-2 hours
- Status: ✅ Complete
- Description: Queue DMs with backoff to respect Discord limits; add telemetry for drops/retries.
- Files to Create:
  - `src/bot/utils/dmQueue.js`
- Acceptance Criteria:
  - [ ] No throttling errors during tests
  - [ ] Retries logged and bounded
- Dependencies: current code-015
- Labels: reliability, discord

### current code-024: Help/Docs Surfaces and Error Copy
- Priority: Low
- Estimate: 1-2 hours
- Status: ✅ Complete
- Description: Add lobby help panel and /help; clear messages for ambiguity, cultural violations, and impossible moves.
- Files to Modify/Create:
  - `src/bot/commands/lobby.js` (help panel)
  - `src/bot/commands/help.js`
- Acceptance Criteria:
  - [ ] Examples and tips visible from lobby
  - [ ] Error copy concise and actionable
- Dependencies: current code-011, current code-021
- Labels: docs, ux

### current code-025: Code Hygiene: Lint/Typecheck Scripts and CI
- Priority: Low
- Estimate: 1-2 hours
- Status: In Progress
- Description: Add npm scripts and CI workflow for lint/test; fix existing warnings.
- Files to Modify/Create:
  - `package.json` scripts, `.github/workflows/ci.yml`
- Acceptance Criteria:
  - [ ] `npm run lint` and `npm test` green
  - [ ] CI required checks configured
- Dependencies: None
- Labels: ci, hygiene

### current code-027: Scenario Key Alignment
- Priority: Low
- Estimate: 45-60 minutes
- Status: ✅ Complete
- Description: Assert scenario keys match map modules and DB values at startup.
- Files to Modify/Create:
  - `src/bot/commands/create-game.js` (keys)
  - `src/game/maps/**` (module names)
  - Startup assertion util: `src/game/validation/scenarioKeyAssert.js`
- Acceptance Criteria:
  - [ ] Startup fails with clear guidance if mismatch
- Dependencies: current code-004
- Labels: validation, startup

### current code-028: Narrative Fallback Implementation
- Priority: Low
- Estimate: 1-2 hours
- Status: ✅ Complete
- Description: Deterministic template narrative when AI is disabled/unavailable.
- Files to Modify/Create:
  - `src/game/briefingGenerator.js` or `src/game/narratives/fallback.js`
- Acceptance Criteria:
  - [ ] Clear user notice when fallback used
  - [ ] Logged in audit
- Dependencies: current code-012
- Labels: narrative, fallback

### current code-020: Telemetry, Replay Logs, and Tracing
- Priority: Medium
- Estimate: 3-4 hours
- Status: Not Started
- Description: Per-turn audit (inputs, validated actions, diffs, narrative); replay CLI; anonymized metrics.
- Files to Modify/Create:
  - `src/database/models/BattleTurn.js` (audit)
  - `scripts/replayBattle.js`
- Acceptance Criteria:
  - [ ] Can replay a battle locally from logs
  - [ ] PII-free metrics exported
- Dependencies: current code-005, current code-012
- Labels: telemetry, tooling

### current code-029: Free AI Provider (Ollama) Adapter
- Priority: Optional
- Estimate: 2-3 hours
- Status: Not Started
- Description: Local provider adapter compatible with aiManager; models `llama3.2:3b` or `mistral:7b`.
- Files to Create:
  - `src/ai/providers/ollama.js`
- Acceptance Criteria:
  - [ ] Same interface as existing AI manager
  - [ ] Timeouts/retries handled
- Dependencies: None
- Labels: ai, local

### current code-030: Feature Flags and Provider Config
- Priority: Optional
- Estimate: 45-60 minutes
- Status: Not Started
- Description: Toggle AI via env; default disabled; provider selection.
- Files to Modify/Create:
  - `src/ai/aiManager.js` (flag gating)
  - `.env.example` (AI_ENABLED, AI_PROVIDER)
- Acceptance Criteria:
  - [ ] Keyword-only mode works with AI disabled
  - [ ] Provider switching documented
- Dependencies: current code-029
- Labels: config, flags

### current code-031: Local Install/Run Docs For Free AI
- Priority: Optional
- Estimate: 45-60 minutes
- Status: Not Started
- Description: Setup guide for running Ollama locally and enabling the adapter.
- Files to Create:
  - `docs/ai/local_ollama.md`
- Acceptance Criteria:
  - [ ] Install steps, model pulls, env flags
  - [ ] Troubleshooting section
- Dependencies: current code-029, current code-030
- Labels: docs, ai

---

## 🎯 ACTIVE SPRINT - Command & Control v1.0

### **CMD-001: Commander Entity Foundation**
- **Priority:** Critical
- **Estimate:** 3-4 hours
- **Status:** ✅ Complete
- **Description:** Create commander as POV entity always attached to a unit
- **Properties:**
```javascript
commander = {
  isUnit: false,
  attachedTo: 'unit_id',
  position: 'sameAsAttachedUnit',
  isPOV: true,
  captureRisk: true
}
```
- **Acceptance Criteria:**
  - [x] Commander moves with attached unit (automatic)
  - [x] Can move between adjacent units (1-tile limit)
  - [x] Always starts with elite unit
  - [x] Capture mechanics when elite <25% strength
  - [x] Player choices: escape/die/surrender
  - [x] Natural language commands: "I will move to the cavalry"
- **Dependencies:** None
- **Labels:** `command-control`, `critical`, `✅ complete`

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

### **Combat System v2.0 (CMB-001 through CMB-006)**
- **CMB-001:** Attack/Defense Rating Tables ✅
  - Created `attackRatings.js`, `defenseRatings.js`, `culturalModifiers.js`
  - Weapon attack ratings (2-12 scale), armor defense (0-10 scale)
  - Training bonuses, formation modifiers, cultural traits for 8 civilizations
- **CMB-002:** Chaos Calculation System ✅
  - Built `chaosCalculator.js` with 0-10 chaos scale
  - Environmental factors (terrain, weather, density, tactical situation)
- **CMB-003:** Preparation Calculator ✅
  - Created `preparationCalculator.js` with formation/experience/position bonuses
  - Added 6-step army building with training selection (basic/technical/expert)
  - Training costs 2/4/6 SP, limited to unit weapon types
- **CMB-004:** Combat Engine Rewrite ✅
  - Replaced ratio system with chaos-modified attack/defense formula
  - Integrated all combat modules with bucket damage accumulation
  - Added range mechanics and ambush rules (Teutoburg Forest style)
- **CMB-005:** Damage Accumulation ✅
  - Implemented bucket system for negative damage storage
  - Accumulation persists across turns until positive damage overflow
- **CMB-006:** Combat Balance Testing ✅
  - Created comprehensive balance test framework with 12+ scenarios
  - Achieved ~80% competitive balance threshold
  - Validated tactical realism (archers vs melee, ambush mechanics)

### **Infrastructure (CB-001 through CB-006)**
- Database models, Sequelize setup, sync handling
- Commander, Battle, BattleTurn, EliteUnit, VeteranOfficer models
- No corruption, conditional sync working

### **Army Building (AB-001 through AB-007)**
- Enhanced to 6-step SP-based builder with training selection
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
- Mathematical combat engine (replaced with v2.0 system)
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

### **Multi-Unit Recognition (MULTI-002)**
- **MULTI-002:** "Units" keyword recognition ✅
  - Added support for "units move to X" as "all units" command
  - Enhanced natural language parsing in orderInterpreter.js

---

## 📊 Progress Summary

**Completed:** Added schemas/validators, engine alignment, new maps, transactional updates, structured results+narrative with AI fallback, DM queue, dry-run, cultural rules validation, CI, and core/schema tests.  
**Active Sprint:** Command & Control v1.0 and Core Hardening  
**Backlog:** Veterans (3 tasks), Polish (4 tasks), Combat Enhancement (8 tasks)

**Total Remaining (current code epic):** 017, 015, 009, 020, 025, 029–031  
**Estimated Time:** ~12–18 hours  
**Timeline:** ~1–2 weeks at current pace

---

## 🎯 Next Immediate Actions (updated)

1. current code-017: DB model alignment + migrations
2. current code-015: Central interaction router
3. current code-009: Keyword-only orchestrator
4. current code-020: Telemetry and replay logs
5. current code-025: Lint/typecheck + CI polish

1. **CMD-001:** Commander Entity Foundation (3-4h) - *IN PROGRESS*
2. **CMD-002:** Command Range Zones (3-4h)
3. **AUTO-001:** Sun Tzu Autonomy AI (4-5h)
4. **MSG-001:** Messenger System (2-3h)
5. **AUTO-002:** Officer Questions (2-3h)

**Estimated to Command & Control v1.0 Complete:** ~15-20 hours

**Current Status:** Combat System v2.0 complete with chaos-modified attack/defense, range mechanics, comprehensive balance testing, and 6-step army building with training. Ready to implement command and control system with commanders, autonomy AI, and realistic communication delays.

---

## ✅ Completed (current code)

### current code-007: Keyword Parser (orderParser)
- Status: ✅ Complete
- Notes: `src/game/orderParser.js` present; to be integrated with schema validation (current code-002) and cultural rules (current code-011).

### current code-008: AI Interpreter (orderInterpreter) + Provider Adapters
- Status: ✅ Complete (present)
- Notes: `src/ai/orderInterpreter.js` exists; will remain gated behind feature flags (current code-030) and optional local provider (current code-029).

### current code-016: Command Loader Audit and Registration
- Status: ✅ Complete
- Notes: `src/bot/commandLoader.js` in use via `src/index.js`; ensure registration remains after routing cleanup (current code-015).

### current code-002/032/004/005/012/014/019/021/022/024/027/028
- Status: ✅ Complete (see sections above)
- Notes: Schemas and validators; engine alignment; scenario maps; transactional updates; structured results+narrative; messaging cleanup; DM queue; dry-run; core tests; help UI; scenario assertion; fallback narrative.
