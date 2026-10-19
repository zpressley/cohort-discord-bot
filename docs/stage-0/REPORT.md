# Stage 0 Report

Branch `stage-0`, based on `main` at `7ff4c0a`. Date: 2026-10-19.
Spec: [`STAGE_0_SPEC.md`](STAGE_0_SPEC.md). Survey: [`SURVEY.md`](SURVEY.md).

## Summary

- **The "lost" branch was never lost.** `origin/claude/phase-4-completion-ad7yq3`
  is already an ancestor of `main`, with phases 2–7 built on top of it. Task 2
  was a no-op, and several tasks were already partly done under the
  2026-08-30 rulings.
- **Done:** survey; local restore tags; 21 legacy docs archived; role
  language removed from the engine with a guard test; training purchase
  removed from the live Discord builder; every tile verified to parse and
  round-trip; `DECISIONS.md` and the spec copy added.
- **Blocked or logged, not changed:** `battleEngine.js` can't be archived
  because the live bot imports it (S0-1). The spec's numeric sides
  (S0-3), the live bot's Tribal Warriors tables (S0-5, S0-6) and the
  damage-doc reconciliation (S0-7) all need a decision.
- **Tags not pushed.** The session's git proxy refuses tag pushes (HTTP
  403). Branch pushes work. See Task 1.
- **No test expectation changed value.** 252 tests pass with `npm test` (242
  before), and `npm run test:core` passes at every commit.

## Test suite

"The full suite" here means `npm test` (phases 2–7, `node --test`) plus
`npm run test:core` (the legacy core test CI runs). Both passed at every
Stage 0 commit.

| Commit | `npm test` |
|---|---|
| `main` (before) | 242/242 |
| task 4 (+ role guard) | 243/243 |
| task 5 (+ training guard, 2 tests) | 245/245 |
| task 6 (+ every-tile, 7 tests) | 252/252 |
| tasks 7–10 | 252/252 |

## Task by task

### Task 0: Survey
`docs/stage-0/SURVEY.md`, plus `survey-role-words.txt` (all 765
attacker/defender lines with path:line). Main passed, so work continued.

Path differences from the spec:

| Spec | Real path |
|---|---|
| `cohort-architecture-roadmap.md` | `docs/design/architecture-roadmap.md` (contradiction log: §8) |
| `cohort-combat-design.md` | `docs/design/combat-design.md` |
| `PHASE2_COMBAT_PLAN.md` | `docs/PHASE2_COMBAT_PLAN.md` |
| `combat_design_parameters.md` | `docs/Context/Old Context/combat_design_parameters.md` |
| `battleEngine.js` | `src/game/battleEngine.js` |
| phase 1 source | `src/phase1-movement/` |

### Task 1: Tags
Annotated tags `pre-stage-0` and `legacy-final` were created locally on
`7ff4c0a` (old `main`). **Pushing them failed:** the session's git proxy
returns HTTP 403 for tag refs while allowing branch pushes. `main` itself is
untouched, so `7ff4c0a` is still the restore point. To publish the tags from
any clone with push rights:

```
git tag -a pre-stage-0 7ff4c0a -m "Restore point: main before Stage 0"
git tag -a legacy-final 7ff4c0a -m "Legacy code and docs before Stage 0 moved anything into archive/"
git push origin pre-stage-0 legacy-final
```

### Task 2: Recover the branch
`git merge origin/claude/phase-4-completion-ad7yq3` → "Already up to date."
The branch tip `7bbd7bb` is an ancestor of `main`, so there were no
conflicts and no commit. Its contents (harness, build plan, `parseCoord`
fix, legacy banners) were already on `main`.

### Task 3: Archive legacy code
`archive/README.md` created. The 21 files carrying the branch's legacy
banner moved with `git mv`, keeping their original paths under `archive/`
(listed in `SURVEY.md` §5 and the archive README). No code imports any of
them.

`src/game/battleEngine.js` **did not move**: the live bot imports it
(`turnOrchestrator.js`, `movement.js`, `orders.js`) and so does CI's
`test:core`. Logged as **S0-1**. The older `legacy/` + `docs/historical/`
plan is logged as **S0-2**.

### Task 4: Strip attacker and defender
The new engine had no role *logic*. It already resolved both directions of
an exchange at once and gave charge momentum to the unit that moved into
contact (`resolve.js` `charging` map). What existed was naming and comments,
and those were rewritten:

- One direction of an exchange is `striker` → `target` (`damage.casualtiesFrom`,
  `ratings.effectivenessAgainst`). `chargeMultiplier`'s flag is `enemyBraced`.
  The placeholder resolver uses `a`/`b`.
- Scenario and test comments name the position: "Blue, holding The
  Crownhill", "the side crossing", "the side on the crest".
- Files: `damage.js`, `ratings.js`, `resolve.js`, `tables.js`, `runner.js`,
  `placeholderResolver.js`, `ford-crossing.js`, `hill-assault.js`,
  `phase4-integration/battle.js`, `phase7-hotseat/scenarios.js`, and tests
  `balance.assertions`, `damage`, `ratings`, `scenarios`, `phase4 battle`.
- Docs: `combat-design.md`, `PHASE2_COMBAT_PLAN.md`,
  `combat_design_parameters.md` (examples now say "Unit A / Unit B" and
  "striker / target").
- Every modifier still has a positional source: charge (moved into
  contact), prepared (held), terrain/elevation (tile), flanking (number of
  engagements), braced (weapon). None was orphaned.
- **Guard test:** `src/phase2-combat/tests/no-roles.guard.test.js`. It scans
  every file in `src/phase*/` plus the three combat docs, and fails with
  "Attacker/defender roles were removed by design. See docs/DECISIONS.md."
  followed by each offending path:line. It excludes `archive/`,
  `docs/DECISIONS.md` and itself, and asserts it scanned more than 50 files.
  It lives in phase 2's tests, so CI's `test:phase2` runs it. I checked it
  by planting a word in `src/phase3-movement/index.js`; it failed as
  expected.
- **Not done:** `side` as the numbers 1 and 2. The engine's sides are labels
  (`'red'`/`'blue'`); logged as **S0-3**. The wording of the 2026-08-30 Q5
  ruling is logged as **S0-4**.

**Scope call:** I took "engine source and tests" to mean `src/phase*/`. The
live legacy stack (`src/game/`, `src/bot/`, `src/tests/`, about 380 lines)
still uses role language and is outside the guard. It is slated for
`archive/`, and rewording it would touch live Discord code no task names.
If you meant the guard to cover more, widen its file list.

### Task 5: Remove the training purchase
The headless phase 7 builder never had the field. The **live Discord
builder** still sold it as step 6 (+2/+4/+6 SP), and no combat code read it.

- `src/bot/armyInteractionHandler.js`: the shield step now finishes the unit
  directly. `finalizeUnit` is the non-training half of the old
  `handleTrainingSelection`, unchanged apart from dropping the training cost
  and the "Training:" line. The `training-selection` route is gone.
- `showTrainingStep`, `handleTrainingSelection`, `getAvailableTrainingTypes`
  and `getTrainingCost` moved verbatim to
  `archive/training-purchase/armyInteractionHandler.training.js`.
- `src/bot/commands/build-army.js`: no training in the army list or in
  `calculateUnitCost`.
- `src/game/battleInitializer.js`: no longer copies `unit.training` into
  battle state. `battleEngine.js:1076` already defaults to `'none'` when the
  field is absent, and nothing downstream reads that value, so battle
  outcomes don't change.
- New test `src/phase7-army/tests/no-training-purchase.test.js` (2 tests):
  those three files don't touch the field or route a training step, and the
  handler still loads. The regex matches 6/3/1 lines in the pre-Stage-0
  versions, so it would have caught them.

### Task 6: `parseCoord`
**The branch's fix already works.** `src/phase1-movement/movementEngine.js`
uses bijective base-26 columns. The live bot's `src/game/maps/mapUtils.js`
copy never had the bug. No parser change.

- `mapData.js` now exports `MAP_SIZE = { width: 40, height: 40 }`, the one
  place that number is written for new code.
- New `src/phase2-combat/tests/every-tile.test.js` (7 tests) walks
  `MAP_SIZE` for both copies. It checks that every tile round-trips, that no
  two tiles share a name, that the east column is reachable, and that
  off-map tiles are rejected. Against the pre-fix parser (`81733df`) it
  fails 3 of 7.

### Task 7: Tribal Warriors
The engine table (`QUALITY_TIERS.tribal_warriors`) matches Q7: cost, attack,
defense, push, stamina and size all equal Militia. Morale is 3 against
Militia's 1, applied by `ratings.moraleResistance`. The faction gate is
enforced in `phase7-army/builder.js`. No table change. The Q7 test now also
pins `push` and `size`.

The live Discord bot's tables disagree in five places (**S0-5**). The engine
table's heavy-armour restriction is logged as **S0-6**. The morale bonus and
the faction gate exist in the new engine. The live bot has neither (S0-5).
Neither was built, per the spec.

### Task 8: Damage system
Code and worked examples disagree, so nothing changed (**S0-7**). The doc's
formula and its worked examples agree with each other; both turn
|attack − defense| into casualties regardless of sign. The tested engine
uses a fraction of current strength and pins the opposite behaviour. The
tested damage code is on `main` (phase 2 step 3), not on the recovered
branch.

### Task 9: Small doc fixes
- `docs/DECISIONS.md`: Section 6, unedited.
- `docs/stage-0/STAGE_0_SPEC.md`: the full spec.
- **"Naval warfare": nothing to correct.** The line was in
  `docs/cohort-bot-docs.md` ("A Discord bot for managing tactical naval
  warfare games…"), which commit `55d2926` (2025-10-24) removed from the
  repo. No copy exists in the tree. Restoring a deleted file to fix one line
  seemed beyond the task. Say so if you want it restored into `archive/`
  with the fix.

## Test expectations changed

**None changed value.** Three test names and three assertion messages were
reworded to drop role words:

| File | Old name | New name |
|---|---|---|
| `phase2-combat/tests/scenarios.test.js` | hill-assault: the defenders hold the crest | hill-assault: the side on the crest holds it |
| `phase2-combat/tests/scenarios.test.js` | ford-crossing: the attacker is caught in the water and loses | ford-crossing: the side crossing is caught in the water and loses |
| `phase4-integration/tests/battle.test.js` | a defender shoved off a hill loses the high ground — positionally | a unit shoved off a hill loses the high ground — positionally |

Assertions added (not changed): Q7 test now checks `push` and `size`; plus
the new guard, training and every-tile tests above.

## Added to the contradiction log

All are in `docs/design/architecture-roadmap.md` §8, under "Stage 0
(2026-10-19)", each with options.

| # | Topic | Outcome |
|---|---|---|
| S0-1 | `battleEngine.js` is imported by live code | not archived |
| S0-2 | 2026-08-30 Q2 (`legacy/`, `docs/historical/`, at Phase 7) vs 2026-10-14 Q2 (`archive/` now) | followed the newer ruling; confirm |
| S0-3 | Spec says `side` is 1 or 2; engine sides are labels | not changed |
| S0-4 | 2026-08-30 Q5 wording ("the unit that entered contact is the attacker") | engine reworded; old log text left |
| S0-5 | Live bot's Tribal Warriors: 4 SP, attack 3, weaker quality bonus, ranked below Militia, no faction gate, no morale bonus | not changed |
| S0-6 | Engine table gives Tribal a heavy-armour restriction Militia lacks | not changed |
| S0-7 | Damage doc vs tested engine | not changed |
| S0-8 | 2026-08-30 Q1 (elastic time) and Q3 (death table, built in Phase 6) vs the 2026-10-14 rulings | not changed; for Stage 1 |

## Noticed, deliberately not touched

- **CI runs only `test:core` and `test:phase2`.** Phases 3–7 (including the
  new training guard in `phase7-army`) don't run in CI. The role guard and
  every-tile test are in phase 2, so CI does run those.
- **Roadmap is partly stale.** §9.7 still says main has the `parseCoord`
  bug. §9.1 refers to the naval doc, which is gone. §7 describes the
  `legacy/` + `docs/historical/` plan. Left as written; this stage only
  appends to the log.
- **`/build-army` description** says "6-step Supply Point system"; it's now
  5 steps. Changing it means re-registering slash commands.
- **Armies built before this change** may carry `unit.training` and a
  `usedSP` that includes its cost. The list display now prices units
  without it, so an old in-memory composition could show a lower per-unit
  cost than its running total.
- **Live bot unit size is 400** (`armyData.js`), against the ~100 of the
  2026-08-30 Q6 ruling and the new engine.
- **`movementEngine.js` still hardcodes 40** in its bounds check and
  `getAdjacentCoords`, and `coordToString` handles at most two letters. Both
  are fine for the current map and are Stage 1's coordinate work.
- **Duplicate landmark aliases** ("the ridge" always resolves to Shepherd's
  Ridge) are pinned but not fixed, from the branch's own findings. That
  needs a design decision.
- **Archived docs' banner links** (for example, `docs/PHASE2_COMBAT_PLAN.md`)
  are relative to their old location and no longer resolve from `archive/`.
- **Empty directories** `docs/architecture/`, `docs/guides/`, `docs/tasks/`
  remain on disk after the moves; git doesn't track them.

## Archive candidates not moved

- `src/game/battleEngine.js` (S0-1).
- Legacy test scripts no npm script runs: `src/tests/combat/*`,
  `src/tests/balance/combatBalanceTest.js`, `src/tests/briefings/*`, and the
  root `test_ambush_scenarios.js`, `test_full_battle.js`,
  `test_veteran_warnings.js`.
- Legacy docs without the banner that still describe the old engine:
  `docs/game-logic/cohort_tactical_systems.md`, `docs/ai-systems/`,
  `docs/discord-bot/`, the rest of `docs/Context/Old Context/` (except
  `combat_design_parameters.md`, which the spec treats as a key doc),
  `docs/Context/core_8_cultures.txt`, `docs/Context/final_20_cultures_complete.txt`.
  The roadmap marks the culture files as live data sources, so check before
  moving them.
- One-off scripts: `src/checkBattles.js`, `src/checkDB.js`, `commit.sh`.
- `src/phase2-combat/harness/placeholderResolver.js` is explicitly not the
  combat engine, but `run.js` and `harness.test.js` still use it. Keep it
  for now.

## Follow-up: resolutions

After review, Zach confirmed the spec was a design direction rather than a
full picture of the repo, and resolved the log entries (roadmap §8, "Stage 0
resolutions"). In the follow-up commit:

- S0-6: Tribal Warriors' heavy-armour restriction is dropped, and the Q7
  test now pins the same kit as Militia.
- S0-7: the bucket section of `combat_design_parameters.md` is marked
  superseded in place.
- Every other entry is resolved with no code change.

## Proposed tag

After this PR is merged: `stage-0-complete` on the merge commit.
