// src/interpreter/tests/attack-named-orders.test.js
//
// Attacking a named enemy unit in words (review item L10), and where a unit
// falling back will stop (L11). The grammar reads the plain forms; the
// Commander can name only an enemy his side sees or has seen; anything else
// is a question back.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { parseLine } = require('../grammar')
const { interpretLines, interpretText } = require('../orders')
const { REPLY_SCHEMA } = require('../aiReader')
const { createAiClient } = require('../../llm/client')
const { scriptedTransport } = require('../../llm/fixtures')
const { resolveMap } = require('../../engine/map/map')
const { createWorld } = require('../../engine/world')
const { fromLabel } = require('../../engine/map/labels')

const map = resolveMap('crownhill')
const world = createWorld({
  units: [
    { id: 'red_spears', side: 'red', role: 'spearmen', position: 'E7', strength: 100 },
    { id: 'red_swords', side: 'red', role: 'heavy_infantry', position: 'E8', strength: 100 },
    { id: 'red_horse', side: 'red', role: 'cavalry', mounted: true, position: 'E9', strength: 100 }
  ]
})
// What red has seen, as its intel carries it: kind of troops included.
const seen = {
  archers: { id: 'blue_archers', role: 'archers', mounted: false, primaryWeapon: 'greek_composite_bow', position: fromLabel('O8'), status: 'visible', strength: 100, seenOnTurn: 2 },
  swords: { id: 'blue_swords', role: 'heavy_infantry', mounted: false, primaryWeapon: 'sword_standard', position: fromLabel('N7'), status: 'ghost', strength: 100, seenOnTurn: 1 },
  slingers: { id: 'blue_unit_3', role: 'skirmishers', mounted: false, primaryWeapon: 'sling', position: fromLabel('W3'), status: 'ghost', strength: 80, seenOnTurn: 1 }
}
const context = (enemies, extra = {}) => ({ map, units: world.units, enemies, ...extra })
const read = (line, enemies, extra) => interpretLines([line], context(enemies, extra))

test('grammar: "attack their archers", "charge the enemy swords", "go for the archers" name an enemy, not a place', () => {
  const form = (line) => { const r = parseLine(line); return [r.unitRef, r.action, r.place, r.enemyRef ?? null] }
  assert.deepEqual(form('horse attack their archers'), ['horse', 'attack', null, 'archers'])
  assert.deepEqual(form('spears charge the enemy swords'), ['spears', 'attack', null, 'swords'])
  assert.deepEqual(form('swords go for the archers'), ['swords', 'attack', null, 'archers'])
  assert.deepEqual(form('charge the enemy horse'), ['everyone', 'attack', null, 'horse'])
  assert.deepEqual(form('horse ride down their slingers'), ['horse', 'attack', null, 'slingers'])
  assert.deepEqual(form('horse attack the archers at D2-SE'), ['horse', 'attack', null, 'archers at D2-SE'])
  assert.equal(parseLine('horse charge their archers carefully').careful, true)
})

test('grammar: attacking a place, or the enemy at large, reads as before', () => {
  assert.deepEqual([parseLine('spears attack the ford').action, parseLine('spears attack the ford').place], ['attack', 'the ford'])
  assert.equal(parseLine('spears attack the woods').enemyRef, undefined)
  assert.equal(parseLine('spears attack the enemy').action, 'advance')
  assert.equal(parseLine('everyone charge').action, 'advance')
  assert.equal(parseLine('archers shoot the horse').against, 'cavalry', 'shooting still names what to shoot first')
})

test('an enemy kind the side has seen becomes an attack on that unit, read back in the app\'s words', () => {
  const r = read('horse attack their archers', [seen.archers, seen.swords])
  assert.deepEqual(r.questions, [])
  assert.deepEqual(r.orders, [{ unitRef: 'red_horse', action: 'attack', enemy: 'blue_archers' }])
  assert.deepEqual(r.understood, ['red_horse: attack blue_archers, in sight at D2-SE'])
})

test('an enemy last seen, not in sight now, can be named, and the read-back says it was last seen', () => {
  const r = read('spears charge the enemy swords', [seen.archers, seen.swords])
  assert.deepEqual(r.orders, [{ unitRef: 'red_spears', action: 'attack', enemy: 'blue_swords' }])
  assert.match(r.understood[0], /attack blue_swords, last seen at /)
})

test('a name of the enemy\'s own counts: "their swordsmen" are the enemy swords', () => {
  const r = read('swords attack their swordsmen', [seen.archers, seen.swords])
  assert.deepEqual(r.orders.map(o => o.enemy), ['blue_swords'])
})

test('an enemy kind that matches nothing seen is a question, never a guess', () => {
  const r = read('spears charge their horse', [seen.archers, seen.swords])
  assert.deepEqual(r.orders, [])
  assert.equal(r.questions.length, 1)
  assert.match(r.questions[0], /None of the enemy you have seen is "horse"/)
  assert.match(r.questions[0], /blue_archers \(in sight at D2-SE\)/, 'and it says what has been seen')
})

test('an enemy on the field that the side has never seen cannot be named', () => {
  // Blue's horse is out there, but red's intel does not carry it.
  const r = read('spears charge their horse', [])
  assert.deepEqual(r.orders, [])
  assert.match(r.questions[0], /You have seen no enemy to attack/)
})

test('if two seen enemy units match, it asks which, with a choice that reads back to one', () => {
  const enemies = [seen.archers, seen.slingers]
  const r = read('horse attack their missile troops', enemies)
  assert.deepEqual(r.orders, [])
  assert.equal(r.choices.length, 1)
  const choice = r.choices[0]
  assert.equal(choice.place, 'missile troops')
  assert.deepEqual(choice.options.map(o => o.label), ['missile troops in sight at D2-SE', 'missile troops last seen at F1-SE'])
  // Written in place of the words, each choice picks out one unit.
  const picked = read(`horse attack their ${choice.options[1].text}`, enemies)
  assert.deepEqual(picked.questions, [])
  assert.deepEqual(picked.orders.map(o => o.enemy), ['blue_unit_3'])
})

test('one unclear attack does not throw away the clear orders beside it', () => {
  const r = interpretLines(['horse attack their elephants', 'spears hold'], context([seen.archers]))
  assert.equal(r.questions.length, 1)
  assert.deepEqual(r.orders, [{ unitRef: 'red_spears', action: 'hold' }])
})

test('the AI reader can name the enemy for an attack, and resolve.js finds it among those seen', async () => {
  const ai = createAiClient({
    transport: scriptedTransport(() => ({
      text: JSON.stringify({
        orders: [{ units: ['red_horse'], action: 'attack', place: null, then_hold: false, careful: false, against: null, let_pass: 0, regardless: false, if_event: 'none', if_there: false, if_unit: null, if_action: null, if_place: null, enemy: 'blue_archers' }],
        question: null, note: null, surrender: false
      }),
      usage: { inputTokens: 300, outputTokens: 40 }
    })),
    retries: 0
  })
  const r = await interpretText('send the horse after those bowmen and keep at them', context([seen.archers, seen.swords]), { ai })
  assert.equal(r.source, 'ai')
  assert.deepEqual(r.orders, [{ unitRef: 'red_horse', action: 'attack', enemy: 'blue_archers' }])
})

test('an AI reply from before attacks could name an enemy still validates, and attacks a place as before', async () => {
  const ai = createAiClient({
    transport: scriptedTransport(() => ({
      text: JSON.stringify({
        orders: [{ units: ['red_spears'], action: 'attack', place: 'C4', then_hold: false, careful: false, against: null, let_pass: 0, regardless: false }],
        question: null, note: null, surrender: false
      }),
      usage: { inputTokens: 300, outputTokens: 40 }
    })),
    retries: 0
  })
  const r = await interpretText('have the spears storm C4 at once and fast', context([seen.archers]), { ai })
  assert.equal(r.source, 'ai')
  assert.equal(r.orders[0].action, 'attack')
  assert.equal(r.orders[0].enemy, undefined)
  assert.ok(r.orders[0].target)
  assert.ok(REPLY_SCHEMA.properties.orders.items.required.includes('enemy'), 'the schema asks for the field')
})

test('an AI reply naming an enemy the side has not seen is a question', async () => {
  const ai = createAiClient({
    transport: scriptedTransport(() => ({
      text: JSON.stringify({
        orders: [{ units: ['red_horse'], action: 'attack', place: null, then_hold: false, careful: false, against: null, let_pass: 0, regardless: false, if_event: 'none', if_there: false, if_unit: null, if_action: null, if_place: null, enemy: 'blue_elephants' }],
        question: null, note: null, surrender: false
      }),
      usage: { inputTokens: 300, outputTokens: 40 }
    })),
    retries: 0
  })
  const r = await interpretText('send the horse after their elephants and keep at them', context([seen.archers]), { ai })
  assert.deepEqual(r.orders, [])
  assert.equal(r.questions.length, 1)
})

// ── L11 ───────────────────────────────────────────────

test('the read-back for "fall back" says where the unit will stop', () => {
  const r = read('horse fall back', [], { homeEdge: 'west' })
  assert.deepEqual(r.orders, [{ unitRef: 'red_horse', action: 'withdraw' }])
  assert.deepEqual(r.understood, ['red_horse: fall back to your own edge of the field at A3-NW, 100 m west, and hold there'])
})

test('falling back together, each unit stops on its own edge square, and the read-back gives them', () => {
  const r = read('everyone fall back carefully', [], { homeEdge: 'west' })
  assert.match(r.understood[0], /fall back carefully to your own edge of the field at A2-SW, A3-NW, 100 m west, and hold there$/)
})

test('a fall back to a place named still says that place', () => {
  assert.match(read('spears fall back to C7', [], { homeEdge: 'west' }).understood[0], /^red_spears: fall back to C7/)
})

test('"their archers" are the enemy his Army tab would call archers: the bowmen, not the slingers beside them', () => {
  const r = read('horse attack their archers', [seen.archers, seen.slingers])
  assert.deepEqual(r.questions, [])
  assert.deepEqual(r.orders.map(o => o.enemy), ['blue_archers'])
  assert.deepEqual(read('horse attack their slingers', [seen.archers, seen.slingers]).orders.map(o => o.enemy), ['blue_unit_3'])
})

test('"their skirmishers" are the enemy seen with javelins and light kit, as the reports of them tell it', () => {
  const velites = { id: 'blue_velites', role: 'heavy_infantry', mounted: false, primaryWeapon: 'sword_standard', thrown: 'light_javelin', armor: 'light_armor', shield: 'light_shield', position: fromLabel('N7'), status: 'visible', strength: 80, seenOnTurn: 2 }
  const r = read('horse attack their skirmishers', [velites, seen.swords])
  assert.deepEqual(r.orders.map(o => o.enemy), ['blue_velites'])
  // An enemy whose kind no report has told is not named by kind.
  const untold = { id: 'enemy-1', name: 'troops', position: fromLabel('N7'), status: 'visible', seenOnTurn: 2 }
  assert.equal(read('horse attack their skirmishers', [untold]).orders.length, 0)
})
