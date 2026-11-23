// src/harness/army-study/usual.js
//
// The usual armies of the twenty factions, against each other, in worker
// processes (pool.js): the league (as faction-league.js plays it: both
// sides the computer, each with its Commander on its elite, every map,
// both ways round, every battle its own seed), and the re-pick of a
// faction's usual army by the method that picked them (docs/DECISIONS.md,
// "How the twenty factions were built"): each candidate plays every other
// faction's usual army, and the one nearest to winning half is kept.
//
//   node src/harness/army-study/usual.js league --seeds 2
//   node src/harness/army-study/usual.js repick --seeds 2 rome,macedon
//
// Candidates are below (CANDIDATES), each a list a player could buy. They
// are kept to the doc's restrictions (docs/DECISIONS.md, the table of
// perks and restrictions) and to the faction's own troops.

const L = require('./lib')
const { runBattles } = require('./pool')
const { usualArmy } = require('../../engine/army/standard')
const { FACTIONS } = require('../../data/factions')

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt }
const SEEDS = Number(arg('--seeds', 2))
const MAPS = arg('--maps', null)?.split(',') ?? L.MAPS

const army = (f, units = usualArmy(f)) => ({ faction: f, units })

/** Every pairing of these armies ({ key: army }), both ways round, every map. */
function pairJobs(armies, { seeds = SEEDS, maps = MAPS, tag = 'usual' } = {}) {
  const keys = Object.keys(armies)
  const jobs = []
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    for (const map of maps) for (let s = 1; s <= seeds; s++) for (const flip of [false, true]) {
      const [a, b] = flip ? [keys[j], keys[i]] : [keys[i], keys[j]]
      jobs.push({ a, b, red: armies[a], blue: armies[b], map, seed: L.seedFor(tag, a, b, map, s) })
    }
  }
  return jobs
}

async function league(armies = Object.fromEntries(Object.keys(FACTIONS).map(f => [f, army(f)])), o = {}) {
  const jobs = pairJobs(armies, o)
  const results = await runBattles(jobs)
  const record = Object.fromEntries(Object.keys(armies).map(k => [k, { won: 0, lost: 0, battles: 0 }]))
  const pairs = {}
  let turns = 0, commanders = 0, taken = 0, killed = 0, ended = 0
  jobs.forEach((j, i) => {
    const r = results[i]
    const key = [j.a, j.b].sort().join(' v ')
    const p = pairs[key] ?? (pairs[key] = { a: [j.a, j.b].sort()[0], b: [j.a, j.b].sort()[1], wins: {}, battles: 0 })
    p.battles++
    if (r.decided) ended++
    turns += r.turns
    const winner = r.winner === 'red' ? j.a : r.winner === 'blue' ? j.b : null
    if (winner) p.wins[winner] = (p.wins[winner] ?? 0) + 1
    for (const k of [j.a, j.b]) {
      record[k].battles++
      if (winner === k) record[k].won++
      else if (winner) record[k].lost++
    }
    for (const side of ['red', 'blue']) {
      commanders++
      if (r.fates[side] && r.fates[side] !== 'free') taken++
      if (r.fates[side] === 'killed') killed++
    }
  })
  return { record, pairs, battles: jobs.length, ended, turns: turns / jobs.length, commanders, taken, killed }
}

const worst = (p) => Math.max(...Object.values(p.wins), 0) / Math.max(1, p.battles)

function printLeague(r) {
  const pct = L.pct
  console.log(`${r.battles} battles, ${r.ended} ended; ${r.turns.toFixed(1)} player turns on average.\n`)
  console.log('| Faction | Won | Lost |')
  console.log('|---|---|---|')
  for (const [f, x] of Object.entries(r.record).sort((a, b) => b[1].won / b[1].battles - a[1].won / a[1].battles)) {
    console.log(`| ${FACTIONS[f]?.title ?? f} | ${pct(x.won / x.battles)} | ${pct(x.lost / x.battles)} |`)
  }
  const lop = Object.values(r.pairs).filter(p => worst(p) > 0.75).sort((x, y) => worst(y) - worst(x))
  const rates = Object.values(r.record).map(x => x.won / x.battles)
  console.log(`\nFactions over 65% or under 35%: ${rates.filter(x => x > 0.65 || x < 0.35).length}. Pairings worse than 75/25: ${lop.length} of ${Object.keys(r.pairs).length}.`)
  console.log(lop.slice(0, 30).map(p => `${p.a} ${pct((p.wins[p.a] ?? 0) / p.battles)} v ${p.b} ${pct((p.wins[p.b] ?? 0) / p.battles)}`).join('; '))
}

// ── Candidates ───────────────────────────────────────
const k = (quality, weapon, armor = 'no_armor', shield = 'no_shield', mounted = false) => ({ quality, weapon, armor, shield, mounted })
const CANDIDATES = require('./candidates')

/** Each candidate of a faction against every other faction's usual army. */
async function repick(factions, o = {}) {
  const field = Object.fromEntries(Object.keys(FACTIONS).map(f => [f, army(f)]))
  const jobs = []
  for (const f of factions) {
    const list = [{ label: 'now', units: usualArmy(f) }, ...(CANDIDATES[f] ?? []).map(c => ({ label: c.label, units: L.named(f, c.kits) }))]
    for (const c of list) {
      const checked = L.legal(f, c.units)
      if (!checked.ok) { console.log(`${f} ${c.label}: not legal: ${checked.errors.join('; ')}`); continue }
      for (const other of Object.keys(FACTIONS)) {
        if (other === f) continue
        for (const map of o.maps ?? MAPS) for (let s = 1; s <= (o.seeds ?? SEEDS); s++) for (const flip of [false, true]) {
          const mine = { faction: f, units: c.units }
          jobs.push({ f, label: c.label, other, flip, red: flip ? field[other] : mine, blue: flip ? mine : field[other], map, seed: L.seedFor('repick', f, other, map, s) })
        }
      }
    }
  }
  const results = await runBattles(jobs)
  const score = {}
  jobs.forEach((j, i) => {
    const key = `${j.f}|${j.label}`
    const sc = score[key] ?? (score[key] = { f: j.f, label: j.label, won: 0, battles: 0, against: {} })
    const side = j.flip ? 'blue' : 'red'
    const w = results[i].winner === side
    sc.battles++; if (w) sc.won++
    const a = sc.against[j.other] ?? (sc.against[j.other] = { won: 0, battles: 0 })
    a.battles++; if (w) a.won++
  })
  for (const f of factions) {
    const rows = Object.values(score).filter(s => s.f === f)
    console.log(`\n${FACTIONS[f].title}:`)
    for (const s of rows.sort((a, b) => Math.abs(a.won / a.battles - 0.5) - Math.abs(b.won / b.battles - 0.5))) {
      const lop = Object.values(s.against).filter(a => a.won / a.battles > 0.75 || a.won / a.battles < 0.25).length
      const sp = s.label === 'now' ? usualArmy(f) : L.named(f, CANDIDATES[f].find(c => c.label === s.label).kits)
      console.log(`  ${L.pct(s.won / s.battles)}  ${s.label}  (${sp.reduce((n, u) => n + L.costOf(f, u), 0)} SP; ${lop} of 19 pairings past 75/25)`)
    }
  }
  return score
}

module.exports = { league, printLeague, repick, pairJobs, k }

if (require.main === module) {
  const cmd = process.argv[2]
  const t0 = Date.now()
  const done = () => console.log(`\nIn ${Math.round((Date.now() - t0) / 1000)} s.`)
  if (L.SETS.length) console.log(`Changed for this run: ${L.SETS.join(', ')}`)
  if (cmd === 'league') league().then(r => { printLeague(r); done() })
  else if (cmd === 'repick') repick((process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : Object.keys(CANDIDATES).join(',')).split(',')).then(done)
  else console.log('usage: usual.js league | repick [factions] [--seeds n] [--maps a,b]')
}
