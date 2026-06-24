// src/phase1-movement/unitState.js
// Single unit definition for Phase 1 testing.

function createUnit(overrides = {}) {
  return {
    id: "roman_infantry_1",
    culture: "Roman Republic",
    role: "heavy_infantry",
    position: "D4",       // starting position — NW staging area, clear of forest
    strength: 340,
    maxStrength: 400,
    movementRange: 3,     // tiles per turn (at 25m/tile = 75m/turn march rate)
    mounted: false,
    aliases: [
      "the infantry",
      "heavy infantry",
      "the legionaries",
      "the romans",
      "the men",
      "the troops"
    ],
    ...overrides
  }
}

module.exports = { createUnit }
