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
const { describeCombatEvent } = require('./eventText')

// Where a tile is, in words: the feature it is part of, or the nearest
// feature with a name, or open ground near the nearest feature.
function placeName(map, position) {
  const here = featuresAt(map, position).filter(f => f.kind !== 'road')
  if (here.length > 0) {
    const f = here[0]
    if (f.name) return `${f.kind === 'hill' ? 'on' : 'at'} ${f.name}`
    return { hill: 'on the high ground', woods: 'in the woods', marsh: 'in the marsh', clearing: 'in a clearing', ford: 'at a ford', bridge: 'on a bridge', river: 'in the river' }[f.kind] ?? 'in the field'
  }
  let best = null
  for (const f of detectFeatures(map)) {
    if (f.kind === 'road' || f.kind === 'river') continue
    const tiles = Math.min(...f.tiles.map(t => distance(position, t)))
    if (!best || tiles < best.tiles) best = { f, tiles }
  }
  if (!best || best.tiles > 12) return 'in open ground'
  const what = best.f.name ?? `the ${best.f.kind === 'hill' ? 'high ground' : best.f.kind}`
  return `in open ground ${best.tiles * TILE_METRES} m ${compassWord(best.f.centre, position)} of ${what}`
}

// The units an event is about.
function involved(event) {
  return [event.unitId, event.aId, event.bId, event.by, event.a?.unitId, event.b?.unitId].filter(Boolean)
}

/**
 * The events one side could know about: everything involving its own units,
 * plus events about enemies it can see at the end of the turn, plus the
 * verdict. Fog of war holds: an unseen enemy's doings are not reported.
 */
function visibleEvents(events, { ownIds, seenEnemyIds }) {
  return events.filter(e => {
    if (e.type === 'victory' || e.type === 'objective') return true
    const ids = involved(e)
    return ids.some(id => ownIds.has(id)) || (ids.length > 0 && ids.every(id => seenEnemyIds.has(id)))
  })
}

// One event as a plain fact the model can retell: names and places, no
// coordinates.
function fact(map, event) {
  switch (event.type) {
    case 'move': return `${event.unitId} moved ${distance(event.from, event.to) * TILE_METRES} m ${compassWord(event.from, event.to)}, now ${placeName(map, event.to)}` +
      (event.blockedBy ? ` (stopped by ${event.blockedBy})` : '')
    case 'arrived': return `${event.unitId} reached its objective ${placeName(map, event.at)}` + (event.then === 'hold' ? ' and dug in' : '')
    case 'halted': return `${event.unitId} could get no further${event.blockedBy ? `, ${event.blockedBy} in the way` : ''}`
    case 'contact': return `${event.aId} and ${event.bId} came to blows`
    case 'surprise': return `${event.unitId} was caught on the march by ${event.by}, an enemy no one had seen`
    case 'exchange': return `fighting: ${describeCombatEvent(event).replace(/^r\d+ /, '').replace(/; chaos.*$/, '')} (men lost each side; morale ${Math.round(event.a.morale)} vs ${Math.round(event.b.morale)})`
    case 'standoff': return `${event.aId} and ${event.bId} were both close to breaking`
    case 'push': return `${event.by} drove ${event.unitId} back${event.lostHighGround ? ' off the high ground' : ''}`
    case 'crush': return `${event.unitId} was pinned with nowhere to give way`
    case 'rout': return `${event.unitId} broke and fled from ${event.by}`
    case 'pursuit': return `${event.by} cut down ${event.killed} of the fleeing ${event.unitId}` + (event.trapped ? ', who were cornered' : '')
    case 'fled': return `${event.unitId} escaped the field with ${event.strength} men`
    case 'destroyed': return `${event.unitId} was destroyed`
    case 'crowding': return event.tier === 'organized'
      ? `${event.unitId} had room to fight again`
      : `${event.unitId}'s ranks were ${event.tier}, ${event.men} men packed onto one spot ${placeName(map, event.at)}, slowing them and blunting their fighting`
    case 'objective': return event.side
      ? `${event.side} took ${event.name}`
      : `${event.name} was no longer held${event.was ? ` by ${event.was}` : ''}`
    case 'ambush': return `${event.unitId} sprang an ambush on ${event.on} ${placeName(map, event.at)}`
    case 'ambushHeld': return event.reason === 'on guard'
      ? `${event.unitId} let ${event.on} pass: it came on guard, not worth the strike`
      : `${event.unitId} let ${event.on} pass, as ordered`
    case 'hidden': return `${event.unitId} went to ground ${placeName(map, event.at)}`
    case 'hideFailed': return event.reason === 'watched'
      ? `${event.unitId} tried to hide but the enemy was watching`
      : `${event.unitId} found no cover to hide in`
    case 'checked': return `${event.unitId} searched the ground ${placeName(map, event.at)}` +
      (event.found.length ? ` and found ${event.found.join(', ')} hidden there` : ' and found nothing')
    case 'revealed': return event.reason === 'found' ? `${event.unitId} was discovered`
      : event.reason === 'stumbled on' ? `${event.unitId} was stumbled upon`
      : `${event.unitId} came out of hiding`
    case 'victory': return event.winner === 'draw' ? `the battle ended in mutual ruin (${event.reason})` : `${event.winner} won the battle (${event.reason})`
    default: return null
  }
}

function system(culture, side) {
  return `You are a field officer of the ${culture} army (the ${side} side) in an ancient battle, reporting to your commander after ten minutes or an hour of fighting. Retell ONLY the facts given, in 3 to 6 short sentences, in a voice fitting your culture. Use the unit names and places exactly as given. Never invent units, places, casualties or events, never add advice, and never mention numbers or coordinates that are not in the facts. Your own units are listed; everyone else is the enemy.`
}

/**
 * @param {Object} ai        AI client (src/llm), or null
 * @param {Object} turn      { map, side, culture, ownIds, seenEnemyIds, events, plain }
 *   plain: the plain-text report to fall back on
 * @returns {Promise<{ text, source: 'ai'|'plain' }>}
 */
async function narrateTurn(ai, turn) {
  const { map, side, culture, ownIds, seenEnemyIds, events, plain } = turn
  const facts = visibleEvents(events, { ownIds, seenEnemyIds })
    .map(e => fact(map, e)).filter(Boolean)
  if (!ai || !ai.configured || facts.length === 0) return { text: plain, source: 'plain' }

  const user = [
    `Your units: ${[...ownIds].join(', ')}.`,
    'What happened:',
    ...facts.map(f => `- ${f}`)
  ].join('\n')
  const reply = await ai.complete({
    purpose: 'narrate-turn', system: system(culture, side), user, maxTokens: 300, temperature: 0.7
  })
  if (!reply.ok || !reply.text || !reply.text.trim()) return { text: plain, source: 'plain' }
  return { text: reply.text.trim(), source: 'ai' }
}

module.exports = { narrateTurn, visibleEvents, placeName, fact }
