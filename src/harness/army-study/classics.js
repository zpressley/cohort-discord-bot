// src/harness/army-study/classics.js
//
// The classic armies a player thinks of (docs/design/army-balance.md, part
// 5): a mob of levy, an army of slingers, of archers, all horse, horse
// archers, heavy infantry, pikes, and a balanced army. Each is bought by
// three factions (Rome, Sarmatia, Han: full-price horse, cheap horse and
// tribal warriors, and the crossbow), as many of its kit as the budget
// buys, and played
//   field   against every faction's usual army (the computer's), every
//           map, both ways round; the bought side has its Commander on its
//           elite, the usual side none, as in the app
//   kinds   against each other, kind against kind (each kind's three
//           factions against the other kind's three), every map, both
//           ways round: who beats whom
//
//   node src/harness/army-study/classics.js field --seeds 1
//   node src/harness/army-study/classics.js kinds --seeds 1
//   node src/harness/army-study/classics.js both

const L = require('./lib')
const { runBattles } = require('./pool')
const { FACTIONS } = require('../../data/factions')

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt }
const SEEDS = Number(arg('--seeds', 1))
const FACTIONS_USED = (arg('--factions', 'rome,sarmatia,han')).split(',')

const k = (quality, weapon, armor = 'no_armor', shield = 'no_shield', mounted = false) => ({ quality, weapon, armor, shield, mounted })
const tribalOr = (f, q) => (['sarmatia', 'celts', 'germania', 'berbers', 'thrace', 'mongolia'].includes(f) ? 'tribal_warriors' : q)

// Each classic: a list of kits bought in turn, round after round, while the
// budget lasts (the first that the faction may buy, of each alternative).
const CLASSICS = {
  levy: (f) => [[k('levy', 'spear_basic', 'light_armor', 'light_shield')]],
  slingers: (f) => [[k('levy', 'sling')]],
  archers: (f) => [[k('levy', 'self_bow_basic', 'light_armor')]],
  horse: (f) => [[k(tribalOr(f, 'militia'), 'sword_standard', 'light_armor', 'light_shield', true)]],
  'horse archers': (f) => [[k(tribalOr(f, 'militia'), 'self_bow_basic', 'light_armor', 'no_shield', true)]],
  heavy: (f) => [[k('professional', 'spear_basic', 'heavy_armor', 'light_shield')]],
  pikes: (f) => [[k('professional', 'two_handed_spear', 'light_armor')]],
  balanced: (f) => [
    [k('professional', 'sword_standard', 'medium_armor', 'medium_shield')],
    [k(tribalOr(f, 'militia'), 'spear_basic', 'light_armor', 'light_shield')],
    [k('levy', 'self_bow_basic', 'light_armor')],
    [k(tribalOr(f, 'militia'), 'sword_standard', 'light_armor', 'light_shield', true)]
  ]
}

function buyClassic(f, kind) {
  const wishes = CLASSICS[kind](f)
  const out = []
  let spent = 0
  // The balanced army buys each of its kinds once, in turn, then stops.
  const rounds = kind === 'balanced' ? 1 : 12
  for (let round = 0; round < rounds; round++) {
    let bought = false
    for (const alts of wishes) {
      const kit = alts.find(x => { const c = L.costOf(f, x); return c !== null && spent + c <= L.budgetOf(f) })
      if (!kit) continue
      out.push(kit); spent += L.costOf(f, kit); bought = true
    }
    if (!bought) break
  }
  const units = L.named(f, out)
  const ok = L.legal(f, units)
  if (!ok.ok) throw new Error(`${f} ${kind}: ${ok.errors.join('; ')}`)
  return { faction: f, units }
}

function armies() {
  const out = []
  for (const kind of Object.keys(CLASSICS)) for (const f of FACTIONS_USED) out.push({ kind, f, army: buyClassic(f, kind) })
  return out
}

async function field() {
  const list = armies()
  const jobs = []
  for (const a of list) for (const enemy of Object.keys(FACTIONS)) for (const map of L.MAPS) for (let s = 1; s <= SEEDS; s++) for (const flip of [false, true]) {
    const usual = L.usual(enemy)
    jobs.push({ a, flip, enemy, red: flip ? usual : a.army, blue: flip ? a.army : usual, map, seed: L.seedFor('classic', a.kind, a.f, enemy, map, s) })
  }
  const results = await runBattles(jobs)
  const score = {}
  jobs.forEach((j, i) => {
    const key = j.a.kind
    const sc = score[key] ?? (score[key] = { won: 0, battles: 0, by: {}, atDusk: 0, unended: 0 })
    const w = results[i].winner === (j.flip ? 'blue' : 'red')
    sc.battles++; if (w) sc.won++
    // Ended by the day: no winner (lib.battle).
    if (results[i].dayEnded) sc.atDusk++
    if (!results[i].decided) sc.unended++
    const b = sc.by[j.a.f] ?? (sc.by[j.a.f] = { won: 0, battles: 0 })
    b.battles++; if (w) b.won++
  })
  console.log(`\n### The classic armies against the usual armies (${jobs.length / list.length} battles each)\n`)
  console.log(`| Army | Won | ${FACTIONS_USED.map(f => FACTIONS[f].title).join(' | ')} | Units (${FACTIONS_USED[0]}) | Ended by the day | Not ended |`)
  console.log(`|---|---|${FACTIONS_USED.map(() => '---').join('|')}|---|---|---|`)
  for (const [kind, sc] of Object.entries(score)) {
    const first = list.find(a => a.kind === kind && a.f === FACTIONS_USED[0]).army.units.length
    console.log(`| ${kind} | ${L.pct(sc.won / sc.battles)} | ${FACTIONS_USED.map(f => L.pct(sc.by[f].won / sc.by[f].battles)).join(' | ')} | ${first} | ${sc.atDusk} | ${sc.unended} |`)
  }
  return score
}

async function kinds() {
  const list = armies()
  const kindsList = Object.keys(CLASSICS)
  const jobs = []
  for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
    if (list[i].kind >= list[j].kind) continue
    for (const map of L.MAPS) for (let s = 1; s <= SEEDS; s++) for (const flip of [false, true]) {
      const [a, b] = flip ? [list[j], list[i]] : [list[i], list[j]]
      jobs.push({ a, b, red: a.army, blue: b.army, map, seed: L.seedFor('kinds', a.kind, a.f, b.kind, b.f, map, s) })
    }
  }
  const results = await runBattles(jobs)
  const grid = {}
  jobs.forEach((j, i) => {
    const r = results[i]
    for (const [me, them, side] of [[j.a, j.b, 'red'], [j.b, j.a, 'blue']]) {
      const cell = (grid[me.kind] ??= {})[them.kind] ??= { won: 0, battles: 0, dayEnded: 0 }
      cell.battles++; if (r.winner === side) cell.won++
      if (r.dayEnded) cell.dayEnded++
    }
  })
  console.log(`\n### Kind against kind (row's wins against column; ${FACTIONS_USED.length * FACTIONS_USED.length * L.MAPS.length * 2 * SEEDS} battles a cell)\n`)
  console.log(`| | ${kindsList.join(' | ')} | All | Ended by the day |`)
  console.log(`|---|${kindsList.map(() => '---').join('|')}|---|---|`)
  for (const r of kindsList) {
    let w = 0, n = 0, d = 0
    const cells = kindsList.map(c => {
      if (c === r) return '-'
      const x = grid[r][c]; w += x.won; n += x.battles; d += x.dayEnded
      return L.pct(x.won / x.battles)
    })
    console.log(`| ${r} | ${cells.join(' | ')} | ${L.pct(w / n)} | ${d} of ${n} |`)
  }
  return grid
}

module.exports = { CLASSICS, buyClassic, field, kinds }

if (require.main === module) {
  const cmd = process.argv[2] ?? 'both'
  const t0 = Date.now()
  if (L.SETS.length) console.log(`Changed for this run: ${L.SETS.join(', ')}`)
  ;(async () => {
    if (cmd === 'field' || cmd === 'both') await field()
    if (cmd === 'kinds' || cmd === 'both') await kinds()
    console.log(`\nIn ${Math.round((Date.now() - t0) / 1000)} s.`)
  })()
}
