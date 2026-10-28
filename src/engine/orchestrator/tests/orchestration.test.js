// src/engine/orchestrator/tests/orchestration.test.js
//
// Phase 5's exit criterion — a scripted two-player battle from creation to a
// declared victory, everything through the orchestrator, no Discord — closes
// the file. Before it: fog of war, victory conditions, order submission and
// elastic time, each pinned alone.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  createGame, submitOrders, forceProcess, sideView, gameRecord, replayGame,
  visionRange, createIntel, updateIntel,
  evaluateVictory, objectiveController,
  MAX_TICKS_PER_TURN
} = require('../index')
const { createWorld, createUnit } = require('../../world')
const { resolveMap } = require('../../map/map')
const { toLabel, toPosition } = require('../../map/labels')

// These rules were written on Crownhill; positions are set and compared as
// labels so the tests stay readable.
const map = resolveMap('crownhill')

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: 'H10',
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}

function gameSpec(overrides = {}) {
  return {
    name: 'fixture',
    seed: 1,
    sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
    units: [],
    turns: [],
    ...overrides
  }
}

// ── Fog of war ─────────────────────────────────────────

test('vision: 6 standard, 10 for scouts, +4 on high ground', () => {
  assert.equal(visionRange(createUnit(unit({ position: 'H10' })), map), 6)
  assert.equal(visionRange(createUnit(unit({ role: 'scout', position: 'H10' })), map), 10)
  // F21 is hill (verified terrain).
  assert.equal(visionRange(createUnit(unit({ position: 'F21' })), map), 10)
  assert.equal(visionRange(createUnit(unit({ role: 'scout', position: 'F21' })), map), 14)
})

// On the open plain south of the river: column H at rows 10-14, used before
// Stage 3, looks through the woods at H11-H12, which now block sight.
test('an enemy out of range is unknown, in range is visible, and after moving away is a ghost', () => {
  const world = createWorld({
    units: [
      unit({ id: 'mine', side: 'red', position: 'J24' }),
      unit({ id: 'theirs', side: 'blue', position: 'J33' })
    ]
  })
  const intel = createIntel()

  updateIntel(intel, world, 'red', 1, map)
  assert.equal(intel.known['theirs'], undefined, '9 tiles away is out of sight')

  world.units[1].position = toPosition('J28')
  const sightings = updateIntel(intel, world, 'red', 2, map)
  assert.deepEqual(sightings, ['theirs'], 'coming into range is a sighting')
  assert.equal(intel.known['theirs'].status, 'visible')
  assert.equal(intel.known['theirs'].strength, 100)

  world.units[1].position = toPosition('J33')
  updateIntel(intel, world, 'red', 3, map)
  const ghost = intel.known['theirs']
  assert.equal(ghost.status, 'ghost', 'gone from sight, not from memory')
  assert.equal(toLabel(ghost.position), 'J28', 'the ghost keeps the LAST seen position')
  assert.equal(ghost.seenOnTurn, 2, 'and says how stale it is')
})

test('a re-sighted ghost counts as a fresh sighting', () => {
  const world = createWorld({
    units: [
      unit({ id: 'mine', side: 'red', position: 'J24' }),
      unit({ id: 'theirs', side: 'blue', position: 'J28' })
    ]
  })
  const intel = createIntel()
  updateIntel(intel, world, 'red', 1, map)     // visible
  world.units[1].position = toPosition('J33')
  updateIntel(intel, world, 'red', 2, map)     // ghost
  world.units[1].position = toPosition('J27')
  const sightings = updateIntel(intel, world, 'red', 3, map)
  assert.deepEqual(sightings, ['theirs'])
})

test('sideView shows own units in full and the enemy only through intel', () => {
  const game = createGame(gameSpec({
    units: [
      unit({ id: 'mine', side: 'red', position: 'J24' }),
      unit({ id: 'near', side: 'blue', position: 'J27' }),
      unit({ id: 'far', side: 'blue', position: 'AA35' })
    ]
  }))

  const view = sideView(game, 'red')
  assert.equal(view.own.length, 1)
  assert.deepEqual(view.intel.map(i => i.id), ['near'], 'the far unit does not exist for red')
})

// ── Victory conditions ─────────────────────────────────

test('surrender ends the battle immediately, whatever the field says', () => {
  const world = createWorld({
    units: [unit({ id: 'a', side: 'red' }), unit({ id: 'b', side: 'blue', position: 'H30' })]
  })
  const outcome = evaluateVictory({
    world, broken: new Set(), surrendered: 'blue', startingStrength: {}, objectiveHolds: {}
  })
  assert.deepEqual(outcome, { decided: true, winner: 'red', reason: 'enemy surrendered' })
})

test('a side under 20% of its starting strength has collapsed', () => {
  const world = createWorld({
    units: [
      unit({ id: 'a', side: 'red', strength: 100 }),
      unit({ id: 'b', side: 'blue', strength: 19, position: 'H30' })
    ]
  })
  const outcome = evaluateVictory({
    world, broken: new Set(),
    startingStrength: { red: 100, blue: 100 },
    objectiveHolds: {}
  })
  assert.deepEqual(outcome, { decided: true, winner: 'red', reason: 'enemy army collapsed' })
})

test('both sides collapsing together is mutual ruin', () => {
  const world = createWorld({
    units: [
      unit({ id: 'a', side: 'red', strength: 10 }),
      unit({ id: 'b', side: 'blue', strength: 12, position: 'H30' })
    ]
  })
  const outcome = evaluateVictory({
    world, broken: new Set(),
    startingStrength: { red: 100, blue: 100 },
    objectiveHolds: {}
  })
  assert.deepEqual(outcome, { decided: true, winner: 'draw', reason: 'mutual ruin' })
})

test('objective control: one side adjacent and unopposed controls; contested is nobody', () => {
  const world = createWorld({
    units: [
      unit({ id: 'a', side: 'red', position: 'W5' }),   // adjacent to W6
      unit({ id: 'b', side: 'blue', position: 'H30' })
    ]
  })
  assert.equal(objectiveController(world, new Set(), { id: 'ford', coord: 'W6' }), 'red')

  world.units[1].position = toPosition('W7') // now both adjacent — contested
  assert.equal(objectiveController(world, new Set(), { id: 'ford', coord: 'W6' }), null)
})

test('a broken unit cannot hold an objective', () => {
  const world = createWorld({
    units: [
      unit({ id: 'a', side: 'red', position: 'W5' }),
      unit({ id: 'b', side: 'blue', position: 'H30' })
    ]
  })
  assert.equal(objectiveController(world, new Set(['a']), { id: 'ford', coord: 'W6' }), null)
})

test('holding every objective for three player turns wins the field', () => {
  // Red sits on the objective; blue is far away and holds still. Nothing else
  // happens, so each player turn should tick the hold counter once.
  const game = createGame(gameSpec({
    units: [
      unit({ id: 'holder', side: 'red', position: 'W6' }),
      unit({ id: 'bystander', side: 'blue', position: 'AA35' })
    ],
    objectives: [{ id: 'ford', coord: 'W6' }],
    objectiveTurnsToWin: 3
  }))

  let last
  for (let i = 0; i < 5 && !game.outcome.decided; i++) {
    submitOrders(game, 'red', [])
    last = submitOrders(game, 'blue', [])
  }

  assert.ok(game.outcome.decided, 'the hold must eventually win')
  assert.equal(game.outcome.winner, 'red')
  assert.equal(game.outcome.reason, 'objectives held')
  assert.equal(last.status, 'finished')
})

// ── Order submission ───────────────────────────────────

test('the turn waits for the second commander and fires on their submission', () => {
  const game = createGame(gameSpec({
    units: [
      unit({ id: 'a', side: 'red', position: 'C7' }),
      unit({ id: 'b', side: 'blue', position: 'C30' })
    ]
  }))

  const first = submitOrders(game, 'red', [{ unitRef: 'a', target: 'F7' }])
  assert.equal(first.status, 'waiting')
  assert.deepEqual(first.waitingOn, ['blue'])
  assert.equal(game.playerTurn, 0, 'nothing processes on half the orders')

  const second = submitOrders(game, 'blue', [])
  assert.equal(second.status, 'processed')
  assert.equal(game.playerTurn, 1)
})

test('forceProcess is the timeout path — the silent side holds', () => {
  const game = createGame(gameSpec({
    units: [
      unit({ id: 'a', side: 'red', position: 'C7' }),
      unit({ id: 'b', side: 'blue', position: 'C30' })
    ]
  }))

  submitOrders(game, 'red', [{ unitRef: 'a', target: 'F7' }])
  const result = forceProcess(game)

  assert.equal(result.status, 'processed')
  const a = game.battle.world.units.find(u => u.id === 'a')
  const b = game.battle.world.units.find(u => u.id === 'b')
  assert.notEqual(toLabel(a.position), 'C7', 'the side that spoke moved')
  assert.equal(toLabel(b.position), 'C30', 'the silent side held')
})

test('a submitted surrender is honoured even while the other side is mid-plan', () => {
  const game = createGame(gameSpec({
    units: [
      unit({ id: 'a', side: 'red' }),
      unit({ id: 'b', side: 'blue', position: 'H30' })
    ]
  }))

  const result = submitOrders(game, 'blue', { surrender: true })
  assert.equal(result.status, 'finished')
  assert.equal(result.outcome.winner, 'red')
  assert.equal(result.outcome.reason, 'enemy surrendered')
})

// ── Elastic time ───────────────────────────────────────

test('armies out of contact fast-forward; the march stops the moment the enemy is sighted', () => {
  // Two units 24 tiles apart marching toward each other. At 3 tiles a tick
  // and vision 6, several ticks pass before either can see the other — and
  // the turn must burn through them in ONE submission, then interrupt on the
  // sighting.
  const game = createGame(gameSpec({
    units: [
      unit({ id: 'a', side: 'red', position: 'C8' }),
      unit({ id: 'b', side: 'blue', position: 'AA8' })
    ]
  }))

  submitOrders(game, 'red', [{ unitRef: 'a', target: 'AA8' }])
  submitOrders(game, 'blue', [{ unitRef: 'b', target: 'C8' }])

  const turn = game.history[0]
  assert.ok(turn.ticks.length > 1, 'empty country must fast-forward, not trickle')
  assert.equal(turn.interrupt, 'sighting', 'the interrupt is seeing the enemy')
  assert.ok(game.minutesElapsed >= turn.ticks.length * 10, 'the clock kept up')
})

test('a turn in contact resolves one tick — the commanders decide every round', () => {
  const game = createGame(gameSpec({
    units: [
      unit({ id: 'a', side: 'red', position: 'K20' }),
      unit({ id: 'b', side: 'blue', position: 'K21' })
    ]
  }))

  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])

  const turn = game.history[0]
  assert.equal(turn.ticks.length, 1)
  assert.equal(turn.interrupt, 'contact')
})

test('a fully stalled turn ends instead of spinning six empty ticks', () => {
  const game = createGame(gameSpec({
    units: [
      unit({ id: 'a', side: 'red', position: 'C7' }),
      unit({ id: 'b', side: 'blue', position: 'C30' })
    ]
  }))

  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])

  const turn = game.history[0]
  assert.equal(turn.ticks.length, 1)
  assert.equal(turn.interrupt, 'stalled')
})

// ── The exit criterion ─────────────────────────────────

test('exit: a two-player battle runs from creation to declared victory through the orchestrator alone', () => {
  // The phase 4 meeting armies, driven by two scripted "players" who advance
  // on each other and then keep pressing. Victory must be declared by the
  // orchestrator's own evaluation, and the loser's view must agree.
  const meetingSpec = require('../../../harness/scenarios/meeting-battle')
  const game = createGame({ ...meetingSpec, maxTurns: undefined }, { seed: 3 })

  const press = (side) => [] // standing orders carry the aggression

  let result = null
  for (let round = 0; round < 40 && !game.outcome.decided; round++) {
    submitOrders(game, 'red', press('red'))
    result = submitOrders(game, 'blue', press('blue'))
  }

  assert.ok(game.outcome.decided, 'the battle must reach a verdict')
  assert.ok(['red', 'blue', 'draw'].includes(game.outcome.winner))
  assert.equal(result.status, 'finished')

  // Both commanders see the same verdict through their own views.
  for (const side of ['red', 'blue']) {
    assert.deepEqual(sideView(game, side).outcome, game.outcome)
  }

  // And the whole thing was deterministic: run it again, same verdict on the
  // same player turn.
  const rerun = createGame({ ...meetingSpec, maxTurns: undefined }, { seed: 3 })
  for (let round = 0; round < 40 && !rerun.outcome.decided; round++) {
    submitOrders(rerun, 'red', [])
    submitOrders(rerun, 'blue', [])
  }
  assert.deepEqual(rerun.outcome, game.outcome)
  assert.equal(rerun.playerTurn, game.playerTurn)
})

// ── Replay ─────────────────────────────────────────────

// A game with everything in it: typed orders on both sides, a hold, a target
// given as a position rather than a label, a forced (timed-out) turn, then
// standing orders to the end.
function playFullGame(seed) {
  const meetingSpec = require('../../../harness/scenarios/meeting-battle')
  const game = createGame({ ...meetingSpec, maxTurns: undefined }, { seed })
  submitOrders(game, 'red', [{ unitRef: 'everyone', target: 'K8' }, { unitRef: 'red_archers', target: 'hold' }])
  submitOrders(game, 'blue', [{ unitRef: 'everyone', target: { x: 9, y: 7 } }])
  submitOrders(game, 'red', [{ unitRef: 'red_horse', target: 'M10' }])
  forceProcess(game)
  for (let i = 0; i < 60 && !game.outcome.decided; i++) {
    submitOrders(game, 'red', [])
    submitOrders(game, 'blue', [])
  }
  return game
}

test('replay: a saved game rebuilds byte for byte from spec, seed and orders', () => {
  const game = playFullGame(5)
  assert.ok(game.outcome.decided, 'the fixture game must finish')

  // Through JSON, the way it would be saved.
  const record = JSON.parse(JSON.stringify(gameRecord(game)))
  const replayed = replayGame(record)

  assert.equal(JSON.stringify(replayed.battle.log.all()), JSON.stringify(game.battle.log.all()),
    'the event log must match exactly')
  assert.equal(JSON.stringify(replayed.history), JSON.stringify(game.history))
  assert.deepEqual(replayed.outcome, game.outcome)
  assert.equal(replayed.playerTurn, game.playerTurn)
  assert.equal(replayed.minutesElapsed, game.minutesElapsed)
})

test('replay: stopping part-way shows the game exactly as it stood then', () => {
  const game = playFullGame(8)
  const record = gameRecord(game)

  // Rebuild the game live, entry by entry, and compare at every step.
  const live = createGame(record.spec, { seed: record.seed })
  record.orderLog.forEach((entry, i) => {
    if (entry.forced) forceProcess(live)
    else submitOrders(live, entry.side, entry.orders)
    if (i % 5 === 0) {
      const partial = replayGame(record, { upTo: i + 1 })
      assert.equal(JSON.stringify(partial.battle.log.all()), JSON.stringify(live.battle.log.all()),
        `log diverged after entry ${i}`)
    }
  })
})

test('the order log is a copy: editing orders after submitting changes nothing', () => {
  const meetingSpec = require('../../../harness/scenarios/meeting-battle')
  const game = createGame(meetingSpec, { seed: 1 })
  const orders = [{ unitRef: 'everyone', target: 'K8' }]
  submitOrders(game, 'red', orders)
  orders[0].target = 'A1'
  assert.equal(gameRecord(game).orderLog[0].orders[0].target, 'K8')
})

// ── Time limit (a testing aid, ruled 2026-10-21) ───────

test('time limit: a mutual hold ends when the clock runs out', () => {
  const meetingSpec = require('../../../harness/scenarios/meeting-battle')
  const game = createGame({ ...meetingSpec, standingOrders: {}, timeLimitMinutes: 60 }, { seed: 1 })
  let turns = 0
  while (!game.outcome.decided && turns < 50) {
    submitOrders(game, 'red', [{ unitRef: 'everyone', target: 'hold' }])
    submitOrders(game, 'blue', [{ unitRef: 'everyone', target: 'hold' }])
    turns++
  }
  assert.ok(game.outcome.decided, 'the clock ends it')
  assert.equal(game.minutesElapsed, 60)
  assert.deepEqual(game.outcome, { decided: true, winner: 'draw', reason: 'time ran out: equal losses' },
    'nobody fought, so nobody lost more')
})

test('time limit: the side that lost the larger share of its men loses', () => {
  const world = createWorld({
    units: [
      unit({ id: 'r', side: 'red', strength: 70, maxStrength: 100 }),
      unit({ id: 'b', side: 'blue', position: 'H20', strength: 90, maxStrength: 100 })
    ]
  })
  const ctx = {
    world, broken: new Set(), startingStrength: { red: 100, blue: 100 },
    minutesElapsed: 120, timeLimitMinutes: 120
  }
  assert.deepEqual(evaluateVictory(ctx), { decided: true, winner: 'blue', reason: 'time ran out: fewer losses' })
  // Men who fled are not casualties: red's 30 missing all escaped.
  assert.deepEqual(evaluateVictory({ ...ctx, fledStrength: { red: 30 } }).winner, 'red')
  // Before the limit, nothing is decided by it.
  assert.equal(evaluateVictory({ ...ctx, minutesElapsed: 110 }).decided, false)
})

test('without a time limit, a mutual hold goes on', () => {
  const meetingSpec = require('../../../harness/scenarios/meeting-battle')
  const game = createGame({ ...meetingSpec, standingOrders: {} }, { seed: 1 })
  for (let i = 0; i < 30; i++) {
    submitOrders(game, 'red', [{ unitRef: 'everyone', target: 'hold' }])
    submitOrders(game, 'blue', [{ unitRef: 'everyone', target: 'hold' }])
  }
  assert.equal(game.outcome.decided, false)
})
