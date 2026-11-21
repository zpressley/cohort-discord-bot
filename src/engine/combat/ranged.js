// src/engine/combat/ranged.js
//
// Missile fire (ruled 2026-11-21: archers and other missile troops shoot).
// Pure: who can shoot, how far, and how many men a volley fells. The battle
// decides who shoots whom and when (battle/battle.js); the resolver applies
// the losses and what they do to morale (resolve.js, volley).
//
// A missile unit is one whose weapon reaches MISSILES.MIN_RANGE_M or more:
// bows, slings, crossbows. Javelins, darts and throwing axes are thrown in
// the charge, and stay inside the melee tables.

const T = require('./tables')
const R = require('./ratings')

const TILE_METRES = 25

/** How far this unit shoots, in tiles; 0 for a unit that does not shoot. */
function missileRange(unit) {
  const reach = R.resolveWeapon(unit).range ?? 0
  return reach >= T.MISSILES.MIN_RANGE_M ? Math.floor(reach / TILE_METRES) : 0
}

/** The same in metres, for telling a player. */
function missileRangeMetres(unit) {
  return missileRange(unit) * TILE_METRES
}

/**
 * Men felled by one volley, unrounded (the resolver carries the fraction).
 *
 * @param {Object} shooter
 * @param {Object} target
 * @param {Object} about
 * @param {number} about.distance        tiles between them
 * @param {string} [about.targetTerrain] the ground the target stands on
 * @param {boolean} [about.moved]        the shooters moved this tick (only
 *                                       mounted archers can)
 * @param {boolean} [about.inMelee]      the target is locked in a melee
 */
function volley(shooter, target, { distance, targetTerrain = 'plains', moved = false, inMelee = false } = {}) {
  const M = T.MISSILES
  const reach = missileRange(shooter)
  if (!reach || distance > reach || shooter.strength <= 0) return 0

  let felled = shooter.strength * M.RATE *
    (R.resolveWeapon(shooter).damage / M.NORMAL_DAMAGE) *
    R.effectivenessAgainst(shooter, target) *
    (M.SHIELD[target.shield] ?? 1)
  if (distance > reach / 2) felled *= M.LONG_SHOT
  if (targetTerrain === 'forest') felled *= M.IN_WOODS
  if (moved) felled *= M.ON_THE_MOVE
  if (inMelee) felled *= M.INTO_MELEE
  return felled
}

module.exports = { missileRange, missileRangeMetres, volley, TILE_METRES }
