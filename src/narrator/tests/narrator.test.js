// src/narrator/tests/narrator.test.js
//
// The turn told back: only what the side could know, in words, never
// changing what happened, and always a report even when the AI is down.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { narrateTurn, report, visibleEvents, summarise, fact, placeName } = require('../turnNarrator')
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

test('facts are words: places by name or feature, with the grid square the player orders by', () => {
  assert.equal(placeName(map, at('T2')), 'on The Crownhill')
  assert.equal(placeName(map, at('W6')), 'at North Ford')
  assert.equal(placeName(map, at('K18')), 'in a clearing')
  assert.equal(placeName(map, at('F9')), 'on the road')
  assert.match(fact(map, events[0]), /^red_spears moved 75 m east, now in open ground .* \(B2-SE\)$/)
})

test('a turn of several ticks is boiled down: one move per unit, one fight per pair, no noise', () => {
  const side = (unitId, killed, morale) => ({ unitId, killed, morale, stamina: 50, chaos: 1, terrain: 'plains', prepared: false, chargeImpact: false, flankBonus: 0, surprise: false, crowding: 0 })
  const raw = [
    { type: 'move', turn: 1, unitId: 'red_spears', from: at('E7'), to: at('H7'), blockedBy: null },
    { type: 'move', turn: 1, unitId: 'red_horse', from: at('E9'), to: at('E9'), blockedBy: 'blue_horse' },
    { type: 'move', turn: 2, unitId: 'red_spears', from: at('H7'), to: at('K7'), blockedBy: 'blue_swords' },
    { type: 'contact', turn: 2, aId: 'blue_swords', bId: 'red_spears' },
    { type: 'exchange', turn: 2, roundInContact: 1, a: side('blue_swords', 9, 80), b: side('red_spears', 11, 70), push: { winnerId: null, differential: 0 } },
    { type: 'exchange', turn: 3, roundInContact: 2, a: side('red_spears', 8, 45), b: side('blue_swords', 7, 60), push: { winnerId: null, differential: 0 } },
    { type: 'crowding', turn: 2, unitId: 'red_swords', at: at('E8'), men: 200, tier: 'compressed', was: 'organized' },
    { type: 'crowding', turn: 3, unitId: 'red_swords', at: at('E8'), men: 100, tier: 'organized', was: 'compressed' }
  ]
  const told = summarise(raw).map(e => fact(map, e))
  assert.equal(told.length, 2)
  assert.match(told[0], /^red_spears moved 150 m east, .*halted by blue_swords$/)
  assert.match(told[1], /^blue_swords and red_spears fought for 20 minutes: blue_swords lost 16 men, red_spears lost 19; red_spears is wavering$/)
})

test('the fighting is told unit by unit: who it fought, the cost, who broke, most important first', () => {
  const side = (unitId, killed, morale) => ({ unitId, killed, morale, stamina: 50, chaos: 1, terrain: 'plains', prepared: false, chargeImpact: false, flankBonus: 0, surprise: false, crowding: 0 })
  const fight = (a, b) => ({ type: 'exchange', turn: 4, roundInContact: 1, a, b, push: { winnerId: null, differential: 0 } })
  const turn = {
    map,
    ownIds: new Set(['red_spears', 'red_archers']),
    seenEnemyIds: new Set(['blue_swords', 'blue_horse']),
    whereIs: (id) => (id === 'red_spears' ? at('H7') : at('D8')),
    events: [
      { type: 'move', turn: 4, unitId: 'red_spears', from: at('E7'), to: at('H7'), blockedBy: 'blue_swords' },
      { type: 'contact', turn: 4, aId: 'blue_swords', bId: 'red_spears' },
      fight(side('blue_swords', 14, 40), side('red_spears', 6, 70)),
      fight(side('red_archers', 19, 20), side('blue_horse', 2, 90)),
      { type: 'push', turn: 4, unitId: 'blue_swords', by: 'red_spears', fromTerrain: 'plains', to: at('J7'), toTerrain: 'plains', winnerAdvancedTo: at('I7'), lostHighGround: false },
      { type: 'rout', turn: 4, unitId: 'blue_swords', by: 'red_spears' },
      { type: 'pursuit', turn: 4, unitId: 'blue_swords', by: 'red_spears', killed: 7, remaining: 60, trapped: false },
      { type: 'rout', turn: 4, unitId: 'red_archers', by: 'blue_horse' },
      { type: 'pursuit', turn: 4, unitId: 'red_archers', by: 'blue_horse', killed: 8, remaining: 73, trapped: false }
    ]
  }
  const lines = report(turn)
  assert.deepEqual(lines, [
    'red_archers: fought blue_horse in open ground 25 m north-east of the woods (A2-SE); lost 19 men and killed 2, then BROKE and fled from blue_horse, losing 8 more in flight',
    'red_spears: fought blue_swords in open ground 100 m south-west of the woods (B2-SE); lost 6 men and killed 14; drove blue_swords back; broke blue_swords, cutting down 7 as they ran, and holds firm'
  ])
})

test("with the AI: the facts go in, the prose comes out, in the side's voice", async () => {
  const transport = scriptedTransport(() => ({ text: 'Commander, the spears pushed east and met their swords.' }))
  const ai = createAiClient({ transport, retries: 0 })
  const told = await narrateTurn(ai, { map, side: 'red', culture: 'Roman Republic', ...knowledge, events, plain: 'PLAIN' })
  assert.equal(told.source, 'ai')
  assert.match(told.text, /spears pushed east/)

  const sent = transport.calls[0]
  assert.match(sent.system, /Roman tribune/)
  assert.match(sent.user, /red_spears: met blue_swords/)
  assert.doesNotMatch(sent.user, /moved/, 'when there was fighting, the marching is left out')
  assert.ok(!sent.user.includes('blue_scouts'), 'the model never hears what fog hides')
  assert.doesNotMatch(sent.system, /red_|blue_/, 'the standing instructions hold nothing about this turn')

  // Names the player knows the units by, when the caller gives them.
  await narrateTurn(ai, { map, side: 'red', culture: 'somewhere else', ...knowledge, events, plain: 'PLAIN', nameOf: t => t.replace(/red_spears/g, 'Spears').replace(/blue_swords/g, 'enemy swords') })
  assert.match(transport.calls[1].user, /Spears: met enemy swords/)
  assert.match(transport.calls[1].user, /enemy swords/)
  assert.match(transport.calls[1].system, /seasoned professional soldier/, 'an unknown culture gets the plain voice')
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
  const transport = scriptedTransport((req) => ({ text: `Report on ${/Your units: (\w+)/.exec(req.user)[1]}.` }))
  const ai = createAiClient({ transport, retries: 0 })
  const session = createSession(loadScenario('meeting-battle'), { seed: 1, auto: 'blue', ai })
  session.submitLines('red', ['everyone to C2-SE'])
  const told = await session.narrate('red')
  assert.equal(told.source, 'ai')
  assert.match(told.text, /^Report on red_\w+\.$/)
})

test('secrets: a side never hears of the other\'s hiding, searching or held ambush', () => {
  const { publicEvents } = require('../turnNarrator')
  const secret = [
    { type: 'hidden', turn: 4, unitId: 'blue_lurkers', at: at('F8'), cover: 'woods' },
    { type: 'ambushHeld', turn: 4, unitId: 'blue_lurkers', on: 'red_spears', reason: 'on guard' },
    { type: 'checked', turn: 4, unitId: 'blue_scouts', at: at('F8'), found: [] },
    { type: 'hidden', turn: 4, unitId: 'red_archers', at: at('D9'), cover: 'woods' }
  ]
  const red = visibleEvents(secret, knowledge)
  assert.deepEqual(red.map(e => e.unitId), ['red_archers'], 'only red\'s own hiding')
  assert.deepEqual(publicEvents(secret), [], 'on a shared screen, nobody\'s')
})

test('secrets: an unseen enemy\'s name is not given away', () => {
  const caught = { type: 'surprise', turn: 5, unitId: 'red_spears', by: 'blue_lurkers', posture: 'marching' }
  const known = (id) => knowledge.ownIds.has(id) || knowledge.seenEnemyIds.has(id)
  assert.ok(visibleEvents([caught], knowledge).length === 1, 'red knows it was caught')
  const told = fact(map, caught, known)
  assert.match(told, /an enemy no one had seen/)
  assert.doesNotMatch(told, /blue_lurkers/)
})

test('a rally is told, with how shaken the unit is; taking heart is the side\'s own business', () => {
  const rallied = { type: 'rallied', turn: 4, unitId: 'red_spears', at: at('E7'), strength: 61, morale: 18 }
  assert.match(fact(map, rallied), /^red_spears rallied .*\(B2-SW\) with 61 men, badly shaken/)
  assert.doesNotMatch(fact(map, { ...rallied, morale: 60 }), /shaken/)

  const heart = { type: 'heartened', turn: 4, unitId: 'blue_swords', by: 'red_spears', morale: 55 }
  assert.deepEqual(visibleEvents([heart, rallied], knowledge), [rallied], "the enemy's morale is not ours to read")
  assert.match(fact(map, { ...heart, unitId: 'red_archers', by: 'blue_swords' }), /red_archers took heart at the breaking of blue_swords/)
})

test('everyone who took heart at one enemy\'s breaking is told in one line', () => {
  const heart = (unitId) => ({ type: 'heartened', turn: 4, unitId, by: 'blue_swords', morale: 60 })
  const told = summarise([heart('red_spears'), heart('red_archers')])
  assert.equal(told.length, 1)
  assert.equal(fact(map, told[0]), 'red_spears and red_archers took heart at the breaking of blue_swords')
})

test('shooting is told with the fighting: who shot whom, and what it cost', () => {
  const volley = (by, unitId, killed) => ({ type: 'volley', turn: 5, unitId, by, killed, remaining: 90, distance: 4 })
  const told = report({
    map, ...knowledge,
    events: [volley('red_archers', 'blue_swords', 2), volley('red_archers', 'blue_swords', 3), volley('blue_scouts', 'red_spears', 1)]
  })
  assert.ok(told.includes('red_archers: shot at blue_swords, felling 5 men'), told.join(' / '))
  assert.ok(told.includes('red_spears: was shot at by an unseen enemy, losing 1 man'), told.join(' / '))
})
