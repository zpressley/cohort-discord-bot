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

// Raven Gap as ground to hold: the open tiles of the saddle, from the road's
// way in on the west (x 19) to the ridge's eastern foot (x 22). With its
// westmost column too, the west army won 66 battles in 100.
const GAP = []
for (let y = 19; y <= 21; y++) for (let x = 19; x <= 22; x++) if (map.get(x, y) !== 'hill') GAP.push({ x, y })

module.exports = {
  name: 'ravenridge',
  title: 'Raven Ridge',
  width: W,
  height: H,
  cells: CELLS,
  terrain: map.terrain(),
  // Where each army forms up. The east army one tile nearer the ridge, at
  // (31, 22) (it was (32, 22)): both as far from Raven Gap (285 and 284 m),
  // first unit on it after 19 and 20 minutes (it was 19 and 24), and between
  // equal armies played by the computer the west won 59% before, 51% now.
  // docs/DECISIONS.md, "How the first battle, being asked, and forming up
  // were built" (combined with the planner's change).
  deploy: { west: { x: 9, y: 22 }, east: { x: 31, y: 22 } },
  // For a pitched battle, the west army three tiles north, at (9, 19).
  // From (9, 22) the computer against itself gave the west 36%: the west
  // held the southern half of the ridge, off the road, and the east the
  // Stone Ford on it; whoever went looking met the other at the gap. From
  // here 48 to 57% a tile either way (53% at (9, 19); 60 battles each).
  // docs/DECISIONS.md, as above.
  // Since units pass through one another (November 28), the west two
  // tiles back, at (7, 19), and the east by the river below the Stone
  // Ford, at (29, 24): from (9, 19) and (31, 22) the west won 42% (800
  // battles, the sides named both ways), and 36 to 47% wherever the west
  // stood; from here 49%, and 51 to 57% a tile either way but one: the
  // east a tile further east, at (30, 24), 41%. docs/DECISIONS.md, "How sharing a tile and passing through were restored".
  deployFor: { pitched: { west: { x: 7, y: 19 }, east: { x: 29, y: 24 } } },
  // The ground to fight for (engine/orchestrator/victory.js, objectiveArea):
  // the saddle where the road goes through the ridge, held from on it (the
  // open ground between the two halves of the ridge, not the whole road).
  ground: [{ name: 'Raven Gap', tiles: GAP }],
  // The kinds of battle fought here, the first offered first at the muster
  // (docs/DECISIONS.md, "How the kinds of battle were built"): the gap is a
  // choke point, made for a battle for ground.
  kinds: ['pitched', 'ground']
}
