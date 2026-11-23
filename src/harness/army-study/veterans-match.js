// src/harness/army-study/veterans-match.js
//
// Veterans against the computer, with the match and without it (taken
// 2026-11-23: the computer's army takes the average veterancy of the units
// the Commander fields, up to seasoned: tables.VETERANCY.MATCH_UP_TO).
//
// A Commander's faction's usual army, every unit of it (the elite too, as
// the web app gives each unit its own) carrying one veterancy, against the
// computer's usual army of another faction: the computer's units with none
// ("no match"), or with the Commander's average capped at seasoned
// ("match"), as battles.js musters them (veterancy.js, matchedVeterancy).
// Every faction whose usual army passes the builder today, four maps, both
// ways round, --seeds seeds: each battle its own seed, and the same seeds
// in every row, so rows differ only by the veterancy.
//
//   node src/harness/army-study/veterans-match.js [--seeds 2]
//
// Reported per row: the Commander's win rate, and the share of his men and
// of the computer's men lost a battle.

const L = require('./lib')
const { usualArmy } = require('../../engine/army/standard')
const { factionUnits } = require('../../engine/army/factions')
const { FACTIONS } = require('../../data/factions')
const { matchedVeterancy } = require('../../engine/veterans/veterancy')

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt }
const SEEDS = Number(arg('--seeds', 2))

// The factions whose usual army the builder passes (on some bases not all do).
const FIELDABLE = Object.keys(FACTIONS).filter(f => { try { factionUnits(f, 'red'); return true } catch { return false } })

function row(label, veterancy, match) {
  let won = 0; let battles = 0; let lostMine = 0; let lostTheirs = 0; let matched = 0
  FIELDABLE.forEach((f, i) => {
    for (const map of L.MAPS) for (const side of ['red', 'blue']) for (let s = 1; s <= SEEDS; s++) {
      const other = side === 'red' ? 'blue' : 'red'
      const enemy = FIELDABLE[(i + s) % FIELDABLE.length]
      const mine = { faction: f, units: usualArmy(f) }
      const theirs = { faction: enemy, units: null }
      let theirV = 0
      const r = L.battle(side === 'red' ? mine : theirs, side === 'red' ? theirs : mine, {
        map,
        seed: L.seedFor('vet-match', f, map, side, s),
        mark: (u) => {
          if (u.side === side) return veterancy ? { ...u, veterancy } : u
          theirV = match ? matchedVeterancy([{ veterancy }]) : 0
          return theirV ? { ...u, veterancy: theirV } : u
        }
      })
      battles++
      matched = theirV
      if (r.winner === side) won++
      lostMine += r.lost[side]
      lostTheirs += r.lost[other]
    }
  })
  console.log(`| ${label} | ${match ? matched : 'none'} | ${L.pct(won / battles)} | ${(100 * lostMine / battles).toFixed(1)}% | ${(100 * lostTheirs / battles).toFixed(1)}% |`)
  return battles
}

const LEVELS = [['none', 0], ['green (4)', 4], ['seasoned (8)', 8], ['veteran (13)', 13], ['legendary (20)', 20], ['thirty battles (30)', 30]]

if (require.main === module) {
  const n = FIELDABLE.length * L.MAPS.length * 2 * SEEDS
  console.log(`A Commander's usual army against the computer's (${FIELDABLE.length} factions: ${FIELDABLE.join(', ')}), ${n} battles a row.\n`)
  for (const match of [false, true]) {
    console.log(match ? '\nWith the match (the computer takes his average, up to seasoned):\n' : 'Without the match (the computer\'s army carries none):\n')
    console.log('| His units carry | The computer\'s carry | He won | His men lost | The computer\'s men lost |')
    console.log('|---|---|---|---|---|')
    for (const [label, v] of LEVELS) row(label, v, match)
  }
}

module.exports = { FIELDABLE }
