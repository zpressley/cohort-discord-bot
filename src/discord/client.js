// src/discord/client.js
//
// Discord's HTTP API with Node's own fetch: no Discord library, no gateway,
// no websocket. Two halves:
//
//   sign-in   exchange the code Discord gave the browser for who he is
//             (asked while he waits on the sign-in page; never during play)
//   the bot   open a direct message, send a message, make a thread, give a
//             role. These go through one queue, one at a time, and never
//             hold up the game: a call that fails is tried again a few
//             times with a pause (Discord's own "retry after" when it says
//             to slow down), then dropped with a plain log line.
//
// Nothing secret is ever logged: not the bot token, not the client secret,
// not a player's access token, and not a message (it carries his tent's link).

const sleepFor = (ms) => new Promise(resolve => setTimeout(resolve, ms))

class DiscordError extends Error {
  constructor(status, code = null) {
    super(`Discord answered ${status}${code ? ` (code ${code})` : ''}`)
    this.status = status
    this.code = code
  }
}

/**
 * @param {Object} o
 *   api       the API's base address (Discord's, or a stand-in's)
 *   token     the bot's token, or null (no bot calls)
 *   tries     attempts of one call before it is given up
 *   pause     ms to wait after the nth failure
 *   sleep     how to wait (tests make it quick)
 *   log       where plain lines go
 *   timeout   ms before one call is given up as not answered
 */
function createDiscordClient({ api, token = null, tries = 4, pause = (n) => 1000 * 2 ** (n - 1), sleep = sleepFor, log = console.error, timeout = 10000 } = {}) {
  // ── One call, tried again on a failure worth trying again ──
  async function call(method, path, body = null) {
    for (let attempt = 1; ; attempt++) {
      let res
      try {
        res = await fetch(`${api}${path}`, {
          method,
          headers: { Authorization: `Bot ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), 'User-Agent': 'DiscordBot (cohort, 1)' },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeout)
        })
      } catch {
        // Not answered at all: Discord down, or the network.
        if (attempt >= tries) throw new DiscordError('no answer')
        await sleep(pause(attempt))
        continue
      }
      if (res.ok) return res.status === 204 ? null : res.json().catch(() => null)
      const data = await res.json().catch(() => ({}))
      if (res.status === 429 && attempt < tries) {
        // Slow down: as long as Discord says, within reason.
        const after = Number(data?.retry_after ?? res.headers.get('retry-after'))
        await sleep(Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : pause(attempt), 60000))
        continue
      }
      if (res.status >= 500 && attempt < tries) { await sleep(pause(attempt)); continue }
      throw new DiscordError(res.status, data?.code ?? null)
    }
  }

  // ── The queue: one job at a time; a job may make several calls ──
  const jobs = []
  let running = null
  function enqueue(label, job) {
    jobs.push({ label, job })
    if (!running) running = drain()
    return running
  }
  async function drain() {
    while (jobs.length) {
      const { label, job } = jobs.shift()
      try { await job() } catch (error) {
        log(`Discord: ${label} not sent (${error instanceof DiscordError ? error.message : 'it failed'}); dropped.`)
      }
    }
    running = null
  }
  /** A promise: everything queued so far has been tried. */
  const idle = async () => { while (running) await running }

  return {
    enqueue,
    idle,
    // The bot's calls (inside a job).
    openDm: (userId) => call('POST', '/users/@me/channels', { recipient_id: userId }),
    send: (channelId, content, users = []) => call('POST', `/channels/${channelId}/messages`, {
      content: content.slice(0, 2000),
      // Only those named are pinged; never @everyone, whatever a name says.
      allowed_mentions: { parse: [], users }
    }),
    // A public thread in the channel (type 11), kept a week after it goes quiet.
    thread: (channelId, name) => call('POST', `/channels/${channelId}/threads`, { name: name.slice(0, 100), type: 11, auto_archive_duration: 10080 }),
    giveRole: (guildId, userId, roleId) => call('PUT', `/guilds/${guildId}/members/${userId}/roles/${roleId}`)
  }
}

/**
 * Signing in: the code Discord gave the browser, for who he is. Asked once,
 * while he waits; his access token is used for this and thrown away.
 * @returns {{ id, name, avatar }} or throws
 */
async function whoSignedIn({ api, clientId, clientSecret, code, redirectUri, timeout = 10000 }) {
  const tokenRes = await fetch(`${api}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(timeout)
  })
  if (!tokenRes.ok) throw new DiscordError(tokenRes.status)
  const { access_token: accessToken, token_type: type = 'Bearer' } = await tokenRes.json()
  if (!accessToken) throw new DiscordError('no token')
  const meRes = await fetch(`${api}/users/@me`, { headers: { Authorization: `${type} ${accessToken}` }, signal: AbortSignal.timeout(timeout) })
  if (!meRes.ok) throw new DiscordError(meRes.status)
  const me = await meRes.json()
  if (!/^\d{1,25}$/.test(String(me.id ?? ''))) throw new DiscordError('no id')
  return {
    id: String(me.id),
    name: String(me.global_name || me.username || 'Discord user').slice(0, 60),
    avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${encodeURIComponent(me.avatar)}.png?size=64` : null
  }
}

module.exports = { createDiscordClient, whoSignedIn, DiscordError }
