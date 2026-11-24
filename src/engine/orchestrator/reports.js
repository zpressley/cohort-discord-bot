// src/engine/orchestrator/reports.js
//
// What a report of the enemy holds, by the officer of the unit that made it
// (ruled 2026-11-23: "additional details as progression happens but never
// incorrect details"). A unit with no officer reports that there is an
// enemy and where; a green officer adds what kind; a seasoned one roughly
// how many; a veteran exactly how many; a legendary one how they are
// holding up. The ladder and the bands are tables.REPORTS.
//
// A report is fixed when it is made: it holds only what its officer could
// tell, as things stood then. It travels with the rest of the unit's word
// (word.js), and a Commander's knowledge of an enemy unit is the reports of
// it that have reached him, joined (join): each fact as the newest report
// that held it told it, and as old as that report.
//
// Pure. Nothing here changes what happens in a battle: it is what is told.

const { REPORTS, MORALE } = require('../combat/tables')
const { gradeOf } = require('../command/officers')
const { staminaPool } = require('../combat/ratings')

const rank = (grade) => REPORTS.LADDER.indexOf(grade)

/** The fuller of two report grades. */
function fuller(a, b) {
  if (!a) return b
  if (!b) return a
  return rank(a) >= rank(b) ? a : b
}

/**
 * The grade of the reports a unit sends: its officer's grade; 'none' for a
 * unit with no officer; in a battle with no officers at all, what reports
 * told before (REPORTS.NO_OFFICERS).
 */
function reportGrade(unit) {
  if (!unit?.officer) return REPORTS.NO_OFFICERS
  if (unit.officer.headless) return 'none'
  return gradeOf(unit.officer)
}

/** The band "roughly how many" is told in: [from, to], the true number inside it. */
function aboutHowMany(strength) {
  const n = Math.max(1, Math.round(strength))
  const i = REPORTS.ABOUT.findIndex(([from, to]) => n >= from && n <= to)
  const [from, to] = REPORTS.ABOUT[i]
  return { band: i, from, to: to === Infinity ? null : to }
}

// What else anyone seeing a unit could tell of its kit: javelins in hand,
// how much armour, how big a shield. So that he may call them as his own
// Army tab would ("their skirmishers"); only what is there is written.
function kitSeen(enemy) {
  const out = {}
  for (const key of ['thrown', 'armor', 'shield']) if (enemy[key]) out[key] = enemy[key]
  return out
}

/**
 * One report of one enemy unit, as an officer of that grade tells it.
 *
 * @param {Object} enemy  the enemy unit as it stands
 * @param {string} grade  the reporting unit's grade (reportGrade)
 * @param {number} turn   the battle turn the report is made
 * @param {Function} [state]  () -> { morale, stamina, staminaPool, broken }, for a legendary officer's report
 */
function reportOf(enemy, grade, turn, state = null) {
  const tells = REPORTS.TELLS[grade] ?? REPORTS.TELLS.none
  const out = { grade, on: turn }
  if (tells.kind) out.kind = { role: enemy.role ?? null, mounted: Boolean(enemy.mounted), primaryWeapon: enemy.primaryWeapon ?? null, ...kitSeen(enemy), on: turn }
  if (tells.count) out.count = { exact: true, strength: enemy.strength, on: turn }
  else if (tells.about) out.count = { exact: false, ...aboutHowMany(enemy.strength), on: turn }
  const now = tells.state && state ? state() : null
  if (now) {
    out.state = {
      morale: Math.round(now.morale),
      stamina: Math.round(now.stamina),
      staminaPool: now.staminaPool ?? null,
      broken: Boolean(now.broken),
      on: turn
    }
  }
  return out
}

/**
 * What he knows of an enemy unit from two reports of it: the fullest true
 * thing he has been told, each fact as old as the report it came in. Kind
 * does not change, so once told it is kept. Numbers and condition: the
 * newest report that told them; of two the same age, the fuller (an exact
 * count over a rough one). `grade` is the best report he has had of it.
 */
function join(known, report) {
  if (!known) return report ? { ...report } : null
  if (!report) return { ...known }
  const newer = (a, b) => {
    if (!a) return b
    if (!b) return a
    if (a.on !== b.on) return a.on > b.on ? a : b
    return a.exact === false && b.exact === true ? b : a
  }
  const out = { grade: fuller(known.grade, report.grade), on: Math.max(known.on, report.on) }
  const kind = known.kind ?? report.kind
  if (kind) out.kind = kind
  const count = newer(known.count, report.count)
  if (count) out.count = count
  const state = newer(known.state, report.state)
  if (state) out.state = state
  return out
}

/** How an enemy unit is holding up now, for a legendary officer's report. */
function conditionOf(battle, enemy) {
  // A unit not yet in a fight has no state with the resolver: it is fresh.
  const state = battle.resolver.getState(enemy.id)
  const pool = staminaPool(enemy)
  return { morale: state?.morale ?? MORALE.START, stamina: state?.stamina ?? pool, staminaPool: pool, broken: battle.broken.has(enemy.id) }
}

module.exports = { kitSeen, reportGrade, reportOf, join, fuller, aboutHowMany, conditionOf }
