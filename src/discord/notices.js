// src/discord/notices.js
//
// What the bot tells players, and when: "your move" by direct message, and
// each battle's own thread in the battles channel. Only for a battle
// between two players; never against the computer (there the turn runs
// while he watches).
//
// A message says only what a player could know from outside the battle:
// the battle's title, that his orders are wanted, that a friend has joined,
// that night fell and the next day was called, that it is over and who won
// (as the verdict tells both). Never a dispatch, never the other side's
// doings. In the thread, which both read, not even whose orders are wanted
// in the middle of a day: that the battle stands for the other Commander is
// not his to know (ruled 2026-11-23, "both would only be notified when
// there are commands to give or things happen to them").
//
// Once per event: what has been sent is remembered on the battle's own
// saved document (`discord`), so a poll or a restart sends nothing again.
// A battle first seen with nothing remembered (one older than the bot) is
// taken as told: what it stands at now is marked and nothing is sent.
//
// The memory, on the battle (entry.discord):
//   sent     event -> when: 'joined', 'called', 'over', 'orders:<side>:<turn>'
//   wait     side -> { key, since, reminders, last }: his orders wanted since
//   friend   the side that joined by link (until it did)
//   thread   the battle's thread id, once made
//
// Sending never holds up play: everything goes through the client's queue
// (client.js), and a refusal or an outage changes nothing in the game.

const { DISCORD } = require('../narrator/words')
const ROLES = require('../data/discordRoles')

const DAY_MS = 24 * 60 * 60 * 1000
const REMINDERS = 3

// Discord's own markup, kept out of what a player named himself.
const plain = (text) => String(text ?? '').replace(/([\\*_~`|>])/g, '\\$1')

/**
 * @param {Object} o
 *   store     the battle store (battles.js)
 *   accounts  the account store (src/web/accounts.js)
 *   client    the Discord client (client.js)
 *   config    discordConfig(): publicUrl, bot { guildId, channelId }
 *   now       the server's clock (the engine never sees it)
 */
function createNotices({ store, accounts, client, config, now = () => Date.now() }) {
  const { publicUrl, bot } = config
  const tentOf = (token) => `${publicUrl}/b/${token}`
  const battleById = (id) => store.allBattles().find(e => e.id === id) ?? null

  function commanderOf(entry, side) {
    const id = entry.commanders?.[side]
    return id ? store.commanders.byId(id) : null
  }
  // Whose side this is on Discord (his id), if he has an account. A next
  // day's seat is new; he is found by the day before's, and it is kept.
  function holderOf(entry, side, previous = null) {
    const seat = entry.seats[side]
    const found = accounts.holderOf({ seat, commander: commanderOf(entry, side)?.token ?? null })
    if (found || !previous?.seats?.[side]) return found
    const before = accounts.holderOf({ seat: previous.seats[side] })
    if (before && seat) accounts.keep(before, { seats: [seat] })
    return before
  }
  // A player as the thread names him: a mention if he has signed in, else
  // his Commander, else "a friend".
  function label(entry, side, previous) {
    const holder = holderOf(entry, side, previous)
    if (holder) return { text: `<@${holder}>`, users: [holder] }
    const commander = commanderOf(entry, side)
    return { text: commander ? DISCORD.commander(plain(commander.name)) : DISCORD.friend, users: [] }
  }

  // ── Sending (queued) ─────────────────────────────

  function threadOf(id) { return battleById(id)?.discord?.thread ?? null }

  function post(entryId, content, users = []) {
    if (!bot.channelId) return
    client.enqueue('a post in a battle\'s thread', async () => {
      const thread = threadOf(entryId)
      if (thread) await client.send(thread, content, users)
    })
  }

  function makeThread(entry, first, users) {
    if (!bot.channelId) return
    const id = entry.id
    client.enqueue('a battle\'s thread', async () => {
      if (threadOf(id)) return
      const made = await client.thread(bot.channelId, entry.title)
      const now_ = battleById(id)
      if (!made?.id || !now_) return
      store.remember(id, { ...(now_.discord ?? {}), thread: String(made.id) })
      await client.send(String(made.id), first, users)
    })
  }

  // A direct message; if Discord refuses it (he does not share the server
  // with the bot, or takes no messages), `fallback` is posted in the thread
  // instead, when there is one that both may read.
  function dm(entryId, holder, content, fallback = null) {
    client.enqueue('a direct message', async () => {
      try {
        const channel = await client.openDm(holder)
        await client.send(String(channel.id), content)
      } catch (error) {
        const refused = typeof error.status === 'number' && error.status >= 400 && error.status < 500
        const thread = threadOf(entryId)
        if (!refused || !fallback || !thread) throw error
        await client.send(thread, fallback, [holder])
      }
    })
  }

  // ── Deciding what to send ────────────────────────

  /**
   * A battle has changed (or the server is looking it over): send what is
   * new, once. `actor` is the side whose own request changed it: he is
   * looking at it, and is sent nothing for it.
   *   fresh     a battle made under the bot: nothing remembered yet is
   *             nothing told yet (not an old battle to mark as told)
   *   previous  the day before, for a next day's battle
   */
  function consider(entry, actor = null, { fresh = false, previous = null } = {}) {
    if (!entry || entry.auto || !entry.seats) return
    const sides = Object.keys(entry.seats)
    if (sides.length !== 2 || sides.some(s => !entry.seats[s])) return
    const baseline = !entry.discord && !fresh
    const memo = JSON.parse(JSON.stringify(entry.discord ?? { sent: {}, wait: {}, friend: entry.joining ?? null, thread: null }))
    const before = JSON.stringify(memo)
    const at = now()
    const title = entry.title
    const summary = Object.fromEntries(sides.map(s => [s, store.summary(entry.seats[s])]))
    const other = (side) => sides.find(s => s !== side)
    const dms = new Map()   // side -> { lines: [], fallback }
    const tell = (side, line, fallback = null) => {
      const d = dms.get(side) ?? { lines: [], fallback: null }
      d.lines.push(line)
      d.fallback = d.fallback ?? fallback
      dms.set(side, d)
    }
    const fresh_ = (key) => {
      if (memo.sent[key]) return false
      memo.sent[key] = at
      return true
    }
    const wanted = (side) => summary[side]?.status === 'your-orders'
    const ordersKey = (side) => `orders:${side}:${summary[side].turn}`
    const over = summary[sides[0]]?.outcome

    // The friend has not come yet: there is nothing to tell. (On a next
    // day, the side called out is told even before it chooses who leads.)
    const open = !entry.joining || entry.calledBy
    if (open) {
      // A friend has joined: the thread is made, and the one who mustered told.
      if (!entry.calledBy && fresh_('joined')) {
        const creator = sides.find(s => s !== memo.friend) ?? sides[0]
        const a = label(entry, creator, previous)
        const b = label(entry, other(creator), previous)
        if (!baseline) makeThread(entry, DISCORD.threadFirst(a.text, b.text, plain(title)), [...a.users, ...b.users])
        const orders = wanted(creator) && fresh_(ordersKey(creator))
        tell(creator, DISCORD.joined(title, orders), orders ? DISCORD.threadWanted(a.text) : null)
      }
      // The next day was called: the other side is called out.
      if (entry.calledBy && fresh_('called')) {
        const called = other(entry.calledBy)
        const by = label(entry, entry.calledBy, previous)
        const them = label(entry, called, previous)
        if (!baseline) post(entry.id, DISCORD.threadCalled(by.text, them.text, entry.day ?? 2), [...by.users, ...them.users])
        if (wanted(called)) fresh_(ordersKey(called))
        tell(called, DISCORD.calledOut(title, entry.day ?? 2), DISCORD.threadWanted(them.text))
      }
      // His orders are wanted.
      for (const side of sides) {
        if (!wanted(side)) { delete memo.wait[side]; continue }
        const key = ordersKey(side)
        if (memo.wait[side]?.key !== key) memo.wait[side] = { key, since: at, reminders: 0, last: null }
        // Both are asked for the day's first orders, so the thread may say it then.
        if (fresh_(key)) tell(side, DISCORD.wanted(title), summary[side].turn === 1 ? DISCORD.threadWanted(label(entry, side, previous).text) : null)
      }
      // The battle is over: each side as its verdict says, the thread for both.
      if (over?.decided && fresh_('over')) {
        memo.wait = {}
        const night = over.reason === 'night fell'
        const draw = !night && (over.winner === 'draw' || !sides.includes(over.winner))
        for (const side of sides) {
          tell(side, night ? DISCORD.over.night(title) : draw ? DISCORD.over.draw(title) : over.winner === side ? DISCORD.over.won(title) : DISCORD.over.lost(title))
        }
        const winner = !night && !draw ? label(entry, over.winner, previous) : null
        if (!baseline) post(entry.id, night ? DISCORD.threadOver.night : draw ? DISCORD.threadOver.draw : DISCORD.threadOver.won(winner.text), winner?.users ?? [])
      }
    }

    // Sent: one message a side, to those who have an account, but never to
    // the side whose own request this was.
    if (!baseline) {
      for (const [side, d] of dms) {
        if (side === actor) continue
        const holder = holderOf(entry, side, previous)
        if (!holder) continue
        dm(entry.id, holder, `${d.lines.join('\n')}\n${DISCORD.tent(tentOf(entry.seats[side]))}`, d.fallback)
      }
    }
    if (JSON.stringify(memo) !== before || !entry.discord) store.remember(entry.id, memo)

    // The next day's battle, once there is one: the same thread goes on.
    if (entry.next) {
      const next = battleById(entry.next)
      if (next && !next.discord && !baseline) {
        store.remember(next.id, { sent: {}, wait: {}, friend: null, thread: memo.thread ?? threadOf(entry.id) })
      }
      if (next) consider(next, actor, { previous: entry })
    }
  }

  /** A battle has just been mustered against a friend: remember it from the start. */
  function mustered(token) {
    const seat = store.seatOf(token)
    if (seat?.entry && !seat.entry.auto) consider(seat.entry, seat.side, { fresh: true })
  }

  /** A seat's request changed its battle (orders, joining, a next day...). */
  function changed(token) {
    const seat = store.seatOf(token)
    if (seat?.entry) consider(seat.entry, seat.side)
  }

  /**
   * Looked over every so often (and at start): a player who has not
   * answered in a day is reminded, once a day, three times in all for one
   * wait.
   */
  function sweep() {
    for (const entry of store.allBattles()) {
      if (entry.auto) continue
      consider(entry, null)
      const memo = entry.discord
      if (!memo || entry.game.outcome.decided) continue
      let changed_ = false
      const wait = { ...(memo.wait ?? {}) }
      for (const [side, w] of Object.entries(wait)) {
        if (!w || w.reminders >= REMINDERS || now() - (w.last ?? w.since) < DAY_MS) continue
        const holder = holderOf(entry, side)
        if (!holder) continue
        wait[side] = { ...w, reminders: w.reminders + 1, last: now() }
        changed_ = true
        dm(entry.id, holder, `${DISCORD.reminder(entry.title)}\n${DISCORD.tent(tentOf(entry.seats[side]))}`)
      }
      if (changed_) store.remember(entry.id, { ...memo, wait })
    }
  }

  /** The battle's thread, for the tent: a link, or nothing. */
  function threadLink(token) {
    const thread = store.seatOf(token)?.entry?.discord?.thread
    return thread ? { thread: `https://discord.com/channels/${bot.guildId}/${thread}`, said: DISCORD.thread } : null
  }

  /** A signed-in player made a Commander: his kind's role, if the bot may. */
  function giveRole(holder, commanderToken) {
    const kind = store.commanders.get(commanderToken)?.kind
    const role = kind ? ROLES[bot.guildId]?.[kind] : null
    if (!role) return
    client.enqueue('a Commander\'s role', () => client.giveRole(bot.guildId, holder, role))
  }

  return { consider, mustered, changed, sweep, threadLink, giveRole, idle: client.idle }
}

module.exports = { createNotices, DAY_MS, REMINDERS }
