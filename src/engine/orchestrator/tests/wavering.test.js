// src/engine/orchestrator/tests/wavering.test.js
//
// A wavering unit under light shooting calls a free Commander once, not at
// every volley (the second playthrough of November 24, S6: Ashford seed
// 410344, a unit of his at half heart holding the bridge called him four
// times in fifty minutes for a man or two each; docs/DECISIONS.md, "How
// columns, wavering under fire and flight were mended").

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, waitingOn } = require('../orchestrator')
const { FIRE_NEWS } = require('../../combat/tables')

const MAP = { name: 'plain-40', width: 40, height: 20, terrain: {} }
const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 2, y: 2 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'heavy_armor', shield: 'heavy_shield', ...o
})

// Red's Commander with the guard; beside it a second unit, wavering; blue's
// slingers within a sling's throw of both.
function wavering(seed = 3) {
  const game = createGame({
    name: 'wavering', map: MAP, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {},
    units: [unit({ id: 'guard', position: { x: 10, y: 9 } }), unit({ id: 'second', position: { x: 11, y: 8 } }),
      unit({ id: 'slingers', side: 'blue', position: { x: 16, y: 8 }, primaryWeapon: 'sling', armor: 'no_armor', shield: 'no_shield', quality: 'levy' })],
    commanders: { red: { unitId: 'guard' } }
  }, { seed })
  const second = game.battle.world.units.find(u => u.id === 'second')
  game.battle.resolver.shake(second, 100 - (FIRE_NEWS.SHAKEN - 5))
  return game
}

// Both sides hold; the stops that asked red, and why, until `minutes` have run.
function hold(game, minutes, between = () => {}) {
  const asked = []
  let at = 0
  for (let i = 0; i < 200 && !game.outcome.decided && game.minutesElapsed < minutes; i++) {
    for (const side of waitingOn(game)) {
      submitOrders(game, side, side === 'red'
        ? [{ unitRef: 'guard', action: 'hold' }, { unitRef: 'second', action: 'hold' }]
        : [{ unitRef: 'slingers', action: 'hold' }])
    }
    const h = game.history.at(-1)
    at += h.ticks.length * 10
    if (h.wanted?.red) asked.push({ at, why: h.wanted.red })
    between(game, at)
  }
  return asked
}

test('a wavering unit under light shooting calls a free Commander once, not at every volley', () => {
  const game = wavering()
  const asked = hold(game, FIRE_NEWS.QUIET * 10 - 10)
  const volleys = game.battle.log.ofType('volley').filter(v => v.unitId === 'second' || v.unitId === 'guard')
  assert.ok(volleys.length >= 4, `shot at again and again: ${volleys.length}`)
  assert.ok(volleys.every(v => v.killed < FIRE_NEWS.HEAVY * 100), 'and lightly')
  const morale = game.word.red.units.second.morale
  assert.ok(morale <= FIRE_NEWS.SHAKEN, `still wavering: ${morale}`)
  const forFire = asked.filter(a => a.why === 'fire')
  assert.equal(forFire.length, 1, `told once: ${JSON.stringify(asked)}`)
})

test('a wavering unit whose heart falls a further mark under fire calls him again', () => {
  const game = wavering()
  let shaken = false
  const asked = hold(game, FIRE_NEWS.QUIET * 10 - 10, (g, at) => {
    // Once he has been told, the unit's heart falls a mark more.
    if (!shaken && at >= 20) {
      shaken = true
      g.battle.resolver.shake(g.battle.world.units.find(u => u.id === 'second'), FIRE_NEWS.WORSE + 1)
    }
  })
  assert.ok(asked.filter(a => a.why === 'fire').length >= 2, `told again: ${JSON.stringify(asked)}`)
})
