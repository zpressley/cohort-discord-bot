// src/engine/army/factions.js
//
// A faction's army, built for a battle. The armies are data
// (src/data/factions.js); this builds each one through the army builder, so
// the culture's budget and permitted kit are enforced, adds the faction's
// own elite unit (free), names every unit as a player would call it in an
// order, and forms the army up on the map's deployment ground the way a
// scenario's armies are (map/deploy.js).
//
// Pure: the same faction, side and map always give the same units.

const { buildArmy, buildUnit, toBattleUnits, roleFor, secondFields } = require('./builder')
const { resolveMap } = require('../map/map')
const { deployArmies } = require('../map/deploy')
const { missileRange } = require('../combat/ranged')
const { createRng } = require('../rng')
const { FACTIONS } = require('../../data/factions')
const { withPerks } = require('./perks')

const FORWARD = { west: { x: 1, y: 0 }, east: { x: -1, y: 0 }, north: { x: 0, y: 1 }, south: { x: 0, y: -1 } }

/**
 * Check a faction's default army against the builder.
 *
 * @returns {{ ok, errors, army, elite }} `army` is the builder's priced
 *   army; `elite` the elite unit's kit (free: it is not in the bill)
 */
function buildFaction(key) {
  const faction = FACTIONS[key]
  if (!faction) return { ok: false, errors: [`no faction "${key}"`], army: null, elite: null }
  const built = buildArmy({ culture: faction.culture, units: faction.army })
  const errors = [...built.errors]
  // The elite is not bought, but it carries only kit its culture may field
  // and carry: priced as the best troops that can be bought, then given free.
  const { name, ...kit } = faction.elite
  const check = buildUnit({ ...kit, quality: 'veteran_mercenary' }, faction.culture, { elite: true })
  errors.push(...check.errors.map(e => `the ${name}: ${e}`))
  for (const unit of faction.army) if (!unit.name) errors.push('every unit needs a name')
  if (errors.length) return { ok: false, errors, army: null, elite: null }
  return { ok: true, errors: [], army: built.army, elite: { name, ...kit } }
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/**
 * A faction's units for one side: the bought units, then the elite.
 * Ids carry the unit's name ("red_sarissa_foot_2"), so the app calls it
 * "Sarissa foot 2"; each unit answers to its name without the number too,
 * so "sarissa foot" orders both.
 *
 * Positions are a formation around 0,0 facing the enemy (the side's home
 * edge): the foot in a line, the elite on foot at its centre; missile foot
 * a step behind; horse on the wings. `fieldFactions` sets it down on a map.
 */
function factionUnits(key, side, homeEdge = side === 'red' ? 'west' : 'east') {
  const built = buildFaction(key)
  if (!built.ok) throw new Error(`the ${key} army fails the builder: ${built.errors.join('; ')}`)
  const faction = FACTIONS[key]
  const names = [...faction.army.map(u => u.name), built.elite.name]
  const specs = toBattleUnits(built.army, { side, positions: names.map(() => 'A1'), eliteWeapon: built.elite.weapon })

  // The elite's own kit and numbers (toBattleUnits gives every elite the
  // same): the faction's doc gives some 40 men, some 100.
  const e = built.elite
  const elite = specs[specs.length - 1]
  Object.assign(elite, {
    ...(e.size ? { strength: e.size, maxStrength: e.size } : {}),
    armor: e.armor ?? 'no_armor',
    shield: e.shield ?? 'no_shield',
    mounted: Boolean(e.mounted),
    movementRange: e.mounted ? 5 : 3,
    // Its second weapon (a sword, or javelins), as a bought unit's.
    ...secondFields(e.second),
    // The role of a horseman, or of his weapon: the app calls them "elite
    // cavalry" or "elite heavy infantry", not "elite elite guard".
    role: e.mounted ? 'cavalry' : roleFor(e.weapon)
  })

  const count = (name) => names.filter(n => n === name).length
  const seen = new Map()
  const units = specs.map((spec, i) => {
    const name = names[i]
    const nth = (seen.get(name) ?? 0) + 1
    seen.set(name, nth)
    const numbered = count(name) > 1
    return {
      ...spec,
      id: `${side}_${slug(name)}${numbered ? `_${nth}` : ''}`,
      aliases: numbered ? [`${name} ${nth}`, name] : [name],
      faction: key
    }
  })
  // Its people's perks (army/perks.js).
  return formUp(withPerks(key, units), homeEdge)
}

// The formation, around 0,0.
function formUp(units, homeEdge) {
  const forward = FORWARD[homeEdge] ?? FORWARD.west
  const across = { x: -forward.y, y: forward.x }
  const at = (depth, slot) => ({ x: forward.x * depth + across.x * slot, y: forward.y * depth + across.y * slot })
  // Slots out from the centre: 0, 1, -1, 2, -2 ...
  const slot = (i) => (i % 2 ? (i + 1) / 2 : -i / 2)

  const shoots = (u) => missileRange(u) > 0
  const horse = units.filter(u => u.mounted)
  const missile = units.filter(u => !u.mounted && shoots(u))
  const line = units.filter(u => !u.mounted && !shoots(u))
    .sort((a, b) => (b.quality === 'elite') - (a.quality === 'elite'))
  const front = [...line, ...horse]
  const place = new Map()
  front.forEach((u, i) => place.set(u.id, at(0, slot(i))))
  missile.forEach((u, i) => place.set(u.id, at(-1, slot(i))))
  return units.map(u => ({ ...u, position: place.get(u.id) }))
}

/**
 * A scenario's battle fought by faction armies: the scenario decides the
 * map, where each side forms up (its home edge and the map's deployment
 * ground), objectives and the time limit; the factions bring the armies.
 *
 * A side not named keeps its army where it stands: so one side's army can
 * be changed (the friend who joins with a Commander of another faction).
 *
 * @param {Object} spec      a scenario spec (with `map` and `sides`)
 * @param {Object} factions  { [side]: faction key }
 */
function fieldFactions(spec, factions) {
  const map = resolveMap(spec.map ?? 'crownhill')
  let units = spec.units
  for (const [side, key] of Object.entries(factions)) {
    // (Where the spec says this battle's armies form up, if it says: a kind
    // of battle a field forms up for elsewhere, src/data/maps deployFor.)
    const army = deployArmies(map, factionUnits(key, side, spec.sides?.[side]?.homeEdge), { [side]: spec.sides?.[side] ?? {} }, spec.deploy ?? map.deploy ?? {})
    const at = units.findIndex(u => u.side === side)
    const rest = units.filter(u => u.side !== side)
    units = at < 0 ? [...rest, ...army] : [...rest.slice(0, at), ...army, ...rest.slice(at)]
  }
  return { ...spec, units }
}

/** The enemy's faction when none is chosen: another one, drawn from the battle's seed. */
function enemyFaction(key, seed) {
  const others = Object.keys(FACTIONS).filter(k => k !== key)
  const random = createRng((Math.imul(seed, 2654435761) + 97) >>> 0)
  return others[Math.floor(random() * others.length)] ?? key
}

/** The factions, for choosing. */
function factionChoices() {
  return Object.entries(FACTIONS).map(([id, f]) => ({ id, title: f.title, culture: f.culture, fights: f.fights, elite: f.elite.name }))
}

module.exports = { FACTIONS, buildFaction, factionUnits, fieldFactions, enemyFaction, factionChoices, formUp }
