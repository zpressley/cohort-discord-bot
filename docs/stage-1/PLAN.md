# Stage 1 Plan: the engine as a pure package, with an event log

Date: 2026-10-20. Branch `stage-1`, built on `stage-0`.

## Goal

One engine folder that is a pure function of (map, armies, orders, seed).
Each turn returns a structured event log, and anything else (narrator, tests,
saved games, a future UI) reads from that log. The engine works on any map
size, with numeric coordinates inside.

The game must play exactly as it does now. Every existing scenario, the
balance assertions and the hotseat game must give the same results after
each step.

## Decisions this plan rests on

- **Map:** the current hand-made 40×40 map (Crownhill) stays the only map
  for now. Zach will design a 2 km × 2 km map (80×80 at 25 m tiles) later.
  The engine must not care which one it is given.
- **Coordinates:** numeric `{ x, y }` inside the engine (ruling Q1). `x` is
  the column, west to east; `y` is the row, north to south; both start at 0.
  The player-facing format is not ruled, so `A1`-style labels survive only at
  the edges (scenario files, the hotseat CLI, the Discord demo) through one
  translation module.
- **Sides** stay as labels (`'red'`/`'blue'`), per the S0-3 resolution.
- **Elastic time** in the orchestrator stays as built. The bigger map makes
  it matter less, but removing it is not this stage's job.

## Steps (one commit each, full suite green at every commit)

1. **Plan.** This file.
2. **One home for the engine.** `git mv` the phase folders into the
   roadmap's layout and fix every import. No logic changes.

   | From | To |
   |---|---|
   | `phase1-movement/mapData.js`, `landmarkResolver.js` | `engine/map/` |
   | `phase1-movement/movementEngine.js` | `engine/movement/pathfinding.js` |
   | `phase3-movement/*` | `engine/movement/` |
   | `phase2-combat/combat/*` | `engine/combat/` |
   | `phase2-combat/harness/rng.js`, `world.js`, `runner.js` | `engine/` (`rng.js`, `world.js`, `runner.js`) |
   | `phase4-integration/battle.js`, `events.js` | `engine/battle/` |
   | `phase5-orchestration/*` | `engine/orchestrator/` |
   | `phase6-veterans/*` | `engine/veterans/` |
   | `phase7-army/*` | `engine/army/` |
| `phase6-veterans/persistence.js` (writes files) | `adapters/persistence/veteransRepository.js` |
   | `phase2-combat/scenarios`, `balance`, `run.js`, harness report and placeholder; `phase4-integration/scenarios` | `harness/` |
   | `phase7-hotseat/*` | `adapters/hotseat/` |
   | `phase1-movement/handler.js`, `unitState.js` | `adapters/discord/movement-demo/` |
   | `phase1-movement/intentParser.js` | `interpreter/` |
   | `phase1-movement/narrator.js` | `narrator/` |

   Tests move next to their code. `npm test` runs everything under `src/`
   that ends in `.test.js`, and CI runs `npm test` (today CI skips phases
   3–7).
3. **Purity guard.** A test fails if anything in `src/engine/` reads files,
   the network, the clock (`Date.now`, `new Date`) or `Math.random`, or
   imports Discord, an AI SDK, the database, or anything outside
   `src/engine/` and `src/data/`.
4. **The map becomes a value.** `createMap(definition)` builds a map from
   data: width, height, terrain and landmarks. Crownhill moves to
   `src/data/maps/crownhill.js`. The battle state carries its map, and
   pathfinding, terrain lookup, flight to the map edge, push-back and vision
   all read it from there. No `40` and no global map module are left in the
   engine.
5. **Numeric coordinates.** Unit positions, paths and events use `{ x, y }`.
   `engine/map/labels.js` converts `A1`-style labels both ways, with
   bijective letters so any width works. Scenario files can still say `D4`;
   they are translated when the battle is created.
6. **Structured events.** Combat exchanges become typed events (who struck
   whom, casualties each way, morale and stamina after, the modifiers that
   applied) instead of prose strings. Prose moves to a formatter outside the
   engine. Every event carries what a narrator needs without reading state.
7. **Replay.** A game records its seed and every order submitted. Replaying
   those orders against the same map gives the same events, byte for byte. A
   test pins it for the scenarios and a full hotseat game.
8. **Size proof.** A test runs a full battle on a generated, open 80×80 map,
   to show the engine is not tied to 40×40. No new hand-made map.
9. **Report and PR.**

Steps 4 and 5 landed as one commit: nearly every call site that needed the
map also handled a position, so splitting them would have meant rewriting the
same lines twice.

## Out of scope

Designing the 2 km map, the player-facing coordinate format, officer death
changes (Q3 is open), commander personalities and memory, the order parser,
web or mobile UI, and changes to live Discord behaviour beyond fixing the
import paths the move breaks.

## Risks

- **Moving files breaks the live bot's import.** `src/index.js` loads the
  phase 1 movement demo. Step 2 updates that path, and a test loads the
  module to catch it.
- **Same results after the coordinate change.** Pathfinding breaks ties in
  a fixed order today. Switching to `{ x, y }` must keep that order, or the
  scenarios drift. The scenario and balance tests catch drift. Expected values
  change only if a test reads a position's representation (`'D4'` becomes
  `{ x: 3, y: 3 }`); each such change will be listed in the report.
