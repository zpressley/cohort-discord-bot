// src/engine/movement/simultaneous.js
//
// Simultaneous multi-unit movement resolution — the heart of phase 3.
//
// The phase 2 harness resolved movement unit-by-unit: each unit walked its
// whole path before the next unit moved at all. That is fine for two units and
// wrong for twelve — a slow unit that happens to sort first walks through
// ground a fast unit should have claimed, and a column can never follow its
// own vanguard through a gap, because the vanguard finishes its entire move
// while the follower has not started.
//
// This resolver interleaves instead. Every unit plans its full path up front
// (A* over terrain, ignoring units — intent is where you MEAN to go), then
// movement resolves in ticks: one tile step per unit per tick, taken in
// initiative order (scouts -> siege, see initiative.js). Occupancy is queried
// live at each step, so:
//
//   - Friends share ground (Stage 3): a unit may step onto a friend's tile
//     while the tile stays under the crowding cap, and pays for the crowding
//     (occupancy.js). Two units racing for one tile can both end there.
//   - A full tile: the higher-initiative units fill it; the next finds it
//     full, looks once for a way around, and otherwise waits a tick and then
//     stops for the turn.
//   - An enemy's tile is never entered: that is contact.
//   - Crowding slows a unit: its range for the turn is cut by the crowding
//     on the tile it starts on.
//
// The resolver mutates unit positions (like the phase 2 movement phase) but
// draws no randomness — movement is fully deterministic, chaos stays combat's
// single RNG channel.

const { findPath } = require('./pathfinding')
const { toPosition, samePosition, positionKey } = require('../map/labels')
const { inInitiativeOrder, tierName } = require('./initiative')
const { buildOccupancy, canEnter, moveUnit, crowdingByUnit, crowdedRange } = require('./occupancy')
const { getUnit, isAlive } = require('../world')
const { moveCost } = require('../combat/perks')
const { MARCH } = require('../combat/tables')

// A unit blocked this many ticks in a row gives up for the turn.
const BLOCKED_TICKS_TO_STOP = 2

/**
 * Resolve one turn of simultaneous movement.
 *
 * @param {Object} world   phase 2 harness world (mutated: unit positions)
 * @param {Array}  orders  [{ unitId, target }] — target is a position, a map
 *                         label, or 'hold'
 * @param {Object} map     the battlefield (src/engine/map/map.js)
 * @returns {Array} per-unit movement results, sorted by unit id
 */
function resolveSimultaneousMovement(world, orders, map, options = {}) {
  // Enemies hidden from everyone (Stage 3): a unit looking for a fight does
  // not stop for one it cannot see, and one that walks into its tile has
  // stumbled on it.
  const hidden = options.hidden ?? new Set()
  // Ambushes lying in wait (Stage 3): unitId set, and the battle's decision,
  // asked each time an enemy steps within reach of one. 'spring' stops the
  // passing unit where it stands: it has been caught.
  const ambushers = options.ambushers ?? new Set()
  const decideAmbush = options.ambush ?? (() => null)
  const sprung = new Set()
  // Units in a fight as the turn opens (Stage 3): breaking contact costs
  // movement.
  const engaged = options.engaged ?? new Set()
  const glue = options.glue ?? 0
  const withGlue = (unit, budget) =>
    engaged.has(unit.id) && glue > 0 ? Math.max(Math.min(1, budget), budget - glue) : budget
  if (!map) throw new Error('resolveSimultaneousMovement needs the map')
  // In a battle, units on the march keep a tile apart (tables.MARCH): a
  // friend's tile is gone round or waited for (makeWay). Off for the
  // resolver's own tests and the scripted scenarios, where friends share
  // ground as they always did.
  const keepApart = Boolean(options.keepApart)
  const occupancy = buildOccupancy(world)
  const crowding = crowdingByUnit(world)
  const plans = new Map()
  const results = new Map()
  const onTheMove = (u, plan) => {
    const p = plans.get(u.id)
    return Boolean(p) && p !== plan && !p.stopped && p.stepIndex < p.steps.length
  }
  const enemyBeside = (tile, unit) => [tile, ...map.neighbors(tile)].some(n =>
    (occupancy.get(positionKey(n)) ?? []).some(u => u.side !== unit.side && !hidden.has(u.id)))
  const costOf = (unit, steps) => steps.reduce((n, p) => n + moveCost(unit, map.terrainAt(p), map.moveCost(p)), 0)
  // A unit on the march about to step onto a tile its own men stand on:
  //   'enter'  the place it was sent, or beside an enemy it is going at
  //            (it joins the fight there), and not a ford or bridge;
  //   'wait'   the men there are moving on this tick (it follows them in
  //            column), or, when it can neither go round nor clear the
  //            tile, they are in a fight or still on their way: it waits
  //            behind them, keeping its order (men only standing there it
  //            goes in among, 'enter');
  //   'round'  a way round them that costs at most MARCH.ROUND more
  //            (looked for once a tick): its steps are changed;
  //   'pass'   through them, clearing the tile in the same ten minutes.
  const makeWay = (plan, next, cost) => {
    const unit = plan.unit
    const friends = (occupancy.get(positionKey(next)) ?? []).filter(u => u !== unit && u.side === unit.side)
    const crossing = MARCH.CROSSINGS.includes(map.terrainAt(next))
    if (!crossing && samePosition(next, plan.target)) return 'enter'
    const wait = (friend, busy = onTheMove(friend, plan) || engaged.has(friend.id)) => {
      plan.queuedBehind = { by: friend.id, busy }
      plan.blockedBy = friend.id
      return 'wait'
    }
    // Is that friend waiting, at the end of a line of waiting men, on this
    // unit? Then neither would ever move: it is not waited for.
    const waitsOnMe = (friend) => {
      const seen = new Set()
      for (let p = plans.get(friend.id); p?.queuedBehind && !seen.has(p); p = plans.get(p.queuedBehind.by)) {
        if (p.queuedBehind.by === unit.id) return true
        seen.add(p)
      }
      return false
    }
    // A way round the men standing in its way to where it is going; for one
    // going into a fight (intoFight), only a way that brings it beside the
    // enemy within this ten minutes' march.
    const goRound = (intoFight = false) => {
      if (plan.wentRound) return false
      plan.wentRound = true
      const avoid = new Set([...occupancy.entries()]
        .filter(([, units]) => units.some(u => u !== unit && (u.side !== unit.side || !onTheMove(u, plan))))
        .map(([key]) => key))
      const round = findPath(map, unit.position, plan.target, { avoid })
      if (!round || round.length < 2 || samePosition(round[1], next)) return false
      const steps = round.slice(1)
      if (intoFight) {
        const beside = steps.findIndex(p => enemyBeside(p, unit))
        if (beside < 0 || costOf(unit, steps.slice(0, beside + 1)) > plan.budget) return false
      } else if (costOf(unit, steps) > costOf(unit, plan.steps.slice(plan.stepIndex)) + MARCH.ROUND) return false
      plan.steps = steps
      plan.stepIndex = 0
      return true
    }
    // Going at an enemy beside that tile: to a tile of its own beside him if
    // it can reach one now, else in beside its friends (it joins the fight).
    if (!crossing && plan.seeking && enemyBeside(next, unit)) return goRound(true) ? 'round' : 'enter'
    const moving = friends.find(f => onTheMove(f, plan) && !waitsOnMe(f))
    if (moving) return wait(moving)
    if (goRound()) return 'round'
    const beyond = plan.steps[plan.stepIndex + 1]
    const clears = beyond && plan.budget - cost >= moveCost(unit, map.terrainAt(beyond), map.moveCost(beyond)) &&
      !(plan.seeking && enemyBeside(next, unit)) &&
      (occupancy.get(positionKey(beyond)) ?? []).every(u => u.side === unit.side && onTheMove(u, plan))
    if (clears) return 'pass'
    // Men in a fight there, or on their way and halted for these ten
    // minutes: it waits its turn behind them. Men only standing there, with
    // no way round: it goes in among them, as friends always could (a unit
    // holding on a road through a wood would else stop its own army for
    // good: Thornwood, the soak's meeting battle, seed 4).
    const goingOn = (f) => { const p = plans.get(f.id); return Boolean(p) && p.stepIndex < p.steps.length }
    if (friends.some(f => engaged.has(f.id) || (goingOn(f) && !waitsOnMe(f)))) return wait(friends[0], true)
    return 'enter'
  }

  // ── Plan ────────────────────────────────────────────
  for (const order of orders) {
    const unit = getUnit(world, order.unitId)

    if (!unit) {
      results.set(order.unitId, { unitId: order.unitId, skipped: 'no such unit' })
      continue
    }
    if (!isAlive(unit)) {
      results.set(unit.id, { unitId: unit.id, skipped: 'destroyed' })
      continue
    }
    if (!order.target || order.target === 'hold') {
      results.set(unit.id, { unitId: unit.id, held: true, position: unit.position })
      continue
    }
    const target = toPosition(order.target)
    if (samePosition(target, unit.position)) {
      results.set(unit.id, { unitId: unit.id, failed: 'already there', position: unit.position })
      continue
    }

    // A way given with the order (a broken unit's flight, chosen round the
    // enemy: battle.js, flightPath) is taken as given, while it still starts
    // where the unit stands.
    const given = Array.isArray(order.path) && order.path.length > 1 && samePosition(order.path[0], unit.position) &&
      samePosition(order.path[order.path.length - 1], target) ? order.path.map(p => ({ x: p.x, y: p.y })) : null
    const path = given ?? findPath(map, unit.position, target)
    if (!path) {
      results.set(unit.id, { unitId: unit.id, failed: 'no path', position: unit.position })
      continue
    }

    plans.set(unit.id, {
      unit,
      target,
      fleeing: Boolean(order.fleeing),
      steps: path.slice(1),            // path[0] is where the unit stands
      stepIndex: 0,
      // Careful (on guard) marches at half speed, after crowding.
      budget: withGlue(unit, order.careful
        ? Math.round(crowdedRange(unit, crowding.get(unit.id)) / 2 * 100) / 100
        : crowdedRange(unit, crowding.get(unit.id))),
      careful: Boolean(order.careful),
      // Looking for a fight (Stage 3): only such a unit stops when it meets
      // an enemy. Others walk on past, if the way is open. Callers that do
      // not say are treated as seeking, the rule before Stage 3.
      seeking: order.seeking ?? true,
      from: { ...unit.position },
      tilesTraversed: [],
      blockedTicks: 0,
      blockedBy: null,
      stopped: false,
      // In contact before anyone moved: such a unit may step away (a
      // withdrawal), so only contact made during the turn stops it below.
      startedInContact: Boolean(adjacentEnemy(occupancy, unit, map, hidden)),
      stumbledOn: null
    })
  }

  // ── Tick loop ───────────────────────────────────────
  // Initiative order is computed once per turn, not per tick: a unit's speed
  // class does not change mid-move.
  // (Within a tier, by the battle's tie-break when it gives one: by name,
  // one side's units always stepped first.)
  const moveOrder = inInitiativeOrder([...plans.values()].map(p => p.unit), options.tieKey ?? null)

  let anyoneMoving = true
  const halts = () => [...plans.values()].filter(p => p.stopped).length
  while (anyoneMoving) {
    anyoneMoving = false
    // Keeping apart, a unit halting is news to those waiting behind it:
    // they look again (go round, or wait on).
    const haltedBefore = keepApart ? halts() : 0

    for (const unit of moveOrder) {
      const plan = plans.get(unit.id)
      if (!plan || plan.stopped) continue
      if (plan.stepIndex >= plan.steps.length) continue

      // An enemy came up beside this unit earlier in the turn: it is in
      // contact now, and turns to fight instead of walking on. Without this,
      // a unit chasing an enemy could step out of the contact the enemy had
      // just made, and the two could circle each other for ever.
      if (plan.seeking && !plan.fleeing && !plan.startedInContact) {
        const enemy = adjacentEnemy(occupancy, unit, map, hidden)
        if (enemy) {
          plan.stopped = true
          plan.blockedBy = enemy.id
          continue
        }
      }

      const nextCoord = plan.steps[plan.stepIndex]
      const terrain = map.terrainAt(nextCoord)
      // (Its people may cross woods or marsh at a cost of their own:
      // combat/perks.js.)
      const cost = moveCost(unit, terrain, map.moveCost(nextCoord))

      // A unit can always make one tile of ground in a turn, however slow
      // it is and however rough the tile: without this, a careful or
      // crowded unit (budget under 2) could never enter woods, marsh or a
      // hill at all. It spends everything it has doing so.
      const firstStep = plan.tilesTraversed.length === 0 && plan.budget > 0 && Number.isFinite(cost)
      if (plan.budget < cost && !firstStep) {
        plan.stopped = true
        continue
      }

      const entry = canEnter(occupancy, unit, nextCoord)
      // Friends on the next tile, in a battle (options.keepApart): march in
      // column, or go round, or wait (makeWay, below).
      if (keepApart && entry.ok && entry.shared && !plan.fleeing) {
        const way = makeWay(plan, nextCoord, cost)
        if (way === 'wait') continue
        if (way === 'round') { anyoneMoving = true; continue }
      }
      // A full tile of friends in the way: once per turn, look for a way
      // around the tiles this unit cannot enter. Paths are planned over an
      // empty field, so without this a broken unit wedged in a packed line
      // can block both armies for good. An enemy in the way is contact, and
      // stops the move (below).
      // Running, in a battle, and an enemy stepped into its way (two broken
      // units of either side, each running past the other): once a tick,
      // round him.
      if (keepApart && !entry.ok && entry.reason === 'enemy' && plan.fleeing && !plan.detoured) {
        plan.detoured = true
        const avoid = new Set([...occupancy.entries()]
          .filter(([, units]) => units.some(u => u.side !== unit.side))
          .map(([key]) => key))
        const detour = findPath(map, unit.position, plan.target, { avoid })
        if (detour && detour.length > 1) {
          plan.steps = detour.slice(1)
          plan.stepIndex = 0
          anyoneMoving = true
          continue
        }
      }
      if (!entry.ok && entry.reason === 'friendly' && !plan.detoured) {
        plan.detoured = true
        const avoid = new Set([...occupancy.entries()]
          .filter(([, units]) => units.length > 0 && !canEnter(occupancy, unit, units[0].position).ok)
          .map(([key]) => key))
        const detour = findPath(map, unit.position, plan.target, { avoid })
        if (detour && detour.length > 1) {
          plan.steps = detour.slice(1)
          plan.stepIndex = 0
          anyoneMoving = true
          continue
        }
      }
      if (!entry.ok) {
        plan.blockedTicks += 1
        plan.blockedBy = entry.blocker
        if (entry.reason === 'enemy' && hidden.has(entry.blocker)) plan.stumbledOn = entry.blocker
        if (entry.reason === 'enemy' || plan.blockedTicks >= BLOCKED_TICKS_TO_STOP) {
          // An enemy never moves aside for you; a friend gets one tick to.
          plan.stopped = true
        } else {
          anyoneMoving = true // still hoping the tile clears
        }
        continue
      }

      moveUnit(occupancy, unit, nextCoord)
      plan.budget = Math.max(0, Math.round((plan.budget - cost) * 100) / 100)
      plan.stepIndex += 1
      plan.tilesTraversed.push({ coord: nextCoord, terrain })
      plan.blockedTicks = 0
      plan.blockedBy = null
      plan.queuedBehind = null
      anyoneMoving = true

      // An ambush within reach may spring on this unit, and catch it here.
      if (ambushers.size > 0) {
        const lying = map.neighbors(unit.position)
          .flatMap(n => occupancy.get(positionKey(n)) ?? [])
          .filter(a => a.side !== unit.side && ambushers.has(a.id) && !sprung.has(a.id))
          .sort((x, y) => x.id.localeCompare(y.id))
        const by = lying.find(a => decideAmbush(a, unit, { careful: plan.careful, fleeing: plan.fleeing }) === 'spring')
        if (by) {
          sprung.add(by.id)
          plan.stopped = true
          plan.blockedBy = by.id
          plan.ambushedBy = by.id
          continue
        }
      }

      // Contact stops a unit looking for a fight: it steps next to an enemy,
      // halts there and fights. Contact used to be checked only after
      // everyone had moved, so two units could slip past each other through
      // the diagonals, swap places, and repeat for ever without a blow.
      // Fleeing units are exempt: they keep running, and pursuit deals with
      // them. A unit not looking for a fight walks on (Stage 3).
      if (plan.seeking && !plan.fleeing) {
        const enemy = adjacentEnemy(occupancy, unit, map, hidden)
        if (enemy) {
          plan.stopped = true
          plan.blockedBy = enemy.id
        }
      }
    }
    if (keepApart && halts() > haltedBefore) anyoneMoving = true
  }

  // ── Report ──────────────────────────────────────────
  for (const plan of plans.values()) {
    results.set(plan.unit.id, {
      unitId: plan.unit.id,
      tier: tierName(plan.unit),
      from: plan.from,
      to: plan.unit.position,
      target: plan.target,
      reachedTarget: samePosition(plan.unit.position, plan.target),
      tilesMoved: plan.tilesTraversed.length,
      careful: plan.careful,
      tilesTraversed: plan.tilesTraversed,
      movementRemaining: plan.budget,
      blockedBy: plan.blockedBy,
      ...(plan.stumbledOn ? { stumbledOn: plan.stumbledOn } : {}),
      ...(plan.ambushedBy ? { ambushedBy: plan.ambushedBy } : {}),
      // Waiting behind its own men (makeWay) as the ten minutes ended; busy:
      // they were on the move or in a fight.
      ...(plan.queuedBehind ? { queued: plan.queuedBehind } : {}),
      terrain: map.terrainAt(plan.unit.position)
    })
  }

  return [...results.values()].sort((a, b) => a.unitId.localeCompare(b.unitId))
}

function adjacentEnemy(occupancy, unit, map, hidden = new Set()) {
  for (const next of map.neighbors(unit.position)) {
    const other = (occupancy.get(positionKey(next)) ?? []).find(u => u.side !== unit.side && !hidden.has(u.id))
    if (other) return other
  }
  return null
}

module.exports = { resolveSimultaneousMovement, BLOCKED_TICKS_TO_STOP }
