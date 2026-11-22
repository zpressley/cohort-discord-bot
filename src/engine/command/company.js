// src/engine/command/company.js
//
// A Commander's company: the officers who go with him from battle to
// battle. "The game is about keeping your people alive across battles, not
// winning one. Veterancy lives in officers who survive"
// (docs/design/officers-memory-delegation.md).
//
// Pure: a company is plain data, and these functions return a new one.
//
//   officers  [{ id, name, experience, personality, leads, status, record }]
//             leads    the kind of unit he leads ("spears"), so he is given
//                      the same men next time
//             status   'fit', or 'wounded' (he sits the next battle out)
//             record   his battles with this Commander, oldest first:
//                      { battle, title, result, unit, fate, deeds, orders }
//                      It is his memory. It goes with him if he is lost.
//   fallen    those killed or taken, as a roll of names: the company keeps
//             its dead, but not what they knew
//   battles   how many the company has fought

const { createRng } = require('../rng')
const { PERSONALITIES } = require('./officers')
const { assignOfficers } = require('./roster')
const { NAMES, PLAIN } = require('../../data/officers')
const { QUALITY_ORDER } = require('../combat/tables')

function createCompany() {
  return { officers: [], fallen: [], battles: 0, nextId: 1 }
}

const copy = (company) => JSON.parse(JSON.stringify(company))

/**
 * Give a battle's units their officers from the company.
 *
 * Each unit gets the fit officer who leads its kind; failing that the most
 * experienced fit officer without a command; failing that a new man.
 *
 * A new Commander has one veteran, with his elite unit (ruled 2026-11-22:
 * "the new commander gets a veteran officer for the unique elite unit ...
 * the rest you earn throughout the game"). Every other officer starts
 * green, as does a man who replaces one lost, and "needs everything spelled
 * out". Where the army has no elite unit the veteran is with its best.
 *
 * @param {Object} company
 * @param {Array}  units   this side's battle unit specs, each with a `kind`
 *                         (what the unit is called: "spears")
 * @param {number} seed    the battle's seed
 * @returns {{ company, units }} the units with `officer` set (and his id)
 */
function musterOfficers(company, units, seed) {
  const next = copy(company)
  const founding = next.officers.length === 0 && next.fallen.length === 0
  // The founding veteran's unit: the elite, else the best, the first listed.
  const rank = (u) => QUALITY_ORDER.indexOf(u.quality)
  const veteranAt = founding ? units.reduce((best, u, i) => (rank(u) > rank(units[best]) ? i : best), 0) : -1
  const drawn = assignOfficers(units.map(u => ({ ...u, officer: undefined })), seed)
  const random = createRng((Math.imul(seed, 69069) + 5) >>> 0)
  const used = new Set([...next.officers, ...next.fallen].map(o => o.name))
  const taken = new Set()

  const out = units.map((unit, i) => {
    const fit = next.officers.filter(o => o.status !== 'wounded' && !taken.has(o.id))
    let officer = fit.find(o => o.leads === unit.kind) ??
      fit.filter(o => !units.some(u => u.kind === o.leads))
        .sort((a, b) => b.experience - a.experience || a.id.localeCompare(b.id))[0]
    if (!officer) {
      const pool = NAMES[unit.culture] ?? PLAIN
      let name = drawn[i].officer.name
      for (let tries = 0; used.has(name) && tries < pool.length; tries++) name = pool[(pool.indexOf(name) + 1) % pool.length]
      if (used.has(name)) name = `${name} the Younger`
      officer = {
        id: `o${next.nextId++}`,
        name,
        experience: i === veteranAt ? 6 + (drawn[i].officer.experience % 4) : 0,
        personality: founding ? drawn[i].officer.personality : PERSONALITIES[Math.floor(random() * PERSONALITIES.length)],
        leads: unit.kind,
        status: 'fit',
        record: []
      }
      used.add(name)
      next.officers.push(officer)
    }
    officer.leads = unit.kind
    taken.add(officer.id)
    return { ...unit, officer: { id: officer.id, name: officer.name, experience: officer.experience, personality: officer.personality } }
  })
  return { company: next, units: out }
}

/**
 * Write a finished battle into the company.
 *
 * @param {Object} company
 * @param {Object} battle  { id, title, result: 'victory'|'defeat'|'draw' }
 * @param {Array}  fates   one per officer who fought:
 *   { officerId, unit, fate: 'unhurt'|'wounded'|'captured'|'killed', how?,
 *     deeds?: string, orders?: string[] }
 * @returns {Object} the company after it
 */
function settleBattle(company, battle, fates) {
  const next = copy(company)
  const fought = new Set(fates.map(f => f.officerId))
  // A wounded man who sat this one out is fit again.
  for (const officer of next.officers) if (officer.status === 'wounded' && !fought.has(officer.id)) officer.status = 'fit'

  for (const f of fates) {
    const officer = next.officers.find(o => o.id === f.officerId)
    if (!officer) continue
    officer.record.push({
      battle: battle.id, title: battle.title, result: battle.result, unit: f.unit,
      fate: f.fate, ...(f.how ? { how: f.how } : {}),
      deeds: f.deeds ?? '', orders: (f.orders ?? []).slice(-12)
    })
    if (f.fate === 'killed' || f.fate === 'captured') {
      // He is gone, and what he knew with him: the roll keeps his name.
      next.officers = next.officers.filter(o => o.id !== officer.id)
      next.fallen.push({
        name: officer.name, fate: f.fate, at: battle.title, led: f.unit,
        experience: officer.experience, personality: officer.personality, battles: officer.record.length
      })
      continue
    }
    officer.experience += 1
    officer.status = f.fate === 'wounded' ? 'wounded' : 'fit'
  }
  next.battles += 1
  return next
}

module.exports = { createCompany, musterOfficers, settleBattle }
