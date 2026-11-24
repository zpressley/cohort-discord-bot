// src/web/tests/ground.test.js
//
// Every map comes with its own ground to fight for (src/data/maps,
// `ground`): the default at the muster for every kind of battle, told at the
// muster, on the map, in the first dispatch, whenever it changes hands or is
// close to deciding the battle, and in the verdict when it decided it.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { MAPS, groundOf } = require('../../data/maps')

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
  return { store, api, close: () => new Promise(resolve => server.close(resolve)) }
}

const GROUND = { crownhill: 'the Crownhill', ashford: 'the Old Mill Bridge', thornwood: 'Thorn Knoll', ravenridge: 'Raven Gap', greywater: 'Elderby' }

test('every field offered at the muster names its own ground to fight for, in the muster\'s words', async () => {
  const app = await start()
  try {
    const maps = (await app.api('GET', '/api/maps')).body
    assert.deepEqual(maps.map(m => m.id).sort(), Object.keys(MAPS).sort())
    for (const m of maps) {
      assert.deepEqual(m.ground, [GROUND[m.id]], m.id)
      assert.match(m.said, new RegExp(`^The ground to fight for: ${GROUND[m.id]}\\. Hold it alone for 1 h, with no enemy on it${m.id === 'thornwood' ? ' or beside it' : ''}, and the field is yours`))
    }
  } finally { await app.close() }
})

test('the map\'s ground is the default for every kind of battle: against the computer, against a friend, with a faction\'s army or one he bought', async () => {
  const app = await start()
  try {
    const kinds = {
      computer: { opponent: 'standing', side: 'red' },
      friend: { opponent: 'friend', side: 'blue' },
      faction: { opponent: 'standing', side: 'red', faction: 'carthage', enemyFaction: 'han' }
    }
    const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
    assert.equal((await app.api('POST', `/api/commander/${made.token}/army`, { units: [{ name: 'swords', quality: 'professional', weapon: 'roman_gladius' }] })).status, 200)
    for (const [i, map] of Object.keys(MAPS).entries()) {
      for (const [kind, body] of Object.entries({ ...kinds, bought: { opponent: 'standing', side: 'red', commander: made.token } })) {
        const seats = (await app.api('POST', '/api/battles', { ...body, map, seed: 3 + i })).body.seats
        const tent = (await app.api('GET', `/api/seat/${seats[body.side]}`)).body
        assert.deepEqual(tent.objectives.map(o => [o.name, o.holder]), [[GROUND[map], null]], `${map}, ${kind}`)
        assert.equal(tent.objectives[0].said, `The ground to fight for, ${GROUND[map]}, is held by no one.`)
        // The bought army's battle is over before the next is mustered.
        if (kind === 'bought') await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'yield' })
      }
    }
  } finally { await app.close() }
})

test('a player may still name his own ground, or none', async () => {
  const app = await start()
  try {
    const own = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 2, map: 'crownhill', objectives: ['Harrow Bridge'] })).body.seats.red
    assert.deepEqual((await app.api('GET', `/api/seat/${own}`)).body.objectives.map(o => o.name), ['Harrow Bridge'])
    const none = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 2, map: 'crownhill', objectives: [] })).body.seats.red
    assert.deepEqual((await app.api('GET', `/api/seat/${none}`)).body.objectives, [])
  } finally { await app.close() }
})

test('neither army starts on the ground, and each has to cross the field to reach it', async () => {
  const app = await start()
  try {
    for (const map of Object.keys(MAPS)) {
      const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 4, map, faction: 'rome', enemyFaction: 'rome' })).body.seats
      const game = app.store.seatOf(seats.red).entry.game
      const ground = game.objectives[0]
      for (const side of ['red', 'blue']) {
        const from = Math.min(...game.battle.world.units.filter(u => u.side === side)
          .flatMap(u => ground.tiles.map(t => Math.max(Math.abs(t.x - u.position.x), Math.abs(t.y - u.position.y)))))
        assert.ok(from >= 6, `${map}: ${side} starts ${from} tiles from ${ground.name}`)
      }
    }
  } finally { await app.close() }
})

test('a player who will not come out loses the field to the computer, which takes the ground: he is told in his first dispatch, as it changes hands, when it is close, and in the verdict', async () => {
  const app = await start()
  try {
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 5, map: 'ashford', faction: 'rome', enemyFaction: 'rome' })).body.seats.red
    let tent = (await app.api('GET', `/api/seat/${seat}`)).body
    for (let turn = 0; turn < 40 && tent.battle.status !== 'finished'; turn++) {
      await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone hold' })
      tent = (await app.api('GET', `/api/seat/${seat}`)).body
      if (tent.objectives[0].holder === 'blue' && tent.battle.status !== 'finished') {
        assert.match(tent.objectives[0].said, /^The enemy holds the Old Mill Bridge, the ground to fight for: take it within (\d+ min|1 h), or the field is his\.$/)
      }
    }
    assert.equal(tent.battle.status, 'finished')
    assert.deepEqual([tent.battle.outcome.winner, tent.battle.outcome.reason], ['blue', 'objectives held'])
    assert.equal(tent.battle.outcome.said, 'The enemy held the Old Mill Bridge alone for 1 h, and the field is his')
    const lines = [...tent.dispatches].reverse().flatMap(d => d.lines)
    assert.match(lines[0], /^The ground to fight for: the Old Mill Bridge\. Hold it alone for 1 h/, 'the first dispatch opens with it')
    assert.ok(lines.includes('The enemy took the Old Mill Bridge: take it from him, or the field is his'), lines.join(' / '))
    assert.ok(lines.includes('The enemy has held the Old Mill Bridge long: unless you take it from him within 30 min, the field is his'), lines.join(' / '))
  } finally { await app.close() }
})

test('the computer\'s side, holding the ground, hears it in its own words: you took it', async () => {
  const app = await start()
  try {
    // Against a friend who holds still, the seat that takes it is told so.
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 5, map: 'ashford', faction: 'rome', enemyFaction: 'rome' })).body.seats
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: null })
    for (let turn = 0; turn < 20; turn++) {
      await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone hold' })
      await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: turn === 0 ? 'everyone take the Old Mill Bridge' : 'everyone hold' })
      const tent = (await app.api('GET', `/api/seat/${seats.blue}`)).body
      if (tent.battle.status === 'finished') break
    }
    const blue = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    const lines = blue.dispatches.flatMap(d => d.lines)
    assert.ok(lines.includes('You took the Old Mill Bridge: hold it alone and the field is yours'), lines.join(' / '))
    assert.deepEqual([blue.battle.outcome?.winner, blue.battle.outcome?.said], ['blue', 'You held the Old Mill Bridge alone for 1 h, and the field is yours'])
  } finally { await app.close() }
})

test('the next day is fought for the same ground', async () => {
  const app = await start()
  try {
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 6, map: 'thornwood', dayMinutes: 30, faction: 'rome', enemyFaction: 'rome', objectives: ['Charcoal Clearing'] })).body.seats.red
    let tent = (await app.api('GET', `/api/seat/${seat}`)).body
    for (let turn = 0; turn < 10 && tent.battle.status !== 'finished'; turn++) {
      await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone hold' })
      tent = (await app.api('GET', `/api/seat/${seat}`)).body
    }
    assert.equal(tent.battle.outcome.reason, 'night fell')
    const next = await app.api('POST', `/api/seat/${seat}/again`)
    assert.equal(next.status, 201)
    assert.deepEqual((await app.api('GET', `/api/seat/${next.body.token}`)).body.objectives.map(o => o.name), ['Charcoal Clearing'])
  } finally { await app.close() }
})

test('the map\'s ground is in the battle\'s spec when it is made, so a saved battle replays with it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-ground-'))
  try {
    let app = await start(createBattleStore({ dir }))
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 5, map: 'ashford', faction: 'rome', enemyFaction: 'rome' })).body.seats.red
    assert.deepEqual(app.store.seatOf(seat).entry.game.spec.objectives, groundOf('ashford'))
    for (let turn = 0; turn < 4; turn++) await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone hold' })
    const before = (await app.api('GET', `/api/seat/${seat}`)).body
    await app.close()
    app = await start(createBattleStore({ dir }))
    const after = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual(after.objectives, before.objectives)
    assert.deepEqual(after.dispatches, before.dispatches)
    await app.close()
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
