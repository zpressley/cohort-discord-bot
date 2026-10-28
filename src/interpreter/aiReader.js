// src/interpreter/aiReader.js
//
// The AI reads a commander's free-form orders into the same intents the
// fixed grammar produces. It only reads: it never resolves places, never
// picks targets, never decides anything. resolve.js does that, the same way
// for both.
//
// What the model sees is one side's knowledge, in words: its own units and
// the ground around each, and the enemies that side has seen. No raw
// coordinates, nothing hidden by fog of war.
//
// Its reply must match a strict JSON schema. Anything else (a refusal,
// prose, a schema mismatch, a timeout) returns null, and the caller falls
// back to the grammar.

const Ajv = require('ajv')
const { findPlace } = require('../engine/map/places')
const { distance } = require('../engine/map/labels')
const { compassWord, TILE_METRES } = require('../engine/map/places')

const ACTIONS = ['move', 'hold', 'defend', 'advance', 'attack', 'withdraw', 'hide', 'check', 'ambush']
const KINDS = ['cavalry', 'infantry', 'archers', 'scouts', null]

const REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['orders', 'question', 'surrender'],
  properties: {
    orders: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['units', 'action', 'place', 'then'],
        properties: {
          units: { type: 'string', minLength: 1, maxLength: 80 },
          action: { enum: ACTIONS },
          place: { type: ['string', 'null'], maxLength: 120 },
          then: { enum: ['hold', null] },
          // Stage 3, optional so older replies still read.
          careful: { type: 'boolean' },
          against: { enum: KINDS },
          letPass: { type: 'integer', minimum: 0, maximum: 10 },
          regardless: { type: 'boolean' }
        }
      }
    },
    question: { type: ['string', 'null'], maxLength: 300 },
    surrender: { type: 'boolean' }
  }
}

const validate = new Ajv({ allErrors: true }).compile(REPLY_SCHEMA)

const SYSTEM = `You read a battlefield commander's orders in an ancient-warfare game and restate them as JSON. You never invent units or places and never decide outcomes.

Reply with one JSON object:
{"orders":[{"units":"...","action":"...","place":"..." or null,"then":"hold" or null}],"question":"..." or null,"surrender":false}

- units: the commander's words for ONE unit (e.g. "the spears", "the archers") or "everyone". If an order names several units, write one order per unit.
- action: one of move, hold, defend, advance, attack, withdraw, hide, check, ambush.
  move = go somewhere. hold = stay where you are. defend = go somewhere and hold it (dig in, set up a defensive position). advance = press the nearest enemy. attack = go to a place looking for a fight (attack the ford). withdraw = fall back (to a place if given, otherwise toward home). hide = go to ground, take cover, hide (at a place if given). check = search or scout the ground for hidden enemies (at a place if given). ambush = hide and strike enemies that pass (lie in wait, hide and hit anything that passes).
- careful (optional): true when they should move carefully, cautiously, on guard.
- against (optional, ambush only): what to strike, one of cavalry, infantry, archers, scouts, or null for anything. Fit the commander's words to the closest of these (horsemen = cavalry, bowmen or slingers = archers, foot = infantry).
- letPass (optional, ambush only): how many enemy units to let go by before striking.
- regardless (optional, ambush only): true when they should strike whatever happens, even a careful enemy.
- place: the commander's own words for where, e.g. "the ridge to the east", "the clearing", "Harrow Bridge", or a grid square like "C7" or "C7-NE". Copy the words; do not translate them into coordinates. null when no place is given.
- then: "hold" if they should hold once they arrive, else null.
- question: if an order cannot be understood at all, ask one short question instead of guessing; otherwise null.
- surrender: true only if the commander yields the battle.
Only use units that appear in the briefing. Several orders may be in one message.`

function metres(tiles) { return tiles * TILE_METRES }

// "open ground; the woods 50 m west; The Crownhill 450 m east"
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
  return [here, ...near.slice(0, 4).map(n => n.text)].join('; ')
}

/**
 * The briefing the model reads: one side's units and what that side knows.
 * @param {Object} context  { map, units, enemies: [{ id, position, status }] }
 */
function briefing(context, text) {
  const { map, units, enemies = [] } = context
  const lines = ['Your units:']
  for (const u of units) {
    const name = [u.id, u.role ? `(${String(u.role).replace(/_/g, ' ')})` : null,
      u.aliases?.length ? `also called ${u.aliases.slice(0, 3).join(', ')}` : null].filter(Boolean).join(' ')
    lines.push(`- ${name}: ${surroundings(map, u.position)}`)
  }
  if (enemies.length > 0 && units.length > 0) {
    const centre = units[0].position
    lines.push('Enemy seen:')
    for (const e of enemies) {
      const when = e.status === 'visible' ? 'in sight' : `last seen turn ${e.seenOnTurn}`
      lines.push(`- ${e.id}, ${metres(distance(centre, e.position))} m ${compassWord(centre, e.position)} (${when})`)
    }
  } else {
    lines.push('No enemy in sight.')
  }
  lines.push('', `Orders: ${text}`)
  return lines.join('\n')
}

/**
 * @returns {Promise<{ intents, question } | null>}  null means "use the grammar"
 */
async function readWithAi(ai, text, context) {
  if (!ai || !ai.configured) return null
  const reply = await ai.complete({
    purpose: 'read-orders', system: SYSTEM, user: briefing(context, text), json: true,
    maxTokens: 400, temperature: 0.1
  })
  if (!reply.ok || !validate(reply.json)) return null

  const { orders, question, surrender } = reply.json
  const intents = orders.map(o => {
    const intent = { kind: 'order', unitRef: o.units, action: o.action, place: o.place ?? null, then: o.then ?? null }
    for (const key of ['careful', 'against', 'letPass', 'regardless']) {
      if (o[key] !== undefined && o[key] !== null && o[key] !== false) intent[key] = o[key]
    }
    return intent
  })
  if (surrender) intents.push({ kind: 'surrender' })
  if (question) intents.push({ kind: 'ask', question })
  if (intents.length === 0) return null
  return { intents }
}

module.exports = { readWithAi, briefing, surroundings, REPLY_SCHEMA, SYSTEM }
