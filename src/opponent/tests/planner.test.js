// src/opponent/tests/planner.test.js
//
// The computer's side thinks: it holds good ground or goes to find the
// enemy, keeps a line, and knows only what its side has seen.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { planTurn, temperament, strongpoint, theirGround } = require('../planner')
const { createGame, submitOrders } = require('../../engine/orchestrator')
const { loadScenario, SCENARIOS, mapChoices } = require('../../adapters/hotseat/scenarios')
const { tileDistance } = require('../../engine/world')

const PLAIN = { name: 'plain-24', width: 24, height: 24, terrain: {} }
function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 2 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}
const archers = (o) => unit({ role: 'archers', primaryWeapon: 'greek_composite_bow', armor: 'light_armor', shield: 'no_shield', ...o })
const onThePlain = (units, seed = 1) => createGame({
  name: 'plain', map: PLAIN, seed, turns: [], units,
  sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }
}, { seed })
const order = (orders, id) => orders.find(o => o.unitRef === id)

// The web app's battle on a real map, and a seed whose computer side holds
// (or does not).
const onTheMap = (map, wanted, side = 'blue') => {
  for (let seed = 1; seed < 200; seed++) {
    const spec = { ...loadScenario('meeting-battle', { map, deploy: true }), standingOrders: {} }
    const game = createGame(spec, { seed })
    if (temperament(game, side).holds === wanted) return game
  }
  throw new Error('no such seed')
}

test('the same game gives the same orders, and asking changes nothing', () => {
  const game = onTheMap('crownhill', true)
  const before = JSON.stringify(game.battle.world)
  const once = planTurn(game, 'blue')
  assert.deepEqual(planTurn(game, 'blue'), once)
  assert.equal(JSON.stringify(game.battle.world), before)
  assert.ok(once.length > 0)
})

test('a side that holds takes good ground: foot abreast, archers behind, no one in the water or on another\'s place', () => {
  const game = onTheMap('crownhill', true)
  const map = game.battle.map
  const strong = strongpoint(game, 'blue', { x: -1, y: 0 }, { x: 0, y: -1 })
  assert.ok(strong, 'Crownhill has a crossing ahead of the eastern army')
  const orders = planTurn(game, 'blue')
  const placed = orders.filter(o => o.target)
  assert.equal(placed.length, 4)
  assert.ok(placed.every(o => o.action === 'defend'), 'it goes there to hold')
  assert.equal(new Set(placed.map(o => `${o.target.x},${o.target.y}`)).size, 4, 'each has its own place')
  for (const o of placed) {
    assert.ok(!['river', 'ford', 'bridge', 'marsh'].includes(map.terrainAt(o.target)), `${o.unitRef} forms on dry ground`)
    assert.ok(tileDistance(o.target, strong.anchor) <= 6, `${o.unitRef} is by the strongpoint`)
  }
  // Blue faces west: behind is east, the larger x.
  const x = (id) => order(orders, id).target.x
  assert.ok(x('blue_archers') > Math.min(x('blue_spears'), x('blue_swords')), 'the archers stand behind the foot')
})

test('a side that does not hold goes to find the enemy; one that holds loses patience in the end', () => {
  // (Not by the engine's search at once, as before: first where the enemy
  // would hold, the crossing opposite: opponent/tests/grips.test.js.)
  const seeker = onTheMap('crownhill', false)
  const first = planTurn(seeker, 'blue')
  const theirs = theirGround(seeker, 'blue', { x: -1, y: 0 }, { x: 0, y: -1 })
  assert.ok(first.every(o => o.action === 'move' && tileDistance(o.target, theirs) <= 6), 'no enemy known: it goes to look where he would hold')

  const holder = onTheMap('crownhill', true)
  assert.ok(planTurn(holder, 'blue').some(o => o.action === 'defend'))
  holder.minutesElapsed = temperament(holder, 'blue').patience
  assert.ok(planTurn(holder, 'blue').every(o => o.action !== 'defend'), 'it has waited long enough')
})

test('it knows only what its side has seen', () => {
  // The enemy stands far off, out of sight: nothing in the orders points at
  // him, and moving him changes nothing.
  const build = (enemyAt) => onThePlain([
    unit({ id: 'blue_a', side: 'blue', position: { x: 20, y: 12 } }),
    unit({ id: 'blue_b', side: 'blue', position: { x: 20, y: 13 } }),
    unit({ id: 'red_a', position: enemyAt })
  ])
  const orders = planTurn(build({ x: 3, y: 3 }), 'blue')
  assert.deepEqual(planTurn(build({ x: 3, y: 20 }), 'blue'), orders)
  assert.ok(orders.every(o => !o.target), 'with no one seen it only tells them to go and look')
})

test('when the enemy is close the foot go in together, and the archers stand off behind them', () => {
  const game = onThePlain([
    unit({ id: 'blue_a', side: 'blue', position: { x: 14, y: 12 } }),
    unit({ id: 'blue_b', side: 'blue', position: { x: 14, y: 13 } }),
    archers({ id: 'blue_c', side: 'blue', position: { x: 16, y: 12 } }),
    unit({ id: 'red_a', position: { x: 9, y: 12 } })
  ])
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  const orders = planTurn(game, 'blue')
  assert.deepEqual(orders.map(o => [o.unitRef, o.action]), [['blue_a', 'advance'], ['blue_b', 'advance'], ['blue_c', 'advance']])
})

test('horse go for archers they have seen', () => {
  const game = onThePlain([
    unit({ id: 'blue_a', side: 'blue', position: { x: 14, y: 12 } }),
    unit({ id: 'blue_h', side: 'blue', position: { x: 14, y: 15 }, mounted: true, movementRange: 5 }),
    unit({ id: 'red_a', position: { x: 10, y: 12 } }),
    archers({ id: 'red_c', position: { x: 9, y: 14 } })
  ])
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  const horse = order(planTurn(game, 'blue'), 'blue_h')
  assert.deepEqual([horse.action, horse.target], ['attack', { x: 9, y: 14 }])
})

test('a unit near breaking is pulled out of the fight when a steadier one is beside it, and not when it is alone', () => {
  const fight = (others) => {
    const game = onThePlain([
      unit({ id: 'blue_a', side: 'blue', position: { x: 12, y: 12 } }),
      ...others,
      unit({ id: 'red_a', position: { x: 11, y: 12 } })
    ])
    submitOrders(game, 'red', [{ unitRef: 'red_a', action: 'advance' }])
    submitOrders(game, 'blue', [])
    game.battle.resolver.shake(game.battle.world.units.find(u => u.id === 'blue_a'), 60)
    return order(planTurn(game, 'blue'), 'blue_a')
  }
  assert.equal(fight([unit({ id: 'blue_b', side: 'blue', position: { x: 13, y: 12 } })]).action, 'withdraw')
  assert.equal(fight([]).action, 'advance', 'with no one to cover it, it fights on')
})

test('it plays every map to a verdict against a commander who only holds, and against itself', () => {
  for (const map of mapChoices().map(m => m.id)) for (const scenario of Object.keys(SCENARIOS)) for (const foe of ['hold', 'planner']) {
    const game = createGame({ ...loadScenario(scenario, { map, deploy: true }), standingOrders: {} }, { seed: 5 })
    let turns = 0
    while (!game.outcome.decided && turns < 150) {
      const red = foe === 'planner' ? planTurn(game, 'red') : []
      const blue = planTurn(game, 'blue')
      submitOrders(game, 'red', red)
      submitOrders(game, 'blue', blue)
      turns++
    }
    assert.ok(game.outcome.decided, `${map} ${scenario} against ${foe}: no verdict after ${turns} turns`)
  }
})

test('it goes for the map\'s ground to fight for: a bridge from its own end, a hill or a pass from on it', () => {
  const { groundOf } = require('../../data/maps')
  for (const { id: map } of mapChoices()) {
    const spec = { ...loadScenario('meeting-battle', { map, deploy: true }), standingOrders: {}, objectives: groundOf(map) }
    const game = createGame(spec, { seed: 1 })
    const ground = game.objectives[0]
    for (const [side, forward] of [['red', { x: 1, y: 0 }], ['blue', { x: -1, y: 0 }]]) {
      const { anchor, objective } = strongpoint(game, side, forward, { x: 0, y: 1 })
      assert.equal(objective, true, map)
      const near = Math.min(...ground.tiles.map(t => tileDistance(anchor, t)))
      assert.ok(near <= (ground.reach ?? 0) + 1, `${map} ${side}: the line stands ${near} tiles from ${ground.name}`)
      assert.ok(!['river', 'ford', 'bridge', 'marsh'].includes(game.battle.map.terrainAt(anchor)), `${map} ${side}: not in the water`)
    }
  }
})

test('it does not leave the enemy on the ground to fight for: an enemy seen on it is gone for, one off it is waited for', () => {
  const ground = [{ id: 'ground-1', name: 'the knoll', tiles: [{ x: 12, y: 12 }, { x: 13, y: 12 }] }]
  const blue = [unit({ id: 'b1', side: 'blue', position: { x: 17, y: 12 } }), unit({ id: 'b2', side: 'blue', position: { x: 17, y: 13 } })]
  const game = (redAt) => createGame({
    name: 'plain', map: PLAIN, seed: 1, turns: [], objectives: ground,
    units: [unit({ id: 'r1', position: redAt }), ...blue],
    sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }
  }, { seed: 1 })
  const onIt = planTurn(game({ x: 12, y: 12 }), 'blue')
  assert.ok(onIt.every(o => o.action === 'advance'), JSON.stringify(onIt))
  const offIt = planTurn(game({ x: 6, y: 12 }), 'blue')
  assert.ok(offIt.every(o => o.action === 'defend' || o.action === 'hold'), JSON.stringify(offIt))
})

test('a holding side\'s missile troops on foot press a near enemy, so as to shoot; its line and its horse stand', () => {
  // (Fire and retreat, docs/design/army-balance.md part 7.)
  const game = createGame({
    name: 'plain', map: PLAIN, seed: 1, turns: [],
    objectives: [{ id: 'hold', coord: { x: 15, y: 12 } }],
    units: [
      unit({ id: 'blue_a', side: 'blue', position: { x: 15, y: 12 } }),
      archers({ id: 'blue_c', side: 'blue', position: { x: 17, y: 12 } }),
      archers({ id: 'blue_h', side: 'blue', position: { x: 17, y: 15 }, mounted: true, movementRange: 5 }),
      archers({ id: 'blue_m', side: 'blue', position: { x: 16, y: 10 }, armor: 'medium_armor' }),
      unit({ id: 'red_a', position: { x: 11, y: 12 } })
    ],
    sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }
  }, { seed: 1 })
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', [])
  const orders = planTurn(game, 'blue')
  assert.equal(order(orders, 'blue_c').action, 'advance', 'light foot with bows')
  assert.notEqual(order(orders, 'blue_a')?.action, 'advance', 'the line holds')
  assert.notEqual(order(orders, 'blue_h')?.action, 'advance', 'horse archers keep to the horse')
  assert.equal(order(orders, 'blue_m').action, 'advance', 'crossbowmen in mail too: no kit makes a man slower')
})
