// src/engine/battle/tests/depth.test.js
//
// Orders with depth (November 2026): chains of steps, one condition, and
// what an officer does with the part he lost. On an open 20x20 plain.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleState, stepTurn } = require('../battle')
const { createGame, submitOrders } = require('../../orchestrator')

const MAP = { name: 'depth-20', width: 20, height: 20, terrain: {} }

function unit(overrides = {}) {
  return {
    id: 'u', side: 'red', position: { x: 2, y: 2 },
    strength: 100, maxStrength: 100, movementRange: 3,
    quality: 'professional', primaryWeapon: 'sword_standard',
    armor: 'medium_armor', shield: 'medium_shield',
    ...overrides
  }
}

const SPEC = { name: 'depth', map: MAP, sides: { red: { homeEdge: 'south' }, blue: { homeEdge: 'north' } }, maxTurns: 40 }
const battle = (units, extra = {}) => createBattleState({ ...SPEC, units, ...extra })
const of = (state, type) => state.log.ofType(type)
const get = (state, id) => state.world.units.find(u => u.id === id)
const far = unit({ id: 'foe', side: 'blue', position: { x: 18, y: 1 } })

// ── Chains ─────────────────────────────────────────────

test('a chain is walked step by step: to one place, on to the next, and there it digs in', () => {
  const state = battle([unit({ id: 'swords', position: { x: 3, y: 15 } }), far])
  stepTurn(state, { red: [{ unitRef: 'swords', action: 'move', target: { x: 6, y: 15 }, steps: [{ action: 'defend', target: { x: 6, y: 12 } }] }] })
  assert.deepEqual(get(state, 'swords').position, { x: 6, y: 15 }, 'the first step, three tiles off')
  assert.equal(of(state, 'arrived')[0].more, 1, 'and it says there is more to come')
  stepTurn(state, {}, { sameTurn: true })
  assert.deepEqual(get(state, 'swords').position, { x: 6, y: 12 }, 'the second step, without being told again')
  stepTurn(state, {}, { sameTurn: true })
  stepTurn(state, {})
  assert.deepEqual(state.orderBook.get('swords'), { action: 'hold', target: null, then: null })
})

test('through the game loop: one submission carries the whole chain, and the turn ends when it is done', () => {
  const game = createGame({ ...SPEC, seed: 1, turns: [], units: [unit({ id: 'swords', position: { x: 3, y: 15 } }), far] })
  submitOrders(game, 'red', [{ unitRef: 'swords', action: 'move', target: { x: 6, y: 15 }, steps: [{ action: 'move', target: { x: 6, y: 9 } }] }])
  submitOrders(game, 'blue', [])
  assert.deepEqual(game.battle.world.units.find(u => u.id === 'swords').position, { x: 6, y: 9 })
  assert.equal(game.history[0].interrupt, 'ready')
  assert.equal(game.history[0].ticks.length, 3, 'one tick to the first place, two more to the second')
})

// ── One condition ──────────────────────────────────────

const marchWith = (when, others = []) => {
  const state = battle([unit({ id: 'spears', position: { x: 10, y: 18 } }), ...others])
  const orders = { red: [{ unitRef: 'spears', action: 'move', target: { x: 10, y: 3 }, when }] }
  for (let i = 0; i < 4; i++) stepTurn(state, i === 0 ? orders : {}, { sameTurn: i > 0 })
  return state
}

test('"if you see their horse, hold": the unit stops when it does, and not for anything else', () => {
  const when = { type: 'sees', kind: 'cavalry', do: { action: 'hold' } }
  const horse = unit({ id: 'horse', side: 'blue', position: { x: 10, y: 6 }, mounted: true })
  const foot = unit({ id: 'foot', side: 'blue', position: { x: 10, y: 6 } })

  const seen = marchWith(when, [horse])
  assert.deepEqual(of(seen, 'reacted').map(e => [e.unitId, e.when, e.kind, e.action]), [['spears', 'sees', 'cavalry', 'hold']])
  assert.equal(seen.orderBook.get('spears').action, 'hold')
  assert.ok(get(seen, 'spears').position.y > 7, 'it stopped short of them')

  const notHorse = marchWith(when, [foot])
  assert.equal(of(notHorse, 'reacted').length, 0, 'foot are not what it was told to stop for')
})

test('"if they are at the ford": only an enemy near the place named counts', () => {
  const at = (position) => marchWith({ type: 'sees', near: { x: 10, y: 3 }, do: { action: 'hold' } }, [unit({ id: 'foe', side: 'blue', position })])
  assert.equal(of(at({ x: 11, y: 4 }), 'reacted').length, 1, 'an enemy by the place')
  assert.equal(of(at({ x: 16, y: 12 }), 'reacted').length, 0, 'an enemy seen elsewhere on the way')
})

test('"if you are attacked, fall back" and "if the swords break, fall back"', () => {
  const attacked = battle([
    unit({ id: 'spears', position: { x: 10, y: 10 } }),
    unit({ id: 'foe', side: 'blue', position: { x: 10, y: 8 } })
  ])
  const home = { x: 10, y: 16 }
  stepTurn(attacked, {
    red: [{ unitRef: 'spears', action: 'hold', when: { type: 'attacked', do: { action: 'withdraw', target: home } } }],
    blue: [{ unitRef: 'foe', action: 'advance' }]
  })
  assert.equal(of(attacked, 'reacted').length, 0, 'not before a blow is struck')
  stepTurn(attacked, {})
  stepTurn(attacked, {})
  assert.deepEqual(of(attacked, 'reacted').map(e => e.action), ['withdraw'])

  const friend = battle([unit({ id: 'spears', position: { x: 10, y: 10 } }), unit({ id: 'swords', position: { x: 4, y: 10 } }), far])
  stepTurn(friend, { red: [{ unitRef: 'spears', action: 'hold', when: { type: 'breaks', unitId: 'swords', do: { action: 'withdraw', target: home } } }] })
  assert.equal(of(friend, 'reacted').length, 0)
  friend.broken.add('swords')
  stepTurn(friend, {})
  assert.deepEqual(of(friend, 'reacted').map(e => [e.when, e.action]), [['breaks', 'withdraw']])
})

// ── Officers ───────────────────────────────────────────

// The officer's roll is seeded with the battle, so a seed is looked for
// that gives each outcome; the same seed always gives it again.
function withSeed(build, wanted) {
  for (let seed = 1; seed <= 60; seed++) {
    const state = build(seed)
    if (wanted(state)) return state
  }
  throw new Error('no seed gave the outcome wanted')
}

const chainFor = (officer) => (seed) => {
  const state = createBattleState({
    ...SPEC, units: [unit({ id: 'swords', position: { x: 3, y: 15 }, officer }), unit({ id: 'foe', side: 'blue', position: { x: 12, y: 15 } })]
  }, { seed })
  stepTurn(state, { red: [{ unitRef: 'swords', action: 'move', target: { x: 6, y: 15 }, steps: [{ action: 'move', target: { x: 6, y: 9 } }] }] })
  for (let i = 0; i < 3; i++) stepTurn(state, {}, { sameTurn: true })
  return state
}

test('what an officer keeps is rolled as the order is given, and written down', () => {
  const state = chainFor({ name: 'Marcus', experience: 0, personality: 'cautious' })(1)
  const [roll] = of(state, 'grasp')
  assert.deepEqual([roll.unitId, roll.officer, roll.clauses], ['swords', 'Marcus', 1])
  assert.ok(roll.kept === 0 || roll.kept === 1)
  assert.deepEqual(chainFor({ name: 'Marcus', experience: 0, personality: 'cautious' })(1).log.all(), state.log.all(), 'the same battle again')
})

test('a green officer who lost the next step: the cautious one holds where he is, the bold one goes at the enemy', () => {
  const lost = (state) => of(state, 'grasp')[0].kept === 0

  const cautious = withSeed(chainFor({ name: 'Gaius', experience: 0, personality: 'cautious' }), lost)
  assert.deepEqual(of(cautious, 'lostThread').map(e => [e.unitId, e.officer, e.lost, e.did]), [['swords', 'Gaius', 'steps', 'hold']])
  assert.deepEqual(get(cautious, 'swords').position, { x: 6, y: 15 }, 'he reached the first place and stayed')

  const bold = withSeed(chainFor({ name: 'Brennus', experience: 0, personality: 'bold' }), lost)
  assert.equal(of(bold, 'lostThread')[0].did, 'advance')
  assert.equal(bold.orderBook.get('swords').action, 'advance')
})

test('a veteran carries the same chain through', () => {
  const state = chainFor({ name: 'Quintus', experience: 9, personality: 'steady' })(3)
  assert.equal(of(state, 'grasp')[0].kept, 1)
  assert.equal(of(state, 'lostThread').length, 0)
  assert.deepEqual(get(state, 'swords').position, { x: 6, y: 9 })
})

test('a lost condition: the moment comes and he does not remember; the steady officer marches on', () => {
  const build = (seed) => {
    const state = createBattleState({
      ...SPEC, units: [
        unit({ id: 'spears', position: { x: 10, y: 18 }, officer: { name: 'Titus', experience: 0, personality: 'steady' } }),
        unit({ id: 'horse', side: 'blue', position: { x: 10, y: 6 }, mounted: true })
      ]
    }, { seed })
    stepTurn(state, { red: [{ unitRef: 'spears', action: 'move', target: { x: 10, y: 9 }, when: { type: 'sees', kind: 'cavalry', do: { action: 'hold' } } }] })
    for (let i = 0; i < 3; i++) stepTurn(state, {}, { sameTurn: true })
    return state
  }
  const state = withSeed(build, (s) => of(s, 'grasp')[0].kept === 0)
  assert.deepEqual(of(state, 'lostThread').map(e => [e.lost, e.did]), [['condition', 'carry on']])
  assert.equal(of(state, 'reacted').length, 0)
  assert.deepEqual(get(state, 'spears').position, { x: 10, y: 9 }, 'he went on to where he was first sent')
})
