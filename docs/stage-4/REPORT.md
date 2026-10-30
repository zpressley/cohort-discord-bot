# Stage 4 Report

Branch `stage-4`, built on `main`. Date: 2026-10-30.
Plan: [`PLAN.md`](PLAN.md). Screens: [`UX.md`](UX.md). Rulings:
`docs/DECISIONS.md`, "Rulings, October 29, 2026 (the web app)", and the
answers of October 30 in `UX.md`.

## Summary

Cohort plays in the browser. `npm run web`, open the page, muster a battle
alone against the standing orders or against a friend by link, and play it
to the verdict, over minutes or over days.

- **The Command Tent** looks like an old parchment battle map: terrain in
  muted inks, the 100 m grid lettered in the margin, landmarks in italic,
  units as marked squares, enemies as last seen, objectives ringed, orders
  in force as dashed arrows. Readouts sit on off-white panels: Army,
  Orders, Dispatches.
- **Orders are typed,** and the map writes preset ones: tap a unit, then
  tap or drag to a place, and "Archers to D7-NE" joins the order box.
  Read-back and questions before anything is sent.
- **Played over days:** send your orders and close the page; the turn is
  there when you come back. No timers. The app opens straight into the
  battle waiting on you; "Your battles" is one tap away.
- **Alone or with a friend:** alone, the standing orders answer at once;
  with a friend, the muster gives a link to send them.
- **The verdict:** the result in your terms, men standing, fled and fallen
  on each side, and a slider that replays the battle turn by turn as your
  side saw it.
- **Fog of war is held on the server:** a side's browser never receives an
  enemy that side has not seen (tested).
- **Battles survive the server stopping:** saved as JSON, rebuilt from the
  order log.
- **Built for faction themes:** every colour and typeface is a variable in
  `src/web/themes/parchment/theme.css`; a faction theme is a copy with its
  own values and art.
- **Tests:** 401 pass (394 before), plus `test:core`, `npm run soak`, and
  the new `npm run test:browser` (two full battles in Chromium).

## Steps

| Commit | What |
|---|---|
| plan (merged as #10) | the plan and the rulings of Oct 29 |
| step 2 | screen flow and wireframes (`UX.md`, design canvas) |
| answers | Zach's answers: map gestures write orders; open to the waiting battle |
| step 4 | the server: battles, seats by link, views, orders, saving |
| steps 3, 5, 6 | the parchment theme and the Command Tent; solo play |
| steps 7, 8 | two players by link; the verdict and its replay |
| step 9, 10 | phone pass, the browser test, this report |

Step 3 (a separate mock-up) was folded into the build, as ruled on
October 30: the first working tent was the mock-up.

## How to play it

```
npm run web            then open http://localhost:3000
```

On a phone on the same network, open the computer's address instead of
`localhost`. To play a friend, the server has to be reachable by them; where
it is hosted is still to decide (see below).

## Changes outside the web app

- **The plain account of a turn** (used when the AI narrator is off) is now
  built from the narrator's sentences, and a round of fighting reads as men
  lost ("Horse and enemy horse fought: Horse lost 14 men, enemy horse 12")
  instead of the combat engine's numbers. The hotseat CLI is unchanged.
- `npm test` now includes `src/web/**/*.test.js`.
- New scripts: `npm run web`, `npm run test:browser`.

No engine rules changed.

## Not done, or for later

- **Hosting.** The app runs anywhere Node runs; where it lives (and so how a
  friend reaches it) is a decision for Zach.
- **Telling a player it is their turn** when the page is closed (email or
  phone notification): later, as planned.
- **Officer fates in the verdict.** The veterans engine exists, but the
  web battles do not yet carry officers; the verdict shows losses only.
- **Unit names** are the scenario's ("Spears", "Spearmen 2"); real names and
  officers wait for the commanders work.
- **Questions with choices.** A question ("Which ridge: The Crownhill or
  Shepherd's Ridge?") is shown as text; the player rewrites the order.
  Buttons for the choices are a small later step.
- **Pinch to zoom** on the map: the + and − buttons zoom; the browser's
  own pinch zooms the whole page.
- **Labels on crowded maps** can overlap when units stand on neighbouring
  tiles; zooming in separates them.
- **Real art:** everything is placeholder, listed in
  `src/web/themes/parchment/ASSETS.md`.
- **The legacy Discord bot** has not moved to `archive/`; that waits for
  Zach's word, as planned.

## Proposed tag

After merge: `stage-4-complete`.
