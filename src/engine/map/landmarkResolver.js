// src/engine/map/landmarkResolver.js
// Two jobs: resolve a natural-language target to a place on the map,
// and build the plain-language context the intent parser receives.
// AI never sees raw coordinates.
//
// Every function takes the map it is asked about. Results carry both the
// numeric `position` the engine uses and the `coord` label the CLI prints.

const { toLabel } = require('./labels')

// Flat alias index: lower-cased name -> landmark entry. Built once per map.
const indexes = new WeakMap()
function aliasIndex(map) {
  if (!indexes.has(map)) {
    const index = {}
    for (const landmark of map.landmarks()) {
      if (landmark.landmark) index[landmark.landmark.toLowerCase()] = landmark
      for (const alias of (landmark.aliases || [])) index[alias.toLowerCase()] = landmark
    }
    indexes.set(map, index)
  }
  return indexes.get(map)
}

function found(landmark, confidence) {
  const { position, ...cell } = landmark
  return { position: { ...position }, coord: toLabel(position), cell, confidence }
}

// Returns one of:
//   { position, coord, cell, confidence: 'exact' | 'partial' }
//   { matches: [...], confidence: 'ambiguous' }
//   { confidence: 'none' }
function resolve(map, naturalLanguageTarget) {
  if (!map) throw new Error('resolve needs the map')
  if (!naturalLanguageTarget) return { confidence: 'none' }
  const input = naturalLanguageTarget.toLowerCase().trim()
  const index = aliasIndex(map)

  // Exact match
  if (index[input]) return found(index[input], 'exact')

  // Partial match — whole-word matching to avoid substring false positives
  // e.g. "ridge" should NOT match "bridge"
  const wordMatch = (alias, query) => {
    const aliasWords = alias.split(/\s+/)
    const queryWords = query.split(/\s+/)
    return queryWords.every(qw => aliasWords.some(aw => aw.startsWith(qw) || qw.startsWith(aw)))
  }

  const partialMatches = Object.entries(index)
    .filter(([alias]) => wordMatch(alias, input) || wordMatch(input, alias))
    .map(([alias, landmark]) => ({ alias, ...found(landmark) }))

  // Deduplicate by place
  const seen = new Set()
  const unique = partialMatches.filter(m => {
    if (seen.has(m.coord)) return false
    seen.add(m.coord)
    return true
  })

  if (unique.length === 1) {
    return { position: unique[0].position, coord: unique[0].coord, cell: unique[0].cell, confidence: 'partial' }
  }

  if (unique.length > 1) {
    return { matches: unique, confidence: 'ambiguous' }
  }

  return { confidence: 'none' }
}

// Plain-language context for the intent parser.
// Describes the unit's current location and all named landmarks.
// AI never receives raw grid coordinates.
function buildLocalContext(map, unit) {
  const currentCell = map.cell(unit.position)
  const currentDesc = currentCell.landmark
    ? `The unit is currently at ${currentCell.landmark}${currentCell.description ? ' — ' + currentCell.description : ''}.`
    : `The unit is currently positioned in open ground.`

  const landmarks = map.landmarks()
    .map(cell => `**${cell.landmark}**: ${cell.description}`)
    .join('\n')

  return `${currentDesc}\n\nKnown locations on this battlefield:\n${landmarks}`
}

// List all landmark names (for fallback messages to the player)
function listLandmarks(map) {
  return map.landmarks().map(cell => cell.landmark)
}

module.exports = { resolve, buildLocalContext, listLandmarks }
