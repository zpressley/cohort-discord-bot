// src/web/tests/fixtures/discord-standin.js
//
// A stand-in Discord for the tests: a small local HTTP server that plays the
// handful of endpoints the game calls, and records what it was sent. No
// test reaches the real Discord.
//
//   standin.user = { id, username, global_name }   who signs in next
//   standin.refuseDm = new Set([userId])           his direct messages refused (50007)
//   standin.down = true                            every bot call answers 503
//   standin.hang = true                            every bot call is never answered
//   standin.slowDown = n                           the next n bot calls answer 429
//   standin.sent                                   every bot call: { method, path, body }

const http = require('http')

const CLIENT_ID = 'standin-client'
const CLIENT_SECRET = 'standin-client-secret-do-not-log'
const BOT_TOKEN = 'standin-bot-token-do-not-log'

async function startStandin() {
  const s = {
    user: { id: '100000000000000001', username: 'aulus', global_name: 'Aulus' },
    refuseDm: new Set(),
    down: false,
    slowDown: 0,
    sent: [],
    codes: new Map(),     // code -> user
    tokens: new Map(),    // access token -> user
    accessTokens: [],
    threads: 0,
    base: null
  }
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const raw = Buffer.concat(chunks).toString('utf8')
    const url = new URL(req.url, 'http://standin')
    const json = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(body === null ? '' : JSON.stringify(body)) }

    // ── Signing in ──
    if (req.method === 'GET' && url.pathname === '/oauth2/authorize') {
      if (url.searchParams.get('client_id') !== CLIENT_ID || url.searchParams.get('scope') !== 'identify') return json(400, { error: 'invalid_request' })
      const code = `code-${s.codes.size + 1}`
      s.codes.set(code, { ...s.user })
      const back = new URL(url.searchParams.get('redirect_uri'))
      back.searchParams.set('code', code)
      back.searchParams.set('state', url.searchParams.get('state'))
      res.writeHead(302, { Location: back.toString() })
      return res.end()
    }
    if (req.method === 'POST' && url.pathname === '/oauth2/token') {
      const form = new URLSearchParams(raw)
      const user = s.codes.get(form.get('code'))
      if (form.get('client_secret') !== CLIENT_SECRET || form.get('client_id') !== CLIENT_ID || !user || form.get('grant_type') !== 'authorization_code') return json(401, { error: 'invalid_grant' })
      s.codes.delete(form.get('code'))
      const token = `standin-access-${s.tokens.size + 1}-secret`
      s.tokens.set(token, user)
      s.accessTokens.push(token)
      return json(200, { access_token: token, token_type: 'Bearer', scope: 'identify' })
    }
    if (req.method === 'GET' && url.pathname === '/users/@me') {
      const user = s.tokens.get(String(req.headers.authorization ?? '').replace(/^Bearer /, ''))
      return user ? json(200, { ...user, avatar: 'abc123' }) : json(401, { message: '401: Unauthorized' })
    }

    // ── The bot ──
    if (req.headers.authorization !== `Bot ${BOT_TOKEN}`) return json(401, { message: '401: Unauthorized' })
    const body = raw ? JSON.parse(raw) : null
    s.sent.push({ method: req.method, path: url.pathname, body })
    if (s.hang) return   // never answered (the client gives up on it)
    if (s.down) return json(503, { message: 'down' })
    if (s.slowDown > 0) { s.slowDown--; return json(429, { message: 'You are being rate limited.', retry_after: 0.01, global: false }) }
    if (req.method === 'POST' && url.pathname === '/users/@me/channels') return json(200, { id: `dm-${body.recipient_id}`, type: 1 })
    const message = url.pathname.match(/^\/channels\/([^/]+)\/messages$/)
    if (req.method === 'POST' && message) {
      const user = message[1].startsWith('dm-') ? message[1].slice(3) : null
      if (user && s.refuseDm.has(user)) return json(403, { message: 'Cannot send messages to this user', code: 50007 })
      return json(200, { id: `m-${s.sent.length}`, channel_id: message[1], content: body.content })
    }
    const thread = url.pathname.match(/^\/channels\/([^/]+)\/threads$/)
    if (req.method === 'POST' && thread) return json(201, { id: `thread-${++s.threads}`, name: body.name, type: body.type, parent_id: thread[1] })
    if (req.method === 'PUT' && /^\/guilds\/[^/]+\/members\/[^/]+\/roles\/[^/]+$/.test(url.pathname)) return json(204, null)
    return json(404, { message: 'Unknown' })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  s.base = `http://127.0.0.1:${server.address().port}`
  s.close = () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve) })
  // Only the bot's calls of a kind.
  s.dms = () => s.sent.filter(c => c.method === 'POST' && /^\/channels\/dm-/.test(c.path))
  s.posts = () => s.sent.filter(c => c.method === 'POST' && /^\/channels\/thread-[^/]+\/messages$/.test(c.path))
  return s
}

/** The game's settings for a stand-in (as the host's environment would hold them). */
function standinEnv(s, extra = {}) {
  return {
    DISCORD_CLIENT_ID: CLIENT_ID,
    DISCORD_CLIENT_SECRET: CLIENT_SECRET,
    DISCORD_TOKEN: BOT_TOKEN,
    DISCORD_GUILD_ID: '1420824208270823476',
    DISCORD_BATTLES_CHANNEL_ID: '555',
    PUBLIC_URL: 'http://127.0.0.1:1',
    SESSION_SECRET: 'standin-session-secret-do-not-log',
    DISCORD_API_URL: s.base,
    DISCORD_AUTHORIZE_URL: `${s.base}/oauth2/authorize`,
    ...extra
  }
}

module.exports = { startStandin, standinEnv, CLIENT_SECRET, BOT_TOKEN }
