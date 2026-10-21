# Cohort: Stage 0 Spec (Recover, Rule, Clean Up)

Repo: `zpressley/cohort-discord-bot`
Author: Zach Pressley
Date: October 14, 2026

Stage 0 is housekeeping. It recovers work that was nearly lost, applies the rulings on the open design questions, and removes a few things the design no longer wants. It does not add features. Stage 1 (the engine as a pure package with an event log) starts only after Stage 0 is merged and tagged.

Read this whole file before changing anything.

## 1. Hard rules

These rules exist because a previous agent destroyed a working demo by running an unsanctioned cleanup. They are not negotiable.

1. Never delete a file. To retire code, `git mv` it into `archive/`. The only files you may remove outright are ones you created yourself during this stage.
2. Never force-push, rebase shared branches, or rewrite history.
3. Only touch the files each task names, plus tests for them. No repo-wide formatting, lint fixes, renames, dependency upgrades, or "while I'm here" cleanups. If you see something else that looks wrong, write it down in the stage report.
4. Do not rule on open design questions. Section 6 lists what is ruled. Anything not listed there is open.
5. When the code, the docs, and this spec disagree, stop work on that task, append the conflict to the contradiction log in `cohort-architecture-roadmap.md` (what conflicts, where, and the options), and move on to the next task. Do not pick a side.
6. One commit per task, with the task number in the message (for example `stage-0: task 4, strip attacker/defender`). The full test suite passes at every commit.
7. Work on a branch named `stage-0`. Open a pull request into `main` at the end. Do not merge it yourself.

## 2. Context you need

Cohort is an ancient-warfare strategy game (3000 BCE to 500 CE). Two commanders give natural-language orders, a deterministic engine resolves simultaneous turns, and AI only parses orders and narrates results. AI never decides outcomes.

Phase 1 (movement and map) is complete. Phase 2 (combat engine) is in progress. Work that was believed lost (the Phase 2 harness, the build plan, a map bug fix, and banners marking legacy docs) sits on branch `origin/claude/phase-4-completion-ad7yq3` and has never been merged.

Key docs: `cohort-combat-design.md` (locked combat design), `cohort-architecture-roadmap.md` (roadmap, architecture, scale conversion table, contradiction log), `PHASE2_COMBAT_PLAN.md`, `combat_design_parameters.md`. Legacy engine: `battleEngine.js`. Phase 1 source: `unitState.js`, `movementEngine.js`, `mapData.js`, `handler.js`. If any of these paths differ in the repo, use the real path and note the difference in the stage report.

Two newer design docs live outside the repo, "Cohort: Command Tent Interface Design" and "Cohort: Commanders, Memory and Delegation." You do not need them for Stage 0.

## 3. Tasks

Do them in this order.

### Task 0: Survey (read only)

Before changing anything, write `docs/stage-0/SURVEY.md` covering:

- The files on `origin/claude/phase-4-completion-ad7yq3` that are not on `main`, and the files changed on both.
- Every place `attacker` or `defender` appears in code, tests and docs (path and line).
- Every place the army builder's `training` field is read or written.
- Where `parseCoord` lives, what it does, and whether the branch's map bug fix already touches it.
- Which files carry a legacy banner on the branch.
- The current test command and whether the suite passes on `main` and on the branch.

Commit the survey. If the suite does not pass on `main`, stop and report; do not try to fix it.

### Task 1: Tags

On `main` as it stands now, create two annotated tags: `pre-stage-0` and `legacy-final`. Push both. These are the restore points if anything later in this stage goes wrong.

### Task 2: Recover the branch

Create `stage-0` from `main` and merge `origin/claude/phase-4-completion-ad7yq3` into it. Resolve conflicts only where the resolution is mechanical (both sides added different lines, whitespace, ordering). For any conflict where the two sides make different decisions, keep the branch's version, append the conflict to the contradiction log, and list it in the stage report. The suite must pass after the merge.

### Task 3: Archive legacy code

Create `archive/` with a `README.md` that says what is in it, why it was retired, the date, and that the `legacy-final` tag holds the pre-archive state. Then `git mv` into `archive/` only these:

- `battleEngine.js`
- Files the recovered branch marks with a legacy banner

Nothing else moves, even if it looks dead. Put candidates in the stage report instead. Fix any imports that break because of the move only if the importing file is itself being archived; if live code imports an archived file, stop and log it.

### Task 4: Strip attacker and defender

The engine has no attacker or defender roles. Units belong to Side 1 or Side 2. Every combat advantage comes from position and circumstance: elevation, terrain, ambush, chaos, preparedness, and a unit's own movement into contact (charge momentum belongs to the unit that moved, not to a role).

1. Replace role concepts in engine code with `side` (1 or 2) plus the positional modifiers that already exist. Do not invent new modifiers. If removing a role leaves a modifier with no positional source, stop and log it.
2. Update tests. Where an expected value changes only because roles were removed, update it and list each change in the stage report with the old value, the new value, and the reason.
3. Remove role language from `cohort-combat-design.md`, `PHASE2_COMBAT_PLAN.md` and `combat_design_parameters.md`.
4. Add a guard test that fails if the words `attacker` or `defender` (any case) appear in engine source or tests. Exclude `archive/` and `docs/DECISIONS.md`. The test's failure message should say: "Attacker/defender roles were removed by design. See docs/DECISIONS.md."

This has come back in three or four builds. The guard test is what stops it from coming back again, so it is required.

### Task 5: Remove the training purchase

Remove the `training` field from the army builder (input, validation, storage, and any cost calculation). Move any code that exists only to support it into `archive/`. Training tier still exists; it comes from the unit's quality tier (Levy, Militia, Tribal Warriors, Professional, Veteran Mercenaries, Elites) and nothing else. Update tests.

### Task 6: Fix `parseCoord`

The eastern quarter of the 40×40 map is currently unreachable. Fix it so every tile on the current map parses and round-trips, and add a test that loops over every coordinate on the map. If the branch's map bug fix already does this, verify it with the test and say so in the report.

Do not hardcode 40 anywhere new; read the map size from the map data. The map is going to get much bigger in Stage 1, and the coordinate format will change then. Do not start that change now.

### Task 7: Tribal Warriors stats

Check the unit stat table against the ruling in Section 6. Tribal Warriors cost the same as Militia and fight the same as Militia, plus a morale bonus (they fight longer and rout less), and they are only available to certain factions. If the table disagrees, fix the table and its tests. If the code that applies the morale bonus or the faction gate is missing, log it; do not build it in this stage.

### Task 8: Reconcile the damage system

`combat_design_parameters.md` describes a damage-accumulation bucket whose formula is inverted compared with its own worked examples. The recovered branch also contains tested damage work from a later rebuild.

1. Read the branch's damage code and its tests first. They are the starting point. Do not re-derive the system from the doc.
2. If the code, its tests and the doc's worked examples agree, fix the formula in the doc to match them.
3. If the code or tests disagree with the worked examples, stop, log the disagreement with both versions, and leave the code as it is.

### Task 9: Small doc fixes

- One doc describes the game as "naval warfare." Correct it to ancient land warfare.
- Create `docs/DECISIONS.md` containing Section 6 of this spec, unedited.
- Copy this spec to `docs/stage-0/STAGE_0_SPEC.md`.

### Task 10: Stage report and pull request

Write `docs/stage-0/REPORT.md` with: what each task did, every test expectation you changed and why, everything you added to the contradiction log, anything you noticed and deliberately did not touch, and archive candidates you did not move. Open the pull request from `stage-0` into `main` with the report as its description, and propose the tag `stage-0-complete` for after Zach merges it.

## 4. Out of scope

Do not start any of these, even partially: extracting the engine into a pure package, the event log, enlarging the map, changing the coordinate format, officer death mechanics, commander personalities or memory, the order parser, any web or mobile UI, or changes to Discord behavior beyond what the tasks above require.

## 5. Done means

- `pre-stage-0` and `legacy-final` tags exist on the old `main`.
- The recovered branch is merged into `stage-0` and the suite passes.
- No engine source or test contains `attacker` or `defender`, and the guard test enforces it.
- The `training` field is gone from the army builder.
- Every tile on the current map parses and round-trips.
- `docs/DECISIONS.md`, `docs/stage-0/SURVEY.md`, `docs/stage-0/REPORT.md` and `archive/README.md` exist.
- A pull request is open and nothing was deleted.

## 6. Rulings (copy to docs/DECISIONS.md)

Ruled by Zach Pressley, October 14, 2026, unless marked as proposed. Proposed items are recommendations Zach has not yet confirmed. Treat them as open.

**Q1. Movement rate vs. round length.** With 25m tiles, the 40×40 map is only 1 km square, and formed infantry covers about half of it in one 10-minute order. Ruling: keep 25m tiles and make the map much bigger. The game is no longer bound by Discord's limits. Exact size is set in Stage 1. *Proposed:* map size is a per-scenario setting starting around 200×200 (5 km), and the engine uses numeric x,y coordinates internally while players mostly refer to landmarks.

**Q2. Old code archival.** Tag `legacy-final`, then move retired code into `archive/` on `main` with a README. Nothing is deleted.

**Q3. Officer death rate.** *Proposed:* tie risk to exposure instead of a flat rate (low while holding, higher in melee, highest when the unit routs or is overrun), with wounded or captured coming before death in most cases. Playtest targets of roughly 1 in 20 to 30 battles on a winning side and 1 in 5 on a side that routs.

**Q4. Weapon effectiveness.** The engine supports both multipliers and flat bonuses, because having both gives more ways to weight the game. Values come from playtesting. What must be fixed in the spec is how and when each applies. *Proposed:* flat bonuses add to the base value first, then multipliers apply to that total, always in that order.

**Q5. Attacker and defender.** Removed permanently. Two units fighting are both attacking; neither role means anything. Units are Side 1 and Side 2. Advantage comes from position and circumstance: a unit coming down a hill gains, a unit in a worse position is penalized, an ambushed unit is penalized, and chaos and preparedness apply as already designed. Charge momentum belongs to the unit that moved into contact. A guard test keeps role language out of the engine.

**Q6. Unit size and tile capacity.** Armies run from a few hundred to about 1,000 per side. Combat math must be scale-invariant: casualties work as proportions, so 300 against 300 plays the same as 25 against 25, while casualty rates stay realistic and every clash feels like it matters. Units stay small enough that each one's commander has a visible effect; very large units would need several commanders and blur that.

**Q7. Tribal Warriors.** A faction-specific unit (for example, Germanic tribes). Same cost and same fighting ability as Militia, plus a morale bonus so they fight longer and rout less. Effectively fiercely loyal militia.

**Q8. The `training` field.** Removed from the army builder for now. Training tier comes from the quality ladder. Buying training may come back later as a purchase.

**Damage system.** The formula in `combat_design_parameters.md` is inverted against its worked examples. The tested damage rebuild on the recovered branch is the starting point. Where code, tests and worked examples agree, fix the doc to match. Where they disagree, log it for Zach.

**Not yet ruled.** Whether commander quality and unit quality are separate stats (proposed: separate, with the quality ladder governing how a unit fights and the commander governing how deep an order it can execute), and the player-facing coordinate format.
