// src/harness/army-study/veterans.js
//
// What earned veterancy does in a battle (docs/design/army-balance.md, part
// 4). Each faction's usual army, bought as a list, fights itself: one side's
// bought units (not the elite) carry a veterancy, the other side's none. Four
// factions, four maps, both ways round, --seeds seeds: 32 x seeds battles a
// row. Reported: the veteran side's win rate, and the share of its men and
// of the other side's men lost a battle.
//
// Two ways a veterancy can reach a unit:
//   resistance  the old rule: veteranResistance, added to the morale divisor
//               (veterans/veterancy.js; read in combat/ratings.js)
//   veterancy   the unit's average experience, 0 to 30, as the company keeps
//               it (command/company.js, unitsOf). It does something only
//               with the Part 4 proposal commit, which teaches the engine to
//               read it (tables.VETERANCY.STEPS); without that it is ignored.
//
//   node src/harness/army-study/veterans.js [--seeds 4] [--vs usual]
//
// --vs usual: the veteran army plays the computer's usual armies (no
// veterancy), as a long-lived Commander against the computer would.

const L = require('./lib')
const { usualArmy } = require('../../engine/army/standard')
const { FACTIONS } = require('../../data/factions')
const { fieldArmies } = require('../../engine/army/standard')

const T = require('../../engine/combat/tables')

// Ways earned veterancy might work, for --steps (the Part 4 proposal's
// table, tables.VETERANCY.STEPS: at each step from so much average
// experience, `fight` added to the unit's attack and defence ratings and
// `stand` to its morale resistance).
const STEP_SETS = {
  stand: [{ from: 4, fight: 0, stand: 0.15 }, { from: 8, fight: 0, stand: 0.3 }, { from: 13, fight: 0, stand: 0.45 }, { from: 20, fight: 0, stand: 0.6 }],
  fight: [{ from: 4, fight: 0.5, stand: 0 }, { from: 8, fight: 1, stand: 0 }, { from: 13, fight: 1.5, stand: 0 }, { from: 20, fight: 2, stand: 0 }],
  mix: [{ from: 4, fight: 0.5, stand: 0.05 }, { from: 8, fight: 1, stand: 0.1 }, { from: 13, fight: 1.5, stand: 0.15 }, { from: 20, fight: 2, stand: 0.2 }],
  survive: [{ from: 4, survive: 0.05 }, { from: 8, survive: 0.1 }, { from: 13, survive: 0.15 }, { from: 20, survive: 0.2 }],
  'survive+stand': [{ from: 4, survive: 0.05, stand: 0.05 }, { from: 8, survive: 0.1, stand: 0.1 }, { from: 13, survive: 0.15, stand: 0.15 }, { from: 20, survive: 0.2, stand: 0.2 }],
  'survive+fight': [{ from: 4, survive: 0.05, fight: 0.25 }, { from: 8, survive: 0.1, fight: 0.5 }, { from: 13, survive: 0.15, fight: 0.75 }, { from: 20, survive: 0.2, fight: 1 }],
  half: [{ from: 4, fight: 0.25, stand: 0.05 }, { from: 8, fight: 0.5, stand: 0.1 }, { from: 13, fight: 0.75, stand: 0.15 }, { from: 20, fight: 1, stand: 0.2 }]
}

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt }
const SEEDS = Number(arg('--seeds', 4))
const VS = arg('--vs', 'mirror')
const STEPS = arg('--steps', null)
if (STEPS) {
  if (!T.VETERANCY) throw new Error('no VETERANCY table')
  T.VETERANCY.STEPS = STEP_SETS[STEPS]
}

// The battle, with one side's bought units carrying `extra` fields.
function veteranBattle(faction, enemy, side, extra, { map, seed }) {
  const other = side === 'red' ? 'blue' : 'red'
  const mine = { faction, units: usualArmy(faction) }
  const theirs = VS === 'usual' ? { faction: enemy, units: null } : { faction: enemy, units: usualArmy(enemy) }
  // lib.battle builds the spec; give it a hook to mark the veterans.
  return L.battle(side === 'red' ? mine : theirs, side === 'red' ? theirs : mine, {
    map, seed, mark: (u) => (u.side === side && u.quality !== 'elite' ? { ...u, ...extra } : u)
  })
}

function row(label, extra) {
  let won = 0; let battles = 0; let lostMine = 0; let lostTheirs = 0
  for (const f of Object.keys(FACTIONS)) for (const map of L.MAPS) for (const side of ['red', 'blue']) for (let s = 1; s <= SEEDS; s++) {
    const enemy = VS === 'usual' ? Object.keys(FACTIONS)[(Object.keys(FACTIONS).indexOf(f) + s) % 4] : f
    const r = veteranBattle(f, enemy, side, extra, { map, seed: L.seedFor('vet', VS, f, map, side, s) })
    const other = side === 'red' ? 'blue' : 'red'
    battles++
    if (r.winner === side) won++
    lostMine += r.lost[side]
    lostTheirs += r.lost[other]
  }
  console.log(`| ${label} | ${L.pct(won / battles)} | ${(100 * lostMine / battles).toFixed(1)}% | ${(100 * lostTheirs / battles).toFixed(1)}% |`)
}

const ROWS = [
  ['none', {}],
  ['resistance 0.2 (old rule, "Seasoned")', { veteranResistance: 0.2 }],
  ['resistance 0.4', { veteranResistance: 0.4 }],
  ['resistance 0.8 (old rule, "Legendary")', { veteranResistance: 0.8 }],
  ['veterancy 4', { veterancy: 4 }],
  ['veterancy 8', { veterancy: 8 }],
  ['veterancy 13', { veterancy: 13 }],
  ['veterancy 20', { veterancy: 20 }],
  ['veterancy 30', { veterancy: 30 }]
]

if (require.main === module) {
  void fieldArmies
  if (STEPS) console.log(`Veterancy steps: ${STEPS} (${JSON.stringify(STEP_SETS[STEPS])})\n`)
  console.log(`${VS === 'usual' ? 'The veteran army against the computer\'s usual armies (another faction each seed)' : 'Each usual army against itself'}: ${32 * SEEDS} battles a row.\n`)
  console.log('| Veteran side carries | Veteran side won | Its men lost | Other side\'s men lost |')
  console.log('|---|---|---|---|')
  const only = process.argv.slice(2).filter(a => !a.startsWith('--') && !/^\d+$/.test(a) && a !== VS && a !== STEPS)
  for (const [label, extra] of ROWS) if (!only.length || only.some(o => label.startsWith(o))) row(label, extra)
}

module.exports = { veteranBattle, ROWS, STEP_SETS }
