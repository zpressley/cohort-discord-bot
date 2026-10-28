// src/engine/orchestrator/fogOfWar.js
//
// What each side knows about the other.
//
// Intel has three tiers, per the old FOG feature intent:
//   visible   a friendly unit can see it right now — position and strength
//             are current
//   ghost     seen before, not visible now — last known position and
//             strength, going stale (the classic "they were at the ford two
//             hours ago")
//   unknown   never seen; the unit does not appear in intel at all
//
// Who can see whom is map/sight.js: range (6, scouts 10, +4 on high ground),
// and since Stage 3 the ground too. Woods hide what is in them and block
// sight through them; a hill between two units blocks the view unless one
// of them stands on high ground.

const { VISION, visionRange, canSee } = require('../map/sight')

// One side's intel ledger. Serializable — it is part of what the DB persists.
function createIntel() {
  return { known: {} } // enemyId -> { status, position, strength, seenOnTurn }
}

/**
 * Update one side's intel from the current world. Mutates the ledger and
 * returns the ids of enemies sighted THIS update that were not visible in the
 * last one — the orchestrator's elastic time interrupts on exactly that.
 */
function updateIntel(intel, world, side, turn, map) {
  const friendlies = world.units.filter(u => u.side === side && u.strength > 0)
  const enemies = world.units.filter(u => u.side !== side && u.strength > 0)
  const sightings = []

  const visibleNow = new Set()
  for (const enemy of enemies) {
    const seen = friendlies.some(f => canSee(map, f, enemy))
    if (!seen) continue

    visibleNow.add(enemy.id)
    const previous = intel.known[enemy.id]
    if (!previous || previous.status !== 'visible') {
      sightings.push(enemy.id)
    }
    intel.known[enemy.id] = {
      status: 'visible',
      position: { ...enemy.position },
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
      .map(u => ({ id: u.id, position: { ...u.position }, strength: u.strength, maxStrength: u.maxStrength })),
    intel: Object.entries(intel.known)
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
}

module.exports = { VISION, visionRange, createIntel, updateIntel, sideView }
