// src/phase2-combat/balance/matrix.js
//
// The full matchup matrix: every pairing, N seeded simulations each.
//
// [design contract] "Run every unit-type pairing, N simulations each (suggest
// N=200), at equal per-100 cost, both flat terrain and with prepared/surprise
// variants. All randomness flows through the chaos scalar, so a seeded RNG
// makes every run reproducible — a failing sim can be replayed exactly."
//
// Every run is (pairing, seed), so any row in a report can be replayed on its
// own with the seed it names.

const { duel } = require('./duel')
const T = require('../combat/tables')

const DEFAULT_SIMS = 200

// ── The archetypes ─────────────────────────────────────
//
// The matrix is over ARCHETYPES, not over raw quality tiers, because the
// interesting questions are about kit and role as much as training: spears vs
// horses, heavy vs light, archers caught in melee. Each archetype fixes a
// weapon, armour and shield; the tier ladder is swept separately for the mirror
// assertions, where kit must be held constant.

const ARCHETYPES = {
  heavy_infantry: {
    label: 'heavy infantry',
    primaryWeapon: 'sword_standard', armor: 'heavy_armor', shield: 'heavy_shield'
  },
  medium_infantry: {
    label: 'medium infantry',
    primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield'
  },
  light_infantry: {
    label: 'light infantry',
    primaryWeapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield'
  },
  spearmen: {
    label: 'spearmen',
    primaryWeapon: 'spear_professional', armor: 'medium_armor', shield: 'medium_shield'
  },
  pikemen: {
    label: 'pikemen',
    primaryWeapon: 'macedonian_sarissa', armor: 'light_armor', shield: 'no_shield'
  },
  maceman: {
    label: 'macemen',
    primaryWeapon: 'heavy_mace', armor: 'medium_armor', shield: 'no_shield'
  },
  archers: {
    // [notebook] Archers cannot use ranged attacks while under melee attack.
    // In a duel they are always under melee attack, so this archetype exists to
    // measure exactly how badly that goes.
    label: 'archers (in melee)',
    primaryWeapon: 'greek_composite_bow', armor: 'light_armor', shield: 'no_shield'
  },
  cavalry: {
    label: 'cavalry',
    primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield',
    mounted: true
  },
  lancers: {
    label: 'lancers',
    primaryWeapon: 'persian_kontos', armor: 'medium_armor', shield: 'no_shield',
    mounted: true
  }
}

function makeUnit(archetypeKey, quality, overrides = {}) {
  const archetype = ARCHETYPES[archetypeKey]
  if (!archetype) throw new Error(`unknown archetype: ${archetypeKey}`)

  const tier = T.QUALITY_TIERS[quality]
  if (!tier) throw new Error(`unknown quality: ${quality}`)

  return {
    archetype: archetypeKey,
    quality,
    primaryWeapon: archetype.primaryWeapon,
    armor: archetype.armor,
    shield: archetype.shield,
    mounted: Boolean(archetype.mounted),
    strength: tier.size,
    maxStrength: tier.size,
    ...overrides
  }
}

// ── One pairing across many seeds ──────────────────────

/**
 * @returns {Object} aggregate statistics for a single pairing
 */
function runPairing(a, b, options = {}) {
  const {
    sims = DEFAULT_SIMS,
    aTerrain = 'plains', bTerrain = 'plains',
    prepared = {}, charging = {}, situation = 'meeting_engagement'
  } = options

  const runs = []
  for (let seed = 1; seed <= sims; seed++) {
    runs.push(duel({ a, b, seed, aTerrain, bTerrain, prepared, charging, situation }))
  }

  const wins = { a: 0, b: 0, draw: 0 }
  const resolutions = { rout: 0, destruction: 0, stalemate: 0 }
  const roundCounts = []
  const survivorPcts = []
  let aRouts = 0
  let bRouts = 0

  for (const run of runs) {
    wins[run.winner]++
    resolutions[run.resolution]++
    roundCounts.push(run.rounds)
    if (run.winner !== 'draw') survivorPcts.push(run.survivorPct)
    if (run.a.routed) aRouts++
    if (run.b.routed) bRouts++
  }

  return {
    sims,
    wins,
    winRateA: wins.a / sims,
    winRateB: wins.b / sims,
    drawRate: wins.draw / sims,
    resolutions,
    stalemateRate: resolutions.stalemate / sims,
    rounds: distribution(roundCounts),
    survivorPct: mean(survivorPcts),
    routRateA: aRouts / sims,
    routRateB: bRouts / sims,
    costA: runs[0].a.cost,
    costB: runs[0].b.cost,
    // One traced run, so the damage and stamina curves can be eyeballed rather
    // than inferred from aggregates. The design doc asks for this by name.
    sample: duel({ a, b, seed: 1, aTerrain, bTerrain, prepared, charging, situation, trace: true })
  }
}

// ── The full matrix ────────────────────────────────────

/**
 * Every archetype against every archetype at one quality tier.
 */
function runMatrix(options = {}) {
  const {
    quality = 'professional',
    archetypes = Object.keys(ARCHETYPES),
    sims = DEFAULT_SIMS,
    ...pairingOptions
  } = options

  const cells = []

  for (let i = 0; i < archetypes.length; i++) {
    for (let j = i; j < archetypes.length; j++) {
      const aKey = archetypes[i]
      const bKey = archetypes[j]

      const result = runPairing(
        makeUnit(aKey, quality),
        makeUnit(bKey, quality),
        { sims, ...pairingOptions }
      )

      cells.push({ a: aKey, b: bKey, mirror: aKey === bKey, ...result })
    }
  }

  return { quality, sims, cells }
}

/**
 * Every quality tier against itself, kit held constant. This is the sweep the
 * monotonic-rounds assertion reads: rounds-to-resolution must rise with tier.
 */
function runMirrorLadder(options = {}) {
  const {
    archetype = 'medium_infantry',
    tiers = T.QUALITY_ORDER,
    sims = DEFAULT_SIMS,
    ...pairingOptions
  } = options

  const rungs = []
  for (const quality of tiers) {
    const unit = makeUnit(archetype, quality)
    rungs.push({
      quality,
      ...runPairing(unit, { ...unit }, { sims, ...pairingOptions })
    })
  }

  return { archetype, sims, rungs }
}

// ── Statistics ─────────────────────────────────────────

function distribution(values) {
  if (values.length === 0) return { mean: 0, min: 0, max: 0, median: 0, histogram: {} }

  const sorted = [...values].sort((x, y) => x - y)
  const histogram = {}
  for (const value of values) histogram[value] = (histogram[value] ?? 0) + 1

  return {
    mean: mean(values),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
    histogram
  }
}

function mean(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

module.exports = {
  ARCHETYPES,
  makeUnit,
  runPairing,
  runMatrix,
  runMirrorLadder,
  DEFAULT_SIMS
}
