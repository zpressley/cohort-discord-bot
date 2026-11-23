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
  Commander's. Whoever holds it is that player. No accounts.
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
- **The game works with no AI.** With no key, orders are read by the
  grammar and reports are the plain account.

Checks: `npm test` (the server through its API, `tests/server.test.js`)
and `npm run test:browser` (`browser/battle.browser.js`, Playwright). Take
a screenshot of anything you change on screen and look at it.
