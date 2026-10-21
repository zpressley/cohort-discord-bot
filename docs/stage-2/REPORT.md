# Stage 2 Report

Branch `stage-2`, built on `main`. Date: 2026-10-21.
Plan: [`PLAN.md`](PLAN.md). Rulings: `docs/DECISIONS.md`, "Rulings, October 21, 2026".

## Summary

A commander can now type orders the way a person would say them, and read
the turn back in prose. The engine still decides every outcome; the AI only
reads words and writes reports, and the game runs fully without it.

- **The map knows its ground.** Ridges, woods, clearings, fords, bridges,
  the river and roads are found from terrain alone, so every map has them,
  including maps not yet designed.
- **Places as players say them.** "The ridge to the east", "the clearing",
  "the woods north of the South Ford", "Harrow Bridge", or a grid square
  "C7-NE". When the words fit two places, the player gets a question
  ("Which ridge: The Crownhill 450 m east, or Shepherd's Ridge 500 m
  south?"), never a guess.
- **Orders say more and last.** Move, hold, defend, advance, withdraw, and
  "...and hold". Orders persist until replaced or done; before, they lapsed
  after one turn.
- **AI order reading and narration (Groq),** each with a fallback: the fixed
  grammar for orders, plain text for reports. Fog of war holds: the AI only
  hears what that side knows.
- **Officers can be killed, captured or wounded,** calibrated to the ruling:
  9.1% of wins and 20.2% of losses cost an officer killed, over 200 simulated
  battles.
- **The player grid:** 100 m squares on every map (`C7`), 50 m quarters
  (`C7-NE`).
- **Two movement bugs fixed** that could stall a battle for ever (see below).
- **Tests:** 329 pass (261 before), plus `test:core`. A fresh clone of the
  branch from GitHub passes too.

## Steps

| Commit | What |
|---|---|
| plan (merged as #5) | rulings of 2026-10-21 and this plan |
| step 2 | `engine/map/features.js`: features found from terrain |
| step 3 | `engine/map/places.js`: places as players describe them |
| step 4 | `engine/battle/orders.js`: richer orders that persist |
| step 5 | `src/llm/`: one AI client (Groq) with timeout, retry, cost log, recorded replies |
| step 6 | `src/interpreter/`: grammar, AI reader, resolution; wired into the hotseat CLI |
| step 7 | `src/narrator/turnNarrator.js`: the turn told back in the side's voice |
| step 8 | officer fates: killed, captured, wounded; `npm run officers` |
| fix | two movement bugs (detours around friends; contact stops movement) |
| step 9 | `engine/map/grid.js`: the player grid |

## What a player notices

In the hotseat CLI (`npm run play`):

- Orders read like "spears to the ridge to the east", "archers defend C2-NE",
  "stop at the clearing and set up a defensive position", "everyone advance",
  "swords fall back". The CLI reads back what it understood.
- Positions show as grid squares and quarters. Old tile references like "K8"
  are no longer player input (on Crownhill, K is off the 10-square grid).
- Orders persist: a unit sent somewhere keeps going on later turns, and
  digs in if told to hold.
- With `GROQ_API_KEY` set, orders can be free text, and a solo player
  (`--auto blue`) gets the turn narrated. Without a key, everything works on
  the fallbacks.

## Rule changes (intended; listed so they can be reviewed)

- **Orders persist** until replaced or done. A move ends on arrival (the unit
  rejoins its side's standing orders, or holds if told to). An order carried
  over from an earlier turn that gets nowhere is given up and logged.
- **Contact stops movement.** A unit that steps next to an enemy halts and
  fights. Before, contact was only checked after everyone moved, so two
  units could slip past each other diagonally for ever.
- **Detours around friends.** A unit blocked by a friend looks for a way
  around once per turn. Before, it stopped, and armies could jam into a
  single file with a broken unit wedged in the middle.
- **Officer fates** follow Q3 (see `FATES` in `engine/veterans/officers.js`).
  Experience no longer buys survival; ranks stay as titles.
- **Hotseat report:** the duplicate "breaks and routs" line went in Stage 1;
  new lines for arriving and being halted.

## Effect on existing games

- The three baseline hotseat games ended identically through steps 4 to 8.
  The grid and the movement fixes then changed what players type and how
  some battles flow.
- 300 games through the game loop with silent players (six openings, two
  scenarios, 50 seeds) all finish. The closed-loop meeting battle reaches a
  verdict in 50 of 50 seeds (average 8.6 turns, against 12.7 before the
  movement fixes).
- One opening never ends, by the players' choice: red's archers ordered to
  hold, blue ordered to fall back and hold. Neither side will move without
  new orders. A rule for long mutual holds (a draw, or a nudge) is a
  possible later addition.

## Test changes

- **Replaced:** the old officer death-ladder tests (15% down to 6%) with tests
  of the ruled rates, including a 20,000-battle check per roster size, and a
  check against real battles.
- **Changed by the movement fix:** "a friendly blocker gets one tick to clear
  before the mover gives up" is now "a unit walks around a friend who holds
  its path", plus a test that with no way around (a friend on the only ford)
  the mover still gives up.
- **Moved to the grid:** hotseat and interpreter tests that typed tile labels
  now type the grid square covering the same ground (K8 becomes C2-SE, J8
  becomes C2-SW).
- **Archived:** the old hotseat parser (`archive/hotseat-parser/`); its tests
  were rewritten against the new interpreter.
- **New:** features (10), places (13), orders (8), AI client (9),
  interpreter (11), narrator (5), officer fates (8), grid (5).

## Not done, or for later

- **Real Groq replies are not recorded yet.** The AI paths are tested with
  scripted model replies. With a key, run with `AI_RECORD_DIR` set to save
  real replies as fixtures; the prompts may need a round of tuning against
  them.
- **Capture and wound rates** (15% capture when caught; wounds at half the
  death chance plus 10% per poor choice) are my proposals. Tune with
  `npm run officers`.
- **Captured officers** are kept on record for ransom; the ransom itself
  belongs to the diplomacy work.
- **Narration in two-player hotseat** stays plain, since both players share
  one screen. The web app gives each side its own view.
- **Long mutual holds** never end on their own (above).
- **Movement:** detours are planned once per turn and only around friends;
  enemies still stop a unit at contact. That is the intended rule, but large
  traffic jams may still appear on bigger maps.

## Proposed tag

After merge: `stage-2-complete`.
