// src/data/maps/ashford.js
//
// Ashford Vale: a river valley, 40x40 (1 km square). The Ash runs from the
// north down the middle of the field and bends east in the south. Three
// ways across: Ash Ford in the north, the Old Mill Bridge where the road
// crosses mid-field, and Willow Ford in the marshy south. Woods on both
// banks, Beacon Hill in the north-east, the Low Downs in the south-west.
//
// A battle of crossings: whoever holds the bridge holds the road, and the
// fords are the long way round.

const { sketch, label } = require('./draw')

const W = 40
const H = 40
const map = sketch(W, H)

// High ground first; woods and water paint over it.
map.ellipse(32, 6, 7, 5, 'hill')            // Beacon Hill
map.ellipse(6, 31, 6, 5, 'hill')            // the Low Downs

// Woods on both banks, with gaps for the road and the fords.
map.ellipse(9, 9, 7, 5, 'forest')
map.ellipse(14, 24, 4, 6, 'forest')
map.ellipse(27, 17, 4, 6, 'forest')
map.ellipse(31, 30, 6, 4, 'forest')
map.rect(0, 0, 2, 4, 'forest')

// The marsh about the river's southern bend.
map.ellipse(22, 33, 6, 3, 'marsh')

// The river Ash: north to south, bending east in the south.
const RIVER = [[20, 0], [19, 6], [21, 12], [20, 18], [19, 24], [21, 30], [26, 34], [32, 37], [39, 38]]
map.line(RIVER, 'river', { width: 2 })

// The road west to east, crossing the Ash at the mill.
map.line([[0, 21], [12, 21], [16, 20], [26, 20], [30, 22], [39, 22]], 'road', { over: g => g !== 'river' })
const [MILL_BRIDGE] = map.cross('bridge')

// The fords: a band of shallows across the river.
const ASH_FORD = [19, 6]
const WILLOW_FORD = [23, 31]
for (const [fx, fy] of [ASH_FORD, WILLOW_FORD]) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (map.get(fx + dx, fy + dy) === 'river' && Math.abs(dy) + Math.abs(dx) <= 2) map.set(fx + dx, fy + dy, 'ford')
  }
}

// Landmarks: where a name sits, on a tile of the right ground.
function at(kind, [x, y]) {
  for (let r = 0; r < 4; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (map.get(x + dx, y + dy) === kind) return label(x + dx, y + dy)
    }
  }
  throw new Error(`ashford: no ${kind} near ${x},${y}`)
}

const CELLS = {
  [at('ford', ASH_FORD)]: {
    terrain: 'ford', landmark: 'Ash Ford', tags: ['ford', 'river_crossing'],
    aliases: ['ash ford', 'the north ford', 'northern ford'],
    description: 'A stony shallow where the Ash runs wide and slow'
  },
  [at('bridge', MILL_BRIDGE)]: {
    terrain: 'bridge', landmark: 'Old Mill Bridge', tags: ['bridge', 'river_crossing', 'road'],
    aliases: ['the mill bridge', 'mill bridge', 'old mill bridge'],
    description: 'A timber bridge by a burnt-out mill, carrying the road over the Ash'
  },
  [at('ford', WILLOW_FORD)]: {
    terrain: 'ford', landmark: 'Willow Ford', tags: ['ford', 'river_crossing'],
    aliases: ['willow ford', 'the south ford', 'southern ford'],
    description: 'A muddy ford among willows, with marsh on both banks'
  },
  [at('hill', [32, 6])]: {
    terrain: 'hill', landmark: 'Beacon Hill', tags: ['hill', 'high_ground'],
    aliases: ['beacon hill', 'the beacon'],
    description: 'A bare hill with an old signal fire, looking over the whole vale'
  },
  [at('hill', [6, 31])]: {
    terrain: 'hill', landmark: 'The Low Downs', tags: ['hill', 'high_ground'],
    aliases: ['low downs', 'the downs'],
    description: 'Gentle downland, open and grazed'
  },
  [at('road', [5, 21])]: {
    terrain: 'road', landmark: 'The Vale Road', tags: ['road'],
    aliases: ['vale road', 'the road'],
    description: 'The old road through the vale'
  }
}

module.exports = {
  name: 'ashford',
  title: 'Ashford Vale',
  width: W,
  height: H,
  cells: CELLS,
  terrain: map.terrain(),
  // Where each side's army forms up when a scenario is fought here.
  deploy: { west: { x: 8, y: 25 }, east: { x: 32, y: 25 } }
}
