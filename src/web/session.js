// src/web/session.js
//
// Who is signed in, as a cookie the server signs with SESSION_SECRET
// (HMAC-SHA256): his Discord id and when it runs out. A cookie whose
// signature is wrong, or whose time has run out, is no one. Nothing else is
// in it: his links stay on the server, in his account.

const crypto = require('crypto')

const SESSION = 'cohort_session'
const STATE = 'cohort_signin'
const LIFETIME_DAYS = 30
const STATE_MINUTES = 10

const sign = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('base64url')
function same(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function cookiesOf(req) {
  const out = {}
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim()
  }
  return out
}

function cookie(name, value, { maxAge, secure, path = '/' }) {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

function createSessions({ secret, secure = false, now = () => Date.now() }) {
  /** The cookie that says he is signed in. */
  function start(id) {
    const body = Buffer.from(JSON.stringify({ id, until: now() + LIFETIME_DAYS * 86400000 })).toString('base64url')
    return cookie(SESSION, `${body}.${sign(secret, body)}`, { maxAge: LIFETIME_DAYS * 86400, secure })
  }
  const end = () => cookie(SESSION, '', { maxAge: 0, secure })

  /** His Discord id, or null: no cookie, a forged one, or one run out. */
  function who(req) {
    const value = cookiesOf(req)[SESSION]
    if (!value) return null
    const [body, signature] = value.split('.')
    if (!body || !signature || !same(signature, sign(secret, body))) return null
    try {
      const { id, until } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      return typeof id === 'string' && Number(until) > now() ? id : null
    } catch { return null }
  }

  // The sign-in's own short-lived cookie: the random state Discord must send
  // back, and the page to go back to.
  function startSignIn(back) {
    const state = crypto.randomBytes(18).toString('base64url')
    const value = `${state}.${Buffer.from(back).toString('base64url')}`
    return { state, cookie: cookie(STATE, `${value}.${sign(secret, value)}`, { maxAge: STATE_MINUTES * 60, secure, path: '/auth' }) }
  }
  const endSignIn = () => cookie(STATE, '', { maxAge: 0, secure, path: '/auth' })
  /** The page to go back to, if the state Discord sent back is this browser's; else null. */
  function checkSignIn(req, state) {
    const [kept, back, signature] = String(cookiesOf(req)[STATE] ?? '').split('.')
    if (!kept || !signature || !state || !same(signature, sign(secret, `${kept}.${back ?? ''}`)) || !same(kept, state)) return null
    return Buffer.from(back ?? '', 'base64url').toString('utf8') || '/'
  }

  return { start, end, who, startSignIn, endSignIn, checkSignIn }
}

module.exports = { createSessions, SESSION }
