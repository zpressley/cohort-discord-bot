// src/engine/orchestrator/victory.js
//
// The four ways a battle ends, from the roadmap's phase 5 list (old VIC-002),
// checked in priority order:
//
//   1. surrender          a commander explicitly yields — always honoured first
//   2. army broken        phase 4's rule: no effective units left (destroyed,
//                         broken, or fled — morale collapse is this rule, since
//                         a fully routed army has no effective units)
//   3. strength collapse  a side below 20% of its starting men has ceased to
//                         exist as a fighting force even if units still stand
//   4. objective control  holding every named objective for N consecutive
//                         player turns (default 3) wins the field
//
// Commander loss belongs here too eventually, but the commander entity is
// explicitly deferred to phase 8 (ruling R6) — flagged, not forgotten.

const { unitsOnSide, sides } = require('../world')
const { tileDistance } = require('../world')
const { checkBattleOutcome } = require('../battle/battle')

const COLLAPSE_FRACTION = 0.20   // [old docs] army destruction threshold
const OBJECTIVE_TURNS_TO_WIN = 3 // [old docs] consecutive turns of control

// Which side controls an objective: an effective unit of exactly one side on
// or adjacent to the tile. Contested or empty is nobody's.
function objectiveController(world, broken, objective) {
  const near = (unit) => tileDistance(unit.position, objective.coord) <= 1
  const holders = sides(world).filter(side =>
    unitsOnSide(world, side).some(u => !broken.has(u.id) && near(u)))
  return holders.length === 1 ? holders[0] : null
}

/**
 * Evaluate every end condition.
 *
 * @param {Object} ctx
 * @param {Object} ctx.world
 * @param {Set}    ctx.broken            phase 4's broken set
 * @param {string|null} ctx.surrendered  side that yielded, if any
 * @param {Object} ctx.startingStrength  side -> men at battle start
 * @param {Object} ctx.objectiveHolds    objectiveId -> { side, turns } —
 *                                       maintained by the orchestrator
 * @param {number} [ctx.objectiveTurnsToWin]
 * @param {number} [ctx.minutesElapsed]     battle time so far
 * @param {number} [ctx.timeLimitMinutes]   when set, the battle ends at this
 *                                          time; the side that lost the
 *                                          larger share of its men loses
 * @param {Object} [ctx.fledStrength]       side -> men who left the field
 * @returns {{decided, winner, reason}}
 */
function evaluateVictory(ctx) {
  const {
    world, broken, surrendered = null,
    startingStrength = {}, objectiveHolds = {},
    objectiveTurnsToWin = OBJECTIVE_TURNS_TO_WIN,
    minutesElapsed = 0, timeLimitMinutes = null, fledStrength = {}
  } = ctx

  if (surrendered) {
    const winner = sides(world).find(s => s !== surrendered) ?? 'draw'
    return { decided: true, winner, reason: 'enemy surrendered' }
  }

  const broken_ = checkBattleOutcome(world, broken)
  if (broken_.decided) return broken_

  // Strength collapse. Checked for both sides; if both collapse in the same
  // turn the battle is a draw of mutual ruin.
  const collapsed = sides(world).filter(side => {
    const start = startingStrength[side]
    if (!start) return false
    const now = unitsOnSide(world, side).reduce((sum, u) => sum + u.strength, 0)
    return now < start * COLLAPSE_FRACTION
  })
  if (collapsed.length === 1) {
    const winner = sides(world).find(s => s !== collapsed[0])
    return { decided: true, winner, reason: 'enemy army collapsed' }
  }
  if (collapsed.length > 1) {
    return { decided: true, winner: 'draw', reason: 'mutual ruin' }
  }

  // Objectives: one side must hold ALL of them, each for enough consecutive
  // turns. Holding two of three fords is pressure, not victory.
  const holds = Object.values(objectiveHolds)
  if (holds.length > 0) {
    for (const side of sides(world)) {
      const holdsAll = holds.every(h => h.side === side && h.turns >= objectiveTurnsToWin)
      if (holdsAll) {
        return { decided: true, winner: side, reason: 'objectives held' }
      }
    }
  }

  // Time limit (a testing aid, ruled 2026-10-21): when the clock runs out,
  // the side that lost the larger share of its men loses. Men who fled the
  // field are not casualties. A share exactly equal is a draw.
  if (timeLimitMinutes && minutesElapsed >= timeLimitMinutes) {
    const lostShare = (side) => {
      const start = startingStrength[side] ?? 0
      if (!start) return 0
      const standing = unitsOnSide(world, side).reduce((sum, u) => sum + u.strength, 0)
      return (start - standing - (fledStrength[side] ?? 0)) / start
    }
    const ranked = sides(world).map(side => ({ side, lost: lostShare(side) }))
      .sort((a, b) => a.lost - b.lost)
    if (ranked.length >= 2 && ranked[0].lost < ranked[1].lost) {
      return { decided: true, winner: ranked[0].side, reason: 'time ran out: fewer losses' }
    }
    return { decided: true, winner: 'draw', reason: 'time ran out: equal losses' }
  }

  return { decided: false, winner: null, reason: null }
}

module.exports = {
  evaluateVictory,
  objectiveController,
  COLLAPSE_FRACTION,
  OBJECTIVE_TURNS_TO_WIN
}
