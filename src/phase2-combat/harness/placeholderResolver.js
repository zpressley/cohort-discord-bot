// src/phase2-combat/harness/placeholderResolver.js
//
// ⚠️  THIS IS NOT THE COMBAT ENGINE. DO NOT BUILD ON IT.
//
// It exists so the harness can be exercised end-to-end — so you can prove the
// turn loop, casualty application, victory check, and report all work before
// any real combat math exists. It rolls a flat percentage and ignores weapons,
// armour, shields, quality, formation, terrain and morale entirely.
//
// Phase 2's real resolver replaces this. It must match the same contract:
//
//   resolver({ engagements, world, random, turn }) -> {
//     casualties: [{ unitId, killed }],
//     events:     [string]
//   }
//
// Rules the real one must also follow:
//   - Pure. Do not mutate `world`. The runner applies casualties.
//   - Never call Math.random(). Use the injected `random` only.
//   - No I/O, no AI calls, no Date.now(). Determinism is the contract.

const { getUnit } = require('./world')

const FLAT_CASUALTY_RATE = 0.04  // 4% of current strength per exchange

function placeholderResolver({ engagements, world, random }) {
  const casualties = []
  const events = []

  for (const engagement of engagements) {
    const attacker = getUnit(world, engagement.aId)
    const defender = getUnit(world, engagement.bId)
    if (!attacker || !defender) continue

    // Flat rate with a small deterministic jitter, nothing more.
    const attackerLoss = Math.round(attacker.strength * FLAT_CASUALTY_RATE * (0.5 + random()))
    const defenderLoss = Math.round(defender.strength * FLAT_CASUALTY_RATE * (0.5 + random()))

    casualties.push({ unitId: attacker.id, killed: attackerLoss })
    casualties.push({ unitId: defender.id, killed: defenderLoss })

    events.push(`${attacker.id} and ${defender.id} exchange blows [PLACEHOLDER MATH]`)
  }

  return { casualties, events }
}

module.exports = { placeholderResolver, FLAT_CASUALTY_RATE }
