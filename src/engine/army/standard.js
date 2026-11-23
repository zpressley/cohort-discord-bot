// src/engine/army/standard.js
//
// A standard army a player bought himself (ruled 2026-11-23: "They should
// buy standard army with a set budget, use the army builder that the
// original discord app ran"), fielded beside his faction's elite unit.
//
// The army is a list of units, each with its own name and kit:
//   { name, quality, weapon, armor, shield, mounted }
// Its kit and its price are the builder's to judge (builder.js: buildArmy),
// so the culture's budget and permitted kit hold exactly as they do for a
// faction's default army. The elite is not in the list: it is never bought
// and never sold, and it comes with every army.
//
// A unit's name is its own, given when it is bought, and it is kept while
// the unit is kept: officers know their men by it (command/company.js,
// `leads`). Names are distinct. A name ending in a number ("spears 2") is
// told apart by it; where every unit of a name is numbered ("sarissa foot
// 1", "sarissa foot 2"), the name alone orders them all, as a faction's
// default army does.
//
// Pure: the same army, side and map always give the same units.

const { buildArmy, buildUnit, toBattleUnits, roleFor } = require('./builder')
const { formUp, factionUnits } = require('./factions')
const { resolveMap } = require('../map/map')
const { deployArmies } = require('../map/deploy')
const { createRng } = require('../rng')
const { FACTIONS } = require('../../data/factions')

// A unit's kit, and nothing else from what was sent.
function kitOf(unit = {}) {
  return {
    quality: String(unit.quality ?? ''),
    weapon: String(unit.weapon ?? ''),
    armor: String(unit.armor ?? 'no_armor'),
    shield: String(unit.shield ?? 'no_shield'),
    mounted: unit.mounted === true
  }
}

const baseOf = (name) => String(name).replace(/ \d+$/, '')
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
// Plain lower-case words, one to three, and a number if it needs one.
const NAME = /^[a-z]+( [a-z]+){0,2}( [1-9][0-9]?)?$/

/** A faction's usual army as a list a player could have bought: each unit named as it is in the field ("sarissa foot 1"). */
function usualArmy(key) {
  const army = FACTIONS[key]?.army ?? []
  const count = (name) => army.filter(u => u.name === name).length
  const seen = new Map()
  return army.map(u => {
    const nth = (seen.get(u.name) ?? 0) + 1
    seen.set(u.name, nth)
    return { name: count(u.name) > 1 ? `${u.name} ${nth}` : u.name, ...kitOf(u) }
  })
}

/**
 * Check a bought army: its kit and price through the builder, and its
 * names (given, distinct, plain words, not the elite's).
 *
 * @returns {{ ok, errors, army, units }} `army` the builder's priced army;
 *   `units` the list, names and kit only. The builder's errors name a unit
 *   by its place ("unit 2: ...").
 */
function checkStandard(key, units) {
  const faction = FACTIONS[key]
  if (!faction) return { ok: false, errors: [`no faction "${key}"`], army: null, units: [] }
  const list = (Array.isArray(units) ? units : []).map(u => ({ name: typeof u?.name === 'string' ? u.name : '', ...kitOf(u) }))
  const built = buildArmy({ culture: faction.culture, units: list.map(kitOf) })
  const errors = [...built.errors]
  const elite = faction.elite.name
  list.forEach((u, i) => {
    if (!u.name) errors.push(`unit ${i + 1}: every unit needs a name`)
    else if (!NAME.test(u.name)) errors.push(`unit ${i + 1}: "${u.name}" is not a name a unit can be given`)
    else if (u.name === elite || baseOf(u.name) === elite) errors.push(`unit ${i + 1}: "${u.name}" is the elite's name`)
    else if (list.findIndex(o => o.name === u.name) !== i) errors.push(`unit ${i + 1}: two units are called "${u.name}"`)
  })
  if (errors.length) return { ok: false, errors, army: null, units: list }
  return { ok: true, errors: [], army: built.army, units: list }
}

// The elite's kit, checked as faction.js checks it: only what the culture
// may field and carry, priced as the best troops that can be bought.
function eliteOf(key) {
  const faction = FACTIONS[key]
  const { name, ...kit } = faction.elite
  const check = buildUnit({ ...kit, quality: 'veteran_mercenary' }, faction.culture)
  if (!check.ok) throw new Error(`the ${name}: ${check.errors.join('; ')}`)
  return { name, ...kit }
}

/**
 * A bought army's units for one side: the bought units, then the elite.
 * Ids carry each unit's name ("red_spears_2" is "Spears 2"), formed up
 * around 0,0 as a faction's army is (factions.js: formUp).
 */
function standardUnits(key, units, side, homeEdge = side === 'red' ? 'west' : 'east') {
  const checked = checkStandard(key, units)
  if (!checked.ok) throw new Error(`the army fails the builder: ${checked.errors.join('; ')}`)
  const e = eliteOf(key)
  const names = [...checked.units.map(u => u.name), e.name]
  const specs = toBattleUnits(checked.army, { side, positions: names.map(() => 'A1'), eliteWeapon: e.weapon })
  Object.assign(specs[specs.length - 1], {
    armor: e.armor ?? 'no_armor',
    shield: e.shield ?? 'no_shield',
    mounted: Boolean(e.mounted),
    movementRange: e.mounted ? 5 : 3,
    role: e.mounted ? 'cavalry' : roleFor(e.weapon)
  })
  // The name alone orders every unit of it, where all of them are numbered.
  const together = (name) => {
    const base = baseOf(name)
    const kin = names.filter(n => baseOf(n) === base)
    return base !== name && kin.length > 1 && !kin.includes(base)
  }
  const out = specs.map((spec, i) => ({
    ...spec,
    id: `${side}_${slug(names[i])}`,
    aliases: together(names[i]) ? [names[i], baseOf(names[i])] : [names[i]],
    faction: key
  }))
  return formUp(out, homeEdge)
}

/**
 * A scenario's battle with each named side's army: a bought one
 * (`units`), or with none the faction's usual army. As fieldFactions: the
 * scenario decides the map and where each side forms up; a side not named
 * keeps its army where it stands.
 *
 * @param {Object} spec    a scenario spec
 * @param {Object} armies  { [side]: { faction, units: [...] | null } }
 */
function fieldArmies(spec, armies) {
  const map = resolveMap(spec.map ?? 'crownhill')
  let units = spec.units
  for (const [side, { faction, units: bought }] of Object.entries(armies)) {
    const homeEdge = spec.sides?.[side]?.homeEdge
    const mine = bought ? standardUnits(faction, bought, side, homeEdge) : factionUnits(faction, side, homeEdge)
    const army = deployArmies(map, mine, { [side]: spec.sides?.[side] ?? {} })
    const at = units.findIndex(u => u.side === side)
    const rest = units.filter(u => u.side !== side)
    units = at < 0 ? [...rest, ...army] : [...rest.slice(0, at), ...army, ...rest.slice(at)]
  }
  return { ...spec, units }
}

/**
 * The computer's faction when none is chosen: any faction, the player's own
 * among them (ruled 2026-11-23: "it can be the same (Romans fought Romans
 * all the time)"), drawn from the battle's seed.
 */
function anyFaction(seed) {
  const keys = Object.keys(FACTIONS)
  const random = createRng((Math.imul(seed, 2246822519) + 131) >>> 0)
  return keys[Math.floor(random() * keys.length)]
}

module.exports = { usualArmy, checkStandard, standardUnits, fieldArmies, anyFaction, kitOf, baseOf }
