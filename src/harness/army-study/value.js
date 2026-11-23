// src/harness/army-study/value.js
//
// What a supply point buys (docs/design/army-balance.md, part 1). Three
// measures, for every quality tier, weapon, armour, shield and mount:
//
//   1. Missile fire per point: men one volley fells at close range, against
//      four kinds of target, divided by what the unit costs. Worked out from
//      combat/ranged.js, no battle needed.
//   2. The unit in a melee: one change at a time from a base unit (militia,
//      sword, light armour, light shield, on foot: 7 SP), its duel win rate
//      against a panel of four professional and militia units (the balance
//      matrix's duel, 100 seeds each). Melee in this engine is fought in
//      shares of a unit, not in men: so a duel says what one unit is worth,
//      whatever it cost.
//   3. What the points buy: an army of that unit alone, as many as Rome's 30
//      points buy, against the four usual armies (four maps, both ways
//      round, --seeds seeds), the computer's planner on both sides.
//
//   node src/harness/army-study/value.js [--seeds 2] [--no-army]

const L = require('./lib')
const T = require('../../engine/combat/tables')
const ranged = require('../../engine/combat/ranged')
const { duel } = require('../balance/duel')
const { makeUnit } = require('../balance/matrix')
const { buildUnit } = require('../../engine/army/builder')
const D = require('../../engine/army/data')

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt }
const SEEDS = Number(arg('--seeds', 2))
const ARMY = !process.argv.includes('--no-army')

// ── 1. Missile fire per point ────────────────────────
function missile() {
  const targets = {
    'light foot': { primaryWeapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield', quality: 'militia', strength: 100 },
    'medium foot, medium shield': { primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', quality: 'professional', strength: 100 },
    'heavy foot, heavy shield': { primaryWeapon: 'roman_gladius', armor: 'heavy_armor', shield: 'heavy_shield', quality: 'professional', strength: 100 },
    horse: { primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'light_shield', quality: 'professional', mounted: true, strength: 100 }
  }
  console.log('\n### 1. Missile fire: men felled by one volley at close range, per supply point\n')
  console.log('A volley does not depend on the shooters\' quality, only on how many they are and their weapon. Morale lost by the target is men lost (as a share of the unit) times 5.5, divided by its morale resistance (levy 1.0, militia 1.4, professional and tribal 2.1).\n')
  console.log('| Weapon | Reach | Cheapest unit | SP | Men | ' + Object.keys(targets).map(t => `v ${t}`).join(' | ') + ' | Felled per SP, v light foot |')
  console.log('|---|---|---|---|---|' + Object.keys(targets).map(() => '---').join('|') + '|---|')
  const shooters = Object.keys(D.WEAPONS).filter(w => (T.WEAPONS[w].range ?? 0) >= T.MISSILES.MIN_RANGE_M)
  for (const w of shooters) for (const mounted of [false, true]) {
    const culture = D.WEAPONS[w].cultures === 'all' ? 'Roman Republic' : D.WEAPONS[w].cultures[0]
    const q = ['levy', 'militia', 'professional'].find(q => buildUnit({ quality: q, weapon: w, mounted }, culture).ok)
    if (!q) continue
    const b = buildUnit({ quality: q, weapon: w, mounted }, culture)
    const shooter = { primaryWeapon: w, quality: q, strength: b.unit.size, mounted }
    const per = Object.values(targets).map(t => ranged.volley(shooter, t, { distance: 1, moved: false }))
    console.log(`| ${w}${mounted ? ' (horse)' : ''} | ${ranged.missileRangeMetres(shooter)} m | ${q} | ${b.cost} | ${b.unit.size} | ${per.map(x => x.toFixed(1)).join(' | ')} | ${(per[0] / b.cost).toFixed(2)} |`)
  }
}

// ── 2. The unit in a melee ───────────────────────────
const BASE = { quality: 'militia', weapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield', mounted: false }
const CHANGES = [
  ['base: militia, sword, light armour, light shield', {}],
  ['levy', { quality: 'levy' }],
  ['tribal warriors (Sarmatia)', { quality: 'tribal_warriors' }, 'sarmatia'],
  ['professional', { quality: 'professional' }],
  ['veteran mercenaries', { quality: 'veteran_mercenary' }],
  ['no armour', { armor: 'no_armor' }],
  ['medium armour', { armor: 'medium_armor' }],
  ['heavy armour', { armor: 'heavy_armor' }],
  ['no shield', { shield: 'no_shield' }],
  ['medium shield', { shield: 'medium_shield' }],
  ['heavy shield', { shield: 'heavy_shield' }],
  ['basic spear', { weapon: 'spear_basic' }],
  ['clubs', { weapon: 'clubs' }],
  ['war spear', { weapon: 'spear_professional' }],
  ['battle axe', { weapon: 'battle_axe' }],
  ['mace', { weapon: 'mace' }],
  ['gladius (Rome)', { weapon: 'roman_gladius' }],
  ['on a horse', { mounted: true }],
  ['on a horse, war spear', { mounted: true, weapon: 'spear_professional' }],
  ['professional, great axe, no shield', { quality: 'professional', weapon: 'great_axe', shield: 'no_shield' }],
  ['professional, sarissa, no shield (Macedon)', { quality: 'professional', weapon: 'macedonian_sarissa', shield: 'no_shield' }, 'macedon'],
  ['levy, sling (in a melee)', { quality: 'levy', weapon: 'sling', shield: 'no_shield' }],
  ['levy, bow (in a melee)', { quality: 'levy', weapon: 'self_bow_basic', shield: 'no_shield' }],
  ['professional, crossbow (Han, in a melee)', { quality: 'professional', weapon: 'han_chinese_crossbow', shield: 'no_shield' }, 'han']
]
const PANEL = [
  ['pro medium infantry', makeUnit('medium_infantry', 'professional')],
  ['pro spearmen', makeUnit('spearmen', 'professional')],
  ['pro cavalry', makeUnit('cavalry', 'professional')],
  ['militia light infantry', makeUnit('light_infantry', 'militia')]
]

function asDuelUnit(kit) {
  return { quality: kit.quality, primaryWeapon: kit.weapon, armor: kit.armor, shield: kit.shield, mounted: kit.mounted, strength: 100, maxStrength: 100 }
}

function melee() {
  console.log('\n### 2 and 3. One change at a time: the unit in a melee, and what its points buy\n')
  console.log(`Duel: win rate against each of the panel, and in brackets the share of that unit's men it cut down (100 seeds each; neither side charging or braced). Army: as many of the unit as 30 points buy, against the four usual armies (${16 * 2 * SEEDS} battles).\n`)
  console.log('| Unit | SP | Units for 30 | Duel v ' + PANEL.map(p => p[0]).join(' | ') + ' | Duel mean | Army win |')
  console.log('|---|---|---|' + PANEL.map(() => '---').join('|') + '|---|---|')
  for (const [label, change, faction = 'rome'] of CHANGES) {
    const kit = { ...BASE, ...change }
    const cost = L.costOf(faction, kit)
    if (cost === null) { console.log(`| ${label} | not allowed |`); continue }
    const u = asDuelUnit(kit)
    // Win rate, and the share of the other unit's men it cut down before
    // the fight ended (duels are near certain, so this is the graded part).
    const cells = PANEL.map(([, p]) => {
      let won = 0
      let cut = 0
      for (let seed = 1; seed <= 100; seed++) {
        const r = duel({ a: u, b: p, seed })
        if (r.winner === 'a') won++
        cut += 1 - r.b.survivorPct
      }
      return { won: won / 100, cut: cut / 100 }
    })
    const rates = cells.map(c => c.won)
    const n = Math.floor(L.budgetOf(faction) / cost)
    let army = '-'
    if (ARMY) {
      const units = L.mono(faction, kit)
      const r = L.evaluate({ faction, units }, L.USUAL, { seeds: SEEDS, tag: `value:${label}` })
      army = L.pct(r.rate)
    }
    const mean = rates.reduce((s, x) => s + x, 0) / rates.length
    console.log(`| ${label} | ${cost} | ${n} | ${cells.map(c => `${L.pct(c.won)} (${L.pct(c.cut)})`).join(' | ')} | ${L.pct(mean)} | ${army} |`)
  }
}

missile()
melee()
