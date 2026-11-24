// src/data/maps/index.js
// Every authored map, by name. A battle spec names its map here, or carries a
// map definition of its own.

const crownhill = require('./crownhill')
const ashford = require('./ashford')
const thornwood = require('./thornwood')
const ravenridge = require('./ravenridge')

const MAPS = { crownhill, ashford, thornwood, ravenridge }

// A map's own ground to fight for, as a battle spec's objectives
// (engine/orchestrator/victory.js, objectiveArea). None for a map without.
function groundOf(name) {
  return (MAPS[name]?.ground ?? []).map((ground, i) => ({ id: `ground-${i + 1}`, ...ground, ...(ground.tiles ? { tiles: ground.tiles.map(t => ({ ...t })) } : {}) }))
}

module.exports = { MAPS, groundOf }
