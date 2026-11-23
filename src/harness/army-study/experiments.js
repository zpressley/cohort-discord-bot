// src/harness/army-study/experiments.js
//
// Why the outliers are outliers (docs/design/army-balance.md, part 1). Each
// experiment changes one thing, in memory for the length of the experiment
// only, and plays the army against every faction's usual army on every map,
// both ways round, under two opponents: the computer's planner, and a
// player who orders "everyone advance" every turn ("charge").
//
//   node src/harness/army-study/experiments.js              every group
//   node src/harness/army-study/experiments.js slingers     one group
//   node src/harness/army-study/experiments.js --seeds 4

const L = require('./lib')
const T = require('../../engine/combat/tables')
const D = require('../../engine/army/data')

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt }
const SEEDS = Number(arg('--seeds', 3))
const only = process.argv.slice(2).filter(a => !a.startsWith('--') && !/^\d+$/.test(a))

// Run `fn` with some numbers changed, and put them back.
function changed(patches, fn) {
  const saved = patches.map(([obj, key]) => [obj, key, obj[key]])
  for (const [obj, key, value] of patches) obj[key] = value
  try { return fn() } finally { for (const [obj, key, value] of saved) obj[key] = value }
}

const opponents = (policy) => Object.fromEntries(Object.entries(L.USUAL).map(([k, v]) => [k, { ...v, policy }]))

function row(label, army, { patches = [], policies = ['planner', 'charge'], note = '' } = {}) {
  if (!army.units) throw new Error(`${label}: no army`)
  const [ok, sp] = changed(patches, () => [L.legal(army.faction, army.units), army.units.reduce((s, u) => s + (L.costOf(army.faction, u) ?? 0), 0)])
  if (!ok.ok) { console.log(`| ${label} | not legal: ${ok.errors.join('; ')} |`); return }
  const cells = changed(patches, () => policies.map(p => L.evaluate({ ...army, policy: army.policy ?? 'planner' }, opponents(p), { seeds: SEEDS, tag: `exp:${label}:${p}` })))
  console.log(`| ${label} | ${army.units.length} | ${sp}${ok.ok ? '' : '*'} | ${cells.map(c => L.pct(c.rate)).join(' | ')} | ${cells.map(c => Object.values(c.against).map(a => Math.round(100 * a.won / a.battles)).join('/')).join(' | ')} |${note ? ' ' + note : ''}`)
}

function header(title) {
  console.log(`\n### ${title}\n`)
  console.log('| Army | Units | SP | v planner | v charge | planner: Rome/Mac/Sar/Han | charge: Rome/Mac/Sar/Han |')
  console.log('|---|---|---|---|---|---|---|')
}

const sling = { quality: 'levy', weapon: 'sling' }
const GROUPS = {
  yardstick() {
    header('The usual armies, bought as lists (the yardstick)')
    for (const f of ['rome', 'macedon', 'sarmatia', 'han']) {
      row(`${f} usual`, { faction: f, units: require('../../engine/army/standard').usualArmy(f) })
    }
  },

  slingers() {
    header('Slingers: what makes seven units of levy slingers win')
    const rome = (kits, extra = {}) => ({ faction: 'rome', units: L.named('rome', kits), ...extra })
    const n = (k, kit = sling) => Array.from({ length: k }, () => kit)
    row('7 levy slingers (as bought)', rome(n(7)))
    row('5 levy slingers', rome(n(5)))
    row('4 levy slingers', rome(n(4)))
    row('3 levy slingers', rome(n(3)))
    row('7 levy slingers, 57 men each (400 men, as 4 units)', rome(n(7), { men: 0.57 }))
    row('7 levy slingers, the planner closing at once', { ...rome(n(7)), policy: 'planner' }, { policies: ['close', 'rush'] })
    row('3 professional war slingers (9 SP each)', rome(n(3, { quality: 'professional', weapon: 'sling_professional' })))
    row('7 levy archers (bow, 125 m)', rome(n(7, { quality: 'levy', weapon: 'self_bow_basic' })))
    row('7 levy slingers, sling reach 150 m', rome(n(7)), { patches: [[T.WEAPONS.sling, 'range', 150]] })
    row('7 levy slingers, volleys at half rate', rome(n(7)), { patches: [[T.MISSILES, 'RATE', 0.04]] })
    row('7 levy slingers, no shooting into a melee', rome(n(7)), { patches: [[T.MISSILES, 'INTO_MELEE', 0]] })
    row('7 levy slingers, sling 90% v horse cut to 50%', rome(n(7)), { patches: [[T.WEAPONS.sling, 'effectiveness', { ...T.WEAPONS.sling.effectiveness, cavalry: 50 }]] })
    row('Every usual army without its missile troops?', { faction: 'rome', units: L.named('rome', [{ quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' }, { quality: 'militia', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' }]) })
  },

  spears() {
    header('Cheap spears: why seven units of levy spears lose')
    const rome = (kits, extra = {}) => ({ faction: 'rome', units: L.named('rome', kits), ...extra })
    const n = (k, kit) => Array.from({ length: k }, () => kit)
    const bare = { quality: 'levy', weapon: 'spear_basic' }
    const kitted = { quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'light_shield' }
    row('7 levy spears, no armour, no shield (as bought)', rome(n(7, bare)))
    row('7 levy spears, light armour and shield (free)', rome(n(7, kitted)))
    row('7 levy spears, light kit, levy morale 1 (as militia)', rome(n(7, kitted)), { patches: [[T.QUALITY_TIERS.levy, 'morale', 1]] })
    row('7 levy spears, light kit, levy attack/defense 2 (as militia)', rome(n(7, kitted)), { patches: [[T.QUALITY_TIERS.levy, 'attack', 2], [T.QUALITY_TIERS.levy, 'defense', 2]] })
    row('5 militia spears, light kit (6 SP)', rome(n(5, { ...kitted, quality: 'militia' })))
    row('3 professional spears, light armour, medium shield (10 SP)', rome(n(3, { quality: 'professional', weapon: 'spear_professional', armor: 'light_armor', shield: 'medium_shield' })))
    row('4 levy spears, light kit', rome(n(4, kitted)))
    row('5 levy spears, light kit + 2 levy slingers', rome([...n(5, kitted), sling, sling]))
  },

  horse() {
    header('All horse: why three units of horse lose')
    const n = (k, kit) => Array.from({ length: k }, () => kit)
    const army = (f, kits) => ({ faction: f, units: L.named(f, kits) })
    const ha = { quality: 'militia', weapon: 'self_bow_basic', armor: 'light_armor', mounted: true }
    const rider = { quality: 'militia', weapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield', mounted: true }
    row('Rome: 2 horse archers, 1 riders (as bought)', army('rome', [ha, rider, ha]))
    row('Rome: 3 riders (militia, sword, light kit, 10 SP)', army('rome', n(3, rider)))
    row('Rome: 3 riders, horse at 2 SP', army('rome', n(3, rider)), { patches: [[D, 'MOUNT_SP', 2]] })
    row('Rome: 3 levy riders (levy, sword, light kit, 8 SP)', army('rome', n(3, { quality: 'levy', weapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield', mounted: true })))
    row('Rome: 3 professional riders (pro, sword, light kit, 12 SP), budget 36', army('rome', n(3, { ...rider, quality: 'professional' })), { patches: [[D.SP_BUDGETS, 'Roman Republic', 36]] })
    row('Rome: 3 professional spears on foot (pro, war spear, light kit, 9 SP)', army('rome', n(3, { quality: 'professional', weapon: 'spear_professional', armor: 'light_armor', shield: 'light_shield' })))
    row('Sarmatia: 3 horse archers (tribal, 8 SP)', army('sarmatia', n(3, { ...ha, quality: 'tribal_warriors' })))
    row('Sarmatia: 3 horse archers at full numbers', army('sarmatia', n(3, { ...ha, quality: 'tribal_warriors' })), { patches: [[T.MISSILES, 'HORSE_ARCHER_NUMBERS', 1]] })
    row('Sarmatia: 3 riders (tribal, sword, light kit, 9 SP)', army('sarmatia', n(3, { ...rider, quality: 'tribal_warriors' })))
    row('Sarmatia: 3 riders, war spear (tribal, 9 SP)', army('sarmatia', n(3, { ...rider, quality: 'tribal_warriors', weapon: 'spear_professional' })))
    row('Sarmatia: 3 riders, with charge spike x1.5 more (CHARGE.DECAY 2.7/1.6/1.0)', army('sarmatia', n(3, { ...rider, quality: 'tribal_warriors' })), { patches: [[T.CHARGE, 'DECAY', [2.7, 1.6, 1.0]]] })
  },

  count() {
    header('Units against men: the same kit, more or fewer units')
    const n = (k, kit) => Array.from({ length: k }, () => kit)
    const legion = { quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' }
    const hast = { quality: 'militia', weapon: 'roman_gladius', armor: 'light_armor', shield: 'light_shield' }
    row('2 legionaries (pro, medium, heavy shield)', { faction: 'rome', units: L.named('rome', n(2, legion)) })
    row('3 legionaries', { faction: 'rome', units: L.named('rome', n(3, legion)) })
    row('3 militia swords, light kit', { faction: 'rome', units: L.named('rome', n(3, hast)) })
    row('4 militia swords, light kit', { faction: 'rome', units: L.named('rome', n(4, hast)) })
    row('4 militia swords, light kit, 60 men each', { faction: 'rome', units: L.named('rome', n(4, hast)), men: 0.6 })
    row('4 militia swords, light kit, 150 men each', { faction: 'rome', units: L.named('rome', n(4, hast)), men: 1.5 })
  }
}

console.log(`Each row: the army against the four usual armies, four maps, both ways round, ${SEEDS} seeds: ${16 * 2 * SEEDS} battles per cell. Win share; draws count as not won. * = over budget or otherwise not legal (an experiment only).`)
for (const [name, fn] of Object.entries(GROUPS)) if (!only.length || only.includes(name)) fn()
