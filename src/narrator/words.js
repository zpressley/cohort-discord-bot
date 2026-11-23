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

// ── Kit, for buying an army ────────────────────────────
// The builder's keys (engine/army/data.js) in the words the army screen
// uses, and what a unit bought with a weapon is called ("spears"). "Supply
// points" is the budget's unit (the builder's "SP").
const KIT = {
  quality: {
    levy: 'levy', militia: 'militia', tribal_warriors: 'tribal warriors',
    professional: 'professionals', veteran_mercenary: 'veteran mercenaries', elite: 'elite'
  },
  weapon: {
    clubs: 'clubs', daggers: 'daggers', spear_basic: 'spear', sickle: 'sickle',
    light_javelin: 'light javelins', germanic_war_scythe: 'war scythe', chinese_quarterstaff: 'quarterstaff',
    roman_pugio: 'pugio', spear_professional: 'fine spear', battle_axe: 'battle axe', mace: 'mace',
    sword_standard: 'sword', roman_gladius: 'gladius', greek_xiphos: 'xiphos', chinese_dao: 'dao',
    celtic_longsword: 'longsword', persian_akinakes: 'akinakes', two_handed_spear: 'pike',
    heavy_mace: 'great mace', great_axe: 'great axe', macedonian_sarissa: 'sarissa',
    thracian_rhomphaia: 'rhomphaia', celtic_champions_sword: 'champion\'s sword', chinese_chang_dao: 'chang dao',
    germanic_framea: 'framea', persian_kontos: 'kontos', sling: 'sling', self_bow_basic: 'bow',
    throwing_spear: 'throwing spears', roman_plumbatae: 'plumbatae', germanic_throwing_axe: 'throwing axes',
    self_bow_professional: 'war bow', javelin_heavy: 'heavy javelins', sling_professional: 'war sling',
    roman_pilum: 'pilum', greek_composite_bow: 'composite bow', persian_recurve_bow: 'recurve bow',
    han_chinese_crossbow: 'crossbow', parthian_horse_bow: 'horse bow'
  },
  armor: { no_armor: 'no armour', light_armor: 'light armour', medium_armor: 'medium armour', heavy_armor: 'heavy armour' },
  shield: { no_shield: 'no shield', light_shield: 'light shield', medium_shield: 'medium shield', heavy_shield: 'heavy shield' },
  mounted: { false: 'on foot', true: 'on horse' },
  // What a unit is called for its weapon, on foot. On horse: "horse" and
  // this, for those who shoot or throw ("horse archers"); "riders" for the
  // rest; "lancers" with the kontos.
  unit: {
    clubs: 'clubmen', daggers: 'knifemen', spear_basic: 'spears', sickle: 'sicklemen',
    light_javelin: 'javelins', germanic_war_scythe: 'scythes', chinese_quarterstaff: 'staves',
    roman_pugio: 'knifemen', spear_professional: 'spears', battle_axe: 'axes', mace: 'maces',
    sword_standard: 'swords', roman_gladius: 'swords', greek_xiphos: 'swords', chinese_dao: 'swords',
    celtic_longsword: 'longswords', persian_akinakes: 'swords', two_handed_spear: 'pikes',
    heavy_mace: 'great maces', great_axe: 'great axes', macedonian_sarissa: 'pikes',
    thracian_rhomphaia: 'blades', celtic_champions_sword: 'champions', chinese_chang_dao: 'blades',
    germanic_framea: 'long spears', persian_kontos: 'lancers', sling: 'slingers', self_bow_basic: 'archers',
    throwing_spear: 'javelins', roman_plumbatae: 'darts', germanic_throwing_axe: 'axe throwers',
    self_bow_professional: 'archers', javelin_heavy: 'javelins', sling_professional: 'slingers',
    roman_pilum: 'javelins', greek_composite_bow: 'archers', persian_recurve_bow: 'archers',
    han_chinese_crossbow: 'crossbows', parthian_horse_bow: 'archers'
  },
  points: 'supply points'
}

// The Commander himself going over to another of his units ("I ride with
// the horse"): what he is read back, and what the Army tab says.
const RIDE_WITH = { say: 'ride with', doing: 'riding with', did: 'rode over to' }

// An officer's loyalty to his Commander, and what he holds dear.
const LOYALTY_WORDS = { loyal: 'loyal', disloyal: 'disaffected' }
const VALUES_WORDS = { glory: 'lives for glory', survival: 'looks to his men' }

module.exports = { orderWords, moraleWords, ORDER, OWN_EDGE, HOLD_THERE, KIT, RIDE_WITH, LOYALTY_WORDS, VALUES_WORDS }
