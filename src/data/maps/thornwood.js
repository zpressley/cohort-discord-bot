// src/data/maps/thornwood.js
//
// Thornwood: a forest battle, 40x40 (1 km square). Open fields along the
// western and eastern edges where the armies come in; between them the
// Thornwood, cut by one road and a brook, with clearings in it. An ambush
// map: inside the trees a unit sees one tile, and a column on the road is
// in plain sight of nobody.

const { sketch, label } = require('./draw')

const W = 40
const H = 40
const map = sketch(W, H)

// The wood, leaving fields at both edges and a ragged treeline.
map.rect(8, 0, 31, 39, 'forest')
for (let y = 0; y < H; y += 3) {
  map.set(8, y, 'plains')
  map.set(31, (y + 1) % H, 'plains')
}
map.ellipse(4, 6, 3, 3, 'forest')            // a copse in the western field
map.ellipse(36, 32, 3, 4, 'forest')          // and one in the eastern

// Clearings in the wood.
map.ellipse(15, 10, 3, 2.5, 'plains')         // Charcoal Clearing
map.ellipse(25, 29, 3.5, 3, 'plains')         // Hermit's Glade
map.ellipse(20, 4, 2.5, 2, 'plains')

// Thorn Knoll: a rise in the middle of the wood, clear of trees on top.
map.ellipse(22, 17, 3, 2.5, 'hill')

// Marsh where the brook spreads in the south.
map.ellipse(14, 34, 4, 2.5, 'marsh')

// The Thorn Brook, north-east to south-west.
map.line([[34, 0], [30, 8], [26, 14], [20, 22], [16, 30], [12, 39]], 'river', { width: 1 })

// The road straight through, west to east, fording the brook.
map.line([[0, 20], [39, 20]], 'road', { over: g => g !== 'river' })
const [brookFord] = map.cross('ford')

function at(kind, [x, y]) {
  for (let r = 0; r < 5; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (map.get(x + dx, y + dy) === kind) return label(x + dx, y + dy)
    }
  }
  throw new Error(`thornwood: no ${kind} near ${x},${y}`)
}

const CELLS = {
  [at('ford', brookFord)]: {
    terrain: 'ford', landmark: 'Brook Ford', tags: ['ford', 'river_crossing', 'road'],
    aliases: ['brook ford', 'the ford'],
    description: 'Where the road splashes through the Thorn Brook'
  },
  [at('hill', [22, 17])]: {
    terrain: 'hill', landmark: 'Thorn Knoll', tags: ['hill', 'high_ground'],
    aliases: ['thorn knoll', 'the knoll'],
    description: 'A bald rise in the heart of the wood'
  },
  [at('plains', [15, 10])]: {
    terrain: 'plains', landmark: 'Charcoal Clearing', tags: ['clearing'],
    aliases: ['charcoal clearing', 'the charcoal burners'],
    description: 'A clearing black with old charcoal pits'
  },
  [at('plains', [25, 29])]: {
    terrain: 'plains', landmark: "Hermit's Glade", tags: ['clearing'],
    aliases: ["hermit's glade", 'hermits glade', 'the glade'],
    description: 'A quiet glade around a ruined cell'
  },
  [at('road', [5, 20])]: {
    terrain: 'road', landmark: 'The Thornwood Road', tags: ['road'],
    aliases: ['thornwood road', 'the road', 'the forest road'],
    description: 'A narrow road through the trees, two carts wide'
  }
}

module.exports = {
  name: 'thornwood',
  title: 'Thornwood',
  width: W,
  height: H,
  cells: CELLS,
  terrain: map.terrain(),
  // The armies form up in the fields on either side of the wood. The west
  // a tile on, (6, 20), since armies march in column (it was (5, 20)): the
  // east, nearer Thorn Knoll, then won 59% between two computer armies (400
  // battles); now the west wins 51%. docs/DECISIONS.md, "How columns, wavering under fire and
  // flight were mended".
  deploy: { west: { x: 6, y: 20 }, east: { x: 35, y: 20 } },
  // For a pitched battle (no ground to fight for), the west army forms up
  // in the north field, at (6, 14). From the road at (6, 20) the computer
  // against itself gave the west 70 to 74% (and 65% from (6, 17) or (7, 16)):
  // both armies hold the ford, each on its own bank, and the east, losing
  // patience first as often as not, must cross it a unit at a time into the
  // west's line under Thorn Knoll; and with neither holding, they meet at
  // the knoll, on the west's bank. From the north field the west makes for
  // the knoll through the wood, not the ford, and the share is 43 to 48% a
  // tile either way (60 battles each; 47% at (6, 16)). docs/DECISIONS.md,
  // "How the kinds of battle were built", round two.
  deployFor: { pitched: { west: { x: 6, y: 14 }, east: { x: 35, y: 20 } } },
  // The ground to fight for (engine/orchestrator/victory.js, objectiveArea):
  // the bald rise in the heart of the wood, held from on it or beside it
  // (the brook cuts its eastern foot: held from on it alone, the west army
  // won 63 battles in 100).
  ground: [{ feature: 'Thorn Knoll', name: 'Thorn Knoll', reach: 1 }],
  // The kinds of battle fought here, the first offered first at the muster
  // (docs/DECISIONS.md, "How the kinds of battle were built"). The knoll is
  // the king of the hill (ruled 2026-11-25: "need a king of the hill style
  // one"): one rise in the heart of the wood, and its muster line says so.
  kinds: ['pitched', 'ground'],
  kingOfTheHill: true
}
