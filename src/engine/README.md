# Engine

The game's rules as pure functions: the same map, armies, orders and seed
always produce the same result. No Discord, no AI, no database, no files, no
clock, and no randomness except the seeded RNG in `rng.js`.

```
map/           terrain, landmarks, the battlefield
movement/      pathfinding and simultaneous multi-unit movement
combat/        the round loop: ratings, damage, push, morale, chaos
battle/        one battle turn by turn (movement + combat + rout), and the event log
orchestrator/  the two-player game loop: orders, elastic time, fog of war, victory
veterans/      experience, officers, the campaign record (pure calculation)
army/          the army-builder economy
world.js       the unit roster
runner.js      the scripted scenario runner used by the harness
rng.js         the single seeded random number generator
```

What sits around it:

- `src/harness/`: headless scenarios, the balance matrix, design assertions
- `src/adapters/`: the hotseat CLI, the Discord movement demo, file persistence
- `src/interpreter/`, `src/narrator/`: the AI edges (orders in, prose out)

Rulings live in `docs/DECISIONS.md`. The plan for this layout is
`docs/stage-1/PLAN.md`.
