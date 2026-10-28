# Stage 3 Plan: crowding, sight, hiding and ambush

Date: 2026-10-28. Rulings this plan rests on: `docs/DECISIONS.md`,
"Rulings and direction, October 21, 2026 (after Stage 2)" and the hiding
rulings of October 22 and 28.

## Goal

How an army is deployed starts to matter. Units can crowd onto the same
ground and pay for it. A column on the march can walk into a force hidden
in the woods and not know until it is hit. A careful commander sends a
scout to check the trees first, or marches on guard, and an ambush may then
not be worth springing. Two units next to each other fight only if one of
them means to.

The engine still decides every outcome. The AI reads the player's words
and fits them to what the engine knows, like a shape-sorter: a square block
goes in the square or the rectangle hole, never the triangle. Everything is
built and tested headless, through the hotseat CLI; the web app is Stage 4.

## Where things start

- **One unit per tile** (`movement/occupancy.js`). A unit blocked by a
  friend detours once per turn (Stage 2 fix).
- **Contact stops movement and always means a fight.** Any two enemy units
  that end up orthogonally next to each other fight
  (`battle.js`, `detectEngagements`).
- **Sight is plain range** (`orchestrator/fogOfWar.js`): 6 tiles, scouts 10,
  +4 on high ground. Woods and hills hide nothing. Sight only feeds the
  player's view; the battle itself ignores it.
- **No facing.** Combat knows how many enemies a unit faces (flank bonus),
  not which side they come from.
- **No ranged fire.** Weapons carry a range, but the engine has no shooting
  phase yet.
- **Victory:** a side wins when the other breaks, or, with the time limit,
  by fewer losses (PR #7).

## Workstreams

### A. Stacking (ruled direction; table from the earlier build)

1. Occupancy counts men per tile instead of units. Friendly units may share
   a tile; an enemy tile is still never entered.
2. Penalties by density, using the earlier build's table, quartered for
   25 m tiles:

   | Tier | Men on the tile | Penalty |
   |---|---|---|
   | organized | 0–100 | none |
   | crowded | 101–150 | −25% move, −1 combat |
   | compressed | 151–200 | −50% move, −2 combat |
   | crushing | 201–250 | −75% move, −3 combat |
   | critical | 251–300 | −90% move, −4 combat, −2 morale a turn |

   A tile never holds more than 300. A standard unit is about 100 men, so
   two units on a tile are already crowded: sharing is possible but costly.
3. The penalties go into combat as one more rating input, and into
   movement as reduced range. The event log records the tier when it
   changes, so the narrator can say "the ranks are packed too tight".
4. The Stage 2 detour rule stays only for a tile at the cap. Push-back into
   a friendly tile now crowds it instead of failing; a push into a full
   tile is a crush, as today.

### B. Line of sight (ruled October 22)

1. A sight line runs from tile to tile. It is blocked by:
   - **woods:** inside a forest a unit sees and is seen at 1 tile. A unit on
     the edge of a wood sees out at its normal range, but others see in
     only to that edge tile, and not beyond it;
   - **hills:** a hill between two units blocks the line unless one of them
     stands on it. This is what makes a reverse slope hide a unit.
2. Sight moves into the battle step, per side, each tick. The player's view
   (fog of war), contact, surprise and ambush all read the same answer.
   The fog module keeps its three tiers (visible, ghost, unknown).
3. Pure and deterministic, like the rest of the engine: no randomness in
   who sees whom. Chance enters in combat, not in sight.

### C. Posture and the choice to fight (ruled direction)

1. Every unit has a posture, set by its order:
   - **marching:** moving at full speed. Surprised if hit by an enemy it did
     not see.
   - **on guard:** moving carefully (half speed, "advance carefully",
     "march on guard") or holding. Not surprised.
   - **defending:** holding prepared ground (exists today).
   - **hidden:** see D.
2. **Who fights.** Two enemy units next to each other fight only if at least
   one of them is ordered to: advance, attack, an ambush springing, or a
   move whose target is the enemy. Otherwise they stand or pass. A unit
   ordered to move somewhere keeps moving past an enemy that does not
   attack it.
3. **Contact still stops a unit that is looking for a fight,** so the
   Stage 2 circling bug cannot come back: two units that both want to fight
   meet and fight.
4. **Surprise.** An attacker its target did not see at the start of the
   turn gets a surprise bonus in the first exchange: extra attack, and a
   morale shock to the target. The bonus is larger against a marching
   unit, and none against a unit on guard or defending. This stands in for
   "hitting the rear" until units have facing.

### D. Hiding and checking (ruled October 22 and 28)

1. **Hide** is an order. It takes a turn. After that the unit is hidden.
2. **How well it hides comes from a table** in the engine, by ground and
   unit:

   | Ground | Hidden from | Cost while hidden |
   |---|---|---|
   | woods | only units that check | none |
   | marsh | only units that check | stamina drain each turn; bow units weakened when ranged fire exists |
   | reverse slope of a hill | units that check, or come over the crest | none |
   | clearing, field edge by woods | units within 2 tiles | none |
   | open plain, road | units within 4 tiles | none |
   | river, ford, bridge | cannot hide | — |

   Cavalry and large units count as one row worse. The numbers are
   starting points, tuned in play.
3. **Moving or attacking reveals** a hidden unit (ruled).
4. **Check** is an order. It takes a turn (time passes), and finds hidden
   units the checking unit can see: inside a wood, that means 1 tile. A
   column can keep marching while a scout checks the woods beside it.
5. A hidden unit still sees by the normal sight rules, so a force hidden in
   a wood can miss an enemy creeping through the trees behind it (ruled).

### E. Ambush (ruled: the player orders it)

1. **Ambush** is an order to a hidden unit: "hold in the woods and hit
   anything that passes". It names what to hit (anything, or a kind, such
   as "the baggage" or "their archers"), and optionally to let some pass
   ("let the first two units pass").
2. When an enemy it sees comes within reach, the ambush springs: the unit
   attacks with surprise (C4) and is revealed.
3. **Whether it is worth it.** By default the ambush springs only on a unit
   that is marching. If the target is on guard or defending, the ambush
   holds and stays hidden, and the player is told why. The player can
   override this: "hit them whatever happens".
4. A spoiled ambush is possible: the ambushers are found by a check, or
   attacked while hidden.

### F. Objective control (direction, for testing)

1. A scenario may name objectives: a grid square, or a feature ("the
   bridge", "the crest of the ridge").
2. A side holds an objective when it has units on it and the enemy has
   none.
3. Winning by objectives: hold all objectives for a set time (default 60
   battle minutes). When the time limit runs out, the side holding more
   objectives wins. If they hold the same number, fewer losses decides, as
   now.
4. The story reason (what the bridge is worth) is left open for Zach. The
   engine needs only the rule.

### G. Words in, words out

1. The order grammar and the AI reader learn the new orders: hide, check,
   ambush (with "let N pass" and "whatever happens"), march carefully or on
   guard, avoid contact.
2. **The shape-sorter rule.** For "hide in the reeds" or "behind the burning
   farmhouse", the AI picks the closest row of the hiding table and the
   closest place on the map. It never invents a number. Without the AI, the
   grammar picks the plain match ("hide" plus the ground the unit is on).
   The read-back says what was understood: "Archers will hide in the marsh
   at C7-NE: hidden from anyone who does not check, but tiring."
3. **The narrator keeps secrets.** A side is told only what it saw. The
   ambushed side hears "arrows from the treeline" or "they came out of the
   woods", never the hidden unit's name before it is revealed.

### H. Testing and calibration

- Unit tests for each rule, on Crownhill and on small generated maps.
- Scenario tests, run headless:
  - a column marching past a hidden force in the woods, which is
    ambushed;
  - the same column on guard, where the ambush holds;
  - a scout checking the woods and finding the ambush;
  - a flanking force through the trees, missed by the hidden force;
  - a traffic jam where crowding penalties bite.
- The 300-game run still finishes every game. The meeting battle still
  reaches a verdict.
- The purity and no-roles guards stay green: no attacker/defender words,
  even though "ambusher" is tempting.

## Steps (one commit each, full suite green at every commit)

1. Plan and rulings (this file, `docs/DECISIONS.md`).
2. Stacking: men per tile, density tiers and penalties (A).
3. Line of sight with woods and hills, moved into the battle step (B).
4. Posture, the choice to fight, and surprise (C).
5. Hiding and checking (D).
6. Ambush (E).
7. Objective control and the victory rule (F).
8. Interpreter and narrator: the new orders and secret-keeping (G).
9. Scenario tests, the 300-game run, and tuning (H).
10. Report and PR, tested on a fresh clone first.

## Out of scope

- **The web app:** Stage 4.
- **Facing and true rear attacks:** surprise stands in for them.
- **Ranged fire:** the hiding table records the archer cost for when it
  lands.
- **Weather, night and fog-of-weather.**
- **Veterancy incentives:** this stage only keeps "saw combat" accurate.
  The ambush and surprise rules make that matter more.
- **The story for objectives:** Zach's.

## Open, with the defaults this plan uses

1. **Stacking numbers:** the table above, quartered from the earlier build.
2. **Surprise bonus:** +2 attack and −10 morale against a marching unit;
   nothing against a unit on guard or defending. To be tuned in the
   scenarios.
3. **Ambush reach:** 1 tile (the target must come next to it).
4. **Objective hold time:** 60 battle minutes.
5. **Careful march speed:** half.
