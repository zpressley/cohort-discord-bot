// src/web/tests/factions.test.js
//
// Factions at the muster, through the HTTP API: a Commander belongs to a
// faction for life, his army is that faction's with its elite unit free,
// his veteran and he himself are with the elite unit, the order reader
// knows every unit by name, and a battle with no faction musters as before.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { FACTIONS } = require('../../data/factions')
const { loadScenario } = require('../../adapters/hotseat/scenarios')
const { fieldFactions } = require('../../engine/army/factions')

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
  return { server, api, close: () => new Promise(resolve => server.close(resolve)) }
}

test('the factions can be listed for the muster, each with its elite unit', async () => {
  const app = await start()
  try {
    const { status, body } = await app.api('GET', '/api/factions')
    assert.equal(status, 200)
    assert.deepEqual(body.map(f => f.id), Object.keys(FACTIONS))
    assert.ok(body.every(f => f.title && f.fights && f.elite))
  } finally { await app.close() }
})

test('a Commander\'s faction is chosen when he is made and cannot change', async () => {
  const app = await start()
  try {
    assert.equal((await app.api('POST', '/api/commanders', { faction: 'atlantis' })).status, 400)
    const made = (await app.api('POST', '/api/commanders', { faction: 'macedon' })).body
    assert.equal(made.faction, 'macedon')
    const view = (await app.api('GET', `/api/commander/${made.token}`)).body
    assert.equal(view.faction, 'macedon')
    assert.equal(view.factionTitle, 'Macedon')

    const refused = await app.api('POST', '/api/battles', { opponent: 'standing', commander: made.token, faction: 'rome' })
    assert.equal(refused.status, 409)
    assert.match(refused.body.error, /fights for Macedon, and always will/)
    // Naming no faction, or his own, he brings his own army.
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: made.token, seed: 4 })).body.seats.red
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.ok(tent.own.some(u => u.name === 'Silver shields'))
    assert.equal(tent.faction, 'macedon')
  } finally { await app.close() }
})

test('a Commander made before factions takes one at his first muster, and keeps it', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const made = (await app.api('POST', '/api/commanders')).body
    assert.equal(made.faction, null)
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: made.token, faction: 'han', seed: 2 })).body.seats.red
    assert.equal((await app.api('GET', `/api/commander/${made.token}`)).body.faction, 'han')
    assert.throws(() => store.commanders.setFaction(store.commanders.get(made.token), 'rome'), /always will/)
    assert.ok((await app.api('GET', `/api/seat/${seat}`)).body.own.some(u => u.name === 'Yulin guard'))
  } finally { await app.close() }
})

test('the veteran and the Commander are with the elite unit, and no other unit has an officer', async () => {
  const app = await start()
  try {
    for (const faction of Object.keys(FACTIONS)) {
      const made = (await app.api('POST', '/api/commanders', { faction })).body
      const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'blue', commander: made.token, seed: 6 })).body.seats.blue
      const tent = (await app.api('GET', `/api/seat/${seat}`)).body
      const elite = tent.own.find(u => u.quality === 'elite')
      assert.equal(elite.name.toLowerCase(), FACTIONS[faction].elite.name, faction)
      assert.equal(tent.commander.unitId, elite.id, `${faction}: he rides with the ${elite.name}`)
      assert.equal(elite.officer.grade, 'veteran')
      assert.ok(tent.own.filter(u => u !== elite).every(u => u.officer?.headless), faction)
      const company = (await app.api('GET', `/api/commander/${made.token}`)).body
      assert.deepEqual(company.officers.map(o => o.leads), [FACTIONS[faction].elite.name])
    }
  } finally { await app.close() }
})

test('the order reader finds every unit of every faction by the name it is shown under, and two of a kind by number or together', async () => {
  const app = await start()
  try {
    for (const faction of Object.keys(FACTIONS)) {
      const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', faction, seed: 3 })).body.seats.red
      const tent = (await app.api('GET', `/api/seat/${seat}`)).body
      assert.equal(new Set(tent.own.map(u => u.name)).size, tent.own.length, `${faction}: names are distinct`)
      const text = tent.own.map(u => `${u.name.toLowerCase()} hold`).join('\n')
      const read = (await app.api('POST', `/api/seat/${seat}/read`, { text })).body
      assert.deepEqual(read.questions, [], faction)
      assert.deepEqual(read.understood, tent.own.map(u => `${u.name}: hold`), faction)
    }
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', faction: 'macedon', seed: 3 })).body.seats.red
    const read = (await app.api('POST', `/api/seat/${seat}/read`, { text: 'sarissa foot advance\npeltasts and silver shields hold' })).body
    assert.deepEqual(read.understood, ['Sarissa foot 1, Sarissa foot 2: advance on the enemy', 'Peltasts, Silver shields: hold'])
  } finally { await app.close() }
})

test('the enemy is any faction by lot (his own among them), or the one chosen; the armies, not the scenario\'s, take the field', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const drawn = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', faction: 'rome', seed: 8, map: 'thornwood' })).body
    assert.match(drawn.title, new RegExp(`^Thornwood.*: Rome against (${Object.values(FACTIONS).map(f => f.title).join('|')})$`))
    const chosen = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', faction: 'rome', enemyFaction: 'sarmatia', seed: 8 })).body
    assert.equal(chosen.title, 'Crownhill: Rome against Sarmatia')
    const spec = store.seatOf(chosen.seats.red).entry.game.spec
    assert.deepEqual([...new Set(spec.units.map(u => `${u.side} ${u.faction}`))], ['red rome', 'blue sarmatia'])
    assert.equal((await app.api('POST', '/api/battles', { opponent: 'standing', faction: 'atlantis' })).status, 400)
  } finally { await app.close() }
})

test('a muster with no Commander and no faction is unchanged: the scenario\'s own armies', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, scenario: 'legions-vs-celts', map: 'ashford' })).body
    assert.equal(made.title, 'Ashford Vale: Legions and Celts')
    const spec = store.seatOf(made.seats.red).entry.game.spec
    const scenario = loadScenario('legions-vs-celts', { map: 'ashford', deploy: true })
    assert.deepEqual(spec.units.map(u => [u.id, u.position]), scenario.units.map(u => [u.id, u.position]))
    assert.equal(spec.commanders, undefined, 'no Commander on the field')
    assert.ok(spec.units.every(u => !u.faction))
    // With factions named and no Commander, each side brings its faction's usual army, as before.
    const named = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, map: 'ashford', faction: 'han', enemyFaction: 'macedon' })).body
    const fielded = store.seatOf(named.seats.red).entry.game.spec
    const usual = fieldFactions(loadScenario('meeting-battle', { map: 'ashford', deploy: true }), { red: 'han', blue: 'macedon' })
    assert.deepEqual(fielded.units.map(u => [u.id, u.position]), usual.units.map(u => [u.id, u.position]))
    assert.equal(fielded.commanders, undefined)
  } finally { await app.close() }
})

test('the friend who joins with a Commander of another faction brings that faction\'s army; a new one takes the faction named', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = (await app.api('POST', '/api/commanders', { faction: 'macedon' })).body
    const blue = (await app.api('POST', '/api/commanders', { faction: 'sarmatia' })).body
    const { seats } = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', commander: red.token, enemyFaction: 'han', seed: 5 })).body
    assert.equal((await app.api('GET', `/api/seat/${seats.blue}`)).body.faction, 'han', 'the muster gave blue an army')
    const before = (await app.api('GET', `/api/seat/${seats.red}`)).body.own

    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token, faction: 'rome' })).status, 409, 'his faction is his')
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })).status, 200)
    const tent = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    assert.equal(tent.faction, 'sarmatia')
    assert.equal(tent.battle.title, 'Crownhill: Macedon against Sarmatia')
    assert.equal(tent.commander.with, 'Iron scale riders')
    assert.deepEqual((await app.api('GET', `/api/seat/${seats.red}`)).body.own, before, 'the mustering side is as it was')

    // A new Commander for the friend: the faction he names is his.
    const again = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', faction: 'rome', enemyFaction: 'han', seed: 5 })).body.seats
    const fresh = (await app.api('POST', '/api/commanders')).body
    await app.api('POST', `/api/seat/${again.blue}/join`, { commander: fresh.token, faction: 'macedon' })
    assert.equal((await app.api('GET', `/api/commander/${fresh.token}`)).body.faction, 'macedon')
    assert.equal((await app.api('GET', `/api/seat/${again.blue}`)).body.commander.with, 'Silver shields')
    // With none, the muster's army stands.
    const third = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', faction: 'rome', enemyFaction: 'han', seed: 5 })).body.seats
    await app.api('POST', `/api/seat/${third.blue}/join`, { commander: null })
    assert.equal((await app.api('GET', `/api/seat/${third.blue}`)).body.commander.with, 'Yulin guard')
  } finally { await app.close() }
})

test('a faction battle replays identically after the server stops', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-factions-'))
  try {
    let app = await start(createBattleStore({ dir }))
    const made = (await app.api('POST', '/api/commanders', { faction: 'han' })).body
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: made.token, seed: 12, map: 'ravenridge' })).body.seats.red
    await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone advance' })
    await app.api('POST', `/api/seat/${seat}/orders`, { text: 'crossbows hold' })
    const before = (await app.api('GET', `/api/seat/${seat}`)).body
    await app.close()
    app = await start(createBattleStore({ dir }))
    const after = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual(after.own, before.own)
    assert.deepEqual(after.dispatches, before.dispatches)
    assert.equal((await app.api('GET', `/api/commander/${made.token}`)).body.faction, 'han')
    await app.close()
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
