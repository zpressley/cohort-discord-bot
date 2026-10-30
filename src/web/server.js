// src/web/server.js
//
// The web app's server: plain Node http, no framework. It serves the
// browser app (src/web/public, themes in src/web/themes) and a small JSON
// API over the battle store (battles.js).
//
//   npm run web                       http://localhost:3000
//   PORT=8080 npm run web
//   COHORT_DATA_DIR=/some/dir         where battles are saved (default data/web)
//   GROQ_API_KEY=...                  orders read and turns narrated by the AI
//
// The API, all JSON:
//   GET  /api/scenarios                     what can be mustered
//   POST /api/battles                       muster: { scenario, opponent, side,
//                                           timeLimitMinutes, objectives }
//                                           -> { id, seats: { side: token } }
//   GET  /api/seats?tokens=a,b              one line per battle, for "your battles"
//   GET  /api/seat/:token                   the Command Tent: this side's view
//   GET  /api/seat/:token/summary           just the status line (to poll)
//   POST /api/seat/:token/read   { text }   read orders back, send nothing
//   POST /api/seat/:token/orders { text }   send orders
//
// A seat's token is its secret link. Every answer about a battle is that
// seat's side's view only (fog of war is held on the server).

const http = require('http')
const fs = require('fs')
const path = require('path')

const { createBattleStore } = require('./battles')

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
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(Object.assign(new Error('bad json'), { status: 400 })) }
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

function createServer(store) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const parts = url.pathname.split('/').filter(Boolean)

      // ── The API ─────────────────────────────────
      if (parts[0] === 'api') {
        if (req.method === 'GET' && parts[1] === 'scenarios' && parts.length === 2) {
          return send(res, 200, store.scenarios())
        }
        if (req.method === 'POST' && parts[1] === 'battles' && parts.length === 2) {
          const body = await readBody(req)
          return send(res, 201, store.muster({
            scenario: body.scenario, opponent: body.opponent, side: body.side,
            timeLimitMinutes: body.timeLimitMinutes, objectives: Array.isArray(body.objectives) ? body.objectives.map(String) : [],
            seed: Number.isInteger(body.seed) ? body.seed : undefined
          }))
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
          if (req.method === 'POST' && parts[3] === 'read') {
            const body = await readBody(req)
            return send(res, 200, await store.readBack(token, String(body.text ?? '').slice(0, 4000)))
          }
          if (req.method === 'POST' && parts[3] === 'orders') {
            const body = await readBody(req)
            return send(res, 200, await store.submit(token, String(body.text ?? '').slice(0, 4000)))
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
      send(res, error.status ?? 500, { error: error.status ? error.message : 'something went wrong' })
      if (!error.status) console.error(error)
    }
  })
}

if (require.main === module) {
  require('dotenv').config()
  const { aiClientFromEnv } = require('../llm')
  const store = createBattleStore({
    dir: process.env.COHORT_DATA_DIR ?? path.join(process.cwd(), 'data', 'web'),
    ai: aiClientFromEnv()
  })
  const port = Number(process.env.PORT ?? 3000)
  createServer(store).listen(port, () => {
    console.log(`Cohort is up: http://localhost:${port}`)
  })
}

module.exports = { createServer }
