// src/web/tests/discord.test.js
//
// Discord, against a stand-in (fixtures/discord-standin.js; no test reaches
// the real Discord): signing in and the session; the account that carries
// a player's Commanders to another browser; "your move" by direct message,
// once per event and never against the computer; the reminder after a day;
// each battle's thread; fog of war over everything sent; Discord failing
// changing nothing in play; and no secret in a log or an answer. And with
// no Discord settings, none of it.
//
// The Postgres test (an account saved and read back) needs
// TEST_DATABASE_URL, as the storage tests do.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { createDiscordWeb } = require('../signin')
const { discordConfig } = require('../../discord/config')
const { createFileStorage, openStorage, poolSettings } = require('../storage')
const { createAccountStore } = require('../accounts')
const { waitingOn } = require('../../engine/orchestrator')
const { startStandin, standinEnv, CLIENT_SECRET, BOT_TOKEN } = require('./fixtures/discord-standin')

const DAY = 24 * 60 * 60 * 1000
const SESSION_SECRET = standinEnv({ base: '' }).SESSION_SECRET

const A = { id: '100000000000000001', username: 'aulus', global_name: 'Aulus' }
const B = { id: '200000000000000002', username: 'brennus', global_name: 'Brennus' }

/**
 * The game with Discord pointed at a stand-in. `clock` is the server's
 * (sessions, reminders); calls to the stand-in are not paused between tries.
 */
async function start({ standin, env = standinEnv(standin), dir = null, clock = { t: 1_800_000_000_000 }, client = {} } = {}) {
  const logs = []
  const now = () => clock.t
  const storage = createFileStorage(dir)
  const store = createBattleStore({ storage, now })
  const discord = createDiscordWeb({ config: discordConfig(env), store, now, log: (line) => logs.push(line), client: { sleep: () => Promise.resolve(), pause: () => 1, ...client } })
  const server = createServer(store, { discord })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const answers = []
  const api = async (method, url, body, cookie = null) => {
    const res = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    answers.push(text, ...res.headers.getSetCookie())
    let parsed = text
    try { parsed = JSON.parse(text) } catch { /* text */ }
    return { status: res.status, body: parsed, headers: res.headers }
  }
  return { server, base, api, store, discord, logs, clock, answers, close: () => new Promise(resolve => server.close(resolve)) }
}

// Signing in, as the browser does it: to the game, to Discord (the stand-in
// sends him straight back), back to the game. Returns his session cookie.
async function signIn(app, standin, user, then = '/officers') {
  standin.user = user
  const first = await fetch(`${app.base}/auth/discord?then=${encodeURIComponent(then)}`, { redirect: 'manual' })
  assert.equal(first.status, 302)
  const state = first.headers.getSetCookie().find(c => c.startsWith('cohort_signin='))
  const atDiscord = await fetch(first.headers.get('location'), { redirect: 'manual' })
  const back = new URL(atDiscord.headers.get('location'))
  const done = await fetch(`${app.base}${back.pathname}${back.search}`, { redirect: 'manual', headers: { Cookie: state.split(';')[0] } })
  assert.equal(done.status, 302, 'signed in, and sent back')
  assert.equal(done.headers.get('location'), then)
  const session = done.headers.getSetCookie().find(c => c.startsWith('cohort_session=') && !c.startsWith('cohort_session=;'))
  assert.ok(session, 'a session cookie')
  return session.split(';')[0]
}

// Every side that is wanted sends its orders, until the battle is decided
// or `turns` stops have passed.
async function play(app, seats, { text = 'everyone hold', turns = 40, cookies = {} } = {}) {
  const game = app.store.seatOf(Object.values(seats)[0]).entry.game
  for (let i = 0; i < turns && !game.outcome.decided; i++) {
    for (const side of waitingOn(game)) await app.api('POST', `/api/seat/${seats[side]}/orders`, { text }, cookies[side])
  }
  return game
}

// A battle between Aulus (red, mustering) and Brennus (blue, joining), both signed in.
async function twoPlayers(app, standin, { turnLimit = 4, seed = 7 } = {}) {
  const a = await signIn(app, standin, A)
  const b = await signIn(app, standin, B)
  const made = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed, turnLimit, faction: 'rome', enemyFaction: 'parthia' }, a)).body
  const joined = await app.api('POST', `/api/seat/${made.seats.blue}/join`, { commander: null, faction: 'parthia' }, b)
  assert.equal(joined.status, 200)
  await app.discord.idle()
  return { a, b, seats: made.seats, cookies: { red: a, blue: b } }
}

const dmsTo = (standin, user) => standin.dms().filter(c => c.path === `/channels/dm-${user.id}/messages`)

// ── Signing in ─────────────────────────────────────

test('sign-in round trip: to Discord with scope identify and a state, back, and signed in by name', async () => {
  const standin = await startStandin()
  const app = await start({ standin })
  try {
    const first = await app.api('GET', '/auth/discord?then=/officers')
    const to = new URL(first.headers.get('location'))
    assert.equal(to.origin + to.pathname, `${standin.base}/oauth2/authorize`)
    assert.equal(to.searchParams.get('scope'), 'identify')
    assert.equal(to.searchParams.get('redirect_uri'), 'http://127.0.0.1:1/auth/discord/callback')
    assert.ok(to.searchParams.get('state').length >= 20, 'a random state')
    const stateCookie = first.headers.getSetCookie()[0]
    assert.match(stateCookie, /HttpOnly/)
    assert.match(stateCookie, /SameSite=Lax/)
    assert.match(stateCookie, /Max-Age=600/)

    assert.deepEqual((await app.api('GET', '/api/me')).body.signedIn, false)
    const cookie = await signIn(app, standin, A)
    const me = (await app.api('GET', '/api/me', null, cookie)).body
    assert.equal(me.signedIn, true)
    assert.equal(me.name, 'Aulus')
    assert.equal(me.said, 'Signed in as Aulus')
    assert.match(me.avatar, /^https:\/\/cdn\.discordapp\.com\/avatars\/100000000000000001\//)
    assert.deepEqual(Object.keys(me).sort(), ['avatar', 'name', 'said', 'signedIn', 'words'], 'name and avatar only')

    const out = await app.api('POST', '/auth/signout', null, cookie)
    assert.match(out.headers.getSetCookie()[0], /^cohort_session=; .*Max-Age=0/)
  } finally { await app.close(); await standin.close() }
})

test('the session cookie is HttpOnly and SameSite=Lax, and Secure when the game is on https', async () => {
  const standin = await startStandin()
  const app = await start({ standin, env: standinEnv(standin, { PUBLIC_URL: 'https://cohort.example' }) })
  try {
    standin.user = A
    const first = await app.api('GET', '/auth/discord')
    const state = first.headers.getSetCookie()[0].split(';')[0]
    const back = new URL((await fetch(first.headers.get('location'), { redirect: 'manual' })).headers.get('location'))
    const done = await app.api('GET', back.pathname + back.search, null, state)
    const session = done.headers.getSetCookie().find(c => c.startsWith('cohort_session='))
    assert.match(session, /HttpOnly/)
    assert.match(session, /SameSite=Lax/)
    assert.match(session, /Secure/)
    assert.match(session, /Max-Age=2592000/, 'thirty days')
  } finally { await app.close(); await standin.close() }
})

test('the state check: a callback with no state cookie, or another state, signs no one in', async () => {
  const standin = await startStandin()
  const app = await start({ standin })
  try {
    const first = await app.api('GET', '/auth/discord')
    const state = first.headers.getSetCookie()[0].split(';')[0]
    const back = new URL((await fetch(first.headers.get('location'), { redirect: 'manual' })).headers.get('location'))
    // No cookie: someone else's link to the callback.
    const bare = await app.api('GET', back.pathname + back.search)
    assert.equal(bare.status, 400)
    assert.equal(bare.body, 'Signing in with Discord did not work. Go back to the game and try again.')
    assert.ok(!bare.headers.getSetCookie().some(c => /^cohort_session=[^;]/.test(c)))
    // Another state with this browser's cookie.
    const forged = new URL(back)
    forged.searchParams.set('state', 'not-the-state-that-was-sent-0000')
    const wrong = await app.api('GET', forged.pathname + forged.search, null, state)
    assert.equal(wrong.status, 400)
    assert.ok(!wrong.headers.getSetCookie().some(c => /^cohort_session=[^;]/.test(c)))
    // He said no on Discord's page: back, not signed in.
    const declined = await app.api('GET', `/auth/discord/callback?error=access_denied&state=${new URL(first.headers.get('location')).searchParams.get('state')}`, null, state)
    assert.equal(declined.status, 302)
    assert.ok(!declined.headers.getSetCookie().some(c => /^cohort_session=[^;]/.test(c)))
    // And the address to go back to is always this game's own.
    const away = await app.api('GET', '/auth/discord?then=//elsewhere.example/x')
    const awayState = away.headers.getSetCookie()[0].split(';')[0]
    const awayBack = new URL((await fetch(away.headers.get('location'), { redirect: 'manual' })).headers.get('location'))
    assert.equal((await app.api('GET', awayBack.pathname + awayBack.search, null, awayState)).headers.get('location'), '/')
  } finally { await app.close(); await standin.close() }
})

test('a forged or expired session is no one', async () => {
  const standin = await startStandin()
  const clock = { t: 1_800_000_000_000 }
  const app = await start({ standin, clock })
  try {
    const cookie = await signIn(app, standin, A)
    assert.equal((await app.api('GET', '/api/me', null, cookie)).body.signedIn, true)
    // Another id in the cookie, with the old signature.
    const [, value] = cookie.split('=')
    const [, signature] = value.split('.')
    const forgedBody = Buffer.from(JSON.stringify({ id: B.id, until: clock.t + DAY })).toString('base64url')
    assert.equal((await app.api('GET', '/api/me', null, `cohort_session=${forgedBody}.${signature}`)).body.signedIn, false)
    assert.equal((await app.api('GET', '/api/me', null, 'cohort_session=garbage')).body.signedIn, false)
    assert.equal((await app.api('POST', '/api/me/keep', { commanders: [] }, `cohort_session=${forgedBody}.${signature}`)).status, 401)
    // Thirty-one days on.
    clock.t += 31 * DAY
    assert.equal((await app.api('GET', '/api/me', null, cookie)).body.signedIn, false)
  } finally { await app.close(); await standin.close() }
})

// ── The account ────────────────────────────────────

test('an account gathers this browser\'s Commanders and battles, and gives them to another browser', async () => {
  const standin = await startStandin()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-discord-'))
  let app = await start({ standin, dir })
  try {
    // Before signing in, as today: links kept in this browser only.
    const commander = (await app.api('POST', '/api/commanders', { faction: 'rome', kind: 'threshold', holds: 'glory' })).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander })).body.seats.red
    const phone = await signIn(app, standin, A)
    const kept = (await app.api('POST', '/api/me/keep', { commanders: [commander, 'not-a-commander-token'], seats: [seat, 'not-a-seat-token'] }, phone)).body
    assert.deepEqual(kept.commanders, [commander], 'only links that are real are kept')
    assert.deepEqual(kept.seats.map(s => s.token), [seat])
    assert.equal(kept.seats[0].side, 'red')
    // His Commander's kind is given its role in the server.
    await app.discord.idle()
    assert.ok(standin.sent.some(c => c.method === 'PUT' && c.path === `/guilds/1420824208270823476/members/${A.id}/roles/1442245311094325322`), 'the Threshold\'s role (the old "gate")')

    // Made while signed in: kept without asking.
    const second = (await app.api('POST', '/api/commanders', { faction: 'parthia', kind: 'wind', holds: 'survival' }, phone)).body.token

    // Another browser, after a restart: he signs in, and his Commanders are there.
    await app.close()
    app = await start({ standin, dir })
    const laptop = await signIn(app, standin, A)
    const there = (await app.api('POST', '/api/me/keep', {}, laptop)).body
    assert.deepEqual(there.commanders, [commander, second])
    assert.deepEqual(there.seats.map(s => s.token), [seat])
    // Someone else's account holds none of them.
    const other = await signIn(app, standin, B)
    assert.deepEqual((await app.api('POST', '/api/me/keep', {}, other)).body, { commanders: [], seats: [] })
  } finally { await app.close(); await standin.close(); fs.rmSync(dir, { recursive: true, force: true }) }
})

const DB = process.env.TEST_DATABASE_URL || null
test('postgres: an account is saved and read back as it was', { skip: DB ? false : 'no database: set TEST_DATABASE_URL to run the Postgres tests' }, async () => {
  const table = `documents_discord_${process.pid}`
  try {
    let storage = await openStorage({ databaseUrl: DB, table, log: () => {} })
    let accounts = createAccountStore({ storage })
    accounts.signedIn({ id: A.id, name: 'Aulus', avatar: null })
    accounts.keep(A.id, { commanders: ['c1commander'], seats: ['s1seat-token'] })
    await storage.flush()
    await storage.close()
    storage = await openStorage({ databaseUrl: DB, table, log: () => {} })
    accounts = createAccountStore({ storage })
    assert.deepEqual({ ...accounts.get(A.id), createdAt: 0, seenAt: 0 }, { id: A.id, name: 'Aulus', avatar: null, commanders: ['c1commander'], seats: ['s1seat-token'], createdAt: 0, seenAt: 0 })
    assert.equal(accounts.holderOf({ seat: 's1seat-token' }), A.id)
    await storage.close()
  } finally {
    const { Pool } = require('pg')
    const pool = new Pool(poolSettings(DB))
    await pool.query(`drop table if exists ${table}`)
    await pool.end()
  }
})

// ── Not configured ─────────────────────────────────

test('with no Discord settings, none of it exists: no sign-in, no routes, nothing remembered on a battle', async () => {
  assert.equal(discordConfig({}), null)
  assert.equal(discordConfig({ DISCORD_CLIENT_ID: 'x' }), null, 'half a sign-in is none')
  assert.equal(createDiscordWeb({ config: null, store: createBattleStore({}) }), null)
  const store = createBattleStore({})
  const server = createServer(store)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    // The page asks who is signed in, and is told no one, with nothing to offer.
    assert.deepEqual(await (await fetch(`${base}/api/me`)).json(), { signedIn: false })
    assert.equal((await fetch(`${base}/api/me/keep`, { method: 'POST' })).status, 404)
    const page = await fetch(`${base}/auth/discord`, { redirect: 'manual' })
    assert.equal(page.status, 200, 'just the app\'s page')
    assert.equal(page.headers.get('location'), null)
    const seats = (await (await fetch(`${base}/api/battles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opponent: 'friend' }) })).json()).seats
    await fetch(`${base}/api/seat/${seats.blue}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const view = await (await fetch(`${base}/api/seat/${seats.red}`)).json()
    assert.equal(view.discord, undefined)
    assert.equal(store.seatOf(seats.red).entry.discord, undefined)
  } finally { await new Promise(resolve => server.close(resolve)) }
  // Each part works without the other.
  assert.equal(discordConfig({ DISCORD_TOKEN: 't', DISCORD_GUILD_ID: 'g', PUBLIC_URL: 'https://x' }).signIn, null)
  assert.equal(discordConfig({ DISCORD_CLIENT_ID: 'c', DISCORD_CLIENT_SECRET: 's', SESSION_SECRET: 'k', PUBLIC_URL: 'https://x' }).bot, null)
})

// ── Your move ──────────────────────────────────────

test('"your move" goes once when a side comes to be wanted, and not again on a poll or after a restart', async () => {
  const standin = await startStandin()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-discord-'))
  let app = await start({ standin, dir })
  try {
    const { seats, cookies } = await twoPlayers(app, standin)
    // The friend joined: the one who mustered is told, with his own tent's link.
    const toA = dmsTo(standin, A)
    assert.equal(toA.length, 1)
    assert.match(toA[0].body.content, /^Crownhill: Rome against Parthia: a friend has joined your battle\. Your orders are wanted\.\nYour tent: http:\/\/127\.0\.0\.1:1\/b\//)
    assert.ok(toA[0].body.content.endsWith(`/b/${seats.red}`))
    assert.deepEqual(dmsTo(standin, B), [], 'the friend who joined is in his tent: nothing to tell him')

    // Red sends; then blue, and the turn runs on blue's word: red is told
    // when he is wanted again, blue (who sent) is not.
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone hold' }, cookies.red)
    await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone hold' }, cookies.blue)
    await app.discord.idle()
    const red = (await app.api('GET', `/api/seat/${seats.red}/summary`)).body
    const blue = (await app.api('GET', `/api/seat/${seats.blue}/summary`)).body
    const wantedA = dmsTo(standin, A).filter(c => /: your orders are wanted\./.test(c.body.content))
    assert.equal(wantedA.length, red.status === 'your-orders' ? 1 : 0)
    assert.deepEqual(dmsTo(standin, B), [])
    assert.ok(red.status === 'your-orders' || blue.status === 'your-orders', 'the battle stopped for someone')
    const before = standin.sent.length

    // Polling sends nothing.
    for (let i = 0; i < 5; i++) {
      await app.api('GET', `/api/seat/${seats.red}/summary`)
      await app.api('GET', `/api/seat/${seats.red}`)
      await app.api('GET', `/api/seats?tokens=${seats.red},${seats.blue}`)
    }
    await app.discord.idle()
    assert.equal(standin.sent.length, before)

    // Nor a restart, nor the server looking the battles over after it.
    await app.close()
    app = await start({ standin, dir })
    app.discord.notices.sweep()
    await app.discord.idle()
    assert.equal(standin.sent.length, before)
    assert.equal(app.store.seatOf(seats.red).entry.discord.sent.joined > 0, true, 'what was sent is on the battle\'s saved document')
  } finally { await app.close(); await standin.close(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('"your move" never goes for a battle against the computer, and it has no thread', async () => {
  const standin = await startStandin()
  const app = await start({ standin })
  try {
    const a = await signIn(app, standin, A)
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, turnLimit: 3 }, a)).body.seats.red
    for (let i = 0; i < 6; i++) await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone advance' }, a)
    app.clock.t += 3 * DAY
    app.discord.notices.sweep()
    await app.discord.idle()
    assert.deepEqual(standin.sent, [])
    assert.equal(app.store.seatOf(seat).entry.discord, undefined)
    assert.equal((await app.api('GET', `/api/seat/${seat}`)).body.discord, undefined)
  } finally { await app.close(); await standin.close() }
})

test('the reminder: one after a day unanswered, no more than one a day, and three in all', async () => {
  const standin = await startStandin()
  const app = await start({ standin })
  try {
    const { seats } = await twoPlayers(app, standin)
    // Red answers; blue, who joined, goes quiet on the first turn.
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone hold' })
    assert.equal((await app.api('GET', `/api/seat/${seats.blue}/summary`)).body.status, 'your-orders')
    const reminders = () => dmsTo(standin, B).filter(c => /your orders are still wanted/.test(c.body.content))
    const sweep = async (hours) => { app.clock.t += hours * 3600000; app.discord.notices.sweep(); await app.discord.idle() }

    await sweep(23)
    assert.equal(reminders().length, 0, 'not before a day')
    await sweep(1.5)
    assert.equal(reminders().length, 1)
    assert.match(reminders()[0].body.content, new RegExp(`^Crownhill: Rome against Parthia: your orders are still wanted\\. The battle waits on you\\.\\nYour tent: .*/b/${seats.blue}$`))
    await sweep(1)
    await sweep(12)
    assert.equal(reminders().length, 1, 'one a day')
    await sweep(12)
    assert.equal(reminders().length, 2)
    await sweep(25)
    assert.equal(reminders().length, 3)
    await sweep(25)
    await sweep(25)
    assert.equal(reminders().length, 3, 'three in all')
    assert.equal(dmsTo(standin, A).filter(c => /still wanted/.test(c.body.content)).length, 0, 'red, who answered, is not reminded')
  } finally { await app.close(); await standin.close() }
})

// ── The thread ─────────────────────────────────────

test('the thread is made once, when the friend joins, named for the battle, with both players named', async () => {
  const standin = await startStandin()
  const app = await start({ standin })
  try {
    const { seats, cookies } = await twoPlayers(app, standin)
    await play(app, seats, { cookies, turns: 3 })
    await app.discord.idle()
    const made = standin.sent.filter(c => c.path === '/channels/555/threads')
    assert.equal(made.length, 1)
    assert.equal(made[0].body.name, 'Crownhill: Rome against Parthia')
    assert.equal(made[0].body.type, 11, 'a public thread')
    const first = standin.posts()[0]
    assert.equal(first.path, '/channels/thread-1/messages')
    assert.equal(first.body.content, `<@${A.id}> and <@${B.id}>: this is the thread for Crownhill: Rome against Parthia. Talk here as you like; your orders go in your tents.`)
    assert.deepEqual(first.body.allowed_mentions, { parse: [], users: [A.id, B.id] })
    // Each player's tent links to it.
    for (const side of ['red', 'blue']) {
      const view = (await app.api('GET', `/api/seat/${seats[side]}`)).body
      assert.deepEqual(view.discord, { thread: 'https://discord.com/channels/1420824208270823476/thread-1', said: 'Talk in this battle\'s thread on Discord' })
    }
  } finally { await app.close(); await standin.close() }
})

test('a player Discord will not message is named in the thread instead, and nothing in play changes', async () => {
  const standin = await startStandin()
  standin.refuseDm.add(A.id)
  const app = await start({ standin })
  try {
    const { seats } = await twoPlayers(app, standin)
    assert.ok(standin.posts().some(p => p.body.content === `<@${A.id}>, your orders are wanted.` && p.body.allowed_mentions.users[0] === A.id))
    assert.equal((await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone hold' })).status, 200)
    assert.equal((await app.api('GET', '/healthz')).status, 200)
  } finally { await app.close(); await standin.close() }
})

// ── Fog of war ─────────────────────────────────────

test('fog of war: nothing sent in a whole battle carries a dispatch, a unit, or the other side\'s link', async () => {
  const standin = await startStandin()
  const app = await start({ standin })
  try {
    const { seats, cookies } = await twoPlayers(app, standin, { turnLimit: 3 })
    // The first day, to nightfall, both advancing.
    let game = await play(app, seats, { cookies, text: 'everyone advance' })
    assert.equal(game.outcome.reason, 'night fell')
    // Red calls the next day; blue is called out.
    const next = (await app.api('POST', `/api/seat/${seats.red}/again`, null, cookies.red)).body
    await app.discord.idle()
    const nextSeats = { red: next.token, blue: app.store.seatOf(next.token).entry.seats.blue }
    assert.ok(dmsTo(standin, B).some(c => c.body.content.startsWith(`${next.title}: the enemy has called you out for a second day. Your orders are wanted.\nYour tent: `) && c.body.content.endsWith(nextSeats.blue)))
    // The second day: red yields, and blue has the field.
    await app.api('POST', `/api/seat/${nextSeats.red}/orders`, { text: 'yield' }, cookies.red)
    game = await play(app, nextSeats, { cookies })
    assert.ok(game.outcome.decided)
    await app.discord.idle()

    // Everything either side was told, and every unit either side has.
    const told = []
    const units = new Set()
    for (const token of [...Object.values(seats), ...Object.values(nextSeats)]) {
      const view = (await app.api('GET', `/api/seat/${token}`)).body
      for (const d of view.dispatches) told.push(...(d.lines ?? []).map(String), ...(d.text ? [String(d.text)] : []))
      for (const u of [...view.own, ...(view.enemies ?? []), ...(view.fallen ?? [])]) units.add(String(u.name).toLowerCase())
    }
    assert.ok(told.length > 5)
    const sent = standin.sent.filter(c => c.body?.content)
    if (process.env.DUMP_DISCORD) for (const c of sent) console.log(`${c.path}\n  ${c.body.content.replace(/\n/g, '\n  ')}`)
    assert.ok(sent.length >= 6)
    for (const call of sent) {
      const content = call.body.content
      for (const line of told) for (const piece of line.split(/(?<=[.:;])\s+/)) {
        if (piece.length >= 16) assert.ok(!content.includes(piece), `a dispatch's words sent to Discord: "${piece}"`)
      }
      for (const name of units) assert.ok(!content.toLowerCase().includes(name), `a unit named on Discord: "${name}"`)
      const linked = [...content.matchAll(/\/b\/([A-Za-z0-9_-]+)/g)].map(m => m[1])
      if (call.path.startsWith('/channels/thread-')) assert.deepEqual(linked, [], 'no tent\'s link where both read')
      else {
        const to = call.path.includes(A.id) ? 'red' : 'blue'
        for (const token of linked) assert.ok([seats[to], nextSeats[to]].includes(token), 'a player is sent his own tent only')
      }
    }
    // The battle's end, told as each verdict says, and in the thread for both.
    assert.ok(dmsTo(standin, B).some(c => c.body.content.startsWith(`${next.title}: the battle is over, and you have won.`)))
    assert.ok(standin.posts().some(p => p.body.content === `The battle is over. <@${B.id}> won.`))
    assert.ok(standin.posts().some(p => p.body.content === `Night fell. <@${A.id}> has called <@${B.id}> out for a second day.`))
    assert.ok(standin.posts().every(p => p.path === '/channels/thread-1/messages'), 'the next day goes on in the same thread')
  } finally { await app.close(); await standin.close() }
})

// ── Discord failing ────────────────────────────────

async function wholeBattle(app, standin, signedIn) {
  const a = signedIn ? await signIn(app, standin, A) : null
  const b = signedIn ? await signIn(app, standin, B) : null
  const made = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 11, turnLimit: 3 }, a)).body
  await app.api('POST', `/api/seat/${made.seats.blue}/join`, { commander: null }, b)
  await play(app, made.seats, { cookies: { red: a, blue: b }, text: 'everyone advance' })
  const views = {}
  for (const side of ['red', 'blue']) {
    const view = (await app.api('GET', `/api/seat/${made.seats[side]}`)).body
    views[side] = { battle: { ...view.battle, token: null, id: null }, dispatches: view.dispatches, own: view.own }
  }
  return views
}

test('Discord down, refusing or not answering changes nothing in play, and /healthz stays healthy', async () => {
  const quiet = await startStandin()
  const plain = await start({ standin: quiet })
  const expected = await wholeBattle(plain, quiet, false)
  await plain.close()
  await quiet.close()

  for (const how of ['down', 'slowDown', 'refuse']) {
    const standin = await startStandin()
    const app = await start({ standin })
    try {
      const cookieA = await signIn(app, standin, A)
      await signIn(app, standin, B)
      if (how === 'down') standin.down = true
      if (how === 'slowDown') standin.slowDown = 1000
      if (how === 'refuse') { standin.refuseDm.add(A.id); standin.refuseDm.add(B.id) }
      assert.ok(cookieA)
      const got = await wholeBattle(app, standin, true)
      assert.deepEqual(got, expected, `the same battle with Discord ${how}`)
      assert.equal((await app.api('GET', '/healthz')).status, 200)
      await app.discord.idle()
      if (how !== 'refuse') assert.ok(app.logs.some(l => /^Discord: .* not sent \(Discord answered (503|429)\); dropped\.$/.test(l)), `a plain line when Discord is ${how}`)
    } finally { await app.close(); await standin.close() }
  }
})

test('a turn\'s answer never waits on Discord, even when it does not answer at all', async () => {
  const standin = await startStandin()
  const app = await start({ standin, client: { timeout: 60000 } })
  try {
    const { seats } = await twoPlayers(app, standin)
    standin.hang = true
    const started = Date.now()
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone hold' })
    const ran = await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })
    assert.equal(ran.status, 200)
    assert.ok(Date.now() - started < 10000, 'answered while Discord says nothing')
    assert.equal((await app.api('GET', '/healthz')).status, 200)
  } finally { await app.close(); await standin.close() }
})

// ── Secrets ────────────────────────────────────────

test('secrets never appear in a log or in any answer', async () => {
  const standin = await startStandin()
  const printed = []
  const was = { log: console.log, error: console.error, warn: console.warn }
  console.log = (...a) => printed.push(a.join(' '))
  console.error = (...a) => printed.push(a.join(' '))
  console.warn = (...a) => printed.push(a.join(' '))
  let app
  try {
    app = await start({ standin })
    const { seats, cookies } = await twoPlayers(app, standin)
    standin.down = true
    await play(app, seats, { cookies, turns: 4 })
    await app.discord.idle()
    standin.down = false
    // A failed sign-in too.
    standin.user = A
    const first = await app.api('GET', '/auth/discord')
    const state = first.headers.getSetCookie()[0].split(';')[0]
    await app.api('GET', `/auth/discord/callback?code=no-such-code&state=${new URL(first.headers.get('location')).searchParams.get('state')}`, null, state)
  } finally {
    Object.assign(console, was)
    await app?.close()
    await standin.close()
  }
  const everything = [...printed, ...app.logs, ...app.answers].join('\n')
  assert.ok(app.logs.length > 0, 'something was logged')
  for (const secret of [CLIENT_SECRET, BOT_TOKEN, SESSION_SECRET, ...standin.accessTokens]) {
    assert.ok(!everything.includes(secret), 'a secret was logged or answered')
  }
  // And no log line carries a tent's link.
  for (const line of [...printed, ...app.logs]) assert.ok(!/\/b\/[A-Za-z0-9_-]{8,}/.test(line), `a link in a log line: ${line}`)
})
