# Cohort Bot — Consolidation Plan
> Written from a live audit of the actual codebase. Every file, import, and line count here was verified.

---

## What the codebase actually looks like right now

Before touching anything, here's the honest picture of what lives where and what's connected to what.

### The live turn loop (confirmed by tracing imports)

```
Discord DM
  └── dmHandler.js
        ├── turnOrchestrator.js          ← master turn resolver
        │     ├── ai/orderInterpreter.js ← 1199 lines in the AI folder, does game logic
        │     ├── positionBasedCombat.js ← 909 lines, does movement + combat detection + modifiers
        │     ├── fogOfWar.js
        │     ├── battleEngine.js        ← coordinator that imports 8 combat sub-files
        │     │     ├── combat/attackRatings.js
        │     │     ├── combat/defenseRatings.js
        │     │     ├── combat/chaosCalculator.js
        │     │     ├── combat/preparationCalculator.js
        │     │     ├── combat/culturalModifiers.js
        │     │     ├── combat/damageAccumulation.js
        │     │     ├── morale.js
        │     │     ├── rangedCombat.js
        │     │     └── maps/mapUtils.js
        │     ├── movementSystem.js
        │     ├── victorySystem.js
        │     └── commandSystem/commanderManager.js
        ├── briefingSystem.js            ← sendNextTurnBriefings
        └── orderFeedback.js             ← generateFriendlyFireWarning (only usage)

Discord interaction
  └── interactionRouter.js
        ├── gameInteractionHandler.js    ← battle start, scenario selection, join/ready
        │     ├── battleInitializer.js   ← only importer
        │     └── briefingSystem.js      ← sendInitialBriefings
        ├── lobbyInteractionHandler.js   ← lobby buttons
        ├── armyInteractionHandler.js    ← army builder
        └── commands/*
              └── battle-status.js      ← imports briefingGenerator directly
```

### The briefing stack

```
briefingSystem.js (254 lines)
  └── briefingGenerator.js (986 lines)
        ├── maps/mapUtils.js
        ├── ai/officerQA.js             ← callGroqAI
        └── ai/aiManager.js             ← generateOfficerDialogue
```

### The AI files

```
ai/aiManager.js (379 lines)
  → exports: initializeAI, generateBattleNarrative, selectBestProvider,
             generateOfficerTurnSummary, generateOrderAcknowledgement,
             generateOfficerDialogue, generateOfficerResponse

ai/aiNarrativeEngine.js (602 lines)
  → imports aiManager, wraps its functions
  → only imported by: testNarrative.js (test file)
  → DEAD IN PRODUCTION

ai/officerQA.js (284 lines)
  → imports fogOfWar
  → exports callGroqAI (used by briefingGenerator)
  → exports officer Q&A functions

ai/orderInterpreter.js (1199 lines)
  → lives in src/ai/ but does game logic
  → imports: movementSystem, mapUtils, fogOfWar, commandSystem
  → imported by: turnOrchestrator, dmHandler, 4 test files
```

### The map stack

```
maps/mapUtils.js (1216 lines)
  → imported by nearly everything
  → has two LAZY requires inside function bodies:
      generateEmojiMapViewport() → require('../formations/formationStatus')
      generateOperationalMap()   → require('../formations/formationStatus')

maps/baseMapRS.js (198 lines)
  → contains TWO createMap() functions (invalid JS, duplicate exports)
  → only the 40×40 version is used

maps/riverCrossing.js
  → imported lazily inside movementSystem.js

formations/formationStatus.js (202 lines)
  → imported by: mapUtils (lazy), positionBasedCombat (lazy), movementSystem (lazy)
```

---

## Confirmed dead files (zero production importers)

| File | Lines | Status |
|---|---|---|
| `src/game/battleInitializer.js.backup` | — | Delete. Literal backup file. |
| `src/ai/aiNarrativeEngine.js` | 602 | Only testNarrative.js imports it. |
| `src/ai/testNarrative.js` | — | Test file, not production. |
| `src/game/creativeOrders.js` | 332 | Nothing imports it. |
| `src/game/culturalRules.js` | 25 | Nothing imports it. |
| `src/game/formations.js` | 70 | Nothing imports it (formationStatus.js superseded it). |
| `src/bot/interactionHandler.js` | 13 | Not a real module — a copy-paste snippet referencing `client` as a global. Dead. |
| `src/telemetry/metrics.js` | — | Nothing imports it. |

---

## Known bugs to note (do not fix during consolidation)

- `index.js` calls `initializeAI()` twice — once in `initializeBot()` and again in the `ready` event handler.
- `orderInterpreter.js` lives in `src/ai/` but does game logic (movement validation, FOW checks). Wrong folder — reflected in the task below.

---

## What each file actually does (the reference you didn't have)

### src/game/

| File | What it actually does |
|---|---|
| `turnOrchestrator.js` | Coordinates a full turn: orders → movement → combat → FOW → victory. Exports `processTurn`, `applyCasualties`. |
| `battleInitializer.js` | Sets up battle state when both players ready. Imports riverCrossing for map data. Only called by gameInteractionHandler. |
| `battleEngine.js` | Thin coordinator: imports 8 combat sub-files and calls them in sequence. Exports `resolveCombat`, `resolveRangedAttack`. |
| `positionBasedCombat.js` | Does three things: (1) detect combat triggers by position, (2) calculate positional modifiers (flanking, elevation, river), (3) run the full movement phase. 909 lines. |
| `movementSystem.js` | Validates movement, creates missions, executes mission turns. Imports mapUtils, riverCrossing, formationStatus (all lazy). |
| `fogOfWar.js` | Visibility calculation, intel filtering, detection ranges. |
| `rangedCombat.js` | Weapon ranges, range modifiers, friendly fire risk. Imported by battleEngine and positionBasedCombat. |
| `morale.js` | Morale checks after combat. 90 lines. Imported only by battleEngine. |
| `briefingGenerator.js` | Generates the rich text briefing content + battlefield map strings. 986 lines. Imports callGroqAI and generateOfficerDialogue. |
| `briefingSystem.js` | Delivers briefings via Discord DMs. Imports briefingGenerator. Exports `sendInitialBriefings`, `sendNextTurnBriefings`. |
| `orderFeedback.js` | `generateFriendlyFireWarning()` — called once in dmHandler. 223 lines. |
| `victorySystem.js` | Clean, single purpose. Leave it. |
| `armyData.js` | Data constants. Leave it. |
| `eliteTemplates.js` | Data constants. Leave it. |
| `commandSystem/commanderManager.js` | Commander entity logic. Leave it. |

### src/ai/

| File | What it actually does |
|---|---|
| `orderInterpreter.js` | Natural language → validated game actions. 1199 lines. Has 4 parsing paths: ranged detection → keyword → Groq AI → keyword fallback. Also handles mission interruption. Wrong folder — should be src/game/. |
| `aiManager.js` | Provider init (Groq, OpenAI, Anthropic) + AI call functions. |
| `officerQA.js` | `callGroqAI()` (used by briefingGenerator) + officer Q&A functions. |
| `openingNarrative.js` | Opening narrative generation. Clean. Leave it. |

### src/bot/

| File | What it actually does |
|---|---|
| `dmHandler.js` | Routes DM messages to turn processing. Imports turnOrchestrator, orderInterpreter, briefingSystem, orderFeedback. |
| `interactionRouter.js` | Routes all Discord button/select interactions to the right handler. 88 lines, works fine. |
| `gameInteractionHandler.js` | Battle start flow: scenario selection, join, ready, initializes battle, sends initial briefings. 451 lines. |
| `lobbyInteractionHandler.js` | Lobby button interactions. 380 lines. |
| `armyInteractionHandler.js` | Army builder flow. Leave it. |

### src/game/combat/ (sub-files of battleEngine)

| File | What it does |
|---|---|
| `attackRatings.js` | Weapon attack ratings table + `calculateAttackRating()` |
| `defenseRatings.js` | Armor defense ratings table + `calculateDefenseRating()` |
| `chaosCalculator.js` | `calculateChaosLevel()` |
| `preparationCalculator.js` | `calculatePreparationLegacy()` |
| `culturalModifiers.js` | `getCulturalCombatModifiers()` |
| `damageAccumulation.js` | `applyDamageWithAccumulation()`, `getDamageAccumulationStatus()` |

### src/game/officers/

| File | What it does |
|---|---|
| `culturalNames.js` | Name pools + `generateOfficerName()` |
| `namingSystem.js` | `assignOfficerNames()`, `getOfficerRoster()`, `findOfficerByName()` |
| `rosterDisplay.js` | `formatOfficerRoster()`, `formatOfficersForBriefing()` |
| `veteranProgression.js` | Post-battle XP logic |
| `veteranWarnings.js` | Warning trigger detection |
| `eliteOfficerBootstrap.js` | Bootstrap elite officer DB records. Clean. Leave it. |
| `speakerSelection.js` | Pick speaker for turn. Clean. Leave it. |

---

## The consolidation tasks

Run these in order. Each one leaves the bot runnable.

---

### Task 0 — Delete dead files (30 minutes, zero risk)

No imports to update. Just delete.

```
src/game/battleInitializer.js.backup
src/ai/aiNarrativeEngine.js
src/ai/testNarrative.js
src/game/creativeOrders.js
src/game/culturalRules.js
src/game/formations.js
src/bot/interactionHandler.js
src/telemetry/metrics.js
src/game/combat/tests/   (move to src/tests/combat/ first)
```

**Verify:** `node src/index.js` starts without errors.

---

### Task 1 — Flatten combat sub-files into battleEngine.js (1–2 hours)

**Problem:** `battleEngine.js` imports 8 separate files. You can't read a combat resolution without jumping between 8 files.

**What to do:**

Inline the content of all 6 `combat/` files + `morale.js` + `rangedCombat.js` directly into `battleEngine.js` under labeled sections. Same function names, same logic — just one file.

Sections in order:
```
// ── WEAPON ATTACK RATINGS ──────────────────────────────
// ── DEFENSE RATINGS ────────────────────────────────────
// ── CHAOS CALCULATOR ───────────────────────────────────
// ── PREPARATION CALCULATOR ─────────────────────────────
// ── CULTURAL MODIFIERS ─────────────────────────────────
// ── DAMAGE ACCUMULATION ────────────────────────────────
// ── MORALE ─────────────────────────────────────────────
// ── RANGED COMBAT ──────────────────────────────────────
// ── MAIN RESOLUTION ────────────────────────────────────
```

Delete: `src/game/combat/` folder, `src/game/morale.js`, `src/game/rangedCombat.js`

No import updates needed in other files — `battleEngine.js` keeps the same public exports.

**Verify:** Submit a turn with adjacent units. Confirm combat resolves and casualties are applied.

---

### Task 2 — Move orderInterpreter.js to src/game/orders.js (1 hour)

**Problem:** `orderInterpreter.js` is in `src/ai/` but imports `movementSystem`, `fogOfWar`, `commandSystem` — it's game logic, not AI logic. It's also 1199 lines with no clear sections.

**What to do:**

1. Move `src/ai/orderInterpreter.js` → `src/game/orders.js`
2. Add section headers at the top of each parsing path:
```
// ── MISSION INTERRUPTION ───────────────────────────────
// ── RANGED ORDER DETECTION ─────────────────────────────
// ── KEYWORD FALLBACK PARSER ────────────────────────────
// ── AI ORDER PARSING (Groq) ────────────────────────────
// ── MAIN ENTRY POINTS ──────────────────────────────────
```
3. Keep all function names identical — no logic changes.

**Update these imports:**

| File | Change |
|---|---|
| `src/game/turnOrchestrator.js` | `require('../ai/orderInterpreter')` → `require('./orders')` |
| `src/bot/dmHandler.js` | `require('../ai/orderInterpreter')` → `require('../game/orders')` |
| `src/tests/commander/independentMovementTest.js` | Update path |
| `src/tests/commander/naturalLanguageTest.js` | Update path |
| `src/tests/commander/povCommanderTest.js` | Update path |
| `src/tests/movement/movementSandbox.js` | Update path |

**Verify:** Submit several orders: `"all units advance"`, `"cavalry flank east"`, `"shoot infantry"`, `"infantry to H14"`. Confirm they resolve without errors.

---

### Task 3 — Consolidate map into maps/mapUtils.js (1–2 hours)

**Problem:** `baseMapRS.js` has two `createMap()` exports (invalid JS), `riverCrossing.js` and `formationStatus.js` are imported lazily inside function bodies making them invisible, and map-related logic is in 3 places.

**⚠️ Known risk:** `mapUtils.js` has a lazy require for `baseMapRS.js` inside `generateOperationalMap()` that specifically loads the **20×20** operational map (not the 40×40). This is used for a zoomed-out overview view. Before deleting `baseMapRS.js`, decide: is `generateOperationalMap()` actively used? If yes, keep the 20×20 data in `mapUtils.js` alongside the 40×40. If no, remove the function. Do not delete `baseMapRS.js` until this is resolved.

**What to do:**

1. Check whether `generateOperationalMap()` is called anywhere in production: `grep -r "generateOperationalMap" src/`
2. If it's unused — remove the function from `mapUtils.js` entirely, then delete `baseMapRS.js`.
3. If it's used — copy both the 20×20 and 40×40 map data from `baseMapRS.js` into `mapUtils.js` before deleting it.
4. Move content of `maps/riverCrossing.js` into `mapUtils.js` under a section header:
```
// ── RIVER CROSSING & TERRAIN ───────────────────────────
```
5. Move content of `formations/formationStatus.js` into `mapUtils.js` under:
```
// ── FORMATION FOOTPRINTS ───────────────────────────────
```
6. Replace the two lazy `require('../formations/formationStatus')` calls inside `mapUtils.js` function bodies with direct function calls (they're in the same file now — no require needed).
7. Also replace the lazy `require('../fogOfWar')` inside `mapUtils.js` with a top-level import — fogOfWar is kept so this is safe.
8. Delete `maps/baseMapRS.js`, `maps/riverCrossing.js`, `formations/formationStatus.js`, `formations/` folder.

**Update these imports:**

| File | Change |
|---|---|
| `src/game/battleInitializer.js` | `require('./maps/riverCrossing')` → `require('./maps/mapUtils')` |
| `src/game/movementSystem.js` | lazy `require('./maps/riverCrossing')` → `require('./maps/mapUtils')` |
| `src/game/positionBasedCombat.js` | lazy `require('./formations/formationStatus')` → `require('./maps/mapUtils')` |
| `src/tests/movement/marchingColumnTest.js` | Update path |

**Verify:** Battlefield map renders in briefings. Operational map view (if kept) renders. A* pathfinding still works for movement. FOW still computes.

---

### Task 4 — Split positionBasedCombat.js into movement.js and fold into battleEngine (2–3 hours)

**Problem:** `positionBasedCombat.js` is 909 lines doing three unrelated things: running the movement phase, detecting combat triggers, and calculating positional modifiers.

**What to do:**

**⚠️ Internal dependency:** `processMovementPhase()` calls both `detectCombatTriggers()` and `buildCombatContext()` internally. Since `detectCombatTriggers` stays in `movement.js` (fine — same file), but `buildCombatContext` moves to `battleEngine.js`, `movement.js` will need to import `battleEngine.js`. That direction is safe — battleEngine does not import movement — but it must be explicit or `processMovementPhase` will call an undefined function.

1. Create `src/game/movement.js`
2. Move into `movement.js`:
   - `processMovementPhase()` — from positionBasedCombat
   - `detectCombatTriggers()` — from positionBasedCombat
   - All content of `movementSystem.js` (validateMovement, createMission, executeMissionTurn)
3. Move into `battleEngine.js` (already the combat file):
   - `calculatePositionalModifiers()` — from positionBasedCombat
   - `buildCombatContext()` — from positionBasedCombat
   - `calculateFlankingBonus()` — from positionBasedCombat
   - `calculateElevationAdvantage()` — from positionBasedCombat
   - `isCrossingRiver()` — from positionBasedCombat
4. At the top of `movement.js`, add: `const { buildCombatContext } = require('./battleEngine')`
5. Delete `positionBasedCombat.js` and `movementSystem.js`

**Update these imports:**

| File | Change |
|---|---|
| `src/game/turnOrchestrator.js` | `require('./positionBasedCombat')` → `require('./movement')` |
| `src/game/turnOrchestrator.js` | `require('./movementSystem')` → `require('./movement')` |
| `src/game/orders.js` | `require('./movementSystem')` → `require('./movement')` |
| `src/tests/movement/marchingColumnTest.js` | Update path |
| `src/tests/movement/movementSandbox.js` | Update path |

**Verify:** Units move correctly. March column footprints calculate. Missions persist across turns. Combat triggers when units become adjacent.

---

### Task 5 — Merge briefingGenerator into briefingSystem → src/bot/briefing.js (1–2 hours)

**Problem:** `briefingGenerator.js` (986 lines) and `briefingSystem.js` (254 lines) are tightly coupled — one generates content, the other sends it. Both should be one file. They also live in `src/game/` but their job is Discord delivery, not game logic.

**What to do:**

1. Create `src/bot/briefing.js`
2. Merge all content: briefingGenerator's functions become private, briefingSystem's delivery functions are the public API.
3. Public API:
   - `sendInitialBriefings(battle, player1Commander, player2Commander)`
   - `sendNextTurnBriefings(battle, playerSide)`
4. Delete `src/game/briefingGenerator.js` and `src/game/briefingSystem.js`

**Update these imports:**

| File | Change |
|---|---|
| `src/bot/gameInteractionHandler.js` | `require('../game/briefingSystem')` → `require('./briefing')` |
| `src/bot/dmHandler.js` | `require('../game/briefingSystem')` → `require('./briefing')` |
| `src/bot/commands/battle-status.js` | `require('../../game/briefingGenerator')` → `require('../briefing')` |

**Verify:** Both players receive initial WAR COUNCIL message. Map renders. Turn briefings work across multiple turns.

---

### Task 6 — Consolidate AI into aiManager.js (1 hour)

**Problem:** `aiManager.js` has provider init AND AI call functions mixed together. `officerQA.js` exports `callGroqAI` which briefingGenerator uses — this is a confusing name for what is really just a Groq provider call.

**What to do:**

**⚠️ Three callers of officerQA, not one:** The import table in the original plan only listed `briefing.js`. The actual callers are:

- `src/bot/briefing.js` — uses `callGroqAI` and (lazily) `getCulturalPersonality`
- `src/bot/dmHandler.js` — uses `answerTacticalQuestion` in `handleQuestion()`, called when a player types a question DM during battle. This is a live production path.
- `src/tests/briefings/test_ai_warning_generation.js` — uses `generateVeteranWarning` (test only, won't break production but will break the test)

1. Move all functions from `officerQA.js` into `aiManager.js`. Do NOT rename `callGroqAI` — keep the name so callers don't have to change.
2. Delete `src/ai/officerQA.js`

**Update these imports:**

| File | Change |
|---|---|
| `src/bot/briefing.js` | `require('../ai/officerQA')` → `require('../ai/aiManager')` |
| `src/bot/dmHandler.js` | `require('../ai/officerQA')` → `require('../ai/aiManager')` |
| `src/tests/briefings/test_ai_warning_generation.js` | Update path |

**Verify:** Officer dialogue appears in briefings. Veteran warnings still trigger. Send a tactical question DM during a battle and confirm an officer response is returned without errors.

---

### Task 7 — Merge officers folder from 7 files to 4 (1 hour)

**Problem:** 5 of the 7 officer files are under 200 lines and all belong to the same system.

**What to do:**

Merge `culturalNames.js` + `namingSystem.js` + `rosterDisplay.js` → `officers/officers.js`
Merge `veteranProgression.js` + `veteranWarnings.js` → `officers/progression.js`
Leave `eliteOfficerBootstrap.js` and `speakerSelection.js` as-is.

Delete the 5 files that were merged.

**Update imports in:** `briefing.js`, `dmHandler.js`, `turnOrchestrator.js`

**Verify:** Officer names appear in briefings. Veteran XP updates after battle. Veteran warnings fire.

---

## Target file structure after all tasks complete

```
src/
├── index.js
├── ai/
│   ├── aiManager.js         ← provider init + all AI calls
│   └── openingNarrative.js  ← keep as-is
├── bot/
│   ├── briefing.js          ← merged briefingGenerator + briefingSystem
│   ├── dmHandler.js
│   ├── interactionRouter.js
│   ├── gameInteractionHandler.js
│   ├── lobbyInteractionHandler.js
│   ├── armyInteractionHandler.js
│   ├── commandLoader.js
│   ├── commands/
│   └── utils/dmQueue.js
├── game/
│   ├── armyData.js
│   ├── battleEngine.js      ← all combat logic (inlined from 8 sub-files)
│   ├── battleInitializer.js
│   ├── commandSystem/
│   ├── eliteTemplates.js
│   ├── fogOfWar.js
│   ├── maps/
│   │   ├── mapUtils.js      ← all map logic (merged from 3 files)
│   │   ├── bridgeControl.js
│   │   ├── desertOasis.js
│   │   ├── forestAmbush.js
│   │   └── hillFortAssault.js
│   ├── movement.js          ← merged positionBasedCombat + movementSystem
│   ├── officers/
│   │   ├── officers.js      ← merged culturalNames + namingSystem + rosterDisplay
│   │   ├── progression.js   ← merged veteranProgression + veteranWarnings
│   │   ├── eliteOfficerBootstrap.js
│   │   └── speakerSelection.js
│   ├── orders.js            ← was ai/orderInterpreter.js
│   ├── turnOrchestrator.js
│   └── victorySystem.js
├── database/
│   ├── models/
│   └── setup.js
└── commanderName/
```

**File count: 51 → 31** (not counting tests, commands, or commanderName which are untouched)

---

## Rules for executing this

1. Do tasks in order. Each task leaves the bot runnable — verify before moving on.
2. When merging files, copy logic faithfully. No refactoring during this sprint.
3. Before deleting any file, grep for its name across the whole codebase. This plan lists known importers but lazy `require()` calls inside function bodies can be missed by static analysis.
4. The import update tables above are complete based on the audit. Trust them but verify with grep before each delete.
5. Do not fix the `initializeAI()` double-call in `index.js` or any other bugs noted above — document them, fix them after the sprint.

---

## Measure of success

After Task 0, you can read every file name and know what it does.
After Task 4, you can read a full turn resolution in two files: `turnOrchestrator.js` and `battleEngine.js`.
After all tasks, a new feature touches at most 2–3 files instead of 6–8.
