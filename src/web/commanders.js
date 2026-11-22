// src/web/commanders.js
//
// Commanders, kept on the server: each is a private link (a token, as a
// battle's seat is) and a company of officers who go with him from battle
// to battle (engine/command/company.js). No accounts: the token lives in
// the player's browser. A player may keep several Commanders, and so have
// several battles going; each Commander's army fights one battle at a time
// (ruled 2026-11-22), so a Commander remembers which battle he is in.
//
// Saved one file a commander under <dir>/commanders, written whole each
// time it changes.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const { createCompany } = require('../engine/command/company')
const { gradeOf } = require('../engine/command/officers')
const { PLAIN } = require('../data/officers')

function createCommanderStore({ dir = null, now = () => Date.now() } = {}) {
  const folder = dir ? path.join(dir, 'commanders') : null
  const byToken = new Map()

  function save(commander) {
    if (!folder) return
    fs.mkdirSync(folder, { recursive: true })
    const file = path.join(folder, `${commander.id}.json`)
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(commander))
    fs.renameSync(`${file}.tmp`, file)
  }
  if (folder && fs.existsSync(folder)) {
    for (const name of fs.readdirSync(folder).filter(n => n.endsWith('.json')).sort()) {
      const commander = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'))
      byToken.set(commander.token, commander)
    }
  }

  // A name to tell one Commander from another, until how a Commander is
  // made is settled (docs/design/commanders-lore-and-tutorial.md): one no
  // other Commander here bears, while there are any left.
  function newName() {
    const taken = new Set([...byToken.values()].map(c => c.name))
    const free = PLAIN.filter(n => !taken.has(n))
    const pool = free.length ? free : PLAIN
    return pool[crypto.randomInt(pool.length)]
  }

  /** A new Commander with an empty company. */
  function create() {
    const commander = {
      id: crypto.randomBytes(6).toString('hex'),
      token: crypto.randomBytes(18).toString('base64url'),
      name: newName(),
      createdAt: now(),
      battle: null,
      company: createCompany()
    }
    byToken.set(commander.token, commander)
    save(commander)
    return { token: commander.token, name: commander.name }
  }

  const get = (token) => byToken.get(token) ?? null
  const byId = (id) => [...byToken.values()].find(c => c.id === id) ?? null
  function setCompany(commander, company) {
    commander.company = company
    save(commander)
  }
  /** The battle his army is in (its id), or null when it comes home. */
  function setBattle(commander, battleId) {
    commander.battle = battleId
    save(commander)
  }

  /** The company as its Commander sees it. */
  function view(token) {
    const commander = get(token)
    if (!commander) return null
    const { company } = commander
    return {
      name: commander.name ?? 'Your Commander',
      battles: company.battles,
      officers: company.officers.map(o => ({
        name: o.name, grade: gradeOf(o), experience: o.experience, personality: o.personality,
        leads: o.leads, status: o.status,
        record: [...o.record].reverse()
      })),
      fallen: [...company.fallen].reverse()
    }
  }

  return { create, get, byId, setCompany, setBattle, view }
}

module.exports = { createCommanderStore }
