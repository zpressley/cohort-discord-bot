// src/narrator/words.js
//
// One vocabulary, wherever the app speaks to the Commander: the read-back of
// his orders, the Army tab, counsel and the dispatches. Before this the same
// order was "move" in the read-back, "moving to" on the Army tab and "made
// for" in a dispatch, and a unit about to break was "at breaking point" in
// one place and "badly shaken" in another.
//
// The words:
//   the Commander   the player
//   an officer      the man who carries his orders to one unit
//   march, hold, advance on the enemy, attack, fall back, hide, search,
//   lie in ambush, shoot
//                   (attack names a place, or an enemy unit: "attack the
//                   enemy archers")
//                   what a unit is told to do (the engine's move, hold,
//                   advance, attack, withdraw, hide, check, ambush)
//   firm, wavering, at breaking point
//                   a unit's morale: above 50, 50 or under, 25 or under
//                   ("steady" is kept for an officer's nature)
//   broke, rallied, left the field, destroyed
//                   what becomes of a unit
//
// Presentation only: nothing here decides anything.

// For each engine action: what the Commander is read back ("march"), what
// the unit is doing ("marching"), what it did ("marched"), and the word that
// joins it to a place.
const ORDER = {
  move: { say: 'march', doing: 'marching', did: 'marched', to: 'to' },
  attack: { say: 'attack', doing: 'attacking', did: 'attacked', to: '' },
  withdraw: { say: 'fall back', doing: 'falling back', did: 'fell back', to: 'to' },
  hide: { say: 'hide', doing: 'hiding', did: 'went into hiding', to: 'at' },
  check: { say: 'search', doing: 'searching', did: 'searched', to: '', bare: 'the ground' },
  ambush: { say: 'lie in ambush', doing: 'lying in ambush', did: 'lay in ambush', to: 'at' },
  hold: { say: 'hold', doing: 'holding', did: 'held' },
  advance: { say: 'advance on the enemy', doing: 'advancing on the enemy', did: 'advanced on the enemy' }
}

const HOLD_IT = { say: 'and hold it', doing: 'to hold it', did: 'to hold it' }

// Where a unit falling back with no place named stops: its own side's edge
// of the field, where it holds ("fall back to your own edge of the field at
// A7-NE, 300 m west, and hold there").
const OWN_EDGE = 'your own edge of the field'
const HOLD_THERE = 'and hold there'

/**
 * An order in words.
 *
 * @param {'say'|'doing'|'did'} form
 * @param {Object} order  { action, then?, careful? } (engine order or intent)
 * @param {string|null} place  the place in words, already written out
 *   ("Miller's Crossing 250 m east (F6-NW)"), or null
 * @param {Object} [options]
 * @param {boolean} [options.relative]  the place is a way to go, not a place
 *   ("200 m north"): "march 200 m north", not "march to 200 m north"
 */
function orderWords(form, order, place = null, { relative = false } = {}) {
  let action = order.action
  // "Go there and hold it" is one thing to a commander, whichever way the
  // engine was told it. With nowhere to go, it is simply holding.
  const holdsIt = action === 'defend' || (action === 'move' && order.then === 'hold')
  if (holdsIt) action = place ? 'move' : 'hold'
  const words = ORDER[action] ?? { say: action, doing: action, did: action }

  let out = words[form]
  if (order.careful && action !== 'hold') out += form === 'say' ? ' carefully' : ''
  if (place) out += relative || !words.to ? ` ${place}` : ` ${words.to} ${place}`
  else if (words.bare) out += ` ${words.bare}`
  if (holdsIt && place) out += ` ${HOLD_IT[form]}`
  if (order.careful && action !== 'hold' && form !== 'say') out += ', carefully'
  return out
}

/** A unit's morale in a word: firm, wavering, or at breaking point. */
function moraleWords(morale) {
  if (morale <= 25) return 'at breaking point'
  if (morale <= 50) return 'wavering'
  return 'firm'
}

// The Commander himself going over to another of his units ("I ride with
// the horse"): what he is read back, and what the Army tab says.
const RIDE_WITH = { say: 'ride with', doing: 'riding with', did: 'rode over to' }

module.exports = { orderWords, moraleWords, ORDER, OWN_EDGE, HOLD_THERE, RIDE_WITH }
