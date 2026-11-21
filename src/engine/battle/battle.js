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
const { findPath } = require('../movement/pathfinding')
const { resolveMap } = require('../map/map')
const { toPosition, samePosition } = require('../map/labels')
const {
  resolveSimultaneousMovement, expandOrders, buildOccupancy, canEnter, moveUnit, crowdingByUnit
} = require('../movement')
const { createEventLog } = require('./events')
const { normalizeOrder, planUnit, nextStep, isSeeking, NEAR_TILES } = require('./orders')
const { grasp, losingTheThread } = require('../command/officers')
const { canSee } = require('../map/sight')
const { coverFor } = require('./hiding')

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
    // Turns in a row a hidden unit has had an enemy right beside it: the
    // chance it is noticed grows with each (EXPOSURE).
    exposure: new Map(),
    outcome: { decided: false, winner: null, reason: 'battle still open' }
  }
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
  const standingFor = (unit) => {
    const standing = spec.standingOrders?.[unit.side]
    return shaken(unit) ? null : standing
  }

  // ── What each side can see as the turn opens ────
  // Surprise is judged against this: an enemy no one on a side could see
  // when the turn began, and who then attacks a marching unit, catches it
  // unawares.
  const seenAtStart = sightBySide(map, world, state.hidden)
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
    log.emit('lostThread', turn, { unitId: unit.id, officer: unit.officer?.name ?? null, lost, did })
    if (did === 'advance') return { ...ADVANCE }
    if (did === 'hold') return { ...HOLD }
    const carried = { ...current }
    delete carried.when
    return carried
  }

  for (const side of sides(world)) {
    const effective = unitsOnSide(world, side).filter(u => !broken.has(u.id))
    const { orders: expanded } = expandOrders(sideOrders[side] ?? [], effective)

    // Orders given this turn replace each unit's standing order.
    // What its officer keeps of an order with more than one thing in it is
    // rolled here, once, as the order is given.
    for (const order of expanded) {
      let given = normalizeOrder(order)
      const officer = getUnit(world, order.unitId)?.officer
      if (officer) {
        const kept = grasp(given, officer, state.officerRandom)
        if (kept.clauses > 0) log.emit('grasp', turn, { unitId: order.unitId, officer: officer.name ?? null, clauses: kept.clauses, kept: kept.kept })
        given = kept.order
      }
      state.orderBook.set(order.unitId, given)
      freshThisTurn.add(order.unitId)
    }
    const fresh = freshThisTurn

    const edge = spec.sides?.[side]?.homeEdge ?? 'west'
    const context = (unit) => ({
      fresh: fresh.has(unit.id),
      nearestEnemy: (u) => nearestEnemy(world, u, broken, state.hidden),
      homeTarget: (u) => edgeTarget(map, u.position, edge)
    })

    for (const unit of effective) {
      // The order's condition, if it has one and its moment has come: the
      // unit does the other thing, from now on. (Or its officer, having
      // lost that part, does as his nature tells him.)
      let current = state.orderBook.get(unit.id)
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

      let { move, order, lostThread } = planUnit(unit, current, context(unit))
      if (lostThread) {
        // He has done what he remembered, and not what came after.
        const instead = loseThread(unit, 'steps', current);
        ({ move, order } = planUnit(unit, instead, context(unit)))
      }
      if (order) state.orderBook.set(unit.id, order)
      else state.orderBook.delete(unit.id)
      // Missile troops told to press the enemy do it their own way: they
      // close until they can shoot, and stand there shooting.
      const pressing = order ? order.action === 'advance' : standingFor(unit) === 'advance'
      if (pressing && standsOff(unit)) {
        orders.push({ unitId: unit.id, target: 'hold', seeking: true })
        continue
      }
      if (move) {
        const held = state.orderBook.get(unit.id)
        orders.push({
          ...move,
          seeking: isSeeking(held, standingFor(unit)),
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
        const enemy = nearestEnemy(world, unit, broken, state.hidden)
        if (enemy) orders.push({ unitId: unit.id, target: enemy.position, seeking: true })
      }
    }
  }

  const positionsAtTurnStart = new Map(
    livingUnits(world).map(u => [u.id, { ...u.position }]))

  for (const unit of livingUnits(world)) {
    if (!broken.has(unit.id)) continue
    const edge = spec.sides?.[unit.side]?.homeEdge ?? 'west'
    orders.push({ unitId: unit.id, target: chooseFlightTarget(map, world, unit, edge), fleeing: true })
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
    engaged: new Set(engagedAtStart.keys()), glue: T.DISENGAGE.MOVE_COST
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
    const weight = roll * drill * orderly
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
    if (move.reachedTarget && order && order.action !== 'hold' && order.action !== 'advance') {
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

    const then = order.then === 'hold' ? 'hold' : 'standing'
    if (then === 'hold') state.orderBook.set(move.unitId, { action: 'hold', target: null, then: null })
    else state.orderBook.delete(move.unitId)
    const unit = getUnit(world, move.unitId)
    log.emit('halted', turn, {
      unitId: move.unitId, action: order.action, at: { ...unit.position },
      reason: move.failed ? 'no way there' : 'blocked', blockedBy: move.blockedBy ?? null, then
    })
  }

  // ── Flight off the field ────────────────────────
  // A broken unit standing on its home edge after moving has left the
  // battle. Removed from the roster so occupancy, engagement detection and
  // victory all agree it is gone; the unit object survives in the record,
  // because the veterans phase cares who lived.
  for (const unit of [...livingUnits(world)]) {
    if (!broken.has(unit.id)) continue
    const edge = spec.sides?.[unit.side]?.homeEdge ?? 'west'
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
    return sprung.has(id) || isSeeking(state.orderBook.get(id), standingFor(unit))
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

    const first = order?.against ?? null
    const target = livingUnits(world)
      .filter(e => canShootAt(shooter, e, seenNow))
      .map(e => ({ unit: e, distance: tileDistance(shooter.position, e.position), wanted: first && matchesKind(e, first) ? 0 : 1 }))
      .sort((x, y) => x.wanted - y.wanted || x.distance - y.distance || x.unit.id.localeCompare(y.unit.id))[0]
    if (!target) continue
    loosed.push({
      shooter, target: target.unit, distance: target.distance,
      felled: ranged.volley(shooter, target.unit, {
        distance: target.distance, targetTerrain: map.terrainAt(target.unit.position), moved, inMelee: inMelee.has(target.unit.id)
      })
    })
  }
  const volleys = []
  state.shotLastTurn = new Set(loosed.map(l => l.target.id))
  for (const { shooter, target, distance, felled } of loosed) {
    if (target.strength <= 0) continue
    const hit = resolver.volley(target, felled, turn)
    const [applied] = applyCasualties(world, [{ unitId: target.id, killed: hit.killed }])
    volleys.push({ unitId: target.id, by: shooter.id, killed: hit.killed })
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
    const trapped = samePosition(positionsAtTurnStart.get(unit.id), unit.position)
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
    if (!broken.has(unit.id) || brokeThisTurn.has(unit.id) || !resolver.canRally(unit)) continue
    const chased = livingUnits(world).some(e =>
      e.side !== unit.side && !broken.has(e.id) && tileDistance(e.position, unit.position) <= T.RALLY.SAFE_TILES)
    if (chased) continue
    broken.delete(unit.id)
    state.rallied.set(unit.id, (state.rallied.get(unit.id) ?? 0) + 1)
    state.orderBook.delete(unit.id)
    const morale = resolver.rally(unit)
    log.emit('rallied', turn, { unitId: unit.id, at: { ...unit.position }, strength: unit.strength, morale })
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

  // ── Victory ─────────────────────────────────────
  const outcome = checkBattleOutcome(world, broken, state.isShaken)
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

function offsetEdgeTarget(map, pos, edge, offset) {
  const horizontal = edge === 'west' || edge === 'east'
  const y = horizontal ? pos.y + offset : (edge === 'north' ? 0 : map.height - 1)
  const x = horizontal ? (edge === 'west' ? 0 : map.width - 1) : pos.x + offset
  const target = { x, y }
  return map.inBounds(target) ? target : null
}

// Nearest fighting enemy by tile distance, unit-id tiebreak. Broken units are
// not targets — chasing them is pursuit's job, not the battle line's.
function nearestEnemy(world, unit, broken, hidden = new Map()) {
  let best = null
  let bestDistance = Infinity
  for (const other of livingUnits(world)) {
    if (other.side === unit.side || broken.has(other.id) || hidden.has(other.id)) continue
    const distance = tileDistance(unit.position, other.position)
    if (distance < bestDistance ||
        (distance === bestDistance && other.id.localeCompare(best.id) < 0)) {
      best = other
      bestDistance = distance
    }
  }
  return best
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
function checkBattleOutcome(world, broken, isShaken = () => false) {
  const formed = (side) => unitsOnSide(world, side).filter(u => u.strength > 0 && !broken.has(u.id))
  const steady = (side) => formed(side).filter(u => !isShaken(u))
  const remaining = sides(world).filter(side => steady(side).length > 0)

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
  tileAwayFrom,
  edgeTarget,
  isOnEdge,
  DEFAULT_MAX_TURNS
}
