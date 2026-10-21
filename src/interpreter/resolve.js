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
// Places may be a map label ("K8"), a landmark's name, or a description of
// the ground ("the ridge to the east"), resolved from where the ordered
// units stand.

const { resolveUnitReference } = require('../engine/movement/unitResolver')
const { findPlace } = require('../engine/map/places')
const { fromLabel, toLabel } = require('../engine/map/labels')

const LABEL = /^[a-z]{1,3}\d{1,3}$/i

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
  if (LABEL.test(text)) {
    const position = fromLabel(text)
    if (!map.inBounds(position)) return { question: `${text.toUpperCase()} is off the map.` }
    return { position, description: text.toUpperCase() }
  }
  const found = findPlace(map, origin, text)
  if (found.position) return { position: found.position, description: found.description }
  if (found.question) return { question: found.question }
  return { question: `I can't place "${text}": ${found.none}. Try the ground (the ridge to the east, the clearing) or a square like K8.` }
}

/**
 * @param {Array} intents   from grammar.parseLine or the AI reader
 * @param {Object} context  { map, units }
 * @returns {{ orders: Array, questions: Array<string>, surrender: boolean, understood: Array<string> }}
 *   orders are engine orders: { unitRef: unitId, action, target?, then? };
 *   understood is a plain read-back for the player ("spears: defend the
 *   clearing 75 m south").
 */
function resolveIntents(intents, context) {
  const { map, units } = context
  const orders = []
  const questions = []
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
      if (place.question) { questions.push(place.question); continue }
      target = place.position
      where = ` ${place.description}`
    } else if (intent.action === 'move') {
      questions.push(`Where should ${intent.unitRef} go?`)
      continue
    }

    for (const unit of match.units) {
      orders.push({
        unitRef: unit.id,
        action: intent.action,
        ...(target ? { target: { ...target } } : {}),
        ...(intent.then ? { then: intent.then } : {})
      })
    }
    const who = match.units.map(u => u.id).join(', ')
    const what = intent.action === 'move' && intent.then === 'hold' ? 'defend' : intent.action
    understood.push(`${who}: ${what}${where}${target ? ` (${toLabel(target)})` : ''}`)
  }

  return { orders, questions, surrender, understood }
}

module.exports = { resolveIntents, resolvePlace, groupOrigin }
