// src/web/roster.js
//
// A Commander's roster: every unit he owns, and which of them march
// (ruled 2026-11-23: "You don't have to deploy every unit every game. But
// you cannot field an army over the supply threshold. Additional units from
// capture and other avenues exist. You can transfer officers." And: "You can
// name units after they get an officer").
//
// The roster is
//   the units he bought (commander.army.units), or with none bought his
//     faction's usual army; all of them together within his budget, as
//     buying always was (armies.js, checkArmy). So he cannot buy to the
//     budget, leave some at home and buy again: what he leaves at home is
//     still his, and still counted.
//   the units that came to him some other way (commander.gained), each with
//     `how` it came (AVENUES). These may take the roster beyond the budget.
//   his faction's elite, free, always in the field.
// What marches (commander.marching, the names; the elite always) must cost
// no more than the budget: a bought unit at its price, one that came some
// other way at the builder's price for its kit (standard.js: kitPrice),
// whoever forged it.
//
// A name a player types is checked here (nameRefusal). Names are not yet
// moderated: they reach other players' screens (the enemy's dispatches, a
// unit taken from him), always through esc().

const { FACTIONS } = require('../data/factions')
const { MAPS } = require('../data/maps')
const { resolveMap } = require('../engine/map/map')
const { detectFeatures } = require('../engine/map/features')
const { buildUnit } = require('../engine/army/builder')
const { usualArmy, kitOf, baseOf, kitPrice } = require('../engine/army/standard')
const { KINDS } = require('../interpreter/grammar')
const { KIT } = require('../narrator/words')
const { budgetOf, nextName, kitWords, unitNoun } = require('./armies')

/**
 * How a unit can come to a Commander other than by buying it. Each is a
 * word for the unit's card. Only capture is built: a unit given to him in a
 * deal for an enemy Commander's freedom (battles.js, settle). Another
 * avenue (a unit that deserts to him, one raised by a deed, one hired) adds
 * a line here and calls addToRoster.
 */
const AVENUES = {
  captured: 'taken from the enemy'
}

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1)

/** The units he bought, or with none his faction's usual army. */
function boughtOf(commander) {
  return commander.army?.units ?? (commander.faction ? usualArmy(commander.faction) : [])
}

/** The units that came to him some other way. */
function gainedOf(commander) {
  return commander.gained ?? []
}

/** His elite: the faction's, under the name he gave it if he did. */
function eliteOf(commander) {
  const f = FACTIONS[commander.faction]
  if (!f) return null
  const { name, size, ...kit } = f.elite
  return { name: commander.elite?.name ?? name, ...kitOf({ ...kit, quality: 'elite' }), formerly: commander.elite?.formerly ?? [], how: 'elite' }
}

/** What a unit of his roster costs to field. */
function priceOf(commander, unit) {
  if (unit.how === 'elite') return 0
  const culture = FACTIONS[commander.faction]?.culture
  if (unit.how === 'bought' || unit.how === 'usual') {
    const built = buildUnit(kitOf(unit), culture)
    if (built.ok) return built.cost
  }
  return kitPrice(unit, culture)
}

/** Every unit he owns, bought first, then those that came otherwise, then the elite; each with its price to field. */
function rosterOf(commander) {
  if (!commander.faction) return []
  const how = commander.army ? 'bought' : 'usual'
  return [
    ...boughtOf(commander).map(u => ({ ...u, how })),
    ...gainedOf(commander).map(u => ({ ...u })),
    eliteOf(commander)
  ].map(u => ({ ...u, cost: priceOf(commander, u) }))
}

/** The names of what marches, the elite aside: as he chose last time, else everything bought. */
function marchingOf(commander) {
  const roster = rosterOf(commander).filter(u => u.how !== 'elite')
  if (!Array.isArray(commander.marching)) return roster.filter(u => !(u.how in AVENUES)).map(u => u.name)
  return roster.filter(u => commander.marching.includes(u.name)).map(u => u.name)
}

/**
 * May these march? Every name his, and together within the budget.
 *
 * @returns {{ ok, errors, names, spent, budget }} `names` in roster order
 */
function checkMarching(commander, names) {
  const budget = budgetOf(commander.faction)
  const roster = rosterOf(commander).filter(u => u.how !== 'elite')
  const asked = (Array.isArray(names) ? names : []).slice(0, 60).map(String)
  const errors = asked.filter(n => !roster.some(u => u.name === n)).map(n => `You have no unit called "${n}" to march.`)
  const going = roster.filter(u => asked.includes(u.name))
  const unpriced = going.find(u => u.cost == null)
  if (unpriced) errors.push(`${cap(unpriced.name)}: their kit cannot be priced, so they cannot march.`)
  const spent = going.reduce((n, u) => n + (u.cost ?? 0), 0)
  if (spent > budget) errors.push(`They would cost ${spent} ${KIT.points} against a budget of ${budget}: leave one at home.`)
  return { ok: errors.length === 0, errors, names: going.map(u => u.name), spent, budget }
}

/**
 * What marches, as the battle needs it (standard.js, fieldArmies): the
 * bought units that march, those that came otherwise, and the elite's own
 * name; or, where he marches with his faction's usual army whole and as it
 * is, `units: null`, and it is mustered exactly as before.
 */
function fieldingOf(commander, names) {
  const going = new Set(names)
  const bought = boughtOf(commander)
  const gained = gainedOf(commander).filter(u => going.has(u.name))
  const units = bought.filter(u => going.has(u.name))
  const usualWhole = !commander.army && units.length === bought.length && gained.length === 0 && !commander.elite
  if (usualWhole) return { units: null, gained: [], elite: null }
  const e = eliteOf(commander)
  return { units, gained, elite: commander.elite ? { name: e.name, formerly: e.formerly } : null }
}

/** The names of the units he owns that do not march, the elite never among them. */
function benchedOf(commander, names) {
  return rosterOf(commander).filter(u => u.how !== 'elite' && !names.includes(u.name)).map(u => u.name)
}

// ── Names ─────────────────────────────────────────────

// Words the order reader takes for something else, or that would read
// badly as a name: everyone, the enemy, the sides, the order words,
// directions and the like.
const RESERVED = new Set([
  'everyone', 'everybody', 'all', 'army', 'armies', 'unit', 'units', 'troops', 'men', 'enemy', 'enemies', 'commander', 'commanders',
  'general', 'officer', 'officers', 'captain', 'i', 'me', 'my', 'mine', 'you', 'your', 'we', 'us', 'our', 'they', 'them', 'their',
  'it', 'its', 'he', 'him', 'his', 'and', 'or', 'but', 'then', 'to', 'with', 'at', 'on', 'by', 'from', 'for', 'in', 'into', 'the',
  'a', 'an', 'not', 'no', 'red', 'blue', 'advance', 'attack', 'charge', 'hold', 'halt', 'stop', 'go', 'move', 'march', 'retreat',
  'withdraw', 'fall', 'back', 'rally', 'form', 'ride', 'join', 'follow', 'ambush', 'hide', 'shoot', 'fire', 'loose', 'volley',
  'spring', 'trap', 'wait', 'stay', 'screen', 'cover', 'flank', 'seek', 'destroy', 'yield', 'surrender', 'run', 'left', 'right',
  'centre', 'center', 'front', 'rear', 'north', 'south', 'east', 'west', 'here', 'there', 'them', 'that', 'this', 'these', 'those'
])
// What the order reader calls kinds of troops: its own words, the kinds a
// unit's role is called, and the names the game gives kit.
const ROLE_WORDS = ['spearmen', 'spearman', 'infantry', 'cavalry', 'archer', 'archers', 'heavy', 'elite', 'horse', 'riders', 'lancers']
const KIND_WORDS = new Set([
  ...ROLE_WORDS,
  ...Object.values(KIT.unit).filter(n => !n.includes(' ')),
  ...Object.values(KIT.unit).filter(n => n.includes(' ')).map(n => n.split(' ').at(-1))
])
const isKind = (word) => KIND_WORDS.has(word) || KINDS.some(([, pattern]) => new RegExp(pattern.source, 'i').test(word))
// Every name the game gives a unit in any faction, and every elite's.
const GAME_NAMES = new Set(Object.values(FACTIONS).flatMap(f => [f.elite.name, ...f.army.map(u => u.name)]).map(n => n.toLowerCase()))
// The places of every field, and the words for kinds of ground.
const plainPlace = (name) => String(name).toLowerCase().replace(/['’]/g, '').replace(/^the /, '').replace(/\s+/g, ' ').trim()
const PLACES = new Set(Object.keys(MAPS).flatMap(key => {
  const map = resolveMap(key)
  const found = detectFeatures(map)
  const features = (found.features ?? found).map?.(f => f.name).filter(Boolean) ?? []
  return [MAPS[key].title ?? key, key, ...features].map(plainPlace)
}))
const GROUND = new Set(['hill', 'hills', 'ridge', 'ford', 'fords', 'bridge', 'road', 'crossing', 'wood', 'woods', 'forest', 'river', 'stream',
  'brook', 'vale', 'valley', 'copse', 'fen', 'marsh', 'gap', 'knoll', 'glade', 'clearing', 'downs', 'village', 'mill', 'field', 'camp'])

const NAME_FORM = /^[a-z]+( [a-z]+){0,2}$/

/** A name as it is kept: lower case, single spaces, no leading "the". */
function plainName(raw) {
  return String(raw ?? '').normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ').replace(/^the /, '')
}

/**
 * Why this unit of his may not be called this, or null if it may.
 *
 * The rules: one to three words of plain letters, 3 to 24 letters and
 * spaces in all, each word two letters or more; not a word the order reader
 * takes for something else (everyone, the enemy, an order, a direction, a
 * side), nor a kind of troops ("horse", "archers", "spears"), nor a name the
 * game gives any unit; not a place on any field, nor a kind of ground;
 * different from every other unit he owns. Only a unit with an officer may
 * be named.
 */
function nameRefusal(commander, unitName, name, { company = commander.company } = {}) {
  const roster = rosterOf(commander)
  const unit = roster.find(u => u.name === unitName)
  if (!unit) return `You have no unit called "${unitName}".`
  if (!company.officers.some(o => o.leads === unitName)) return `The ${unitName} have no officer: a unit may be named once it has one.`
  if (!name) return 'Give them a name.'
  if (name.length < 3 || name.length > 24) return 'A name is 3 to 24 letters long.'
  if (!NAME_FORM.test(name)) return 'A name is one to three words of plain letters, with no numbers or marks.'
  const words = name.split(' ')
  if (words.some(w => w.length < 2)) return 'Each word of a name is two letters or more.'
  if (name === unitName) return `They are called the ${name} already.`
  const reserved = words.find(w => RESERVED.has(w))
  if (reserved) return `"${reserved}" means something else in an order: it cannot be in a name.`
  const kind = words.find(isKind)
  if (kind) return `"${kind}" is a kind of troops in an order: it cannot be in a name.`
  if (GAME_NAMES.has(name)) return `"${name}" is a name the game gives troops: choose one of your own.`
  if (PLACES.has(name)) return `"${name}" is a place on the field: it cannot be a unit's name.`
  const ground = words.find(w => GROUND.has(w))
  if (ground) return `"${ground}" is a kind of ground in an order: it cannot be in a name.`
  if (roster.some(u => u.name !== unitName && (u.name === name || baseOf(u.name) === name))) return `You have a unit called the ${name} already.`
  return null
}

/**
 * The roster after a unit is renamed: its name, and what it was called
 * before (so that it still answers to that), in the bought army, among
 * the units that came otherwise, in what marches, or the elite's. A unit of
 * the usual army, renamed, makes the usual army his own list.
 *
 * @returns {{ army, gained, marching, elite }} the fields to keep
 */
function renamed(commander, from, to) {
  const rename = (u) => (u.name === from
    ? { ...u, name: to, named: true, formerly: [...new Set([...(u.formerly ?? []), from])].filter(n => n !== to) }
    : u)
  const e = eliteOf(commander)
  const out = { marching: marchingOf(commander).map(n => (n === from ? to : n)) }
  if (e?.name === from) {
    out.elite = { name: to, formerly: [...new Set([...e.formerly, from])].filter(n => n !== to) }
  } else if (gainedOf(commander).some(u => u.name === from)) {
    out.gained = gainedOf(commander).map(rename)
  } else {
    out.army = { units: boughtOf(commander).map(rename) }
  }
  return out
}

/**
 * The roster without a unit (given to the enemy). A unit of the usual army
 * gone makes the rest of it his own list; his elite given up is raised
 * again, as the faction's, under its own name.
 */
function without(commander, name) {
  const e = eliteOf(commander)
  const out = { marching: marchingOf(commander).filter(n => n !== name) }
  if (e?.name === name) out.elite = null
  else if (gainedOf(commander).some(u => u.name === name)) out.gained = gainedOf(commander).filter(u => u.name !== name)
  else if (boughtOf(commander).some(u => u.name === name)) out.army = { units: boughtOf(commander).filter(u => u.name !== name) }
  return out
}

/**
 * A unit that comes to him otherwise than by buying (`how`, one of
 * AVENUES): its kit as it was, whatever his faction could buy. Its name is
 * kept if no unit of his bears it, else it is given the next free one by
 * the rule a bought unit's is (armies.js, nextName).
 *
 * @param {Object} unit { name, quality, weapon, armor, shield, mounted, men?, culture, from? }
 * @returns {{ gained, unit }} the new list, and the unit as it is kept
 */
function addToRoster(commander, unit, how) {
  if (!(how in AVENUES)) throw new Error(`no avenue "${how}"`)
  const names = rosterOf(commander).map(u => u.name)
  const elite = FACTIONS[commander.faction]?.elite?.name
  const clash = (n) => names.some(x => x === n || baseOf(x) === n || baseOf(n) === x) || n === elite
  const name = unit.name && !clash(unit.name) ? unit.name : nextName(commander.faction, kitOf(unit), [...names, ...(elite ? [elite] : [])])
  const kept = {
    name, ...kitOf(unit), how,
    ...(Number.isInteger(unit.men) ? { men: unit.men } : {}),
    ...(unit.culture ? { culture: unit.culture } : {}),
    ...(unit.from ? { from: unit.from } : {}),
    // Renamed here, it still answers to what it was called (where nothing
    // else does: standard.js).
    ...(name !== unit.name && unit.name ? { formerly: [...new Set([...(unit.formerly ?? []), unit.name])] } : unit.formerly ? { formerly: unit.formerly } : {}),
    ...(unit.named && name === unit.name ? { named: true } : {})
  }
  return { gained: [...gainedOf(commander), kept], unit: kept }
}

/** The roster as his screens show it. */
function rosterView(commander) {
  if (!commander.faction) return null
  const marching = marchingOf(commander)
  const company = commander.company
  return {
    budget: budgetOf(commander.faction),
    marching,
    units: rosterOf(commander).map(u => {
      const officer = company.officers.find(o => o.leads === u.name)
      return {
        name: u.name, how: u.how, cost: u.cost, words: kitWords(u),
        marches: u.how === 'elite' || marching.includes(u.name),
        ...(u.how in AVENUES ? { came: AVENUES[u.how] } : {}),
        ...(u.from ? { from: u.from } : {}),
        ...(u.named ? { named: true } : {}),
        ...(u.formerly?.length ? { formerly: u.formerly } : {}),
        officer: officer ? { id: officer.id, name: officer.name, status: officer.status } : null
      }
    })
  }
}

module.exports = {
  AVENUES, rosterOf, rosterView, marchingOf, checkMarching, fieldingOf, benchedOf, plainName, nameRefusal, renamed, without, addToRoster, eliteOf, unitNoun,
  RESERVED
}
