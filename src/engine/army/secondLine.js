// src/engine/army/secondLine.js
//
// The second line: on a field bigger than 1 km, every army is joined by its
// faction's usual army again, raised for the day (docs/DECISIONS.md, "How
// the big map was built"). A map says how many lines it calls out
// (`lines`, in src/data/maps; none: one, and nothing here changes).
//
// The second line is the faction's usual units without its elite, each
// called "second <name>" ("second legionaries"), and all of them answer to
// "second line". They are marked `secondLine`: a Commander does not keep
// them (they are not on his roster, and his company takes no note of them);
// they go home when the battle is over.
//
// The whole side then forms up again, first line and second together
// (factions.js, formUp: foot abreast, missile foot behind, horse on the
// wings), on the map's deployment ground. Pure: the same spec and map
// always give the same units.

const { resolveMap } = require('../map/map')
const { deployArmies } = require('../map/deploy')
const { factionUnits, formUp } = require('./factions')

/** How many lines an army is called out in on this map: 1 on a 1 km field. */
function linesOf(mapSpec) {
  return resolveMap(mapSpec ?? 'crownhill').lines ?? 1
}

/**
 * Add each side's second line (and any further lines the map asks for).
 *
 * @param {Object} spec    a battle spec with its armies already fielded
 * @param {Object} sides   { [side]: faction key } for the sides that take one
 * @returns the spec; unchanged on a map of one line
 */
function withSecondLine(spec, sides) {
  const map = resolveMap(spec.map ?? 'crownhill')
  const lines = map.lines ?? 1
  if (lines <= 1) return spec
  let units = spec.units
  for (const [side, key] of Object.entries(sides)) {
    if (!key) continue
    const homeEdge = spec.sides?.[side]?.homeEdge ?? (side === 'red' ? 'west' : 'east')
    const first = units.filter(u => u.side === side)
    const raised = []
    for (let line = 2; line <= lines; line++) {
      const word = line === 2 ? 'second' : line === 3 ? 'third' : `line ${line}`
      for (const u of factionUnits(key, side, homeEdge).filter(u => u.quality !== 'elite')) {
        const bare = u.id.replace(new RegExp(`^${side}_`), '')
        raised.push({
          ...u,
          id: `${side}_${word.replace(/ /g, '_')}_${bare}`,
          aliases: [...(u.aliases ?? []).map(a => `${word} ${a}`), `${word} line`],
          secondLine: true
        })
      }
    }
    const army = deployArmies(map, formUp([...first, ...raised], homeEdge), { [side]: spec.sides?.[side] ?? { homeEdge } })
    const at = units.findIndex(u => u.side === side)
    const rest = units.filter(u => u.side !== side)
    units = at < 0 ? [...rest, ...army] : [...rest.slice(0, at), ...army, ...rest.slice(at)]
  }
  return { ...spec, units }
}

module.exports = { withSecondLine, linesOf }
