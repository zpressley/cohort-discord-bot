// src/web/tests/enemy-commander.test.js
//
// The computer's Commander has a name and a character (opponent/
// commander.js), drawn from the battle's seed at the muster and kept in the
// spec: the player is told his name and what is said of him, in his first
// dispatch and on the Army tab; a saved battle replays with him, and the
// next day brings the same man.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { NAMES } = require('../../data/officers')

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

test('against the computer the player is told the name of the enemy\'s Commander and what is said of him: in his first dispatch, and in his tent', async () => {
  const app = await start()
  try {
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 5, map: 'ashford', faction: 'carthage', enemyFaction: 'carthage', kind: 'ground' })).body.seats.red
    const spec = app.store.seatOf(seat).entry.game.spec
    const { commanderName: name, character } = spec.sides.blue
    assert.ok(['bold', 'steady', 'cautious'].includes(character))
    assert.ok(NAMES['Carthaginian Empire'].includes(name), 'named as his army\'s officers are')
    assert.ok(!spec.units.filter(u => u.side === 'blue').some(u => u.officer?.name === name), 'not one of his own officers\' names')
    let tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual(tent.enemyCommander, { name, said: `${name}, said to be ${character}` })
    await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone hold' })
    tent = (await app.api('GET', `/api/seat/${seat}`)).body
    const first = tent.dispatches.at(-1).lines
    assert.match(first[0], /^The ground to fight for/, 'the ground first')
    assert.equal(first[1], `You face ${name}, who commands the enemy. He is said to be ${character}.`)
    await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone hold' })
    tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.equal(tent.dispatches.flatMap(d => d.lines).filter(l => l.startsWith('You face')).length, 1, 'told once')
  } finally { await app.close() }
})

test('the enemy Commander comes from the seed: the same seed the same man, and over many battles each character', async () => {
  const app = await start()
  try {
    const met = (seed) => {
      const seat = app.store.muster({ opponent: 'standing', side: 'red', seed, map: 'crownhill', faction: 'rome', enemyFaction: 'han' }).seats.red
      return app.store.view(seat).enemyCommander
    }
    assert.deepEqual(met(11), met(11))
    const characters = new Set()
    for (let seed = 1; seed <= 30; seed++) characters.add(met(seed).said.split('said to be ')[1])
    assert.deepEqual([...characters].sort(), ['bold', 'cautious', 'steady'])
  } finally { await app.close() }
})

test('a battle against a friend has no computer\'s Commander', async () => {
  const app = await start()
  try {
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 5 })).body.seats
    const spec = app.store.seatOf(seats.red).entry.game.spec
    assert.equal(spec.sides.blue.character, undefined)
    assert.equal((await app.api('GET', `/api/seat/${seats.red}`)).body.enemyCommander, null)
  } finally { await app.close() }
})

test('a saved battle replays with its enemy Commander, and the next day brings the same man', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-enemy-'))
  try {
    let app = await start(createBattleStore({ dir }))
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 6, map: 'thornwood', dayMinutes: 30, faction: 'rome', enemyFaction: 'rome' })).body.seats.red
    const before = (await app.api('GET', `/api/seat/${seat}`)).body
    await app.close()
    app = await start(createBattleStore({ dir }))
    let tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual(tent.enemyCommander, before.enemyCommander)
    for (let turn = 0; turn < 10 && tent.battle.status !== 'finished'; turn++) {
      await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone hold' })
      tent = (await app.api('GET', `/api/seat/${seat}`)).body
    }
    assert.equal(tent.battle.outcome.reason, 'night fell')
    const next = await app.api('POST', `/api/seat/${seat}/again`)
    assert.equal(next.status, 201)
    assert.deepEqual((await app.api('GET', `/api/seat/${next.body.token}`)).body.enemyCommander, before.enemyCommander)
    await app.close()
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
