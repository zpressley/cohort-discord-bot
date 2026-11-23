# The engine

The rules of a battle. Read `README.md` here for the layout.

- **Pure.** No I/O, no clock, no `Math.random`, nothing from outside
  `src/engine` and `src/data`. `tests/purity.guard.test.js` enforces it.
- **No roles.** Neither unit in a fight has a role: both sides act at
  once. The two words for the one who strikes and the one who is struck
  are banned in every file under `src` but the web app, comments and this
  file included; `tests/no-roles.guard.test.js` names them and fails the
  suite on sight. Name units and sides, or say "the one struck".
- **Seeded.** A new kind of roll gets a random stream of its own, seeded
  from the battle's seed (see `officerRandom`, `commanderRandom` in
  `battle/battle.js`), so that adding it does not change how existing
  battles fall out.
- **Numbers live in `combat/tables.js`**, each with a comment on where it
  came from. Do not put tuning numbers in logic.
- **Time.** A tick is ten battle minutes. A player turn runs up to six
  ticks and stops early on an interrupt (`orchestrator/orchestrator.js`).
  Orders are given once, as a player turn opens.
- **Events are the record.** Anything that happens is an event in the log.
  A new event type also needs: a line in `src/narrator/turnNarrator.js`
  (`plainFact`, `WEIGHT`, and `PRIVATE` if only its own side may know),
  and a line in `src/adapters/hotseat/render.js`.
- **A unit does not know what it has not seen.** Orders act on enemies
  seen or last seen (`lastSeen`), never on the true positions.
- **A battle with none of your new thing must run exactly as before.**
  Test that.

After changing anything here run `npm test`, `npm run soak` and
`npm run balance`. The balance table must be unchanged unless you set out
to change combat; if you did, say so and show before and after.

The Commander on the field is in `command/commander.js`; officers and how
much of an order they keep in `command/officers.js`; the company that goes
from battle to battle in `command/company.js`.

Orders and news by rider (`docs/design/point-of-view-and-messengers.md`):
the rider's path and the queue of orders on the road in
`command/messengers.js`; what each Commander on the field knows, and when,
in `orchestrator/word.js` (`game.word`). A side with no Commander on the
field has neither.
