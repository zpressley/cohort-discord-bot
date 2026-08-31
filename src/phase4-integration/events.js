// src/phase4-integration/events.js
//
// The event log — the spine the roadmap asks for early: "The orchestrator
// emits a structured event stream per turn... This is the single interface the
// narrator consumes, the harness asserts against, and the DB persists."
//
// Phase 2's resolver emits prose strings; those are carried through as the
// `detail` of an `exchange` event rather than re-parsed. Everything else is a
// typed object: no timestamps, no wall clock, stable field order — the same
// diffability contract every report in this codebase honours.
//
// Event types, in the order a turn can produce them:
//
//   move        a unit moved (or was blocked short of its target)
//   contact     two enemy units came into engagement range
//   exchange    one combat round between a pair (detail = resolver prose)
//   push        a shove strong enough to cost the loser a tile
//   crush       a shove that COULD not move the loser — blocked tile
//   rout        a unit broke
//   pursuit     a fleeing unit cut down from behind
//   fled        a broken unit left the field over its home edge
//   destroyed   a unit fell to zero strength
//   victory     the battle ended

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
