// src/phase2-combat/balance/duel.js
//
// One pairing, fought to resolution. Two units placed in contact and never
// moved — phase 2's scope exactly: "two units placed in contact, whittling each
// other over rounds until rout or destruction."
//
// This is deliberately NOT the scenario runner. The scenario runner exists to
// test movement plus combat on real terrain and stops when its order script
// runs out; a duel has no movement and must run until the engagement actually
// ends, because rounds-to-resolution is the number the whole design is tuned
// against.

const { createCombatResolver } = require('../combat')
const { createRng } = require('../harness/rng')
const { createWorld } = require('../harness/world')
const T = require('../combat/tables')

// Well past the 8-round design cap. A duel that reaches this is a stalemate,
// which is a finding, not an error — the report says so and the assertions
// fail on it.
const HARD_ROUND_CAP = 40

// Two adjacent tiles on flat open ground. Terrain is passed per side so a
// pairing can be fought uphill or mid-ford without moving anybody.
const LEFT_TILE = 'H10'
const RIGHT_TILE = 'H11'

/**
 * @param {Object} spec
 * @param {Object} spec.a            unit spec (harness shape, minus position)
 * @param {Object} spec.b
 * @param {number} [spec.seed]
 * @param {string} [spec.aTerrain]   phase 1 terrain key under A
 * @param {string} [spec.bTerrain]
 * @param {Object} [spec.prepared]   { a: bool, b: bool } — braced to receive
 * @param {Object} [spec.charging]   { a: bool, b: bool } — closed into contact
 * @param {string} [spec.situation]  key into SITUATION_CHAOS
 * @param {boolean} [spec.trace]     keep the per-round event log
 * @returns {Object} outcome record
 */
function duel(spec) {
  const {
    a, b, seed = 1,
    aTerrain = 'plains', bTerrain = 'plains',
    prepared = {}, charging = {}, situation = 'meeting_engagement',
    trace = false
  } = spec

  const world = createWorld({
    units: [
      { ...a, id: 'a', side: 'a', position: LEFT_TILE },
      { ...b, id: 'b', side: 'b', position: RIGHT_TILE }
    ]
  })

  const engagements = [{
    aId: 'a', bId: 'b', distance: 1, aTerrain, bTerrain
  }]

  const resolver = createCombatResolver({
    situation,
    prepared: { a: prepared.a, b: prepared.b },
    charging: { a: charging.a, b: charging.b }
  })
  const random = createRng(seed)

  const unitA = world.units.find(u => u.id === 'a')
  const unitB = world.units.find(u => u.id === 'b')
  const events = []

  let rounds = 0
  let resolution = 'stalemate'

  for (let round = 1; round <= HARD_ROUND_CAP; round++) {
    rounds = round

    const result = resolver({ engagements, world, random, turn: round })
    if (trace) events.push(...result.events)

    for (const casualty of result.casualties) {
      const unit = world.units.find(u => u.id === casualty.unitId)
      unit.strength = Math.max(0, unit.strength - casualty.killed)
    }

    const stateA = resolver.getState('a')
    const stateB = resolver.getState('b')

    if (unitA.strength === 0 || unitB.strength === 0) {
      resolution = 'destruction'
      break
    }
    if (stateA?.routed || stateB?.routed) {
      resolution = 'rout'
      break
    }
  }

  const stateA = resolver.getState('a') ?? {}
  const stateB = resolver.getState('b') ?? {}

  const winner = decideWinner(unitA, unitB, stateA, stateB)

  return {
    winner,                       // 'a' | 'b' | 'draw'
    resolution,                   // 'rout' | 'destruction' | 'stalemate'
    rounds,
    seed,
    a: sideRecord(unitA, stateA, a),
    b: sideRecord(unitB, stateB, b),
    // Survivor share of the winning side — the design doc asks for this
    // explicitly, because a win at 5% strength is not the same as a win at 60%.
    survivorPct: survivorPct(winner, unitA, unitB),
    events
  }
}

function decideWinner(unitA, unitB, stateA, stateB) {
  // Destruction first: a dead unit has lost however its morale looked.
  if (unitA.strength === 0 && unitB.strength === 0) return 'draw'
  if (unitA.strength === 0) return 'b'
  if (unitB.strength === 0) return 'a'

  // [locked decision 6] Only one side can be routed — the mutual case is
  // blocked in the resolver, so this never has to break a tie.
  if (stateA.routed && stateB.routed) return 'draw'
  if (stateA.routed) return 'b'
  if (stateB.routed) return 'a'

  // Neither broke inside the hard cap. That is a stalemate and it is reported
  // as a draw rather than awarded on points — scoring it would hide exactly
  // the failure the 8-round assertion is looking for.
  return 'draw'
}

function survivorPct(winner, unitA, unitB) {
  if (winner === 'a') return unitA.strength / unitA.maxStrength
  if (winner === 'b') return unitB.strength / unitB.maxStrength
  return 0
}

function sideRecord(unit, state, spec) {
  return {
    quality: spec.quality ?? 'militia',
    weapon: spec.primaryWeapon ?? T.DEFAULT_WEAPON,
    armor: spec.armor ?? 'medium_armor',
    shield: spec.shield ?? 'medium_shield',
    mounted: Boolean(spec.mounted),
    cost: costOf(spec),
    strength: unit.strength,
    maxStrength: unit.maxStrength,
    survivorPct: unit.strength / unit.maxStrength,
    morale: state.morale ?? T.MORALE.START,
    stamina: state.stamina ?? 0,
    routed: Boolean(state.routed)
  }
}

// Army-builder value, per 100 troops. [design contract] "All balancing
// normalized per 100 troops; army-builder cost is the exchange rate."
//
// Only the fields phase 2 models are priced. Weapons and mounts carry costs in
// armyData that the Phase 7 builder rebuild will re-derive after the Q6-Q8
// rulings land, so pricing them here would bake in numbers that are known to be
// changing. Quality, armour and shield are the three that phase 2 actually
// reads, and they are enough to compare like with like.
function costOf(spec) {
  const quality = T.QUALITY_TIERS[spec.quality] ?? T.QUALITY_TIERS.militia
  const armor = ARMOR_COST[spec.armor] ?? 0
  const shield = SHIELD_COST[spec.shield] ?? 0
  const mount = spec.mounted ? MOUNT_COST : 0
  return quality.cost + armor + shield + mount
}

// [salvage] armyData ARMOR_CATEGORIES / SHIELD_OPTIONS / MOUNT_OPTIONS costs.
const ARMOR_COST = { no_armor: 0, light_armor: 0, medium_armor: 1, heavy_armor: 2 }
const SHIELD_COST = { no_shield: 0, light_shield: 0, medium_shield: 1, heavy_shield: 2 }
const MOUNT_COST = 3

module.exports = { duel, costOf, HARD_ROUND_CAP }
