// src/data/maps/greywater.js
//
// Greywater: the first 2 km field, 80x80 tiles of 25 m (20x20 squares of
// 100 m). The river Grey winds down the middle from north to south. The Old
// Road crosses it at Elderby, a village about its bridge in the middle of the
// field; Shepherd's Ford in the north and Ladyford in the south are the long
// ways round. West of the river Greyhowe stands in the north-west and the
// Long Down runs north to south in the south-west; east of it Tor Down and
// Windle Ridge answer them. Hanger Wood and Brackenwood lie on either side of
// the road, with copses scattered, Mere Marsh by the river in the north and
// the Sallows in the south.
//
// Drawn half and half: the south half is the north half turned about the
// middle of the field (x, y to 79 - x, 79 - y), tile for tile, so that
// neither army has the better side. A battle of marches: the armies form up a
// long way apart, out of each other's sight, and the village between them is
// the ground to fight for.

const { sketch, label } = require('./draw')

const W = 80
const H = 80
const map = sketch(W, H)

// The twin of a point, turned about the middle of the field.
const twin = ([x, y]) => [W - 1 - x, H - 1 - y]
const both = (draw) => { draw(([x, y]) => [x, y]); draw(twin) }

// High ground first; woods, marsh and water paint over it.
both(t => { const [x, y] = t([16, 14]); map.ellipse(x, y, 7, 5, 'hill') })         // Greyhowe / Tor Down
both(t => { const [x, y] = t([25, 56]); map.ellipse(x, y, 2.5, 8, 'hill') })       // the Long Down / Windle Ridge

// Woods: Hanger Wood and Brackenwood by the road; copses.
both(t => { const [x, y] = t([24, 31]); map.ellipse(x, y, 5, 4, 'forest') })       // Hanger Wood / Brackenwood
both(t => { const [x, y] = t([7, 61]); map.ellipse(x, y, 4, 3, 'forest') })
both(t => { const [x, y] = t([31, 7]); map.ellipse(x, y, 4, 3, 'forest') })
both(t => { const [x, y] = t([33, 63]); map.ellipse(x, y, 3, 4, 'forest') })
both(t => { const [x, y] = t([10, 30]); map.ellipse(x, y, 3, 2, 'forest') })

// Marsh by the river: Mere Marsh in the north (west bank), the Sallows in
// the south (east bank).
both(t => { const [x, y] = t([34, 12]); map.ellipse(x, y, 5, 3, 'marsh') })

// The river Grey, north to south through the middle, two tiles wide. Drawn
// in the north half only (the south half is its twin, below).
const GREY = [[43, 0], [42, 8], [39, 16], [40, 24], [36, 30], [39, 34], [39, 39]]
map.line(GREY, 'river', { width: 2 })
map.line(GREY.map(([x, y]) => [x + 1, y]), 'river', { width: 2 })

// The Old Road comes in from the east and crosses the Grey at Elderby (its
// twin carries it on west); the drove lane runs north from it west of the
// river (its twin south, east of the river).
map.line([[79, 36], [65, 36], [55, 38], [41, 39]], 'road', { over: g => g !== 'river' })
map.line([[32, 39], [24, 36], [20, 30], [18, 22], [21, 12], [21, 0]], 'road', { over: g => g !== 'river' })
// The bridge at Elderby: tiles that span the Grey (with its twin).
map.set(39, 39, 'bridge')
map.set(40, 39, 'bridge')
// Since a ford or bridge takes one unit at a time (docs/DECISIONS.md, "How
// columns, wavering under fire and flight were mended"), Elderby's stone
// bridge is four abreast, not two (rows 38 to 41 with its twin), and the
// village street meets every lane of it from either bank. Two abreast,
// "everyone take Elderby" won 27 battles in 100 (46 before columns); four
// abreast, 45, and the computer against itself is even (51% west).
// (That rule was withdrawn on November 28: units share a tile and pass
// through one another. The bridge is kept as drawn: with it, every kind of
// battle here is even between two computer armies. docs/DECISIONS.md,
// "How sharing a tile and passing through were restored".)
map.set(39, 38, 'bridge')
map.set(40, 38, 'bridge')
for (let x = 41; x <= 44; x++) map.set(x, 38, 'road')
for (let x = 35; x <= 38; x++) map.set(x, 39, 'road')
const ELDERBY_BRIDGE = [40, 39]

// Shepherd's Ford: a band of shallows across the river (Ladyford its twin).
const SHEPHERDS_FORD = [40, 17]
const LADYFORD = twin(SHEPHERDS_FORD)
for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
  const [x, y] = [SHEPHERDS_FORD[0] + dx, SHEPHERDS_FORD[1] + dy]
  if (map.get(x, y) === 'river' && Math.abs(dy) + Math.abs(dx) <= 2) map.set(x, y, 'ford')
}

// The south half is the north half turned about the middle, tile for tile:
// so neither army has the better ground.
for (let y = 0; y < H / 2; y++) for (let x = 0; x < W; x++) map.set(...twin([x, y]), map.get(x, y))

// Landmarks: where a name sits, on a tile of the right ground.
function at(kind, [x, y]) {
  for (let r = 0; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (map.get(x + dx, y + dy) === kind) return label(x + dx, y + dy)
    }
  }
  throw new Error(`greywater: no ${kind} near ${x},${y}`)
}

const CELLS = {
  [at('bridge', ELDERBY_BRIDGE)]: {
    // The village and its bridge go by one name, so that "take Elderby" is
    // found (a place is found by the name of the ground it stands on, and
    // open fields have none).
    terrain: 'bridge', landmark: 'Elderby', tags: ['bridge', 'river_crossing', 'road', 'village'],
    aliases: ['elderby', 'elderby bridge', 'the village', 'the bridge', 'the stone bridge'],
    description: 'A village of thatch and stone either side of an old stone bridge, where the Old Road crosses the Grey'
  },
  [at('ford', SHEPHERDS_FORD)]: {
    terrain: 'ford', landmark: "Shepherd's Ford", tags: ['ford', 'river_crossing'],
    aliases: ["shepherd's ford", 'shepherds ford', 'the north ford', 'northern ford'],
    description: 'A gravel shallow where the flocks are driven over'
  },
  [at('ford', LADYFORD)]: {
    terrain: 'ford', landmark: 'Ladyford', tags: ['ford', 'river_crossing'],
    aliases: ['ladyford', 'lady ford', 'the south ford', 'southern ford'],
    description: 'A wide ford below a ruined chapel, soft at the edges'
  },
  [at('hill', [16, 14])]: {
    terrain: 'hill', landmark: 'Greyhowe', tags: ['hill', 'high_ground'],
    aliases: ['greyhowe', 'the howe'],
    description: 'A broad barrow-topped hill looking over the north-west'
  },
  [at('hill', twin([16, 14]))]: {
    terrain: 'hill', landmark: 'Tor Down', tags: ['hill', 'high_ground'],
    aliases: ['tor down', 'the tor'],
    description: 'A rocky down looking over the south-east'
  },
  [at('hill', [25, 56])]: {
    terrain: 'hill', landmark: 'The Long Down', tags: ['hill', 'high_ground', 'ridge'],
    aliases: ['long down', 'the long down'],
    description: 'A long bare ridge in the south-west, north to south'
  },
  [at('hill', twin([25, 56]))]: {
    terrain: 'hill', landmark: 'Windle Ridge', tags: ['hill', 'high_ground', 'ridge'],
    aliases: ['windle ridge', 'windle'],
    description: 'A long bare ridge in the north-east, north to south'
  },
  [at('forest', [24, 31])]: {
    terrain: 'forest', landmark: 'Hanger Wood', tags: ['woods'],
    aliases: ['hanger wood', 'the hanger'],
    description: 'Beech wood on the slope north of the road'
  },
  [at('forest', twin([24, 31]))]: {
    terrain: 'forest', landmark: 'Brackenwood', tags: ['woods'],
    aliases: ['brackenwood', 'bracken wood'],
    description: 'Oak and bracken south of the road'
  },
  [at('marsh', [34, 12])]: {
    terrain: 'marsh', landmark: 'Mere Marsh', tags: ['marsh'],
    aliases: ['mere marsh', 'the mere'],
    description: 'Reed beds and black water by the river in the north'
  },
  [at('marsh', twin([34, 12]))]: {
    terrain: 'marsh', landmark: 'The Sallows', tags: ['marsh'],
    aliases: ['the sallows', 'sallows'],
    description: 'Willow carr and wet ground by the river in the south'
  },
  [at('road', [5, 43])]: {
    terrain: 'road', landmark: 'The Old Road', tags: ['road'],
    aliases: ['old road', 'the road'],
    description: 'The old road west to east across the field'
  }
}

// Elderby as ground to hold: the open ground of the village and its bridge,
// on both banks (x 35 to 44, y 37 to 42: its own twin, so neither army is
// nearer). Held from on it.
const ELDERBY = []
for (let y = 37; y <= 42; y++) for (let x = 35; x <= 44; x++) if (['plains', 'road', 'bridge'].includes(map.get(x, y))) ELDERBY.push({ x, y })

module.exports = {
  name: 'greywater',
  title: 'Greywater',
  width: W,
  height: H,
  cells: CELLS,
  terrain: map.terrain(),
  // Where each side's army forms up: on the Old Road, 525 m short of
  // Elderby, out of sight of each other (docs/DECISIONS.md, "How the big map
  // was built").
  deploy: { west: { x: 14, y: 41 }, east: { x: 65, y: 38 } },
  // For the battle for Elderby, the east army a tile nearer, at (64, 38):
  // from (65, 38) the computer against itself gave the west 58% (80
  // battles) and 64% (60); from here 44%, and 44, 55 and 50% a tile north,
  // south and further west (60 each). docs/DECISIONS.md, "How the kinds of
  // battle were built", round two.
  // Since units pass through one another (November 28), the west a tile
  // back, at (13, 41), and the east two tiles back, at (66, 38): from (14,
  // 41) and (64, 38) the west won 42% (800 battles, the sides named both
  // ways); from here 49%, and 41 to 53% a tile either way but one: the
  // east a tile south, at (66, 39), 59%. docs/DECISIONS.md, "How sharing a tile and passing through were restored".
  deployFor: { ground: { west: { x: 13, y: 41 }, east: { x: 66, y: 38 } } },
  ground: [{ name: 'Elderby', tiles: ELDERBY }],
  // The kinds of battle fought here, the first offered first at the muster
  // (docs/DECISIONS.md, "How the kinds of battle were built").
  // The battle of camps too: armies start far apart, out of each other's
  // sight, with room to pitch a camp behind each.
  kinds: ['pitched', 'ground', 'camps'],
  // Each army is called out in two lines here: its own, and its faction's
  // usual army again, raised for the day (src/engine/army/secondLine.js).
  // About eight units a side, where a 1 km field has four or five.
  lines: 2
}
