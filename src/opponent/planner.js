// src/opponent/planner.js
//
// The computer's side thinks. Each player turn it looks at what its side
// knows and gives its units orders, the same orders a Commander can give.
// It replaces "every unit marches at the nearest enemy" (the standing order
// to advance), which is still there underneath for a unit left with nothing
// to do.
//
// What it is held to:
//   - It knows only what its side knows: its own units, and the enemy as
//     its side has seen them (sideView's intel: in sight, or last seen).
//   - It decides nothing about outcomes. It gives orders; the engine does
//     the rest.
//   - It is a pure function of the game. The same game gives the same
//     orders, and no AI model is asked anything. Its temperament is drawn
//     from the battle's seed, so two battles on one field can differ.
//
// What it does:
//   posture   Hold good ground (an objective, a crossing, a hill ahead of
//             where it formed up) and let the enemy come, or go and find
//             him. A side that holds loses patience in the end and attacks.
//   the line  Foot abreast, a tile apart; archers behind them; horse on a
//             flank.
//   the fight When the enemy is close the foot go in together, the archers
//             stand off and shoot, and the horse go for the enemy's archers
//             if it has seen any.
//   judgment  A unit near breaking is pulled out of the fight if a steadier
//             one is beside it to cover.

const { sideView } = require('../engine/orchestrator')
const { tileDistance } = require('../engine/world')
const { detectFeatures } = require('../engine/map/features')
const { missileRange } = require('../engine/combat/ranged')
const { canSkirmish } = require('../engine/battle/skirmish')
const { createRng } = require('../engine/rng')
const { positionKey } = require('../engine/map/labels')

const TUNING = {
  // How near (tiles) an enemy in sight must be for the line to go in.
  ENGAGE: 7,
  // A strongpoint is looked for this far ahead of where the army formed up,
  // and this far to either side.
  AHEAD: [2, 16],
  ASIDE: 9,
  // The chance (by the battle's seed) a side with a strongpoint holds it
  // rather than going straight for the enemy. Holding good ground is the
  // stronger play against an enemy who comes on (see docs/DECISIONS.md), so
  // it is the commoner; not always, or every battle would open the same.
  HOLDS: 0.65,
  // Minutes of battle a holding side waits before it goes to find the
  // enemy: this, plus up to PATIENCE_MORE by the seed.
  PATIENCE: 90,
  PATIENCE_MORE: 90,
  // How far short of the enemy (tiles) the line forms before going in.
  FORM_UP: 5,
  // At or under this morale a unit in a fight is pulled out, if covered.
  PULL_OUT: 30
}

// ── The computer's Commander: his character ─────────────
// Every Commander has the same quality and they differ in personality
// (ruled October 21, 2026); the enemy's first, "a cautious one, a rash
// one" (docs/REVIEW-2026-11.md). A character is not a better or a worse
// planner: it is this one planner with some of its numbers set another way.
// The words are the officers' natures (bold, steady, cautious:
// engine/command/officers.js), so the game has one word for each.
// "steady" is the planner as it was before characters, number for number:
// a battle that names none is played by him.
// Measured with harness/character-league.js (docs/DECISIONS.md, "How the
// computer's Commanders were given character", has the tables and what was
// tried and dropped). Points below are a character's share against the
// steady one with only that number changed, 160 battles each.
const CHARACTERS = {
  steady: {
    // How near (tiles) an enemy in sight must be for the line to go in, and
    // the morale at which a unit in a fight is pulled out: as TUNING above.
    engage: TUNING.ENGAGE,
    pullOut: TUNING.PULL_OUT,
    // Tiles within which the horse ride at an enemy they have seen.
    prey: 10,
    // What the horse ride at: enemy missile troops on foot ('archers'), or
    // any enemy ('any').
    horseAt: 'archers',
    // Whether the horse are kept back off the line's flank, as a reserve,
    // until the line is fighting.
    horseInReserve: false
  },
  // Throws his horse at whatever he sees, goes in from further off, and
  // fights on with men near breaking. His battles are the shortest.
  bold: {
    engage: 9,
    pullOut: 20,         // fights on (alone: 46% against steady)
    prey: 14,
    horseAt: 'any',      // (alone: 47%, and his battles 20 minutes shorter)
    horseInReserve: false
  },
  // Keeps his horse back until his line is fighting, lets the enemy come
  // closer before going in, and pulls men out of the fight early. His
  // battles are the longest, and the likeliest to be decided by the
  // ground or ended by night.
  cautious: {
    engage: 5,
    pullOut: 40,         // pulls out early (alone, 45: 53% against steady; with the rest, 45 made him 54% against the field)
    prey: 0,             // his horse do not go hunting...
    horseAt: 'archers',
    horseInReserve: true // ...but wait (with prey 0, alone: 46%; a battle in twelve ends at night)
  }
}
// (Where a side waits on good ground, and for how long, is left to the
// seed for all three, as TUNING has it: with no ground to fight for,
// waiting is the stronger play, and a cautious Commander who always waited
// won 67% against the others, a bold one who seldom did 34%.)
const CHARACTER_NAMES = Object.keys(CHARACTERS)

// Ground a formed line does not stand on.
const NOT_HERE = ['river', 'marsh', 'ford', 'bridge']

const FORWARD = { west: { x: -1, y: 0 }, east: { x: 1, y: 0 }, north: { x: 0, y: -1 }, south: { x: 0, y: 1 } }
const add = (p, v, k = 1) => ({ x: p.x + v.x * k, y: p.y + v.y * k })
const dot = (p, v) => p.x * v.x + p.y * v.y
const centroid = (points) => ({
  x: Math.round(points.reduce((s, p) => s + p.x, 0) / points.length),
  y: Math.round(points.reduce((s, p) => s + p.y, 0) / points.length)
})

/**
 * The orders the computer's side gives this turn.
 *
 * @param {Object} game  an orchestrator game
 * @param {string} side  the side to plan for
 * @returns {Array} engine orders: [{ unitRef, action, target?, then? }]
 */
function planTurn(game, side) {
  const battle = game.battle
  const map = battle.map
  const mine = battle.world.units.filter(u => u.side === side && u.strength > 0 && !battle.broken.has(u.id))
  if (mine.length === 0) return []

  const temper = temperament(game, side)
  const ch = characterOf(game, side)
  const view = sideView(game, side)
  const kindOf = (id) => battle.world.units.find(u => u.id === id) ?? battle.fledUnits.find(u => u.id === id)
  const enemies = view.intel
    .filter(e => e.strength > 0)
    .map(e => ({ ...e, unit: kindOf(e.id) }))
  const inSight = enemies.filter(e => e.status === 'visible')

  const theirEdge = Object.entries(game.spec.sides ?? {}).find(([s]) => s !== side)?.[1]?.homeEdge ?? 'east'
  const forward = FORWARD[theirEdge] ?? FORWARD.east
  const across = { x: -forward.y, y: forward.x }
  const here = centroid(mine.map(u => u.position))
  const morale = (unit) => battle.resolver.getState(unit.id)?.morale ?? 100
  const fighting = new Set([...battle.previousEngagementKeys].flatMap(k => k.split('|')))
  const nearestSeen = (from) => inSight
    .map(e => ({ e, d: tileDistance(from, e.position) }))
    .sort((a, b) => a.d - b.d || a.e.id.localeCompare(b.e.id))[0] ?? null

  // ── Who does what ───────────────────────────────────
  const archers = mine.filter(u => missileRange(u) > 0 && !u.mounted)
  const horse = mine.filter(u => u.mounted)
  // (A reserve held behind the line was tried and dropped: over 384 battles
  // against an enemy who simply came on, the side that kept its best unit
  // back lost more often than the side that put it in the line.)
  const line = mine.filter(u => !archers.includes(u) && !horse.includes(u))

  // ── Hold, or go and find him ────────────────────────
  const strong = strongpoint(game, side, forward, across)
  const closeBy = inSight.some(e => mine.some(u => tileDistance(u.position, e.position) <= ch.engage))
  const everFought = battle.log.ofType('contact').length > 0
  const patient = game.minutesElapsed < temper.patience
  // The enemy on the ground we meant to hold: nothing left to hold. On the
  // battle's ground to fight for, an enemy seen holding or contesting it is
  // gone for at once: he is not left to take the field.
  const taken = strong && (strong.objective
    ? inSight.some(e => onTheGround(game, e.position))
    : inSight.some(e => tileDistance(e.position, strong.anchor) <= 1) && !mine.some(u => tileDistance(u.position, strong.anchor) <= 2))
  const holding = Boolean(strong) && !taken && (strong.objective || (temper.holds && patient && !everFought))

  // ── Where the line stands ───────────────────────────
  let anchor
  if (holding) {
    anchor = strong.anchor
  } else {
    // Where he is: the enemy in sight, else where this side's units last
    // saw him (the battle's own memory, which forgets a place once someone
    // has stood there and found it empty; the same thing "advance" goes by).
    const remembered = [...(battle.lastSeen.get(side) ?? new Map()).values()]
    const known = inSight.length > 0 ? inSight.map(e => e.position) : remembered
    if (known.length > 0) {
      // Form up short of him; if he is already close, where we are.
      const target = centroid(known)
      const gap = dot({ x: target.x - here.x, y: target.y - here.y }, forward)
      anchor = closeBy ? here : add(target, forward, -Math.min(TUNING.FORM_UP, Math.max(0, gap)))
    } else {
      // No one knows where he is: the engine's "advance" goes and looks.
      anchor = null
    }
  }

  const orders = []
  const give = (unit, order) => orders.push({ unitRef: unit.id, ...order })
  const slots = anchor ? formation(map, anchor, forward, across, { line, archers, horse }, temper.flank) : new Map()
  const toSlot = (unit, holdThere) => {
    const slot = slots.get(unit.id)
    if (!slot) return give(unit, { action: 'advance' })
    // A unit in a fight is not marched about: that costs it men.
    if (fighting.has(unit.id)) return
    if (tileDistance(unit.position, slot) === 0) return give(unit, { action: 'hold' })
    give(unit, { action: holdThere ? 'defend' : 'move', target: slot })
  }

  // ── A unit near breaking is pulled out, if someone covers it ────────
  const pulledOut = new Set()
  for (const unit of mine) {
    if (!fighting.has(unit.id) || morale(unit) > ch.pullOut || battle.isShaken(unit)) continue
    const covered = mine.some(o => o !== unit && !battle.isShaken(o) && morale(o) > ch.pullOut && tileDistance(o.position, unit.position) <= 2)
    if (!covered) continue
    pulledOut.add(unit.id)
    give(unit, { action: 'withdraw', target: standable(map, add(unit.position, forward, -4), new Set()) ?? undefined })
  }
  // One that was pulled out before, and is no steadier, stays out, as long
  // as there is a steadier unit to fight in its place. When there is none,
  // the worn fight on: an army does not stand and watch.
  const fit = (unit) => !battle.isShaken(unit) && morale(unit) > ch.pullOut
  const anyFit = mine.some(fit)
  const spent = (unit) => anyFit && !fighting.has(unit.id) && morale(unit) <= ch.pullOut

  // ── The fight ───────────────────────────────────────
  // Formed up short of where the enemy was, and no fight yet: go in. (A
  // line that formed up and then waited for an enemy it could no longer
  // see waited for ever.)
  const formed = anchor !== null && mine.every(u => {
    const slot = slots.get(u.id)
    // (Units out of it, spent or shaken, stay where they are and are not
    // waited for.)
    return !slot || fighting.has(u.id) || spent(u) || battle.isShaken(u) || tileDistance(u.position, slot) <= 1
  })
  const attacking = !holding && (closeBy || !anchor || formed)

  for (const unit of mine) {
    if (pulledOut.has(unit.id)) continue
    if (spent(unit) || battle.isShaken(unit)) { give(unit, { action: 'hold' }); continue }
    // Missile troops on foot with the enemy near press him, whatever the
    // line does: pressing, they close to shooting distance and stand there
    // shooting (fire and retreat, engine/battle/skirmish.js). Sent to a
    // place, they walk into him. Measured (docs/design/army-balance.md,
    // part 7): without it heavy infantry won 65% against the other classic
    // armies, with it 64%, and slingers beat it 42% rather than 33%. Horse
    // archers keep to the horse's way below (pressing too, they won 41%
    // rather than 37%, but twice the battles they were in ran to the day's
    // end).
    if (canSkirmish(unit) && !unit.mounted && !fighting.has(unit.id)) {
      const foe = nearestSeen(unit.position)
      if (foe && foe.d <= ch.engage) { give(unit, { action: 'advance' }); continue }
    }

    if (horse.includes(unit)) {
      // Horse go for archers they have seen (a bold Commander's for any
      // enemy), wherever the line stands; else they fight with the line, or
      // keep its flank (a cautious Commander's until his line is fighting).
      const prey = inSight
        .filter(e => e.unit && (ch.horseAt === 'any' || (missileRange(e.unit) > 0 && !e.unit.mounted)))
        .map(e => ({ e, d: tileDistance(unit.position, e.position) }))
        .sort((a, b) => a.d - b.d || a.e.id.localeCompare(b.e.id))[0]
      // (Not with no line fit to fight, or none at all: the horse are all
      // there is.)
      const inReserve = ch.horseInReserve && line.some(fit) && !lineFighting(line, fighting)
      if (prey && prey.d <= ch.prey && !fighting.has(unit.id)) give(unit, { action: 'attack', target: { ...prey.e.position } })
      else if ((attacking && !inReserve) || (holding && lineFighting(line, fighting))) give(unit, { action: 'advance' })
      else toSlot(unit, holding)
      continue
    }
    if (attacking) { give(unit, { action: 'advance' }); continue }
    // Holding good ground: the line stands, the archers shoot from behind
    // it (they do that unasked), and a unit attacked fights where it is.
    // A holding line whose enemy has come within reach of one of its units
    // does not sit and watch that unit fight alone.
    if (holding && line.includes(unit) && !fighting.has(unit.id) && lineFighting(line, fighting)) {
      const foe = nearestSeen(unit.position)
      if (foe && foe.d <= 3) { give(unit, { action: 'advance' }); continue }
    }
    toSlot(unit, holding)
  }
  return orders
}

const lineFighting = (line, fighting) => line.some(u => fighting.has(u.id))

// ── Character ───────────────────────────────────────────
// The character of a side's Commander, from the battle's spec
// (spec.sides[side].character, set at the muster from the seed: see
// opponent/commander.js); a side that names none, or one not known, is
// played steady, as before characters.
function characterOf(game, side) {
  return CHARACTERS[game.spec?.sides?.[side]?.character] ?? CHARACTERS.steady
}

// ── Temperament ─────────────────────────────────────────
// Drawn once from the battle's seed and the side, so it is the same every
// turn of a battle and differs from battle to battle.
function temperament(game, side) {
  let h = Math.imul(game.seed ?? 1, 2246822519) >>> 0
  for (const ch of side) h = Math.imul(h ^ ch.charCodeAt(0), 3266489917) >>> 0
  const random = createRng(h || 1)
  return {
    holds: random() < TUNING.HOLDS,
    patience: TUNING.PATIENCE + Math.floor(random() * TUNING.PATIENCE_MORE / 10) * 10,
    flank: random() < 0.5 ? 1 : -1
  }
}

// ── Good ground ─────────────────────────────────────────
// An objective, if the battle has any (they win it). Otherwise a crossing
// or a hill ahead of where the army formed up: near enough to reach first,
// and not far off to a side.
function strongpoint(game, side, forward, across) {
  const map = game.battle.map
  const started = centroid(game.spec.units.filter(u => u.side === side).map(u => toXY(u.position)))

  if (game.objectives?.length) {
    const tiles = game.objectives.flatMap(o => o.tiles ?? (o.coord ? [o.coord] : []))
    if (tiles.length > 0) {
      // Ground a line cannot form on (a bridge, a ford) is held from its
      // near end: the line stands back from it, a tile at a time.
      let anchor = centroid(tiles)
      for (let back = 1; back <= 3 && NOT_HERE.includes(map.terrainAt(anchor)); back++) anchor = add(centroid(tiles), forward, -back)
      return { anchor, objective: true, kind: 'objective' }
    }
  }

  const candidates = detectFeatures(map)
    .filter(f => ['ford', 'bridge', 'hill'].includes(f.kind))
    .map(f => {
      const offset = { x: f.centre.x - started.x, y: f.centre.y - started.y }
      return { feature: f, ahead: dot(offset, forward), aside: Math.abs(dot(offset, across)) }
    })
    .filter(c => c.ahead >= TUNING.AHEAD[0] && c.ahead <= TUNING.AHEAD[1] && c.aside <= TUNING.ASIDE)
    .sort((a, b) => (a.ahead + a.aside) - (b.ahead + b.aside) || String(a.feature.id).localeCompare(String(b.feature.id)))
  const best = candidates[0]
  if (!best) return null
  // A crossing is held from its near bank; a hill from its top.
  const anchor = best.feature.kind === 'hill' ? best.feature.centre : add(best.feature.centre, forward, -2)
  return { anchor: standable(map, anchor, new Set()) ?? best.feature.centre, objective: false, kind: best.feature.kind }
}

// A place on, or near enough to hold or contest, the battle's ground to
// fight for (as engine/orchestrator/victory.js counts it).
const onTheGround = (game, position) => game.objectives.some(o => {
  const tiles = o.tiles ?? [o.coord]
  const reach = o.reach ?? (o.single === false ? 0 : 1)
  return tiles.some(t => tileDistance(position, t) <= reach)
})

const toXY = (position) => (typeof position === 'string' ? require('../engine/map/labels').fromLabel(position) : position)

// ── The line ────────────────────────────────────────────
// Each unit's place about an anchor: foot abreast across the way the army
// faces (the best in the middle), archers two tiles behind them, horse off
// one flank. Every place is ground a unit can form on, and no two units
// share one.
function formation(map, anchor, forward, across, { line, archers, horse }, flankSide) {
  const taken = new Set()
  const slots = new Map()
  const place = (unit, wanted) => {
    const tile = standable(map, wanted, taken)
    if (!tile) return
    taken.add(positionKey(tile))
    slots.set(unit.id, tile)
  }
  const spread = (i) => (i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2))
  const byId = (a, b) => a.id.localeCompare(b.id)

  const best = (unit) => (unit.quality === 'elite' ? 0 : 1)
  ;[...line].sort((a, b) => best(a) - best(b) || byId(a, b)).forEach((unit, i) => place(unit, add(anchor, across, spread(i))))
  ;[...archers].sort(byId).forEach((unit, i) => place(unit, add(add(anchor, forward, -2), across, spread(i))))
  const wing = Math.ceil(line.length / 2) + 2
  ;[...horse].sort(byId).forEach((unit, i) => place(unit, add(add(anchor, across, flankSide * (wing + i)), forward, -1)))
  return slots
}

// The nearest tile to a wanted one that a unit can form up on and no one
// has been given.
function standable(map, wanted, taken) {
  for (let r = 0; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const p = { x: wanted.x + dx, y: wanted.y + dy }
        if (!map.inBounds(p) || !map.passable(p) || NOT_HERE.includes(map.terrainAt(p))) continue
        if (!taken.has(positionKey(p))) return p
      }
    }
  }
  return null
}

module.exports = { planTurn, temperament, strongpoint, formation, characterOf, TUNING, CHARACTERS, CHARACTER_NAMES }
