// src/engine/map/places.js
//
// Turn the way a player describes the ground into a place on the map:
// "the ridge to the east", "the clearing", "the woods north of the ford",
// "Harrow Bridge". Ruling of 2026-10-21: players describe the ground; named
// landmarks are flavour.
//
// Two parts:
//   parsePlace(text)                 words -> a place reference (no map needed)
//   findPlace(map, from, reference)  reference + where the unit stands ->
//                                    a feature and a tile to go to, or a
//                                    question when the words fit more than
//                                    one place. Never a guess.
//
// A place reference:
//   { kinds: ['hill'], direction: 'east' | null, nearest: bool,
//     name: "Harrow Bridge" | null, from: <another reference> | null,
//     part: 'near' | 'centre' | null }
//
// Pure: everything is computed from the map, its features and the position
// asked from.

const { detectFeatures } = require('./features')
const { distance, positionKey } = require('./labels')

const TILE_METRES = 25

// ── Words ──────────────────────────────────────────────

// Words a player might use for each kind of ground. Longer phrases first, so
// "high ground" is read before "ground" could be.
const KIND_WORDS = [
  ['high ground', ['hill']], ['heights', ['hill']], ['ridge', ['hill']], ['ridges', ['hill']],
  ['hills', ['hill']], ['hill', ['hill']], ['rise', ['hill']], ['crest', ['hill']],
  ['woods', ['woods']], ['wood', ['woods']], ['forest', ['woods']], ['trees', ['woods']],
  ['treeline', ['woods']], ['tree line', ['woods']],
  ['marshes', ['marsh']], ['marsh', ['marsh']], ['swamp', ['marsh']], ['bog', ['marsh']], ['fen', ['marsh']],
  ['river', ['river']], ['stream', ['river']], ['water', ['river']], ['riverbank', ['river']], ['bank', ['river']],
  ['fords', ['ford']], ['ford', ['ford']], ['shallows', ['ford']],
  ['crossing', ['ford', 'bridge']], ['bridge', ['bridge']],
  ['road', ['road']], ['track', ['road']],
  ['clearing', ['clearing']], ['glade', ['clearing']]
]

const DIRECTIONS = {
  north: 90, 'north-east': 45, northeast: 45, east: 0, 'south-east': -45, southeast: -45,
  south: -90, 'south-west': -135, southwest: -135, west: 180, 'north-west': 135, northwest: 135
}
const COMPASS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east']

// How far either side of a direction still counts as "that way".
const CONE_DEGREES = 50
// A match is clearly the one meant when the next is this much farther.
const CLEAR_MARGIN = { ratio: 1.5, tiles: 3 }

function normalise(text) {
  return String(text ?? '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' -]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function findKind(text) {
  for (const [word, kinds] of KIND_WORDS) {
    const at = text.search(new RegExp(`\\b${word}\\b`))
    if (at !== -1) return { word, kinds, at }
  }
  return null
}

function findDirection(text) {
  const match = text.match(/\b(north|south)[- ]?(east|west)\b|\b(north|south|east|west)\b/)
  if (!match) return null
  const word = match[1] ? `${match[1]}-${match[2]}` : match[3]
  return { direction: word, at: match.index }
}

/**
 * Read a place out of words. Returns null when the words name no kind of
 * ground (the caller may then try a named landmark or a coordinate).
 */
function parsePlace(raw) {
  const text = normalise(raw)
  if (!text) return null

  // "X north of Y": the part after "of" is the anchor.
  const anchored = text.match(/^(.*?)\b((?:north|south)[- ]?(?:east|west)?|east|west)\s+(?:of|from)\s+(.+)$/)
  if (anchored) {
    const head = parsePlace(anchored[1])
    const parsed = parsePlace(anchored[3])
    const anchor = parsed
      ? { ...parsed, text: anchored[3] }
      : { kinds: null, name: anchored[3], text: anchored[3], direction: null, nearest: false, from: null, part: null }
    if (head) {
      return { ...head, direction: findDirection(anchored[2]).direction, from: anchor }
    }
  }

  const kind = findKind(text)
  if (!kind) return null

  const direction = findDirection(text)
  const nearest = /\b(nearest|closest|near|nearby)\b/.test(text)
  const part = /\b(edge|near side|this side|in front of|before)\b/.test(text)
    ? 'near'
    : /\b(top|crest|summit|middle|centre|center|up on|atop)\b/.test(text) ? 'centre' : null

  return {
    kinds: kind.kinds,
    word: kind.word,
    direction: direction ? direction.direction : null,
    nearest,
    name: null,
    from: null,
    part
  }
}

// ── Geometry ───────────────────────────────────────────

// Bearing in degrees, 0 = east, 90 = north (the map's y grows southward).
function bearing(from, to) {
  return Math.atan2(-(to.y - from.y), to.x - from.x) * 180 / Math.PI
}

function angleBetween(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function compassWord(from, to) {
  const b = bearing(from, to)
  const index = Math.round(((b + 360) % 360) / 45) % 8
  return COMPASS[index]
}

// Nearest tile of a feature to a point (ties: the feature's scan order).
function nearestTile(feature, from) {
  let best = feature.tiles[0]
  let bestDistance = Infinity
  for (const tile of feature.tiles) {
    const d = distance(from, tile)
    if (d < bestDistance) { best = tile; bestDistance = d }
  }
  return { tile: best, tiles: bestDistance }
}

function metres(tiles) {
  return tiles * TILE_METRES
}

// ── Where to go inside a feature ───────────────────────

// Default part of each kind: up on a hill, at the edge of woods or marsh,
// the crossing itself, into a clearing, onto the road, the near bank of a
// river (no one stands in the river).
const DEFAULT_PART = {
  hill: 'centre', woods: 'near', marsh: 'near', river: 'bank',
  ford: 'near', bridge: 'near', road: 'near', clearing: 'centre'
}

function pointIn(map, feature, from, part) {
  const want = part ?? DEFAULT_PART[feature.kind]
  if (want === 'centre') return { ...feature.centre }
  if (want === 'bank' || !map.passable(nearestTile(feature, from).tile)) {
    // The passable tile beside the feature that is nearest the unit.
    const inside = new Set(feature.tiles.map(positionKey))
    let best = null
    let bestDistance = Infinity
    for (const tile of feature.tiles) {
      for (const next of map.neighbors(tile)) {
        if (inside.has(positionKey(next)) || !map.passable(next)) continue
        const d = distance(from, next)
        if (d < bestDistance) { best = next; bestDistance = d }
      }
    }
    return best ? { ...best } : { ...feature.centre }
  }
  return { ...nearestTile(feature, from).tile }
}

// ── Finding the place ──────────────────────────────────

// "The Crownhill 400 m east": distance and direction to where the unit
// would actually go, so the words match the move.
function describe(feature, from, word, position) {
  const what = feature.name ?? `the ${word ?? feature.shape ?? feature.kind}`
  const tiles = distance(from, position)
  return tiles === 0 ? `${what} (here)` : `${what} ${metres(tiles)} m ${compassWord(from, position)}`
}

/**
 * @param {Object} map
 * @param {{x,y}} from   where the unit stands
 * @param {Object|string} reference  from parsePlace, or words to parse
 * @returns one of
 *   { feature, position, description }
 *   { question, options: [{ feature, position, description }] }
 *   { none: reason }
 */
function findPlace(map, from, reference) {
  // A landmark's exact name wins over reading the words as ground, so
  // "Miller's Crossing" is that ford, not "the nearest crossing". Only exact
  // names: aliases like "the ridge" are read as ground, which is the point.
  if (typeof reference === 'string') {
    const named = byName(map, from, reference)
    if (named.feature) return named
  }
  const ref = typeof reference === 'string' ? parsePlace(reference) : reference
  if (!ref) return { none: 'no ground I recognise in that' }

  const features = detectFeatures(map)

  // The anchor, for "the woods north of the ford": find it first, then look
  // from there.
  let origin = from
  if (ref.from) {
    const byItsName = ref.from.text ? byName(map, from, ref.from.text) : { none: true }
    const anchor = byItsName.feature
      ? byItsName
      : ref.from.kinds ? findPlace(map, from, ref.from) : byName(map, from, ref.from.name)
    if (!anchor.feature) return anchor
    origin = anchor.feature.centre
  }

  if (ref.name) return byName(map, from, ref.name)

  let candidates = features.filter(f => ref.kinds.includes(f.kind))
  if (candidates.length === 0) return { none: `there is no ${ref.word ?? ref.kinds[0]} on this field` }

  if (ref.direction) {
    const want = DIRECTIONS[ref.direction]
    candidates = candidates.filter(f =>
      distance(origin, f.centre) > 0 && angleBetween(bearing(origin, f.centre), want) <= CONE_DEGREES)
    if (candidates.length === 0) {
      return { none: `no ${ref.word ?? ref.kinds[0]} lies ${ref.direction}` }
    }
  }

  const ranked = candidates
    .map(f => ({ feature: f, tiles: nearestTile(f, origin).tiles }))
    .sort((a, b) => a.tiles - b.tiles)

  const pick = (entry) => {
    const position = pointIn(map, entry.feature, from, ref.part)
    return { feature: entry.feature, position, description: describe(entry.feature, from, ref.word, position) }
  }

  const [best, next] = ranked
  const clear = !next || ref.nearest
    ? !next || next.tiles > best.tiles
    : next.tiles >= best.tiles * CLEAR_MARGIN.ratio && next.tiles >= best.tiles + CLEAR_MARGIN.tiles
  if (clear) return pick(best)

  const close = ranked.filter(r => r.tiles < best.tiles * CLEAR_MARGIN.ratio || r.tiles < best.tiles + CLEAR_MARGIN.tiles)
    .slice(0, 3)
  const options = close.map(pick)
  return {
    question: `Which ${ref.word ?? ref.kinds[0]}: ${options.map(o => o.description).join(', or ')}?`,
    options
  }
}

function byName(map, from, name) {
  const wanted = normalise(name).replace(/^the /, '')
  const feature = detectFeatures(map).find(f => f.name && normalise(f.name).replace(/^the /, '') === wanted)
  if (!feature) return { none: `I know no place called "${name}"` }
  const position = pointIn(map, feature, from, null)
  return { feature, position, description: describe(feature, from, null, position) }
}

module.exports = { parsePlace, findPlace, compassWord, KIND_WORDS, DIRECTIONS, TILE_METRES }
