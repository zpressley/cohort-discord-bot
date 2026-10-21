# Stage 2 Plan: orders in plain words, battles told back

Date: 2026-10-21. Rulings this plan rests on: `docs/DECISIONS.md`,
"Rulings, October 21, 2026".

## Goal

A commander types an order the way a person would say it, and reads back
what happened in prose. "Take the spears up the ridge to the east and hold
it." "Stop at the clearing and set up a defensive position." The engine
still decides every outcome. The AI only turns words into orders and events
into prose.

Everything in this stage is built and tested headless, through the hotseat
CLI, so it is ready for the web app in Stage 3 without depending on it.

## Where things start

- The engine takes orders as `{ unitRef, target }`, where the target is a
  position, a map label or `'hold'`. A unit that holds is prepared
  (defensive) from the next tick.
- The hotseat CLI has a fixed grammar ("spears to K7", "everyone to the
  bridge") and resolves named landmarks only.
- `src/interpreter/` and `src/narrator/` are the phase 1 single-unit AI
  demo: one provider (Groq), no fallback, named landmarks only.
- Combat events are structured data (Stage 1), ready for a narrator.
- Officer deaths use the old flat table (15% for a new officer down to 6%
  for a legendary one), ignoring the battle's outcome and the unit's losses.

## Workstreams

### A. The ground as players describe it

Players should talk about the ground, not about named landmarks. The map
needs to know its features well enough to answer "the ridge to the east" or
"the clearing".

1. **Feature detection.** From the terrain, find the features a person would
   name: hills and ridges (connected high ground), woods, clearings (open
   ground enclosed by woods), fords and bridges, the river, roads, marsh.
   Each feature gets a kind, an extent, a centre and the tiles it covers.
   Computed from map data, so any map gets features, including the 2 km map
   once it exists.
2. **Relative references.** Resolve a description from a unit's point of
   view: a kind ("ridge"), an optional direction ("to the east", "north of
   the ford"), and nearness ("the nearest woods"). Pick the best match, or
   ask a question when two are close ("the ridge to the north-east or the
   one to the south-east?"). Never guess.
3. **Where in a feature.** "Up the ridge" means the crest, "the edge of the
   woods" means the boundary tile facing the unit, "stop at the clearing"
   means its near edge. Each feature kind has a sensible default point.
4. **Named landmarks become flavour.** They still resolve when used, and the
   narrator still names them, but they are no longer the main way to
   navigate. The "the ridge" name clash goes away: "the ridge" becomes a
   feature reference, answered by direction or a question.

### B. What an order can say

The order the engine receives grows from `{ unitRef, target }` to an intent
the parser can fill in from plain words:

- **Who:** a unit, several, or everyone (exists today).
- **Action:** move, hold, defend, advance on the enemy, withdraw.
- **Where:** a feature reference, a direction and distance ("200 metres
  north"), a position, or nowhere (hold where you are).
- **Then:** what to do on arrival. "Set up a defensive position" is move,
  then hold, so the unit is prepared.

Each new action maps onto engine behaviour that already exists (moving,
holding, standing orders), so this needs no new combat rules. Anything that
would need one is noted for later, not built.

### C. The order parser (AI)

1. **One AI client for the project.** It tries providers in order and falls
   back to the next on error or timeout. It enforces timeouts, logs the cost
   of every call, and reads keys from the environment. If every provider
   fails, the deterministic grammar takes over.
2. **The parser.** Plain text in, the intent from B out, as strict JSON
   checked against a schema (the `ajv` dependency already exists). The AI
   sees the unit's surroundings described in words (features from A,
   directions, nearby enemies the side knows about), never raw coordinates
   or hidden enemy positions.
3. **Questions, not guesses.** Anything ambiguous comes back as a question
   to the player, as the hotseat grammar already does.
4. **Testable without the network.** Real AI replies are recorded once as
   fixtures, and tests replay them. CI never calls an AI provider.
5. **In the hotseat CLI.** Typed orders go through the parser when a key is
   set, and through the deterministic grammar otherwise.

### D. The narrator (AI)

1. Turn events in, prose out, in the voice of the side's culture. The
   narrator sees only that side's view (fog of war holds) and the events,
   never raw state.
2. If the AI is unavailable, `src/narrator/eventText.js` already words every
   event plainly; that is the fallback.
3. Same testing approach: recorded fixtures, no network in CI.

### E. Officer deaths (ruled Q3)

1. **The model.** After each battle, each officer whose unit fought has a
   chance of dying. The chance depends on whether their side won or lost,
   and rises as their unit's losses rise: a unit at a third of its strength
   puts its officer in far more danger than one that barely fought.
2. **Calibrated by simulation.** Run many battles through the harness and
   tune the numbers until, across a typical army, about 1 battle in 10 on a
   winning side and about 1 in 5 on a losing side costs at least one
   officer. A test pins those rates within a tolerance.
3. Still chance-based and seeded, so a campaign replays exactly.
   Experience no longer protects an officer on its own; their unit's
   survival does.

### F. Player-facing grid (proposed, needs confirming)

The ruling sets a direction, not a format. Built only once the reading in
`docs/DECISIONS.md` is confirmed:

- A letter-and-number grid of about 20×20 squares over the whole map (`C7`),
  each square split into 4 quarters (`C7-NE`, or similar).
- On a 2 km map, a square is 100 m and a quarter is 50 m.
- A translation module like `labels.js`; the engine keeps numeric x,y.
- The hotseat CLI and parser accept grid squares; orders to a square aim at
  its centre.

## Steps (one commit each, full suite green at every commit)

1. Plan and rulings (this file, `docs/DECISIONS.md`).
2. Feature detection on any map, with tests on Crownhill and a generated map.
3. Relative references and default points, with ambiguity as questions.
4. The richer order intent in the engine's order handling (move, hold,
   defend, advance, withdraw, then-hold).
5. The shared AI client: provider fallback, timeouts, cost log, recorded
   fixtures.
6. The order parser, wired into the hotseat CLI with the grammar as fallback.
7. The narrator, wired into the hotseat turn report with plain text as
   fallback.
8. Officer death model, calibrated by simulation.
9. Player-facing grid, if confirmed by then.
10. Report and PR. Before the PR, run the full suite on a fresh clone so
    nothing that exists only locally can slip through (the Stage 1 lesson).

## Out of scope

- **The web app (Stage 3):** the Command Tent interface. Needs the "Command
  Tent Interface Design" doc.
- **Commander personalities and memory:** needs the "Commanders, Memory and
  Delegation" doc. The parser in C is built so a commander's personality can
  shape how an order is carried out later.
- **Designing the 2 km map:** Zach's. Feature detection will work on it
  unchanged.
- **New combat rules:** formations, ranged combat, line of sight.
- **The legacy Discord bot:** retires after Stage 3.

## Open questions for Zach

1. The grid reading in `docs/DECISIONS.md`: 20×20 squares of 100 m on a
   2 km map, each split into 4 quarters of 50 m?
2. AI providers: which do you have keys for, and in what order should they
   be tried? The repo has Anthropic, Groq and OpenAI SDKs installed.
3. Should officers be wounded or captured as well as killed, or keep it to
   death for now?
