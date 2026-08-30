# Phase 2 — Combat

Deterministic harness for building and tuning the combat engine.
No Discord, no database, no AI calls, no wall clock.

**Full plan: [`docs/PHASE2_COMBAT_PLAN.md`](../../docs/PHASE2_COMBAT_PLAN.md)**

```bash
npm run test:phase2                                   # 35 tests
node src/phase2-combat/run.js                         # list scenarios
node src/phase2-combat/run.js hill-assault --combat   # run one
node src/phase2-combat/run.js hill-assault --combat --sweep 50
```

The combat engine does not exist yet. `harness/placeholderResolver.js` is a
4%-flat-rate stub that exists only to prove the loop runs — it is **not** the
engine and must not be built on.

Write the real resolver at `src/phase2-combat/combat/`, satisfy the contract in
§3 of the plan, and register it in `run.js`.

**The one invariant:** same scenario + same seed + same resolver produces
byte-identical output. If that breaks, balance testing is worthless.
