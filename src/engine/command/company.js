// src/engine/command/company.js
//
// A Commander's company: the officers who go with him from battle to
// battle. "The game is about keeping your people alive across battles, not
// winning one. Veterancy lives in officers who survive"
// (docs/design/officers-memory-delegation.md).
//
// Pure: a company is plain data, and these functions return a new one.
//
//   officers  [{ id, name, experience, personality, culture, leads, status, record }]
//             name     null until he earns one, at NAMED_AT battles come
//                      through (ruled 2026-11-22: "Named officers come with
//                      veterancy so new units are completely green. There is
//                      an officer but he is just as green, can die early and
//                      leave the unit headless")
//             leads    the kind of unit he leads ("spears"), so he is given
//                      the same men next time
//             status   'fit', or 'wounded' (he sits the next battle out)
//             record   his battles with this Commander, oldest first:
//                      { battle, title, result, unit, fate, deeds, orders }
//                      It is his memory. It goes with him if he is lost.
//   headless  the kinds of unit whose officer was lost in the last battle:
//             they fight the next one with no officer, and then one of
//             their own steps up
//   fallen    those killed or taken, as a roll: the company keeps its dead,
//             but not what they knew
//   battles   how many the company has fought

const { createRng } = require('../rng')
const { PERSONALITIES, NAMED_AT } = require('./officers')
const { assignOfficers } = require('./roster')
const { NAMES, PLAIN } = require('../../data/officers')
const { QUALITY_ORDER } = require('../combat/tables')

function createCompany() {
  return { officers: [], headless: [], fallen: [], battles: 0, nextId: 1 }
}

const copy = (company) => ({ headless: [], ...JSON.parse(JSON.stringify(company)) })

// The officer a headless unit takes into battle: no one.
const HEADLESS = { headless: true, name: null, experience: 0, personality: 'steady' }

// A name no one in the company bears or bore.
function freshName(company, culture, random) {
  const used = new Set([...company.officers, ...company.fallen].map(o => o.name).filter(Boolean))
  const pool = NAMES[culture] ?? PLAIN
  const start = Math.floor(random() * pool.length)
  for (let i = 0; i < pool.length; i++) {
    const name = pool[(start + i) % pool.length]
    if (!used.has(name)) return name
  }
  return `${pool[start]} the Younger`
}

/** The unit a Commander's veteran leads, and he rides with: the elite, else the best, the first listed. */
function leadUnit(units) {
  const rank = (u) => QUALITY_ORDER.indexOf(u.quality)
  return units.reduce((best, u, i) => (rank(u) > rank(units[best]) ? i : best), 0)
}

/**
 * Give a battle's units their officers from the company.
 *
 * A new Commander has one named officer, a veteran, with his elite unit
 * (ruled 2026-11-22: "the new commander gets a veteran officer for the
 * unique elite unit ... the rest you earn throughout the game"). Where the
 * army has no elite unit he is with its best. Every other unit has an
 * officer no one knows yet: no name, no battles behind him.
 *
 * After that each unit gets the fit officer who leads its kind; failing
 * that the most experienced named officer whose own men are not on the
 * field. A unit whose officer is wounded, or was lost in the last battle,
 * fights headless. A kind of unit the company has not led before gets an
 * unknown officer.
 *
 * @param {Object} company
 * @param {Array}  units   this side's battle unit specs, each with a `kind`
 *                         (what the unit is called: "spears")
 * @param {number} seed    the battle's seed
 * @returns {{ company, units }} the units with `officer` set (and his id)
 */
function musterOfficers(company, units, seed) {
  const next = copy(company)
  const founding = next.officers.length === 0 && next.fallen.length === 0 && next.battles === 0
  const drawn = assignOfficers(units.map(u => ({ ...u, officer: undefined })), seed)
  const random = createRng((Math.imul(seed, 69069) + 5) >>> 0)
  const veteranAt = founding ? leadUnit(units) : -1
  const taken = new Set()

  const out = units.map((unit, i) => {
    const free = next.officers.filter(o => !taken.has(o.id))
    const own = free.find(o => o.leads === unit.kind)
    let officer = own && own.status !== 'wounded' ? own : null
    if (!officer) {
      officer = free
        .filter(o => o.status !== 'wounded' && o.name && !units.some(u => u.kind === o.leads))
        .sort((a, b) => b.experience - a.experience || a.id.localeCompare(b.id))[0] ?? null
    }
    if (!officer && (own || next.headless.includes(unit.kind))) return { ...unit, officer: { ...HEADLESS } }
    if (!officer) {
      const named = i === veteranAt
      officer = {
        id: `o${next.nextId++}`,
        name: named ? drawn[i].officer.name : null,
        experience: named ? 6 + (drawn[i].officer.experience % 4) : 0,
        personality: named ? drawn[i].officer.personality : PERSONALITIES[Math.floor(random() * PERSONALITIES.length)],
        culture: unit.culture ?? null,
        leads: unit.kind,
        status: 'fit',
        record: []
      }
      next.officers.push(officer)
    }
    officer.leads = unit.kind
    next.headless = next.headless.filter(kind => kind !== unit.kind)
    taken.add(officer.id)
    return { ...unit, officer: { id: officer.id, name: officer.name, experience: officer.experience, personality: officer.personality } }
  })
  return { company: next, units: out }
}

/**
 * Write a finished battle into the company.
 *
 * Those who came through gain a battle's experience, and one who reaches
 * NAMED_AT battles earns his name. The wounded gain it too, and sit the
 * next battle out. One killed, captured or given up to the enemy leaves the
 * company: his men fight their next battle headless.
 *
 * @param {Object} company
 * @param {Object} battle  { id, title, result: 'victory'|'defeat'|'draw', seed? }
 * @param {Array}  fates   one per officer who fought:
 *   { officerId, unit, fate: 'unhurt'|'wounded'|'captured'|'killed'|'given up',
 *     how?, deeds?: string, orders?: string[] }
 * @returns {Object} the company after it
 */
function settleBattle(company, battle, fates) {
  const next = copy(company)
  const fought = new Set(fates.map(f => f.officerId))
  const random = createRng((Math.imul((battle.seed ?? next.battles) + 1, 48271) + next.nextId) >>> 0)
  // A wounded man who sat this one out is fit again; men who fought it
  // headless have found an officer among themselves.
  for (const officer of next.officers) if (officer.status === 'wounded' && !fought.has(officer.id)) officer.status = 'fit'
  next.headless = []

  for (const f of fates) {
    const officer = next.officers.find(o => o.id === f.officerId)
    if (!officer) continue
    const entry = {
      battle: battle.id, title: battle.title, result: battle.result, unit: f.unit,
      fate: f.fate, ...(f.how ? { how: f.how } : {}),
      deeds: f.deeds ?? '', orders: (f.orders ?? []).slice(-12)
    }
    officer.record.push(entry)
    if (f.fate === 'killed' || f.fate === 'captured' || f.fate === 'given up') {
      // He is gone, and what he knew with him: the roll keeps who he was.
      next.officers = next.officers.filter(o => o.id !== officer.id)
      next.fallen.push({
        name: officer.name, fate: f.fate, at: battle.title, led: f.unit,
        experience: officer.experience, personality: officer.personality, battles: officer.record.length
      })
      next.headless.push(officer.leads)
      continue
    }
    officer.experience += 1
    officer.status = f.fate === 'wounded' ? 'wounded' : 'fit'
    if (!officer.name && officer.experience >= NAMED_AT) {
      officer.name = freshName(next, officer.culture, random)
      entry.named = true
    }
  }
  next.battles += 1
  return next
}

module.exports = { createCompany, musterOfficers, settleBattle, leadUnit, HEADLESS }
