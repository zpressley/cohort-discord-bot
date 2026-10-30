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
function loadScenario(name, { map = null } = {}) {
  const factory = SCENARIOS[name]
  if (!factory) return null
  const spec = factory()
  if (!map || map === 'crownhill') return spec
  if (!MAPS[map]) return null
  return { ...spec, map, units: deployArmies(resolveMap(map), spec.units, spec.sides) }
}

// The maps a battle can be fought on, for choosing.
function mapChoices() {
  return Object.values(MAPS).map(m => ({ id: m.name, title: m.title ?? m.name }))
}

module.exports = { SCENARIOS, loadScenario, mapChoices }
