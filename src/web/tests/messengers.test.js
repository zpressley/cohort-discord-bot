// src/web/tests/messengers.test.js
//
// Orders and news by rider, through the server
// (docs/design/point-of-view-and-messengers.md).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { orderDelays } = require('../../engine/command/messengers')

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

// A battle against the computer with a Commander of Rome on the field.
async function solo(app, { seed = 3, map = 'crownhill' } = {}) {
  const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
  const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed, map, commander: made.token, faction: 'rome' })).body.seats.red
  return seat
}

test('the read-back says how long a rider takes to each unit beyond the Commander\'s immediate range', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const seat = await solo(app)
    const game = store.seatOf(seat).entry.game
    // The army forms up within his immediate range; send one unit far off
    // (by hand, for the test) to the far north-west of the field.
    const far = game.battle.world.units.find(u => u.side === 'red' && u.id !== game.battle.commanders.red.unitId)
    far.position = { x: 1, y: 1 }
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    const minutes = orderDelays(game.battle, 'red', tent.own.map(u => u.id))
    const read = (await app.api('POST', `/api/seat/${seat}/read`, { text: tent.own.map(u => `${u.name.toLowerCase()} hold`).join('\n') })).body
    tent.own.forEach((u, i) => {
      const line = read.understood[i]
      if (minutes[u.id] === 0) assert.equal(line, `${u.name}: hold`, 'at once: nothing more is said')
      else assert.equal(line, `${u.name}: hold. A rider reaches them in about ${minutes[u.id]} minutes`)
    })
    assert.ok(Object.values(minutes).some(m => m > 0), 'some unit of the army is beyond the immediate range')
  } finally { await app.close() }
})
