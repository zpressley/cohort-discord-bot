// src/engine/combat/perks.js
//
// Each people's own perks in battle (docs/design/army-balance.md, part 9;
// the owner's doc, docs/Context/final_20_cultures_complete.txt, "Cultural
// Perks"). A unit carries the keys of the perks that are its own (`perks`,
// set at the muster: army/perks.js), and the numbers are tables.PERKS. A
// unit with none, as every unit of a duel or a scenario is, fights exactly
// as before: every function here gives 0, 1 or nothing for it.
//
// Pure: reads the unit and the tables, nothing else.

const T = require('./tables')

const NONE = []
function perksOf(unit) {
  const keys = unit?.perks
  if (!keys || keys.length === 0) return NONE
  return keys.map(k => T.PERKS?.[k]).filter(Boolean)
}

/** Does the unit carry this perk? */
const has = (unit, key) => Boolean(unit?.perks?.includes(key))

/** Added to the unit's morale resistance (Rome's discipline). */
function moraleEdge(unit) {
  let edge = 0
  for (const p of perksOf(unit)) edge += p.morale ?? 0
  return edge
}

/** The veterancy the unit fights at, at the least (Macedon's Silver Shields; Sparta's perioeci; Tibet's militia). */
function veterancyFloor(unit) {
  let floor = 0
  for (const p of perksOf(unit)) floor = Math.max(floor, p.veterancy ?? 0)
  return floor
}

/**
 * The morale at or under which the unit breaks: MORALE.ROUT_THRESHOLD, or
 * lower for men who fight on (Sparta: "Fight to the last man"; Samnium's
 * bravery; Germania's comitatus). `eliteBreakAt` is the elite's own.
 */
function routLine(unit) {
  let line = T.MORALE.ROUT_THRESHOLD
  for (const p of perksOf(unit)) {
    const at = (unit.quality === 'elite' ? p.eliteBreakAt : null) ?? p.breakAt
    if (at != null) line = Math.min(line, at)
  }
  return line
}

/**
 * Attack and defence the unit's perks give it in a fight: on its own ground
 * (hills, woods, open plain), against a bigger unit (the Berbers' small
 * bands), against an enemy already fighting another (Bactria's noble
 * cavalry). `ctx` is the round's context (ratings.attackRating).
 */
function fightEdge(unit, ctx = {}) {
  const list = perksOf(unit)
  if (list === NONE) return { attack: 0, defense: 0 }
  let attack = 0
  let defense = 0
  const terrain = ctx.terrain ?? 'plains'
  const flanked = (ctx.bonusAttack ?? 0) - (ctx.surprise ? T.SURPRISE.ATTACK : 0) > 0
  for (const p of list) {
    if (p.ground) {
      if (p.ground.includes(terrain)) { attack += p.attack ?? 0; defense += p.defense ?? 0 }
    } else if (p.dugIn) {
      if (ctx.prepared) defense += p.dugIn
    } else if (p.smaller) {
      if (ctx.enemy && unit.strength < ctx.enemy.strength) attack += p.smaller
    } else if (p.flanking) {
      if (flanked) attack += p.flanking
    }
  }
  return { attack, defense }
}

/** The share of an enemy's armour this unit's blows leave him (Maurya's wootz steel): 1 for most. */
function armorLeft(striker) {
  let left = 1
  for (const p of perksOf(striker)) left *= p.armor ?? 1
  return left
}

/** Of the men a blow would fell, the share saved (Persia's surgeons). */
function saved(unit) {
  let share = 0
  for (const p of perksOf(unit)) share += p.survive ?? 0
  return share
}

/** The share of a charge's spike that lives through braced spears: CHARGE.BRACED_MULTIPLIER, or its perk's (Parthia's horse). */
function bracedShare(unit) {
  let share = T.CHARGE.BRACED_MULTIPLIER
  for (const p of perksOf(unit)) if (p.braced != null) share = Math.max(share, p.braced)
  return share
}

/** What shooting on the move leaves of a volley for this unit: MISSILES.ON_THE_MOVE, or its perk's (the Parthian shot). */
function onTheMove(unit) {
  let rate = T.MISSILES.ON_THE_MOVE
  for (const p of perksOf(unit)) if (p.onTheMove != null) rate = Math.max(rate, p.onTheMove)
  return rate
}

/**
 * A volley's weight for a missile unit with the friends its people fight
 * beside within reach (Kush's archers and horse; Yayoi's archers and
 * spears): the perk's `volley`, else 1. `friends` are the living units of
 * the battle; `isPartner(friend, kind)` says whether one is of the kind.
 */
function volleyEdge(shooter, friends, isPartner, distance) {
  let edge = 1
  for (const p of perksOf(shooter)) {
    if (!p.partner) continue
    const near = friends.some(f => f.id !== shooter.id && f.side === shooter.side && f.strength > 0 &&
      distance(f.position, shooter.position) <= p.within && isPartner(f, p.partner))
    if (near) edge = Math.max(edge, p.volley)
  }
  return edge
}

/** What a tile of this terrain costs this unit to enter: the map's cost, or its perk's (woods for the Germans and Celts; the Berbers slowed in woods and marsh). */
function moveCost(unit, terrain, cost) {
  let out = cost
  for (const p of perksOf(unit)) {
    if (p.woods?.includes(terrain)) out = Math.min(out, p.cost)
    if (p.slowIn?.includes(terrain)) out = out * p.slow
  }
  return out
}

/** A weight on the wind the unit spends fighting (Kush, men of the hot lands): 1 for most. */
function drainWeight(unit) {
  let w = 1
  for (const p of perksOf(unit)) w *= p.drain ?? 1
  return w
}

/** A weight on the parting blow when the unit leaves a fight (Sarmatia's feigned retreat): 1 for most. */
function disengageWeight(unit) {
  let w = 1
  for (const p of perksOf(unit)) w *= p.disengage ?? 1
  return w
}

/** A weight on the shock of its surprise (the Celts' fury): 1 for most. */
function surpriseWeight(unit) {
  let w = 1
  for (const p of perksOf(unit)) w *= p.surprise ?? 1
  return w
}

module.exports = {
  has, moraleEdge, veterancyFloor, routLine, fightEdge, armorLeft, saved,
  bracedShare, onTheMove, volleyEdge, moveCost, drainWeight, disengageWeight, surpriseWeight
}
