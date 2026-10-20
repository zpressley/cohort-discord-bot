// src/engine/map/terrain.js
//
// What terrain costs to cross. These are rules, not map data, so they live in
// the engine and every map shares them. A cost at or above IMPASSABLE cannot
// be entered at all.

const IMPASSABLE = 999

// Phase 1 uses road: 0.5 so roads are meaningfully faster
const MOVEMENT_COSTS = {
  plains: 1.0,
  road:   0.5,
  hill:   1.5,
  forest: 2.0,
  marsh:  3.0,
  river:  IMPASSABLE,
  ford:   1.5,
  bridge: 0.5
}

module.exports = { MOVEMENT_COSTS, IMPASSABLE }
