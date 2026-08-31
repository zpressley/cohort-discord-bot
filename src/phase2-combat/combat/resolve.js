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
 * @param {Object} [options.prepared]  unitId -> boolean, overriding the
 *   movement inference below.
 * @param {Object} [options.charging]  unitId -> boolean, likewise.
 *
 *   Both exist for the balance harness, which places two units already in
 *   contact and never moves them. With no movement there is nothing to infer
 *   from, and these are not the same question: a unit can close into contact
 *   without being prepared, and hold ground without being braced. Separating
 *   them is what lets the matrix ask "does cavalry lose a melee it did not
 *   choose?" — which is a design assertion, and unanswerable if arriving in
 *   contact and standing to receive cannot be told apart.
 * @returns {Function} a resolver matching the harness contract, with
 *   `.getState(unitId)` and `.snapshot()` attached for the balance harness.
 */
function createCombatResolver(options = {}) {
  const roundsPerTurn = options.roundsPerTurn ?? 1
  const situation = options.situation ?? 'meeting_engagement'
  const preparedOverride = options.prepared ?? null
  const chargingOverride = options.charging ?? null

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
        // Morale floors at zero, which loses information exactly when it is
        // needed most: two units both at zero look identical to the rout
        // tiebreak. This keeps the undamped running total so "who is worse
        // off" always has an answer. It is never read as morale.
        moraleDamageTaken: 0,
        // Fractional casualties owed but not yet inflicted. Carried between
        // rounds so that repeated rounding does not quantise away differences
        // smaller than one man — see the note in damage.casualtiesFrom.
        casualtyRemainder: 0,
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
    // Units that broke this turn. Reported alongside casualties so the scenario
    // runner can end an engagement on a rout: a broken unit is out of the fight,
    // and without this the runner only knows about destruction and reports a
    // decided battle as 'undecided'.
    const routed = []
    // Shoves strong enough to move a unit. The resolver stays pure - it
    // reports the shove, and the phase 4 battle runner applies the tile loss
    // (and with it the crest rule, since terrain is read from position).
    const pushes = []

    // Flanking: a unit caught in several engagements at once is attacked from
    // more directions than it can face. Each of its opponents gains a small
    // flat attack bonus per extra engagement, capped - see tables.FLANKING.
    // Impossible in a duel, so the balance matrix never sees this branch.
    const engagementCounts = new Map()
    for (const e of engagements) {
      engagementCounts.set(e.aId, (engagementCounts.get(e.aId) ?? 0) + 1)
      engagementCounts.set(e.bId, (engagementCounts.get(e.bId) ?? 0) + 1)
    }
    const flankBonusAgainst = (defenderId) => {
      const extra = (engagementCounts.get(defenderId) ?? 1) - 1
      return T.FLANKING.ATTACK_PER_EXTRA_ENGAGEMENT * Math.min(T.FLANKING.CAP, Math.max(0, extra))
    }

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

        // One chaos roll PER SIDE, per engagement, per round — always in a/b
        // order, and always drawn before any decision to skip, so the stream
        // stays comparable when a rule above it changes. That is the point of
        // seeding at all.
        //
        // Per side, not shared. [locked decision 6] leans on chaos to break the
        // mutual-rout deadlock: "the fight continues until asymmetry emerges
        // (chaos guarantees it eventually does)". A single shared roll applied
        // to two identical units on identical terrain is perfectly symmetric
        // and guarantees the opposite — every mirror match ran to the hard cap
        // as a stalemate until this was split in two. Chaos is still one
        // channel; it just lands on each side separately, which is what makes
        // "no two matchups play out the same" true within a matchup as well as
        // between them.
        const aRoll = random() * T.CHAOS.ROLL_MAX
        const bRoll = random() * T.CHAOS.ROLL_MAX

        const aState = stateFor(a)
        const bState = stateFor(b)

        // A routed unit is out of the fight. Pursuit casualties and flight
        // across the map are phase 4, when combat meets movement.
        if (aState.routed || bState.routed) continue
        if (a.strength <= 0 || b.strength <= 0) continue

        // Prepared: held ground this turn. [notebook] "a formation set and
        // braced for an incoming attack" — the phase 2 abstraction that named
        // formations refine in phase 8.
        const aPrepared = preparedOverride?.[a.id] ?? held.get(a.id)
        const bPrepared = preparedOverride?.[b.id] ?? held.get(b.id)

        const aChaos = chaosFor(aRoll, engagement.aTerrain, situation, aPrepared)
        const bChaos = chaosFor(bRoll, engagement.bTerrain, situation, bPrepared)

        const aCtx = {
          stamina: aState.stamina,
          roundsInContact: chargeRoundFor(a, chargingOverride?.[a.id] ?? charging.get(a.id), roundsInContact),
          terrain: engagement.aTerrain,
          enemyTerrain: engagement.bTerrain,
          chaos: aChaos,
          prepared: aPrepared,
          bonusAttack: flankBonusAgainst(b.id)
        }
        const bCtx = {
          stamina: bState.stamina,
          roundsInContact: chargeRoundFor(b, chargingOverride?.[b.id] ?? charging.get(b.id), roundsInContact),
          terrain: engagement.bTerrain,
          enemyTerrain: engagement.aTerrain,
          chaos: bChaos,
          prepared: bPrepared,
          bonusAttack: flankBonusAgainst(a.id)
        }

        const exchange = D.resolveExchange(a, b, aCtx, bCtx)

        const aKilled = takeCasualties(aState, exchange.a.detail.raw, a.strength)
        const bKilled = takeCasualties(bState, exchange.b.detail.raw, b.strength)

        addCasualty(casualties, a.id, aKilled)
        addCasualty(casualties, b.id, bKilled)

        // [locked decision 5] Morale is monotonic down and floors at zero.
        aState.morale = Math.max(0, aState.morale - exchange.a.moraleDamage.total)
        bState.morale = Math.max(0, bState.morale - exchange.b.moraleDamage.total)
        aState.moraleDamageTaken += exchange.a.moraleDamage.total
        bState.moraleDamageTaken += exchange.b.moraleDamage.total

        aState.stamina = Math.max(0, aState.stamina - exchange.a.staminaDrain)
        bState.stamina = Math.max(0, bState.stamina - exchange.b.staminaDrain)

        contactRounds.set(key, roundsInContact + 1)

        if (exchange.push.winner && exchange.push.differential >= T.PUSH.SHOVE_THRESHOLD) {
          pushes.push({
            winnerId: exchange.push.winner === 'a' ? a.id : b.id,
            loserId: exchange.push.winner === 'a' ? b.id : a.id,
            differential: exchange.push.differential
          })
        }

        events.push(describeExchange(a, b, exchange, aCtx, bCtx, roundsInContact, aKilled, bKilled))

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
          // Both are past breaking. The rule is that rout requires a loser, not
          // that a mutual break is permanent amnesty — "the fight continues
          // until asymmetry emerges". So look for the asymmetry.
          //
          // Reading it as a standing exemption is what an earlier version did,
          // and it deadlocked: morale is monotonic down and floors at zero, so
          // once both sides were under the line neither could ever climb back
          // above it and no rout was possible again. Every hard-fought match
          // ran to the cap, and raising the damage coefficients made stalemates
          // MORE common rather than fewer.
          //
          // The tiebreak is the notebook's own sentence: "fewer men with worse
          // morale is what produces the rout." Worse morale first, then fewer
          // men. Only exact symmetry on both counts is a true standoff, and
          // that is the case the rule was written for.
          const loser = breakingLoser(aState, bState, a, b)

          if (loser === 'a') rout(aState, a, b, turn, events, routed)
          else if (loser === 'b') rout(bState, b, a, turn, events, routed)
          else {
            events.push(
              `${a.id} and ${b.id} are both at breaking point — neither breaks, ` +
              'there is nobody to run from')
          }
        } else if (floorPassed && aBroken) {
          rout(aState, a, b, turn, events, routed)
        } else if (floorPassed && bBroken) {
          rout(bState, b, a, turn, events, routed)
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
      pushes: pushes.sort((x, y) => x.loserId.localeCompare(y.loserId)),
      routed: routed.sort((x, y) => x.unitId.localeCompare(y.unitId)),
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

// Which of two already-broken units is the one that runs.
//
// [locked decision 6] "Rout requires a loser." The loser is the side that is
// measurably worse off: worse morale first, and if morale has bottomed out for
// both, fewer men. Returns null only when the two are identical on both counts,
// which is the genuine "who would they be running from?" case.
function breakingLoser(aState, bState, a, b) {
  if (aState.morale !== bState.morale) {
    return aState.morale < bState.morale ? 'a' : 'b'
  }
  if (a.strength !== b.strength) {
    return a.strength < b.strength ? 'a' : 'b'
  }
  // Both bottomed out at zero morale with the same number of men standing.
  // Morale has clipped, so it can no longer separate them, and casualties are
  // rounded to whole men so small differences vanish there too — this was the
  // last source of permanent standoffs. The undamped damage total still
  // separates them, and because chaos is rolled per side it effectively always
  // differs.
  if (aState.moraleDamageTaken !== bState.moraleDamageTaken) {
    return aState.moraleDamageTaken > bState.moraleDamageTaken ? 'a' : 'b'
  }
  return null
}

function rout(state, unit, victor, turn, events, routed) {
  state.routed = true
  state.routedOnTurn = turn
  events.push(`${unit.id} breaks and routs from ${victor.id}`)
  if (routed) routed.push({ unitId: unit.id, by: victor.id, turn })
}

// Turn an unrounded casualty figure into whole men, carrying the fraction
// forward. Over an engagement the men inflicted match the damage dealt; within
// a round the remainder waits rather than being rounded away.
//
// Without this, differences smaller than one man vanish every round, and at
// 100-man units almost every difference is smaller than one man — two runs with
// visibly different chaos rolls produced identical casualties, round after
// round, which made the seeded RNG decorative.
function takeCasualties(state, raw, available) {
  const owed = state.casualtyRemainder + Math.max(0, raw)
  const killed = Math.min(available, Math.floor(owed))
  state.casualtyRemainder = owed - killed
  return killed
}

function addCasualty(map, unitId, killed) {
  if (!killed) return
  map.set(unitId, (map.get(unitId) ?? 0) + killed)
}

// Stable, diffable, no wall clock. Numbers are fixed-width so a report diff
// shows what actually moved rather than reflowing.
function describeExchange(a, b, exchange, aCtx, bCtx, roundsInContact, aKilled, bKilled) {
  const push = exchange.push.winner
    ? `${exchange.push.winner === 'a' ? a.id : b.id} shoves (+${exchange.push.differential.toFixed(1)})`
    : 'the shove is even'

  const charge = (a.mounted && aCtx.roundsInContact === 0) || (b.mounted && bCtx.roundsInContact === 0)
    ? ' [charge]'
    : ''

  return (
    `r${roundsInContact + 1} ${a.id} -${aKilled} / ${b.id} -${bKilled}; ` +
    `${push}; chaos ${aCtx.chaos.toFixed(1)}/${bCtx.chaos.toFixed(1)}${charge}`
  )
}

module.exports = {
  createCombatResolver,
  chaosFor,
  chargeRoundFor,
  breakingLoser
}
