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
//   raw, green, seasoned, veteran, legendary
//                   a unit's veterancy: how many battles its men have come
//                   through, on average (the steps an officer's grades use)
//   a rider, word, cut off
//                   how orders and news go between the Commander and a
//                   unit beyond his immediate range: a rider carries an
//                   order; word is what reaches him of a unit, and how old
//                   it is ("20 min ago"); a unit no rider can get through
//                   to is cut off ("no word of them since 1 h 20 min into
//                   the battle")
//   bold, steady, cautious
//                   an officer's nature, and the enemy Commander's
//                   character as it is told ("said to be cautious")
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

// A unit's veterancy, its men's average experience (veterans/veterancy.js,
// veterancyLevel): the officers' grade words, and "raw" for a unit below
// the first (under four battles each, on average).
const VETERANCY_WORDS = { raw: 'raw', green: 'green', seasoned: 'seasoned', veteran: 'veteran', legendary: 'legendary' }

// Orders and news by rider (engine/command/messengers.js). Minutes in the
// app's own way of telling time ("20 min", "1 h 20 min").
const clock = (minutes) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}
const RIDER = {
  // The read-back: how long each order takes. `minutes` per unit named: 0
  // at once, Infinity when no rider can get through.
  readBack(minutes, names) {
    const blocked = names.filter((n, i) => minutes[i] === Infinity)
    const riding = minutes.filter(m => m > 0 && m !== Infinity)
    const parts = []
    if (riding.length > 0) {
      const lo = Math.min(...riding)
      const hi = Math.max(...riding)
      const who = blocked.length > 0 || riding.length < minutes.length - blocked.length ? 'the rest' : 'them'
      parts.push(lo === hi ? `A rider reaches ${who} in about ${lo} minutes` : `Riders reach ${who} in ${lo} to ${hi} minutes`)
    }
    if (blocked.length > 0) parts.unshift(`No rider can get through to ${blocked.join(', ')}: ${blocked.length === minutes.length ? 'the order is not sent' : 'they are not sent it'}`)
    return parts.join('. ')
  },
  // A dispatch line for an order that could not be carried: told when the
  // rider is back (ruled 2026-11-24: "the rider should return with that
  // news. After turns of travel pass").
  blocked: (unit) => `your rider to ${unit} has come back: he could not get through, and your order did not reach them`,
  sent: (unit, minutes) => `a rider set out for ${unit}, ${minutes} minutes' ride away`,
  // A unit cut off, and back in touch (the dispatch).
  lostTouch: (unit) => `no rider can get through to ${unit} now: you will hear nothing of them, and they nothing of you, until the way is open`,
  backInTouch: (unit) => `riders get through to ${unit} again`,
  // How old word of a unit is, on the map and the Army tab.
  age: (minutes) => (minutes <= 0 ? 'now' : `${clock(minutes)} ago`),
  // A unit no rider can get through to.
  cutOff: (minutesIntoBattle) => `cut off: no word of them since ${minutesIntoBattle ? `${clock(minutesIntoBattle)} into the battle` : 'the battle began'}`,
  // A unit whose word is overdue (ruled 2026-11-23: "Notice when no word
  // comes back"): he is not told why, only that it has not come.
  noWord: (minutesIntoBattle) => `no word of them since ${minutesIntoBattle ? `${clock(minutesIntoBattle)} into the battle` : 'the battle began'}`,
  // ... and when it comes again (the dispatch).
  wordAgain: (unit) => `word has come from ${unit} again`,
  // While the battle goes on without him: his men are at his orders.
  carryingOut: 'Your officers are carrying out your orders. You will be asked for more when they have done what you asked, or when something happens to you.',
  // An order of his still on the road to a unit (the Army tab).
  onTheRoad: (order, minutes) => `a rider is on the way with new orders (${order}): about ${clock(minutes)} more`,
  // A dispatch's news from far off.
  from: (minutes) => `Word from ${clock(minutes)} ago`,
  clock
}

// The end of the day (ruled 2026-11-24: "No the day just ends the battle,
// you can choose to fight again the next day"). The battle's end when night
// falls on it undecided, the dispatch's line, the tent's verdict, the muster's
// note and the button to fight on.
const NIGHT = {
  title: 'Night fell',
  ended: 'night has ended the fighting, and neither side has won',
  day: (minutes) => `The day is ${clock(minutes)} of battle. If neither side has won by then, night ends the fighting and neither side has won; you can fight again the next day.`,
  again: 'Fight again the next day',
  againNote: 'Against the same enemy, on the same field. Both armies come as they stand after today, yours and the enemy\'s: the fallen are gone, those who ran are back with the standards, and no fresh men come to either side in the night.',
  // A Commander held when night fell: let go, as at any end he did not win.
  released: 'Night fell with you still in the enemy\'s hands, and no deal struck. Honor forbids them your life: they let you go, with whatever of your army came through the day.',
  // The other side has asked to fight again: the notice, wherever he next
  // opens the game (ruled 2026-11-24: "no they need a notice").
  calledOut: (day) => `The enemy has called you out for a ${DAYS[day] ?? `${day}th`} day. Your orders are wanted.`,
  // One side has no one left able to fight.
  noNextDay: 'There is no next day: one side has no one left able to take the field.',
  // Notices from the browser, when the page is open in the background.
  tellMe: 'Tell me here if the enemy calls a next day',
  toldYou: 'This browser will tell you while the page is open.'
}
const DAYS = { 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth' }

// The ground to fight for: each map's own (src/data/maps, `ground`), held
// alone for an hour to take the field (combat/tables.js, GROUND). Every side
// knows at once when it changes hands. `mine`: true for the side told's
// own, false for the enemy's, null for no one's. `names`: the ground's names
// ("the Old Mill Bridge").
const both = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)
const GROUND = {
  // The muster, under the field chosen; and the first dispatch.
  toFightFor: (names) => `The ground to fight for: ${both(names)}.`,
  // `beside`: it is held, and contested, from beside it as well as on it.
  rule: (names, minutes, beside = false) => `Hold ${names.length > 1 ? 'all of it' : 'it'} alone for ${clock(minutes)}, with no enemy on it${beside ? ' or beside it' : ''}, and the field is yours, as surely as if the enemy's army broke. Let the enemy hold it as long, and the field is his.`,
  // The dispatch, when it changes hands.
  took: (name, mine) => (mine ? `you took ${name}: hold it alone and the field is yours` : `the enemy took ${name}: take it from him, or the field is his`),
  lost: (name, wasMine) => (wasMine ? `you no longer hold ${name}` : `the enemy no longer holds ${name}`),
  // ... and when it is close to deciding the battle.
  close: (name, mine, minutes) => (mine
    ? `hold ${name} ${clock(minutes)} more and the field is yours`
    : `the enemy has held ${name} long: unless you take it from him within ${clock(minutes)}, the field is his`),
  // The tent, under the map: one piece of the ground. `leftMinutes` only
  // when one side holds all of it.
  status: (name, mine, leftMinutes = null) => (mine === null
    ? `The ground to fight for, ${name}, is held by no one.`
    : mine ? `You hold ${name}, the ground to fight for${leftMinutes === null ? '.' : `: ${clock(leftMinutes)} more and the field is yours.`}`
      : `The enemy holds ${name}, the ground to fight for${leftMinutes === null ? '.' : `: take it within ${clock(leftMinutes)}, or the field is his.`}`),
  // The map's label.
  heldBy: (mine) => (mine === null ? '' : mine ? 'held by you' : 'held by the enemy'),
  // The verdict, when the ground decided it.
  won: (names, mine, minutes) => (mine
    ? `You held ${both(names)} alone for ${clock(minutes)}, and the field is yours`
    : `The enemy held ${both(names)} alone for ${clock(minutes)}, and the field is his`)
}

// A unit's wind in a word, as its share of what it can spend: fresh, tiring
// or spent (fresh above 60%, as combat counts a unit at full wind:
// tables.STAMINA.FULL_ABOVE; spent at a quarter or under).
function windWords(stamina, pool) {
  const share = pool ? stamina / pool : stamina / 100
  if (share > 0.6) return 'fresh'
  if (share > 0.25) return 'tiring'
  return 'spent'
}

// What a report of the enemy holds (engine/orchestrator/reports.js; ruled
// 2026-11-23: "additional details as progression happens but never
// incorrect details"). An enemy unit whose kind no report has told is
// "enemy troops". "Roughly how many" is told in bands (tables.REPORTS.ABOUT,
// one phrase each, in the same order): the true number is always inside
// the band named, so the words are never wrong.
const REPORT = {
  troops: 'troops',
  about: ['a handful of men', 'a few dozen men', 'several dozen men', 'about a hundred men', 'well over a hundred men', 'a few hundred men', 'many hundreds of men'],
  // Who made the best report he has had of them, for the enemy list.
  by: {
    none: 'a unit of yours with no officer',
    green: 'a green officer',
    seasoned: 'a seasoned officer',
    veteran: 'a veteran officer',
    legendary: 'a legendary officer'
  },
  // The dispatch's line for an enemy first reported to him: "Velites
  // report enemy troops at Miller's Crossing (F6-NE)". `by` is the unit that
  // saw them (null: heard in the enemy's camp).
  sighted: (by, enemy, men, where) => `${by ? `${by} report` : 'You learned of'} ${enemy}${men ? `, ${men},` : ''} ${where}`,
  // How many, as told: an exact count, a band, or nothing.
  men(count) {
    if (!count) return null
    return count.exact ? (count.strength === 1 ? '1 man' : `${count.strength} men`) : REPORT.about[count.band]
  },
  // How they are holding up (a legendary officer's report).
  holding(state) {
    if (!state) return null
    return state.broken ? 'broken and fleeing' : `${moraleWords(state.morale)}, ${windWords(state.stamina, state.staminaPool)}`
  },
  /**
   * One enemy unit as he knows it, for the enemy list: where and when, then
   * what the reports held, each with its age when older than the sighting;
   * and, when a report could tell no more, plainly that more is not known.
   * @param {Object} e  { status, minutesAgo, kindKnown, count, countAgo, state, stateAgo, grade }
   */
  line(e) {
    const ago = (m) => (m > 0 ? ` (${clock(m)} ago)` : '')
    const parts = [e.status === 'visible' ? 'in sight' : `last seen ${RIDER.age(e.minutesAgo)}`]
    const men = REPORT.men(e.count)
    if (men) parts.push(men + (e.countAgo > e.minutesAgo ? ago(e.countAgo) : ''))
    const holding = REPORT.holding(e.state)
    if (holding) parts.push(holding + (e.stateAgo > e.minutesAgo ? ago(e.stateAgo) : ''))
    const unknown = [!e.kindKnown && 'what kind', !men && 'how many'].filter(Boolean)
    if (unknown.length) parts.push(`${unknown.join(' and ')} not known: reported by ${REPORT.by[e.grade] ?? REPORT.by.none}`)
    return parts.join('; ')
  }
}

// Fire and retreat: missile troops falling back before men they can
// outmarch (engine/battle/skirmish.js; ruled 2026-11-24). "Fell back" is the order's own
// word (ORDER.withdraw): it is the same thing, done unasked.
const SKIRMISH_WORDS = {
  gaveGround: (unit, before) => `${unit} ${ORDER.withdraw.did} before ${before}, keeping out of their reach`
}

// Making a Commander (data/commanders.js): the two questions, asked once,
// and what each answer means for him. The ten kinds are the design's
// (docs/design/commanders-lore-and-tutorial.md), each with its old line
// from archive/src/commanderName/profile/profileFlow.js in plain words.
const MAKING = {
  kindAsked: 'What kind of commander are you?',
  holdsAsked: 'What do you fight for?',
  nameAsked: 'Your name',
  nameSaid: 'Your own, or this one. No other Commander has borne it, and none will.'
}
const COMMANDER_KINDS = {
  engineer: { title: 'the Engineer', said: 'Victory through preparation.' },
  mountain: { title: 'the Mountain', said: 'The high ground is yours.' },
  ghost: { title: 'the Ghost', said: 'Were you even there?' },
  mirage: { title: 'the Mirage', said: 'Strike from the sands, and be gone.' },
  hero: { title: 'the Hero', said: 'Lead from the front.' },
  wall: { title: 'the Wall', said: 'Nothing breaks your line.' },
  wind: { title: 'the Wind', said: 'Swift on horse.' },
  threshold: { title: 'the Threshold', said: 'None shall pass.' },
  serpent: { title: 'the Serpent', said: 'Strike, and vanish.' },
  storm: { title: 'the Storm', said: 'Every arm at once.' }
}
// The nature of the veteran a kind brings (command/officers.js,
// losingTheThread), told as what he does.
const NATURE_SAID = {
  bold: 'Your veteran officer is bold: if he loses the thread of an order, he goes at the enemy.',
  steady: 'Your veteran officer is steady: if he loses the thread of an order, he carries on with what he remembers.',
  cautious: 'Your veteran officer is cautious: if he loses the thread of an order, he stops and holds.'
}
const HOLDS_DEAR = {
  glory: { title: 'Glory', said: 'Your veteran lives for glory, as you do: he thinks the better of you when his men fight and win, the worse when they stand by.' },
  survival: { title: 'Survival', said: 'Your veteran looks to his men, as you do: he thinks the better of you when few of them fall, the worse when many do.' }
}
// The title a Commander is known by after his first battle, by what he
// fights for and his kind (archive/src/commanderName/titles, tier 1). Two
// are changed: the Wall's for glory is "the Unbroken" (the old word is one
// of the two banned roles), and the Storm's for glory, "the Commander"
// there, is "the Thunder" (he is a Commander already).
const COMMANDER_TITLES = {
  glory: {
    engineer: 'the Builder', mountain: 'the Climber', ghost: 'the Silent', mirage: 'the Swift', hero: 'the Brave',
    wall: 'the Unbroken', wind: 'the Rider', threshold: 'the Guardian', serpent: 'the Guerrilla', storm: 'the Thunder'
  },
  survival: {
    engineer: 'the Trapper', mountain: 'the Lurker', ghost: 'the Shadow', mirage: 'the Harrier', hero: 'the Relentless',
    wall: 'the Patient', wind: 'the Endless', threshold: 'the Grinder', serpent: 'the Drowner', storm: 'the Ruthless'
  }
}

// The computer's Commander (opponent/commander.js): his name, and his
// character as his name goes before him, in the words of an officer's
// nature (bold, steady, cautious). Told in the first dispatch and on the
// Army tab, over the enemy as he knows it.
const ENEMY_COMMANDER = {
  said: (name, character) => `${name}, said to be ${character}`,
  faced: (name, character) => `You face ${name}, who commands the enemy. He is said to be ${character}.`
}

// An officer who acted on his Commander's intent when no word could reach
// him (engine/command/initiative.js). Told in his report, when a rider gets
// through: his own judgement, in the words of the orders (ORDER).
const ON_HIS_OWN = {
  did: {
    advance: () => ORDER.advance.did,
    ground: (on) => `${ORDER.attack.did} to take ${on ?? 'the ground'} back`,
    hold: () => `${ORDER.hold.did} where he stood`,
    'fall back': () => `${ORDER.withdraw.did} toward you`
  },
  why: {
    groundLost: (on) => ` when he saw the enemy take ${on ?? 'the ground'}`,
    friendsBroke: () => ' when he saw your men about him break',
    quarryGone: () => ' when the enemy you sent him at was beaten or gone',
    attacked: () => ' when the enemy came at him',
    done: () => ', his orders done and the enemy in sight',
    bled: () => ', half his men down'
  },
  line: (who, did, why) => `${who}, with no word from you, ${did}${why}`
}

module.exports = { orderWords, moraleWords, ORDER, OWN_EDGE, HOLD_THERE, KIT, RIDE_WITH, LOYALTY_WORDS, VALUES_WORDS, VETERANCY_WORDS, RIDER, NIGHT, REPORT, GROUND, windWords, SKIRMISH_WORDS, MAKING, COMMANDER_KINDS, NATURE_SAID, HOLDS_DEAR, COMMANDER_TITLES, ENEMY_COMMANDER, ON_HIS_OWN }
