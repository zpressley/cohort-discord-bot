// src/data/maps/index.js
// Every authored map, by name. A battle spec names its map here, or carries a
// map definition of its own.

const crownhill = require('./crownhill')
const ashford = require('./ashford')
const thornwood = require('./thornwood')
const ravenridge = require('./ravenridge')
const greywater = require('./greywater')

const MAPS = { crownhill, ashford, thornwood, ravenridge, greywater }

// A map's own ground to fight for, as a battle spec's objectives
// (engine/orchestrator/victory.js, objectiveArea). None for a map without.
function groundOf(name) {
  return (MAPS[name]?.ground ?? []).map((ground, i) => ({ id: `ground-${i + 1}`, ...ground, ...(ground.tiles ? { tiles: ground.tiles.map(t => ({ ...t })) } : {}) }))
}

// The kinds of battle (ruled 2026-11-25; docs/DECISIONS.md, "How the kinds
// of battle were built"): the pitched battle, fought on every field, with
// no ground to fight for; and the battle for ground, on a field made for
// it (one with `ground`). A third kind (camps) is to come: a new id here,
// what it puts in the spec in kindSpec, and its words in narrator/words.js
// (KINDS).
const KIND_IDS = ['pitched', 'ground']

// The kinds of battle a field offers, the one offered first first: its own
// `kinds` line, else the pitched battle, and the battle for ground where it
// has ground.
function kindsOf(name) {
  const map = MAPS[name]
  if (!map) return []
  const listed = Array.isArray(map.kinds) ? map.kinds : ['pitched', 'ground']
  return listed.filter(k => KIND_IDS.includes(k) && (k !== 'ground' || (map.ground ?? []).length > 0))
}

// What a kind of battle puts in a battle's spec on this field: its kind,
// and for the battle for ground, the field's ground (groundOf) and, with
// several, how many of them must be held (the map's `hold`).
function kindSpec(name, kind) {
  if (kind !== 'ground') return { kind, objectives: [] }
  const hold = MAPS[name]?.hold
  return { kind, objectives: groundOf(name), ...(hold?.needed ? { objectivesNeeded: hold.needed, groundCalled: hold.called ?? null } : {}) }
}

module.exports = { MAPS, groundOf, kindsOf, kindSpec, KIND_IDS }
