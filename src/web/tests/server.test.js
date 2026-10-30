// src/web/tests/server.test.js
//
// The web app's server, through its HTTP API: muster, the Command Tent's
// view, read-back, orders, turns, two players by link, saved battles
// surviving a restart, and fog of war held on the server.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')

async function start(store = createBattleStore({})) {
  const server = createServer(store)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const api = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    })
    return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() }
  }
  return { server, base, api, close: () => new Promise(resolve => server.close(resolve)) }
}

test('muster alone: one seat, the tent opens on your orders', async () => {
  const app = await start()
  try {
    const { status, body } = await app.api('POST', '/api/battles', { scenario: 'meeting-battle', opponent: 'standing', side: 'red', seed: 3 })
    assert.equal(status, 201)
    assert.deepEqual(Object.keys(body.seats), ['red'], 'no link for the standing orders')

    const tent = (await app.api('GET', `/api/seat/${body.seats.red}`)).body
    assert.equal(tent.battle.side, 'red')
    assert.equal(tent.battle.status, 'your-orders')
    assert.equal(tent.battle.opponent, 'standing')
    assert.equal(tent.map.width, 40)
    assert.equal(tent.map.terrain.length, 40)
    assert.ok(tent.own.length > 0 && tent.own.every(u => u.name && u.at && u.order))
  } finally { await app.close() }
})

test('read back, then send: alone, the turn runs at once and a dispatch arrives', async () => {
  const app = await start()
  try {
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red' })).body.seats.red
    const read = (await app.api('POST', `/api/seat/${token}/read`, { text: 'spears to the ridge to the east' })).body
    assert.equal(read.questions.length, 0)
    assert.match(read.understood[0], /^Spears: move The Crownhill/)

    const asked = (await app.api('POST', `/api/seat/${token}/orders`, { text: 'spears to the ridge' })).body
    assert.equal(asked.status, 'clarify', 'a question sends nothing')
    assert.equal((await app.api('GET', `/api/seat/${token}`)).body.battle.turn, 1)

    const sent = (await app.api('POST', `/api/seat/${token}/orders`, { text: 'everyone advance' })).body
    assert.equal(sent.status, 'turn-ran')
    const tent = (await app.api('GET', `/api/seat/${token}`)).body
    assert.equal(tent.battle.turn, 2)
    assert.equal(tent.dispatches.length, 1)
    assert.ok(tent.dispatches[0].lines.length > 0)
  } finally { await app.close() }
})

test('two players by link: the turn waits for both, and orders can change until it runs', async () => {
  const app = await start()
  try {
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red' })).body.seats
    assert.deepEqual(Object.keys(seats).sort(), ['blue', 'red'])

    const first = (await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone hold' })).body
    assert.equal(first.status, 'waiting')
    let red = (await app.api('GET', `/api/seat/${seats.red}/summary`)).body
    assert.equal(red.status, 'waiting')
    assert.match((await app.api('GET', `/api/seat/${seats.red}`)).body.pending.text, /hold/)

    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone advance' })
    const blue = (await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })).body
    assert.equal(blue.status, 'turn-ran')
    red = (await app.api('GET', `/api/seat/${seats.red}/summary`)).body
    assert.equal(red.status, 'your-orders')
    assert.equal(red.turn, 2)

    const listed = (await app.api('GET', `/api/seats?tokens=${seats.red},${seats.blue},nonsense`)).body
    assert.deepEqual(listed.map(s => s.side), ['red', 'blue'])
  } finally { await app.close() }
})

test('fog of war is held on the server: a side never receives an enemy it has not seen', async () => {
  const app = await start()
  try {
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 5 })).body.seats
    const raw = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.deepEqual(raw.enemies, [], 'nothing seen yet')
    assert.equal(JSON.stringify(raw).includes('blue_'), false, 'not a single enemy id anywhere in the answer')
  } finally { await app.close() }
})

test('a battle survives the server stopping', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-web-'))
  try {
    let app = await start(createBattleStore({ dir }))
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 9 })).body.seats.red
    await app.api('POST', `/api/seat/${token}/orders`, { text: 'everyone advance' })
    const before = (await app.api('GET', `/api/seat/${token}`)).body
    await app.close()

    app = await start(createBattleStore({ dir }))
    const after = (await app.api('GET', `/api/seat/${token}`)).body
    assert.deepEqual(after.own, before.own, 'the same army, rebuilt from the order log')
    assert.deepEqual(after.dispatches, before.dispatches)
    await app.close()
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('unknown links, bad requests and paths outside the app are refused', async () => {
  const app = await start()
  try {
    assert.equal((await app.api('GET', '/api/seat/not-a-real-token')).status, 404)
    assert.equal((await app.api('GET', '/static/..%2fbattles.js')).status, 404)
    assert.equal((await app.api('GET', '/themes/..%2f..%2fbattles.js')).status, 404)
    assert.doesNotMatch((await app.api('GET', '/static/../battles.js')).body, /createBattleStore/, 'never the server source')
    const res = await fetch(app.base + '/api/battles', { method: 'POST', body: '{nope', headers: { 'Content-Type': 'application/json' } })
    assert.equal(res.status, 400)
    const page = await app.api('GET', '/b/anything')
    assert.match(page.body, /<title>Cohort/)
  } finally { await app.close() }
})

test('a finished battle shows the verdict and replays turn by turn, as this side saw it', async () => {
  const app = await start()
  try {
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3 })).body.seats.red
    assert.equal((await app.api('GET', `/api/seat/${token}/replay?turn=1`)).status, 409, 'no replay while the battle is on')

    let tent
    for (let i = 0; i < 40; i++) {
      await app.api('POST', `/api/seat/${token}/orders`, { text: i === 0 ? 'everyone advance' : '' })
      tent = (await app.api('GET', `/api/seat/${token}`)).body
      if (tent.battle.status === 'finished') break
    }
    assert.equal(tent.battle.status, 'finished')
    assert.ok(tent.battle.outcome.winner)
    const sides = Object.keys(tent.verdict.sides).sort()
    assert.deepEqual(sides, ['blue', 'red'])
    for (const s of sides) {
      const n = tent.verdict.sides[s]
      assert.ok(n.standing >= 0 && n.fled >= 0 && n.fallen >= 0)
    }

    const start0 = (await app.api('GET', `/api/seat/${token}/replay?turn=0`)).body
    assert.equal(start0.turn, 0)
    assert.equal(start0.battle.minutes, 0)
    assert.deepEqual(start0.enemies, [], 'before the first orders nothing was seen')
    const one = (await app.api('GET', `/api/seat/${token}/replay?turn=1`)).body
    assert.equal(one.turn, 1)
    assert.ok(one.battle.minutes > 0)
    assert.equal(JSON.stringify(start0).includes('"side":"blue"'), false)
  } finally { await app.close() }
})
