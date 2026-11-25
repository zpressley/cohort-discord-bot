# The web app

Cohort in the browser: the Command Tent. Plain Node, no framework, no build
step.

```
npm run web                    http://localhost:3000
PORT=8080 npm run web
COHORT_DATA_DIR=/some/dir      where battles are saved (default data/web)
DATABASE_URL=postgres://...    saved in Postgres instead (docs/HOSTING.md)
GROQ_API_KEY=...               orders read and turns narrated by the AI
                               (without it: the fixed grammar, plain reports;
                               model and costs in docs/ai/MODELS.md)
npm run test:browser           a full battle in Chromium (needs Playwright)
```

```
battles.js     the battles: muster, seats by link, each side's view (fog of
               war held here), read-back, orders, dispatches, saving and
               rebuilding from the order log, the replay
server.js      the HTTP server: the JSON API (listed at the top of the file),
               the app's files, and /healthz for the host
storage.js     where battles and Commanders are kept: files, or Postgres
               when DATABASE_URL is set; writes queued, in order, retried
import-files.js  copies battles saved as files into Postgres (safe twice)
public/        the browser app: index.html, app.js (screens), map.js (the
               map and its gestures), app.css (layout)
themes/        one folder per theme; parchment is the only one so far. A
               theme is its theme.css variables and its assets (ASSETS.md)
browser/       the Playwright test
tests/         the API tests (part of npm test)
```

A seat's link is the only key to it: whoever holds the link plays that
side. Battles are JSON files; delete one and that battle is gone.

A friend who opens their link to a two-player battle first sees "Who
leads?": their Commanders whose armies are free, a new Commander, or none.
Their orders wait on that choice; once the first turn has run it is closed.

## Making a Commander

"A new Commander" (`/commander/new?then=...`) is one screen: what kind of
commander you are (ten), what you fight for (glory or survival), your
faction for life, and your name (a plain one offered). Every answer is
already chosen; "Take command" makes him and goes on to the muster, or,
from a friend's link, straight into that battle with him leading. A browser with no Commander free to lead is sent there
from the muster. His own page (`/commander/<his link>`, "Your record" on
Your officers) shows his answers, his title, his battles and how he fell.
`docs/DECISIONS.md`, "How making a Commander was built".

## Buying the army

A Commander buys his standard army himself, within his faction's budget,
on the army screen (`/army/<his link>`; from the muster, "Buy your own
army", or from Your officers). It works as the Discord builder did: a unit
at a time (the men, on foot or on horse, weapon, armour, shield), the
supply points left always in view, the elite unit free and not for sale.
Every choice is priced and judged by the server through the engine's
builder (`armies.js`, `POST /api/factions/:id/appraise`); a refused one is
struck through, and tapping it gives the builder's reason. The army is
kept with the Commander on the server (`POST /api/commander/:token/army`),
checked again there, and changed only while his army is home. Changes
not yet kept wait in the browser as they are made (a reload or a link loses
none), the muster says so, and "Undo your changes" drops them. With none
bought, or with "Take the usual army", he musters with his faction's
default army.

The muster offers the kinds of battle the field chosen is fought as
(ruled 2026-11-25; `src/data/maps`, `kinds`, and `kindsOf`), as a choice
with a line on how each is won, the first offered first (on every field
the pitched battle: one line in each map file to swap). Every battle is
to the end, won when the other side yields the field, loses its army, or
loses its Commander:
- **A pitched battle**: no ground to fight for. If night falls first, the
  army still standing with half the men it began the day with
  (`tables.PITCHED.STAND_SHARE`), when the other's is not, holds the field
  and wins; both or neither is a tie, and the next day may be called.
- **A battle for ground**: the field's own ground to fight for (`ground`),
  held alone for an hour; night ends it with no winner. On Crownhill it is
  the three fords, two of them to hold (`hold`); Thornwood's Thorn Knoll is
  the king of the hill, and its muster line says so.
The kind is saved in the battle's spec (`kind`), so a saved battle
replays; the tent says it under the top bar, the list of your battles and
the verdict name it. Against the computer you choose its faction or let
the lot choose (your own among them); against a friend you do not: his
Commander brings his own army.

In a battle for ground the tent marks the ground on the map and says under
the top bar who holds it (with several pieces, one line: who holds which,
how many must be held, and the time left to the side on the clock), the
first dispatch tells it, and the verdict says so when holding it alone for
an hour decided the battle. In a pitched battle that line says how it is
won. The first turn's examples fit the kind: "everyone take the fords" on
Crownhill's fords, the ground's name on a field with one, none in a
pitched battle.

The fields are 1 km (Crownhill, Ashford Vale, Thornwood, Raven Ridge) or
2 km (Greywater: "Greywater (2 km)" in the list). On a 2 km field each army
comes in two lines (`src/engine/army/secondLine.js`): its own, and its
faction's usual army again, raised for the day. The muster says so under
the field; in the tent those units are "Second legionaries" and the like,
all of them answer to "second line", the first turn's examples offer
"second line hold", and they go home after the battle (not on the roster,
not in the company).

The map in the tent opens with your army and the ground to fight for both
in view when they fit at 12 px a tile or more (on a desktop, the 1 km
fields); else at about 15 px a tile on a phone (a 2 km field is then three
screens wide), centred on your army, with a mark at the map's edge ("↑ the
North Ford") pointing to each piece of the ground out of the window: a tap
brings it into view. It moves by finger (drag to pan, pinch to zoom) or by mouse
(drag to pan, the wheel to zoom about the pointer), and by its buttons:
+ and − zoom, ⤢ shows the whole field in the window and, pressed again,
goes back to your army at the zoom you had; ⇕ (phone) makes the map
taller. "Your army" and "You" (top left) bring your army, or the unit you
ride with, into the window; after a turn the map comes back to your army by
itself unless you moved it since the turn began. Labels are placed so they
do not lie on each other, and are never under 11 px on the screen at any
zoom (the map is drawn again for its zoom once a pinch or a button has
done); where there is no room for each its own, as at a fight on a phone,
units share one ("7 of yours, 6 enemy"), and a tap there names them in the
hint under the map. The enemy's read "enemy spears", and his counters
carry a cut corner as well as his colour.

The verdict's table: for each side, men standing of those it went in with
("364 of 400"), men fallen, and how many units broke; under it, each of
your units that broke and what became of it ("Horse: broke twice, and
rallied"; "left the field with 40 men"; "were destroyed"), and the enemy's
units your men saw break, by the names you know them by, and no more. On a desktop the tent fills the
window and the map scrolls inside its own box.

A battle fought on the next day is one battle in Your battles, on the
record and in the officers' records ("fought over two days").

```
armies.js      buying an army: each choice priced and judged, the
               builder's reasons in plain words, the names units are given
```

## The roster

Everything a Commander owns is his roster (`roster.js`): the units he
bought (or his faction's usual army), the units that came to him some other
way (only capture so far), and his elite. At the muster, "Who marches"
(folded under the army line, showing the supply spent and left) lists them
all; a tap leaves a unit at home or brings it. It starts as last time (the
first time, everything bought), so a player who changes nothing still musters
in one tap. What marches may not cost more than his budget; the elite always
marches, free. A unit at home keeps its officer and all it has, and takes
no part.

A unit given in a deal between two players' Commanders goes to the
captor's roster, with its kit, veterancy, training and officer; it costs its
kit's price to march. The army screen shows it under "Taken from the enemy",
with "Let them go". On Your officers, "Move him to other men" moves an
officer to another unit, or in place of the officer there
(`POST /api/commander/:token/officer`). On the army screen, a unit with an
officer has "Name them" (`POST /api/commander/:token/name`); the server
judges the name and says why one will not do. Names are not yet moderated:
they reach other players' screens, always through `esc()`.

```
roster.js      the roster: who marches and what it costs, units taken from
               the enemy (AVENUES: where other ways of gaining a unit go),
               the rules for a unit's name
```
