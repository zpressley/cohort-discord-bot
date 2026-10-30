// src/data/maps/ravenridge.js
//
// Raven Ridge: open country, 40x40 (1 km square), split by a long ridge
// running north to south down the middle. The road crosses it at Raven Gap,
// a saddle in the ridge. Gallows Copse stands on the western slope, the Fen
// lies wet across the south, a stream runs east of the ridge.
//
// A battle of high ground and reverse slopes: whoever holds the crest sees
// both sides; whoever waits behind it is hidden from the other.

const { sketch, label } = require('./draw')

const W = 40
const H = 40
const map = sketch(W, H)

// The ridge: a long band of high ground, broken at the gap.
map.ellipse(20, 10, 3, 10, 'hill')
map.ellipse(20, 29, 3, 9, 'hill')
map.ellipse(19, 20, 1.5, 1.5, 'plains')       // Raven Gap
map.ellipse(21, 20, 1.5, 1.5, 'plains')

// Gallows Copse on the western slope; scattered woods in the east.
map.ellipse(13, 13, 3, 2.5, 'forest')
map.ellipse(31, 7, 3, 2, 'forest')
map.ellipse(33, 27, 2.5, 3, 'forest')
map.ellipse(4, 35, 3, 2, 'forest')

// The Fen across the south.
map.ellipse(12, 37, 8, 2.5, 'marsh')
map.ellipse(29, 38, 6, 1.5, 'marsh')

// A stream east of the ridge, north to south into the fen.
map.line([[27, 0], [26, 9], [28, 17], [27, 26], [29, 34], [29, 39]], 'river', { width: 1 })

// The road west to east, through the gap, over the stream at Stone Ford.
map.line([[0, 20], [39, 20]], 'road', { over: g => g !== 'river' })
const [stoneFord] = map.cross('ford')

function at(kind, [x, y]) {
  for (let r = 0; r < 5; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (map.get(x + dx, y + dy) === kind) return label(x + dx, y + dy)
    }
  }
  throw new Error(`ravenridge: no ${kind} near ${x},${y}`)
}

const CELLS = {
  [at('hill', [20, 6])]: {
    terrain: 'hill', landmark: 'Raven Ridge', tags: ['hill', 'high_ground', 'ridge'],
    aliases: ['raven ridge', 'the ridge', 'the crest'],
    description: 'A long bare ridge, the spine of the field'
  },
  [at('road', [20, 20])]: {
    terrain: 'road', landmark: 'Raven Gap', tags: ['road', 'pass'],
    aliases: ['raven gap', 'the gap', 'the saddle', 'the pass'],
    description: 'A saddle in the ridge where the road goes through'
  },
  [at('forest', [13, 13])]: {
    terrain: 'forest', landmark: 'Gallows Copse', tags: ['woods'],
    aliases: ['gallows copse', 'the copse'],
    description: 'A dark copse on the western slope, with an old gibbet'
  },
  [at('marsh', [12, 37])]: {
    terrain: 'marsh', landmark: 'The Fen', tags: ['marsh'],
    aliases: ['the fen', 'fen'],
    description: 'Wet ground and reed beds across the south'
  },
  [at('ford', stoneFord)]: {
    terrain: 'ford', landmark: 'Stone Ford', tags: ['ford', 'river_crossing', 'road'],
    aliases: ['stone ford', 'the ford'],
    description: 'Flat stones laid across the stream where the road crosses'
  }
}

module.exports = {
  name: 'ravenridge',
  title: 'Raven Ridge',
  width: W,
  height: H,
  cells: CELLS,
  terrain: map.terrain(),
  deploy: { west: { x: 9, y: 22 }, east: { x: 32, y: 22 } }
}
