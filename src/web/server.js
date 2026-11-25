// src/web/server.js
//
// The web app's server: plain Node http, no framework. It serves the
// browser app (src/web/public, themes in src/web/themes) and a small JSON
// API over the battle store (battles.js).
//
//   npm run web                       http://localhost:3000
//   PORT=8080 npm run web
//   COHORT_DATA_DIR=/some/dir         where battles are saved (default data/web)
//   DATABASE_URL=postgres://...       saved in Postgres instead (storage.js)
//   GROQ_API_KEY=...                  orders read and turns narrated by the AI
//
// For the host: GET /healthz is 200 while saving works, 503 when it does not.
// Every POST is answered only once what it changed is saved; while saving
// is failing, POSTs are refused (503) and nothing new is played.
//
// The API, all JSON:
//   GET  /api/scenarios                     what can be mustered
//   GET  /api/maps                          where it can be fought
//   GET  /api/factions                      whose armies can fight it
//   POST /api/battles                       muster: { scenario, map, opponent, side,
//                                           timeLimitMinutes, objectives, commander,
//                                           faction, enemyFaction, marching }
//                                           (marching: the names of his units
//                                           that march; else as last time)
//                                           -> { id, seats: { side: token } }
//   GET  /api/seats?tokens=a,b              one line per battle, for "your battles"
//   GET  /api/seat/:token                   the Command Tent: this side's view
//   GET  /api/seat/:token/summary           just the status line (to poll)
//   GET  /api/seat/:token/replay?turn=n     a finished battle as this side saw it
//                                           after turn n
//   POST /api/seat/:token/join { commander, faction }  the friend who joined by link
//                                           chooses who leads their side: a
//                                           Commander's token, or null for none;
//                                           only before the first turn runs
//   POST /api/seat/:token/read   { text }   read orders back, send nothing
//   POST /api/seat/:token/orders { text }   send orders
//   POST /api/seat/:token/again             after a battle night ended: the
//                                           next day's battle -> { token, title }
//   GET  /api/day                           the length of the day, and its words
//   POST /api/seat/:token/offer { units }   a Commander held by the enemy
//                                           offers units (none: the field
//                                           alone) for his freedom
//   POST /api/seat/:token/answer { offer, accept | refuse | more: [ids] }
//                                           his captor answers the offer
//   GET  /api/commanders/new                what making a Commander asks: the
//                                           two questions, their answers, and
//                                           a plain name offered
//   POST /api/commanders { faction, kind, holds, name }
//                                           a new Commander -> { token, name,
//                                           faction, kind, holds }; a name
//                                           refused says why (400)
//   GET  /api/commander/:token              his company: officers, their
//                                           records, those lost, his army,
//                                           and the battle his army is in
//   POST /api/commander/:token/army { units, captured } | { usual: true }
//                                           he buys his standard army (checked
//                                           through the builder), or takes his
//                                           faction's usual one; not while his
//                                           army is in the field
//   POST /api/commander/:token/officer { officer, to }
//                                           he moves an officer (his id) to
//                                           another of his units, swapping
//                                           with the one there; not while his
//                                           army is in the field
//   POST /api/commander/:token/name { unit, name }
//                                           he names a unit that has an
//                                           officer; refused with the reason
//                                           if the name will not do
//   POST /api/factions/:id/appraise { units, draft, at, reserved }
//                                           an army being bought, priced: each
//                                           unit, the budget left, and every
//                                           choice for the draft unit with the
//                                           builder's reason for any refused
//
// A seat's token is its secret link. Every answer about a battle is that
// seat's side's view only (fog of war is held on the server).

const http = require('http')
const fs = require('fs')
const path = require('path')

const { createBattleStore } = require('./battles')
const { openStorage, createFileStorage } = require('./storage')

const PUBLIC = path.join(__dirname, 'public')
const THEMES = path.join(__dirname, 'themes')
const MAX_BODY = 64 * 1024

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = type.startsWith('application/json') ? JSON.stringify(body) : body
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  })
  res.end(data)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        // A body that is JSON but not an object ("null", a number) is no body.
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(body && typeof body === 'object' && !Array.isArray(body) ? body : {})
      } catch { reject(Object.assign(new Error('bad json'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}

// A file under root, or null: never a path that escapes it.
function fileUnder(root, relative) {
  const file = path.normalize(path.join(root, relative))
  if (!file.startsWith(root + path.sep)) return null
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null
}

function serveFile(res, file) {
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] ?? 'application/octet-stream')
}

// What the player is told when the game cannot be saved.
const NOT_SAVED = 'The game could not be saved just now, so nothing new can be played. Try again in a minute.'

// A list of unit names from the browser, or null if none was sent.
const names = (list) => (Array.isArray(list) ? list.slice(0, 60).map(n => String(n).slice(0, 40)) : null)

function createServer(store) {
  const storage = store.storage ?? createFileStorage(null)
  return http.createServer(async (req, res) => {
    // A POST is answered once what it changed is saved; if that save has
    // failed for good, it is answered 503 instead, never as done.
    const sendNow = send
    try {
      const url = new URL(req.url, 'http://localhost')
      const parts = url.pathname.split('/').filter(Boolean)
      const send = req.method !== 'POST' ? sendNow : async (res, status, body, type) => {
        try { await storage.flush() } catch { return sendNow(res, 503, { error: NOT_SAVED }) }
        return sendNow(res, status, body, type)
      }

      // For the host: is the game saving? (Nothing secret in the answer.)
      if (req.method === 'GET' && url.pathname === '/healthz') {
        const health = storage.health()
        return sendNow(res, health.ok ? 200 : 503, health)
      }

      // ── The API ─────────────────────────────────
      if (parts[0] === 'api') {
        if (req.method === 'POST' && !storage.health().ok) return sendNow(res, 503, { error: NOT_SAVED })
        if (req.method === 'GET' && parts[1] === 'scenarios' && parts.length === 2) {
          return send(res, 200, store.scenarios())
        }
        if (req.method === 'GET' && parts[1] === 'maps' && parts.length === 2) {
          return send(res, 200, store.maps())
        }
        if (req.method === 'GET' && parts[1] === 'day' && parts.length === 2) {
          return send(res, 200, store.day())
        }
        if (req.method === 'GET' && parts[1] === 'factions' && parts.length === 2) {
          return send(res, 200, store.factions())
        }
        if (req.method === 'POST' && parts[1] === 'battles' && parts.length === 2) {
          const body = await readBody(req)
          return send(res, 201, store.muster({
            scenario: body.scenario, map: body.map, opponent: body.opponent, side: body.side,
            timeLimitMinutes: body.timeLimitMinutes, objectives: Array.isArray(body.objectives) ? body.objectives.map(String) : undefined,
            kind: typeof body.kind === 'string' ? body.kind : undefined,
            seed: Number.isInteger(body.seed) ? body.seed : undefined,
            turnLimit: Number.isInteger(body.turnLimit) ? body.turnLimit : undefined,
            dayMinutes: Number.isInteger(body.dayMinutes) ? body.dayMinutes : undefined,
            commander: typeof body.commander === 'string' ? body.commander : null,
            faction: typeof body.faction === 'string' && body.faction ? body.faction : null,
            enemyFaction: typeof body.enemyFaction === 'string' && body.enemyFaction ? body.enemyFaction : null,
            marching: names(body.marching)
          }))
        }
        // A Commander and his company of officers, kept from battle to battle.
        if (req.method === 'POST' && parts[1] === 'commanders' && parts.length === 2) {
          const body = await readBody(req)
          const asked = (key) => (typeof body[key] === 'string' && body[key] ? body[key] : null)
          return send(res, 201, store.commanders.create({
            faction: asked('faction'), kind: asked('kind'), holds: asked('holds'),
            name: typeof body.name === 'string' ? body.name.slice(0, 80) : null
          }))
        }
        if (req.method === 'GET' && parts[1] === 'commanders' && parts[2] === 'new' && parts.length === 3) {
          return send(res, 200, store.commanders.making())
        }
        // Buying an army: every choice priced, and why any is refused.
        if (req.method === 'POST' && parts[1] === 'factions' && parts[2] && parts[3] === 'appraise' && parts.length === 4) {
          const body = await readBody(req)
          const seen = store.appraise(parts[2], { units: body.units, draft: body.draft ?? null, at: body.at ?? null, reserved: names(body.reserved) ?? [] })
          return seen ? send(res, 200, seen) : send(res, 404, { error: 'no such faction' })
        }
        if (req.method === 'POST' && parts[1] === 'commander' && parts[2] && parts[3] === 'army' && parts.length === 4) {
          const body = await readBody(req)
          const company = store.setArmy(parts[2], { usual: body.usual === true, units: body.units, captured: names(body.captured) })
          return company ? send(res, 200, company) : send(res, 404, { error: 'no such commander' })
        }
        // Moving an officer to another of his units, and naming a unit.
        if (req.method === 'POST' && parts[1] === 'commander' && parts[2] && parts[3] === 'officer' && parts.length === 4) {
          const body = await readBody(req)
          const company = store.transfer(parts[2], { officer: typeof body.officer === 'string' ? body.officer : null, to: typeof body.to === 'string' ? body.to : null })
          return company ? send(res, 200, company) : send(res, 404, { error: 'no such commander' })
        }
        if (req.method === 'POST' && parts[1] === 'commander' && parts[2] && parts[3] === 'name' && parts.length === 4) {
          const body = await readBody(req)
          const company = store.nameUnit(parts[2], { unit: typeof body.unit === 'string' ? body.unit : null, name: typeof body.name === 'string' ? body.name.slice(0, 80) : '' })
          return company ? send(res, 200, company) : send(res, 404, { error: 'no such commander' })
        }
        if (req.method === 'GET' && parts[1] === 'commander' && parts[2] && parts.length === 3) {
          const company = store.commanderView(parts[2])
          return company ? send(res, 200, company) : send(res, 404, { error: 'no such commander' })
        }
        if (req.method === 'GET' && parts[1] === 'seats' && parts.length === 2) {
          const tokens = (url.searchParams.get('tokens') ?? '').split(',').filter(Boolean).slice(0, 50)
          return send(res, 200, tokens.map(t => store.summary(t)).filter(Boolean))
        }
        if (parts[1] === 'seat' && parts[2]) {
          const token = parts[2]
          if (!store.seatOf(token)) return send(res, 404, { error: 'no such battle' })
          if (req.method === 'GET' && parts.length === 3) return send(res, 200, store.view(token))
          if (req.method === 'GET' && parts[3] === 'summary') return send(res, 200, store.summary(token))
          if (req.method === 'GET' && parts[3] === 'replay') {
            const shown = store.replay(token, url.searchParams.get('turn'))
            return shown ? send(res, 200, shown) : send(res, 409, { error: 'the battle is not over yet' })
          }
          if (req.method === 'POST' && parts[3] === 'join') {
            const body = await readBody(req)
            return send(res, 200, store.join(token, typeof body.commander === 'string' ? body.commander : null,
              typeof body.faction === 'string' && body.faction ? body.faction : null, names(body.marching)))
          }
          if (req.method === 'POST' && parts[3] === 'read') {
            const body = await readBody(req)
            return send(res, 200, await store.readBack(token, String(body.text ?? '').slice(0, 4000)))
          }
          if (req.method === 'POST' && parts[3] === 'offer') {
            const body = await readBody(req)
            return send(res, 200, await store.offer(token, Array.isArray(body.units) ? body.units.slice(0, 50) : []))
          }
          if (req.method === 'POST' && parts[3] === 'answer') {
            const body = await readBody(req)
            return send(res, 200, await store.answer(token, {
              offer: body.offer, accept: body.accept === true, refuse: body.refuse === true,
              ...(Array.isArray(body.more) ? { more: body.more.slice(0, 50) } : {})
            }))
          }
          // After a battle night ended: the next day's battle, against the
          // same enemy (made once; each side is given its own seat).
          if (req.method === 'POST' && parts[3] === 'again' && parts.length === 4) {
            return send(res, 201, store.again(token))
          }
          if (req.method === 'POST' && parts[3] === 'orders') {
            const body = await readBody(req)
            return send(res, 200, await store.submit(token, String(body.text ?? '').slice(0, 4000), { sendClear: body.sendClear === true }))
          }
        }
        return send(res, 404, { error: 'not found' })
      }

      // ── Files ───────────────────────────────────
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      if (parts[0] === 'themes') {
        const file = fileUnder(THEMES, parts.slice(1).join('/'))
        return file ? serveFile(res, file) : send(res, 404, { error: 'not found' })
      }
      if (parts[0] === 'static') {
        const file = fileUnder(PUBLIC, parts.slice(1).join('/'))
        return file ? serveFile(res, file) : send(res, 404, { error: 'not found' })
      }
      // Every page is the one app; it reads the address itself.
      return serveFile(res, path.join(PUBLIC, 'index.html'))
    } catch (error) {
      // What was changed before the error is saved before the answer.
      if (req.method === 'POST') await storage.flush().catch(() => {})
      send(res, error.status ?? 500, error.status
        ? { error: error.message, ...(Array.isArray(error.errors) ? { errors: error.errors } : {}) }
        : { error: 'something went wrong' })
      if (!error.status) console.error(error)
    }
  })
}

/**
 * Start the server: open where the game is kept and read it all in, then
 * listen. On SIGTERM or SIGINT (a host sends SIGTERM on every redeploy) it
 * stops taking requests, lets those under way finish, writes what is
 * queued, and exits.
 */
async function main(env = process.env) {
  const { aiClientFromEnv } = require('../llm')
  const dir = env.COHORT_DATA_DIR ?? path.join(process.cwd(), 'data', 'web')
  const started = Date.now()
  const storage = await openStorage({ databaseUrl: env.DATABASE_URL || null, dir })
  const store = createBattleStore({ storage, ai: aiClientFromEnv() })
  console.log(`Saving to ${storage.where === 'postgres' ? 'Postgres (DATABASE_URL)' : `files in ${dir}`}; read in at start in ${Date.now() - started} ms.`)
  const port = Number(env.PORT ?? 3000)
  const server = createServer(store)
  await new Promise(resolve => server.listen(port, resolve))
  console.log(`Cohort is up: http://localhost:${port}`)

  let stopping = false
  async function stop(signal) {
    if (stopping) return
    stopping = true
    console.log(`${signal}: stopping. Finishing requests and saving.`)
    const closed = new Promise(resolve => server.close(resolve))
    server.closeIdleConnections()
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 10000).unref())])
    await storage.close()
    console.log('Saved. Stopped.')
    process.exit(0)
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
  return server
}

if (require.main === module) {
  require('dotenv').config()
  main().catch((error) => {
    // Never the connection string: only what went wrong.
    console.error(`Cohort could not start: ${error.message}`)
    process.exit(1)
  })
}

module.exports = { createServer, main }
