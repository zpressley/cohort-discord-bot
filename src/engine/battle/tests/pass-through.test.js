// src/engine/battle/tests/pass-through.test.js
//
// Units of one side share a tile and pass through one another (direction
// of October 21, 2026, "Stacking"; ruled again November 28, 2026: "Units
// were supposed to be able to overlap and pass through one another", and
// "Only friendly units can do that"). What limits a tile is the crowding
// table and its cap (tables.CROWDING), on a ford or bridge as anywhere.
// An enemy's tile is never entered: two sides meet and fight.
// docs/DECISIONS.md, "How sharing a tile and passing through were restored".

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { toLabel } = require('../../map/labels')
const { createWorld } = require('../../world')
const { resolveSimultaneousMovement } = require('../../movement')
const { createMap } = require('../../map/map')
const { CROWDING } = require('../../combat/tables')

const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 1, y: 4 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
const labels = (tiles) => tiles.map(([x, y]) => toLabel({ x, y }))
const at = (state, id) => state.world.units.find(u => u.id === id)?.position
const sides = { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }

// A road through a wood, west to east, along row 4.
const road = []; const forest = []
for (let x = 0; x < 30; x++) {
  for (let y = 0; y < 9; y++) (y === 4 ? road : forest).push([x, y])
}
const WOOD = { name: 'wood-road', width: 30, height: 9, terrain: { road: labels(road), forest: labels(forest) } }

// Where a unit gets to alone in one turn, from a start, on a map.
const alone = (map, from, target) => {
  const state = createBattleState({ name: 'alone', map, sides, units: [unit({ id: 'going', position: from }), unit({ id: 'far', side: 'blue', position: { x: 29, y: 0 } })] }, { seed: 1 })
  stepTurn(state, { red: [{ unitRef: 'going', target }] })
  return at(state, 'going')
}

test('units of one side pass through one another on the march: a friend standing on the road does not stop a unit going by, nor slow it while the tile is not packed', () => {
  // 50 men standing and 100 going by: 150 on the tile, "crowded", which
  // costs no movement (tables.CROWDING).
  const state = createBattleState({
    name: 'through', map: WOOD, sides,
    units: [unit({ id: 'holding', position: { x: 4, y: 4 }, strength: 50, maxStrength: 50 }), unit({ id: 'going', position: { x: 2, y: 4 } }),
      unit({ id: 'far', side: 'blue', position: { x: 29, y: 0 } })]
  }, { seed: 1 })
  stepTurn(state, { red: [{ unitRef: 'holding', action: 'hold' }, { unitRef: 'going', target: { x: 20, y: 4 } }] })
  assert.deepEqual(at(state, 'going'), alone(WOOD, { x: 2, y: 4 }, { x: 20, y: 4 }), 'as far as it goes alone')
  assert.ok(at(state, 'going').x > 4, 'through him and beyond')
  assert.deepEqual(at(state, 'holding'), { x: 4, y: 4 })
  assert.equal(state.log.ofType('halted').length, 0, 'no one halted')
})

test('units sent along one road at the same time do not wait for one another: they share its tiles', () => {
  // Two half-strength units: 100 men on a tile, not crowded at all.
  const half = { strength: 50, maxStrength: 50 }
  const state = createBattleState({
    name: 'together', map: WOOD, sides,
    units: [unit({ id: 'one', position: { x: 2, y: 4 }, ...half }), unit({ id: 'two', position: { x: 1, y: 4 }, ...half }),
      unit({ id: 'far', side: 'blue', position: { x: 29, y: 0 } })]
  }, { seed: 1 })
  stepTurn(state, { red: [{ unitRef: 'one', target: { x: 26, y: 4 } }, { unitRef: 'two', target: { x: 26, y: 4 } }] })
  assert.deepEqual(at(state, 'two'), alone(WOOD, { x: 1, y: 4 }, { x: 26, y: 4 }), 'the second goes as far as it would alone')
})

test('two units of one side marching opposite ways along one road pass through each other', () => {
  const state = createBattleState({
    name: 'passing', map: WOOD, sides,
    units: [unit({ id: 'east', position: { x: 5, y: 4 } }), unit({ id: 'west', position: { x: 9, y: 4 } }),
      unit({ id: 'far', side: 'blue', position: { x: 29, y: 0 } })]
  }, { seed: 1 })
  stepTurn(state, { red: [{ unitRef: 'east', target: { x: 16, y: 4 } }, { unitRef: 'west', target: { x: 1, y: 4 } }] })
  for (let t = 0; t < 4; t++) stepTurn(state, {})
  assert.deepEqual(at(state, 'east'), { x: 16, y: 4 })
  assert.deepEqual(at(state, 'west'), { x: 1, y: 4 })
})

// A brook down column 10, crossed by one ford on row 4.
const brook = []
for (let y = 0; y < 9; y++) if (y !== 4) brook.push([10, y])
const BROOK = { name: 'brook', width: 24, height: 9, terrain: { river: labels(brook), ford: labels([[10, 4]]) } }

test('a ford holds as many men as any tile, and pays for crowding as any tile does', () => {
  // One unit holds the ford; a second is sent onto it, a third through it:
  // the second stands beside the first on the ford, the third goes over.
  const state = createBattleState({
    name: 'brook', map: BROOK, sides,
    units: [unit({ id: 'holding', position: { x: 10, y: 4 } }), unit({ id: 'joining', position: { x: 8, y: 4 } }), unit({ id: 'crossing', position: { x: 7, y: 4 } }),
      unit({ id: 'far', side: 'blue', position: { x: 23, y: 8 } })]
  }, { seed: 1 })
  stepTurn(state, { red: [{ unitRef: 'holding', action: 'hold' }, { unitRef: 'joining', target: { x: 10, y: 4 } }, { unitRef: 'crossing', target: { x: 16, y: 4 } }] })
  for (let t = 0; t < 4; t++) stepTurn(state, {})
  assert.deepEqual(at(state, 'holding'), { x: 10, y: 4 })
  assert.deepEqual(at(state, 'joining'), { x: 10, y: 4 }, 'two units on the ford at once')
  assert.deepEqual(at(state, 'crossing'), { x: 16, y: 4 }, 'and a third through them and over')
  assert.equal(state.log.ofType('halted').length, 0, 'no one halted at the ford')

  // A step onto the ford with 200 friends on it is a step onto 300 men,
  // critical: it costs twice the ford's own cost (move 0.5), the same as
  // onto any tile so crowded.
  const map = createMap({ name: 'one-ford', width: 7, height: 3, cells: { D2: { terrain: 'ford' } }, terrain: { river: ['D1', 'D3'] } })
  const go = (others) => {
    const world = createWorld({ units: [unit({ id: 'mover', position: 'B2', movementRange: 4 }), ...others] })
    return resolveSimultaneousMovement(world, [{ unitId: 'mover', target: 'G2' }, ...others.map(o => ({ unitId: o.id, target: 'hold' }))], map)
      .find(r => r.unitId === 'mover')
  }
  const free = go([])
  const packed = go([unit({ id: 'standing', position: 'D2', strength: 200, maxStrength: 200 })])
  assert.ok(packed.tilesMoved >= 2, 'it still goes onto the ford')
  assert.ok(packed.tilesMoved < free.tilesMoved, `slowed by the press there: ${packed.tilesMoved} tiles against ${free.tilesMoved}`)
  assert.equal(CROWDING.TIERS.find(t => t.name === 'critical').move, 0.5)
})

test('a tile at the cap is full, ford or not: no unit goes onto it while the men there stay', () => {
  const map = createMap({ name: 'one-ford', width: 7, height: 3, cells: { D2: { terrain: 'ford' } }, terrain: { river: ['D1', 'D3'] } })
  const world = createWorld({ units: [unit({ id: 'mover', position: 'B2' }), unit({ id: 'full', position: 'D2', strength: CROWDING.CAP - 50, maxStrength: CROWDING.CAP })] })
  const move = resolveSimultaneousMovement(world, [{ unitId: 'mover', target: 'G2' }, { unitId: 'full', target: 'hold' }], map).find(r => r.unitId === 'mover')
  assert.equal(toLabel(move.to), 'C2', 'up to the ford and no further: 250 there and 100 more is over the 300 cap')
})

test('the crowding table is Zach\'s density table quartered for 25 m tiles, with the movement losses of October 29 and a cap of 300 men a tile', () => {
  assert.equal(CROWDING.CAP, 300)
  assert.deepEqual(CROWDING.TIERS.map(t => [t.name, t.upTo, t.combat]),
    [['organized', 100, 0], ['crowded', 150, 1], ['compressed', 200, 2], ['crushing', 250, 3], ['critical', 300, 4]])
  assert.deepEqual(CROWDING.TIERS.map(t => t.move), [0, 0, 0.1, 0.25, 0.5])
  assert.ok(CROWDING.TIERS.find(t => t.name === 'critical').morale > 0, 'critical costs heart too')
})

test('a unit going at an enemy may still step in beside a friend already fighting him', () => {
  const OPEN = { name: 'open-30', width: 30, height: 12, terrain: {} }
  const state = createBattleState({
    name: 'open', map: OPEN, sides, standingOrders: { blue: 'advance' },
    units: [unit({ id: 'fighting', position: { x: 10, y: 5 } }), unit({ id: 'coming', position: { x: 8, y: 5 } }),
      unit({ id: 'foe', side: 'blue', position: { x: 11, y: 5 }, strength: 200, maxStrength: 200 })]
  }, { seed: 1 })
  stepTurn(state, { red: [{ unitRef: 'fighting', action: 'hold' }, { unitRef: 'coming', action: 'attack', enemy: 'foe' }] })
  const foe = at(state, 'foe')
  const coming = at(state, 'coming')
  assert.ok(Math.abs(coming.x - foe.x) + Math.abs(coming.y - foe.y) <= 1 || state.log.ofType('contact').some(e => [e.aId, e.bId].includes('coming')), `it joined the fight: ${JSON.stringify(coming)}`)
})

test('a unit never shares a tile with, or passes through, an enemy unit: two sides marching at each other along one road meet, and fight', () => {
  // Red goes at the enemy; blue only marches west, and would walk on past
  // if the way were open. On a road through a wood there is no way past.
  const state = createBattleState({
    name: 'head-on', map: WOOD, sides,
    units: [unit({ id: 'r1', position: { x: 3, y: 4 } }), unit({ id: 'r2', position: { x: 2, y: 4 } }),
      unit({ id: 'b1', side: 'blue', position: { x: 12, y: 4 } }), unit({ id: 'b2', side: 'blue', position: { x: 13, y: 4 } })]
  }, { seed: 1 })
  const orders = {
    red: ['r1', 'r2'].map(id => ({ unitRef: id, action: 'attack', target: { x: 25, y: 4 } })),
    blue: ['b1', 'b2'].map(id => ({ unitRef: id, target: { x: 0, y: 4 } }))
  }
  for (let t = 0; t < 6; t++) {
    stepTurn(state, t === 0 ? orders : {})
    const living = state.world.units.filter(u => u.strength > 0)
    for (const r of living.filter(u => u.side === 'red')) {
      for (const b of living.filter(u => u.side === 'blue')) {
        assert.ok(!(r.position.x === b.position.x && r.position.y === b.position.y), `${r.id} and ${b.id} on one tile after ten minutes ${t + 1}`)
        if (!state.broken.has(r.id) && !state.broken.has(b.id)) assert.ok(r.position.x < b.position.x, `${r.id} got past ${b.id} after ten minutes ${t + 1}`)
      }
    }
  }
  assert.ok(state.log.ofType('contact').length > 0, 'they met and fought')
})
