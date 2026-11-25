// src/web/signin.js
//
// The web's side of Discord: signing in, the account, and the hooks where
// battles change. Made only when Discord is configured (src/discord/
// config.js); with no settings there is none of this, and the game is as it
// was: no sign-in button, no routes, nothing sent.
//
//   GET  /auth/discord?then=/officers   to Discord to sign in (scope identify)
//   GET  /auth/discord/callback         back from Discord: the state checked,
//                                       who he is read, the session cookie set
//   POST /auth/signout                  the session cookie cleared
//   GET  /api/me                        who is signed in: name and avatar, or
//                                       no one; and the page's words for it
//   POST /api/me/keep { commanders, seats }
//                                       the links this browser holds, added
//                                       to his account; answered with all
//                                       his account holds
//
// Signing in is offered, never required: a player who does not plays by
// link, as before.

const { discordConfig, describe } = require('../discord/config')
const { createDiscordClient, whoSignedIn } = require('../discord/client')
const { createNotices } = require('../discord/notices')
const { createAccountStore } = require('./accounts')
const { createSessions } = require('./session')
const { DISCORD } = require('../narrator/words')

const TOKEN = /^[A-Za-z0-9_-]{8,64}$/
const SWEEP_MS = 10 * 60 * 1000

// Where to go back to after signing in: a page of this game, never another site.
const backTo = (then) => (typeof then === 'string' && /^\/[A-Za-z0-9/_?=&.-]*$/.test(then) && !then.startsWith('//') ? then : '/')

function reply(res, status, body, headers = {}) {
  const json = typeof body !== 'string'
  res.writeHead(status, {
    'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers
  })
  res.end(json ? JSON.stringify(body) : body)
}
const redirect = (res, location, cookies = []) => reply(res, 302, '', { Location: location, ...(cookies.length ? { 'Set-Cookie': cookies } : {}) })

/**
 * @param {Object} o
 *   config   discordConfig(env); null: no Discord (returns null)
 *   store    the battle store
 *   now      the server's clock (sessions, reminders)
 *   log      where plain lines go (never a secret)
 *   client   options for the Discord client (tests: quick pauses)
 */
function createDiscordWeb({ config, store, now = () => Date.now(), log = console.error, client: clientOptions = {} }) {
  if (!config) return null
  const accounts = createAccountStore({ storage: store.storage, now })
  const sessions = config.signIn ? createSessions({ secret: config.signIn.sessionSecret, secure: config.secure, now }) : null
  const client = config.bot ? createDiscordClient({ api: config.api, token: config.bot.token, log, ...clientOptions }) : null
  const notices = client ? createNotices({ store, accounts, client, config, now }) : null
  const redirectUri = `${config.publicUrl}/auth/discord/callback`

  const who = (req) => (sessions ? sessions.who(req) : null)
  const signedIn = (req) => {
    const id = who(req)
    return id ? accounts.get(id) : null
  }

  // What his account holds, as this browser keeps it: his Commanders' links,
  // and his battles' (with their titles and sides, as the server has them).
  function holdings(account) {
    return {
      commanders: account.commanders.filter(t => store.commanders.get(t)),
      seats: account.seats.map(t => store.summary(t)).filter(Boolean).map(s => ({ token: s.token, title: s.title, side: s.side }))
    }
  }

  function keep(account, { commanders = [], seats = [] }) {
    const added = accounts.keep(account.id, {
      commanders: commanders.filter(t => TOKEN.test(t) && store.commanders.get(t)),
      seats: seats.filter(t => TOKEN.test(t) && store.seatOf(t))
    })
    for (const t of added.commanders) notices?.giveRole(account.id, t)
  }

  const meWords = () => ({ signIn: DISCORD.signIn, signInNote: DISCORD.signInNote, signOut: DISCORD.signOut, signOutNote: DISCORD.signOutNote })

  /** Its routes; true when the request was one of them. */
  async function route(req, res, url, readBody) {
    if (!sessions) return false
    const path = url.pathname
    if (req.method === 'GET' && path === '/auth/discord') {
      const { state, cookie } = sessions.startSignIn(backTo(url.searchParams.get('then')))
      const to = new URL(config.authorize)
      to.search = new URLSearchParams({ response_type: 'code', client_id: config.signIn.clientId, scope: 'identify', state, redirect_uri: redirectUri, prompt: 'none' }).toString()
      redirect(res, to.toString(), [cookie])
      return true
    }
    if (req.method === 'GET' && path === '/auth/discord/callback') {
      const back = sessions.checkSignIn(req, url.searchParams.get('state'))
      if (!back) { reply(res, 400, DISCORD.signInFailed, { 'Set-Cookie': [sessions.endSignIn()] }); return true }
      const code = url.searchParams.get('code')
      // He said no on Discord's page: back where he was, not signed in.
      if (!code) { redirect(res, back, [sessions.endSignIn()]); return true }
      try {
        const me = await whoSignedIn({ api: config.api, clientId: config.signIn.clientId, clientSecret: config.signIn.clientSecret, code, redirectUri })
        accounts.signedIn(me)
        await store.storage.flush()
        redirect(res, back, [sessions.endSignIn(), sessions.start(me.id)])
      } catch (error) {
        log(`Discord: a sign-in did not work (${error.status ? `Discord answered ${error.status}` : 'not saved or not answered'}).`)
        reply(res, 502, DISCORD.signInFailed, { 'Set-Cookie': [sessions.endSignIn()] })
      }
      return true
    }
    if (req.method === 'POST' && path === '/auth/signout') {
      reply(res, 200, { signedIn: false }, { 'Set-Cookie': [sessions.end()] })
      return true
    }
    if (req.method === 'GET' && path === '/api/me') {
      const account = signedIn(req)
      reply(res, 200, account
        ? { signedIn: true, name: account.name, avatar: account.avatar ?? null, said: DISCORD.signedInAs(account.name), words: meWords() }
        : { signedIn: false, words: meWords() })
      return true
    }
    if (req.method === 'POST' && path === '/api/me/keep') {
      const account = signedIn(req)
      if (!account) { reply(res, 401, { error: 'not signed in' }); return true }
      const body = await readBody(req)
      const list = (x) => (Array.isArray(x) ? x.slice(0, 200).map(String) : [])
      keep(account, { commanders: list(body.commanders), seats: list(body.seats) })
      try { await store.storage.flush() } catch { /* the server's own 503 is for play; his links are in memory */ }
      reply(res, 200, holdings(account))
      return true
    }
    return false
  }

  /**
   * A POST to the API has been answered OK (before its answer is sent, so
   * that what it remembers is saved with it). Sending is queued: nothing
   * here waits on Discord.
   */
  function afterPost(req, parts, status, body) {
    if (status >= 400) return
    try {
      const account = signedIn(req)
      if (parts[1] === 'battles' && parts.length === 2 && body?.seats) {
        // His own seat is the first; the other is his friend's to be given.
        const mine = Object.values(body.seats)[0]
        if (account && mine) keep(account, { seats: [mine] })
        if (mine && Object.keys(body.seats).length === 2) notices?.mustered(mine)
      }
      if (parts[1] === 'commanders' && parts.length === 2 && body?.token && account) keep(account, { commanders: [body.token] })
      if (parts[1] === 'seat' && parts[2]) {
        if (parts[3] === 'join' && account) keep(account, { seats: [parts[2]] })
        // A next day: his seat in it is his too.
        if (parts[3] === 'again' && account && body?.token) keep(account, { seats: [body.token] })
        notices?.changed(parts[2])
      }
    } catch (error) {
      log(`Discord: could not look over a change (${error.message}).`)
    }
  }

  /** What the tent shows of Discord: the battle's thread, if it has one. */
  const seatExtras = (token) => {
    const link = notices?.threadLink(token)
    return link ? { discord: link } : {}
  }

  let timer = null
  function start() {
    if (!notices || timer) return
    const sweep = () => { try { notices.sweep() } catch (error) { log(`Discord: could not look the battles over (${error.message}).`) } }
    setTimeout(sweep, 5000).unref()
    timer = setInterval(sweep, SWEEP_MS)
    timer.unref()
  }
  function stop() { if (timer) clearInterval(timer); timer = null }

  return { route, afterPost, seatExtras, start, stop, accounts, notices, idle: () => client?.idle() ?? Promise.resolve(), describe: () => describe(config) }
}

/** From the environment's settings, or null when Discord is not configured. */
function discordFromEnv(env, options) {
  return createDiscordWeb({ config: discordConfig(env), ...options })
}

module.exports = { createDiscordWeb, discordFromEnv }
