# The web app

Cohort in the browser: the Command Tent. Plain Node, no framework, no build
step.

```
npm run web                    http://localhost:3000
PORT=8080 npm run web
COHORT_DATA_DIR=/some/dir      where battles are saved (default data/web)
GROQ_API_KEY=...               orders read and turns narrated by the AI
                               (without it: the fixed grammar, plain reports;
                               model and costs in docs/ai/MODELS.md)
npm run test:browser           a full battle in Chromium (needs Playwright)
```

```
battles.js     the battles: muster, seats by link, each side's view (fog of
               war held here), read-back, orders, dispatches, saving and
               rebuilding from the order log, the replay
server.js      the HTTP server: the JSON API (listed at the top of the file)
               and the app's files
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
already chosen; "Take command" makes him and goes on to the muster, or back
to "Who leads?". A browser with no Commander free to lead is sent there
from the muster. His own page (`/commander/<his link>`, "His record" on
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
checked again there, and changed only while his army is home. With none
bought, or with "Take the usual army", he musters with his faction's
default army.

The muster has one kind of battle: to the end, won when the other side
yields the field, loses its army, or loses its Commander. Against the
computer you choose its faction or let the lot choose (your own among
them); against a friend you do not: his Commander brings his own army.

Every field has its own ground to fight for (`src/data/maps`, `ground`):
the muster names it under the field chosen, the tent marks it on the map
and says under the top bar who holds it, the first dispatch tells it, and
the verdict says so when holding it alone for an hour decided the battle.

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
