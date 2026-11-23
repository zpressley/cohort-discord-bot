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
