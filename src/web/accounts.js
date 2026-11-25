// src/web/accounts.js
//
// Accounts: a player who has signed in with Discord. One document of kind
// "account" in storage.js, keyed by his Discord id: his Discord name (and
// avatar), and the links he holds, his Commanders' tokens and his seats'.
// Those links are secrets, as they are in a browser: an account is only
// ever shown to the player himself (signin.js), and to no one else.
//
// A player who never signs in has no account and plays as before, by link.

const LIMIT = 200   // links of each kind an account keeps, newest last

function createAccountStore({ storage, now = () => Date.now() }) {
  const accounts = new Map()   // discord id -> account
  for (const a of storage.all('account')) accounts.set(a.id, a)

  const save = (a) => storage.put('account', a.id, a)

  /** He has signed in: his account, made if new, his name kept fresh. */
  function signedIn({ id, name, avatar = null }) {
    const was = accounts.get(id)
    const account = { id, name, avatar, commanders: was?.commanders ?? [], seats: was?.seats ?? [], createdAt: was?.createdAt ?? now(), seenAt: now() }
    accounts.set(id, account)
    save(account)
    return account
  }

  const get = (id) => accounts.get(id) ?? null

  /**
   * Links he holds, added to his account (each once). Returns the links new
   * to it, so that whatever goes with a new Commander (his role) is done once.
   */
  function keep(id, { commanders = [], seats = [] } = {}) {
    const account = accounts.get(id)
    if (!account) return { commanders: [], seats: [] }
    const added = { commanders: commanders.filter(t => !account.commanders.includes(t)), seats: seats.filter(t => !account.seats.includes(t)) }
    if (!added.commanders.length && !added.seats.length) return added
    account.commanders = [...new Set([...account.commanders, ...added.commanders])].slice(-LIMIT)
    account.seats = [...new Set([...account.seats, ...added.seats])].slice(-LIMIT)
    save(account)
    return added
  }

  /** Whose a seat is, or a Commander's: the Discord id, or null. */
  function holderOf({ seat = null, commander = null }) {
    for (const a of accounts.values()) {
      if ((seat && a.seats.includes(seat)) || (commander && a.commanders.includes(commander))) return a.id
    }
    return null
  }

  return { signedIn, get, keep, holderOf }
}

module.exports = { createAccountStore }
