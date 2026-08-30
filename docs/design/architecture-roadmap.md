# Cohort — Technical Architecture & Long-Term Roadmap
**Status:** Canonical planning document. Supersedes the old repo's implementation guide.
**Companion:** `docs/design/combat-design.md` (phase 2 contract, locked decisions)

---

## 1. Vision

A Discord-native ancient warfare game (3000 BCE–500 CE) where two commanders issue natural-language orders, a deterministic engine resolves simultaneous turns, and AI renders the math as narrative. The emotional core is permanence: named veteran officers who accumulate knowledge and die forever. Armies of 300–600 warriors, 25 cultures with authentic elite units, battles on a 1km² battlefield.

## 2. Source-of-Truth Hierarchy

When documents disagree, this is the precedence order:

1. **Locked decisions** (notebook reconstruction + Q&A, captured in docs/design/combat-design.md)
2. **Phase 1 code** (`src/phase1-movement/`) — grid, coordinates, movement, pipeline pattern
3. **Old Drive/repo docs** — authoritative for *feature intent and flavor* (cultures, veteran fiction, diplomacy, victory types), **NOT** for mechanics math. Old numeric tables are inputs to re-derivation, never copy-paste values.

Consequence: the old combat model (single-resolution, fixed formation bonuses, rally chances) is fully superseded by the round-based stamina/morale/chaos model.

## 3. Target Architecture

The clean-room principle, made structural. Phase 1 already proved the pattern: AI at the edges, pure deterministic engine in the middle.

```
Command (natural language, Discord)
  → interpreter (AI)            — intent + entities, nothing else
  → orchestrator (deterministic) — validates, sequences, calls engine
  → engine (pure functions)      — movement, combat, morale, veterans
  → orchestrator                 — assembles turn result
  → narrator (AI)                — math → prose in cultural voice
  → Discord adapter              — embeds, DMs, buttons
```

### Directory layout (end state)

```
src/
  engine/                # PURE. No IO, no Discord, no AI, no DB, no Date.now.
    map/                 #   mapData, terrain, LOS (from phase1)
    movement/            #   pathfinding, multi-unit simultaneous resolution
    combat/              #   round loop, stamina, push, chaos, casualties
    morale/              #   thresholds, snowball, rout state
    veterans/            #   XP math, death rolls, promotion (pure calc only)
    orchestrator/        #   turn phases, victory checks, event log
    rng.js               #   single seeded RNG; ALL randomness flows through chaos
  interpreter/           # AI edge in: order → intent JSON (provider-agnostic)
  narrator/              # AI edge out: turn result → narrative (cultural voices)
  ai/                    # provider clients, fallback cascade, cost tracking
  adapters/
    discord/             # commands, handlers, embeds, lobby, army builder
    persistence/         # DB models & repositories (SQLite dev → Postgres prod)
  harness/               # headless sims: balance matrix, regression assertions
  data/                  # cultures, units, equipment, maps — JSON/JS data only
legacy/                  # frozen old codebase (see §7)
docs/
  design/                # living canonical docs
  historical/            # superseded docs, read-only reference
```

### Layer rules (enforced by convention now, lint later)

- `engine/` imports only from `engine/` and `data/`. Everything in it is a pure function of (state, orders, seed) → (new state, events). This is what makes the harness possible and every battle replayable.
- `interpreter/` and `narrator/` never touch game state directly — they translate.
- `adapters/` may import anything; nothing imports adapters.
- Every phase folder from the walk-forward eventually graduates into this layout; `phase1-movement/` contents migrate into `engine/map/` + `engine/movement/` + `interpreter/` + `narrator/` during Phase 3.

### The event log

The orchestrator emits a structured event stream per turn (moves, contacts, rounds, casualties, pushes, routs, officer deaths). This is the single interface the narrator consumes, the harness asserts against, and the DB persists. Design it early (Phase 2 emits combat events already); it is the spine of the whole system.

---

## 4. Phase Roadmap

Renumbered from the current restart. Each phase = branch/tag `phase-N-complete` before the next begins.

### Phase 1 — Single-unit movement ✅
A* pathfinding, landmark resolution, intent parsing, narration, 40×40 map. Done.

### Phase 2 — Combat engine + balance harness (CURRENT)
**Recovery first:** the harness, build plan, seeded RNG, scenarios, phase-1 characterization tests, mapUtils fix, and legacy doc banners already exist on `origin/claude/phase-4-completion-ad7yq3` (2 commits ahead of main). Step one is merge that branch and tag it — do not rebuild what it contains. It also fixes a live phase 1 bug (parseCoord broke all two-letter columns; the eastern third of the map is unaddressable on main).

Then build `src/phase2-combat/combat/` per the recovered `PHASE2_COMBAT_PLAN.md` §8 build order (ratings → damage → resolve → tune → scenarios), implementing the design in `docs/design/combat-design.md`:
- Round loop: Attack/Defense → casualties; Push → morale + stamina; chaos scalar; universal fatigue curve; strength-scaled output (the snowball); monotonic morale; mutual-rout rule.
- Quality ladder (Levy → Vet Merc + Elites), kit drain rates, matchup rules (spears/horses/archers, charge decay).
- Salvage numbers (not code) from the inline legacy battleEngine per the plan's §5 salvage map: weapon/armor/shield/training ratings, situational modifiers, chaos tables. Skip the six preparation tables (never validated — start simpler) and the damage-accumulation bucket (superseded, see §9.6).
- Harness already enforces: purity, injected RNG only, no I/O, diffable reports, `--sweep N`. Extend its assertions to the 10 in the combat design doc.
- **Exit criteria:** all assertions green across the matrix; the three recovered scenarios (hill-assault, ford-crossing, bridge-standoff) hit their tuning targets — elevation matters, mid-crossing is punishing, the bridge standoff is bloody and slow.

### Phase 3 — Multi-unit movement
Multiple units per side, simultaneous resolution. Old docs' MOVE-002 lands here.
- Occupancy layer (`getUnitAt`, per-tile unit lists), initiative by speed tier (scouts → siege), collision resolution, path-crossing.
- Stacking density penalties (numbers re-derived for 25m tiles, see §6).
- Intent parser extended: multi-unit addressing ("the archers", "everyone", unit aliases already exist in unitState).
- **Exit:** headless script moves 6 units/side through 5 turns with zero collision anomalies; parser routes orders to correct units.

### Phase 4 — Integration: combat on the map
The two engines meet.
- Adjacency/contact detection triggers engagements; terrain flags feed combat modifiers (elevation, ford/bridge tags — already in mapData tags).
- Push gains its positional teeth: pushed-back units lose tiles, terrain advantage flips (the crest rule), stacking pressure.
- Rout behavior on the map: broken units flee toward their edge, -50% defense while broken (old doc value, re-validate in harness), pursuit casualties.
- Multi-unit engagements: adjacent friends support / flanking direction matters (flank/rear multipliers re-derived).
- **Exit:** full headless battle — two 4-unit armies, movement + combat + routs — terminates correctly under 20 turns, replayable from seed.

### Phase 5 — Turn orchestration & two-player game loop
- Simultaneous order submission (both players DM orders; process when both in or timeout).
- Fog of war: vision ranges (converted per §6), intelligence tiers, ghost/stale intel (old FOG features), scout role.
- Victory conditions (old VIC-002): objective control (fords/bridge/hills, 3+ consecutive turns), army destruction (<20% or commander loss placeholder), morale collapse, explicit surrender.
- Elastic time model: 10-min combat rounds; out-of-contact movement fast-forwards until an interrupt event (contact, sighting, objective) — per locked decision 1.
- **Exit:** scripted two-player battle from creation to declared victory, all via the orchestrator, no Discord.

### Phase 6 — Persistence & the veteran arc
The emotional core. Old veteran docs are authoritative for *intent* here.
- DB layer (SQLite dev / Postgres on Railway): Commander, Battle, BattleTurn, EliteUnit, VeteranOfficer — schema informed by old models, rebuilt clean.
- Two distinct progression axes (this resolves an old-doc ambiguity):
  - **Training tier** = purchased troop quality (Levy…Vet Merc) — army builder axis.
  - **Veterancy** = earned experience via the hybrid unit-average math (survivors × experience ÷ size) — applies on top of tier, most acutely to rout resistance.
- Elite officer lifecycle: 8–12 named positions per culture, death probability by experience (15% recruit → 6% legendary), knowledge that dies with the officer, automatic promotion, memorial references.
- Naming milestones: unit named at battle 3, lead officer personality at battle 5, legendary status at 10.
- **Exit:** three consecutive battles by the same commander persist correctly; an officer dies, a promotion fires, XP math matches the framework doc's worked example.

### Phase 7 — Discord shell & AI hardening
Rebuild the product surface on the proven engine.
- Lobby, create/join, block-based army builder (visual progress bars, per-culture restrictions), DM order flow, multi-battle context selector, stats.
- AI production-grade: provider fallback cascade, retries/timeouts, cost tracking, cultural narrator voices, officer Q&A ("ask your centurion").
- Deploy to Railway; soft launch with friends.
- **Exit:** two real humans complete a full battle end-to-end on Discord.

### Phase 8 — Tactical depth
Features from old docs that layer onto a working game:
- Named formations replacing the bare prepared/chaos abstraction (phalanx, testudo, wedge, loose) with change timing + transition vulnerability; terrain restrictions.
- Ranged combat + line of sight (deferred from Phase 2): converted ranges, weather effects on bows, the archer melee-lock already enforced.
- Command & control: command zones (instant/messenger/out-of-contact under elastic time), multi-turn missions, contingent orders, officer clarifying questions, unit autonomy AI (the four-step logic).
- Commander entity & capture (old CMD-003 — correctly deferred until autonomy exists), morale recovery events ("the left flank has routed them!") — the feature explicitly parked in locked decision 5.

### Phase 9 — Breadth & meta
- Culture rollout: all 25 civilizations with elite units, perks, restrictions (data-driven — `data/cultures/` — using the civilization docs + elite-warrior research for tutorial origin stories).
- Additional maps (data-driven via the mapData pattern; adding-maps guide updated).
- Diplomacy: elite capture/ransom, cultural negotiation voices, honor/reputation cross-battle tracking.
- Modes & meta: ranked/skirmish/quick, matchmaking, leaderboards, campaign sequences.

---

## 5. Cross-Cutting Concerns

**Process (non-negotiable, given two catastrophic losses):**
- Push at end of every session. Tag every phase completion. Never delete old code — archive it (§7).
- Agents get scoped, directory-limited tasks; no repo-wide cleanup passes, ever. Add a `CODEOWNERS`-style note in the README stating `legacy/` and `docs/historical/` are frozen.
- Design decisions live in docs *in the repo*, committed — the notebook reconstruction proved why.

**Tech stack:** Node.js (unchanged), plain JS with JSDoc types in engine (or TS if preferred — decide before Phase 3 migration), Jest for harness/unit tests, SQLite → Railway Postgres, discord.js.

**AI strategy:** provider-agnostic client with cascade (primary → secondary → template fallback), 30s timeouts, cost logging per call. Interpreter prompts return strict JSON; narrator prompts receive only the event log + cultural voice profile — never raw state.

**Testing pyramid:** harness assertions (balance regression) → engine unit tests (worked examples from docs as fixtures) → orchestrator integration (scripted battles) → one thin Discord smoke test.

---

## 6. Scale Conversion Table (50m-tile docs → 25m-tile reality)

Phase 1 code is authoritative: **40×40 grid @ 25m/tile** (same 1km² battlefield, 4× resolution). Every tile-denominated number in old docs converts; every meter-denominated number stands.

| Quantity | Old docs (50m tiles) | Converted (25m tiles) |
|---|---|---|
| Vision, standard | 3 tiles (150m) | **6 tiles** |
| Vision, scouts | 5 tiles (250m) | **10 tiles** |
| Elevated vision bonus | +2 tiles | **+4 tiles** |
| Composite bow effective | 3–4 tiles (150–200m) | **6–8 tiles** |
| Crossbow effective | 3 tiles (150m) | **6 tiles** |
| Cavalry charge run-up | 3 tiles (150m) | **6 tiles** |
| Command: instant | 1–3 tiles | **2–6 tiles** |
| Command: messenger | 5–10 tiles | **10–20 tiles** |
| Tile capacity (standard) | 400/tile | **~100/tile** (area ÷ 4) |
| Tile capacity (phalanx) | 500/tile | **~125/tile** |
| Stacking hard cap | 1200/tile | **~300/tile** |

Stacking penalty *tiers* keep their shape; thresholds quarter.

---

## 7. Documentation & Code Consolidation Plan

**Goal:** one canonical set, one clearly-labeled historical archive, nothing deleted.

1. Create `docs/historical/` with a README: *"Superseded design documents. Authoritative for feature intent and flavor only. Mechanics herein are replaced by docs/design/. Do not modify."*
2. Move into it: all ten Drive folder docs (export as .md), plus the old repo docs tree (`docs/architecture/`, `docs/game-logic/`, `docs/ai-systems/`, `docs/database/`, `docs/api-reference/`, old guides, CONSOLIDATION.md, WARP.md). Each file gets a one-line header: superseded-by pointer + date archived.
3. Create `docs/design/` containing: `combat-design.md` (done), this roadmap, and (as they're written) `movement-design.md`, `veteran-design.md`, `culture-data-spec.md`.
4. Old source code (`src/ai/`, `src/bot/`, `src/game/`, `src/database/` from the pre-restart build): move to `legacy/` in one commit tagged `legacy-archived` — reference-minable, never imported.
5. Update the repo README to describe the walk-forward phases and point to `docs/design/` first.
6. The two exceptional historical docs that remain *actively load-bearing as data sources*: the civilizations docs and the elite-warrior research (feed `data/cultures/`), and Combat_Mechanics_Reference (feeds modifier tables, post-conversion). Note this in their headers.

---

## 8. Contradiction Log

### Ruled (new design wins — no action needed unless you object)
| # | Old docs said | Ruling |
|---|---|---|
| R1 | 20×20 grid @ 50m/tile | 40×40 @ 25m (phase 1 code). All conversions per §6. |
| R2 | Single-resolution combat, fixed formation bonuses (phalanx +8 etc.) | Round-based stamina/morale/chaos model. Old numbers are *re-derivation inputs* for per-round modifiers, never direct values. |
| R3 | Morale: break thresholds by casualties % + rally chances 10–70% | Monotonic-down morale, snowball rout, mutual-rout rule. Rally/recovery deferred to Phase 8 as event-driven ("left flank routed them"). Old thresholds inform tuning targets only. |
| R4 | 4 training levels (levy/professional/veteran/elite) | 5-tier purchase ladder (Levy/Militia/Tribal/Professional/Vet Merc) + Elites above. Old "veteran" tier ≠ new Veteran Mercenaries; old individual-officer levels (Recruit→Legendary) are the separate *veterancy* axis and survive intact in Phase 6. |
| R5 | Formation system with named formations from day one | "Prepared vs chaos" scalar first (Phase 2); named formations are the Phase 8 refinement of the same slot. |
| R6 | Commander capture marked CRITICAL priority | Deferred to Phase 8 (depends on autonomy AI, which the old docs themselves admitted). |
| R7 | Old phase numbering (old P2 = multi-unit movement, P3 = combat) | Flipped: combat is new Phase 2. Your call, already made. |

### Ruled — session 2026-08-30 (Q1–Q8 closed)
All eight open conflicts are now decided. Recorded here rather than in a chat
log, per §5: design decisions live in the repo.

| # | Conflict | Ruling |
|---|---|---|
| **Q1** | Movement rate vs 10-min rounds (3 tiles/turn = 7.5 m/min vs a real march of 80–100 m/min) | **Elastic time.** A player turn is N ten-minute ticks. In contact, turns run a few rounds at short cautious movement ranges; out of contact, movement fast-forwards ticks until an interrupt (contact, sighting, objective reached). Matches locked decision 1; leaves phase 1's `movementRange` intact. |
| **Q2** | Old pre-restart codebase disposition | **`legacy/` folder, in-repo,** moved in one commit tagged `legacy-archived`. Safest against loss — it exists in every clone. Guarded by a frozen-directory note in the README and by scoping every agent task to a directory. Deferred until Phase 7 begins, because `src/game/` still runs the live bot. |
| **Q3** | Elite death-chance table (15% recruit → 6% legendary) | **Keep as authored.** Simulate the survival curves in Phase 6 and tune against data, not intuition. The brutality may be the point. |
| **Q4** | `effectiveness` semantics (0–100 weapon-vs-armour-class tables) | **Damage multiplier, ÷100.** Not hit chance — a to-hit roll would open a second RNG channel competing with chaos, breaking locked decision 4 (chaos is the single randomness channel). Not armour penetration — armour already has its own `damage_reduction`. |
| **Q5** | Who attacks? (harness reports an unordered a/b pair) | **The unit that entered contact this turn is the attacker** — charge and momentum bonuses apply to it. Contact persisting from a prior round resolves **symmetrically**, with only prepared-state and terrain asymmetries remaining. This is what makes the cavalry charge-decay curve fall out naturally. |
| **Q6** | Unit size vs tile capacity (400/unit vs ~100/tile) | **Standard units shrink to ~100.** Armies become 4–6 units of ~100, which *is* the combat doc's per-100 balance normalization — no conversion layer between the balance math and the unit. Units stay 1-tile abstractions. Multi-tile frontage becomes a Phase 8 ambition, not a Phase 2 cost. **Elite size: one number, 80** (resolves the 300-vs-40–100 contradiction between `eliteTemplates.js` and `armyInteractionHandler.js`). |
| **Q7** | Tribal Warriors stats (notebook vs legacy `TROOP_QUALITY`) | **Notebook wins.** Same SP cost and same base stats as Militia; **morale alone** is the differentiator (Professional-level morale), and availability is faction-gated. The legacy 4 SP / 3-2-2 line — cheaper *and* better on attack than Militia — is a degenerate pick that was never validated. |
| **Q8** | The separate `training` purchase (up to 6 SP, no combat effect anywhere) | **Fold into the quality tier.** Quality *is* training; the notebook model has no second axis. Drop the purchase and return the SP to the design space. The earned-experience axis (veterancy) is separate and arrives in Phase 6. |

**Consequences to carry into Phase 2:**
- `armyData.js` needs a rebalance pass at the Phase 7 army-builder rebuild: unit size 400 → ~100, Tribal equalized to Militia, training removed, SP costs re-derived. Phase 2 does not touch it — the harness takes flat scalars, and the adapter is written when real armies are run through scenarios.
- Morale is **in scope for Phase 2**, not deferred (plan §7.5): the combat design doc makes monotonic morale and the mutual-rout rule core to the round loop.
- Casualties are computed as a **fraction of current strength** (plan §7.4) — that fraction is what produces the strength-scaled snowball the design relies on to break stalemates.


## 9. Flagged as Just Wrong (fix in consolidation, no ruling needed)
1. `cohort-bot-docs.md` opens by calling this a "tactical **naval** warfare" game. It is ancient land warfare. Correct the line when archiving.
2. Old task list header says "Last Updated: December 2024" while depending on the October 2025 mechanics doc — internal dating is unreliable; treat all old-doc dates as approximate.
3. Old implementation guide's "60–70% complete" claim described the *old* codebase and is meaningless post-restart; archive with a superseded header so it never anchors expectations again.
4. Chinese crossbow "387–2,580 lbs draw" conflates infantry crossbows with multi-man winched siege engines; if the stat ever feeds `data/`, use the infantry-scale figures.
5. Tile-capacity and range numbers in old docs are silently wrong at the new tile scale until converted (§6) — any old table imported without conversion is a bug.
6. **The damage-accumulation "bucket" system is mathematically broken as documented.** In `combat_design_parameters.md`, negative damage (attack < defense) fills a bucket that overflows into casualties **for the defender** at the same 5×-per-point rate as positive damage — so the sign is discarded and casualties scale with |attack − defense|. Worked consequence, from the doc's own examples: Attack 2 vs Defense 8 inflicts **30 casualties/turn** on the defender while Attack 8 vs Defense 5 inflicts only 15 — a hopeless attacker out-kills a dominant one, and buying defense makes you die faster. The `damageScalingSandbox.js` recovered from the repo confirms the team was wrestling with exactly this (pre-scaling experiments) when work stopped. The new stamina/push/strength-snowball model replaces the bucket entirely; the anti-stalemate job it was hired for is now done by strength-scaled output + monotonic morale + chaos-seeded divergence. Salvage nothing from it.
7. **Main's phase 1 has a map-breaking bug** the recovery branch already fixed: `parseCoord` mis-converts two-letter columns (AA–AN), so 25% of the battlefield is unreachable. Merging the branch is the fix; until then, treat any phase-1 behavior east of column Z as invalid.

## 10. Recovered Material (Cohort.zip / branch audit, Aug 30 2026)

What the full-repo audit surfaced, and its status:

| Item | Where | Status |
|---|---|---|
| **Phase 2 harness + build plan** | branch `origin/claude/phase-4-completion-ad7yq3` — `src/phase2-combat/`, `docs/PHASE2_COMBAT_PLAN.md` | **Recover: merge to main, tag.** Seeded RNG (mulberry32), world/runner/report, 3 scenarios, 35 tests, resolver contract, `--sweep`. Combat engine itself was never started — the plan confirms the original phase-2 combat code "was never committed and is not recoverable"; this is the rebuild scaffold. |
| Phase-1 characterization tests (15) + parseCoord fix + mapUtils CI fix | same branch | Recover with merge |
| Legacy doc superseded-banners | same branch (5-line headers on all old docs) | Recover with merge — §7 consolidation is partially done |
| **Approved combat parameters v2.0** (Oct 14 2025) | `docs/Context/Old Context/combat_design_parameters.md` | Salvage the **tables** (weapons 2–12, armor 0–10, shields 0–6, training bonuses, chaos environmental/tactical, formation modifiers) as re-derivation inputs. The formula's chaos/preparation core validates locked decision 4 — chaos 0–10 rolled, preparation subtracts — adopt its numeric scales as the starting values. Discard the bucket (§9.6) and its casualty multiplier. |
| Legacy balance suite | `src/tests/combat/comprehensiveBalanceTest.js`, `riverCrossingBalance.js`, `simpleCombatTest.js` | Mine the **scenario definitions + expected win rates** as harness scenario seeds; the code targets the legacy engine and is not reusable directly. |
| Inline legacy engine | `src/game/battleEngine.js` (1,573 lines, combat logic flattened inline) | Read-only salvage map per recovered plan §5. Never import. |
| Army builder economy | `src/game/armyData.js` (810 lines): SP budgets (30 std / 25 Spartan / 32 Carthage), 6-step unit construction, weapon `effectiveness` tables, support specialists | Authoritative for the Phase 7 army builder, **after** Q4–Q8 rulings. The `effectiveness` matrices are the rock-paper-scissors data for Phase 2. |
| CONSOLIDATION.md import trace | repo root | Historical: it maps the pre-cleanup codebase and therefore doubles as the **inventory of what the agent cleanup deleted** (12 traced load-bearing files missing from main, incl. the modular combat/ folder, morale.js, rangedCombat.js, orderInterpreter.js, briefing stack). Archive with that note. |
