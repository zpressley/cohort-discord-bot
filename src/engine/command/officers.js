// src/engine/command/officers.js
//
// The officers who carry the Commander's orders. (The Commander is the
// player; "Cohort: Commanders, Memory and Delegation" called these men
// commanders, and they were renamed officers on 2026-11-21. Not to be
// confused with veterans/officers.js, the roster inside an elite unit.)
//
// An officer is { name, experience, personality }:
//   experience   battles he has come through. It is the only thing that
//                makes one officer better than another, and what it buys is
//                depth: how much of an order he can carry.
//   personality  bold, steady or cautious: what he does when he loses the
//                thread. Readable, so a failure is one the Commander could
//                have seen coming.
//
// A unit may have no officer at all: { headless: true }. It has no one to
// carry more than the plain order. In a campaign every unit but the elite
// starts so, and an officer comes forward once the unit has 4 battles of
// veterancy (ruled 2026-11-23; command/company.js).
//
// Orders come in depths (docs/design/officers-memory-delegation.md). The
// plain order is level 1 and every officer carries it. Each thing more is a
// clause: a condition ("if their horse is there, hold") or a further step
// ("then on to the bridge"). Whether an officer keeps each clause is a
// seeded roll made when the order is given, weighted by his grade, and
// written to the event log. Pure: the caller supplies the random stream.

const { LOYALTY } = require('../combat/tables')

// Grades, by battles come through (ruled 2026-11-23):
//   nameless   0 to 3    no officer yet: the unit keeps a plain order only
//   green      4 to 7    an officer comes forward, with a name
//   seasoned   8 to 12
//   veteran    13 and up
//   legendary  20 and up
// 30 battles is the most that counts. A unit under 4 battles has no officer
// at all (a headless unit, below); an officer, however he came by his
// name, is never less than green.
const GRADES = [
  { name: 'green', from: 0 },
  { name: 'seasoned', from: 8 },
  { name: 'veteran', from: 13 },
  { name: 'legendary', from: 20 }
]
const MAX_EXPERIENCE = 30

// How an officer's chance of being killed in a battle falls as he rises
// (ruled 2026-11-23: "lower odds of death as they progress"): a share of
// the chance a green officer runs. Starting values.
const DEATH_ODDS = { green: 1, seasoned: 0.85, veteran: 0.7, legendary: 0.5 }

// The chance he keeps the first clause beyond the plain order, the second,
// the third and any after. A green officer carries the plain order and
// seldom more; a veteran holds the whole chain; a legendary one never
// loses any of it. Starting values.
const GRASP = {
  green: [0.35, 0.10, 0.05],
  seasoned: [0.90, 0.55, 0.25],
  veteran: [1.00, 0.95, 0.85],
  legendary: [1.00, 1.00, 1.00]
}

const PERSONALITIES = ['bold', 'steady', 'cautious']

// Battles a unit comes through before an officer comes forward from its
// ranks, green and with a name.
const EARNED_AT = 4

// The most an order may hold: steps after the first, and one condition.
const MAX_STEPS = 3

function gradeOf(officer) {
  const battles = Math.max(0, Math.floor(officer?.experience ?? 0))
  let grade = GRADES[0].name
  for (const g of GRADES) if (battles >= g.from) grade = g.name
  return grade
}

function chanceToKeep(officer, nth) {
  if (officer?.headless) return 0
  const table = GRASP[gradeOf(officer)]
  return table[Math.min(nth, table.length) - 1]
}

/** How many clauses an order holds beyond the plain order. */
function clauses(order) {
  return (order?.when ? 1 : 0) + (order?.steps?.length ?? 0)
}

/**
 * What an officer keeps of an order as it is given.
 *
 * The condition is the first clause, then each further step in turn. A
 * condition he loses stays on the order, marked `lost`: when the moment it
 * spoke of comes, he does not remember what he was to do, and his
 * personality decides (losingTheThread). A step he loses takes every later
 * step with it, and the order is marked `lostAfter`: when he has done what
 * he kept, he does not know what comes next.
 *
 * @param {Object} order    normalized (battle/orders.js)
 * @param {Object|null} officer
 * @param {Function} random  seeded, in [0, 1)
 * @returns {{ order, clauses: number, kept: number }}
 */
function grasp(order, officer, random) {
  const total = clauses(order)
  if (total === 0 || !officer) return { order, clauses: total, kept: total }

  const out = { ...order }
  let nth = 0
  let kept = 0
  if (order.when) {
    nth += 1
    if (random() < chanceToKeep(officer, nth)) kept += 1
    else out.when = { ...order.when, lost: true }
  }
  const steps = []
  for (const step of order.steps ?? []) {
    nth += 1
    if (random() < chanceToKeep(officer, nth)) { steps.push(step); kept += 1 } else { out.lostAfter = true; break }
  }
  if (order.steps) {
    if (steps.length > 0) out.steps = steps
    else delete out.steps
  }
  return { order: out, clauses: total, kept }
}

/**
 * What an officer does when he has lost the thread.
 *
 * @param {Object|null} officer
 * @param {'condition'|'steps'} lost   what he no longer remembers
 * @param {boolean} enemyInSight        can his side see an enemy to go at?
 * @returns {'advance'|'hold'|'carry on'}
 *   bold      goes at the enemy, if there is one to go at
 *   cautious  stops where he is and holds
 *   steady    carries on with the order he does remember; with nothing left
 *             of it, holds
 */
function losingTheThread(officer, lost, enemyInSight) {
  const personality = officer?.personality ?? 'steady'
  if (personality === 'bold') return enemyInSight ? 'advance' : 'hold'
  if (personality === 'cautious') return 'hold'
  return lost === 'condition' ? 'carry on' : 'hold'
}

/**
 * What an officer does with his unit while his Commander is in the enemy's
 * hands (ruled 2026-11-23: "each commander is running his own unit at that
 * point"). No word comes from the Commander, so each goes by his nature:
 *   bold      goes at the enemy, if his side can see one to go at; else
 *             carries on with the order he has
 *   steady    carries on with the order he has
 *   cautious  stops where he is and holds
 *   no officer (headless)  holds where it stands: no one to lead it on
 * Readable, as losingTheThread is: the Commander, who knows his officers,
 * could say beforehand what each would do.
 *
 * Over his nature stands his loyalty (ruled 2026-11-23: "Loyal officers
 * rally men and fight for their captured commander trying to free him"):
 * a loyal officer, whatever his nature, goes for the men who hold his
 * Commander ('rescue'). A disloyal one goes by his nature, and his men
 * desert (battle.js). Loyalty is not built yet: `loyalty` on an officer,
 * 0 to 100, else LOYALTY.NEUTRAL (loyaltyOf).
 *
 * @param {Object|null} officer
 * @param {boolean} enemyInSight  can his side see an enemy to go at?
 * @returns {'rescue'|'advance'|'hold'|'carry on'}
 */
function ownCommand(officer, enemyInSight) {
  if (!officer || officer.headless) return 'hold'
  if (loyaltyOf(officer) >= LOYALTY.LOYAL) return 'rescue'
  if (officer.personality === 'bold') return enemyInSight ? 'advance' : 'carry on'
  if (officer.personality === 'cautious') return 'hold'
  return 'carry on'
}

/** An officer's loyalty, 0 to 100; neutral for one with none yet, or no officer. */
function loyaltyOf(officer) {
  const n = Number(officer?.loyalty)
  return !officer || officer.headless || !Number.isFinite(n) ? LOYALTY.NEUTRAL : Math.max(0, Math.min(100, n))
}

module.exports = { GRADES, GRASP, PERSONALITIES, MAX_STEPS, EARNED_AT, MAX_EXPERIENCE, DEATH_ODDS, gradeOf, chanceToKeep, clauses, grasp, losingTheThread, ownCommand, loyaltyOf }
