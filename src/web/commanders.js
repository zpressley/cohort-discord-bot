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
const { gradeOf, EARNED_AT } = require('../engine/command/officers')
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
  // No two Commanders ever share one, living or fallen: each name lives on
  // in the record (ruled 2026-11-22). When the plain names run out they
  // come round again as "Garrick II".
  const NUMERALS = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X']
  function newName() {
    const taken = new Set([...byToken.values()].map(c => c.name))
    for (let round = 0; ; round++) {
      const suffix = NUMERALS[round] ?? ` ${round + 1}`
      const free = PLAIN.map(n => n + suffix).filter(n => !taken.has(n))
      if (free.length) return free[crypto.randomInt(free.length)]
    }
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
  /**
   * A Commander killed, or lost in the enemy's hands: everything ends with
   * him (ruled 2026-11-22). He and his company are kept, for the record,
   * and can never be mustered again.
   */
  function end(commander, { how, at }) {
    commander.ended = { how, at, when: now(), battles: commander.company.battles }
    commander.battle = null
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
      ended: commander.ended ? { how: commander.ended.how, at: commander.ended.at } : null,
      battles: company.battles,
      officers: company.officers.map(o => ({
        name: o.name, grade: gradeOf(o), experience: o.experience, personality: o.personality,
        leads: o.leads, status: o.status,
        record: [...o.record].reverse()
      })),
      // Units with no officer yet, and the battles each has come through
      // toward one (he comes forward at `earnedAt` battles).
      unled: Object.entries(company.units ?? {}).map(([kind, battles]) => ({ kind, battles })),
      earnedAt: EARNED_AT,
      fallen: [...company.fallen].reverse()
    }
  }

  return { create, get, byId, setCompany, setBattle, end, view }
}

module.exports = { createCommanderStore }
