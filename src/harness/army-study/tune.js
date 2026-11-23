// src/harness/army-study/tune.js
//
// Tries candidate rule changes for Recommendation A (docs/design/army-balance.md)
// against one panel of armies, in memory: nothing is written. The panel is
// bought-league.js's five kinds of army for every faction (bought again
// under each candidate's prices, so "slingers" buys as many as it can), a
// dozen one-note and mixed armies, and the usual armies against each other.
// Each army plays the four usual armies, four maps, both ways round, the
// computer's planner on both sides, every battle its own seed.
//
//   node src/harness/army-study/tune.js                  every candidate
//   node src/harness/army-study/tune.js now final        some candidates
//   node src/harness/army-study/tune.js --seeds 3
//
// A candidate that sets MISSILES.SKILL or MISSILES.SHOCK needs the hooks the
// proposal commit adds (combat/ranged.js, combat/resolve.js); without them
// those two numbers do nothing.

const L = require('./lib')
const T = require('../../engine/combat/tables')
const D = require('../../engine/army/data')
const { FACTIONS } = require('../../data/factions')

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt }
const SEEDS = Number(arg('--seeds', 2))
const only = process.argv.slice(2).filter(a => !a.startsWith('--') && !/^\d+$/.test(a))

// ── Candidates: [object, key, value] patches ─────────
const levySkill = (levy, militia) => ({ levy, militia, tribal_warriors: militia, professional: 1, veteran_mercenary: 1.1, elite: 1.2 })
const SIDEARM = [T.MISSILES, 'SIDEARM', 'daggers']
// The round-three base: missile troops fight with a knife, volleys shake at
// half, levy and militia one step steadier.
const R = [SIDEARM, [T.MISSILES, 'SHOCK', 0.5], [T.QUALITY_TIERS.levy, 'morale', 1], [T.QUALITY_TIERS.militia, 'morale', 2]]
const SPEAR3 = [D.WEAPONS.spear_professional, 'sp', 3]
// With the war spear at 3, Macedon's usual army is a point over budget: its
// hypaspists carry a light shield instead of a medium one (in memory only;
// the report says so).
const HYPASPISTS = [FACTIONS.macedon.army[2], 'shield', 'light_shield']
const LADDER = [[T.QUALITY_TIERS.levy, 'morale', 1], [T.QUALITY_TIERS.militia, 'morale', 2]]
const SLING200 = [T.WEAPONS.sling, 'range', 200]
const HORSE2 = [[D, 'MOUNT_SP', 2], [D, 'MOUNT_SP_DISCOUNTED', 1]]
const VET = [[T.QUALITY_TIERS.veteran_mercenary, 'morale', 2], [T.QUALITY_TIERS.veteran_mercenary, 'cost', 10]]
const CANDIDATES = {
  now: [],
  'sling 2 SP': [[D.WEAPONS.sling, 'sp', 2]],
  'shock 0.5': [[T.MISSILES, 'SHOCK', 0.5]],
  'skill': [[T.MISSILES, 'SKILL', levySkill(0.5, 0.75)]],
  'skill+shock': [[T.MISSILES, 'SKILL', levySkill(0.5, 0.75)], [T.MISSILES, 'SHOCK', 0.5]],
  'levy morale 1': [[T.QUALITY_TIERS.levy, 'morale', 1]],
  'shock 0.33': [[T.MISSILES, 'SHOCK', 0.33]],
  'shock 0.33, sling 2': [[T.MISSILES, 'SHOCK', 0.33], [D.WEAPONS.sling, 'sp', 2]],
  'shock 0.33, rate 0.06, sling 2': [[T.MISSILES, 'SHOCK', 0.33], [T.MISSILES, 'RATE', 0.06], [D.WEAPONS.sling, 'sp', 2]],
  'B + morale ladder': [[T.MISSILES, 'SHOCK', 0.33], [D.WEAPONS.sling, 'sp', 2], [T.QUALITY_TIERS.levy, 'morale', 1], [T.QUALITY_TIERS.militia, 'morale', 2]],
  'B + price ladder': [[T.MISSILES, 'SHOCK', 0.33], [D.WEAPONS.sling, 'sp', 2], [T.QUALITY_TIERS.levy, 'cost', 2], [T.QUALITY_TIERS.militia, 'cost', 4]],
  // Missile troops fight hand to hand with a knife, not their sling (needs
  // the proposal's hook, MISSILES.SIDEARM).
  sidearm: [SIDEARM],
  'sidearm, shock 0.5': [SIDEARM, [T.MISSILES, 'SHOCK', 0.5]],
  'sidearm, shock 0.5, sling 2': [SIDEARM, [T.MISSILES, 'SHOCK', 0.5], [D.WEAPONS.sling, 'sp', 2]],
  'sidearm, shock 0.5, morale ladder': [SIDEARM, [T.MISSILES, 'SHOCK', 0.5], [T.QUALITY_TIERS.levy, 'morale', 1], [T.QUALITY_TIERS.militia, 'morale', 2]],
  'sidearm, shock 0.5, price ladder': [SIDEARM, [T.MISSILES, 'SHOCK', 0.5], [T.QUALITY_TIERS.levy, 'cost', 2], [T.QUALITY_TIERS.militia, 'cost', 4]],
  'sidearm, sling 2, price ladder': [SIDEARM, [D.WEAPONS.sling, 'sp', 2], [T.QUALITY_TIERS.levy, 'cost', 2], [T.QUALITY_TIERS.militia, 'cost', 4]],
  R1: [...R, HYPASPISTS, SPEAR3],
  R2: [...R, HYPASPISTS, SPEAR3, SLING200],
  R3: [...R, HYPASPISTS, SPEAR3, [D.WEAPONS.sling, 'sp', 2]],
  R4: [...R, HYPASPISTS, SPEAR3, [D.WEAPONS.sling, 'sp', 2], ...HORSE2],
  R5: [...R, HYPASPISTS, SPEAR3, SLING200, ...HORSE2, ...VET],
  F1: [SIDEARM, [T.MISSILES, 'SHOCK', 0.67], ...LADDER, SLING200, HYPASPISTS],
  F2: [SIDEARM, [T.MISSILES, 'SHOCK', 0.67], ...LADDER, HYPASPISTS],
  F3: [SIDEARM, [T.MISSILES, 'SHOCK', 0.5], ...LADDER, SLING200, HYPASPISTS],
  F4: [SIDEARM, [T.MISSILES, 'SHOCK', 0.67], ...LADDER, SLING200, HYPASPISTS, [D.WEAPONS.sling, 'sp', 2]],
  F5: [SIDEARM, [T.MISSILES, 'SHOCK', 0.67], ...LADDER, SLING200, HYPASPISTS, [D.WEAPONS.sling, 'sp', 2], [T.QUALITY_TIERS.levy, 'cost', 2]],
  F6: [SIDEARM, [T.MISSILES, 'SHOCK', 0.67], ...LADDER, SLING200, HYPASPISTS, [D.WEAPONS.sling, 'sp', 2], [T.QUALITY_TIERS.levy, 'cost', 2], [T.QUALITY_TIERS.militia, 'cost', 4]],
  R6: [...R.filter(p => p[1] !== 'SHOCK'), [T.MISSILES, 'SHOCK', 0.67], HYPASPISTS, SPEAR3, SLING200, ...HORSE2, ...VET]
}

// ── The panel ────────────────────────────────────────
const K = {
  levySpear: { quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'light_shield' },
  sling: { quality: 'levy', weapon: 'sling' },
  bow: { quality: 'levy', weapon: 'self_bow_basic', armor: 'light_armor' },
  legion: { quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' },
  proSpear: { quality: 'professional', weapon: 'spear_professional', armor: 'light_armor', shield: 'medium_shield' },
  milSpear: { quality: 'militia', weapon: 'spear_professional', armor: 'light_armor', shield: 'light_shield' },
  axe: { quality: 'professional', weapon: 'great_axe', armor: 'light_armor' },
  sarissa: { quality: 'professional', weapon: 'macedonian_sarissa', armor: 'light_armor' },
  xbow: { quality: 'professional', weapon: 'han_chinese_crossbow', armor: 'light_armor' },
  ha: { quality: 'tribal_warriors', weapon: 'self_bow_basic', armor: 'light_armor', mounted: true },
  rider: { quality: 'tribal_warriors', weapon: 'sword_standard', armor: 'medium_armor', shield: 'light_shield', mounted: true },
  proSling: { quality: 'professional', weapon: 'sling', armor: 'medium_armor' },
  milSling: { quality: 'militia', weapon: 'sling', armor: 'light_armor', shield: 'light_shield' },
  proBow: { quality: 'professional', weapon: 'greek_composite_bow', armor: 'light_armor' },
  tribSling: { quality: 'tribal_warriors', weapon: 'sling', armor: 'light_armor', shield: 'light_shield' },
  proRider: { quality: 'professional', weapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield', mounted: true }
}
const fill = (faction, kits) => {
  // As many rounds of the list as the budget buys, in order.
  const out = []
  let spent = 0
  for (let round = 0; round < 12; round++) {
    let bought = false
    for (const k of kits) {
      const c = L.costOf(faction, k)
      if (c !== null && spent + c <= L.budgetOf(faction)) { out.push(k); spent += c; bought = true }
    }
    if (!bought) break
  }
  return L.named(faction, out)
}
const EXTRA = [
  ['rome', 'levy archers', [K.bow]],
  ['rome', 'pro spears', [K.proSpear]],
  ['rome', 'militia spears', [K.milSpear]],
  ['rome', 'pro great axes', [K.axe]],
  ['rome', 'legion + levy spears + slingers', [K.legion, K.levySpear, K.sling, K.levySpear, K.sling]],
  ['rome', 'pro spears + slingers', [K.proSpear, K.sling, K.proSpear, K.sling]],
  ['macedon', 'sarissas', [K.sarissa]],
  ['han', 'crossbows', [K.xbow]],
  ['han', 'crossbows + levy spears', [K.xbow, K.levySpear]],
  ['sarmatia', 'horse archers', [K.ha]],
  ['sarmatia', 'riders', [K.rider]],
  ['sarmatia', 'horse archers + levy spears', [K.ha, K.levySpear, K.ha]],
  ['rome', 'pro slingers, medium armour', [K.proSling]],
  ['rome', 'militia slingers', [K.milSling]],
  ['macedon', 'pro archers (composite bow)', [K.proBow]],
  ['sarmatia', 'tribal slingers on foot', [K.tribSling]],
  ['sarmatia', 'pro riders', [K.proRider]],
  ['rome', 'pro legion + pro slingers', [K.legion, K.proSling]]
]

function panel() {
  const { boughtArmies } = require('../bought-league')
  const out = []
  for (const f of Object.keys(FACTIONS)) {
    for (const [kind, units] of Object.entries(boughtArmies(f))) if (kind !== 'usual') out.push({ faction: f, kind, units })
  }
  for (const [f, kind, kits] of EXTRA) out.push({ faction: f, kind, units: fill(f, kits) })
  return out
}

function usualLeague() {
  const fs = Object.keys(FACTIONS)
  const rate = Object.fromEntries(fs.map(f => [f, { won: 0, battles: 0 }]))
  for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) for (const map of L.MAPS) for (let s = 1; s <= SEEDS * 2; s++) for (const flip of [false, true]) {
    const [a, b] = flip ? [fs[j], fs[i]] : [fs[i], fs[j]]
    // As faction-league.js: each side its Commander with its elite.
    const r = L.battle({ faction: a, units: require('../../engine/army/standard').usualArmy(a) }, { faction: b, units: require('../../engine/army/standard').usualArmy(b) }, { map, seed: L.seedFor('league', a, b, map, s) })
    rate[a].battles++; rate[b].battles++
    if (r.winner === 'red') rate[a].won++
    if (r.winner === 'blue') rate[b].won++
  }
  return rate
}

function run(name, patches) {
  const saved = patches.map(([o, k]) => [o, k, o[k]])
  for (const [o, k, v] of patches) o[k] = v
  try {
    const rows = panel().map(a => {
      if (!L.legal(a.faction, a.units).ok) return { ...a, rate: null }
      const r = L.evaluate(a, L.USUAL, { seeds: SEEDS, tag: 'tune' })
      return { ...a, rate: r.rate, lost: r.lostOwn / r.battles }
    })
    const league = usualLeague()
    const rates = rows.filter(r => r.rate !== null).map(r => r.rate)
    const spread = Math.sqrt(rates.reduce((s, x) => s + (x - 0.5) ** 2, 0) / rates.length)
    console.log(`\n### ${name}\n`)
    console.log(`Usual armies against each other: ${Object.entries(league).map(([f, x]) => `${f} ${L.pct(x.won / x.battles)}`).join(', ')}`)
    console.log(`Panel: ${rates.filter(x => x > 0.7).length} armies over 70%, ${rates.filter(x => x < 0.2).length} under 20%; distance from 50%: ${L.pct(spread)}\n`)
    console.log('| Faction | Army | Units | SP | Won v usual |')
    console.log('|---|---|---|---|---|')
    for (const r of rows) {
      const sp = r.units.reduce((s, u) => s + (L.costOf(r.faction, u) ?? 0), 0)
      console.log(`| ${r.faction} | ${r.kind} | ${r.units.length} | ${sp} | ${r.rate === null ? 'not legal' : L.pct(r.rate)} |`)
    }
  } finally {
    for (const [o, k, v] of saved) o[k] = v
  }
}

module.exports = { CANDIDATES, panel, run }

if (require.main === module) {
  console.log(`Each army: ${16 * 2 * SEEDS} battles against the usual armies. The league: each pair of usual armies ${L.MAPS.length * 4 * SEEDS} battles.`)
  for (const [name, patches] of Object.entries(CANDIDATES)) if (!only.length || only.includes(name)) run(name, patches)
}
