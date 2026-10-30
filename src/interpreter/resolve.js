// src/interpreter/resolve.js
//
// Turn intents (words for which units, words for where) into engine orders
// (unit ids and map positions), or into questions for the player.
// Deterministic and AI-free: whether the intent came from the fixed grammar
// or from the AI, this step decides what it means on the actual battlefield.
//
// Context, all from one side's own point of view:
//   { map, units: [own living, unbroken units] }
//
// Places may be a grid reference ("C7", "C7-NE": the ruled player grid of
// 100 m squares), a landmark's name, or a description of the ground ("the
// ridge to the east"), resolved from where the ordered units stand.

const { resolveUnitReference } = require('../engine/movement/unitResolver')
const { findPlace } = require('../engine/map/places')
const { isGridRef, gridTarget, gridLabel } = require('../engine/map/grid')
const { coverFor } = require('../engine/battle/hiding')

// The extra parts of an order the engine reads (Stage 3), carried through
// unchanged when set.
const EXTRAS = ['careful', 'against', 'letPass', 'regardless']

// How well a unit will hide there, in words for the read-back: the engine's
// own table (battle/hiding.js), so the player hears what the engine will do.
function coverWords(map, unit, position) {
  const cover = coverFor(map, { ...unit, position })
  if (cover.seenWithin === null) return `${cover.words}; it cannot hide there`
  const seen = cover.seenWithin === 0
    ? 'hidden from anyone who does not search'
    : `seen only within ${cover.seenWithin * 25} m`
  const cost = cover.cost?.staminaPerTurn ? ', but tiring' : ''
  return `${cover.words}: ${seen}${cost}`
}

// The read-back for an ambush's terms.
function ambushTerms(intent) {
  const parts = [intent.against ? `striking ${intent.against}` : 'striking anything that passes']
  if (intent.letPass) parts.push(`letting ${intent.letPass} pass first`)
  parts.push(intent.regardless ? 'whatever happens' : 'only if they come marching')
  return parts.join(', ')
}

// Where a group stands, for "the ridge to the east" said to several units:
// the unit nearest the group's middle, so the reference is read from a real
// position on the field.
function groupOrigin(units) {
  const cx = units.reduce((s, u) => s + u.position.x, 0) / units.length
  const cy = units.reduce((s, u) => s + u.position.y, 0) / units.length
  let best = units[0]
  let bestD = Infinity
  for (const u of units) {
    const d = (u.position.x - cx) ** 2 + (u.position.y - cy) ** 2
    if (d < bestD) { best = u; bestD = d }
  }
  return best.position
}

function resolvePlace(map, origin, words) {
  const text = String(words).trim()
  if (isGridRef(text)) {
    const square = gridTarget(map, text)
    if (square.none) return { question: `${square.none}.` }
    return { position: square.position, description: square.label }
  }
  const found = findPlace(map, origin, text)
  if (found.position) return { position: found.position, description: found.description }
  if (found.question) {
    // Each choice says what to write instead, so the player can pick one
    // rather than retype the order: a named place by its name, any other by
    // its grid square.
    return {
      question: found.question,
      options: found.options.map(o => ({
        label: o.description,
        text: o.feature?.name ?? gridLabel(o.position, { quarter: true })
      }))
    }
  }
  return { question: `I can't place "${text}": ${found.none}. Try the ground (the ridge to the east, the clearing) or a grid square like C7.` }
}

/**
 * @param {Array} intents   from grammar.parseLine or the AI reader
 * @param {Object} context  { map, units }
 * @returns {{ orders: Array, questions: Array<string>, choices: Array, surrender: boolean, understood: Array<string> }}
 *   choices: for a question with answers to pick from, { question, place,
 *   options: [{ label, text }] }: write option.text in place of the words
 *   `place` and read the order again.
 *   orders are engine orders: { unitRef: unitId, action, target?, then? };
 *   understood is a plain read-back for the player ("spears: defend the
 *   clearing 75 m south").
 */
function resolveIntents(intents, context) {
  const { map, units } = context
  const orders = []
  const questions = []
  const choices = []
  const understood = []
  let surrender = false

  for (const intent of intents) {
    if (intent.kind === 'surrender') { surrender = true; continue }
    if (intent.kind === 'ask') { questions.push(intent.question); continue }
    if (intent.kind !== 'order') continue

    const match = resolveUnitReference(intent.unitRef, units)
    if (match.units.length === 0) {
      questions.push(`Who do you mean by "${intent.unitRef}"? Your units: ${units.map(u => u.id).join(', ')}.`)
      continue
    }

    let target = null
    let where = ''
    if (intent.place) {
      const place = resolvePlace(map, groupOrigin(match.units), intent.place)
      if (place.question) {
        questions.push(place.question)
        if (place.options) choices.push({ question: place.question, place: intent.place, options: place.options })
        continue
      }
      target = place.position
      where = ` ${place.description}`
    } else if (intent.action === 'move') {
      questions.push(`Where should ${intent.unitRef} go?`)
      continue
    }

    const extras = {}
    for (const key of EXTRAS) if (intent[key] !== undefined && intent[key] !== null && intent[key] !== false) extras[key] = intent[key]

    for (const unit of match.units) {
      orders.push({
        unitRef: unit.id,
        action: intent.action,
        ...(target ? { target: { ...target } } : {}),
        ...(intent.then ? { then: intent.then } : {}),
        ...extras
      })
    }
    const who = match.units.map(u => u.id).join(', ')
    const what = intent.action === 'move' && intent.then === 'hold' ? 'defend' : intent.action
    let line = `${who}: ${what}${extras.careful ? ' carefully' : ''}${where}${target ? ` (${gridLabel(target, { quarter: true })})` : ''}`
    if (intent.action === 'hide' || intent.action === 'ambush') {
      line += ` — ${coverWords(map, match.units[0], target ?? match.units[0].position)}`
    }
    if (intent.action === 'ambush') line += `; ${ambushTerms(intent)}`
    understood.push(line)
  }

  return { orders, questions, choices, surrender, understood }
}

module.exports = { resolveIntents, resolvePlace, groupOrigin, coverWords }
