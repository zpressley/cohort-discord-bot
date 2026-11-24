// src/engine/army/perks.js
//
// Each people's perks at the muster (docs/design/army-balance.md, part 9).
// A faction names its perks (src/data/factions.js, `perks`); the numbers and
// whom in the army each is for are tables.PERKS. Here each of the faction's
// own units is given the keys of the perks that are its own (`perks` on the
// unit's spec: combat/perks.js reads them in battle), and bought units are
// raised larger where a perk says so (`men`). A unit taken from another
// people (its culture not the faction's) has none of them.
//
// Pure: the same units and faction always give the same units.

const T = require('../combat/tables')
const { missileRange } = require('../combat/ranged')
const { FACTIONS } = require('../../data/factions')

// Whom a perk is for, by `who` (tables.PERKS).
const WHO = {
  all: () => true,
  elite: (u) => u.quality === 'elite',
  bought: (u) => u.quality !== 'elite',
  levy_militia: (u) => u.quality === 'levy' || u.quality === 'militia',
  militia: (u) => u.quality === 'militia',
  missile: (u) => missileRange(u) > 0,
  horse: (u) => Boolean(u.mounted),
  horse_archers: (u) => Boolean(u.mounted) && missileRange(u) > 0
}

/** The faction's perks (keys of tables.PERKS). */
function perksOfFaction(key) {
  // (A study may set them as words on its command line, "--set
  // factions.rome.perks=discipline" or "=" for none: army-study/lib.js.)
  const listed = FACTIONS[key]?.perks ?? []
  const keys = Array.isArray(listed) ? listed : String(listed).split(',').filter(Boolean)
  return keys.filter(k => T.PERKS[k])
}

/** The perks of a faction that are this unit's own (a battle unit spec). */
function unitPerks(key, unit) {
  const culture = FACTIONS[key]?.culture
  if (!culture || (unit.culture && unit.culture !== culture)) return []
  return perksOfFaction(key).filter(k => (WHO[T.PERKS[k].who ?? 'all'] ?? WHO.all)(unit))
}

/**
 * A faction's units with its perks on them: each unit's own keys, and its
 * men where a perk raises bought units larger. A unit with none is as it was.
 */
function withPerks(key, units) {
  return units.map(u => {
    const perks = unitPerks(key, u)
    if (perks.length === 0) return u
    let men = 1
    for (const k of perks) men *= T.PERKS[k].men ?? 1
    const sized = men === 1 ? {} : { strength: Math.round(u.strength * men), maxStrength: Math.round((u.maxStrength ?? u.strength) * men) }
    // The unit carries only the perks that act in battle: not those done
    // with at the muster (its men, a price) or true of the game already.
    const fights = perks.filter(inBattle)
    return { ...u, ...sized, ...(fights.length ? { perks: fights } : {}) }
  })
}

const MUSTER_ONLY = ['who', 'men', 'price', 'quality']
const inBattle = (k) => Object.keys(T.PERKS[k]).some(f => !MUSTER_ONLY.includes(f))

module.exports = { withPerks, unitPerks, perksOfFaction, WHO }
