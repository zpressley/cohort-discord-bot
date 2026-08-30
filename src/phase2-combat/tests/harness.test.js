// Tests for the harness itself. If these pass, a combat-balance result you get
// out of the harness means something.

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  runScenario, runMovementPhase, detectEngagements, applyCasualties,
  checkOutcome, sweep, createRng, createWorld, formatReport, tileDistance
} = require('../harness')
const { placeholderResolver } = require('../harness/placeholderResolver')
const { getScenario, SCENARIOS } = require('../scenarios')

// ── determinism ────────────────────────────────────────────────

test('the same seed produces the same number stream', () => {
  const a = createRng(1234)
  const b = createRng(1234)
  const drawA = Array.from({ length: 50 }, () => a())
  const drawB = Array.from({ length: 50 }, () => b())
  assert.deepEqual(drawA, drawB)
})

test('different seeds produce different number streams', () => {
  const a = createRng(1)
  const b = createRng(2)
  assert.notEqual(a(), b())
})

test('the same scenario and seed produce a byte-identical report', () => {
  const scenario = getScenario('hill-assault')
  const first = formatReport(runScenario(scenario, { combatResolver: placeholderResolver, seed: 7 }))
  const second = formatReport(runScenario(scenario, { combatResolver: placeholderResolver, seed: 7 }))
  assert.equal(first, second)
})

test('a different seed changes the outcome numbers', () => {
  const scenario = getScenario('hill-assault')
  const a = formatReport(runScenario(scenario, { combatResolver: placeholderResolver, seed: 7 }))
  const b = formatReport(runScenario(scenario, { combatResolver: placeholderResolver, seed: 8 }))
  assert.notEqual(a, b)
})

test('reports carry no timestamp or wall-clock value', () => {
  const report = formatReport(runScenario(getScenario('ford-crossing'), { combatResolver: placeholderResolver }))
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(report), 'report contains a date')
  assert.ok(!/\b\d{1,2}:\d{2}:\d{2}\b/.test(report), 'report contains a clock time')
  assert.ok(!/\bGMT\b|\bUTC\b/.test(report), 'report contains a timezone')
})

// ── movement integration ───────────────────────────────────────

test('a unit cannot end its move on an occupied tile', () => {
  const world = createWorld({
    units: [
      { id: 'mover', side: 'red', position: 'D4', movementRange: 5 },
      { id: 'blocker', side: 'blue', position: 'D6' }
    ]
  })

  runMovementPhase(world, [{ unitId: 'mover', target: 'D8' }])

  const mover = world.units.find(u => u.id === 'mover')
  assert.notEqual(mover.position, 'D6', 'mover walked onto the blocker')
  assert.equal(tileDistance(mover.position, 'D6'), 1, 'mover should stop adjacent')
})

test('movement resolves in unit-id order regardless of roster order', () => {
  const spec = (order) => ({
    name: 'ordering', seed: 1,
    units: order.map(id => ({ id, side: id, position: id === 'alpha' ? 'D4' : 'D8', movementRange: 4 })),
    turns: [{ orders: [{ unitId: 'alpha', target: 'D6' }, { unitId: 'beta', target: 'D6' }] }]
  })

  const forward = runScenario(spec(['alpha', 'beta']))
  const reversed = runScenario(spec(['beta', 'alpha']))

  const posOf = (run, id) => run.turns[0].snapshot.units.find(u => u.id === id).position
  assert.equal(posOf(forward, 'alpha'), posOf(reversed, 'alpha'))
  assert.equal(posOf(forward, 'beta'), posOf(reversed, 'beta'))
})

test('orders for unknown or dead units are skipped, not thrown', () => {
  const world = createWorld({ units: [{ id: 'ghost', side: 'red', position: 'D4', strength: 0 }] })
  const results = runMovementPhase(world, [
    { unitId: 'ghost', target: 'D6' },
    { unitId: 'nobody', target: 'D6' }
  ])
  assert.equal(results.find(r => r.unitId === 'ghost').skipped, 'destroyed')
  assert.equal(results.find(r => r.unitId === 'nobody').skipped, 'no such unit')
})

// ── engagement detection ───────────────────────────────────────

test('engagements pair enemies only, never allies', () => {
  const world = createWorld({
    units: [
      { id: 'red_a', side: 'red', position: 'D4' },
      { id: 'red_b', side: 'red', position: 'D5' },
      { id: 'blue_a', side: 'blue', position: 'D6' }
    ]
  })

  const engagements = detectEngagements(world)
  assert.equal(engagements.length, 1)
  assert.deepEqual([engagements[0].aId, engagements[0].bId].sort(), ['blue_a', 'red_b'])
})

test('units out of engagement range do not engage', () => {
  const world = createWorld({
    units: [
      { id: 'red_a', side: 'red', position: 'D4' },
      { id: 'blue_a', side: 'blue', position: 'D20' }
    ]
  })
  assert.equal(detectEngagements(world).length, 0)
})

test('destroyed units stop engaging', () => {
  const world = createWorld({
    units: [
      { id: 'red_a', side: 'red', position: 'D4', strength: 0 },
      { id: 'blue_a', side: 'blue', position: 'D5' }
    ]
  })
  assert.equal(detectEngagements(world).length, 0)
})

// ── casualties and outcome ─────────────────────────────────────

test('casualties never drive strength below zero', () => {
  const world = createWorld({ units: [{ id: 'doomed', side: 'red', position: 'D4', strength: 10, maxStrength: 400 }] })
  const applied = applyCasualties(world, [{ unitId: 'doomed', killed: 9999 }])

  assert.equal(world.units[0].strength, 0)
  assert.equal(applied[0].killed, 10, 'reports what was actually inflicted, not what was asked')
  assert.equal(applied[0].destroyed, true)
})

test('a side with no living units loses', () => {
  const world = createWorld({
    units: [
      { id: 'red_a', side: 'red', position: 'D4', strength: 0 },
      { id: 'blue_a', side: 'blue', position: 'D6', strength: 100 }
    ]
  })
  assert.deepEqual(checkOutcome(world), { decided: true, winner: 'blue', reason: 'enemy destroyed' })
})

test('a run with no resolver produces no casualties', () => {
  const record = runScenario(getScenario('bridge-standoff'))
  const totalCasualties = record.turns.reduce((n, t) => n + t.casualties.length, 0)
  assert.equal(totalCasualties, 0)
  assert.equal(record.combatEnabled, false)
})

// ── resolver contract ──────────────────────────────────────────

test('the runner applies casualties — a resolver that mutates world is not required to', () => {
  let sawWorld = null

  const inspector = ({ engagements, world }) => {
    sawWorld = world
    return { casualties: engagements.map(e => ({ unitId: e.bId, killed: 5 })), events: [] }
  }

  const record = runScenario(getScenario('hill-assault'), { combatResolver: inspector })
  const engagedTurn = record.turns.find(t => t.casualties.length > 0)

  assert.ok(engagedTurn, 'expected at least one turn with casualties')
  assert.equal(engagedTurn.casualties[0].killed, 5)
  assert.ok(sawWorld, 'resolver received the world')
})

test('a resolver returning nothing is tolerated', () => {
  const silent = () => undefined
  assert.doesNotThrow(() => runScenario(getScenario('hill-assault'), { combatResolver: silent }))
})

// ── scenarios ──────────────────────────────────────────────────

test('every scenario brings the two sides into contact', () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    const record = runScenario(scenario)
    const contacted = record.turns.some(t => t.engagements.length > 0)
    assert.ok(contacted, `${name} never produced an engagement`)
  }
})

test('every scenario keeps its units on passable ground', () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    const record = runScenario(scenario)
    for (const turn of record.turns) {
      for (const move of turn.movement) {
        assert.ok(!move.failed, `${name} turn ${turn.turn}: ${move.unitId} — ${move.failed}`)
      }
    }
  }
})

// ── sweeps ─────────────────────────────────────────────────────

test('a sweep runs every seed and tallies the winners', () => {
  const { runs, tally } = sweep(getScenario('hill-assault'), { combatResolver: placeholderResolver, seeds: 10 })
  assert.equal(runs.length, 10)
  const total = Object.values(tally).reduce((a, b) => a + b, 0)
  assert.equal(total, 10)
})

test('a sweep is reproducible', () => {
  const first = sweep(getScenario('ford-crossing'), { combatResolver: placeholderResolver, seeds: 5 })
  const second = sweep(getScenario('ford-crossing'), { combatResolver: placeholderResolver, seeds: 5 })
  assert.deepEqual(first.tally, second.tally)
})
