// src/phase2-combat/harness/rng.js
// Seeded PRNG. Every run with the same seed produces the same numbers,
// which is what makes a combat balance test reproducible.
//
// Math.random() must never appear in the combat engine — pass this in.

// mulberry32 — small, fast, good enough distribution for game dice.
function createRng(seed) {
  let a = seed >>> 0

  const random = () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // Integer in [min, max] inclusive
  random.int = (min, max) => min + Math.floor(random() * (max - min + 1))

  // Percentage roll — true if the d100 comes in at or under `chance`
  random.chance = (chance) => random() * 100 < chance

  // Deterministic pick from an array
  random.pick = (arr) => arr[Math.floor(random() * arr.length)]

  return random
}

module.exports = { createRng }
