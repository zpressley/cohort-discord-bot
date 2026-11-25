// src/engine/rng.js
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

// A tie broken by a seeded draw of its own (docs/DECISIONS.md, "How the
// kinds of battle were built", round two): a number in [0, 1) from the
// battle's seed and what is being ordered (the turn, a unit's id), the same
// every time it is asked, and drawing nothing from any stream. Ordering by
// it instead of by name puts neither side first more often than the other:
// ordered by name, "blue_" came before "red_" in every tie, every turn.
function tieBreak(...parts) {
  let h = 0x811c9dc5
  const text = parts.join('|')
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  // (Mixed once more, so that ids differing in their last letter spread.)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

module.exports = { createRng, tieBreak }
