// src/phase6-veterans/veterancy.js
//
// The earned axis. Roadmap phase 6 resolves an old-doc ambiguity as two
// distinct progressions:
//
//   Training tier  what you PURCHASED (levy...vet merc) — the army-builder
//                  axis, already live in phase 2's quality ladder
//   Veterancy      what the unit EARNED by surviving — applies on top of
//                  tier, most acutely to rout resistance
//
// The math is the legacy hybrid system, salvaged as intent (the old docs are
// authoritative for veteran-arc intent): every survivor banks one experience
// per battle, casualties take their experience to the grave with them, and
// recruits arrive knowing nothing. Average experience is what everything keys
// off — the design philosophy line in the old DB docs says why: "Losing 20
// veterans with high experience is devastating — not just numerically, but in
// terms of lost institutional knowledge."
//
// All pure functions over a plain serializable state object. No DB here; the
// repository in persistence.js stores whatever this produces.

// [salvage] EliteUnit.veteranLevel thresholds, by average experience.
const VETERAN_LEVELS = [
  { name: 'Recruit', min: 0 },
  { name: 'Seasoned', min: 1 },
  { name: 'Veteran', min: 3 },
  { name: 'Elite Veteran', min: 6 },
  { name: 'Legendary', min: 11 }
]

// [derived] Veterancy's teeth. The notebook: "Veterancy impacts everything,
// but morale most acutely -> resistance to routing. A veteran unit's main
// edge is that it *stays*." Each level above Recruit adds to the same
// resistance divisor phase 2's quality tiers feed (tierMorale * 0.38 there),
// sized so a Legendary unit gains about what two tiers of quality morale
// give — earned loyalty rivals bought discipline without eclipsing it.
const RESISTANCE_PER_LEVEL = 0.20

// [salvage] progression.js getUnitVeteranLevel — the simpler ladder for
// REGULAR units, keyed by battles fought, not average experience. Regular
// units do not track per-man experience; only the elite does.
function regularUnitLevel(battles) {
  if (battles >= 10) return 'legendary'
  if (battles >= 5) return 'veteran'
  if (battles >= 2) return 'seasoned'
  if (battles >= 1) return 'green'
  return 'fresh'
}

// [notebook] Naming milestones — the emotional core's clock.
function namingMilestone(battlesParticipated) {
  if (battlesParticipated >= 10) return 'legendary_status'
  if (battlesParticipated >= 5) return 'officer_personality'
  if (battlesParticipated >= 3) return 'unit_named'
  return null
}

function createVeteranState({ strength }) {
  return {
    strength,
    totalExperience: 0,
    battlesParticipated: 0
  }
}

function averageExperience(state) {
  if (state.strength === 0) return 0
  return Math.round((state.totalExperience / state.strength) * 100) / 100
}

function veteranLevel(state) {
  const avg = averageExperience(state)
  let level = VETERAN_LEVELS[0].name
  for (const rung of VETERAN_LEVELS) {
    if (avg >= rung.min) level = rung.name
  }
  return level
}

function levelIndex(state) {
  return VETERAN_LEVELS.findIndex(l => l.name === veteranLevel(state))
}

// The rout-resistance bonus a unit carries into phase 2's moraleResistance.
// Zero for a Recruit unit; the earned equivalent of quality-tier morale for
// a Legendary one.
function veteranResistance(state) {
  return levelIndex(state) * RESISTANCE_PER_LEVEL
}

/**
 * One battle's worth of experience. [salvage] EliteUnit.addBattleExperience,
 * order preserved exactly:
 *   1. every man who STARTED the battle and survived banks one experience
 *   2. the fallen take their share of the old average with them
 *
 * @param {Object} state      mutated
 * @param {number} survivors  men standing at the end (defaults to no losses)
 */
function applyBattle(state, { survivors = null } = {}) {
  const actualSurvivors = survivors ?? state.strength

  state.totalExperience += actualSurvivors
  state.battlesParticipated += 1

  if (survivors !== null && survivors < state.strength) {
    const casualties = state.strength - survivors
    // The average BEFORE this battle's banking — the men who died never
    // banked today's experience, but they carried everything before it.
    const avgBefore = state.strength === 0
      ? 0
      : Math.round(((state.totalExperience - actualSurvivors) / state.strength) * 100) / 100
    state.totalExperience -= Math.round(casualties * avgBefore)
    state.strength = survivors
  }

  return state
}

/**
 * Fresh recruits: numbers up, average down. [salvage] addRecruits — the
 * worked example in the old DB docs (65 veterans at 4.49 avg + 15 recruits =
 * 80 warriors at 3.65 avg) is pinned as a test.
 */
function addRecruits(state, count) {
  state.strength += count
  return state
}

module.exports = {
  VETERAN_LEVELS,
  RESISTANCE_PER_LEVEL,
  createVeteranState,
  averageExperience,
  veteranLevel,
  levelIndex,
  veteranResistance,
  applyBattle,
  addRecruits,
  regularUnitLevel,
  namingMilestone
}
