// src/engine/battle/battle.js
//
// Phase 4: the two engines meet. Phase 3 moves the units, phase 2 fights the
// engagements, and this runner owns everything that only exists when both are
// true at once:
//
//   - contact detection triggering combat (reused from the phase 2 harness)
//   - push gaining its positional teeth: a strong enough shove costs the loser
//     a tile and the winner follows up into the vacated ground, so the crest
//     rule cuts both ways — the loser gives up the hill AND the winner now
//     stands on it, with no extra rule, because terrain is read from position
//   - rout on the map: broken units stop fighting and flee toward their side's
//     home edge, take pursuit casualties when caught adjacent to an enemy, and
//     leave the field when they reach the edge
//   - multi-unit engagements: flanking, resolved inside the phase 2 resolver
//     from the engagement list itself
//
// The runner is split into createBattleState + stepTurn so phase 5's
// orchestrator can drive one turn at a time (order submission, elastic time,
// fog of war live between turns); runBattle is the closed loop over a
// scripted spec, built on the same stepper.
//
// Determinism: one seeded RNG and one combat resolver per battle. Movement
// draws no randomness at all, so the battle is a pure function of
// (spec, seed) — the phase 4 exit criterion "replayable from seed" holds by
// construction and is pinned by a test.

const { createRng } = require('../rng')
const {
  createWorld, cloneWorld, getUnit, livingUnits, unitsOnSide, sides, tileDistance
} = require('../world')
const { detectEngagements, applyCasualties } = require('../runner')
const { createCombatResolver, tables: T, ranged } = require('../combat')
const perks = require('../combat/perks')
const { findPath } = require('../movement/pathfinding')
const { resolveMap } = require('../map/map')
const { toPosition, samePosition, positionKey } = require('../map/labels')
const {
  resolveSimultaneousMovement, expandOrders, buildOccupancy, canEnter, moveUnit, crowdingByUnit
} = require('../movement')
const { createEventLog } = require('./events')
const { normalizeOrder, planUnit, nextStep, isSeeking, NEAR_TILES, SEEKING: SEEKING_ORDERS } = require('./orders')
const { grasp, losingTheThread, ownCommand, wouldYield, loyaltyOf } = require('../command/officers')
const { createCommanders, stepCommanders, canRide } = require('../command/commander')
const { byRider, riders, ridersTaken } = require('../command/messengers')
const { actsAlone, initiative } = require('../command/initiative')
const { canSee, visionRange } = require('../map/sight')
const { coverFor } = require('./hiding')
const { canSkirmish, fallBack } = require('./skirmish')
const { formUp } = require('./formUp')
const { intoTheCrossing } = require('./crossing')
const camps = require('./camp')

const DEFAULT_MAX_TURNS = 20

// ── State ────────────────────────────────────────────────

/**
 * Open a battle. The returned state is everything stepTurn needs; nothing in
 * it touches a wall clock, so (spec, seed) fully determines every turn.
 */
function createBattleState(spec, options = {}) {
  const seed = options.seed ?? spec.seed ?? 1

  const state = {
    spec,
    seed,
    // The battlefield. spec.map may name an authored map, carry a definition,
    // or be absent (Crownhill). Kept beside the world, never inside it, so
    // world snapshots stay small.
    map: resolveMap(spec.map),
    world: createWorld({ units: spec.units }),
    random: createRng(seed),
    // A stream of its own for what officers keep of their orders, so that
    // giving a deeper order never changes how the fighting falls out.
    officerRandom: createRng((Math.imul(seed, 2654435761) + 97) >>> 0),
    // The Commanders on the field, where the battle has them (command/
    // commander.js): side -> { unitId, status, heldBy }. A stream of their
    // own, so that a Commander's fate never changes how the fighting goes.
    commanders: createCommanders(spec),
    commanderRandom: createRng((Math.imul(seed, 1597334677) + 211) >>> 0),
    // A stream of its own for the enemy catching a rider (command/
    // messengers.js, ridersTaken), drawn on only when an enemy comes near
    // one: a battle where none does falls out as before.
    riderRandom: createRng((Math.imul(seed, 3266489917) + 307) >>> 0),
    mustered: new Map(spec.units.map(u => [u.id, u.strength])),
    // Units given an order in the player turn now running, and those shot
    // at in the tick before this one.
    fresh: new Set(),
    shotLastTurn: new Set(),
    // A tick of a battle is a share of a combat round (tables.PACE).
    resolver: createCombatResolver({ pace: spec.combatPace ?? T.PACE.PER_TICK }),
    log: createEventLog(),
    // Phase 4 owns these two flags. They deliberately do NOT live in the
    // harness world model — phase 2's scenarios and the balance matrix have no
    // concept of a unit that is broken but alive, and adding the field there
    // would make every existing snapshot lie about it.
    broken: new Set(),
    // How many times each unit has rallied.
    rallied: new Map(),
    fledUnits: [],
    // Each unit's standing order (see orders.js): unitId -> normalized order.
    // Orders persist until replaced or done.
    orderBook: new Map(),
    turn: 0,
    previousEngagementKeys: new Set(),
    // Each unit's crowding tier at the end of the last turn, so the log can
    // say when it changes. unitId -> tier name.
    crowding: new Map(),
    // Units hiding (Stage 3), and how well: unitId -> the row of hiding.js
    // they hide by. Moving or fighting gives a unit away.
    hidden: new Map(),
    // Where each side last saw each enemy unit: side -> Map(unitId ->
    // position). A unit told to press the enemy goes at one it can see, or
    // failing that at where one was last seen; it does not know where an
    // enemy no one has seen is standing.
    lastSeen: new Map(),
    // The ground each side has looked over for an enemy it has lost:
    // side -> Set of tile keys. Emptied when an enemy comes in sight.
    // searchFor: the place each searching unit is making for.
    searchFor: new Map(),
    searchedAhead: new Set(),
    searched: new Map(),
    // Turns in a row a hidden unit has had an enemy right beside it: the
    // chance it is noticed grows with each (EXPOSURE).
    exposure: new Map(),
    outcome: { decided: false, winner: null, reason: 'battle still open' }
  }
  // A camp battle's camps (battle/camp.js): only when the spec has them.
  if (spec.camps) state.camps = camps.createCamps(spec, state.map)
  // A unit that has rallied and not taken heart since: formed up, but its
  // morale still at or under the rout line. It will break at the next blow.
  state.isShaken = (unit) => state.rallied.has(unit.id) &&
    (state.resolver.getState(unit.id)?.morale ?? T.MORALE.START) <= T.MORALE.ROUT_THRESHOLD
  return state
}

/**
 * Resolve one full turn: orders -> movement -> flight -> contact -> combat ->
 * pushes -> routs -> pursuit -> victory.
 *
 * @param {Object} state          from createBattleState
 * @param {Object} sideOrders     { red: [{unitRef, target}], blue: [...] } —
 *                                broken units ignore theirs and flee
 * @returns {Object} turn record (also appended nowhere — the caller owns the
 *                   ledger; runBattle and the orchestrator each keep their own)
 */
function stepTurn(state, sideOrders = {}, { sameTurn = false } = {}) {
  const { spec, map, world, random, resolver, log, broken, fledUnits } = state
  // A player turn can run several ticks (the orchestrator's elastic time).
  // Orders are given in its first; `sameTurn` marks the ticks after it, in
  // which those orders are still this turn's.
  if (!sameTurn) state.fresh = new Set()
  const engagementRange = spec.engagementRange ?? 1

  state.turn += 1
  const turn = state.turn
  world.turn = turn

  // A side's standing order, for one unit. A shaken unit (rallied, and no
  // heart taken since) keeps out of a standing advance: it would only break
  // again at the first blow. It holds where it formed up, behind the units
  // still steady, and still does as it is ordered.
  const shaken = state.isShaken

  // Could this unit shoot at that one from where each stands? In reach, in
  // its own sight, not hidden from its side, and not running.
  const canShootAt = (shooter, target, seen) =>
    target.side !== shooter.side && !broken.has(target.id) &&
    seen.get(shooter.side)?.has(target.id) &&
    tileDistance(shooter.position, target.position) <= ranged.missileRange(shooter) &&
    canSee(map, shooter, target)
  // A missile unit with something to shoot at from here (judged as the turn
  // opens, by who was fighting last turn).
  const meleeLastTurn = new Set([...state.previousEngagementKeys].flatMap(k => k.split('|')))
  const standsOff = (unit) => ranged.missileRange(unit) > 0 && !meleeLastTurn.has(unit.id) &&
    !state.orderBook.get(unit.id)?.holdFire &&
    livingUnits(world).some(e => canShootAt(unit, e, seenAtStart))
  // Who could come at a missile unit: enemies its side sees, formed and
  // not already fighting.
  const skirmishing = new Map()
  const skirmishFrom = (unit) => {
    if (!canSkirmish(unit)) return null
    const seen = seenAtStart.get(unit.side) ?? new Set()
    const enemies = livingUnits(world).filter(e => e.side !== unit.side && !broken.has(e.id) &&
      seen.has(e.id) && !meleeLastTurn.has(e.id))
    const enemyAt = (tile) => enemies.some(e => samePosition(e.position, tile))
    return fallBack(unit, enemies, { map, engagementRange, enemyAt })
  }
  // The first place on the way to an enemy in sight from which a unit can
  // shoot at it (in reach of its weapon, and of its own sight). Not for a
  // place an enemy was last seen, and not where it already stands: there,
  // with no shot, it must go on, or it would wait for ever.
  const withinShot = (unit, target) => {
    const inSight = livingUnits(world).some(e => e.side !== unit.side && samePosition(e.position, target) &&
      seenAtStart.get(unit.side)?.has(e.id))
    if (!inSight) return target
    const path = findPath(map, unit.position, target)
    const reach = Math.min(ranged.missileRange(unit), visionRange(unit, map))
    const stop = path?.find(tile => tileDistance(tile, target) <= reach)
    return stop && !samePosition(stop, unit.position) ? stop : target
  }
  // Where a unit going at the enemy at `target` steps: into a ford or
  // bridge beside it when the enemy, in its side's sight, is close across
  // it (crossing.js); else the target.
  const overTheWater = (unit, target) => {
    const there = livingUnits(world).some(e => e.side !== unit.side && samePosition(e.position, target) && seenAtStart.get(unit.side)?.has(e.id))
    return (there && intoTheCrossing(map, unit, target)) || target
  }
  const standingFor = (unit) => {
    const standing = spec.standingOrders?.[unit.side]
    return shaken(unit) ? null : standing
  }

  // ── What each side can see as the turn opens ────
  // Surprise is judged against this: an enemy no one on a side could see
  // when the turn began, and who then attacks a marching unit, catches it
  // unawares.
  const seenAtStart = sightBySide(map, world, state.hidden)

  // What each side remembers of where the enemy was. An enemy in sight is
  // where it is; one out of sight stays where it was last seen, until a unit
  // comes up close enough to find it gone.
  for (const side of sides(world)) {
    if (!state.lastSeen.has(side)) state.lastSeen.set(side, new Map())
    const memory = state.lastSeen.get(side)
    const seen = seenAtStart.get(side) ?? new Set()
    // An enemy in sight ends any search for one; the next begins afresh.
    // (Not one broken: a broken unit that could not get away, in sight for
    // hours, began every search afresh each ten minutes, and the searchers
    // walked up and down for ever: ashford, Sarmatia against Germania,
    // seed 27 of the soak.)
    if ([...seen].some(id => !broken.has(id))) {
      state.searched.delete(side)
      for (const u of unitsOnSide(world, side)) { state.searchFor.delete(u.id); state.searchedAhead.delete(u.id) }
    }
    for (const id of seen) {
      const enemy = getUnit(world, id)
      if (enemy && !broken.has(id)) memory.set(id, { ...enemy.position })
    }
    const watchers = unitsOnSide(world, side).filter(u => u.strength > 0 && !broken.has(u.id))
    for (const [id, position] of [...memory]) {
      if (seen.has(id) && !broken.has(id)) continue
      const gone = broken.has(id) || !getUnit(world, id) || getUnit(world, id).strength <= 0
      if (gone || watchers.some(w => tileDistance(w.position, position) <= STOOD_THERE)) memory.delete(id)
    }
  }
  // The tile of the ground to fight for that a unit advancing on it makes
  // for: the nearest it can stand on that no other unit of its side has
  // taken or is making for, so that they come up beside one another; its
  // own, once it is on it.
  const groundBound = new Map()
  const groundFor = (unit) => {
    if (groundBound.has(unit.id)) return groundBound.get(unit.id)
    const tiles = state.ground.flatMap(area => area.tiles).filter(t => map.passable(t) && map.terrainAt(t) !== 'river')
    const mine = tiles.find(t => samePosition(t, unit.position))
    const claimed = new Set([
      ...unitsOnSide(world, unit.side).filter(u => u.id !== unit.id && u.strength > 0).map(u => positionKey(u.position)),
      ...[...groundBound.entries()].filter(([id]) => getUnit(world, id)?.side === unit.side).map(([, t]) => positionKey(t))
    ])
    const free = tiles.filter(t => !claimed.has(positionKey(t)))
    const pick = mine ?? [...(free.length ? free : tiles)]
      .sort((a, b) => tileDistance(unit.position, a) - tileDistance(unit.position, b) || a.y - b.y || a.x - b.x)[0] ?? unit.position
    groundBound.set(unit.id, pick)
    return pick
  }
  // Ground taken is fought for (the loose ends of November 24: "everyone
  // take the Old Mill Bridge" stood beside the bridge watching the enemy's
  // horse hold it for an hour). A unit sent to go to or stand on the ground
  // to fight for (state.groundPost) goes at any enemy its side can see on
  // that ground (GROUND_FIGHT.BESIDE tiles more), rather than stand and let
  // him share it or hold it; with none there, it goes back to its own place
  // and holds. A unit rallied with no heart does not.
  // Missile troops shoot from where they stand, as before.
  const onGround = (area, position, beside = 0) => {
    const reach = (area.reach ?? (area.single === false ? 0 : 1)) + beside
    return area.tiles.some(t => tileDistance(position, t) <= reach)
  }
  // The ground an order sends a unit to stand on, and where: a move or a
  // stand there, or a hold given to a unit already on it. Null for any
  // other order, or a place off the ground.
  const groundAt = (order) => {
    let at = null
    const holds = order.action === 'hold' || (!order.action && (!order.target || order.target === 'hold'))
    if (holds && !order.steps?.length) at = getUnit(world, order.unitId)?.position ?? null
    else if (T.GROUND_FIGHT.ORDERS.includes(order.action) && order.target && order.target !== 'hold') {
      try { at = toPosition(order.target) } catch { return null }
    }
    if (!at) return null
    const area = (state.ground ?? []).find(a => onGround(a, at))
    return area ? { area, tile: { ...at } } : null
  }
  const groundFoe = (unit, areaId) => {
    const area = (state.ground ?? []).find(a => a.id === areaId)
    if (!area) return null
    const seen = seenAtStart.get(unit.side) ?? new Set()
    return livingUnits(world)
      .filter(e => e.side !== unit.side && !broken.has(e.id) && seen.has(e.id) && onGround(area, e.position, T.GROUND_FIGHT.BESIDE))
      .sort((a, b) => tileDistance(unit.position, a.position) - tileDistance(unit.position, b.position) || a.id.localeCompare(b.id))[0] ?? null
  }
  // Whom a unit pressing the enemy makes for: the nearest enemy its side
  // can see; else the nearest place one was last seen; else, told to
  // advance, the ground to fight for; else the enemy's side of the field.
  // Returns something with a `position`, or null.
  const toPress = (unit, { toGround = false } = {}) => {
    const seen = seenAtStart.get(unit.side) ?? new Set()
    const nearest = (candidates) => candidates
      .map(c => ({ ...c, distance: tileDistance(unit.position, c.position) }))
      .sort((x, y) => x.distance - y.distance || x.id.localeCompare(y.id))[0] ?? null
    const inSight = nearest(livingUnits(world)
      .filter(e => e.side !== unit.side && !broken.has(e.id) && seen.has(e.id))
      .map(e => ({ id: e.id, position: e.position })))
    if (inSight) return inSight
    const remembered = nearest([...(state.lastSeen.get(unit.side) ?? [])].map(([id, position]) => ({ id, position })))
    if (remembered) return remembered
    // Told to advance, with no enemy known: on to the ground to fight for,
    // where there is some (the playthrough of November 24, D1). Not a
    // side's standing order to advance: that still goes looking.
    if (toGround && state.ground?.length > 0) return { id: 'the ground to fight for', position: groundFor(unit) }
    // No one knows where the enemy is: go and look. First straight ahead to
    // their side of the field; then the ground no one has yet looked over,
    // nearest first.
    // Ground is looked over when a unit could see an enemy standing on it
    // (so open country from a distance, and a wood only from beside it).
    // When the whole field has been looked over, begin again.
    return { id: 'the ground not yet searched', position: whereToLook(unit) }
  }
  // Where a unit told to attack one enemy (by its id) makes for: the enemy
  // itself while its side can see it; else where its side last saw it; null
  // when no one knows where it went (it presses the enemy as advance does).
  // { gone: true } when the enemy is destroyed, broken or off the field.
  // Never where an enemy its side cannot see truly stands.
  const toFollow = (unit, enemyId) => {
    const enemy = getUnit(world, enemyId)
    if (!enemy || enemy.side === unit.side || enemy.strength <= 0 || broken.has(enemyId)) return { gone: true }
    if (seenAtStart.get(unit.side)?.has(enemyId)) return { id: enemyId, position: enemy.position }
    const remembered = state.lastSeen.get(unit.side)?.get(enemyId)
    return remembered ? { id: enemyId, position: remembered } : null
  }
  // Where a unit told to keep by another of its own side goes (orders.js,
  // follow): { to } its station by that unit as it stands now (null: hold
  // where it is, on station already), { join } at an enemy fighting that
  // unit, for one told to guard it, or { lost } why it can keep by it no
  // longer. It keeps by what it can see of the unit; out of sight, it goes
  // to where it last saw it (seenAt) before it gives up.
  const followed = (unit, order) => {
    const friend = getUnit(world, order.friend)
    if (!friend || friend.side !== unit.side || friend.strength <= 0) return { lost: 'gone' }
    if (broken.has(friend.id)) return { lost: 'broken' }
    if (!canSee(map, unit, friend)) {
      if (order.seenAt && !samePosition(order.seenAt, unit.position)) return { to: order.seenAt }
      return { lost: 'out of sight' }
    }
    // Where it is making for this turn, as far as it can go: its own side
    // knows, and keeps station on that. Where it is making for is
    // remembered (seenAt), so that one lost from sight (horse outmarching
    // foot) is looked for there.
    const going = orders.find(o => o.unitId === friend.id && o.target && o.target !== 'hold' && !o.fleeing)
    const path = going ? findPath(map, friend.position, toPosition(going.target)) : null
    const ahead = path ? path[Math.min(friend.movementRange ?? 1, path.length - 1)] : friend.position
    const seenAt = path ? { ...path[path.length - 1] } : { ...friend.position }
    // Fighting itself: it stands and fights.
    if (engagedAtStart.has(unit.id)) return { to: null, seenAt }
    if (order.guard) {
      const foes = [...(engagedAtStart.get(friend.id) ?? [])].map(id => getUnit(world, id))
        .filter(e => e && e.strength > 0 && !broken.has(e.id) && seenAtStart.get(unit.side)?.has(e.id))
        .sort((a, b) => tileDistance(unit.position, a.position) - tileDistance(unit.position, b.position) || a.id.localeCompare(b.id))
      if (foes.length > 0) return { join: { ...foes[0].position }, seenAt }
    }
    return { to: stationBy(unit, { ...friend, position: ahead }, order.keep), seenAt }
  }
  // Its station: beside the unit it keeps by, across the way to the enemy
  // as its side knows him (the enemy last seen nearest that unit, else the
  // far side of the field), on its own side of it; or behind it, away from
  // the enemy. The nearest open passable tile to that; null when it stands
  // near enough already (FOLLOW.SLACK) or there is none.
  const stationBy = (unit, friend, keep) => {
    const known = [...(state.lastSeen.get(unit.side)?.values() ?? [])]
      .sort((a, b) => tileDistance(friend.position, a) - tileDistance(friend.position, b) || a.y - b.y || a.x - b.x)
    const home = { west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1] }[spec.sides?.[unit.side]?.homeEdge ?? 'west'] ?? [-1, 0]
    let ax = known.length ? friend.position.x - known[0].x : home[0]
    let ay = known.length ? friend.position.y - known[0].y : home[1]
    if (ax === 0 && ay === 0) [ax, ay] = home
    const length = Math.hypot(ax, ay)
    ax /= length; ay /= length
    let ideal
    if (keep === 'behind') {
      ideal = { x: Math.round(friend.position.x + ax * T.FOLLOW.BEHIND), y: Math.round(friend.position.y + ay * T.FOLLOW.BEHIND) }
    } else {
      // Across the way to the enemy, on whichever side of it the unit is.
      const sign = (unit.position.x - friend.position.x) * -ay + (unit.position.y - friend.position.y) * ax >= 0 ? 1 : -1
      ideal = { x: Math.round(friend.position.x - ay * sign * T.FOLLOW.BESIDE), y: Math.round(friend.position.y + ax * sign * T.FOLLOW.BESIDE) }
    }
    const onStation = (p) => !samePosition(p, friend.position) && tileDistance(p, ideal) <= T.FOLLOW.SLACK &&
      (keep !== 'behind' || (p.x - friend.position.x) * ax + (p.y - friend.position.y) * ay > 0)
    if (onStation(unit.position)) return null
    const taken = (p) => livingUnits(world).some(u => u.id !== unit.id && samePosition(u.position, p))
    for (let r = 0; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const p = { x: ideal.x + dx, y: ideal.y + dy }
          if (map.inBounds(p) && map.passable(p) && !taken(p)) return p
        }
      }
    }
    return null
  }
  // Units going at an enemy fighting the one they guard: looking for a
  // fight this turn, as an advance is.
  const joining = new Set()
  const lookedOver = new Set()
  const whereToLook = (unit) => {
    if (!state.searched.has(unit.side)) state.searched.set(unit.side, new Set())
    const cleared = state.searched.get(unit.side)
    if (!lookedOver.has(unit.side)) {
      lookedOver.add(unit.side)
      for (const friend of unitsOnSide(world, unit.side)) {
        if (friend.strength <= 0 || broken.has(friend.id)) continue
        const reach = visionRange(friend, map)
        for (let dy = -reach; dy <= reach; dy++) {
          for (let dx = -reach; dx <= reach; dx++) {
            const tile = { x: friend.position.x + dx, y: friend.position.y + dy }
            if (map.inBounds(tile) && canSee(map, friend, { position: tile })) cleared.add(positionKey(tile))
          }
        }
      }
    }
    // A unit keeps to the place it set out to look at until that place has
    // been looked over. (Choosing afresh every turn, two patches of ground
    // either side of a river took turns at being the nearer, and the unit
    // walked back and forth between them for ever.)
    const bound = state.searchFor.get(unit.id)
    if (bound && !cleared.has(positionKey(bound))) return bound
    const choose = (tile) => { state.searchFor.set(unit.id, tile); return tile }

    // Straight ahead to their side of the field first, once.
    if (!state.searchedAhead.has(unit.id)) {
      state.searchedAhead.add(unit.id)
      const theirEdge = Object.entries(spec.sides ?? {}).find(([side]) => side !== unit.side)?.[1]?.homeEdge ?? null
      const edge = edgePlace(map, theirEdge, unit.position)
      if (edge && !cleared.has(positionKey(edge))) return choose(edge)
    }

    for (let pass = 0; pass < 2; pass++) {
      const open = []
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tile = { x, y }
          if (map.passable(tile) && !cleared.has(positionKey(tile))) open.push({ tile, distance: tileDistance(unit.position, tile) })
        }
      }
      open.sort((a, b) => a.distance - b.distance || a.tile.y - b.tile.y || a.tile.x - b.tile.x)
      // Ground that cannot be reached is as good as looked over.
      for (const { tile } of open.slice(0, 6)) {
        if (findPath(map, unit.position, tile)) return choose(tile)
        cleared.add(positionKey(tile))
      }
      if (open.length > 6) return choose(open[6].tile)
      cleared.clear()
    }
    return unit.position
  }
  const reveal = (unitId, reason, by = null) => {
    state.exposure.delete(unitId)
    if (!state.hidden.delete(unitId)) return
    log.emit('revealed', turn, { unitId, reason, by })
  }

  // Who was fighting whom as the turn opens: leaving a fight costs (below).
  const engagedAtStart = new Map()
  for (const key of state.previousEngagementKeys) {
    const [a, b] = key.split('|')
    for (const [id, foe] of [[a, b], [b, a]]) {
      if (broken.has(id)) continue
      if (!engagedAtStart.has(id)) engagedAtStart.set(id, new Set())
      engagedAtStart.get(id).add(foe)
    }
  }

  // ── Orders ──────────────────────────────────────
  const orders = []
  // Units going at an enemy on the ground they were sent to fight for this
  // tick: they look for the fight, whatever their order (groundFoe).
  const forGround = new Set()
  // Units rallied with no heart that would not go at the enemy this tick
  // (below): they look for no fight, whatever their order says.
  const heldBack = new Set()
  const freshThisTurn = state.fresh

  // Has the moment an order's condition spoke of come, as this unit's
  // officer can tell from where he stands?
  const whenTrue = (unit, when) => {
    if (when.type === 'attacked') return engagedAtStart.has(unit.id) || state.shotLastTurn.has(unit.id)
    if (when.type === 'breaks') return broken.has(when.unitId) || !livingUnits(world).some(u => u.id === when.unitId)
    return livingUnits(world).some(e =>
      e.side !== unit.side && !broken.has(e.id) &&
      seenAtStart.get(unit.side)?.has(e.id) && canSee(map, unit, e) &&
      matchesKind(e, when.kind) &&
      (!when.near || tileDistance(e.position, when.near) <= NEAR_TILES))
  }
  const HOLD = { action: 'hold', target: null, then: null }
  const ADVANCE = { action: 'advance', target: null, then: null }
  // An officer who no longer remembers what he was to do: his personality
  // decides (command/officers.js), and the log says so.
  const loseThread = (unit, lost, current) => {
    const inSight = (seenAtStart.get(unit.side)?.size ?? 0) > 0
    const did = losingTheThread(unit.officer, lost, inSight)
    log.emit('lostThread', turn, { unitId: unit.id, officer: unit.officer?.name ?? null, lost, did, ...(unit.officer?.headless ? { headless: true } : {}) })
    if (did === 'advance') return { ...ADVANCE }
    if (did === 'hold') return { ...HOLD }
    const carried = { ...current }
    delete carried.when
    return carried
  }

  // His officers' own command, while their Commander is held: each unit's
  // decision is logged when it changes.
  const runOwnUnits = (side, effective) => {
    state.ownCommand = state.ownCommand ?? new Map()
    const inSight = (seenAtStart.get(side)?.size ?? 0) > 0
    const captor = state.commanders[side].heldBy
    for (const unit of effective) {
      const did = ownCommand(unit.officer, inSight)
      if (state.ownCommand.get(unit.id) === did) continue
      state.ownCommand.set(unit.id, did)
      // A loyal officer's men, shaken, take heart to go for him.
      const heart = did === 'rescue' && state.isShaken(unit) ? resolver.hearten(unit, T.LOYALTY.RALLY_MORALE) : null
      log.emit('ownCommand', turn, {
        unitId: unit.id, officer: unit.officer?.name ?? null, nature: unit.officer?.headless ? null : (unit.officer?.personality ?? null), did,
        ...(did === 'rescue' ? { on: captor } : {}),
        ...(heart !== null ? { morale: heart } : {}),
        ...(unit.officer?.headless || !unit.officer ? { headless: true } : {})
      })
      if (did === 'carry on') continue
      state.orderBook.set(unit.id, did === 'rescue' ? normalizeOrder({ unitId: unit.id, action: 'attack', enemy: captor })
        : did === 'advance' ? { ...ADVANCE } : { ...HOLD })
      freshThisTurn.add(unit.id)
    }
  }
  // The senior officer on the field (the most experienced, of a unit not
  // broken) may yield it himself while his Commander is held, if he is one
  // who would (command/officers.js, wouldYield) and half the army's men are
  // dead, fled or broken. The battle is over; honor frees the Commander.
  const whoYields = (side, effective) => {
    const senior = effective.filter(u => u.officer?.name && !u.officer.headless)
      .sort((a, b) => (b.officer.experience ?? 0) - (a.officer.experience ?? 0) || a.id.localeCompare(b.id))[0]
    if (!senior || !wouldYield(senior.officer)) return null
    const mustered = spec.units.filter(u => u.side === side).reduce((sum, u) => sum + u.strength, 0)
    const inHand = effective.reduce((sum, u) => sum + u.strength, 0)
    return mustered > 0 && 1 - inHand / mustered >= T.LOYALTY.YIELD_LOSSES ? senior : null
  }
  // A disloyal officer's men slip away, every ten minutes their Commander
  // is held (ruled 2026-11-23).
  const desert = (side) => {
    for (const unit of unitsOnSide(world, side)) {
      if (unit.strength <= 0 || loyaltyOf(unit.officer) > T.LOYALTY.DISLOYAL) continue
      const men = Math.floor(unit.strength * T.LOYALTY.DESERTION)
      if (men < 1) continue
      unit.strength -= men
      log.emit('deserted', turn, { unitId: unit.id, officer: unit.officer?.name ?? null, men, strength: unit.strength })
    }
  }

  // Officers who act on their Commander's intent when no word can reach
  // them (command/initiative.js; docs/design/point-of-view-and-messengers.md,
  // "What comes after"). Only a side whose Commander is on the field and
  // free, sending his orders by rider, and only for an officer who can
  // (veterans and above). Returns, for the side, (unit, its order) -> the
  // order he gives himself, or null; null for a side with none.
  // state.touch: unitId -> { turn, post }, the last tick a rider could get
  // through to the unit, and where its Commander was then.
  // state.ownMind: unitId -> what its officer last chose of his own
  // judgement, since he last had word; he does not choose it twice.
  const ownJudgement = (side, effective) => {
    const c = state.commanders?.[side]
    if (!c || c.status !== 'free' || !byRider(state, side)) return null
    if (!effective.some(u => actsAlone(u.officer))) return null
    const road = riders(state, side)
    state.touch ??= new Map()
    state.ownMind ??= new Map()
    const friends = effective
    const since = (from) => {
      const out = []
      for (let t = from + 1; t <= turn; t++) out.push(...log.forTurn(t))
      return out
    }
    return (unit, current) => {
      if (!actsAlone(unit.officer)) return null
      const ticks = road ? road.ticks(unit) : Infinity
      const was = state.touch.get(unit.id) ?? { turn: 0, post: road ? { ...road.post.position } : null }
      // An order that reached him is word from his Commander.
      const ordered = state.lastOrder?.get(unit.id)
      if (ticks !== Infinity || ordered?.turn === turn) {
        state.touch.set(unit.id, { turn, post: road ? { ...road.post.position } : was.post })
        state.ownMind.delete(unit.id)
        return null
      }
      if (turn - was.turn < T.INITIATIVE.WAIT) return null
      // What has changed since he last had word, as his own unit sees it.
      const from = Math.max(was.turn, ordered?.turn ?? 0)
      const news = since(from)
      const sees = (e) => seenAtStart.get(side)?.has(e.id) && canSee(map, unit, e)
      const enemies = livingUnits(world).filter(e => e.side !== side && !broken.has(e.id) && sees(e))
      const changed = []
      let ground = null
      for (const area of state.ground ?? []) {
        const reach = area.reach ?? (area.single === false ? 0 : 1)
        const on = (u) => area.tiles.some(t => tileDistance(u.position, t) <= reach)
        if (!enemies.some(on) || friends.some(on)) continue
        if (!news.some(e => e.type === 'objective' && e.objectiveId === area.id && e.side && e.side !== side && !e.close)) continue
        ground = area
        changed.push('groundLost')
        break
      }
      const near = unitsOnSide(world, side).filter(f => f.id !== unit.id && f.strength > 0 && canSee(map, unit, f))
      const fallen = near.filter(f => broken.has(f.id))
      if (fallen.length > 0 && fallen.length * 2 >= near.length &&
        news.some(e => e.type === 'rout' && fallen.some(f => f.id === e.unitId))) changed.push('friendsBroke')
      const quarryGone = Boolean(current?.enemy && toFollow(unit, current.enemy)?.gone)
      if (quarryGone) changed.push('quarryGone')
      if (engagedAtStart.has(unit.id) || state.shotLastTurn.has(unit.id)) changed.push('attacked')
      const idle = (!current || (current.action === 'hold' && !current.target)) && standingFor(unit) !== 'advance'
      if (idle && enemies.length > 0) changed.push('done')
      if (changed.length === 0) return null
      const mustered = state.mustered.get(unit.id) ?? unit.strength
      const choice = initiative(unit.officer, {
        changed,
        enemyInSight: enemies.length > 0,
        goodGround: T.INITIATIVE.GOOD_GROUND.includes(map.terrainAt(unit.position)),
        bled: unit.strength <= mustered * (1 - T.INITIATIVE.BLED),
        intent: ordered?.action ?? null,
        running: Boolean(current) && !idle && !quarryGone
      })
      if (!choice || state.ownMind.get(unit.id) === choice.did) return null
      state.ownMind.set(unit.id, choice.did)
      // What he is doing already, he need not choose.
      if (choice.did === 'hold' && (idle || current?.action === 'hold')) return null
      if (choice.did === 'advance' && current?.action === 'advance') return null
      let order
      if (choice.did === 'advance') order = { action: 'advance', target: null, then: null }
      else if (choice.did === 'hold') order = { action: 'hold', target: null, then: null }
      else if (choice.did === 'ground') {
        const tile = [...ground.tiles].sort((a, b) => tileDistance(unit.position, a) - tileDistance(unit.position, b) || a.y - b.y || a.x - b.x)[0]
        order = normalizeOrder({ action: 'attack', target: tile })
      } else order = normalizeOrder({ action: 'withdraw', ...(was.post ? { target: was.post } : {}) })
      log.emit('initiative', turn, {
        unitId: unit.id, officer: unit.officer.name ?? null, nature: unit.officer.personality, why: choice.why, did: choice.did,
        ...(ground ? { ground: ground.name } : {}),
        ...(choice.did === 'fall back' && was.post ? { to: { ...was.post } } : {})
      })
      return order
    }
  }

  for (const side of sides(world)) {
    const effective = unitsOnSide(world, side).filter(u => !broken.has(u.id))
    // A Commander in the enemy's hands gives no orders.
    const held = state.commanders?.[side]?.status === 'held'
    // "I ride with the horse": the Commander goes over to another of his
    // units, one beside the unit he is with (command/commander.js, canRide).
    // It is no order to the men, and is taken out of the list before theirs.
    const given = (sideOrders[side] ?? []).filter(o => !o?.ride)
    for (const o of (sideOrders[side] ?? []).filter(o => o?.ride)) {
      if (!canRide(state.commanders, world, broken, side, o.ride).ok) continue
      log.emit('commanderRode', turn, { side, unitId: o.ride, from: state.commanders[side].unitId })
      state.commanders[side].unitId = o.ride
    }
    const { orders: spelled } = expandOrders(held ? [] : given, effective)
    // An order to go to or stand on the ground to fight for is marked with
    // it before the line forms (a unit's own place in the line may lie just
    // off it): the unit fights for that ground (below, groundFoe).
    for (const o of spelled) {
      const there = groundAt(o)
      if (there) { o.forGround = there.area.id; o.groundTile = there.tile }
    }
    // Units sent to one place together form up beside one another there
    // (formUp.js), toward the enemy as the side knows of him.
    const expanded = formUp(spelled, {
      map,
      units: effective,
      others: new Set(effective.filter(u => !spelled.some(o => o.unitId === u.id)).map(u => positionKey(u.position))),
      enemies: [...(state.lastSeen.get(side)?.values() ?? [])],
      enemyEdge: Object.entries(spec.sides ?? {}).find(([s]) => s !== side)?.[1]?.homeEdge ?? null
    })
    // While he is held each officer runs his own unit by his nature, as a
    // player turn opens (command/officers.js, ownCommand). It ends when he
    // is free: from then on his units keep what they were last doing until
    // he gives them new orders.
    if (held) desert(side)
    if (held && !sameTurn && !state.yielded) {
      const yielder = whoYields(side, effective)
      if (yielder) {
        state.yielded = side
        log.emit('officerYielded', turn, { side, unitId: yielder.id, officer: yielder.officer.name })
      }
    }
    if (held && !sameTurn) runOwnUnits(side, effective)
    else if (!held && state.ownCommand) for (const u of effective) state.ownCommand.delete(u.id)

    // Orders given this turn replace each unit's standing order.
    // What its officer keeps of an order with more than one thing in it is
    // rolled here, once, as the order reaches him.
    const give = (sent) => {
      const { fromPost, ...order } = sent
      let given = normalizeOrder(order)
      const officer = getUnit(world, order.unitId)?.officer
      if (officer) {
        const kept = grasp(given, officer, state.officerRandom)
        if (kept.clauses > 0) log.emit('grasp', turn, { unitId: order.unitId, officer: officer.name ?? null, clauses: kept.clauses, kept: kept.kept })
        given = kept.order
      }
      // Told to keep by a unit, it is told where that unit is as the order
      // reaches it: it makes for it there if it cannot see it.
      if (given.action === 'follow') {
        const friend = getUnit(world, given.friend)
        if (friend && friend.strength > 0) given = { ...given, seenAt: { ...friend.position } }
      }
      state.orderBook.set(order.unitId, given)
      freshThisTurn.add(order.unitId)
      // Sent to the ground to fight for: it fights for it (groundFoe). Any
      // other order ends that.
      state.groundPost ??= new Map()
      if (sent.forGround) state.groundPost.set(order.unitId, { area: sent.forGround, tile: { ...(given.target ?? sent.groundTile) } })
      else state.groundPost.delete(order.unitId)
      // What his Commander last told him, and when it reached him: his
      // intent, for an officer who must act on it alone (initiative.js).
      ;(state.lastOrder ??= new Map()).set(order.unitId, { turn, action: given.action })
    }
    // Orders marked as from a command post (the computer's, in the app)
    // go by rider from then on.
    if (given.some(o => o?.fromPost)) (state.posts ??= new Set()).add(side)
    if (!byRider(state, side)) {
      for (const order of expanded) give(order)
    } else {
      // A side whose Commander is on the field sends its orders by rider
      // (command/messengers.js). Those on the road arrive first, in the
      // order given; a unit broken or gone by then never gets its order.
      state.riders = state.riders ?? []
      // The enemy may have caught a rider on the road (messengers.js,
      // ridersTaken). His order never arrives, and the side that took him
      // reads it. His own side is not told: no word comes back. Kept in
      // state.lostRiders, so that his Commander still believes the order on
      // the road until it should have arrived (web/battles.js, onTheRoad).
      for (const { rider, by, at } of ridersTaken(state, side, turn, state.riderRandom)) {
        state.riders = state.riders.filter(r => r !== rider)
        ;(state.lostRiders ??= []).push(rider)
        const { fromPost, unitId, unitRef, ...order } = rider.order
        log.emit('riderTaken', turn, {
          side: by.side, unitId: by.id, from: side, to: rider.unitId, at: { ...at },
          order: normalizeOrder({ unitId: rider.unitId, ...order })
        })
      }
      const due = state.riders.filter(r => r.side === side && r.arrives <= turn)
      state.riders = state.riders.filter(r => !due.includes(r))
      for (const r of due) if (effective.some(u => u.id === r.unitId)) give(r.order)
      const road = expanded.length > 0 ? riders(state, side) : null
      for (const order of expanded) {
        const unit = getUnit(world, order.unitId)
        const ticks = road ? road.ticks(unit) : Infinity
        if (ticks === Infinity) {
          log.emit('riderBlocked', turn, { side, unitId: order.unitId })
          continue
        }
        // A newer order does not overtake one still on the road.
        const behind = Math.max(0, ...state.riders.filter(r => r.unitId === order.unitId).map(r => r.arrives))
        const arrives = Math.max(turn + ticks, behind)
        if (arrives <= turn) { give(order); continue }
        state.riders.push({ side, unitId: order.unitId, order, sent: turn, arrives, path: road.path(unit) })
        log.emit('riderSent', turn, { side, unitId: order.unitId, minutes: (arrives - turn) * 10 })
      }
    }
    const fresh = freshThisTurn

    const edge = spec.sides?.[side]?.homeEdge ?? 'west'
    const context = (unit) => ({
      fresh: fresh.has(unit.id),
      nearestEnemy: (u) => toPress(u, { toGround: true }),
      namedEnemy: (u, id) => toFollow(u, id),
      followed: (u, order) => followed(u, order),
      homeTarget: (u) => edgeTarget(map, u.position, edge),
      ...(state.camps ? { campWay: (u, order) => camps.campWay(state, u, order) } : {})
    })

    const onHisOwn = ownJudgement(side, effective)
    // Units keeping by another are planned last, so that each knows where
    // the one it keeps by is making for this turn (followed, below). With
    // no follow order the order is as it always was.
    const keeping = (u) => state.orderBook.get(u.id)?.action === 'follow'
    for (const unit of [...effective.filter(u => !keeping(u)), ...effective.filter(keeping)]) {
      // The order's condition, if it has one and its moment has come: the
      // unit does the other thing, from now on. (Or its officer, having
      // lost that part, does as his nature tells him.)
      let current = state.orderBook.get(unit.id)
      // A veteran no word can reach, who sees things have changed, acts on
      // his Commander's intent (command/initiative.js).
      const own = onHisOwn?.(unit, current)
      if (own) {
        current = own
        state.orderBook.set(unit.id, current)
        freshThisTurn.add(unit.id)
      }
      if (current?.when && whenTrue(unit, current.when)) {
        if (current.when.lost) {
          current = loseThread(unit, 'condition', current)
        } else {
          const { type, kind = null } = current.when
          current = { ...current.when.do }
          log.emit('reacted', turn, { unitId: unit.id, when: type, kind, action: current.action, target: current.target ? { ...current.target } : null })
        }
        state.orderBook.set(unit.id, current)
        freshThisTurn.add(unit.id)
      }

      let { move, order, lostThread, quarryGone, joins, followLost } = planUnit(unit, current, context(unit))
      if (quarryGone) log.emit('quarryGone', turn, { unitId: unit.id, on: quarryGone })
      if (followLost) log.emit('followLost', turn, { unitId: unit.id, on: followLost.on, why: followLost.why })
      if (joins) joining.add(unit.id)
      if (lostThread) {
        // He has done what he remembered, and not what came after.
        const instead = loseThread(unit, 'steps', current);
        ({ move, order } = planUnit(unit, instead, context(unit)))
      }
      if (order) state.orderBook.set(unit.id, order)
      else state.orderBook.delete(unit.id)
      // Sent to the ground to fight for: at an enemy on it or beside it;
      // else, holding there and pushed off its place, back to it.
      const post = state.groundPost?.get(unit.id)
      if (post && order && T.GROUND_FIGHT.ORDERS.concat('hold').includes(order.action) && !shaken(unit) && ranged.missileRange(unit) === 0) {
        const foe = groundFoe(unit, post.area)
        if (foe) {
          orders.push({ unitId: unit.id, target: overTheWater(unit, foe.position), seeking: true, careful: Boolean(order.careful) })
          forGround.add(unit.id)
          continue
        }
        if (order.action === 'hold' && !samePosition(unit.position, post.tile)) move = { unitId: unit.id, target: { ...post.tile } }
      }
      // A unit rallied with no heart in it (shaken) will not go at the
      // enemy: it would break at the first blow, rally, be sent in and
      // break again, for ever (the loose ends of November 24: Raven Ridge,
      // Kush against Samnium, seed 14880801 of the captive league). Told to,
      // it holds where it stands, keeping the order, until its men take
      // heart; its report says so, once an order.
      if (order && shaken(unit) && (SEEKING_ORDERS.includes(order.action))) {
        heldBack.add(unit.id)
        state.heldBack ??= new Map()
        if (state.heldBack.get(unit.id) !== order) {
          state.heldBack.set(unit.id, order)
          log.emit('heldBack', turn, { unitId: unit.id, action: order.action, morale: resolver.getState(unit.id)?.morale ?? null })
        }
        orders.push({ unitId: unit.id, target: 'hold', seeking: false })
        continue
      }
      // Missile troops told to press the enemy do it their own way: they
      // close until they can shoot, and stand there shooting.
      const pressing = order ? order.action === 'advance' : standingFor(unit) === 'advance'
      if (pressing && standsOff(unit)) {
        // Fire and retreat: it falls back before men it can outmarch
        // coming at it, and shoots again when it stands (skirmish.js).
        const back = skirmishFrom(unit)
        if (back) {
          skirmishing.set(unit.id, back.from)
          orders.push({ unitId: unit.id, target: back.to, seeking: false })
          continue
        }
        orders.push({ unitId: unit.id, target: 'hold', seeking: true })
        continue
      }
      // Missile troops close to shooting distance, not to blows.
      if (pressing && move && move.target !== 'hold' && canSkirmish(unit)) move = { ...move, target: withinShot(unit, move.target) }
      // Going in at an enemy in sight close across a ford or bridge: into
      // the crossing first (crossing.js).
      else if (move && move.target !== 'hold' && (pressing || order?.enemy)) move = { ...move, target: overTheWater(unit, move.target) }
      if (move) {
        const held = state.orderBook.get(unit.id)
        orders.push({
          ...move,
          seeking: joining.has(unit.id) || isSeeking(held, standingFor(unit)),
          careful: Boolean(held?.careful)
        })
        continue
      }

      // Standing orders. A side declared as `advance` presses the nearest
      // enemy whenever a unit has no order of its own — the simplest
      // deterministic aggression there is, and the reason a battle between
      // two willing armies cannot stall into two lines standing out of range
      // staring at each other. (A side without standing orders holds, which
      // is also a choice: a unit is allowed to stand.)
      if (standingFor(unit) === 'advance') {
        const enemy = toPress(unit)
        if (enemy) orders.push({ unitId: unit.id, target: overTheWater(unit, enemy.position), seeking: true })
      }
    }
  }

  const positionsAtTurnStart = new Map(
    livingUnits(world).map(u => [u.id, { ...u.position }]))

  for (const unit of livingUnits(world)) {
    if (!broken.has(unit.id)) continue
    const edge = spec.sides?.[unit.side]?.homeEdge ?? 'west'
    // In a camp battle, for its own camp while it stands, and no further
    // once inside it (battle/camp.js).
    const refuge = state.camps ? camps.refugeOf(state, unit) : null
    if (refuge && refuge(unit.position)) continue
    // For its own edge by the cheapest open way, round the enemy; cut off
    // from it, away from him (flightPath).
    const way = flightPath(map, world, unit, edge, broken, refuge)
    orders.push(way
      ? { unitId: unit.id, target: way[way.length - 1], path: way, fleeing: true }
      : { unitId: unit.id, target: chooseFlightTarget(map, world, unit, edge), fleeing: true })
  }

  // The unit carrying its camp goes at a share of its pace (battle/camp.js).
  if (state.camps) {
    for (const o of orders) if (!o.fleeing && camps.carries(state, getUnit(world, o.unitId))) o.pace = T.CAMP.CARRY_PACE
  }

  // ── Movement (phase 3) ──────────────────────────
  // ── Ambushes ────────────────────────────────
  // A unit under an ambush order, standing where it was told to lie in
  // wait, decides as each enemy steps within reach whether to strike.
  const ambushers = new Set(livingUnits(world)
    .filter(u => !broken.has(u.id) && state.orderBook.get(u.id)?.action === 'ambush')
    .filter(u => { const o = state.orderBook.get(u.id); return !o.target || samePosition(o.target, u.position) })
    .map(u => u.id))
  const sprung = new Set()
  const heldLogged = new Set()
  const decideAmbush = (ambusher, passer, { careful }) => {
    const order = state.orderBook.get(ambusher.id)
    if (!matchesKind(passer, order.against)) return null
    const options = state.hidden.has(passer.id) ? { seenWithin: state.hidden.get(passer.id).seenWithin } : {}
    if (!canSee(map, ambusher, passer, options)) return null
    const held = (reason) => {
      const key = `${ambusher.id}|${passer.id}|${reason}`
      if (!heldLogged.has(key)) log.emit('ambushHeld', turn, { unitId: ambusher.id, on: passer.id, reason })
      heldLogged.add(key)
      return null
    }
    order.passed = order.passed ?? []
    if (order.passed.includes(passer.id)) return null
    // Not worth it against a unit on guard, unless told to strike anyway.
    if (careful && !order.regardless) return held('on guard')
    if (order.passed.length < order.letPass) {
      order.passed.push(passer.id)
      return held('letting it pass')
    }
    sprung.add(ambusher.id)
    log.emit('ambush', turn, { unitId: ambusher.id, on: passer.id, at: { ...passer.position } })
    return 'spring'
  }

  const movement = resolveSimultaneousMovement(world, orders, map, {
    hidden: new Set(state.hidden.keys()), ambushers, ambush: decideAmbush,
    engaged: new Set(engagedAtStart.keys()), glue: T.DISENGAGE.MOVE_COST,
    // Units on the march keep a tile apart: in column, round or waiting
    // (tables.MARCH).
    keepApart: true
  })

  // A sprung ambush is spent: the unit presses the attack on the nearest
  // enemy (most often the one it caught) until given a new order. Holding
  // instead let a caught column simply march on after one round.
  for (const id of sprung) state.orderBook.set(id, { action: 'advance', target: null, then: null })

  // Moving gives a hidden unit away, and so does being walked into.
  for (const move of movement) {
    if (move.tilesMoved > 0) reveal(move.unitId, 'moved')
    if (move.stumbledOn) reveal(move.stumbledOn, 'stumbled on', move.unitId)
  }

  // The log says who fell back (only those that moved: one hemmed in
  // stands where it is).
  for (const [id, from] of [...skirmishing].sort(([x], [y]) => x.localeCompare(y))) {
    const move = movement.find(m => m.unitId === id)
    if (!(move?.tilesMoved > 0)) continue
    log.emit('gaveGround', turn, { unitId: id, from, to: { ...getUnit(world, id).position } })
  }

  // ── Leaving a fight ─────────────────────────────
  // A unit that was fighting and has stepped clear of every enemy it fought
  // takes a parting blow: how hard is a chaos roll, softened by drill and by
  // withdrawing carefully (DISENGAGE). Broken units are pursued instead.
  const moves = new Map(movement.map(m => [m.unitId, m]))
  for (const [id, foes] of [...engagedAtStart].sort(([x], [y]) => x.localeCompare(y))) {
    const unit = getUnit(world, id)
    const move = moves.get(id)
    if (!unit || unit.strength <= 0 || broken.has(id) || !move || !(move.tilesMoved > 0)) continue
    const standing = [...foes].map(f => getUnit(world, f))
      .filter(f => f && f.strength > 0 && !broken.has(f.id))
    if (standing.length === 0) continue
    if (standing.some(f => tileDistance(f.position, unit.position) <= 1)) continue

    const roll = random()
    const drill = T.DISENGAGE.DRILL[unit.quality] ?? T.DISENGAGE.DRILL.tribal_warriors
    const orderly = move.careful ? T.DISENGAGE.ORDERLY : 1
    // (Sarmatia's feigned retreat lightens it: combat/perks.js.)
    const weight = roll * drill * orderly * perks.disengageWeight(unit)
    const killed = Math.min(unit.strength,
      Math.round(unit.strength * T.DISENGAGE.CASUALTY_FRACTION * weight * Math.min(standing.length, 2)))
    const morale = Math.round(T.DISENGAGE.MORALE * weight * 10) / 10
    unit.strength -= killed
    if (morale > 0) resolver.shake(unit, morale)
    log.emit('disengage', turn, {
      unitId: id, from: standing.map(f => f.id).sort(), killed, morale,
      chaos: Math.round(roll * T.CHAOS.MAX * 10) / 10, orderly: Boolean(move.careful)
    })
    if (unit.strength === 0) log.emit('destroyed', turn, { unitId: id })
  }
  for (const move of movement) {
    if (move.skipped || move.held || move.failed) continue
    log.emit('move', turn, {
      unitId: move.unitId, from: { ...move.from }, to: { ...move.to },
      reachedTarget: move.reachedTarget, blockedBy: move.blockedBy
    })
    // A unit that just reached the place its order sent it. `then` says what
    // it does now: 'hold' (digs in) or 'standing' (back to its side's
    // standing orders).
    const order = state.orderBook.get(move.unitId)
    if (move.reachedTarget && order && order.action !== 'hold' && order.action !== 'advance' && order.action !== 'follow' && order.action !== 'pitch' && order.action !== 'strike' && !order.enemy) {
      log.emit('arrived', turn, {
        unitId: move.unitId, action: order.action, at: { ...move.to },
        then: order.then === 'hold' ? 'hold' : 'standing',
        // More of the order to come (a chain's next steps).
        ...(order.steps?.length ? { more: order.steps.length } : {})
      })
    }
  }

  // An order carried over from an earlier turn that got nowhere this tick is
  // done: the place is taken or out of reach. Without this, a unit sent to a
  // tile a friend now holds would stand beside it forever. It digs in if
  // told to, else rejoins its side's standing orders, and the log says why.
  // (Orders given this turn keep trying: traffic may clear.)
  for (const move of movement) {
    const order = state.orderBook.get(move.unitId)
    if (!order || freshThisTurn.has(move.unitId)) continue
    if (!['move', 'defend', 'withdraw'].includes(order.action)) continue
    const stuck = move.failed || (!move.held && !move.skipped && move.tilesMoved === 0)
    if (!stuck || move.failed === 'already there') continue
    // Waiting its turn behind its own men, who are on the move or fighting
    // (a column at a ford): it keeps its order and goes on when they do.
    if (move.queued?.busy) continue

    const then = order.then === 'hold' ? 'hold' : 'standing'
    if (then === 'hold') state.orderBook.set(move.unitId, { action: 'hold', target: null, then: null })
    else state.orderBook.delete(move.unitId)
    const unit = getUnit(world, move.unitId)
    log.emit('halted', turn, {
      unitId: move.unitId, action: order.action, at: { ...unit.position },
      reason: move.failed ? 'no way there' : 'blocked', blockedBy: move.blockedBy ?? null, then
    })
  }

  // The camp taken up and pitched by those told to (battle/camp.js).
  if (state.camps) camps.settleCampOrders(state, { turn, log, broken, movement })

  // ── Flight off the field ────────────────────────
  // A broken unit standing on its home edge after moving has left the
  // battle. Removed from the roster so occupancy, engagement detection and
  // victory all agree it is gone; the unit object survives in the record,
  // because the veterans phase cares who lived.
  for (const unit of [...livingUnits(world)]) {
    if (!broken.has(unit.id)) continue
    const edge = spec.sides?.[unit.side]?.homeEdge ?? 'west'
    // (Sheltering in its own camp, pitched at the edge, it has not left.)
    if (state.camps && camps.inOwnCamp(state, unit)) continue
    if (isOnEdge(map, unit.position, edge)) {
      world.units.splice(world.units.indexOf(unit), 1)
      fledUnits.push({ ...unit })
      log.emit('fled', turn, { unitId: unit.id, side: unit.side, strength: unit.strength })
    }
  }

  // ── Contact ─────────────────────────────────────
  // Broken units do not fight — they are handled by pursuit, not by the
  // resolver. Filtered here rather than removed from the world, because
  // they still hold ground (a fleeing column blocks a tile like anyone).
  //
  // Two units side by side fight only if one of them is looking for a fight,
  // or they were already fighting (Stage 3). A unit that is not can stand
  // beside an enemy, or walk past it, and no blow is struck.
  // A unit cannot pick a fight with an enemy its side cannot see, so a
  // hidden force lets a column march by unless it chooses to strike.
  const seeking = (id) => {
    const unit = getUnit(world, id)
    if (heldBack.has(id)) return false
    return sprung.has(id) || joining.has(id) || forGround.has(id) || isSeeking(state.orderBook.get(id), standingFor(unit))
  }
  const seenNow = sightBySide(map, world, state.hidden)
  const picksFight = (id, otherId) =>
    seeking(id) && seenNow.get(getUnit(world, id).side)?.has(otherId)
  const engagements = detectEngagements(world, engagementRange, map)
    .filter(e => !broken.has(e.aId) && !broken.has(e.bId))
    .filter(e => picksFight(e.aId, e.bId) || picksFight(e.bId, e.aId) ||
      state.previousEngagementKeys.has(`${e.aId}|${e.bId}`))
  for (const e of engagements) {
    reveal(e.aId, 'fought')
    reveal(e.bId, 'fought')
  }
  // Fought from inside a camp, or by the unit carrying one (battle/camp.js).
  if (state.camps) camps.markEngagements(state, engagements)

  // How each unit spent the turn: marching (moved at full pace) or on guard
  // (moved carefully, or stood).
  const marching = new Set(movement
    .filter(m => !m.skipped && !m.held && !m.failed && m.tilesMoved > 0 && !m.careful)
    .map(m => m.unitId))

  // Units that set out to march this turn, however far they got: one stopped
  // short by the enemy stepping up first was no more ready than the enemy.
  const setOut = new Set(movement
    .filter(m => !m.skipped && !m.held && !m.failed && !m.careful)
    .map(m => m.unitId))

  for (const engagement of engagements) {
    const key = `${engagement.aId}|${engagement.bId}`
    if (state.previousEngagementKeys.has(key)) continue
    log.emit('contact', turn, { aId: engagement.aId, bId: engagement.bId })

    // Surprise: the one who sought the fight was unseen by the other side
    // when the turn began, and caught the other on the march. It must have
    // been ready for it: standing in wait, or on the move toward an enemy it
    // had already seen. Two columns that blunder into each other in a wood
    // are both startled, and neither has the advantage.
    const surprises = []
    for (const [by, target] of [[engagement.aId, engagement.bId], [engagement.bId, engagement.aId]]) {
      const victim = getUnit(world, target)
      if (!seeking(by) || !marching.has(target)) continue
      if (seenAtStart.get(victim.side)?.has(by)) continue
      if (setOut.has(by) && !seenAtStart.get(getUnit(world, by).side)?.has(target)) continue
      // A rallied unit still shaken is in no state to spring anything.
      if (shaken(getUnit(world, by))) continue
      surprises.push(by)
      log.emit('surprise', turn, { unitId: target, by, posture: 'marching' })
    }
    if (surprises.length > 0) engagement.surprisedBy = surprises
  }
  // The fights begun this tick, for the throw at contact (below).
  const newContacts = engagements.filter(e => !state.previousEngagementKeys.has(`${e.aId}|${e.bId}`))
  state.previousEngagementKeys = new Set(engagements.map(e => `${e.aId}|${e.bId}`))

  // Units beaten this turn (broken or destroyed), for those who take heart
  // at it below.
  const beaten = []

  // ── Missiles ────────────────────────────────────
  // Every missile unit that stood still this turn (horse archers may have
  // ridden), is in no melee, is not lying hidden and has not been told to
  // hold its fire looses one volley at an enemy in reach: the kind it was
  // told to shoot first, if one is there, else the nearest. An enemy locked
  // in a melee can be shot at, to less effect. All volleys fly at once, so
  // two bodies of archers shoot each other.
  const inMelee = new Set(engagements.flatMap(e => [e.aId, e.bId]))
  const movedFar = new Set(movement.filter(m => (m.tilesMoved ?? 0) > 0).map(m => m.unitId))
  const loosed = []
  for (const shooter of [...livingUnits(world)].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!ranged.missileRange(shooter) || broken.has(shooter.id) || inMelee.has(shooter.id)) continue
    if (state.hidden.has(shooter.id)) continue
    const order = state.orderBook.get(shooter.id)
    if (order?.holdFire || order?.action === 'hide' || order?.action === 'ambush') continue
    const moved = movedFar.has(shooter.id)
    if (moved && !shooter.mounted) continue

    // (An attack on a named enemy shoots at that enemy first.)
    const first = order?.against ?? null
    const wanted = (e) => first ? matchesKind(e, first) : Boolean(order?.enemy) && e.id === order.enemy
    const target = livingUnits(world)
      .filter(e => canShootAt(shooter, e, seenNow))
      .map(e => ({ unit: e, distance: tileDistance(shooter.position, e.position), wanted: wanted(e) ? 0 : 1 }))
      .sort((x, y) => x.wanted - y.wanted || x.distance - y.distance || x.unit.id.localeCompare(y.unit.id))[0]
    if (!target) continue
    loosed.push({
      shooter, target: target.unit, distance: target.distance,
      felled: ranged.volley(shooter, target.unit, {
        distance: target.distance, targetTerrain: map.terrainAt(target.unit.position), moved, inMelee: inMelee.has(target.unit.id)
      }) * ranged.alongside(shooter, livingUnits(world))
    })
  }
  const volleys = []
  state.shotLastTurn = new Set(loosed.map(l => l.target.id))
  for (const { shooter, target, distance, felled } of loosed) {
    if (target.strength <= 0) continue
    const hit = resolver.volley(target, felled, turn)
    const [applied] = applyCasualties(world, [{ unitId: target.id, killed: hit.killed }])
    volleys.push({ unitId: target.id, by: shooter.id, killed: hit.killed })
    // Men who are shot at can tell where it is coming from, though they
    // cannot see the archers: their side remembers the place.
    if (!seenNow.get(target.side)?.has(shooter.id)) {
      if (!state.lastSeen.has(target.side)) state.lastSeen.set(target.side, new Map())
      state.lastSeen.get(target.side).set(shooter.id, { ...shooter.position })
    }
    log.emit('volley', turn, { unitId: target.id, by: shooter.id, killed: hit.killed, remaining: target.strength, distance })
    if (applied?.destroyed) {
      log.emit('destroyed', turn, { unitId: target.id })
      beaten.push(target.id)
    } else if (hit.broke && !broken.has(target.id)) {
      broken.add(target.id)
      log.emit('rout', turn, { unitId: target.id, by: shooter.id })
      beaten.push(target.id)
    }
  }

  // ── The throw at contact ────────────────────────
  // A unit that carries a thrown weapon beside its hand weapon (javelins,
  // pila: docs/design/army-balance.md, part 8), and has throws left, looses
  // one volley of it as it comes to blows: whether it closed or was closed
  // on, and whether or not it moved, for the throw is part of the charge,
  // not shooting on the move. One throw a tick, at the first enemy it came
  // to blows with (by name). Both sides throw at once, then fight.
  const throwers = new Map()
  for (const e of newContacts) {
    for (const [by, at] of [[e.aId, e.bId], [e.bId, e.aId]]) {
      const unit = getUnit(world, by)
      if (!unit?.thrown || !(unit.throws > 0) || broken.has(by) || broken.has(at)) continue
      if (!throwers.has(by) || at.localeCompare(throwers.get(by)) < 0) throwers.set(by, at)
    }
  }
  const thrown = [...throwers].sort(([x], [y]) => x.localeCompare(y)).map(([by, at]) => {
    const thrower = getUnit(world, by)
    const target = getUnit(world, at)
    return { thrower, target, felled: ranged.thrownVolley(thrower, target, { targetTerrain: map.terrainAt(target.position) }) }
  })
  for (const { thrower, target, felled } of thrown) {
    thrower.throws -= 1
    if (target.strength <= 0) continue
    const hit = resolver.volley(target, felled, turn)
    const [applied] = applyCasualties(world, [{ unitId: target.id, killed: hit.killed }])
    log.emit('thrown', turn, { unitId: target.id, by: thrower.id, weapon: thrower.thrown, killed: hit.killed, remaining: target.strength })
    if (applied?.destroyed) {
      log.emit('destroyed', turn, { unitId: target.id })
      beaten.push(target.id)
    } else if (hit.broke && !broken.has(target.id)) {
      broken.add(target.id)
      log.emit('rout', turn, { unitId: target.id, by: thrower.id })
      beaten.push(target.id)
    }
  }

  // ── Combat (phase 2) ────────────────────────────
  let casualties = []
  if (engagements.length > 0) {
    const combat = resolver({ engagements, world, random, turn })
    casualties = applyCasualties(world, combat.casualties)

    // The resolver's own rout events are not copied: the battle emits one
    // rout per broken unit below, with pursuit, and the log holds each fact
    // once.
    for (const { type, ...fields } of combat.events) {
      if (type !== 'rout') log.emit(type, turn, fields)
    }
    for (const applied of casualties) {
      if (applied.destroyed) {
        log.emit('destroyed', turn, { unitId: applied.unitId })
      }
    }

    // ── Push, positionally ────────────────────────
    applyPushes(map, world, combat.pushes, turn, log)

    // ── Routs ─────────────────────────────────────
    for (const rout of combat.routed) {
      broken.add(rout.unitId)
      log.emit('rout', turn, { unitId: rout.unitId, by: rout.by })
      applyPursuit(world, getUnit(world, rout.unitId), turn, log, broken)
    }

    beaten.push(
      ...combat.routed.map(r => r.unitId),
      ...casualties.filter(c => c.destroyed).map(c => c.unitId))
  }

  // ── Taking heart ────────────────────────────────
  // An enemy breaking, or cut down to the last man, lifts everyone of the
  // other side who is near enough to see it (ruled 2026-11-21: morale comes
  // back only with success nearby). One event a unit, however many enemies
  // went at once.
  const lifted = new Map()
  for (const id of [...new Set(beaten)].sort()) {
    const loser = getUnit(world, id)
    if (!loser) continue
    for (const friend of livingUnits(world)) {
      if (friend.side === loser.side) continue
      if (tileDistance(friend.position, loser.position) > T.HEART.RANGE) continue
      const morale = resolver.hearten(friend, T.HEART.MORALE)
      lifted.set(friend.id, { unitId: friend.id, by: lifted.get(friend.id)?.by ?? id, morale })
    }
  }
  for (const id of [...lifted.keys()].sort()) log.emit('heartened', turn, lifted.get(id))

  // ── Pursuit of units already in flight ──────────
  // A broken unit that STARTS a turn adjacent to an enemy is being chased
  // down. (The strike at the moment of breaking is handled above.) One that
  // could not move at all — fled into its own line, or cornered — is being
  // overrun, which is much worse.
  for (const unit of livingUnits(world)) {
    if (!broken.has(unit.id)) continue
    if (log.forTurn(turn).some(e => e.type === 'rout' && e.unitId === unit.id)) continue
    // (Not one that has reached its camp and stopped there: it is not
    // hemmed in, it is home.)
    const trapped = samePosition(positionsAtTurnStart.get(unit.id), unit.position) && !(state.camps && camps.inOwnCamp(state, unit))
    applyPursuit(world, unit, turn, log, broken, trapped)
  }

  // ── Rallying ────────────────────────────────
  // A broken unit that has got clear (no formed enemy within SAFE_TILES,
  // so no one is chasing it) stops running and forms up (ruled 2026-11-21).
  // Not in the turn it broke; not a unit too worn to re-form (how worn
  // depends on its men, its fatigue and its experience: RALLY). It comes
  // back with the morale it had, and under no order: its side's standing
  // order, which for a commander's own units is to hold.
  const brokeThisTurn = new Set(log.forTurn(turn).filter(e => e.type === 'rout').map(e => e.unitId))
  for (const unit of livingUnits(world)) {
    // Inside its own camp, the more easily (battle/camp.js).
    const home = Boolean(state.camps) && camps.inOwnCamp(state, unit)
    if (!broken.has(unit.id) || brokeThisTurn.has(unit.id) || !resolver.canRally(unit, home ? T.CAMP.EASE : 1)) continue
    const safe = home ? T.CAMP.SAFE_TILES : T.RALLY.SAFE_TILES
    const chased = livingUnits(world).some(e =>
      e.side !== unit.side && !broken.has(e.id) && tileDistance(e.position, unit.position) <= safe)
    if (chased) continue
    broken.delete(unit.id)
    state.rallied.set(unit.id, (state.rallied.get(unit.id) ?? 0) + 1)
    state.orderBook.delete(unit.id)
    state.groundPost?.delete(unit.id)
    const morale = resolver.rally(unit)
    log.emit('rallied', turn, { unitId: unit.id, at: { ...unit.position }, strength: unit.strength, morale, ...(home ? { inCamp: true } : {}) })
  }

  // ── The camps ───────────────────────────────
  // Dropped, fought for, burned; wind shed for them; found by the enemy
  // (battle/camp.js).
  if (state.camps) {
    camps.stepCamps(state, { turn, log, broken, resolver })
    camps.seeCamps(state, { turn, log, broken })
  }

  // ── Searching and hiding ────────────────────
  // Both take the turn, standing still, and settle at its end.
  const moved = new Set(movement.filter(m => m.tilesMoved > 0).map(m => m.unitId))
  const fought = new Set(engagements.flatMap(e => [e.aId, e.bId]))
  for (const unit of livingUnits(world)) {
    const order = state.orderBook.get(unit.id)
    if (!order || broken.has(unit.id) || moved.has(unit.id)) continue

    if (order.action === 'check') {
      // What it would see if no one were hiding: in a wood, 1 tile.
      const found = livingUnits(world)
        .filter(e => e.side !== unit.side && state.hidden.has(e.id) && canSee(map, unit, e))
        .map(e => e.id)
        .sort()
      for (const id of found) reveal(id, 'found', unit.id)
      log.emit('checked', turn, { unitId: unit.id, at: { ...unit.position }, found })
      // The search is done: on to the next step of the order, if it has one.
      state.orderBook.set(unit.id, nextStep(order) ?? { action: 'hold', target: null, then: null, ...(order.lostAfter ? { lostAfter: true } : {}) })
    }

    if ((order.action === 'hide' || order.action === 'ambush') && !state.hidden.has(unit.id) && !fought.has(unit.id)) {
      const cover = coverFor(map, unit)
      if (cover.seenWithin === null) {
        log.emit('hideFailed', turn, { unitId: unit.id, at: { ...unit.position }, reason: 'no cover', by: null })
        state.orderBook.set(unit.id, { action: 'hold', target: null, then: null })
        continue
      }
      // A unit cannot hide from an enemy watching it do so. It keeps
      // trying, turn by turn, until it is out of sight.
      const watcher = livingUnits(world)
        .filter(e => e.side !== unit.side && canSee(map, e, unit))
        .sort((x, y) => x.id.localeCompare(y.id))[0]
      if (watcher) {
        log.emit('hideFailed', turn, { unitId: unit.id, at: { ...unit.position }, reason: 'watched', by: watcher.id })
        continue
      }
      state.hidden.set(unit.id, cover)
      log.emit('hidden', turn, { unitId: unit.id, at: { ...unit.position }, cover: cover.name })
    }
  }

  // An enemy lingering right beside a hidden unit grows ever likelier to
  // notice it: 25% the first turn, 50% the next, and so on (EXPOSURE).
  for (const id of [...state.hidden.keys()].sort()) {
    const unit = getUnit(world, id)
    if (!unit || unit.strength <= 0) continue
    const beside = livingUnits(world)
      .filter(e => e.side !== unit.side && tileDistance(e.position, unit.position) <= 1)
      .sort((x, y) => x.id.localeCompare(y.id))
    if (beside.length === 0) { state.exposure.delete(id); continue }
    const turns = (state.exposure.get(id) ?? 0) + 1
    state.exposure.set(id, turns)
    if (random() < Math.min(1, T.EXPOSURE.PER_TURN * turns)) reveal(id, 'noticed', beside[0].id)
  }

  // The cost of hiding where it hurts, such as a marsh; and the dead hide
  // from no one.
  for (const [id, cover] of [...state.hidden]) {
    const unit = getUnit(world, id)
    if (!unit || unit.strength <= 0) { state.hidden.delete(id); continue }
    if (cover.cost?.staminaPerTurn) resolver.tire(unit, cover.cost.staminaPerTurn)
  }

  // ── Crowding ────────────────────────────────
  // Logged when a unit's crowding tier changes, so the narrator can say the
  // ranks are packed too tight, and when they loosen again.
  const crowdingNow = crowdingByUnit(world)
  for (const unit of livingUnits(world)) {
    const tier = crowdingNow.get(unit.id)?.name ?? 'organized'
    const before = state.crowding.get(unit.id) ?? 'organized'
    if (tier !== before) {
      const men = livingUnits(world)
        .filter(u => samePosition(u.position, unit.position))
        .reduce((sum, u) => sum + u.strength, 0)
      log.emit('crowding', turn, { unitId: unit.id, at: { ...unit.position }, men, tier, was: before })
    }
    state.crowding.set(unit.id, tier)
  }

  const turnRecord = {
    turn,
    movement,
    engagements,
    casualties,
    // Missile fire this turn: { unitId (the target), by, killed }.
    volleys,
    broken: [...broken].sort(),
    snapshot: cloneWorld(world)
  }

  // ── The Commanders ──────────────────────────────
  if (state.commanders) {
    const fell = stepCommanders({
      commanders: state.commanders, world, broken, fledUnits,
      events: log.forTurn(turn), mustered: state.mustered, random: state.commanderRandom,
      ...(state.camps ? { sheltered: (unit) => camps.inOwnCamp(state, unit) } : {})
    })
    for (const e of fell) log.emit(e.type, turn, e.fields)
    // A Commander who gets free brings out what he heard in the enemy's
    // camp, where every report came in (ruled 2026-11-23: "you know where
    // everyone they have is"): his side now knows where each enemy unit
    // stood as he left.
    for (const e of fell.filter(e => e.type === 'commanderFreed')) {
      const side = e.fields.side
      if (!state.lastSeen.has(side)) state.lastSeen.set(side, new Map())
      for (const enemy of livingUnits(world).filter(u => u.side !== side)) state.lastSeen.get(side).set(enemy.id, { ...enemy.position })
    }
  }

  // ── Victory ─────────────────────────────────────
  const allSides = [...new Set(spec.units.map(u => u.side))]
  const outcome = commandersOutcome(state.commanders, allSides) ?? yieldedOutcome(state.yielded, allSides) ??
    checkBattleOutcome(world, broken, state.isShaken, state.camps ? (side) => camps.holdsOut(state, side) : null)
  if (outcome.decided) {
    state.outcome = outcome
    log.emit('victory', turn, { winner: outcome.winner, reason: outcome.reason })
  }

  return turnRecord
}

/**
 * Run one scripted battle to its end — the closed-loop form the phase 4 exit
 * criterion and scenarios use. When the script runs out every unit holds
 * (standing orders permitting); a stuck battle still fights, because standing
 * engagements keep resolving.
 */
function runBattle(spec, options = {}) {
  const state = createBattleState(spec, options)
  const maxTurns = spec.maxTurns ?? DEFAULT_MAX_TURNS

  const record = {
    name: spec.name,
    seed: state.seed,
    turns: [],
    outcome: { decided: false, winner: null, reason: 'battle still open' },
    fled: state.fledUnits,
    events: null // filled at the end
  }

  for (let turn = 1; turn <= maxTurns; turn++) {
    const script = spec.turns?.[turn - 1] ?? {}
    record.turns.push(stepTurn(state, script))

    if (state.outcome.decided) {
      record.outcome = state.outcome
      break
    }
  }

  if (!record.outcome.decided) {
    record.outcome = { decided: false, winner: null, reason: `undecided after ${maxTurns} turns` }
  }

  record.events = state.log.all()
  return record
}

// ── Push-back ────────────────────────────────────────────
//
// The loser of a strong shove moves one tile directly away from the winner,
// and the winner follows up into the vacated ground — the line steps forward.
// Without the follow-up a successful shove SEPARATED the pair (distance 2
// ends the engagement), so winning the push rewarded the loser with a clean
// disengage — the first fixture battles showed a beaten levy simply shoved
// out of contact and left in peace. Because terrain comes from position, a
// unit shoved off a hill has lost the high ground the moment they land,
// and the winner has taken it. A shove into friends with room crowds in
// among them (Stage 3); a shove into an enemy, a full tile, impassable
// ground or off the map does not move anyone and is logged as `crush`. Whether crush
// should cost extra morale is an open tuning question (locked decision 3
// hints at stacking pressure), left visible in the log rather than guessed.
function applyPushes(map, world, pushes, turn, log) {
  const occupancy = buildOccupancy(world)

  for (const push of pushes) {
    const loser = getUnit(world, push.loserId)
    const winner = getUnit(world, push.winnerId)
    if (!loser || !winner || loser.strength === 0) continue

    const backTile = tileAwayFrom(map, winner.position, loser.position)
    if (!backTile) {
      log.emit('crush', turn, { unitId: loser.id, by: winner.id, reason: 'map edge' })
      continue
    }

    const terrain = map.terrainAt(backTile)
    if (!map.passable(backTile)) {
      log.emit('crush', turn, { unitId: loser.id, by: winner.id, reason: 'impassable' })
      continue
    }

    const entry = canEnter(occupancy, loser, backTile)
    if (!entry.ok) {
      log.emit('crush', turn, { unitId: loser.id, by: winner.id, reason: entry.reason, blocker: entry.blocker })
      continue
    }

    const fromTerrain = map.terrainAt(loser.position)
    const vacated = { ...loser.position }
    moveUnit(occupancy, loser, backTile)

    // The winner follows up only into ground the loser's side has left: a
    // friend of the loser still standing there holds it.
    if (map.passable(vacated) && canEnter(occupancy, winner, vacated).ok) {
      moveUnit(occupancy, winner, vacated)
    }

    log.emit('push', turn, {
      unitId: loser.id, by: winner.id, fromTerrain,
      to: { ...backTile }, toTerrain: terrain,
      winnerAdvancedTo: { ...winner.position },
      lostHighGround: T.HIGH_GROUND_TERRAIN.includes(fromTerrain) &&
        !T.HIGH_GROUND_TERRAIN.includes(terrain)
    })
  }
}

// One orthogonal tile continuing the winner->loser line, or null off-map.
// Engagement range is 1 Manhattan, so the pair is orthogonally adjacent and
// the line is always a clean row or column step.
function tileAwayFrom(map, winnerPosition, loserPosition) {
  const w = toPosition(winnerPosition)
  const l = toPosition(loserPosition)
  const back = { x: l.x + Math.sign(l.x - w.x), y: l.y + Math.sign(l.y - w.y) }
  return map.inBounds(back) ? back : null
}

// ── Pursuit ──────────────────────────────────────────────
// A caught fleeing unit bleeds; a TRAPPED one — no ground gained this turn —
// is overrun at three times the rate. MIN_KILLED guarantees convergence: the
// first battle runs produced an immortal nine-man remnant whose 10% losses
// rounded to zero, gridlocking both armies behind it past the turn cap.
// Only formed units pursue: men who are running themselves cut no one down.
function applyPursuit(world, unit, turn, log, broken, trapped = false) {
  if (!unit || unit.strength === 0) return

  const pursuers = livingUnits(world)
    .filter(u => u.side !== unit.side && !broken.has(u.id) && tileDistance(u.position, unit.position) <= 1)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, T.PURSUIT.MAX_PURSUERS)

  const fraction = trapped ? T.PURSUIT.TRAPPED_FRACTION : T.PURSUIT.CASUALTY_FRACTION

  for (const pursuer of pursuers) {
    const killed = Math.min(unit.strength,
      Math.max(T.PURSUIT.MIN_KILLED, Math.round(unit.strength * fraction)))
    unit.strength -= killed
    log.emit('pursuit', turn, {
      unitId: unit.id, by: pursuer.id, killed, remaining: unit.strength, trapped
    })
    if (unit.strength === 0) {
      log.emit('destroyed', turn, { unitId: unit.id })
      break
    }
  }
}

// ── Flight routing ───────────────────────────────────────
// A broken unit flees toward its home edge, but not blindly down its own row:
// fleeing into the back of a friendly line was the first thing the meeting
// battle produced, and it jammed both armies. Candidate flight lanes are the
// unit's own row and the rows up to three either side, nearest first; the
// first lane whose first step is not blocked by a FRIENDLY wins. An enemy in
// the way does not reroute the flight — running along the enemy line instead
// of away from it is not flight — it means the unit is caught, and the
// trapped-overrun rule above settles it.
function chooseFlightTarget(map, world, unit, edge) {
  const occupancy = buildOccupancy(world)
  const pos = unit.position

  for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
    const target = offsetEdgeTarget(map, pos, edge, offset)
    if (!target || samePosition(target, unit.position)) continue

    const path = findPath(map, unit.position, target)
    if (!path || path.length < 2) continue

    const entry = canEnter(occupancy, unit, path[1])
    if (entry.ok || entry.reason === 'enemy') return target
  }

  // Every lane is walled off by friends. Aim down the unit's own row anyway —
  // it will stand, count as trapped, and the overrun rule applies.
  return edgeTarget(map, unit.position, edge)
}

// The way a broken unit runs (the second playthrough of November 24, S7: a
// unit whose way home lay through an enemy stood and was cut down for an
// hour and more; two broken units of either side, each in the other's way,
// stood for hours, for neither pursues). The cheapest way to any tile of its
// own edge, never through an enemy, dearer through its own men and beside a
// formed enemy (tables.FLIGHT); the nearer its own row (or column) on a
// tie, so on open ground it runs straight back, as before. With no way to
// its edge at all, it runs from the enemy: to the ground it can reach within
// FLIGHT.AWAY tiles farthest from any formed enemy. Null when it can get no
// farther from him than it stands (it is caught, and pursuit settles it).
// The path includes where it stands.
function flightPath(map, world, unit, edge, broken, goal = null) {
  const start = toPosition(unit.position)
  const enemyAt = new Set()
  const formed = []
  const friendAt = new Set()
  for (const u of livingUnits(world)) {
    if (u === unit) continue
    if (u.side === unit.side) { friendAt.add(positionKey(u.position)); continue }
    enemyAt.add(positionKey(u.position))
    if (!broken.has(u.id)) formed.push(u.position)
  }
  const besideEnemy = (p) => formed.some(e => tileDistance(e, p) <= 1)
  const horizontal = edge === 'west' || edge === 'east'
  const off = (p) => horizontal ? Math.abs(p.y - start.y) : Math.abs(p.x - start.x)
  // Between two ways alike, the one to its right as it runs, so that two
  // running past each other from either side keep apart.
  const right = (p) => ({ west: p.y, east: -p.y, north: -p.x, south: p.x }[edge] ?? p.y)
  const less = (a, b) => a.cost - b.cost || a.off - b.off || right(a.p) - right(b.p) || a.p.y - b.p.y || a.p.x - b.p.x
  const heap = []
  const push = (n) => {
    heap.push(n)
    for (let i = heap.length - 1; i > 0;) {
      const j = (i - 1) >> 1
      if (less(heap[i], heap[j]) >= 0) break
      ;[heap[i], heap[j]] = [heap[j], heap[i]]; i = j
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length > 0) {
      heap[0] = last
      for (let i = 0; ;) {
        const l = 2 * i + 1; const r = l + 1; let m = i
        if (l < heap.length && less(heap[l], heap[m]) < 0) m = l
        if (r < heap.length && less(heap[r], heap[m]) < 0) m = r
        if (m === i) break
        ;[heap[i], heap[m]] = [heap[m], heap[i]]; i = m
      }
    }
    return top
  }
  const best = new Map([[positionKey(start), 0]])
  const from = new Map()
  const done = new Set()
  const reached = []
  push({ p: start, cost: 0, off: 0 })
  const pathTo = (key, p) => {
    const path = [p]
    for (let k = key; from.has(k);) { const prev = from.get(k); path.unshift(prev.p); k = prev.key }
    return path
  }
  while (heap.length > 0) {
    const { p, cost } = pop()
    const key = positionKey(p)
    if (done.has(key)) continue
    done.add(key)
    reached.push({ p, cost, key })
    // (Its own camp instead of its edge, in a camp battle: goal.)
    if (!samePosition(p, start) && (goal ? goal(p) : isOnEdge(map, p, edge))) return pathTo(key, p)
    for (const n of map.neighbors(p)) {
      const nk = positionKey(n)
      if (done.has(nk) || !map.passable(n) || enemyAt.has(nk)) continue
      const step = map.moveCost(n) + (friendAt.has(nk) ? T.FLIGHT.FRIENDS : 0) + (besideEnemy(n) ? T.FLIGHT.BESIDE_ENEMY : 0)
      const c = cost + step
      if (best.has(nk) && best.get(nk) <= c) continue
      best.set(nk, c)
      from.set(nk, { key, p })
      push({ p: n, cost: c, off: off(n) })
    }
  }
  // Cut off from its edge: away from the enemy, as far as it can get.
  if (formed.length === 0) return null
  const clear = (p) => Math.min(...formed.map(e => tileDistance(e, p)))
  const here = clear(start)
  const away = reached
    .filter(r => tileDistance(r.p, start) <= T.FLIGHT.AWAY)
    .map(r => ({ ...r, clear: clear(r.p) }))
    .sort((a, b) => b.clear - a.clear || a.cost - b.cost || a.p.y - b.p.y || a.p.x - b.p.x)[0]
  if (!away || away.clear <= here) return null
  return pathTo(away.key, away.p)
}

function offsetEdgeTarget(map, pos, edge, offset) {
  const horizontal = edge === 'west' || edge === 'east'
  const y = horizontal ? pos.y + offset : (edge === 'north' ? 0 : map.height - 1)
  const x = horizontal ? (edge === 'west' ? 0 : map.width - 1) : pos.x + offset
  const target = { x, y }
  return map.inBounds(target) ? target : null
}

// Nearest fighting enemy by tile distance, unit-id tiebreak. Broken units are
// not targets — chasing them is pursuit's job, not the battle line's.
// How near a unit must come to the place an enemy was last seen (or shot
// from) to know it is no longer there: an enemy in a wood is seen only from
// beside it.
const STOOD_THERE = 1

// The first place to look for an enemy no one can find: straight ahead, to
// their edge of the field (a few tiles short of it), on ground a unit can
// stand on. Straight ahead, not the middle of the edge: two armies drawn up
// facing each other then meet, where making for the middle they marched
// past one another out of sight.
function edgePlace(map, theirEdge, from) {
  const IN = 4
  const start = {
    west: { x: IN, y: from.y }, east: { x: map.width - 1 - IN, y: from.y },
    north: { x: from.x, y: IN }, south: { x: from.x, y: map.height - 1 - IN }
  }[theirEdge]
  if (!start) return null
  for (let r = 0; r <= Math.max(map.width, map.height); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const p = { x: start.x + dx, y: start.y + dy }
        if (map.inBounds(p) && map.passable(p)) return p
      }
    }
  }
  return null
}

// ── Ambush targets ───────────────────────────────────────
// What an ambush order may strike: anything (null), a kind of unit, or a
// unit by name. The words a player uses are fitted to these by the order
// reader.
function matchesKind(unit, kind) {
  if (!kind || kind === 'anything') return true
  switch (kind) {
    case 'cavalry': return Boolean(unit.mounted)
    case 'infantry': return !unit.mounted
    case 'archers': return unit.role === 'archers' || /bow|sling|javelin/.test(unit.primaryWeapon ?? '')
    case 'scouts': return unit.role === 'scout' || unit.role === 'scouts'
    default: return unit.id === kind || unit.id.includes(kind) || unit.role === kind
  }
}

// ── Sight ────────────────────────────────────────────────
// side -> the set of enemy unit ids any of its units can see (map/sight.js),
// hidden units only as closely as their cover allows.
function sightBySide(map, world, hidden = new Map()) {
  const living = livingUnits(world)
  const result = new Map()
  for (const side of sides(world)) {
    const watchers = living.filter(u => u.side === side)
    const seen = new Set()
    for (const enemy of living) {
      if (enemy.side === side) continue
      const options = hidden.has(enemy.id) ? { seenWithin: hidden.get(enemy.id).seenWithin } : {}
      if (watchers.some(w => canSee(map, w, enemy, options))) seen.add(enemy.id)
    }
    result.set(side, seen)
  }
  return result
}

// ── Victory ──────────────────────────────────────────────
// A side is still in the battle while it has a steady unit: one that is
// formed up and not shaken. Broken units may rally, but they come back
// shaken, and take heart only from a success near them; an army with no
// steady unit left has no one to give it one, and is beaten. (`isShaken` is
// the battle's own test; without one, every formed unit counts.)
//
// When neither side has a steady unit left, the field belongs to the side
// with more men still in the ranks: someone won the last fight, and two
// armies do not both run from each other. Only when neither has a formed
// man left, or they are exactly even, is it a draw.
// A Commander killed loses the battle for his side.
function commandersOutcome(commanders, allSides) {
  if (!commanders) return null
  const dead = Object.keys(commanders).sort().filter(side => commanders[side].status === 'killed')
  if (dead.length === 0) return null
  const others = allSides.filter(side => !dead.includes(side))
  if (others.length !== 1) return { decided: true, winner: 'draw', reason: 'both commanders killed' }
  return { decided: true, winner: others[0], reason: 'enemy commander killed' }
}

// A side whose senior officer yielded the field, his Commander being held.
function yieldedOutcome(yielded, allSides) {
  if (!yielded) return null
  const winner = allSides.find(side => side !== yielded) ?? 'draw'
  return { decided: true, winner, reason: 'enemy officers yielded' }
}

// holdsOut(side): a camp battle's (battle/camp.js, holdsOut): an army with
// no steady unit left is not yet beaten while its camp stands to rally in.
function checkBattleOutcome(world, broken, isShaken = () => false, holdsOut = null) {
  const formed = (side) => unitsOnSide(world, side).filter(u => u.strength > 0 && !broken.has(u.id))
  const steady = (side) => formed(side).filter(u => !isShaken(u))
  const remaining = sides(world).filter(side => steady(side).length > 0 || Boolean(holdsOut?.(side)))

  if (remaining.length === 1) {
    return { decided: true, winner: remaining[0], reason: 'enemy army broken' }
  }
  if (remaining.length > 1) return { decided: false, winner: null, reason: null }

  // sides() reads the roster, so a side whose last unit fled the field
  // disappears from it entirely: an empty world is a draw too.
  const inRanks = sides(world)
    .map(side => ({ side, men: formed(side).reduce((n, u) => n + u.strength, 0) }))
    .sort((x, y) => y.men - x.men)
  if (inRanks.length > 0 && inRanks[0].men > (inRanks[1]?.men ?? 0)) {
    return { decided: true, winner: inRanks[0].side, reason: 'enemy army broken' }
  }
  return { decided: true, winner: 'draw', reason: 'mutual collapse' }
}

// ── Edges ────────────────────────────────────────────────
function edgeTarget(map, from, edge) {
  const pos = toPosition(from)
  switch (edge) {
    case 'west': return { x: 0, y: pos.y }
    case 'east': return { x: map.width - 1, y: pos.y }
    case 'north': return { x: pos.x, y: 0 }
    case 'south': return { x: pos.x, y: map.height - 1 }
    default: return { x: 0, y: pos.y }
  }
}

function isOnEdge(map, position, edge) {
  const pos = toPosition(position)
  switch (edge) {
    case 'west': return pos.x === 0
    case 'east': return pos.x === map.width - 1
    case 'north': return pos.y === 0
    case 'south': return pos.y === map.height - 1
    default: return pos.x === 0
  }
}

module.exports = {
  createBattleState,
  stepTurn,
  runBattle,
  checkBattleOutcome,
  commandersOutcome,
  yieldedOutcome,
  tileAwayFrom,
  edgeTarget,
  isOnEdge,
  matchesKind,
  DEFAULT_MAX_TURNS
}
