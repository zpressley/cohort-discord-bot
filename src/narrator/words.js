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
  if (action === 'follow' && order.keep === 'behind') action = 'followBehind'
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
    roman_pilum: 'pila', greek_composite_bow: 'composite bow', persian_recurve_bow: 'recurve bow',
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
  // The main menu's line for a battle night ended, while a next day may be
  // fought (ruled 2026-11-28: a main menu).
  fightOn: 'Night has fallen. You can fight again the next day',
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
  // ... in the dispatch that ends the battle, when holding it no longer
  // decides anything.
  tookAtTheEnd: (name, mine) => (mine ? `you took ${name}` : `the enemy took ${name}`),
  // Every side knows at once that it has changed hands, but not who is on
  // it now: that comes by rider (S12). Only that it is no one's alone.
  lost: (name, wasMine) => (wasMine ? `your men no longer hold ${name} alone: no word yet of who is on it` : `the enemy no longer holds ${name} alone: no word yet of who is on it`),
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

// Second weapons (docs/design/army-balance.md, part 8): a unit's javelins
// or pila, thrown as it comes to blows (battle/battle.js, the throw at
// contact), told in the dispatch: "legionaries threw their pila at enemy
// spears". The weapon is named as the kit names it (KIT.weapon, plural).
const THROWN_WORDS = {
  threw: (weapon, at) => `threw their ${KIT.weapon[weapon] ?? weapon} at ${at}`,
  met: (weapon, from) => `met ${KIT.weapon[weapon] ?? weapon} from ${from}`,
  // The army screen: a unit's second weapon, and none.
  second: 'second weapon',
  none: 'none'
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

// A field bigger than 1 km (src/data/maps, `lines`; docs/DECISIONS.md,
// "How the big map was built"): its size at the muster, and the second line
// each army is joined by there (engine/army/secondLine.js).
const FIELD = {
  size: (km) => `${km} km`,
  lines: 'A big field: each army comes in two lines. Behind your own marches your faction\'s usual army again, raised for the day; its units are called "second" ("second spears"), all of them answer to "second line", and they go home when the battle is over.'
}

module.exports = { orderWords, moraleWords, ORDER, OWN_EDGE, HOLD_THERE, KIT, RIDE_WITH, LOYALTY_WORDS, VALUES_WORDS, VETERANCY_WORDS, RIDER, NIGHT, REPORT, GROUND, windWords, SKIRMISH_WORDS, THROWN_WORDS, MAKING, COMMANDER_KINDS, NATURE_SAID, HOLDS_DEAR, COMMANDER_TITLES, ENEMY_COMMANDER, ON_HIS_OWN, FIELD }

// The enemy catching a rider and reading the order he carried (engine/
// command/messengers.js, ridersTaken). Told only to the side that caught
// him, with the report of the unit that did; the side that sent him is
// never told (no word comes back). The order is told in the game's own
// words (orderWords), never as it was typed.
const RIDER_TAKEN = {
  // The dispatch: "Light horse took one of the enemy's riders at Old Mill
  // Bridge (F6-NW), carrying an order for enemy spears: attack Crownhill (G5-NE)".
  line: (unit, where, to, order) => `${unit} took one of the enemy's riders ${where}, carrying an order for ${to}: ${order}`,
  // The map's mark where he was taken.
  mark: 'enemy rider taken here'
}
module.exports.RIDER_TAKEN = RIDER_TAKEN

// Each people's perks (tables.PERKS; docs/design/army-balance.md, part 9),
// one short line each, for the screen where he chooses his faction and the
// army screen: a name, and what it does for him, in his words. `drawback`
// marks one that costs him (the Berbers in woods and marsh).
const PERK_WORDS = {
  discipline: { name: 'Discipline', said: 'your men hold their nerve a little longer than others do.' },
  old_soldiers: { name: 'Veterans of war', said: 'the Silver Shields fight as seasoned men from their first battle.' },
  last_man: { name: 'To the last man', said: 'your men do not break until half of them have fallen.' },
  perioeci: { name: 'The perioeci', said: 'your levy and militia fight as seasoned men.' },
  merchant_wealth: { name: 'Merchant wealth', said: 'you have 32 supply points to buy your army, where most have 30.' },
  sun_hardened: { name: 'Men of the hot lands', said: 'your men tire more slowly in a fight.' },
  bow_and_horse: { name: 'Bow and horse', said: 'your bowmen and slingers shoot harder with your horse right beside them.' },
  small_bands: { name: 'Small bands', said: 'your men fight harder against a unit bigger than their own.' },
  dense_ground: { name: 'Men of the open desert', said: 'woods and marsh slow your men more than other men.', drawback: true },
  feigned_retreat: { name: 'Feigned retreat', said: 'your horse break off a fight and get away with little harm.' },
  larger_units: { name: 'Many hands', said: 'every unit you buy comes with a fifth more men.' },
  crossbows: { name: 'Crossbows', said: 'you alone can field them.' },
  wootz: { name: 'Wootz steel', said: 'your blades bite through a tenth of the enemy\'s armour.' },
  mountain_warfare: { name: 'Mountain fighters', said: 'on a hill your men fight harder and stand firmer.' },
  surgeons: { name: 'Surgeons', said: 'of the men who would fall in a fight, your surgeons save one in twenty.' },
  plains_horse: { name: 'Horse of the plains', said: 'your horse fight harder on open ground, and more of their charge breaks into a wall of spears.' },
  parthian_shot: { name: 'The Parthian shot', said: 'your horse archers shoot as hard riding as standing.' },
  woodland: { name: 'Woodsmen', said: 'your men cross woods as easily as open ground.' },
  hill_defence: { name: 'Hill men', said: 'on a hill your men stand firmer.' },
  rhomphaia: { name: 'The rhomphaia', said: 'the long blade is yours alone, for any of your foot.' },
  guerrilla: { name: 'Hill and forest fighters', said: 'your men fight harder on hills and in woods.' },
  samnite_bravery: { name: 'Samnite courage', said: 'your men do not break until three in ten have fallen; your elite, four in ten.' },
  militia_veterans: { name: 'Homeland militia', said: 'your militia fight as seasoned men.' },
  cheap_mercenaries: { name: 'Hired swords', said: 'veteran mercenaries cost you 7 supply points, not 9.' },
  berserker: { name: 'Fury', said: 'an enemy you catch by surprise is shaken half as much again.' },
  noble_cavalry: { name: 'Noble horse', said: 'your horse fight harder against an enemy already in a fight.' },
  bow_and_spear: { name: 'Bow and spear', said: 'your archers shoot harder with your spearmen right beside them.' },
  rapid_fortification: { name: 'Quick to dig in', said: 'men who stand their ground to meet the enemy are harder to break into.' }
}

module.exports.PERK_WORDS = PERK_WORDS

// The last dispatch of a battle, to each side in its own words: who won
// and why, as the verdict says it (the engine's reasons, victory.js, are
// its own and never shown). `mine`: true for the winner told, false for
// the loser, null for a draw.
const BATTLE_OVER = {
  why: {
    'enemy army broken': ['the enemy army broke', 'your army broke'],
    'enemy army collapsed': ['the enemy army was destroyed', 'your army was destroyed'],
    'enemy surrendered': ['the enemy yielded the field', 'you yielded the field'],
    'enemy commander bargained': ['the enemy Commander bargained for his freedom and left the field', 'you bargained for your freedom and left the field'],
    'enemy commander killed': ['the enemy Commander was killed', 'you were killed'],
    'enemy officers yielded': ['with their Commander in your hands, the enemy\'s officers yielded the field', 'with you in the enemy\'s hands, your senior officer yielded the field'],
    'objectives held': ['you held the ground to fight for', 'the enemy held the ground to fight for'],
    'time ran out: held more objectives': ['the day ended with more ground in your hands', 'the day ended with more ground in the enemy\'s hands'],
    'time ran out: fewer losses': ['the day ended, and the enemy lost more', 'the day ended, and you lost more'],
    'mutual ruin': 'both armies are spent',
    'time ran out: equal losses': 'the day ended with the losses even'
  },
  line: (reason, mine) => {
    const why = BATTLE_OVER.why[reason]
    if (mine === null) return `The battle is over, and neither side has won${typeof why === 'string' ? `: ${why}` : ''}`
    const said = Array.isArray(why) ? why[mine ? 0 : 1] : null
    return `The battle is over${said ? `: ${said}` : ''}. ${mine ? 'The field is yours' : 'The field is the enemy\'s'}`
  }
}

module.exports.BATTLE_OVER = BATTLE_OVER

// A place's name, said inside a sentence (docs/REVIEW-2026-11.md, D13): one
// rule wherever a place is named to the Commander. A name that describes
// the place takes "the", in small letters: "the Crownhill", "the Old Mill
// Bridge", "the North Ford", "the Merchant Road". A name that is the place's
// own, as a village's is, takes none: "Harrow Bridge", "Raven Gap", "Thorn
// Knoll", "Elderby". The map's data says which: a name written there with
// "The" takes it; so does one that begins with a plain word of description
// (`DESCRIBING`). The map's own labels keep the name as it is written there.
const DESCRIBING = new Set(['old', 'new', 'north', 'south', 'east', 'west', 'upper', 'lower', 'high', 'low', 'long', 'great', 'little', 'middle'])
const PLACE = {
  name(name) {
    const said = String(name ?? '')
    if (/^the\s/i.test(said)) return `the ${said.slice(4)}`
    return DESCRIBING.has(said.split(/\s+/)[0].toLowerCase()) ? `the ${said}` : said
  }
}
module.exports.PLACE = PLACE

// Reading orders with no AI (src/interpreter; docs/REVIEW-2026-11.md, D4):
// what the Commander is told when an order is read in a way he may not have
// meant, cannot be read, or asks for something the engine has no order for.
// Each says what was not understood and offers the nearest orders that are,
// in the order box's own words.
const ORDERS_READ = {
  // "the hill" on a field whose ground to fight for is a hill: that one.
  ground: 'the ground to fight for',
  // A line the grammar could not read at all, or only its unit.
  notRead: (line, examples) => `I don't follow "${line}". Orders read like: ${examples.join(' · ')}`,
  notReadFor: (who, rest, examples) => `I know ${who}, but I don't follow what you want of them: "${rest}". Orders read like: ${examples.join(' · ')}`,
  // "everyone else hold" with no one else named.
  othersAlone: (said, example) => `"${said}" means every unit not named in your other orders, and no other is named. Name the others first: "${example}".`,
  // Keeping with another unit: the engine has no such order.
  follow: (who, friend) => `There is no order to keep one unit with another as it moves: ${who} would not know where ${friend} go next. Send them to where ${friend} stand now, or give both the same order.`,
  followNoOne: (who, words) => `There is no order to "${words}": ${who} can march to a place, hold it, advance on the enemy or fall back. Say where, or give them the same order as the others.`,
  followTo: (friend) => `march to where ${friend} stand now`,
  bothSame: 'give both the same order',
  // Going round a flank: which way round is not the officers' to guess.
  flank: (example) => `Going round a flank needs a way round, and your officers will not guess it. Pick a way round the enemy you have seen, or name where to go first, then what to do: "${example}".`,
  flankEnd: (way) => `round the ${way} end of the enemy you have seen`,
  flankUnseen: (example) => `You have seen no enemy, so there is no flank to go round yet. To go and find them, say "advance"; to go somewhere first, name the place: "${example}".`,
  // Throwing: missile troops shoot; javelins and pila are thrown at blows.
  thrown: (who, weapon) => `${who} have no bows or slings: they throw their ${weapon} as they come to blows, whether they close or are closed on. To throw them, close with the enemy, or hold and let him come.`,
  advanceAndThrow: 'advance on the enemy, and throw as they close',
  holdAndThrow: 'hold, and throw at any who come to blows with them',
  nothingToThrow: (who) => `${who} have nothing to throw or shoot: only troops with bows, slings, crossbows or javelins can.`,
  // Fire and retreat (engine/battle/skirmish.js), told as the engine does it.
  skirmish: (mounted) => (mounted
    ? 'advance on the enemy until in shot, shoot, and fall back before any who come at them on foot'
    : 'advance on the enemy until in shot, and shoot (on foot they cannot keep away from men on foot)'),
  // A place said by one of his own units.
  where: (who) => `where ${who} stand now`,
  behind: (who, metres) => `${metres} m behind where ${who} stand now`,
  // "keep going", "carry on": an order stands until another is sent.
  carryOn: (who) => `${who} keep the orders they have until you send them others: leave them out of this order, and they carry on.`,
  // "fall back 200 m" with no side's edge to fall back toward.
  noEdge: 'Which way is back? Say the way: "fall back 200 m west".'
}
module.exports.ORDERS_READ = ORDERS_READ

// What kind of men a unit is, worked out from its kit, for the Army tab
// ("levy skirmishers", "elite lancers"): its quality, then its kind. The
// engine's role (army/builder.js, roleFor) goes by the weapon alone and is
// for finding units by an order's words; this is what the player reads.
//   on horse: horse archers (a bow), lancers (the kontos), light horse
//     (javelins), else cavalry
//   on foot: archers or crossbowmen (they shoot), slingers, skirmishers
//     (javelins in hand, or javelins with no more than light armour and a
//     light shield: velites, peltasts), pikemen (pike, sarissa), spearmen,
//     heavy infantry (medium armour or more, or a heavy shield), else
//     infantry
// A unit is { quality, primaryWeapon, thrown?, armor, shield, mounted }, as
// the battle has it (army/builder.js, toBattleUnits). Its weapons are known
// by what KIT.unit calls the men who carry them.
const KIND = {
  quality: { levy: 'levy', militia: 'militia', tribal_warriors: 'tribal', professional: 'professional', veteran_mercenary: 'mercenary', elite: 'elite' },
  lightArmour: ['no_armor', 'light_armor'],
  lightShield: ['no_shield', 'light_shield']
}
function kindWords(unit) {
  const called = (weapon) => KIT.unit[weapon] ?? ''
  const first = called(unit.primaryWeapon)
  const javelins = called(unit.thrown) === 'javelins'
  const lightArmour = KIND.lightArmour.includes(unit.armor ?? 'no_armor')
  const light = lightArmour && KIND.lightShield.includes(unit.shield ?? 'no_shield')
  let kind
  if (unit.mounted) {
    kind = first === 'archers' ? 'horse archers' : first === 'lancers' ? 'lancers' : (javelins || first === 'javelins') ? 'light horse' : 'cavalry'
  } else if (first === 'archers') kind = 'archers'
  else if (first === 'crossbows') kind = 'crossbowmen'
  else if (first === 'slingers') kind = 'slingers'
  else if (first === 'javelins' || first === 'darts' || (javelins && light)) kind = 'skirmishers'
  else if (first === 'pikes') kind = 'pikemen'
  else if (first === 'spears' || first === 'long spears' || first === 'lancers') kind = 'spearmen'
  else if (!lightArmour || unit.shield === 'heavy_shield') kind = 'heavy infantry'
  else kind = 'infantry'
  const quality = KIND.quality[unit.quality] ?? String(unit.quality ?? '').replace(/_/g, ' ')
  return [quality, kind].filter(Boolean).join(' ')
}

module.exports.kindWords = kindWords

// A battle fought on the next day is one battle (Your battles, a
// Commander's record, his officers' records): its title, and over how many
// days it was fought. One that night ended, with no next day fought, in
// the list of your battles.
const COUNT_WORDS = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' }
NIGHT.overDays = (days) => `fought over ${COUNT_WORDS[days] ?? days} days`
NIGHT.listed = 'Night fell, and neither side had won'

// ── Keeping by another unit (engine/battle/orders.js, follow) ──
// The order in words: "keep beside the legionaries", "keeping behind the
// pikemen". Beside and guarding, they go at an enemy who fights the unit
// they keep by; behind, they keep out of its fight.
ORDER.follow = { say: 'keep beside', doing: 'keeping beside', did: 'kept beside', to: '' }
ORDER.followBehind = { say: 'keep behind', doing: 'keeping behind', did: 'kept behind', to: '' }
const FOLLOW_WORDS = {
  // The read-back, after the order: what they will do as the other moves.
  guard: 'as they move, and go at any enemy who comes to blows with them',
  beside: 'as they move, at their own pace',
  behind: 'as they move, on the side away from the enemy, at their own pace, and keep out of their fight unless attacked themselves',
  // Several to keep by: each keeps by the one nearest it.
  nearest: (pairs) => pairs.join('; '),
  // Why a unit could keep by the other no longer, and what it does.
  lost: {
    broken: (unit, friend) => `${friend} broke, and ${unit}, who were keeping by them, hold where they are`,
    gone: (unit, friend) => `${friend} are gone from the field, and ${unit}, who were keeping by them, hold where they are`,
    'out of sight': (unit, friend) => `${unit} lost sight of ${friend}, whom they were keeping by, and hold where they are`
  },
  // A unit told to keep by itself, or by no one he has.
  self: (who) => `${who} cannot keep by themselves. Name another of your units: "velites stay with the legionaries".`
}
module.exports.FOLLOW_WORDS = FOLLOW_WORDS

// A unit's kind, as the Army tab shows it (kindWords), in its two parts:
// how good the men are ("levy") and what they are ("skirmishers"). Orders
// find units by these words (interpreter/resolve.js, unitsByKind).
function kindParts(unit) {
  const words = kindWords(unit).split(' ')
  const quality = Object.values(KIND.quality).includes(words[0]) ? words.shift() : null
  return { quality, kind: words.join(' ') }
}
module.exports.kindParts = kindParts

// A unit rallied with no heart left that will not go at the enemy
// (engine/battle/battle.js, 'heldBack'; "How taking ground, news of the
// ground, and rallying were mended"): the Commander's order is kept, and
// why it is not carried out is told him in plain words.
const HELD_BACK = {
  line: (unit) => `${unit} rallied with no heart left, and will not go at the enemy: they hold where they stand, keeping your order, until a success near them puts heart back in them`
}
module.exports.HELD_BACK = HELD_BACK

// ── Reading orders made safe (docs/REVIEW-2026-11.md, S1) ──
// A line too long or too tangled to read at all: said plainly, with orders
// that are read, never "something went wrong".
ORDERS_READ.tangled = (examples) => `I could not follow that: it is too long or too tangled for your officers to carry. Give it as shorter orders, one to a line. Orders read like: ${examples.join(' · ')}`
// "Attack the enemy on the hill" when he has seen no enemy there (the
// ground just lost, and no word yet of who took it): his men go to the
// place and fight whoever they find, and the read-back says so.
ORDERS_READ.whoever = 'and fight whoever they find there: you have seen no enemy on it'

// The ground to fight for, told to a Commander in the enemy's hands (S11):
// he can send no orders, so the lines speak of his army, not of what he
// should do. Otherwise as GROUND.
GROUND.held = {
  took: (name, mine) => (mine ? `your army took ${name}: if it holds it alone, the field is yours` : `the enemy took ${name}: unless your army takes it from him, the field is his`),
  close: (name, mine, minutes) => (mine
    ? `your army has held ${name} long: ${clock(minutes)} more and the field is yours`
    : `the enemy has held ${name} long: unless your army takes it from him within ${clock(minutes)}, the field is his`),
  status: (name, mine, leftMinutes = null) => (mine === null
    ? GROUND.status(name, null)
    : mine ? `Your army holds ${name}, the ground to fight for${leftMinutes === null ? '.' : `: ${clock(leftMinutes)} more and the field is yours.`}`
      : `The enemy holds ${name}, the ground to fight for${leftMinutes === null ? '.' : `: unless your army takes it within ${clock(leftMinutes)}, the field is his.`}`),
  tookAtTheEnd: (name) => `your army took ${name}`
}
// The ground lost, when he knows already who is on it (S12): an enemy
// reported there, when it was his (with his own men still there, or not);
// his own men there, when it was the enemy's.
GROUND.contested = (name, wasMine, withYours = true) => (wasMine
  ? (withYours ? `the enemy is on ${name} with your men: you no longer hold it alone` : `you no longer hold ${name}: the enemy is on it`)
  : `your men are on ${name} with the enemy's: he no longer holds it alone`)
// The tent, under the map, once the ground has been held and is no one's
// alone now: both sides may be on it, or neither (the dispatch's "no longer
// hold it alone").
GROUND.noOnesAlone = (name) => `The ground to fight for, ${name}, is held by neither side alone.`

// The verdict's table (S9: "Fled 0" in every verdict, when his dispatches
// told of units that broke and fled, then rallied or fell). For each side:
// the men standing at the end of the men it went in with, the men fallen,
// and the units that broke, each with what became of it, in the dispatch's
// own words (broke, rallied, left the field, destroyed). The enemy's units
// are those his side saw break.
const VERDICT = {
  head: { side: 'Side', standing: 'Standing', fallen: 'Fallen', broke: 'Broke' },
  standing: (n, of) => `${n} of ${of}`,
  // How many times a unit broke.
  times: (n) => (n === 1 ? 'broke' : n === 2 ? 'broke twice' : `broke ${n} times`),
  // ... and what became of it.
  fate: {
    rallied: (broke) => `${broke}, and rallied`,
    fled: (broke, men) => `${broke}, and left the field${men ? ` with ${men}` : ''}`,
    destroyed: (broke) => `${broke}, and were destroyed`,
    fleeing: (broke) => `${broke}, and were still fleeing when the battle ended`,
    // An enemy unit: no more than that his men saw it break.
    seen: (broke) => broke
  },
  yours: 'Your units that broke',
  theirs: 'Enemy units your men saw break',
  // Under the table: what the numbers are.
  note: 'Broke: units that broke and ran, whether they came back or not; of the enemy, only those your men saw.'
}
module.exports.VERDICT = VERDICT

// Discord (src/discord, src/web/signin.js): signing in, and what the bot
// says. A message says only what a player could know from outside the
// battle: never a dispatch, never the other side's doings. `title` is the
// battle's own ("Crownhill: Rome against Parthia").
const DISCORD = {
  // On the page.
  signIn: 'Sign in with Discord',
  signInNote: 'You need not. Signed in, your Commanders and battles follow you to any phone or computer, and Discord tells you when your orders are wanted.',
  signedInAs: (name) => `Signed in as ${name}`,
  signOut: 'Sign out',
  signOutNote: 'Signing out takes your Commanders and battles off this browser. They stay with your Discord account.',
  signInFailed: 'Signing in with Discord did not work. Go back to the game and try again.',
  thread: 'Talk in this battle\'s thread on Discord',
  // Direct messages to a player.
  wanted: (title) => `${title}: your orders are wanted.`,
  joined: (title, wanted) => `${title}: a friend has joined your battle.${wanted ? ' Your orders are wanted.' : ''}`,
  reminder: (title) => `${title}: your orders are still wanted. The battle waits on you.`,
  calledOut: (title, day) => `${title}: ${NIGHT.calledOut(day).replace(/^The /, 'the ')}`,
  over: {
    won: (title) => `${title}: the battle is over, and you have won.`,
    lost: (title) => `${title}: the battle is over, and you have lost.`,
    draw: (title) => `${title}: the battle is over, and neither side has won.`,
    night: (title) => `${title}: night fell, and neither side has won.`
  },
  tent: (url) => `Your tent: ${url}`,
  // In the battle's thread, where both players read.
  threadFirst: (a, b, title) => `${a} and ${b}: this is the thread for ${title}. Talk here as you like; your orders go in your tents.`,
  threadWanted: (who) => `${who}, your orders are wanted.`,
  threadCalled: (by, other, day) => `Night fell. ${by} has called ${other} out for a ${DAYS[day] ?? `${day}th`} day.`,
  threadOver: {
    won: (who) => `The battle is over. ${who} won.`,
    draw: 'The battle is over, and neither side has won.',
    night: 'Night fell, and neither side has won.'
  },
  // Who a player is, in the thread, when he has not signed in.
  commander: (name) => `Commander ${name}`,
  friend: 'a friend'
}
module.exports.DISCORD = DISCORD

// ── The kinds of battle (ruled 2026-11-25) ──
// Chosen at the muster (src/data/maps, kindsOf), saved in the battle's
// spec (`kind`), named in the tent, the verdict and "your battles".
//   pitched  no ground to fight for: army against army. Won as any battle
//            is (the enemy yields, his army breaks or is destroyed, his
//            Commander is killed); at nightfall the army still standing
//            with `share` of the men it began the day with, when the
//            other's is not, has held the field (tables.PITCHED)
//   ground   the field's ground to fight for (GROUND, and GROUND.some for
//            several, some of them to hold)
// (A third kind, camps, is to come.)
const NUMBER_WORDS = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' }
const shareWords = (share) => (share === 0.5 ? 'half' : `${Math.round(share * 100)}% of`)
const KINDS = {
  pitched: {
    title: 'A pitched battle',
    name: 'pitched battle',
    // The muster's line under the choice; the tent's line under the map.
    said: (share) => `No ground to fight for: army against army. Break the enemy, or make him yield the field. If night falls first, an army still standing with ${shareWords(share)} the men it began the day with, when the other's is not, holds the field and wins; both, or neither, and it is a tie.`,
    tent: (share) => `A pitched battle: no ground to fight for. Break the enemy, or make him yield the field. At nightfall, an army still standing with ${shareWords(share)} the men it began the day with, when the other's is not, holds the field.`,
    // The verdict, when night decided it, or did not.
    held: (mine, share) => (mine
      ? `Night fell with your army still standing, ${shareWords(share)} its men or more in the ranks, and the enemy's beaten: you held the field`
      : `Night fell with the enemy's army still standing, and yours down to fewer than ${shareWords(share)} the men it began the day with: the field is his`),
    tie: (share) => `night fell with both armies still standing, each with ${shareWords(share)} its men or more: neither side has won`,
    neither: (share) => `night fell with both armies down to fewer than ${shareWords(share)} the men they began the day with: neither side has won`
  },
  ground: {
    title: 'A battle for ground',
    name: 'battle for ground'
  },
  // A field whose one piece of ground is a rise to hold (Thornwood).
  kingOfTheHill: 'King of the hill.'
}
module.exports.KINDS = KINDS

// Several pieces of ground, some of them to hold (ruled 2026-11-25:
// "controlling 2 fords wins the game"). `needed` of `count`, called
// together `called` ("fords"); `holding`: how many the side named holds.
const numberWord = (n) => NUMBER_WORDS[n] ?? String(n)
GROUND.some = {
  // The muster and the first dispatch, after GROUND.toFightFor.
  rule: (needed, count, called, minutes) => `Hold ${numberWord(needed)} of the ${numberWord(count)} ${called} alone for ${clock(minutes)}, with no enemy on them or beside them, and the field is yours: the time runs while you hold as many. Let the enemy hold as many as long, and the field is his.`,
  // The dispatch, when one changes hands.
  took: (name, mine, holding, needed, count, called) => (mine
    ? `you took ${name}, and hold ${numberWord(holding)} of the ${numberWord(count)} ${called}${holding >= needed ? ': hold them alone and the field is yours' : `: hold ${numberWord(needed)} and the field is yours`}`
    : `the enemy took ${name}, and holds ${numberWord(holding)} of the ${numberWord(count)} ${called}${holding >= needed ? ': take one from him, or the field is his' : ''}`),
  // ... close to deciding the battle: `names` those the holder holds.
  close: (names, mine, minutes) => (mine
    ? `hold ${both(names)} ${clock(minutes)} more and the field is yours`
    : `the enemy has held ${both(names)} long: unless you take one from him within ${clock(minutes)}, the field is his`),
  // The tent, under the map: who holds which, and the rule. `onClock`:
  // true when the side told holds as many, false when the enemy does,
  // null when neither; `left`, the time left to him.
  status: ({ mine, theirs, needed, count, called, minutes, onClock = null, left = null, held = false }) => {
    const you = held ? 'Your army holds' : 'You hold'
    const said = [
      mine.length ? `${you} ${both(mine)}` : `${you} none of the ${called}`,
      theirs.length ? `the enemy holds ${both(theirs)}` : ''
    ].filter(Boolean).join('; ')
    const rule = `hold ${numberWord(needed)} of the ${numberWord(count)} ${called} alone for ${clock(minutes)} and the field is yours`
    const clockLine = onClock === null ? '' : onClock ? ` ${clock(left)} more and it is.` : ` The enemy holds as many: take one from him within ${clock(left)}, or the field is his.`
    return `${said}: ${rule}.${clockLine}`
  },
  // The verdict.
  won: (names, mine, minutes, needed, count, called) => (mine
    ? `You held ${both(names)}, ${numberWord(needed)} of the ${numberWord(count)} ${called}, alone for ${clock(minutes)}, and the field is yours`
    : `The enemy held ${both(names)}, ${numberWord(needed)} of the ${numberWord(count)} ${called}, alone for ${clock(minutes)}, and the field is his`),
  // A Commander in the enemy's hands (S11): of his army.
  held: {
    took: (name, mine, holding, needed, count, called) => (mine
      ? `your army took ${name}, and holds ${numberWord(holding)} of the ${numberWord(count)} ${called}${holding >= needed ? ': if it holds them alone, the field is yours' : ''}`
      : `the enemy took ${name}, and holds ${numberWord(holding)} of the ${numberWord(count)} ${called}${holding >= needed ? ': unless your army takes one from him, the field is his' : ''}`),
    close: (names, mine, minutes) => (mine
      ? `your army has held ${both(names)} long: ${clock(minutes)} more and the field is yours`
      : `the enemy has held ${both(names)} long: unless your army takes one from him within ${clock(minutes)}, the field is his`)
  },
  // "The ford" on a field with three: which one? `options` the names.
  which: (word, names) => `There are ${numberWord(names.length)} ${word}s to fight for on this field: ${both(names)}. Which do you mean?`,
  // "Take the fords": shared out, each unit to one, and the read-back.
  shared: (pairs) => pairs.join('; ')
}

// The battle's end in the dispatch, when night decided a pitched battle.
BATTLE_OVER.why['field held at nightfall'] = ['night fell with your army still standing and the enemy\'s beaten', 'night fell with the enemy\'s army still standing and yours beaten']
// ── Camps (ruled 2026-11-25) ───────────────────────────
// A camp battle's words (engine/battle/camp.js). The camp: "your camp", the
// enemy's "the enemy's camp" (in an enemy unit's own doing, "their camp").
// Pitch, strike, carry: what is done with it. Burned: lost. Zach's own line
// for a camp lost undefended is kept as near his words as plain grammar
// lets it be ("Your camp lay undefended you can see the flames rising along
// with knowledge that your men will have no rest tonight.").
const CAMP = {
  ours: 'your camp',
  theirs: 'the enemy\'s camp',
  // What is done with it, in the dispatch. `who` is the unit's name as the
  // Commander knows it; `where` the place written out.
  pitched: (who, where, mine) => (mine ? `${who} pitched your camp ${where}` : `${who} pitched their camp ${where}`),
  struck: (who, mine) => (mine ? `${who} struck your camp and are carrying it` : `${who} struck their camp and are carrying it off`),
  dropped: (who, where, mine) => (mine
    ? (who ? `${who} broke and dropped your camp ${where}: it lies there for either side to take` : `the men carrying your camp are gone, and it lies ${where} for either side to take`)
    : `the enemy dropped their camp ${where}`),
  found: (who, where, status) => `${who} found the enemy's camp ${where}` + (status === 'dropped' ? ', lying where it was dropped' : ''),
  assailed: (by, where, hits, of, mine) => (mine
    ? `the enemy is in your camp ${where}: your men there are holding it, but it will not hold for ever (${hits} of ${of} assaults)`
    : `${by} are in the enemy's camp ${where}, fighting its guard`),
  burned: (by, where, undefended, mine) => (mine
    ? (undefended
      ? 'Your camp lay undefended: you can see the flames rising, and you know your men will have no rest tonight'
      : 'Your camp has fallen: its guard could hold it no longer. You can see the flames rising, and you know your men will have no rest tonight')
    : `${by} burned the enemy's camp ${where}: the smoke is rising over it, and his men will have no rest tonight`),
  tiring: 'Your army is tiring while the camp is on the move: every hour it is carried costs your men wind, until it is pitched again',
  // The night, told to each side of its own army.
  rest: {
    pitched: 'Night has fallen. Your men rested in camp, and will be fresh at first light',
    carried: 'Night has fallen, and your camp is not pitched: your men have no rest tonight, and will be as tired at first light as they are now',
    dropped: 'Night has fallen, and your camp lies where it was dropped: your men have no rest tonight, and will be as tired at first light as they are now',
    burned: 'Night has fallen. Your camp is burned: your men have no rest tonight, and will be as tired at first light as they are now'
  },
  dawn: (day) => `Dawn: the ${DAYS[day] ?? `${day}th`} day of the battle begins`,
  // After the last day the battle may run (combat/tables.js, CAMP.MAX_DAYS).
  daysOut: (day) => `The ${DAYS[day] ?? `${day}th`} night has fallen with neither army beaten: the battle is over, and neither side has won`,
  // Reading orders that name a camp.
  notFound: 'Your men have not found the enemy\'s camp. Send them to look for it, or name a place.',
  burnedTheirs: 'The enemy\'s camp is already burned.',
  noneOurs: 'Your camp is burned: there is none to go to. Name a place instead.',
  carriedBy: (who) => `Your camp is not pitched: ${who} are carrying it.`
}
// An army with no steady unit left holds out by its standing camp: what
// is left to do, told to both sides.
CAMP.holdsOut = (mine) => (mine
  ? 'Your army is broken and shelters in your camp: if the camp falls, the field is the enemy\'s. Hold the camp, and your men may rally there and rest tonight'
  : 'Their army is broken and shelters in its camp: take the camp and the field is yours')
module.exports.CAMP = CAMP
// The orders that work the camp, in the read-back's words (ORDER, above).
ORDER.pitch = { say: 'pitch the camp', doing: 'pitching the camp', did: 'pitched the camp', to: 'at' }
ORDER.strike = { say: 'strike the camp and carry it', doing: 'carrying the camp', did: 'struck the camp' }

// The battle of camps as a kind of battle (data/maps, kindsOf): the
// muster's card, and the tent's line under the map (web/battles.js,
// campLine). `where` is a grid square.
KINDS.camps = {
  title: 'A battle of camps',
  name: 'battle of camps',
  said: () => 'Each army marches out with its camp packed up, and pitches it where you choose. Keep yours standing: your broken men run to it and rally there, and it gives your army its night\'s rest. Carried or burned, your men tire and get no rest. Break the enemy and burn his camp, and the field is yours. Night does not end it: it may run over several days.'
}
CAMP.tent = {
  day: (day) => `Day ${day}.`,
  pitched: (where, hits, of) => `Your camp is pitched at ${where}${hits ? `, and has taken ${hits} of the ${of} assaults it can` : ''}.`,
  carried: (who) => `Your camp is packed up and carried by ${who ?? 'your men'}: your army tires while it is carried. Pitch it: "pitch the camp here".`,
  dropped: (where) => `Your camp lies dropped at ${where}: send men to take it up and pitch it.`,
  burned: 'Your camp is burned: your men tire, and will have no rest at night.',
  notFound: 'The enemy\'s camp: not yet found.',
  theirs: (where) => `The enemy's camp: at ${where}.`,
  theirsCarried: (where) => `The enemy's camp: carried, last seen at ${where}.`,
  theirsBurned: 'The enemy\'s camp: burned.'
}
// The Army tab, on the unit carrying the camp.
CAMP.carrying = 'They march at half their pace and fight worse for it, and your whole army tires while the camp is carried. Order them to pitch it: "pitch the camp here".'
// The verdict's reason, when the days ran out (combat/tables.js,
// CAMP.MAX_DAYS).
BATTLE_OVER.why['the days ran out'] = 'the days ran out with neither army beaten'
