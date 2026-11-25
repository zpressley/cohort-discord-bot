// src/narrator/turnNarrator.js
//
// One side's turn, told back in prose. The narrator gets the events of the
// turn that side could know about, described in words, and writes a short
// report in the voice of that side's culture. It never sees raw state, never
// sees what fog of war hides, and never changes what happened.
//
// If the AI is missing or fails, the report falls back to plain lines
// (eventText.js and the hotseat wording), so a turn is always reported.

const { featuresAt, detectFeatures } = require('../engine/map/features')
const { distance } = require('../engine/map/labels')
const { compassWord, TILE_METRES } = require('../engine/map/places')
const { orderWords, moraleWords, ORDER, RIDER, NIGHT, GROUND, SKIRMISH_WORDS, THROWN_WORDS, ON_HIS_OWN } = require('./words')
const { gridLabel } = require('../engine/map/grid')
const { RIDER_TAKEN } = require('./words')
const { BATTLE_OVER } = require('./words')
const { PLACE } = require('./words')
const { FOLLOW_WORDS } = require('./words')
const { HELD_BACK } = require('./words')
const { REPORT } = require('./words')

// Where a tile is, in words: the feature it is part of, or the nearest
// feature with a name, or open ground near the nearest feature.
//
// One place has one name, to both sides (docs/REVIEW-2026-11.md, S13: the
// same fight was "on the road (F6-NW)" to one side and "at Brook Ford
// (F6-NW)" to the other). A place is told with its quarter of a grid square,
// so it is named by the quarter: the most particular named feature in it
// (the one of fewest tiles: a ford before the road through it), whichever
// of its four tiles a unit stands on. With none named, the tile's own ground.
function placeName(map, position) {
  const named = quarterOf(position).flatMap(t => featuresAt(map, t)).filter(f => f.name)
    .sort((a, b) => a.tiles.length - b.tiles.length || String(a.name).localeCompare(String(b.name)))
  if (named.length > 0) {
    const f = named[0]
    return `${f.kind === 'hill' || f.kind === 'road' ? 'on' : 'at'} ${PLACE.name(f.name)}`
  }
  if (map.terrainAt(position) === 'road') return 'on the road'
  const here = featuresAt(map, position).filter(f => f.kind !== 'road')
  if (here.length > 0) {
    const f = here[0]
    return { hill: 'on the high ground', woods: 'in the woods', marsh: 'in the marsh', clearing: 'in a clearing', ford: 'at a ford', bridge: 'on a bridge', river: 'in the river' }[f.kind] ?? 'in the field'
  }
  let best = null
  for (const f of detectFeatures(map)) {
    if (f.kind === 'road' || f.kind === 'river') continue
    const tiles = Math.min(...f.tiles.map(t => distance(position, t)))
    if (!best || tiles < best.tiles) best = { f, tiles }
  }
  if (!best || best.tiles > 12) return 'in open ground'
  const what = best.f.name ? PLACE.name(best.f.name) : `the ${best.f.kind === 'hill' ? 'high ground' : best.f.kind}`
  return `in open ground ${best.tiles * TILE_METRES} m ${compassWord(best.f.centre, position)} of ${what}`
}

// The four tiles of a grid square's quarter (engine/map/grid.js: 2x2 tiles).
function quarterOf(position) {
  const x = position.x - (position.x % 2)
  const y = position.y - (position.y % 2)
  return [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }]
}

// The units an event is about.
function involved(event) {
  return [event.unitId, event.aId, event.bId, event.by, event.a?.unitId, event.b?.unitId].filter(Boolean)
}

// Events only the unit's own side knows of: its hiding, its search, an
// ambush it held back, how packed its ranks are.
const PRIVATE = new Set(['hidden', 'hideFailed', 'ambushHeld', 'checked', 'crowding', 'heartened', 'reacted', 'lostThread', 'commanderMoved', 'quarryGone', 'ownCommand', 'deserted', 'commanderRode', 'riderSent', 'riderBlocked', 'cutOff', 'inTouch', 'initiative', 'riderTaken', 'followLost', 'heldBack'])
// The engine's own record of a roll, which no commander is told of.
const UNTOLD = new Set(['grasp'])

/**
 * The events one side could know about: everything involving its own units,
 * plus events about enemies it can see at the end of the turn, plus the
 * verdict and objectives. Fog of war holds: an unseen enemy's doings are not
 * reported, and a side never hears of the other's hiding or held ambushes.
 */
function visibleEvents(events, { ownIds, seenEnemyIds }) {
  return events.filter(e => {
    if (UNTOLD.has(e.type)) return false
    if (e.type === 'victory' || e.type === 'objective' || e.type === 'nightfall') return true
    if (PRIVATE.has(e.type)) return ownIds.has(e.unitId)
    if (e.type === 'revealed') {
      return ownIds.has(e.unitId) || (e.by && ownIds.has(e.by)) || seenEnemyIds.has(e.unitId)
    }
    const ids = involved(e)
    return ids.some(id => ownIds.has(id)) || (ids.length > 0 && ids.every(id => seenEnemyIds.has(id)))
  })
}

/**
 * What a Commander held by the enemy hears of a turn (ruled 2026-11-23:
 * "You get updates from the captors' point of view... as if you are sitting
 * nearby as reports come in"): what the unit holding him could see and
 * hear, and no more. An event is told only if every unit in it was in that
 * unit's sight at the end of the turn; and the verdict, the ground changing
 * hands, and what befell him. The enemy's own doings that only its side
 * knows (its hiding, its orders), and his own army's beyond that sight, do
 * not reach him. Run before `report`, which applies the side's own fog on
 * top.
 *
 * @param {Array} events
 * @param {{ seen: Set<string>, side: string }} where  seen: the unit holding
 *   him and every unit it could see (command/commander.js, sightFrom)
 */
function fromCaptivity(events, { seen, side }) {
  return events.filter(e => {
    if (UNTOLD.has(e.type)) return false
    if (e.type === 'victory' || e.type === 'objective' || e.type === 'nightfall') return true
    if (e.type.startsWith('commander') && e.type !== 'commanderRode') return e.side === side
    const ids = involved(e)
    return ids.length > 0 && ids.every(id => seen.has(id))
  })
}

/**
 * A turn's events boiled down to what a report needs: a turn can run several
 * ten-minute ticks, and the raw log repeats itself across them.
 *   - a unit's moves become one move, from where it started to where it
 *     ended; a unit that got nowhere is not said to have moved
 *   - the rounds two units fought become one fight with the losses summed,
 *     and "came to blows" is dropped when the fight itself is reported
 *   - a unit that fell back before the enemy tick after tick is told once
 *   - crowding is reported once per unit, as it stood at the end, and not at
 *     all if the ranks had room again by then
 * Order is kept: each merged event stands where its first part stood.
 */
function summarise(events) {
  const out = []
  const moves = new Map()
  const fights = new Map()
  const crowds = new Map()
  const hearts = new Map()
  const shots = new Map()
  const falls = new Map()
  const pair = (a, b) => [a, b].sort().join('|')

  for (const e of events) {
    if (e.type === 'move') {
      const seen = moves.get(e.unitId)
      if (seen) { seen.to = e.to; seen.blockedBy = e.blockedBy; seen.reachedTarget = e.reachedTarget; continue }
      const merged = { ...e }
      moves.set(e.unitId, merged)
      out.push(merged)
    } else if (e.type === 'exchange') {
      const key = pair(e.a.unitId, e.b.unitId)
      const seen = fights.get(key)
      if (seen) {
        const [mine, theirs] = seen.a.unitId === e.a.unitId ? [e.a, e.b] : [e.b, e.a]
        seen.a = { ...seen.a, killed: seen.a.killed + mine.killed, morale: mine.morale, surprise: seen.a.surprise || mine.surprise }
        seen.b = { ...seen.b, killed: seen.b.killed + theirs.killed, morale: theirs.morale, surprise: seen.b.surprise || theirs.surprise }
        seen.rounds += 1
        continue
      }
      const merged = { ...e, a: { ...e.a }, b: { ...e.b }, rounds: 1 }
      fights.set(key, merged)
      out.push(merged)
    } else if (e.type === 'volley') {
      // The volleys one unit loosed at another, as one line with the total.
      const key = `${e.by}>${e.unitId}`
      const seen = shots.get(key)
      if (seen) { seen.killed += e.killed; seen.remaining = e.remaining; seen.volleys += 1; continue }
      const merged = { ...e, volleys: 1 }
      shots.set(key, merged)
      out.push(merged)
    } else if (e.type === 'gaveGround') {
      // A unit that fell back tick after tick, as one line: before whom, and
      // where it ended.
      const seen = falls.get(e.unitId)
      if (seen) { seen.from = [...new Set([...seen.from, ...e.from])].sort(); seen.to = e.to; continue }
      const merged = { ...e, from: [...e.from] }
      falls.set(e.unitId, merged)
      out.push(merged)
    } else if (e.type === 'heartened') {
      // Everyone who took heart at the same enemy's breaking, in one line.
      const seen = hearts.get(e.by)
      if (seen) { if (!seen.units.includes(e.unitId)) seen.units.push(e.unitId); continue }
      const merged = { ...e, units: [e.unitId] }
      hearts.set(e.by, merged)
      out.push(merged)
    } else if (e.type === 'crowding') {
      const seen = crowds.get(e.unitId)
      if (seen) { Object.assign(seen, e); continue }
      const merged = { ...e }
      crowds.set(e.unitId, merged)
      out.push(merged)
    } else {
      out.push(e)
    }
  }

  const same = (p, q) => p && q && p.x === q.x && p.y === q.y
  return out.filter(e => {
    if (e.type === 'move') return !same(e.from, e.to)
    if (e.type === 'contact') return !fights.has(pair(e.aId, e.bId))
    if (e.type === 'crowding') return e.tier !== 'organized'
    return true
  })
}

// The events anyone may hear of, whoever is reading: for a report shown to
// both commanders at once (the two-player hotseat screen).
function publicEvents(events) {
  return events.filter(e => !PRIVATE.has(e.type) && !UNTOLD.has(e.type))
}

// One event as a plain fact the model can retell: names and places. Names
// of enemies this side has not seen are hidden too.
function fact(map, event, known = null) {
  if (known) event = maskNames(event, known)
  return plainFact(map, event)
}

// Where, for a report: the ground in words and the grid square the player
// gives orders by.
function whereAt(map, position) {
  return `${placeName(map, position)} (${gridLabel(position, { quarter: true })})`
}

// The place an order names, as it can follow "march to": the named
// feature there, if it has a name, with its grid square ("The Crownhill
// (E1-SE)"); else the grid square alone, as the Army tab gives it.
function orderPlace(map, position) {
  const named = /^(?:at|on) ((?:the )?[A-Z].*)$/.exec(placeName(map, position))
  const square = gridLabel(position, { quarter: true })
  return named ? `${named[1]} (${square})` : square
}

// What an order's condition was, and what the unit then did, in words.
const REACTED_TO = { sees: 'saw the enemy they were warned of', attacked: 'were attacked', breaks: 'saw their friends break' }
// (It has only just turned to the other thing, so "began to" where the plain
// past would say it was already done.)
function didWords(map, event) {
  const place = event.target ? whereAt(map, event.target) : null
  if (event.action === 'hold' || (!place && event.action === 'defend')) return 'held'
  if (event.action === 'withdraw' && !place) return 'fell back'
  if (event.action === 'advance' || (event.action === 'attack' && !place)) return 'advanced on the enemy'
  return `began to ${orderWords('say', event, place)}`
}

const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`)
const listOf = (names) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
const men = (n) => (n === 1 ? '1 man' : `${n} men`)
const capital = (word) => String(word).charAt(0).toUpperCase() + String(word).slice(1)
// A unit is men, and plural in this game's English: "Hastati were pinned",
// "enemy troops hold it". Only an enemy no one saw ("an unseen enemy",
// maskNames) is one.
const ONE = 'an unseen enemy'
const was = (id) => (id === ONE ? 'was' : 'were')
const is = (id) => (id === ONE ? 'is' : 'are')
const s_ = (id, verb) => (id === ONE ? `${verb}s` : verb)

// How a unit stands after a fight, when it is worth saying.
function shaken(side) {
  const state = moraleWords(side.morale)
  return state === 'firm' ? '' : `${side.unitId} ${is(side.unitId)} ${state}; `
}

const NAME_FIELDS = ['unitId', 'aId', 'bId', 'by', 'on', 'blockedBy']
function maskNames(event, known) {
  const out = { ...event }
  for (const key of NAME_FIELDS) {
    if (typeof out[key] === 'string' && !known(out[key])) out[key] = 'an unseen enemy'
  }
  return out
}

// How many men an enemy unit is, in a report: as many as he has been told
// (the caller's `howMany`, by what his reports of it hold; ruled 2026-11-23:
// "never incorrect details"). By default, the count.
const countAll = (id, n) => men(n)

function plainFact(map, event, howMany = countAll) {
  switch (event.type) {
    case 'move': return `${event.unitId} marched ${distance(event.from, event.to) * TILE_METRES} m ${compassWord(event.from, event.to)}, now ${whereAt(map, event.to)}` +
      (event.blockedBy ? `, halted by ${event.blockedBy}` : '')
    case 'arrived': return `${event.unitId} arrived ${whereAt(map, event.at)}` + (event.then === 'hold' ? ` and ${s_(event.unitId, 'hold')} it` : '')
    case 'halted': return `${event.unitId} could get no further${event.blockedBy ? `, ${event.blockedBy} in the way` : ''}`
    case 'contact': return `${event.aId} and ${event.bId} came to blows`
    case 'surprise': return `${event.unitId} ${was(event.unitId)} caught on the march by ` +
      (event.by === ONE ? 'an enemy no one had seen' : `${event.by}, unseen until they struck`)
    case 'exchange': return `${event.a.unitId} and ${event.b.unitId} fought` +
      (event.rounds > 1 ? ` for ${event.rounds * 10} minutes` : '') +
      `: ${event.a.unitId} lost ${men(event.a.killed)}, ${event.b.unitId} lost ${event.b.killed}` +
      `; ${shaken(event.a)}${shaken(event.b)}`.replace(/; $/, '')
    case 'standoff': return `${event.aId} and ${event.bId} were both close to breaking`
    case 'push': return `${event.by} drove ${event.unitId} back${event.lostHighGround ? ' off the high ground' : ''}`
    case 'crush': return `${event.unitId} ${was(event.unitId)} pinned with nowhere to give way`
    case 'reacted': return `${event.unitId} ${REACTED_TO[event.when] ?? 'saw the moment come'}${event.when === 'sees' && event.kind ? ` (${event.kind})` : ''} and, as ordered, ${didWords(map, event)}`
    case 'lostThread': return (event.headless
      ? `${event.unitId}, with no officer, had only the first of their orders`
      : `${event.officer ? `${event.officer} of ${event.unitId}` : `the officer of ${event.unitId}`} lost the thread of his orders`) +
      (event.lost === 'condition' ? ' when the moment came' : ' once the first part was done') +
      (event.did === 'advance' ? ' and advanced on the enemy' : event.did === 'hold' ? ' and held where he stood' : ' and carried on as he was')
    case 'quarryGone': return `${event.on}, whom ${event.unitId} were sent to attack, are beaten or gone; ${event.unitId} ${ORDER.advance.did} instead`
    case 'followLost': return (FOLLOW_WORDS.lost[event.why] ?? FOLLOW_WORDS.lost.gone)(event.unitId, event.on)
    case 'volley': return `${event.by} shot at ${event.unitId}` + (event.killed ? `, felling ${men(event.killed)}` : ', to little effect')
    case 'thrown': return `${event.by} ${THROWN_WORDS.threw(event.weapon, event.unitId)}` + (event.killed ? `, felling ${men(event.killed)}` : ', to little effect')
    case 'rout': return `${event.unitId} broke and fled from ${event.by}`
    case 'pursuit': return `${event.by} cut down ${event.killed} of the fleeing ${event.unitId}` + (event.trapped ? ', who were cornered' : '')
    case 'commanderTaken': return `the Commander riding with ${event.unitId} was taken by ${event.by}`
    case 'commanderKilled': return `the Commander riding with ${event.unitId} was killed in the fight with ${event.by}`
    case 'commanderFreed': return `the Commander held by ${event.by} got free and reached ${event.unitId}`
    case 'commanderMoved': return `the Commander got away from ${event.from} to ${event.unitId}`
    case 'commanderRode': return `the Commander rode over from ${event.from} to ${event.unitId}`
    case 'ownCommand': return ownCommandWords(event)
    case 'initiative': return ON_HIS_OWN.line(`${event.officer ?? 'the officer'} of ${event.unitId}`, (ON_HIS_OWN.did[event.did] ?? ON_HIS_OWN.did.hold)(event.ground), (ON_HIS_OWN.why[event.why] ?? (() => ''))(event.ground))
    case 'officerYielded': return `${event.officer} of ${event.unitId}, the senior officer on the field, yielded it to save what was left of the army`
    case 'riderSent': return RIDER.sent(event.unitId, event.minutes)
    case 'riderBlocked': return RIDER.blocked(event.unitId)
    case 'riderTaken': return RIDER_TAKEN.line(event.unitId, whereAt(map, event.at), event.to,
      orderWords('say', event.order, event.order.enemy ?? (event.order.target ? orderPlace(map, event.order.target) : null)))
    case 'cutOff': return RIDER.lostTouch(event.unitId)
    case 'inTouch': return RIDER.backInTouch(event.unitId)
    case 'deserted': return `${men(event.men)} of ${event.unitId} slipped away${event.officer ? `, ${event.officer} unable or unwilling to hold them` : ''}; ${event.strength} left`
    case 'fled': return `${event.unitId} left the field` + (howMany(event.unitId, event.strength) ? ` with ${howMany(event.unitId, event.strength)}` : '')
    case 'rallied': return `${event.unitId} rallied ${whereAt(map, event.at)}` + (howMany(event.unitId, event.strength) ? ` with ${howMany(event.unitId, event.strength)}` : '') +
      (moraleWords(event.morale) === 'at breaking point' ? ', at breaking point: they will not stand long without a success near them' : '')
    case 'heldBack': return HELD_BACK.line(event.unitId)
    case 'heartened': return `${listOf(event.units ?? [event.unitId])} took heart at the breaking of ${event.by}`
    case 'destroyed': return `${event.unitId} ${was(event.unitId)} destroyed`
    case 'crowding': return event.tier === 'organized'
      ? `${event.unitId} had room to fight again`
      : `${possessive(event.unitId)} ranks were ${event.tier}: ${men(event.men)} packed onto one spot ${whereAt(map, event.at)}, which blunts their fighting`
    case 'objective': return event.close ? `${capital(event.side)} is ${event.close} minutes from taking the field by holding ${event.name}`
      : event.side
      ? `${capital(event.side)} took ${event.name}`
      : `${event.name} was no longer held${event.was ? ` by ${capital(event.was)}` : ''}`
    case 'gaveGround': return SKIRMISH_WORDS.gaveGround(event.unitId, listOf(event.from))
    case 'disengage': return `${event.unitId} broke off the fight` +
      (event.orderly ? ' in good order' : '') +
      (event.killed ? `, losing ${men(event.killed)} to the parting blows` : ' cleanly')
    case 'ambush': return `${event.unitId} sprang an ambush on ${event.on} ${whereAt(map, event.at)}`
    case 'ambushHeld': return event.reason === 'on guard'
      ? `${event.unitId} let ${event.on} pass: it came on guard, not worth the strike`
      : `${event.unitId} let ${event.on} pass, as ordered`
    case 'hidden': return `${event.unitId} went into hiding ${whereAt(map, event.at)} and ${is(event.unitId)} hidden`
    case 'hideFailed': return event.reason === 'watched'
      ? `${event.unitId} tried to hide but the enemy was watching`
      : `${event.unitId} found no cover to hide in`
    case 'checked': return `${event.unitId} searched the ground ${whereAt(map, event.at)}` +
      (event.found.length ? ` and found ${event.found.join(', ')} hidden there` : ' and found nothing')
    case 'revealed': return event.reason === 'found' ? `${event.unitId} ${was(event.unitId)} discovered`
      : event.reason === 'stumbled on' ? `${event.unitId} ${was(event.unitId)} stumbled upon`
      : event.reason === 'noticed' ? `${event.unitId} ${was(event.unitId)} noticed, hidden close by`
      : `${event.unitId} came out of hiding`
    case 'victory': return event.winner === 'draw' ? `the battle ended with neither side the victor (${event.reason})` : `the battle is over: ${capital(event.winner)} won (${event.reason})`
    case 'nightfall': return NIGHT.ended
    default: return null
  }
}

// What an officer did with his unit while his Commander was held (ruled
// 2026-11-23: "each commander is running his own unit at that point").
function ownCommandWords(event) {
  const who = event.headless ? `${event.unitId}, with no officer to lead them,` : `${event.officer ?? 'The officer'} of ${event.unitId}${event.nature ? `, ${event.nature},` : ''}`
  switch (event.did) {
    case 'rescue': return `${who} went for ${event.on ?? 'the men who hold you'} to free you` + (event.morale !== undefined ? ', and his shaken men took heart' : '')
    case 'advance': return `${who} led them at the enemy`
    case 'hold': return event.headless ? `${who} held where they stood` : `${who} halted and held where they stood`
    default: return `${who} kept to the orders they had`
  }
}

// How much a commander needs to hear of each kind of event: lower is sooner.
const WEIGHT = {
  victory: 0, nightfall: 0, commanderKilled: 0, commanderTaken: 0, commanderFreed: 0, commanderMoved: 1, destroyed: 1, rout: 1, fled: 1, rallied: 1, pursuit: 2, ambush: 1, surprise: 2, objective: 2,
  volley: 3, thrown: 3, lostThread: 1, reacted: 2, quarryGone: 2, followLost: 2, ownCommand: 1, initiative: 1, officerYielded: 0, deserted: 1, commanderRode: 1, riderBlocked: 2, riderSent: 6, cutOff: 1, inTouch: 3, riderTaken: 1,
  heartened: 5, heldBack: 1,
  revealed: 3, exchange: 3, standoff: 3, push: 4, crush: 4, disengage: 4, gaveGround: 4, contact: 4,
  hidden: 5, hideFailed: 5, checked: 5, ambushHeld: 5, crowding: 6, arrived: 6, halted: 6, move: 7
}
const weight = (event) => WEIGHT[event.type] ?? 5
// The most a dispatch is asked to carry.
const MAX_FACTS = 14

// The kinds of event that together tell how a unit's fighting went. They are
// reported per unit (digest, below), not one by one.
const FIGHTING = new Set(['contact', 'exchange', 'rout', 'pursuit', 'push', 'destroyed', 'fled', 'volley', 'thrown'])

/**
 * How the fighting went for each of the side's own units, one line a unit:
 * who it fought and where, what it lost and what it cost the enemy, which
 * enemies it broke, and how it stands now. A turn's fighting is a dozen or
 * more events; told unit by unit it is two or three lines that cannot be
 * muddled (who lost what, who ran from whom).
 *
 * @param {Array} events   already cut to what the side knows, summarised,
 *                         and with unseen enemies' names masked
 * @param {Object} about   { map, ownIds, whereIs(id) -> position | null }
 * @returns {Array<{ weight, text }>}
 */
function digest(events, { map, ownIds, whereIs = () => null }) {
  const units = new Map()
  const of = (id) => {
    if (!units.has(id)) {
      units.set(id, { id, foes: [], lost: 0, killed: 0, morale: null, broke: null, lostInFlight: 0, left: null, destroyed: false, brokeEnemies: [], cutDown: 0, drove: [], drivenBy: [], met: [], shotAt: [], felled: 0, shotBy: [], lostToFire: 0, threw: null, threwAt: [], felledThrown: 0, thrownBy: null, thrownFrom: [], lostToThrown: 0 })
    }
    return units.get(id)
  }
  const add = (list, value) => { if (!list.includes(value)) list.push(value) }

  for (const e of events) {
    if (e.type === 'exchange') {
      for (const [mine, theirs] of [[e.a, e.b], [e.b, e.a]]) {
        if (!ownIds.has(mine.unitId)) continue
        const u = of(mine.unitId)
        add(u.foes, theirs.unitId)
        u.lost += mine.killed
        u.killed += theirs.killed
        u.morale = mine.morale
      }
    } else if (e.type === 'volley') {
      if (ownIds.has(e.by)) { const u = of(e.by); add(u.shotAt, e.unitId); u.felled += e.killed }
      if (ownIds.has(e.unitId)) { const u = of(e.unitId); add(u.shotBy, e.by); u.lostToFire += e.killed }
    } else if (e.type === 'thrown') {
      if (ownIds.has(e.by)) { const u = of(e.by); u.threw = e.weapon; add(u.threwAt, e.unitId); u.felledThrown += e.killed }
      if (ownIds.has(e.unitId)) { const u = of(e.unitId); u.thrownBy = e.weapon; add(u.thrownFrom, e.by); u.lostToThrown += e.killed }
    } else if (e.type === 'contact') {
      for (const [mine, theirs] of [[e.aId, e.bId], [e.bId, e.aId]]) if (ownIds.has(mine)) add(of(mine).met, theirs)
    } else if (e.type === 'rout') {
      if (ownIds.has(e.unitId)) of(e.unitId).broke = e.by
      else if (ownIds.has(e.by)) add(of(e.by).brokeEnemies, e.unitId)
    } else if (e.type === 'pursuit') {
      if (ownIds.has(e.unitId)) of(e.unitId).lostInFlight += e.killed
      else if (ownIds.has(e.by)) of(e.by).cutDown += e.killed
    } else if (e.type === 'push') {
      if (ownIds.has(e.unitId)) add(of(e.unitId).drivenBy, e.by)
      else if (ownIds.has(e.by)) add(of(e.by).drove, e.unitId)
    } else if (e.type === 'destroyed') {
      if (ownIds.has(e.unitId)) of(e.unitId).destroyed = true
    } else if (e.type === 'fled') {
      if (ownIds.has(e.unitId)) of(e.unitId).left = e.strength
    }
  }

  const list = (ids) => ids.length <= 1 ? ids.join('') : `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`
  const lines = []
  for (const u of units.values()) {
    const parts = []
    const where = whereIs(u.id)
    const foes = u.foes.length ? u.foes : u.met
    // Javelins and pila are thrown as the fighting begins: told first.
    if (u.threw) parts.push(THROWN_WORDS.threw(u.threw, list(u.threwAt)) + (u.felledThrown ? `, felling ${men(u.felledThrown)}` : ', to little effect'))
    if (u.thrownBy) parts.push(THROWN_WORDS.met(u.thrownBy, list(u.thrownFrom)) + (u.lostToThrown ? `, losing ${men(u.lostToThrown)}` : ', without loss'))
    if (foes.length) {
      parts.push(`${u.foes.length ? 'fought' : 'met'} ${list(foes)}${where ? ` ${whereAt(map, where)}` : ''}`)
    }
    if (u.foes.length) parts.push(`lost ${men(u.lost)} and killed ${u.killed}`)
    if (u.shotAt.length) parts.push(`shot at ${list(u.shotAt)}` + (u.felled ? `, felling ${men(u.felled)}` : ', to little effect'))
    if (u.shotBy.length) parts.push(`were shot at by ${list(u.shotBy)}` + (u.lostToFire ? `, losing ${men(u.lostToFire)}` : ', without loss'))
    if (u.drove.length) parts.push(`drove ${list(u.drove)} back`)
    if (u.brokeEnemies.length) parts.push(`broke ${list(u.brokeEnemies)}` + (u.cutDown ? `, cutting down ${u.cutDown} as they ran` : ''))
    else if (u.cutDown) parts.push(`cut down ${u.cutDown} of the fleeing enemy`)
    if (u.drivenBy.length && !u.broke) parts.push(`were driven back by ${list(u.drivenBy)}`)

    let end
    if (u.destroyed) end = 'were destroyed'
    else if (u.broke) {
      end = `then BROKE and fled from ${u.broke}` + (u.lostInFlight ? `, losing ${u.lostInFlight} more in flight` : '') +
        (u.left !== null ? `, and left the field with ${men(u.left)}` : '')
    } else if (u.left !== null) end = `left the field with ${men(u.left)}`
    else if (u.lostInFlight) end = `lost ${men(u.lostInFlight)} while fleeing`
    else if (u.morale !== null && moraleWords(u.morale) !== 'firm') end = `and are ${moraleWords(u.morale)}`
    else if (u.foes.length) end = 'and hold firm'
    if (end) parts.push(end)
    if (parts.length === 0) continue

    // A unit with only an ending ("broke and fled") needs no "then".
    if (parts.length === 1) parts[0] = parts[0].replace(/^(?:then|and) /, '').replace(/^BROKE/, 'broke')
    const text = `${u.id}: ${parts.join('; ')}`.replace(/; (then|and) /g, ', $1 ')
    lines.push({ weight: u.destroyed || u.broke ? 1 : (u.brokeEnemies.length ? 2 : 3), text })
  }
  return lines
}

/**
 * A turn as a commander needs to hear it: the facts one side knows, most
 * important first. Fighting is told per unit (digest); everything else one
 * fact each. When there was fighting, the marching is left out: the map
 * shows where everyone stands.
 *
 * @param {Object} turn  { map, ownIds, seenEnemyIds, events, whereIs?, nameOf? }
 * @returns {Array<string>}
 */
// The Commander is the player: what happens to him is told to him as "you"
// (ruled 2026-11-23: "the commander represents the player's pov"). The
// other side hears of it as its own men's doing.
function toTheCommander(event, ownIds) {
  if (!event.type.startsWith('commander')) return null
  const mine = event.type === 'commanderFreed' ? !ownIds.has(event.by) : ownIds.has(event.unitId)
  switch (event.type) {
    case 'commanderTaken': return mine
      ? `You were taken by ${event.by}${event.running ? ' as your men ran' : ''}. You can send no orders; each of your officers now leads his own unit as he sees fit`
      : `${event.by} took the enemy Commander${event.running ? ' as his men ran' : ''}`
    case 'commanderKilled': return mine ? `You were killed in the fight with ${event.by}` : `${event.by} killed the enemy Commander`
    case 'commanderFreed': return mine
      ? `${event.by} broke, and you got free and reached ${event.unitId}`
      : `the enemy Commander got free of ${event.by}`
    case 'commanderMoved': return `With ${event.from} gone you got away to ${event.unitId}`
    case 'commanderRode': return `You rode over from ${event.from} to ${event.unitId}, and ride with them now`
    default: return null
  }
}

// The ground to fight for, told to one side (turn.side) as its own or the
// enemy's: every side knows at once when it changes hands.
//
// A Commander in the enemy's hands (held) can send no orders: the lines
// speak of his army, not of what he should do (S11).
function toTheSide(event, side, over = false, held = false, seen = null) {
  // The battle's end, in the side's own words (not "Red won (enemy army
  // broken)"); night is told by its own line.
  if (event.type === 'victory' && side) {
    if (event.reason === 'night fell') return ''
    return BATTLE_OVER.line(event.reason, event.winner === 'draw' ? null : event.winner === side)
  }
  if (event.type !== 'objective' || !side) return null
  // Once the battle is over, holding the ground decides nothing: no "hold
  // it alone and the field is yours" after "the battle is over".
  const words = held ? GROUND.held : GROUND
  // Some of several to hold (event.needed): how many each side holds.
  if (event.needed) {
    const some = held ? GROUND.some.held : GROUND.some
    const called = event.called ?? 'pieces of ground'
    if (event.close) return over ? '' : some.close(event.names ?? [event.name], event.side === side, event.close)
    if (event.side && !over) return some.took(event.name, event.side === side, event.holding?.[event.side] ?? 1, event.needed, event.of, called)
  }
  if (event.close) return over ? '' : words.close(event.name, event.side === side, event.close)
  if (event.side) return over ? (held && event.side === side ? GROUND.held.tookAtTheEnd(event.name) : GROUND.tookAtTheEnd(event.name, event.side === side)) : words.took(event.name, event.side === side)
  // Who is on it now he may already know: an enemy reported there, or his
  // own men there by their word (seen(name), from the caller). Else no more
  // than that it is no one's alone (S12).
  if (!event.was) return null
  const there = seen?.(event.name) ?? {}
  if (event.was === side && there.enemy) return GROUND.contested(event.name, true, Boolean(there.own))
  if (event.was !== side && there.own) return GROUND.contested(event.name, false)
  return GROUND.lost(event.name, event.was === side)
}

function report(turn) {
  const { map, ownIds, seenEnemyIds, events } = turn
  const nameOf = turn.nameOf ?? ((text) => text)
  const known = (id) => ownIds.has(id) || seenEnemyIds.has(id)
  const told = summarise(visibleEvents(events, { ownIds, seenEnemyIds })).map(e => maskNames(e, known))

  const fights = digest(told, { map, ownIds, whereIs: turn.whereIs })
  const rest = told.filter(e => !FIGHTING.has(e.type))
  const busy = fights.length > 0 || rest.some(e => weight(e) <= 4)
  // The battle ended in this stretch (turn.over: decided by the ground or a
  // bargain, which leave no event of their own).
  const over = Boolean(turn.over) || told.some(e => e.type === 'victory')
  const others = rest
    .filter(e => !busy || weight(e) < 6)
    .map(e => ({ weight: weight(e), text: toTheCommander(e, ownIds) ?? toTheSide(e, turn.side, over, Boolean(turn.held), turn.onGround) ?? plainFact(map, e, turn.howMany ?? countAll) }))
    .filter(f => f.text)

  return [...fights, ...others]
    .map((f, i) => ({ ...f, i }))
    .sort((x, y) => x.weight - y.weight || x.i - y.i)
    // (The same line twice, "Enemy velites was pinned with nowhere to give
    // way" for two ticks, is told once.)
    .map(f => ({ ...f, text: troopsTogether(nameOf(f.text)) }))
    // Lines the same once named, "Enemy troops marched 75 m south-west ..."
    // for three units he cannot tell apart, are one line saying how many.
    .reduce((out, f) => {
      const same = out.find(g => g.text === f.text)
      if (same) same.n += 1
      else out.push({ ...f, n: 1 })
      return out
    }, [])
    .slice(0, MAX_FACTS)
    .map(f => (f.n > 1 && /^enemy troops\b(?! \()/i.test(f.text) ? f.text.replace(/^(enemy troops)/i, `$1 (${f.n} units)`) : f.text))
}

// Enemy units he cannot tell apart, named in one list ("was shot at by
// enemy troops, enemy troops and enemy troops"), are said once with how
// many: "enemy troops (3 units)".
function troopsTogether(text) {
  const one = `enemy ${REPORT.troops}`
  return text.replace(new RegExp(`\\b([Ee])${one.slice(1)}((?:, ${one})*(?: and ${one}))(?! \\()`, 'g'),
    (all, e) => `${e}${one.slice(1)} (${all.split(one.slice(1)).length - 1} units)`)
}

// How an officer of each culture writes. A culture not listed here gets the
// plain soldier's voice. Flavour only: the facts never change with it.
const VOICES = {
  'Roman Republic': 'You write as a Roman tribune: clipped, orderly, matter-of-fact, with the occasional word of duty or discipline.',
  'Celtic Tribes': 'You write as a Celtic war-leader\'s bard: vivid and proud, quick to honour courage, still brief.',
  'Germanic Tribes': 'You write as a Germanic war-band\'s spokesman: blunt, grim, sparing with words.',
  'Macedonian Kingdoms': 'You write as a Macedonian staff officer: precise, professional, confident.',
  'Parthian Empire': 'You write as a Parthian noble\'s scribe: courtly and measured, with an eye for horsemen.',
  'Sarmatian Confederations': 'You write as a Sarmatian rider: plain-spoken and proud of the horse.',
  'Berber Confederations': 'You write as a Berber chieftain\'s messenger: wary, practical, attentive to ground.',
  'Thracian Odrysians': 'You write as a Thracian chieftain\'s herald: fierce and direct.'
}
const PLAIN_VOICE = 'You write as a seasoned professional soldier: brief, exact, unadorned.'

// The standing instructions: everything about how to write, nothing about
// this turn, so the provider can cache it.
function system(culture) {
  return `You are an officer on a commander's staff in an ancient battle, writing the dispatch for the stretch of fighting just ended. ${VOICES[culture] ?? PLAIN_VOICE}

You are given the facts as notes, the most important first. Turn them into a dispatch a person would say aloud to the commander.

- Keep the order: open with the first note. A note that starts with a unit's name and a colon is the whole story of that unit's fighting. "lost 12 men and killed 20" means that unit lost 12 and its enemies lost 20: keep every number with the unit it belongs to.
- Write prose, not notes: full sentences in the past tense, no colons after names, no semicolons, no lists, no headings, no greeting or sign-off. Vary the wording; do not copy the notes word for word.
- One short paragraph: 2 to 4 sentences for a quiet stretch, at most 8 for a full one.
- Use only what the notes say. Never add a unit, place, number, cause or outcome, never say who holds or controls a place unless a note says so, and never guess what the enemy intends. Every number you write must be in the notes.
- Write unit names exactly as given ("Spears", "enemy horse"). "An unseen enemy" and "enemy troops" stay exactly that: never say what kind they are, or how many beyond what the note says.
- The commander gives orders by grid square, so keep the place and the grid square from the notes whenever a note has one, for example "at the ford (D4-SW)". Never work out or invent a square.
- No advice, no questions, no mention of turns, rules or dice.
- Tell every note, with its place and square: what was seen ("report enemy ...") as much as the fighting. You may shorten the rule of the ground to fight for, but keep its name.
- Speak to the commander as "you". What happened to him is "you were taken", never "we were taken" or "the commander was taken". But nothing happened to him unless a note says so in those words: never say he was taken, killed or wounded otherwise.
- A note on the ground to fight for says only how things stand now: "hold it 30 min more and the field is yours" means the field is not yet won, and "you took it: hold it alone and the field is yours" means it must still be held. Never say the field is won, secured or yours unless a note says the battle is over. "No word yet of who is on it" means he does not know: never say who is on it.
- A note that says the battle is over comes first, and you open with it in its own words.

Example notes:
- Guards: fought enemy axes at North Ford (D4-SW); lost 9 men and killed 21; broke enemy axes, cutting down 5 as they ran, and hold firm
- Levy: fought enemy horse in open ground 50 m south of the woods (C5-NE); lost 17 men and killed 3, then BROKE and fled from enemy horse, losing 6 more in flight
- Slingers went into hiding in the woods (B3-NE) and are hidden
Example dispatch, in a plain soldier's voice:
The Levy have broken. Enemy horse caught them in the open south of the woods (C5-NE), where they lost 17 men for 3 of the enemy, and 6 more were cut down as they ran. At North Ford (D4-SW) the Guards did better: they broke the enemy axes, killing 21 for 9 of our own and cutting down 5 more in the pursuit, and they hold firm. The Slingers have gone to ground in the woods (B3-NE), unseen.`
}

/**
 * @param {Object} ai        AI client (src/llm), or null
 * @param {Object} turn      { map, side, culture, ownIds, seenEnemyIds, events, plain, nameOf }
 *   plain: the plain-text report to fall back on
 *   nameOf: optional, text -> text with unit ids swapped for the names the
 *     player knows them by ("Spears", "enemy horse")
 * @returns {Promise<{ text, source: 'ai'|'plain' }>}
 */
async function narrateTurn(ai, turn) {
  const { culture, ownIds, plain } = turn
  const nameOf = turn.nameOf ?? ((text) => text)
  // Most important first, and already worked out unit by unit, so a small
  // model retells the news without having to judge or add anything up.
  // (turn.facts: the plain account's own lines, when the caller has built
  // them: the ground, whom he faces, what his men saw, word by rider and
  // the battle's end, which the events alone do not hold. The AI words the
  // same report the player would otherwise read.)
  const facts = turn.facts ?? report(turn)
  if (!ai || !ai.configured || facts.length === 0) return { text: plain, source: 'plain' }

  const own = nameOf([...ownIds].join(', '))
  const user = [
    `Your units: ${own}. Everyone else is the enemy.`,
    'What happened, most important first (each line that starts with a unit\'s name is how its fighting went):',
    ...facts.map(f => `- ${f}`)
  ].join('\n')
  const reply = await ai.complete({
    purpose: 'narrate-turn', system: system(culture), user, maxTokens: 420, temperature: 0.5,
    ...(turn.effort ? { effort: turn.effort } : {})
  })
  if (!reply.ok || !reply.text || !reply.text.trim()) return { text: plain, source: 'plain' }
  // One paragraph, plain hyphens.
  return { text: reply.text.trim().replace(/\s*\n+\s*/g, ' ').replace(/[\u2010\u2011]/g, '-'), source: 'ai' }
}

module.exports = { narrateTurn, report, digest, visibleEvents, fromCaptivity, publicEvents, summarise, maskNames, placeName, fact, system, VOICES, PRIVATE }
