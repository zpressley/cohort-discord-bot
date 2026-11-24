## 6. Rulings (copy to docs/DECISIONS.md)

Ruled by Zach Pressley, October 14, 2026, unless marked as proposed. Proposed items are recommendations Zach has not yet confirmed. Treat them as open.

**Q1. Movement rate vs. round length.** With 25m tiles, the 40×40 map is only 1 km square, and formed infantry covers about half of it in one 10-minute order. Ruling: keep 25m tiles and make the map much bigger. The game is no longer bound by Discord's limits. Exact size is set in Stage 1. *Proposed:* map size is a per-scenario setting starting around 200×200 (5 km), and the engine uses numeric x,y coordinates internally while players mostly refer to landmarks.

**Q2. Old code archival.** Tag `legacy-final`, then move retired code into `archive/` on `main` with a README. Nothing is deleted.

**Q3. Officer death rate.** *Proposed:* tie risk to exposure instead of a flat rate (low while holding, higher in melee, highest when the unit routs or is overrun), with wounded or captured coming before death in most cases. Playtest targets of roughly 1 in 20 to 30 battles on a winning side and 1 in 5 on a side that routs.

**Q4. Weapon effectiveness.** The engine supports both multipliers and flat bonuses, because having both gives more ways to weight the game. Values come from playtesting. What must be fixed in the spec is how and when each applies. *Proposed:* flat bonuses add to the base value first, then multipliers apply to that total, always in that order.

**Q5. Attacker and defender.** Removed permanently. Two units fighting are both attacking; neither role means anything. Units are Side 1 and Side 2. Advantage comes from position and circumstance: a unit coming down a hill gains, a unit in a worse position is penalized, an ambushed unit is penalized, and chaos and preparedness apply as already designed. Charge momentum belongs to the unit that moved into contact. A guard test keeps role language out of the engine.

**Q6. Unit size and tile capacity.** Armies run from a few hundred to about 1,000 per side. Combat math must be scale-invariant: casualties work as proportions, so 300 against 300 plays the same as 25 against 25, while casualty rates stay realistic and every clash feels like it matters. Units stay small enough that each one's commander has a visible effect; very large units would need several commanders and blur that.

**Q7. Tribal Warriors.** A faction-specific unit (for example, Germanic tribes). Same cost and same fighting ability as Militia, plus a morale bonus so they fight longer and rout less. Effectively fiercely loyal militia.

**Q8. The `training` field.** Removed from the army builder for now. Training tier comes from the quality ladder. Buying training may come back later as a purchase.

**Damage system.** The formula in `combat_design_parameters.md` is inverted against its worked examples. The tested damage rebuild on the recovered branch is the starting point. Where code, tests and worked examples agree, fix the doc to match. Where they disagree, log it for Zach.

**Not yet ruled.** Whether commander quality and unit quality are separate stats (proposed: separate, with the quality ladder governing how a unit fights and the commander governing how deep an order it can execute), and the player-facing coordinate format.

## Rulings, October 21, 2026

Ruled by Zach Pressley in conversation, October 21, 2026. Where a ruling
needs interpreting, the reading is marked as such and stays open until
confirmed.

**Player surface.** A web app, for now. The legacy Discord bot stays as it
is until the web app can run a full battle, then retires to `archive/`.

**Commander quality vs. unit quality.** Separate. Every commander has the
same quality (no commander is better at executing orders than another).
Commanders differ in personality. Unit quality still comes from the quality
ladder.

**Q3. Officer death rate.** It should hurt about 1 battle in 10 on a winning
side and about 1 in 5 on a losing side: a chance each battle, not something
that always happens. Risk also rises with the officer's unit's losses: the
fewer men left in a unit, the more likely its officer was killed in action.
Exact numbers are tuned by simulation to hit those rates.

**Officers captured or wounded.** Both, as well as killed. Capture is a fate
in its own right. A wound is a near miss, or the result of the player's
poor choices, such as leaving a unit exposed.

**AI provider.** Groq. When it fails, the game falls back to the
deterministic order grammar and plain event text.

**Q4. How bonuses combine.** The order (flat bonuses before multipliers or
not) does not matter much. What matters is that results scale well and the
game is fun. The current implementation stands; tune for outcomes.

**Player-facing coordinates.** A coarse grid that is easy to say and read:
letters for columns, numbers for rows. Every square is 100 m on every map
(4×4 tiles of 25 m), split into 4 quarters of 50 m (2×2 tiles). Bigger maps
simply have more squares: a 2 km map is 20×20 squares, Crownhill (1 km) is
10×10. Map features and landmarks do most of the work. The engine keeps its
numeric x,y underneath. (Confirmed October 21.)

**Landmarks and navigation.** Named landmarks started as a way to give the
AI something to describe, and turned into the main way to navigate. That
was not the intent. Players should mostly give orders in general terms
about the ground: "approach the ridge to the east", "stop at the clearing
and set up a defensive position". Named landmarks stay for flavour and
summaries.

## Rulings and direction, October 21, 2026 (after Stage 2)

From Zach's review of the Stage 2 movement changes. Items marked
*direction* set the intent for the next stage; details are open.

**Stacking.** *Direction:* units may share a tile instead of blocking each
other, with penalties once a tile holds more than a threshold, growing
worse the more it holds. This is how an earlier build handled unit
collision, and it replaces one-unit-per-tile occupancy (and the Stage 2
detour rule, which works around it). Starting point: the density table
from the earlier build (`archive/docs/Context/Old Context/cohort_task_list.md`,
STACK-002), with thresholds quartered for 25 m tiles as
`docs/design/architecture-roadmap.md` §6 already planned:

| Tier | Old (50 m tile) | 25 m tile | Penalty |
|---|---|---|---|
| organized | 0-400 men | 0-100 | none |
| crowded | 401-600 | 101-150 | -25% move, -1 combat |
| compressed | 601-800 | 151-200 | -50% move, -2 combat |
| crushing | 801-1000 | 201-250 | -75% move, -3 combat |
| critical | 1001-1200 | 251-300 | -90% move, -4 combat, -2 morale |

Hard cap 300 men per tile. Numbers to be tuned in play.

**Contact and defensive movement.** *Direction:* a unit that comes next to
an enemy is not forced to fight. Units can decide not to engage and move
defensively. Stage 2 made contact stop movement, to end a bug where two
units circled each other for ever; that rule should become a choice the
unit's order or posture makes, not an automatic stop.

**Mutual hold.** For testing, a battle has a time limit. When it runs out,
the army with more casualties loses (implemented as the larger share of
its starting men; men who fled are not casualties; equal is a draw). The
hotseat CLI defaults to 4 hours of battle time.

**Veterancy needs fighting.** A unit earns a battle toward veterancy only
if it saw combat, so the incentive is to fight. Open: how to push that
without bad incentives (for example, throwing units into pointless fights
to farm battles, or a time-out rule that rewards turtling).

**Deployment, hidden foes and posture.** *Direction:* how an army is
deployed matters. A column on the march that runs into a hidden enemy does
not know it is happening. A hidden force in woods may let a few units pass
and then strike the rear. Units on guard, in a defensive posture, may make
an attack not worth it at that moment, and then no attack takes place.
This ties to the contact rule above: whether a fight starts depends on
posture and on who has seen whom, not only on being adjacent.
Ruling: ambushes are ordered by the player (for example, "hold in the
woods and hit anything that passes"); units do not spring them on their
own judgement.
Ruling on hiding: woods and reverse slopes reduce how far a unit can be
seen. On top of that, a unit can spend a turn hiding; once hidden, it is
not seen even by an enemy one tile away unless that enemy checks (searches
the ground).

Hiding and seeing, details (Oct 22):

- **Checking takes a turn**, because time passes. A march does not have to
  stop for it (a scout can be sent into the woods while the column moves),
  but a careful inspection is rewarded when an ambush is expected.
- **Woods cut sight both ways.** Inside a forest a unit sees and is seen at
  1 tile instead of normal line of sight. From the edge of a wood a unit
  can see out, but others cannot see in. So a hidden force in the trees may
  itself miss an enemy creeping up through the woods behind it: if a scout
  sees the enemy go into a wood and stay, the commander can send a flanking
  force through the trees, and it may go unseen.
- **Moving or attacking reveals** a hidden unit.
- **A unit can try to hide almost anywhere** the commander tries to hide
  it. How well it works depends on the ground and the unit, and hiding can
  carry costs (for example, archers hidden in a marsh may shoot worse).
  Ruling (Oct 28): **the engine decides** how well a place hides a unit
  and what it costs, from a fixed table of ground and unit types. **The AI
  fits the player's words to the best matching entry**, like a child's
  shape-sorter: a square block fits the square or the rectangle hole, never
  the triangle. "Hide behind the burning farmhouse" goes to the closest
  kind of cover the engine knows; the AI never invents a new number, and
  without the AI the grammar fallback picks the plain match.

**Objective control.** *Direction, for testing:* holding objectives as a
way to win or score, giving units a reason to move and fight. How it fits
the story is still open.

## Rulings, October 29, 2026 (Stage 3 review)

From Zach's review of PR #9.

1. **A fight holds on.** Disengaging takes effort: a unit breaking contact
   loses a tile of movement, and the enemy gets a parting blow. How hard is
   chance (a chaos roll), so even an orderly withdrawal can go wrong. Drilled
   troops do it far better; the Macedonians under Alexander were so well
   drilled that their manoeuvres alone could intimidate a foe. A careful
   withdrawal halves the harm. Broken units are pursued, as before. (Built:
   `DISENGAGE` in `combat/tables.js`.) *Later:* drill as intimidation.
2. **The player springs the trap, and lingering gives it away.** An ambush
   does not strike an enemy that stops beside it; the player springs it
   ("spears spring the trap", or any order to attack). A hidden unit with an
   enemy right beside it is ever likelier to be noticed: 25% the first turn,
   50% the next, and so on. (Built: `EXPOSURE` in `combat/tables.js`.)
3. **Crowding punishes fighting, not moving.** The density table's movement
   losses drop to 0/10/25/50%; its combat penalties stand.

## Rulings, October 29, 2026 (the web app)

From Zach's answers to the Stage 4 plan.

1. **No "Command Tent Interface Design" doc exists.** The Stage 4 plan and
   its wireframes are the design.
2. **Pace: hours and days.** Battles are played by link over hours or days,
   low stress, with plenty of time to go back and forth. Nothing depends on
   both players being online; no timers.
3. **Look: an old parchment battle map,** in the manner of the HistoryMarche
   channel: units as squares with clear markings, a flat detailed map at the
   centre, a minimal interface, readouts on off-white backgrounds.
   *Direction:* each faction later gets its own interface theme, as Age of
   Empires II dressed its interface in the look of the civilisation being
   played. Everything is designed for themes now; the themes wait for
   assets.
4. **Solo first:** Zach tests alone against the standing orders first, then
   with friends.

## Rulings, November 21, 2026 (after the review)

From Zach's answers to `docs/REVIEW-2026-11.md`.

1. **A human side's units hold by default.** A unit given no order stands.
   It attacks of its own accord only when commanded to: an order to attack
   on sight, to seek and destroy, or a related attack order, which lasts
   until countermanded. (The computer's side keeps its standing advance.)
2. **Battles should last longer.** Ten to fifteen player turns is fine for
   testing; the real game can run longer. Pace is tuned up, not down.
3. **Ranged fire: yes, now.** Archers and other missile troops shoot.
4. **Remove the `grog` package** and **move the Discord bot to `archive/`**
   (the web app can run a full battle, as ruled October 14).
5. **Battle length.** Two to three hours of battle time (about 12 to 20
   player turns) is a fine target, especially for testing. (Same day,
   second round of answers.)
6. **Rallying and morale.** This replaces locked decision 5's "morale only
   goes down". In Zach's words: "Broken unit can rally at a safe distance
   and if not pursued. Morale only recovers with nearby success or a
   commander's presence."
   - A broken unit rallies (stops running and forms up) once it is a safe
     distance from the enemy and no one is chasing it.
   - Morale itself comes back only from success nearby (friends breaking an
     enemy close by) or from a commander's presence. It does not come back
     with time or rest.
   - Reading (Claude's, not ruled): commanders are not on the field yet, so
     the commander's presence waits for them; until then nearby success is
     the only way morale rises. A rallied unit comes back shaken, not fresh.
7. **Damage stays as it was.** (Third round of answers, after a first build
   that slowed all fighting to 40%.) "The design direction was for the
   ability to go longer, not for the whole experience to change. Remember
   human players might not dive in to combat right away."
8. **A unit may rally more than once.** "The combat fatigue threshold is
   the right limiter, but have it impact the overall morale formula so
   that it's not always 30% and some veteran units rally because they are
   more experienced."

9. **No limit on arrows, for now.** "From a balance standpoint limiting
   arrows would need more damage up front or factions with ranged based
   unique units have a major disadvantage ... the stopping to fire is
   enough to keep them from being too hard to counter."
10. **Horse archers need reduced numbers to be fair in fights.** They are
    the ones who do not have to stop to shoot.

11. **Names.** "The original commander was literally the player's pov and
    I want a name for that; maybe call commanders officers moving forward."
    The Commander is the player. The men who carry his orders are officers.
    - Reading (Claude's): the October 21 ruling "every commander has the
      same quality ... commanders differ in personality" is about players.
      Officers differ by experience, as the design says.
12. **Officers, memory and delegation.** The design is recorded in
    `docs/design/officers-memory-delegation.md`, with what is built.

### How the pace rulings were built (Claude's choices, open to change)

The numbers are in `src/engine/combat/tables.js` (`PACE`, `RALLY`, `HEART`),
tuned with `npm run soak` and 32 battles through the web app's own code.
With them, and ranged fire below, a battle runs about 9 player turns and
100 minutes of battle time when both sides charge at once, and about 12
turns and 150 minutes when the player holds and lets the enemy come; it
ran 5 turns and 50 minutes. A fight between two units is as
sharp as it was.

- **A tick of a battle is one combat round**, as before. `PACE.PER_TICK`
  (and `combatPace` on a battle's spec) can slow every fight; it is at 1.
- **A unit fighting several enemies splits its effort.** Each enemy takes
  its share of the unit's blows; the unit takes all of theirs. Before, one
  unit against three dealt its full weight to each.
- **Safe distance is 6 tiles (150 m)** from the nearest formed enemy. A
  unit does not rally in the tick it broke.
- **How worn a unit may be and still rally.** Its condition is the share
  of its men still standing, times its fatigue (1 when fresh, down to 0.5
  when spent). It rallies while that is at least 0.64 divided by its
  morale resistance: the same divisor the morale formula uses, made of the
  quality tier and what a veteran unit has earned. Fresh, that asks 64% of
  their men of levies, 46% of militia, 30% of professionals and tribal
  warriors, 22% of the elite; tired units need more.
- **Rallying does not raise morale.** A rallied unit is as shaken as when
  it broke, and will break at the next blow unless it takes heart first.
- **Taking heart: +8 morale** to every unit within 6 tiles of an enemy
  unit that breaks or is destroyed, never above the starting morale.
- **The verdict.** A side is in the battle while it has a steady unit:
  formed up, and not shaken (rallied without having taken heart since).
  With none it is beaten. If neither side has one, the field goes to the
  side with more men still in the ranks; a draw only if neither has a
  formed man left or they are exactly even (asked by Zach: "how often do
  both sides break ... that does not logically make sense"; it was 2
  battles in 960, and in the one examined the unit that had just won the
  last fight was counted as beaten). (The
  first build waited on any broken unit that could still rally. Once
  archers could break a shaken unit from a distance for the loss of a man
  or two, the tail of a battle ran to ten hours, so it was changed with
  ranged fire.)
- **Under the computer's standing advance, a rallied unit that is still
  shaken holds** behind the steadier units until it takes heart.
- **A unit rallying ends the player turn**, like a sighting: it is back in
  hand and wants orders.
- **Found on the way:** what a veteran unit had earned (`veteranResistance`)
  was dropped when the unit was put on the field, so veterans fought and
  broke like new troops. It is carried now.

### How ranged fire was built (Claude's choices, open to change)

Ruling 3 above: missile troops shoot. The numbers are `MISSILES` in
`src/engine/combat/tables.js`; the rules are `src/engine/combat/ranged.js`
and the missile step of `src/engine/battle/battle.js`.

- **Who shoots.** A unit whose weapon reaches 100 m or more: bows, slings,
  crossbows. Javelins, pila and throwing axes are thrown in the charge and
  stay inside the melee tables.
- **How far.** The weapon's range in the tables (a composite bow 200 m, a
  basic bow 125 m, a sling 300 m), and no farther than the unit can see.
- **When.** Every ten-minute tick, without being told, at an enemy it can
  see within reach, if it stood still that tick (horse archers may ride)
  and is not itself in a melee (the design's rule). Not while hidden or
  lying in ambush.
- **At whom.** The nearest enemy in reach, or first the kind it was told
  to shoot ("archers shoot the horse"). "Hold fire" stops it.
- **Into a melee: yes, at half effect, and no friend is harmed.** The
  first build forbade it and the archers loosed one volley in a whole
  battle, because armies close from sight to contact in one tick.
- **How hard.** Light beside a melee: a hundred bowmen at close range fell
  about three men in medium armour a volley, five unarmoured, one or two
  in heavy; a round of melee costs each side about ten. Less past half
  the weapon's reach, against big shields, and into trees. The losses
  shake morale by the ordinary formula, and a unit can break under fire.
- **Arrows do not run out** (ruled, 9 below).
- **Horse archers are raised at 60% of their tier's men** (ruled, 10
  below; the 60% is Claude's starting number). They also shoot at 60%
  effect while riding.
- **"Advance" for missile troops** means close until they can shoot, and
  stand there shooting. The computer's archers do this now.
- **A volley ends the player turn**, like contact.
- **Not done:** an order to attack or follow a named enemy unit hand to
  hand (the rest of L10 in the review).

### How officers and deeper orders were built (Claude's choices, open to change)

The design is Zach's (`docs/design/officers-memory-delegation.md`); these
are the particulars it left open, as first built.

- **Grades:** green at 0 to 1 battles, seasoned at 2 to 4, veteran from 5.
- **What an officer keeps.** The chance he holds the first clause beyond
  the plain order, the second, and the third or later: green 35%, 10%, 5%;
  seasoned 90%, 55%, 25%; veteran 100%, 95%, 85%. A condition is the first
  clause, then each further step. A step lost takes the later steps with
  it.
- **Depth:** at most three steps after the first, and one condition.
- **Personalities:** bold, steady, cautious. Losing the thread, the bold go
  at the enemy (if one is in sight), the cautious stop and hold, the steady
  carry on with the order they remember (and hold when nothing is left of
  it).
- **Conditions:** sees the enemy or a kind of enemy (anywhere, or within 3
  tiles of the place the order goes to); attacked or shot at; a named unit
  of your own breaks. Judged from what that unit can see for itself.
- **The roll is not shown.** It is in the event log; the Commander learns
  of it when the moment comes and the officer does something else. Counsel
  is how he can see it coming.
- **Counsel** is given by the most experienced officer on the field, and
  only if one is at least seasoned.
- **A battle's officers** are drawn from its seed: the elite's is a
  veteran, the rest run from green to seasoned with now and then a veteran.
  Names come from the unit's culture (placeholder lists).
- **Orders are given once per player turn.** The turn loop used to hand
  the same orders in again every ten-minute tick.

### One vocabulary (asked by Zach, 2026-11-21: "make sure language is consistent throughout the app")

The words the app uses to the Commander are in one place,
`src/narrator/words.js`, and the read-back, the Army tab, counsel and the
dispatches all take them from there.

| The thing | The word |
|---|---|
| The player | the Commander |
| The man who carries his orders to a unit | an officer (green, seasoned or veteran; bold, steady or cautious) |
| The other side's player | your opponent; its forces are the enemy |
| The side with no player | the computer |
| The computer's Commander | his name, "said to be" bold, steady or cautious (an officer's natures) |
| The engine's move, hold, advance, attack, withdraw, hide, check, ambush | march, hold, advance on the enemy, attack, fall back, hide, search, lie in ambush |
| Go somewhere and hold it (the engine's defend) | march to ... and hold it |
| Missile troops | shoot, hold fire |
| Morale above 50, 50 or under, 25 or under | firm, wavering, at breaking point |
| What becomes of a unit | broke, rallied, left the field, destroyed |

Changed to fit: the read-back said "move Miller's Crossing", the Army tab
"moving to", a dispatch "made for"; a unit at 25 morale was "at breaking
point" in one place and "badly shaken" in another; a unit "escaped the
field" or "left the field"; an army that lost four men in five had
"collapsed" (now "was destroyed", as a unit is); the computer opponent was
"the standing orders". "Steady" is kept for an officer's nature, so morale
uses "firm".

### How the thinking opponent was built (Claude's choices, open to change)

L3, L5 and L12 of the November review. The code is `src/opponent/planner.js`
and, for what "advance" knows, `src/engine/battle/battle.js`.

**What "advance" knows (the engine, so it holds for a Commander's units
too).** A unit told to press the enemy used to know where every enemy
stood. Now:
- It makes for the nearest enemy its side can see; failing that, the
  nearest place its side last saw one; and it gives a place up once it has
  stood there and found no one.
- With nothing known it goes and looks: straight ahead to the enemy's side
  of the field, then the ground no one has looked over, nearest first.
  Ground is looked over when a unit could see an enemy standing on it, so
  a wood has to be walked.
- Men who are shot at know where it came from, though they cannot see the
  archers.

**The computer's side.** Each player turn it gives its units orders, the
same orders a Commander can give, from what its side has seen. No AI model
is asked anything; the same battle always gets the same opponent.
- **Hold, or come on.** If there is good ground ahead of where it formed up
  (an objective; else a crossing or a hill, within 16 tiles ahead and 9 to
  a side), it holds it about two battles in three, by the battle's seed. A
  crossing is held from the near bank, a hill from the top.
- **Patience.** A side that holds waits 90 to 170 minutes of battle (by
  the seed), then goes to find the enemy. It also stops holding once blows
  have been struck.
- **The line.** Foot abreast, a tile apart, the best in the middle; archers
  two tiles behind; horse off one flank (which, by the seed). Each on its
  own dry ground, so the army no longer piles onto one tile (L5).
- **Going in.** With the enemy within 7 tiles the foot go in together and
  the archers stand off and shoot. Coming on, it forms up 5 tiles short of
  the enemy first.
- **Horse** go for archers they have seen within 10 tiles.
- **A unit near breaking** (morale 30 or under) is pulled out of the fight
  if a steadier one is within 2 tiles to cover, and kept out while any
  steadier unit remains.
- **No reserve.** Keeping the best unit behind the line was tried and
  dropped: it lost more often.

**How good it is.** Over 384 battles on all four maps, both scenarios and
both sides, it beat the old opponent (every unit straight at the enemy) in
235 and lost 149. Holding good ground is what does it: made to hold always
it won 62% of 384, made never to hold it won no more than the charge. It
beats a commander who gives no orders about nine times in ten, and against
itself the two sides come out even (31 to 33 in 64).

**What it cost.** A silent side that falls back into a big wood now has to
be searched for, so the soak's cap went from 60 player turns to 150. The
soak also plays the computer's side against three kinds of commander on
every map.

### How officers who go from battle to battle were built (Claude's choices, open to change)

"The game is about keeping your people alive across battles, not winning
one." The code is `src/engine/command/company.js` (the rules, pure) and
`src/web/commanders.js` (where they are kept).

- **A Commander is a private link**, as a battle's seat is: no account. The
  browser is given one when it musters with a new Commander and keeps it;
  the server keeps the company under it (`data/web/commanders/`). A browser
  can hold several, and the muster asks which one leads.
- **One battle at a time for each army** (ruled November 22). A Commander
  whose army is in an unfinished battle cannot muster; the muster offers
  the others, or a new one. Yielding a battle frees the army.
- **A Commander has a name** from the plain list of names, only to tell
  one from another. It stands in until how a Commander is made is settled
  (`docs/design/commanders-lore-and-tutorial.md`).
- **The company leads the mustering player's side.** Each unit gets the
  officer who led that kind of unit last time; failing that the most
  experienced named officer whose own men are not on the field.
- **The first company** has one named officer, a veteran, with the elite
  unit; every other unit's officer is unknown (ruled November 22, below).
  The battles in the web app have no elite unit yet, so there the veteran
  is with the best unit, the first listed.
- **After a battle,** by the fates the engine already decides (October 21):
  one who came through gains one battle's experience (the grades are
  unchanged: green 0 to 1, seasoned 2 to 4, veteran 5 and more); one
  wounded gains it too, and sits out the next battle; one killed or taken
  leaves the company, which keeps who he was on a roll and nothing else.
  His men fight their next battle headless (below).
- **His record is his memory.** For each battle: which it was and how it
  ended, what his men did (from the engine's log, the same facts the
  dispatches are written from), what became of him, and the orders the
  Commander gave him, in the words they were read back in. Nothing uses the
  record yet but the Officers page; it is what memory and callbacks will
  read.
- **Not settled, and asked of Zach:** how loyalty is earned and what it
  does; what a callback does; whether a friend who joins by link brings his
  own company (for now only the player who musters does). Whether an
  officer may be in two battles at once was settled on November 22: no.

## Rulings, November 22, 2026 (Commanders)

Zach, on reading how officers go from battle to battle:

1. **A new player comes in through the tutorial, and the tutorial is woven
   into the lore.**
2. **"When your commander dies you actually lose everything and have to
   restart."**
3. **"You can only have 1 commander at a time."** Relaxed the same day:
   "people can have more than one game going at a time but that army can
   only fight one battle at a time." So a player may keep several
   Commanders, each with an army of his own; an army in a battle cannot be
   mustered for another until that battle ends.

4. **A new Commander's officers.** "There will be a tutorial and the new
   commander gets a veteran officer for the unique elite unit, you meet
   during the tutorial and win over that officer, the rest you earn
   throughout the game." Built as: one veteran, with the elite unit; every
   other officer starts green and earns his grade in battle. (Claude's
   reading of "the rest you earn"; the other reading, that the other units
   have no officer at all until one is earned, is open to Zach.) Until the
   tutorial is built the veteran is there from the first muster.
   *Answered by ruling 7.*

5. **What kills a Commander.** "If a commander's unit is attacked and it
   gets below a threshold the commander can be killed or captured. It's low
   odds and not possible till a threshold."
6. **Capture.** "Capture means he has to negotiate with the enemy team he
   can bargain units. But the other side of this is the units are still in
   a battle, the captured commander can negotiate and leave the field or
   wait and his units may win the battle and force a surrender even with
   their commander captured.... the risk is if you lose all your troops and
   get captured you don't have much to bargain with or for."
7. **New officers are unknown.** "Worse than green, unknown. Named officers
   come with veterancy so new units are completely green. There is an
   officer but he is just as green, can die early and leave the unit
   headless or just be a liability. Officers are named (created after a few
   battles)."
8. **The ten kinds of commander, and glory or survival,** "are to introduce
   the lore and create the name. The name is unique and when we do stats
   and such each name must live on in the record books. Sort of a final
   addition but know it's coming if we need to build towards it."

What the earlier docs say on each, and where the web app stands against
them, is in `docs/design/commanders-lore-and-tutorial.md`.

### How the Commander on the field and unknown officers were built (Claude's choices, open to change)

The code is `src/engine/command/commander.js`, `src/engine/command/company.js`
and `src/web/battles.js`. The numbers are in `tables.COMMANDER`.

**The Commander on the field (rulings 5 and 6).**
- He rides with his best unit: the elite, else the best, the first listed.
  It is the unit his veteran leads. He cannot yet be told to ride with
  another.
- **The threshold is half strength**, not the quarter of the old design:
  units in this engine break at about half, and over 160 battles a
  Commander's unit was struck under a quarter in only 4. Each ten minutes
  his unit is struck hand to hand, or cut down as it runs, while at or
  under half, he falls on a 10% roll; arrows alone never take him. Of those
  who fall, one in four is killed and the rest are taken.
- If his unit is destroyed around him the roll is 50%; if he comes through
  it, or his unit leaves the field, he gets away to another of his units.
- **Measured over 720 battles** (three kinds of player against the
  computer): taken in about 1 battle in 30, killed in about 1 in 150. A
  Commander whose unit stays out of the fight cannot fall.
- **Killed:** the battle is lost at once, the Commander and his company are
  ended, and he can never be mustered again. He and his company stay on
  the server, for the record books.
- **Taken:** he sends no orders; his units carry on with the ones they
  have. He is free again if the unit that holds him breaks or is
  destroyed, or when his army wins ("force a surrender").
- **Bargaining:** while held he may give up one of his units still on the
  field and leave it. The battle is lost; the unit's officer goes to the
  enemy and is gone from the company.
- **Held when the battle is lost:** the enemy takes the best unit he has
  left on the field as his price. With none left he has nothing to bargain
  with, and is lost exactly as if killed.
- **Not built:** haggling between two players (the captor asking for more,
  or refusing). The price is always one unit, and the enemy always takes
  it. Only the player who musters has a Commander on the field; a friend
  who joins by link has none yet.

**Units with no officer (ruling 7, and the ruling of November 23 below).**
- A new Commander has one officer: the veteran with his elite unit. No
  other unit has an officer until it has earned one.
- **A unit with no officer keeps the plain order and nothing more.** That
  is "worse than green": a green officer keeps a first clause one time in
  three.
- **Earning one:** each battle a unit comes through with no officer counts
  toward one. At 3 battles an officer may come forward from its ranks (an
  even chance); at 4 one does (`EARNED_AT` in `command/officers.js`). He
  has a name, a nature, and the unit's battles for his experience, so he
  comes as a seasoned officer. A unit destroyed in a battle starts its
  count again.
- **Losing one:** a unit whose officer is killed, taken or given up to the
  enemy must earn another from nothing. One whose officer is wounded fights
  the next battle without him, and he comes back.
- An officer whose own men are not on the field takes a unit that has none.
- What this replaced, built the day before and gone: officers who were
  there from the start but unnamed until seasoned.

**Names (ruling 8).** No two Commanders on a server ever share a name,
living or fallen; when the plain names run out they come round as
"Garrick II". A fallen Commander is kept with his company and their
records. The two questions that make a Commander, and the record books
themselves, are not built.

## Rulings, November 23, 2026

1. **"The rest you earn": no officer until the unit has 3 to 4 battles of
   veterancy.** Asked whether the other units start with green officers or
   with none: "yes no officer until 3-4 battles of veterancy."
2. **"The elite unit is the unique unit of the faction, you get it for
   free."** This is the army builder's rule already (`engine/army/builder.js`:
   one elite arrives free with each army, by culture). The web app's muster
   does not use the army builder yet: its battles are fixed armies with no
   faction and no elite unit, so the veteran and the Commander ride with
   the best unit there is. Bringing factions and built armies to the muster
   is the work that makes this ruling visible.
3. **"Don't start tutorials till the game is solid."**
4. **"Reminder the commander represents the player's pov."** What happens
   to the Commander is now told to his own side as "you" (`toTheCommander`
   in `narrator/turnNarrator.js`); the other side hears it as its own men's
   doing. Still true of the app, and not yet squared with this ruling: a
   Commander sees everything any of his units can see, at once, wherever he
   is, and goes on seeing it while he is in the enemy's hands.
5. **"Merge a pull what you need", and work with other agents in
   parallel**, with instructions left in the folders that matter: the
   `CLAUDE.md` at the top of the repository and in `src/engine`, `src/web`,
   `src/interpreter`, `src/narrator` and `src/opponent`.


### How the friend's Commander was built (Claude's choices, open to change)

Asked for: in a two-player battle, the friend who joins by link brings a
Commander as the mustering player does, so both sides have something at
stake. The code is `join` in `src/web/battles.js`, `whoLeads` in
`src/web/public/app.js`, and `POST /api/seat/:token/join` in `server.js`.

- **The friend's first screen is "Who leads?"**: their Commanders whose
  armies are free (the fallen and those in the field are not offered), "A
  new Commander" (one tap: it is made and chosen at once, and kept in the
  friend's own browser, as the mustering player's is), and "Without a
  Commander". Their orders, and the read-back, are refused (409) until they
  have chosen. Once the first turn has run, or the battle is over, the
  choice is closed (409). The mustering seat never chooses here: it chose
  at the muster.
- **The same refusals as the muster:** a Commander who has fallen, or whose
  army is in a battle (this one included), is refused with the muster's own
  409 and words (`mayLead`, taken out of `muster` unchanged).
- **From then on the friend's side is the mustering side's:** their
  company's officers lead their units (`musterOfficers`, as at the muster),
  their Commander rides with their best unit and can be taken or killed,
  their army is in the field until the battle ends, and `settle` writes the
  battle, and the Commander's own fate, into their company. `settle`, the
  verdict and the dispatches already went side by side; nothing in them
  needed changing. "Both commanders killed" ends in a draw and ends both
  companies (tested), and each side is told its own fate as "you" and the
  other's as its own men's doing (tested in the narrator).
- **Entering the spec.** A battle is its spec, seed and order log, and the
  officers and the Commander are in the spec. At the muster the friend's
  side gets officers drawn from the seed, as before. When the friend
  chooses, no turn has run yet (the choice is closed after the first), so
  the game is made again: the spec with the friend's officers and Commander
  put in, the same seed, and the order log so far played back into it
  (which can only be the mustering player's first orders, if sent). The old
  game is thrown away and the battle is saved as one spec and one log, like
  any other, so a restart replays it exactly. Safe because nothing that a
  turn decides has happened yet: orders only wait in the log until both
  sides are in, and the mustering side's reading of them never depended on
  the other side's officers. Tested: a battle joined after the mustering
  player sent orders, played on, then the server restarted, gives both
  seats the identical view.
- **The friend's first veteran** is drawn with a seed of the side's own
  (from the battle's seed), so the two sides' new veterans are not given
  the same name by the same draw.
- **A seat with no Commander** (the friend taps "Without a Commander", or
  their browser cannot keep anything) fights exactly as a new Commander
  would: one veteran with the best unit, no officer on the others, and a
  Commander on the field who can be taken or killed; nothing is written
  anywhere after the battle. Chosen as the simplest fair rule: both sides
  face the same risks and have the same officers as a new player, and
  refusing gains nothing. (The other reading, officers from the seed and no
  Commander on the field as before, gave the side that refused full
  officers and nothing to lose.) A browser with storage off can still tap
  "A new Commander": the server makes him; only the link is not kept.
- **Fog of war:** a seat's view has only its own side's Commander and
  officers; the other side's company, Commander, names and link never
  reach it, before or after the battle (tested).
- **Unchanged:** a battle against the computer, and a battle mustered
  without a Commander (the API only; the app always sends one). Battles
  saved before this change have no friend's choice pending and play on as
  they were.
- **Not built:** the friend cannot see which Commander leads the enemy
  (none is told); a friend who never opens the link holds the battle at
  turn 1, as before.

### What the independent review found, and what was done (November 23)

A second agent reviewed everything merged in pull requests 18 and 19 with
no knowledge of how it was built, and proved each finding by running it.
All of these are fixed, each with a test:

- **A server that stopped between a battle ending and its being written
  into a company** could count the battle twice and free an army still in
  a battle. Now the battle is saved before any company is touched; writing
  a battle into a company twice changes nothing (`company.settled`); and a
  server coming up finishes what was left half done.
- **An army was "home" as soon as its battle was decided**, though the
  last dispatch (which can wait on the AI) is written before the company
  is. A Commander could muster again in that moment, even one just killed.
  Now it is home only once the battle is written into the company.
- **Two requests at once for one battle** could each run a turn. Now they
  run one after the other.
- **On a field without his own kind of unit, the veteran took the first
  unit listed** while the Commander rode with the best. Now a spare
  officer takes the best unit without one, and the Commander rides with
  his most experienced officer.
- **A Commander who only got away to another of his units stopped the
  turn**, which told the enemy something had happened. It no longer does.
- **Held, he could not yield.** He can: "I yield" is read, and there is a
  button.
- A muster that could not be made (ground to hold that is not on the
  field) changed the company anyway and answered as a server fault. It now
  changes nothing and says what was wrong.
- A request body that was JSON but not an object crashed the request.

Put to Zach, not changed: a held Commander can always buy his freedom with
a unit that has no officer, which early on is every unit but the elite and
so costs his company nothing; while the price taken from him at a defeat
is his best unit, the elite with its veteran.


### How attacking a named enemy was built (Claude's choices, open to change)

Review items L10 ("an attack order may name a seen enemy unit; the unit
follows it while it stays in sight") and L11 ("say where they will stop in
the read-back").

- **The order.** An attack may carry `enemy`, an enemy unit's id
  (`battle/orders.js`). Each tick the unit makes for that enemy while its
  side can see it; else for where its side last saw it (`state.lastSeen`);
  once a unit of its side has stood there and found no one (the same memory
  "advance" goes by), it presses the enemy as a plain advance does
  (`toPress`, `whereToLook`), and goes for the named enemy again if it is
  seen again. It never steers by where an unseen enemy truly stands. The
  order never finishes, as advance does not: reaching the place last seen is
  not "arrived", and it does not stop the clock early.
- **When the enemy is gone.** Destroyed, broken or off the field: the order
  becomes a plain advance (careful and any condition kept) and the unit's
  own side is told so (a new private event, `quarryGone`). Guess: a broken
  enemy counts as gone. The other reading was to chase it as it flees; the
  engine's pursuit already does that, and an enemy that rallies is pressed
  by the advance anyway.
- **Missile troops** told to attack a named enemy shoot at that one first.
- **Seen kinds.** To let a Commander say "their archers" for an enemy whose
  id is `blue_unit_3`, a side's intel now records what anyone seeing a unit
  could tell: its role, whether it is mounted, and its weapon
  (`orchestrator/fogOfWar.js`). Nothing decides anything by it.
- **Reading it.** The grammar reads "horse attack their archers", "spears
  charge the enemy swords", "swords go for the archers", "horse ride down
  their slingers": after attack, charge, assault, engage, hit, strike or fall
  on, the words must mark the enemy ("their", "enemy") or name a kind of
  troops; "go for", "go after", "ride down" and "run down" are always an
  enemy. "Attack the ford" and "attack the enemy" read as before. Only an
  enemy the side's intel carries (in sight or last seen) can be named, by
  kind or by a word of its name ("swordsmen" for the enemy swords); nothing
  seen that fits is a question listing what has been seen; two that fit is a
  choice, each option written back as "archers at D2-SE", which picks the
  one seen nearest that square. The read-back: "red_horse: attack
  blue_archers, in sight at D2-SE" (the web app's names make it "attack
  enemy archers"); the Army tab says "attacking enemy archers".
- **The AI reader** has one more field, `enemy` (the name as listed under
  "Enemy seen", or null), defaulted to null for replies without it. The
  briefing now says what kind each seen enemy is. A live benchmark run is
  owed: it was not run.
- **The computer's side is unchanged.** Its horse still attack the square
  where they see archers; it gives orders afresh every player turn, so the
  named order would only help within the ticks of one turn, and that win was
  not measured. Left alone.
- **L11.** "Fall back" with no place named now reads back where each unit
  will stop, from the engine's own home target: "fall back to your own edge
  of the field at A3-NW, 100 m west, and hold there". The reader needs the
  side's home edge in its context (`homeEdge`); the hotseat gives it. The web
  app's reading context does not carry it yet (one line in
  `web/battles.js` `context()`, left for whoever owns that file), so there
  the read-back says "fall back to your own edge of the field, and hold
  there" without the squares.
- **Measured.** A battle that never gives the order runs exactly as before:
  whole event logs of four computer-against-computer games and three meeting
  battles fingerprinted against the code before the change
  (`harness/tests/attack-named-unchanged.test.js`). The balance matrix is
  unchanged; the soak ends every game.

### How factions at the muster were built (Claude's choices, open to change)

Builds ruling 2 of November 23 ("The elite unit is the unique unit of the
faction, you get it for free") and ruling 4 of November 22 (the new
Commander's veteran is with the elite unit). The ten kinds of commander,
glory or survival, and the tutorial are not built (ruled: later).

**What it is.**
- **A Commander belongs to a faction**, chosen when he is made and his for
  life (`commanders.js`: `create({ faction })`, `setFaction`, which refuses a
  change). A Commander made before factions takes one at his first muster
  that names one, and keeps it. His army is always his faction's.
- **The army** is the faction's elite unit, free, plus a standard army
  bought within the culture's budget, defined as data in
  `src/data/factions.js` and built through `engine/army/builder.js` by
  `engine/army/factions.js`, so the budget and permitted kit are checked
  on every muster. The elite is not bought, but its kit is checked as if
  bought by the best troops that can be (so it carries only what its
  culture may field); it is raised at the elite's one size (80). Adding a
  faction is adding an entry; a test fails if it breaks the builder's
  rules.
- **The muster** asks: the field, the kind of battle, the opponent, which
  Commander leads (or a new one, with his faction), and the enemy's
  faction (by default another, drawn from the battle's seed; or chosen,
  for either opponent). The scenario still decides the map, each side's
  home edge and deployment ground, objectives and the time limit: each
  army is formed up (foot in a line with a foot elite at its centre,
  missile foot a step behind, horse on the wings) and set down by
  `map/deploy.js` as the scenario's own armies are. The battle is titled
  "Crownhill: Macedon against Rome".
- **The friend who joins by link** brings his own Commander's faction's
  army (the side's units are replaced before the first turn, through the
  same rebuild `join` already does); a new Commander chooses his faction
  on the "Who leads?" screen, the army the muster gave that side first;
  with no Commander, the muster's army stands. Both paths give out
  officers through one helper, `leadSide` in `battles.js`.
- **Names.** Each unit's id carries the name a player would say
  (`red_sarissa_foot_2` is "Sarissa foot 2"). Two of a kind are numbered;
  the bare name orders both. Every unit answers to its full name.
- **A muster with no Commander and no faction is unchanged**: the
  scenario's own armies, as before (tested). The existing tests that
  muster without a faction run exactly as they did.

**The four factions, and why these.** Three that fight differently and one
with its own flavour, from cultures the builder already prices:

| Faction | Standard army (SP) | Elite, free | Plays as |
|---|---|---|---|
| Rome | legionaries (professional, gladius, medium armour, big shield), hastati (militia, same kit), slingers (levy): 26 of 30 | praetorians: gladius, heavy armour, big shield, on foot | heavy foot |
| Macedon | two sarissa foot (professional pikes), hypaspists (professional spears): 30 of 30 | companions: sword, medium armour, mounted | pike line and a horse guard |
| Sarmatia | two horse archer units (tribal, bows), raiders (tribal horse, swords), spears (levy foot): 30 of 30 | scale riders: sword, heavy armour, mounted | horse and bow |
| Han | crossbows (professional), spears, swords (militia): 25 of 30 | Yulin guard: dao, heavy armour, on foot | crossbows that pierce armour |

The elites follow the old per-culture design
(`docs/Context/Old Context/elite_units_warp_format.js`) where the builder
allows: the builder gives the kontos only to Persia and Parthia, so the
scale riders carry swords; Macedon's elite there was the Silver Shields on
foot, and the Companions were taken instead to give Macedon horse.

**How the armies were chosen.** The first set (each spending its whole
budget, Han with two crossbow units) was lopsided: Han won 88 to 96% of
its pairings, Rome beat Macedon 98 to 3. Four candidate armies per faction,
all legal, were played pairwise (8 seeds, two maps, both ways round) and
the set whose worst pairing was nearest even was kept. Not every army
spends its budget: spending Han's last SP on slingers made it win four
battles in five. Slingers (300 m) are the strongest buy for their price.

**Measured** (`node src/harness/faction-league.js`): every faction against
every other, both sides played by the computer, each side with a Commander
riding with its elite unit, 20 seeds, both ways round, on all four maps,
960 battles. Every battle ended.

| Pairing | Wins | Draws | Player turns |
|---|---|---|---|
| Macedon v Rome | Macedon 45%, Rome 55% | 0% | 13.9 |
| Rome v Sarmatia | Rome 43%, Sarmatia 57% | 0% | 14.1 |
| Han v Rome | Han 60%, Rome 40% | 0% | 19.2 |
| Macedon v Sarmatia | Macedon 63%, Sarmatia 38% | 0% | 13.5 |
| Han v Macedon | Han 52%, Macedon 48% | 0% | 14.2 |
| Han v Sarmatia | Han 53%, Sarmatia 48% | 0% | 14.6 |

No pairing is worse than 63/37. Average 14.9 player turns, 258 battle
minutes.

**The Commander with his elite unit** is taken in 1 battle in 16 and killed
in 1 in 32 (1,920 Commanders). Measured the same way (computer against
computer, both sides with a Commander) the generic armies, where he rides
with the best unit, give 1 in 24 and 1 in 44 (960). The `COMMANDER` note's
1 in 30 and 1 in 150 were against three kinds of player, not the computer
on both sides. So the elite unit is somewhat more dangerous to ride with:
it is in the line, and fights longest. By faction: with the Companions
(mounted) 1 in 14 taken and 1 in 23 killed; praetorians 1 in 17 and 1 in
40; scale riders 1 in 18 and 1 in 40; Yulin guard 1 in 15 and 1 in 32.
Combat was not retuned (the balance matrix is unchanged).

**Also changed.**
- `interpreter/resolve.js`: "spears and archers hold" ordered only the
  archers (the whole phrase matched one unit by its kind before it was
  split on "and"). Names joined by "and" are now split first. It showed
  with the generic armies too.
- The order reader is given a unit's own aliases as well as its shown
  name (`context` in `battles.js`).
- The soak plays every faction's army against every other on every map
  (288 battles). A standoff found on the way, not reachable in the app:
  with both sides given a Commander, a computer side whose Commander was
  taken sends no orders, and against a player who sends none either the
  battle never ends. The soak now musters as the app does (no Commander
  for the computer's side). Between two friends the same standoff could
  happen; the default four-hour day ends it.

**Guessed.** "His army is that faction's" was read as a fixed default army
per faction until an army screen is asked for; the other reading is that a
player buys his standard army. "The kind of battle" is still the
scenario; with armies from the factions the two scenarios differ only in
their names ("Legions and Celts" no longer says who fights).

**Open, for Zach.**
1. Should a player buy his standard army (the builder's budget), or is a
   default army per faction enough for now?
2. Which factions next, and should each faction's elite be its historical
   guard (Silver Shields or Companions for Macedon)?
3. Should the friend who joins choose his own faction even when the
   mustering player picked the enemy's? (Built: his Commander's faction
   wins; with no Commander the muster's choice stands.)
4. Riding with the elite, a Commander falls about 1.5 times as often as
   with the generic best unit. Is that the risk wanted, or should he be
   able to ride with another unit?
5. The two kinds of battle are the same battle now. Should kinds of battle
   be something else (hold ground, a river crossing), or go from the
   muster?

### The Commander's odds, set again for faction armies (November 23)

The first odds (a 10% roll each ten minutes his unit is struck under half,
50% when it is destroyed around him, one in four of the fallen killed) were
measured with the generic armies, where his "best unit" broke early and
left the fight. A faction's elite unit fights on when cut up, so he was
rolled for far more often: over 480 battles a player who sent everyone in
had his Commander taken in 1 battle in 12 and killed in 1 in 48. That is
not "low odds", and death is total loss.

Now: **4% a tick, 30% when overrun, about one in eight of the fallen
killed** (`tables.COMMANDER`). Measured over 960 battles of every faction
against every other, on every map, each battle with a seed of its own: a
player who sends everyone in is taken in about 1 battle in 19; one who
plans as the computer does, 1 in 27; killed, about 1 in 300 either way.

A note for whoever measures this again: the Commander's dice are seeded
from the battle's seed alone, so many battles on a handful of seeds roll
the same dice over and over. The first measurement with factions used five
seeds and showed no deaths in 240 battles; it was wrong. Give every battle
its own seed.

## Rulings, November 23, 2026 (the Commander: capture, point of view, loyalty)

Zach's answers to nine questions, in his words.

1. **Bargaining.** "The opponent has to accept the bargain, otherwise they
   can refuse and the battle can finish with whatever outcome happens.
   Computers are worse than humans naturally and each commander is running
   his own unit at that point. Unpredictable but probably risky to bank
   your future on. So early on losing a whole army is likely, you can also
   surrender the field in return for freedom which some opponents would
   accept since it saves their manpower as well."
   ("Each commander" here is each officer, in the names of November 21:
   while the Commander is held, his officers run their own units.)
2. **Haggling.** "It's more of a trade situation. The captive names a price,
   the captor rejects or asks for more, this continues each turn til the
   battle ends or the captive surrenders, or loses their army. Surrender is
   also an option. The captor does not have to accept anything or even
   respond, they can just ignore and keep fighting."
3. **What a held Commander sees.** "You see everything around your
   position, not everything. You get updates from the captors' point of
   view... as if you are sitting nearby as reports come in."
4. **Point of view, always.** "POV is limited to what the commander can
   see and this was already hashed out. Commands take longer to reach
   troops farther away, there is an immediate range around the commander
   then outside that range every turn of movement by a messenger on
   horseback is a delay in the order... so both ways, you are delayed in
   hearing back from distant troops ... maybe even troops behind enemy
   lines can't communicate. Adds disadvantage to being surrounded and adds
   value to choke points and map control."
   (The earlier design: `docs/design/architecture-roadmap.md`, command
   zones: instant at 2 to 6 tiles, by messenger at 10 to 20, out of
   contact beyond.)
5. **Death.** "Should be lower for death, quarter or less with death odds.
   Otherwise that is good."
6. **The unit he rides with.** "Yes, we built that in the past or it was
   lost, but a commander needed to be adjacent to another unit to switch.
   Always start with elite though."
7. **A friend with no Commander.** "Why can't they have a commander?" They
   can, and now always do: the choice to fight without one is gone from
   the screen.
8. (A question back, about new officers arriving seasoned: see 9.)
9. **Loyalty.** "Earned through glory or survival. The theme of the game.
   You build loyalty through both over time, though sacrificing men for
   glory will cost you with those who value survival and win favor with
   those who value glory. It's a trait you have to manage. Win and it's
   fine, a bloody victory or a boring one cost you in different ways.
   Loyalty adds to officers' experience faster, they get to their highest
   level of experience (need to plan this progression out) faster, maybe
   25% faster with loyalty bonus, they will comment more and follow orders
   without question unless a question is required. Low loyalty impacts
   morale and more likely for an officer to follow personality in a battle
   over orders."

Built at once: **5** (a Commander who falls can be killed only when his
unit is at a quarter of its strength or less, or destroyed; above that he
is taken: `COMMANDER.DEATH_THRESHOLD`) and **7**.

## Rulings, November 23, 2026 (factions and the battle)

Zach, on the four questions the factions work raised:

1. **Buying the army.** "They should buy standard army with a set budget,
   use the army builder that the original discord app ran."
2. **The factions.** "I have a doc for factions and elite units for 20
   factions." It is `docs/Context/final_20_cultures_complete.txt`.
3. **Whose faction.** Asked whether a friend's own faction should override
   the mustering player's choice of enemy: "No, your faction is just the
   starting place, it can be the same (Romans fought Romans all the time)."
   Read as: each player brings his own faction, the mustering player does
   not choose a friend's, and both sides may be the same faction.
4. **The kind of battle.** "One type right now, a deathmatch. Victory
   condition is surrendering the field, army loss, or commander death."

## Rulings, November 23, 2026 (officer levels; the captive's end)

1. **Officer levels.** "Nameless 0-4, Green 4-8, Seasoned 8-12, Vet 13+.
   What other perks can we tie into the progression as 30 is the goal for
   maximum veterancy? Being able to carry out long missions would be a
   great feature for legendary 20+."
   Built as: a unit has no officer for its first three battles; at its
   fourth a green officer comes forward with a name (this replaces "after
   3 or 4 battles, arriving seasoned"); seasoned at 8, veteran at 13,
   legendary at 20; 30 is the most that counts (`GRADES`, `EARNED_AT`,
   `MAX_EXPERIENCE` in `command/officers.js`). A new Commander's one
   officer starts a veteran, at 13 to 16. A legendary officer never loses
   any part of an order. Long missions, and the other perks of each level,
   are not built: see the proposal put to Zach the same day.
2. **A captive is not killed.** "Honor binds a commander from killing his
   foe, but if he won't surrender the field to save his men then he leaves
   a commander of none. Desertion can be another part of a disloyal
   officer as his men abandon the unit by a % every round after the
   commander is captured. Loyal officers rally men and fight for their
   captured commander trying to free him."
   Being built with the negotiation: a Commander held when the battle ends,
   not won, with no deal, goes free with nothing (his company is gone; he
   is not); the only total loss is death in the fighting.
3. **The point of view and messenger ranges.** Put to Zach: orders arrive
   at once within 6 tiles of the Commander; beyond that a rider carries
   them, and each ten minutes of riding is ten minutes of delay; reports
   come back the same way; a rider cannot cross ground the enemy holds, so
   a cut-off unit hears nothing and reports nothing; the map shows what
   the Commander sees now and everything else as last reported, with its
   age. His answer: "Go with the proposed pov/messenger ranges." The
   specification is `docs/design/point-of-view-and-messengers.md`.

## Rulings, November 23, 2026 (officer perks)

Asked what else might come with each level, Zach, on the ideas put to him:

> "The second perk is too powerful and the unreliable officers could make
> the game a bit too hard early on, I would say additional details as
> progression happens but never incorrect details. The other perk is lower
> odds of death as they progress, I like the 30 getting a green officer but
> I would say if the unit itself provides the officer so the veteran status
> of the unit, its average level determine the officers starting spot. A 30
> officer in charge of a 24 unit gets a legendary successor."

So:
- **Not wanted:** an officer of 30 battles as a "second" near whom orders
  arrive at once.
- **Reports:** more detail as an officer rises, never a wrong detail. To
  be built with news by rider (`docs/design/point-of-view-and-messengers.md`).
- **Death:** an officer's odds of being killed fall as he rises.
- **Successors:** the unit provides its officer, and the unit's own
  veterancy sets where he starts.
- **Long missions for legendary officers** (his own, earlier the same
  day): not built.

### How death odds and successors were built (Claude's choices, open to change)

- **Death odds** (`DEATH_ODDS` in `command/officers.js`): a seasoned
  officer runs 85% of a green one's chance of being killed in a battle, a
  veteran 70%, a legend 50%. Capture and wounds are unchanged.
- **A unit's veterancy** is the average experience of its men, by the
  engine's veterancy rules from the old design (`veterans/veterancy.js`):
  every man who comes through a battle banks one, the fallen take theirs
  with them, and the unit is made up to strength with recruits who know
  nothing. A unit kept whole for 24 battles has a veterancy of 24; one
  that loses forty men in a hundred each time never rises above about 2.
  This is where "survival" pays.
- **Who comes forward.** A unit with no officer and at least 4 battles
  behind it finds one in its ranks after a battle, starting at the unit's
  veterancy and never below green. For a unit's first officer that is
  green. So a unit that loses its officer fights its next battle without
  one, and then has a successor at its own level: he has the unit's skill,
  and none of the dead man's memory. This replaces "must earn another from
  nothing".
- **An officer of 30 battles has his successor ready at once**: no battle
  without an officer. Over a unit of 24, a legend; over a unit bled white,
  a green one.
- A unit destroyed, or given to the enemy, starts again from nothing.
- **Claude's reading, the other being open:** "the 30 getting a green
  officer" was read as the level-30 perk being the immediate successor,
  and the unit's level setting where every successor starts. The other
  reading is that only a level-30 officer's unit gets a successor at its
  own level, and every other unit starts again from nothing.
- Not built: a unit's veterancy helping it stand in battle. The engine has
  the rule (`veteranResistance`) and the web app does not pass it in.



### How buying the army and the one kind of battle were built (Claude's choices, open to change)

Builds rulings 1, 3 and 4 of November 23 (factions and the battle).

**Buying the army (ruling 1).**
- **The army screen** (`/army/<Commander's link>`, `armyScreen` in
  `app.js`) carries the Discord builder over to a phone: the elite at the
  top, free and "not for sale"; the bought units as cards (name, kit, men,
  price, officer or battles toward one; Change, Dismiss); a sticky bar of
  supply points spent and left; "Buy a unit" opens the steps the Discord
  builder had (the men, on foot or on horse, weapon in two groups, armour,
  shield), each choice a button with its price. A choice the builder
  refuses is struck through; tapping it says why, in the builder's own
  reason put in plain words ("Heavy shield: the crossbow allows at most a
  medium shield", "Levy troops cannot bear heavy armour", "The army would
  cost 31 supply points against a budget of 30"). Only the culture's own
  weapons are listed. "Keep this army" and "Take the usual army of Rome"
  are at the foot.
- **The server judges everything** (`src/web/armies.js`, on the engine's
  `buildUnit`/`buildArmy` and `engine/army/standard.js`):
  `POST /api/factions/:id/appraise` prices a list and every choice of the
  unit being bought; `POST /api/commander/:token/army` keeps an army after
  checking it again (budget, kit, names), or `{ usual: true }`. A choice is
  refused only for what it would add (a reason the unit has not already,
  or overspending where it was not), so a player is never stuck: what
  stands in the way is named, and he changes that first.
- **Kept with the Commander** (`commander.army`), bought after his faction
  when he is made (the muster's "Make your Commander, and buy his army"),
  changed between battles from the muster or Your officers, and refused
  (409) while his army is in the field. A muster never waits on it: with
  none bought he brings his faction's usual army, built exactly as
  before (tested equal to `fieldFactions`). The default armies in
  `src/data/factions.js` stay the computer's and the one-tap usual army.
- **The friend who joins** brings his own Commander's army (bought or
  usual); a new Commander on "Who leads?" may join with the usual army in
  one tap, or buy his first and come back.
- **The elite** is never in the list: a unit of elite quality is refused
  with the builder's own reason ("elite troops cannot be bought"), its name
  cannot be taken, and it comes with every army.

**Names.** A unit's name is its own while it is kept, given by the game
from its kit, never typed: "spears", "slingers", "horse archers",
"riders", "lancers", or the faction's own name for that weapon where its
usual army has one ("legionaries", then "hastati", for Roman swordsmen on
foot; "sarissa foot" for Macedonian pikes). A second of a name is numbered
("slingers 2") and the first keeps its bare name, so no unit's name
changes when another is bought. Where every unit of a name is numbered (the
usual armies' "sarissa foot 1" and "2") the bare name orders them all, as
before. The server takes only names the game would give that kit (so none
says "everyone" or "the enemy"), distinct, and never the elite's. Changing
a unit's kit keeps its name if its kind of weapon is the same; a new kind
of weapon is a new name. Tested: every unit of five armies a player might
buy, in every faction, is found by the order reader by its name.

**Officers when the army changes** (`armyChanged` in
`engine/command/company.js`): a unit is known by its name. A unit kept
(its kit changed or not) is the same men: its officer, or its count of
battles toward one, stays. A unit dismissed takes its count with it (men
raised again start from nothing); its officer stays in the company, a man
and not a unit, and at the next muster leads a unit that has none, as an
officer whose men are not on the field already did. A new unit has no
officer and no battles. So changing the army moves officers but never
makes one: they are still earned in battle (tested).

**One kind of battle (ruling 4).** The muster asks only: the field, the
opponent, the Commander (or a new one and his faction), his army, the
enemy's faction (against the computer only) and the side. "The kind of
battle", "When the day ends" and "Ground to hold" are gone from the form;
the API still takes `scenario`, `timeLimitMinutes` and `objectives`, and
the tests use them. The scenario (always the meeting battle from the app)
still supplies the map's deployment; bought armies of up to eight units
form up on every map (tested). With no time limit and no ground to hold,
a battle from the app ends only as the ruling says: the enemy yields the
field (or gives up a unit to go free, which is leaving the field), its
army breaks or is destroyed, or its Commander is killed; or both at once,
a draw. The verdict words for "yielded" now say "yielded the field".
Tested over app-style battles; in 1,280 league battles the endings were
army broken 1,241, collapsed 34, Commander killed 5.

**The same faction on both sides (ruling 3).** Against the computer, its
faction is chosen from every faction (the player's own among them) or
drawn by lot from all of them (`anyFaction`, a new seeded draw; the old
`enemyFaction` is left as it was). Against a friend the form does not ask:
the muster gives his side a faction by lot until he joins, and his
Commander's own army replaces it ("Rome against Rome" is a title).

**Measured** (`node src/harness/bought-league.js`): five armies per
faction against every faction's default army played by the computer, both
sides played by the computer's planner (so it measures the army, not the
player), the bought side with its Commander on the elite, on all four
maps, both ways round, two seeds, every battle its own seed: 1,280
battles, all ended, 13.9 player turns on average.

| Army bought (each spends what it can) | Rome | Macedon | Sarmatia | Han |
|---|---|---|---|---|
| the usual army (yardstick) | 47% | 45% | 45% | 47% |
| all levy spears (7 units) | 3% | 0% | 0% | 3% |
| all levy slingers (7 units) | **97%** | 72% | 70% | 83% |
| veteran mercenaries, best kit (2 units) | 44% | 36% | 48% | 61% |
| all horse (3 units) | 16% | 13% | 33% | 17% |

**Close to unbeatable: seven units of levy slingers** (4 points each). They
win 70 to 97% against every default army, 100% against some. The faction
work found slingers the strongest buy for the price; a bought army makes
it the whole army. **Helpless: all cheap spears** (0 to 3%), and all horse
(13 to 33%): three units of horse against four of foot. Combat was not
retuned (the balance table is unchanged). The planner plays both sides,
so a player who closes fast on slingers may do better against them.

**Guessed.**
- "Use the army builder" was read as the builder's rules and the Discord
  builder's steps, not its other parts: no secondary weapon, ranged
  weapon added to a melee one, or support specialists (the engine's
  builder has one weapon per unit and no support).
- Names come from the kit and cannot be typed. The other reading is that a
  player names his units; that needs a guard on names the order reader
  would misread.
- The friend's side gets a placeholder faction by lot at the muster (the
  battle needs both armies before he joins); it is replaced when he joins
  with a Commander of another faction or with a bought army.
- No time limit at all from the app. Between two friends who both only
  hold, a battle could stand for ever; either can yield.

**Open, for Zach.**
1. Seven levy slingers beat everything. Should the price of slingers (or
   of missile troops) go up, the budget favour mixed armies, or a cap on
   units of one kind, or is that for players to find and counter?
2. Should a player name his own units?
3. When a unit is dismissed, should its officer stay (built), or go with
   his men?
4. Should a battle from the app have any end of day at all, for two
   players who both hold?
5. Secondary and ranged weapons on one unit, and support (engineers,
   baggage), as the Discord builder had them: wanted?

Also changed: `formUp` is exported from `engine/army/factions.js` (one
word; the faction data there and in `src/data/factions.js` are untouched);
kit words are in `narrator/words.js` (`KIT`); the soak plays the bought
armies, mirror matches among them, on every map.

## Ruling, November 23, 2026 (the perk of thirty battles)

"Good perk for 30 is training, each battle fought increase the level of the
unit. A 30 officer over militia can have them eventually at professional
level over time."

### How training was built (Claude's choices, open to change)

- A unit that comes through a battle under an officer of 30 battles is
  drilled by him. **Every 5 such battles its quality rises one level**
  (`tables.TRAINING`): levy, militia, professional, veteran mercenaries,
  and no further. Tribal warriors become professionals. The elite are the
  elite already.
- The rise costs nothing and is over and above what was bought: the army
  screen and its budget still show the unit as it was raised, and the
  field shows it as it is now.
- Numbers stay as raised: training makes better men, not more of them.
- It belongs to the unit. A unit dismissed, destroyed or given to the
  enemy loses it; an officer who moves to other men starts on them from
  nothing.
- An officer of thirty battles now has two perks: this, and a successor
  ready at once.

## Rulings, November 23, 2026 (the army, and veterans)

Zach, on the five questions buying the army raised:

1. **Balance.** "This is a balance issue overall we have not dove into.
   That would be a good job for an agent to dig through and recommend a fun
   way to keep things worth it but balance the army builder options.
   Secondary, offer a new better system that stays true to the current
   version and history for the game."
2. **Names.** "You can name units after they get an officer."
3. **The roster.** "You don't have to deploy every unit every game. But you
   cannot field an army over the supply threshold. Additional units from
   capture and other avenues exist. You can transfer officers."
4. **The end of the day.** "So add a cap to the battle at end of day like
   40 turns. We can consider spam blocking and idle games another time."
5. **Secondary weapons.** "Eventually yes, secondary weapons were for
   ranged units to have options."

And on veterans dying less: the newest men falling first, "I like this
since it's realistic." Of veteran units taking fewer casualties in the
fight: "Isn't this the case anyways? Or are veterans just stubborn about
routing?" (As the engine stands: a unit's earned veterancy only makes it
harder to break, and the web app does not yet pass even that in. Put back
to Zach.)

Built at once:
- **The end of the day** (`tables.DAY`): a battle mustered from the app is
  over after 40 player turns, decided as a time limit always was: the side
  that lost the smaller share of its men has it, and an equal share is a
  draw.
- **The newest men fall first** (`tables.VETERANCY.FALLEN_SHARE`): the men
  who fall carry, on average, half the unit's experience, so a unit's
  veterancy wears away more slowly than its numbers. Who wins a battle is
  untouched.

Zach's answer, the same day: "The idea that veterans would not fight
better seems off, but it would need to be balanced into the game." Not
built yet: how earned veterancy should make a unit fight better, and by
how much, is part of the army balance study (`docs/design/army-balance.md`
when it reports), because it changes who wins. What was measured first:
the engine's one old rule for it (harder to break) at its old top
strength takes a side from 53% of its battles to 83%, while it loses
hardly fewer men.



### How the held Commander's negotiation, his officers' own command, his view and riding were built (Claude's choices, open to change)

Built from rulings 1, 2, 3 and 6 above, and from three more given the same
day while it was being built: "Honor binds a commander from killing his
foe, but if he won't surrender the field to save his men then he leaves a
commander of none. Desertion can be another part of a disloyal officer as
his men abandon the unit by a % every round after the commander is
captured. Loyal officers rally men and fight for their captured commander
trying to free him." The code: `command/commander.js`, `command/officers.js`
(`ownCommand`, `loyaltyOf`), `battle/battle.js` (the orders phase),
`orchestrator/orchestrator.js` (the table: `makeOffer`, `answerOffer`),
`opponent/captor.js` (the computer's answers), `web/battles.js` (`offer`,
`answer`, `commanderView_`, `captiveView`, `view`, `heldThrough`,
`settle`), `narrator/turnNarrator.js` (`fromCaptivity`) and the app. The
numbers are in `tables.PARLEY`, `tables.LOYALTY` and `tables.RIDE`.

**The table (rulings 1 and 2).** The automatic bargain is gone.
- Each player turn the held Commander may put one offer down: any of his
  units still on the field, from none to all. **Every deal gives the field:**
  the battle is lost as his yield, so "the field alone" is an offer of no
  units, and the other offers are the field and those units. (Read from
  "an accepted offer ends the battle"; the other reading, units without
  yielding the battle, is open.) A new offer replaces the one before.
- The captor need not answer. A friend who holds him sees the offer above
  his orders box and may Accept, Refuse, Ask for more (tick boxes: what was
  offered and the enemy units his side has seen; nothing else), or send his
  orders and fight on. An answered offer is off the table.
- **A counter binds the captor:** if the captive's next offer gives all
  that was asked, the deal is struck at once. It stands for the turn it is
  made and one more (`PARLEY.COUNTER_LASTS`). The captive sees it with
  those units ticked ready.
- A deal: the battle ends ("enemy commander bargained"), he is free, each
  unit given goes with its officer ('given up'), and a unit with no officer
  starts its count toward one again. The field alone costs no unit.
- Held, he cannot yield by his own word (ruled the same day): `{ surrender }`
  while held is read as no orders, in the engine, and the button is gone.
- Everything goes through `submitOrders` as `{ offer }` and `{ answer }`,
  neither of which is a side's orders for the turn. A battle saved with the
  old `{ bargain }` still plays back.
- **Fog:** the captor's screen names only the units offered and the units
  his side has seen; he may ask only for those (refused otherwise). A
  page waiting on the turn, or at the table, looks again when an offer or an
  answer comes.

**The computer as captor (`opponent/captor.js`).** One roll for each offer,
from a stream seeded by the battle's seed and the offer's number, so the
same battle always gets the same answer (and it is in the log besides). It
accepts with chance `0.08 + 1.0 × (men offered / its own men at the start)
+ 0.35 × (share of its own men dead, fled or broken)`, held between 5% and
70%. A roll that misses by under 0.25 asks for more: what was offered and
the strongest of his units it has seen; a wider miss is refused. It counts
a unit it has never seen as one of the average size of those it has. So the
field alone, from a captor that has lost no one, is an 8% chance; a captor
that has bled will take less; it is never a sure thing.

**At the end, held, no deal (ruled the same day).** "A commander of none":
he goes free and alive; every officer leaves his company (those who sat the
battle out too, kept on the roll of the fallen as 'left') and every unit's
count toward an officer starts again; his name, faction and battles go on,
and he may muster again with no officer at all, not even a new veteran.
It is `heldWhenTheBattleEnds` in `commander.js` and `commanderOfNone` in
`company.js`. The old price (his best unit) and the fate 'lost' are gone:
the only total loss is death in the fighting.

**His officers run their own units (ruling 1).** As each player turn opens
while he is held (`ownCommand`): the bold go at the enemy if their side can
see one, else carry on; the steady carry on with the order they have; the
cautious halt and hold; a unit with no officer holds where it stands. Each
decision is an event (`ownCommand`) his own side is told of, once, when it
changes. Over nature stands loyalty: **loyalty does not exist yet**; an
officer may carry `loyalty`, 0 to 100, and one without it is 50, neutral
(`loyaltyOf`), so today every officer goes by his nature. When loyalty is
built it plugs in there, on the officer the company gives the unit
(`musterOfficers`). At 70 or over he goes for the unit holding his
Commander, whatever his nature, and if his men are shaken they take 15
morale of heart, once; at 30 or under, 3% of his men desert each ten
minutes his Commander is held (an event, `deserted`, his side is told of;
deserters are counted among the fallen in the tally). A unit with no
officer is neutral. When he is free it all stops: his units keep what they
were doing until he orders them. Nothing of it happens in a battle in which
no Commander is held (tested; `npm run balance` unchanged).

**What a held Commander sees (ruling 3).** "The captors' point of view" is
taken as **what the unit holding him can see and takes part in**, not his
captors' whole side's knowledge. His map and Army tab: his own units in
that unit's sight, with where they are and about how many men (no morale,
no orders); the rest named, with their officer, and "out of your sight";
the enemy as that unit sees it now, nothing his side knew before or has
learned since; the units he lost before he was taken, and those he can see
lying where they fell. His dispatch for a turn he was held all through
opens "You are held by ... at ...: this is what could be seen and heard
from where you sit", and tells only events every unit of which was in that
unit's sight at the turn's end, the verdict, ground changing hands, and
what befell him. A turn in which he was taken he spent with his army, and
hears of as before. Free again, or the battle over, he has his side's view.
He cannot have orders read back while held.

**Riding with another unit (ruling 6).** "I ride with the horse",
"commander to the companions", "ride with the spears", or "Ride with them"
on a unit's card (shown only where it is allowed): within one tile of the
unit he is with (the eight round it), not broken, not while held. Read by
the grammar, never the AI; the read-back is "You: ride with Horse", or why
not ("Companions are 6 tiles (about 150 m) from Spears, whom you ride
with: you can ride over only to a unit beside them..."). It goes through
`submitOrders` and is an event (`commanderRode`) only his side hears of.

**Measured** (`node src/harness/captive-league.js`): 3000 battles of the
four factions against each other on every map, each battle with a seed of
its own; red sends everyone in every turn, blue is the computer.
- Red's Commander was taken in 131 (1 in 23).
- Offering (the field alone first, then the field and his weakest unit,
  one more each turn; meeting any counter he can): 240 offers, 1.8 a
  captivity; 38% of offers accepted; 70% of captivities ended in a deal
  (31 for the field alone, 61 with units, 94 units given in all); 46
  counters, 29 met. 21 got free when their captors broke; 18 (14%) were
  still held when the battle was lost and went home commanders of none.
- Waiting, no offers: 75 of 131 (57%) went home commanders of none; 55 got
  free when their captors broke; 1 was freed by his army's victory.
- How his army fares with its officers running their own units: of
  captivities with no deal, the army won 33 of 131 (25%), against 35 of
  129 (27%) on the same seeds with the code before this change, where
  units carried on with their orders. (A new Commander's units but the
  elite have no officer, and now hold where they stand.) The two runs
  differ by two captivities because the computer's own Commander is
  sometimes taken first, and its officers now run its units.

**Guessed at:**
- That every deal yields the field (above).
- That a counter binds the captor for a turn; the other reading is that a
  captive who meets it must still wait for an acceptance.
- "Captors' point of view" as the one unit holding him, not the whole
  enemy side.
- The computer's rule and its numbers, and that it answers at once.
- "Rallies if it is shaken" as a shaken unit taking heart, not a broken
  unit rallying.
- The friend's page polls for offers every 30 seconds while at the table.

**For Zach:**
1. Should a deal be able to keep the battle going (units given without
   yielding the field)?
2. Is "the captors' point of view" the unit holding him, or everything his
   captors' side knows?
3. Is 70% of captivities ending in a deal, for a captive who keeps
   offering, risky enough? The field alone from an unhurt computer is 8%.
4. Should the computer, as a captive, make offers of its own? (Today its
   Commander, when a player takes him, waits.)
5. Should deserters count as fallen, as fled, or as a count of their own?
6. A commander of none musters with no veteran at all: is that the intent,
   or should he get the new Commander's one veteran back?

### How loyalty was built (Claude's choices, open to change)

Zach's ruling 9 of November 23 (quoted above: "Earned through glory or
survival. The theme of the game..."). The numbers are in `tables.LOYALTY`;
the rules in `command/officers.js` (`loyaltyMove`, `loyaltyBand`) and
`command/company.js`.

- **Each officer holds one thing dear: glory or survival.** It is his for
  life, drawn when he comes forward, and shown on his card ("lives for
  glory", "looks to his men").
- **Loyalty runs from 0 to 100 and starts at 50.** At 70 and over he is
  loyal; at 30 and under, disaffected; between, neither, and nothing is
  said.
- **Each battle he fights moves it**, by how the battle ended and what it
  was for his own unit:

  | He values | Victory | Draw | Defeat |
  |---|---|---|---|
  | Glory, and his unit fought | +6 | +2 | -3 |
  | Glory, and it never struck a blow | -4 | -3 | -6 |
  | Survival, and it lost 15% or fewer | +6 | +1 | -3 |
  | Survival, and it lost between | +2 | -2 | -5 |
  | Survival, and it lost 35% or more | -5 | -6 | -8 |

  So a bloody victory pleases the one and costs the other; a victory his
  men only watched does the opposite; a defeat costs both. An officer who
  sat the battle out is not moved. His record says, for each battle,
  whether he thought the better or the worse of his Commander for it.
- **A loyal officer:**
  - learns faster: a battle counts as 1.25 toward his next level;
  - holds to his orders: when he loses the thread he carries on with what
    he remembers, whatever his nature;
  - speaks up: he gives counsel even while green;
  - and, when his Commander is taken, goes for the men who hold him (built
    with the negotiation).
- **A disaffected officer:**
  - his men come to a battle in worse heart (10 off their morale as it
    opens);
  - he keeps less of an order (each clause at 0.6 of his usual chance), and
    so goes by his nature more often;
  - and his men desert while his Commander is held.
- Loyalty does not make a loyal officer cleverer or his men braver: the
  gain is in learning, steadiness and counsel.
- From 50 it takes four good battles to win an officer and four bad ones
  to lose him. That pace is a guess.
- Not built: an officer leaving, or refusing an order, for want of
  loyalty; telling the Commander before a battle what an order will cost
  him with each officer.

## Rulings, November 23, 2026 (the captive, again)

Zach, on four questions the negotiation raised:

1. Whether a deal might give units and let him fight on: "No incentive to
   ever do that. Unless you are freed by your troops, they route the unit
   holding you." Every deal yields the field, as built.
2. What a held Commander knows: "The unit holding you and you get
   dispatches from the enemy side. (Makes earning your freedom even worse
   for the captor, you know where everyone they have is)."
3. What he is left with when a battle is lost while he is held: "They get
   whatever is left at the end of the battle. Let's make it so some
   officers can surrender the field as well."
4. Whether the computer, as a captive, should make offers: "Yea it can but
   it does not really matter." Not built.

### How these were built (Claude's choices, open to change)

- **He reads his captors' dispatches.** While he is held, his dispatch for
  a turn is the other side's: everything their side could know of it,
  their own units and all, told in his own names for everyone ("enemy
  swords", "Spears"). His map and Army tab are still only what the unit
  holding him can see. Nothing of his own army reaches him that his
  captors cannot see.
- **Freed, he brings it out.** When the unit holding him breaks and he gets
  away, his side knows where every enemy unit stood as he left: each one
  it cannot see is marked as last seen there, and his units told to
  advance will go for them.
- **He keeps what the battle left.** A Commander held when the battle is
  lost with no deal is let go, alive, and his officers and units fare as
  in any battle. For a day (the build before this ruling) every officer
  left him whatever had come through; that is gone. An army fought to
  nothing still leaves him "a commander of none".
- **His senior officer may yield the field.** While the Commander is held,
  as each player turn opens: if the most experienced officer on the field
  (of a unit not broken) is one who looks to his men (he values survival;
  or, of an officer whose values are not known, he is cautious by nature),
  and half the army's men are dead, fled or broken
  (`tables.LOYALTY.YIELD_LOSSES`), he yields. The battle is lost at once
  and what is left is saved. One who lives for glory fights on. A loyal
  officer does not yield: he is going for the men who hold his Commander.
  So whom a Commander has made his senior officer decides how a captivity
  ends.


### How the twenty factions were built (Claude's choices, open to change)

Builds ruling 2 of November 23 ("I have a doc for factions and elite units
for 20 factions"): every culture in `docs/Context/final_20_cultures_complete.txt`
is now a faction in `src/data/factions.js`, with the doc's elite unit, free,
at the doc's size, and one default army (the computer's army, and a
ready-made choice for a player). The shape of an entry and what
`engine/army/factions.js` exports are as they were; an elite now carries a
`size`, and the army is raised with it. The doc's perks and restrictions
are not built (table below).

**The factions and their elites.** The elite's kit is as near the doc as
the builder's kit allows; the army is bought within the culture's budget.

| Faction | Elite, free (men: kit) | Default army: SP of budget |
|---|---|---|
| Rome | praetorian guard, 80: gladius, heavy armour, big shield, foot | legionaries (professional, gladius), hastati (militia, gladius), velites (levy, javelins): 26 of 30 |
| Macedon | silver shields, 80: spear, heavy armour, medium shield, foot | 2 sarissa foot (professional pikes, no armour), peltasts (professional, javelins): 28 of 30 |
| Sparta | lacedaimonian guards, 40: spear, heavy armour, big shield, foot | hoplites (professional), skirmishers (levy, javelins), helots (levy, spears): 20 of 25 |
| Carthage | sacred band, 100: spear, heavy armour, big shield, foot | numidian horse (militia, javelins), gauls and iberians (militia, swords), slingers (levy): 28 of 32 |
| Kush | golden bows, 80: professional bow, light armour, foot | 2 spearmen (professional), slingers (levy): 26 of 30 |
| Berbers | blue men, 80: heavy javelin, light armour, light shield, horse | riders (tribal, javelins, horse), 2 swordsmen (tribal), slingers (levy): 29 of 30 |
| Sarmatia | iron scale riders, 80: kontos, heavy armour, horse | horse archers, 2 light riders (all tribal, all horse): 24 of 30 |
| Han | yulin guard, 100: dao, heavy armour, foot | crossbows (professional), swords (militia): 16 of 30 |
| Maurya | gaja vahini, 60: mace, heavy armour, foot | bowmen (professional), horsemen (militia), 2 levies: 29 of 30 |
| Silla | hwarang, 80: sword, heavy armour, medium shield, foot | spearmen (professional), archers, levies (militia): 24 of 25 |
| Persia | immortals, 100: spear, medium armour, medium shield, foot | archers (professional, recurve bow), sparabara, spearmen (militia), slingers (levy): 28 of 30 |
| Parthia | savaran, 80: kontos, heavy armour, horse | horse archers (professional, horse bow), light horse (militia, bows), 2 levy spears: 29 of 30 |
| Germania | comitatus, 80: framea, medium armour, foot | warriors, axemen, spearmen (framea), skirmishers (all tribal): 27 of 30 |
| Thrace | peltast guard, 60: heavy javelin, light armour, light shield, foot | 2 rhomphaia men, javelin men, spearmen (all tribal, no armour above light): 28 of 30 |
| Samnium | sacred spring warriors, 80: gladius, medium armour, big shield, foot | swordsmen (militia), veterans (professional), slingers (levy): 25 of 26 |
| Tibet | snow lion guard, 80: two-handed spear, medium armour, foot | pikemen (professional), 2 spearmen (militia): 25 of 25 |
| Mongolia | eternal sky riders, 100: professional bow, medium armour, horse | horse archers, 2 armoured riders (all tribal, all horse): 28 of 30 |
| Celts | fianna, 80: longsword, medium armour, medium shield, foot | warriors (tribal), horsemen (tribal), slingers, 2 levies: 30 of 30 |
| Bactria | indo hellenic guard, 80: sarissa, heavy armour, foot | cataphracts (professional, kontos), archers (militia), peltasts (levy): 25 of 30 |
| Yayoi | yamatai warriors, 80: spear, medium armour, medium shield, foot | spearmen (militia), clansmen (professional), archers (militia): 25 of 30 |

**The four that existed, against the doc.** Macedon's elite was the
Companions (horse); the doc's is the Silver Shields (80 phalangites), on
foot, now built (the design doc's "fighting-age elite regulars"). Rome's
praetorians are renamed "praetorian guard", as the doc names them; kit
unchanged. Sarmatia's Iron Scale Riders now carry the kontos the doc gives
them (they had swords, because the builder let only Persia and Parthia
field it). Han's Yulin guard are 100 men, as the doc says, and carry no
shield (the doc names none; they had a medium shield). Every elite's size
is now the doc's: Sparta 40, Thrace and Maurya 60, Carthage, Han, Persia
and Mongolia 100, the rest 80.

**Stand-ins: kit the doc names that the builder does not have.** No combat
rule was added or changed; each is the nearest kit the engine has.
- **One weapon each.** A unit carries one weapon here, so the doc's second
  weapon is dropped: the Iron Scale Riders' composite bows, the Hwarang's
  composite bows, the Yamatai Warriors' bows, the Immortals' akinakes, the
  Peltast Guard's curved swords, the Sacred Spring Warriors' javelins, the
  Comitatus' pattern-welded swords and round shields (the framea takes both
  hands in the builder), the Yulin guard's jian.
- **Elephants.** None in the game. Maurya's Gaja Vahini (60 men and 6
  elephants) are heavily armoured foot with maces: slow and crushing. As
  heavy horse they rode ahead of the line and were cut off (the faction won
  about one battle in four; on foot, about half). Carthage's war elephants
  are not represented at all.
- **Mixed units.** The doc's "100 elite mixed troops" (Sacred Band), "mixed
  cavalry/infantry" (Yulin guard), "40 cataphracts + 40 horse archers"
  (Savaran) and "fusion warriors" (Indo-Hellenic Guard) are one kind each:
  heavy spearmen; swordsmen on foot; kontos-armed heavy horse; armoured
  sarissa phalangites.
- **Silver Shields** take the spear and keep their shields (a sarissa takes
  both hands); they cannot change weapons in battle. "Bronze armour" is
  heavy armour.
- **Blue Men**: "light spears" from horseback. A spear cannot be used
  mounted in the builder, so the heavy javelin (with the light javelin they
  won one battle in five).
- **Golden Bows**: the six-foot Nubian bow is the professional bow; **Eternal
  Sky Riders**: composite bows are the professional bow (the builder's
  composite bows are Greek and Parthian).
- **Weapons named for another people**: the Samnites' gladii are the
  builder's `roman_gladius`; the Bactrians' phalanx gear is the
  `macedonian_sarissa`; the Sarmatian and Bactrian lance is the
  `persian_kontos`.
- **Armour**: scale, lamellar, cuirass, mail and hide are mapped to light,
  medium or heavy: "light mail" (Fianna) and "yak-hide" (Snow Lion Guard)
  medium; "scale armour" (Immortals) medium; leather light.
- **Horse-archer elites** (the Eternal Sky Riders) are raised at the doc's
  100; bought horse archers are fewer (`HORSE_ARCHER_NUMBERS`), and the
  elite is not.
- Unit names in the default armies are plain words for what they carry
  ("velites", "sparabara", "numidian horse" name kit, not rules).

**Added to the builder's culture tables** (`engine/army/data.js`):
- Budgets for the eleven new cultures: 30, except Silla and Tibet 25 ("begin
  with 25 SP instead of 30") and Samnium 26 ("only 26 SP"). Carthage's 32
  and Sparta's 25 were there (Sparta's 25 is from the old data; the doc
  gives Sparta no number).
- Tribal warriors: the Mongols (pre-Genghis tribes, a confederation as the
  Sarmatians and Berbers are here).
- Horse cultures (cheaper horses): the Mongols, with the doc's other steppe
  peoples, Sarmatia and Parthia.
- Weapons: `roman_gladius` for the Samnites; `macedonian_sarissa` for the
  Bactrians; `persian_kontos` for the Sarmatians and Bactrians.
- Culture names follow the builder where it had one ("Han Dynasty",
  "Achaemenid Persian", "Germanic Tribes"), the doc's otherwise ("Mauryan
  Empire", "Pre-Genghis Mongolia", "Yayoi Period Japan").

**Officers' names**: twelve given names for each of the thirteen new
cultures in `src/data/officers.js` (Carthage, Kush, the Berbers, Sarmatia,
Han, Maurya, Silla, Thrace, Samnium, Tibet, Mongolia, Bactria, Yayoi), no
two alike in a list, given names only. Many are names real men bore (kings
of Kush and Thrace, Bactrian kings); none is a famous man's full name.

**The doc's perks and restrictions.** None was built. What the builder
already does, what only the default army keeps to (nothing stops a player
breaking it, once he buys his own), and what is not built at all. No supply
trains, siege engineers, fortifications or campaigns of conquest exist yet,
so most adaptation perks have nothing to act on.

| Faction | The builder enforces | The default army keeps to, not enforced | Not built |
|---|---|---|---|
| Rome | pilum and plumbatae are Roman; the gladius Roman and Samnite | at least half heavy foot (3 of 4) | engineering; professional discipline; veteran auxiliaries; units without officers waver faster |
| Macedon | sarissa, xiphos, Greek bow are Macedonian | no militia (all professional) | 10-battle veteran Silver Shields; sarissa or spear in battle; companion integration; higher unit costs |
| Sparta | budget 25 (old data) | no mercenaries | fight on to 50% losses; better perioeci; allied Greeks; supply staff +2 |
| Carthage | merchant wealth: 32 SP | at most 2 SP of professionals (none) | war elephants; mercenaries mid-battle; hired men break first |
| Kush | | no heavy foot | desert mastery; archer and horse together; Forgers of Meroë |
| Berbers | tribal warriors | | desert navigation; small-unit bonuses; master raiders; slowed in forest and swamp |
| Sarmatia | tribal warriors; cheaper horses; kontos | no foot; all horse | switch lance and bow; feigned retreat; unlock a unit from each defeated culture |
| Han | crossbows are Han only | spends no more than 28, leaving 2 for administrators (spends 16) | cloud ladders and catapults; units 20% larger; assimilation; administrators and losing them |
| Maurya | | three kinds of unit at least | elephants that break formations; wootz steel; diplomatic gifts; may not pursue the routed |
| Silla | budget 25 | | veteran leadership from the first battle; mountain bonuses; treaties with the defeated; 10 SP for allies only |
| Persia | recurve bow, akinakes, kontos | | supply train replaced; better support staff; satrap troops; satrap and reorganising penalties |
| Parthia | cheaper horses; horse bow, kontos | at least 10 SP of levy (10); at least half horse | plains bonus; Parthian shot; feudal levies |
| Germania | tribal warriors; framea, throwing axe, war scythe | no siege engineers (none exist) | warband never breaks; forest mobility; champions; champion integration; no complex formations |
| Thrace | tribal warriors; rhomphaia is Thracian only | nothing heavier than light armour and shields | rhomphaia for any foot; hill defence; veterans from the start; cultural crossroads; no mercenaries |
| Samnium | budget 26; gladius | no siege engineers | guerrilla bonuses; break at 30% and 40%; capture kit in battle |
| Tibet | budget 25 | | no cold or mountain penalties; militia as veterans; sanctuary; mercenaries 25% cheaper |
| Mongolia | tribal warriors; cheaper horses | all horse | full accuracy at speed; endurance; units 20% larger; captured specialists; no free supply train |
| Celts | tribal warriors; longsword, champion's sword | no professional archers | fear from ambushes; flanking bonuses; woodland mobility; single combat; no mercy |
| Bactria | sarissa, kontos | heavy foot no more than 30% (the guard, 1 of 4) | fusion army as professionals; noble horse on flanks; synthesis warfare; supply lines |
| Yayoi | | at most one horse unit (none); light and medium armour only | archer and spear bonuses; rapid fortification; cultural exchange |

**How the armies were set.** The first armies, written from the doc, were
far apart: in a first league Carthage won 88% and Macedon 84%, Kush 1% and
Samnium 10%. Each faction was given a pool of plain, legal units in its
own kit (kept to the restrictions in the table, with no more than two of
a kind, no more than two missile units, and the faction's own troops in
it: crossbows for Han, pikes for Macedon), and in three rounds the army
nearest to winning half its battles against the rest of the field was
kept (each candidate played every other faction, both ways round, on two
maps). A last pass by hand on the six still outside 35 to 65%. Findings:
- **Not every army spends its budget**, as before. Han's crossbows and 100
  heavy swordsmen were too strong with anything more than two units (16 of
  30 SP); Macedon's pikes win with no armour on.
- **A mounted elite in a mostly foot army loses**: it rides ahead and is
  cut off (Maurya, the Berbers). In an army all on horse (Sarmatia,
  Mongolia, Parthia) it does not.
- **Light horse with javelins is weak** for its price for a people who pay
  full price for horses; the Berbers win most on foot.

**Measured** (`node src/harness/faction-league.js --seeds 10 --maps
crownhill,thornwood`): all twenty factions, every pairing both ways round,
10 seeds, on Crownhill and Thornwood (one map the armies were set on and
one they were not), 7,600 battles, the computer on both sides, each with a
Commander riding with his elite. **Every battle ended**; average 13.7
player turns, 164 battle minutes.

| Faction | Won | Lost |
|---|---|---|
| Persia | 64% | 36% |
| Samnium | 57% | 43% |
| Han | 56% | 44% |
| Bactria | 56% | 44% |
| Carthage | 55% | 45% |
| Sparta | 53% | 47% |
| Silla | 53% | 48% |
| Macedon | 52% | 48% |
| Yayoi | 51% | 49% |
| Thrace | 50% | 50% |
| Sarmatia | 50% | 50% |
| Germania | 50% | 50% |
| Celts | 49% | 51% |
| Parthia | 48% | 53% |
| Maurya | 46% | 54% |
| Rome | 45% | 55% |
| Kush | 44% | 56% |
| Tibet | 43% | 57% |
| Mongolia | 43% | 58% |
| Berbers | 38% | 62% |

No draws. **No faction wins or loses more than 65% of its battles**
(before the adjustment: Han 70%, Macedon 68%; Tibet, Kush and the Berbers
lost 74 to 76%). **51 of the 190 pairings are worse than 75/25**: with
twenty armies this different, many are matchups. The worst:
Sparta beat Mongolia in all 40; Parthia beat Rome, Yayoi the Berbers and
Mongolia Samnium 98 to 3; horse armies beat Han 95 to 5 (Sarmatia,
Parthia, Mongolia: the crossbows cannot catch them); Persia beat the
Berbers 95 to 5, Bactria beat Mongolia 95 to 5. The whole list is the
league's output. Commanders: 15,200 on the field, taken in 1 battle in 41,
killed in 1 in 362; the Commander's dice are seeded from the battle's seed
alone (20 seeds here), so read nothing into the deaths. Combat was not
retuned: `npm run balance` is unchanged.

**The soak** plays every faction as red on every map, each time against a
different enemy, so each is blue as often (240 battles, each with a seed
of its own), instead of every pairing on every map (4,560 with twenty
factions). All end. The league plays them all.

**Guessed.**
- "Its size where the doc gives one" was read as the elite's men on the
  field. The Q6 ruling had one elite size (80); the other reading keeps 80
  for all and treats the doc's numbers as flavour.
- Where the doc's restrictions are cheap to honour the default armies keep
  them (Sarmatia and Mongolia all on horse, Macedon no militia, Yayoi no
  horse). Read as the doc's intent for these armies, though not built as
  rules.
- The Mongols as tribal (cheaper, steadier warriors) and as a horse
  culture: the doc calls them a confederation and "100% mounted" but does
  not say tribal.
- Han's "+2 administrator SP" was read as leaving 2 SP unspent.
- Unit names: the doc's elite names, shortened where a player would not
  say them ("golden bows" for Children of the Golden Bow, "savaran",
  "hwarang", "comitatus").

**Open, for Zach.**
1. Elite sizes: the doc's 40 to 100, or one size for all (Q6)?
2. Elephants (Maurya, Carthage, and the doc's Bactrian perk): a kind of unit
   of their own, or the stand-in (heavy foot with maces) for now?
3. Should a unit carry a second weapon (bow and lance, spear and sword), as
   so many of the doc's elites do?
4. Which restrictions should the builder enforce when a player buys his own
   army? The cheap ones are counts (all horse, at most one horse unit,
   half heavy foot, no militia); they would stop a Sarmatian buying foot.
5. Which perks come first? Most need things not built yet (supply trains,
   siege engineers, fortifications, the campaign between battles).
6. Pairings: 51 of 190 are worse than 75/25 between two computer
   commanders. Is a lopsided matchup acceptable (Han's crossbows against
   horse armies), so long as no faction is weak overall?
7. The Berbers have no horse-culture discount; the doc does not give them
   one, but their elite is "desert cavalry". Should they?

### How the roster, captured units, officer transfers and unit names were built (Claude's choices, open to change)

Builds rulings 2 and 3 of November 23 (the army, and veterans): "You don't
have to deploy every unit every game. But you cannot field an army over the
supply threshold. Additional units from capture and other avenues exist. You
can transfer officers." and "You can name units after they get an officer."
The code: `src/web/roster.js` (new), `command/company.js` (`musterOfficers`'
`benched`, `handOver`, `takeIn`, `moveOfficer`, `renameUnit`),
`army/standard.js` (`kitPrice`, units taken and former names in
`standardUnits`), `web/battles.js` (`muster`, `join`, `musterArmies`,
`leadSide`, `setArmy`, `settle`, and `whoMarches`, `transfer`, `nameUnit`,
`capturesOf`), `web/commanders.js` (`setRoster`, the view's `roster`), the
muster form, the army screen and Your officers. The one number is
`tables.LOYALTY.CAPTURED`.

**The roster (A).**
- Everything he owns: the units he bought (or his faction's usual army),
  the units that came to him otherwise (`commander.gained`, each with `how`
  it came), and his elite.
- **The loophole is closed by what he buys:** everything bought must fit the
  budget together, at home or not, as buying always was. Only units that came
  otherwise (capture) take the roster beyond it. (The suggestion in the
  brief, taken as it was.)
- **What marches may cost no more than the budget**: a bought unit at its
  price, a captured one at the builder's price for its kit whoever forged it
  (an elite priced as veteran mercenaries, as a faction's elite is checked),
  horses at the captor's culture's price. The elite always marches, free.
  The elite may march alone.
- **A unit at home** keeps everything and takes no part: no battle is
  counted for it or its officer, and its officer is not lent to another unit
  (`benched` in `musterOfficers`; an officer whose unit was dismissed is still
  lent, as before). A wounded officer at home is fit again after the battle,
  as one who sat a battle out always was.
- **Who marches** is kept with the Commander (`commander.marching`): the
  muster and the friend who joins use last time's choice, the first time
  everything bought. A unit just bought joins it; a unit taken from the enemy
  waits at home until chosen. Should a change of army put the choice over
  the budget, taken units stay home, the last taken first.
- **The muster form**: under the army line, a folded "Who marches" showing
  the units marching and the supply spent and left; open, a tap on a unit
  leaves it home or brings it, and the elite is shown fixed. Over the budget
  the line turns red and the server refuses with the cost; one tap still
  musters for a player who changes nothing. (The friend's "Who leads?"
  screen marches last time's choice; it has no chooser of its own.)
- His faction's usual army, marched whole and with no unit named, is
  mustered exactly as before (tested equal); otherwise it is fielded as a
  bought list.

**Captured units (B).**
- A unit given in a deal (`'given up'`) between two players' Commanders goes
  to the captor's roster as `how: 'captured'`: its kit as it was raised (so
  kit his faction cannot buy, Roman gladii in a Macedonian army), its men
  (an elite keeps its faction's size), its culture, its veterancy and
  training with this battle in them, its officer (his experience, record,
  nature and what he holds dear his own, this battle added) and whom it was
  taken from. A name he already uses gives it the next free one by the
  existing rule, and it still answers to its old name.
- **The captured officer's loyalty is 15** (`LOYALTY.CAPTURED`, under
  DISLOYAL 30), whatever it was. Loyalty is built since this was asked for,
  so it bites at once: his men start a battle in worse heart, he is likelier
  to lose the thread of an order, and they desert while his new Commander is
  held. His card says "Given to you by Commander ... in a deal for his own
  freedom. He has every reason to hate you."
- **Given units leave the giver's roster, to a player or to the computer.**
  Before, a unit given was raised again from nothing next battle; now it is
  gone (a usual army missing a unit becomes his own list). His elite, given,
  is raised again: it is his faction's. A unit given whose officer was killed
  in the same battle is gone too (`given` on its fate; before, it stayed).
- **Nothing is captured from or by the computer**: it keeps no roster. A
  Commander with no faction (from before factions) neither captures nor
  loses roster units.
- **Other avenues**: `AVENUES` in `roster.js` names how a unit may come
  (only `captured`), and `addToRoster(commander, unit, how)` takes one in.
  Nothing else is built.

**Transferring officers (C).** On Your officers, "Move him to other men"
under each officer opens a list of his other units: "To the velites, who
have no officer" or "To the hastati, in place of Tullus" (the two change
places). Only between battles (409 while the army is in the field). His
experience, record and loyalty go with him; each unit's veterancy and
training stay. A unit left with no officer finds one in its ranks by the
existing rule. Stripping the elite of its officer is allowed.

**Naming a unit (D).**
- On the army screen, "Name them" on a unit (the elite too) that has an
  officer; kept at once, between battles only, and not while army changes
  are unsaved.
- **The rules** (`nameRefusal`, judged on the server): one to three words of
  plain letters, 3 to 24 characters in all, each word two letters or more;
  kept in lower case with single spaces and no leading "the" (every unit
  name is shown in sentence case, and the order reader takes no account of
  case: "The Iron Wolves" is kept as "iron wolves" and shown "Iron wolves").
  No word the order reader takes for something else: everyone, all, army,
  the enemy, the sides, the order words, directions, pronouns, "and" and
  "then" and the like. No word for a kind of troops: the order reader's
  (horse, archers, foot...), the roles (spearmen, infantry, cavalry...), the
  names the game gives kit (spears, swords, slingers...). No name the game
  gives any unit of any faction (legionaries, silver shields...). No place on
  any field, and no word for a kind of ground (hill, ford, bridge, road...).
  Different from every other unit he owns. Each refusal says which rule.
- **What carries the name:** his company (`units` and the officer's
  `leads`), his bought army or his captured units (or the elite's own name),
  what marches, and every battle mustered after it (the unit's id and
  aliases, so the saved battle replays under it). Battles before keep the
  name the unit bore then, as an officer's record does: changing a saved
  battle would break its replay. A rename is refused while the army is in
  the field, so no battle is between names.
- **It still answers to what it was called before** (`formerly`), where
  nothing else on the field answers to that: no other unit's name, that name
  without its number, or another unit's former name.
- A unit he named keeps its name through a change of kit; the server takes
  `named` only from the army it keeps, never from the browser.
- **Names are not yet moderated.** They reach other players' screens (a
  captured unit, the enemy's dispatches) and always go through `esc()`.

**Measured.** `npm run balance` unchanged. 15 new API tests
(`tests/roster.test.js`) and a phone test in the browser; battles and
Commanders saved by the code before this change (`tests/fixtures/
before-roster`, made with main as it was) load, replay to the same state and
go on.

**Guessed at.**
- That units given to the computer leave the giver's roster too (the other
  reading: only those that go to a player).
- That a captured unit waits at home until chosen, and a newly bought one
  marches.
- Captured officer loyalty 15; captured units priced at the captor's horse
  price.
- That the elite may march alone, and may be named, and when given is raised
  again for its faction under its own name.
- Names kept lower case; "the" dropped from the front.

**For Zach.**
1. Units given to the computer: gone from the roster (built), or raised
   again as before?
2. Should a captured unit's price to march be its kit's price (built), more
   (a premium for kit the faction cannot forge), or less?
3. Is 15 right for a captured officer's loyalty, and should anything win him
   over faster than battles do?
4. Should the friend's "Who leads?" screen let him choose who marches, or is
   last time's choice enough?
5. Names: is the list of refused words right, and should names be moderated
   before they reach another player?
6. A Commander whose elite is given in a deal: raised again from nothing
   (built), or does he lose his elite?

### How the Commander's point of view and messengers were built (Claude's choices, open to change)

Built from the rulings of November 23 ("POV is limited to what the
commander can see ... Commands take longer to reach troops farther away
... you are delayed in hearing back from distant troops ... maybe even
troops behind enemy lines can't communicate"; "Go with the proposed
pov/messenger ranges"), to the specification
`docs/design/point-of-view-and-messengers.md`, in its three steps. The
code: `engine/command/messengers.js` (the rider), `engine/battle/battle.js`
(orders on the road), `engine/orchestrator/word.js` (what each Commander
knows, and when), `engine/orchestrator/orchestrator.js` (turns that stop
on news), `web/battles.js` (the tent, the read-back, the dispatch),
`web/public/map.js` and `app.js`, the words in `narrator/words.js`
(`RIDER`). The numbers are `tables.COMMAND`: immediate range 6 tiles, a
rider's pace 10 (move cost) a ten minutes, no rider within 1 tile of an
enemy. Everything applies only to a side with a Commander on the field,
and to the computer's orders when they come marked (below): a battle with
neither runs exactly as before, event for event
(`harness/tests/messengers-unchanged.test.js`), and so does a battle saved
before riders (below, question 5).

**The rider's path.** One search (Dijkstra) over the whole field from the
Commander's tile, at the same cost per tile a unit pays (road 0.5, open 1,
hill and ford 1.5, wood 2, marsh 3, river impassable), gives every unit's
delay at once: the cost over 10, rounded up to whole ten minutes, at least
ten. Within 6 tiles (the eight-way count, as riding with a unit is
counted) it is at once, whatever the ground. "Within 1 of an enemy unit"
is every tile in the 3 by 3 round an enemy he could see: on the field, not
broken, not hidden. He may set out from such a tile and ride into one (the
unit he carries the order to, in a fight), but not on through it. News
comes back by the same search, read the other way. It is cheap: one cost
table per map, a heap of numbers; the soak took 60 s before riders and 59 s
after all three steps (step 1, before the search was made fast, took 66 s).

**Orders on the road** (step 1). `battle.riders`, a queue in battle state
filled by `stepTurn` as orders are given, so a saved battle rebuilds it by
playing back. Each order to a unit beyond the range waits there with the
battle turn it arrives; as each tick opens, those due are given, oldest
first, and only then the new ones. A newer order to a unit arrives no
sooner than the one before it on the road (so an order that would arrive
at once waits for the older one, and is given after it). What an officer
keeps of a deep order, and his loyalty's part in it, is rolled as the
rider arrives. A unit broken or gone by then never gets it. No path: the
order is not sent, and `riderBlocked` says so in the dispatch. Each sent
order is `riderSent` (with its minutes), which only his side hears of. A
unit with an order on the road is not yet "done" for the turn's stop.

**The read-back** says, after each line, "A rider reaches them in about 20
minutes" (or "Riders reach them in 10 to 30 minutes" for several, or "No
rider can get through to Horse: the order is not sent"). It is judged
from where he believes each unit stands and the enemy he knows of, never
the truth: so it may say 20 minutes and the rider find the way shut (the
dispatch then says so). Nothing is said for an order that arrives at
once. If he rides over to another unit in the same orders, the time is
counted from there (within one reading of the orders).

**What he knows** (step 2). `game.word[side]`, filled in by the
orchestrator after every tick. Every ten minutes each of his units sends a
report: where it is, its men, heart and wind, broken or hidden, its
order, and every enemy it can see; and once more as it is destroyed or
leaves the field. A report reaches him when the rider would. The map, the
Army tab, the enemy list, the units the order reader knows by name and
place, and the captor's list of what to ask for are all read from it, so
the browser is sent no more than has reached him. Units within the range
are live (they and what they see); the rest are shown where word last put
them, faded and dashed, with "20 min ago"; an enemy known only by report
is shown at the place and time of that report. He may still order a unit
he last heard of as broken (it may have rallied): the rider finds out,
and the turn never waits on his orders being unreadable.

**The dispatch** tells what reached him in the turn: what he heard at
once, as before, and news by rider grouped by age, newest first, each line
"Word from 20 min ago: ...". The marching of distant units is left out of
it (the map shows where they are). A piece of news about one of his units
comes with that unit's first report sent at or after it; news of the
enemy alone with the report of a unit that saw every enemy in it. The
battle's end, ground changing hands, and what befalls him himself he
knows at once. The verdict tells all, and the replay (only of a finished
battle) shows all, as before.

**Turns that stop on news.** In a battle with a Commander on the field, a
turn stops when news worth stopping for reaches a Commander: a fight,
shooting, a rout, a sighting (an enemy he had no word of, or one come into
his own sight), his orders carried out, a rally; and, as before, ground
changing hands, a Commander taken or freed, the verdict, and a tick in
which no one moved. A side with no Commander (the computer) no longer
stops the turn for itself: otherwise every contact anywhere would stop
the player's turn and tell him something had happened. News more than 200
minutes old does not stop a turn. A turn still ends after an hour.

**Held, and freed.** While he is held no rider reaches him and his ledger
stands still; what he hears is his captors' (as built before: their
side's reports, his map what the unit holding him sees), and the turn
stops for him when it would for his captors. Free again he brings out
where every enemy stood (as `learnFromCaptivity` does for his side), and
his own riders' news starts again from then: what his army did while he
was held is not told again by rider.

**Cut off** (step 3). A unit no rider can reach sends no word: it is
shown where it last was, with "Cut off. No word of them since 1 h 10 min
into the battle", and a cross on the map. He is told once when a unit is
cut off and once when riders get through again (`cutOff`, `inTouch`, only
his side hears of them). Guessed: that he knows at once his riders cannot
get through; the other reading is that he notices only when word stops
coming. It fights on with the orders it has; an order already on the road
to it when it was cut off still arrives.

**The computer** (step 3). It has no Commander on the field. Its orders,
in the app, come marked as from a command post (`byCommandPost`, in the
order log, so saved battles replay them, and a battle saved before replays
as played), and go by rider by the same rule from its best unit (best
quality, then most men, not broken). Its knowledge is not delayed: it
plans from everything its side has seen. That is its next step.

**Measured** (`node src/harness/messenger-league.js`; 400 battles, each
with its own seed, the twenty factions in turn on every map; red is the
player with his Commander on the field with his elite and officers as a
new Commander has them; blue the computer). Red played two ways: as the
planner plays (the nearest thing to a thinking player the harness has),
and sending everyone in every turn. "Planner, on word" is the planner
told of the enemy only what has reached his Commander. Red's wins, before
the change and after each step, on the same seeds:

| | before | step 1 | step 2 | step 3 |
|---|---|---|---|---|
| Planner | 53% (210) | 52% (209) | 52% (209) | 51% (205) |
| Planner, on word | | | 52% (208) | 51% (205) |
| Everyone in | 43% (170) | 43% (171) | 44% (174) | 44% (177) |
| Player turns (planner) | 15.1 | 15.1 | 14.6 | 14.5 |
| Battle minutes (planner) | 230 | 231 | 232 | 230 |

- Orders: 85% arrive at once (an army forms up within 6 tiles of its
  Commander, and mostly stays near him); 12% go by rider; 2 to 4% cannot
  be sent. By rider: half take 10 minutes, three in four 20 or less; the
  longest an hour (10 min: 1414, 20: 657, 30: 292, 40: 182, 50: 43, 60: 8,
  planner, step 3).
- Cut off: some unit of red's was cut off at some point in 35% of battles
  (planner; 41% sending everyone in), 2 to 3% of unit-turns; mostly a
  unit in a fight with the enemy round it, or the Commander's own unit
  pressed.
- The computer's orders: about 2,000 by rider over the 400 battles,
  median 10 minutes, the longest 50; 300 not sent.
- So far the player is not clearly weaker: the planner's win rate fell 2
  points over the three steps, inside the noise of 400 battles, and the
  side that sends everyone in did no worse. The planner reads its own
  units as they stand even "on word", so a real player, who sees his far
  units late, will feel it more than this shows.

**Guessed at:**
- The path rule above (the 3 by 3 round an enemy; hidden enemies do not
  block; ride into a fight but not through it).
- That the computer, with no Commander, no longer stops a turn for
  itself in a battle with one.
- Grouping late news by age in the dispatch, and leaving out its marching.
- That reports carry morale, wind and the unit's order: what an officer
  would send back. (Reports saying more as an officer rises is not built.)

**For Zach:**
1. Should a turn stop for the computer's own news, as it did? (It now
   stops only for the player's, so that the turn's length tells him
   nothing he has not heard.)
2. Should he know at once that a unit is cut off, or only notice when no
   word comes?
3. Should an order already on the road still reach a unit cut off after
   it left?
4. Armies form up inside the immediate range, so riders matter only once
   a battle spreads. Is 6 tiles right, given that?
5. Battles saved before this was built play back, and go on, without
   riders: the server marks each battle it saves as played with them
   (`riders`), and one without the mark is rebuilt with
   `spec.messengers: false`. Should those battles take up riders from
   their next turn instead?

## Rulings, November 23, 2026 (riders, and the balance of armies)

Zach, on four questions the messengers raised:

1. Whether an immediate range of 6 tiles is right: "For now it does, we
   can manage that later. It's going to be part of the challenge of the
   game."
2. Whether he is told at once that a unit is cut off, or notices only when
   word stops coming: "Notice when no word comes back. The lost legions in
   the tuetoberg forest."
3. Whether an order already on the road still reaches a unit cut off
   afterwards: "Yes but no word returns."
4. Whether a turn should stop for the computer's own news: "No the game
   keeps going. This is true for two human players as well. If one player
   gives move command for a march taking 3 turns don't notify that
   commander for 3 turns unless the units spot the enemy. If the other
   command moves 1 turn of movement at a time that is fine... both would
   only be notified when there are commands to give or things happen to
   them. The asymmetry is great because it allows for a better experience
   and does not pass along additional knowledge to either side."

Zach, on the army balance study (`docs/design/army-balance.md`):

1. Take Recommendation A (the knife for missile troops, a volley's lesser
   shock, steadier levy and militia, the sling's and the horse's price):
   "Yes".
2. Veterans that fight a little better and die less, with the computer's
   army matching the player's average veterancy up to seasoned: "Yes".
3. Whether Recommendation B (a muster roll for each faction, with a core,
   support, and prices that rise on repeats) is the direction: "In some
   ways it makes sense but is not as fun. The balance needs to come from
   the units themselves and the combination of weapons and armor. I would
   recommend looking at giving disadvantages in other places to offset the
   balance issues. Some units should be best but can then cost more. It
   should have a grounding in history so I am not rejecting B just changing
   it to be what was historically reasonable. You can afford to make an
   army of slingers because they were lightly armored and fell to heavy
   infantry in most cases. Rome conquered the world with heavy infantry but
   in many cases was bested and decimated by other infantry types."
4. On the smaller questions (an all-levy army left at a third of its
   battles, the war spear's price, the usual armies picked again, training
   and veterancy together): "See answer to 3, pull more levers and
   rebalance in a way to keeps the fun army building ideas alive."

### How the riders rulings were built (Claude's choices, open to change)

Built from Zach's four answers of November 23 to the questions above (the
immediate range stays; he notices when no word comes; an order on the road
still arrives and no word returns; the game keeps going, and each
Commander is notified only when there are commands to give or things
happen to him). The code: `engine/orchestrator/orchestrator.js` ("Asked
when wanted": `wantedNow`, `nothingToDo`, `waitingOn`, `game.wanted`,
`game.calls`, `game.askedAt`), `engine/orchestrator/word.js` (`overdue`,
`back`, `blocked`), `web/battles.js` (who is waited on, the dispatch, the
tent), `web/public/app.js` and `map.js`, the words in `narrator/words.js`
(`RIDER.noWord`, `wordAgain`, `carryingOut`). The numbers are in
`tables.COMMAND` (`OVERDUE` 2, `QUIET` 6, `LONGEST` 36, in ten minutes)
and `tables.DAY.MINUTES` (600).

**1. The immediate range.** Unchanged: 6 tiles.

**2. He notices; he is not told.** No `cutOff` or `inTouch` event, and
his ledger's `cutOff` stays false. Each unit's last word is judged against
what he could expect: a report should be no older than a rider's ride from
where he last heard the unit was, to where he is, round the enemy he knows
of (the same search the read-back uses, on his ledger, never the truth),
plus 20 minutes of slack. Past that the unit is `overdue`: the Army tab
says "By rider: no word of them since 2 h 10 min into the battle. This is
where they last were", with a "no word" flag; the map draws the cross that
used to mean cut off, and labels it "no word". A unit cut off, one
destroyed where no word of it could come, and one merely far off on ground
he did not know was blocked all look the same. When word comes again it
just arrives; the dispatch adds "Word has come from the hastati again".
Nothing announces either change, and neither stops the battle.
- *The read-back* was already judged from his ledger: it never says a unit
  is cut off unless the enemy he knows of shuts the way.
- *An order no rider can carry* used to be told at once ("no rider could
  get through"), which told him the unit was cut off. Now the Army tab
  shows the order on the road for as long as the ride would take as far as
  he knows, and the dispatch tells him the rider could not get through when
  the rider is back: a ride there and back, as he knows the way. Guessed:
  the other reading is that he hears nothing at all of it (no word
  returns); I took a rider who cannot get through to come back and say so.
- Measured (`messenger-league.js`, 400 battles, planner): units marked "no
  word" as red is asked: 1% of unit-turns (210); of those, 49% truly cut
  off, 8% gone from the field, 43% only late (word on its way, or the way
  longer than he knew). With 40 minutes of slack: 43 marks, 23% late, but
  he notices far fewer. I kept 20.

**3. An order on the road still arrives; no word returns.** As built; the
test is "an order already on the road still reaches a unit cut off after
the rider left, but no word comes back from it".

**4. Each Commander is asked only when wanted.** In a battle with a
Commander on the field the battle no longer runs in turns of up to an
hour that every side answers. It runs on until it stops for a side that
is wanted, and only those are asked; the rest are neither told nor waited
for (`waitingOn`). A side is wanted:
- with his army: when news worth stopping for reaches him (a fight,
  shooting, a rout, a sighting, a rally: the stops as built before), or
  his orders are carried out (`ready`, judged by what reached him);
- with his men having nothing left to do (every unit holding, hidden, or
  at its place, by his ledger, and nothing on the road): after an hour.
  Guessed: Zach said "commands to give (his units ... have none)"; asked at
  once and every ten minutes after would be the literal reading, which
  would stop a holding army every tick. The other reading is that a
  holding army waits until something happens to it;
- held: when his captors hear what would stop them (as before), and every
  hour, for he always has an offer to make; offers and answers go on the
  table between stops whatever, as before;
- with no Commander on the field (the computer): as every side was asked
  before, on its own side's news and every hour (`QUIET`). It plans as
  before; only how often it is asked changed (no change in `src/opponent`).
  Guessed: the other reading is that it is asked only when the player is;
- every side: when ground changes hands, when a Commander is taken or
  freed, and when the battle is decided (all of these both sides know);
- no one waits longer than six hours (`LONGEST`), however busy his men:
  a guard so that no battle can run away. 1% of red's turns in the league
  ended that way (a unit fighting on where no word comes back).

*Two players.* A seat not wanted shows "With the army", "Your officers are
carrying out your orders. You will be asked for more when they have done
what you asked, or when something happens to you", and a button to send
new orders. His tent is his ledger as it stands: the last word to reach
him. Nothing says the battle is waiting on the other seat ("Waiting on the
enemy" and "The enemy commander has not answered yet" are gone, for they
would tell him the other was asked). His turn number is his own (how many
times the battle has stopped for him), not the battle's. If he sends
orders unasked they wait, and go out when the battle moves on; they never
make it wait for him. Your guess, which I kept: he may change his mind
unasked. Sending orders that run the battle on to a stop for the other
side answers him "waiting", not "turn ran". The dispatch is written only
to a side the battle stopped for, and covers every stretch since his last
dispatch (`through`, the history length); its heading gives his own reason.

*Against the computer* the server answers for the computer at each of its
own stops in the same request, so a player's request always ends on his
own turn or the verdict (each of the computer's orders is in the log).

*The day.* Turns are now each Commander's own, so the day is counted in
battle time: `DAY.MINUTES` 600, ten hours (forty turns at the fifteen
minutes a turn ran on average before: 230 battle minutes over 15.1 turns).
The tent says "night falls at 10 h". A `turnLimit` asked for (a testing
aid) still counts the battle's stops. Guessed: the other reading is forty
of each Commander's own turns.

*Saved battles.* The server marks each battle it saves as played with the
rulings (`asked: true`); one without the mark is rebuilt with
`spec.everyoneAsked: true`, which plays it, and goes on with it, as
before: every side asked at every stop, a turn within the hour, and a unit
cut off told at once. Tests: a fixture made with the code of main at
ca49eab (`web/tests/fixtures/before-asked`) replays to the same history
and armies; whole event logs of a battle with a Commander, under
`everyoneAsked`, match those of the old code; and a battle with no
Commander on the field runs exactly as before
(`harness/tests/asked-unchanged.test.js`).

**Measured** (`node src/harness/messenger-league.js --battles 400`, the
same seeds; red the player with his Commander, blue the computer; red now
gives orders only when asked, so "player turns" are his own; before, every
turn was both sides'):

| | before | after |
|---|---|---|
| Red's wins, planner | 51% (205) | 51% (204) |
| Red's wins, planner on word | 51% (205) | 51% (204) |
| Red's wins, everyone in | 44% (177) | 43% (172) |
| Player turns (planner) | 14.5 | 12.5 |
| Stops of the battle, either side (planner) | 14.5 | 15.8 |
| Battle minutes (planner) | 230 | 237 |
| Red's wait between his turns (planner) | median 10, 90% 30, longest 60 | median 10, 90% 30, longest 360; over an hour 3% |
| Why red was asked (planner) | contact 50%, fire 14%, stalled 10%, sighting 8%, time 7%, decided 7% | contact 58%, fire 17%, sighting 10%, decided 8%, ready 3%, time 2%, long 1% |

Fewer turns for the player, a few longer waits, and no change in who
wins. The soak still ends every battle; the balance table is unchanged.

**For Zach:**
1. A Commander whose men only hold is asked again after an hour. Should
   a holding army rather wait until something happens to it?
2. An order no rider can carry: told when the rider is back (a ride there
   and back), or never?
3. The computer is asked on its own news and every hour. Fewer would make
   it weaker; it does not stop the player either way.
4. The day: ten hours of battle time. Right?

### How the army balance was built (Claude's choices, open to change)

Builds Zach's answers of November 23 to the army balance study
(`docs/design/army-balance.md`, whose Part 5 has every table): Recommendation A
taken; veterans who fight a little better and die less taken (the engine part
was on the branch already; the app wiring is other work); no muster roll, the
balance to come "from the units themselves and the combination of weapons and
armor", with "more levers".

**A on twenty factions.**
- A faction's elite is checked only for kit its culture may field, not for
  A's rules on what is sold (`buildUnit(pick, culture, { elite: true })`): the
  Peltast Guard's and Blue Men's javelins and the Eternal Sky Riders' medium
  armour stand, as the doc gives them.
- Every javelin or throwing-axe unit in a usual army re-armed: Rome's velites
  (levy, sword, light kit), Macedon's peltasts (professional, basic spear),
  Sparta's skirmishers (levy bows), Germania's skirmishers (levy slingers) and
  axemen (battle axe), Thrace's javelin men (tribal slingers), the Numidian,
  Berber, Celtic and Sarmatian light horse (swords). Then Han, Kush, Mongolia,
  Sarmatia, Bactria and Sparta re-picked by the twenty-factions method
  (`army-study/usual.js repick`).
- The suite's slowness on that branch was a hang, not a loop:
  `web/tests/factions.test.js` mustered illegal usual armies, one test threw
  before closing its server, and the file never exited.

**The levers kept** (each in `tables.js` or `army/data.js`, with its
measurements in the comment):
- **Armour by its weight**: medium 2 SP, heavy 4 (were 1 and 2). Three
  professionals with a 1-SP spear won 74% in light armour, 94% in medium, 98%
  in heavy. After: heavy infantry 99% -> 88% against the usual armies.
- **Heavy armour's wind**: stamina drain 12 a round (was 6; 9 tried). Heavy
  infantry 88% -> 78% against the usual armies, 79% -> 69% against the other
  classic armies; pikes now beat it (54%).
- **The usual armies re-picked** under those two (Germania, Parthia, Yayoi,
  Kush, Samnium, Bactria, Carthage, Maurya). League, 6,080 battles: every
  faction 40% to 59%; 26 of 190 pairings past 75/25 (41 before A, same
  harness and seeds).

**Tried and dropped** (Part 5 has the numbers): heavy foot marching 2 tiles;
pikes keeping the enemy off on open ground and disordered in rough; the
computer playing horse archers as archers (a planner change, reverted);
the basic spear at 2 SP; professional archers with a sword; the pike at 4 SP.
Stopped after three rounds in a row that did not help.

**Measured, not retuned**: the Commander's odds (taken 1 in 24.4 -> 23.5 for
a player who sends everyone in, `captive-league.js`, 2,000 battles; with the
computer's plan on both sides 1 in 40 -> 34 taken, 1 in 450 -> 368 killed,
12,160 Commanders). `VETERANCY.STEPS` unchanged. `npm run balance`: the
mirror ladder as A left it; the duel matrix's heavy infantry row moved with
its wind (against spearmen 29/71, cavalry 2/98).

**Tests.** A's rules had no tests; each now has one whose title reads as the
rule, as do armour's price and wind. Tests that pinned old numbers pin the new
ones. Fingerprints of whole battles (`attack-named-unchanged`,
`messengers-unchanged`, `asked-unchanged`) were retaken, the old values kept in
each header: combat changed on purpose, so the same battles fall out
differently. The riders tests that search seeds 5 to 10 for a battle that stops
for one Commander alone now search to 40.

**Still failing, for Zach**: `roster.test.js` "battles and Commanders saved
before the roster still load, and replay to the same battle" and `asked.test.js`
"battles saved before the riders rulings load, replay to the same battle...".
A battle saved under the old combat replays differently under the new (the
finished one is no longer decided at its last turn). The fixtures are left as
they were.

**Guessed.**
- "The balance needs to come from the units themselves" was read as prices
  and what kit does, not new kinds of unit or new orders. The other reading
  would allow a skirmish rule (missile troops step back from slower foot),
  which is the lever this work most lacks and is a question below.
- "Some units should be best but can then cost more" was read as armour
  (the best protection, now priced), not the professional tier: at the old
  armour prices the tier price barely mattered (pro 8 SP: 92% for heavy
  infantry, as at 7).
- Elites exempt from A's sale rules: read as "the elite is not bought". The
  other reading re-arms the doc's elites to fit A.
- The usual armies keep to the doc's restrictions as before (Parthia's 10 SP
  of levy, Kush's no heavy foot, Yayoi's no horse, all horse for the steppe).

**Open, for Zach.**
1. Professionals in medium armour are now the best buy (three with a basic
   spear: 92-93%). Medium armour at 3 SP (measured 86%), or wait for players?
2. A skirmish rule, so horse archers and slingers can wear heavy infantry
   down as at Carrhae? (Recommended next.)
3. Battles saved under older rules: replay under the rules they were played
   with (a rules version on each saved battle), or under today's?
4. Kush's Golden Bows fight with a knife hand to hand: give the elite a sword?

### How veterans in battle were built (Claude's choices, open to change)

Builds Part 4 of `docs/design/army-balance.md` ("Veterans who fight
better", and "The fairness problem"), taken 2026-11-23 with the computer
matching the player. The engine's part (`tables.VETERANCY.STEPS`: from
green 4, seasoned 8, veteran 13 and legendary 20 battles a man, +0.25,
+0.5, +0.75 and +1 to attack and defence and 5, 10, 15 and 20 in a hundred
fewer of the men a blow would fell) was on the branch already; nothing
passed a unit's veterancy into a battle. The code: `web/battles.js`
(`leadSide`, `matchComputer`), `veterans/veterancy.js` (`veterancyLevel`,
`matchedVeterancy`), `tables.VETERANCY.MATCH_UP_TO`, `narrator/words.js`
(`VETERANCY_WORDS`), `web/commanders.js` (the view's `units[].level`), the
Officers page and the army screen.

**What was built.**
- **Each unit goes in with its own veterancy.** At the muster, and when a
  friend joins with his Commander, each of his units takes its men's
  average experience (`unitsOf`, to the hundredth) as it stands before the
  battle, onto the unit in the battle's spec. So it is saved with the
  battle and replays. A unit at 0 (raised new, or bled to nothing) gets no
  `veterancy` at all, so it is the same spec, and the same battle, as
  before.
- **The computer matches, up to seasoned.** Against the computer, every
  unit of its army takes one number: the average of the veterancy of the
  units he fields in this battle, **each unit counting once whatever its
  numbers, the elite among them, a unit with none counting as nothing**,
  and no more than 8 (`MATCH_UP_TO`, seasoned). Units left at home do not
  count. It is fixed at the muster, in the spec, for the whole battle.
- **Between two Commanders** each army carries its own; nothing is matched.
  The friend's side carries nothing until he joins with a Commander. No
  "fresh armies" switch (not asked for).
- **He can see it.** On Your officers each officer's card says "His men:
  seasoned, 9 battles a man on average", and a unit with no officer the
  same ("Their men: raw, ..."); on the army screen each unit's line ends
  "· men: seasoned". The words are `VETERANCY_WORDS` in `words.js`: the
  officers' grade words (green, seasoned, veteran, legendary) at the same
  steps, and **"raw"** below green (a new word: nothing in `words.js` named a
  unit below green; "nameless" is an officer's, "fresh" and "recruit" were
  the old ladder's). The server sends the word; the page puts it through
  `esc()`.
- **Fog of war.** No seat's view, his own or the enemy's, says any unit's
  veterancy or what the computer matched (tested). The enemy's veterancy is
  shown nowhere.
- **Training and veterancy stack**, as the study describes: a unit trained
  up a level by an officer of thirty battles goes in at its new quality and
  with its veterancy (tested). No cap.

**Measured** (`node src/harness/army-study/veterans-match.js --seeds 4`,
new: a Commander's usual army, every unit of it carrying the veterancy,
against the computer's usual army of another faction, the planner on both
sides; the 9 factions whose usual army passes the builder on this base
(kush, han, maurya, silla, persia, parthia, samnium, tibet, yayoi), four
maps, both ways round; 288 battles a row, each its own seed, the same seeds
in every row). `veterans.js --vs usual` could not run here: it fields all
twenty factions' usual armies, and eleven fail the builder on this base.

| His units carry | Without the match: won, his men lost, the computer's | With it: the computer carries | won, his men lost, the computer's |
|---|---|---|---|
| none | 51%, 39.1%, 39.5% | none | 51%, 39.1%, 39.5% |
| green (4) | 52%, 37.0%, 39.9% | 4 | 51%, 38.1%, 38.6% |
| seasoned (8) | 55%, 35.4%, 40.9% | 8 | 51%, 36.7%, 37.5% |
| veteran (13) | 59%, 33.8%, 41.3% | 8 | 52%, 35.2%, 38.3% |
| legendary (20) | 59%, 32.6%, 42.0% | 8 | 54%, 33.1%, 38.5% |
| thirty battles (30) | 59%, 32.6%, 42.0% | 8 | 54%, 33.1%, 38.5% |

What the numbers say:
- **Without the match** a long-lived Commander wins clearly more (none 51%,
  veteran and legendary 59%) and loses fewer men.
- **With the match** the computer is never a pushover: the veteran wins
  about what a new Commander wins (51% new, 51% seasoned, 52%
  veteran, 54% legendary), within the noise (about 4
  points at 288 battles). **His reward is almost all in men kept alive**,
  not in battles won: his losses fall from 39 to 33 men in a hundred,
  about as much as without the match, while the computer's matched men
  also die a little less (39.5 to 38.5).
- Thirty battles is the same as legendary: the steps stop at 20.
- So the match does what was asked ("never a pushover"), and the reward
  that is left is the one the game is about (keeping his people alive). If
  Zach wants a veteran to win more often against the computer too, the cap
  could be lower (green), or the match a share of his average.

**Measured again on the rebalanced armies** (the same script after the
army balance above was merged in: all twenty factions' usual armies now
pass the builder; `--seeds 2`, 320 battles a row):

| His units carry | Without the match: won, his men lost, the computer's | With it: the computer carries | won, his men lost, the computer's |
|---|---|---|---|
| none | 55%, 38.0%, 41.5% | none | 55%, 38.0%, 41.5% |
| green (4) | 59%, 36.1%, 42.5% | 4 | 54%, 36.7%, 40.4% |
| seasoned (8) | 61%, 35.1%, 43.0% | 8 | 56%, 35.3%, 39.1% |
| veteran (13) | 65%, 33.7%, 43.5% | 8 | 59%, 34.0%, 40.1% |
| legendary (20) | 68%, 32.0%, 43.8% | 8 | 62%, 32.5%, 40.9% |
| thirty battles (30) | 68%, 32.0%, 43.8% | 8 | 62%, 32.5%, 40.9% |

The same shape, a little wider: without the match legendary veterans win
13 points more than a new army; with it, 7 points more past the cap and
nothing below it. (With no veterancy on either side he wins 55% in this script, not 50%,
though the armies are met both ways round; why was not looked into.)

**Guessed at.**
- **The average weighs units equally and counts the elite** (as
  recommended). The other reading: weigh by men (a big unit of recruits
  pulls it down more), or leave the elite out (it is usually his best).
- **"Up to seasoned" read as a veterancy of 8**, seasoned's step; the
  average itself is passed under it (so 6 is 6, which fights as green).
  The other reading: round the match down to its step.
- **The match is of the units he fields this battle**, not his whole
  roster.
- **A friend's side** carries nothing until he joins with a Commander; a
  friend who joins with none fields no veterancy, and no match is made
  (he is not the computer).
- **"raw"** as the word for a unit below green.
- Veterancy goes in to the hundredth, as the company keeps it; only the
  steps matter in the battle.

**Left open.**
- **A cap on training and veterancy together** (the study's question 8:
  "professional +1"?). Not ruled; none built.
- The muster does not show the enemy's or the computer's veterancy before
  the battle (the study's idea for friends); not asked for.
- `veterans.js` should be run again with the twenty factions once their
  usual armies pass the builder.

**Tests.** `src/engine/veterans/tests/veterancy-in-battle.test.js` (5) and
`src/web/tests/veterans.test.js` (11), and a line in the fog-of-war test
in `server.test.js`. A battle saved before this change is
`tests/fixtures/before-veterans` (made with the code before, by
`fixtures/make-before-veterans.js`): it has no veterancy in its spec and
replays exactly. Like every saved battle, it pins the combat rules of the
day: a change to combat replays it differently (as `before-roster` already
does on this base). `roster.test.js` compares a Commander's units without
the new `level`.

### How the skirmish rule was built (Claude's choices, open to change; a proposal, not taken)

**Not taken** (November 24: "I don't like the skirmish rule. Fire and
retreat is ok"; "No firing on the move"). Fire and retreat was built in
its place: see "How fire and retreat, Kush's sword and the Commander's
odds were built", at the end.

Asked for as the next lever after the army balance (Part 5 of
`docs/design/army-balance.md`, question 2: "a skirmish rule, so horse
archers and slingers can wear heavy infantry down as at Carrhae"), built
from Zach's direction of November 23 that the balance "come from the units
themselves and the combination of weapons and armor", grounded in history.
**Not ruled.** Part 6 of the study has every table. The code:
`engine/battle/skirmish.js` (`canSkirmish`, `outruns`, `fallBack`), its step
in `battle/battle.js`, `tables.SKIRMISH`, `ranged.volley` (foot that fell
back), `opponent/planner.js` (six lines), the `gaveGround` event
(`battle/events.js`), its words (`SKIRMISH_WORDS` in `narrator/words.js`,
`turnNarrator.js`, `adapters/hotseat/render.js`).

**What was built.**
- **A skirmisher is its kit**: a missile weapon, and light armour or none
  (`SKIRMISH.ARMOUR`). No new purchase, no new order.
- **Only while pressing the enemy** (advance, or attack with no target).
  Hold, defend, a march to a place, hiding, or a fight already joined: it
  does not. Pressing, it closes to the first place it can shoot from (the
  nearer of its weapon's reach and its own sight, 6 tiles), and only on an
  enemy in sight: closing on a place an enemy was last seen, a unit stood
  for ever (found by the planner's own "plays every map to a verdict"
  test).
- **It falls back** when seen enemies, formed and not fighting, are within
  their reach (their march plus one tile) and one more tile (`WARY` 1),
  and it outruns them all: horse outrun foot, light foot outrun foot in
  medium or heavy armour (`OUTRUN_ARMOUR`), nothing outruns horse or light
  foot. With any enemy it cannot outrun among them it stands. It goes to
  the tile it can reach this tick (over the ground: the movement costs, a
  first step always allowed, never through an enemy) that is out of reach,
  then still in shot, then farthest, then straight back, then the shortest
  run. Nowhere better (an edge, a river behind): it stands.
- **Its limits**: 5 stamina a tick of running (`WIND`); spent under 40%
  (`SPENT`). Foot shoot after falling back at half rate (`ON_FOOT` 0.5);
  horse archers at `MISSILES.ON_THE_MOVE` as before.
- **The chase**: each enemy it fell back before, if it moved that tick,
  loses its kit's stamina drain a round (armour, shield, horse; not the
  base 8) once a tick (`CHASE` 1).
- **The computer**: its foot skirmishers press any enemy in sight within
  `TUNING.ENGAGE` (7) tiles, whatever its posture. Horse archers are left as
  the planner had them.
- **Told**: one line a turn for each unit ("fell back before X, keeping out
  of their reach", the order's own word for falling back), shown to the
  enemy only if he can see the unit.
- **A battle with no skirmisher in it** is not changed by any of this: the
  rule's code runs only for a unit that `canSkirmish`, and the balance
  matrix is the same line for line.

**Measured** (Part 6 has the tables): heavy infantry 77 -> 70% against the
usual armies and 70 -> 61% against the other classic armies; slingers
against it 29 -> 53%, archers 23 -> 38%, horse archers 33 -> 48%. Kinds
"All" 38 to 68% (was 36 to 70). The usual armies' league 39-60% (was
40-59), 27 pairings past 75/25 (26). The random search's best army
unchanged (93%, Carthage's three professional spears in mail); the best
army of skirmishers only 83%, as before. Soak: every battle ended, a few
player turns longer. `npm run balance`: unchanged. The Commander taken 1 in
16.7 by a player who sends everyone in (23.5 before), 1 in 30 with the
computer on both sides (34). Eight rounds, one change at a time; the one
dropped was the computer playing horse archers as foot skirmishers.

**Guessed.**
- "Keep their distance from slower men" was read as **speed and kit**: equal
  speed but heavier armour counts as slower (a hoplite cannot catch a
  slinger), since every foot unit marches 3 tiles. The other reading would
  give heavy armour a slower march; Part 5 tried 2 tiles a tick and dropped
  it, and with this rule it would double up on the chase's wind.
- **The chase's wind** comes from the unit's own kit, not from a new number
  per kind: "men who run tire" read for both sides of the run.
- **Foot shoot as they fall back**, against the ruling of November 21 that
  missile troops on foot shoot only standing. Without it (measured) the rule
  helps less (slingers against heavy 39%, not 53%). This is question 2 in
  Part 6, for Zach.
- **No ammunition**: arrows do not run out (ruled November 21), and the
  measurement did not need it: the best skirmisher army is no better than
  before.
- **The day's end left alone**: a side that fell back all day can still win
  on fewer losses; archers do so in 26 of 320 battles (16 before). Measured,
  not changed.
- The computer's horse archers keep riding for enemy archers first; the
  other reading (skirmish with them too) was measured and was worse.

**Tests.** `src/engine/battle/tests/skirmish.test.js` (13), a planner test
("a holding side's skirmishers on foot press a near enemy ..."), a narrator
test, `gaveGround` in the event schema test. `attack-named-unchanged` retaken
(its battles have skirmishers in them), the old values in its header;
`asked-unchanged` and `messengers-unchanged` did not change. The battle saved
before veterans (`web/tests/veterans.test.js`, "a battle saved before
veterans went into battle ... replays exactly as it was played") now replays
differently, as the two older saved battles do; its fixture is left as it
was, for Zach's question on old battles.

**Open, for Zach** (Part 6's questions): take the rule; let foot shoot as
they fall back; the Commander's odds (1 in 17 for a player who sends
everyone in); a win at the day's end for a side that never closed.

## Rulings, November 24, 2026 (riders again, the day, old battles, fire and retreat)

Zach's words, answering the questions left open on November 23.

**Riders.**
- On whether a Commander who is not being asked may send new orders:
  "You can interrupt units mid March. But orders don't come over till the
  end of the turn."
- On a Commander whose men only hold: "Holding for several turns would
  still get interrupts from passing enemy troops".
- On the length of the day: "10 hours is fine... might as well make it 12
  armies did not fight in the dark."
- On an order no rider could carry: "Like if the unit is surrounded, the
  rider should return with that news. After turns of travel pass".

**Old saved battles.** "There are not any old battles I care about".

**Armies.**
- Medium armour at 3 SP: "Maybe". (Not taken; left as it is.)
- Kush's Golden Bows: "They don't hit hard from range? They can have a
  sword".
- The skirmish rule (docs/design/army-balance.md, Part 6): "Skirmish rule
  makes sense but evidence like marathon shows heavy infantry can run a
  long way. I don't like the skirmish rule. Fire and retreat is ok".
- On men on foot shooting as they fall back: "No firing on the move."
- On the Commander being taken more often: "Retun commander taken odds".
- On a side winning at the day's end on fewer losses: "No the day just
  ends the battle, you can choose to fight again the next day."

### How the ruling on old battles was built (Claude's choices, open to change)

- A battle saved under older combat rules still loads and plays back under
  today's rules, so it may not be the battle it was (a finished one can
  come back unfinished). Nothing was built to stamp saves with their rules.
- The three tests that held old saves to the battle they were
  (`roster.test.js`, `asked.test.js`, `veterans.test.js`, fixtures
  `before-roster`, `before-asked`, `before-veterans`) now show only that
  such a save loads with the same units, keeps what marked it as old, and
  goes on. The fixtures are untouched.
- Guessed: that "not any old battles I care about" covers battles saved from
  now on as well, until there are players. The other reading is that only
  today's saves are let go; then each save needs a rules stamp before the
  next change to combat.

### How the day, the night and the hold were built (Claude's choices, open to change)

Built from four of Zach's answers of November 24 (above): the day of twelve
hours, the day that just ends the battle, the holding Commander, and the two
rider rulings already built.

**1. The day is twelve hours.** `tables.DAY.MINUTES` 600 -> 720; the app's
battles take it at the muster (`spec.dayMinutes`), and the tent says "night
falls at 12 h". A battle saved before keeps the day it was made with, for
`dayMinutes` is in its spec: one mustered at 600 still ends at 10 h. The
muster's note now gives the length of the day and what night does, from
`narrator/words.js` (`NIGHT.day`, through `GET /api/day`), instead of "the
day ends after 40 turns". `DAY.TURNS` is no longer read.

**2. The day just ends the battle.** Every day's-end verdict, and what was
done with it:
- *The app's day* (`dayMinutes`) and *the older turn-count day*
  (`turnLimit`, a testing aid the API still takes): both now end the
  battle `{ winner: 'draw', reason: 'night fell' }`
  (`orchestrator/victory.js`, `nightFalls` in the orchestrator). The stop
  is `'night'`, not `'decided'`, so the dispatch's heading says "night
  fell". A `nightfall` event is put in the log: both sides see the dark
  come down, so it is told to everyone (`visibleEvents`, `fromCaptivity`,
  and `arrivalOf` at once), weight 0. The plain account, and with it the
  AI dispatch's fall-back, says "Night has ended the fighting, and neither
  side has won" (`NIGHT.ended`); the AI is given the same line among its
  facts. The tent's verdict is titled "Night fell", with the same line.
- *Who was ahead* is kept on the outcome as `ahead` (the side the old rule
  would have named: more ground held, then fewer men lost; or null), for
  the harness's tables only. The server strips it from what it sends the
  browser; the game never calls it a win. The army study
  (`harness/army-study/lib.js`, a day of forty turns) counts `ahead` as
  the winner, so its tables read as they did, and says so.
- *The time limit* (`timeLimitMinutes`, ruled 2026-10-21 as a testing aid;
  the hotseat terminal's default of four hours): left as it was, fewer
  losses wins. Guessed: it is a test harness's clock, not the day. The
  other reading is that the terminal game's clock is a day too, and should
  end in night; that is one line in `victory.js` if so.
- *The soak's "meeting battle: a verdict in 50 of 50"*: that battle has no
  day (`runBattle`, decided only by the fighting), so the line means what
  it did; unchanged. The soak's other games have no day either.
- *The leagues* (messenger, faction, captive, bought): none sets a day.
  The messenger league takes `--day 720` now, to measure it; a night is
  counted there as drawn.

What a battle ended by night does to what follows: it is a battle fought
with no winner, which is what a draw already was everywhere a battle is
settled, so the result written is `'draw'` and nothing new was needed.
- Each Commander's record and his officers' records: "a draw". A battle
  counted; no win, no loss.
- Officers' experience, units' veterancy and training: as after any
  battle (they never depended on the result).
- Officers' fates: the odds of a draw (`FATES.BASE.draw`). Loyalty: moved
  as by a draw (`LOYALTY.MOVES[values].draw`). Guessed: the plainest
  reading of "no winner"; the other is to move loyalty not at all.
- Capture: a Commander taken during the day is still taken. When night
  falls with him held and no deal struck, he is let go, as at any end of a
  battle his side did not win (`heldWhenTheBattleEnds`, 'released'); the
  verdict says "Night fell with you still in the enemy's hands ... they let
  you go" (`NIGHT.released`). Guessed: the other reading is that he stays
  in their hands into the next day, which would need a captive carried
  from battle to battle (a campaign). His offers end with the battle, as
  they do at any end.

*Fight again the next day.* After a battle night ended, the verdict's main
button is "Fight again the next day" (`NIGHT.again`), with a line under it:
"Against the same enemy, on the same field. Your army comes as it stands
after today." It calls `POST /api/seat/:token/again`
(`battles.js`, `again`), which musters a new battle as the muster does:
the same field, kind of battle, side and day, the same Commander (his army
as his company and roster carry it from any battle to the next, and who
marched marches again), and the same enemy faction. Against the computer its army is
its faction's again, matched to his veterancy, as at any muster. A new
seed: a new day. The title ends ", day 2" (3, and so on). It is made once:
the old battle remembers it (`next`, saved), and whoever asks after is
given his own seat in it; the old verdict then links there.
- *Against a friend*: the same, and the friend's Commander is put at the
  head of his side at once, as if he had joined (`join`), so no one has to
  choose again; the friend finds his seat from the old battle's verdict
  (the same button), and each is shown only his own seat. If the friend
  had no Commander, or his army is in another battle, the seat is left for
  him to choose as on the first day. Not built: telling the friend that the
  other has asked for the next day; he sees it when he looks at the old
  battle.
- Guessed: "the same enemy" is the same faction (and, against a friend,
  his Commander). The computer keeps no army from battle to battle (it has
  no roster), so its men are fresh. The other reading is that its losses
  carry over too; that needs the computer to keep an army.

**3. A Commander whose men hold is not called back by the clock.** Built
as I read it: a free Commander with his army is asked when news reaches
him (a sighting, a fight, shooting, a rout, a rally), when his orders are
carried out, when ground changes hands, and no longer when an hour has
passed with his men holding (`wantedNow`; `nothingToDo` retired). The
guard stays: no one waits more than `COMMAND.LONGEST` (six hours). Two
things kept, and why:
- A held Commander is still asked every hour: he always has something to
  do (an offer to make), which the ruling does not touch.
- The computer is still asked on its own news and every hour: it is not
  shown a screen, it does not stop the player, and asking it less would
  only make it slower to answer what it sees.
- Added, so that nothing waits on the hour any more: a rider back with
  word that he could not get through (2b, below) calls him back
  (`'rider'`), for he has commands to give. Before, the hour did it.
The first stop asks everyone, as before. Two Commanders who both hold all
day are each asked at six hours, and night ends it at twelve (tested).
Every soak battle ends.

Guessed: "Holding for several turns would still get interrupts from
passing enemy troops" means he waits. The other reading is that Zach was
only remarking that holders are interrupted anyway, and the hourly call
stays; then it is one line back in `wantedNow`.

Measured (`node src/harness/messenger-league.js --battles 400 --policy
planner`, the same seeds; red the player with his Commander, blue the
computer; no day, as before):

| | before | after |
|---|---|---|
| Red's wins | 51% (205) | 57% (229) |
| Red's own turns a battle | 12.8 | 12.3 |
| Battle minutes | 252 | 220 |
| Stops of the battle, either side | 16.3 | 15.6 |
| Red's wait between turns | median 10, 90% 30, longest 360; over an hour 3% | median 10, 90% 20, longest 360; over an hour 4% |
| Why red was asked | time 2%, long 1% | time 0% (held only), long 0%, rider 0% |

Red wins more: the planner, not called back after an hour of holding, no
longer re-plans into an advance; it holds until the enemy comes. With the
rider's call taken out again the numbers are the same, so it is the hold.
That is a real change in how a holding army fares against the computer.
With the day (`--day 720`): red won 55%, lost 42%, 11 of 400 ended by
night (`--day 600`: 20); the old code with a day of 600, where the day
named a winner: 51%, 47%, 8 drawn.

The soak: every battle ends (the computer's side 18.9 -> 19.2 player
turns; the rest unchanged). The balance table is unchanged.

**4. Two rulings already built, now tested by name.**
- "You can interrupt units mid March. But orders don't come over till the
  end of the turn." As built: a side not wanted may still send orders;
  `submitOrders` holds them (`game.submitted`) and they go out as the next
  stretch begins, when the side wanted answers. Units marching are
  redirected then, not a step later. Test: "you can interrupt units mid
  march, unasked, but the orders do not go out until the end of the turn in
  play" (engine), and the server's "a Commander not asked may still send
  new orders" (against a friend, the "Send new orders" button). Against the
  computer every request ends on the player's own turn, so he is never
  unasked there: his orders, on his turn, redirect a march at once.
- "Like if the unit is surrounded, the rider should return with that news.
  After turns of travel pass". As built, told when the rider would be back
  (a ride there and back, as he knows the way). The words now say why:
  "your rider to the hastati has come back: he could not get through, and
  your order did not reach them" (`RIDER.blocked`; it was "no rider could
  get through to ..."). And the rider's return now calls him back (above).
  Test: "when a unit is surrounded, the rider returns with that news after
  his ride there and back, and the battle stops for him then".

**For Zach:**
1. A holding army now waits for news, and against the computer it wins
   more (57% from 51%). Right, or should the hour come back?
2. Night falling with your Commander in the enemy's hands: let go, as at
   the end of any battle you did not win. Or should he stay their captive
   into the next day?
3. The next day against the computer: its army is fresh, yours carries
   your losses as it does from any battle to the next. Should its losses
   carry over too?
4. The terminal game's four-hour clock still names a winner on losses. Is
   it a day too?

## Rulings, November 24, 2026 (the next day)

- Asked whether, on the next day against the computer, the computer's
  losses should carry over as the player's do: "lol yes, it's just night
  time. Computer does not get to reset." (November 24, 2026)
- Asked whether it is good enough that a friend gets no notice that a next
  day was started: "no they need a notice" (November 24, 2026)
- Asked about a Commander held captive when night falls (built: he is let
  go if no deal was struck): "The battle ends today, I don't have a good
  solution atm" (November 24, 2026). So it stays as built.

### How the next day was built (Claude's choices, open to change)

**1. The next day is the same two armies, as they stood at nightfall.**
"It's just night time": the next day's battle is fought by the armies that
left the field, on both sides, whoever leads them.
- *What carries* (`nightArmies` in `web/battles.js`). Every unit of either
  side with men left, and no other. Its men are those standing, and those
  who ran: men who fled come back to the standards in the night; the dead
  do not. A unit destroyed is gone. Its kit, faction, quality and where it
  was drawn up are the day's. Guessed: the other reading is that a unit
  that fled the field is lost to that battle; I took "it's just night
  time" to mean the men drift back to camp.
- *Strength when whole* (`maxStrength`) stays what it was. A unit of a
  hundred with sixty left is a battered unit of a hundred, not a fresh
  unit of sixty, so it hits softer (`strengthScale`) and its morale reads
  losses against its whole strength. Guessed; the other reading (a fresh
  smaller unit) would make day 2 forgive the day's losses.
- *The computer's side*: no fresh units, no muster from its faction, its
  veterancy not matched again (it keeps the day's); each unit keeps its
  officer, or has a new man if he was killed, taken or wounded in the day.
  The computer keeps no roster: the army is carried in the next battle's
  making (its spec), as the brief said, not in a store.
- *A Commander's side*: the same men, and no recruits or buying in the
  night. Between two battles a unit is made up to strength with recruits
  who know nothing (`settleBattle`), and he may buy or change his army;
  over one night neither happens. So: the units that marched on the day,
  with the men left, whatever he has bought or changed since (that waits
  for his next battle). His officers come from his company as the day
  left them (the dead gone, the wounded sitting it out, a successor where
  one came forward), and training as built. Each unit's veterancy is its
  own men's: the company's experience over the men left
  (`totalExperience / men`), not thinned by recruits who did not come.
  The other reading, that a night between days is like any time between
  battles, is what was built before; it refilled every unit.
- *The company after the next day*: `settleBattle` takes `full` on each
  unit's fate. The unit is counted as going in with the men it had (none
  of the missing are counted among the fallen), and is made up to `full`
  only once the fight is over. With no `full`, every battle settles as it
  did (tested).
- *Against a friend*: the same for both. His Commander is put at his
  side's head at once if he can lead it, as before; if not, the friend
  still chooses who leads (`join`), but the army is the day's: a Commander
  of another faction is refused, and his own roster is not read.
- *Day 3* after a second night is the same (tested to day 3).
- *Nothing left*: if one side has no unit with men left, there is no next
  day: the verdict says "There is no next day: one side has no one left
  able to take the field." (`NIGHT.noNextDay`) in place of the button, and
  the server refuses it (409). In practice a side with nothing left has
  lost before night falls.
- *What he is told*: the note under the button now reads "Against the same
  enemy, on the same field. Both armies come as they stand after today,
  yours and the enemy's: the fallen are gone, those who ran are back with
  the standards, and no fresh men come to either side in the night." No
  numbers of the enemy beyond the verdict's own table; the next day's tent
  is cut to his side as every battle is (tested).
- Replays: the armies are in the next battle's spec (`units`, and
  `nextDay`: its day) when it is made, so a saved next day replays.
- Small change outside the web app: `engine/command/company.js`
  (`settleBattle`, `full`), and `leadSide` now writes `raisedAs` into the
  spec for a unit trained above what it was raised as, so the next day
  trains it from there and not twice (the engine does not read it; the
  balance table and the soak are unchanged).

**2. The friend is told a next day has begun.** No accounts, no email, no
push: the notice is inside the game, wherever he next opens it.
- The words (`NIGHT.calledOut`): "The enemy has called you out for a
  second day. Your orders are wanted." ("third", and so on.) "The enemy",
  not the other Commander's name: the plainest choice that tells nothing
  new across the fog. Naming him is one line if wanted.
- *When*: the other side called the next day (`calledBy`, saved), and the
  new battle is still waiting on this side's first orders (or his choice
  of who leads). Once his orders go it is gone. The one who called it is
  never told he was called out.
- *His list of battles*: the old battle's line names his own seat in the
  new one (`nextDay`); the browser keeps it from then on, so the new day's
  battle is in "Waiting on you", with the notice on it. The home page,
  which opens the battle waiting on him, finds it the same way.
- *His Commander's page*: under "His army is in the field", the notice as
  a dark banner that links to his seat.
- *The old verdict*: the same banner, in place of the button, linking to
  his seat; the note under it as before.
- *Without a reload*: the tent already polls (every 30 s, and when the
  page comes back into view) while a battle runs. A verdict of a night
  between friends with no next day yet now polls its summary the same way,
  and shows the banner when the next day appears.
- *The browser's own notice*: on that verdict, a quiet button "Tell me here
  if the enemy calls a next day" asks for the browser's permission
  (`Notification.requestPermission`); granted, the polling page shows a
  notification when it finds the next day while hidden. Only while the
  page is open: no service worker, no push. Real "your move" messages to
  a closed phone need hosting and an address: a later piece of the
  roadmap, not built.
- Either way round: whoever asks first, the other is told (tested).

### How reports that grow with the officer were built (Claude's choices, open to change)

Built from the ruling of November 23 ("I would say additional details as
progression happens but never incorrect details"; "Rulings, November 23,
2026 (officer perks)" above), to the ladder recorded in
`docs/design/point-of-view-and-messengers.md`. The code:
`engine/orchestrator/reports.js` (what one report holds, and how reports
join), `word.js` and `fogOfWar.js` (each enemy's `told`), the numbers in
`tables.REPORTS`, the words in `narrator/words.js` (`REPORT`, `windWords`),
and `web/battles.js` (`enemyView`, `namer`, `enemyForOrders`,
`menAsTold`). It changes what is told, never what happens: the planner,
the riders' paths and every engine rule still read the side's full
ledger; the fingerprint tests (`*-unchanged.test.js`) are unchanged, and
the balance harness does not touch any of it.

**The ladder** (`REPORTS.TELLS`), by the officer of the unit that saw them:

| | where | kind | how many | holding up |
|---|---|---|---|---|
| no officer | yes | | | |
| green | yes | yes | | |
| seasoned | yes | yes | roughly | |
| veteran | yes | yes | exactly | |
| legendary | yes | yes | exactly | heart, wind, broken |

**The same sighting at each level** (seed 7, Rome against Parthia, the
Velites first to see the Parthian light horse, 60 men; the enemy list, then
the dispatch's line):
- no officer: "Enemy troops at F7-NE: in sight; what kind and how many not
  known: reported by a unit of yours with no officer". "Velites report
  enemy troops in open ground 25 m south-east of the woods (F7-NE)". The
  map marks them "?".
- green: "Light horse at F7-NE: in sight; how many not known: reported by
  a green officer". "Velites report enemy light horse in open ground ...".
- seasoned: "Light horse at F7-NE: in sight; several dozen men".
  "Velites report enemy light horse, several dozen men, in open ground ...".
- veteran: "Light horse at F7-NE: in sight; 60 men".
- legendary: "Light horse at F7-NE: in sight; 60 men; firm, fresh".

**Choices:**
- **Whose report.** The officer of the unit that saw them, not the best in
  the army. Several of his units seeing the same enemy in the same ten
  minutes each send a report, so he has the best of them.
- **Fixed when made, carried by rider.** A report is made when the unit
  sends its word and reaches him with it (word.js), as reports already
  did. A side with no Commander on the field (a friend who leads none, a
  battle saved before riders) knows at once, as before, but by the same
  ladder (`fogOfWar.js`).
- **How reports join** (`join`): he keeps the fullest true thing he has
  been told, each fact as old as the report it came in. Where they are:
  the newest report. Their kind: once told, kept (it does not change).
  How many, and how they hold up: the newest report that told it; of two
  the same age, the exact over the rough. The enemy list gives a fact's
  age when it is older than the sighting ("about a hundred men (40 min
  ago)"). The other reading: an old exact count kept over a newer rough
  one. I took the newer, as truer of now.
- **His own eyes** count as at least a veteran's report
  (`REPORTS.OWN_EYES`). A guess: the design says nothing. The other
  reading: his own unit's officer, as any unit's. A new Commander rides
  with his veteran, so the two agree there.
- **A battle with no officers at all** (the soak, the terminal game)
  tells what it told before, kind and exact numbers: a veteran's report
  (`REPORTS.NO_OFFICERS`).
- **"Roughly how many"**: seven bands (`REPORTS.ABOUT`), one phrase each
  in `REPORT.about`: a handful (1 to 19), a few dozen (20 to 49), several
  dozen (50 to 79), about a hundred (80 to 129), well over a hundred (130
  to 199), a few hundred (200 to 399), many hundreds (400 and more). Set
  for the factions' units of 40 to 100 men. No gaps, no overlaps: the test
  checks every number from 1 to 5,000 falls in exactly one band.
- **"How they are holding up"**: heart in the morale words (firm,
  wavering, at breaking point); wind in three new words, fresh (over 60%,
  where combat counts a unit at full wind), tiring, spent (a quarter or
  under) (`windWords`); or "broken and fleeing".
- **Kind** is the faction's name for the unit ("light horse", "levy
  spears"), as green and above told it before. The other reading: the
  role alone ("horse", "spearmen"). The name says a little more (a guard
  unit's name says it is the guard).
- **Names.** An enemy whose kind he has not been told is "enemy troops"
  everywhere: the map's label, the enemy list, the dispatch, the read-back
  and its questions. Its own id would say its kind ("blue_slingers"), so
  the browser gets a stand-in made from the battle's seed
  (`enemyHandle`); the captor's list of units to ask for uses it too.
- **The plain account.** Enemy numbers in it ("rallied with 60 men",
  "left the field with 40 men") are told as his reports allow: exact,
  roughly, or not at all (`menAsTold`). Men his own units killed are
  their own count and still told. New: a line for each enemy first
  reported to him, by whom and where, with what the report held
  ("Velites report enemy troops ... (F7-NE)"); several he cannot tell
  apart in one line ("enemy troops (2 units)").
- **The dispatch (AI).** It is given the same lines as the plain account,
  so it holds no more. One sentence added to its instructions: "enemy
  troops" stay exactly that, and it never says what kind they are or how
  many. Not benchmarked live.
- **Orders.** He may order an attack on enemy troops by that name ("attack
  the enemy troops"), by grid square ("... at F7-NE"), or by the ground
  they are on ("attack the enemy in the woods", "the enemy at Miller's
  Crossing"): the nearest he has seen to that place. A kind he has not
  been told cannot be named: "attack the light horse" is asked back.
- **Not graded:** what a Commander in the enemy's hands sees from where he
  is held (its own ruling: where, and about how many), the unit holding
  him (he sees them), the verdict, and "both close to breaking" when two
  units stand off (it is his own unit's state as much as theirs).
- **Replay** shows the enemy as his side's reports told it, turn by turn.

**Measured.** A new Commander's first battle (one veteran with the elite,
no officer elsewhere): his first word of the enemy is almost always from a
unit with no officer, so it says "enemy troops" and where, and nothing
more, until they come within sight of his own guard (a veteran's report). Screenshots at 390 px were taken of the enemy list and the map
for a thin and a full report. The thin report reads plainly and the "?"
on the map says at a glance that more is unknown; it does not look broken.
What it costs: he cannot tell foot from horse until his guard sees them,
and "attack the horse" is asked back.

**For Zach:**
1. A new Commander's units have no officer, so his first reports say only
   "enemy troops" and where. Should every unit, officer or not, at least
   tell foot from horse? (The smallest softening, one line in
   `REPORTS.TELLS`.)
2. Should a unit that has fought them for an hour still not know what
   they are? (As built, a fight tells him nothing more than the sighting
   did, but the men killed on each side.)

### How each map's ground to fight for was built (Claude's choices, open to change)

From the standing work list (`docs/REVIEW-2026-11.md`, section 5, item 3:
"Each map should come with its own ('hold the Old Mill Bridge'), so there
is a reason to cross the field"), inside the rulings on objectives
(October 29: "holding objectives as a way to win or score ... direction,
for testing"), on ground changing hands (all sides know at once), and on
the day (twelve hours; night ends an undecided battle with no winner,
November 24).

**What a player sees.** At the muster, under the field chosen: "The ground
to fight for: the Old Mill Bridge. Hold it alone for 1 h, with no enemy on
it, and the field is yours, as surely as if the enemy's army broke. Let the
enemy hold it as long, and the field is his." In the tent, a line under the
top bar ("The enemy holds the Old Mill Bridge, the ground to fight for:
take it within 40 min, or the field is his."), and on the map the ground
washed in its colour inside the dashed ring it already had. His first
dispatch opens with the muster's two sentences. When it changes hands:
"The enemy took the Old Mill Bridge: take it from him, or the field is his"
/ "You took ...: hold it alone and the field is yours" / "... no longer
holds ...". Half an hour before it decides the battle: "The enemy has held
the Old Mill Bridge long: unless you take it from him within 30 min, the
field is his" / "Hold ... 30 min more and the field is yours". The verdict:
"Victory / Defeat: You held (The enemy held) the Old Mill Bridge alone for
1 h, and the field is yours (his)". All words in `narrator/words.js`,
`GROUND`.

**1. The rule is the one that was there, kept and told.** Holding every
named objective alone (effective units of one side on it, none of the
other's) for an hour of battle wins: `'objectives held'` in
`orchestrator/victory.js` since Stage 3. It was decisive already, so no new
rule; the hour moved to `tables.GROUND.HOLD_MINUTES` (60) with where it
came from. Night still ends an undecided battle with no winner (the ground
is checked before night, as before). Measured, the hour is neither too
short nor too long: between equal armies the side that held the ground
first went on to win 57% of the battles, not all (an enemy has time to
come and take it back), and a player who never comes out loses 95 in 100.

**2. Each map's ground** (`src/data/maps/*.js`, `ground`; the muster gets
it from `groundOf` in `src/data/maps/index.js`, and it is in the battle's
spec when the battle is made, so a saved battle replays with it). One
piece of ground each; none of the maps asked for two (two crossings on
Crownhill, tried, ended 80 battles in 80 in night: each side sat on one).

| Map | The ground | Held from | Why there |
|---|---|---|---|
| Crownhill | the Crownhill (the hill, north) | on it | Miller's Crossing, the ford between the armies, was tried first: the east army is 1.5 moves nearer, reaches it first in 69 of 75 and won 88% |
| Ashford Vale | the Old Mill Bridge: the bridge and the open ground of the mill at its west end | on them | The bridge alone (from either end): the west army's way lies through the woods, the east reached it first 72 of 72 and won 82%. The bridge and its west end: 50/50 |
| Thornwood | Thorn Knoll | on it or beside it | The brook cuts its eastern foot: held from on it alone, the west won 63% |
| Raven Ridge | Raven Gap: the open tiles of the saddle, x 19 to 22 | on them | The ridge (87 tiles, far north) 64% west; the gap with its westmost column 66% west |

A crossing or a spot beside water is held "from on it or beside it" with a
new, optional `reach` on an objective (`objectiveArea`); without one,
everything is as before. Neither army starts within 6 tiles of its ground
(tested).

**3. Is either side favoured?** `src/harness/ground-league.js` plays the
same faction on both sides, both by the computer, every faction on every
map, a day of twelve hours; 20 battles a faction, 400 a map. Wins of the
west army among battles won:

| Map | No ground (as before) | With its ground | Decided by the ground | Night | Minutes on average (before / now) |
|---|---|---|---|---|---|
| Crownhill | 58% | 44% | 199 of 400 | 1 | 157 / 235 |
| Ashford Vale | 52% | 50% | 145 | 35 | 328 / 184 |
| Thornwood | 67% | 51% | 60 | 0 | 158 / 129 |
| Raven Ridge | 45% | 50% | 67 | 18 | 251 / 157 |
| All | | | 471 of 1,600 (29%) | 54 (was 88) | 224 / 176 |

Crownhill at 44/56 is at the edge of "about 55/45"; every other piece of
its ground tried was worse (the western half of the hill 60%, two thirds of
it 26%; the hill held from beside it 18%). The numbers swing hard with
small moves of the ground, because the side that gets there first matters.

As the app plays it (`--mode app`: the west a Commander on the field whose
orders go by rider, the computer's by rider from its best unit, unequal
factions; 100 a map): the ground decided 31% of battles, which now run 146
minutes on average (211 before), and none reached night (16 in 400
before). West wins: Crownhill 38% (300 battles; 55% before), Ashford 48%,
Thornwood 54%, Raven Ridge 55% (300). The Crownhill is far from both
armies, and orders by rider cost the player time there.

The soak (`npm run soak`) has a new section: every faction's army on every
map fighting for the map's ground, red played three ways: 240 of 240
finished, 142 decided by the ground, 5 by night, 142 battle minutes on
average. `npm run balance`'s output is unchanged, every line.

**4. The computer** (`src/opponent/planner.js`; two changes, both only
when the battle has ground to fight for). It already went for an objective
and held it for ever, but (a) its line formed only on dry ground, so it
stood beside a bridge or ford and never held it: now, when the ground's
middle is water, the line forms on the first dry tile back from it on its
own side (`strongpoint`); and (b) it went for an enemy only when he stood
on the spot it meant to hold and none of its own units were near: now any
enemy it can see on the ground, or near enough to contest it
(`onTheGround`), is gone for at once (`taken`). It does not march its whole
army onto the ground: the line forms about it as it did about good ground
before, archers behind, horse on a flank, and goes in when the enemy is
close.

**5. Orders.** "spears take the Old Mill Bridge", "hold the bridge",
"everyone occupy the Crownhill" read as going there and holding it
(`grammar.js`: take, occupy, hold with a place; "seize" and "capture" were
already to attack a place, and still are). "Raven Gap" was found as the
nearest stretch of the road it lies on; a landmark tagged `pass` is now
gone to itself (`places.js`). "knoll" reads as a hill. "the gap" is still
asked back (only exact names are names).

**6. Fog of war.** The tent is told, for each piece of ground, where it
is, who holds it and for how long it has to go (all sides know at once
when it changes hands, ruled); nothing of who stands on it (the fog test
checks the keys).

**Guessed, and the other reading.**
- *Moving the ground off the obvious feature to make it fair* (the bridge
  with the mill's ground on its west bank; the Crownhill rather than
  Miller's Crossing). The other reading is to keep the obvious feature and
  move the armies' forming-up ground (`deploy`) so both reach it at once;
  that changes every battle on the map, so I did not.
- *Half an hour's warning stops the battle for every side*, like ground
  changing hands; the other reading is to tell it only in the next
  dispatch.
- *The next day is fought for the same ground* as the day before (even
  ground a player named himself).
- *A player may still name his own* ground through the API (`objectives`),
  or none (`[]`); the form has no box for it, as ruled before.
- Web tests chosen for other things (a volley, a sighting, an officer's
  deeds) muster with `objectives: []`, as their battles were before.

**Left undone.** The hotseat terminal and the leagues other than the new
one still fight without ground. The AI dispatch has no new instruction:
it is given the same lines.

### How fire and retreat, Kush's sword and the Commander's odds were built (Claude's choices, open to change)

From the rulings of November 24 above: "I don't like the skirmish rule.
Fire and retreat is ok"; "No firing on the move"; "Retun commander taken
odds"; "They don't hit hard from range? They can have a sword". Every
table is in Part 7 of `docs/design/army-balance.md`.

**Fire and retreat** (`engine/battle/skirmish.js`, its step in
`battle/battle.js`, `tables.SKIRMISH`, six lines in `opponent/planner.js`).
- Every missile unit (bow, sling, crossbow), whatever its armour, pressing
  the enemy closes to where it can shoot and stands shooting. When seen
  enemies, formed and not fighting, could reach it this tick, and its march
  beats every one of theirs, it falls back to ground it can reach this tick
  out of their reach, still in shot if it can; it shoots again when it
  stands.
- Taken out of the proposal: kit making a man slower (light foot outrunning
  mail and plate); the armour list for who may skirmish; the wind lost in
  falling back (5 a tick) and the "spent" stop; the chase's wind; foot
  shooting as they fall back (`SKIRMISH.ON_FOOT`, and its line in
  `ranged.volley`). No knob was left at zero. Armour's ordinary wind in a
  fight (`ARMOR` stamina drain) is as main had it.
- **Who falls back, from whom**: measured both readings. (a) only from
  enemies its own march beats: horse from foot; foot from no one. (b) from
  any enemy about to reach it: foot ran before foot as fast as they, never
  standing to shoot, and archers fell from 35 to 26% against the other kinds,
  109 of their 320 battles against the usual armies ended by the day.
  Took (a).
- `SKIRMISH.WARY` 1 -> 0: a unit falls back only from men who could reach it
  this tick. At 1, horse archers shooting at men who held their ground
  walked in and out of the margin for ever and a soak battle never ended.
  Measured the same within 3 points on the classic armies.
- **The computer**: kept the proposal's line (its missile troops on foot
  press a near enemy, within `TUNING.ENGAGE` 7 tiles, so that they shoot),
  now for all foot missile troops, crossbowmen in mail too. Without it
  slingers beat heavy infantry 33% rather than 42%. Pressing with horse
  archers too was measured (37 -> 41% against the kinds) and not taken:
  twice their battles ran to the day's end. Offered to Zach.
- **Horse archers**: as on main before the proposal: they shoot as they
  ride (`MISSILES.ON_THE_MOVE` 0.6), and now fall back before foot.
- The telling is the proposal's (`SKIRMISH_WORDS.gaveGround`, "fell back
  before X, keeping out of their reach"), shown to the enemy only if he
  sees the unit.
- **The study's harness** counts a battle the day ended as no win for
  either side (`army-study/lib.js`: `dayEnded`, winner null), and
  `classics.js` and `usual.js` show how many, before and after.

**Measured** (before: main `d7622ab`): heavy infantry 76 -> 72% against the
usual armies, 69 -> 65% against the other classic armies; slingers 51 ->
57% and 51 -> 57%; archers 35 -> 40% and 35 -> 38%; horse archers 35 -> 33%
and 38 -> 37%; pikes 76 -> 74% and 68 -> 67%. The league: 40-58% before and
after (Sparta now the lowest; Kush 40 -> 47%), pairings past 75/25 26 -> 19,
battles ended by the day 15 -> 70 of 6,080. Soak: every battle ends;
hotseat games 13.4 -> 16.3 player turns. `npm run balance`: unchanged.
Less than the proposal did (heavy 61% against the kinds there): with no
kit speed and no chase, foot cannot keep away from foot. As ruled.

**Guessed.**
- "No firing on the move" was read as the answer to the question asked
  (men on foot shooting as they fall back); horse archers keep shooting as
  they ride, as ruled November 21. The other reading (nobody shoots on the
  move) was measured once (`ON_THE_MOVE` 0): horse archers 37 -> 36% against
  the kinds, 35 -> 34% against the usual armies; it would also take away
  the reason they are raised at 0.6 of their men.
- "Fire and retreat" was read as every missile unit, armour or none: with
  no man slower for his kit, a crossbowman in mail falls back as readily
  as a slinger (that is, from horse never, and from foot never). The other
  reading keeps the proposal's light-armour list; it changes no classic
  army.
- "Running to the map's edge all day" is not a way out: foot never run from
  foot, and the edge pins a horse unit. But battles that end with the day
  rose: horse archers 17 -> 56 of their 320 against the usual armies. They
  stand at the edge of shot and shoot, weakly, rather than run. Counted,
  not changed.

**Kush's sword** (`src/data/factions.js`, `engine/combat/ratings.js`
`handWeapon`, `engine/world.js`, `engine/army/factions.js` and
`standard.js`, `web/armies.js` `kitWords`).
- An elite may carry `sidearm`, a key of `WEAPONS`: a hand weapon its
  culture may field (checked in `buildFaction`). A missile unit with one
  fights hand to hand with it instead of `MISSILES.SIDEARM`. Only the
  Golden Bows have one; the builder sells no second weapon.
- The sword: `sword_standard`, "the sword" on screen. Kush has no sword of
  its own in the builder, and Meroe's iron makes a straight sword likely;
  guessed. The other choice would be to add a Kushite weapon (none is in
  the cultures doc).
- The kit words: one line in `src/web/armies.js` (`kitWords`), which is the
  other agent's ground: "elite, war bow and sword, light armour, no shield,
  on foot". A captured elite's kit (`battles.js`, `capturesOf`) does not
  carry the sword over: not changed.
- "They don't hit hard from range?": no. A volley depends on the bow and
  the men, not their training: 80 Golden Bows fell 4.3 / 2.6 / 1.1 men in
  light / medium / heavy armour at close range, against 6.0 / 3.2 / 1.8 for
  100 levy slingers and 9.3 / 8.3 / 6.8 for 100 Han crossbowmen. Their edge
  is reach (9 tiles).
- Measured: Kush in the league 39 -> 47%; its usual army against the field
  39 -> 43%; its 30 random armies 9 -> 11% on average. A bought Kush army is
  still among the worst: the elite, a third of it, is the weakest of the
  twenty.

**The Commander's odds** (`captive-league.js --battles 2000 --policy
wait`): taken 1 in 19.0 for a player who sends everyone in (main 23.5, the
proposal 16.7); 1 in 31 with the computer on both sides, killed 1 in 358.
They were set at "about 1 battle in 19" on November 23: inside the band,
so `tables.COMMANDER` is not changed. The ruling "Retun commander taken
odds" is met by removing the parts of the proposal that raised them.
Guessed: that "the band" is 1 in 19 to about 1 in 24 (Part 5 called 23.5
"within the ruled band"). The other agent's rulings on the day may move
this again.

**Tests.** `engine/battle/tests/skirmish.test.js` rewritten to the rule (14);
the planner's test rewritten (crossbowmen in mail press too); the narrator
test renamed; `ratings.test.js`, `army/tests/factions.test.js` (2) and
`web/tests/army.test.js` for the sword. `asked-unchanged`,
`messengers-unchanged` (Han's crossbowmen now press: the ashford battles)
and `attack-named-unchanged` retaken, the old values in their headers.

**Left open.** Horse archers and archers are still near a third; heavy
infantry and pikes above 70% against the usual armies. Part 7 lists the
levers that fit the ruling, each measured once or not at all, and the
questions.

### How making a Commander was built (Claude's choices, open to change)

Builds ruling 8 of November 22 ("The ten kinds of commander, and glory or
survival, are to introduce the lore and create the name. The name is unique
and when we do stats and such each name must live on in the record books")
and the row "Making a Commander" in
`docs/design/commanders-lore-and-tutorial.md`. No tutorial (ruled November
23). The code: `src/data/commanders.js` (new: the kinds and what each
brings), `narrator/words.js` (`MAKING`, `COMMANDER_KINDS`, `NATURE_SAID`,
`HOLDS_DEAR`, `COMMANDER_TITLES`), `web/commanders.js` (`making`, `create`,
`commanderNameRefusal`, `titleOf`), `command/company.js` (a company's
`founder`), `web/battles.js` (`recordOf`), the screen "A new Commander"
(`/commander/new`) and his own page (`/commander/<his link>`) in
`public/app.js`.

**The screen.** One screen, phone first, every answer already chosen, so one
tap ("Take command") makes a good Commander and brings him to the muster (or
back to "Who leads?" for a friend who joined by link). A browser with no
Commander free to lead is sent there from the muster; "A new Commander" in
the muster's list goes there too. It asks, in this order:

1. **What kind of commander are you?** The ten kinds of the design, each a
   button: the Engineer, the Mountain, the Ghost, the Mirage, the Hero, the
   Wall, the Wind, the Threshold, the Serpent, the Storm. Under them, the
   one chosen in a line ("The Wall: Nothing breaks your line.") and what it
   does.
2. **What do you fight for?** Glory or Survival, and what it does.
3. **Your faction, for life** (asked here now, not at the muster), with its
   elite.
4. **Your name**, the plain name offered already in the box.

**What each answer does.** Nothing new is built for them: each is mapped
onto what the game has.
- **His kind gives his veteran officer his nature** (the one officer a new
  Commander has, with his elite): bold for the Hero, the Storm, the Wind and
  the Mirage; steady for the Engineer, the Ghost and the Serpent; cautious
  for the Wall, the Mountain and the Threshold. Before, the nature was drawn
  from the battle's seed. Bold, steady and cautious are what an officer does
  when he loses the thread of an order (and while his Commander is held), and
  none is simply better. The screen says it: "Your veteran officer is
  cautious: if he loses the thread of an order, he stops and holds."
- **What he fights for is what his veteran holds dear** (before, drawn): so
  his first officer's loyalty is won and lost as he would want it
  (`tables.LOYALTY.MOVES`). Glory and survival are already balanced against
  each other there.
- **Together they make his title**, the design's "titles follow battles
  fought": after his first battle he is "Aurelian the Patient" (the Wall,
  for survival) on the muster's list, Your officers, "Who leads?" and his
  page. The twenty titles are the old ones (`archive/src/commanderName/
  titles`, the first tier), with two changed: the Wall's for glory is "the
  Unbroken" (the old word is one of the two roles the engine bans) and the
  Storm's for glory is "the Thunder" (it was "the Commander").
- Only the founding veteran is touched: his name, experience and unit are
  drawn exactly as before (tested equal), and officers who come forward
  later draw theirs as they always did. A battle with no Commander made with
  the answers runs as before: the whole-battle fingerprint tests, `npm run
  soak` and the last table of `npm run balance` are unchanged.

**His name.** His own, or the plain one offered (as before, one no Commander
here bears or bore; a plain name a player typed is passed over). Kept with a
capital to each word, as typed otherwise ("hannibal barca" is kept "Hannibal
Barca"). Refused, with the reason, by the guards a unit's name has that fit
a man's name: 3 to 24 letters, one to three words of plain letters (no
numbers, marks or other scripts), each word two letters or more, none of the
words the game uses for something else (`RESERVED` in `roster.js`: "the",
"enemy", "commander", the order words). "Garrick the Bold" is refused: a
title is earned. Unique among Commanders living and fallen on the server,
in any case of letters. **Not guarded:** what a name means. Names are still
not moderated. A Commander's name reaches another player only on a captured
officer's card ("Given to you by Commander ..."), always through `esc()`; it
is never in a battle's spec or handed to the AI (tested with a name typed to
steer it). The unit-name guards that keep the order reader right (kinds of
troops, places, ground) are not applied: a Commander's name is never read in
an order.

**His page, and the record.** "His record" on Your officers opens his own
page: his name and title, his faction, the day he took command, his two
answers in his own voice ("You are the Wall: nothing breaks your line. You
fight for survival."), each battle written into his company (its title, the
day, how it ended, and what became of him in it: taken and freed, ransomed,
let go, killed), the officers he lost, and, fallen, where and when he fell.
All of it from what is kept: the battles are found from his company's
`settled` ids; a battle the server no longer has is left out. A Commander
made before the questions shows no answers and no title, and works as
before; nothing about him changed.

**Guessed at.**
- Which nature each kind brings. The other reading of ruling 8 is that the
  kinds are lore and name only, with no effect; the brief asked for a real
  one, and the veteran's nature was the smallest true one.
- That the veteran shares what his Commander holds dear (the other reading:
  officers drawn to a glory Commander lean to glory, all of them; not built).
- That ten choices are "a few": the design names ten, and they fit one
  phone screen as a grid.
- That the name offered is a plain one, not "a name from his kind" (the
  design's old pools by kind and cause are Roman for the Engineer,
  Carthaginian for the Mountain and so on, which no longer matches a
  faction chosen apart). His kind makes his title instead.
- Only the first title (1 battle): the words for 3, 10 and 30 battles were
  never written ("Add tier2 ... See full specification").

**Left undone.** A server-wide record book of every fallen Commander (it
would put unmoderated names in front of strangers); titles at 3, 10 and 30
battles; the computer's Commanders (another agent's work).

**For Zach.**
1. Should a Commander's kind do more than give his first veteran his nature
   (for instance, what his officers who come forward later are like), or is
   it meant to be lore and name only?
2. Before any record book open to every player: are Commanders' names to be
   moderated, and how?

### How the computer's Commanders were given character (Claude's choices, open to change)

Item 5 of the work list (`docs/REVIEW-2026-11.md`): "Commanders with a
personality ... starting with the enemy's: a cautious one, a rash one."
Built inside the ruling of October 21 ("Every commander has the same
quality ... Commanders differ in personality"): equal quality, different
character. The code: `CHARACTERS` in `src/opponent/planner.js`,
`src/opponent/commander.js`, the muster and the tent in `src/web/battles.js`
and `public/app.js`, the words in `src/narrator/words.js`
(`ENEMY_COMMANDER`), the league in `src/harness/character-league.js`.

**The characters.** Three, named in the words the game already has for an
officer's nature, so there is one vocabulary: "rash" is told as *bold*.
Each is the one planner with five of its numbers set another way, never a
second planner.

| | goes in at an enemy in sight within | pulls a unit out of the fight at morale | his horse ride at | within | his horse in reserve until the line fights |
|---|---|---|---|---|---|
| steady (the planner as it was) | 7 tiles | 30 | enemy missile troops on foot | 10 tiles | no |
| bold | 9 | 20 | any enemy | 14 | no |
| cautious | 5 | 40 | (they do not hunt) | 0 | yes, while a line fit to fight has not met the enemy |

All three go for the map's ground to fight for and hold it in the same way,
and wait on good ground (with no ground named) by the same seeded
temperament: see below for why.

**Seeded, in the spec, told by name.** At the muster of a battle against the
computer, `commander.js` draws from the seed (a stream of its own, so
nothing else drawn from the seed moves) a character, each a third, and a
name from his army's culture's names (`src/data/officers.js`, the officers'
lists), never one of his own officers'. Both go into the spec
(`sides[side].character`, `.commanderName`): a saved battle replays with
him, and the next day passes him on (`again`), so it is the same man. A
spec with no character (every battle before this, every harness that does
not ask, the army study's leagues) is played steady, number for number:
a test plays a whole battle both ways and compares every order.

**What the player is told.** His name and what is said of him: "You face
Lucius, who commands the enemy. He is said to be cautious." in his first
dispatch (after the ground to fight for), and "The enemy's Commander:
Lucius, said to be cautious" on the Army tab, over the enemy as he knows
it. Nothing else of the character reaches the browser (the fog test checks
that the view carries only `name` and `said`). A battle against a friend
has no such line. The muster does not tell it: the man is drawn with the
seed when the battle is made.
- Guessed: that a reputation is something his side could know (the
  point-of-view rulings), and that a character never noticed is wasted.
  The other reading: he is told only the name, and learns the character by
  fighting him (or by a dispatch that remarks on it after a few turns).
  Changing it is one line in `enemyCommanderView` and one in the first
  dispatch.
- The reputation is always true. Another reading: said to be cautious, and
  sometimes not.

**Measured: equal.** `node src/harness/character-league.js --rounds 4`:
each character against each other, the same faction on both sides, all 20
factions, every map with its ground to fight for and the twelve-hour day,
each pairing from both ends of the field; 2,880 battles, all ended. Share
against the field (a win 1, night a half): steady 50%, bold 49%, cautious
51%. Pairings: steady-bold 50/50, steady-cautious 50/50, bold-cautious
48/52. With no ground to fight for (`--none`, 1,440 battles): steady 48%,
bold 49%, cautious 53%; worst pairing 47/53.

**Measured: different** (each against itself, with the ground and the day):

| | battle length | first contact | decided by the ground | an army broken | ended by night |
|---|---|---|---|---|---|
| steady | 187 min | 57 min | 36% | 62% | 3% |
| bold | 148 min | 53 min | 35% | 65% | 0% |
| cautious | 193 min | 56 min | 43% | 53% | 5% |

First contact hardly moves: the ground draws both armies to the same place
at the same pace, whoever leads them. They differ in how they fight once
there: the bold man's horse are in at once and his men fight on, so his
battles are short and end in a broken army; the cautious man's horse wait
and his worn units come out, so his battles run longer and are more often
decided by the ground or by night.

**Against the player.** `messenger-league.js --battles 672 --policy planner
--day 720 --ground --character c` (the player's stand-in, a Commander on the
field, orders by rider, the map's ground, the day): the player won 45%
against steady, 45% against bold, 47% against cautious, 47% against the mix
the app draws (two points apart; the bound was ten).

**The Commander's odds.** `captive-league.js --battles 2000 --policy wait`:
1 in 18.9 against steady (unchanged), 1 in 18.2 against bold, 1 in 20.4
against cautious, 1 in 20.8 against the mix the app draws. Inside 1 in 17
to 1 in 24; `tables.COMMANDER` is not changed.

**Tried and dropped** (each measured against steady with only that changed,
160 battles, or the three together, 960):
- A bold Commander who leaves the ground to meet an enemy he sees coming
  ("sally"): 37% against steady, and 43 to 45% at shorter reach; leaving
  the missile troops on the ground did not help. The ground is worth more
  than going out to meet the enemy.
- A cautious Commander who waits on his own ground and goes for the map's
  only when his patience runs out or he sees the enemy on it: 19% against
  steady. Holding the map's ground for an hour wins the field, so waiting
  away from it loses.
- A reserve of foot kept back until the line fights: 33 to 37%, as the
  November planner found (its comment).
- Waiting on good ground with no ground named, by character (a bold man
  seldom, a cautious man always): with no ground to fight for, waiting is
  the stronger play, and the cautious man won 67% against the others and the
  bold 34%. So all three keep the seeded temperament as it was. The
  characters differ less in battles with no ground named (a player's
  choice, not the default).
- A cautious man pulling out at 45: 54% against the field; 40 brings him
  to 51%.
- Keeping the horse in reserve while the army has no foot fit to fight
  left the battle stuck (an all-horse Mongol army waited for ever): the
  horse wait only while there is a line fit to fight. The soak plays bold
  and cautious Commanders as well now (480 battles, no end of the day).

**The army study** (`src/harness/army-study`) and the other leagues
(`ground-league`, `faction-league`, `bought-league`) name no character, so
they are played steady, the planner their tables were measured with, and
stay comparable. `messenger-league` and `captive-league` take
`--character bold|steady|cautious|mix`; `messenger-league` also `--ground`.

**Left undone.** The player's own Commander's character (the other agent's
making of a Commander asks his kind); a fourth character; anything the
enemy Commander does on the field himself (he is not on the field: the
computer's side has no Commander there, as before); telling, after the
battle, how he fought.

### How officers acting on their Commander's intent were built (Claude's choices, open to change)

Builds the first item of "What comes after" in
`docs/design/point-of-view-and-messengers.md`: "Officers who act on their
Commander's intent when out of contact (veterans and above)". Zach's own
words it is built inside: a veteran "fills gaps the way you would";
"Personality sets the default (an aggressive officer attacks, a cautious
one fortifies), loyalty decides how hard he honors your intent, and
experience decides how well he reads it"; "once a long march starts, the
officer is the one who reacts to what he finds"
(`docs/design/officers-memory-delegation.md`); and, ruled out on
November 23, a level-30 officer as a "second" near whom orders arrive at
once ("The second perk is too powerful"). It stays out. The code:
`engine/command/initiative.js` (who may, and what he chooses),
`engine/battle/battle.js` (`ownJudgement`: what his unit sees, and the
order he gives himself), `tables.INITIATIVE`, the `initiative` event
(`narrator/turnNarrator.js`, `words.js` `ON_HIS_OWN`, the hotseat's
`render.js`), and `battle.ground` (the map's ground, set by the
orchestrator so that the officers know it).

- **Who.** An officer of veteran grade or above (13 battles; `INITIATIVE.FROM`),
  not disaffected, of a side whose Commander is on the field and free.
  Below veteran nothing changes: he carries on, or loses the thread as
  before. The computer's side has no Commander on the field, and no
  initiative. A held Commander's officers run their own units as before
  (`ownCommand`).
- **When he is out of contact.** No rider can get through to his unit
  (the riders' path rule, `command/messengers.js`), and none has for
  `INITIATIVE.WAIT` ten minutes (2: the same slack, `COMMAND.OVERDUE`, his
  Commander gives before he notices that no word has come). An order that
  reaches him, or a rider able to, is word: he obeys, and forgets what he
  chose. So a Commander in touch with his men commands exactly as before.
  **Guess:** "cut off or overdue" read as cut off only. A unit merely far
  off, whose Commander chooses to send nothing, does not act: acting there
  would be playing without commanding. The other reading, that a unit with
  no order for a long while acts too, is the question below.
- **What has plainly changed**, as his own unit sees it, and since he last
  had word (so it is never something his Commander already knew when he
  gave the order): the enemy has taken ground to fight for and he can see
  them on it (`groundLost`); half or more of his own men in his sight have
  broken (`friendsBroke`); the enemy he was sent at is beaten or gone
  (`quarryGone`); he is fought or shot at (`attacked`); his order is done,
  or he had none, and an enemy is in his sight (`done`). In that order, if
  several. Nothing from the engine's whole truth: enemies are those his own
  unit sees, the ground is the map's (which every officer knows), and
  where his Commander is, is where he was when the officer last had word.
- **What he does**, one of four orders that already exist: press the enemy
  (advance), go for the ground (attack toward its nearest tile), stand
  (hold), or fall back toward where his Commander was when he last had word
  (withdraw to that tile, then hold). By his nature: **bold** goes for the
  ground being lost, else at an enemy he can see, else holds; **cautious**
  holds good ground (`INITIATIVE.GOOD_GROUND`: hill or woods), else falls
  back toward his Commander; **steady** finishes what he was sent to do,
  and when it is done or cannot be done, holds. **Survival** tips it: one
  who looks to his men falls back when half his men are down
  (`INITIATIVE.BLED`) or the men about him break. **Glory** tips nothing
  (a guess: a bold man already goes at the enemy). **Loyal** officers read
  the intent as steady ones do, as they do when losing the thread; the
  disaffected act on nothing (they keep "half an ear").
- **The intent.** Orders carry no stated purpose today, so the intent is
  his Commander's last order to him. An order to stand (hold, defend, hide,
  ambush) is kept when he is attacked or sees the enemy; only the ground or
  the men about him being lost moves him off it. **Guess:** the other
  reading is that any change frees him.
- **Once.** He does not choose the same thing twice before he has word
  again, and is not told what he is already doing (a steady man with
  nothing to do who "holds" is not news).
- **No roll.** The choice is worked out from the battle's state, so a saved
  battle replays it (tested); no new random stream, and a battle with no
  veteran cut off runs exactly as before: every whole-battle fingerprint
  test passed unchanged, and `npm run balance`'s last table is unchanged.
- **His Commander hears of it in his report** (`initiative`, private to
  his side): when the next report from that unit reaches him, as with any
  news of it (`word.js`, `arrivalOf`), in words that make it the officer's
  judgement: "Decimus of Hastati, with no word from you, fell back toward
  you when he saw your men about him break". The dispatch tells late news
  with its age, so the web app needed nothing new to show it.

**Measured** (`node src/harness/messenger-league.js --battles 1344 --ground
--day 720`, the player's stand-in planning as the computer does; before is
the same harness on the tree before this, by `--root`; the new
`--veterans` puts every unit of his under a veteran):

| Army | Before: won, men lost | After: won, men lost | Officers who acted |
|---|---|---|---|
| A new Commander's (one veteran, with the elite) | 47.3%, 34% | 47.3%, 34% | none |
| All veterans | 47.3%, 34% | 47.3%, 34% | 35 times in 31 battles (2.3%) |
| All veterans, `--policy charge` | 43.0% | 43.0% | 20 times in 15 battles (1.1%) |

- A new Commander's one veteran rides with him (he leads the elite), so
  he is never cut off: nothing changes for a new player.
- All veterans, planner: what they did: 18 fell back when the men about
  them broke, 3 bold ones went at the enemy then; 5 went at the enemy with
  their orders done; 4 went for the ground being lost, 3 cautious ones fell
  back from it; 2 fell back with their orders done. In those 31 battles:
  6 won before and 6 after (2 battles changed hands, one each way), and
  his men lost 41.4% before, 40.8% after. Under charge: 15 battles, 3 won
  before and after, men lost 45.1% and 46.6%.
- So it moves no win rate, well inside the five points asked; it changes a
  battle here and there, and never decides many. It is rare because a unit
  is seldom cut off: in a quarter of battles one is at some point, for 2%
  of unit-turns, mostly briefly, an enemy passing between it and him.
- Of the 35, his Commander heard 30 within the same ten minutes (the unit
  had been cut off close by, and the way opened as the officer moved or the
  enemy did), 2 after 10 minutes, 2 after 30, and 1 never (the battle
  ended with no more word from that unit).
- Every soak battle ended (`npm run soak`). The Commander's odds of being
  taken (`captive-league.js --battles 2000 --policy wait`): 1 in 18.9,
  unchanged.

**Tests.** `src/engine/command/tests/initiative.test.js` (21): the rule by
grade, loyalty, nature, what he holds dear and an order to stand; and in a
battle: the twenty minutes he waits, going at the enemy, falling back
toward where his Commander was, going for ground the enemy took, falling
back when the men about him break, nothing for an officer a rider can
reach or below veteran or on the computer's side, the Commander hearing of
it only when a rider gets through, the enemy never, replay, and a new order
obeyed.

**Left undone.** Long missions for legendary officers (his own words,
November 23: "Being able to carry out long missions would be a great
feature for legendary 20+") are not this: a legend acts as a veteran does
here. Orders with a stated purpose ("hold the ford so the horse can
cross"), which would give him a truer intent than his last order. The
battle does not stop for the Commander when such a report reaches him; it
is in the dispatch at the next stop. The other first-company veterans of
a Commander who musters more than one are not measured in the app's own
battles, only in the league.

### How second weapons were built (Claude's choices, open to change)

Asked for as a roadmap piece, with the small details mine to decide (the
rulings it is built inside: November 23, "The balance needs to come from
the units themselves and the combination of weapons and armor ... Some
units should be best but can then cost more. It should have a grounding in
history"; November 24, "No firing on the move", and the Golden Bows' sword).
The rule and the measures are Part 8 of `docs/design/army-balance.md`.

**What is sold.** One second weapon beside the main one, by the weapon
data's own `stacking`: a thrown weapon (`stackable_ranged` with a reach
under `MISSILES.MIN_RANGE_M`: light and heavy javelins, throwing spears,
pila, plumbatae, throwing axes) beside a one-handed hand weapon
(`stacking: 'primary'`, not a bow or sling); a sword (`sidearm: true` in
`data.js`: the sword, gladius, xiphos, dao, longsword, akinakes) beside a
missile weapon. It costs its `sp`, or its `secondSp` where it has one;
culture, training and horse rules are any weapon's
(`builder.js`, `buildUnit`). The pick carries `second`; a battle unit
carries `sidearm` (a sword: `ratings.handWeapon`, as for the Golden Bows)
or `thrown` and `throws` (`world.js`). Choices, each mine:
- **Not beside a two-handed weapon.** The task allowed "a hand sidearm ...
  beside ... a two-handed one where history allows" (phalangites carried a
  sword). In this engine a pike unit never fights with anything but its
  pike, so a sword there would cost points and do nothing. Not sold. The
  other reading: sell it, and have men drop the pike for the sword when
  flanked or in rough ground: a new rule.
- **No javelins beside a two-handed weapon either** (the shield arm throws,
  and a two-handed weapon has none), nor beside a bow or sling.
- **Daggers, the pugio and the sickle are not sold as second weapons**:
  every missile unit fights with a knife already (`MISSILES.SIDEARM`),
  and they would buy nothing. Axes and maces as a bowman's sidearm (the
  Scythian sagaris) are not offered: swords only, kept simple.
- **A thrown weapon is never the main weapon**, even with a second: it is
  bought as the second ("javelins and a sword", not "a sword and
  javelins").
- **Elites.** The builder's exemption for an elite's thrown weapon (its
  javelins "in its men's hands") is gone: the Peltast Guard and the Blue
  Men carry the standard sword with the heavy javelin, the Sacred Spring
  Warriors heavy javelins beside the gladius (the doc: "gladii, javelins"),
  the Praetorians pila; Kush's Golden Bows' sword is now their `second`
  (it was `sidearm`). Silla's hwarang (sword and bow), Yayoi's spearmen
  (spear and bow) and Sarmatia's lancers (lance and bow) would need a bow
  beside a hand weapon, which the stacking rules do not give: left as they
  were.

**The throw** (`battle/battle.js`, "The throw at contact";
`ranged.thrownVolley`; `tables.THROWN`). One volley as a unit comes to
blows with an enemy, closing or closed on; one a tick, at the first enemy
it met (by name); both sides throw, then fight. Reckoned as a missile
volley (`MISSILES.RATE`, the weapon's damage and effectiveness against the
target's armour, the target's shield, woods), times `THROWN.CLOSE`, and its
losses shake morale as a volley's do (`SHOCK`). Two throws a battle
(`THROWN.THROWS`, a legionary's two pila). A new event, `thrown`, told in
the dispatch first among a unit's fighting ("threw their pila at ...";
the other side "met pila from ..."). `KIT.weapon.roman_pilum` is now
"pila" (it was "pilum", a word no player saw: the pilum was never sold).
- **"No firing on the move."** My reading, as the task suggested: the
  ruling was about archers shooting as they fall back; a throw at contact
  is part of the charge, so men on foot who marched to contact throw.
  **The other reading**: men must stand a tick to throw; then a unit that
  charges never throws, and javelins defend only.
- **At contact, not at range.** The salvaged ranges of thrown weapons (15
  to 35 m) are a tile or less; a volley at a tile before contact would
  need the throwers to stand a tick in reach of the enemy, which the
  planner does not do. At contact is the simple reading of "thrown as its
  men close or are closed on".

**Numbers, measured** (Part 8 has the tables): `THROWN.CLOSE` 2 put Rome's
re-armed usual army at 70% of the league; 1 at 58%, with pila worth less
than their price; 1.5 at 64%, with two professional units with pila level
with the same SP spent on a third unit (85% and 85% against the usual
armies). A sword at a bowman's belt at 2 SP lost to buying more missile
troops (slingers 51% against 69%); at 1 (`secondSp`), 73% against 69%, and
archers 68% against 51%. Throwing spears 1 -> 2 SP: at 1 they were the
cheapest edge (the best army the random search drew, 93%, carried them;
86% without, 88% with light javelins), with nearly a heavy javelin's bite
and open to any troops; at 2 the search's armies over 70% fell from 59 to
47 of 600, but its best stayed at 92-93% (two professional units in heavy
armour with heavy javelins). The ceiling before second weapons was about
90% on this base (three professional spear units in medium armour), not
Part 7's 88% (the best of that draw). I stopped after four rounds; what is
still out of line is in Part 8.

**Usual armies** re-armed where the history is a second weapon, each kept
inside its budget: Rome's legionaries pila, its velites light javelins, the
hastati in light armour to pay for them (the bronze breastplate of the
poorer citizen, Polybius 6.23); Macedon's peltasts and Thrace's spearmen
light javelins; Carthage's Numidian horse light javelins; Germania's axemen
throwing axes. Not re-armed for want of budget: Samnium (26 SP, spent) and
the Berbers (30, spent): their elites carry the javelins. No faction left
35 to 65%, so none was re-picked.

**Saved things.** `kitOf` carries `second` only when there is one, so an
army, roster or captured unit saved before reads as it was; a battle saved
before has no `thrown` in its spec and plays as before (its spec is what it
replays). A unit captured in battle keeps its second weapon (from the
spec's `sidearm` or `thrown`); an unknown second weapon is left behind.

**Tests retaken**: the whole-battle fingerprints (Rome against Han:
`asked-unchanged`, `messengers-unchanged`, old values in their headers);
`night.test.js`'s "men who ran" battle (Rome no longer ran in the day:
Mongolia against Han now, found by search); `held-commander.test.js`'s
battle in which Macedon's Commander is taken (seed 646 to 708); Rome's
roster prices in `roster.test.js` (the hastati 11 to 9 SP). `npm run
balance` is unchanged (no duel archetype carries a second weapon). The
Commander's odds (`captive-league.js --battles 2000 --policy wait`): taken
in 1 battle in 19.0, as on main (18.9).

### How the enemy catching a rider was built (Claude's choices, open to change)

From the messengers design's "What comes after": "The enemy catching a
rider and reading the order." Zach asked for what is on the roadmap and has
not ruled on the details; everything below is my choice. The code:
`engine/command/messengers.js` (`riders` now gives each rider's path;
`rodeOver`, `catcherOf`, `ridersTaken`), `engine/battle/battle.js` (the roll
as each ten minutes opens, `state.riderRandom`, `state.lostRiders`, the
`riderTaken` event), `engine/orchestrator/word.js` (`arrivalOf`) and
`orchestrator.js` (the stop, `ordersCarriedOut`), `narrator/turnNarrator.js`
and `words.js` (`RIDER_TAKEN`), `opponent/planner.js` (`forewarned`),
`web/battles.js` (`onTheRoad`) and `public/app.js` (the stop's words). The
numbers are `tables.RIDER_TAKEN`.

**The rule.** A rider sets out by the path he always took (the cheapest
way, a tile clear of every enemy he could see). The enemy moves while he
rides. As each ten minutes opens, the stretch of that path he rode in the
last ten minutes is looked over (not the tile he set out from, nor the unit
he rides to: there he is among his own). An enemy unit on the field and not
running, within its reach of any tile of it, may catch him on one roll:
- foot: within 1 tile (the eight-way count), 1 in 10;
- horse: within 2 tiles, 1 in 4.
Of several, the likeliest tries (horse first, then the nearest). A hidden
enemy can catch him too: he did not know to ride round it. One roll per
rider per ten minutes, on a stream of its own seeded from the battle's seed
(`riderRandom`), drawn on only when an enemy is near: a battle where none
comes near falls out exactly as before (tested). A battle with no
Commander on the field and no orders from a command post has no riders, and
is unchanged.

**What follows.**
- His order never arrives. The side that sent him is told nothing, ever,
  in keeping with "Yes but no word returns" (November 23) and "Notice when
  no word comes back": his Army tab still shows the rider on the road until
  he should have arrived (`state.lostRiders`, read by `onTheRoad`); after
  that the unit simply goes on as it was, and he notices it did not do what
  he asked. His side's stops are judged as if the rider were still riding,
  so the battle stopping tells him nothing either. Guessed: the other
  reading of the rider rulings is that a rider who does not come back is
  itself news after a while ("your rider to the hastati has not come
  back"); I took no word at all, as with any unit he hears nothing from.
- The side that caught him reads the order (`riderTaken`, its own side
  only). Its Commander hears of it with the next report of the unit that
  took him, at the rider's pace like any news; it stops the battle for him
  when it reaches him ("your men caught an enemy rider"). What he is told
  is the order in the game's own words, for which unit, and where:
  "Savaran took one of the enemy's riders in open ground 125 m south-east
  of North Ford (G3-NW), carrying an order for enemy spears: march to The
  Crownhill (E1-SE) and hold it" (a real battle: seed 25, Parthia against
  Kush). Never the other player's typed words, and no AI. He learns the
  unit's name and the order, nothing of where that unit is: the enemy's
  ledger is not touched.
- A Commander held by the enemy hears what his captors hear (ruled), so he
  may hear that they caught one of his own riders. Left so.

**The computer.** Its orders do travel by rider (from its best unit, as
built in step 3, marked `byCommandPost`), so the player catches them the
same way. When it catches one, the planner takes the place the order names
as where the enemy is going, for an hour (`TUNING.FOREWARNED`, 60): it is
added to the places it last saw the enemy, which it uses only when no enemy
is in sight and it is not holding good ground. An order with no place in
it (hold, advance on the enemy, attack a named unit) gives it nothing.
Guessed: the simplest fair use; it never learns more than the order said,
and only once word would have reached a Commander of its side (it has none,
so at once, as all its knowledge is). I did not measure this apart: it
changes few battles (below).

**Reports going back.** Not caught: orders only. News by rider is not a
rider with a path in the engine but a time each report arrives
(`word.road`), so catching it would mean a second build of the roll on
another shape, not nearly free. Recorded for later.

**On the map.** No mark where the rider was taken: the map drawing is
being reworked by another agent in parallel, and the dispatch line gives
the square. Screenshots of the dispatch at 390 px and desktop are in the
hand-back.

**Measured** (`node src/harness/messenger-league.js --battles 400`, which
now counts riders caught; `--no-catch` sets the chances to nothing on the
same seeds). Red is the player with his Commander on the field, blue the
computer, both sending orders by rider. Before is integration-16 (`--root`).

| | before | after |
|---|---|---|
| Planner: red won | 57% (229) | 57% (228) |
| Everyone in: red won | 46% (183) | 46% (182) |
| Planner on word, the map's ground, night, mixed characters: red won | 50% (198) | 50% (199) |

- How often (planner): a rider caught in 22% of battles (88 of 400); the
  player caught one of the computer's in 11% (45). Of all riders, 1 in 20 of red's (100 of 2068) and 1 in
  40 of blue's (61 of 2392); 93 of the 161 by horse. Sending everyone in:
  17% of battles, red caught one in 9%. Planner on word with the ground:
  20%, red caught one in 6%. In 30 real battles through the app (a rough
  player: everyone advance every third turn), the player's men caught one
  in 2.
- First tried: foot 1 tile at 1 in 4, horse 2 tiles at 1 in 2: a rider
  caught in 32% of battles, 1 in 10 of red's riders. Halved to the values
  above, for an event met now and then.
- The Commander's odds (`captive-league.js --battles 2000 --policy wait`):
  taken 1 in 19.0, as before (19.0). `npm run balance`: unchanged, every
  table.

**Guessed at**, besides the above: the reaches and chances (no source but
the rate aimed for: a formed unit of horse covers 5 tiles in ten minutes,
foot 2 to 3, a lone rider 10); that a rider can be caught near the unit he
rides to when the enemy is fighting it (he rides into that fight, as the
path rule lets him); that a unit in a fight can still catch him; that the
stretch looked over is the whole ten minutes' ride, with the enemy where
it stands at the end of it, not tick by tick.

### How the big map was built (Claude's choices, open to change)

From the ruling of October 14 ("keep 25m tiles and make the map much
bigger ... map size is a per-scenario setting"), the grid ruling of
October 21 ("a 2 km map is 20×20 squares"), and the standing work list
(`docs/REVIEW-2026-11.md`, section 5, item 6: "The 2 km map and scenarios
bigger than four units a side, once battles are slower"). Zach asked for
it to be built and has not ruled on the details.

**What a player meets.** At the muster the field list has "Greywater
(2 km)" after the four 1 km fields. Under it: its ground to fight for
(Elderby), and "A big field: each army comes in two lines. Behind your own
marches your faction's usual army again, raised for the day; its units are
called "second" ("second spears"), all of them answer to "second line",
and they go home when the battle is over." (`words.js`, `FIELD`). In the
tent the map opens on his army at the size a 1 km field always had on a
phone (15 px a tile), so the 2 km field is three screens wide; he drags or
pinches it, or uses + and −, and ⤢ shows the whole field in the window
and, pressed again, takes him back. On a desktop the wheel zooms about the
pointer and a mouse drag pans.

**1. Any map size.** The engine already took the map's own size
everywhere (`map.width`, `map.height`; the grid, deployment, sight, the
rider's road, the planner, the place finder, the hotseat renderer, the
server's views and the browser's map). Nothing in them assumed 40 by 40;
the one place that did was a test ("each 1 km square"), now "four maps of
1 km and Greywater of 2 km". A map may now say how many lines its armies
come in (`lines`, `createMap`); none says 1, and nothing changes.

**2. Greywater** (`src/data/maps/greywater.js`), 80 by 80 tiles, 20 by 20
squares (A to T, 1 to 20). The river Grey, two tiles wide, runs north to
south down the middle; the Old Road crosses it at Elderby, a village
about its bridge; Shepherd's Ford (north) and Ladyford (south) are the
long ways round. Greyhowe and Tor Down (hills), the Long Down and Windle
Ridge (ridges), Hanger Wood and Brackenwood (the drove lanes run through
them), copses, Mere Marsh and the Sallows. Places to name in orders:
Elderby, the Old Road, the two fords, the four heights, the two woods, the
two marshes, and the ground by kind ("the woods to the east", "the
ridge").
- *Fair by construction.* The south half is the north half turned about
  the middle, tile for tile (tested), and the two forming-up spots are
  each other's twins. Measured with both sides played by the computer
  (`ground-league.js --mode mirror --map greywater --rounds 4`, 80
  battles): west 40, east 34. The first drawing, nearly but not exactly
  twinned, gave 28 to 46 and 45 to 30 on two runs, so it was made exact.
- *Elderby is the ground to fight for*: the open ground of the village and
  the bridge, on both banks (52 tiles). The bridge carries the name
  "Elderby" ("Elderby bridge" is an alias), because a place is found by
  the name of the ground it stands on and an open field has none.
- *Where the armies form up*: on the Old Road, 21 tiles (525 m) short of
  Elderby, 1.35 km apart. The first spots were 11 rows apart across the
  road; two armies told only to press the enemy then marched past each
  other out of sight (sight is 150 m), so they were moved onto the road's
  line. With every faction pressing on (60 battles, `runBattle`, no day)
  every battle ended, 3.3 hours on average, the longest 25.

**3. Battles big enough for it.** Today a side fields 4 to 6 units: three
to five bought within its faction's budget and the free elite (4.5 on
average for the twenty usual armies; a player's roster is held to the same
budget). Measured on Greywater, the app's way (`--mode app`: a Commander
on the field, orders by rider, the computer's by rider, a day of twelve
hours, the ground; 80 battles a row; on the first drawing of the field, before it
was made exactly twinned and the forming-up spots moved):

| Armies | Units a side | Hours | Asked of the player | Ground decided | Night |
|---|---|---|---|---|---|
| as on 1 km | 4.5 | 2.5 | 11.4 | 7 | 0 |
| two lines | 8.1 | 3.5 | 16.7 | 10 | 0 |
| three lines | 11.7 | 3.8 | 18.1 | 10 of 40 | 0 |

The usual army alone on a 2 km field is thin (a line of four in a field
twenty squares across, the battle over in two and a half hours), so the
big field has two lines. **The second line** (`src/engine/army/secondLine.js`)
is each side's faction's usual army again, without a second elite:
"second legionaries", all answering to "second line", formed up with the
first (foot abreast, missile foot behind, horse on the wings). Against the
computer both sides have it; against a friend each side has its own;
Rome brings 7 units, the Celts 11. It is not the Commander's to keep: it is
not on his roster, his company takes no note of it (its officers are drawn
for the day, as the computer's are), and the computer's veterancy, matched
to his, is matched to his own men only. Saved in the battle's spec, so a
saved battle replays with it; the next day it comes back as it stood at
nightfall, like the rest.
- *Guessed*: Zach's "bigger budget on the big map". I read it as the
  field calling out more men, not as the player owning more: his roster is
  held to one budget at every field ("you cannot field an army over the
  supply threshold"), and a second budget he could not spend would leave
  him with half the computer's army. The other reading is a budget doubled
  on the big field for what he buys and marches; that changes the roster,
  the army screen and the buying rules (another agent's ground) and
  leaves him outnumbered until he has bought twice. Say if it should be so.
- *Orders to many units on a phone*: "second line hold" reads as an order
  to the whole second line (it is offered on the first turn's card among
  the examples); "everyone", a kind ("archers", "horse") and a name work
  as before. "legionaries" is the first line's legionaries only; the
  second are "second legionaries". Not built: "first line".

**4. The map on a phone and a desktop** (`public/app.js`, `map.js`,
`app.css`). Pinch, the + and − buttons and a finger's drag were there; new
are ⤢ (the whole field in the window, and back to your army at the zoom
you had: one thumb), the wheel (zooms about the pointer, on a desktop), a
mouse drag on open ground (pans, and gives no order; a drag from one of
your units is still an order), and the least zoom is now the whole field
in the window. A 1 km field opens exactly as before on a phone (tested:
15 px a tile). On a desktop the tent now fills the window and the map
scrolls inside its own box; before, the page itself scrolled 155 px past
the window on a 1 km field, and a 2 km field could not be panned up and
down. Counters at the opening zoom are 17 px across; a tap picks the
nearest of your units within 26 px of the finger (a 52 px target), as
before; the buttons are 44 px. Screenshots, phone and desktop, both sizes
of field: `/tmp/claude-0/-home-user-cohort-discord-bot/139f145f-6ee5-5bbb-83bf-96e084a41cbf/scratchpad/big-map/`
(made by `SHOT=.../map.png npm run test:browser`).

**5. Measured.** `messenger-league.js --battles 380 --policy planner
--day 720 --ground --character mix` (the player's stand-in plans as the
computer does, his Commander on the field, orders by rider), the four 1 km
fields against Greywater (`--maps greywater`):

| | 1 km fields | Greywater |
|---|---|---|
| Battle length | 154 min (2.6 h) | 197 min (3.3 h) |
| Turns the player is asked for | 12.0 | 15.1 |
| Ended by night, no winner | 1 of 380 | 5 of 380 |
| The stand-in's wins against the computer | 49% | 51% |
| Orders by rider | 14% | 14% |
| A rider's ride, median / longest | 10 / 60 min | 10 / 70 min |
| Rides of 50 to 70 minutes | 6 of 2,160 | 539 of 5,156 (10%) |
| Battles with a unit cut off at some point | 31% | 59% |

So the far wing is often an hour away by rider, as the design means, and
the battle is still played out in about fifteen asks, with nights rare.
The ground decided 11% of battles on Greywater (`ground-league.js --mode
app`, 80 battles; 18% in a run before the forming-up spots moved), against
31% on the 1 km fields: both armies reach Elderby, each holds its own bank
of it, and neither holds it alone until one breaks. The ground still pulls
both armies to the middle, which is its use.

*The Commander's odds* (`captive-league.js --battles 2000 --policy wait`):
on Greywater he is taken in 1 battle in 12.9; with one line a side on the
same field, 1 in 19.0, as on the 1 km fields. It is the bigger enemy army,
not the field. Not changed: see the question below.

*The server*: a turn played on Greywater (muster, an order, the computer's
plan, the view) takes 19 ms on average and 105 ms at most; a view 3 ms
(Crownhill: 19 ms, 64 ms, 2 ms). Sight and path finding on 6,400 tiles
needed nothing.

**6. The harnesses and the soak.** `mapChoices({ big: false })` gives the
1 km fields; every league and study keeps to them by default (their tables
read as they did), and `--map`/`--maps greywater` measures the big one
(`ground-league`, `messenger-league`, `captive-league`, which also add the
second line). The soak has a short section of its own: half the factions on
Greywater, two lines a side, a day, the ground, red played three ways (30
battles), and the hotseat's two scenarios with every opening (12): every
one ends. The rest of the soak is line for line as before; it runs 2 min 20
to 2 min 30 s (was 2 min 18 s). `npm run balance` is unchanged, every line.

**Left undone.** A map bigger than 2 km (the October proposal's 5 km).
The hotseat terminal's scenarios have no second line (their armies are
drawn, not factions'). "first line" as a name. The AI dispatch is told
nothing new.

**For Zach:**
1. On the big field each army comes in two lines: your own, and your
   faction's usual army again, raised for the day and gone after. Or should
   the big field instead let you buy and march twice the supply, as your
   own men?
2. On the big field your Commander is taken 1 battle in 13 (1 in 19 on the
   1 km fields), because the enemy's army is twice the size. Keep it (a
   bigger battle is a more dangerous one), or bring it back to 1 in 19?

### How each people's perks were built (Claude's choices, open to change)

Asked for as a roadmap piece, with the details mine to decide: the
"Cultural Perks", "Cultural Restrictions" and "Adaptation Perk" of the
owner's factions document (`docs/Context/final_20_cultures_complete.txt`),
as far as the game can carry them. Built inside the rulings of November 23
("The balance needs to come from the units themselves ... It should have a
grounding in history"). Every perk and restriction of the twenty, sorted
into true already, built, and left out with the reason, is Part 9 of
`docs/design/army-balance.md`; with the rounds and the measures.

**What was built.**
- **Perks are data and a small rule each.** A faction names its perks
  (`src/data/factions.js`, `perks`); `tables.PERKS` holds each perk's
  numbers and whom in the army it is for (`who`: all, the elite, levy and
  militia, missile troops, horse, horse archers, bought units). At the
  muster each of the faction's own units gets the keys of its perks
  (`engine/army/perks.js`); in battle `engine/combat/perks.js` reads them.
  A unit with none gets 0 or 1 from every rule, so the balance duels and
  every scenario without faction armies run as before (`npm run balance`
  is unchanged, line for line).
- **Every faction has a perk that acts in battle or at the muster**: Rome
  steadier (morale resistance +0.02); Macedon's Silver Shields seasoned
  (veterancy 10); Sparta breaks at morale 15, not 25, and its levy and
  militia are seasoned; Carthage 32 supply points (true before); Kush tires
  more slowly (wind x0.75), and its shooters shoot x1.25 with its horse
  beside them; the Berbers +0.5 attack against a bigger unit, and slowed in
  woods and marsh (x1.5); Sarmatia's horse take the parting blow at half
  weight; Han's bought units a fifth larger; Maurya's blows leave 0.9 of the
  enemy's armour; Silla +0.5 attack and defence on a hill; Persia saves one
  man in twenty a blow would fell; Parthia's horse +0.5 attack on open
  ground and half a charge's spike through braced spears (not 0.15), and
  its horse archers lose nothing shooting on the move; Germania and the
  Celts cross woods as open ground; Thrace +1 defence on a hill; Samnium
  +0.5 attack on hills and in woods, and breaks at 22 (the elite 20);
  Tibet's militia seasoned and its veteran mercenaries 7 supply points, not
  9; Mongolia's horse archers shoot riding at full; the Celts' surprise
  shakes x1.5; Bactria's horse +0.5 attack on an enemy fighting another;
  Yayoi's archers x1.25 with its spearmen beside them, and +0.5 defence to
  men who held their ground.
- **Restrictions are checked when an army is bought** (`engine/army/
  restrictions.js`, from `web/armies.js`, `checkArmy`), not when one is
  mustered (`battles.js`, `musterArmies`, passes `restrictions: false`):
  an army bought before keeps its units. On the army screen a choice that
  breaks a rule a unit or a count can break (no foot, at most one unit of
  horse) is struck through with the reason; a rule on the army as a whole
  (half of it heavy foot) is said of the army. Built: Rome half heavy foot;
  Macedon no levy or militia; Sparta and Thrace no veteran mercenaries;
  Carthage at most two units of professionals or veteran mercenaries; Kush
  and Yayoi no heavy armour; Sarmatia and Mongolia no foot; Maurya foot,
  shooters and horse; Parthia 10 supply points of levy and half on horses;
  Thrace nothing above light armour and shields; the Celts no trained
  shooters; Bactria heavy foot at most 30%; Yayoi one unit of horse. Every
  usual army keeps to its own (a test), so none was re-picked.
- **Shown** where he chooses his faction, at the muster, and on the army
  screen, a line each (`words.js`, `PERK_WORDS`: "**Woodsmen:** your men
  cross woods as easily as open ground."). Not in the dispatch.
- **No adaptation perk** (Part 9 says what each would need).

**Measured** (Part 9 has the rounds). The usual armies' league
(`usual.js league --seeds 4`, 6,080 battles): Sparta 39% to Rome and
Germania 64% before; Han, Maurya, Sarmatia and Yayoi 44% to Rome 64% after.
Pairings past 75/25: 30 of 190 before, 31 after. The Commander in the
league taken 1 in 31 before, 1 in 32 after. The random search
(`search.js --per 30`, now kept to the restrictions): its best army 92%
(93% before), 45 of 600 over 70% (47 before). The Commander against a
player who sends everyone in (`captive-league.js --battles 2000 --policy
wait`): taken in 1 battle in 21.7 (1 in 19.0 before); not retuned.

**Guessed, and the other reading.**
- **"Fight to the last man, until 50% casualties"** (Sparta), "break at
  30%, 40%" (Samnium): read as men who break later (a lower morale line),
  not as men who cannot break until they have lost so many. The literal
  reading won Sparta 97% of its battles (round 1): morale decides most
  fights here, and a unit that cannot break wins them.
- **"Cannot hire militia"** (Macedon): no levy either, the doc's reason
  being "professional training standards". The other reading bans militia
  alone.
- **"Maximum 2 SP (200 men) of professional soldiers"** (Carthage): two
  units of professionals or veteran mercenaries (a unit was 100 men and 1
  SP in the old blocks). The other reading is 2 supply points, which buys
  none at all.
- **"Heavy infantry"** (Rome, Bactria): foot with a hand weapon in medium
  or heavy armour, the elite counted as one unit of the army. The other
  reading counts only heavy armour, and Rome's legionaries (mail) would not
  count.
- **"Cannot field large heavy infantry formations"** (Kush): no heavy
  armour. The other reading caps the number of heavy units.
- **"Metallurgy deficit: without heavy shields, weapons or armour
  upgrades"** (Thrace): light armour and light shields at most, as the
  usual army was kept already. The other reading allows medium.
- **"Minimum 3 unit types"** (Maurya): foot, shooters and horse. The other
  reading counts any three kinds of kit.
- **Wootz steel** is every Mauryan unit's, free; the doc calls it "an
  expensive upgrade available to any unit". The other reading sells it.
- **Nearest honest things** where the doc's perk needs what the game has
  not got: Kush's desert heat-resistance as wind; Sarmatia's feigned
  retreat as a lighter parting blow; Persia's medical staff as men saved;
  Yayoi's rapid fortification as digging in where they stand; Parthia's
  "break defensive lines" as a charge that braced spears blunt less.
- **The strong get their gentler perk** (as asked): Germania woods, not the
  comitatus that never breaks; Thrace the hill, not veterans from the
  start; Mongolia the Parthian shot, not larger units; Rome's discipline
  set at 0.02 (0.19 put Rome at 73%, 0.05 at 65%).
- **Restrictions on an army already bought**: left alone, by the brief.
  Such an army is checked the next time he changes it; and the units that
  march are not checked (a Parthian may leave his levies at home).
- **Rome's restriction in the tests**: the army test's Roman army had too
  little heavy foot; its second slingers are now levy hastati in mail, and
  its legionaries militia, to stay in budget (`web/tests/army.test.js`).
  The bought-league's kinds a people may not buy (all-levy Rome, foot for
  Sarmatia) are left out of it and of the soak (`bought-league.js`).

**Outside the perks, one line** (`opponent/planner.js`): the computer's
foot missile troops press an enemy within 7 tiles at the least, as part 7
of the balance study built it, not within a cautious Commander's
`engage` of 5. With 5 a cautious Commander's crossbowmen (reach 6) marched
to and fro short of the enemy for ever, and a battle in the soak never
ended. Cautious wins 49% in the character league (48% before).

**Tests retaken**: the whole-battle fingerprints of Rome against Han
(`asked-unchanged`, `messengers-unchanged`, old values in their headers):
Rome steadier, Han larger. On ashford with no Commander the two battles now
run to the 150-turn guard, marching up and down either side of the ford;
not the perks' doing (it happens without them, Mongolia against Tibet on
ashford, seed 77), and the day ends such a battle in the app.
`held-commander.test.js`'s battle in which Macedon's Commander is taken
(Macedon's to Persia's, seed 708: Macedon's Commander, his Silver Shields
seasoned, is now taken only with his army all but gone, and none of some
thousands of seeds searched left the battle on a turn later).
