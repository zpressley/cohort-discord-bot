# Officers, memory and delegation

Where the design landed, in Zach's words (given 2026-11-21, from the doc
"Cohort: Commanders, Memory and Delegation", which lives outside the repo).
One change of names since: **the Commander is the player**, the point of
view the game is played from, and the men who carry his orders, whom that
doc called commanders, are **officers**. The summary below uses the new
names; nothing else in it is altered.

## The design

**The core idea.** The game is about keeping your people alive across
battles, not winning one. Veterancy lives in officers who survive, so a
pyrrhic victory counts as a real loss. You store memory in your officers the
way a long-married couple stores it in each other.

**Orders come in depths:**
- **Level 1:** the shared vocabulary (move, hold, fortify, scout ahead,
  attack, fall back).
- **Level 2:** one condition ("advance to the ford; if their horse is there,
  hold").
- **Level 3:** multi-step if-then chains.
- **Callbacks:** invoking a battle you fought together ("like at the river,
  hold the center and bring the cavalry around the left").

**An officer's quality is the depth of order he can carry, not combat
stats.** A green officer handles level 1 and drops later clauses. A veteran
holds the full chain, understands callbacks, and fills gaps the way you
would.

**When an officer loses the thread,** three traits decide what happens.
Personality sets the default (an aggressive officer attacks, a cautious one
fortifies), loyalty decides how hard he honors your intent, and experience
decides how well he reads it. Personalities have to be readable so failures
feel fair.

**Determinism stays intact.** Whether an order executes well is a seeded
engine roll weighted by the officer's quality and recorded in the event
log. AI only parses orders and words the results; it never decides
outcomes.

**Memory.** Each officer keeps a record of his battles, the orders you
gave, the situations he faced, and your style. Lose the officer and that
memory goes with him, so his replacement needs everything spelled out.
Washington's Delaware crossing was the example: plans break when
subordinates don't share the commander's picture.

**Counsel.** Before you commit, a veteran can warn you ("the 2nd Spears are
green, they won't hold formation"). Counsel comes from engine forecasts and
the officer's own record, never from hidden information.

**How it ties to time.** Orders take 10 minutes of game time, can't be
recalled once committed, and the clock fast-forwards through quiet
stretches. That's what makes delegation matter: once a long march starts,
the officer is the one who reacts to what he finds.

**Still open (as given):** whether officer quality and unit quality stay
separate (proposed: separate), the exact vocabulary, how deep chains can go,
the personality set, how loyalty is earned, when counsel triggers, how
officers persist across a campaign, and whether they can be wounded or
captured.

## What is built (November 2026)

| Part of the design | State |
|---|---|
| Level 1 orders | Built before this (Stages 2 and 3). |
| Level 2: one condition | Built. Conditions: the unit sees the enemy, or a kind of enemy, anywhere or at the place it is going; it is attacked or shot at; a named unit of your own breaks. |
| Level 3: chains | Built: up to three further steps, walked one by one, with one condition that holds through all of them. A condition on each step is not built. |
| Quality is depth | Built. An officer's grade comes only from battles come through: green (0 to 1), seasoned (2 to 4), veteran (5 and more). |
| The seeded roll, in the log | Built: rolled once as the order is given, on a random stream of its own, logged as `grasp`. The Commander is not told the roll; he learns of it when it bites. |
| Losing the thread | Built for personality: the bold go at the enemy, the cautious stop and hold, the steady carry on with what they remember. Experience weights the roll. |
| Loyalty | Built (November 23). Each officer values glory or survival; each battle moves his loyalty by which; the loyal learn faster, hold to their orders and speak up; the disaffected fight in worse heart and keep less of an order (`docs/DECISIONS.md`). |
| Filling gaps the way you would | Built (November 24) for officers cut off: a veteran or legendary officer no rider can reach acts on his Commander's last order when things plainly change, by his nature, what he holds dear and his loyalty, and is told of in his report (`command/initiative.js`; `docs/DECISIONS.md`, "How officers acting on their Commander's intent were built"). |
| Counsel | Built for two things: an order deeper than its officer can hold, and shaken men sent at the enemy. Given only when a seasoned or veteran officer is on the field. |
| Memory, callbacks | The record is built: each officer keeps, for every battle with his Commander, how it ended, what his men did, what became of him and what he was told. Nothing reads it yet: what a callback does is open. |
| Officers persisting across a campaign | Built in the web app. A Commander's company goes with him from battle to battle: survivors gain experience, the wounded sit one battle out, and every unit but the elite must earn its officer by coming through 3 or 4 battles (`docs/DECISIONS.md`). Only the player who musters brings a company. |

Answered already by earlier rulings (`docs/DECISIONS.md`): officers can be
killed, captured or wounded (October 21), and an officer's quality is
separate from his unit's (October 21).

Where the code is: `src/engine/command/` (officers, and giving a battle its
officers), `src/engine/battle/orders.js` (steps and conditions),
`src/interpreter/` (reading them, and counsel).
