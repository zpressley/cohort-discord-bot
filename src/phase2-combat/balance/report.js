// src/phase2-combat/balance/report.js
//
// Text rendering for the balance matrix. Stable and diffable: no timestamps, no
// wall clock, fixed column widths, deterministic ordering. Two reports from the
// same tables must be byte-identical, so a tuning change shows up as a diff of
// exactly what moved and nothing else.

const T = require('../combat/tables')

const BAND_MIN = 2   // [design goal 2] the rout floor
const BAND_MAX = 8   // [design goal 2] the no-stalemate cap

function formatMatrix(matrix) {
  const lines = []
  lines.push(`MATRIX  quality=${matrix.quality}  sims=${matrix.sims}`)
  lines.push('')
  lines.push('  pairing                             winA  winB  draw  rounds        surv   flags')
  lines.push('  ' + '-'.repeat(78))

  for (const cell of matrix.cells) {
    lines.push('  ' + formatCell(cell))
  }

  const offenders = matrix.cells.filter(outOfBand)
  lines.push('')
  lines.push(offenders.length === 0
    ? `  all ${matrix.cells.length} pairings resolve within ${BAND_MIN}-${BAND_MAX} rounds`
    : `  ${offenders.length} of ${matrix.cells.length} pairings are outside the ${BAND_MIN}-${BAND_MAX} round band`)

  return lines.join('\n')
}

function formatCell(cell) {
  const pairing = `${cell.a} v ${cell.b}`.padEnd(34)
  const winA = pct(cell.winRateA)
  const winB = pct(cell.winRateB)
  const draw = pct(cell.drawRate)
  const rounds = `${cell.rounds.mean.toFixed(1)} [${cell.rounds.min}-${cell.rounds.max}]`.padEnd(13)
  const surv = pct(cell.survivorPct)

  const flags = []
  if (cell.mirror && Math.abs(cell.winRateA - 0.5) > 0.12) flags.push('MIRROR-SKEW')
  if (cell.rounds.max > BAND_MAX) flags.push('TOO-LONG')
  if (cell.rounds.min < BAND_MIN) flags.push('TOO-SHORT')
  if (cell.stalemateRate > 0) flags.push('STALEMATE')

  return `${pairing}${winA} ${winB} ${draw}  ${rounds} ${surv}   ${flags.join(' ')}`
}

function formatLadder(ladder) {
  const lines = []
  lines.push(`MIRROR LADDER  archetype=${ladder.archetype}  sims=${ladder.sims}`)
  lines.push('')
  lines.push('  tier                 cost  rounds        winA  surv   resolution')
  lines.push('  ' + '-'.repeat(70))

  for (const rung of ladder.rungs) {
    const tier = rung.quality.padEnd(20)
    const cost = String(rung.costA).padStart(4)
    const rounds = `${rung.rounds.mean.toFixed(1)} [${rung.rounds.min}-${rung.rounds.max}]`.padEnd(13)
    const win = pct(rung.winRateA)
    const surv = pct(rung.survivorPct)
    const resolution = dominantResolution(rung.resolutions)
    lines.push(`  ${tier} ${cost}  ${rounds} ${win} ${surv}   ${resolution}`)
  }

  return lines.join('\n')
}

// One traced fight, so the damage and stamina curves can be eyeballed rather
// than inferred from aggregates. [design contract] asks for this by name.
function formatSample(sample) {
  const lines = []
  lines.push(`SAMPLE  seed=${sample.seed}  ${sample.winner} wins by ${sample.resolution} in ${sample.rounds} rounds`)
  for (const event of sample.events) lines.push(`  ${event}`)
  lines.push(`  final  a: ${sample.a.strength}/${sample.a.maxStrength} men, ` +
    `morale ${sample.a.morale.toFixed(0)}, stamina ${sample.a.stamina.toFixed(0)}` +
    (sample.a.routed ? ' ROUTED' : ''))
  lines.push(`         b: ${sample.b.strength}/${sample.b.maxStrength} men, ` +
    `morale ${sample.b.morale.toFixed(0)}, stamina ${sample.b.stamina.toFixed(0)}` +
    (sample.b.routed ? ' ROUTED' : ''))
  return lines.join('\n')
}

// The tuning knobs, printed with the report so a saved report says which
// numbers produced it.
function formatTuning() {
  return [
    'TUNING',
    `  damage.baseRate            ${T.DAMAGE.BASE_RATE}`,
    `  damage.snowballExponent    ${T.DAMAGE.STRENGTH_SNOWBALL_EXPONENT}`,
    `  morale.routThreshold       ${T.MORALE.ROUT_THRESHOLD}`,
    `  morale.routFloorRound      ${T.MORALE.ROUT_FLOOR_ROUND}`,
    `  morale.resistancePerPoint  ${T.MORALE.RESISTANCE_PER_POINT}`,
    `  morale.casualtyCoef        ${T.MORALE.CASUALTY_COEF}`,
    `  morale.exhaustionCoef      ${T.MORALE.EXHAUSTION_COEF}`,
    `  stamina.baseDrain          ${T.STAMINA.BASE_DRAIN}`,
    `  stamina.fullAbove          ${T.STAMINA.FULL_ABOVE}`,
    `  stamina.floorMultiplier    ${T.STAMINA.FLOOR_MULTIPLIER}`,
    `  charge.decay               [${T.CHARGE.DECAY.join(', ')}]`,
    `  charge.sustained           ${T.CHARGE.SUSTAINED}`,
    `  charge.bracedMultiplier    ${T.CHARGE.BRACED_MULTIPLIER}`,
    `  chaos.rollMax              ${T.CHAOS.ROLL_MAX}`,
    `  chaos.preparedReduction    ${T.CHAOS.PREPARED_REDUCTION}`,
    `  push.moraleCoef            ${T.PUSH.MORALE_COEF}`
  ].join('\n')
}

function outOfBand(cell) {
  return cell.rounds.max > BAND_MAX || cell.rounds.min < BAND_MIN || cell.stalemateRate > 0
}

function dominantResolution(resolutions) {
  return Object.entries(resolutions)
    .sort((x, y) => y[1] - x[1])[0][0]
}

function pct(value) {
  return `${(100 * value).toFixed(0).padStart(3)}%`
}

module.exports = { formatMatrix, formatLadder, formatSample, formatTuning, outOfBand }
