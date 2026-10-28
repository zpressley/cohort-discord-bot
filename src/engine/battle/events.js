// src/engine/battle/events.js
//
// The event log — the spine the roadmap asks for early: "The orchestrator
// emits a structured event stream per turn... This is the single interface the
// narrator consumes, the harness asserts against, and the DB persists."
//
// Every event is plain data: no prose, no timestamps, no wall clock, stable
// field order. A narrator can tell the turn from the events alone, and the
// wording lives outside the engine (src/narrator/eventText.js for the terse
// lines, the AI narrator for prose). Positions are { x, y }.
//
// Every event carries `type` and `turn` (the battle turn, a ten-minute tick).
// The types, in the order a turn can produce them, and their fields:
//
//   move       unitId, from, to, reachedTarget, blockedBy
//              a unit moved, or was stopped short (from = to when blocked
//              on its first step)
//   arrived    unitId, action, at, then
//              a unit reached the place its order sent it; then is 'hold'
//              (it digs in) or 'standing' (back to its side's standing orders)
//   halted     unitId, action, at, reason, blockedBy, then
//              an order from an earlier turn got nowhere (blocked, or no way
//              there) and is given up; then as for arrived
//   fled       unitId, side, strength
//              a broken unit left the field over its home edge
//   contact    aId, bId
//              two enemy units came into engagement range
//   exchange   roundInContact, a, b, push
//              one combat round between a pair. a and b each carry unitId,
//              killed, morale and stamina after the round, chaos, terrain,
//              prepared, chargeImpact, flankBonus, crowding (the combat
//              penalty for friends packed on its tile). push is { winnerId,
//              differential }; winnerId is null for an even shove
//   standoff   aId, bId
//              both broke in the same round with nothing to tell them apart,
//              so neither runs (rout requires a loser)
//   destroyed  unitId
//              a unit fell to zero strength
//   push       unitId, by, fromTerrain, to, toTerrain, winnerAdvancedTo,
//              lostHighGround
//              a shove strong enough to cost the loser a tile
//   crush      unitId, by, reason, blocker?
//              a shove that could not move the loser (map edge, impassable,
//              an enemy, or a tile already full of friends)
//   rout       unitId, by
//              a unit broke
//   pursuit    unitId, by, killed, remaining, trapped
//              a fleeing unit cut down from behind
//   crowding   unitId, at, men, tier, was
//              a unit's crowding tier changed: friends packed onto its tile
//              (organized, crowded, compressed, crushing, critical). See
//              CROWDING in combat/tables.js
//   victory    winner, reason
//              the battle ended

function createEventLog() {
  const events = []

  const emit = (type, turn, fields = {}) => {
    events.push({ type, turn, ...fields })
  }

  return {
    emit,
    all: () => [...events],
    ofType: (type) => events.filter(e => e.type === type),
    forTurn: (turn) => events.filter(e => e.turn === turn)
  }
}

module.exports = { createEventLog }
