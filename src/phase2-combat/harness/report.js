// src/phase2-combat/harness/report.js
// Turns a run record into stable text.
//
// Stable matters: the output is diffed between runs to see what a rules change
// actually did. Nothing here may include a timestamp, a random value, or an
// object key whose order is not fixed.

const { terrainAt } = require('./world')

function formatUnit(unit) {
  const pct = Math.round((unit.strength / unit.maxStrength) * 100)
  const state = unit.strength === 0 ? 'DESTROYED' : `${unit.strength}/${unit.maxStrength} (${pct}%)`
  return `    ${unit.id.padEnd(18)} ${unit.side.padEnd(6)} ${unit.position.padEnd(5)} ${terrainAt(unit.position).padEnd(8)} ${state}`
}

function formatMovement(move) {
  if (move.skipped) return `    ${move.unitId}: skipped (${move.skipped})`
  if (move.held) return `    ${move.unitId}: held at ${move.position}`
  if (move.failed) return `    ${move.unitId}: FAILED — ${move.failed}`

  const arrival = move.reachedTarget
    ? 'arrived'
    : move.blockedBy
      ? `blocked by ${move.blockedBy}`
      : `en route to ${move.target}`
  return `    ${move.unitId}: ${move.from} -> ${move.to} (${move.tilesMoved} tiles, ${move.terrain}, ${arrival})`
}

function formatReport(record) {
  const lines = []

  lines.push(`SCENARIO: ${record.scenario}`)
  lines.push(`seed=${record.seed} combat=${record.combatEnabled ? 'on' : 'off'}`)
  lines.push('')

  for (const turn of record.turns) {
    lines.push(`── TURN ${turn.turn} ${'─'.repeat(48)}`)

    lines.push('  movement:')
    if (turn.movement.length === 0) lines.push('    (none)')
    for (const move of turn.movement) lines.push(formatMovement(move))

    lines.push(`  engagements: ${turn.engagements.length}`)
    for (const e of turn.engagements) {
      lines.push(`    ${e.aId} vs ${e.bId} — ${e.distance} tile(s), ${e.aTerrain}/${e.bTerrain}`)
    }

    if (turn.events.length > 0) {
      lines.push('  events:')
      for (const event of turn.events) lines.push(`    ${event}`)
    }

    if (turn.casualties.length > 0) {
      lines.push('  casualties:')
      for (const c of turn.casualties) {
        lines.push(`    ${c.unitId}: -${c.killed} (${c.remaining} left)${c.destroyed ? ' DESTROYED' : ''}`)
      }
    }

    lines.push('  state:')
    for (const unit of turn.snapshot.units) lines.push(formatUnit(unit))
    lines.push('')
  }

  lines.push(`OUTCOME: ${record.outcome.winner ?? 'undecided'} — ${record.outcome.reason}`)

  return lines.join('\n')
}

// One-line-per-run summary, for sweeping many seeds at once.
function formatSummary(record) {
  const survivors = record.turns.at(-1)?.snapshot.units ?? []
  const strengths = survivors
    .map(u => `${u.id}=${u.strength}`)
    .sort()
    .join(' ')

  return `seed=${String(record.seed).padStart(4)} turns=${record.turns.length} winner=${(record.outcome.winner ?? 'none').padEnd(6)} ${strengths}`
}

module.exports = { formatReport, formatSummary }
