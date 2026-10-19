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

## What is not here, and why

`src/game/battleEngine.js` (the legacy combat engine) was scheduled to move
here but did not. The live Discord bot still imports it from
`src/game/turnOrchestrator.js`, `src/game/movement.js` and
`src/game/orders.js`, and CI's `test:core` imports it too. Moving it would
break the bot. See the Stage 0 entries in the contradiction log in
`docs/design/architecture-roadmap.md` §8.
