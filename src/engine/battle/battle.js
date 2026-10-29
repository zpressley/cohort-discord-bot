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
const { createCombatResolver, tables: T } = require('../combat')
const { findPath } = require('../movement/pathfinding')
const { resolveMap } = require('../map/map')
const { toPosition, samePosition } = require('../map/labels')
const {
  resolveSimultaneousMovement, expandOrders, buildOccupancy, canEnter, moveUnit, crowdingByUnit
} = require('../movement')
const { createEventLog } = require('./events')
const { normalizeOrder, planUnit, isSeeking } = require('./orders')
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

  return {
    spec,
    seed,
    // The battlefield. spec.map may name an authored map, carry a definition,
    // or be absent (Crownhill). Kept beside the world, never inside it, so
    // world snapshots stay small.
    map: resolveMap(spec.map),
    world: createWorld({ units: spec.units }),
    random: createRng(seed),
    resolver: createCombatResolver(),
    log: createEventLog(),
    // Phase 4 owns these two flags. They deliberately do NOT live in the
    // harness world model — phase 2's scenarios and the balance matrix have no
    // concept of a unit that is broken but alive, and adding the field there
    // would make every existing snapshot lie about it.
    broken: new Set(),
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
function stepTurn(state, sideOrders = {}) {
  const { spec, map, world, random, resolver, log, broken, fledUnits } = state
  const engagementRange = spec.engagementRange ?? 1

  state.turn += 1
  const turn = state.turn
  world.turn = turn

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
  const freshThisTurn = new Set()

  for (const side of sides(world)) {
    const effective = unitsOnSide(world, side).filter(u => !broken.has(u.id))
    const { orders: expanded } = expandOrders(sideOrders[side] ?? [], effective)

    // Orders given this turn replace each unit's standing order.
    const fresh = new Set()
    for (const order of expanded) {
      state.orderBook.set(order.unitId, normalizeOrder(order))
      fresh.add(order.unitId)
      freshThisTurn.add(order.unitId)
    }

    const edge = spec.sides?.[side]?.homeEdge ?? 'west'
    const context = (unit) => ({
      fresh: fresh.has(unit.id),
      nearestEnemy: (u) => nearestEnemy(world, u, broken, state.hidden),
      homeTarget: (u) => edgeTarget(map, u.position, edge)
    })

    for (const unit of effective) {
      const { move, order } = planUnit(unit, state.orderBook.get(unit.id), context(unit))
      if (order) state.orderBook.set(unit.id, order)
      else state.orderBook.delete(unit.id)
      if (move) {
        const held = state.orderBook.get(unit.id)
        orders.push({
          ...move,
          seeking: isSeeking(held, spec.standingOrders?.[side]),
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
      if (spec.standingOrders?.[side] === 'advance') {
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
        then: order.then === 'hold' ? 'hold' : 'standing'
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
    return sprung.has(id) || isSeeking(state.orderBook.get(id), spec.standingOrders?.[unit.side])
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

  for (const engagement of engagements) {
    const key = `${engagement.aId}|${engagement.bId}`
    if (state.previousEngagementKeys.has(key)) continue
    log.emit('contact', turn, { aId: engagement.aId, bId: engagement.bId })

    // Surprise: the one who sought the fight was unseen by the other side
    // when the turn began, and caught the other on the march.
    const surprises = []
    for (const [by, target] of [[engagement.aId, engagement.bId], [engagement.bId, engagement.aId]]) {
      const victim = getUnit(world, target)
      if (!seeking(by) || !marching.has(target)) continue
      if (seenAtStart.get(victim.side)?.has(by)) continue
      surprises.push(by)
      log.emit('surprise', turn, { unitId: target, by, posture: 'marching' })
    }
    if (surprises.length > 0) engagement.surprisedBy = surprises
  }
  state.previousEngagementKeys = new Set(engagements.map(e => `${e.aId}|${e.bId}`))

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
      applyPursuit(world, getUnit(world, rout.unitId), turn, log)
    }
  }

  // ── Pursuit of units already in flight ──────────
  // A broken unit that STARTS a turn adjacent to an enemy is being chased
  // down. (The strike at the moment of breaking is handled above.) One that
  // could not move at all — fled into its own line, or cornered — is being
  // overrun, which is much worse.
  for (const unit of livingUnits(world)) {
    if (!broken.has(unit.id)) continue
    if (log.forTurn(turn).some(e => e.type === 'rout' && e.unitId === unit.id)) continue
    const trapped = samePosition(positionsAtTurnStart.get(unit.id), unit.position)
    applyPursuit(world, unit, turn, log, trapped)
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
      state.orderBook.set(unit.id, { action: 'hold', target: null, then: null })
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
    broken: [...broken].sort(),
    snapshot: cloneWorld(world)
  }

  // ── Victory ─────────────────────────────────────
  const outcome = checkBattleOutcome(world, broken)
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
function applyPursuit(world, unit, turn, log, trapped = false) {
  if (!unit || unit.strength === 0) return

  const pursuers = livingUnits(world)
    .filter(u => u.side !== unit.side && tileDistance(u.position, unit.position) <= 1)
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
// A side is beaten when it has no effective units left: alive, unbroken, and
// still on the field. Broken units still fleeing count for nothing — they are
// running, not fighting.
function checkBattleOutcome(world, broken) {
  const effective = (side) => unitsOnSide(world, side).filter(u => !broken.has(u.id))
  const remaining = sides(world).filter(side => effective(side).length > 0)

  // sides() reads the roster, so a side whose last unit fled the field
  // disappears from it entirely — handle the empty world first.
  if (remaining.length === 1) {
    return { decided: true, winner: remaining[0], reason: 'enemy army broken' }
  }
  if (remaining.length === 0) {
    return { decided: true, winner: 'draw', reason: 'mutual collapse' }
  }
  return { decided: false, winner: null, reason: null }
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
