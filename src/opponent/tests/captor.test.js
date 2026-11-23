// src/opponent/tests/captor.test.js
//
// The computer as the captor of a Commander: its answer to his offer is
// one seeded roll, weighing what is offered against how the battle is
// going for it.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, gameRecord } = require('../../engine/orchestrator/orchestrator')
const { captorAnswer } = require('../captor')

const MAP = { name: 'plain-20', width: 20, height: 20, terrain: {} }
const unit = (o) => ({
  side: 'red', strength: 100, maxStrength: 100, movementRange: 3, quality: 'professional',
  primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
function held(seed, { hurt = 0, seen = [] } = {}) {
  const game = createGame({
    name: 'captor', map: MAP, sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } }, maxTurns: 40,
    commanders: { red: { unitId: 'guard' } },
    units: [
      unit({ id: 'guard', position: { x: 2, y: 2 } }), unit({ id: 'line', position: { x: 2, y: 18 } }), unit({ id: 'reserve', position: { x: 4, y: 18 } }),
      unit({ id: 'foe', side: 'blue', position: { x: 18, y: 2 } }), unit({ id: 'foe2', side: 'blue', position: { x: 18, y: 4 } })
    ]
  }, { seed })
  Object.assign(game.battle.commanders.red, { status: 'held', heldBy: 'foe' })
  for (const id of seen) game.intel.blue.known[id] = { status: 'ghost', strength: 100, position: { x: 2, y: 18 } }
  game.battle.world.units.find(u => u.id === 'foe2').strength = 100 - hurt * 2
  return game
}

test('the computer answers an offer the same way every time for the same battle, and the answer is in the record', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const game = held(seed)
    submitOrders(game, 'red', { offer: { units: ['line'] } })
    const answer = captorAnswer(game, 'blue')
    const twin = held(seed)
    submitOrders(twin, 'red', { offer: { units: ['line'] } })
    assert.deepEqual(captorAnswer(twin, 'blue'), answer, 'the same battle, the same answer')
    submitOrders(game, 'blue', { answer })
    // Played back from its record (taken by hand here, so by hand again).
    const again = held(seed)
    for (const e of gameRecord(game).orderLog) submitOrders(again, e.side, e.orders)
    assert.deepEqual([again.parley, again.outcome], [game.parley, game.outcome])
  }
})

test('the computer is unpredictable: the same offer is taken in some battles and not in others', () => {
  const kinds = new Set()
  for (let seed = 1; seed <= 60; seed++) {
    const game = held(seed, { seen: ['line', 'reserve'] })
    submitOrders(game, 'red', { offer: { units: [] } })
    const a = captorAnswer(game, 'blue')
    kinds.add(a.accept ? 'accept' : a.more ? 'more' : 'refuse')
  }
  assert.deepEqual([...kinds].sort(), ['accept', 'more', 'refuse'])
})

test('it takes more offers when more is offered, and when the battle has cost it more of its men', () => {
  const taken = (offer, hurt) => {
    let n = 0
    for (let seed = 1; seed <= 300; seed++) {
      const game = held(seed, { hurt })
      submitOrders(game, 'red', { offer: { units: offer } })
      if (captorAnswer(game, 'blue').accept) n++
    }
    return n
  }
  const field = taken([], 0)
  assert.ok(taken(['line', 'reserve'], 0) > field + 30, 'two units against the field alone')
  assert.ok(taken([], 40) > field + 20, 'a captor that has lost men')
  assert.ok(field > 0 && field < 100, `the field alone, from a captor that has lost no one, is a long shot (${field} of 300)`)
})

test('asking for more, it names only units of his it has seen', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const blind = held(seed)
    submitOrders(blind, 'red', { offer: { units: [] } })
    assert.equal(captorAnswer(blind, 'blue').more, undefined, 'it has seen nothing to ask for')
    const game = held(seed, { seen: ['reserve'] })
    submitOrders(game, 'red', { offer: { units: [] } })
    const a = captorAnswer(game, 'blue')
    if (a.more) assert.deepEqual(a.more.units, ['reserve'])
  }
  assert.equal(captorAnswer(held(1), 'blue'), null, 'no offer, no answer')
})
