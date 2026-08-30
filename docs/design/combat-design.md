# Cohort Combat Design — Canonical Rules
**Source:** Reconstructed from design notebook (pre-layoff phases 2-3) + phase 1 codebase
**Status:** Design contract for Phase 3 (combat), informs Phase 2 (multi-unit movement)
**Grid context:** 40×40 tiles @ 25m/tile (phase 1 mapData.js is authoritative, not old repo docs)

---

## Phase Map (Corrected)

- **Phase 1 — Single-unit movement** ✅ (src/phase1-movement: A* pathfinding, intent parsing, narration, in-memory state)
- **Phase 2 — Multi-unit movement.** Simultaneous movement resolution for multiple units per side. No combat.
- **Phase 3 — Combat balancing, no movement.** Two units placed in contact, whittling each other over rounds until rout or destruction. Tuned against the balance harness before any spatial integration.
- **Phase 4+ — Integration** (movement + combat on the map), then orchestration, veterans, Discord shell.

## Core Pipeline (every turn, unchanged from phase 1 pattern)

```
Command (natural language)
  → AI interpretation
  → deterministic translation to engine
  → engine output (pure math)
  → AI interpretation through narrative
  → Discord update to player
```

The engine layer in the middle is pure and deterministic. AI touches only the two edges.

---

## Design Goals (these are the test assertions)

1. **Fun over simulation.** Damage hurts, but players get time to make a decision.
2. **Slower battles, never stalemates.** An engagement between two units resolves in **2–8 rounds** of continuous fighting without movement.
   - Floor: even the worst troops (levy) survive **at least 1–2 rounds** before rout is possible.
   - Rounds-to-resolution rises with troop quality (elite vs elite ≈ 6–8 rounds; levy vs levy ≈ 2–3).
   - No pairing may grind past ~8 rounds; stamina + morale decay guarantee convergence.
3. **Cost parity.** Balanced by army-builder value, normalized **per 100 troop count**. Two equal-cost units in a neutral matchup should split wins ~50/50 across many sims.
4. **Counters are real but not absolute.** Spears beat horses; horses beat archers; charge bonuses are strong but temporary.

---

## Unit Stat Model

Five core stats per unit:

| Stat | Alias | Role |
|---|---|---|
| **Attack** | Damage | Casualty infliction vs Defense |
| **Defense** | | Casualty mitigation |
| **Push** | | Ground/shoving pressure; damages enemy **morale and stamina** |
| **Stamina** | Fatigue pool | Depletes each round; low stamina degrades everything |
| **Morale** | | Willingness to fight; crossing threshold → rout |

**Interactions (from notebook, verbatim intent):**
- Attack vs Defense → casualties → casualties damage **morale**
- Push differential → damages enemy **morale AND stamina**
- Bonuses affect different units differently, but **base stats scale with cost** (a more expensive unit is better across the board, not just in one gimmick)

## Time Dimension — the key mechanic

Combat is resolved in **rounds**, and effectiveness is a function of time:

- **Charge bonus decays.** Cavalry gets a large Attack/Push spike on impact (round 1), decaying over subsequent rounds. Horse-vs-melee: big early spike, then below-parity. Horse-vs-spears: spike suppressed (spear counter), then bad. Horse-vs-archers: spike lands nearly unopposed.
- **Stamina drains by kit weight.** Heavy armor / heavy shield: stamina holds briefly then falls off a cliff. Light/no armor: slow, near-linear decline. Heavy kit protects and hits harder **but runs stamina faster** — heavies must win before they gas out.
- **Fatigue multiplier.** Current stamina-percentage scales Attack, Push, and Defense via one universal curve (see Locked Decisions #2). Suggested starting shape: full effectiveness above ~60% stamina, degrading toward ~50% effectiveness at zero — tune in the harness.

This is what produces battle *arcs*: cavalry must break you early; heavy infantry is a countdown clock; light troops win long grinds they survive.

## Morale & Rout

- Morale damage sources: casualties taken (Attack vs Defense outcome), Push differential, chaos state.
- **Veterancy impacts everything, but morale most acutely → resistance to routing.** A veteran unit's main edge is that it *stays*.
- Rout floor: system must guarantee the 1–2 round minimum before any rout check can succeed (see Design Goals).
- Special case: **Veteran Mercenaries** — best Attack in the ladder, but morale of mere Militia. They hit hardest and leave first when losing.

## Troop Quality Ladder

Stats rise with quality tier. Per-100-troop cost rises accordingly.

| Tier | Name | Notes |
|---|---|---|
| 1 | **Levy** | Bottom of everything |
| 2 | **Militia** | |
| 3 | **Tribal Warriors** | Same base stats as Militia, but **morale equal to Professional** (loyalty bonus) |
| 4 | **Professional Soldiers** | |
| 5 | **Veteran Mercenaries** | Best Attack; **morale equal to Militia** — no loyalty to stick if losing |

Above the ladder: **Elite units** (per-culture, from the civilization docs). Always deployed, better than Professional across the board, and the most loyal (highest morale in the game).

Better trained troops also have **more stamina** in addition to better morale.

## Equipment / Kit Model

- Armor and weapons modify the kit, not the soldier: **heavy stuff protects and hurts, but drains stamina faster.**
- Heavy armor or heavy shield → stamina curve: high plateau, steep collapse.
- Light/no armor → stamina curve: gradual decline.
- (Weapon-vs-armor effectiveness tables from Combat_Mechanics_Reference.md still apply as Attack/Defense modifiers; ranges in that doc are in meters — at 25m/tile they convert to **double** the tile counts the old 50m-tile docs implied.)

## Matchup Rules

- **Spears vs horses:** spears good vs horses. Cavalry charge bonus suppressed against braced spears.
- **Horses:** charge bonus (round-1 spike + decay), but **bad in long melee engagements** — the decay plus mounted stamina profile must make a stuck cavalry unit lose to comparable infantry.
- **Archers cannot use ranged attacks while under melee attack.** Engaged archers fight (poorly) in melee only.

## Chaos / Surprise / Prepared

State modifier on the whole engagement:

- **Surprise** increases **chaos**.
- **Chaos** impacts the full picture (degrades everything — treat as a global multiplier on the disordered side, plus extra morale pressure).
- **Prepared** reduces chaos — a formation set and braced for an incoming attack. (This is the hook where formations from the old docs plug in: "prepared" is the phase-3 abstraction; named formations are the later refinement.)

## Balance Framework

- All balancing normalized **per 100 troops**; army-builder cost is the exchange rate.
- Base stats must increase with cost (no cheap unit strictly dominating an expensive one).
- Militia vs Tribal demonstrates the pattern: identical base cost/stats, Tribal pays (or is priced) for the morale bonus.

---

## Balance Harness (rebuild of the Cowork test environment)

Headless script, no Discord, no AI. Deterministic engine + seeded RNG.

**Function:** run every unit-type pairing (full matchup matrix), N simulations each (suggest N=200), at equal per-100 cost, both flat terrain and with prepared/surprise variants. All randomness flows through the chaos scalar, so a seeded RNG makes every run reproducible — a failing sim can be replayed exactly.

**Per-pairing outputs:**
- Win rate / mutual-destruction rate
- Mean & distribution of rounds-to-resolution
- Survivor % of winner
- Round-by-round trace for one sample (to eyeball the damage/stamina curves)

**Automatic assertions (from Design Goals):**
1. No pairing resolves in < 2 rounds (rout floor holds)
2. No pairing exceeds 8 rounds (no stalemates)
3. Mirror matches ≈ 50/50
4. Rounds-to-resolution increases monotonically with tier in mirror matches
5. Counter checks: spears > cavalry (frontal), cavalry > archers, cavalry loses long engagements vs equal-cost melee infantry
6. Vet Mercenaries: highest damage output, above-average rout rate when losing
7. Heavy-kit units: win rate front-loaded (if the battle goes long, their win probability drops)
8. Mutual-threshold rounds resolve with neither unit routing; engagement still terminates within the 8-round cap
9. Elite units win every head-on equal-cost engagement except vs enemy elites (~50/50 mirror)

Every weight change reruns the matrix; assertions failing = the change is rejected. This is the regression suit that makes tuning safe.

---

## Locked Decisions

1. **Round length:** One combat round = **10 minutes** of battle time (subject to tuning, but consistent everywhere). Outside battle, travel progresses instantly but can be interrupted by events elsewhere — small increments during battles, elastic time between them.
2. **Stamina model (three separated knobs):**
   - **Pool** (tank size) comes from **training tier** — better trained troops have more stamina.
   - **Drain rate** comes from **kit weight** — heavy armor/shield drains faster.
   - **Fatigue multiplier** is one **universal curve** of stamina-percentage shared by all units. The notebook's two curve shapes (heavy = plateau-then-cliff, light = near-linear) emerge from drain rates hitting the same curve at different speeds — no per-kit curve shapes needed.
3. **Push:** Never causes casualties directly. Its penalties are **morale loss** (being pushed back is a confidence killer — the real cost), **stamina drain**, and **positional consequences**: winning push can flip a terrain advantage (defender loses the crest → the elevation math transfers), and it feeds movement limits + stacking penalties once combat integrates with the map. In pure phase-2 combat, terrain advantage is an input flag that push can flip mid-engagement.
4. **Chaos:** A **0–N scalar**, rolled randomly per engagement/round — the single RNG channel in the engine. **Preparedness subtracts from it.** You can mitigate chaos but never eliminate it: no two matchups play out the same. Because all randomness flows through chaos, the harness seeds it and every simulation is reproducible.
5. **Morale:** **Monotonic down** during an engagement. Recovery (reinforcements arriving, victory visible on the same field — "the left flank has routed them, press on!") is a later-phase feature, not in the core engine.
6. **Mutual rout threshold:** **Rout requires a loser.** If both units would cross the rout threshold in the same round, neither routs — "who would they be running from?" The fight continues until asymmetry emerges (chaos guarantees it eventually does) or destruction terminates the engagement. Morale is per-unit and snowballs: fewer men with worse morale is what produces the rout.
7. **Tribal Warriors:** Same cost as Militia; the loyalty/morale bonus is faction identity, not a price premium. **Faction-gated** — only available to some cultures.
8. **Elite units:** Attack at **Veteran Mercenary level** with **far better morale and loyalty** (best in game). An elite unit should win any head-on engagement unless facing the enemy's own best.
