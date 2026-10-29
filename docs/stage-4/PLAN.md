# Stage 4 Plan: the web app (the Command Tent)

Date: 2026-10-29. Rulings this plan rests on: `docs/DECISIONS.md`
("Player surface: a web app, for now"; the legacy Discord bot retires once
the web app can run a full battle; and "Rulings, October 29, 2026 (the web
app)").

## Goal

A whole battle of Cohort in the browser: give orders in plain words, read
the turn back in your culture's voice, and see only what your side can see.
First alone, against the standing orders; then two people, each in their
own browser.

It is played over hours and days, not in one sitting: low stress, plenty of
time to think, come back, and answer. Nothing hurries a commander.

It should look like an old parchment battle map, in the manner of the
HistoryMarche channel: a flat map with real detail, units as squares with
clear markings, the map and the battle at the centre, and the readouts on
plain off-white panels. Minimal interface. Later each faction gets its own
theme, the way Age of Empires II dressed its interface in the colours and
ornament of the civilisation being played; this stage builds the place for
those themes, not the themes.

There is no art yet and no written interface design (the "Command Tent
Interface Design" doc does not exist). So this stage starts with design
work and builds on placeholders. Everything visual is drawn from code (SVG
and CSS) and is easy to replace when real assets exist.

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
   - **Muster:** create a battle (scenario, seed, time limit, objectives;
     alone against the standing orders, or against a friend) and get the
     links, one per side. Share one with the opponent.
   - **Your battles:** the battles you are in, and which are waiting on you.
     A battle runs over days; this is where a commander comes back to.
   - **The Command Tent:** the battle screen. The map (grid squares,
     terrain, your units, enemy units as last seen, objectives), your
     roster (men, morale, wind, orders in force), the order pad (type
     orders; read-back and questions before sending), dispatches (the
     turn's report, narrated when the AI is on), and the turn state
     ("your orders are in; waiting for the enemy commander", the battle
     clock). Waiting is calm, not urgent: no timers, no countdowns.
   - **The verdict:** who won and why, losses, officer fates, and a replay
     of the battle turn by turn.
3. **Phone first, as well as desktop.** Zach reads on a phone. The tent must
   work at phone width: the map pans and zooms, panels stack.
4. **The visual direction (ruled):** an old parchment battle map, HistoryMarche
   style. One placeholder mock-up of the Command Tent in that style for Zach
   to react to before the screens are built.
5. **Built for faction themes.** Every colour, typeface, frame and ornament
   comes from a theme (CSS custom properties plus an asset folder per
   theme), never from the screens themselves. Stage 4 ships one theme,
   neutral parchment; a faction theme later only fills in its own values
   and art. The narrator already speaks in each culture's voice; the theme
   is the same idea for the eye.

### B. Placeholder art (all from code, all replaceable)

1. **The map as parchment:** a warm paper ground, terrain in muted inks
   (woods as clusters of drawn trees, hills as hatching and contours, marsh
   as reed strokes, the river as a blue-grey band, roads as lines), the
   grid's 100 m squares faint, labelled in the margin like an old map.
   Flat, top-down, with detail; no 3D.
2. **Units as squares with clear markings,** as on HistoryMarche: a block in
   the side's colour, a simple symbol for the role (spear, sword, bow, horse,
   scout), the unit's name, a strength bar, and a small mark when the unit is
   hidden, crowded, broken or fighting. Side colours chosen to read for
   colour-blind players.
3. **Movement and fighting drawn as on those maps:** an arrow for each
   unit's order in force, a clash mark where units fight, the last turn's
   moves shown faintly.
4. **Enemy as known:** seen enemies solid; last-seen ghosts faded with "seen
   20 min ago"; nothing at all for the unseen.
5. **Readouts on off-white:** roster, order pad and dispatches on plain
   off-white panels with a readable serif, kept out of the map's way.
6. **One place for every asset,** per theme (`web/themes/parchment/`, with
   a list of what each asset is for), so real art, and later each faction's
   theme, drops in without touching the code.

### C. The server

1. **A small Node web server** around the existing orchestrator: start a
   game, join a side, read your side's view, submit orders, get the turn's
   report. Plain HTTP with JSON. A battle runs over days, so nothing
   depends on both players being online: a player submits, closes the
   browser, and finds the turn run when they come back. As few new
   dependencies as possible.
2. **Fog of war is enforced on the server.** A side's requests only ever
   return that side's view (`sideView`, filtered events, masked names), so
   nothing hidden reaches the other browser even if someone opens the
   developer tools.
3. **Seats by link:** each side gets an unguessable link; no accounts in
   this stage. Whoever holds the link plays that side. The link is the way
   back to the battle, days later.
4. **Telling a player it is their turn:** when the turn runs, the waiting
   page updates if it is open; otherwise the player sees it in "your
   battles" next visit. Notifications by email or phone are noted for
   later.
5. **Games survive a restart:** each game is saved as its record (spec,
   seed, order log) and rebuilt with `replayGame`. JSON files on disk; the
   database work comes later.
6. **The AI stays optional:** with `GROQ_API_KEY` set the server reads free
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
4. **Dispatches:** each turn's report, newest on top, kept for the whole
   battle, so a commander coming back after a day can read what happened.
5. **Solo play first:** "play against the standing orders" (the hotseat
   `--auto` side) is the first thing that works end to end; two players by
   link come after.

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

1. Plan and rulings (this file, `docs/DECISIONS.md`).
2. Screen flow and wireframes (`docs/stage-4/UX.md`); Zach reviews.
3. The theme system and the parchment placeholder theme; one mock-up of the
   Command Tent in it; Zach reacts.
4. The server: games, seats by link, views, orders, reports, saved games.
5. The Command Tent, read-only: map, roster, dispatches from a saved game.
6. Solo play from the browser: order pad, read-back, questions, turns
   against the standing orders, to a verdict.
7. Two players by link: waiting calmly, coming back days later, "your
   battles".
8. Muster and the verdict screens, with the replay.
9. Phone layout and accessibility pass.
10. Playwright test of a full battle, solo and two-player; report and PR,
    tested on a fresh clone.
11. (On Zach's word) the Discord bot to `archive/`.

## Out of scope

- **Accounts, matchmaking, chat:** links only.
- **Real art and sound:** placeholders only, kept in one place to swap.
- **Faction themes:** the system is built; the themes wait for assets.
- **Notifications by email or phone:** later.
- **Hosting:** the app runs with `npm run web`; where it is hosted is a
  separate decision.
- **Commander personalities and memory:** needs the "Commanders, Memory and
  Delegation" doc.
- **Campaigns across battles in the browser:** the veterans engine exists;
  showing it is later.
- **The 2 km map:** Zach's; the app takes any map the engine takes.

## Answered October 29

1. **Command Tent doc:** there is none. This plan and the wireframes in
   step 2 are the design.
2. **Pace:** hours and days. Low stress, plenty of time to go back and
   forth.
3. **Look:** an old parchment battle map, HistoryMarche style: squares with
   clear markings, a flat detailed map at the centre, minimal interface,
   readouts on off-white. Later, a theme per faction in the manner of Age
   of Empires II; design for it now.
4. **Who plays first:** Zach alone, then with friends.
