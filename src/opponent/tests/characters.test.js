// src/opponent/tests/characters.test.js
//
// The computer's Commanders differ in character, not in quality: bold,
// steady and cautious are one planner with some of its numbers set another
// way (planner.js, CHARACTERS). The steady one is the planner as it was.
// Each is drawn from the battle's seed at the muster (commander.js).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { planTurn, characterOf, CHARACTERS, CHARACTER_NAMES, TUNING } = require('../planner')
const { drawCommander, withCommander, commanderOf } = require('../commander')
const { createGame, submitOrders, waitingOn } = require('../../engine/orchestrator')
const { loadScenario } = require('../../adapters/hotseat/scenarios')
const { fieldFactions } = require('../../engine/army/factions')
const { assignOfficers } = require('../../engine/command/roster')
const { groundOf } = require('../../data/maps')
const { NAMES } = require('../../data/officers')

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
const onThePlain = (units, character) => createGame({
  name: 'plain', map: PLAIN, seed: 1, turns: [], units,
  sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east', ...(character ? { character } : {}) } }
}, { seed: 1 })
const order = (orders, id) => orders.find(o => o.unitRef === id)

// A whole battle, the computer on both sides, every order given recorded.
function battleOrders(sides) {
  let spec = fieldFactions(loadScenario('meeting-battle', { map: 'ashford', deploy: true }), { red: 'rome', blue: 'sarmatia' })
  spec = { ...spec, standingOrders: {}, objectives: groundOf('ashford'), sides: { red: { ...spec.sides.red, ...sides.red }, blue: { ...spec.sides.blue, ...sides.blue } } }
  const game = createGame(spec, { seed: 7 })
  const given = []
  for (let stops = 0; stops < 600 && !game.outcome.decided; stops++) {
    for (const side of ['red', 'blue']) {
      if (game.outcome.decided || !waitingOn(game).includes(side)) continue
      const orders = planTurn(game, side)
      given.push(orders)
      submitOrders(game, side, orders)
    }
  }
  return { given, outcome: game.outcome }
}

test('a battle that names no character is played by the steady Commander, who is the planner as it was', () => {
  assert.deepEqual(
    [CHARACTERS.steady.engage, CHARACTERS.steady.pullOut, CHARACTERS.steady.prey, CHARACTERS.steady.horseAt, CHARACTERS.steady.horseInReserve],
    [TUNING.ENGAGE, TUNING.PULL_OUT, 10, 'archers', false])
  const none = battleOrders({ red: {}, blue: {} })
  const steady = battleOrders({ red: { character: 'steady' }, blue: { character: 'steady' } })
  assert.deepEqual(steady, none)
  assert.equal(characterOf({ spec: { sides: { blue: { character: 'no such man' } } } }, 'blue'), CHARACTERS.steady, 'one not known is steady')
})

test('a character is the one planner with its numbers set another way: every character sets the same numbers', () => {
  assert.deepEqual(CHARACTER_NAMES, ['steady', 'bold', 'cautious'])
  for (const name of CHARACTER_NAMES) assert.deepEqual(Object.keys(CHARACTERS[name]).sort(), Object.keys(CHARACTERS.steady).sort(), name)
  const bold = battleOrders({ red: { character: 'bold' }, blue: { character: 'cautious' } })
  assert.ok(bold.outcome.decided, 'a battle between them ends')
})

test('a bold Commander\'s horse ride at any enemy they see; a steady one\'s only at missile troops', () => {
  const field = (character) => onThePlain([
    unit({ id: 'blue_a', side: 'blue', position: { x: 16, y: 12 } }),
    unit({ id: 'blue_h', side: 'blue', position: { x: 14, y: 15 }, mounted: true, movementRange: 5 }),
    unit({ id: 'red_a', position: { x: 8, y: 15 } })
  ], character)
  const go = (character) => {
    const game = field(character)
    submitOrders(game, 'red', [])
    submitOrders(game, 'blue', [])
    return order(planTurn(game, 'blue'), 'blue_h')
  }
  assert.deepEqual([go('bold').action, go('bold').target], ['attack', { x: 8, y: 15 }])
  assert.notEqual(go('steady').action, 'attack')
})

test('a cautious Commander keeps his horse back off the line\'s flank until his line is fighting; a steady one sends them in with the line', () => {
  const go = (character) => {
    const game = onThePlain([
      unit({ id: 'blue_a', side: 'blue', position: { x: 14, y: 12 } }),
      unit({ id: 'blue_b', side: 'blue', position: { x: 14, y: 13 } }),
      unit({ id: 'blue_h', side: 'blue', position: { x: 14, y: 16 }, mounted: true, movementRange: 5 }),
      unit({ id: 'red_a', position: { x: 10, y: 12 } })
    ], character)
    submitOrders(game, 'red', [])
    submitOrders(game, 'blue', [])
    return planTurn(game, 'blue')
  }
  assert.equal(order(go('steady'), 'blue_h').action, 'advance')
  assert.equal(order(go('cautious'), 'blue_a').action, 'advance', 'his line goes in')
  assert.notEqual(order(go('cautious'), 'blue_h').action, 'advance', 'his horse wait')
})

test('a cautious Commander lets the enemy come closer before his line goes in; a bold one goes in from further off', () => {
  const go = (character, gap) => {
    const game = onThePlain([
      unit({ id: 'blue_a', side: 'blue', position: { x: 16, y: 12 } }),
      unit({ id: 'blue_b', side: 'blue', position: { x: 16, y: 13 } }),
      // Scouts see 10 tiles (map/sight.js), the rest 6.
      unit({ id: 'blue_s', side: 'blue', role: 'scouts', position: { x: 16, y: 14 } }),
      unit({ id: 'red_a', position: { x: 16 - gap, y: 12 } })
    ], character)
    submitOrders(game, 'red', [])
    submitOrders(game, 'blue', [])
    return order(planTurn(game, 'blue'), 'blue_a').action === 'advance'
  }
  // Within its distance the line goes in at once; beyond it, it forms up
  // short of the enemy first.
  assert.deepEqual(['bold', 'steady', 'cautious'].map(c => go(c, 5)), [true, true, true])
  assert.deepEqual(['bold', 'steady', 'cautious'].map(c => go(c, 6)), [true, true, false])
  assert.deepEqual(['bold', 'steady', 'cautious'].map(c => go(c, 8)), [true, false, false])
})

test('a cautious Commander pulls a worn unit out of the fight sooner, and a bold one fights on longer', () => {
  const pulled = (character, morale) => {
    const game = onThePlain([
      unit({ id: 'blue_a', side: 'blue', position: { x: 12, y: 12 } }),
      unit({ id: 'blue_b', side: 'blue', position: { x: 13, y: 12 } }),
      unit({ id: 'red_a', position: { x: 11, y: 12 } })
    ], character)
    submitOrders(game, 'red', [{ unitRef: 'red_a', action: 'advance' }])
    submitOrders(game, 'blue', [])
    const worn = game.battle.world.units.find(u => u.id === 'blue_a')
    game.battle.resolver.shake(worn, game.battle.resolver.getState('blue_a').morale - morale)
    return order(planTurn(game, 'blue'), 'blue_a').action === 'withdraw'
  }
  assert.deepEqual(['bold', 'steady', 'cautious'].map(c => pulled(c, 40)), [false, false, true])
  assert.deepEqual(['bold', 'steady', 'cautious'].map(c => pulled(c, 25)), [false, true, true])
})

test('the computer\'s Commander is drawn from the seed: the same seed the same man, named as his army\'s officers are and never as one of them', () => {
  let spec = fieldFactions(loadScenario('meeting-battle', { map: 'crownhill', deploy: true }), { red: 'rome', blue: 'carthage' })
  spec = { ...spec, units: assignOfficers(spec.units, 3) }
  assert.deepEqual(drawCommander(spec, 'blue', 3), drawCommander(spec, 'blue', 3))
  const seen = new Set()
  for (let seed = 1; seed <= 60; seed++) {
    const them = drawCommander({ ...spec, units: assignOfficers(spec.units, seed) }, 'blue', seed)
    seen.add(them.character)
    assert.ok(NAMES['Carthaginian Empire'].includes(them.name))
  }
  assert.deepEqual([...seen].sort(), ['bold', 'cautious', 'steady'], 'each character comes up')
  const made = withCommander(spec, 'blue', 3)
  const them = commanderOf(made, 'blue')
  assert.ok(!made.units.filter(u => u.side === 'blue').some(u => u.officer.name === them.name))
  assert.deepEqual(commanderOf(withCommander(spec, 'blue', 99, them), 'blue'), them, 'the day before\'s man is kept')
  assert.equal(commanderOf(spec, 'blue'), null)
})

test('drawing the computer\'s Commander changes nothing else drawn from the seed', () => {
  const spec = fieldFactions(loadScenario('meeting-battle', { map: 'crownhill', deploy: true }), { red: 'rome', blue: 'carthage' })
  const made = withCommander(spec, 'blue', 3)
  assert.deepEqual(made.units, spec.units)
  assert.deepEqual(made.sides.red, spec.sides.red)
})
