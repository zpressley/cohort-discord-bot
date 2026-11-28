// src/harness/tests/camps.test.js
//
// Camp battles as a whole (engine/battle/camp.js, harness/camps.js), and a
// battle without camps run exactly as before they existed. The fingerprints
// are of whole event logs, the same battles as follow-unchanged.test.js,
// taken from main before camps (d3eb86e).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders } = require('../../engine/orchestrator')
const { planTurn } = require('../../opponent/planner')
const { loadScenario } = require('../../adapters/hotseat/scenarios')
const { fieldFactions } = require('../../engine/army/factions')
const { play } = require('../camps')

function fingerprint(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16)
}

// Retaken with follow-unchanged.test.js when the kinds of battle mended
// ties between the sides (main at e9949dc); camps changed none of them.
// Retaken again when units of one side were let share a tile and pass
// through one another (ruled November 28; docs/DECISIONS.md, "How sharing
// a tile and passing through were restored"). They were 24ae0710 16 (greywater rome germania 5), dcef9521 44 (ravenridge thrace sarmatia 4), 192f4dc9 32 (thornwood macedon parthia 3).
const BEFORE = {
  'thornwood macedon parthia 3': '118333b6 24',
  'ravenridge thrace sarmatia 4': '535e7ced 15',
  'greywater rome germania 5': '7f743ff6 12'
}

test('a battle without camps runs exactly as before camps, event for event', () => {
  const now = {}
  for (const key of Object.keys(BEFORE)) {
    const [field, red, blue, seed] = key.split(' ')
    const spec = fieldFactions(loadScenario('meeting-battle', { map: field, deploy: true }), { red, blue })
    const game = createGame({ ...spec, standingOrders: {} }, { seed: Number(seed) })
    for (let t = 0; t < 150 && !game.outcome.decided; t++) {
      submitOrders(game, 'red', planTurn(game, 'red'))
      submitOrders(game, 'blue', planTurn(game, 'blue'))
    }
    assert.ok(game.battle.log.all().every(e => !e.type.startsWith('camp') && e.type !== 'nightPassed'))
    now[key] = `${fingerprint(JSON.stringify(game.battle.log.all()))} ${game.battle.turn}`
  }
  assert.deepEqual(now, BEFORE)
})

test('every camp battle on Greywater ends, and each army pitches its camp in the first hours', () => {
  for (const [faction, seed] of [['rome', 1], ['parthia', 2], ['celts', 3], ['han', 4]]) {
    const r = play(faction, faction, seed, { mode: 'mirror', character: null, against: null })
    assert.equal(r.decided, true, `${faction} ${seed} ended`)
    assert.ok(r.days <= 7)
    assert.deepEqual([...new Set(r.pitched)].sort(), ['blue', 'red'])
    for (const side of ['red', 'blue']) assert.ok(r.pitchedAt[side] * 10 <= 180, `${side} pitched by the third hour`)
  }
})

test('the computer pitches its camp by its character: a bold Commander forward, a cautious one behind, a steady one between', () => {
  const where = (character) => {
    const spec = fieldFactions(loadScenario('meeting-battle', { map: 'greywater', deploy: true }), { red: 'rome', blue: 'rome' })
    const game = createGame({ ...spec, standingOrders: {}, camps: true, sides: { ...spec.sides, red: { ...spec.sides.red, character } } }, { seed: 1 })
    const pitch = planTurn(game, 'red').find(o => o.action === 'pitch')
    return pitch.target.x
  }
  const [bold, steady, cautious] = ['bold', 'steady', 'cautious'].map(where)
  // The west army faces east: forward is a greater x.
  assert.ok(bold > steady && steady > cautious, `bold ${bold}, steady ${steady}, cautious ${cautious}`)
})

test('the computer guards its pitched camp, and sends its horse for the enemy\'s once it has found it', () => {
  const spec = fieldFactions(loadScenario('meeting-battle', { map: 'greywater', deploy: true }), { red: 'parthia', blue: 'parthia' })
  const red = spec.units.filter(u => u.side === 'red')
  const at = { ...red[0].position }
  const game = createGame({ ...spec, standingOrders: {}, camps: { red: { at }, blue: { at: { x: 66, y: 38 } } } }, { seed: 1 })
  game.battle.campSeen = { red: { at: { x: 66, y: 38 }, status: 'pitched', turn: 0 } }
  const orders = planTurn(game, 'red')
  assert.ok(orders.some(o => (o.action === 'defend' && o.target.x === at.x && o.target.y === at.y) || o.action === 'hold'), 'a guard at the camp')
  const horse = red.filter(u => u.mounted).map(u => u.id)
  assert.ok(horse.length > 0)
  assert.ok(orders.filter(o => o.action === 'attack' && o.target.x === 66).some(o => horse.includes(o.unitRef)), 'the horse go for the enemy camp')
})
