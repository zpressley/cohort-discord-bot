// src/harness/placeholderResolver.js
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

const { getUnit } = require('../engine/world')

const FLAT_CASUALTY_RATE = 0.04  // 4% of current strength per exchange

function placeholderResolver({ engagements, world, random }) {
  const casualties = []
  const events = []

  for (const engagement of engagements) {
    const a = getUnit(world, engagement.aId)
    const b = getUnit(world, engagement.bId)
    if (!a || !b) continue

    // Flat rate with a small deterministic jitter, nothing more.
    const aLoss = Math.round(a.strength * FLAT_CASUALTY_RATE * (0.5 + random()))
    const bLoss = Math.round(b.strength * FLAT_CASUALTY_RATE * (0.5 + random()))

    casualties.push({ unitId: a.id, killed: aLoss })
    casualties.push({ unitId: b.id, killed: bLoss })

    events.push(`${a.id} and ${b.id} exchange blows [PLACEHOLDER MATH]`)
  }

  return { casualties, events }
}

module.exports = { placeholderResolver, FLAT_CASUALTY_RATE }
