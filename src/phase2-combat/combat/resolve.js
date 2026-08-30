// src/phase2-combat/combat/resolve.js
//
// Step 3 of the build order: the resolver. This is the only file in combat/
// that touches randomness, and it satisfies the contract in section 3 of
// docs/PHASE2_COMBAT_PLAN.md.
//
// Four rules, all enforced by the harness tests:
//   1. Pure with respect to `world` — casualties are returned as intent.
//   2. Never Math.random(). The injected `random` only.
//   3. No I/O, no Date.now().
//   4. No wall-clock or timestamps in the events. Reports get diffed.
//
// ── Why this is a factory ──────────────────────────────
//
// Stamina, morale and rounds-in-contact persist across rounds, and none of them
// live in the harness world model — the resolver may not mutate world, and the
// runner only applies casualties. So that state lives here, in a closure, one
// per run. `createCombatResolver()` hands back a fresh resolver with empty
// state; reusing one across two runs would leak the first battle into the
// second and break the reproducibility guarantee that the whole harness exists
// to provide.
//
// The state is still fully determined by (scenario, seed), so determinism holds.

const T = require('./tables')
const R = require('./ratings')
const D = require('./damage')
const { getUnit } = require('../harness/world')

/**
 * @param {Object} [options]
 * @param {number} [options.roundsPerTurn]  ten-minute rounds resolved per
 *   player turn. [Q1, elastic time] A turn in contact is several rounds; the
 *   scenario runner drives one turn at a time, so this is where the two clocks
 *   meet. Default 1 — one call, one round — which is what the three tactical
 *   scenarios were scripted against.
 * @param {string} [options.situation]  key into SITUATION_CHAOS
 * @returns {Function} a resolver matching the harness contract, with
 *   `.getState(unitId)` and `.snapshot()` attached for the balance harness.
 */
function createCombatResolver(options = {}) {
  const roundsPerTurn = options.roundsPerTurn ?? 1
  const situation = options.situation ?? 'meeting_engagement'

  // unitId -> { stamina, morale, routed, routedOnTurn }
  const unitState = new Map()
  // "aId|bId" -> rounds this pair has been in contact
  const contactRounds = new Map()
  // unitId -> position at the end of the previous turn
  const lastPositions = new Map()

  function stateFor(unit) {
    let state = unitState.get(unit.id)
    if (!state) {
      state = {
        stamina: R.staminaPool(unit),
        morale: T.MORALE.START,
        routed: false,
        routedOnTurn: null
      }
      unitState.set(unit.id, state)
    }
    return state
  }

  function resolveCombat({ engagements, world, random, turn }) {
    const casualties = new Map()
    const events = []

    // Who moved this turn. The contract gives the resolver no movement report,
    // but it does give the world every turn, so comparing positions recovers
    // it. This is what answers [Q5]: the unit that entered contact is the
    // attacker, and the one that held is prepared.
    //
    // The turn contact is first made is the awkward one: the resolver is only
    // called when an engagement exists, so on that turn there is no previous
    // position for anybody and movement is genuinely unknown. The two
    // consumers want opposite defaults, and each gets the conservative one:
    //
    //   charging  unknown -> yes. Contact was just made, so somebody closed
    //             the distance; assuming otherwise would mean a cavalry charge
    //             never fires on the round of impact, which is the only round
    //             it is supposed to fire on.
    //   prepared  unknown -> no. A defensive bonus we cannot verify is not
    //             awarded. From the second round on, holding is observable and
    //             the bonus applies.
    const charging = new Map()
    const held = new Map()
    for (const unit of world.units) {
      const previous = lastPositions.get(unit.id)
      charging.set(unit.id, previous === undefined || previous !== unit.position)
      held.set(unit.id, previous !== undefined && previous === unit.position)
    }

    for (let round = 0; round < roundsPerTurn; round++) {
      for (const engagement of engagements) {
        const a = getUnit(world, engagement.aId)
        const b = getUnit(world, engagement.bId)
        if (!a || !b) continue

        const key = `${engagement.aId}|${engagement.bId}`
        const roundsInContact = contactRounds.get(key) ?? 0

        // One chaos roll per engagement per round, drawn BEFORE any decision
        // to skip. [locked decision 4] chaos is the single RNG channel, so
        // keeping the draw unconditional keeps the stream comparable when a
        // rule above it changes — which is the point of seeding at all.
        const roll = random() * T.CHAOS.ROLL_MAX

        const aState = stateFor(a)
        const bState = stateFor(b)

        // A routed unit is out of the fight. Pursuit casualties and flight
        // across the map are phase 4, when combat meets movement.
        if (aState.routed || bState.routed) continue
        if (a.strength <= 0 || b.strength <= 0) continue

        // Prepared: held ground this turn. [notebook] "a formation set and
        // braced for an incoming attack" — the phase 2 abstraction that named
        // formations refine in phase 8.
        const aPrepared = held.get(a.id)
        const bPrepared = held.get(b.id)

        const aChaos = chaosFor(roll, engagement.aTerrain, situation, aPrepared)
        const bChaos = chaosFor(roll, engagement.bTerrain, situation, bPrepared)

        const aCtx = {
          stamina: aState.stamina,
          roundsInContact: chargeRoundFor(a, charging.get(a.id), roundsInContact),
          terrain: engagement.aTerrain,
          enemyTerrain: engagement.bTerrain,
          chaos: aChaos,
          prepared: aPrepared
        }
        const bCtx = {
          stamina: bState.stamina,
          roundsInContact: chargeRoundFor(b, charging.get(b.id), roundsInContact),
          terrain: engagement.bTerrain,
          enemyTerrain: engagement.aTerrain,
          chaos: bChaos,
          prepared: bPrepared
        }

        const exchange = D.resolveExchange(a, b, aCtx, bCtx)

        addCasualty(casualties, a.id, exchange.a.killed)
        addCasualty(casualties, b.id, exchange.b.killed)

        // [locked decision 5] Morale is monotonic down and floors at zero.
        aState.morale = Math.max(0, aState.morale - exchange.a.moraleDamage.total)
        bState.morale = Math.max(0, bState.morale - exchange.b.moraleDamage.total)

        aState.stamina = Math.max(0, aState.stamina - exchange.a.staminaDrain)
        bState.stamina = Math.max(0, bState.stamina - exchange.b.staminaDrain)

        contactRounds.set(key, roundsInContact + 1)

        events.push(describeExchange(a, b, exchange, aCtx, bCtx, roundsInContact))

        // ── Rout ───────────────────────────────────────
        //
        // [locked decision 6] Rout requires a loser. If both sides would cross
        // the threshold in the same round, neither routs — who would they be
        // running from? The fight continues until asymmetry emerges, and chaos
        // guarantees it eventually does.
        //
        // [notebook] The floor comes first: no rout check may succeed before
        // ROUT_FLOOR_ROUND, so even a levy gets its one or two rounds.
        const aBroken = aState.morale <= T.MORALE.ROUT_THRESHOLD
        const bBroken = bState.morale <= T.MORALE.ROUT_THRESHOLD
        const floorPassed = turn >= T.MORALE.ROUT_FLOOR_ROUND

        if (floorPassed && aBroken && bBroken) {
          events.push(
            `${a.id} and ${b.id} are both at breaking point — neither breaks, ` +
            'there is nobody to run from')
        } else if (floorPassed && aBroken) {
          rout(aState, a, b, turn, events)
        } else if (floorPassed && bBroken) {
          rout(bState, b, a, turn, events)
        }
      }
    }

    for (const unit of world.units) {
      lastPositions.set(unit.id, unit.position)
    }

    return {
      casualties: [...casualties.entries()]
        .map(([unitId, killed]) => ({ unitId, killed }))
        .sort((x, y) => x.unitId.localeCompare(y.unitId)),
      events
    }
  }

  // Read-only views for the balance harness, which needs the morale and
  // stamina curves that the world snapshot cannot carry.
  resolveCombat.getState = (unitId) => {
    const state = unitState.get(unitId)
    return state ? { ...state } : null
  }
  resolveCombat.snapshot = () => {
    const out = {}
    for (const [id, state] of unitState) out[id] = { ...state }
    return out
  }

  return resolveCombat
}

// ── Chaos ──────────────────────────────────────────────
//
// [locked decision 4] "A 0-N scalar, rolled randomly per engagement/round —
// the single RNG channel in the engine. Preparedness subtracts from it. You can
// mitigate chaos but never eliminate it."
//
// One roll is shared by the engagement; the two sides then diverge on their own
// terrain and their own preparedness. That keeps the RNG draw count fixed at
// one per engagement per round while still letting one side be the disordered
// one — which is what the notebook means by chaos degrading "the disordered
// side".
function chaosFor(roll, terrain, situation, prepared) {
  const terrainChaos = T.TERRAIN_CHAOS[terrain] ?? 0
  const situationChaos = T.SITUATION_CHAOS[situation] ?? 0
  const reduction = prepared ? T.CHAOS.PREPARED_REDUCTION : 0

  return R.clamp(roll + terrainChaos + situationChaos - reduction, 0, T.CHAOS.MAX)
}

// Which entry of the charge decay curve this unit is on.
//
// Only the side that moved into contact is charging. A mounted unit that stood
// still and received the attack is handed a round past the end of the curve, so
// it lands on CHARGE.SUSTAINED — cavalry in a melee it did not choose, which is
// exactly the notebook's "bad in long melee engagements".
//
// [Q5] This is the practical shape of the attacker ruling. It matters only for
// cavalry, because chargeMultiplier returns 1 for everything on foot. When
// movement and combat integrate in phase 4, the real contact direction is
// available and this can be sharpened.
function chargeRoundFor(unit, didMove, roundsInContact) {
  if (!unit.mounted) return roundsInContact
  if (!didMove) return T.CHARGE.DECAY.length
  return roundsInContact
}

function rout(state, unit, victor, turn, events) {
  state.routed = true
  state.routedOnTurn = turn
  events.push(`${unit.id} breaks and routs from ${victor.id}`)
}

function addCasualty(map, unitId, killed) {
  if (!killed) return
  map.set(unitId, (map.get(unitId) ?? 0) + killed)
}

// Stable, diffable, no wall clock. Numbers are fixed-width so a report diff
// shows what actually moved rather than reflowing.
function describeExchange(a, b, exchange, aCtx, bCtx, roundsInContact) {
  const push = exchange.push.winner
    ? `${exchange.push.winner === 'a' ? a.id : b.id} shoves (+${exchange.push.differential.toFixed(1)})`
    : 'the shove is even'

  const charge = (a.mounted && aCtx.roundsInContact === 0) || (b.mounted && bCtx.roundsInContact === 0)
    ? ' [charge]'
    : ''

  return (
    `r${roundsInContact + 1} ${a.id} -${exchange.a.killed} / ${b.id} -${exchange.b.killed}; ` +
    `${push}; chaos ${aCtx.chaos.toFixed(1)}/${bCtx.chaos.toFixed(1)}${charge}`
  )
}

module.exports = {
  createCombatResolver,
  chaosFor,
  chargeRoundFor
}
