// src/engine/command/tests/initiative.test.js
//
// Officers who act on their Commander's intent when out of contact
// (command/initiative.js; docs/design/point-of-view-and-messengers.md,
// "What comes after"): veterans and above, cut off, when things have
// plainly changed, by their nature; told to the Commander only when a rider
// gets through, in the officer's report.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { initiative, actsAlone } = require('../initiative')
const { INITIATIVE } = require('../../combat/tables')
const { createGame, submitOrders, gameRecord, replayGame, waitingOn } = require('../../orchestrator/orchestrator')
const { arrivalOf } = require('../../orchestrator/word')
const { report } = require('../../../narrator/turnNarrator')

const vet = (personality, more = {}) => ({ name: 'Tullus', experience: 14, personality, ...more })
const seen = (o) => ({ changed: [], enemyInSight: true, goodGround: false, bled: false, intent: null, running: false, ...o })

// ── The rule ──

test('an officer below veteran never acts on his own, however things change', () => {
  for (const experience of [4, 8, 12]) {
    assert.equal(actsAlone(vet('bold', { experience })), false)
    assert.equal(initiative(vet('bold', { experience }), seen({ changed: ['attacked', 'groundLost'] })), null)
  }
  assert.equal(actsAlone({ headless: true }), false)
  assert.equal(actsAlone(vet('bold', { experience: 13 })), true, 'veteran at 13 battles')
  assert.equal(actsAlone(vet('cautious', { experience: 25 })), true, 'and legendary')
})

test('a disaffected veteran does not act on his own: he carries on with what he has', () => {
  assert.equal(initiative(vet('bold', { loyalty: 10 }), seen({ changed: ['groundLost'] })), null)
})

test('nothing changed, nothing done: a cut-off veteran with no reason carries on', () => {
  assert.equal(initiative(vet('bold'), seen({ changed: [] })), null)
})

test('a bold veteran goes for the ground being lost; else at the enemy he can see', () => {
  assert.deepEqual(initiative(vet('bold'), seen({ changed: ['attacked', 'groundLost'] })), { why: 'groundLost', did: 'ground' })
  assert.deepEqual(initiative(vet('bold'), seen({ changed: ['done'] })), { why: 'done', did: 'advance' })
  assert.deepEqual(initiative(vet('bold'), seen({ changed: ['quarryGone'], enemyInSight: false })), { why: 'quarryGone', did: 'hold' })
})

test('a cautious veteran holds good ground; on open ground he falls back toward his Commander', () => {
  assert.deepEqual(initiative(vet('cautious'), seen({ changed: ['attacked'], goodGround: true })), { why: 'attacked', did: 'hold' })
  assert.deepEqual(initiative(vet('cautious'), seen({ changed: ['attacked'] })), { why: 'attacked', did: 'fall back' })
  assert.deepEqual(INITIATIVE.GOOD_GROUND, ['hill', 'forest'])
})

test('a steady veteran finishes what he was sent to do; when it is done or cannot be done, he holds', () => {
  assert.equal(initiative(vet('steady'), seen({ changed: ['groundLost'], running: true })), null)
  assert.equal(initiative(vet('steady'), seen({ changed: ['attacked'], running: true })), null)
  assert.deepEqual(initiative(vet('steady'), seen({ changed: ['quarryGone'] })), { why: 'quarryGone', did: 'hold' })
  assert.deepEqual(initiative(vet('steady'), seen({ changed: ['done'] })), { why: 'done', did: 'hold' })
})

test('a veteran who looks to his men falls back to save them when half are down or the men about him have broken', () => {
  assert.deepEqual(initiative(vet('bold', { values: 'survival' }), seen({ changed: ['attacked'], bled: true })), { why: 'bled', did: 'fall back' })
  assert.deepEqual(initiative(vet('bold', { values: 'survival' }), seen({ changed: ['friendsBroke'] })), { why: 'friendsBroke', did: 'fall back' })
  assert.deepEqual(initiative(vet('bold', { values: 'glory' }), seen({ changed: ['friendsBroke'] })), { why: 'friendsBroke', did: 'advance' })
})

test('a veteran told to stand stands when attacked or when the enemy comes in sight: that is his intent', () => {
  for (const intent of ['hold', 'defend', 'hide', 'ambush']) {
    assert.equal(initiative(vet('bold'), seen({ changed: ['attacked'], intent })), null)
    assert.equal(initiative(vet('cautious'), seen({ changed: ['done'], intent })), null)
  }
  assert.deepEqual(initiative(vet('bold'), seen({ changed: ['groundLost'], intent: 'hold' })), { why: 'groundLost', did: 'ground' }, 'but not while the ground is lost')
})

test('a loyal veteran reads his Commander\'s intent as a steady one does', () => {
  assert.equal(initiative(vet('bold', { loyalty: 90 }), seen({ changed: ['groundLost'], running: true })), null)
  assert.deepEqual(initiative(vet('cautious', { loyalty: 90 }), seen({ changed: ['done'] })), { why: 'done', did: 'hold' })
})

// ── In a battle ──

const MAP = { name: 'plain-40', width: 40, height: 20, terrain: {} }
const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 2, y: 10 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
// The Commander with the guard at the west edge; a unit far off (26 tiles)
// behind a wall of the enemy that no rider can get through; an enemy scout
// within its sight, standing.
const wall = () => Array.from({ length: 10 }, (_, i) => unit({ id: `wall${i}`, side: 'blue', position: { x: 16, y: i * 2 + 1 } }))
const spec = (officer, { walled = true, commanders = { red: { unitId: 'guard' } } } = {}) => ({
  name: 'initiative', map: MAP, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {},
  units: [unit({ id: 'guard' }), unit({ id: 'far', position: { x: 28, y: 10 }, officer }),
    unit({ id: 'scout', side: 'blue', position: { x: 33, y: 10 } }), ...(walled ? wall() : [])],
  ...(commanders ? { commanders } : {})
})
const blueHolds = (game) => game.battle.world.units.filter(u => u.side === 'blue').map(u => ({ unitRef: u.id, action: 'hold' }))
// Red gives no orders; the computer holds; until the battle stops for red.
const wait = (game) => {
  submitOrders(game, 'red', [])
  for (let i = 0; i < 50 && !game.outcome.decided && !waitingOn(game).includes('red'); i++) submitOrders(game, 'blue', blueHolds(game))
}
// Each side gives orders when the battle stops for it, until `done`.
const until = (game, done, blue) => {
  for (let i = 0; i < 40 && !done() && !game.outcome.decided; i++) submitOrders(game, waitingOn(game).includes('red') ? 'red' : 'blue', waitingOn(game).includes('red') ? [] : blue())
}
const own = (game) => game.battle.log.all().filter(e => e.type === 'initiative')

test('a bold veteran cut off, his orders done and the enemy in sight, goes at the enemy of his own judgement', () => {
  const game = createGame(spec(vet('bold')), { seed: 1 })
  wait(game)
  const [e] = own(game)
  assert.deepEqual({ unitId: e.unitId, officer: e.officer, why: e.why, did: e.did }, { unitId: 'far', officer: 'Tullus', why: 'done', did: 'advance' })
  assert.equal(own(game).length, 1, 'once: he does not choose the same thing twice')
})

test('he waits twenty minutes with no rider getting through before he uses his head', () => {
  const game = createGame(spec(vet('bold')), { seed: 1 })
  wait(game)
  assert.equal(INITIATIVE.WAIT, 2)
  assert.equal(own(game)[0].turn, INITIATIVE.WAIT, 'cut off from the first ten minutes; acts in the second')
})

test('a cautious veteran cut off on open ground falls back toward where his Commander was when he last had word', () => {
  const game = createGame(spec(vet('cautious')), { seed: 1 })
  wait(game)
  const [e] = own(game)
  assert.equal(e.did, 'fall back')
  assert.deepEqual(e.to, { x: 2, y: 10 }, 'the guard, where the Commander rode as the battle began')
})

test('a veteran a rider can reach obeys his orders as before, and never acts on his own', () => {
  const game = createGame(spec(vet('bold'), { walled: false }), { seed: 1 })
  wait(game)
  wait(game)
  assert.deepEqual(own(game), [])
})

test('below veteran, an officer cut off carries on as before', () => {
  const game = createGame(spec(vet('bold', { experience: 10 })), { seed: 1 })
  wait(game)
  wait(game)
  assert.deepEqual(own(game), [])
  assert.equal(game.battle.orderBook.get('far'), undefined, 'still no order: he stands where he was put')
})

test('the computer\'s side, with no Commander on the field, has no officers acting on their own', () => {
  const game = createGame(spec(vet('bold'), { commanders: null }), { seed: 1 })
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', blueHolds(game))
  submitOrders(game, 'red', [])
  submitOrders(game, 'blue', blueHolds(game))
  assert.deepEqual(own(game), [])
})

test('the Commander hears what his officer did only when a rider gets through, in the officer\'s own report', () => {
  const game = createGame(spec(vet('bold')), { seed: 1 })
  wait(game)
  const [e] = own(game)
  assert.equal(arrivalOf(game, 'red', e), Infinity, 'cut off: no word of it yet')
  // The wall goes; riders get through again.
  for (const w of wall()) game.battle.world.units.find(u => u.id === w.id).position = { x: 39, y: w.position.y }
  wait(game)
  const heard = arrivalOf(game, 'red', e)
  assert.ok(heard > e.turn && heard <= game.battle.turn, 'with the first report from his unit that reaches him')
  const lines = report({ map: game.battle.map, ownIds: new Set(['guard', 'far']), seenEnemyIds: new Set(), events: [e] })
  assert.deepEqual(lines, ['Tullus of far, with no word from you, advanced on the enemy, his orders done and the enemy in sight'])
  // The enemy is never told.
  assert.deepEqual(report({ map: game.battle.map, ownIds: new Set(['scout']), seenEnemyIds: new Set(['far']), events: [e] }), [])
})

test('a cautious officer falling back is told as his own judgement, in the words of the orders', () => {
  const game = createGame(spec(vet('cautious')), { seed: 1 })
  wait(game)
  const lines = report({ map: game.battle.map, ownIds: new Set(['guard', 'far']), seenEnemyIds: new Set(), events: own(game) })
  assert.deepEqual(lines, ['Tullus of far, with no word from you, fell back toward you, his orders done and the enemy in sight'])
})

test('an officer\'s own choice comes out the same when a saved battle is played back', () => {
  const game = createGame(spec(vet('bold')), { seed: 3 })
  wait(game)
  wait(game)
  const again = replayGame(JSON.parse(JSON.stringify(gameRecord(game))))
  assert.ok(own(game).length > 0)
  assert.deepEqual(again.battle.log.all(), game.battle.log.all())
})

test('an order that reaches him again is obeyed, whatever he chose on his own', () => {
  const game = createGame(spec(vet('bold')), { seed: 1 })
  submitOrders(game, 'red', [])
  for (let i = 0; i < 10 && own(game).length === 0; i++) submitOrders(game, 'blue', blueHolds(game))
  assert.equal(game.battle.orderBook.get('far')?.action, 'advance', 'his own choice')
  // The wall goes; the Commander, unasked, sends him an order to hold.
  for (const w of wall()) game.battle.world.units.find(u => u.id === w.id).position = { x: 39, y: w.position.y }
  submitOrders(game, 'red', [{ unitRef: 'far', action: 'hold' }])
  for (let i = 0; i < 10 && !game.battle.log.all().some(e => e.type === 'riderSent'); i++) submitOrders(game, 'blue', blueHolds(game))
  for (let i = 0; i < 10 && game.battle.riders.some(r => r.unitId === 'far'); i++) {
    if (waitingOn(game).includes('red')) submitOrders(game, 'red', [])
    else submitOrders(game, 'blue', blueHolds(game))
  }
  assert.equal(game.battle.orderBook.get('far')?.action, 'hold')
  assert.equal(own(game).length, 1, 'in touch, he does as he is told')
})

test('a bold veteran cut off who sees the enemy take ground to fight for goes to take it back', () => {
  const base = spec(vet('bold'))
  const game = createGame({ ...base, units: base.units.map(u => u.id === 'scout' ? { ...u, position: { x: 36, y: 10 } } : u), objectives: [{ id: 'knoll', name: 'the knoll', coord: { x: 33, y: 10 } }] }, { seed: 1 })
  until(game, () => own(game).length > 0, () => [...blueHolds(game).filter(o => o.unitRef !== 'scout'), { unitRef: 'scout', target: { x: 33, y: 10 } }])
  const [e] = own(game)
  assert.deepEqual({ why: e.why, did: e.did, ground: e.ground }, { why: 'groundLost', did: 'ground', ground: 'the knoll' })
  assert.deepEqual(game.battle.orderBook.get('far')?.target, { x: 33, y: 10 })
  assert.deepEqual(report({ map: game.battle.map, ownIds: new Set(['far']), seenEnemyIds: new Set(), events: [e] }),
    ['Tullus of far, with no word from you, attacked to take the knoll back when he saw the enemy take the knoll'])
})

test('a veteran who looks to his men, cut off, falls back when the men about him break', () => {
  const base = spec(vet('steady', { values: 'survival' }))
  // A friend beside him; the enemy scout stands off in sight.
  const friend = unit({ id: 'friend', position: { x: 28, y: 12 } })
  const game = createGame({ ...base, units: [...base.units, friend] }, { seed: 1 })
  until(game, () => game.battle.turn >= 3, () => blueHolds(game))
  assert.deepEqual(own(game), [], 'steady, his orders done: he holds, as he was')
  // The friend breaks (as if struck from beyond his sight).
  game.battle.broken.add('friend')
  game.battle.log.emit('rout', game.battle.turn, { unitId: 'friend', by: 'scout' })
  until(game, () => own(game).length > 0, () => blueHolds(game))
  assert.deepEqual(own(game).map(e => [e.why, e.did]), [['friendsBroke', 'fall back']])
})
