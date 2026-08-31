// src/phase3-movement/initiative.js
//
// Who moves first when everybody moves at once.
//
// The roadmap (Phase 3): "initiative by speed tier (scouts -> siege)". Faster
// troops commit to ground before slower ones, so when two units race for the
// same tile the scout wins it and the siege train finds it taken. Within a
// tier the tie-break is unit id, the same rule the phase 2 harness uses
// everywhere — deterministic, roster-order independent.
//
// The tier is derived from what the unit IS rather than stored on it, so a
// scenario cannot accidentally declare a siege train fast.

const TIERS = ['scout', 'cavalry', 'light', 'medium', 'heavy', 'siege']

// Lower number moves earlier.
function initiativeTier(unit) {
  if (unit.role === 'scout' || unit.role === 'scouts') return 0
  if (unit.mounted) return 1
  if (unit.role === 'siege' || unit.role === 'siege_engine') return 5

  // Foot troops sort by kit weight — the same axis that drives stamina drain.
  switch (unit.armor) {
    case 'heavy_armor': return 4
    case 'medium_armor': return 3
    default: return 2 // light_armor, no_armor, or unspecified
  }
}

function tierName(unit) {
  return TIERS[initiativeTier(unit)]
}

// Sort a roster into movement order: tier, then unit id.
function inInitiativeOrder(units) {
  return [...units].sort((a, b) =>
    initiativeTier(a) - initiativeTier(b) || a.id.localeCompare(b.id))
}

module.exports = { initiativeTier, tierName, inInitiativeOrder, TIERS }
