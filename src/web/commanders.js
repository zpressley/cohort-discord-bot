// src/web/commanders.js
//
// Commanders, kept on the server: each is a private link (a token, as a
// battle's seat is) and a company of officers who go with him from battle
// to battle (engine/command/company.js). No accounts: the token lives in
// the player's browser. A player may keep several Commanders, and so have
// several battles going; each Commander's army fights one battle at a time
// (ruled 2026-11-22), so a Commander remembers which battle he is in.
//
// Saved as one document a commander (storage.js: a file under
// <dir>/commanders, or a row in Postgres), written whole each time it
// changes.

const crypto = require('crypto')

const { createCompany, unitsOf } = require('../engine/command/company')
const { gradeOf, EARNED_AT, loyaltyBand } = require('../engine/command/officers')
const { PLAIN } = require('../data/officers')
const { FACTIONS } = require('../data/factions')
const { usualArmy } = require('../engine/army/standard')
const { rosterView, RESERVED } = require('./roster')
const { createFileStorage } = require('./storage')
const { KINDS, HOLDS, TITLE_AFTER } = require('../data/commanders')
const { veterancyLevel } = require('../engine/veterans/veterancy')
const { VETERANCY_WORDS, MAKING, COMMANDER_KINDS, NATURE_SAID, HOLDS_DEAR, COMMANDER_TITLES } = require('../narrator/words')

const NAME_FORM = /^[A-Za-z]+( [A-Za-z]+){0,2}$/

/**
 * A Commander's name as typed, as it is kept: single spaces, and each word
 * begun with a capital ("garrick" is kept "Garrick"; "McRae" as typed).
 */
function commanderName(raw) {
  return String(raw ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Why a Commander may not take this name, or null if he may. The guards a
 * unit's name has (roster.js, nameRefusal) that fit a man's name: one to
 * three words of plain letters, 3 to 24 in all, each word two letters or
 * more, and none of the words the game uses for something else ("the",
 * "enemy", "commander", the order words; his title is earned, not typed).
 * And no other Commander here, living or fallen, bears or bore it, in any
 * case of letters (ruled 2026-11-22: "The name is unique"). Not guarded:
 * what the name means. Names are not moderated (docs/DECISIONS.md).
 */
function commanderNameRefusal(name, taken) {
  if (!name) return 'Give your Commander a name.'
  if (name.length < 3 || name.length > 24) return 'A name is 3 to 24 letters long.'
  if (!NAME_FORM.test(name)) return 'A name is one to three words of plain letters, with no numbers or marks.'
  const words = name.split(' ')
  if (words.some(w => w.length < 2)) return 'Each word of a name is two letters or more.'
  const reserved = words.find(w => RESERVED.has(w.toLowerCase()))
  if (reserved) return `"${reserved.toLowerCase()}" is a word the game uses for something else: it cannot be in a name.`
  if (taken.has(name.toLowerCase())) return `Another Commander bears the name ${name}, or bore it: choose another.`
  return null
}

/** The title he is known by: earned in his first battle, from his two answers. */
function titleOf(commander) {
  if (!commander.kind || !commander.holds) return null
  if ((commander.company?.battles ?? 0) < TITLE_AFTER) return null
  return COMMANDER_TITLES[commander.holds]?.[commander.kind] ?? null
}

function createCommanderStore({ dir = null, storage = null, now = () => Date.now() } = {}) {
  const kept = storage ?? createFileStorage(dir)
  const byToken = new Map()

  function save(commander) {
    return kept.put('commander', commander.id, commander)
  }
  for (const commander of kept.all('commander')) byToken.set(commander.token, commander)

  // A plain name, offered so that he need not type one: one no other
  // Commander here bears, while there are any left.
  // No two Commanders ever share one, living or fallen: each name lives on
  // in the record (ruled 2026-11-22). When the plain names run out they
  // come round again as "Garrick II".
  const NUMERALS = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X']
  // Every name borne here, in lower case: a name chosen is unique in any case.
  const takenNames = () => new Set([...byToken.values()].map(c => String(c.name ?? '').toLowerCase()))
  function newName() {
    const taken = takenNames()
    for (let round = 0; ; round++) {
      const suffix = NUMERALS[round] ?? ` ${round + 1}`
      const free = PLAIN.map(n => n + suffix).filter(n => !taken.has(n.toLowerCase()))
      if (free.length) return free[crypto.randomInt(free.length)]
    }
  }

  /**
   * What making a Commander asks (the two questions, and a name), in the
   * game's words, with a plain name offered. The name is not held for him:
   * it is checked again when he is made.
   */
  function making() {
    return {
      asked: MAKING,
      name: newName(),
      kinds: Object.entries(KINDS).map(([id, k]) => ({ id, title: COMMANDER_KINDS[id].title, said: COMMANDER_KINDS[id].said, nature: k.nature, natureSaid: NATURE_SAID[k.nature] })),
      holds: HOLDS.map(id => ({ id, title: HOLDS_DEAR[id].title, said: HOLDS_DEAR[id].said })),
      titles: COMMANDER_TITLES,
      titleAfter: TITLE_AFTER
    }
  }

  /**
   * A new Commander with an empty company. His faction (src/data/factions.js)
   * is chosen now and is his for life: his army is that faction's. One made
   * without a faction (as before factions came to the muster) takes one at
   * his first muster that names one, and keeps it.
   *
   * The two questions (data/commanders.js), each answered once and his for
   * life: `kind`, one of the ten kinds of commander, gives the veteran he
   * starts with his nature; `holds`, glory or survival, is what that
   * veteran holds dear too, and with his kind it makes his title. `name` is
   * his own choosing (commanderNameRefusal), else a plain one. One made
   * without the answers (as every Commander was before) has neither, and his
   * veteran's are drawn as they always were.
   */
  function create({ faction = null, name = null, kind = null, holds = null } = {}) {
    if (faction !== null && !FACTIONS[faction]) throw Object.assign(new Error(`There is no faction "${faction}".`), { status: 400 })
    if (kind !== null && !Object.hasOwn(KINDS, kind)) throw Object.assign(new Error(`There is no kind of commander "${kind}".`), { status: 400 })
    if (holds !== null && !HOLDS.includes(holds)) throw Object.assign(new Error('A Commander fights for glory or for survival.'), { status: 400 })
    const own = name === null ? '' : commanderName(name)
    if (own) {
      const refused = commanderNameRefusal(own, takenNames())
      if (refused) throw Object.assign(new Error(refused), { status: 400 })
    }
    const founder = { ...(kind ? { personality: KINDS[kind].nature } : {}), ...(holds ? { values: holds } : {}) }
    const commander = {
      id: crypto.randomBytes(6).toString('hex'),
      token: crypto.randomBytes(18).toString('base64url'),
      name: own || newName(),
      createdAt: now(),
      battle: null,
      ...(faction ? { faction } : {}),
      ...(kind ? { kind } : {}),
      ...(holds ? { holds } : {}),
      company: { ...createCompany(), ...(Object.keys(founder).length ? { founder } : {}) }
    }
    byToken.set(commander.token, commander)
    save(commander)
    return { token: commander.token, name: commander.name, faction: commander.faction ?? null, kind: commander.kind ?? null, holds: commander.holds ?? null }
  }

  /** Give a Commander with none his faction, once. It never changes after. */
  function setFaction(commander, faction) {
    if (!FACTIONS[faction]) throw Object.assign(new Error(`There is no faction "${faction}".`), { status: 400 })
    if (commander.faction === faction) return
    if (commander.faction) {
      throw Object.assign(new Error(`${commander.name} fights for ${FACTIONS[commander.faction].title}, and always will.`), { status: 409 })
    }
    commander.faction = faction
    save(commander)
  }

  /**
   * His standard army, bought (a list checked by the caller: battles.js,
   * setArmy), or null for his faction's usual one. Kept with him, and
   * changed only between battles.
   */
  function setArmy(commander, units) {
    if (units) commander.army = { units }
    else delete commander.army
    save(commander)
  }

  /**
   * His roster beyond what he bought (roster.js): any of `army` ({ units }),
   * `gained` (the units that came to him otherwise), `marching` (the names
   * of those he last chose to march) and `elite` ({ name, formerly }, the
   * name he gave his elite). A field left out is left as it is; null
   * removes it.
   */
  function setRoster(commander, fields) {
    for (const key of ['army', 'gained', 'marching', 'elite']) {
      if (!(key in fields)) continue
      if (fields[key] === null) delete commander[key]
      else commander[key] = fields[key]
    }
    save(commander)
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
      // His two answers, and the title they make once he has fought
      // (null for a Commander made before the questions were asked).
      kind: commander.kind ? { id: commander.kind, title: COMMANDER_KINDS[commander.kind].title, said: COMMANDER_KINDS[commander.kind].said } : null,
      holds: commander.holds ? { id: commander.holds, title: HOLDS_DEAR[commander.holds].title } : null,
      title: titleOf(commander),
      createdAt: commander.createdAt ?? null,
      faction: commander.faction ?? null,
      factionTitle: commander.faction ? FACTIONS[commander.faction]?.title ?? null : null,
      ended: commander.ended ? { how: commander.ended.how, at: commander.ended.at, when: commander.ended.when ?? null } : null,
      // The standard army he musters with: his own, or his faction's usual
      // one while he has bought none. (None without a faction.)
      ...(commander.faction
        ? { army: commander.army ? { own: true, units: commander.army.units } : { own: false, units: usualArmy(commander.faction) } }
        : {}),
      battles: company.battles,
      officers: company.officers.map(o => ({
        id: o.id,
        name: o.name, grade: gradeOf(o), experience: o.experience, personality: o.personality,
        // What he holds dear, and whether he is loyal, disaffected or neither.
        values: o.values ?? null, loyalty: loyaltyBand(o),
        leads: o.leads, status: o.status,
        // Given to you in a deal for his own Commander's freedom.
        ...(o.taken ? { taken: o.taken } : {}),
        record: [...o.record].reverse()
      })),
      // Every unit he owns, what each costs to march, and which march.
      ...(commander.faction ? { roster: rosterView(commander) } : {}),
      // Units with no officer yet, and the battles each has come through
      // toward one (he comes forward at `earnedAt` battles).
      unled: unitsOf(company).filter(u => !u.led).map(u => ({ kind: u.kind, battles: u.battles })),
      // Every unit's own veterancy: the battles it has come through, the
      // average experience of its men, and its level in the game's words.
      units: unitsOf(company).map(u => ({ kind: u.kind, battles: u.battles, veterancy: u.veterancy, level: VETERANCY_WORDS[veterancyLevel(u.veterancy)], trained: u.trained })),
      earnedAt: EARNED_AT,
      fallen: [...company.fallen].reverse()
    }
  }

  return { making, create, get, byId, setCompany, setBattle, setFaction, setArmy, setRoster, end, view }
}

module.exports = { createCommanderStore, commanderName, commanderNameRefusal, titleOf }
