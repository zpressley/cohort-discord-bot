# Stage 1 Report

Branch `stage-1`, built on `stage-0`. Date: 2026-10-20.
Plan: [`PLAN.md`](PLAN.md).

## Summary

- **The engine has one home and is pure.** `src/engine/` holds the map,
  movement, combat, battle, orchestrator, veterans and army code. A guard
  test fails if anything in it reads the clock, `Math.random`, files, the
  network, Discord, an AI SDK or the database, or imports from outside
  `src/engine/` and `src/data/`.
- **The map is a value, and any size works.** Crownhill (40×40) is now plain
  data in `src/data/maps/`. The battle carries its map, and nothing in the
  engine assumes 40. A full battle runs on a generated 80×80 map, the 2 km
  size, with units fighting, crossing a river and fleeing to the far edge.
- **Positions are `{ x, y }`.** Labels like `D4` are still accepted from
  scenario files, orders and the hotseat CLI, and are translated on the way
  in. Labels work for any width (`CB80` is the far corner of an 80×80 map).
- **Events are data.** Combat exchanges are structured events instead of
  prose, and every event type is documented and pinned by a test. The terse
  wording moved to `src/narrator/eventText.js`.
- **Games replay.** A game logs every order. `gameRecord(game)` saves spec,
  seed and orders as plain data, and `replayGame(record)` rebuilds the game
  with an identical event log.
- **Same game.** Before the map and coordinate work, I recorded the full
  output of 30 scenario runs, 10 meeting battles and 3 complete hotseat
  games. After steps 4–5 that output was byte-identical. After step 6 the
  only differences were the intended ones (listed below).
- **Tests:** 261 pass (252 before), plus the legacy `test:core`. CI now runs
  the whole suite; it used to run only phase 2.

## Steps

| Step | Commit | What |
|---|---|---|
| 1 | `stage-1: step 1, plan` | `docs/stage-1/PLAN.md` |
| 2 | `step 2, one home for the engine` | `git mv` of every phase folder into `src/engine/`, `src/harness/`, `src/adapters/`, `src/interpreter/`, `src/narrator/`; every relative `require` rewritten by script; `npm test` and CI cover all of it |
| 3 | `step 3, purity guard` | guard test; the veterans repository (writes files) moved out of the engine, its pure parts (`createCommander`, `stableStringify`) stayed in |
| 4–5 | `steps 4-5, the map is a value and positions are numeric` | `createMap`, `resolveMap`, `labels.js`, `terrain.js`; Crownhill as data; map threaded through movement, contact, push, flight, vision; positions numeric everywhere |
| 6 | `step 6, structured events` | typed `exchange`, `standoff`, `rout` events; schema documented in `engine/battle/events.js` and pinned by a test |
| 7 | `step 7, replay` | `game.orderLog`, `gameRecord`, `replayGame` |
| 8 | `step 8, a full battle on a 2 km map` | generated 80×80 battlefield test |

Steps 4 and 5 are one commit: nearly every line that needed the map also
handled a position.

## New layout

```
src/engine/        the pure engine (README inside)
  map/             createMap, labels, terrain costs, landmark resolver
  movement/        A* pathfinding, simultaneous movement, occupancy
  combat/          ratings, damage, the round resolver
  battle/          one battle turn by turn, the event log
  orchestrator/    the two-player loop, fog of war, victory, replay
  veterans/        experience, officers, the commander record
  army/            the army-builder economy
src/data/maps/     authored maps (Crownhill)
src/harness/       scenarios, balance matrix, design assertions
src/adapters/      hotseat CLI, Discord movement demo, veterans file storage
src/interpreter/   AI order parsing (phase 1)
src/narrator/      AI narration (phase 1) and plain event wording
```

The live Discord bot (`src/game/`, `src/bot/`) is untouched apart from
`src/index.js`, whose import of the movement demo now points at
`src/adapters/discord/movement-demo/handler.js`.

## Behaviour changes (all intended)

- **Hotseat turn report:** the duplicate line "X breaks and routs from Y" is
  gone. "X BREAKS and runs from Y" still reports the same moment.
- **`push` event:** `from` (a terrain name) is renamed `fromTerrain`, so
  `from` always means a position.
- **Off-map targets:** an order to a tile off the map now fails as "no path"
  or "off the map" instead of throwing.
- **`map.cell()` is strict:** it throws on anything that isn't a position.
  The first version quietly read a stray label as plains, and one test was
  doing exactly that.
- **Ambiguous landmark matches** now carry `position` as well as `coord`.

## Test changes

No expected value changed. Tests that read positions now compare them as
labels (`toLabel(unit.position) === 'D4'`), so the expected values read the
same as before.

- **Characterization pin "out-of-bounds coordinates are rejected"** is now
  "off the map; nonsense is rejected". `A41` and `AO1` parse as labels and
  the map reports them off the map, where the old parser threw. Nonsense
  still throws.
- **Every-tile test** rewritten for the label module. It now covers every
  authored map, labels on 80×80 and 800×800 maps (`CB80`, `AAA1`), strict
  refusal of bad input, and agreement with the live bot's `mapUtils` on
  every Crownhill tile.
- **Charge tests** read `chargeImpact` from the exchange event instead of
  searching the prose for `[charge]`.
- **The "no timestamps in events" test** now stringifies each event. Run
  against objects instead of strings, it was passing without checking
  anything.
- **New tests:**
  - purity guard
  - event schema
  - replay: full game through JSON, partial replays, order-log copy, and a
    hotseat game
  - 2 km map: four tests
- The role guard (Stage 0) now scans the new directories.

## Noticed, not touched

- Older docs (`docs/design/architecture-roadmap.md`,
  `docs/design/combat-design.md`, `docs/PHASE2_COMBAT_PLAN.md`) still cite
  `src/phase*` paths. The harness README and new engine README describe the
  new layout.
- Legacy scripts and tests outside `npm test` were already importing files
  that no longer exist: `src/tests/combat/*`, `src/tests/balance/*`,
  `src/tests/schemas/validator.test.js`, root `test_ambush_scenarios.js` and
  `test_veteran_warnings.js`. They were broken before Stage 1 and are
  unchanged.
- The hotseat parser accepts labels of up to two letters and two digits.
  That covers maps up to 99 rows, so 80×80 is fine. Larger maps will need
  that pattern widened when the player-facing format is decided.
- A battle spec without a `map` plays on Crownhill. When you design the 2 km
  map, add it to `src/data/maps/` and name it in the spec.
- The duplicate-alias defect ("the ridge" always resolves to Shepherd's
  Ridge) is still pinned, not fixed.
- Elastic time is unchanged, as planned.

## PR base

Stage 0 (PR #2) is not on `main` yet, so this PR targets `stage-0`. Once
#2 merges, retarget this PR to `main` (GitHub does it automatically if the
`stage-0` branch is deleted on merge).

## Proposed tag

After merge: `stage-1-complete`.
