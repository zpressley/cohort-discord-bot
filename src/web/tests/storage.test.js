// src/web/tests/storage.test.js
//
// Where the game is kept (storage.js): files, or Postgres. Each kept thing
// is read back as it was saved, a battle goes on after a restart, writes
// land in order, a failed write is tried again, and what is queued is
// written before the server stops.
//
// The Postgres tests need a database: set TEST_DATABASE_URL (any database
// the tests may make tables in, e.g. postgres://user@127.0.0.1:5432/test).
// Without it they are skipped, and say so.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createBattleStore } = require('../battles')
const { createServer } = require('../server')
const { openStorage, createFileStorage, createQueue, poolSettings } = require('../storage')
const { importFiles } = require('../import-files')
const { waitingOn } = require('../../engine/orchestrator')

const DB = process.env.TEST_DATABASE_URL || null
const NO_DB = DB ? false : 'no database: set TEST_DATABASE_URL to run the Postgres tests'
if (!DB) console.log('# storage.test.js: the Postgres tests are skipped (TEST_DATABASE_URL is not set)')

const NOW = () => 1_800_000_000_000
const quiet = () => {}

// Each backend: open a fresh, empty store; open it again (a restart); clean up.
let tables = 0
function backends() {
  const list = [{
    name: 'files',
    skip: false,
    async make() {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-storage-'))
      return { open: async () => createFileStorage(dir), done: async () => fs.rmSync(dir, { recursive: true, force: true }) }
    }
  }, {
    name: 'postgres',
    skip: NO_DB,
    async make() {
      const table = `documents_test_${process.pid}_${++tables}`
      return {
        open: (options = {}) => openStorage({ databaseUrl: DB, table, log: quiet, ...options }),
        async done() {
          const { Pool } = require('pg')
          const pool = new Pool(poolSettings(DB))
          await pool.query(`drop table if exists ${table}`)
          await pool.end()
        }
      }
    }
  }]
  return list
}

// Every turn to the end of a day of `turns` turns, every side holding.
async function untilNight(store, seats, text = 'everyone hold') {
  const game = store.seatOf(Object.values(seats)[0]).entry.game
  for (let i = 0; i < 40 && !game.outcome.decided; i++) {
    for (const side of waitingOn(game)) if (seats[side]) await store.submit(seats[side], text)
  }
  return game
}

for (const backend of backends()) {
  test(`${backend.name}: a battle mid-way, a finished one, a next-day pair and a Commander with a roster are read back as they were saved`, { skip: backend.skip }, async () => {
    const kept = await backend.make()
    try {
      let storage = await kept.open()
      let store = createBattleStore({ storage, now: NOW })
      const commander = store.commanders.create({ faction: 'rome', name: 'Garrick Stone', kind: Object.keys(require('../../data/commanders').KINDS)[0], holds: 'glory' }).token
      store.setArmy(commander, { usual: true })
      // Mid-way: two turns of a battle against the computer.
      const midway = store.muster({ map: 'crownhill', opponent: 'computer', side: 'red', faction: 'rome', enemyFaction: 'han', seed: 11 }).seats.red
      await store.submit(midway, 'everyone advance')
      await store.submit(midway, '')
      // Finished: a day of two turns, his Commander leading; then the next day.
      const made = store.muster({ opponent: 'standing', side: 'red', seed: 3, commander, map: 'ashford', enemyFaction: 'han', turnLimit: 2 })
      const game = await untilNight(store, made.seats)
      assert.equal(game.outcome.reason, 'night fell')
      const nextDay = store.again(made.seats.red).token
      await store.submit(nextDay, 'everyone hold')
      const seen = (s) => ({
        midway: s.view(midway), finished: s.view(made.seats.red), nextDay: s.view(nextDay),
        commander: s.commanderView(commander), company: s.commanders.view(commander)
      })
      const before = seen(store)
      await storage.flush()
      await storage.close()

      storage = await kept.open()
      store = createBattleStore({ storage, now: NOW })
      assert.deepEqual(seen(store), before)
      assert.ok(before.company.roster, 'the Commander has a roster')
      assert.equal(before.finished.verdict.night.next !== null, true, 'the finished battle knows its next day')
      await storage.close()
    } finally { await kept.done() }
  })

  test(`${backend.name}: a battle stopped mid-way by a restart goes on as if it had not stopped`, { skip: backend.skip }, async () => {
    const kept = await backend.make()
    try {
      const orders = ['everyone advance', '', 'everyone hold', '', '']
      // Uninterrupted, kept nowhere.
      const plain = createBattleStore({ now: NOW })
      const a = plain.muster({ map: 'crownhill', opponent: 'computer', side: 'red', faction: 'rome', enemyFaction: 'han', seed: 21 }).seats.red
      for (const text of orders) await plain.submit(a, text)

      let storage = await kept.open()
      let store = createBattleStore({ storage, now: NOW })
      const b = store.muster({ map: 'crownhill', opponent: 'computer', side: 'red', faction: 'rome', enemyFaction: 'han', seed: 21 }).seats.red
      for (const text of orders.slice(0, 2)) await store.submit(b, text)
      await storage.close()
      storage = await kept.open()
      store = createBattleStore({ storage, now: NOW })
      for (const text of orders.slice(2)) await store.submit(b, text)

      const shown = (v) => ({ own: v.own, dispatches: v.dispatches, status: v.status })
      assert.deepEqual(shown(store.view(b)), shown(plain.view(a)))
      await storage.close()
    } finally { await kept.done() }
  })
}

// ── The queue ──────────────────────────────────────

// A backend kept in memory, slow and (when told) failing.
function fakeBackend({ delay = 1, failFirst = 0 } = {}) {
  const rows = new Map()
  const writes = []
  let failures = failFirst
  return {
    rows, writes,
    fail(n) { failures = n },
    async write(kind, id, json) {
      await new Promise(resolve => setTimeout(resolve, delay))
      if (failures > 0) { failures--; throw new Error('the database is not answering') }
      writes.push([`${kind}/${id}`, JSON.parse(json).v])
      rows.set(`${kind}/${id}`, json)
    },
    async remove(kind, id) { rows.delete(`${kind}/${id}`) },
    async close() {}
  }
}

test('writes to one document land in the order they were made, and the last one is what is kept', async () => {
  const backend = fakeBackend({ delay: 3 })
  const storage = createQueue(backend, { log: quiet })
  for (let v = 1; v <= 30; v++) storage.put('battle', 'one', { v })
  for (let v = 1; v <= 5; v++) storage.put('battle', 'two', { v })
  await storage.flush()
  for (const key of ['battle/one', 'battle/two']) {
    const order = backend.writes.filter(([k]) => k === key).map(([, v]) => v)
    assert.deepEqual(order, [...order].sort((x, y) => x - y), `${key} written in order: ${order}`)
  }
  assert.equal(JSON.parse(backend.rows.get('battle/one')).v, 30)
  assert.equal(JSON.parse(backend.rows.get('battle/two')).v, 5)
  assert.deepEqual(storage.all('battle').map(d => d.v), [30, 5])
})

test('a failed write is tried again after a pause, and the store says it is healthy once it is written', async () => {
  const backend = fakeBackend({ failFirst: 2 })
  const told = []
  const storage = createQueue(backend, { pause: () => 5, log: (line) => told.push(line) })
  await storage.put('commander', 'c1', { v: 1 })
  assert.equal(JSON.parse(backend.rows.get('commander/c1')).v, 1)
  assert.equal(told.filter(l => /Could not save commander c1/.test(l)).length, 2, told.join('\n'))
  assert.equal(storage.health().ok, true)
})

test('a write that fails for good is never answered as saved: the store is not healthy until it is written', async () => {
  const backend = fakeBackend({ failFirst: 1000 })
  const storage = createQueue(backend, { tries: 3, pause: () => 2, log: quiet })
  storage.put('battle', 'b1', { v: 1 })
  await assert.rejects(storage.flush(), /could not save/)
  assert.equal(storage.health().ok, false)
  assert.equal(storage.health().why, 'saving is failing')
  backend.fail(0)
  for (let i = 0; i < 100 && !storage.health().ok; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(storage.health().ok, true, 'healthy again once written')
  assert.equal(JSON.parse(backend.rows.get('battle/b1')).v, 1)
})

test('what is queued is written before the store closes (the server stopping)', async () => {
  const backend = fakeBackend({ delay: 5 })
  const storage = createQueue(backend, { log: quiet })
  for (let i = 0; i < 20; i++) storage.put('battle', `b${i}`, { v: i })
  await storage.close()
  assert.equal(backend.rows.size, 20)
  assert.equal(storage.health().ok, false, 'a closing store takes no more')
})

test('postgres: a failed write is tried again, ordered writes keep the last, and the queue is written before it closes', { skip: NO_DB }, async () => {
  const table = `documents_test_${process.pid}_queue`
  let failures = 2
  const open = (wrap) => openStorage({ databaseUrl: DB, table, log: quiet, pause: () => 5, ...(wrap ? { wrap } : {}) })
  try {
    const storage = await open((b) => ({ ...b, write: (...args) => (failures-- > 0 ? Promise.reject(new Error('dropped')) : b.write(...args)) }))
    await storage.put('battle', 'first', { v: 0 })
    assert.equal(failures < 0, true, 'it failed and was tried again')
    for (let v = 1; v <= 40; v++) storage.put('battle', 'many', { v })
    for (let i = 0; i < 30; i++) storage.put('commander', `c${i}`, { i })
    await storage.close()
    const again = await open()
    assert.equal(again.all('battle').find(d => d.v > 0).v, 40)
    assert.equal(again.all('commander').length, 30)
    await again.remove('commander', 'c0')
    await again.close()
    const third = await open()
    assert.equal(third.all('commander').length, 29)
    await third.close()
  } finally {
    const { Pool } = require('pg')
    const pool = new Pool(poolSettings(DB))
    await pool.query(`drop table if exists ${table}`)
    await pool.end()
  }
})

test('postgres: battles and Commanders saved as files are copied in, and copying twice copies nothing more', { skip: NO_DB }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-import-'))
  const table = `documents_test_${process.pid}_import`
  try {
    const store = createBattleStore({ dir })
    store.commanders.create({ faction: 'rome' })
    const token = store.muster({ opponent: 'standing', side: 'red', seed: 9 }).seats.red
    await store.submit(token, 'everyone advance')
    const first = await importFiles({ dir, databaseUrl: DB, table, log: quiet })
    assert.deepEqual(first, { battle: 1, commander: 1, account: 0 })
    const second = await importFiles({ dir, databaseUrl: DB, table, log: quiet })
    assert.deepEqual(second, { battle: 0, commander: 0, account: 0 })
    const storage = await openStorage({ databaseUrl: DB, table, log: quiet })
    const back = createBattleStore({ storage })
    assert.deepEqual(back.view(token).own, store.view(token).own)
    await storage.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    const { Pool } = require('pg')
    const pool = new Pool(poolSettings(DB))
    await pool.query(`drop table if exists ${table}`)
    await pool.end()
  }
})

// ── The server ─────────────────────────────────────

async function serve(store) {
  const server = createServer(store)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const api = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    return { status: res.status, body: await res.json() }
  }
  return { api, close: () => new Promise(resolve => server.close(resolve)) }
}

test('the health address says 200 while saving works, and nothing secret', async () => {
  const app = await serve(createBattleStore({}))
  try {
    const health = await app.api('GET', '/healthz')
    assert.equal(health.status, 200)
    assert.deepEqual(health.body, { ok: true, saving: 'memory' })
  } finally { await app.close() }
})

test('while saving is failing, the health address says 503, orders are refused, and a change is never answered as done', async () => {
  const backend = fakeBackend({ failFirst: 1000 })
  const storage = createQueue(backend, { tries: 2, pause: () => 2, log: quiet })
  const app = await serve(createBattleStore({ storage }))
  try {
    // The Commander is made in memory, but its save fails: not answered as done.
    const made = await app.api('POST', '/api/commanders', { faction: 'rome' })
    assert.equal(made.status, 503)
    assert.match(made.body.error, /could not be saved/)
    assert.equal(made.body.token, undefined)
    assert.equal((await app.api('GET', '/healthz')).status, 503)
    const refused = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 9 })
    assert.equal(refused.status, 503)
    // Reading goes on.
    assert.equal((await app.api('GET', '/api/scenarios')).status, 200)
    backend.fail(0)
    for (let i = 0; i < 100 && !storage.health().ok; i++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal((await app.api('GET', '/healthz')).status, 200)
    assert.equal((await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 9 })).status, 201)
  } finally { await app.close() }
})

test('postgres: a turn is answered only once it is saved, and the server started again on the same database goes on with the battle', { skip: NO_DB }, async () => {
  const table = `documents_test_${process.pid}_server`
  try {
    let storage = await openStorage({ databaseUrl: DB, table, log: quiet })
    let app = await serve(createBattleStore({ storage }))
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 9 })).body.seats.red
    const sent = await app.api('POST', `/api/seat/${token}/orders`, { text: 'everyone advance' })
    assert.equal(sent.status, 200)
    const before = (await app.api('GET', `/api/seat/${token}`)).body
    // The process dies without closing the store: what was answered is saved.
    await app.close()
    const fresh = await openStorage({ databaseUrl: DB, table, log: quiet })
    app = await serve(createBattleStore({ storage: fresh }))
    const after = (await app.api('GET', `/api/seat/${token}`)).body
    assert.deepEqual(after.own, before.own)
    assert.deepEqual(after.dispatches, before.dispatches)
    assert.equal((await app.api('POST', `/api/seat/${token}/orders`, { text: 'everyone hold' })).status, 200)
    await app.close()
    await storage.close()
    await fresh.close()
    storage = null
  } finally {
    const { Pool } = require('pg')
    const pool = new Pool(poolSettings(DB))
    await pool.query(`drop table if exists ${table}`)
    await pool.end()
  }
})

test('a DATABASE_URL\'s sslmode is understood as other Postgres clients understand it', () => {
  assert.deepEqual(poolSettings('postgres://u:p@db.example.com:5432/cohort?sslmode=require').ssl, { rejectUnauthorized: false })
  assert.deepEqual(poolSettings('postgres://u:p@db.example.com/cohort?sslmode=verify-full').ssl, { rejectUnauthorized: true })
  assert.equal(poolSettings('postgres://u:p@db.example.com/cohort?sslmode=disable').ssl, false)
  assert.deepEqual(poolSettings('postgresql://u:p@db.example.com/cohort').ssl, { rejectUnauthorized: false }, 'a host elsewhere: encrypted')
  assert.equal(poolSettings('postgres://u@127.0.0.1:5432/cohort').ssl, false, 'this machine: plain')
  assert.equal(poolSettings('postgres://u:p@postgres.railway.internal:5432/railway').ssl, false, 'a private network: plain')
  assert.doesNotMatch(poolSettings('postgres://u:p@h/db?sslmode=require').connectionString, /sslmode/)
  assert.equal(poolSettings('postgres://u:p@h/db').max <= 3, true, 'a small pool')
})
