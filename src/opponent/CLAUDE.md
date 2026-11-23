# The computer's side

`planner.js` gives the computer's units their orders each player turn.

- **No AI model.** The same battle always gets the same opponent.
- **It plays by the Commander's rules.** It gives only orders a Commander
  can give, and plans only from what its side has seen or last saw
  (`sideView`, `battle.lastSeen`). It never reads the true positions.
- **No roles** (see `src/engine/CLAUDE.md`): the guard covers this folder.
- Its numbers are in `TUNING` at the top of `planner.js`.
- Measure a change before keeping it: the league scripts in
  `docs/DECISIONS.md` ("How the thinking opponent was built") say what was
  measured and how. The soak must still end every game.
