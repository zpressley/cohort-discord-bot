// src/phase5-orchestration/tests/orchestration.test.js
//
// Phase 5's exit criterion — a scripted two-player battle from creation to a
// declared victory, everything through the orchestrator, no Discord — closes
// the file. Before it: fog of war, victory conditions, order submission and
// elastic time, each pinned alone.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  createGame, submitOrders, forceProcess, sideView,
  visionRange, createIntel, updateIntel,
  evaluateVictory, objectiveController,
  MAX_TICKS_PER_TURN
} = require('../index')
const { createWorld } = require('../../phase2-combat/harness/world')

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
  assert.equal(visionRange(unit({ position: 'H10' })), 6)
  assert.equal(visionRange(unit({ role: 'scout', position: 'H10' })), 10)
  // F21 is hill (verified terrain).
  assert.equal(visionRange(unit({ position: 'F21' })), 10)
  assert.equal(visionRange(unit({ role: 'scout', position: 'F21' })), 14)
})

test('an enemy out of range is unknown, in range is visible, and after moving away is a ghost', () => {
  const world = createWorld({
    units: [
      unit({ id: 'mine', side: 'red', position: 'H10' }),
      unit({ id: 'theirs', side: 'blue', position: 'H30' })
    ]
  })
  const intel = createIntel()

  updateIntel(intel, world, 'red', 1)
  assert.equal(intel.known['theirs'], undefined, '20 tiles away is over the horizon')

  world.units[1].position = 'H14'
  const sightings = updateIntel(intel, world, 'red', 2)
  assert.deepEqual(sightings, ['theirs'], 'coming into range is a sighting')
  assert.equal(intel.known['theirs'].status, 'visible')
  assert.equal(intel.known['theirs'].strength, 100)

  world.units[1].position = 'H30'
  updateIntel(intel, world, 'red', 3)
  const ghost = intel.known['theirs']
  assert.equal(ghost.status, 'ghost', 'gone from sight, not from memory')
  assert.equal(ghost.position, 'H14', 'the ghost keeps the LAST seen position')
  assert.equal(ghost.seenOnTurn, 2, 'and says how stale it is')
})

test('a re-sighted ghost counts as a fresh sighting', () => {
  const world = createWorld({
    units: [
      unit({ id: 'mine', side: 'red', position: 'H10' }),
      unit({ id: 'theirs', side: 'blue', position: 'H14' })
    ]
  })
  const intel = createIntel()
  updateIntel(intel, world, 'red', 1)     // visible
  world.units[1].position = 'H30'
  updateIntel(intel, world, 'red', 2)     // ghost
  world.units[1].position = 'H13'
  const sightings = updateIntel(intel, world, 'red', 3)
  assert.deepEqual(sightings, ['theirs'])
})

test('sideView shows own units in full and the enemy only through intel', () => {
  const game = createGame(gameSpec({
    units: [
      unit({ id: 'mine', side: 'red', position: 'H10' }),
      unit({ id: 'near', side: 'blue', position: 'H13' }),
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

  world.units[1].position = 'W7' // now both adjacent — contested
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
  assert.notEqual(a.position, 'C7', 'the side that spoke moved')
  assert.equal(b.position, 'C30', 'the silent side held')
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
  const meetingSpec = require('../../phase4-integration/scenarios/meeting-battle')
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
