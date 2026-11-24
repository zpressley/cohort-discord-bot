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
const { arrivalOf } = require('../engine/orchestrator/word')
const { objectiveArea } = require('../engine/orchestrator/victory')
const { findPath } = require('../engine/movement/pathfinding')
const { groundOf } = require('../data/maps')

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
  PULL_OUT: 30,
  // Minutes for which the place named in an order on a caught enemy rider
  // is taken as where the enemy is going (forewarned, below): an hour, the
  // longest most orders take to carry out. Claude's guess, not measured
  // apart (docs/DECISIONS.md, "How the enemy catching a rider was built").
  FOREWARNED: 60,
  // Coming to grips (docs/DECISIONS.md, "How armies were made to come to
  // grips"; measured with harness/no-fight.js). With no enemy known, a side
  // goes first to the map's ground worth fighting for, if it lies between
  // the armies, and waits there MEET_WAIT minutes (times its Commander's
  // nerve, CHARACTERS) for the enemy to come; then to the good ground the
  // enemy would hold; then it searches. A place is reached when one of its
  // units stands within MEET_REACH tiles of it. Two armies that each
  // searched the other's side of the field marched past each other out of
  // sight (ashford, Persia against Sparta, seed 111: no blow struck in
  // twelve hours). Half an hour: Claude's guess. Tried: waiting until any
  // holding enemy's patience must have run out (up to three hours and
  // more); against a player who never came out, the computer then sat
  // there, and 37 of 1,140 such battles ended in night with no blow.
  MEET_REACH: 3,
  MEET_WAIT: 30,
  // A unit going in at an enemy this near (tiles) across a ford or bridge
  // steps straight into the crossing: going round by the bank first, a
  // crowded unit had no march left for the water, and two such units
  // paced up and down either bank for ever (ashford, Rome against Han,
  // seeds 1 and 2).
  CROSSING_NEAR: 3
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
    horseInReserve: false,
    // How long he waits where the enemy should come before he goes to find
    // him, as a share of TUNING.MEET_WAIT.
    nerve: 1
  },
  // Throws his horse at whatever he sees, goes in from further off, and
  // fights on with men near breaking. His battles are the shortest.
  bold: {
    engage: 9,
    pullOut: 20,         // fights on (alone: 46% against steady)
    prey: 14,
    horseAt: 'any',      // (alone: 47%, and his battles 20 minutes shorter)
    horseInReserve: false,
    nerve: 0.5           // goes to find the enemy sooner
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
    horseInReserve: true, // ...but wait (with prey 0, alone: 46%; a battle in twelve ends at night)
    nerve: 1.5           // and waits longer for the enemy to come
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
  // An army with no foot to form a line forms its line of what it has:
  // horse, else missile troops. (An army all of horse put them off the
  // flank of a line that was not there, beside the ground it meant to hold
  // and never on it: ravenridge, Mongolia against a player who gave no
  // orders, seed 181, night with no blow struck.)
  const front = line.length > 0 ? line : horse.length > 0 ? horse : archers

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
  // Waiting where the enemy should come (meetingPlace, below).
  let waiting = false
  if (holding) {
    anchor = strong.anchor
  } else {
    // Where he is: the enemy in sight, else where this side's units last
    // saw him (the battle's own memory, which forgets a place once someone
    // has stood there and found it empty; the same thing "advance" goes by).
    // And where an enemy rider this side caught said his men were sent
    // (forewarned, below): a place the enemy is going.
    const remembered = [...(battle.lastSeen.get(side) ?? new Map()).values(), ...forewarned(game, side)]
    const known = inSight.length > 0 ? inSight.map(e => e.position) : remembered
    if (known.length > 0) {
      // Form up short of him; if he is already close, where we are.
      const target = centroid(known)
      const gap = dot({ x: target.x - here.x, y: target.y - here.y }, forward)
      anchor = closeBy ? here : add(target, forward, -Math.min(TUNING.FORM_UP, Math.max(0, gap)))
    } else {
      // No one knows where he is: go where he should come, and wait there
      // a while (meetingPlace); then the engine's "advance" goes and looks.
      const meet = lookFor(game, side, forward, across, ch)
      anchor = meet?.anchor ?? null
      waiting = Boolean(meet?.wait)
    }
  }

  const orders = []
  const give = (unit, order) => orders.push({ unitRef: unit.id, ...order })
  const slots = anchor ? formation(map, anchor, forward, across, {
    line: front, archers: front === archers ? [] : archers, horse: front === horse ? [] : horse
  }, temper.flank) : new Map()
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
    // waited for. Nor is a unit already past its place towards the enemy:
    // a line that had gone in was called back to form up again short of
    // him, went in, and was called back, for ever, while horse archers
    // kept out of its reach at the field's edge: crownhill, Sarmatia
    // against Macedon, seed 3643740 of the captive league.)
    return !slot || fighting.has(u.id) || spent(u) || battle.isShaken(u) || tileDistance(u.position, slot) <= 1 ||
      dot({ x: u.position.x - slot.x, y: u.position.y - slot.y }, forward) > 0
  })
  const attacking = !holding && !waiting && (closeBy || !anchor || formed)
  // Going in: pressing the enemy, or, with one near across a crossing,
  // stepping into it (TUNING.CROSSING_NEAR).
  const goIn = (unit) => {
    const step = intoTheCrossing(map, unit, nearestSeen(unit.position))
    give(unit, step ? { action: 'move', target: step } : { action: 'advance' })
  }

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
      // (Within 7 tiles, as part 7 has it, for a cautious Commander too:
      // his engage of 5 is short of a crossbow's reach, and his crossbowmen
      // marched to and fro short of the enemy for ever. Part 9.)
      if (foe && foe.d <= Math.max(ch.engage, TUNING.ENGAGE)) { give(unit, { action: 'advance' }); continue }
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
      else if ((attacking && !inReserve) || (holding && lineFighting(line, fighting))) goIn(unit)
      else toSlot(unit, holding || waiting)
      continue
    }
    if (attacking) { goIn(unit); continue }
    // Holding good ground: the line stands, the archers shoot from behind
    // it (they do that unasked), and a unit attacked fights where it is.
    // A holding line whose enemy has come within reach of one of its units
    // does not sit and watch that unit fight alone.
    if (holding && line.includes(unit) && !fighting.has(unit.id) && lineFighting(line, fighting)) {
      const foe = nearestSeen(unit.position)
      if (foe && foe.d <= 3) { goIn(unit); continue }
    }
    toSlot(unit, holding || waiting)
  }
  return orders
}

const lineFighting = (line, fighting) => line.some(u => fighting.has(u.id))

// ── Coming to grips ─────────────────────────────────────
// Where a side that knows nothing of the enemy goes to look for him, before
// the engine's search (which looks over the field nearest first, and let two
// armies each searching the other's side pass by out of sight). In turn:
//   1. the map's ground worth fighting for (src/data/maps, ground), which
//      both sides know and the enemy's way likeliest crosses, if it lies
//      between the armies (meetingPlace); it waits there a while;
//   2. the good ground the enemy would hold if he held (theirGround): the
//      crossing or hill this planner would choose from his side of the
//      field, opposite our own.
// A place is looked at once one of the side's units has stood within
// TUNING.MEET_REACH tiles of it (read from its units' moves in the log, so
// the planner stays a pure function of the game). { anchor, wait }, or
// null when both have been looked at: the engine's "advance" searches.
function lookFor(game, side, forward, across, ch) {
  const meet = meetingPlace(game, side, forward, across, ch)
  if (meet) return meet
  const theirs = theirGround(game, side, forward, across)
  if (!theirs || arrivedAt(game, side, theirs) !== null) return null
  return { anchor: theirs, wait: false }
}

// The turn a unit of this side first stood within TUNING.MEET_REACH tiles
// of a place (0 if one formed up there), or null.
function arrivedAt(game, side, place) {
  const battle = game.battle
  const there = (p) => tileDistance(p, place) <= TUNING.MEET_REACH
  if (game.spec.units.some(u => u.side === side && there(toXY(u.position)))) return 0
  const ids = new Set([...battle.world.units, ...battle.fledUnits].filter(u => u.side === side).map(u => u.id))
  return battle.log.ofType('move').find(e => ids.has(e.unitId) && there(e.to))?.turn ?? null
}

// The map's ground worth fighting for, held from dry ground on this side of
// it, if it lies between the armies (not more than TUNING.ASIDE tiles to a
// side of where this one formed up: the Crownhill, at the north edge of its
// field, drew armies away from each other, and a player who stood his
// ground was not found until night). { anchor, wait }: march there (wait
// false); once there, wait TUNING.MEET_WAIT minutes (times the Commander's
// nerve) for the enemy to come. Null after that, or with no such ground.
function meetingPlace(game, side, forward, across, ch) {
  const battle = game.battle
  const map = battle.map
  let tiles = []
  try { tiles = groundOf(map.name).flatMap(o => objectiveArea(map, o).tiles) } catch { tiles = [] }
  if (tiles.length === 0) return null
  let anchor = centroid(tiles)
  for (let back = 1; back <= 3 && NOT_HERE.includes(map.terrainAt(anchor)); back++) anchor = add(centroid(tiles), forward, -back)
  anchor = standable(map, anchor, new Set()) ?? anchor
  const started = centroid(game.spec.units.filter(u => u.side === side).map(u => toXY(u.position)))
  if (Math.abs(dot({ x: anchor.x - started.x, y: anchor.y - started.y }, across)) > TUNING.ASIDE) return null
  const arrived = arrivedAt(game, side, anchor)
  if (arrived === null) return { anchor, wait: false }
  return game.minutesElapsed < arrived * 10 + TUNING.MEET_WAIT * (ch.nerve ?? 1) ? { anchor, wait: true } : null
}

// The good ground the enemy would hold: strongpoint() from his side of the
// field, where an army forms up opposite this one (the field's forming-up
// places face each other across it: this side's start mirrored across the
// middle of the field). Map and forming-up places are known to both
// Commanders; where he truly stands is not read. Null if there is none.
function theirGround(game, side, forward, across) {
  const map = game.battle.map
  const started = centroid(game.spec.units.filter(u => u.side === side).map(u => toXY(u.position)))
  const mirrored = forward.x !== 0
    ? { x: map.width - 1 - started.x, y: started.y }
    : { x: started.x, y: map.height - 1 - started.y }
  const theirs = strongpoint(game, side, { x: -forward.x, y: -forward.y }, across, mirrored)
  return theirs?.anchor ?? null
}

// Ground a unit crosses water by.
const CROSSINGS = ['ford', 'bridge']

// A unit going in at an enemy within TUNING.CROSSING_NEAR tiles, whose way
// to him lies over a ford or bridge, steps into the crossing beside it
// (the tile of it nearest him), rather than along the bank first: a unit
// can always make one tile of ground (movement/simultaneous.js), so it
// gets into the water. Null otherwise: it presses him as before.
function intoTheCrossing(map, unit, foe) {
  if (!foe || foe.d < 2 || foe.d > TUNING.CROSSING_NEAR) return null
  const path = findPath(map, unit.position, foe.e.position)
  if (!path || !path.slice(1).some(t => CROSSINGS.includes(map.terrainAt(t)))) return null
  return map.neighbors(unit.position)
    .filter(t => CROSSINGS.includes(map.terrainAt(t)) && map.passable(t) && tileDistance(t, foe.e.position) < foe.d)
    .sort((a, b) => tileDistance(a, foe.e.position) - tileDistance(b, foe.e.position) || a.y - b.y || a.x - b.x)[0] ?? null
}

// ── An enemy rider caught ───────────────────────────────
// The places named in the orders of enemy riders this side caught in the
// last TUNING.FOREWARNED minutes (engine/command/messengers.js,
// ridersTaken), once word of it has reached its Commander, if it has one
// on the field: where the enemy is going. The simplest fair use of what
// the order gives away: he knows what the order said, no more. An order
// with no place in it (hold, advance on the enemy) tells it nothing here.
function forewarned(game, side) {
  const battle = game.battle
  const since = battle.turn - TUNING.FOREWARNED / 10
  return battle.log.ofType('riderTaken')
    .filter(e => e.side === side && e.turn > since && e.order?.target)
    .filter(e => !game.word?.[side] || arrivalOf(game, side, e) <= battle.turn)
    .map(e => ({ ...e.order.target }))
}

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
function strongpoint(game, side, forward, across, from = null) {
  const map = game.battle.map
  const started = from ?? centroid(game.spec.units.filter(u => u.side === side).map(u => toXY(u.position)))

  if (!from && game.objectives?.length) {
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

module.exports = { planTurn, temperament, strongpoint, formation, characterOf, forewarned, lookFor, meetingPlace, theirGround, intoTheCrossing, TUNING, CHARACTERS, CHARACTER_NAMES }
