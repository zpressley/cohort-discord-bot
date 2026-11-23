// src/web/tests/asked.test.js
//
// The riders rulings of 2026-11-23, through the server: each Commander is
// asked for orders only when the battle stops for him ("both would only be
// notified when there are commands to give or things happen to them"); he
// notices a unit with no word, he is not told it is cut off ("Notice when
// no word comes back"); and battles saved before play back as they were.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { waitingOn } = require('../../engine/orchestrator')

async function start(store = createBattleStore({})) {
  const server = createServer(store)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const api = async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined
    })
    return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() }
  }
  return { server, base, api, close: () => new Promise(resolve => server.close(resolve)) }
}

// Two Commanders by link: red's army sent far across the field, blue's to
// stand. Turns are run, each side giving orders only when asked, until the
// battle has stopped for one and not the other. (Seeds 5 to 10 found one
// until combat changed with the army balance; the search goes further now.)
async function twoCommanders(app, store) {
  for (let seed = 5; seed <= 40; seed++) {
    const red = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const blue = (await app.api('POST', '/api/commanders', { faction: 'han' })).body.token
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed, commander: red })).body.seats
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue })
    const game = store.seatOf(seats.red).entry.game
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone advance' })
    await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })
    for (let t = 0; t < 30 && !game.outcome.decided; t++) {
      const wanted = waitingOn(game)
      if (wanted.length === 1) return { seats, game, wanted: wanted[0], other: wanted[0] === 'red' ? 'blue' : 'red' }
      for (const side of wanted) await app.api('POST', `/api/seat/${seats[side]}/orders`, { text: '' })
    }
  }
  throw new Error('no battle stopped for one Commander alone')
}

test('between two Commanders, when the battle stops for one only he is asked: the other is not told, nor waited for', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { seats, game, wanted, other } = await twoCommanders(app, store)
    const mine = (await app.api('GET', `/api/seat/${seats[wanted]}`)).body
    const theirs = (await app.api('GET', `/api/seat/${seats[other]}`)).body
    assert.equal(mine.battle.status, 'your-orders')
    assert.equal(theirs.battle.status, 'waiting', 'his orders are with his army')
    // Nothing on his page says the battle stopped: his turn is his own, and
    // no dispatch has come to him for it.
    const before = { turn: theirs.battle.turn, dispatches: theirs.dispatches.length }
    assert.equal(theirs.battle.turn, game.calls[other] + 1)
    assert.notEqual(theirs.battle.turn, game.playerTurn + 1, 'not the battle\'s count of stops')
    // The one asked gives his orders: the battle moves on at once.
    const ran = game.history.length
    const sent = (await app.api('POST', `/api/seat/${seats[wanted]}/orders`, { text: '' })).body
    assert.ok(game.history.length > ran, 'the battle moved on')
    // He is told it ran only if it ran to a stop for him.
    assert.equal(sent.status, waitingOn(game).includes(wanted) || game.outcome.decided ? 'turn-ran' : 'waiting')
    const after = (await app.api('GET', `/api/seat/${seats[other]}`)).body
    if (!waitingOn(game).includes(other) && !game.outcome.decided) {
      assert.deepEqual({ turn: after.battle.turn, dispatches: after.dispatches.length }, before, 'still nothing for him')
    }
  } finally { await app.close() }
})

test('a Commander not asked may still send new orders; they go out when the battle moves on, and he is never waited on', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { seats, game, wanted, other } = await twoCommanders(app, store)
    const changed = (await app.api('POST', `/api/seat/${seats[other]}/orders`, { text: 'everyone hold' })).body
    assert.equal(changed.status, 'waiting')
    assert.deepEqual(waitingOn(game), [wanted], 'his orders did not make him wanted, nor run the battle')
    const logged = game.orderLog.length
    await app.api('POST', `/api/seat/${seats[wanted]}/orders`, { text: '' })
    assert.ok(game.history.length > 0 && game.orderLog.length > logged)
    assert.equal(store.view(seats[other]).pending, null, 'his orders went out with the battle')
  } finally { await app.close() }
})

test('when he is next asked, his dispatch tells everything that reached him since his last orders, not only the last stretch', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { seats, game, wanted, other } = await twoCommanders(app, store)
    const told = store.view(seats[other]).dispatches.length
    const since = game.history.length
    // The one asked keeps the battle going until it stops for the other.
    for (let t = 0; t < 30 && !game.outcome.decided && !waitingOn(game).includes(other); t++) {
      await app.api('POST', `/api/seat/${seats[wanted]}/orders`, { text: '' })
    }
    const tent = store.view(seats[other])
    assert.equal(tent.dispatches.length, told + 1, 'one dispatch')
    const newest = store.seatOf(seats[other]).entry.dispatches[other].at(-1)
    assert.equal(newest.through, game.history.length)
    assert.ok(game.history.length - since >= 1)
    // It covers from the stop he last gave orders at.
    const previous = store.seatOf(seats[other]).entry.dispatches[other].at(-2)
    assert.ok(!previous || previous.through <= since)
  } finally { await app.close() }
})

test('alone against the computer, the battle goes on through the computer\'s own stops: he is asked only for his', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander, faction: 'rome' })).body.seats.red
    const game = store.seatOf(seat).entry.game
    for (let t = 0; t < 6 && !game.outcome.decided; t++) {
      await app.api('POST', `/api/seat/${seat}/orders`, { text: t === 0 ? 'everyone advance' : '' })
      if (!game.outcome.decided) assert.ok(waitingOn(game).includes('red'), 'every request ends on his turn')
      assert.ok(game.history.at(-1).wanted.red || game.outcome.decided)
    }
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.equal(tent.battle.turn, game.calls.red + 1)
  } finally { await app.close() }
})

test('a unit with no word is shown as he knows it: "no word of them since", never "cut off"', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander, faction: 'rome' })).body.seats.red
    const game = store.seatOf(seat).entry.game
    // His ledger says no word of one unit for an hour (by hand, for the test).
    const far = Object.keys(game.word.red.units).find(id => id !== game.battle.commanders.red.unitId)
    Object.assign(game.word.red.units[far], { overdue: true, heard: 0, live: false })
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    const unit = tent.own.find(u => u.id === far)
    assert.equal(unit.word.noWord, true)
    assert.equal(unit.word.cutOff, false)
    assert.equal(unit.word.said, 'no word of them since the battle began')
    assert.ok(!JSON.stringify(tent).includes('cut off'))
  } finally { await app.close() }
})

test('battles saved before the riders rulings load, replay to the same battle, and go on with everyone asked at every stop', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-before-asked-'))
  const from = path.join(__dirname, 'fixtures', 'before-asked')
  fs.cpSync(from, dir, { recursive: true })
  fs.rmSync(path.join(dir, 'expected.json.txt'))
  const expected = JSON.parse(fs.readFileSync(path.join(from, 'expected.json.txt'), 'utf8'))
  const store = createBattleStore({ dir })
  const app = await start(store)
  try {
    const facts = (token) => {
      const game = store.seatOf(token).entry.game
      return {
        outcome: game.outcome, turn: game.playerTurn, minutes: game.minutesElapsed,
        history: game.history.map(h => [h.interrupt, h.ticks.length]),
        units: [...game.battle.world.units, ...game.battle.fledUnits].map(u => [u.id, u.strength, u.position.x, u.position.y])
      }
    }
    assert.deepEqual(facts(expected.seats.solo), expected.games.solo)
    assert.deepEqual(facts(expected.seats.openBlue), expected.games.open)
    const open = store.seatOf(expected.seats.openBlue).entry.game
    assert.equal(open.spec.everyoneAsked, true)
    assert.deepEqual(waitingOn(open).sort(), ['blue', 'red'], 'both are asked, as then')
    // It goes on as it was played: the turn waits for both.
    assert.equal((await app.api('POST', `/api/seat/${expected.seats.openBlue}/orders`, { text: '' })).body.status, 'waiting')
    assert.equal((await app.api('POST', `/api/seat/${expected.seats.openRed}/orders`, { text: '' })).body.status, 'turn-ran')
    assert.ok(open.history.at(-1).ticks.length <= 6, 'within the hour, as then')
  } finally {
    await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a battle saved with the riders rulings is marked so, and plays back with them after a restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-asked-'))
  try {
    const store = createBattleStore({ dir })
    const app = await start(store)
    let seat
    try {
      const commander = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
      seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander, faction: 'rome' })).body.seats.red
      await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone advance' })
    } finally { await app.close() }
    const id = store.seatOf(seat).entry.id
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')).asked, true)
    const again = createBattleStore({ dir })
    const was = store.seatOf(seat).entry.game
    const now = again.seatOf(seat).entry.game
    assert.equal(now.spec.everyoneAsked, undefined)
    assert.deepEqual(now.battle.log.all(), was.battle.log.all())
    assert.deepEqual(now.wanted, was.wanted)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
