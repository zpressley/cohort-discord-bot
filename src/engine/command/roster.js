// src/engine/command/roster.js
//
// Give every unit of a battle an officer, when the battle does not bring its
// own (a campaign's officers, who persist, will). Seeded, so the same battle
// always has the same men; pure.
//
// Experience is spread so that a side has all three grades to learn the
// difference by: the elite's officer is a veteran, and the rest run from
// green to seasoned with now and then a veteran among them.

const { createRng } = require('../rng')
const { PERSONALITIES } = require('./officers')
const { NAMES, PLAIN } = require('../../data/officers')

/**
 * @param {Array} units  battle unit specs
 * @param {number} seed  the battle's seed
 * @returns {Array} the units, each with an `officer` (one it already has is kept)
 */
function assignOfficers(units, seed) {
  const random = createRng((Math.imul(seed, 40503) + 11) >>> 0)
  const pick = (list) => list[Math.floor(random() * list.length)]
  const taken = new Set(units.map(u => u.officer?.name).filter(Boolean))

  return units.map(unit => {
    // Draw for every unit, kept or not, so one unit's officer never depends
    // on whether another brought its own.
    const pool = NAMES[unit.culture] ?? PLAIN
    let name = pick(pool)
    for (let tries = 0; taken.has(name) && tries < pool.length; tries++) name = pool[(pool.indexOf(name) + 1) % pool.length]
    const roll = random()
    // The same spread of grades as ever, on the ladder of 2026-11-23: a
    // veteran for the elite (13 to 16 battles); of the rest about 45% green
    // (4 to 7), 40% seasoned (8 to 12) and 15% veteran (13 to 15).
    const experience = unit.quality === 'elite'
      ? 13 + Math.floor(roll * 4)
      : roll < 0.45 ? 4 + Math.floor(roll / 0.45 * 4) : roll < 0.85 ? 8 + Math.floor((roll - 0.45) / 0.40 * 5) : 13 + Math.floor((roll - 0.85) / 0.15 * 3)
    const personality = pick(PERSONALITIES)
    if (unit.officer) return unit
    taken.add(name)
    return { ...unit, officer: { name, experience, personality } }
  })
}

module.exports = { assignOfficers }
