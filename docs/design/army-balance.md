# Army balance: what a supply point buys, and how to make every army worth buying

A study for Zach, November 23, 2026. Analysis and two recommendations; the
decisions are yours. Every number here was measured with the engine, the
computer's planner on both sides unless it says otherwise, every battle with
its own seed. The scripts are in `src/harness/army-study/`.

## What I found, in short

1. **Seven levy slingers did not win because slingers were cheap. They won
   because missile troops in this engine were also good hand-to-hand
   fighters.** A unit with a sling fought a melee with the sling's numbers:
   as hard as a Roman with a gladius (damage 8 against the gladius's 8), and,
   because the sling is listed as 90% effective against horse, it even
   **braced against a cavalry charge like a spear wall**. The same held for
   every bow and crossbow (a crossbowman fought harder than a swordsman).
   So a missile unit shot the enemy for an hour and then won the melee too.
2. **Missile fire broke units before they arrived.** Men felled by a volley
   shook morale exactly as hard as men felled in a melee, and a sling
   reached 300 m (twelve tiles), more than any bow at any price, for 1
   point. A formed professional unit crossing that ground under three units
   of slingers was broken before contact. The best army of 600 drawn at
   random was **three professional slingers in medium armour: won 100% of
   its battles against the usual armies, and 93% against the other
   strongest armies**. Nine of the ten best had missile troops in them.
3. **Cheap troops were helpless because of one number: levy morale 0.**
   Melee here is fought in shares of a unit, not in men (a 60-man unit and
   a 150-man unit of the same kit fight the same; measured), so cheapness
   buys units, not weight. Levy had no morale at all and broke at a look:
   seven levy spears won 3%. Giving them militia's attack and defence
   changed little (20%); giving them militia's morale took them to 46%.
   Professionals (morale 3) were the opposite: three professional spears
   won 79%. Morale is the price ladder's real currency, and it was priced
   badly at both ends.
4. **All horse lost because of quality, not the horse.** Three militia
   riders won 4%; the same three as professionals won 79%. Making horses
   cheaper alone did nothing (9%).
5. **It is the rules and prices, not the computer.** Seven slingers won 92%
   against the planner, 89% against a player who charges every turn, 88%
   against a planner told to close at once, 85% against one whose horse ride
   for the slingers. An army that beat the planner beat every opponent I
   could write.
6. **Other dead ends nobody tried:** daggers, sickles and every thrown
   weapon (javelins, throwing spears, darts) were sold as a unit's only
   weapon and are worthless that way (nine of the ten worst armies drawn
   used them: 0 to 6%). Light armour and light shields are free, and an army
   bought without them throws them away.

## What I recommend

**Recommendation A (built, as a proposal): fix the six things above with
the smallest set of changes.** Missile troops fight hand to hand with a
knife; a volley shakes a unit at two thirds of what the same losses do in a
melee; levy and militia are one step steadier; the sling costs what a bow
costs and reaches as far; the crossbow costs one more; a horse costs one
less; archers and slingers are light troops; sidearms and thrown weapons
are not sold alone. Result: **the strongest of the five classic kinds of
army wins 69% (was 97%); seven slingers can no longer be bought and five
win 38%; all-levy spears in their free kit win a third (was 8%); three
militia riders win 29 to 40% (was 4 to 10%), though all-horse is still weak
outside Sarmatia.** But be clear about what it does not do: **the random search's top
moves from armoured missile troops to armoured professional foot** (three
professionals in heavy armour with a basic spear or a club win 93 to 99%
against the usual armies), and as many random armies pass 70% as before
(74 of 600, was 56). Part of that is the yardstick: the usual armies leaned
on their missile troops, and A weakens them (two usual pairings go past
70/30; they want re-picking). The rest is that **professionals are cheap
for what they are**, which A leaves alone because raising them puts
Macedon's usual army over budget; B is the better cure.

**Recommendation B (a design): raise an army the way these peoples did.**
Each faction gets a muster roll of the troops it could actually raise
(Rome: legionaries, the line; velites; allied horse; Balearic slingers by
contract), a core that must be at least half the army, a price that rises
on each repeat of a kind, and the roster ruling: you keep more than you can
field, and field up to the supply threshold. One or two pages below; it
fixes what A cannot (an all-missile Rome is impossible because Rome could
not raise one, not because slingers are dear).

**Part 4 (built, as a separate proposal): veterans fight a little better
and die less.** At green, seasoned, veteran and legendary a unit gains a
quarter, a half, three quarters and one point of attack and defence, and
loses 5, 10, 15 and 20 in a hundred fewer of the men a blow would fell.
Legendary veterans win 60% against the same army without (was 88% under
the old "harder to break" rule) and lose 35% of their men a battle instead
of 39%.

The questions that are yours to answer are at the end.

---

## Part 1. What is going on

### How the measurements were made

- `src/harness/army-study/lib.js` fights one battle between two armies, as
  the app musters it: the meeting battle on one of the four maps, the day
  over after 40 player turns, a bought army with its Commander riding with
  its elite unit; the computer's usual army has no Commander (as in the app
  and in `bought-league.js`). It has four opponents: the **planner** as it
  is; the planner told to **close** at once; a player who orders "everyone
  **charge**" every turn; and one who also sends his horse at the enemy's
  missile troops ("**rush**").
- "Against the usual armies" means: the army plays each faction's usual
  army, on all four maps, both ways round, so many seeds each. 64 battles
  is about plus or minus 6 points; read differences under 10 points as
  noise.
- `experiments.js` changes one thing at a time, in memory, to find out why
  an outlier is one. `value.js` prices every option. `search.js` draws 600
  legal armies at random. `tune.js` tries rule changes. `veterans.js`
  measures veterancy.

### Why seven levy slingers won

Each row: against the four usual armies, 96 battles (planner) and 96
(charge). Before any change.

| Army | Units | SP | v planner | v charge |
|---|---|---|---|---|
| 7 levy slingers (as bought) | 7 | 28 | 92% | 89% |
| 5 levy slingers | 5 | 20 | 72% | 65% |
| 4 levy slingers | 4 | 16 | 42% | 46% |
| 3 levy slingers | 3 | 12 | 26% | 22% |
| 7 levy slingers, 57 men each (as many men as 4 units) | 7 | 28 | 68% | 68% |
| 7 levy slingers, the enemy planner closing at once | 7 | 28 | 88% (close) | 85% (rush) |
| 3 professional war slingers (9 SP each) | 3 | 27 | 88% | 91% |
| 7 levy archers (bow, 125 m) | 7 | 28 | 33% | 28% |
| 7 levy slingers, sling reach 150 m | 7 | 28 | 82% | 83% |
| 7 levy slingers, volleys at half rate | 7 | 28 | 71% | 80% |
| 7 levy slingers, no shooting into a melee | 7 | 28 | 76% | 54% |
| 7 levy slingers, sling 50% (not 90%) against horse | 7 | 28 | 82% | 83% |
| Rome's usual army without its slingers | 2 | 22 | 14% | 13% |

What this separates:
- **Not the levy price.** Three professional war slingers (27 SP, 300 men)
  did as well as seven levy (700 men). Cheapness was not the cause.
- **Partly the number of units and men.** Five units, 72%; four, 42%; with
  the men cut to 57 a unit, 68%. More units focus more fire.
- **Not the planner.** Every opponent lost about as often.
- **Not the sling's reach alone** (150 m: still 82%), **nor the rate**
  (half rate: still 71%), **nor shooting into a melee** (76%).
- What the experiments pointed at, and the engine confirmed (`ratings.js`:
  the attack rating is quality plus *the weapon's damage*, whatever the
  weapon): **a missile unit fought a melee with its missile weapon's
  numbers.** A sling is damage 8, a gladius 8; a crossbow 11, a sword 7.
  And the sling's 90% against horse is above the line (85) at which a
  weapon braces against a charge: **slingers stopped cavalry as spears do.**
- And **missile troops carried the usual armies too**: Rome's usual army
  without its slingers wins 14%.

The random search found the end of this road: missile troops in armour.

| Army (Rome) | v usual armies |
|---|---|
| 3 professional slingers, medium armour | 100% |
| 3 professional slingers, light armour | 86% |
| 3 professional war bows, medium armour | 88% |
| 3 professional war bows, light armour | 69% |
| 3 professional crossbows, medium armour (Han) | 95% |

An all-missile army also needs a line, and **its line is the free elite**:
Rome's praetorians and Han's Yulin guard hold while the shooters shoot;
Macedon's and Sarmatia's elites are horse, and their all-missile armies do
worse (Macedon's slingers 73% where Rome's 92%).

### Why seven levy spears lost

| Army | v planner | v charge |
|---|---|---|
| 7 levy spears, no armour, no shield (as bought) | 3% | 8% |
| 7 levy spears, light armour and shield (free) | 8% | 14% |
| the same, levy morale 1 (as militia) | **46%** | 36% |
| the same, levy attack and defence 2 (as militia) | 20% | 14% |
| 5 militia spears, light kit (6 SP each) | 30% | 31% |
| 3 professional spears (10 SP each) | **79%** | 90% |
| 4 levy spears | 0% | 2% |
| 5 levy spears and 2 levy slingers | 33% | 44% |

And the men in a unit, for melee troops (4 militia swordsmen):

| Men a unit | v planner | v charge |
|---|---|---|
| 60 | 9% | 15% |
| 100 (as bought) | 4% | 4% |
| 150 | 2% | 13% |

Melee casualties are a share of the unit struck, and a unit's blows a share
of its own strength, so a bigger unit of the same kit does not fight
harder. The rule of a unit's size by tier (100 for every tier today) only
matters for missile fire. So a cheap unit buys a body in the line, not
weight, and a body that breaks at once is worth nothing. **Morale decides:**
a unit's morale is a divisor on the morale it loses (levy 1.0, militia 1.4,
tribal and professional 2.1, elite 2.9). Levy lost twice what a
professional lost from the same blow.

### Why all horse lost

| Army | v planner | v charge |
|---|---|---|
| Rome: 2 horse archers, 1 riders (as bought) | 6% | 17% |
| Rome: 3 militia riders | 4% | 10% |
| Rome: 3 militia riders, horse at 2 SP | 9% | 6% |
| Rome: 3 levy riders | 1% | 5% |
| Rome: 3 professional riders (36 SP: over budget, for the experiment) | **79%** | 80% |
| Rome: 3 professional spears on foot | 75% | 89% |
| Sarmatia: 3 tribal horse archers | 38% | 36% |
| Sarmatia: 3 tribal horse archers at full numbers (not 60%) | 22% | 25% |
| Sarmatia: 3 tribal riders | 35% | 35% |
| Sarmatia: 3 tribal riders, charge half as hard again | 52% | 47% |

Three units of horse lose because three militia units of anything lose. The
horse's price is not the cause, and the slingers bracing against them (a
mistake, above) made it worse for every horse army.

### What a supply point buys

Missile fire (men one volley fells at close range; the shooters' quality
does not enter; a volley's morale cost is the share lost times 5.5 over the
target's morale divisor). Before:

| Weapon | Reach | Cheapest unit, SP | v light foot | v medium foot | v heavy foot | v horse | Felled per SP |
|---|---|---|---|---|---|---|---|
| sling | 300 m | levy, 4 | 5.4 | 2.6 | 1.2 | 5.8 | **1.36** |
| bow | 125 m | levy, 4 | 3.4 | 1.5 | 0.5 | 3.1 | 0.84 |
| crossbow (Han) | 150 m | professional, 9 | 8.4 | 6.6 | 4.4 | 5.3 | 0.93 |
| war sling | 350 m | professional, 9 | 6.8 | 3.2 | 1.4 | 7.2 | 0.76 |
| composite bow | 200 m | professional, 9 | 5.8 | 3.2 | 1.3 | 4.7 | 0.64 |
| war bow | 225 m | professional, 9 | 4.8 | 2.6 | 0.9 | 3.8 | 0.53 |
| horse archers (bow) | 125 m | levy, 7 (60 men) | 2.0 | 0.9 | 0.3 | 1.9 | 0.29 |

The sling shot 60% more than the bow for the same point, and further than
any bow at any price.

Melee and armies (one change at a time from a militia swordsman in light
armour and light shield, 7 SP; "army" is as many of it as 30 points buy,
against the usual armies, 64 battles):

| Unit | SP | Units for 30 | Army win, before | after A |
|---|---|---|---|---|
| militia sword, light kit (the base) | 7 | 4 | 3% | 11% |
| levy | 5 | 6 | 0% | 3% |
| tribal warriors (Sarmatia) | 7 | 4 | 34% | 44% |
| professional | 9 | 3 | 36% | 38% |
| veteran mercenaries | 11 | 2 | 2% | 2% |
| heavy armour | 9 | 3 | 19% | 47% |
| basic spear | 6 | 5 | 31% | 52% |
| war spear | 7 | 4 | 14% | 42% |
| battle axe | 7 | 4 | 11% | 33% |
| mace | 7 | 4 | 13% | 33% |
| gladius (Rome) | 7 | 4 | 8% | 17% |
| on a horse | 10 (9 after) | 3 | 5% | 19% |
| professional, great axe | 10 | 3 | 64% | 64% |
| professional, sarissa (Macedon) | 10 | 3 | 56% | 67% |
| levy, sling | 4 (5 after) | 7 (6) | **89%** | 58% |
| levy, bow | 4 | 7 | 34% | 38% |
| professional, crossbow (Han) | 9 (10 after) | 3 | **94%** | 50% |

Before, a one-kit army ran from 0% to 94%; after, from 2% to 67%. (The
duels the balance matrix fights are near certain, professional beats
militia every time, so I report what the points buy in whole armies.)

### The ten best and ten worst of 600 random armies

150 legal armies a faction, each spending at least all but 3 of its budget,
half one kit repeated and half a mix of two to four kits, each screened
over 32 battles against the usual armies; the extremes played again over
96 battles against the planner and 96 against a charging player, and
against each other. Before any change:

| # | Faction | Army | SP | v planner | v charge | v each other |
|---|---|---|---|---|---|---|
| 1 | Rome | 3 professional war slingers, medium armour | 30 | 100% | 100% | 93% |
| 2 | Macedon | 3 professional slingers, medium armour, medium shield | 30 | 95% | 98% | 65% |
| 3 | Rome | 2 professional slingers in heavy armour, heavy shield + 1 levy archers | 28 | 94% | 100% | 86% |
| 4 | Rome | 4 militia slingers, medium armour | 28 | 91% | 90% | 80% |
| 5 | Rome | 3 professional slingers, medium armour | 27 | 99% | 100% | 81% |
| 6 | Rome | 3 professional war spears, medium armour | 30 | 91% | 100% | 72% |
| 7 | Han | 2 militia axes in heavy armour + 3 levy slingers | 30 | 92% | 91% | 77% |
| 8 | Rome | militia throwing spears + professional war bows + professional pikes | 29 | 86% | 93% | 63% |
| 9 | Rome | levy daggers + veteran war slingers + professional war slingers | 30 | 91% | 89% | 70% |
| 10 | Rome | 5 militia slingers | 30 | 85% | 94% | 77% |
| -10 | Macedon | 2 veteran basic spears + levy swords + levy throwing spears | 29 | 0% | 1% | 30% |
| -9 | Sarmatia | 3 militia throwing spears on horses | 27 | 6% | 9% | 31% |
| -8 | Sarmatia | 5 levy light javelins on horses | 30 | 1% | 0% | 13% |
| -7 | Sarmatia | 5 militia daggers | 30 | 1% | 0% | 11% |
| -6 | Sarmatia | 2 levy swords + levy sickles + veteran mace on a horse | 27 | 1% | 1% | 16% |
| -5 | Sarmatia | 6 levy throwing spears, medium shield | 30 | 1% | 0% | 23% |
| -4 | Sarmatia | 7 levy throwing spears | 28 | 0% | 1% | 20% |
| -3 | Han | 7 levy light javelins | 28 | 0% | 0% | 35% |
| -2 | Han | 4 militia clubs | 28 | 1% | 3% | 33% |
| -1 | Han | 3 militia daggers on horses | 27 | 0% | 0% | 26% |

The ten best beat the planner and the charging player alike, and won 63 to
93% against the other extremes: they beat everything, not only the
computer. Over the 600: armies with no missile troops won 23% on average,
armies more than half missile 51%; 291 of 600 won under 20%, 56 over 70%.

After Recommendation A (a fresh draw of 600 under the new rules):

| # | Faction | Army | SP | v planner | v charge | v each other |
|---|---|---|---|---|---|---|
| 1 | Sarmatia | 3 professional basic spears, heavy armour | 30 | 99% | 100% | 77% |
| 2 | Han | 3 professional clubs, heavy armour, light shield | 30 | 93% | 96% | 86% |
| 3 | Han | professional war spear (heavy) + levy spear + professional mace (heavy, heavy shield) | 28 | 95% | 100% | 68% |
| 4 | Rome | 3 professional basic spears, heavy armour, light shield | 30 | 99% | 99% | 84% |
| 5 | Rome | 3 professional war spears, medium armour, light shield | 30 | 94% | 100% | 70% |
| 6 | Sarmatia | 3 professional basic spears, heavy armour, light shield | 30 | 99% | 99% | 76% |
| 7 | Han | 2 professional dao riders, heavy armour, medium shield | 28 | 88% | 92% | 64% |
| 8 | Rome | 3 professional clubs, heavy armour | 30 | 95% | 95% | 84% |
| 9 | Rome | 3 professional basic spears, medium armour, light shield | 27 | 96% | 95% | 69% |
| 10 | Macedon | 3 professional clubs, heavy armour, light shield | 30 | 93% | 96% | 83% |
| -10 | Macedon | 3 levy swords + veteran clubs | 27 | 4% | 7% | 19% |
| -9 | Macedon | veteran horse war bows + veteran pikes + levy clubs | 29 | 5% | 4% | 23% |
| -8 | Rome | 5 levy swords, light armour, medium shield | 30 | 3% | 4% | 32% |
| -7 | Rome | 3 militia swords, no armour, heavy shield | 27 | 1% | 1% | 24% |
| -6 | Rome | 5 levy gladii, no armour, medium shield | 30 | 2% | 3% | 29% |
| -5 | Macedon | 3 veteran archers, no armour | 30 | 2% | 2% | 8% |
| -4 | Sarmatia | 3 veteran clubs, no armour | 30 | 5% | 14% | 18% |
| -3 | Sarmatia | 4 militia swords, no armour | 28 | 1% | 7% | 27% |
| -2 | Macedon | levy spear + veteran axe + veteran war slingers | 28 | 5% | 3% | 22% |
| -1 | Han | 2 levy clubs + militia sword + veteran clubs | 27 | 3% | 4% | 36% |

Over the 600 after A: armies with no missile troops 40% on average (was
23%), more than half missile 26% (was 51%); 196 under 20% (was 291), 74 over
70% (was 56). No missile army is in the top ten now (nine of ten before),
and the bottom is armies that left their free armour behind, or bought
veterans (morale 1) in no armour. The top ten against each other: 64 to
86% (before, 63 to 93%).

I tried one more change against this new top, heavy armour 2 -> 3 SP
(`search.js --set data.ARMOR_SP.heavy_armor=3`): over 70% went from 74 to
71 and the top became two professional war spears in heavy armour (96%).
It does not help, and I left it out. Professional quality at 8 SP (with
Macedon's budget at 33 so its usual army still fits): over 70% 67 of 600,
the top three professional clubs in heavy armour (88%). Not much either.

What this says: against the usual armies, about one random army in eight
wins 70% or more under every price setting I tried. **The usual armies are
a soft yardstick**: they were picked to be even with each other, spend 25
to 30 points and carry militia, and a well-chosen 30 points of armoured
professionals beats them. Among the strongest armies themselves (the last
column) nothing is dominant: 64 to 86% after A.

### How much is the opponent

Not much. The planner plays a wall of missile troops no worse than a
player who charges: the slingers' 92% against the planner was 89% against
the charge and 85 to 88% against a planner that closes at once or sends
its horse at them. Of the usual armies, each did 5 to 10 points better
against a charging player than against the planner (charging into missile
fire and spears is worse play than the planner's), which says the planner
is the stronger of the two. What I could not test is a clever human (one
who screens, flanks and times a charge); a scripted player is not one.

---

## Part 2. Recommendation A: balance within the system

### The changes (commits `c40a656` and `b811834`, taken together)

(`b811834` puts back the quality tiers' prices that `c40a656` had lowered;
the two together are the proposal.)

| What | Before | After | Why |
|---|---|---|---|
| A missile unit hand to hand (`MISSILES.SIDEARM`) | fought with its sling, bow or crossbow's numbers | fights with a knife (the daggers' numbers) | the notebook: "engaged archers fight (poorly)"; slingers braced against horse |
| A volley's shock (`MISSILES.SHOCK`) | as the same losses in a melee | two thirds | missile fire wears, the melee breaks |
| Levy morale | 0 | 1 | at 0 levy broke at a look |
| Militia morale | 1 | 2 | keeps militia a step above levy |
| Sling | 1 SP, 300 m | 2 SP, 200 m | it outshot every bow at any price; now the composite bow's reach |
| War sling | 2 SP, 350 m | 3 SP, 250 m | stays the professional's better sling |
| Crossbow (Han) | 2 SP | 3 SP | it pierces armour as nothing else does |
| A horse | 3 SP (2 for horse peoples) | 2 SP (1) | horse is a buy again once slings stop bracing |
| Bows and slings | any armour | light armour at most (crossbow: medium) | missile troops were light troops; armoured shooters were the strongest armies drawn |
| Daggers, sickles, javelins, throwing spears, darts, throwing axes, pila | sold as a unit's only weapon | not sold alone (until second weapons exist) | worthless alone: the ten worst armies |

Every number is in `combat/tables.js` or `army/data.js` with a PROPOSAL
comment. The quality tiers' prices are unchanged (levy 3, militia and
tribal 5, professional 7, veterans 9): I tried levy 2 and militia 4 (cheap
armies were viable then, 33 to 52%), but six militia spears won 83% and ten
levy archers 72%, and the cheaper tiers made one-kit spam the strongest
play again.

### Before and after: the five kinds of army (`node src/harness/bought-league.js`, 1,280 battles each)

| Army bought | Before (Rome / Macedon / Sarmatia / Han) | After |
|---|---|---|
| the usual army | 47 / 45 / 45 / 47% | 47 / 53 / 45 / 41% |
| all levy spears | 3 / 0 / 0 / 3% | 19 / 5 / 19 / 20% |
| all levy slingers | **97** / 72 / 70 / 83% (7 units) | 56 / 22 / 30 / 47% (6 units) |
| veteran mercenaries, best kit | 44 / 36 / 48 / 61% | 58 / 44 / 59 / 69% |
| all horse | 16 / 13 / 33 / 17% | 25 / 14 / 48 / 20% |

The strongest of these is now 69% (Han's two veteran swordsmen with the
Yulin guard), was 97%. "All levy spears" here is bought as `bought-league.js`
buys it, without the free light armour and shields; with them (below) it
wins 33 to 43%.

### Before and after: the experiments (`experiments.js`, 96 battles a cell)

| Army | Before: v planner / v charge | After |
|---|---|---|
| 7 levy slingers | 92 / 89% | not affordable (35 SP) |
| 5 levy slingers | 72 / 65% | 38 / 38% |
| 3 professional war slingers | 88 / 91% | 50 / 50% |
| 7 levy archers | 33 / 28% | 28 / 39% |
| Rome's usual army without its slingers | 14 / 13% | 21 / 26% |
| 7 levy spears, no kit | 3 / 8% | 19 / 21% |
| 7 levy spears, free light armour and shield | 8 / 14% | **33 / 43%** |
| 5 militia spears, light kit | 30 / 31% | 60 / 57% |
| 3 professional spears | 79 / 90% | 82 / 89% |
| 5 levy spears + 2 levy slingers | 33 / 44% | 41 / 51% |
| Rome: 2 horse archers, 1 riders | 6 / 17% | 17 / 24% |
| Rome: 3 militia riders | 4 / 10% | 29 / 40% |
| Rome: 3 professional riders (over budget) | 79 / 80% | 89 / 93% |
| Sarmatia: 3 tribal horse archers | 38 / 36% | 18 / 25% |
| Sarmatia: 3 tribal riders | 35 / 35% | 42 / 50% |

**The one outlier A leaves: three professional spears** (74 to 82%). The
war spear beats every sword at the same price and braces against horse too.
At 3 SP it drops to two units and 36% (measured), and it puts Macedon's
usual army a point over budget (its hypaspists carry war spears), so I left
it; it is a question for you.

### Before and after: a wider panel (`node src/harness/army-study/tune.js`, 64 to 96 battles each)

| Army | Before | After |
|---|---|---|
| Rome: 3 professional spears | 75% | 74% |
| Rome: 4 militia spears | 14% | 45% |
| Rome: 3 professional great axes | 63% | 65% |
| Rome: 7 levy archers | 39% | 35% |
| Rome: legion + levy spears + slingers (combined) | 63% | 61% |
| Rome: professional spears + slingers (combined) | 72% | 69% |
| Rome: militia slingers | 84% | 56% |
| Rome: 3 professional slingers, medium armour | **98%** | not allowed (in light armour: 52%, measured on a draft of A) |
| Macedon: 3 sarissas | 52% | 65% |
| Macedon: 3 professional composite bows | 55% | 16% |
| Han: 3 crossbows | **86%** | 51% |
| Han: crossbows + levy spears | 84% | 47% |
| Sarmatia: 3 or 4 horse archers | 23% | 50% |
| Sarmatia: 3 riders | 33% | 50% |
| Sarmatia: horse archers + levy spears (combined) | 45% | 53% |
| Sarmatia: 3 professional riders | 34% | 73% |
| Sarmatia: tribal slingers on foot | 92% | 42% |
| Panel over 70% / under 20% | 12 / 8 of 34 | 3 / 6 of 34 |

### What it does to the usual armies

The usual armies are lists, so prices do not change them (every one stays
within budget: Rome 27, Macedon 30, Sarmatia 27, Han 26 of 30). But the
combat changes do: Rome leaned on slingers that braced against horse, and
Han on crossbowmen who fought like swordsmen.
`node src/harness/faction-league.js`, 960 battles:

| Pairing | Before | After |
|---|---|---|
| Macedon v Rome | 45 / 55 | 59 / 41 |
| Rome v Sarmatia | 43 / 57 | **26 / 74** |
| Han v Rome | 60 / 40 | 33 / 67 |
| Macedon v Sarmatia | 63 / 38 | **77 / 23** |
| Han v Macedon | 52 / 48 | 34 / 66 |
| Han v Sarmatia | 53 / 48 | 43 / 57 |

Two pairings go past 70/30, against none before: pikes beat horse, and
horse beat Roman foot, more sharply than they did. **The usual armies need
re-picking under A**, by the method that picked them (four candidates a
faction, the set whose worst pairing is nearest even); I have not done it,
because `src/data/factions.js` is another agent's file today and sixteen
new factions will need the same. One thing measured: giving Rome a unit of
levy spears turned Rome v Sarmatia to 61/39 but Rome v Han to 75/25, so it
is not a one-line fix. Average battle length went from 14.9 player turns to
15.8; the Commander taken in 1 battle in 17 (was 16), killed in 1 in 240
(was 32).

### What it does to `npm run balance`

The duel matrix fights units of the same quality in contact, so prices do
not enter. Three things change, all from the combat changes:
- **The archers row** (composite bow, light armour): they now fight with a
  knife. Light infantry against archers went from 54/46 to 100/0; pikemen
  against archers from 80/21 to 100/0; archers against archers from 3.0 to
  3.7 rounds. Every other pairing is unchanged, and all 45 still resolve in
  2 to 8 rounds.
- **The mirror ladder** (medium infantry, each tier against itself): levy
  from 2.0 rounds to 3.0 [3-3], militia from 3.0 to 4.0 [4-4]; the others
  unchanged. Rounds still rise with the tier (levy 3, militia 4, tribal and
  professional 5, elite 6.8), but veteran mercenaries (3.0) now fight
  shorter fights than militia.
- The design assertions in `balance.assertions.test.js` all still pass.

### Tests the proposal breaks (8 of 637), each a number it pins

- `builder.test.js`: none (the Q6 army shape holds at the old tier prices).
- `standard.test.js` "a bought army forms up on every map...": buys seven
  levy slingers for Rome; at 5 SP each that is 35 of 30.
- `pace.test.js` "experience lowers the bar, and fatigue raises it": a levy
  unit's rally bar moved, because levy morale is 1.
- `ranged.test.js` "bows, slings and crossbows shoot...": a sling reaches 8
  tiles, not 12.
- `damage.test.js` "Veteran Mercenaries lose morale as fast as Militia
  despite the price" and `ratings.test.js` "Veteran Mercenaries hit hardest
  and hold worst — Militia morale": militia's morale is 2 and the veterans'
  still 1. The notebook says veterans have "morale of mere Militia"; I
  left them at 1 because at 2 (and 10 SP) two veteran units won 80 to 91%.
  Your call (questions).
- `ratings.test.js` "morale resistance rises with the tier morale stat":
  pins levy's divisor at 1.0.
- `attack-named-unchanged.test.js`: a pinned battle's whole record; the
  combat changed, so the record did.
- `web/tests/army.test.js` "a choice that would overspend the budget is
  refused...": it relies on the old sling price leaving no room.

The soak (`npm run soak`): every game ends (480 hotseat, 120 against the computer, 288 faction armies, 160 bought armies, 50 meeting battles).

### Cheap troops, every weapon, combined arms

- **Combined arms now beats one note.** The top of the panel is mixes:
  Rome's legion with levy spears and slingers 61%, professional spears with
  slingers 69%, Sarmatia's horse archers with levy spears 53%; one-kit
  missile armies fell to 20 to 58%.
- **Every weapon has a job:** the sling and bow shoot and do not fight; the
  crossbow is the dear armour-piercer; spears stop horse; axes and maces
  win the melee; sidearms and thrown weapons wait for second weapons.
- **Cheap troops** have a use in a mix (they hold a place in the line, and
  the panel's best mixes have them), and an army of nothing but levy spears
  in their free light kit wins a third of its battles (33% against the
  planner, 43% against a charging player; was 8 and 14%). Levy at 2 SP
  would make it an even choice (measured 33 to 52% without the kit), at
  the cost of letting ten levy archers win 72%: I would not, and B does it
  better.
- **A clever build is rewarded but beatable:** the best of the panel are
  65 to 74%, not 95 to 100%. Han's veteran swordsmen (69%) and Sarmatia's
  professional riders (73%) are the edge.

---

## Part 3. Recommendation B: a muster roll, true to the peoples

Design only. What A cannot fix: under any prices, the best army is a few
units of whatever the engine likes best, repeated; and no price makes a
Roman army look Roman. A Roman commander did not field seven units of
slingers because Rome did not raise slingers: it raised legions, and hired
Balearic slingers and Numidian horse by the hundred. The original Discord
builder (`archive/src/game/armyData.js`) already pointed this way: units
were a primary weapon plus stacking missile weapons, support specialists,
and per-culture modifiers (Sarmatia "70% mounted"; Celts with no good
bows). The factions document (`docs/Context/final_20_cultures_complete.txt`)
is full of composition rules nobody has built: Rome "minimum 50% heavy
infantry", Sarmatia "minimum 70% mounted troops", Carthage "maximum 2 SP of
professionals", Maurya "minimum 3 unit types", Ireland "maximum 1 cavalry
unit".

### The system

1. **A muster roll per faction.** Instead of free kit, each faction lists
   the kinds of unit it can raise, each with its kit fixed or chosen
   within a range, and the quality it comes at. Rome: legionaries
   (professional, gladius and pilum, medium or heavy armour, big shield),
   velites (militia, javelins and sword, light), allied horse, Balearic
   slingers (hired). Each kind is marked **core** or **support**. The
   builder's kit rules stay as the floor every entry is checked against.
2. **Core and support.** At least half the army's units are core (Rome's
   "50% heavy infantry" exactly; Sarmatia's core is horse, so "70%
   mounted" falls out). Support is what made armies interesting and what
   breaks them in excess: missile troops, light horse, specialists.
3. **Repeats cost more.** The first unit of a kind at its price, each
   further one +1 SP (or the third and later +2). A wall of one kind is
   possible but dear. This is the single rule that most damps the
   unit-count spikes measured here.
4. **Supply is what you field, not what you own** (your ruling: "You
   don't have to deploy every unit every game. But you cannot field an army
   over the supply threshold. Additional units from capture and other
   avenues exist"). A Commander keeps a roster, which may grow past the
   threshold by capture, gifts and the factions' adaptation perks (Rome
   hiring defeated enemies as auxiliaries, Sarmatia unlocking a unit kind
   from each defeated culture). Before each battle he chooses what to
   field within the threshold. A veteran unit costs more to field (+1 at
   veteran, +2 at legendary): that is the fairness lever for Part 4, and it
   makes the old guard a choice, not a free bonus.
5. **Second weapons, for missile troops first** (your ruling: "secondary
   weapons were for ranged units to have options"). A missile unit may buy
   a sidearm (+1 SP: a sword instead of the knife A gives it), so archers
   who must hold can; melee troops may buy thrown weapons (pila, javelins:
   one volley at the charge). This is where daggers and javelins come back.
6. **Support specialists** stay out until each has a real rule (engineers:
   a prepared position; scouts: see further). The Discord builder had them
   as prose.

### What it would cost to build

- Data: a muster roll for each of the twenty factions (the factions
  document gives most of it). The agent adding sixteen factions is half way
  there already. About a day per four factions, done carefully.
- Builder: core/support, repeat pricing, the roster and "field up to the
  threshold": a few hundred lines in `engine/army/` and its tests.
- Engine: second weapons (a missile unit's melee weapon, and a thrown
  volley at the charge) touch `ratings.js` and the resolver; A's sidearm is
  the first half of it.
- Army screen: cards from the faction's roll instead of the five steps;
  "field" and "keep" separated; probably simpler on a phone than today.
- Balance: the same harness. Each faction's roll would be searched the way
  `search.js` searches today, and the space is far smaller.

### What it fixes that A cannot

- Armies look like their peoples, so a faction's identity comes from what
  it can raise, not from one elite unit.
- One-note armies are limited by who you are, not by fiddling a price
  until the engine's favourite is merely good.
- Unit-count spikes (the strongest effect measured here: four slingers
  42%, seven 92%) are damped by repeat pricing, not by moving a whole
  tier's price.
- Veterans and captures have a place: the roster.

### What a player would feel

Building an army becomes choosing which of your people to bring, not
assembling kit: "my Romans, two legions, the velites, and the slingers I
hired after Ashford". Losing a unit hurts more, because it was one of yours
on the roll. A faction plays differently from the first screen. Less
freedom to build a Roman horse army; more reason to play a second faction.

---

## Part 4. Veterans who fight better

You said: "The idea that veterans would not fight better seems off, but it
would need to be balanced into the game." Today a unit's earned veterancy
(its men's average experience, 0 to 30, `command/company.js`) does nothing
in a battle; the app does not pass it in. The engine's one old rule
(`veteranResistance`) makes a unit harder to break.

### What each way does (`node src/harness/army-study/veterans.js`)

Each faction's usual army against itself, one side's bought units (not the
elite) carrying veterancy: 4 factions, 4 maps, both ways round, 4 seeds,
128 battles a row. With Recommendation A's rules. "Won" is the veteran
side; "lost" is the share of its own men lost a battle.

| Veteran side carries | Harder to break only | Fight better only | Both | Die less only | **Proposed: fight a little better and die less** |
|---|---|---|---|---|---|
| nothing | 48%, 39% lost | 48%, 39% | 48%, 39% | 48%, 39% | 48%, 39% |
| green (4) | 58%, 38% | 52%, 39% | 56%, 39% | 48%, 38% | **51%, 39%** |
| seasoned (8) | 64%, 37% | 59%, 38% | 67%, 36% | 48%, 38% | **53%, 37%** |
| veteran (13) | 70%, 36% | 63%, 35% | 72%, 35% | 49%, 37% | **55%, 36%** |
| legendary (20+) | 78%, 35% | 72%, 35% | 77%, 34% | 49%, 36% | **60%, 35%** |

The old rule, measured the same way before A: resistance 0.2 won 55%, 0.4
70%, 0.8 (its "legendary") 88%, while the veterans' losses went only from
35.5% to 31.5%.

What each column is, per step (green / seasoned / veteran / legendary):
- harder to break: morale divisor +0.15 / 0.3 / 0.45 / 0.6
- fight better: attack and defence +0.5 / 1 / 1.5 / 2
- both: +0.5 / 1 / 1.5 / 2 and +0.05 / 0.1 / 0.15 / 0.2
- die less: of the men a blow would fell, they lose 5 / 10 / 15 / 20 in a
  hundred fewer, and are shaken as if they had lost them all
- **proposed: attack and defence +0.25 / 0.5 / 0.75 / 1, and die less as
  above.**

The finding: in this engine any lasting edge compounds over a fight (the
tables' note on chaos says the same of being prepared), so anything that
helps a unit fight wins far more battles than it saves men. "Die less"
alone saves men and wins nothing, which no player would notice. The
proposed mix gives a legendary unit a real but modest edge, half the
attack-and-defence step from militia to professional (which is 2 points,
and a point of morale besides), and keeps
about 4 men in a hundred alive each battle; it adds to the veterans' win
rate about what the old rule's first step did.

### The proposal (commit `4ecee17`)

`tables.VETERANCY.STEPS`: from 4 (green) +0.25 attack and defence, 5%
fewer fallen; from 8 (seasoned) +0.5, 10%; from 13 (veteran) +0.75, 15%;
from 20 (legendary) +1, 20%. The steps are the officers' levels. A unit
without veterancy fights exactly as before (the whole suite is unchanged by
it; it breaks no test). Not done: the web app passing a unit's veterancy
into the battle (`battles.js`, from `unitsOf`).

How it stacks:
- **With bought quality:** it adds to the tier, never replaces it. A
  legendary militia unit (+1) is still well short of professionals (+2
  attack and defence, +1 morale).
- **With training** (an officer of 30 battles raises his unit's quality one
  level every five battles): a long-lived unit under a great officer gets
  both, and both are earned. Militia trained to professional and legendary
  is a professional unit with +1: strong, and it took 20 battles at least.
  If that is too much, cap the two together (no unit above "professional
  +1"), or let training stop at professional, as you ruled.

### The fairness problem

Against the computer's usual armies (no veterancy), the veteran army
(`--vs usual`, 128 battles a row): none 47% (42% of its men lost), green
52% (40%), seasoned 52% (39%), veteran 55% (38%), legendary 55% (37%). So a
long-lived Commander wins about one battle in twelve more than a new one
would, and loses about one man in twenty fewer. That is a reward, not a
walkover. Three ways to keep it fair, none built:
- **Against the computer:** the computer's army takes the player's
  average veterancy, up to seasoned. The player still feels his veterans
  (his best units are above the average) and the computer is never a pushover.
- **Between friends:** the muster shows both armies' veterancy, and the
  host may set "fresh armies" (veterancy off for that battle).
- **In B:** a veteran unit costs more supply to field (+1 at veteran, +2 at
  legendary), so a long-lived army fields fewer units: better men, fewer of
  them.

Note: the veterancy commit is independent of A except for one line (the
volley's casualties in `combat/resolve.js`, which A also touches); taken
without A, that line merges by hand.

---

## The owner's questions

1. **Take A?** Whole, in part (the knife and the volley's shock are the
   two that matter most), or not.
2. **Veteran mercenaries' morale.** The notebook says "morale of mere
   Militia". With militia at 2, keep the veterans at 1 (built), or raise
   them to 2 and their price to 10 (measured: two veteran units then win 80
   to 91%)?
3. **An army of only levy.** It now wins about a third. Should it be an
   even choice on its own (then levy at 2 SP, with the missile-spam risk
   measured above), or is a third enough?
4. **The war spear.** Three professional spears still win 74 to 82%. Raise
   the war spear to 3 SP (Macedon's hypaspists then need a light shield to
   stay in budget), or leave it?
5. **The usual armies.** Re-pick them under A (with the sixteen new
   factions), by the method that picked them?
6. **B.** Is a muster roll per faction, with core and support and rising
   prices on repeats, the direction? If so, the factions document's
   composition rules become data.
7. **Part 4.** Veterans that fight a little better and die less (built,
   numbers above), and which fairness rule against the computer: the
   computer matches the player's veterancy, or none?
8. **Training and veterancy together:** cap a unit at "professional +1",
   or let both stack?

## What I could not determine

- How a clever human plays against these armies. The scripted players
  (charge, rush) are not clever; the planner is the best opponent here.
- Whether A holds for the sixteen factions being added: the search covers
  the four that exist.
- The usual armies under A: measured, not re-picked.
- Part 4 was measured with A's rules in place; without A the numbers will
  differ somewhat (the old rule's line above is the only measure without it).
- Why fewer men a unit sometimes helped after A (four militia swordsmen:
  60 men a unit 42%, 100 men 16%, 150 men 18%). My guess is the rule that
  an army breaks when it has lost so many of its men: with smaller bought
  units the free elite's 80 men are a bigger share, and they stand. Not
  confirmed; worth a look before the unit-size rule is tuned.
- Numbers from 64 to 128 battles carry about 5 to 6 points of noise; I
  have not claimed differences smaller than about 10.

## Where the commits are

On `main`: this report and the study scripts only. Nothing on `main`
changes a rule. The two proposals are **not merged**; they are on the branch
`army-balance-proposals`, under the commit names below, waiting on Zach's
word. That branch was cut before the twenty factions, the roster and the
messengers went in, so a proposal that is taken gets brought up to `main`
and measured again first.

| Commit (on `army-balance-proposals`) | What |
|---|---|
| `a559b88`, `f306d91`, `8796ae6`, `c151dd8`, `1764249`, `ce5d0e4` | The study: `src/harness/army-study/` (scripts only; `npm test` 637 of 637 on `a559b88`; the later ones touch only these scripts) |
| `c40a656` + `b811834` | **PROPOSAL, Recommendation A** (take both) |
| `4ecee17` | **PROPOSAL, Part 4**: veterancy |
| (this report) | `docs/design/army-balance.md` |

To rerun: `node src/harness/army-study/experiments.js`, `value.js`,
`search.js --per 150`, `tune.js now`, `veterans.js --seeds 4` (and
`--vs usual`), `node src/harness/bought-league.js`,
`node src/harness/faction-league.js`, `npm run balance`.

---

## Part 5. What was built after Zach's rulings

Zach, November 23: A, **"Yes"**; veterans who fight a little better and die
less, the computer matching your average veterancy up to seasoned, **"Yes"**
(wired into the app by another piece of work). On B: **"In some ways it makes
sense but is not as fun. The balance needs to come from the units themselves
and the combination of weapons and armor ... Some units should be best but can
then cost more. It should have a grounding in history ..."** And on the smaller
questions: **"pull more levers and rebalance in a way to keeps the fun army
building ideas alive."** So no muster roll: every army a player thinks of is
allowed, and the work is in what things cost and what they do.

Measured as before: the computer's planner on both sides, every battle its own
seed, all four maps, both ways round. New scripts in `src/harness/army-study/`:
`pool.js` (battles in worker processes), `usual.js` (the twenty usual armies'
league, and the re-pick), `classics.js` (the classic armies, against the usual
armies and kind against kind), `try.js` (any army against the usual armies).

### 1. Recommendation A on twenty factions

A forbade what ten of the new factions' usual armies carried: javelins and
throwing axes alone (velites, peltasts, Numidian and Berber horse, Thracian and
Germanic skirmishers, the Sarmatian and Celtic light horse), and the Mongols'
elite wore medium armour with bows. What was done:

- **A faction's elite is checked for its culture's kit only**, not for A's
  rules on what is sold: the elite is never bought, and the doc gives the
  Peltast Guard and the Blue Men a second weapon the builder cannot carry.
- **Each javelin or throwing-axe unit re-armed in its people's kit**: Rome's
  velites and Macedon's peltasts with a sword or spear, the skirmishers with
  slings or bows, the light horse with swords. Then the six factions A had made
  weak or strong were **re-picked by the method that picked them** (each
  candidate against the other nineteen; the one nearest half kept): Han
  (crossbows in medium armour, swords, spears), Kush, Mongolia (two horse
  archers, two riders), Sarmatia (three horse archers), Bactria, Sparta.
- **Why the suite ran for ten minutes on that branch**: it hung.
  `web/tests/factions.test.js` mustered illegal usual armies, the server
  answered 500, a test threw before closing its server, and the file never
  exited. With legal armies it ends; the whole suite runs in about 15 seconds here.
- **Tests** that pinned A's old numbers pin the new ones; A's rules (what is
  sold, the knife, the volley's shock, veterancy) had no tests and now do.

The usual armies against each other (`usual.js league`, 32 battles a pairing):

| | Before A (main) | A, armies only made legal | A, re-picked | After part 5 |
|---|---|---|---|---|
| Range of factions | 41% (Berbers) to 58% (Persia) | 21% (Han) to 67% | 31% (Kush) to 65% | **40% (Kush) to 59% (Germania)** |
| Factions outside 35-65% | 0 | 6 | 2 | **0** |
| Pairings past 75/25 | 41 of 190 | 61 (16 a pairing) | 41 (16 a pairing) | **26 of 190** |

### 2. More levers, from the units themselves

The classic armies (`classics.js`): each bought by Rome (full-price horse),
Sarmatia (cheap horse, tribal warriors) and Han, as many of its kit as the
budget buys: levy spears in light kit; levy slingers; levy archers; riders
(militia or tribal, sword); horse archers; heavy infantry (professionals with
the spear in heavy armour); pikes (professionals); a balanced army (a
professional line unit, spears, archers, riders).

**What A left** (against the usual armies, 160 battles each; kind against kind,
72 a cell): heavy infantry 99% against the usual armies and 94% against every
other kind, beating every one of them 83 to 100%. Nothing beat it. Measured
(`try.js`): three professionals with the basic spear won 74% in light armour,
94% in medium, 98% in heavy, for 3 and 6 SP more. **Armour was the cheapest
edge in the game.**

Rounds (one change at a time, then measured):

| Round | Lever | Result | Kept |
|---|---|---|---|
| 1 | **Armour by its weight**: medium 1 -> 2 SP, heavy 2 -> 4 | heavy infantry 99 -> 88% v usual, 94 -> 79% v kinds (three units -> two) | yes |
| 2 | Heavy armour marches 2 tiles a tick, not 3 | no change (98% v usual): the computer does not skirmish, so nothing keeps its distance | no |
| 3 | Pikes keep an enemy without them off (blows at 0.6) on open ground unless flanked; disordered (+2 chaos) in woods, marsh and crossings | pikes v heavy 38 -> 44%, the rest within noise | no |
| 4 | The computer plays horse archers as archers (stand off and shoot) | horse archers 34 -> 33% v kinds: they cannot hurt armour | no (and it is the planner's file) |
| 5 | **Heavy armour costs wind**: stamina drain 6 -> 12 (9 tried) | heavy 88 -> 78% v usual (84 at 9), 79 -> 69% v kinds; pikes now beat it 54% | yes |
| 6 | The basic spear 1 -> 2 SP | levy 43 -> 33%, nothing else moved | no |
| 7 | Professional, veteran and elite archers fight with a sword (the knife for the rest) | Kush 15 -> 17%: no help; Mongolia and Han +10 | no |
| 8 | The pike 3 -> 4 SP | pikes 72 -> 39% (three units -> two): overshoots | no |
| - | The usual armies re-picked under rounds 1 and 5 (eight factions) | see the league above | yes |

Rounds 6, 7 and 8 in a row did not help, so I stopped there.

**The classic armies, after** (against the usual armies, 320 battles each):

| Army | After A | After part 5 | Rome / Sarmatia / Han, after |
|---|---|---|---|
| a mob of levy (7 units) | 46% | 41% | 38 / 53 / 31% |
| slingers (6) | 57% | 53% | 61 / 50 / 46% |
| archers (7) | 42% | 36% | 43 / 34 / 32% |
| all horse (3) | 44% | 41% | 30 / 71 / 22% |
| horse archers (3, Sarmatia 4) | 34% | 35% | 19 / 75 / 12% |
| heavy infantry (3, now 2) | **99%** | **77%** | 79 / 79 / 74% |
| pikes (3) | 77% | **76%** | 80 / 81 / 68% |
| balanced (4, now 3) | 69% | 46% | 35 / 79 / 25% |

**Kind against kind, after** (the row's wins against the column, 144 battles a
cell; each kind's three factions against the other's three):

| | levy | slingers | archers | horse | horse archers | heavy | pikes | balanced | All |
|---|---|---|---|---|---|---|---|---|---|
| levy | - | 52% | 53% | 72% | 71% | 22% | 20% | 51% | 49% |
| slingers | 48% | - | 80% | 48% | 62% | 29% | 48% | 47% | 52% |
| archers | 47% | 20% | - | 45% | 47% | 23% | 31% | 42% | 36% |
| horse | 28% | 52% | 55% | - | 55% | 22% | 24% | 52% | 41% |
| horse archers | 29% | 38% | 53% | 45% | - | 33% | 20% | 43% | 38% |
| heavy | 78% | 71% | 77% | 78% | 67% | - | 46% | 71% | 70% |
| pikes | 80% | 52% | 69% | 76% | 80% | 54% | - | 69% | 69% |
| balanced | 49% | 53% | 58% | 48% | 57% | 29% | 31% | - | 46% |

(After A the "All" column ran from 29% (horse archers) to 94% (heavy); now 36%
(archers) to 70% (heavy). Every kind now wins at least a fifth of its battles
against heavy infantry, and pikes beat it.)

Who beats whom: **heavy infantry** beats everything but pikes and is the best
army in a stand-up fight, and now costs it (two units, not three, and spent
within three rounds); **pikes** beat heavy infantry on open ground, horse and
levy, and are held by slingers; **slingers** beat archers (they outrange them
and are cheaper per volley) and horse archers; **levy** in numbers beat horse
and horse archers (spears brace) and hold slingers and archers even; **horse**
beat archers and the balanced army; **horse archers** beat only archers.

**The random search** (`search.js --per 30`: 600 legal armies, 30 a faction,
each against all twenty usual armies; the extremes again at 96 battles):

| | After A (four factions, report above) | After part 5 (twenty factions) |
|---|---|---|
| Best army | 3 professional spears, heavy armour: 99% | 3 professional spears, **medium** armour (Carthage): 93% |
| The ten best | professionals in heavy armour, 88-99% | professionals in medium armour with a cheap weapon (spear, club), 82-93% |
| Over 70% | 74 of 600 | 68 of 600 |
| Under 20% | 196 of 600 | 149 of 600 |
| Armies with no missile troops / over half missile | 40% / 26% | 40% / 32% |

The ten best against each other: 66 to 88%. The worst ten are armies without
armour (veterans in none, levy on horses) and seven of them are Kush's: random
Kush armies win almost nothing (below).

**The five kinds `bought-league.js` buys** (`--seeds 1`: each faction's five
armies against all twenty usual armies, 160 battles each; the mean of the
twenty factions, and the lowest and highest):

| Army bought | Before A | After A, part 1 | After part 5 |
|---|---|---|---|
| the usual army (yardstick) | 50% (43-58) | 49% (30-65) | 49% (36-59) |
| all levy spears, no kit | 9% (1-24) | 22% (2-41) | 20% (3-34) |
| all levy slingers | **79%** (50-96) | 41% (14-74) | 41% (16-69) |
| veteran mercenaries, best kit | 63% (21-88) | 57% (5-82) | 35% (2-70) |
| all horse | 26% (1-74) | 30% (3-82) | 31% (3-78) |

16,000 battles each. With no end of day in this harness (it plays up to 150
player turns), 4 battles did not end after part 5 (2 after A, 0 before); in the
app the day ends them, and `npm run soak` ends every one. In `experiments.js`
(now against all twenty usual armies) seven levy spears in their free light
kit win 48% against the planner and 47% against a charging player (33 and 43%
after A); three professional spears in light armour 88 and 98%.

**The Commander's odds** (`captive-league.js --battles 2000 --policy wait`, a
player who sends everyone in): taken in 1 battle in 24.4 before A, 1 in 23.5
now. With the computer's plan on both sides (`usual.js league`, 12,160
Commanders): taken 1 in 40 and killed 1 in 450 before A; 1 in 34 and 1 in 368
now. Within the ruled band; `tables.COMMANDER` not retuned.

**`npm run balance`.** Its last table (the mirror ladder, medium infantry) is
as A left it: levy 3.0 rounds, militia 4.0, tribal and professional 5.0,
veteran mercenaries 3.0, elite 6.8 (before A: levy 2.0, militia 3.0). The duel
matrix's heavy infantry row moved with its wind: against spearmen 100/0 -> 29/71,
cavalry 100/0 -> 2/98, maceman 1/99 -> 0/100. The design assertions pass.

### 3. What is still out of line

- **Professionals in medium armour** are the new top: three of them with a
  1-SP weapon win 92-93%. Medium armour at 3 SP was tried (two such units and
  a militia one: 86%). Most of the edge is quality and armour per unit; the
  engine settles each melee between two units almost surely, so a few good
  units beat many middling ones.
- **Heavy infantry 77% and pikes 76%** against the usual armies (the target was
  70). Against the other classic armies both are at 69-70%.
- **Horse archers** 35% overall, and 12-19% for a people who pay full price for
  horses and field them as militia. They cannot hurt armour, and nothing in the
  engine lets them keep their distance: the Carrhae counter to heavy infantry
  is not there. That needs a skirmish rule (light and mounted missile troops
  step back from slower foot), which is a new rule and was not built.
- **Archers** 36%: below slingers everywhere, and beaten 4 to 1 by them.
- **Kush**: its usual army is re-picked to 40%, but almost any army Kush buys
  is among the worst drawn. Its elite are archers who fight hand to hand with a
  knife, and the Commander rides with them; a sword for better archers did not
  change it (round 7).
- Woods and marsh do not yet break up formed heavy foot (the Teutoburg
  counter). Pikes' disorder in rough ground was built in round 3 and dropped
  with the rest of it.
- Numbers still do not count in a melee: a cheap army buys bodies, not weight.

### 4. Questions for Zach

1. **Medium armour at 3 SP?** Professionals in medium armour are now the best
   buy (92%); at 3 they fall to 86%. Recommendation: not yet; first see whether
   players find them.
2. **A skirmish rule** (missile troops, on foot or horse, step back from slower
   foot that comes at them, and shoot): the one rule that would make horse
   archers and slingers a real answer to heavy infantry, as at Carrhae.
   Recommendation: yes, as the next piece of work.
3. **Battles saved before this change replay differently** (the finished one in
   the before-roster test is no longer decided at its last turn). Keep old
   rules for old battles, or let them replay under the new ones?
   Recommendation: keep a rules version on each saved battle.
4. **Kush's elite**: the Golden Bows are archers who cannot fight hand to hand.
   Give them a second weapon (a sword) as the doc's elites often have, or leave
   Kush as an army that must be bought around its elite? Recommendation: a
   sword for the elite only.

### Where it is

Branch `worktree-agent-abbec1f2756ff7178`: `0380d68` (part 1: A on twenty
factions), `0cc1731` (armour by weight), `42af3bb` (study scripts), `2d39d8d`
(wind), `f1a27c6` (main merged), `268e307`, `580ed20` (usual armies
re-picked), `239864a`, and this report.

## Part 6. A skirmish rule (proposal; not taken)

**Not taken.** Zach, November 24: "Skirmish rule makes sense but evidence
like marathon shows heavy infantry can run a long way. I don't like the
skirmish rule. Fire and retreat is ok"; on men on foot shooting as they
fall back, "No firing on the move." What was built instead is Part 7. This
part is kept as the record of what was proposed and measured.

Part 5 ended on this: nothing in the engine let missile troops keep their
distance from slower men, so the historical answer to heavy foot (the
velites before the phalanx, Sphacteria, Carrhae) was not there. This part
builds that rule on a branch of its own. **It is a proposal: it is not
merged, and should not be without Zach's yes.**

### The rule, in plain words

- **Who.** A unit with a missile weapon (bow, sling, crossbow) in light
  armour or none: a skirmisher by its kit. Nothing is bought for it and no
  new order is needed.
- **When.** Only while it presses the enemy (the advance, or an attack with
  no target): not when told to hold, defend, hide or march somewhere, and
  not once it is in a fight. Pressing, it now closes only to where it can
  shoot (its weapon's reach or its own sight, whichever is nearer), not to
  blows.
- **What.** When enemies it can see come within a tile of reaching it this
  tick, and it can outrun every one of them, it falls back to a place it
  can reach this tick over the ground as it is: out of their reach, still
  in shot, straight back rather than across their front. Then it shoots:
  horse archers as they always have on the move (at 0.6), foot at half the
  rate of standing.
- **Whom it can outrun.** Horse outrun all foot. Light foot outrun foot in
  mail or plate (medium or heavy armour). Nothing outruns horse or light
  foot: with one of those coming on, it stands, and is caught.
- **Its limits.** Running costs it 5 stamina a tick, and stamina does not
  come back in a battle; under 40% of its stamina it is spent and runs no
  more. The edges of the field and ground it cannot cross (a river but at a
  ford or bridge) pin it; woods, marsh and hills shorten the run.
- **The chase.** Men who come on after skirmishers they cannot catch lose
  their kit's wind for each tick of it: heavy armour and a light shield
  12.5 stamina a tick, mail and a medium shield 4, light kit 1.5. Armoured
  men worn out chasing light ones is how Sphacteria and Carrhae went.
- **The computer uses it.** Its foot skirmishers with an enemy within 7
  tiles press him, whatever its line is doing (a holding line's archers
  used to stand behind it to the last). Its horse archers keep to the
  horse's way (they ride first for enemy archers they have seen): played
  as foot skirmishers too, slingers outshot them 96 to 4 in 72 battles.
- **Told.** "Your slingers fell back before the legion, keeping out of
  their reach", once a turn; the enemy hears of it only if he can see them.

The numbers are `tables.SKIRMISH`, each with where it came from; the rule is
`engine/battle/skirmish.js` and its step in `battle/battle.js`.

### Measured

As in Part 5: the computer's planner on both sides, all four maps, both
ways round, every battle its own seed, the same seeds before and after.
"Before" is `integration-7`, whose numbers are Part 5's to the point.

**The classic armies against the usual armies** (`classics.js field
--seeds 2`, 320 battles each; "at the day's end": of the 320, battles won
on fewer losses when the day ran out):

| Army | Before | After | Rome / Sarmatia / Han, after | Won at the day's end, before / after |
|---|---|---|---|---|
| levy | 41% | 41% | 40 / 52 / 31% | 5 / 8 |
| slingers | 53% | **60%** | 68 / 53 / 58% | 10 / 13 |
| archers | 36% | **40%** | 48 / 38 / 34% | 16 / 26 |
| horse | 41% | 39% | 27 / 70 / 21% | 8 / 11 |
| horse archers | 35% | 37% | 20 / 74 / 17% | 5 / 13 |
| heavy | 77% | **70%** | 69 / 76 / 65% | 14 / 21 |
| pikes | 76% | 77% | 81 / 81 / 69% | 5 / 7 |
| balanced | 46% | 47% | 35 / 81 / 24% | 7 / 11 |

Every one of the 2,560 battles ended, before and after.

**Kind against kind, after** (`classics.js kinds --seeds 2`, 144 battles a
cell; before in brackets where a cell moved 8 points or more):

| | levy | slingers | archers | horse | horse archers | heavy | pikes | balanced | All |
|---|---|---|---|---|---|---|---|---|---|
| levy | - | 50% | 52% | 72% | 63% (71) | 22% | 20% | 44% | 46% (49) |
| slingers | 50% | - | 82% | 62% (48) | 66% | **53% (29)** | 45% | 55% | 59% (52) |
| archers | 48% | 18% | - | 48% | 61% (47) | **38% (23)** | 33% | 40% | 41% (36) |
| horse | 28% | 38% (52) | 52% | - | 55% | 22% | 24% | 45% | 38% (41) |
| horse archers | 37% (29) | 34% | 39% (53) | 45% | - | **48% (33)** | 26% | 43% | 39% (38) |
| heavy | 78% | 47% (71) | 63% (77) | 78% | 52% (67) | - | 46% | 63% (71) | **61% (70)** |
| pikes | 80% | 55% | 67% | 76% | 74% | 54% | - | 68% | 68% (69) |
| balanced | 56% | 45% | 60% | 55% | 57% | 38% (29) | 32% | - | 49% (46) |

The "All" column ran from 36% (archers) to 70% (heavy); now from 38%
(horse) to 68% (pikes). Slingers now beat heavy infantry, and archers and
horse archers trouble it (38 and 48%, from 23 and 33). Horse still beat
archers (52%) and hold horse archers (55%), but now lose to slingers.

**The usual armies' league** (`usual.js league --seeds 4`, 6,080 battles,
32 a pairing): before 40% (Kush) to 59% (Germania), 26 of 190 pairings past
75/25; after **39% (Kush) to 60% (Germania)**, 27 pairings. Every battle
ended; 13.4 player turns on average before, 14.3 after. No faction left
35-65%, so no usual army was re-picked.

**The random search** (`search.js --per 30`: 600 legal armies, each against
all twenty usual armies):

| | Before (Part 5) | After |
|---|---|---|
| Best army | 3 professional spears, medium armour (Carthage): 93% | the same army: 93% |
| The ten best | professionals in medium armour with a cheap weapon, 86-93% | the same, with two Sarmatian armies among them (horse with maces and a horse archer unit, 89%; clubs on foot, 86%) |
| Best army of skirmishers only | 8 levy archers (Carthage): 83%; the next 72% | the same army: 83%; the next 76% (Rome's three professional slingers, and six levy slingers) |
| Over 70% / under 20% | 68 / 149 of 600 | 57 / 144 |
| Mean win: no missile troops / some / over half missile | 40 / 34 / 32% | 40 / 36 / 35% |

**Rounds** (one change at a time; `classics.js both --seeds 1`, 72 battles a
cell, so a cell moves 5 to 8 points by chance alone):

| Round | Change | Heavy v kinds | Kept |
|---|---|---|---|
| 0 | (before) | 69% | |
| 1 | Skirmishers fall back and shoot; they close to shooting distance, not to blows | 70%. Horse archers kited and killed nothing: a basic bow fells 0 or 1 man in heavy armour a volley | yes (the rule) |
| 2 | Chasers winded at half their kit's wind a tick | 65%; horse archers v heavy 31 -> 44% | yes |
| 3 | The computer's skirmishers press a near enemy, horse archers too | 65%; horse archers outshot by slingers, 4% | no |
| 3b | The same, foot only | 65%; slingers 52 -> 58% overall | yes |
| 4 | Fall back straight, not sideways (they had circled round the enemy) | 65% | yes (a fix) |
| 5 | Fall back only to ground reachable this tick | 64%; in a probe, horse archers v pikes 12 -> 17 of 32 | yes (a fix) |
| 6 | Chasers winded at their kit's whole wind | 60% | yes |
| 7 | Close to the nearer of reach and sight, and never wait on a place an enemy was last seen (a battle in the planner's own test stood for 150 turns) | 60% | yes (a fix) |

Also measured on the final rule: **foot that fall back do not shoot at all**
(the ruling of November 21 kept whole: `SKIRMISH.ON_FOOT` 0): slingers
against heavy infantry 39% instead of 53%, heavy 63% against the kinds
instead of 61%, the rest within a point or two.

**Checked after.** `npm run soak`: every battle ended; battles run longer
(hotseat games 13.4 -> 17.2 player turns on average, the computer's side
18.9 -> 20.8, faction armies 17.5 -> 18.9). `npm run balance`: its output is
the same, line for line. The Commander's odds: a player who sends everyone
in (`captive-league.js --battles 2000 --policy wait`) is taken in 1 battle
in 16.7, from 1 in 23.5 (on November 23 they were set at "about 1 battle in
19" for such a player); with the computer on both sides (the league), taken
1 in 30 (34 before) and killed 1 in 405 (368). Not retuned.

### What is still out of line

- **Pikes**: 77% against the usual armies, 68% against the kinds. The rule
  does nothing to them: pikemen wear light armour, so skirmishers cannot
  outrun them. Their lever is disorder in rough ground (Part 5, round 3).
- **Heavy infantry** at 70% against the usual armies is at the target, not
  under it.
- **Slingers** are now the best missile troops by far (59% against the
  kinds; 82% against archers) and beat horse 62% (48% before), where horse
  should be their answer. A sling reaches as far as any bow but the
  professional one, and its stone tells on horse (effectiveness 90).
- **Horse archers**: 37-39%. They now trouble heavy foot (48%), but Rome's
  and Han's still win only about a fifth of their battles (militia at full
  price, with a basic bow). The bow against armour is their weakness now,
  not the running.
- **Wins at the day's end** rose: archers win 26 of 320 battles that way
  (16 before), heavy infantry 21 (14). A side that shoots and runs can take
  a day it never closed. It is a twelfth of the archers' battles, so not
  the new best army, but it is where this rule could be abused.
- **The Commander** is taken more often by a player who sends everyone in
  (1 in 16.7, from 1 in 23.5): when the skirmishers beside his unit fall
  back, his unit is left to fight alone.
- **Battles saved before** replay differently: `fixtures/before-veterans`
  no longer replays as it was played (its battle has skirmishers in it),
  as the two older saved battles already did. Part 5's third question.

### Questions for Zach

1. **Take the skirmish rule?** Recommendation: yes. Heavy infantry falls
   from 70 to 61% against the other kinds and from 77 to 70% against the
   usual armies; slingers beat it, archers and horse archers trouble it;
   no kind and no faction leaves its band; the best army is unchanged.
2. **Foot shoot as they fall back, at half rate?** That is an exception to
   the ruling of November 21 ("having to stand still to shoot is the
   limit"). Without it the rule still helps, but slingers win 39% against
   heavy infantry rather than 53%. Recommendation: allow it.
3. **The Commander's odds** rose to about 1 in 17 for a player who sends
   everyone in. Retune `tables.COMMANDER`, or accept it as the price of an
   army that skirmishes?
4. **A win at the day's end** for a side that never closed: leave the
   verdict as it is (fewer losses), or make it harder for a side that gave
   ground all day? Recommendation: leave it, and watch it in play.

### Where it is

Branch `worktree-agent-ad468ce5c58112598`, on top of `integration-7`:
`ced2716` (the rule), `f0f37aa` (sight, the chase at full wind, tests),
`04db838` (the report's words, the day's end counted in `classics.js`, a
fingerprint retaken), and this report.

## Part 7. Fire and retreat (taken 2026-11-24)

Zach, November 24, on Part 6: "Skirmish rule makes sense but evidence like
marathon shows heavy infantry can run a long way. I don't like the
skirmish rule. Fire and retreat is ok"; on men on foot shooting as they
fall back, "No firing on the move"; on the Commander taken about 1 battle
in 17, "Retun commander taken odds"; on Kush's Golden Bows, "They don't
hit hard from range? They can have a sword".

### The rule, in plain words

- **Fire.** A missile unit told to press the enemy (advance, or attack with
  no target) closes to where it can shoot, not to blows, and stands there
  shooting.
- **Retreat.** When enemies it can see could reach it this tick, and its
  own march beats every one of theirs, it falls back out of their reach
  (still in shot if it can), and shoots again when it stands. Falling back
  is a march like any other: its own pace, over the ground as it is, no
  dearer in wind than any march.
- **Who can get away.** No man is slower for his armour (Marathon). Every
  man on foot marches 3 tiles a tick and every horse 5, so only horse get
  away from foot; foot never get away from foot, and nothing from horse.
  Archers and slingers on foot stand, shoot, and are caught.
- **No firing on the move** for men on foot: a foot unit that moved does
  not shoot that tick (as ruled on November 21). Horse archers shoot as
  they ride, at the rate they had before Part 6 (`MISSILES.ON_THE_MOVE`
  0.6, raised at `HORSE_ARCHER_NUMBERS` 0.6 of their men).
- **Not when told otherwise.** A unit told to hold, defend, march
  somewhere or hide, or already in a fight, does not fall back.
- **The edges.** The field's edges and ground that cannot be crossed pin a
  unit: with nowhere to go it stands.
- **The computer.** Its missile troops on foot press any enemy it sees
  within 7 tiles, whatever its line is doing, so that they shoot. Its horse
  archers keep to the horse's way.
- **Told.** "Your horse archers fell back before the legion, keeping out
  of their reach", once a turn; the enemy hears of it only if he sees them.

Gone from Part 6: light men outrunning men in mail or plate, the wind lost
in a run (5 a tick) and the "spent" stop, the wind the chasers lost, and
foot shooting as they fell back. The code: `engine/battle/skirmish.js`, its
step in `battle/battle.js`, `tables.SKIRMISH` (one number, `WARY` 0),
six lines in `opponent/planner.js`.

### Measured

As in Parts 5 and 6: the computer's planner on both sides, all four maps,
both ways round, every battle its own seed, the same seeds before and
after. "Before" is main at `d7622ab` (no skirmish rule). "After" is this
branch with fire and retreat and the Golden Bows' sword. **A battle the
day ends is no win for either side** (ruled November 24); the study's
harness now counts it so (`army-study/lib.js`), before and after alike.

**The classic armies against the usual armies** (`classics.js field
--seeds 2`, 320 battles each; "day's end": of the 320, battles the day
ended, with no winner):

| Army | Before | After | Rome / Sarmatia / Han, after | Day's end, before / after |
|---|---|---|---|---|
| levy | 40% | 39% | 36 / 51 / 29% | 9 / 25 |
| slingers | 51% | **57%** | 66 / 52 / 53% | 13 / 12 |
| archers | 35% | **40%** | 45 / 38 / 37% | 38 / 41 |
| horse | 40% | 39% | 28 / 68 / 19% | 14 / 19 |
| horse archers | 35% | 33% | 17 / 70 / 12% | 17 / **56** |
| heavy | 76% | **72%** | 72 / 79 / 65% | 26 / 54 |
| pikes | 76% | 74% | 77 / 79 / 66% | 8 / 33 |
| balanced | 45% | 44% | 31 / 78 / 23% | 29 / 29 |

Every one of the 2,560 battles ended, before and after.

**Kind against kind, after** (`classics.js kinds --seeds 2`, 144 battles a
cell; before in brackets where a cell moved 8 points or more):

| | levy | slingers | archers | horse | horse archers | heavy | pikes | balanced | All | Day's end |
|---|---|---|---|---|---|---|---|---|---|---|
| levy | - | 50% | 50% | 72% | 49% (70) | 22% | 20% | 45% | 44% (48) | 20 of 1008 (7) |
| slingers | 49% | - | 84% | 59% (48) | 68% | **40% (28)** | 44% | 54% | 57% (51) | 8 (5) |
| archers | 49% | 15% | - | 44% | 63% (46) | 23% | 27% | 46% | 38% (35) | 18 (21) |
| horse | 28% | 40% (52) | 56% | - | 54% | 22% | 23% | 46% | 38% (41) | 5 (1) |
| horse archers | 40% (29) | 32% | 37% (53) | 44% | - | 35% | 28% | 40% | 37% (38) | 48 (3) |
| heavy | 78% | 59% (70) | 69% | 78% | 55% (67) | - | 46% | 68% | **65% (69)** | 34 (17) |
| pikes | 79% | 56% | 72% | 76% | 61% (79) | 53% | - | 71% | 67% (68) | 22 (7) |
| balanced | 55% | 44% | 54% | 54% | 60% | 31% | 28% | - | 47% (46) | 5 (13) |

The "All" column ran from 35% (archers) to 69% (heavy); now from 37%
(horse archers) to 67% (pikes). Slingers trouble heavy infantry (40%,
from 28): standing and shooting as it comes on, rather than walking into
it. Horse archers now beat levy less and lose to archers: they fall back
from foot archers too, out of their own shot, where before they rode in.

**The usual armies' league** (`usual.js league --seeds 4`, 6,080 battles,
32 a pairing):

| | Before | After |
|---|---|---|
| Range of factions | 40% (Kush) to 58% (Germania) | **40% (Sparta) to 58% (Germania)**; Kush 47% |
| Factions outside 35-65% | 0 | 0 |
| Pairings past 75/25 | 26 of 190 | 19 of 190 |
| Ended by the day, no winner | 15 | 70 |
| Player turns on average | 13.4 | 14.3 |
| Commanders taken (killed) | 1 in 34 (1 in 368) | 1 in 31 (1 in 358) |

No faction left 35-65%, so no usual army was re-picked.

**The random search** (`search.js --per 30`: 600 legal armies, each against
all twenty usual armies):

| | Before | After |
|---|---|---|
| Best army | 3 professional spears, medium armour (Carthage): 93% | 3 professionals with clubs, medium armour (Carthage), and Parthia's 3 professional spears in medium armour: 88% |
| Over 70% / under 20% | 63 / 154 of 600 | 47 / 154 |
| Best army of missile troops only | 8 levy archers (Carthage): 81%; then 6 levy slingers 71%, Rome's 3 professional slingers 66% | the same army: 81%; then Rome's 3 professional slingers 72%, Macedon's 3 professional archers 69% |
| Mean win: no missile troops / some / over half missile | 40 / 33 / 31% | 38 / 34 / 34% |
| Armies with horse archers (85), mean | 33% | 34% |
| Kush's 30 armies, mean | 8% | 11% |

**Rounds** (one change at a time; `classics.js both --seeds 1`, 72 battles a
cell, so a cell moves 5 to 8 points by chance alone; heavy infantry against
the other kinds, and the "All" of the missile kinds):

| Round | Change | Heavy v kinds | Slingers / archers / horse archers | Kept |
|---|---|---|---|---|
| 0 | main | 68% | 52 / 35 / 36% | |
| 1 | Fire and retreat; fall back only from men whose march yours beats (reading a) | 64% | 59 / 37 / 37% | yes |
| 2 | ... from any enemy about to reach it (reading b) | 66% | 43 / **26** / 41%; 109 of the archers' 320 battles against the usual armies ended by the day | no |
| 3 | Fall back at the enemy's reach, not a tile beyond it (`WARY` 0) | 64% | 59 / 38 / 34% | yes, after the soak (below) |
| 4 | The computer's foot missile troops do not press a near enemy | 65% | 54 / 37 / 37% (slingers v heavy 42 -> 33%) | no: pressing kept |
| 5 | They press only in light armour or none | 64% | the same (no classic army has missile troops in mail) | no: simpler to press with all |
| 6 | The computer presses with horse archers too | 64% | 59 / 34 / **41%**; horse archers' battles ended by the day 12 -> 32 of 320 | no (offered below) |
| 7 | The other reading: horse archers do not shoot on the move either | 64% | 59 / 37 / 36% | no (measured for Zach) |

Round 3 was taken for the soak, not for the numbers: with one tile of
margin, horse archers shooting at men who held their ground walked in and
out of that margin for ever, and one battle in the soak (Parthia's light
horse against a Persian sword unit) never ended. At 0 every battle ends.

**Checked after.** `npm run soak`: every battle ended; hotseat games 13.4
-> 16.3 player turns on average, the computer's side 18.9 -> 19.5, faction
armies 17.5 -> 19.2. `npm run balance`: the same, line for line (no
missile troops in its duels). The Commander's odds: below.

### Kush's Golden Bows: a sword

Zach asked "They don't hit hard from range?" They do not. A volley's men
felled depend on the bow and the number of men, not on how good the men
are, so the Golden Bows (80 men, the professional war bow, reach 9 tiles)
shoot exactly as any professional bowmen do, with a fifth fewer men. One
volley at close range, against men with no shield (`ranged.volley`):

| Unit | Men | Weapon | Reach | v light | v medium | v heavy |
|---|---|---|---|---|---|---|
| Kush, Golden Bows (elite) | 80 | war bow | 9 | 4.3 | 2.6 | 1.1 |
| Mongolia, Eternal Sky Riders (elite, horse, riding) | 100 | war bow | 9 | 3.2 | 1.9 | 0.9 |
| Maurya, bowmen (professional) | 100 | war bow | 9 | 5.3 | 3.2 | 1.4 |
| Persia, archers (professional) | 100 | recurve bow | 8 | 6.4 | 4.0 | 2.0 |
| any levy slingers | 100 | sling | 8 | 6.0 | 3.2 | 1.8 |
| Han, crossbows (professional) | 100 | crossbow | 6 | 9.3 | 8.3 | 6.8 |

Their only edge is reach. Hand to hand they fought, like every missile
unit, with a knife (`MISSILES.SIDEARM`, daggers: effectiveness 0.70 / 0.30 /
0.15 against light, medium and heavy armour).

Now an elite may carry a **sidearm of its own** (`sidearm`, a key of
`WEAPONS`, in `src/data/factions.js`), a hand weapon its culture may field;
the builder still sells no second weapon. The Golden Bows carry the
standard sword (Kush has no sword of its own in the builder): attack 13
hand to hand, not 11. The army screen lists it: "elite, war bow and sword,
light armour, no shield, on foot".

Measured (fire and retreat in both; 160 battles each army against the
twenty usual armies):

| | Knife | Sword |
|---|---|---|
| Kush in the league (`usual.js league --seeds 4`) | 39% | 47% |
| Kush's usual army against the field | 39% | 43% |
| Kush's 30 random armies from the search: mean / median / best | 9 / 4 / 53% | 11 / 8 / 59% |
| bought-league's kinds: levy / slingers / veterans / horse | 3 / 26 / 0 / 1% | 4 / 29 / 3 / 5% |

The sword lifts Kush's usual army off the bottom; an army Kush buys is
still among the worst drawn. The reason is the elite itself: it is free
and a third of a small army, and where Rome's or Carthage's is 80 or 100 men in
plate, Kush's is 80 men with bows and no armour beyond leather. Two
veteran sword units in mail with the Golden Bows win 3%; the same with the
Praetorians (Rome's veterans, bought the same way) won 9 of 16 in a probe.

### The Commander's odds

A player who sends everyone in (`captive-league.js --battles 2000 --policy
wait`): taken in 1 battle in **19.0** (main 23.5; the skirmish proposal
16.7). With the computer on both sides (the league): taken 1 in 31, killed
1 in 358 (main 34 and 368). The odds were set on November 23 at "about 1
battle in 19" for such a player, so fire and retreat leaves them where they
were set, and `tables.COMMANDER` is not retuned. (The sword did not move
them: 1 in 19.0 with the knife too.)

### What is still out of line

- **Heavy infantry 72% and pikes 74%** against the usual armies (target
  70); against the other kinds 65 and 67%. Fire and retreat does less than
  the proposal (heavy 70% and 61% there), as it must: with no kit speed and
  no chase, foot cannot keep away from foot.
- **Horse archers** 33% against the usual armies and 37% against the
  kinds: where they were. Rome's and Han's (full-price militia, basic bow)
  win 12 to 17%. They can keep their distance now, but their bow fells a
  man or less in heavy armour a volley (about 0.3 for 60 men riding).
- **Archers** 40% and 38%: better than before, and still beaten 85 to 15
  by slingers.
- **The day's end** now ends more battles: horse archers 56 of their 320
  against the usual armies (17 before), heavy infantry 54 (26). They are
  no win for anyone; a side that shoots and stands off can make a day end
  where it would have lost.
- **Professionals in medium armour** are still the best army (88%, the search above).
- **Kush**: its usual army is no longer last in the league, but almost
  any army it buys still loses (above).

### Levers that fit the ruling (each measured once; none taken)

Zach's direction: "the balance needs to come from the units themselves and
the combination of weapons and armor"; "some units should be best but can
then cost more"; "grounding in history".

1. **The computer presses with its horse archers** (round 6): horse
   archers 37 -> 41% against the kinds, Rome's 19 -> 33% against the
   usual armies. The cost: twice the battles they are in run to the day's
   end.
2. **Medium armour at 3 SP** ("Maybe"): three professionals with the basic
   spear in medium armour (the best army drawn, 92% in `try.js`) cost 33
   and can no longer be bought; the nearest legal army (two professionals
   and a militia unit, all in medium armour) wins 86%, and the same three
   professionals in light armour 73%. It trims the top; it does not touch
   heavy infantry or pikes.
3. **Heavy armour dearer** does not bite on its own: at 5 to 7 SP a
   heavy-infantry army still buys two units (13 to 15 SP each of a 30
   budget). Only 8 SP would cut it to one. Not measured.
4. **Better archers shoot better.** Today a volley depends on the bow
   and the number of men alone; a professional or elite archer kills no
   more than a levy one with the same bow. Training counting in the volley
   (as it does hand to hand) would give the Golden Bows and Mongolia's
   riders their reputation. Not built or measured: it is a new rule.
5. **A Kush elite in armour or with more men** (the doc's "Forgers of
   Meroe"): the elite is a third of a Kush army, and it is the weakest
   elite of the twenty. Not measured.

### Questions for Zach

1. **Horse archers on the move** were left as they were: they shoot as
   they ride. If "No firing on the move" meant them too, they win 36%
   against the kinds rather than 37% (round 7) and would deserve their
   men back (`HORSE_ARCHER_NUMBERS`).
2. **Should the computer press with its horse archers** (lever 1)? They
   do better, and more battles end with the day.
3. **Medium armour at 3** (lever 2): it trims the best armies by 6 points.
4. **Kush**: arm its elite better (armour, or more men), or leave an army
   that must be bought around it?
5. **Better archers shoot better** (lever 4): a new rule; worth building?

### Where it is

Branch `worktree-agent-a9bc961a7e9bb7e73`, on the skirmish proposal and
main `d7622ab`: `62384fe` and `a84fef2` (fire and retreat), `16c0c0f`
(the sword), `00a1338` (`WARY` 0, the soak), and this report.

## Part 8. Second weapons (built 2026-11-24)

Since Recommendation A a sidearm or a thrown weapon "is carried beside
another weapon, not alone", and none was sold: every missile unit fought
hand to hand with a knife, and javelin men had no javelins. Built inside
Zach's rulings of November 23 ("The balance needs to come from the units
themselves and the combination of weapons and armor ... Some units should
be best but can then cost more. It should have a grounding in history")
and November 24 ("No firing on the move"; the Golden Bows' sword).

### The rule, in plain words

- **One more weapon.** A unit may take one second weapon beside its main
  one, never a third, at the second weapon's price: light javelins,
  plumbatae and throwing axes 1 supply point; heavy javelins, pila and
  throwing spears 2; a sword at a bowman's belt 1. Culture, training and
  horse rules apply as to any weapon (pila are Rome's, for professionals,
  on foot).
- **Which**, by the weapon data's own stacking:
  - **javelins and the like** (light and heavy javelins, throwing spears,
    pila, plumbatae, throwing axes) beside a **one-handed hand weapon**: a
    sword, spear, axe, mace or club. Not beside a bow or sling, nor a
    two-handed weapon;
  - **a sword** (the sword, gladius, xiphos, dao, longsword, akinakes)
    beside a **bow, sling or crossbow**, on foot or on horse.
  Daggers, the pugio and the sickle are not sold: every missile unit has
  its knife already. Javelins are never the main weapon.
- **Javelins in battle.** A unit with javelins throws them once as it comes
  to blows with an enemy, whether it closed or was closed on, and then
  fights hand to hand. The throw is a volley as any other is reckoned (the
  weapon, its bite on the enemy's armour, his shield; the men felled shake
  him as a volley does), half as heavy again: every man throws, at a few
  paces (`THROWN.CLOSE` 1.5). A unit has two throws in a battle
  (`THROWN.THROWS`: a legionary's two pila); with none left it closes
  without throwing. Javelins do not shoot from a distance.
- **No firing on the move.** The throw is part of the charge, so men on
  foot who marched to contact throw (my reading; the other, that they must
  stand a tick, would leave javelins to the side that is charged).
- **A sword for men who shoot.** A missile unit with a sword fights hand
  to hand with it, not the knife: the Golden Bows' rule of November 24,
  for anyone who pays.
- **Told.** On the army screen a second weapon is one more choice after
  the weapon, showing only the kind the weapon takes ("A second weapon: to
  throw as they close", or "a sword, to fight hand to hand"), each priced,
  "none" first; a second weapon the new weapon will not take is put down.
  Kit reads "professionals, gladius and pila, medium armour, heavy shield,
  on foot". The dispatch: "Legionaries: threw their pila at enemy spears,
  felling 9 men; fought enemy spears ..."; the other side hears "Spears:
  met pila from enemy legionaries, losing 9 men". No new orders.
- **Saved things.** Armies, rosters, captured units and battles saved
  before have no second weapon, and load and play as they did.
- **The elites.** The Peltast Guard and the Blue Men (javelins alone
  until now) carry the sword with heavy javelins; the Sacred Spring
  Warriors heavy javelins beside the gladius; the Praetorians pila; the
  Golden Bows' sword is now their second weapon.
- **The usual armies** where the history is a second weapon: Rome's
  legionaries pila and its velites light javelins (the hastati in light
  armour to pay for them); Macedon's peltasts, Thrace's spearmen and
  Carthage's Numidian horse light javelins; Germania's axemen throwing
  axes.

The code: `army/builder.js` (`secondKind`, `secondFields`, `secondPrice`,
the rules in `buildUnit`), `army/data.js` (`sidearm`, `secondSp`),
`battle/battle.js` ("The throw at contact"), `combat/ranged.js`
(`thrownVolley`), `tables.THROWN`, `world.js` (`thrown`, `throws`), the
`thrown` event, `web/armies.js` and `public/app.js` (the screen).

### Measured

As in Parts 5 to 7: the computer's planner on both sides, all four maps,
both ways round, every battle its own seed; a battle the day ends is no
win. "Before" is `integration-14` (main with the computer's Commanders).

**Are they worth what they cost?** Armies of about the same supply, with
second weapons and with the points spent otherwise, against the twenty
usual armies (`try.js --seeds 1`, 160 battles each, so a row moves 4 to 8
points by chance; at `--seeds 3`, 480):

| Army (Rome unless named) | SP | Win | The same points spent otherwise | SP | Win |
|---|---|---|---|---|---|
| 2 professional swordsmen with pila, mail, heavy shields | 30 | 85% | the same without pila, and a unit of levy spears | 30 | 85% |
| | | | the same without pila, in heavy armour | 30 | 78% |
| 6 levy spears with light javelins | 30 | 49% | 7 levy spears | 28 | 49% |
| 3 Germanic axemen with throwing axes, and a unit of levy spears | 28 | 59% | 4 axemen | 28 | 74% |
| 5 levy slingers with swords | 30 | 73% | 6 levy slingers | 30 | 69% |
| 6 levy archers with swords | 30 | 68% | 7 levy archers | 28 | 51% |
| 3 Parthian horse archers with swords (480 battles) | 30 | 85% | 3 without | 27 | 75% |
| 2 professional spears with throwing spears (at 1 SP), militia archers with swords (480) | 29 | 93% | with light javelins | 29 | 88% |
| | | | with no javelins | 27 | 86% |

**Rounds** (one change at a time):

| Round | Change | League: Rome, Samnium (before 53, 45) | Pila / spent otherwise | Levy javelins / spears | Kept |
|---|---|---|---|---|---|
| 0 | The throw at twice a volley (`CLOSE` 2); swords 2 SP | 70%, 57%: Rome out of the band | 88 / 84% | 54 / 48% | no |
| 1 | `CLOSE` 1 | 58%, 50% | 78 / 84% | 39 / 45% | no |
| 2 | `CLOSE` 1.5 | 64%, 52% | 85 / 85% | 49 / 49% | yes |
| 3 | A sword beside a bow or sling 1 SP, not 2 | (no usual army buys one) | slingers with swords 51 -> 73% (six without 69%); archers 44 -> 68% (seven without 51%) | | yes |
| 4 | Throwing spears 1 -> 2 SP | | the search's armies over 70%: 59 -> 47 of 600; its best 93% -> 92-93% (other armies) | | yes |

At round 0 the swords lost to more missile troops (four levy slingers with
swords 54% to six without 69%; five archers with swords 46% to seven
without 57%): a sword was not a real choice.

**The usual armies' league** (`usual.js league --seeds 4`, 6,080 battles,
32 a pairing):

| Faction | Before | After | | Faction | Before | After |
|---|---|---|---|---|---|---|
| Germania | 61% | 64% | | Silla | 49% | 48% |
| Rome | 53% | **64%** | | Sarmatia | 48% | 48% |
| Macedon | 55% | 56% | | Tibet | 48% | 47% |
| Mongolia | 55% | 55% | | Carthage | 48% | 48% |
| Thrace | 54% | 55% | | Yayoi | 47% | 46% |
| Samnium | 45% | **52%** | | Berbers | 46% | 49% |
| Celts | 52% | 51% | | Kush | 46% | 44% |
| Bactria | 52% | 50% | | Parthia | 46% | 42% |
| Persia | 52% | 50% | | Maurya | 45% | 43% |
| | | | | Han | 44% | 40% |
| | | | | Sparta | 41% | 39% |

Every faction between 35 and 65%, before and after, so no usual army was
re-picked. Pairings past 75/25: 25 of 190 before, 30 after. Ended by the
day: 64 before, 62 after; 14.0 player turns on average, both. Commanders
taken 1 in 32 before, 1 in 31 after; killed 1 in 392 and 1 in 338.

**The random search** (`search.js --per 30`: 600 legal armies, each against
all twenty usual armies; now drawn with second weapons too, 487 of the 600
carrying one; the ten best and ten worst again at 96 battles). The search
of "before" was not rerun on this base (forty minutes a run); its column
is Part 7's:

| | Before (Part 7) | After round 3 | After round 4 (final) |
|---|---|---|---|
| Best army (96 battles) | 3 professional clubmen, medium armour (Carthage): 88% | 2 professional spear units with throwing spears, militia archers with swords (Rome): 93% | 2 professional axe units in heavy armour with heavy javelins (Macedon): 93%; the same with throwing spears (Carthage, 32 SP): 92%; 3 professional spear units in medium armour, no second weapon (Maurya): 92% |
| Over 70% / under 20% | 47 / 154 | 59 / 146 | 47 / 166 |
| Mean win: armies with a second weapon / without | - | 38% (470) / 35% (130) | 36% (487) / 37% (113) |
| Mean win: with a missile unit carrying a sword / with javelins | - | 37% / 38% | 37% / 36% |

The 88% of Part 7 was the best of that draw, not the ceiling: Maurya's three
professional spear units in medium armour, no second weapon, win 90% on
this base before second weapons and 89% after (`try.js --seeds 3`, 480
battles); Macedon's two professional axe units in heavy armour 87% before
and 86% after, and **92%** with heavy javelins (30 SP, the 4 points their
budget had left over). So second weapons lift the very top by two or three
points, by filling the last points of a two-unit heavy army.

**The Commander's odds** (`captive-league.js --battles 2000 --policy
wait`): taken in 1 battle in 19.0 (main 18.9). Not retuned.

**Checked.** `npm run balance`: the same, line for line (no duel
archetype carries a second weapon). `npm run soak`: every battle ended.

### What is still out of line

- **The best armies** are 92-93% against the usual armies (target: not
  above Part 7's 88%; the ceiling before was really about 90%). Two
  professional units in heavy armour with 2-SP javelins (heavy javelins,
  throwing spears) beside the axe or spear. Round 4 (throwing spears
  dearer) thinned the strong armies but did not lower the top; a fifth
  round (heavy javelins dearer) would only price that army out of its own
  budget, and was not tried. Rounds 0 and 1 did not help; I stopped at
  four, as the top is mostly what Part 5 left (professionals in armour).
- **Throwing axes** are a poor buy (three axe units with them and a levy
  unit 59%, four axe units 74%): at 1 SP they bite less than light
  javelins on armour. Left as the data has them: Germania's usual army
  carries them and wins 64%.
- **A sword is worth more to archers than to slingers** (archers 51 ->
  68%, slingers 69 -> 73%), and horse archers with a sword (Parthia's three
  professional units) win 85% where without it 75%: horse archers are no
  longer the weak kind, at least as bought by a horse people. Not the best
  buy; watch it.
- **Rome and Germania** are at 64% in the league, the top of the band.
- **Whole-battle fingerprints** with Rome's usual army changed, as they
  must (retaken, old values in their headers). A battle saved before
  replays its own spec, which carries no second weapon, so it plays as it
  was played.

### Where it is

This worktree's branch, on `integration-14`: the rule, the builder, the
screen and the words; the usual armies, the throw at 1.5 and the sidearm's
price; throwing spears at 2 and this report.

## Part 9. Each people's perks (built 2026-11-24)

Zach's factions document (`docs/Context/final_20_cultures_complete.txt`)
gives every people "Cultural Perks", "Cultural Restrictions" and an
"Adaptation Perk". Asked for as a roadmap piece, with the details mine to
decide; built inside the rulings of November 23 ("The balance needs to come
from the units themselves ... It should have a grounding in history").

### What a player meets

- **Where he chooses his faction, and on the army screen**, each of his
  people's perks in a line: "**Woodsmen:** your men cross woods as easily as
  open ground." The words are `words.js`, `PERK_WORDS`.
- **In battle** the perks act on their own; nothing new to order. They are
  not told in the dispatch (the cheap way to tell them would be a line each
  time one acts, and most act every round).
- **When he buys an army**, a restriction refuses it as the builder's other
  refusals do: on the screen the choice is struck through and tapping it
  says why ("Sarmatia fights on horseback: no foot"); a rule on the army as
  a whole ("Rome fights with heavy foot: at least half of the army must be
  foot with hand weapons in medium or heavy armour (it has 1 of 3, the elite
  counted)") is said of the army, and it cannot be kept until it is met.
- **An army he bought before** keeps its units, and musters and marches as
  it did. The rules hold the next time he changes it.

| Faction | The perk he meets in battle or at the muster | Restrictions on the army he buys |
|---|---|---|
| Rome | Discipline: his men hold their nerve a little longer | half the army heavy foot |
| Macedon | Veterans of war: the Silver Shields fight as seasoned men from their first battle | no levy or militia |
| Sparta | To the last man: his men break later than others; the perioeci: his levy and militia fight as seasoned men | no veteran mercenaries |
| Carthage | Merchant wealth: 32 supply points, where most have 30 (true before) | at most two units of professionals or veteran mercenaries |
| Kush | Men of the hot lands: his men tire more slowly in a fight; bow and horse: his bowmen and slingers shoot harder with his horse beside them | no heavy armour |
| Berbers | Small bands: his men fight harder against a bigger unit; and, against him, woods and marsh slow his men more | |
| Sarmatia | Feigned retreat: his horse break off a fight with little harm | no foot |
| Han | Many hands: every unit he buys comes a fifth larger; crossbows his alone (true before) | |
| Maurya | Wootz steel: his blades bite through a tenth of the enemy's armour | foot, shooters and horse all in the army |
| Silla | Mountain fighters: on a hill his men fight harder and stand firmer | (25 supply points, true before) |
| Persia | Surgeons: of the men who would fall, one in twenty is saved | |
| Parthia | Horse of the plains: his horse fight harder on open ground, and more of their charge breaks into a wall of spears; the Parthian shot: his horse archers shoot as hard riding as standing | 10 supply points on levy; half the army on horses |
| Germania | Woodsmen: his men cross woods as easily as open ground | |
| Thrace | Hill men: on a hill his men stand firmer; the rhomphaia his alone (true before) | no veteran mercenaries; nothing above light armour and light shields |
| Samnium | Hill and forest fighters: his men fight harder on hills and in woods; Samnite courage: his men break later, his elite later still | (26 supply points, true before) |
| Tibet | Homeland militia: his militia fight as seasoned men; hired swords: veteran mercenaries cost him 7, not 9 | (25 supply points, true before) |
| Mongolia | The Parthian shot: his horse archers shoot as hard riding as standing | no foot |
| Celts | Woodsmen: woods as easily as open ground; fury: an enemy he catches by surprise is shaken half as much again | no bowmen or slingers of professional training or better |
| Bactria | Noble horse: his horse fight harder against an enemy already in a fight | heavy foot no more than 30% of the army |
| Yayoi | Bow and spear: his archers shoot harder with his spearmen beside them; quick to dig in: men who stand to meet the enemy are harder to break into | at most one unit of horse; no heavy armour |

### Every perk and restriction, sorted

"True" is true of the game already; "built" is built here (the numbers are
`tables.PERKS`); "left out" needs something the game has not got, or was
left out for the reason given. No adaptation perk is built (below).

| Faction | Doc | Kind | What became of it |
|---|---|---|---|
| Rome | Engineering mastery: field fortifications | perk | left out: no fortifications or siege |
| Rome | Professional discipline: higher morale | perk | built: morale resistance +0.02 (`discipline`) |
| Rome | Heavy infantry at least 50% | restriction | built (`heavyFoot`), the elite counted |
| Rome | Units without officers lose heart faster | restriction | left out: in a first campaign every unit but the elite has no officer, so it would fall on a new Roman player's whole army |
| Macedon | Silver Shields start as 10-battle veterans | perk | built: veterancy 10, seasoned (`old_soldiers`) |
| Macedon | Sarissa or spear as the day demands | perk | left out: no changing weapons in battle |
| Macedon | No militia | restriction | built: no levy or militia (`noQuality`) |
| Macedon | Higher unit costs | restriction | left out: the usual army (28 of 30, three units) would go over its budget |
| Sparta | Fight to the last man, until 50% casualties | perk | built as men who break later: the rout line 15, not 25 (`last_man`). Read literally (no break until half are down) Sparta won 97% (round 1) |
| Sparta | Perioeci fight better than militia | perk | built: levy and militia fight as seasoned men (`perioeci`) |
| Sparta | Allied Greek recruitment | perk | left out: no allies |
| Sparta | No mercenaries | restriction | built: no veteran mercenaries |
| Sparta | Supply staff +2 SP | restriction | left out: no supply staff |
| Carthage | War elephants | perk | left out: no elephants |
| Carthage | Merchant wealth, 32 SP | perk | true |
| Carthage | At most 2 SP (200 men) of professionals | restriction | built: at most two units of professionals or veteran mercenaries (`mostOfQuality`) |
| Carthage | Hired units retreat first | restriction | left out: no hired units as such |
| Kush | Desert mastery: movement and heat resistance | perk | no desert or heat; built as the nearest honest thing, men who tire more slowly: wind spent fighting x0.75 (`sun_hardened`) |
| Kush | Archer-cavalry coordination within a tile | perk | built: a missile unit with its own horse within a tile shoots x1.25 (`bow_and_horse`). The usual army has no horse, so it acts only in an army a player buys with some |
| Kush | No large heavy infantry formations | restriction | built: no heavy armour (`noArmor`) |
| Berbers | Desert navigation | perk | left out: no desert |
| Berbers | Small unit effectiveness | perk | built: +0.5 attack against a unit with more men (`small_bands`) |
| Berbers | Slowed in forest and swamp | restriction | built: woods and marsh cost half as much again to cross (`dense_ground`) |
| Sarmatia | Switch between lance and bow | perk | left out: no changing weapons; a bow beside a lance is not sold (part 8) |
| Sarmatia | Feigned retreat | perk | built as the nearest thing: its horse take the parting blow at half weight as they leave a fight (`feigned_retreat`) |
| Sarmatia | No foot; at least 70% mounted | restriction | built: no foot (`noFoot`), which is both |
| Han | Crossbows | perk | true (crossbows are Han's alone); cloud ladders and catapults left out (siege) |
| Han | Units 20% larger | perk | built: bought units x1.2 men (`larger_units`) |
| Han | +2 SP for administrators; lost administrators | restriction | left out: no support staff |
| Maurya | War elephants | perk | left out: no elephants |
| Maurya | Wootz steel: ignores 10% of armour | perk | built: the enemy keeps 0.9 of his armour's defence (`wootz`), for every unit, free (the doc's "expensive upgrade" read as the people's steel) |
| Maurya | May not pursue the routed | restriction | left out: an engine rule against a faction already near the bottom (43%) |
| Maurya | At least three unit types | restriction | built: foot, shooters and horse all in the army, the elite counted (`kinds`) |
| Silla | Military academy: veteran leadership from the first battle | perk | left out: it would change how officers come forward in a campaign (`command/company.js`) |
| Silla | Hill and mountain bonuses | perk | built: on a hill +0.5 attack, +0.5 defence (`mountain_warfare`) |
| Silla | 25 SP | restriction | true |
| Silla | 10 SP for allies only | restriction | left out: no allies |
| Persia | Supply train replaced | perk | left out: no supply train |
| Persia | Superior support staff (medical) | perk | built as the nearest thing: of the men a blow would fell, 0.05 saved (`surgeons`); siege engineers left out |
| Persia | Satrap command dependency; no reorganising | restriction | left out: no satraps, no reorganising |
| Parthia | Heavy cavalry plains mastery: break defensive lines, attack on plains | perk | built: horse +0.5 attack on open ground, and half a charge's spike lives through braced spears, not 0.15 (`plains_horse`) |
| Parthia | Parthian shot at full effectiveness | perk | built: horse archers lose nothing for shooting on the move (`parthian_shot`) |
| Parthia | At least 10 SP of levy; at least half horsemen | restriction | built (`levySp`, `horse`) |
| Germania | Comitatus: the warband never breaks | perk | buildable (the lower rout line); left out: Germania is at the top of the league (62 to 64%), and the strong get their gentler perk |
| Germania | Forest mobility | perk | built: woods at the cost of open ground (`woodland`) |
| Germania | Heroes from the ranks | perk | left out: no champions |
| Germania | No siege engineers; no complex formations | restriction | left out: neither exists |
| Thrace | Rhomphaia for any foot | perk | true |
| Thrace | Hill defence | perk | built: on a hill +1 defence (`hill_defence`) |
| Thrace | Veterans from the start | perk | buildable (as Macedon's); left out: Thrace is above the middle (55%), and has the hill |
| Thrace | No mercenaries; no heavy kit | restriction | built: no veteran mercenaries; nothing above light armour and light shields (`lightKit`) |
| Samnium | Guerrilla: attack and stealth in hills and woods | perk | built: +0.5 attack on hills and in woods (`guerrilla`); stealth left out |
| Samnium | Bravery: break at 30%, the elite at 40% | perk | built as men who break later: rout line 22, the elite 20 (`samnite_bravery`) |
| Samnium | 26 SP; no siege engineers | restriction | true; left out (no siege) |
| Tibet | Roof of the World: no cold or mountain penalties | perk | left out: no cold or altitude |
| Tibet | Militia fight as veterans | perk | built: militia fight as seasoned men (`militia_veterans`) |
| Tibet | 25 SP | restriction | true |
| Tibet | Mercenaries 25% cheaper | restriction (a perk) | built: veteran mercenaries 7 SP, not 9 (`cheap_mercenaries`) |
| Mongolia | Horse archery perfection | perk | built (`parthian_shot`) |
| Mongolia | Nomadic endurance | perk | left out: no supply |
| Mongolia | 100-man elite, other units 20% larger | perk | the elite of 100 is true; the larger units buildable (Han has them), left out: Mongolia is above the middle (54 to 55%) |
| Mongolia | No baggage train | restriction | left out: none exists |
| Mongolia | 100% mounted | restriction | built: no foot |
| Celts | Berserker fury: ambushes cause fear | perk | built: their surprise shakes x1.5 (`berserker`) |
| Celts | Light troops better flanking and ambushing | perk | left out: the Celts have two perks already |
| Celts | Woodland mobility | perk | built: woods at the cost of open ground (`woodland`); "rough" ground left out |
| Celts | No mercy to prisoners | restriction | left out: no prisoners to spare |
| Celts | No professional archers | restriction | built: no bowmen or slingers of professional training or better (`noTrainedShooters`) |
| Bactria | Fusion army as professionals | perk | partly true (sarissa and kontos); elephants and horse archers left out |
| Bactria | Noble cavalry on the flanks | perk | built: horse +0.5 attack on an enemy already fighting another unit (`noble_cavalry`) |
| Bactria | Heavy infantry at most 30% | restriction | built (`heavyFoot`), the elite counted |
| Bactria | Long supply lines | restriction | left out: no supply |
| Yayoi | Archer-spear mastery | perk | built: archers with their own spearmen within a tile shoot x1.25 (`bow_and_spear`) |
| Yayoi | Rapid fortification | perk | built as the nearest thing: men who held their ground to meet the enemy +0.5 defence (`rapid_fortification`) |
| Yayoi | At most one cavalry unit | restriction | built (`mostHorse`) |
| Yayoi | Light and medium armour only | restriction | built: no heavy armour |

**Adaptation perks: none built.** Each takes something from a beaten
people, so each needs the campaign to know whom a Commander beat and what
he took. What each would need:
- Hire, recruit or take units from the beaten (Rome's auxiliaries, Macedon's
  companion cavalry, Sarmatia's one unit type a people, Han's assimilation,
  Parthia's feudal levies, Silla's allies, Tibet's sanctuary, Yayoi's
  cultural exchange, Celts' single combat): a new avenue in
  `web/roster.js` (`AVENUES`), beside capture, with what the beaten army
  was. The nearest to free; not done, as the lean was to leave them out.
- Take kit or kit rules from the beaten (Kush's forgers, Thrace's cultural
  crossroads, Samnium's battlefield kit, the Berbers' raiders, Maurya's
  gifts to the elite): a culture's permitted kit that grows with its
  record, per Commander.
- Learn tactics or heroes (Germania's champions, Bactria's synthesis,
  Mongolia's captured specialists, Persia's satrap troops, Carthage's
  mercenaries mid-battle): reinforcements, champions or support staff,
  none of which exist.

### The code

- `src/data/factions.js`: `perks` and `restrictions` on each faction.
- `engine/combat/tables.js`, `PERKS`: each perk's numbers and whom it is
  for, with where each came from.
- `engine/army/perks.js`: at the muster, each of the faction's own units
  gets the keys of its perks (`perks` on the unit; a unit taken from
  another people gets none), and bought units are raised larger where a
  perk says so. Both the usual army (`factions.js`) and a bought one
  (`standard.js`).
- `engine/combat/perks.js`: what each does in battle, read by
  `ratings.js` (morale, veterancy, attack and defence on its ground, armour
  bitten, the charge, wind), `resolve.js` (the rout line, surprise, men
  saved), `ranged.js` (shooting riding, archers beside their friends),
  `battle.js` (the parting blow), `movement/simultaneous.js` (woods and
  marsh). A unit with no perks gets 0 or 1 from each, so a battle with no
  faction armies (the balance duels, the scenarios) runs exactly as before.
- `engine/army/builder.js`: Tibet's mercenaries' price (`qualityCost`).
- `engine/army/restrictions.js`: the rules, checked by `web/armies.js`
  when an army is bought (`checkArmy`), and on each choice on the army
  screen (`appraise`). Not at the muster (`battles.js`, `musterArmies`).
- `words.js`, `PERK_WORDS`; `public/app.js` (`perkList`), `app.css`.

### Measured

As in Parts 5 to 8: the computer's planner on both sides, all four maps,
both ways round, every battle its own seed; a battle the day ends is no
win. "Before" is `integration-16`.

**Rounds** (`usual.js league --seeds 4`, 6,080 battles, 32 a pairing; each
round switches perks on with `--set factions.<key>.perks=`):

| Round | Change | Range | Pairings past 75/25 | Kept |
|---|---|---|---|---|
| 0 | none (`integration-16`) | Sparta 39% to Rome, Germania 64% | 30 | |
| 1 | The six weakest get their perks (Sparta, Han, Parthia, Maurya, Kush, Yayoi); Sparta does not break until half its men are down | Sparta **97%** | 46 | no |
| 2 | Sparta breaks at morale 15, not 25 | Kush 42% to Rome 63%; Sparta 55, Han 46, Maurya 45, Yayoi 45, Parthia 41 | 29 | yes |
| 3 | The middle eight get theirs | Kush, Parthia 42% to Rome 62%; Celts 51 -> 55, Tibet 48 | 31 | yes |
| 4 | The strong six get theirs: Rome's discipline 0.19, Samnium breaks at 20 (elite 15) | Parthia 39% to **Rome 73%**; Samnium 60 | 40 | no |
| 5 | Rome 0.05; Samnium 22 (elite 20); Kush tires slowly (x0.75); Parthia's horse +1 on the plain; Yayoi's archers x1.5 | Parthia 40% to Rome 65%; Samnium 55, Kush 47; Parthia and Yayoi no better | 35 | Rome, Samnium, Kush |
| 6 | Parthia's horse back to +0.5, and half the charge through braced spears; Yayoi back to x1.25 | Yayoi 42% to Rome 65%; Parthia 45 | 32 | yes |
| 7 | Yayoi dig in, +0.5 defence when they held their ground | Han, Yayoi, Maurya, Sarmatia, Parthia 44% to Rome 65% | 32 | yes |
| 8 | (Rome without its perk, to see) | Rome 62% | | |
| 9 | Rome's discipline 0.02 | **Han 44% to Rome 64%** | **31** | yes |

**The usual armies' league**, before and after:

| Faction | Before | After | | Faction | Before | After |
|---|---|---|---|---|---|---|
| Germania | 64% | 62% | | Sarmatia | 48% | 44% |
| Rome | 64% | 64% | | Silla | 48% | 45% |
| Macedon | 56% | 56% | | Tibet | 47% | 47% |
| Mongolia | 55% | 54% | | Yayoi | 46% | 44% |
| Thrace | 55% | 51% | | Kush | 44% | 46% |
| Samnium | 52% | 55% | | Maurya | 43% | 44% |
| Celts | 51% | 54% | | Parthia | 42% | 45% |
| Bactria | 50% | 45% | | Han | 40% | 44% |
| Persia | 50% | 45% | | Sparta | 39% | 50% |
| Berbers | 49% | 48% | | | | |
| Carthage | 48% | 47% | | | | |

Every faction between 35 and 65%, before and after; the band is narrower
(39-64 to 44-64). Pairings past 75/25: 30 of 190 before, 31 after. Ended by
the day: 62 before, 67 after; 14.0 player turns on average, both.
Commanders taken 1 in 31 before, 1 in 32 after; killed 1 in 338 and 1 in
329. No usual army was re-picked: every one keeps to its own restrictions.

**The random search** (`search.js --per 30`, 600 legal armies, now kept to
each people's restrictions, each against the twenty usual armies):

| | Before (part 8) | After |
|---|---|---|
| Best army (96 battles) | 2 professional axe units in heavy armour with heavy javelins (Macedon): 93%; the same with throwing spears (Carthage): 92% | the same Macedonian army: 92%; Maurya's 3 professional spear units in medium armour 91%; the Carthaginian 91% |
| Over 70% / under 20% | 47 / 166 of 600 | 45 / 170 |
| Mean win, by faction, lowest | | Kush 10%, Thrace 17%, Silla 18% (Thrace and Kush may no longer buy heavy kit) |

The best army did not rise; nor did the number of strong ones.

**The Commander's odds** (`captive-league.js --battles 2000 --policy
wait`): taken in 1 battle in 21.7 (92 of 2,000), where `integration-16`
gives 1 in 19.0 (105). Within what chance moves it (a few battles either
way), though steadier and seasoned elites (Macedon's, Sparta's line) may
take a little of it. `tables.COMMANDER` is not retuned.

**`npm run balance`**: the same, line for line, the mirror ladder
included. Its duels have no faction, so no unit carries a perk.

**`npm run soak`**: every battle ended, after one change outside the
perks. With the perks one battle of 480 with a cautious computer never
ended (Persia against Han on ravenridge, the player giving no orders): the
cautious Commander's crossbowmen, his only men fit to fight, marched to and
fro short of the enemy for ever. Part 7 has the computer's foot missile
troops press any enemy within 7 tiles; since the computer was given
character, they pressed within the Commander's own `engage`, 5 for a
cautious one, short of a crossbow's reach (6). Now within 7 at the least
(`opponent/planner.js`, one line): the battle ends, and in the character
league (`character-league.js --rounds 4`, 2,880 battles) the cautious
Commander wins 49% (48% before), steady 51% (52%), bold 50% (50%). The
usual armies' league and the search are played by the steady Commander,
whose `engage` is 7: untouched.

### What is still out of line

- **The middle sank a little**: the six that gained most (Sparta +11,
  Han, Parthia +3 or 4, Celts, Samnium +3) took it from the middle
  (Bactria, Persia -5, Sarmatia -4, Thrace -4). All are inside the band.
- **Some perks do little in the league** because the usual army does not
  use them: Kush's bow and horse (no horse), the Berbers' slowness in woods,
  Tibet's cheap mercenaries (none bought). They are for a player's army.
- **Morale is the strong lever.** A little morale resistance (Rome) or a
  lower rout line (Sparta, Samnium) moves a faction more than any
  attack or defence perk; they are set small for it.
- **A battle can stall at a ford** (found while retaking the fingerprints):
  two armies on either side of the ashford ford march up and down beside
  it and never cross. Not the perks' doing (it happens without them:
  Mongolia against Tibet on ashford, seed 77), and the day ends it in the
  app. For whoever owns the maps or the planner.

### Where it is

This worktree's branch, on `integration-16`.
