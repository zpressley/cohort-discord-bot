// src/interpreter/aiReader.js
//
// The AI reads a commander's free-form orders into the same intents the
// fixed grammar produces. It only reads: it never decides an outcome, and
// resolve.js checks everything it says against the real battlefield.
//
// What the model sees is one side's knowledge: its own units (by id), the
// named places on the map, and the enemies that side has seen, by grid
// square. Nothing hidden by fog of war.
//
// The reply is held to a JSON schema twice: by the provider (structured
// outputs) and again here (ajv). Anything else (a refusal, a unit that does
// not exist, a timeout) returns null, and the caller falls back to the
// grammar's own answer.

const Ajv = require('ajv')
const { findPlace, compassWord, TILE_METRES } = require('../engine/map/places')
const { distance } = require('../engine/map/labels')
const { gridLabel } = require('../engine/map/grid')
const { detectFeatures } = require('../engine/map/features')
const { resolveUnitReference } = require('../engine/movement/unitResolver')

const ACTIONS = ['move', 'hold', 'defend', 'advance', 'attack', 'withdraw', 'hide', 'check', 'ambush']
const KINDS = ['cavalry', 'infantry', 'archers', 'scouts', null]

// Every field is required and nothing else is allowed: that is what lets
// the provider enforce the schema strictly.
const REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['orders', 'question', 'note', 'surrender'],
  properties: {
    orders: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['units', 'action', 'place', 'then_hold', 'careful', 'against', 'let_pass', 'regardless'],
        properties: {
          units: { type: 'array', items: { type: 'string' } },
          action: { type: 'string', enum: ACTIONS },
          place: { type: ['string', 'null'] },
          then_hold: { type: 'boolean' },
          careful: { type: 'boolean' },
          against: { type: ['string', 'null'], enum: KINDS },
          let_pass: { type: 'integer' },
          regardless: { type: 'boolean' }
        }
      }
    },
    question: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
    surrender: { type: 'boolean' }
  }
}

const validate = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(REPLY_SCHEMA)

// The standing instructions. Kept free of anything about this battle, so
// the provider can cache it across calls (cached input is half price).
const SYSTEM = `You are the staff officer who writes down a commander's spoken orders in an ancient-warfare game. Turn the commander's words into JSON orders. You only record what was said: never add orders that were not given, never invent units or places, never decide what happens.

Reply with one JSON object: {"orders":[...],"question":null,"note":null,"surrender":false}

Each order:
- units: ids from "Your units" in the briefing, exactly as written. Match the commander's words to the names each unit is "called": "the heavy infantry" is the one unit called heavy infantry, not every unit on foot. Only a general word no unit is called by ("the infantry", "the foot", "the line") covers several units. Use ["all"] for everyone ("all units", "the army", "everybody"); "everyone else" is every unit not given another order in this message. One order may name several units ("spears and swords advance" is one order with two ids). Give different orders to different units as separate orders.
- action: exactly one of
  move      go to a place
  hold      stay where they are (hold, wait, stay, stand, halt, stop)
  defend    go to a place and hold it (defend, guard, protect, dig in, take and hold, set up a position at)
  advance   close with and fight the nearest enemy (advance, charge, engage, attack with no place named, spring the trap)
  attack    go to a place looking for a fight (attack, assault, storm, seize, take + a place or an enemy unit)
  withdraw  fall back (retreat, pull back, disengage); to a place if one is named, else toward home
  hide      go to ground and hide (hide, take cover, conceal, lie low)
  check     search ground for hidden enemies (check, search, scout, sweep, reconnoitre)
  ambush    hide and strike enemies that pass (ambush, lie in wait, hide and hit them)
- place: where, or null if no place was given. Write it in ONE of these forms:
  1. a grid square exactly as the commander wrote it: "C7" or "C7-NE"
  2. a named place copied exactly from "Named places" (match loose wording to the list: "the mill bridge" -> "Old Mill Bridge")
  3. plain ground words: "the woods", "the ridge to the east", "the nearest ford", "the clearing", "the woods north of the ford"
  4. a distance and compass direction from where the unit stands: "200 m north", "100 m south-east" (for "a little", "a short way" use 100 m; for a bare "go north" use 200 m)
  5. to attack or approach a specific enemy unit, the grid square given for it under "Enemy seen"
  When the words give a route and a destination ("up the road toward the mill bridge"), the place is the destination. To join or stand with another of the commander's units, use that unit's grid square from "Your units".
  Never write a unit name, "the enemy", "forward" or "ahead" as a place. "Forward", "toward the enemy" or "whoever is nearest" is the action advance with place null.
- then_hold: true if they should hold once they arrive ("and hold", "and hold it", "make them hold it", "and stay there", "and dig in"). defend always holds; set true for it.
- careful: true if they should move carefully, cautiously, slowly, on guard, in good order.
- against: for ambush only, what to strike: "cavalry", "infantry", "archers" or "scouts" (horsemen = cavalry, bowmen or slingers = archers, foot = infantry). null for anything, and for every other action.
- let_pass: for ambush only, how many enemy units to let go by before striking. 0 otherwise.
- regardless: for ambush only, and only when the commander says so in words like "whatever happens", "no matter what", "at all costs": true. In every other case false.

Rules:
- question stops the orders from being sent, so use it only when you could not record an order: it is too unclear, it names a unit that is not in "Your units", or it could mean two units. Ask one short question a commander can answer. Never guess between two units.
- note does not stop anything. Use it, in one short plain sentence addressed to the commander, whenever you recorded the orders but left something out: a second step to order next turn (the only sequence you can record is "go there and then hold"), or something the game has no action for when the rest of the order still stands. For "spears to C4, then on to the bridge", record the move to C4 and set note to "I recorded the march to C4. Order the bridge once they arrive." 
- If the whole of an order is something the game has no action for (shoot arrows, build, form a wedge), record nothing for it and say so in question.
- Record every clear order even when another is unclear.
- surrender is true only if the commander yields the whole battle.
- question and note are null when there is nothing to say.`

const metres = (tiles) => tiles * TILE_METRES
const square = (position) => gridLabel(position, { quarter: true })

// What a unit stands on and what is near it, in words.
function surroundings(map, position) {
  const near = []
  for (const kind of ['hill', 'woods', 'clearing', 'river', 'ford', 'bridge', 'road', 'marsh']) {
    const found = findPlace(map, position, { kinds: [kind], word: kind === 'hill' ? 'high ground' : kind, direction: null, nearest: true, name: null, from: null, part: null })
    if (found.position && distance(position, found.position) <= 24) {
      near.push({ tiles: distance(position, found.position), text: found.description })
    }
  }
  near.sort((a, b) => a.tiles - b.tiles)
  const ground = map.cell(position)
  const here = ground.terrain === 'plains' ? 'open ground' : ground.terrain
  return [here, ...near.slice(0, 3).map(n => n.text)].join('; ')
}

/**
 * The briefing the model reads: one side's units and what that side knows.
 * @param {Object} context  { map, units, enemies: [{ id, position, status }] }
 */
function briefing(context, text) {
  const { map, units, enemies = [] } = context
  const lines = ['Your units:']
  for (const u of units) {
    const called = [...new Set([...(u.aliases ?? []), String(u.role ?? '').replace(/_/g, ' ')].filter(Boolean))].slice(0, 3)
    lines.push(`- ${u.id}${called.length ? ` (called: ${called.join(', ')})` : ''}${u.mounted ? ', mounted' : ''}, at ${square(u.position)}`)
  }
  const named = detectFeatures(map).filter(f => f.name)
  if (named.length > 0) {
    lines.push('Named places:')
    for (const f of named) lines.push(`- ${f.name} (${f.kind}, ${square(f.centre)})`)
  }
  if (enemies.length > 0 && units.length > 0) {
    const centre = units[0].position
    lines.push('Enemy seen:')
    for (const e of enemies) {
      const when = e.status === 'visible' ? 'in sight' : `last seen turn ${e.seenOnTurn}`
      lines.push(`- ${e.name ?? e.id} at ${square(e.position)}, ${metres(distance(centre, e.position))} m ${compassWord(centre, e.position)} (${when})`)
    }
  } else {
    lines.push('Enemy seen: none')
  }
  lines.push('', 'The commander says:', String(text).trim())
  return lines.join('\n')
}

/**
 * @returns {Promise<{ intents } | null>}  null means "the AI could not help"
 */
async function readWithAi(ai, text, context) {
  if (!ai || !ai.configured) return null
  const reply = await ai.complete({
    purpose: 'read-orders', system: SYSTEM, user: briefing(context, text),
    schema: REPLY_SCHEMA, schemaName: 'orders', maxTokens: 500, temperature: 0
  })
  if (!reply.ok || !validate(reply.json)) return null

  const ids = new Set(context.units.map(u => u.id))
  // The model is asked for ids, and sometimes writes the name a unit is
  // called by instead ("spears"). A name that picks out exactly one unit is
  // as good as its id; anything else is not a unit.
  const idFor = (said) => {
    if (ids.has(said)) return said
    const match = resolveUnitReference(said, context.units)
    return match.units.length === 1 ? match.units[0].id : null
  }
  const { orders, question, note, surrender } = reply.json
  const intents = []
  // A unit can carry one order a turn. If the model records two for the same
  // unit ("to C4, then on to the bridge"), the first stands and the player
  // is told, whatever the model did about it.
  const ordered = new Set()
  const secondStep = new Set()
  for (const o of orders) {
    const everyone = o.units.some(u => /^(all|everyone)$/i.test(u))
    let units = everyone ? null : [...new Set(o.units.map(idFor).filter(Boolean))]
    // A unit that is not on the field is not an order: the model made it up
    // or misread a name, and guessing is worse than asking.
    const unknown = everyone ? [] : o.units.filter(u => !idFor(u))
    if (unknown.length > 0) {
      intents.push({ kind: 'ask', question: `I could not tell which of your units you meant by "${unknown.join(', ')}".` })
      continue
    }
    if (!everyone) {
      for (const id of units.filter(u => ordered.has(u))) secondStep.add(id)
      units = units.filter(u => !ordered.has(u))
      for (const id of units) ordered.add(id)
    }
    if (!everyone && units.length === 0) continue
    const intent = {
      kind: 'order',
      unitRef: everyone ? 'everyone' : units.join(', '),
      ...(everyone ? {} : { unitIds: units }),
      action: o.action,
      place: o.place && o.place.trim() ? o.place.trim() : null,
      then: o.then_hold && o.action !== 'hold' ? 'hold' : null
    }
    if (o.careful) intent.careful = true
    if (o.action === 'ambush') {
      if (o.against) intent.against = o.against
      if (o.let_pass > 0) intent.letPass = Math.min(10, o.let_pass)
      if (o.regardless) intent.regardless = true
    }
    intents.push(intent)
  }
  if (surrender) intents.push({ kind: 'surrender' })
  if (question && question.trim()) intents.push({ kind: 'ask', question: question.trim() })
  if (note && note.trim()) intents.push({ kind: 'note', note: note.trim() })
  else if (secondStep.size > 0) {
    intents.push({ kind: 'note', note: `${[...secondStep].join(', ')}: I recorded the first order only. Give the next once it is carried out.` })
  }
  if (intents.length === 0) return null
  return { intents }
}

module.exports = { readWithAi, briefing, surroundings, REPLY_SCHEMA, SYSTEM, ACTIONS }
