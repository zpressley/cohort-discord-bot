# The web app

`server.js` is the HTTP API, `battles.js` the battles and what each seat may
see, `commanders.js` the Commanders and their officers, `public/` the
browser app (one page, no build step, no framework). `README.md` here has
the screens.

- **Fog of war is held on the server.** Every answer about a battle is cut
  to that seat's side. Never send the browser anything its side has not
  seen, and never trust the browser to hide it. There is a test for this;
  keep it passing and extend it when you add to a view.
- **A token is a secret.** A seat's link is its token, and so is a
  Commander's. Whoever holds it is that player. A player may also sign in
  with Discord (`signin.js`, only when configured): his **account**
  (`accounts.js`, kind `account`) keeps the tokens he holds, so they
  follow him to another browser. An account is shown only to the player
  signed in to it; a session (`session.js`) is a signed cookie with his
  Discord id and nothing else. Signing in is never required: a link still
  plays alone. Never log a token, a secret, or a message that carries a
  tent's link.
- **Discord** (`src/discord`): "your move" messages and battle threads
  for battles between two players, sent through a queue that never holds
  up a turn. They say only what a player could know from outside the
  battle; the fog-of-war test in `tests/discord.test.js` covers everything
  sent. What was sent is remembered on the battle (`discord`), so nothing
  goes twice. With no Discord settings none of it exists.
- **The page is the Commander's point of view.** Say "you". Unit names are
  his own ("Spears") and the other side's are "enemy spears"; `namer` in
  `battles.js` does it.
- **Phone first.** Design at 390 px wide. Touch targets at least 44 px. No
  sideways scroll. Then check a desktop width.
- **Text from the server goes through `esc()`** before it reaches
  `innerHTML`. Always.
- **Words** for orders, morale and outcomes come from
  `src/narrator/words.js`.
- **Saved battles replay.** A battle is saved as its spec, seed and order
  log, and rebuilt by playing the log back. Anything that changes a battle
  must go through `submitOrders` so it is in the log. Changing a spec after
  the game is made breaks the replay.
- **Saving goes through `storage.js`.** Battles, Commanders and accounts
  are documents: `put(kind, id, data)`, `all(kind)`,
  `remove(kind, id)`. Files under `COHORT_DATA_DIR` when no database is
  set (tests, the soak, a developer's machine), Postgres when
  `DATABASE_URL` is. Memory is the truth while the server runs: all is read
  in at start, a document written whole when it changes. A POST is answered
  only once its writes are saved (`storage.flush()`); while saving fails,
  POSTs get 503 and `/healthz` says so. Postgres keeps `json`, not `jsonb`
  (jsonb reorders keys, and the game reads key order). Hosting:
  `docs/HOSTING.md`. Postgres tests run when `TEST_DATABASE_URL` is set.
- **The game works with no AI.** With no key, orders are read by the
  grammar and reports are the plain account.

Checks: `npm test` (the server through its API, `tests/server.test.js`)
and `npm run test:browser` (`browser/battle.browser.js`, Playwright). Take
a screenshot of anything you change on screen and look at it.
