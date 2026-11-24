// src/harness/army-study/try.js
//
// Any armies against the field of usual armies, in workers: for quick
// experiments while tuning (docs/design/army-balance.md, part 5).
//
//   node src/harness/army-study/try.js 'rome: 3x professional spear_basic heavy_armor light_shield' \
//        'sarmatia: 3x tribal_warriors self_bow_basic light_armor no_shield horse' --seeds 1
//
// Each army: faction, then groups "Nx quality weapon armour shield [horse]",
// joined by " + ". A second weapon after the first, with "&":
// "3x professional roman_gladius&roman_pilum medium_armor heavy_shield".
// `--set` works as in the other study scripts.

const L = require('./lib')
const { runBattles } = require('./pool')
const { FACTIONS } = require('../../data/factions')

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt }
const SEEDS = Number(arg('--seeds', 1))

function parse(text) {
  const [f, rest] = text.split(':').map(s => s.trim())
  const kits = []
  for (const group of rest.split('+').map(s => s.trim())) {
    const [n, quality, weapon, armor = 'no_armor', shield = 'no_shield', horse] = group.replace(/^(\d+)x\s*/, '$1 ').split(/\s+/)
    const [main, second] = weapon.split('&')
    for (let i = 0; i < Number(n); i++) kits.push({ quality, weapon: main, ...(second ? { second } : {}), armor, shield, mounted: horse === 'horse' })
  }
  return { label: text, army: { faction: f, units: L.named(f, kits) } }
}

async function main() {
  const skip = new Set()
  process.argv.forEach((a, i) => { if (a.startsWith('--')) { skip.add(i); skip.add(i + 1) } })
  const texts = process.argv.slice(2).filter((a, i) => !skip.has(i + 2))
  const list = texts.map(parse)
  const jobs = []
  for (const a of list) {
    const ok = L.legal(a.army.faction, a.army.units)
    if (!ok.ok) { console.log(`not legal: ${a.label}: ${ok.errors.join('; ')}`); continue }
    for (const enemy of Object.keys(FACTIONS)) for (const map of L.MAPS) for (let s = 1; s <= SEEDS; s++) for (const flip of [false, true]) {
      const usual = L.usual(enemy)
      jobs.push({ a, flip, red: flip ? usual : a.army, blue: flip ? a.army : usual, map, seed: L.seedFor('try', a.label, enemy, map, s) })
    }
  }
  const results = await runBattles(jobs)
  const score = new Map()
  jobs.forEach((j, i) => {
    const sc = score.get(j.a) ?? { won: 0, battles: 0, turns: 0 }
    sc.battles++; sc.turns += results[i].turns
    if (results[i].winner === (j.flip ? 'blue' : 'red')) sc.won++
    score.set(j.a, sc)
  })
  if (L.SETS.length) console.log(`Changed for this run: ${L.SETS.join(', ')}`)
  for (const [a, sc] of score) {
    const sp = a.army.units.reduce((n, u) => n + L.costOf(a.army.faction, u), 0)
    console.log(`${L.pct(sc.won / sc.battles).padStart(4)}  ${sp} SP  ${(sc.turns / sc.battles).toFixed(1)} turns  ${a.label}`)
  }
}

main()
