# Engine

The game's rules as pure functions: the same map, armies, orders and seed
always produce the same result. No Discord, no AI, no database, no files, no
clock, and no randomness except the seeded RNG in `rng.js`.

```
map/           the battlefield: terrain, features (ridges, woods, clearings),
               places as players describe them, the player grid, landmarks
movement/      pathfinding and simultaneous multi-unit movement
combat/        the round loop: ratings, damage, push, morale, chaos
battle/        one battle turn by turn (movement + combat + rout), orders that
               persist, and the event log
orchestrator/  the two-player game loop: orders, elastic time, fog of war, victory
veterans/      experience, officers (killed, captured, wounded), the campaign
               record (pure calculation)
army/          the army-builder economy
world.js       the unit roster
runner.js      the scripted scenario runner used by the harness
rng.js         the single seeded random number generator
```

What sits around it:

- `src/harness/`: headless scenarios, the balance matrix, design assertions
- `src/adapters/`: the hotseat CLI, the Discord movement demo, file persistence
- `src/interpreter/`: orders in plain words (fixed grammar, AI reader, resolution)
- `src/narrator/`: turns told back (AI narrator, plain event text)
- `src/llm/`: the one AI client (Groq), with fallbacks and recorded replies

Rulings live in `docs/DECISIONS.md`. The plan for this layout is
`docs/stage-1/PLAN.md`.
