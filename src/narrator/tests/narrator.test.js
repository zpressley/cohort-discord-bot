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
  // One rule for "the" (words.js, PLACE): small inside a sentence, and
  // taken by a name that describes the place.
  assert.equal(placeName(map, at('T2')), 'on the Crownhill')
  assert.equal(placeName(map, at('W6')), 'at the North Ford')
  assert.equal(placeName(map, at('K18')), 'in a clearing')
  assert.equal(placeName(map, at('F9')), 'on the road')
  assert.match(fact(map, events[0]), /^red_spears marched 75 m east, now in open ground .* \(B2-SE\)$/)
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
  assert.match(told[0], /^red_spears marched 150 m east, .*halted by blue_swords$/)
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
  assert.doesNotMatch(sent.user, /marched/, 'when there was fighting, the marching is left out')
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
  assert.match(fact(map, rallied), /^red_spears rallied .*\(B2-SW\) with 61 men, at breaking point/)
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

test('javelins and pila thrown as the fighting begins are told first, in the kit\'s own words, to both sides', () => {
  const told = report({
    map, ...knowledge,
    events: [
      { type: 'contact', turn: 5, aId: 'blue_swords', bId: 'red_spears' },
      { type: 'thrown', turn: 5, unitId: 'blue_swords', by: 'red_spears', weapon: 'roman_pilum', killed: 9, remaining: 91 },
      { type: 'exchange', turn: 5, a: { unitId: 'red_spears', killed: 6, morale: 90 }, b: { unitId: 'blue_swords', killed: 12, morale: 70 } }
    ]
  })
  assert.match(told.join(' / '), /^red_spears: threw their pila at blue_swords, felling 9 men; fought blue_swords/)
  const theirs = report({
    map, ownIds: new Set(['blue_swords']), seenEnemyIds: new Set(['red_spears']),
    events: [{ type: 'thrown', turn: 5, unitId: 'blue_swords', by: 'red_spears', weapon: 'light_javelin', killed: 3, remaining: 97 }]
  })
  assert.deepEqual(theirs, ['blue_swords: met light javelins from red_spears, losing 3 men'])
})

test('an officer reacting as ordered, or losing the thread, is told to his own side only; the roll is told to no one', () => {
  const reacted = { type: 'reacted', turn: 4, unitId: 'red_spears', when: 'sees', kind: 'cavalry', action: 'hold', target: null }
  const lost = { type: 'lostThread', turn: 4, unitId: 'red_archers', officer: 'Marcus', lost: 'steps', did: 'advance' }
  const roll = { type: 'grasp', turn: 1, unitId: 'red_spears', officer: 'Marcus', clauses: 2, kept: 1 }
  assert.equal(fact(map, reacted), 'red_spears saw the enemy it was warned of (cavalry) and, as ordered, held')
  assert.equal(fact(map, lost), 'Marcus of red_archers lost the thread of his orders once the first part was done and advanced on the enemy')
  assert.deepEqual(visibleEvents([reacted, lost, roll], knowledge), [reacted, lost])
  const theirs = { ownIds: new Set(['blue_swords']), seenEnemyIds: new Set(['red_spears', 'red_archers']) }
  assert.deepEqual(visibleEvents([reacted, lost, roll], theirs), [], 'the enemy learns nothing of your orders')
})

// Ruled 2026-11-24: "No the day just ends the battle, you can choose to
// fight again the next day."
test('when night ends the battle, each side is told plainly that night has ended the fighting and neither side has won', async () => {
  const night = [{ type: 'nightfall', turn: 72 }]
  for (const ownIds of [new Set(['red_spears']), new Set(['blue_swords'])]) {
    const lines = report({ map, ownIds, seenEnemyIds: new Set(), events: night })
    assert.deepEqual(lines, ['night has ended the fighting, and neither side has won'])
    // With no AI, or when it does not answer, the dispatch is the plain
    // account, and says it too.
    const told = await narrateTurn(null, { map, side: 'red', culture: 'x', ownIds, seenEnemyIds: new Set(), events: night, plain: lines.join('\n') })
    assert.match(told.text, /neither side has won/)
  }
})

test('the ground to fight for is told to each side as its own or the enemy\'s: taken, lost, and close to deciding the battle', () => {
  const ground = [
    { type: 'objective', turn: 3, objectiveId: 'ground-1', name: 'the Old Mill Bridge', side: 'blue', was: null },
    { type: 'objective', turn: 6, objectiveId: 'ground-1', name: 'the Old Mill Bridge', side: 'blue', was: 'blue', close: 30 },
    { type: 'objective', turn: 7, objectiveId: 'ground-1', name: 'the Old Mill Bridge', side: null, was: 'blue' }
  ]
  const told = (side, ownIds) => report({ map, side, ownIds: new Set(ownIds), seenEnemyIds: new Set(), events: ground })
  assert.deepEqual(told('red', ['red_spears']), [
    'the enemy took the Old Mill Bridge: take it from him, or the field is his',
    'the enemy has held the Old Mill Bridge long: unless you take it from him within 30 min, the field is his',
    'the enemy no longer holds the Old Mill Bridge'
  ])
  assert.deepEqual(told('blue', ['blue_swords']), [
    'you took the Old Mill Bridge: hold it alone and the field is yours',
    'hold the Old Mill Bridge 30 min more and the field is yours',
    'you no longer hold the Old Mill Bridge'
  ])
  // Every side hears of it at once, whatever it can see.
  assert.equal(visibleEvents(ground, { ownIds: new Set(), seenEnemyIds: new Set() }).length, 3)
})

test('missile troops falling back are told once a turn, in the order\'s own words, and the enemy hears of it only if he sees them', () => {
  // (Fire and retreat, docs/design/army-balance.md part 7.)
  const fell = (turn, from, to) => ({ type: 'gaveGround', turn, unitId: 'red_archers', from, to: at(to) })
  const told = summarise([fell(5, ['blue_swords'], 'E7'), fell(6, ['blue_swords', 'blue_horse'], 'D7')])
  assert.equal(told.length, 1)
  assert.equal(fact(map, told[0]), 'red_archers fell back before blue_horse and blue_swords, keeping out of their reach')
  const blue = { ownIds: new Set(['blue_swords']), seenEnemyIds: new Set() }
  assert.equal(visibleEvents([fell(5, ['blue_swords'], 'E7')], blue).length, 0, 'blue did not see the archers go')
  assert.equal(visibleEvents([fell(5, ['blue_swords'], 'E7')], { ...blue, seenEnemyIds: new Set(['red_archers']) }).length, 1)
})

test('the AI is told to speak to the Commander as "you", and that ground not yet held long enough has not won the field', () => {
  const { system } = require('../turnNarrator')
  const text = system()
  assert.match(text, /Speak to the commander as "you"\. What happened to him is "you were taken", never "we were taken"/)
  assert.match(text, /means the field is not yet won\. Never say the field is won, secured or yours unless a note says the battle is over/)
})

test('the same line twice in a stretch is told once', () => {
  const pinned = { type: 'crush', unitId: 'blue_velites' }
  const told = report({ map: null, side: 'red', ownIds: new Set(['red_spears']), seenEnemyIds: new Set(['blue_velites']), events: [{ ...pinned, turn: 1 }, { ...pinned, turn: 2 }] })
  assert.deepEqual(told, ['blue_velites was pinned with nowhere to give way'])
})

test('a unit that broke off a fight losing one man is told "1 man", not "1 men"', () => {
  assert.equal(fact(null, { type: 'disengage', unitId: 'blue_archers', killed: 1 }), 'blue_archers broke off the fight, losing 1 man to the parting blows')
  assert.equal(fact(null, { type: 'disengage', unitId: 'blue_archers', killed: 4 }), 'blue_archers broke off the fight, losing 4 men to the parting blows')
})

test('the end of a battle is told to each side in its own words, "the field is yours", never "Red won (enemy army broken)"', () => {
  const event = { type: 'victory', winner: 'red', reason: 'enemy army broken' }
  const told = (side) => report({ map: null, side, ownIds: new Set(), seenEnemyIds: new Set(), events: [event] })
  assert.deepEqual(told('red'), ['The battle is over: the enemy army broke. The field is yours'])
  assert.deepEqual(told('blue'), ['The battle is over: your army broke. The field is the enemy\'s'])
})
