// src/opponent/tests/grips.test.js
//
// Two armies led by the computer come to grips (docs/DECISIONS.md, "How
// armies were made to come to grips"): an army of horse holds its ground on
// it, a unit going in across a ford steps into the water, and a side that
// knows nothing of the enemy goes where he should come, waits a while (as
// long as its Commander's nerve), then where he would hold.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { planTurn, meetingPlace, theirGround, strongpoint, CHARACTERS, TUNING } = require('../planner')
// (In the engine since, for every unit: engine/battle/crossing.js.)
const { intoTheCrossing } = require('../../engine/battle/crossing')
const { createGame, submitOrders, waitingOn } = require('../../engine/orchestrator')
const { loadScenario, mapChoices } = require('../../adapters/hotseat/scenarios')
const { fieldFactions } = require('../../engine/army/factions')
const { leadUnit } = require('../../engine/command/company')
const { byCommandPost } = require('../../engine/command/messengers')
const { resolveMap } = require('../../engine/map/map')
const { tileDistance } = require('../../engine/world')
const { groundOf } = require('../../data/maps')

const WEST = { x: -1, y: 0 }
const DOWN = { x: 0, y: -1 }

test('an army with no foot holds the ground to fight for on it, with its horse, and takes the field from a player who gives no orders', () => {
  // (Ravenridge, Mongolia's horse against Rome, seed 181: they stood beside
  // Raven Gap, off the flank of a line that was not there, until night.)
  const spec = fieldFactions(loadScenario('meeting-battle', { map: 'ravenridge', deploy: true }), { red: 'rome', blue: 'mongolia' })
  const mine = spec.units.filter(u => u.side === 'red')
  const game = createGame({ ...spec, standingOrders: {}, dayMinutes: 720, objectives: groundOf('ravenridge'), commanders: { red: { unitId: mine[leadUnit(mine)].id } } }, { seed: 181 })
  for (let stops = 0; stops < 200 && !game.outcome.decided; stops++) {
    if (waitingOn(game).includes('red')) submitOrders(game, 'red', [])
    if (!game.outcome.decided && waitingOn(game).includes('blue')) submitOrders(game, 'blue', byCommandPost(planTurn(game, 'blue')))
  }
  assert.equal(game.outcome.winner, 'blue')
  assert.equal(game.outcome.reason, 'objectives held')
})

test('a unit going in at an enemy just across a ford steps into the ford, not along the bank first', () => {
  // Ashford's Ash Ford is x 19, rows 5 to 7. (Rome and Han there, seeds 1
  // and 2: crowded on one tile each, they stepped along either bank and had
  // no march left for the water, up and down for ever.)
  const map = resolveMap('ashford')
  const unit = { position: { x: 20, y: 6 } }
  const across = { e: { position: { x: 18, y: 5 } }, d: tileDistance({ x: 20, y: 6 }, { x: 18, y: 5 }) }
  const step = intoTheCrossing(map, unit, across.e.position)
  assert.ok(step, 'it steps into the crossing')
  assert.equal(map.terrainAt(step), 'ford')
  assert.equal(tileDistance(step, unit.position), 1)
  const sameBank = { e: { position: { x: 22, y: 6 } }, d: 2 }
  assert.equal(intoTheCrossing(map, unit, sameBank.e.position), null, 'an enemy on its own bank is pressed as before')
  const farOff = { e: { position: { x: 12, y: 6 } }, d: 8 }
  assert.equal(intoTheCrossing(map, unit, farOff.e.position), null, 'nor one further off than tables.CROSSING.NEAR')
})

test('two armies led by the computer on either side of the ford come to grips, where they paced the banks to the turn limit', () => {
  for (const seed of [1, 2]) {
    const spec = fieldFactions(loadScenario('meeting-battle', { map: 'ashford', deploy: true }), { red: 'rome', blue: 'han' })
    const game = createGame({ ...spec, standingOrders: {} }, { seed })
    let turns = 0
    for (; turns < 150 && !game.outcome.decided; turns++) {
      const red = planTurn(game, 'red')
      const blue = planTurn(game, 'blue')
      submitOrders(game, 'red', red)
      submitOrders(game, 'blue', blue)
    }
    assert.ok(game.outcome.decided, `seed ${seed}: undecided after ${turns} turns`)
    assert.ok(game.battle.log.ofType('contact').length > 0, `seed ${seed}: they came to blows`)
    assert.ok(game.minutesElapsed <= 720, `seed ${seed}: over well before night (${game.minutesElapsed} min)`)
  }
})

// Ashford with blue formed up already at the meeting place: there from the
// start.
function atTheBridge(character) {
  const spec = { ...loadScenario('meeting-battle', { map: 'ashford', deploy: true }), standingOrders: {} }
  const game0 = createGame(spec, { seed: 1 })
  const { anchor } = meetingPlace(game0, 'blue', WEST, DOWN, CHARACTERS.steady)
  const units = spec.units.map((u, i) => (u.side === 'blue' ? { ...u, position: { x: anchor.x + 1, y: anchor.y - 1 + (i % 3) } } : u))
  return createGame({ ...spec, units, sides: { ...spec.sides, blue: { ...spec.sides.blue, character } } }, { seed: 1 })
}

test('knowing nothing of the enemy, it goes to the map\'s ground between the armies and waits there a while: a bold Commander half as long, a cautious one half as long again', () => {
  const game = createGame({ ...loadScenario('meeting-battle', { map: 'ashford', deploy: true }), standingOrders: {} }, { seed: 1 })
  const going = meetingPlace(game, 'blue', WEST, DOWN, CHARACTERS.steady)
  assert.ok(going && going.wait === false, 'not there yet: it marches there')
  assert.ok(tileDistance(going.anchor, { x: 20, y: 20 }) <= 3, 'by the Old Mill Bridge')
  assert.ok(!['bridge', 'river', 'ford'].includes(resolveMap('ashford').terrainAt(going.anchor)), 'on dry ground')
  for (const [name, minutes] of [['steady', TUNING.MEET_WAIT], ['bold', TUNING.MEET_WAIT / 2], ['cautious', TUNING.MEET_WAIT * 1.5]]) {
    const there = atTheBridge(name)
    there.minutesElapsed = minutes - 10
    assert.equal(meetingPlace(there, 'blue', WEST, DOWN, CHARACTERS[name])?.wait, true, `${name}: still waiting at ${minutes - 10} min`)
    there.minutesElapsed = minutes
    assert.equal(meetingPlace(there, 'blue', WEST, DOWN, CHARACTERS[name]), null, `${name}: gone to look at ${minutes} min`)
  }
})

test('ground to fight for off to a side of the field (the Crownhill) is no meeting place', () => {
  const game = createGame({ ...loadScenario('meeting-battle', { map: 'crownhill', deploy: true }), standingOrders: {} }, { seed: 1 })
  assert.equal(meetingPlace(game, 'blue', WEST, DOWN, CHARACTERS.steady), null)
})

test('it looks next where the enemy would hold: the good ground it would choose itself from his side of the field', () => {
  for (const map of ['crownhill', 'ashford', 'ravenridge']) {
    const game = createGame({ ...loadScenario('meeting-battle', { map, deploy: true }), standingOrders: {} }, { seed: 1 })
    const guess = theirGround(game, 'blue', WEST, DOWN)
    const his = strongpoint(game, 'red', { x: 1, y: 0 }, DOWN)
    assert.ok(guess && his, map)
    assert.ok(tileDistance(guess, his.anchor) <= 2, `${map}: looks at ${JSON.stringify(guess)}, he would hold ${JSON.stringify(his.anchor)}`)
  }
  // Never where he truly stands: the guess is the same wherever he is.
  const spec = { ...loadScenario('meeting-battle', { map: 'ashford', deploy: true }), standingOrders: {} }
  const moved = { ...spec, units: spec.units.map(u => (u.side === 'red' ? { ...u, position: { x: 2, y: 2 } } : u)) }
  assert.deepEqual(theirGround(createGame(moved, { seed: 1 }), 'blue', WEST, DOWN), theirGround(createGame(spec, { seed: 1 }), 'blue', WEST, DOWN))
})

test('every map has a meeting place or the enemy\'s ground to look at, so no army searches blind from the start', () => {
  for (const { id: map } of mapChoices()) {
    const game = createGame({ ...loadScenario('meeting-battle', { map, deploy: true }), standingOrders: {} }, { seed: 1 })
    for (const [side, forward] of [['red', { x: 1, y: 0 }], ['blue', WEST]]) {
      const somewhere = meetingPlace(game, side, forward, DOWN, CHARACTERS.steady) ?? theirGround(game, side, forward, DOWN)
      assert.ok(somewhere, `${map} ${side}`)
    }
  }
})
