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
//   4. objective control  holding every named objective for an hour of
//                         battle time (Stage 3; or, if the spec says so, N
//                         consecutive player turns) wins the field
//                         or, with several, as many of them as the spec
//                         says (objectivesNeeded; ruled 2026-11-25)
//   5. night              the end of the day: the battle ends with no winner
//                         ('night fell'; ruled 2026-11-24); in a pitched
//                         battle (spec.kind 'pitched', ruled 2026-11-25) a
//                         side still standing with PITCHED.STAND_SHARE of
//                         its men, when the other is not, wins ('field held
//                         at nightfall')
//   6. time limit         when set (a testing aid): more objectives held
//                         wins, then fewer losses
//
// Commander loss belongs here too eventually, but the commander entity is
// explicitly deferred to phase 8 (ruling R6) — flagged, not forgotten.

const { unitsOnSide, sides } = require('../world')
const { tileDistance } = require('../world')
const { checkBattleOutcome, commandersOutcome, yieldedOutcome } = require('../battle/battle')
const { toPosition, positionKey } = require('../map/labels')
const { parseGridRef } = require('../map/grid')
const { detectFeatures } = require('../map/features')

const COLLAPSE_FRACTION = 0.20   // [old docs] army destruction threshold
const OBJECTIVE_TURNS_TO_WIN = 3 // [old docs] consecutive turns of control
// Stage 3 plan F3: an hour of battle time (combat/tables.js, GROUND).
const OBJECTIVE_HOLD_MINUTES = require('../combat/tables').GROUND.HOLD_MINUTES
const { PITCHED } = require('../combat/tables')

// The share of the men a side began the day with that still stand in its
// ranks: in units on the field, not broken (a pitched battle's nightfall).
function standShare(world, broken, side, startingStrength) {
  const start = startingStrength[side]
  if (!start) return 0
  const now = unitsOnSide(world, side).filter(u => !broken.has(u.id)).reduce((n, u) => n + Math.max(0, u.strength), 0)
  return now / start
}

/**
 * An objective as the spec gives it, made into ground: { id, name, tiles,
 * single }. A spec names it one of four ways:
 *   coord    one tile (a position or label); held from on it or beside it
 *   square   a grid square or quarter ("C7", "C7-NE"); held from inside it
 *   feature  a named feature of the map ("Harrow Bridge"); held from on it
 *   tiles    a list of tiles; held from on them
 * `reach` (tiles), if given, is how near the ground a unit holds it from:
 * 1 for a crossing, which is held from on it or at either end (a map's
 * own ground, src/data/maps).
 */
function objectiveArea(map, objective) {
  const base = { id: objective.id, name: objective.name ?? objective.id, ...(Number.isInteger(objective.reach) ? { reach: objective.reach } : {}) }
  if (objective.coord !== undefined) {
    const coord = toPosition(objective.coord)
    return { ...base, coord, tiles: [coord], single: true }
  }
  if (objective.square) {
    const ref = parseGridRef(objective.square)
    if (!ref) throw new Error(`objective ${objective.id}: "${objective.square}" is not a grid square`)
    const tiles = []
    for (let y = ref.tiles.minY; y <= ref.tiles.maxY; y++) {
      for (let x = ref.tiles.minX; x <= ref.tiles.maxX; x++) {
        if (map.inBounds({ x, y })) tiles.push({ x, y })
      }
    }
    return { ...base, name: objective.name ?? ref.label, tiles, single: false }
  }
  if (objective.feature) {
    const wanted = objective.feature.toLowerCase()
    const feature = detectFeatures(map).find(f => f.name && f.name.toLowerCase() === wanted)
    if (!feature) throw new Error(`objective ${objective.id}: no feature named "${objective.feature}"`)
    return { ...base, name: objective.name ?? feature.name, tiles: feature.tiles.map(t => ({ ...t })), single: false }
  }
  if (objective.tiles) {
    return { ...base, tiles: objective.tiles.map(toPosition), single: false }
  }
  throw new Error(`objective ${objective.id} names no ground (coord, square, feature or tiles)`)
}

// Which side controls an objective: effective units of exactly one side on
// it (or, for a single-tile objective, on or beside it). Contested or empty
// is nobody's.
function objectiveController(world, broken, objective) {
  const tiles = objective.tiles ?? [objective.coord]
  const reach = objective.reach ?? (objective.single === false ? 0 : 1)
  const keys = new Set(tiles.map(positionKey))
  const near = reach === 0
    ? (unit) => keys.has(positionKey(unit.position))
    : (unit) => tiles.some(t => tileDistance(unit.position, t) <= reach)
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
    objectiveTurnsToWin = null, objectiveHoldMinutes = OBJECTIVE_HOLD_MINUTES,
    minutesElapsed = 0, timeLimitMinutes = null, fledStrength = {}
  } = ctx

  if (surrendered) {
    const winner = sides(world).find(s => s !== surrendered) ?? 'draw'
    // A Commander in the enemy's hands who gave up a unit to go free.
    return { decided: true, winner, reason: ctx.bargained ? 'enemy commander bargained' : 'enemy surrendered' }
  }

  // A Commander killed loses the battle for his side.
  const fell = commandersOutcome(ctx.commanders, ctx.allSides ?? sides(world))
  if (fell) return fell
  // His senior officer yielded the field while he was held.
  const yielded = yieldedOutcome(ctx.yielded, ctx.allSides ?? sides(world))
  if (yielded) return yielded

  const broken_ = checkBattleOutcome(world, broken, ctx.isShaken, ctx.holdsOut ?? null)
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

  // Objectives: one side must hold ALL of them, each long enough: an hour
  // of battle time, or as many consecutive player turns as the spec says.
  // Holding two of three fords is pressure, not victory, unless the spec
  // says some of them are enough (objectivesNeeded, below).
  const holds = Object.values(objectiveHolds)
  const objectiveCount = ctx.objectiveCount ?? holds.length
  const heldLongEnough = (h) => objectiveTurnsToWin
    ? h.turns >= objectiveTurnsToWin
    : minutesElapsed - (h.sinceMinute ?? minutesElapsed) >= objectiveHoldMinutes
  // Several grounds and some of them to hold (ruled 2026-11-25: "controlling
  // 2 fords wins the game"): a side holding that many, each alone, for the
  // hour wins; the hour runs while he holds at least that many
  // (ctx.fieldHold, kept by the orchestrator) and starts again when he
  // does not.
  const needed = ctx.objectivesNeeded ?? null
  if (needed && needed < objectiveCount) {
    const f = ctx.fieldHold
    if (f && minutesElapsed - f.sinceMinute >= objectiveHoldMinutes) {
      return { decided: true, winner: f.side, reason: 'objectives held' }
    }
  } else if (holds.length > 0 && holds.length === objectiveCount) {
    for (const side of sides(world)) {
      const holdsAll = holds.every(h => h.side === side && heldLongEnough(h))
      if (holdsAll) {
        return { decided: true, winner: side, reason: 'objectives held' }
      }
    }
  }

  // The end of the day (ruled 2026-11-24: "No the day just ends the
  // battle, you can choose to fight again the next day"): night ends the
  // fighting and neither side has won. Who would have had it by the time
  // limit's rule is kept as `ahead` (a side, or null), for the harness's
  // own tables only: the game never calls it a win.
  if (ctx.dayOver) {
    // A pitched battle (ruled 2026-11-25: "A tie is where both armies are
    // surviving with some % of their troops by the end of the day"): at
    // nightfall a side still standing with PITCHED.STAND_SHARE of the men
    // it began the day with, when the other is not, has held the field.
    if (ctx.kind === 'pitched') {
      const all = ctx.allSides ?? sides(world)
      const standing = all.filter(side => standShare(world, broken, side, startingStrength) >= PITCHED.STAND_SHARE)
      if (standing.length === 1) return { decided: true, winner: standing[0], reason: 'field held at nightfall' }
    }
    const by = evaluateVictory({ ...ctx, dayOver: false, timeLimitMinutes: 1, minutesElapsed: Math.max(1, minutesElapsed) })
    return { decided: true, winner: 'draw', reason: 'night fell', ahead: by.winner === 'draw' ? null : by.winner }
  }

  // Time limit (a testing aid, ruled 2026-10-21): when the clock runs out,
  // the side that lost the larger share of its men loses. Men who fled the
  // field are not casualties. A share exactly equal is a draw.
  if (timeLimitMinutes && minutesElapsed >= timeLimitMinutes) {
    // More objectives held decides first (Stage 3 plan F3).
    const heldBy = (side) => holds.filter(h => h.side === side).length
    const byObjectives = sides(world).map(side => ({ side, held: heldBy(side) }))
      .sort((a, b) => b.held - a.held)
    if (byObjectives.length >= 2 && byObjectives[0].held > byObjectives[1].held) {
      return { decided: true, winner: byObjectives[0].side, reason: 'time ran out: held more objectives' }
    }
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
  objectiveArea,
  standShare,
  COLLAPSE_FRACTION,
  OBJECTIVE_TURNS_TO_WIN,
  OBJECTIVE_HOLD_MINUTES
}
