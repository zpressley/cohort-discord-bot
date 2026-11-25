// src/web/storage.js
//
// Where the server keeps what it saves: battles, Commanders, and whatever
// else comes (accounts, for Discord sign-in). Each is one document, a JSON
// object with a kind ("battle", "commander") and an id. Memory is the truth
// while the server runs: everything is read in at start, and a document is
// written whole each time it changes.
//
// Two places to keep them:
//
//   files      one JSON file each under a folder (COHORT_DATA_DIR): battles
//              at <dir>/<id>.json, every other kind at <dir>/<kind>s/<id>.json.
//              Written at once, as the change is made. With no folder,
//              nothing is kept (tests).
//   postgres   one table, documents(kind, id, data json, updated_at), when
//              DATABASE_URL is set. Writes are queued: each document's in
//              order, the newest version only once an older one is
//              written, a failed write tried again after a pause. While a
//              write has failed again and again the store says it is not
//              healthy, and the server refuses new orders (server.js).
//
// Both answer the same calls:
//   all(kind)              every document of a kind, as read in at start
//   put(kind, id, data)    keep this document (a promise: written)
//   remove(kind, id)       forget it (a promise)
//   flush()                a promise: everything put so far is written
//                          (rejected if a write has failed for good)
//   health()               { ok, saving } and, when not ok, why, in plain words
//   close()                write what is queued, then let go of the database

const fs = require('fs')
const path = require('path')

const NAME = /^[A-Za-z0-9_-]+$/

// ── Files ──────────────────────────────────────────

function folderOf(dir, kind) {
  return kind === 'battle' ? dir : path.join(dir, `${kind}s`)
}

/** Documents in files under dir, written at once; null dir keeps nothing. */
function createFileStorage(dir = null) {
  function all(kind) {
    if (!dir) return []
    const folder = folderOf(dir, kind)
    if (!fs.existsSync(folder)) return []
    return fs.readdirSync(folder).filter(n => n.endsWith('.json')).sort()
      .map(n => JSON.parse(fs.readFileSync(path.join(folder, n), 'utf8')))
  }
  function put(kind, id, data) {
    if (!dir) return Promise.resolve()
    if (!NAME.test(String(id))) throw new Error(`not a document id: ${id}`)
    const folder = folderOf(dir, kind)
    fs.mkdirSync(folder, { recursive: true })
    const file = path.join(folder, `${id}.json`)
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data))
    fs.renameSync(`${file}.tmp`, file)
    return Promise.resolve()
  }
  function remove(kind, id) {
    if (!dir) return Promise.resolve()
    if (!NAME.test(String(id))) throw new Error(`not a document id: ${id}`)
    fs.rmSync(path.join(folderOf(dir, kind), `${id}.json`), { force: true })
    return Promise.resolve()
  }
  return {
    where: dir ? 'files' : 'memory',
    all,
    put,
    remove,
    flush: () => Promise.resolve(),
    health: () => ({ ok: true, saving: dir ? 'files' : 'memory' }),
    close: () => Promise.resolve()
  }
}

// ── The queue (for a store whose writes take time) ─

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * A queue of writes over a backend ({ write(kind, id, json), remove(kind, id),
 * close() }), with what it held at start (`loaded`: kind -> id -> json).
 *   tries   failed writes of one document before it is reported failed
 *   pause   ms to wait after the nth failure (n from 1)
 *   log     where failures are told
 */
function createQueue(backend, { loaded = new Map(), where = 'postgres', tries = 5, pause = (n) => Math.min(250 * 2 ** (n - 1), 5000), log = console.error } = {}) {
  const docs = new Map()        // "kind/id" -> { kind, id, next, waiters, running }
  const failing = new Set()     // "kind/id" of documents failed for good, until written
  const waiting = new Set()     // every promise not yet settled, for flush()
  let closing = false

  function all(kind) {
    return [...(loaded.get(kind) ?? new Map()).entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, json]) => JSON.parse(json))
  }

  function enqueue(kind, id, json) {
    if (!NAME.test(String(id)) || !NAME.test(String(kind))) throw new Error(`not a document: ${kind} ${id}`)
    const key = `${kind}/${id}`
    if (!loaded.has(kind)) loaded.set(kind, new Map())
    if (json === null) loaded.get(kind).delete(id)
    else loaded.get(kind).set(id, json)
    let doc = docs.get(key)
    if (!doc) { doc = { kind, id, key, next: undefined, waiters: [], running: false }; docs.set(key, doc) }
    doc.next = json
    const written = new Promise((resolve, reject) => doc.waiters.push({ resolve, reject }))
    waiting.add(written)
    written.then(() => waiting.delete(written), () => waiting.delete(written))
    run(doc)
    return written
  }

  async function run(doc) {
    if (doc.running) return
    doc.running = true
    while (doc.next !== undefined) {
      let json = doc.next
      let waiters = doc.waiters
      doc.next = undefined
      doc.waiters = []
      for (let attempt = 1; ; attempt++) {
        try {
          if (json === null) await backend.remove(doc.kind, doc.id)
          else await backend.write(doc.kind, doc.id, json)
          if (failing.delete(doc.key)) log(`Saving works again: ${doc.kind} ${doc.id} is saved.`)
          for (const w of waiters) w.resolve()
          break
        } catch (error) {
          if (attempt <= tries || attempt % 12 === 0) log(`Could not save ${doc.kind} ${doc.id} (try ${attempt}): ${error.message}`)
          // Failed for good: whoever waits on it is told, and it goes on
          // being tried (memory still holds it).
          if (attempt >= tries) {
            if (!failing.has(doc.key)) log(`Saving is failing: ${doc.kind} ${doc.id} is kept in memory and will be tried again.`)
            failing.add(doc.key)
            const failed = Object.assign(new Error('could not save'), { status: 503 })
            for (const w of waiters) w.reject(failed)
            waiters = []
          }
          await sleep(pause(Math.min(attempt, tries)))
          // A newer version came while this one failed: write that instead.
          if (doc.next !== undefined) {
            json = doc.next
            waiters = waiters.concat(doc.waiters)
            doc.next = undefined
            doc.waiters = []
          }
        }
      }
    }
    doc.running = false
  }

  async function flush() {
    const results = await Promise.allSettled([...waiting])
    const failed = results.find(r => r.status === 'rejected')
    if (failed) throw failed.reason
  }

  function health() {
    if (closing) return { ok: false, saving: where, why: 'the server is stopping' }
    if (failing.size) return { ok: false, saving: where, why: 'saving is failing' }
    return { ok: true, saving: where }
  }

  // Everything queued is written, or given up after `within` ms.
  async function close({ within = 20000 } = {}) {
    closing = true
    const drained = (async () => {
      while ([...docs.values()].some(d => d.running)) await sleep(20)
    })()
    let timer
    const late = new Promise(resolve => { timer = setTimeout(() => resolve('late'), within) })
    const how = await Promise.race([drained, late])
    clearTimeout(timer)
    if (how === 'late') log(`Stopping with writes not done: ${[...docs.values()].filter(d => d.running).map(d => `${d.kind} ${d.id}`).join(', ')}`)
    await backend.close()
  }

  return {
    where,
    all,
    put: (kind, id, data) => enqueue(kind, String(id), JSON.stringify(data)),
    remove: (kind, id) => enqueue(kind, String(id), null),
    flush,
    health,
    close
  }
}

// ── Postgres ───────────────────────────────────────

const LOCAL = /^(localhost|127\.0\.0\.1|::1|\[::1\])$|\.internal$|^\//

/**
 * The pool's settings from a DATABASE_URL, without the URL's sslmode (it is
 * turned into pg's own `ssl` here, so that "require" means what it means to
 * every other Postgres client: encrypted, the certificate not checked).
 *   disable                      no TLS
 *   require, prefer, no-verify   TLS, certificate not checked
 *   verify-ca, verify-full       TLS, certificate checked
 *   none given                   TLS (unchecked) unless the host is this
 *                                machine or a host's private network
 */
function poolSettings(databaseUrl, { max = 3 } = {}) {
  const url = new URL(databaseUrl)
  const mode = url.searchParams.get('sslmode')
  for (const key of ['sslmode', 'uselibpqcompat']) url.searchParams.delete(key)
  const host = url.searchParams.get('host') ?? decodeURIComponent(url.hostname)
  let ssl
  if (mode === 'disable') ssl = false
  else if (mode === 'verify-ca' || mode === 'verify-full') ssl = { rejectUnauthorized: true }
  else if (mode) ssl = { rejectUnauthorized: false }
  else ssl = !host || LOCAL.test(host) ? false : { rejectUnauthorized: false }
  return { connectionString: url.toString(), ssl, max, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 }
}

/**
 * Documents in Postgres. Makes the table if it is missing, reads every
 * document in, and returns the store.
 */
async function createPostgresStorage(databaseUrl, { table = 'documents', log = console.error, wrap = (b) => b, ...queue } = {}) {
  if (!NAME.test(table)) throw new Error('not a table name')
  const { Pool } = require('pg')
  const pool = new Pool(poolSettings(databaseUrl))
  // An idle connection the database dropped: pg makes a new one when needed.
  pool.on('error', (error) => log(`The database dropped a connection: ${error.message}`))
  // json, not jsonb: jsonb sorts an object's keys, and the order of a
  // company's units (and more) is the order they are listed in, which the
  // game reads. json keeps the text exactly as written.
  await pool.query(`create table if not exists ${table} (
    kind text not null,
    id text not null,
    data json not null,
    updated_at timestamptz not null default now(),
    primary key (kind, id)
  )`)
  const loaded = new Map()
  const { rows } = await pool.query(`select kind, id, data::text as data from ${table}`)
  for (const row of rows) {
    if (!loaded.has(row.kind)) loaded.set(row.kind, new Map())
    loaded.get(row.kind).set(row.id, row.data)
  }
  const backend = wrap({
    write: (kind, id, json) => pool.query(
      `insert into ${table} (kind, id, data, updated_at) values ($1, $2, $3::json, now())
       on conflict (kind, id) do update set data = excluded.data, updated_at = excluded.updated_at`, [kind, id, json]),
    remove: (kind, id) => pool.query(`delete from ${table} where kind = $1 and id = $2`, [kind, id]),
    close: () => pool.end()
  })
  return createQueue(backend, { loaded, where: 'postgres', log, ...queue })
}

/**
 * The store the server uses: Postgres when databaseUrl is given, else files
 * under dir (or nothing kept, with no dir).
 */
async function openStorage({ databaseUrl = null, dir = null, ...options } = {}) {
  if (databaseUrl) return createPostgresStorage(databaseUrl, options)
  return createFileStorage(dir)
}

module.exports = { openStorage, createFileStorage, createPostgresStorage, createQueue, poolSettings }
