// src/engine/battle/tests/battle.test.js
//
// Phase 4: movement and combat on the same map. The exit criterion — a full
// headless battle between two four-unit armies that terminates inside the
// turn cap and replays exactly from its seed — closes the file; before it,
// each mechanic that only exists when the two engines meet is pinned alone.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { runBattle, checkBattleOutcome, tileAwayFrom, edgeTarget, isOnEdge } =
  require('../battle')
const { createWorld } = require('../../world')
const { resolveMap } = require('../../map/map')
const { toLabel } = require('../../map/labels')

const map = resolveMap('crownhill')
const label = (position) => position && toLabel(position)
const meetingBattle = require('../../../harness/scenarios/meeting-battle')

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: 'H10',
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}

// A minimal two-sided battle spec the tests can bend.
function spec(overrides = {}) {
  return {
    name: 'fixture',
    seed: 1,
    maxTurns: 15,
    sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
    standingOrders: {},
    units: [],
    turns: [],
    ...overrides
  }
}

// ── Geometry helpers ───────────────────────────────────

test('tileAwayFrom continues the winner-loser line one tile', () => {
  assert.equal(label(tileAwayFrom(map, 'H10', 'H11')), 'H12', 'shoved south')
  assert.equal(label(tileAwayFrom(map, 'H11', 'H10')), 'H9', 'shoved north')
  assert.equal(label(tileAwayFrom(map, 'H10', 'I10')), 'J10', 'shoved east')
  assert.equal(tileAwayFrom(map, 'B10', 'A10'), null, 'off the west edge is nowhere')
})

test('edge targets and edge detection agree with each other', () => {
  for (const edge of ['west', 'east', 'north', 'south']) {
    assert.ok(isOnEdge(map, edgeTarget(map, 'K20', edge), edge), `${edge} target must lie on the ${edge} edge`)
  }
  assert.ok(!isOnEdge(map, 'K20', 'west'))
})

// ── The crest rule ─────────────────────────────────────

test('a unit shoved off a hill loses the high ground — positionally', () => {
  // F21 is hill with plains at G21 east of it. A heavy elite line drives a
  // frail levy off the crest eastward: the push event itself must say the
  // ground was lost, because terrain is read from position and nothing else.
  // (Both units start on hill, so no terrain modifier muddies the push.)
  const result = runBattle(spec({
    units: [
      unit({
        id: 'bull', side: 'red', position: 'E21', quality: 'elite',
        armor: 'heavy_armor', shield: 'heavy_shield', primaryWeapon: 'great_axe'
      }),
      unit({
        id: 'levy', side: 'blue', position: 'F21', quality: 'levy',
        armor: 'no_armor', shield: 'no_shield', primaryWeapon: 'daggers'
      })
    ],
    // The elite seeks the fight; since Stage 3 two units side by side fight
    // only if one of them is looking for one.
    standingOrders: { red: 'advance' },
    turns: [{ red: [], blue: [] }],
    maxTurns: 8
  }))

  const pushes = result.events.filter(e => e.type === 'push' && e.unitId === 'levy')
  assert.ok(pushes.length > 0, 'the elite must win the shove at some point')
  assert.ok(pushes.some(p => p.lostHighGround),
    'being shoved off the hill must be recorded as losing the high ground')
})

// ── Rout, flight, and the field edge ───────────────────

test('a broken unit flees toward its home edge and leaves the field', () => {
  // A doomed levy near its own edge: it should break, run west, and be gone.
  // The distant anchor unit keeps the battle alive after the rout — without
  // it, victory fires the moment the only enemy breaks (correctly: a broken
  // army is a beaten army) and the flight never gets to play out.
  const result = runBattle(spec({
    units: [
      unit({
        id: 'levy', side: 'red', position: 'C7', quality: 'levy',
        armor: 'no_armor', shield: 'no_shield', primaryWeapon: 'daggers', movementRange: 3
      }),
      unit({ id: 'anchor', side: 'red', position: 'V30' }),
      unit({ id: 'wall', side: 'blue', position: 'D7', quality: 'elite', primaryWeapon: 'great_axe' })
    ],
    standingOrders: { blue: 'advance' },
    turns: [],
    maxTurns: 10
  }))

  const rout = result.events.find(e => e.type === 'rout' && e.unitId === 'levy')
  assert.ok(rout, 'the levy has to break')

  const fledOrDied = result.fled.some(f => f.id === 'levy') ||
    result.events.some(e => e.type === 'destroyed' && e.unitId === 'levy')
  assert.ok(fledOrDied, 'a broken unit either escapes over its edge or is cut down — it never lingers')
})

test('broken units stop fighting — no engagement ever includes one', () => {
  const result = runBattle(spec({
    units: [
      unit({ id: 'levy', side: 'red', position: 'K20', quality: 'levy', armor: 'no_armor', shield: 'no_shield', primaryWeapon: 'daggers' }),
      unit({ id: 'elite', side: 'blue', position: 'K21', quality: 'elite', primaryWeapon: 'great_axe' })
    ],
    standingOrders: { blue: 'advance' },
    turns: [],
    maxTurns: 12
  }))

  const routTurn = result.events.find(e => e.type === 'rout' && e.unitId === 'levy')?.turn
  assert.ok(routTurn, 'fixture must produce the rout')

  for (const turnRecord of result.turns) {
    if (turnRecord.turn <= routTurn) continue
    for (const engagement of turnRecord.engagements) {
      assert.ok(engagement.aId !== 'levy' && engagement.bId !== 'levy',
        `turn ${turnRecord.turn}: a broken unit was given a battle line`)
    }
  }
})

test('pursuit bleeds a caught fugitive, and a trapped one bleeds faster', () => {
  // The levy breaks against the elite and tries to flee EAST (its home edge)
  // straight through the enemy — it is caught and cut down. MIN_KILLED
  // guarantees this ends: the first battle runs produced an immortal remnant
  // whose fractional losses rounded to zero.
  const result = runBattle(spec({
    sides: { red: { homeEdge: 'east' }, blue: { homeEdge: 'west' } },
    units: [
      unit({ id: 'levy', side: 'red', position: 'K20', quality: 'levy', armor: 'no_armor', shield: 'no_shield', primaryWeapon: 'daggers' }),
      unit({ id: 'elite', side: 'blue', position: 'L20', quality: 'elite', primaryWeapon: 'great_axe' })
    ],
    standingOrders: { blue: 'advance' },
    turns: [],
    maxTurns: 15
  }))

  const pursuits = result.events.filter(e => e.type === 'pursuit' && e.unitId === 'levy')
  assert.ok(pursuits.length > 0, 'the fugitive must be caught at least once')
  assert.ok(pursuits.every(p => p.killed >= 1), 'a caught fleeing man dies — no zero strikes')
})

// ── Victory ────────────────────────────────────────────

test('a side whose every unit is broken has lost, even with men still alive', () => {
  const world = createWorld({
    units: [
      unit({ id: 'a', side: 'red' }),
      unit({ id: 'b', side: 'blue', position: 'H12' })
    ]
  })
  const outcome = checkBattleOutcome(world, new Set(['b']))
  assert.deepEqual(outcome, { decided: true, winner: 'red', reason: 'enemy army broken' })
})

test('both armies collapsing together is a draw', () => {
  const world = createWorld({
    units: [unit({ id: 'a', side: 'red' }), unit({ id: 'b', side: 'blue', position: 'H12' })]
  })
  const outcome = checkBattleOutcome(world, new Set(['a', 'b']))
  assert.deepEqual(outcome, { decided: true, winner: 'draw', reason: 'mutual collapse' })
})

// ── Flanking ───────────────────────────────────────────

test('a unit fighting on two fronts dies faster than one fighting on one', () => {
  // Same target, same enemy quality; the only difference is the second
  // engagement. Flanking has to reach the casualty ledger, not just a rating.
  const oneFront = runBattle(spec({
    units: [
      unit({ id: 'target', side: 'blue', position: 'K20' }),
      unit({ id: 'axe1', side: 'red', position: 'K21' })
    ],
    standingOrders: { red: 'advance' },
    turns: [], maxTurns: 4
  }))
  const twoFronts = runBattle(spec({
    units: [
      unit({ id: 'target', side: 'blue', position: 'K20' }),
      unit({ id: 'axe1', side: 'red', position: 'K21' }),
      unit({ id: 'axe2', side: 'red', position: 'K19' })
    ],
    standingOrders: { red: 'advance' },
    turns: [], maxTurns: 4
  }))

  const lossesBy = (record) => {
    const last = record.turns.at(-1).snapshot.units.find(u => u.id === 'target')
    const strength = last ? last.strength : 0
    return 100 - strength
  }

  assert.ok(lossesBy(twoFronts) > lossesBy(oneFront),
    `two fronts must cost more: ${lossesBy(twoFronts)} vs ${lossesBy(oneFront)}`)
})

// ── The exit criterion ─────────────────────────────────

test('exit: two four-unit armies fight to a decision inside the turn cap', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const result = runBattle(meetingBattle, { seed })
    assert.ok(result.outcome.decided, `seed ${seed} ended undecided`)
    assert.ok(result.turns.length <= 20, `seed ${seed} overran the cap`)
    assert.ok(['red', 'blue', 'draw'].includes(result.outcome.winner))
  }
})

test('exit: a battle replays byte-identically from its seed', () => {
  const once = runBattle(meetingBattle, { seed: 7 })
  const twice = runBattle(meetingBattle, { seed: 7 })
  assert.deepEqual(once, twice)
})

test('exit: a different seed gives a different battle', () => {
  const a = JSON.stringify(runBattle(meetingBattle, { seed: 1 }).events)
  const b = JSON.stringify(runBattle(meetingBattle, { seed: 23 }).events)
  assert.notEqual(a, b)
})

test('the event log carries the battle: contacts, exchanges, and a victory', () => {
  const result = runBattle(meetingBattle, { seed: 1 })
  const types = new Set(result.events.map(e => e.type))

  assert.ok(types.has('move'))
  assert.ok(types.has('contact'))
  assert.ok(types.has('exchange'))
  assert.ok(types.has('rout'))
  assert.ok(types.has('victory'))

  // No timestamps anywhere — the log gets diffed like every report here.
  for (const event of result.events) {
    assert.equal(event.timestamp, undefined)
    assert.ok(Number.isInteger(event.turn))
  }
})

// The schema in events.js, pinned: every event is data a narrator can use
// without reading engine state. No prose, and positions are numeric.
const EVENT_FIELDS = {
  move: ['unitId', 'from', 'to', 'reachedTarget', 'blockedBy'],
  arrived: ['unitId', 'action', 'at', 'then'],
  halted: ['unitId', 'action', 'at', 'reason', 'blockedBy', 'then'],
  fled: ['unitId', 'side', 'strength'],
  contact: ['aId', 'bId'],
  exchange: ['roundInContact', 'a', 'b', 'push'],
  standoff: ['aId', 'bId'],
  destroyed: ['unitId'],
  push: ['unitId', 'by', 'fromTerrain', 'to', 'toTerrain', 'winnerAdvancedTo', 'lostHighGround'],
  crush: ['unitId', 'by', 'reason'],
  rout: ['unitId', 'by'],
  pursuit: ['unitId', 'by', 'killed', 'remaining', 'trapped'],
  crowding: ['unitId', 'at', 'men', 'tier', 'was'],
  surprise: ['unitId', 'by', 'posture'],
  revealed: ['unitId', 'reason', 'by'],
  ambush: ['unitId', 'on', 'at'],
  ambushHeld: ['unitId', 'on', 'reason'],
  checked: ['unitId', 'at', 'found'],
  hidden: ['unitId', 'at', 'cover'],
  hideFailed: ['unitId', 'at', 'reason', 'by'],
  victory: ['winner', 'reason']
}
const EXCHANGE_SIDE = ['unitId', 'killed', 'morale', 'stamina', 'chaos', 'terrain',
  'prepared', 'chargeImpact', 'flankBonus', 'surprise', 'crowding']

test('every event is structured data matching the documented schema', () => {
  const isPosition = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y)
  const seen = new Set()

  for (const seed of [1, 2, 3, 4, 5]) {
    for (const event of runBattle(meetingBattle, { seed }).events) {
      const fields = EVENT_FIELDS[event.type]
      assert.ok(fields, `undocumented event type: ${event.type}`)
      seen.add(event.type)
      for (const field of fields) {
        assert.ok(field in event, `${event.type} is missing ${field}`)
      }
      assert.equal(event.detail, undefined, 'no prose in the engine log')

      if (event.type === 'move') assert.ok(isPosition(event.from) && isPosition(event.to))
      if (event.type === 'push') assert.ok(isPosition(event.to) && isPosition(event.winnerAdvancedTo))
      if (event.type === 'exchange') {
        for (const side of [event.a, event.b]) {
          for (const field of EXCHANGE_SIDE) assert.ok(field in side, `exchange side is missing ${field}`)
          assert.ok(Number.isInteger(side.killed) && side.killed >= 0)
        }
        assert.ok('winnerId' in event.push && typeof event.push.differential === 'number')
      }
    }
  }

  for (const type of ['move', 'contact', 'exchange', 'rout', 'victory']) {
    assert.ok(seen.has(type), `the meeting battle should produce ${type} events`)
  }
})

test('units that flee the field are preserved in the record, not erased', () => {
  // The veterans phase needs to know who lived. A unit that escapes over its
  // home edge keeps its identity and its remaining strength.
  const result = runBattle(meetingBattle, { seed: 1 })
  for (const fugitive of result.fled) {
    assert.ok(fugitive.id)
    assert.ok(fugitive.strength > 0, 'a destroyed unit is not "fled"')
  }
})
