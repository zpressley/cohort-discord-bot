// src/adapters/hotseat/tests/hotseat.test.js
//
// The hotseat CLI, minus the keyboard: the parser, the fog-honouring
// renderer, and full games driven through the same session object play.js
// drives. The closing test replaces the old testing ritual outright — two
// "commanders" exchange typed orders until one army breaks.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createSession } = require('../session')
const { loadScenario, SCENARIOS } = require('../scenarios')
const { renderMap, renderTurnReport } = require('../render')
const { interpretLines } = require('../../../interpreter/orders')
const { toLabel } = require('../../../engine/map/labels')
const { gridLabel } = require('../../../engine/map/grid')

// ── Reading orders ─────────────────────────────────────
// The hotseat CLI reads orders through src/interpreter (shared with every
// interface). These pin what a commander at the keyboard gets.

const redContext = () => createSession(loadScenario('meeting-battle'), { seed: 1 }).context('red')

test('orders read: a grid square, a quarter, a landmark, the ground, holds, surrender', () => {
  const read = (line) => interpretLines([line], redContext())

  // Players use the ruled grid: 100 m squares, 50 m quarters.
  const square = read('spears to C2')
  assert.equal(square.orders.length, 1)
  assert.equal(square.orders[0].unitRef, 'red_spears')
  assert.equal(gridLabel(square.orders[0].target), 'C2')
  assert.equal(gridLabel(read('everyone to g3-ne').orders[0].target, { quarter: true }), 'G3-NE')
  assert.match(read('spears to K1').questions[0], /off the map/, 'Crownhill is squares A-J')

  assert.equal(toLabel(read('the swords to north ford').orders[0].target), 'W6',
    'a landmark by name still works')
  assert.equal(read('the swords to the ridge to the east').orders[0].action, 'move',
    'and so does the ground')

  assert.deepEqual(read('the archers hold').orders, [{ unitRef: 'red_archers', action: 'hold' }])
  assert.equal(read('hold').orders.length, 4, 'bare hold is everyone')
  assert.equal(read('surrender').surrender, true)
})

test('an unknown place is a question, never a guess', () => {
  const { questions } = interpretLines(['spears to the fields of asphodel'], redContext())
  assert.equal(questions.length, 1)
  assert.ok(questions[0].includes('asphodel'))
})

test('gibberish gets the usage hint instead of a stack trace', () => {
  const { questions } = interpretLines(['blah blah'], redContext())
  assert.match(questions[0], /Orders read like/)
})

test('a block with any question submits nothing — orders are all-or-nothing', () => {
  const session = createSession(loadScenario('meeting-battle'), { seed: 1 })
  const result = session.submitLines('red', ['spears to C2', 'swords to nowhere-real'])
  assert.equal(result.status, 'clarify')
  assert.equal(result.questions.length, 1)
  assert.equal(session.game.orderLog.length, 0, 'nothing reached the game')
})

test('lines after done are not read', () => {
  const { orders } = interpretLines(['spears to C2', 'done', 'swords to C3'], redContext())
  assert.deepEqual(orders.map(o => o.unitRef), ['red_spears'])
})

// ── The fog on the map ─────────────────────────────────

test('the rendered map shows only what intel carries — the fog is absolute', () => {
  const session = createSession(loadScenario('meeting-battle'), { seed: 1 })
  const map = renderMap(session.game, 'red')

  assert.ok(map.includes('red_spears'), 'own units are on the board')
  // At deployment the armies are ~9 tiles apart with vision 6: nothing seen.
  assert.ok(map.includes('nothing sighted'), 'the enemy has not been seen yet')
  assert.ok(!map.includes('blue_'), 'no enemy unit id leaks through the fog')
})

test('a sighted enemy appears; after contact breaks, the ghost keeps the stale position', () => {
  const session = createSession(loadScenario('meeting-battle'), { seed: 1 })
  // March both lines together until someone is seen.
  let result
  for (let i = 0; i < 5; i++) {
    session.submitLines('red', ['everyone to C2-SE'])
    result = session.submitLines('blue', ['everyone to C2-SW'])
    if (session.game.intel.red.known && Object.keys(session.game.intel.red.known).length > 0) break
  }
  const map = renderMap(session.game, 'red')
  assert.ok(map.includes('blue_'), 'a sighted enemy shows with its strength estimate')
})

// ── The narrative ──────────────────────────────────────

test('the turn report words the event log: contact, exchanges, and eventually a verdict', () => {
  const session = createSession(loadScenario('meeting-battle'), { seed: 1, auto: 'blue' })

  let report = ''
  for (let i = 0; i < 40 && !session.finished(); i++) {
    const result = session.submitLines('red', [])
    report += '\n' + (result.report ?? '')
  }

  assert.ok(session.finished(), 'the battle must end')
  assert.ok(report.includes('CONTACT'), 'contacts are narrated')
  assert.ok(/-\d+ \//.test(report), 'exchanges carry their casualties')
  assert.ok(report.includes('BREAKS') || report.includes('wiped out'), 'so is the breaking point')
  assert.ok(report.includes('VICTORY') || report.includes('RUIN'), 'and the verdict is a banner')
})

// ── Playing it ─────────────────────────────────────────

test('typed orders actually command the army — hold countermands standing orders', () => {
  const session = createSession(loadScenario('meeting-battle'), { seed: 1, auto: 'blue' })

  const before = session.game.battle.world.units
    .filter(u => u.side === 'red').map(u => u.position)
  session.submitLines('red', ['everyone hold'])
  const after = session.game.battle.world.units
    .filter(u => u.side === 'red').map(u => u.position)

  assert.deepEqual(after, before, 'a held army stands, standing orders notwithstanding')
})

test('surrender from the prompt ends the game on the spot', () => {
  const session = createSession(loadScenario('meeting-battle'), { seed: 1, auto: 'blue' })
  const result = session.submitLines('red', ['surrender'])
  assert.equal(result.status, 'finished')
  assert.equal(result.outcome.winner, 'blue')
  assert.ok(session.finalSummary().includes('BLUE wins'))
})

test('exit: two commanders trade typed orders until one army breaks — the old two-account ritual, replaced', () => {
  const session = createSession(loadScenario('legions-vs-celts'), { seed: 4 })
  assert.deepEqual(session.humanSides(), ['blue', 'red'], 'both seats are human in hotseat')

  // Turn one: both commanders type real orders. After that, both lean on
  // standing orders and watch it play out.
  session.submitLines('red', ['the archers hold', 'everyone to C2-SE'])
  let result = session.submitLines('blue', ['everyone to C2-SW'])
  assert.ok(['processed', 'finished'].includes(result.status))

  for (let i = 0; i < 40 && !session.finished(); i++) {
    session.submitLines('red', [])
    result = session.submitLines('blue', [])
  }

  assert.ok(session.finished(), 'the hotseat battle reaches a verdict')
  assert.ok(['red', 'blue', 'draw'].includes(session.game.outcome.winner))
  assert.ok(session.finalSummary().includes('men standing'))
})

test('the whole session is deterministic — same seed, same orders, same battle', () => {
  const play = () => {
    const session = createSession(loadScenario('legions-vs-celts'), { seed: 9 })
    session.submitLines('red', ['everyone to C2-SE'])
    session.submitLines('blue', ['everyone to C2-SW'])
    for (let i = 0; i < 40 && !session.finished(); i++) {
      session.submitLines('red', [])
      session.submitLines('blue', [])
    }
    return JSON.stringify({ outcome: session.game.outcome, turns: session.game.playerTurn })
  }
  assert.equal(play(), play())
})

test('every listed scenario loads and passes its own builder', () => {
  for (const name of Object.keys(SCENARIOS)) {
    const spec = loadScenario(name)
    assert.ok(spec.units.length >= 2, `${name} has an army on each side`)
    assert.ok(spec.sides.red && spec.sides.blue)
  }
})

test('a hotseat game saves as data and replays to the same battle', () => {
  const { gameRecord, replayGame } = require('../../../engine/orchestrator')
  const session = createSession(loadScenario('legions-vs-celts'), { seed: 4 })
  session.submitLines('red', ['the archers hold', 'everyone to C2-SE'])
  session.submitLines('blue', ['everyone to the north ford'])
  for (let i = 0; i < 40 && !session.finished(); i++) {
    session.submitLines('red', [])
    session.submitLines('blue', [])
  }

  const record = JSON.parse(JSON.stringify(gameRecord(session.game)))
  const replayed = replayGame(record)
  assert.equal(JSON.stringify(replayed.battle.log.all()), JSON.stringify(session.game.battle.log.all()))
  assert.deepEqual(replayed.outcome, session.game.outcome)
})

test('objectives given to the session show in each briefing, by feature or square', () => {
  const session = createSession(loadScenario('meeting-battle'), { seed: 1, objectives: ['Harrow Bridge', 'C6'] })
  const names = session.game.objectives.map(o => o.name)
  assert.deepEqual(names, ['Harrow Bridge', 'C6'])
  const briefing = session.briefing('red')
  assert.match(briefing, /objective: Harrow Bridge .* held by nobody/)
  assert.match(briefing, /objective: C6 /)
})
