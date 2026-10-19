# Stage 0 Survey

Read-only survey taken before any Stage 0 change. Base: `main` at `7ff4c0a`
("Hotseat CLI: play the game at one keyboard"). Date: 2026-10-19.

## Headline: the recovery branch is already merged

`origin/claude/phase-4-completion-ad7yq3` (tip `7bbd7bb`) is an **ancestor of
`main`**. `git merge-base main <branch>` returns the branch tip itself. The
spec says this work "has never been merged", but it was, and fifteen commits
sit on top of it on `main` (2026-08-30 to 2026-08-31):

- the canonical design docs and the Q1–Q8 rulings of 2026-08-30 (`ea96d00`)
- Phase 2 combat engine, balance harness and scenario fixes (`47192b0` .. `efa37f5`, tag `phase-2-complete`)
- Phases 3, 4, 5, 6 (tags `phase-3-complete` .. `phase-6-complete`)
- Phase 7 headless army builder under rulings Q6–Q8 (`eebb503`)
- Hotseat CLI (`7ff4c0a`)

The branch tip is also tagged `phase-2-harness-recovered` and is the head of
PR #1. Consequences for the tasks:

- Task 2 (merge the branch) is a no-op. Nothing to resolve.
- Task 6 (`parseCoord`) was fixed by the branch and is already on `main`.
- Task 8 talks about "the branch's damage code". The branch only had a
  placeholder resolver; the tested damage rebuild landed on `main` after it
  (`src/phase2-combat/combat/damage.js`).
- Tasks 5 and 7 were partly done by `main`'s phase 7 and phase 2 work under
  the 2026-08-30 rulings.

## Path differences from the spec

| Spec says | Real path |
|---|---|
| `cohort-architecture-roadmap.md` | `docs/design/architecture-roadmap.md` (contradiction log is §8) |
| `cohort-combat-design.md` | `docs/design/combat-design.md` |
| `PHASE2_COMBAT_PLAN.md` | `docs/PHASE2_COMBAT_PLAN.md` |
| `combat_design_parameters.md` | `docs/Context/Old Context/combat_design_parameters.md` |
| `battleEngine.js` | `src/game/battleEngine.js` |
| `unitState.js`, `movementEngine.js`, `mapData.js`, `handler.js` | `src/phase1-movement/` |
| the "naval warfare" doc | `docs/cohort-bot-docs.md`, removed from the repo in commit `55d2926`; not on `main` |

## 1. Branch vs main

- Files on the branch that are not on `main`: **none**.
- Files changed on both sides since the merge base: **none** (the merge base
  is the branch tip, so the branch side has no changes).
- Files on `main` that are not on the branch: 46 (the phase 2–7 work).
  `git diff --stat <branch> main`: 57 files, +8930 / −70.

## 2. `attacker` / `defender` occurrences

765 matching lines across the repo. The full path:line list is in
[`survey-role-words.txt`](survey-role-words.txt). Grouped:

**New engine (`src/phase*`), 105 lines, all naming or comments. No logic
branches on a role.** The engine resolves both directions of every exchange
simultaneously; `casualtiesFrom(attacker, defender)` is one direction of that
exchange, and charge momentum is already tied to "the unit that moved into
contact" (`resolve.js` `charging` map, `chargeRoundFor`).

| File | Lines |
|---|---|
| `src/phase2-combat/combat/damage.js` | 20, 26, 42–52, 57, 70–71, 171–172 |
| `src/phase2-combat/combat/ratings.js` | 92, 102–104, 129–136, 241 |
| `src/phase2-combat/combat/resolve.js` | 110–111, 118, 332 |
| `src/phase2-combat/combat/tables.js` | 244, 246, 341, 413 |
| `src/phase2-combat/harness/placeholderResolver.js` | 31–42 |
| `src/phase2-combat/harness/runner.js` | 39 |
| `src/phase2-combat/scenarios/ford-crossing.js` | 1, 3, 6, 15 |
| `src/phase2-combat/scenarios/hill-assault.js` | 1, 6, 7, 10, 12, 14 |
| `src/phase2-combat/tests/balance.assertions.test.js` | 150, 175 |
| `src/phase2-combat/tests/damage.test.js` | 31–36, 72, 84, 90–94, 122–135, 287 |
| `src/phase2-combat/tests/ratings.test.js` | 113, 116 |
| `src/phase2-combat/tests/scenarios.test.js` | 16, 18, 19, 88, 123, 140, 147, 150, 153 |
| `src/phase4-integration/battle.js` | 102, 262 |
| `src/phase4-integration/tests/battle.test.js` | 58, 178 |
| `src/phase7-hotseat/scenarios.js` | 12 |

**Docs Task 4 names:** `docs/design/combat-design.md` (1),
`docs/PHASE2_COMBAT_PLAN.md` (6),
`docs/Context/Old Context/combat_design_parameters.md` (18).

**Roadmap:** `docs/design/architecture-roadmap.md` (7), including the
2026-08-30 Q5 ruling text "The unit that entered contact this turn is the
attacker".

**Legacy code that still runs the live Discord bot** (`src/game/`, `src/bot/`,
`src/commanderName/`): `battleEngine.js` (193), `turnOrchestrator.js` (35),
`movement.js` (19), and one line each in `officers/progression.js`,
`maps/mapUtils.js`, `maps/bridgeControl.js`, `titles/titleDefinitions.js`,
`commands/create-game.js`.

**Legacy tests and scripts:** `src/tests/combat/*` (123),
`src/tests/core/coreEngine.test.js` (5, run by CI as `test:core`),
`test_ambush_scenarios.js` (19).

**Other legacy docs:** about 300 lines across `docs/game-logic/`,
`docs/architecture/`, `docs/ai-systems/`, `docs/Context/`, `docs/guides/`,
`docs/discord-bot/`, `WARP.md`.

## 3. The army builder's `training` field

There are two army builders.

**Live Discord builder (legacy) still has the training purchase:**

- `src/bot/armyInteractionHandler.js`: 110–111 (routes `training-selection`),
  747 (shield step hands off to the training step), 900–940
  `showTrainingStep` (input), 942–990 `handleTrainingSelection` (writes
  `unit.training`, adds its cost, prints it), 993–1043
  `getAvailableTrainingTypes`, 1045–1053 `getTrainingCost`.
- `src/bot/commands/build-army.js`: 149–150 (display), 233 (cost).
- `src/game/battleInitializer.js`: 294 (copies `unit.training` into battle state).
- `src/game/battleEngine.js`: 1076 (reads it, defaults to `'none'` when absent).
- Legacy test fixtures write it: `src/tests/core/coreEngine.test.js:23`,
  `src/tests/balance/combatBalanceTest.js:153`, `src/tests/combat/*`.
- No database model declares it; armies are stored as JSON, so saved armies
  may carry it.

**Phase 7 headless builder (`src/phase7-army/`) has no training field.**
`builder.test.js:34–37` pins that a pick carrying the legacy field prices
identically to one without. `ratings.test.js:103–106` pins that no quality
tier carries a training value.

`TRAINING_ATTACK_BONUSES` / `TRAINING_DEFENSE_BONUSES` in `battleEngine.js`
are keyed by quality tier, not by the purchase.

## 4. `parseCoord`

Two copies:

- `src/phase1-movement/movementEngine.js:11` (new engine). Parses `"W6"` to
  `{row, col}` using bijective base-26 columns. **The branch's fix is this
  function** (commit `7ed8a74`): the earlier copy collapsed AA–AN onto A–N.
  Bounds are hardcoded to 40 (lines 31, 62), as is `coordToString`'s
  two-letter limit.
- `src/game/maps/mapUtils.js:24` (legacy, live bot). Same algorithm, never
  had the bug.

`src/phase2-combat/tests/phase1-movement.characterization.test.js:15–33`
already round-trips all 1,600 tiles of the phase 1 copy, but loops to a
hardcoded 40. `src/phase1-movement/mapData.js` does not export a map size.

## 5. Legacy banners on the branch

The branch added the banner "Past build notes, this project has moved in new
direction, use for reference only not concrete action plan" to 21 files. All
21 still carry it on `main`:

```
CONSOLIDATION.md
WARP.md
docs/Context/Old Context/cohort_master_index.md
docs/Context/Old Context/cohort_task_list.md
docs/Context/Old Context/commander_implementation.md
docs/Context/Old Context/name_pool_expansion.md
docs/Context/Old Context/warp_context_doc.md
docs/Context/PHASE1_IMPLEMENTATION_PLAN.md
docs/Context/RANGED_COMBAT_IMPLEMENTATION.md
docs/Context/cohort-implementation-guide.md
docs/Context/warp-implementation-instructions.md
docs/README.md
docs/architecture/cohort_architecture.md
docs/architecture/cohort_data_maps.md
docs/architecture/cohort_function_ref.md
docs/architecture/cohort_variable_index.md
docs/game-logic/cohort_game_logic.md
docs/game-logic/cohort_workflows.md
docs/guides/cohort_implementation_guide.md
docs/guides/cohort_system_map.md
docs/tasks/CMB-007-BACKLOG.md
```

No code imports any of them.

`src/game/battleEngine.js` is **imported by live code**:
`src/game/turnOrchestrator.js:7`, `src/game/movement.js:278, 920`,
`src/game/orders.js:78, 564`, plus legacy tests
(`src/tests/core/coreEngine.test.js:6`, which CI runs, and three files in
`src/tests/combat/`, `src/tests/balance/combatBalanceTest.js:4`).

## 6. Tests

- `npm test` runs `node --test` over `src/phase2-combat` .. `src/phase7-hotseat` tests.
- CI (`.github/workflows/ci.yml`) runs `npm run test:core` (legacy
  `coreEngine.test.js`) and `npm run test:phase2`. It does **not** run the
  phase 3–7 suites.
- `main`: `npm test` **242/242 pass**; `npm run test:core` passes.
- Branch: `npm test` (= `test:phase2` there) **35/35 pass**; `npm run test:core` passes.

For Stage 0, "the full suite" means `npm test` plus `npm run test:core`.

## 7. Other facts the later tasks depend on

- **Tribal Warriors** (`src/phase2-combat/combat/tables.js:58–70`): cost 5,
  attack 2, defense 2, push 2, stamina 75, all equal to Militia. Morale 3 vs
  Militia's 1. `factionGated: true`. One more difference: `restrictions:
  ['heavy_armor']` where Militia has none. The morale bonus is applied
  (`ratings.moraleResistance`). The faction gate is enforced
  (`src/phase7-army/builder.js:51–53`, `data.js` `TRIBAL_CULTURES`).
- **Damage bucket** (`combat_design_parameters.md` lines 263–340): the formula
  and the worked examples agree with each other. Both turn |attack − defense|
  into casualties regardless of sign, so Attack 2 vs Defense 8 deals 30 a turn
  and Attack 8 vs Defense 5 deals 15. Roadmap §9.6 already flags this. The
  tested engine (`damage.js`) does not use a bucket at all: casualties are a
  fraction of the target's current strength, scaled by attack ÷ (attack + defense).
  `damage.test.js:72–84` pins that a dominant unit out-kills a hopeless
  one, the opposite of the doc's worked examples.
- **Prior rulings on `main`** (roadmap §8, 2026-08-30) differ from the new
  Section 6 on Q1, Q2, Q3 and Q5. See REPORT.md for how this was handled.
