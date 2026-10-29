# Stage 3 Report

Branch `stage-3`, built on `main`. Date: 2026-10-28.
Plan: [`PLAN.md`](PLAN.md). Rulings: `docs/DECISIONS.md`, "Rulings and
direction, October 21, 2026 (after Stage 2)" and the hiding rulings of
October 22 and 28.

## Summary

How an army is deployed now matters.

- **Friends can share ground.** Units crowd onto one tile instead of
  queuing in single file, and pay for it by the earlier build's density
  table: slower, weaker in a fight, and at the worst, losing heart.
- **Sight follows the ground.** Woods hide what is in them and block sight
  through them; from a wood's edge a unit sees out while others cannot see
  in. A hill between two units blocks the view unless one stands on high
  ground.
- **Fighting is a choice.** Two units side by side fight only if one of them
  is looking for a fight. A column can march past an enemy that lets it.
- **Marching carefully** is half speed, and a unit on guard cannot be
  surprised. One caught marching by an enemy it never saw is.
- **Hiding and searching.** A unit can hide almost anywhere; the engine's
  table decides how well (woods and marsh: only a search finds it). A
  search takes a turn and finds what the searcher could see.
- **Ambushes, ordered by the player:** "spears hide in the woods and hit
  anything that passes", "let two pass", "ambush the cavalry", "whatever
  happens". By default an ambush springs only on a unit marching.
- **Objectives:** a grid square or a named feature to hold; an hour of
  holding everything wins; at the time limit, more objectives wins.
- **Words in, words out.** The order reader understands all of it, without
  the AI too. The read-back quotes the engine's own hiding table ("in the
  woods: hidden from anyone who does not search"). Reports keep secrets.
- **Tests:** 394 pass (332 before), plus `test:core`, and the new
  `npm run soak`.

## Steps

| Commit | What |
|---|---|
| plan (merged as #8) | rulings of Oct 22 and 28 and this plan |
| step 2 | crowding: friends share tiles, with the density table's penalties |
| step 3 | line of sight with woods and hills (`engine/map/sight.js`) |
| step 4 | stances, choosing to fight, surprise; the attack order |
| step 5 | hiding and checking (`engine/battle/hiding.js`) |
| step 6 | ambushes |
| step 7 | objective control |
| step 8 | the new orders in words; reports that keep secrets |
| step 9 | an ambush on Crownhill end to end; `npm run soak` |

## What a player notices

In the hotseat CLI (`npm run play`):

- New orders: "archers hide in the woods", "scouts check the woods",
  "spears ambush in the woods", "spears hide in the woods and hit anything
  that passes, let two pass", "ambush the cavalry from the woods whatever
  happens", "spears attack the ford", "swords march carefully to C7",
  "everyone advance on guard".
- The read-back says how well a unit will hide before the turn runs.
- New report lines: AMBUSH!, SURPRISE, a unit going to ground, a search and
  what it found, a hidden unit breaking cover, ranks packed too tight,
  objectives changing hands.
- `--objective "Harrow Bridge" --objective C6` adds ground to hold; the
  briefing lists it.
- Solo play (`--auto blue`) reports only what the human side could know.
  The two-player screen leaves out both sides' hiding, searches and held
  ambushes, since both commanders read it.

## Rule changes (intended; listed so they can be reviewed)

- **Stacking** replaces one unit per tile. Two full 100-man units on a tile
  are already `compressed` (−2 attack and defense, −10% move): the table,
  quartered from 50 m to 25 m tiles, puts the threshold at about one unit.
  A tile holds at most 300 men. A lone unit is never crowded. Movement never
  drops below one tile of open ground, so a jam always unpicks.
- **Contact.** Only units looking for a fight (advance, attack, a side's
  standing advance, a sprung ambush) start one, and only against an enemy
  their side can see. Fights already under way continue while the two stay
  side by side. Only a unit looking for a fight stops when it meets an
  enemy; others walk on. A unit an enemy comes up beside during the turn
  stops and fights instead of walking out of contact (a bug Stage 2's fix
  missed; stacking exposed it).
- **Sight** in fog of war now follows the ground (it was plain range).
- **Surprise:** +2 attack in the first round and −10 morale to the one
  caught, when the attacker was unseen by its side as the turn began and the
  one caught was marching.
- **Objectives** hold for battle time (an hour), not player turns, unless a
  spec says otherwise. Fixed: holding one objective of two used to count as
  holding all.
- **A sprung ambush** presses the attack (it becomes advance).

Added after review (rulings of October 29):

- **Leaving a fight costs.** A unit breaking contact moves one tile less,
  and takes a parting blow: up to 8% of its men and 8 morale for levy at
  the worst chaos roll, scaled by the roll, by drill (elite 0.3 of that,
  professional 0.55) and halved for a careful withdrawal. New event
  `disengage`.
- **Lingering gives a hidden unit away:** with an enemy right beside it,
  the chance it is noticed is 25% the first turn, 50% the next, and so on.
- **The trap:** an ambush ordered to strike whatever happens also falls on
  an enemy that stands beside it.
- **Crowding** costs less movement: 0/10/25/50% (was 25/50/75/90%); the
  combat penalties stand.

## Effect on existing games

- `npm run soak` (300 hotseat games with silent commanders, six openings,
  both scenarios): all 300 end. On `main`, 26 never ended (fall back against
  advance). Average 6.8 player turns, against 8.2 on `main`.
- The closed-loop meeting battle reaches a verdict in 50 of 50 seeds, in
  5.2 battle turns on average (8.6 on `main`). Battles are shorter mostly
  because of stacking: more units reach the fight at once, and units caught
  between several enemies take the flanking penalty.
- Officer fates are still on target: 9.2% of wins and 20.0% of losses cost
  an officer killed (`npm run officers`, 200 battles).

## Test changes

- **Changed by stacking:** the movement tests' "no two units share a tile"
  check is now "enemies never share a tile, and no tile is over the cap".
  "Two units racing for one tile: the faster one takes it" is now "both get
  there and share it", plus a test for a full tile. Tests where a friend
  blocked a tile now use a 300-man friend, which fills it.
- **Changed by the contact rule:** tests that set two units side by side
  with no orders gave them nothing to fight about; the stronger side now has
  a standing advance (battle tests for push, rout, pursuit, flanking; one
  orders test; one orchestrator test). Their assertions are unchanged.
- **Moved by sight:** three fog-of-war tests that looked through the woods at
  H11-H12 now sit on open ground; assertions unchanged.
- **Replaced:** "the reply schema allows exactly the five actions" now
  checks the schema against the engine's own list of actions.
- **New:** crowding (3), contact and surprise (7), sight (9), hiding (10),
  ambush (6), leaving a fight, lingering and the trap (5), objectives (5), Stage 3 orders in words (7), narrator secrets
  (2), hotseat objectives (1), the road ambush on Crownhill (2), movement
  (5).

## Not done, or for later

- **All Stage 3 numbers are starting values:** the crowding table, the
  parting blow, the 25% a turn of lingering, surprise
  (+2, −10), the hiding table (seen within 50 m at a field's edge, 100 m in
  the open), the marsh's 5 stamina a turn, ambush reach of 1 tile, the hour
  to hold objectives, half speed for a careful march.
- **Ranged fire** does not exist, so bows hidden in a marsh are not yet
  weakened (the table records it).
- **Facing:** surprise stands in for a rear attack.
- **A pursuer does not keep up within the turn.** An advancing enemy that
  was fighting a unit which breaks off does not follow it in the same
  turn; it re-targets on the next. So a withdrawal usually gets clear, at
  the price of the parting blow.
- **Drill as intimidation** (Zach's Macedonian example) is noted for later.
- **Hiding "behind the ridge"** reads as "the ridge" (its crest). The
  reverse slope works through sight, but the order reader does not yet
  place a unit behind a hill.
- **Real Groq replies are still not recorded;** the new AI fields are tested
  with scripted replies.
- **Objective story:** Zach's.

## Proposed tag

After merge: `stage-3-complete`.
