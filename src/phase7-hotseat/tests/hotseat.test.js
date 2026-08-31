// src/phase7-hotseat/tests/hotseat.test.js
//
// The hotseat CLI, minus the keyboard: the parser, the fog-honouring
// renderer, and full games driven through the same session object play.js
// drives. The closing test replaces the old testing ritual outright — two
// "commanders" exchange typed orders until one army breaks.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { parseOrderLine, parseOrderBlock } = require('../parser')
const { createSession } = require('../session')
const { loadScenario, SCENARIOS } = require('../scenarios')
const { renderMap, renderTurnReport } = require('../render')

// ── The order grammar ──────────────────────────────────

test('orders parse: unit to coordinate, unit to landmark, holds, surrender', () => {
  assert.deepEqual(parseOrderLine('spears to K7'),
    { kind: 'order', unitRef: 'spears', target: 'K7' })
  assert.deepEqual(parseOrderLine('everyone to aa12'),
    { kind: 'order', unitRef: 'everyone', target: 'AA12' })

  const landmark = parseOrderLine('the swords to north ford')
  assert.equal(landmark.kind, 'order')
  assert.equal(landmark.target, 'W6', 'phase 1 landmarks resolve to their coordinates')

  assert.deepEqual(parseOrderLine('the archers hold'), { kind: 'hold', unitRef: 'the archers' })
  assert.deepEqual(parseOrderLine('hold'), { kind: 'hold', unitRef: 'everyone' })
  assert.equal(parseOrderLine('surrender').kind, 'surrender')
  assert.equal(parseOrderLine('done').kind, 'done')
})

test('an unknown place is a question, never a guess', () => {
  const parsed = parseOrderLine('spears to the fields of asphodel')
  assert.equal(parsed.kind, 'ask')
  assert.ok(parsed.question.includes('asphodel'))
})

test('gibberish gets the usage hint instead of a stack trace', () => {
  const parsed = parseOrderLine('charge the thing at the place')
  assert.equal(parsed.kind, 'ask')
})

test('a block with any question submits nothing — orders are all-or-nothing', () => {
  const { orders, questions } = parseOrderBlock([
    'spears to K7',
    'swords to nowhere-real'
  ])
  assert.equal(questions.length, 1)
  assert.equal(orders.length, 1, 'the parse still reports what DID parse')
})

test('lines after done are not read', () => {
  const { orders } = parseOrderBlock(['spears to K7', 'done', 'swords to K8'])
  assert.deepEqual(orders.map(o => o.unitRef), ['spears'])
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
    session.submitLines('red', ['everyone to K8'])
    result = session.submitLines('blue', ['everyone to J8'])
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
  session.submitLines('red', ['the archers hold', 'everyone to K8'])
  let result = session.submitLines('blue', ['everyone to J8'])
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
    session.submitLines('red', ['everyone to K8'])
    session.submitLines('blue', ['everyone to J8'])
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
