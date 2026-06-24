// src/phase1-movement/landmarkResolver.js
// Two jobs: resolve a natural-language target to a coordinate,
// and build the plain-language context the intent parser receives.
// AI never sees raw coordinates.

const { CELLS, getCell } = require('./mapData')

// Build flat alias index at startup
function buildAliasIndex() {
  const index = {}
  for (const [coord, cell] of Object.entries(CELLS)) {
    if (cell.landmark) {
      index[cell.landmark.toLowerCase()] = coord
    }
    for (const alias of (cell.aliases || [])) {
      index[alias.toLowerCase()] = coord
    }
  }
  return index
}

const ALIAS_INDEX = buildAliasIndex()

// Returns one of:
//   { coord, cell, confidence: 'exact' | 'partial' }
//   { matches: [...], confidence: 'ambiguous' }
//   { confidence: 'none' }
function resolve(naturalLanguageTarget) {
  if (!naturalLanguageTarget) return { confidence: 'none' }
  const input = naturalLanguageTarget.toLowerCase().trim()

  // Exact match
  if (ALIAS_INDEX[input]) {
    const coord = ALIAS_INDEX[input]
    return { coord, cell: CELLS[coord], confidence: 'exact' }
  }

  // Partial match — whole-word matching to avoid substring false positives
  // e.g. "ridge" should NOT match "bridge"
  const wordMatch = (alias, query) => {
    const aliasWords = alias.split(/\s+/)
    const queryWords = query.split(/\s+/)
    return queryWords.every(qw => aliasWords.some(aw => aw.startsWith(qw) || qw.startsWith(aw)))
  }

  const partialMatches = Object.entries(ALIAS_INDEX)
    .filter(([alias]) => wordMatch(alias, input) || wordMatch(input, alias))
    .map(([alias, coord]) => ({ alias, coord, cell: CELLS[coord] }))

  // Deduplicate by coord
  const seen = new Set()
  const unique = partialMatches.filter(m => {
    if (seen.has(m.coord)) return false
    seen.add(m.coord)
    return true
  })

  if (unique.length === 1) {
    return { coord: unique[0].coord, cell: unique[0].cell, confidence: 'partial' }
  }

  if (unique.length > 1) {
    return { matches: unique, confidence: 'ambiguous' }
  }

  return { confidence: 'none' }
}

// Plain-language context for the intent parser.
// Describes the unit's current location and all named landmarks.
// AI never receives raw grid coordinates.
function buildLocalContext(unit) {
  const currentCell = getCell(unit.position)
  const currentDesc = currentCell.landmark
    ? `The unit is currently at ${currentCell.landmark}${currentCell.description ? ' — ' + currentCell.description : ''}.`
    : `The unit is currently positioned in open ground.`

  const landmarks = Object.entries(CELLS)
    .filter(([, cell]) => cell.landmark)
    .map(([, cell]) => `**${cell.landmark}**: ${cell.description}`)
    .join('\n')

  return `${currentDesc}\n\nKnown locations on this battlefield:\n${landmarks}`
}

// List all landmark names (for fallback messages to the player)
function listLandmarks() {
  return Object.values(CELLS)
    .filter(cell => cell.landmark)
    .map(cell => cell.landmark)
}

module.exports = { resolve, buildLocalContext, listLandmarks, ALIAS_INDEX }
