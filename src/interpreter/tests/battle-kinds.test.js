// src/interpreter/tests/battle-kinds.test.js
//
// Orders on a field with several grounds to fight for (ruled 2026-11-25:
// Crownhill's three fords): "take the fords" is all of them, shared out;
// "the north ford" is that one; "the nearest ford" the nearest; "the ford"
// alone asks which. And a pitched battle has no ground to take.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { interpretText } = require('../orders')
const { createBattleStore } = require('../../web/battles')
const { unitName } = require('../../web/battles')

const store = createBattleStore({})
function field(map, kind) {
  const seat = store.muster({ map, opponent: 'standing', side: 'red', faction: 'rome', enemyFaction: 'han', seed: 11, kind }).seats.red
  const game = store.seatOf(seat).entry.game
  const units = game.battle.world.units
  return {
    map: game.battle.map,
    units: units.filter(u => u.side === 'red').map(u => ({ ...u, aliases: [unitName(u).toLowerCase(), ...(u.aliases ?? [])] })),
    enemies: [],
    homeEdge: game.spec.sides.red.homeEdge,
    ground: game.battle.ground,
    groundNeeded: game.spec.objectivesNeeded ?? null,
    lyingInWait: []
  }
}
const fords = field('crownhill', 'ground')
const near = (target, ground) => ground.tiles.some(t => Math.abs(t.x - target.x) + Math.abs(t.y - target.y) <= (ground.reach ?? 0) + 1)

test('"everyone take the fords" shares the army out between as many fords as must be held, the nearest two, and the read-back says where each goes', async () => {
  for (const said of ['everyone take the fords', 'everyone take the ground']) {
    const r = await interpretText(said, fords, {})
    assert.equal(r.questions.length, 0, said)
    assert.equal(r.orders.length, fords.units.length)
    const where = fords.ground.map(g => r.orders.filter(o => near(o.target, g)).length)
    assert.equal(where.filter(n => n > 0).length, 2, `${said}: two fords (${where})`)
    assert.equal(where[0], 0, 'not the North Ford, the farthest')
    assert.ok(Math.abs(where[1] - where[2]) <= 1, 'as evenly as they go')
    for (const name of ['Miller\'s Crossing', 'the South Ford']) assert.match(r.understood[0], new RegExp(`${name}, the ground to fight for`))
  }
})

test('with every ground to hold, "take the fords" shares the army out among all of them', async () => {
  const r = await interpretText('everyone take the fords', { ...fords, groundNeeded: null }, {})
  const where = fords.ground.map(g => r.orders.filter(o => near(o.target, g)).length)
  assert.ok(where.every(n => n >= 1), `${where}`)
})

test('"the north ford" and "millers crossing" are those fords; "the nearest ford" is the nearest', async () => {
  const north = await interpretText('legionaries to the north ford', fords, {})
  assert.ok(near(north.orders[0].target, fords.ground[0]))
  const miller = await interpretText('hastati to millers crossing', fords, {})
  assert.ok(near(miller.orders[0].target, fords.ground[1]))
  const nearest = await interpretText('legionaries to the nearest ford', fords, {})
  assert.equal(nearest.questions.length, 0)
  assert.ok(nearest.orders[0].target)
})

test('"the ford" alone on a field with three fords to fight for asks which, and offers each', async () => {
  const r = await interpretText('legionaries take the ford', fords, {})
  assert.equal(r.orders.length, 0)
  assert.equal(r.questions[0], 'There are three fords to fight for on this field: the North Ford, Miller\'s Crossing and the South Ford. Which do you mean?')
  assert.deepEqual(r.choices[0].options.map(o => o.text), ['North Ford', 'Miller\'s Crossing', 'South Ford'])
})

test('in a pitched battle there is no ground to take: "take the ground" says so', async () => {
  const pitched = field('crownhill', 'pitched')
  assert.deepEqual(pitched.ground, [])
  const r = await interpretText('everyone take the ground', pitched, {})
  assert.equal(r.orders.length, 0)
  assert.match(r.questions[0], /There is no ground to fight for/)
})
