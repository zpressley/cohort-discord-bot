// src/web/tests/night.test.js
//
// The end of the day, through the server. Ruled 2026-11-24: "No the day
// just ends the battle, you can choose to fight again the next day."

const { test } = require('node:test')
const assert = require('node:assert/strict')

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
  return { api, close: () => new Promise(resolve => server.close(resolve)) }
}

// Hold until night: a day of two turns.
async function untilNight(app, store, seats) {
  const game = store.seatOf(Object.values(seats)[0]).entry.game
  for (let i = 0; i < 20 && !game.outcome.decided; i++) {
    for (const side of waitingOn(game)) if (seats[side]) await app.api('POST', `/api/seat/${seats[side]}/orders`, { text: 'everyone hold' })
  }
  return game
}

test('when night ends a battle against the computer, you are offered to fight again the next day against the same enemy, and your army comes as it stands', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander, map: 'ashford', enemyFaction: 'han', turnLimit: 2 })).body
    const game = await untilNight(app, store, made.seats)
    assert.equal(game.outcome.reason, 'night fell')
    const tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.equal(tent.verdict.night.again, 'Fight again the next day')
    assert.equal(tent.verdict.night.next, null)
    // The dispatch says it plainly.
    assert.match(tent.dispatches[0].lines.join('\n'), /Night has ended the fighting, and neither side has won/)
    // Nobody is credited with a win or a loss; the battle counts.
    const before = (await app.api('GET', `/api/commander/${commander}`)).body
    assert.equal(before.battles, 1)
    const again = await app.api('POST', `/api/seat/${made.seats.red}/again`)
    assert.equal(again.status, 201)
    assert.match(again.body.title, /^Ashford Vale: Rome against Han, day 2$/)
    const next = store.seatOf(again.body.token).entry
    assert.equal(next.game.spec.map, 'ashford')
    assert.equal(next.auto, 'blue', 'against the computer again')
    assert.ok(next.game.spec.units.filter(u => u.side === 'blue').every(u => u.faction === 'han'), 'the same enemy')
    assert.equal(next.commanders.red, store.commanders.get(commander).id, 'led by the same Commander')
    // Asked again, the same battle: it is made once.
    assert.equal((await app.api('POST', `/api/seat/${made.seats.red}/again`)).body.token, again.body.token)
    assert.equal((await app.api('GET', `/api/seat/${made.seats.red}`)).body.verdict.night.next, again.body.token)
  } finally { await app.close() }
})

test('only a battle night ended can be fought again the next day', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3 })).body.seats.red
    assert.equal((await app.api('POST', `/api/seat/${seat}/again`)).status, 409)
    assert.equal((await app.api('GET', `/api/seat/${seat}`)).body.verdict, null)
  } finally { await app.close() }
})

test('between two friends, the next day is one battle: each is given his own seat in it, and each Commander leads his side again', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const blue = (await app.api('POST', '/api/commanders', { faction: 'han' })).body.token
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 5, commander: red, turnLimit: 2 })).body.seats
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue })
    const game = await untilNight(app, store, seats)
    assert.equal(game.outcome.reason, 'night fell')
    // Blue asks first; red, coming later, finds his seat in it.
    const theirs = (await app.api('POST', `/api/seat/${seats.blue}/again`)).body
    const next = store.seatOf(theirs.token).entry
    assert.equal(store.seatOf(theirs.token).side, 'blue')
    assert.equal(next.joining, null, 'no one has to choose again')
    assert.deepEqual(next.commanders, { red: store.commanders.get(red).id, blue: store.commanders.get(blue).id })
    const tent = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.equal(tent.verdict.night.next, next.seats.red)
    // Each is shown only his own seat.
    assert.ok(!JSON.stringify(tent).includes(next.seats.blue))
  } finally { await app.close() }
})
