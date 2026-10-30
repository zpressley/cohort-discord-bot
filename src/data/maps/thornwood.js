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
  // The armies form up in the fields on either side of the wood.
  deploy: { west: { x: 5, y: 20 }, east: { x: 35, y: 20 } }
}
