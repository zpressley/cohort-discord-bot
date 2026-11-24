// src/harness/bought-league.js
//
// Armies a player might buy (src/web/armies.js, the builder's rules) against
// the computer's: each faction's default army, played by the computer
// (opponent/planner.js). The bought side is played by the same planner, so
// what is measured is the army, not the player. As in the app, the bought
// side has its Commander on the field with its elite unit; the computer's
// side has none. Every battle has a seed of its own.
//
// The armies are the kinds a player plausibly buys, each spending what it
// can of its budget: all levy spears ("cheap"), all levy slingers (the
// strongest buy for the price, per the faction work), veteran mercenaries
// in the best kit that fits ("veterans"), and all horse ("horse").
//
//   node src/harness/bought-league.js                 2 seeds, every map, both ways round
//   node src/harness/bought-league.js --seeds 1 --maps crownhill

const { createGame, submitOrders, commanderOf } = require('../engine/orchestrator')
const { planTurn } = require('../opponent/planner')
const { loadScenario, mapChoices } = require('../adapters/hotseat/scenarios')
const { fieldArmies, usualArmy } = require('../engine/army/standard')
const { buildUnit } = require('../engine/army/builder')
const D = require('../engine/army/data')
const { FACTIONS } = require('../data/factions')
const { leadUnit } = require('../engine/command/company')
const { nextName, checkArmy } = require('../web/armies')

const MAX_PLAYER_TURNS = 150

// Buy units from a list of wishes, in turn, while the budget lasts: each
// wish the first of its kits the builder allows this culture.
function buy(key, wishes) {
  const culture = FACTIONS[key].culture
  const budget = D.SP_BUDGETS[culture] ?? D.DEFAULT_SP_BUDGET
  const units = []
  let spent = 0
  for (let round = 0; round < 12; round++) {
    let bought = false
    for (const kits of wishes) {
      const kit = kits.map(k => ({ armor: 'no_armor', shield: 'no_shield', mounted: false, ...k }))
        .find(k => buildUnit(k, culture).ok && spent + buildUnit(k, culture).cost <= budget)
      if (!kit) continue
      spent += buildUnit(kit, culture).cost
      units.push({ name: nextName(key, kit, units.map(u => u.name)), ...kit })
      bought = true
    }
    if (!bought) break
  }
  return units
}

const VETERAN_WEAPONS = ['roman_gladius', 'chinese_dao', 'greek_xiphos', 'celtic_longsword', 'sword_standard']
const ARMIES = {
  cheap: [[{ quality: 'levy', weapon: 'spear_basic' }]],
  slingers: [[{ quality: 'levy', weapon: 'sling' }]],
  veterans: [VETERAN_WEAPONS.flatMap(weapon => [
    { quality: 'veteran_mercenary', weapon, armor: 'heavy_armor', shield: 'medium_shield' },
    { quality: 'veteran_mercenary', weapon, armor: 'medium_armor', shield: 'medium_shield' },
    { quality: 'veteran_mercenary', weapon, armor: 'light_armor', shield: 'light_shield' }
  ])],
  horse: [
    [{ quality: 'tribal_warriors', weapon: 'self_bow_basic', armor: 'light_armor', mounted: true },
      { quality: 'militia', weapon: 'self_bow_basic', armor: 'light_armor', mounted: true }],
    [{ quality: 'tribal_warriors', weapon: 'sword_standard', armor: 'medium_armor', shield: 'light_shield', mounted: true },
      { quality: 'militia', weapon: 'sword_standard', armor: 'medium_armor', shield: 'light_shield', mounted: true },
      { quality: 'levy', weapon: 'sword_standard', mounted: true }]
  ]
}

/** The armies a player of this faction might buy, by kind: each legal. */
function boughtArmies(key) {
  // The usual army, bought as a list, for a yardstick.
  const out = { usual: usualArmy(key) }
  for (const [kind, wishes] of Object.entries(ARMIES)) {
    const units = buy(key, wishes)
    const checked = checkArmy(key, units)
    // A kind its people's restrictions forbid (no foot for Sarmatia) is one
    // its player cannot buy: left out (docs/design/army-balance.md, part 9).
    if (!checked.ok && checkArmy(key, units, { restrictions: false }).ok) continue
    if (!checked.ok) throw new Error(`${key} ${kind}: ${checked.errors.join('; ')}`)
    out[kind] = units
  }
  return out
}

/** One battle: a bought army against a faction's default army, the computer on both sides. */
function playBought(key, units, enemy, { side = 'red', map = 'crownhill', seed = 1 } = {}) {
  const other = side === 'red' ? 'blue' : 'red'
  const spec = fieldArmies(loadScenario('meeting-battle', { map, deploy: true }), { [side]: { faction: key, units }, [other]: { faction: enemy, units: null } })
  const mine = spec.units.filter(u => u.side === side)
  const game = createGame({ ...spec, standingOrders: {}, commanders: { [side]: { unitId: mine[leadUnit(mine)].id } } }, { seed })
  let turns = 0
  while (!game.outcome.decided && turns < MAX_PLAYER_TURNS) {
    const a = planTurn(game, side)
    const b = planTurn(game, other)
    submitOrders(game, side, a)
    submitOrders(game, other, b)
    turns++
  }
  return {
    decided: game.outcome.decided,
    won: game.outcome.winner === side,
    draw: game.outcome.winner === 'draw',
    reason: game.outcome.reason,
    turns,
    fate: commanderOf(game, side)?.fate ?? null
  }
}

function league({ seeds = 2, maps = mapChoices().map(m => m.id), factions = Object.keys(FACTIONS) } = {}) {
  const rows = []
  const all = { battles: 0, stuck: [], reasons: {}, turns: 0 }
  let n = 0
  for (const key of factions) {
    for (const [kind, units] of Object.entries(boughtArmies(key))) {
      const row = { key, kind, units, battles: 0, won: 0, draws: 0, against: {} }
      for (const enemy of factions) for (const map of maps) for (const side of ['red', 'blue']) for (let s = 1; s <= seeds; s++) {
        n++
        const r = playBought(key, units, enemy, { side, map, seed: 1000 + n * 7 })
        all.battles++
        row.battles++
        if (!r.decided) { all.stuck.push(`${key} ${kind} v ${enemy} on ${map}`); continue }
        all.turns += r.turns
        all.reasons[r.reason] = (all.reasons[r.reason] ?? 0) + 1
        const a = row.against[enemy] ?? (row.against[enemy] = { won: 0, battles: 0 })
        a.battles++
        if (r.won) { row.won++; a.won++ }
        if (r.draw) row.draws++
      }
      rows.push(row)
    }
  }
  return { rows, all }
}

if (require.main === module) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null }
  const seeds = Number(arg('--seeds') ?? 2)
  const maps = arg('--maps') ? arg('--maps').split(',') : mapChoices().map(m => m.id)
  const { rows, all } = league({ seeds, maps })
  const pct = (a, b) => `${Math.round(100 * a / Math.max(1, b))}%`
  console.log(`${all.battles} battles: each bought army against every faction's default army, on ${maps.join(', ')}, both sides, ${seeds} seed(s) each\n`)
  console.log('| Faction | Army bought | Units | Won | ' + Object.keys(FACTIONS).map(k => `v ${FACTIONS[k].title}`).join(' | ') + ' |')
  console.log('|---|---|---|---|' + Object.keys(FACTIONS).map(() => '---').join('|') + '|')
  for (const r of rows) {
    const names = r.units.map(u => u.name).join(', ')
    console.log(`| ${FACTIONS[r.key].title} | ${r.kind} | ${names} | ${pct(r.won, r.battles)} | ` +
      Object.keys(FACTIONS).map(k => pct(r.against[k]?.won ?? 0, r.against[k]?.battles ?? 0)).join(' | ') + ' |')
  }
  console.log(`\nEnded: ${all.battles - all.stuck.length} of ${all.battles}; ${(all.turns / Math.max(1, all.battles - all.stuck.length)).toFixed(1)} player turns on average.`)
  console.log('How they ended:', Object.entries(all.reasons).map(([r, c]) => `${r} ${c}`).join(', '))
  for (const s of all.stuck.slice(0, 10)) console.log(`  stuck: ${s}`)
  if (all.stuck.length) process.exitCode = 1
}

module.exports = { boughtArmies, playBought, league }
