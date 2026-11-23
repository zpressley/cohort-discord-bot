// src/engine/command/officers.js
//
// The officers who carry the Commander's orders. (The Commander is the
// player; "Cohort: Commanders, Memory and Delegation" called these men
// commanders, and they were renamed officers on 2026-11-21. Not to be
// confused with veterans/officers.js, the roster inside an elite unit.)
//
// An officer is { name, experience, personality }:
//   name         null until he has earned one (ruled 2026-11-22: "named
//                officers come with veterancy"). A new unit's officer is
//                unknown: as green as his men, and no one yet knows what he
//                will do when it goes wrong. He is named when he becomes
//                seasoned.
//   experience   battles he has come through. It is the only thing that
//                makes one officer better than another, and what it buys is
//                depth: how much of an order he can carry.
//   personality  bold, steady or cautious: what he does when he loses the
//                thread. Readable, so a failure is one the Commander could
//                have seen coming.
//
// A unit whose officer is lost is headless for a battle: { headless: true }.
// It has no one to carry more than the plain order.
//
// Orders come in depths (docs/design/officers-memory-delegation.md). The
// plain order is level 1 and every officer carries it. Each thing more is a
// clause: a condition ("if their horse is there, hold") or a further step
// ("then on to the bridge"). Whether an officer keeps each clause is a
// seeded roll made when the order is given, weighted by his grade, and
// written to the event log. Pure: the caller supplies the random stream.

// Grades, by battles come through.
const GRADES = [
  { name: 'green', from: 0 },
  { name: 'seasoned', from: 2 },
  { name: 'veteran', from: 5 }
]

// The chance he keeps the first clause beyond the plain order, the second,
// the third and any after. A green officer carries the plain order and
// seldom more; a veteran holds the whole chain. Starting values.
const GRASP = {
  green: [0.35, 0.10, 0.05],
  seasoned: [0.90, 0.55, 0.25],
  veteran: [1.00, 0.95, 0.85]
}

const PERSONALITIES = ['bold', 'steady', 'cautious']

// Battles come through before an officer has a name: when he is seasoned.
const NAMED_AT = GRADES[1].from

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

module.exports = { GRADES, GRASP, PERSONALITIES, MAX_STEPS, NAMED_AT, gradeOf, chanceToKeep, clauses, grasp, losingTheThread }
