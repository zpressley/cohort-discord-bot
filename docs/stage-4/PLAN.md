# Stage 4 Plan: the web app (the Command Tent)

Date: 2026-10-29. Rulings this plan rests on: `docs/DECISIONS.md`
("Player surface: a web app, for now"; the legacy Discord bot retires once
the web app can run a full battle).

## Goal

Two people, each in their own browser, play a whole battle of Cohort: give
orders in plain words, read the turn back in their culture's voice, and see
only what their side can see. It should feel like a commander's tent: a map
on the table, reports coming in, orders going out.

There is no art yet, and no written interface design: the "Command Tent
Interface Design" doc exists outside the repo, and has not been shared. So
this stage starts with design work and builds on placeholders. Everything
visual is drawn from code (SVG and CSS) and is easy to replace when real
assets exist.

## Where things start

- **The game runs headless and complete.** `engine/orchestrator` holds a
  two-player game: `createGame`, `submitOrders` (simultaneous: the turn runs
  when both sides are in), `sideView` (fog of war), `gameRecord` and
  `replayGame` (a game is its spec, seed and order log).
- **Orders in words and turns told back** exist (`src/interpreter`,
  `src/narrator`), with the AI optional (Groq) and plain fallbacks.
- **The hotseat CLI** (`src/adapters/hotseat`) is the reference for what a
  player needs: a briefing (roster, map, objectives), orders with a
  read-back and questions, a turn report, a final summary. Its `session.js`
  already does everything except talk to a keyboard.
- **No web server, no front end, no accounts.** Dependencies are Node only.
- **One map (Crownhill, 40x40) and two scenarios.** The 2 km map is Zach's,
  later.

## Workstreams

### A. Design first (before building screens)

1. **Screen flow and wireframes,** in `docs/stage-4/UX.md`: what each screen
   is for, what is on it, and how a player moves between them. Low fidelity:
   boxes and words, no styling. Zach reviews before anything is built.
2. **The screens, at minimum:**
   - **Muster:** create a battle (scenario, seed, time limit, objectives)
     and get two links, one per side. Share one with the opponent.
   - **The Command Tent:** the battle screen. The map (grid squares,
     terrain, your units, enemy units as last seen, objectives), your
     roster (men, morale, wind, orders in force), the order pad (type
     orders; read-back and questions before sending), dispatches (the
     turn's report, narrated when the AI is on), and the turn state
     ("waiting for the enemy commander", the battle clock).
   - **The verdict:** who won and why, losses, officer fates, and a replay
     of the battle turn by turn.
3. **Phone first, as well as desktop.** Zach reads on a phone. The tent must
   work at phone width: the map pans and zooms, panels stack.
4. **A visual direction,** chosen by Zach from two or three quick
   placeholder mock-ups (for example: a parchment war table; a clean modern
   staff map). One page each, no real art.

### B. Placeholder art (all from code, all replaceable)

1. **Terrain:** flat colours with a light SVG pattern per terrain (trees
   for forest, contour lines for hills, reeds for marsh, ripples for water),
   drawn per tile. The grid's 100 m squares outlined and labelled.
2. **Units:** counters in the style of a wargame (a coloured block with a
   simple symbol for the role: spear, sword, bow, horse, scout), a strength
   bar, and a small mark when the unit is hidden, crowded, broken or
   fighting. Side colours chosen to read for colour-blind players.
3. **Enemy as known:** seen enemies solid; last-seen ghosts faded with "seen
   20 min ago"; nothing at all for the unseen.
4. **One place for every asset** (`web/assets/placeholders/`, with a list
   of what each is for), so real art drops in without touching the code.

### C. The server

1. **A small Node web server** around the existing orchestrator: start a
   game, join a side, read your side's view, submit orders, get the turn's
   report. Plain HTTP with JSON, and server-sent events to tell a waiting
   player the turn has run. As few new dependencies as possible.
2. **Fog of war is enforced on the server.** A side's requests only ever
   return that side's view (`sideView`, filtered events, masked names), so
   nothing hidden reaches the other browser even if someone opens the
   developer tools.
3. **Seats by link:** each side gets an unguessable link; no accounts in
   this stage. Whoever holds the link plays that side.
4. **Games survive a restart:** each game is saved as its record (spec,
   seed, order log) and rebuilt with `replayGame`. JSON files on disk; the
   database work comes later.
5. **The AI stays optional:** with `GROQ_API_KEY` set the server reads free
   text and narrates; without it, the grammar and plain reports.

### D. The front end

1. **No build step** to begin with: plain HTML, CSS and JavaScript modules,
   served by the same server. A framework only if the screens prove they
   need one.
2. **The map:** SVG, drawn from the side's view; tap a unit to see it and
   its orders; tap a square to drop its grid reference into the order pad.
3. **The order pad:** free text, as in the hotseat CLI, with the read-back
   and any questions shown before the player sends. Sending locks the side's
   orders until the turn runs.
4. **Dispatches:** each turn's report, newest on top, kept for the battle.
5. **Solo play:** "play against the standing orders" (the hotseat `--auto`
   side), so one person can test a battle alone.

### E. Testing

- Server tests with `node:test` against the HTTP API: a full battle played
  through it; fog of war checked (one side's responses never contain an
  unseen enemy's position or name).
- A browser test with Playwright (Chromium is installed): two pages, two
  sides, a few turns to a verdict, at desktop and phone width.
- `npm test`, `test:core` and `npm run soak` stay green; the engine does not
  change in this stage except to fix bugs the web app exposes.

### F. Retiring the Discord bot (ruled)

Once a full battle runs in the web app, the legacy Discord bot moves to
`archive/` (moved, never deleted), with its start scripts and dependencies
noted. A separate commit, and only with Zach's go-ahead on the day.

## Steps (one commit each, full suite green at every commit)

1. Plan (this file).
2. Screen flow and wireframes (`docs/stage-4/UX.md`); Zach reviews.
3. Two or three placeholder visual directions; Zach picks one.
4. The server: games, seats by link, views, orders, reports, saved games.
5. The Command Tent, read-only: map, roster, dispatches from a saved game.
6. Orders from the browser: order pad, read-back, questions, waiting state.
7. Live turns between two browsers (server-sent events), and solo play.
8. Muster and the verdict screens, with the replay.
9. Phone layout and accessibility pass.
10. Playwright test of a full battle; report and PR, tested on a fresh clone.
11. (On Zach's word) the Discord bot to `archive/`.

## Out of scope

- **Accounts, matchmaking, chat:** links only.
- **Real art and sound:** placeholders only, kept in one place to swap.
- **Hosting:** the app runs with `npm run web`; where it is hosted is a
  separate decision.
- **Commander personalities and memory:** needs the "Commanders, Memory and
  Delegation" doc.
- **Campaigns across battles in the browser:** the veterans engine exists;
  showing it is later.
- **The 2 km map:** Zach's; the app takes any map the engine takes.

## Questions for Zach

1. **The Command Tent doc:** can you share "Cohort: Command Tent Interface
   Design"? If not, the wireframes in step 2 start from this plan.
2. **How a battle is played:** both commanders at once in a sitting, or by
   turns over hours or days (play-by-link)? It changes how waiting and
   notifications work.
3. **Look and feel:** any direction you already have in mind (period war
   table, modern staff map, something else)?
4. **Who plays first:** you alone against the standing orders, or you and a
   friend from day one?
