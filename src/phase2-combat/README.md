# Phase 2 — Combat

Deterministic combat engine and the harness it was tuned against.
No Discord, no database, no AI calls, no wall clock.

**Design contract:** [`docs/design/combat-design.md`](../../docs/design/combat-design.md)
**Build plan:** [`docs/PHASE2_COMBAT_PLAN.md`](../../docs/PHASE2_COMBAT_PLAN.md)
**Rulings:** [`docs/design/architecture-roadmap.md`](../../docs/design/architecture-roadmap.md) §8

```bash
npm test                                              # 143 tests
npm run balance                                       # full matchup matrix
npm run balance -- --quality elite --sims 500
npm run balance -- --sample cavalry:spearmen          # one traced fight
node src/phase2-combat/run.js hill-assault --combat   # a tactical scenario
node src/phase2-combat/run.js hill-assault --combat --sweep 50
```

## Layout

```
combat/       the engine — pure except for resolve.js
  tables.js     every number, each tagged [notebook] / [salvage] / [derived]
  ratings.js    attack, defense, push, fatigue curve, charge decay
  damage.js     casualties, push, morale, one full exchange
  resolve.js    the round loop and the only file that touches randomness
balance/      the tuning tool
  duel.js       one pairing fought to rout or destruction
  matrix.js     every pairing x N seeds, plus the mirror ladder
  report.js     stable, diffable text output
harness/      the scenario runner (movement + combat on real terrain)
scenarios/    three tactical setups: hill, ford, bridge
tests/        143 tests, including the nine design assertions
```

## The two harnesses, and why there are two

`harness/` runs a **scenario**: real map, real movement, scripted orders. It
answers "does terrain matter, does the ford hurt". It stops when its order
script ends, and its outcome check only knows about destruction — a unit that
routs is out of the fight but the runner still reports `undecided`. Rout as a
map-level victory condition arrives in phase 4, when combat meets movement and
broken units actually flee.

`balance/` runs a **duel**: two units in contact, no movement, fought until one
routs or dies. It answers "how many rounds, who wins, how many survive" — the
numbers the design is tuned against. This is what `npm run balance` drives and
what the nine assertions read.

## The invariant

Same scenario + same seed + same resolver produces byte-identical output. All
randomness flows through the chaos scalar (locked decision 4), so any run in a
report can be replayed exactly from the seed it names. If that breaks, balance
testing is worthless.

`createCombatResolver()` is a factory, not a bare function: stamina, morale and
rounds-in-contact persist across rounds and do not live in the world model, so
each run needs its own. Reusing one across a sweep leaks the previous battle in.

## Tuning

Change a number in `combat/tables.js`, run `npm run balance` and diff against the
saved report, then run `npm test`. The assertions in
`tests/balance.assertions.test.js` decide whether the change stands — a failure
there means the edit broke a design rule, not a magic number.
