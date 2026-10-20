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
const { resolveSimultaneousMovement, expandOrders, buildOccupancy, canEnter, moveUnit } =
  require('../movement')
const { createEventLog } = require('./events')

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
    turn: 0,
    previousEngagementKeys: new Set(),
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

  // ── Orders ──────────────────────────────────────
  const orders = []

  for (const side of sides(world)) {
    const effective = unitsOnSide(world, side).filter(u => !broken.has(u.id))
    const { orders: expanded } = expandOrders(sideOrders[side] ?? [], effective)
    orders.push(...expanded)

    // Standing orders. A side declared as `advance` presses the nearest
    // enemy whenever the script gives a unit nothing better to do — the
    // simplest deterministic aggression there is, and the reason a battle
    // between two willing armies cannot stall into two lines standing out
    // of range staring at each other. (A side without standing orders
    // holds, which is also a choice: a unit is allowed to stand.)
    if (spec.standingOrders?.[side] === 'advance') {
      const ordered = new Set(expanded.map(o => o.unitId))
      for (const unit of effective) {
        if (ordered.has(unit.id)) continue
        const enemy = nearestEnemy(world, unit, broken)
        if (enemy) orders.push({ unitId: unit.id, target: enemy.position })
      }
    }
  }

  const positionsAtTurnStart = new Map(
    livingUnits(world).map(u => [u.id, { ...u.position }]))

  for (const unit of livingUnits(world)) {
    if (!broken.has(unit.id)) continue
    const edge = spec.sides?.[unit.side]?.homeEdge ?? 'west'
    orders.push({ unitId: unit.id, target: chooseFlightTarget(map, world, unit, edge) })
  }

  // ── Movement (phase 3) ──────────────────────────
  const movement = resolveSimultaneousMovement(world, orders, map)
  for (const move of movement) {
    if (move.skipped || move.held || move.failed) continue
    log.emit('move', turn, {
      unitId: move.unitId, from: { ...move.from }, to: { ...move.to },
      reachedTarget: move.reachedTarget, blockedBy: move.blockedBy
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
  const engagements = detectEngagements(world, engagementRange, map)
    .filter(e => !broken.has(e.aId) && !broken.has(e.bId))

  for (const engagement of engagements) {
    const key = `${engagement.aId}|${engagement.bId}`
    if (!state.previousEngagementKeys.has(key)) {
      log.emit('contact', turn, { aId: engagement.aId, bId: engagement.bId })
    }
  }
  state.previousEngagementKeys = new Set(engagements.map(e => `${e.aId}|${e.bId}`))

  // ── Combat (phase 2) ────────────────────────────
  let casualties = []
  if (engagements.length > 0) {
    const combat = resolver({ engagements, world, random, turn })
    casualties = applyCasualties(world, combat.casualties)

    for (const event of combat.events) log.emit('exchange', turn, { detail: event })
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
// and the winner has taken it. A shove into an occupied, impassable or
// off-map tile does not move anyone; it is logged as `crush`. Whether crush
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

    if (map.passable(vacated)) {
      moveUnit(occupancy, winner, vacated)
    }

    log.emit('push', turn, {
      unitId: loser.id, by: winner.id, from: fromTerrain,
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
function nearestEnemy(world, unit, broken) {
  let best = null
  let bestDistance = Infinity
  for (const other of livingUnits(world)) {
    if (other.side === unit.side || broken.has(other.id)) continue
    const distance = tileDistance(unit.position, other.position)
    if (distance < bestDistance ||
        (distance === bestDistance && other.id.localeCompare(best.id) < 0)) {
      best = other
      bestDistance = distance
    }
  }
  return best
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
