// src/web/tests/bigmap.test.js
//
// The big map (docs/DECISIONS.md, "How the big map was built"): Greywater,
// 2 km, offered at the muster with its size; each army comes in two lines
// there, its own and its faction's usual army raised for the day; the
// second line answers to one name, is not the Commander's to keep, and the
// 1 km fields are as they were.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { FIELD } = require('../../narrator/words')

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

test('the big map is offered at the muster with its size, and says its armies come in two lines; a 1 km field says neither', async () => {
  const app = await start()
  try {
    const maps = (await app.api('GET', '/api/maps')).body
    const big = maps.find(m => m.id === 'greywater')
    assert.equal(big.title, 'Greywater')
    assert.equal(big.size, '2 km')
    assert.ok(big.said.endsWith(FIELD.lines), big.said)
    for (const m of maps.filter(m => m.id !== 'greywater')) {
      assert.equal(m.size, undefined, m.id)
      assert.ok(!m.said.includes(FIELD.lines), m.id)
    }
  } finally { await app.close() }
})

test('on the big map each army comes in two lines: its own, and its faction\'s usual army again, raised for the day', async () => {
  const app = await start()
  try {
    const seats = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', map: 'greywater', faction: 'rome', enemyFaction: 'celts', seed: 4 })).body.seats
    const tent = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.equal(tent.map.width, 80)
    assert.deepEqual(tent.own.map(u => u.name), ['Legionaries', 'Hastati', 'Velites', 'Praetorian guard', 'Second legionaries', 'Second hastati', 'Second velites'])
    assert.deepEqual(tent.own.filter(u => u.secondLine).map(u => u.name), ['Second legionaries', 'Second hastati', 'Second velites'])
    for (const u of tent.own) assert.ok(u.officer, `${u.name} has an officer`)
    const game = app.store.seatOf(seats.red).entry.game
    assert.equal(game.spec.units.filter(u => u.side === 'blue').length, 11, 'the computer\'s Celts: five and their elite, and five again')
    assert.equal(game.spec.units.filter(u => u.side === 'blue' && u.quality === 'elite').length, 1, 'one elite: it is not raised twice')
  } finally { await app.close() }
})

test('the second line answers to "second line", and each of its units to its own name', async () => {
  const app = await start()
  try {
    const seats = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', map: 'greywater', faction: 'rome', enemyFaction: 'celts', seed: 4 })).body.seats
    const read = (await app.api('POST', `/api/seat/${seats.red}/read`, { text: 'second line hold\nsecond hastati take Elderby\nlegionaries advance' })).body
    assert.deepEqual(read.questions, [])
    assert.equal(read.understood[0], 'Second legionaries, Second hastati, Second velites: hold')
    assert.match(read.understood[1], /^Second hastati: march to Elderby/)
    assert.match(read.understood[2], /^Legionaries: advance/, 'the first line\'s name is its own alone')
  } finally { await app.close() }
})

test('a Commander\'s second line is not his to keep: his roster and his company take no note of it', async () => {
  const app = await start()
  try {
    const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
    const seats = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', map: 'greywater', commander: made.token, enemyFaction: 'celts', seed: 4 })).body.seats
    const tent = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.equal(tent.own.filter(u => u.secondLine).length, 3)
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'yield' })
    const commander = app.store.commanders.get(made.token)
    const kept = Object.keys(commander.company.units)
    assert.ok(kept.length > 0)
    assert.ok(kept.every(k => !k.startsWith('second')), kept.join(', '))
    assert.ok(commander.company.officers.every(o => !String(o.leads).startsWith('second')))
  } finally { await app.close() }
})

test('on a 1 km field there is no second line', async () => {
  const app = await start()
  try {
    for (const map of ['crownhill', 'ashford', 'thornwood', 'ravenridge']) {
      const seats = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', map, faction: 'rome', enemyFaction: 'celts', seed: 4 })).body.seats
      const tent = (await app.api('GET', `/api/seat/${seats.red}`)).body
      assert.deepEqual(tent.own.map(u => u.name), ['Legionaries', 'Hastati', 'Velites', 'Praetorian guard'], map)
    }
  } finally { await app.close() }
})
