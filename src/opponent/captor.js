// src/opponent/captor.js
//
// The computer as the captor of a Commander: its answer to the offer on the
// table (engine/orchestrator/orchestrator.js, `parley`). Ruled 2026-11-23:
// "Computers are worse than humans naturally ... Unpredictable but probably
// risky to bank your future on. ... you can also surrender the field in
// return for freedom which some opponents would accept since it saves their
// manpower as well."
//
// One seeded roll for each offer, so the same battle always gets the same
// answer. The chance it accepts (tables.PARLEY):
//
//   BASE + GIFT * (men offered / its own men at the start)
//        + HURT * (share of its own men dead, fled or broken)
//
// held between FLOOR and CEILING. A captor that has lost men is readier to
// end the battle; one that is winning wants the whole of it. A roll that
// misses by less than COUNTER_BAND asks for more: what was offered, and the
// strongest of the captive's units it has seen that was not. A wider miss,
// or nothing more it knows of to ask for, is refused.
//
// It weighs only what its side could know: its own men, and the offered
// units as its side last saw them. A unit it has never seen is counted as
// a unit of the average size of those it has.

const { createRng } = require('../engine/rng')
const { PARLEY } = require('../engine/combat/tables')
const { captorOf } = require('../engine/orchestrator/orchestrator')

/**
 * @returns {{ offer, accept: true }|{ offer, refuse: true }|{ offer, more: { units } }|null}
 *   null when there is no offer before this side
 */
function captorAnswer(game, side) {
  const captive = Object.keys(game.parley ?? {}).find(s => captorOf(game, s) === side && game.parley[s].offer)
  if (!captive) return null
  const offer = game.parley[captive].offer
  const { world, broken } = game.battle

  const start = game.startingStrength[side] || 1
  const standing = world.units.filter(u => u.side === side && u.strength > 0 && !broken.has(u.id)).reduce((n, u) => n + u.strength, 0)
  const hurt = Math.max(0, 1 - standing / start)

  const known = game.intel[side]?.known ?? {}
  const seen = Object.entries(known).filter(([, e]) => e.strength > 0)
  const ownUnits = world.units.filter(u => u.side === side)
  const average = seen.length
    ? seen.reduce((n, [, e]) => n + e.strength, 0) / seen.length
    : ownUnits.reduce((n, u) => n + u.strength, 0) / Math.max(1, ownUnits.length)
  const men = offer.units.reduce((n, id) => n + (known[id] ? known[id].strength : average), 0)
  const gift = men / start

  const chance = Math.min(PARLEY.CEILING, Math.max(PARLEY.FLOOR, PARLEY.BASE + PARLEY.GIFT * gift + PARLEY.HURT * hurt))
  // A stream for this offer alone, from the battle's seed.
  const roll = createRng((Math.imul(game.seed, 2246822519) + Math.imul(offer.id, 3266489917) + (side === 'red' ? 5 : 11)) >>> 0)()
  if (roll < chance) return { offer: offer.id, accept: true }

  const more = seen
    .filter(([id, e]) => !offer.units.includes(id) && e.status !== 'destroyed')
    .sort((a, b) => b[1].strength - a[1].strength || a[0].localeCompare(b[0]))[0]
  if (more && roll < chance + PARLEY.COUNTER_BAND) return { offer: offer.id, more: { units: [...offer.units, more[0]] } }
  return { offer: offer.id, refuse: true }
}

module.exports = { captorAnswer }
