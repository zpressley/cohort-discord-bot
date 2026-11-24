// src/engine/combat/ranged.js
//
// Missile fire (ruled 2026-11-21: archers and other missile troops shoot).
// Pure: who can shoot, how far, and how many men a volley fells. The battle
// decides who shoots whom and when (battle/battle.js); the resolver applies
// the losses and what they do to morale (resolve.js, volley).
//
// A missile unit is one whose weapon reaches MISSILES.MIN_RANGE_M or more:
// bows, slings, crossbows. Javelins, darts and throwing axes are a second
// weapon, thrown once as a unit comes to blows (thrownVolley).

const T = require('./tables')
const R = require('./ratings')
const P = require('./perks')
const { distance: tilesBetween } = require('../map/labels')

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
    R.missileEffectiveness(shooter, target) *
    (M.SHIELD[target.shield] ?? 1)
  if (distance > reach / 2) felled *= M.LONG_SHOT
  if (targetTerrain === 'forest') felled *= M.IN_WOODS
  // (The Parthian shot: horse archers whose people shoot as they ride
  // lose nothing for it; combat/perks.js.)
  if (moved) felled *= P.onTheMove(shooter)
  if (inMelee) felled *= M.INTO_MELEE
  return felled
}

/**
 * Men felled by a unit's thrown weapon (`thrown`: javelins, pila), loosed
 * once as it comes to blows (tables.THROWN): a volley as `volley` reckons
 * one, at close range, with the thrown weapon, times THROWN.CLOSE. 0 for a
 * unit with nothing left to throw.
 */
function thrownVolley(thrower, target, { targetTerrain = 'plains' } = {}) {
  const weapon = T.WEAPONS[thrower.thrown]
  if (!weapon || !((thrower.throws ?? 0) > 0) || thrower.strength <= 0) return 0
  const M = T.MISSILES
  let felled = thrower.strength * M.RATE * T.THROWN.CLOSE *
    (weapon.damage / M.NORMAL_DAMAGE) *
    ((weapon.effectiveness[R.armorClass(target)] ?? 50) / 100) *
    (M.SHIELD[target.shield] ?? 1)
  if (targetTerrain === 'forest') felled *= M.IN_WOODS
  return felled
}

// The friends a people's archers fight beside (tables.PERKS, `partner`):
// horse, or spearmen on foot.
const PARTNERS = {
  horse: (u) => Boolean(u.mounted),
  spear: (u) => !u.mounted && !missileRange(u) && R.isAntiCavalry(u)
}

/**
 * The weight of a missile unit's volley for the friends beside it (Kush's
 * archers with horse, Yayoi's with spearmen: combat/perks.js). 1 for a unit
 * with no such perk. `friends`: the living units of the battle.
 */
function alongside(shooter, friends) {
  return P.volleyEdge(shooter, friends, (f, kind) => PARTNERS[kind]?.(f) ?? false, tilesBetween)
}

module.exports = { missileRange, missileRangeMetres, volley, thrownVolley, alongside, TILE_METRES }
