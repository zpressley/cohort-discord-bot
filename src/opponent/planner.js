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
const { groundOf, MAPS } = require('../data/maps')

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
  // Shared out among several grounds (splitGround), the whole army goes in
  // together when a part of it is outnumbered by the enemy it sees close
  // by: by more men than this many times its own (1: any more). At 0.9 two
  // computer armies on Crownhill's fords gave the west 62% (120 battles)
  // and the fords decided a fifth as many battles; at 1, 49%, and "everyone
  // advance" alone won 65 to 70% against it (40 battles, three runs).
  // docs/DECISIONS.md, "How the kinds of battle were built", round two.
  OUTNUMBERED: 1
  // (CROSSING_NEAR, 3, moved to the engine: tables.CROSSING.NEAR.)
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
    nerve: 1,
    // Some of several grounds to hold (splitGround): he goes for one the
    // enemy holds only when the enemy holds as many as he needs ('clock'),
    // or whenever he holds any ('any'); and he takes them all at once, or
    // one at a time with the whole army (oneAtATime).
    contest: 'clock',
    oneAtATime: false,
    // A camp battle's (campPlan, below): tiles ahead of where the army
    // formed up that he pitches his camp (behind, if less than 0); how
    // many units he leaves to guard it; and the odds (his men to the
    // enemy's he knows of) at which he sends men for the enemy's camp once
    // it is found, and whether foot go when he has no horse.
    campAhead: 4,
    campGuard: 1,
    campOdds: 1,
    raidWithFoot: false
  },
  // Throws his horse at whatever he sees, goes in from further off, and
  // fights on with men near breaking. His battles are the shortest.
  bold: {
    engage: 9,
    pullOut: 20,         // fights on (alone: 46% against steady)
    prey: 14,
    horseAt: 'any',      // (alone: 47%, and his battles 20 minutes shorter)
    horseInReserve: false,
    nerve: 0.5,          // goes to find the enemy sooner
    contest: 'any',      // goes for the ground the enemy holds
    oneAtATime: false,
    campAhead: 12,       // pitches forward, near the fight
    campGuard: 1,        // guards it as the steady one does (0: 64% against him, the guard a man short in the line)
    campOdds: 0.8,       // and goes for the enemy's camp at worse odds
    raidWithFoot: true
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
    nerve: 1.5,          // and waits longer for the enemy to come
    contest: 'clock',
    oneAtATime: true,     // takes the grounds one at a time, the army together
    campAhead: -4,       // pitches behind where he formed up
    campGuard: 1,        // (2 guards: 30% against steady; 1: 47%)
    campOdds: 1.3,       // and risks men for the enemy's only at good odds
    raidWithFoot: false
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
  const all = battle.world.units.filter(u => u.side === side && u.strength > 0 && !battle.broken.has(u.id))
  if (all.length === 0) return []

  const temper = temperament(game, side)
  const ch = characterOf(game, side)
  const view = sideView(game, side)
  // A camp battle's: the units at the camp's work (carrying it, guarding
  // it, going for the enemy's) are given their orders here, and the rest
  // fight as before (campPlan). With no camps, none.
  const camp = view.camps ? campPlan(game, side, all, view, ch) : null
  const mine = camp ? all.filter(u => !camp.busy.has(u.id)) : all
  if (mine.length === 0) return camp?.orders ?? []
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
  // Some of several grounds to hold (spec.objectivesNeeded): the army is
  // split among those it goes for, each part to its own (splitGround).
  const split = splitGround(game, side, forward, across, ch, { line: [...front, ...(front === archers ? [] : archers), ...(front === horse ? [] : horse)], archers: [], horse: [] },
    (unit) => !battle.isShaken(unit) && (battle.resolver.getState(unit.id)?.morale ?? 100) > ch.pullOut)
  const holding = Boolean(split) || (Boolean(strong) && !taken && (strong.objective || (temper.holds && patient && !everFought)))

  // ── Where the line stands ───────────────────────────
  let anchor
  // Waiting where the enemy should come (meetingPlace, below).
  let waiting = false
  if (split) {
    anchor = split.targets[0].anchor
  } else if (holding) {
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
  const slots = split ? split.slots : anchor ? formation(map, anchor, forward, across, {
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
  // (A steadier unit that will close with the enemy: not one that only
  // shoots. Left standing behind slingers or horse archers alone, the worn
  // watched them search the whole field for days, or whittle the enemy at
  // a distance for more: the soak, Crownhill, Kush against Berbers and
  // against Sarmatia, seed 5, once units passed through one another,
  // November 28.)
  const anyFit = mine.some(u => fit(u) && !(missileRange(u) > 0))
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
  // Shared out among several grounds, with a part of it outnumbered by the
  // enemy it sees close by: the whole army goes in, at the nearest enemy it
  // sees, and shares itself out again once none is near. (Split two ways,
  // it was beaten in detail by a player who only sent everyone forward: on
  // Crownhill's fords "everyone advance" won 33 battles in 40 against it.
  // Going in together whenever any enemy came near, it gave up the fords:
  // two computer armies took the field by them in 2 battles of 60.)
  const outnumbered = (unit) => {
    const near = inSight.filter(e => tileDistance(e.position, unit.position) <= ch.engage)
    if (near.length === 0) return false
    const friends = mine.filter(u => near.some(e => tileDistance(e.position, u.position) <= ch.engage))
    const men = (units) => units.reduce((n, u) => n + Math.max(0, u.strength ?? u.unit?.strength ?? 0), 0)
    return men(near) > men(friends) * TUNING.OUTNUMBERED
  }
  const together = Boolean(split) && mine.some(outnumbered)
  const attacking = together || (!holding && !waiting && (closeBy || !anchor || formed))
  // Going in: pressing the enemy (with one near across a crossing, the
  // engine steps into it first: engine/battle/crossing.js).
  const goIn = (unit) => give(unit, { action: 'advance' })

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
    // Split among several grounds: an enemy seen on the ground a unit is
    // sent to hold is gone for at once, there (not wherever "advance" would
    // take it).
    if (split && !fighting.has(unit.id)) {
      const foe = enemyOn(game, split.targetOf.get(unit.id), inSight)
      if (foe) { give(unit, { action: 'attack', target: { ...foe.position } }); continue }
    }
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
  return camp ? [...camp.orders, ...orders] : orders
}

const lineFighting = (line, fighting) => line.some(u => fighting.has(u.id))

// ── The camp ────────────────────────────────────────────
// A camp battle's (engine/battle/camp.js), played as the Commander would,
// from what his side knows (sideView's camps: his own camp, and the
// enemy's as found):
//   - carried and never pitched: the unit carrying it pitches it ahead of
//     (or behind) where the army formed up, by his character (campAhead);
//   - dropped: the nearest unit not fighting takes it up and pitches it
//     where it lies;
//   - pitched: the weakest of his foot (campGuard of them, while he has
//     enough left for a line) guard it, inside it;
//   - the enemy's found, and his men to the enemy's he knows of at least
//     campOdds: his horse (or, if he has none and dares, the fastest of
//     his foot) go for it.
// Returns { orders, busy }: the orders, and the units given them.
function campPlan(game, side, all, view, ch) {
  const battle = game.battle
  const map = battle.map
  const orders = []
  const busy = new Set()
  const give = (unit, order) => { orders.push({ unitRef: unit.id, ...order }); busy.add(unit.id) }
  const fighting = new Set([...battle.previousEngagementKeys].flatMap(k => k.split('|')))
  const own = view.camps.own
  const theirEdge = Object.entries(game.spec.sides ?? {}).find(([s]) => s !== side)?.[1]?.homeEdge ?? 'east'
  const forward = FORWARD[theirEdge] ?? FORWARD.east
  const started = centroid(game.spec.units.filter(u => u.side === side).map(u => toXY(u.position)))
  const rank = (u) => ['levy', 'militia', 'tribal_warriors', 'professional', 'veteran_mercenary', 'elite'].indexOf(u.quality)
  const weakest = (a, b) => rank(a) - rank(b) || a.strength - b.strength || a.id.localeCompare(b.id)

  if (own?.status === 'carried') {
    const carrier = all.find(u => u.id === own.carrier)
    const ever = battle.log.ofType('campPitched').some(e => e.side === side)
    if (carrier && !ever) {
      const spot = standable(map, add(started, forward, ch.campAhead ?? 4), new Set()) ?? carrier.position
      give(carrier, { action: 'pitch', target: spot })
    } else if (carrier) give(carrier, { action: 'pitch' })
  } else if (own?.status === 'dropped') {
    const near = all.filter(u => !fighting.has(u.id))
      .sort((a, b) => tileDistance(a.position, own.at) - tileDistance(b.position, own.at) || a.id.localeCompare(b.id))[0]
    if (near) give(near, { action: 'pitch', target: { ...own.at } })
  } else if (own?.status === 'pitched') {
    const foot = all.filter(u => !u.mounted && !busy.has(u.id)).sort(weakest)
    const guards = all.length - (ch.campGuard ?? 1) >= 2 ? foot.slice(0, ch.campGuard ?? 1) : []
    const inside = (u) => own.tiles.some(t => t.x === u.position.x && t.y === u.position.y)
    for (const unit of guards) {
      if (fighting.has(unit.id)) { busy.add(unit.id); continue }
      give(unit, inside(unit) ? { action: 'hold' } : { action: 'defend', target: { ...own.at } })
    }
  }

  const theirs = view.camps.enemy
  const men = all.reduce((sum, u) => sum + u.strength, 0)
  // The enemy his side knows of, and of them those not seen running: men he
  // can see break and run are no longer an army in his way.
  const known = view.intel.filter(e => e.strength > 0)
  const formedMen = known.filter(e => !(e.status === 'visible' && battle.broken.has(e.id))).reduce((sum, e) => sum + e.strength, 0)
  // His men far outnumber those still formed against him (twice campOdds),
  // or none is: everyone not at the camp's work goes for the enemy's camp,
  // if it is found, or after the men running to it, if it is not.
  const allIn = formedMen === 0 || men / formedMen >= 2 * (ch.campOdds ?? 1)
  const running = known.filter(e => e.status === 'visible' && battle.broken.has(e.id))
    .sort((a, b) => tileDistance(centroid(all.map(u => u.position)), a.position) - tileDistance(centroid(all.map(u => u.position)), b.position) || a.id.localeCompare(b.id))[0]
  const goal = theirs && theirs.status !== 'burned' && theirs.at ? theirs.at : null
  if (allIn && (goal || running)) {
    for (const unit of all.filter(u => !busy.has(u.id) && !fighting.has(u.id))) give(unit, { action: 'attack', target: { ...(goal ?? running.position) } })
  } else if (goal) {
    if (known.length === 0 || men / Math.max(1, formedMen) >= (ch.campOdds ?? 1)) {
      let raiders = all.filter(u => u.mounted && !busy.has(u.id) && !fighting.has(u.id))
      if (raiders.length === 0 && ch.raidWithFoot) {
        raiders = all.filter(u => !busy.has(u.id) && !fighting.has(u.id))
          .sort((a, b) => (b.movementRange ?? 1) - (a.movementRange ?? 1) || weakest(b, a)).slice(0, 1)
      }
      for (const unit of raiders) give(unit, { action: 'attack', target: { ...theirs.at } })
    }
  }
  return { orders, busy }
}

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
// place for his edge, else this side's start mirrored across the middle of
// the field). Map and forming-up places are known to both
// Commanders; where he truly stands is not read. Null if there is none.
function theirGround(game, side, forward, across) {
  const map = game.battle.map
  const started = centroid(game.spec.units.filter(u => u.side === side).map(u => toXY(u.position)))
  // The field's own forming-up place for his edge, where it has one (they
  // need not mirror each other: Crownhill's east army forms up further
  // south, so both are as long marching to the hill); else the mirror.
  const edge = Object.entries(game.spec.sides ?? {}).find(([s]) => s !== side)?.[1]?.homeEdge
  // (Where the field forms its armies up for this kind of battle, if
  // elsewhere: Crownhill's fords, src/data/maps, deployFor.)
  const deploy = MAPS[map.name]?.deployFor?.[game.spec?.kind] ?? map.deploy
  const mirrored = deploy?.[edge] ? { ...deploy[edge] } : forward.x !== 0
    ? { x: map.width - 1 - started.x, y: started.y }
    : { x: started.x, y: map.height - 1 - started.y }
  const theirs = strongpoint(game, side, { x: -forward.x, y: -forward.y }, across, mirrored)
  return theirs?.anchor ?? null
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

// ── Some of several grounds ─────────────────────────────
// A battle whose ground is several pieces, some of them to hold
// (spec.objectivesNeeded; ruled 2026-11-25: "controlling 2 fords wins the
// game"). Which it goes for: as many as must be held, those it holds first,
// then the nearest to where it formed up that no one holds, then those the
// enemy holds; and one the enemy holds whenever he holds as many (he is on
// the clock). By character:
//   steady    as above
//   bold      goes for what the enemy holds before what no one does
//   cautious  takes them one at a time, the whole army together, the
//             nearest first: once he holds one, he leaves a part there and
//             goes on with the rest
// The army is shared out, the units nearest each ground to it, as evenly as
// they go, every kind of unit in the line: a part is one, two or three
// units, and horse kept off its flank held nothing (crownhill, parthia,
// seed 11: the horse beside the South Ford, the spears worn out short of
// it, night with the ford no one's). Each part forms up at its ground as a
// whole army would (formation). Null for any other battle, which goes on as
// before.
function splitGround(game, side, forward, across, ch, { line, archers, horse }, fit = () => true) {
  const objectives = game.objectives ?? []
  const needed = game.spec?.objectivesNeeded
  if (!Number.isInteger(needed) || needed <= 0 || needed >= objectives.length || line.length === 0) return null
  const map = game.battle.map
  const started = centroid(game.spec.units.filter(u => u.side === side).map(u => toXY(u.position)))
  const holder = (o) => game.objectiveHolds?.[o.id]?.side ?? null
  const theirs = (o) => holder(o) !== null && holder(o) !== side
  const all = objectives.map(o => {
    const anchor = holdFrom(map, o, started)
    return { objective: o, anchor, d: tileDistance(started, anchor) }
  }).sort((a, b) => a.d - b.d || String(a.objective.id).localeCompare(String(b.objective.id)))
  // What he holds he keeps; then the nearest no one holds; then the
  // nearest the enemy holds (a bold Commander's before those no one holds).
  // Two armies each holding one of three, and each going for the other's,
  // stood off all day: the third is the one to go for.
  const rank = (g) => (holder(g.objective) === side ? 0 : theirs(g.objective) ? (ch.contest === 'any' ? 1 : 2) : (ch.contest === 'any' ? 2 : 1))
  // Among the rest, one his men are already on their way to comes first:
  // he keeps to what he set out for (a ford won and lost behind him turned
  // the part going for another back to it, and again, for hours: crownhill,
  // kush, seed 5).
  const goingTo = (g) => line.some(u => {
    const to = game.battle.orderBook?.get(u.id)?.target
    return Boolean(to) && tileDistance(to, g.anchor) <= 2
  })
  let targets = [...all].sort((a, b) => rank(a) - rank(b) || Number(goingTo(b)) - Number(goingTo(a)) || a.d - b.d || String(a.objective.id).localeCompare(String(b.objective.id))).slice(0, needed)
  // The enemy on the clock: one he holds is always among them.
  const enemyHolds = all.filter(g => theirs(g.objective)).length
  const contest = all.find(g => theirs(g.objective))
  if (enemyHolds >= needed && contest && !targets.some(g => theirs(g.objective))) targets = [...targets.slice(0, needed - 1), contest]
  // One at a time: the whole army to the first not yet his, leaving a part
  // at each he holds.
  if (ch.oneAtATime) {
    const mine = targets.filter(g => holder(g.objective) === side)
    const next = targets.find(g => holder(g.objective) !== side)
    targets = next ? [...mine, next] : mine
    if (targets.length === 0) targets = all.slice(0, 1)
  }
  // Shared out: the part for each ground its nearest units, as evenly as
  // they go (one at a time: one unit at each he holds, the rest on).
  const n = line.length
  const k = targets.length
  const counts = ch.oneAtATime
    ? targets.map((g, i) => (i < k - 1 ? 1 : Math.max(0, n - (k - 1))))
    : targets.map((g, i) => Math.floor(n / k) + (i < n % k ? 1 : 0))
  // Ground still to take is given its men first, and fit men (not worn
  // out: `fit`) before the worn, who keep what is held. (Worn men sent to
  // take a ford held where they stood, and the fresh kept one already
  // held: crownhill, carthage, seed 11.)
  const free = [...line].sort((a, b) => a.id.localeCompare(b.id))
  const parts = targets.map(() => [])
  const order = targets.map((g, i) => i).sort((a, b) => Number(holder(targets[a].objective) === side) - Number(holder(targets[b].objective) === side) || a - b)
  // A unit already sent to one of them keeps to it, while it is still
  // gone for and has room: its own order says where (re-sharing every turn
  // marched units to and fro between two fords for ever: crownhill,
  // parthia, seed 11).
  const sentTo = (unit) => {
    const to = game.battle.orderBook?.get(unit.id)?.target
    return to ? targets.findIndex(g => tileDistance(to, g.anchor) <= 2) : -1
  }
  for (const i of order) {
    const keep = free.filter(u => sentTo(u) === i).slice(0, counts[i])
    for (const u of keep) free.splice(free.indexOf(u), 1)
    parts[i].push(...keep)
  }
  for (const i of order) {
    const g = targets[i]
    const toTake = holder(g.objective) !== side
    free.sort((a, b) => (toTake ? Number(!fit(a)) - Number(!fit(b)) : 0) || tileDistance(a.position, g.anchor) - tileDistance(b.position, g.anchor) || a.id.localeCompare(b.id))
    parts[i].push(...free.splice(0, Math.max(0, counts[i] - parts[i].length)))
  }
  parts[order.at(-1)].push(...free)
  const horseTo = ch.contest === 'any' ? Math.max(0, targets.findIndex(g => theirs(g.objective))) : 0
  const slots = new Map()
  const targetOf = new Map()
  const taken = new Set()
  targets.forEach((g, i) => {
    const part = { line: parts[i], archers: i === 0 ? archers : [], horse: i === horseTo ? horse : [] }
    // The tiles that hold it first, nearest where it is held from, and the
    // fit units on them (a ford is held from a tile or two at its ends;
    // a line spread across beside it held it from one, and that one a unit
    // worn out short of it: crownhill, carthage, seed 4). The rest form up
    // about it as a line does.
    const holding = holdTiles(map, g.objective).sort((a, b) => tileDistance(a, g.anchor) - tileDistance(b, g.anchor) || a.y - b.y || a.x - b.x)
    const units = [...part.line].sort((a, b) => Number(!fit(a)) - Number(!fit(b)) || a.id.localeCompare(b.id))
    const rest = []
    for (const u of units) {
      const tile = holding.find(t => !taken.has(positionKey(t)))
      if (tile) { taken.add(positionKey(tile)); slots.set(u.id, tile) } else rest.push(u)
    }
    for (const [id, tile] of formation(map, g.anchor, forward, across, { ...part, line: rest }, 1)) {
      if (taken.has(positionKey(tile))) continue
      taken.add(positionKey(tile))
      slots.set(id, tile)
    }
    for (const u of [...part.line, ...part.archers, ...part.horse]) targetOf.set(u.id, g.objective)
  })
  return { targets, slots, targetOf }
}

// Where a part forms up to hold one piece of the ground: the tile nearest
// where the army formed up that a line can stand on and holds it (on it,
// or within its reach). (Stepping back off a ford, as strongpoint does,
// put the line two tiles off a ford held from one tile, and it held
// nothing: crownhill, carthage, seed 11, night with the North Ford no
// one's.)
function holdFrom(map, objective, from) {
  const tiles = objective.tiles ?? [objective.coord]
  let best = null
  for (const p of holdTiles(map, objective)) {
    const d = tileDistance(p, from)
    if (!best || d < best.d) best = { p, d }
  }
  return best ? best.p : (standable(map, centroid(tiles), new Set()) ?? centroid(tiles))
}

// Every tile a line can stand on that holds a piece of the ground: on it,
// or within its reach (as victory.js counts it), in order of rows.
function holdTiles(map, objective) {
  const tiles = objective.tiles ?? [objective.coord]
  const reach = objective.reach ?? (objective.single === false ? 0 : 1)
  const out = new Map()
  for (const t of tiles) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const p = { x: t.x + dx, y: t.y + dy }
        if (tileDistance(p, t) > reach || !map.inBounds(p) || !map.passable(p) || NOT_HERE.includes(map.terrainAt(p))) continue
        out.set(positionKey(p), p)
      }
    }
  }
  return [...out.values()].sort((a, b) => a.y - b.y || a.x - b.x)
}

// An enemy this side sees on, or at the edge of, one piece of the ground
// (within its reach and a tile more), nearest it; or null.
function enemyOn(game, objective, inSight) {
  if (!objective) return null
  const tiles = objective.tiles ?? [objective.coord]
  const reach = (objective.reach ?? (objective.single === false ? 0 : 1)) + 1
  return inSight
    .map(e => ({ e, d: Math.min(...tiles.map(t => tileDistance(e.position, t))) }))
    .filter(x => x.d <= reach)
    .sort((a, b) => a.d - b.d || a.e.id.localeCompare(b.e.id))[0]?.e ?? null
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

module.exports = { planTurn, temperament, strongpoint, formation, characterOf, forewarned, lookFor, meetingPlace, theirGround, TUNING, CHARACTERS, CHARACTER_NAMES }
