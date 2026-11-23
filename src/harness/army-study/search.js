// src/harness/army-study/search.js
//
// Which buildable armies are degenerate (docs/design/army-balance.md, part
// 1). Draws legal armies at random for each faction, within its budget,
// spending at least all but 3 of it: half are one kit repeated ("mono"),
// half a mix of two to four kits. Each is played against the four usual
// armies, four maps, both ways round (32 battles at --seeds 1), the
// computer's planner on both sides. The ten best and ten worst are then
// played again at more seeds, against a player who charges, and against
// each other.
//
//   node src/harness/army-study/search.js                       200 armies a faction, 4 workers
//   node src/harness/army-study/search.js --per 100 --workers 4 --out file.json
//
// Every battle has its own seed (lib.seedFor). The draw of armies is seeded
// too, so a run is repeatable.

const { fork } = require('child_process')
const fs = require('fs')
const L = require('./lib')
const { createRng } = require('../../engine/rng')
const { buildUnit, PURCHASABLE } = require('../../engine/army/builder')
const D = require('../../engine/army/data')
const { FACTIONS } = require('../../data/factions')

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt }

const ARMOURS = ['no_armor', 'light_armor', 'medium_armor', 'heavy_armor']
const SHIELDS = ['no_shield', 'light_shield', 'medium_shield', 'heavy_shield']

/** Every kit the builder allows this faction. */
function kitsOf(faction) {
  const culture = FACTIONS[faction].culture
  const out = []
  for (const quality of PURCHASABLE) for (const weapon of Object.keys(D.WEAPONS)) for (const armor of ARMOURS) for (const shield of SHIELDS) for (const mounted of [false, true]) {
    const kit = { quality, weapon, armor, shield, mounted }
    const r = buildUnit(kit, culture)
    if (r.ok) out.push({ kit, cost: r.cost })
  }
  return out
}

function drawArmies(faction, count, seed) {
  const random = createRng(seed)
  const pick = (list) => list[Math.floor(random() * list.length)]
  const kits = kitsOf(faction)
  const budget = L.budgetOf(faction)
  const armies = []
  const seen = new Set()
  let tries = 0
  while (armies.length < count && tries++ < count * 50) {
    const mono = armies.length % 2 === 0
    const chosen = mono ? [pick(kits)] : Array.from({ length: 2 + Math.floor(random() * 3) }, () => pick(kits))
    const list = []
    let spent = 0
    // Fill: each kit in turn while it fits, so the mix stays a mix.
    for (let round = 0; round < 12; round++) {
      let bought = false
      for (const k of chosen) {
        if (spent + k.cost <= budget && list.length < 10) { list.push(k.kit); spent += k.cost; bought = true }
      }
      if (!bought) break
    }
    if (spent < budget - 3 || list.length === 0) continue
    const key = JSON.stringify(list.map(k => Object.values(k).join(',')).sort())
    if (seen.has(key)) continue
    seen.add(key)
    armies.push({ faction, kind: mono ? 'mono' : 'mix', spent, units: L.named(faction, list) })
  }
  return armies
}

// ── Workers ──────────────────────────────────────────
// A worker is this file with --worker: it reads jobs from its parent and
// sends back results.
if (process.argv.includes('--worker')) {
  process.on('message', ({ jobs, seeds, policy }) => {
    const opps = Object.fromEntries(Object.entries(L.USUAL).map(([k, v]) => [k, { ...v, policy }]))
    const out = jobs.map(a => {
      const r = L.evaluate({ faction: a.faction, units: a.units }, opps, { seeds, tag: `search:${policy}` })
      return { ...a, rate: r.rate, battles: r.battles, against: Object.fromEntries(Object.entries(r.against).map(([k, v]) => [k, v.won / v.battles])), lostOwn: r.lostOwn / r.battles, turns: r.turns / r.battles }
    })
    process.send(out)
    process.exit(0)
  })
  return
}

function inWorkers(armies, { seeds, policy = 'planner', workers }) {
  const chunks = Array.from({ length: workers }, () => [])
  armies.forEach((a, i) => chunks[i % workers].push(a))
  return Promise.all(chunks.filter(c => c.length).map(jobs => new Promise((resolve, reject) => {
    const child = fork(__filename, ['--worker', ...L.SETS.flatMap(set => ['--set', set])])
    child.on('message', resolve)
    child.on('error', reject)
    child.send({ jobs, seeds, policy })
  }))).then(parts => parts.flat())
}

const describe = (a) => {
  const groups = new Map()
  for (const u of a.units) {
    const k = [u.quality.replace('veteran_mercenary', 'veteran').replace('tribal_warriors', 'tribal'), u.weapon, u.armor.replace('_armor', ''), u.shield.replace('_shield', ' shield'), u.mounted ? 'horse' : 'foot'].join(' ')
    groups.set(k, (groups.get(k) ?? 0) + 1)
  }
  return [...groups].map(([k, n]) => `${n}x ${k}`).join(' + ')
}

// Round robin among a set of armies: both ways round, every map, `seeds` seeds.
function roundRobin(armies, seeds) {
  const score = armies.map(() => ({ won: 0, battles: 0 }))
  for (let i = 0; i < armies.length; i++) for (let j = i + 1; j < armies.length; j++) {
    for (const map of L.MAPS) for (let s = 1; s <= seeds; s++) for (const flip of [false, true]) {
      const [a, b] = flip ? [j, i] : [i, j]
      const r = L.battle({ faction: armies[a].faction, units: armies[a].units }, { faction: armies[b].faction, units: armies[b].units },
        { map, seed: L.seedFor('rr', a, b, map, s, flip) })
      score[a].battles++; score[b].battles++
      if (r.winner === 'red') score[a].won++
      else if (r.winner === 'blue') score[b].won++
    }
  }
  return score.map(s => s.won / Math.max(1, s.battles))
}

async function main() {
  const per = Number(arg('--per', 200))
  const workers = Number(arg('--workers', 4))
  const out = arg('--out', null)
  const t0 = Date.now()
  const armies = Object.keys(FACTIONS).flatMap((f, i) => drawArmies(f, per, 4242 + i))
  if (L.SETS.length) console.log(`Changed for this run: ${L.SETS.join(', ')}`)
  console.log(`${armies.length} armies drawn (${per} a faction); screening at 32 battles each...`)
  const screened = (await inWorkers(armies, { seeds: 1, workers })).sort((a, b) => b.rate - a.rate)
  console.log(`screened in ${Math.round((Date.now() - t0) / 1000)} s`)

  const top = screened.slice(0, 10)
  const bottom = screened.slice(-10)
  const perFaction = Object.keys(FACTIONS).map(f => {
    const mine = screened.filter(a => a.faction === f)
    return { f, best: mine.slice(0, 3), worst: mine.slice(-3), mean: mine.reduce((s, a) => s + a.rate, 0) / mine.length, n: mine.length }
  })

  // Confirm the extremes at more seeds, and against a player who charges.
  const extremes = [...top, ...bottom]
  const confirm = await inWorkers(extremes, { seeds: 3, workers })
  const charge = await inWorkers(extremes, { seeds: 3, policy: 'charge', workers })
  const rr = roundRobin(extremes, 1)
  const find = (list, a) => list.find(b => JSON.stringify(b.units) === JSON.stringify(a.units))

  const p = L.pct
  console.log('\n### The ten best and ten worst armies drawn\n')
  console.log('| # | Faction | Army | SP | Screen (32) | v planner (96) | v charge (96) | v each other | Rome/Mac/Sar/Han (planner) |')
  console.log('|---|---|---|---|---|---|---|---|---|')
  extremes.forEach((a, i) => {
    const c = find(confirm, a)
    const h = find(charge, a)
    console.log(`| ${i < 10 ? i + 1 : `-${20 - i}`} | ${a.faction} | ${describe(a)} | ${a.spent} | ${p(a.rate)} | ${p(c.rate)} | ${p(h.rate)} | ${p(rr[i])} | ${Object.values(c.against).map(x => Math.round(100 * x)).join('/')} |`)
  })

  console.log('\n### By faction (screen)\n')
  console.log('| Faction | Armies | Mean win | Best three | Worst three |')
  console.log('|---|---|---|---|---|')
  for (const r of perFaction) {
    console.log(`| ${r.f} | ${r.n} | ${p(r.mean)} | ${r.best.map(a => `${describe(a)} (${p(a.rate)})`).join('; ')} | ${r.worst.map(a => `${describe(a)} (${p(a.rate)})`).join('; ')} |`)
  }

  // What the field looks like: share of armies by win-rate band, and what the strong have in common.
  const bands = [[0.8, 1.01], [0.6, 0.8], [0.4, 0.6], [0.2, 0.4], [0, 0.2]]
  console.log('\n### How the drawn armies spread\n')
  console.log('| Win rate | Armies | Of which mono | Mean missile units | Mean units | Mean horse units |')
  console.log('|---|---|---|---|---|---|')
  const shoots = (u) => ['primary_ranged', 'stackable_ranged'].includes(D.WEAPONS[u.weapon].stacking) && (require('../../engine/combat/tables').WEAPONS[u.weapon].range ?? 0) >= 100
  for (const [lo, hi] of bands) {
    const inBand = screened.filter(a => a.rate >= lo && a.rate < hi)
    const m = (f) => (inBand.reduce((s, a) => s + f(a), 0) / Math.max(1, inBand.length)).toFixed(1)
    console.log(`| ${Math.round(lo * 100)}-${Math.min(100, Math.round(hi * 100))}% | ${inBand.length} | ${inBand.filter(a => a.kind === 'mono').length} | ${m(a => a.units.filter(shoots).length)} | ${m(a => a.units.length)} | ${m(a => a.units.filter(u => u.mounted).length)} |`)
  }
  const mean = (list) => list.reduce((s, a) => s + a.rate, 0) / Math.max(1, list.length)
  const hasMissile = screened.filter(a => a.units.some(shoots))
  const missileShare = (a) => a.units.filter(shoots).length / a.units.length
  console.log(`\nArmies with no missile troops: ${p(mean(screened.filter(a => !a.units.some(shoots))))} mean win (${screened.length - hasMissile.length}); with some: ${p(mean(hasMissile))} (${hasMissile.length}); over half missile: ${p(mean(screened.filter(a => missileShare(a) > 0.5)))} (${screened.filter(a => missileShare(a) > 0.5).length}).`)
  console.log(`Mono armies ${p(mean(screened.filter(a => a.kind === 'mono')))}, mixes ${p(mean(screened.filter(a => a.kind === 'mix')))}. Over 70%: ${screened.filter(a => a.rate > 0.7).length} of ${screened.length}; under 20%: ${screened.filter(a => a.rate < 0.2).length}.`)
  console.log(`\nIn ${Math.round((Date.now() - t0) / 1000)} s.`)
  if (out) fs.writeFileSync(out, JSON.stringify({ screened, confirm, charge, rr }, null, 1))
}

main()
