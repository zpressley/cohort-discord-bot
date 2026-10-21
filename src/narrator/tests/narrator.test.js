// src/narrator/tests/narrator.test.js
//
// The turn told back: only what the side could know, in words, never
// changing what happened, and always a report even when the AI is down.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { narrateTurn, visibleEvents, fact, placeName } = require('../turnNarrator')
const { createAiClient } = require('../../llm/client')
const { scriptedTransport } = require('../../llm/fixtures')
const { resolveMap } = require('../../engine/map/map')
const { fromLabel } = require('../../engine/map/labels')
const { createSession } = require('../../adapters/hotseat/session')
const { loadScenario } = require('../../adapters/hotseat/scenarios')

const map = resolveMap('crownhill')
const at = (label) => fromLabel(label)

const events = [
  { type: 'move', turn: 3, unitId: 'red_spears', from: at('E7'), to: at('H7'), reachedTarget: false, blockedBy: null },
  { type: 'move', turn: 3, unitId: 'blue_scouts', from: at('AE5'), to: at('AE8'), reachedTarget: false, blockedBy: null },
  { type: 'move', turn: 3, unitId: 'blue_swords', from: at('K8'), to: at('J8'), reachedTarget: false, blockedBy: null },
  { type: 'contact', turn: 3, aId: 'blue_swords', bId: 'red_spears' },
  { type: 'rout', turn: 3, unitId: 'blue_horse', by: 'red_archers' },
  { type: 'victory', turn: 3, winner: 'red', reason: 'enemy army broken' }
]
const knowledge = { ownIds: new Set(['red_spears', 'red_archers']), seenEnemyIds: new Set(['blue_swords']) }

test('fog of war: own units, seen enemies and the verdict; never an unseen enemy alone', () => {
  const kept = visibleEvents(events, knowledge)
  const ids = kept.map(e => e.unitId ?? e.aId ?? e.type)
  assert.ok(ids.includes('red_spears'))
  assert.ok(ids.includes('blue_swords'), 'a seen enemy moving is reported')
  assert.ok(ids.includes('blue_horse'), 'an enemy routed BY our archers involves our unit')
  assert.ok(ids.includes('victory'))
  assert.ok(!ids.includes('blue_scouts'), "an unseen enemy's movement stays hidden")
})

test('facts are words: places by name or feature, no coordinates', () => {
  assert.equal(placeName(map, at('T2')), 'on The Crownhill')
  assert.equal(placeName(map, at('W6')), 'at North Ford')
  assert.equal(placeName(map, at('K18')), 'in a clearing')
  for (const e of events) {
    const text = fact(map, e)
    if (text) assert.ok(!/\b[A-Z]{1,2}\d{1,2}\b/.test(text), `coordinate in: ${text}`)
  }
  assert.match(fact(map, events[0]), /red_spears moved 75 m east/)
})

test("with the AI: the facts go in, the prose comes out, in the side's voice", async () => {
  const transport = scriptedTransport(() => ({ text: 'Commander, the spears pushed east and met their swords.' }))
  const ai = createAiClient({ transport, retries: 0 })
  const told = await narrateTurn(ai, { map, side: 'red', culture: 'Roman Republic', ...knowledge, events, plain: 'PLAIN' })
  assert.equal(told.source, 'ai')
  assert.match(told.text, /spears pushed east/)

  const sent = transport.calls[0]
  assert.match(sent.system, /Roman Republic/)
  assert.match(sent.user, /red_spears moved/)
  assert.ok(!sent.user.includes('blue_scouts'), 'the model never hears what fog hides')
  assert.ok(!/\b[A-Z]{1,2}\d{1,2}\b/.test(sent.user), 'no coordinates for the model')
})

test('without the AI, or when it fails, the plain report stands in', async () => {
  const plain = 'the plain report'
  assert.deepEqual(await narrateTurn(null, { map, side: 'red', culture: 'x', ...knowledge, events, plain }),
    { text: plain, source: 'plain' })
  const down = createAiClient({ transport: scriptedTransport(() => { throw new Error('503') }), retries: 0 })
  assert.equal((await narrateTurn(down, { map, side: 'red', culture: 'x', ...knowledge, events, plain })).source, 'plain')
  const empty = createAiClient({ transport: scriptedTransport(() => ({ text: '   ' })), retries: 0 })
  assert.equal((await narrateTurn(empty, { map, side: 'red', culture: 'x', ...knowledge, events, plain })).source, 'plain')
})

test('the hotseat session narrates its last turn for one side', async () => {
  const transport = scriptedTransport((req) => ({ text: `Report for ${/the (\w+) side/.exec(req.system)[1]}.` }))
  const ai = createAiClient({ transport, retries: 0 })
  const session = createSession(loadScenario('meeting-battle'), { seed: 1, auto: 'blue', ai })
  session.submitLines('red', ['everyone to C2-SE'])
  const told = await session.narrate('red')
  assert.equal(told.source, 'ai')
  assert.equal(told.text, 'Report for red.')
  assert.match(transport.calls[0].system, /Roman Republic/)
})
