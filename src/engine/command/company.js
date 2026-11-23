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
//   units     { kind: battles } for each kind of unit with no officer: how
//             many battles it has come through since it last had one. An
//             officer comes forward from its ranks at EARNED_AT (ruled
//             2026-11-23: nameless 0 to 4 battles, then green).
//   fallen    those killed or taken, as a roll: the company keeps its dead,
//             but not what they knew
//   battles   how many the company has fought
//   settled   the ids of the battles already written in, so that writing
//             one in twice (a server that stopped half way) changes nothing

const { createRng } = require('../rng')
const { PERSONALITIES, EARNED_AT, MAX_EXPERIENCE } = require('./officers')
const { assignOfficers } = require('./roster')
const { NAMES, PLAIN } = require('../../data/officers')
const { QUALITY_ORDER } = require('../combat/tables')

function createCompany() {
  return { officers: [], units: {}, fallen: [], battles: 0, settled: [], nextId: 1 }
}

const copy = (company) => ({ units: {}, settled: [], ...JSON.parse(JSON.stringify(company)) })

// What a unit with no officer takes into battle: no one.
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

/** A new Commander's veteran leads this unit: the elite, else the best, the first listed. */
function leadUnit(units) {
  const rank = (u) => QUALITY_ORDER.indexOf(u.quality)
  return units.reduce((best, u, i) => (rank(u) > rank(units[best]) ? i : best), 0)
}

/**
 * The unit the Commander rides with, once officers are given out
 * (musterOfficers' units): the one his most experienced officer leads. With
 * no officer on the field, his best unit.
 */
function ridesWith(units) {
  const led = units.filter(u => u.officer && !u.officer.headless)
    .sort((a, b) => b.officer.experience - a.officer.experience || units.indexOf(a) - units.indexOf(b))[0]
  return (led ?? units[leadUnit(units)]).id
}

/**
 * Give a battle's units their officers from the company.
 *
 * A new Commander has one officer: a veteran, with his elite unit (ruled
 * 2026-11-22: "the new commander gets a veteran officer for the unique
 * elite unit ... the rest you earn throughout the game"). Where the army
 * has no elite unit he is with its best. No other unit has an officer until
 * it has earned one.
 *
 * Each unit gets the fit officer who leads its kind; failing that the most
 * experienced fit officer whose own men are not on the field; failing that
 * it fights with no officer.
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
  if (founding && units.length > 0) {
    const at = leadUnit(units)
    const drawn = assignOfficers(units.map(u => ({ ...u, officer: undefined })), seed)[at].officer
    next.officers.push({
      id: `o${next.nextId++}`,
      name: drawn.name,
      experience: 13 + (drawn.experience % 4),
      personality: drawn.personality,
      leads: units[at].kind,
      status: 'fit',
      record: []
    })
  }
  // Each officer to his own men first. Then those whose men are not on this
  // field take the units with no officer, the most experienced officer to
  // the best unit: so a veteran on a strange field leads its elite.
  const fit = next.officers.filter(o => o.status !== 'wounded')
  const lead = new Map()
  for (const unit of units) {
    const own = fit.find(o => o.leads === unit.kind && ![...lead.values()].includes(o))
    if (own) lead.set(unit.id, own)
  }
  const spare = fit.filter(o => ![...lead.values()].includes(o) && !units.some(u => u.kind === o.leads))
    .sort((a, b) => b.experience - a.experience || a.id.localeCompare(b.id))
  const rank = (u) => QUALITY_ORDER.indexOf(u.quality)
  const wanting = units.filter(u => !lead.has(u.id)).sort((a, b) => rank(b) - rank(a) || units.indexOf(a) - units.indexOf(b))
  for (const unit of wanting) if (spare.length) lead.set(unit.id, spare.shift())

  const out = units.map(unit => {
    const officer = lead.get(unit.id)
    if (!officer) {
      // No officer: the unit's own count of battles runs (unless its
      // officer is only wounded, and will be back).
      if (!next.officers.some(o => o.leads === unit.kind) && !(unit.kind in next.units)) next.units[unit.kind] = 0
      return { ...unit, officer: { ...HEADLESS } }
    }
    officer.leads = unit.kind
    delete next.units[unit.kind]
    return { ...unit, officer: { id: officer.id, name: officer.name, experience: officer.experience, personality: officer.personality } }
  })
  return { company: next, units: out }
}

/**
 * Write a finished battle into the company.
 *
 * Officers who came through gain a battle's experience. The wounded gain it
 * too, and sit the next battle out. One killed, captured or given up to the
 * enemy leaves the company, and his men must earn an officer again.
 *
 * A unit with no officer that comes through a battle is a battle nearer to
 * one: at EARNED_AT battles an officer comes forward from its ranks. He has
 * a name, and the unit's battles for his experience, which makes him
 * green. A unit destroyed starts again from nothing. No officer's
 * experience counts beyond MAX_EXPERIENCE.
 *
 * @param {Object} company
 * @param {Object} battle  { id, title, result: 'victory'|'defeat'|'draw', seed? }
 * @param {Array}  fates   one per unit that fought:
 *   { officerId (null for a unit with no officer), unit, culture?,
 *     fate: 'unhurt'|'wounded'|'captured'|'killed'|'given up', how?,
 *     destroyed?: boolean, deeds?: string, orders?: string[] }
 * @returns {Object} the company after it
 */
function settleBattle(company, battle, fates) {
  const next = copy(company)
  // Already written in: nothing changes.
  if (battle.id != null && next.settled.includes(battle.id)) return next
  const fought = new Set(fates.map(f => f.officerId).filter(Boolean))
  const random = createRng((Math.imul((battle.seed ?? next.battles) + 1, 48271) + next.nextId) >>> 0)
  // A wounded man who sat this one out is fit again.
  for (const officer of next.officers) if (officer.status === 'wounded' && !fought.has(officer.id)) officer.status = 'fit'

  for (const f of fates) {
    const entry = {
      battle: battle.id, title: battle.title, result: battle.result, unit: f.unit,
      fate: f.fate, ...(f.how ? { how: f.how } : {}),
      deeds: f.deeds ?? '', orders: (f.orders ?? []).slice(-12)
    }
    const officer = f.officerId ? next.officers.find(o => o.id === f.officerId) : null

    if (!officer) {
      // A unit with no officer of its own (one whose officer is wounded
      // keeps no count: he will be back).
      if (f.officerId || !(f.unit in next.units)) continue
      next.units[f.unit] = f.destroyed || f.fate === 'given up' ? 0 : next.units[f.unit] + 1
      const battles = next.units[f.unit]
      if (battles >= EARNED_AT) {
        next.officers.push({
          id: `o${next.nextId++}`,
          name: freshName(next, f.culture, random),
          experience: battles,
          personality: PERSONALITIES[Math.floor(random() * PERSONALITIES.length)],
          leads: f.unit,
          status: 'fit',
          record: [{ ...entry, fate: 'unhurt', named: true }]
        })
        delete next.units[f.unit]
      }
      continue
    }

    officer.record.push(entry)
    if (f.fate === 'killed' || f.fate === 'captured' || f.fate === 'given up') {
      // He is gone, and what he knew with him: the roll keeps who he was.
      next.officers = next.officers.filter(o => o.id !== officer.id)
      next.fallen.push({
        name: officer.name, fate: f.fate, at: battle.title, led: f.unit,
        experience: officer.experience, personality: officer.personality, battles: officer.record.length
      })
      next.units[officer.leads] = 0
      continue
    }
    officer.experience = Math.min(MAX_EXPERIENCE, officer.experience + 1)
    officer.status = f.fate === 'wounded' ? 'wounded' : 'fit'
  }
  next.battles += 1
  if (battle.id != null) next.settled.push(battle.id)
  return next
}

module.exports = { createCompany, musterOfficers, settleBattle, leadUnit, ridesWith, HEADLESS }
