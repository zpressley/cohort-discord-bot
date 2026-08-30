// src/phase2-combat/combat/damage.js
//
// Step 2 of the build order: ratings + effectiveness -> casualties, push, and
// morale damage. Still no randomness. Chaos arrives already rolled, so every
// function here can be tested against fixed inputs.
//
// The three notebook interactions this file implements, verbatim:
//
//   Attack vs Defense  -> casualties -> casualties damage morale
//   Push differential  -> damages enemy morale AND stamina
//   Chaos              -> degrades everything, and presses on morale directly
//
// [locked decision 3] Push never causes casualties. Not once, not indirectly.

const T = require('./tables')
const R = require('./ratings')

// ── Casualties ─────────────────────────────────────────
//
// One direction of one exchange: what `attacker` does to `defender`.
//
// A note on armour, because it is the easiest thing here to double-count.
// Armour expresses itself exactly TWICE:
//
//   1. as a defense rating (ARMOR.defense), raising the denominator, and
//   2. as the column of the attacker's `effectiveness` table it is looked up
//      in (ARMOR.damageClass), which is where rock-paper-scissors lives.
//
// The legacy armyData table also carries a `damage_reduction` percentage
// (0/30/60/85) for the same four armour types. It is deliberately NOT used —
// applying it as well would be armour's third bite at the same apple and would
// make heavy infantry unkillable. If it ever comes back, one of the other two
// has to go.
//
// The ratio form (effAttack / (effAttack + defense)) is chosen over a
// difference because it cannot go negative and it saturates: doubling an
// already-dominant attack barely moves the result, so a quality mismatch is
// decisive without being instant. That is what keeps the floor of "even the
// worst troops survive 1-2 rounds" reachable.

/**
 * @param {Object} attacker  harness unit
 * @param {Object} defender  harness unit
 * @param {Object} attackerCtx  see ratings.attackRating
 * @param {Object} defenderCtx  see ratings.defenseRating
 * @returns {{killed:number, effectiveAttack:number, defense:number, ratio:number, fraction:number}}
 */
function casualtiesFrom(attacker, defender, attackerCtx = {}, defenderCtx = {}) {
  const rawAttack = R.attackRating(attacker, attackerCtx)
  const effectiveness = R.effectivenessAgainst(attacker, defender)
  const effectiveAttack = rawAttack * effectiveness
  const defense = R.defenseRating(defender, defenderCtx)

  const denominator = effectiveAttack + defense
  const ratio = denominator > 0 ? effectiveAttack / denominator : 0

  // Casualties are a fraction of the defender's CURRENT strength, not a flat
  // number (the ruling). That is half of the snowball: a thinner line loses
  // fewer men per round in absolute terms but the same share of what is left,
  // while its own output falls with strengthScale. The asymmetry compounds.
  const fraction = T.DAMAGE.BASE_RATE * ratio

  // `raw` is the unrounded figure. Callers that resolve round after round must
  // use it and carry the remainder themselves, because rounding every round
  // independently quantises the result badly at this unit scale: a 100-man unit
  // taking 4-5 casualties a round has a granularity of 20-25%, which is wider
  // than the entire chaos band. Rounding per round made every seed of a
  // scenario produce byte-identical casualties even though the chaos rolls
  // clearly differed — the randomness was real and then thrown away.
  const raw = defender.strength * fraction
  const killed = Math.min(defender.strength, Math.round(raw))

  return { killed, raw, effectiveAttack, defense, ratio, fraction }
}

// ── Push ───────────────────────────────────────────────
//
// The shove. Both sides compute a push rating; only the differential matters,
// and it lands entirely on the loser as morale and stamina.
//
// [locked decision 3] "Being pushed back is a confidence killer — the real
// cost." Positional consequences (losing the crest, stacking pressure) arrive
// in phase 4 when combat meets the map; in phase 2 terrain advantage is an
// input flag, and push is allowed to flip it there.

/**
 * @returns {{aPush:number, bPush:number, differential:number, winner:('a'|'b'|null)}}
 *          `differential` is always non-negative; `winner` says who it favours.
 */
function pushExchange(a, b, aCtx = {}, bCtx = {}) {
  const aPush = R.pushRating(a, aCtx)
  const bPush = R.pushRating(b, bCtx)
  const delta = aPush - bPush

  return {
    aPush,
    bPush,
    differential: Math.abs(delta),
    winner: delta === 0 ? null : (delta > 0 ? 'a' : 'b')
  }
}

// What losing the shove costs, per point of differential.
function pushMoraleDamage(differential) {
  return Math.max(0, differential) * T.PUSH.MORALE_COEF
}

function pushStaminaDamage(differential) {
  return Math.max(0, differential) * T.PUSH.STAMINA_COEF
}

// ── Morale ─────────────────────────────────────────────
//
// [locked decision 5] Monotonic down. Nothing in this file may return a
// negative number, because a negative morale damage would be recovery, and
// recovery is a phase 8 feature.
//
// Three sources, per the notebook: casualties taken, push differential lost,
// and chaos. Resistance from the quality tier divides the total — which is why
// a Tribal Warrior band and a Professional cohort bleed identically but only
// one of them runs.

/**
 * @param {Object} unit
 * @param {Object} sources
 * @param {number} [sources.killed]              casualties taken this round.
 *   Pass the UNROUNDED figure where one is available: morale should respond to
 *   the real damage, not to whether it happened to round up this round.
 * @param {number} [sources.pushDifferential]    differential LOST by this unit
 * @param {number} [sources.chaos]               0..10, already rolled
 * @returns {{total:number, fromCasualties:number, fromPush:number, fromChaos:number}}
 */
function moraleDamage(unit, { killed = 0, pushDifferential = 0, chaos = 0, stamina = null } = {}) {
  const max = unit.maxStrength || unit.strength || 1

  // Scaled by the share of the ORIGINAL unit lost, not the current strength.
  // Losing twenty of your last thirty men has to hurt more than losing twenty
  // of four hundred, and measuring against maxStrength is what does that.
  const casualtyShare = (Math.max(0, killed) / max) * 100
  const fromCasualties = casualtyShare * T.MORALE.CASUALTY_COEF
  const fromPush = pushMoraleDamage(pushDifferential)
  const fromChaos = Math.max(0, chaos) * T.CHAOS.MORALE_PER_POINT

  // Exhaustion, read off the same universal fatigue curve everything else uses.
  // A fresh unit pays nothing; a spent one pays. This is the only place stamina
  // reaches an outcome in a symmetric fight, because the curve cancels out of
  // the damage ratio when both sides are equally tired.
  const fatigue = stamina === null
    ? 1
    : R.fatigueMultiplier(stamina / R.staminaPool(unit))
  const fromExhaustion = (1 - fatigue) * T.MORALE.EXHAUSTION_COEF

  const resistance = R.moraleResistance(unit)
  const total = (fromCasualties + fromPush + fromChaos + fromExhaustion) / resistance

  return { total, fromCasualties, fromPush, fromChaos, fromExhaustion }
}

// ── Stamina ────────────────────────────────────────────
//
// Two sources: the flat cost of fighting in this kit (locked decision 2), and
// the extra drain of being shoved backwards.

function staminaDrain(unit, { pushDifferential = 0 } = {}) {
  return R.staminaDrainPerRound(unit) + pushStaminaDamage(pushDifferential)
}

// ── One full round, both directions ────────────────────
//
// Combat is simultaneous: both units strike in the same round, and neither
// gets to act on the other's losses until the next one. [Q5] Attacker and
// defender differ only in what modifiers they carry — the charge bonus for the
// side that entered contact, prepared state and terrain for the side that
// held. Persistent contact resolves symmetrically.
//
// The caller supplies both contexts and owns the running stamina, morale and
// roundsInContact state; this function is pure and reads them.

/**
 * @returns {{
 *   a: {killed:number, moraleDamage:Object, staminaDrain:number, detail:Object},
 *   b: {killed:number, moraleDamage:Object, staminaDrain:number, detail:Object},
 *   push: Object
 * }}
 *   `a.killed` is what unit A LOSES this round, not what it inflicts.
 */
function resolveExchange(a, b, aCtx = {}, bCtx = {}) {
  // Facts about the pair, not about either unit alone, are derived here rather
  // than left to the caller. `enemyBraced` in particular: it is the whole spear
  // counter, and a caller that forgets it gets a cavalry charge that ignores
  // the spear wall — silently, with no error to notice.
  const aFull = pairContext(aCtx, b, bCtx)
  const bFull = pairContext(bCtx, a, aCtx)

  // Both attacks are computed from the pre-round state before either is
  // applied. Resolving them in sequence would give whoever went first a free
  // advantage and quietly break mirror-match symmetry.
  const bLosses = casualtiesFrom(a, b, aFull, bFull)
  const aLosses = casualtiesFrom(b, a, bFull, aFull)

  const push = pushExchange(a, b, aFull, bFull)
  const aPushLost = push.winner === 'b' ? push.differential : 0
  const bPushLost = push.winner === 'a' ? push.differential : 0

  // Each side feels its own chaos. The two are rolled separately upstream —
  // that asymmetry is what locked decision 6 relies on to break a mutual-rout
  // deadlock, so collapsing them back to one shared value here would undo it.
  const aChaos = aCtx.chaos ?? 0
  const bChaos = bCtx.chaos ?? 0

  return {
    a: {
      killed: aLosses.killed,
      moraleDamage: moraleDamage(a, { killed: aLosses.raw, pushDifferential: aPushLost, chaos: aChaos, stamina: aCtx.stamina ?? null }),
      staminaDrain: staminaDrain(a, { pushDifferential: aPushLost }),
      detail: aLosses
    },
    b: {
      killed: bLosses.killed,
      moraleDamage: moraleDamage(b, { killed: bLosses.raw, pushDifferential: bPushLost, chaos: bChaos, stamina: bCtx.stamina ?? null }),
      staminaDrain: staminaDrain(b, { pushDifferential: bPushLost }),
      detail: bLosses
    },
    push
  }
}

// Fill in the parts of a unit's context that depend on who it is fighting.
// An explicit value in the caller's context always wins — the harness may know
// something the pair does not, such as a flank arriving from a third unit.
function pairContext(ownCtx, enemy, enemyCtx) {
  return {
    ...ownCtx,
    enemyBraced: ownCtx.enemyBraced ?? R.isAntiCavalry(enemy),
    enemyTerrain: ownCtx.enemyTerrain ?? enemyCtx.terrain ?? 'plains'
  }
}

module.exports = {
  pairContext,
  casualtiesFrom,
  pushExchange,
  pushMoraleDamage,
  pushStaminaDamage,
  moraleDamage,
  staminaDrain,
  resolveExchange
}
