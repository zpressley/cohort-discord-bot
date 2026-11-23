// src/engine/command/company.js
//
// A Commander's company: the officers who go with him from battle to
// battle. "The game is about keeping your people alive across battles, not
// winning one. Veterancy lives in officers who survive"
// (docs/design/officers-memory-delegation.md).
//
// Pure: a company is plain data, and these functions return a new one.
//
//   officers  [{ id, name, experience, personality, values, loyalty, leads, status, record }]
//             values   'glory' or 'survival': what he holds dear, and so
//                      what wins and loses his loyalty (tables.LOYALTY)
//             loyalty  0 to 100, from NEUTRAL; moved by each battle
//             leads    the kind of unit he leads ("spears"), so he is given
//                      the same men next time
//             status   'fit', or 'wounded' (he sits the next battle out)
//             record   his battles with this Commander, oldest first:
//                      { battle, title, result, unit, fate, deeds, orders }
//                      It is his memory. It goes with him if he is lost.
//   units     { kind: { strength, totalExperience, battlesParticipated } }
//             for every kind of unit the company has fielded: the unit's
//             own veterancy (veterans/veterancy.js: every man who comes
//             through a battle banks one; the fallen take theirs with them;
//             recruits arrive knowing nothing). An officer comes forward
//             from its ranks at EARNED_AT battles (ruled 2026-11-23:
//             nameless 0 to 4 battles, then green), and a successor to one
//             lost starts at the unit's own level (ruled 2026-11-23: "the
//             veteran status of the unit, its average level, determines the
//             officer's starting spot. A 30 officer in charge of a 24 unit
//             gets a legendary successor"). `drilled` counts its battles
//             under an officer of MAX_EXPERIENCE: he trains his men, and
//             their quality rises a level every TRAINING.BATTLES_PER_LEVEL
//             of them (trainedQuality).
//   fallen    those killed or taken, as a roll: the company keeps its dead,
//             but not what they knew
//   battles   how many the company has fought
//   settled   the ids of the battles already written in, so that writing
//             one in twice (a server that stopped half way) changes nothing

const { createRng } = require('../rng')
const { PERSONALITIES, EARNED_AT, MAX_EXPERIENCE, loyaltyOf, loyaltyMove } = require('./officers')
const { assignOfficers } = require('./roster')
const { NAMES, PLAIN } = require('../../data/officers')
const { QUALITY_ORDER, TRAINING, VETERANCY, LOYALTY } = require('../combat/tables')
const { createVeteranState, averageExperience, applyBattle } = require('../veterans/veterancy')

function createCompany() {
  return { officers: [], units: {}, fallen: [], battles: 0, settled: [], nextId: 1 }
}

function copy(company) {
  const next = { units: {}, settled: [], ...JSON.parse(JSON.stringify(company)) }
  // A company saved when a unit was only a count of battles.
  for (const [kind, v] of Object.entries(next.units)) {
    if (typeof v === 'number') next.units[kind] = { ...createVeteranState({ strength: 0 }), battlesParticipated: v }
  }
  return next
}

/**
 * A unit's quality after its training: the quality it was raised at, lifted
 * one level of TRAINING.LADDER for every BATTLES_PER_LEVEL battles it has
 * come through under an officer of the greatest experience.
 */
function trainedQuality(quality, drilled = 0) {
  const levels = Math.floor(drilled / TRAINING.BATTLES_PER_LEVEL)
  if (levels <= 0 || quality === 'elite') return quality
  // Where it starts on the ladder: its own rung, or (tribal warriors) the
  // rung below the first one better than it.
  const rank = QUALITY_ORDER.indexOf(quality)
  let at = TRAINING.LADDER.indexOf(quality)
  if (at < 0) at = TRAINING.LADDER.findIndex(q => QUALITY_ORDER.indexOf(q) > rank) - 1
  if (at < -1) return quality
  return TRAINING.LADDER[Math.min(TRAINING.LADDER.length - 1, at + levels)] ?? quality
}

// The level an officer who comes forward from a unit's ranks starts at: the
// unit's own, and never less than green.
function fromTheRanks(state) {
  return Math.max(EARNED_AT, Math.min(MAX_EXPERIENCE, Math.round(averageExperience(state))))
}

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
 * @param {Object} options
 *   benched  the names of units he owns and has left at home: their
 *            officers stay with them, and are not given another unit
 * @returns {{ company, units }} the units with `officer` set (and his id)
 */
function musterOfficers(company, units, seed, { benched = [] } = {}) {
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
      values: LOYALTY.VALUES[drawn.experience % LOYALTY.VALUES.length],
      loyalty: LOYALTY.NEUTRAL,
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
  const spare = fit.filter(o => ![...lead.values()].includes(o) && !units.some(u => u.kind === o.leads) && !benched.includes(o.leads))
    .sort((a, b) => b.experience - a.experience || a.id.localeCompare(b.id))
  const rank = (u) => QUALITY_ORDER.indexOf(u.quality)
  const wanting = units.filter(u => !lead.has(u.id)).sort((a, b) => rank(b) - rank(a) || units.indexOf(a) - units.indexOf(b))
  for (const unit of wanting) if (spare.length) lead.set(unit.id, spare.shift())

  const out = units.map(unit => {
    // Every unit the company fields has its own veterancy, from here.
    if (!(unit.kind in next.units)) next.units[unit.kind] = createVeteranState({ strength: unit.strength ?? 0 })
    // What a great officer has made of them.
    const quality = trainedQuality(unit.quality, next.units[unit.kind].drilled)
    unit = quality === unit.quality ? unit : { ...unit, quality, raisedAs: unit.quality }
    const officer = lead.get(unit.id)
    if (!officer) return { ...unit, officer: { ...HEADLESS } }
    officer.leads = unit.kind
    return { ...unit, officer: { id: officer.id, name: officer.name, experience: officer.experience, personality: officer.personality, values: officer.values ?? null, loyalty: loyaltyOf(officer) } }
  })
  return { company: next, units: out }
}

/**
 * Write a finished battle into the company.
 *
 * Officers who came through gain a battle's experience (to MAX_EXPERIENCE
 * and no further). The wounded gain it too, and sit the next battle out.
 * One killed, captured or given up to the enemy leaves the company.
 *
 * Every unit's own veterancy moves with the battle: its survivors bank
 * one, its fallen take theirs with them, and it is made up to strength
 * with recruits who know nothing. A unit destroyed, or given to the enemy,
 * starts again from nothing.
 *
 * A unit with no officer that has EARNED_AT battles behind it finds one in
 * its own ranks, at the unit's own level. So a unit that loses its officer
 * fights its next battle without one, and then has a successor; unless the
 * officer lost had MAX_EXPERIENCE battles, when his successor is ready at
 * once.
 *
 * @param {Object} company
 * @param {Object} battle  { id, title, result: 'victory'|'defeat'|'draw', seed? }
 * @param {Array}  fates   one per unit that fought:
 *   { officerId (null for a unit with no officer), unit, culture?,
 *     fate: 'unhurt'|'wounded'|'captured'|'killed'|'given up', how?,
 *     destroyed?: boolean, mustered?: number (men it went in with),
 *     survivors?: number (men it came out with), deeds?, orders? }
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

  const comeForward = (f, entry, state) => {
    next.officers.push({
      id: `o${next.nextId++}`,
      name: freshName(next, f.culture, random),
      experience: fromTheRanks(state),
      personality: PERSONALITIES[Math.floor(random() * PERSONALITIES.length)],
      values: LOYALTY.VALUES[Math.floor(random() * LOYALTY.VALUES.length)],
      loyalty: LOYALTY.NEUTRAL,
      leads: f.unit,
      status: 'fit',
      record: [{ ...entry, fate: 'unhurt', named: true }]
    })
  }

  for (const f of fates) {
    const entry = {
      battle: battle.id, title: battle.title, result: battle.result, unit: f.unit,
      fate: f.fate, ...(f.how ? { how: f.how } : {}),
      deeds: f.deeds ?? '', orders: (f.orders ?? []).slice(-12)
    }

    // The unit's own veterancy. A unit given in a deal is gone, whatever
    // became of its officer (`given`).
    const gone = Boolean(f.destroyed) || f.fate === 'given up' || Boolean(f.given)
    const mustered = f.mustered ?? next.units[f.unit]?.strength ?? 0
    let state = next.units[f.unit] ?? createVeteranState({ strength: mustered })
    if (gone) {
      state = createVeteranState({ strength: mustered })
    } else {
      if (state.strength === 0) state.strength = mustered
      // The newest men fall first: the fallen take less than their share.
      applyBattle(state, { survivors: f.survivors == null ? null : Math.min(state.strength, Math.max(0, f.survivors)), fallenShare: VETERANCY.FALLEN_SHARE })
      state.strength = mustered || state.strength   // made up to strength again
    }
    next.units[f.unit] = state

    const officer = f.officerId ? next.officers.find(o => o.id === f.officerId) : null
    if (!officer) {
      // A unit with no officer of its own. (One whose officer is wounded,
      // or was there but is no longer in the company, waits.)
      if (f.officerId || next.officers.some(o => o.leads === f.unit)) continue
      if (state.battlesParticipated >= EARNED_AT) comeForward(f, entry, state)
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
      // An officer of the greatest experience has his successor ready.
      if (officer.experience >= MAX_EXPERIENCE && !gone && state.battlesParticipated >= EARNED_AT) comeForward(f, entry, state)
      continue
    }
    // An officer of the greatest experience trains his men as they fight.
    if (officer.experience >= MAX_EXPERIENCE && !gone) state.drilled = (state.drilled ?? 0) + 1
    // A loyal officer learns faster; and the battle moves his loyalty, by
    // what he holds dear (as he went into it: this battle's lesson comes
    // at the old loyalty).
    const loyal = loyaltyOf(officer) >= LOYALTY.LOYAL
    officer.experience = Math.min(MAX_EXPERIENCE, officer.experience + (loyal ? LOYALTY.LEARNS : 1))
    if (officer.values) {
      const losses = f.mustered ? Math.max(0, 1 - (f.survivors ?? f.mustered) / f.mustered) : 0
      const moved = loyaltyMove(officer.values, { result: battle.result, fought: f.fought ?? losses > 0, losses })
      officer.loyalty = Math.max(0, Math.min(100, loyaltyOf(officer) + moved))
      entry.loyalty = moved
    }
    officer.status = f.fate === 'wounded' ? 'wounded' : 'fit'
  }
  next.battles += 1
  if (battle.id != null) next.settled.push(battle.id)
  return next
}

/** Each unit of the company: its battles, its veterancy, and whether it has an officer. */
function unitsOf(company) {
  return Object.entries(company.units ?? {}).map(([kind, v]) => {
    const state = typeof v === 'number' ? { ...createVeteranState({ strength: 0 }), battlesParticipated: v } : v
    return {
      kind,
      battles: state.battlesParticipated,
      veterancy: averageExperience(state),
      // Levels of quality gained under an officer of the greatest experience.
      trained: Math.floor((state.drilled ?? 0) / TRAINING.BATTLES_PER_LEVEL),
      led: company.officers.some(o => o.leads === kind)
    }
  })
}

/**
 * The Commander has changed his army between battles. A unit is known by
 * its name (`leads`, `units`): a unit he kept (its kit changed or not) is
 * the same men, with its officer and its own veterancy. A
 * unit he dismissed takes its veterancy with it: men raised again start from
 * nothing. Its officer stays in the company, a man and not a unit, and at
 * the next muster leads a unit that has none, as an officer whose men are
 * not on the field always does (musterOfficers). A unit he adds has no
 * officer and no battles. So changing the army never makes an officer:
 * they are still earned in battle.
 *
 * @param {Object} company
 * @param {string[]} names  every unit of the new army by name, the elite's too
 * @returns {Object} the company after it
 */
function armyChanged(company, names) {
  const next = copy(company)
  const kept = new Set(names)
  next.units = Object.fromEntries(Object.entries(next.units).filter(([kind]) => kept.has(kind)))
  return next
}

/**
 * A unit given to the enemy in a deal for its Commander's freedom, as it
 * goes over (ruled 2026-11-23: "Additional units from capture and other
 * avenues exist"): its own veterancy and training, this battle banked as
 * for any unit that comes through one, and its officer if he went with it,
 * his experience and record his own, this battle in it. Read from the
 * company before the battle is written into it (settleBattle), with the
 * unit's fate as settleBattle takes it.
 *
 * @returns {{ state, officer }} officer null if none went with it. The
 *   officer has no id: the company that takes him in gives him one.
 */
function handOver(company, battle, f) {
  const next = copy(company)
  const mustered = f.mustered ?? next.units[f.unit]?.strength ?? 0
  const state = next.units[f.unit] ?? createVeteranState({ strength: mustered })
  if (state.strength === 0) state.strength = mustered
  applyBattle(state, { survivors: f.survivors == null ? null : Math.min(state.strength, Math.max(0, f.survivors)), fallenShare: VETERANCY.FALLEN_SHARE })
  state.strength = mustered || state.strength
  const officer = f.fate === 'given up' && f.officerId ? next.officers.find(o => o.id === f.officerId) : null
  if (!officer) return { state, officer: null }
  if (officer.experience >= MAX_EXPERIENCE) state.drilled = (state.drilled ?? 0) + 1
  const { id, ...man } = officer
  return {
    state,
    officer: {
      ...man,
      experience: Math.min(MAX_EXPERIENCE, officer.experience + 1),
      status: f.fate === 'wounded' ? 'wounded' : 'fit',
      record: [...officer.record, {
        battle: battle.id, title: battle.title, result: battle.result, unit: f.unit, fate: 'given up', deeds: f.deeds ?? '', orders: (f.orders ?? []).slice(-12)
      }]
    }
  }
}

/**
 * A unit taken in (handOver's, from another company), under the name it
 * bears here. Its officer, if it has one, joins the company leading it,
 * and with every reason to hate his new Commander: his loyalty is
 * LOYALTY.CAPTURED, whatever it was. What he holds dear is his own still.
 *
 * @param {Object} unit { name, state, officer, from } `from`: the
 *   Commander he served, and where he was given up, for his card
 */
function takeIn(company, { name, state, officer = null, from = null }) {
  const next = copy(company)
  next.units[name] = JSON.parse(JSON.stringify(state))
  if (officer) {
    next.officers.push({
      ...JSON.parse(JSON.stringify(officer)),
      id: `o${next.nextId++}`,
      leads: name,
      loyalty: LOYALTY.CAPTURED,
      ...(from ? { taken: from } : {})
    })
  }
  return next
}

/**
 * A Commander moves an officer to another of his units, between battles
 * (ruled 2026-11-23: "You can transfer officers"): to one that has none,
 * or in exchange with the officer there, who goes to the men the first one
 * led. Each officer's experience and record go with him; each unit's
 * veterancy and training stay with it. A unit left with no officer finds
 * one in its own ranks as any does (settleBattle).
 *
 * @param {string} officerId
 * @param {string} to         the name of the unit he is to lead
 * @returns {{ company, swapped }} swapped: the officer who changed places
 *   with him, if any
 */
function moveOfficer(company, officerId, to) {
  const next = copy(company)
  const officer = next.officers.find(o => o.id === officerId)
  if (!officer) throw new Error('there is no such officer in the company')
  if (officer.leads === to) return { company: next, swapped: null }
  const there = next.officers.find(o => o.leads === to && o.id !== officerId) ?? null
  if (there) there.leads = officer.leads
  officer.leads = to
  return { company: next, swapped: there ? there.id : null }
}

/**
 * A unit given a name by its Commander (ruled 2026-11-23: "You can name
 * units after they get an officer"): its veterancy and training, and the
 * officer who leads it, under the new name. The name is checked by the
 * caller (web/roster.js); the record of battles past keeps the name the
 * unit bore in them.
 */
function renameUnit(company, from, to) {
  const next = copy(company)
  if (from in next.units) {
    next.units = Object.fromEntries(Object.entries(next.units).map(([kind, v]) => [kind === from ? to : kind, v]))
  }
  for (const officer of next.officers) if (officer.leads === from) officer.leads = to
  return next
}

module.exports = { createCompany, musterOfficers, settleBattle, unitsOf, trainedQuality, leadUnit, ridesWith, armyChanged, handOver, takeIn, moveOfficer, renameUnit, HEADLESS }
