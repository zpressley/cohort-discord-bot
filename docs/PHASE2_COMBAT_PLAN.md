# Phase 2 — Combat Engine: Build Plan

**Status:** harness built and passing; combat engine not started.
**Scope:** everything you need to carve out `src/phase2-combat/combat/` without
reading the legacy tree.

---

## 1. Where this stands

The clean-room rewrite exists in two pieces:

| | Location | Lines | State |
|---|---|---|---|
| Phase 1 — movement | `src/phase1-movement/` | 788 | Working, now pinned by tests |
| Phase 2 — harness | `src/phase2-combat/harness/` | ~560 | **New.** Working |
| Phase 2 — combat | `src/phase2-combat/combat/` | — | **Does not exist yet** |

The original phase 2 combat work was never committed and is not recoverable
from this repository — no branch, stash, or unreachable object contains it. It
is being rebuilt.

The legacy stack (`src/game/`) still runs the live Discord bot. Phase 2 does
**not** import from it. Legacy is a source of *numbers to copy*, not code to
call — see §5.

### What the harness is for

The thing that made the original engine good was running battles over and over
and adjusting until the numbers felt right. That loop needs a way to run a
battle without Discord, without a database, and without an AI call. That is all
this harness is.

Its one hard guarantee: **same scenario + same seed + same resolver = identical
output, byte for byte.** Break that and balance testing becomes guesswork.

---

## 2. Running it

```bash
npm run test:phase2                                     # 35 tests
npm run sim                                             # list scenarios
node src/phase2-combat/run.js hill-assault              # movement only
node src/phase2-combat/run.js hill-assault --combat     # with placeholder math
node src/phase2-combat/run.js hill-assault --combat --seed 42
node src/phase2-combat/run.js hill-assault --combat --sweep 50
```

`--sweep N` runs seeds 1..N and tallies winners. That is the balance tool: a
rule is only sound if it holds across many rolls, not one lucky run.

### Layout

```
src/phase2-combat/
├── run.js                       CLI entry
├── harness/
│   ├── index.js                 public surface
│   ├── rng.js                   seeded PRNG (mulberry32)
│   ├── world.js                 multi-unit state, distance, terrain
│   ├── runner.js                turn loop, engagement detection, casualties
│   ├── report.js                stable text output
│   └── placeholderResolver.js   ⚠️ NOT the engine — a stub so the loop runs
├── scenarios/
│   ├── bridge-standoff.js       frontal contact, no flank (Harrow Bridge H15)
│   ├── ford-crossing.js         attacker crosses a ford (North Ford W6)
│   └── hill-assault.js          uphill attack (The Crownhill Q1)
└── tests/
    ├── phase1-movement.characterization.test.js   15 tests — pins phase 1
    └── harness.test.js                            20 tests — pins the harness
```

### Turn order

```
1. movement    phase 1's executeMove(), unchanged
2. occupancy   truncate any move that would end on an occupied tile
3. contact     find enemy pairs within engagementRange (default 1 tile)
4. combat      call the injected resolver          <- phase 2 lives here
5. casualties  applied by the harness, not the resolver
6. snapshot    recorded for the report
7. outcome     a side with no living units loses
```

---

## 3. The resolver contract

This is the only interface phase 2 has to satisfy. Everything else is yours.

```js
/**
 * @param {Object} ctx
 * @param {Engagement[]} ctx.engagements   pairs in contact this turn
 * @param {World}        ctx.world         read-only: do not mutate
 * @param {Function}     ctx.random        seeded RNG — the ONLY randomness allowed
 * @param {number}       ctx.turn          1-indexed
 * @returns {{ casualties: {unitId: string, killed: number}[], events: string[] }}
 */
function resolveCombat({ engagements, world, random, turn }) { }
```

**Engagement:**

```js
{ aId, bId, distance, aTerrain, bTerrain }
```

The pair is deliberately named `a`/`b`, **not** attacker/defender. Which side is
attacking is a tactical judgement — who moved into contact, who holds ground,
charge versus receive — and the harness cannot make it. Your resolver decides,
and that decision is part of the combat design.

**Four rules, all enforced by the tests:**

1. **Pure.** Do not mutate `world`. Return casualty *intent*; the runner applies it.
2. **No `Math.random()`.** Ever. Use the injected `random` — `random()`,
   `random.int(min,max)`, `random.chance(pct)`, `random.pick(arr)`.
3. **No I/O.** No AI calls, no database, no `Date.now()`.
4. **No wall-clock or timestamps in output.** Reports get diffed.

The RNG is a shared stream. Draw in a fixed order or seeds stop being
comparable across rule changes.

### Wiring your resolver in

`src/phase2-combat/run.js` has the slot:

```js
const RESOLVERS = {
  placeholder: placeholderResolver,
  combat: require('./combat').resolveCombat   // <- uncomment when it exists
}
```

---

## 4. Army builder reference

This is the data a combat engine consumes. All of it is in
`src/game/armyData.js` (810 lines) — the one legacy file worth reading in full.

### The economy

Players spend **Supply Points (SP)** from a cultural budget
(`CULTURAL_SP_BUDGETS`): most cultures 30, Spartan 25, Carthaginian 32.

Unit cost = `quality + primaryWeapon + armor + shield + training + mount + all secondaries + all ranged`.

Every unit is built in six steps, and each step constrains the next.

### Step 1 — Troop quality (`TROOP_QUALITY`)

| Key | SP | Size | attack / defense / morale | Cannot take |
|---|---|---|---|---|
| `levy` | 3 | 400 | 1 / 1 / 0 | heavy weapons, heavy armor, heavy shield |
| `tribal_warriors` | 4 | 400 | 3 / 2 / 2 | heavy armor |
| `militia` | 5 | 400 | 2 / 2 / 1 | — |
| `professional` | 7 | 400 | 4 / 4 / 3 | — |
| `veteran_mercenary` | 9 | 400 | 6 / 5 / 4 | — |

Quality is ordered — `meetsQualityRequirement()` uses index position, so
`min_quality: 'professional'` on a weapon also admits `veteran_mercenary`.

Note `tribal_warriors` out-fights `militia` on attack (3 vs 2) while costing
less. Deliberate or not, it is currently the SP-efficient aggressive pick.

### Step 2 — Mount (`MOUNT_OPTIONS`)

3 SP standard, 2 SP for horse cultures (Sarmatian, Parthian).
`mobility_bonus: 3`, `charge_bonus: 2`. Mounted units cannot take heavy shields.

### Step 3 — Weapons

Five tables: `LIGHT_WEAPONS`, `MEDIUM_WEAPONS`, `HEAVY_WEAPONS`,
`LIGHT_RANGED`, `MEDIUM_RANGED`. Merge with `getAllWeapons()`.

Every weapon carries:

```js
{
  cost, damage,                          // damage 5–12 across the range
  cultures: 'all' | ['Roman Republic'],
  stacking: 'primary' | 'secondary' | 'two_handed'
          | 'primary_ranged' | 'stackable_ranged',
  cavalry_compatible, cavalry_bonus, cavalry_penalty,
  min_quality,                           // optional gate
  shield_restriction,                    // 'no_shield' | 'secondary_melee_only' | 'medium_shield_max'
  range,                                 // ranged only, in metres
  carry_amount,                          // thrown only — ammunition
  effectiveness: { light, medium, heavy, cavalry },   // percentages vs target type
  special                                // prose — NOT machine-readable
}
```

**`effectiveness` is the most important field for combat.** It is a 0–100
percentage keyed by *target armour class*, and it is where the rock-paper-scissors
lives. Compare:

| Weapon | vs light | vs medium | vs heavy | vs cavalry |
|---|---|---|---|---|
| `heavy_mace` (dmg 12) | 70 | 95 | 85 | 45 |
| `two_handed_spear` (dmg 10) | 85 | 75 | 55 | 90 |
| `spear_basic` (dmg 7) | 80 | 60 | 35 | 95 |
| `daggers` (dmg 5) | 70 | 30 | 15 | 20 |

A mace beats armour; a spear beats horses; a dagger beats neither. **Decide
early whether `effectiveness` is a damage multiplier, a hit chance, or an
armour-penetration factor** — the whole balance follows from that choice, and
the tables were authored as percentages, so treating them as multipliers
without dividing by 100 will inflate damage 100×.

`special` is prose (`'Ignores 50% armor (blunt trauma)'`). Nothing parses it.
Either encode those effects as real fields or accept they do nothing.

### Step 4 — Armour (`ARMOR_CATEGORIES`)

| Key | SP | `damage_reduction` | Mobility |
|---|---|---|---|
| `no_armor` | 0 | 0 | +1 |
| `light_armor` | 0 | 30 | — |
| `medium_armor` | 1 | 60 | −10 |
| `heavy_armor` | 2 | 85 | −20 |

`damage_reduction` is a percentage. **Mobility units are inconsistent:** armour
uses −10/−20 (percent?) while shields use −1 and mounts use +3 (tiles?). Pick
one scale before wiring mobility into movement.

### Step 5 — Shields (`SHIELD_OPTIONS`)

`no_shield` 0 SP (+1 mobility) · `light_shield` 0 SP (+1 def) ·
`medium_shield` 1 SP (+2 def) · `heavy_shield` 2 SP (+3 def, −1 mobility).

Availability is computed by `getAvailableShields(weapons, mounted, quality)` —
weapon restriction, then mount, then quality.

### Step 6 — Training

`none` 0 SP · `basic` 2 · `technical` 4 · `expert` 6.
Stored as `{ type, level, cost }`. **No combat effect is defined anywhere** —
the player pays up to 6 SP for a field nothing reads. Phase 2 should give it
one or drop it.

### Support (`SUPPORT_SPECIALISTS`)

| Key | SP | Stated ability |
|---|---|---|
| `field_engineers` | 2 | +2 Defense when stationary |
| `medical_corps` | 1 | −10% casualties, +1 Morale |
| `scout_network` | 1 | Reveal positions, +2 initiative |

Prose only — none of it is implemented.

### Elite units

Free (0 SP), one per army, from `getEliteUnitForCulture()`. Always
`veteran_mercenary`. Culture picks the weapon and whether it is mounted
(Berber and Sarmatian elites are cavalry).

⚠️ **Elite size is contradictory in the live code.** `eliteTemplates.js:24`
standardises ~300 warriors; `armyInteractionHandler.js:890` `getEliteUnitSize()`
returns 40–100 (Spartan 40, Han 100, default 80). Both run. Pick one.

### Saved army shape

`Commander.armyComposition` (JSON column):

```js
{
  culture: 'Roman Republic',
  totalSP: 30, usedSP: 28,
  eliteSize: 80,
  support: { medical_corps: 1 },
  units: [{
    culture, quality,            // the whole TROOP_QUALITY object, not the key
    mounted, mount,
    primaryWeapon,               // whole weapon object
    secondaryWeapons: [], rangedWeapons: [],
    armor, shields,              // whole objects — note "shields", plural
    training: { type, level, cost }
  }]
}
```

Units embed **whole objects**, not keys. Convenient for combat (no lookups),
awkward for migration (a rebalance of `armyData.js` does not reach saved
armies). Worth an adapter at the boundary.

### Harness unit shape

`world.createUnit()` deliberately takes flat scalars (`quality: 'professional'`,
`armor: 'medium_armor'`) rather than the nested army objects. Write an adapter
—- `armyComposition → harness units` — when you want to run real player armies
through a scenario. Keep it in `phase2-combat/`; do not push army shapes into
the harness.

---

## 5. Salvage map — legacy formulas worth mining

`src/game/battleEngine.js` (1,573 lines) is the old engine, already flattened
from eight files. **Do not import it.** Read the tables, copy the numbers you
want, leave the code.

| What | Where | Worth taking? |
|---|---|---|
| `WEAPON_ATTACK_RATINGS` | `battleEngine.js:9` | Yes — tuned per-weapon values |
| `TRAINING_ATTACK_BONUSES` | `:25` | Yes — gives training a meaning |
| `FORMATION_ATTACK_MODIFIERS` | `:30` | Yes |
| `SITUATIONAL_ATTACK_MODIFIERS` | `:38` | Yes — flanking, elevation |
| `ARMOR_DEFENSE_RATINGS` | `:177` | Yes |
| `SHIELD_DEFENSE_BONUSES` | `:181` | Yes |
| `ARMOR_TYPE_EFFECTIVENESS` | `:206` | Yes — pairs with `WEAPON_DAMAGE_TYPES:213` |
| `ENVIRONMENTAL_CHAOS` | `:309` | Maybe — terrain/weather/time noise |
| `TACTICAL_CHAOS` | `:324` | Maybe — density and situation |
| Preparation tables | `:457–491` | Later — six overlapping bonus tables |
| `CULTURAL_COMBAT_MODIFIERS` | search | Later |
| Damage accumulation | search | Later — the multi-turn wear model |

`ENVIRONMENTAL_CHAOS.terrain` keys (`plains, hill, forest, marsh, river, desert,
urban, mountain`) nearly match phase 1's `MOVEMENT_COSTS` keys, but phase 1 also
has `road`, `ford` and `bridge`, and has no `desert`/`urban`/`mountain`. Map
them explicitly rather than assuming.

Also present but **not** worth mining yet: the preparation system is six tables
producing overlapping bonuses that were never individually validated. Start
simpler.

---

## 6. Known phase 1 defects

**Fixed while building the harness:**

- `parseCoord()` collapsed every two-letter column onto a single-letter one
  (`AA1` → column 1 instead of 26), making the eastern third of the 40×40 map
  unaddressable. The transcription from `mapUtils.js` dropped the bijective
  base-26 conversion. Restored; now pinned by a test over all 1,600 tiles.

**Open — pinned by tests as current behaviour, not endorsed:**

- **Duplicate aliases collide silently.** `buildAliasIndex()` is a flat object,
  so when two cells share an alias the later one overwrites the earlier.
  `"the ridge"` is an alias on both `Q1` (The Crownhill) and `A20` (Shepherd's
  Ridge); `A20` wins. The ambiguity branch only runs on *partial* matches, so an
  exact collision never asks the player to disambiguate. Fix needs a decision:
  make the index multi-valued and return `ambiguous` on exact collisions.

**Structural, not yet addressed:**

- **No occupancy model in phase 1.** `executeMove()` pathfinds for one unit and
  knows nothing about anyone else, so two units happily stack on one tile. The
  harness truncates moves at the first occupied tile as a stopgap
  (`runner.js truncateForOccupancy`). Phase 2 should decide the real rule —
  zones of control, friendly stacking penalties, passing through allies.
- **State is a module-level variable.** `handler.js:18` holds one global unit
  that resets on restart, pinned to hardcoded channel `1519439030633369670`
  (`handler.js:14`). Fine for phase 1 testing, not a foundation.
- **The narrator calls Groq on every move** (`narrator.js`). The harness bypasses
  it entirely. Keep it that way — narration must never be in the tuning loop.

---

## 7. Decisions to make before writing damage code

> **All six are now ruled.** See `docs/design/architecture-roadmap.md` §8,
> "Ruled — session 2026-08-30". Summary: `effectiveness` is a damage multiplier
> (÷100); the unit that entered contact is the attacker, persistent contact is
> symmetric; a turn is N ten-minute rounds (elastic time); casualties are a
> fraction of current strength; morale **is** in phase 2; standard units are
> ~100 strong, elites 80. The list below is kept for the reasoning behind each
> question.

1. **What is `effectiveness`?** Multiplier, hit chance, or armour penetration.
   Everything else follows.
2. **Who attacks?** The harness reports an unordered pair. Charge bonuses,
   defensive terrain and formation all need an answer.
3. **One exchange per turn, or rounds within a turn?** Sets the casualty scale.
4. **Casualties as flat numbers or as a fraction of strength?** The runner
   accepts integers either way, but the balance feel is different.
5. **Does morale exist in phase 2, or phase 3?** `world.createUnit()` carries a
   `morale` field but nothing reads it. Leaving it inert is a valid choice.
6. **Unit size.** Everything is 400 (elite ~300 or 40–100, see §4). At 25m tiles
   a 400-man unit on one tile is dense. Confirm before tuning casualties.

---

## 8. Suggested build order

Each step ends with the harness green, so there is always a working state to
fall back to.

1. **`combat/ratings.js`** — attack and defence ratings from a harness unit.
   Pure functions, no randomness. Unit-test the tables directly.
2. **`combat/damage.js`** — ratings + `effectiveness` + armour → casualties.
   Still no randomness; test with fixed inputs.
3. **`combat/resolve.js`** — the resolver. Adds `random`, satisfies §3.
   Wire into `run.js`, then sweep all three scenarios.
4. **Tune.** `--sweep 50` per scenario. Targets to argue about:
   - `hill-assault`: the defender holds high ground with fewer, better troops.
     If the attacker wins easily, elevation is worth nothing.
   - `ford-crossing`: the attacker is caught mid-crossing. Should be punishing.
   - `bridge-standoff`: even matchup, no flank. Should be bloody and slow.
5. **Add scenarios** as questions come up — cavalry vs spears, ranged
   skirmishing, quality mismatch. One scenario per question.
6. **Only then** wire into Discord.

Commit after every green step. The tuning is the expensive part to recreate.
