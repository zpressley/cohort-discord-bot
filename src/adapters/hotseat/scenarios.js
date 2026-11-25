// src/adapters/hotseat/scenarios.js
//
// What you can play. Two battles, two provenances on purpose:
//
//   meeting-battle    the phase 4 exit scenario, verbatim — the engines' own
//                     proving ground, now with humans at the reins
//   legions-vs-celts  built through the phase 7 army builder at match time,
//                     so playing it exercises the full shopping-list-to-
//                     battlefield chain every time it loads
//
// Both carry standing orders 'advance': a unit you leave without orders
// presses the nearest enemy. Type `<unit> hold` to countermand — a unit
// is allowed to stand, but only on purpose.

const { buildArmy, toBattleUnits } = require('../../engine/army/builder')
const { resolveMap } = require('../../engine/map/map')
const { deployArmies } = require('../../engine/map/deploy')
const { MAPS } = require('../../data/maps')

function meetingBattle() {
  return require('../../harness/scenarios/meeting-battle')
}

function legionsVsCelts() {
  const roman = buildArmy({
    culture: 'Roman Republic',
    units: [
      { quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' },
      { quality: 'militia', weapon: 'spear_professional', armor: 'light_armor', shield: 'medium_shield' },
      { quality: 'militia', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield' }
    ]
  })
  const celt = buildArmy({
    culture: 'Celtic Tribes',
    units: [
      { quality: 'tribal_warriors', weapon: 'celtic_longsword', armor: 'light_armor', shield: 'medium_shield' },
      { quality: 'tribal_warriors', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' },
      { quality: 'levy', weapon: 'sling', armor: 'no_armor', shield: 'no_shield' }
    ]
  })

  if (!roman.ok || !celt.ok) {
    throw new Error('scenario armies failed the builder: ' +
      [...roman.errors, ...celt.errors].join('; '))
  }

  return {
    name: 'legions-vs-celts',
    seed: 11,
    engagementRange: 1,
    standingOrders: { red: 'advance', blue: 'advance' },
    sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } },
    units: [
      ...toBattleUnits(roman.army, { side: 'red', positions: ['E7', 'E8', 'D8', 'E9'] }),
      ...toBattleUnits(celt.army, { side: 'blue', positions: ['N7', 'N8', 'O8', 'N9'] })
    ],
    turns: []
  }
}

const SCENARIOS = {
  'meeting-battle': meetingBattle,
  'legions-vs-celts': legionsVsCelts
}

/**
 * A scenario, optionally fought on another map: its armies keep their
 * formations and form up on that map's deployment ground (deploy.js).
 * Crownhill, where both scenarios were drawn, keeps their own positions.
 */
// On Crownhill the armies stand where the scenario drew them (close, in the
// north-west corner: the quick fight the engine's tests were written on),
// unless `deploy` asks for the map's own deployment: either side of the
// river, with an approach march, as on every other map.
// `kind`: the kind of battle (src/data/maps, kindsOf), for a map that forms
// its armies up elsewhere for it (a map's `deployFor`: Crownhill's fords).
function loadScenario(name, { map = null, deploy = false, kind = null } = {}) {
  const factory = SCENARIOS[name]
  if (!factory) return null
  const spec = factory()
  if ((!map || map === 'crownhill') && !deploy) return spec
  map = map ?? 'crownhill'
  if (!MAPS[map]) return null
  const resolved = resolveMap(map)
  // (Kept in the spec, so that armies called out for it form up there too:
  // army/factions.js, standard.js, secondLine.js.)
  const elsewhere = MAPS[map].deployFor?.[kind] ?? null
  return { ...spec, map, units: deployArmies(resolved, spec.units, spec.sides, elsewhere ?? resolved.deploy ?? {}), ...(elsewhere ? { deploy: elsewhere } : {}) }
}

// The maps a battle can be fought on, for choosing, each with its size in
// kilometres. { big: false } leaves out the fields wider than 1 km: the
// harnesses measure the four 1 km fields as they always have, and the big
// ones only when asked (docs/DECISIONS.md, "How the big map was built").
function mapChoices({ big = true } = {}) {
  return Object.values(MAPS)
    .filter(m => big || m.width <= 40)
    .map(m => ({ id: m.name, title: m.title ?? m.name, km: m.width * 25 / 1000 }))
}

module.exports = { SCENARIOS, loadScenario, mapChoices }
