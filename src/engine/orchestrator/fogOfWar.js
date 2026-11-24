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
const { reportGrade, reportOf, join, fuller } = require('./reports')

// One side's intel ledger. Serializable — it is part of what the DB persists.
// Each entry's `told` is what his side's reports of it hold, by the
// officer of each unit that saw it (reports.js): what may be shown to a
// player. The rest is the side's own knowledge, as the computer plans by.
function createIntel() {
  return { known: {} } // enemyId -> { status, position, strength, seenOnTurn, role, mounted, primaryWeapon, told }
}

/**
 * What a Commander brings out of the enemy's hands: where each enemy unit
 * stood as he left, heard in their own camp. Each one his side cannot see
 * now is known as last seen there, this turn.
 */
function learnFromCaptivity(intel, world, side, turn) {
  for (const enemy of world.units.filter(u => u.side !== side && u.strength > 0)) {
    if (intel.known[enemy.id]?.status === 'visible') continue
    intel.known[enemy.id] = {
      status: 'ghost',
      position: { ...enemy.position },
      strength: enemy.strength,
      seenOnTurn: turn,
      role: enemy.role ?? null,
      mounted: Boolean(enemy.mounted),
      primaryWeapon: enemy.primaryWeapon ?? null,
      // Heard in their camp: where each stood, no more (a guess).
      told: join(intel.known[enemy.id]?.told, { grade: 'none', on: turn })
    }
  }
}

/**
 * Update one side's intel from the current world. Mutates the ledger and
 * returns the ids of enemies sighted THIS update that were not visible in the
 * last one — the orchestrator's elastic time interrupts on exactly that.
 */
function updateIntel(intel, world, side, turn, map, hidden = new Map(), stateOf = () => null) {
  const friendlies = world.units.filter(u => u.side === side && u.strength > 0)
  const enemies = world.units.filter(u => u.side !== side && u.strength > 0)
  const sightings = []

  const visibleNow = new Set()
  for (const enemy of enemies) {
    // A hidden enemy (battle/hiding.js) is seen only as closely as its
    // cover allows.
    const options = hidden.has(enemy.id) ? { seenWithin: hidden.get(enemy.id).seenWithin } : {}
    const seers = friendlies.filter(f => canSee(map, f, enemy, options))
    if (seers.length === 0) continue

    visibleNow.add(enemy.id)
    const previous = intel.known[enemy.id]
    if (!previous || previous.status !== 'visible') {
      sightings.push(enemy.id)
    }
    intel.known[enemy.id] = {
      status: 'visible',
      position: { ...enemy.position },
      strength: enemy.strength,
      seenOnTurn: turn,
      // What kind of troops they are, as anyone who saw them could tell:
      // so a Commander can name them ("their archers", "the enemy horse").
      role: enemy.role ?? null,
      mounted: Boolean(enemy.mounted),
      primaryWeapon: enemy.primaryWeapon ?? null,
      // What the reports of it tell, by the best officer who saw it.
      told: join(previous?.told, reportOf(enemy, seers.reduce((g, f) => fuller(g, reportGrade(f)), null), turn, () => stateOf(enemy)))
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

module.exports = { VISION, visionRange, createIntel, updateIntel, sideView, learnFromCaptivity }
