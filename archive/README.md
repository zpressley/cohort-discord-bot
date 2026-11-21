# archive/

Retired code and documents. Kept for reference, never imported, never edited.

Archived on 2026-10-19 during Stage 0 (see `docs/stage-0/STAGE_0_SPEC.md` and
`docs/stage-0/REPORT.md`), under ruling Q2 in `docs/DECISIONS.md`: retired
material moves here and nothing is deleted.

The git tag **`legacy-final`** marks the last commit before anything moved in.
Check it out to see every file at its original path.

## What is here

Paths inside `archive/` mirror where each file used to live, so
`archive/docs/game-logic/cohort_workflows.md` was `docs/game-logic/cohort_workflows.md`.

**Legacy design and build notes (21 files).** Each carries the banner "Past
build notes, this project has moved in new direction". They describe the
pre-restart build and its plans. They are useful for feature intent and
flavour, but their mechanics and numbers are superseded by `docs/design/`.

- `CONSOLIDATION.md` also serves as the inventory of files an earlier agent
  cleanup deleted from `main` (see roadmap §10).
- `WARP.md`
- `docs/README.md`
- `docs/Context/` (4 files) and `docs/Context/Old Context/` (5 files)
- `docs/architecture/` (4 files)
- `docs/game-logic/` (2 files)
- `docs/guides/` (2 files)
- `docs/tasks/CMB-007-BACKLOG.md`

**Training purchase (`training-purchase/`).** The Discord army builder's
sixth step, which sold a separate `training` upgrade for 2/4/6 SP that no
combat code read. Removed by ruling Q8: a unit's training comes from its
quality tier. Archived 2026-10-19, Stage 0 task 5.

**Hotseat order parser (`hotseat-parser/`).** The phase 7 hotseat CLI's
fixed order grammar ("spears to K7", landmarks by name only). Replaced in
Stage 2 by `src/interpreter/` (the grammar, the AI reader and place
resolution shared by every interface). Archived 2026-10-21.

**The Discord bot (`src/`, `scripts/`, and four files at the top).** The
whole pre-restart game: the bot and its commands (`src/bot`, `src/index.js`,
`deploy-commands.js`), the legacy battle engine and turn loop (`src/game`,
including `battleEngine.js`), its AI calls (`src/ai`,
`src/interpreter/intentParser.js`, `src/narrator/narrator.js`), the SQLite
models (`src/database`), commander names (`src/commanderName`), the movement
demo (`src/adapters/discord`), its tests (`src/tests`, the `test_*.js`
files) and its scripts. Retired by the ruling of 2026-11-21
(`docs/DECISIONS.md`): the game is the pure engine in `src/engine` with the
web app and the hotseat on top, and nothing in them used this code.
Archived 2026-11-21.

It will not run from here: its packages (discord.js, sequelize, sqlite3 and
the AI SDKs) were removed from `package.json` with it, which is what took
`npm audit` from 24 known vulnerabilities to none. To run it, check out
the commit before this move and `npm ci` there.

Three things went with it: CI's `test:core` step (it tested the legacy
engine; CI now runs `npm test` and `npm run soak`), the guard test for the
bot's army builder (`src/adapters/discord/tests`), and the check that the
bot's map labels agreed with the engine's (the last test of
`src/engine/map/tests/every-tile.test.js`, removed there).
