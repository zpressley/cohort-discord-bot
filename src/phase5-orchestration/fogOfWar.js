// src/phase5-orchestration/fogOfWar.js
//
// What each side knows about the other. The numbers come from the roadmap's
// scale conversion table (§6): the old docs' vision ranges were written for
// 50m tiles and double at 25m — standard 6 tiles, scouts 10, +4 when standing
// on high ground.
//
// Intel has three tiers, per the old FOG feature intent:
//   visible   a friendly unit can see it right now — position and strength
//             are current
//   ghost     seen before, not visible now — last known position and
//             strength, going stale (the classic "they were at the ford two
//             hours ago")
//   unknown   never seen; the unit does not appear in intel at all
//
// Line of sight is plain range for now: a forest hides nothing it should.
// Terrain-blocking LOS is deliberately deferred to phase 8's ranged-combat
// work, where the old docs' LOS rules land — flagged, not forgotten.

const { tileDistance } = require('../phase2-combat/harness/world')
const { getCell } = require('../phase1-movement/mapData')
const { tables: T } = require('../phase2-combat/combat')

const VISION = {
  STANDARD: 6,       // [§6] was 3 tiles at 50m
  SCOUT: 10,         // [§6] was 5
  ELEVATED_BONUS: 4  // [§6] was +2
}

function visionRange(unit) {
  const base = (unit.role === 'scout' || unit.role === 'scouts')
    ? VISION.SCOUT
    : VISION.STANDARD
  const elevated = T.HIGH_GROUND_TERRAIN.includes(getCell(unit.position).terrain)
  return base + (elevated ? VISION.ELEVATED_BONUS : 0)
}

// One side's intel ledger. Serializable — it is part of what the DB persists.
function createIntel() {
  return { known: {} } // enemyId -> { status, position, strength, seenOnTurn }
}

/**
 * Update one side's intel from the current world. Mutates the ledger and
 * returns the ids of enemies sighted THIS update that were not visible in the
 * last one — the orchestrator's elastic time interrupts on exactly that.
 */
function updateIntel(intel, world, side, turn) {
  const friendlies = world.units.filter(u => u.side === side && u.strength > 0)
  const enemies = world.units.filter(u => u.side !== side && u.strength > 0)
  const sightings = []

  const visibleNow = new Set()
  for (const enemy of enemies) {
    const seen = friendlies.some(f =>
      tileDistance(f.position, enemy.position) <= visionRange(f))
    if (!seen) continue

    visibleNow.add(enemy.id)
    const previous = intel.known[enemy.id]
    if (!previous || previous.status !== 'visible') {
      sightings.push(enemy.id)
    }
    intel.known[enemy.id] = {
      status: 'visible',
      position: enemy.position,
      strength: enemy.strength,
      seenOnTurn: turn
    }
  }

  // Anything known but not currently visible goes stale — the ghost keeps the
  // LAST seen position and strength, which is the whole point: the player
  // reasons from old information, and the engine never corrects them.
  for (const [enemyId, entry] of Object.entries(intel.known)) {
    if (!visibleNow.has(enemyId) && entry.status === 'visible') {
      entry.status = 'ghost'
    }
  }

  return sightings
}

// What a side is allowed to be shown: its own units in full, plus its intel.
// This is the single view the Discord layer will render — nothing else about
// the enemy ever leaves the engine.
function sideView(world, side, intel) {
  return {
    own: world.units
      .filter(u => u.side === side)
      .map(u => ({ id: u.id, position: u.position, strength: u.strength, maxStrength: u.maxStrength })),
    intel: Object.entries(intel.known)
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
}

module.exports = { VISION, visionRange, createIntel, updateIntel, sideView }
