// src/adapters/hotseat/render.js
//
// Text rendering for the hotseat CLI: the fog-limited map, the roster, the
// intel board, and the turn narrative. Everything is a pure function from
// game state to string — the shell prints, the tests assert on substrings.
//
// The fog rule is absolute here exactly as it is in sideView: a unit the
// side's intel does not carry DOES NOT APPEAR, and a ghost renders at its
// last known position, not its real one. This renderer is the first real
// consumer of the fog contract, which is the point of building it now — the
// Discord embeds will show precisely what this shows.

const { toLabel, fromLabel, samePosition } = require('../../engine/map/labels')
const { sideView } = require('../../engine/orchestrator')

const TERRAIN_GLYPHS = {
  plains: '.', road: '=', hill: '^', forest: 'F',
  marsh: 'm', river: '~', ford: 'f', bridge: 'B'
}

// ── The map ──────────────────────────────────────────────
//
// A viewport clipped to the action: the bounding box of everything the side
// knows about (own units + intel), padded, clamped to the map's edges. Own
// units draw as uppercase letters, visible enemies as lowercase, ghosts as
// '?'; the legend below decodes them. Rendering the whole map is available
// (`fullMap: true`) but forty rows of scroll between orders helps nobody.
function renderMap(game, side, { fullMap = false, pad = 4, minSpan = 12 } = {}) {
  const view = sideView(game, side)
  const map = game.battle.map
  const markers = new Map() // label -> glyph
  const ownLegend = []
  const enemyLegend = []

  view.own.filter(u => u.strength > 0).forEach((unit, index) => {
    const letter = String.fromCharCode(65 + (index % 26))
    markers.set(toLabel(unit.position), letter)
    ownLegend.push(`${letter}=${unit.id} (${unit.strength}/${unit.maxStrength})`)
  })

  view.intel.forEach((entry, index) => {
    const letter = String.fromCharCode(97 + (index % 26))
    if (entry.status === 'visible') {
      markers.set(toLabel(entry.position), letter)
      enemyLegend.push(`${letter}=${entry.id} (~${entry.strength})`)
    } else {
      const label = toLabel(entry.position)
      if (!markers.has(label)) markers.set(label, '?')
      enemyLegend.push(`?=${entry.id} last seen ${label}, turn ${entry.seenOnTurn}`)
    }
  })

  const box = fullMap
    ? { minRow: 0, maxRow: map.height - 1, minCol: 0, maxCol: map.width - 1 }
    : viewportFor(map, [...markers.keys()], pad, minSpan)

  const lines = []
  let header = '    '
  for (let col = box.minCol; col <= box.maxCol; col++) {
    header += columnLabel(col).slice(-1)
  }
  lines.push(header)

  for (let row = box.minRow; row <= box.maxRow; row++) {
    let line = String(row + 1).padStart(3) + ' '
    for (let col = box.minCol; col <= box.maxCol; col++) {
      const position = { x: col, y: row }
      line += markers.get(toLabel(position)) ?? (TERRAIN_GLYPHS[map.terrainAt(position)] ?? '?')
    }
    lines.push(line)
  }

  lines.push('')
  lines.push(`  yours:  ${ownLegend.join('  ') || 'none standing'}`)
  lines.push(`  enemy:  ${enemyLegend.join('  ') || 'nothing sighted'}`)
  lines.push(`  ground: .plains =road ^hill Fforest ~river fford Bbridge  (cols ${columnLabel(box.minCol)}-${columnLabel(box.maxCol)})`)
  return lines.join('\n')
}

function viewportFor(map, labels, pad, minSpan) {
  if (labels.length === 0) return { minRow: 0, maxRow: minSpan, minCol: 0, maxCol: minSpan }
  let minRow = map.height, maxRow = 0, minCol = map.width, maxCol = 0
  for (const label of labels) {
    const p = fromLabel(label)
    minRow = Math.min(minRow, p.y); maxRow = Math.max(maxRow, p.y)
    minCol = Math.min(minCol, p.x); maxCol = Math.max(maxCol, p.x)
  }
  minRow -= pad; maxRow += pad; minCol -= pad; maxCol += pad
  while (maxRow - minRow < minSpan) { minRow--; maxRow++ }
  while (maxCol - minCol < minSpan) { minCol--; maxCol++ }
  return {
    minRow: Math.max(0, minRow), maxRow: Math.min(map.height - 1, maxRow),
    minCol: Math.max(0, minCol), maxCol: Math.min(map.width - 1, maxCol)
  }
}

function columnLabel(col) {
  return toLabel({ x: col, y: 0 }).replace(/\d+$/, '')
}

// ── The roster ───────────────────────────────────────────
// The commander knows their own men: strength, and — when the unit has
// fought — morale and stamina from the resolver's ledger. Bars, because a
// number is read and a bar is felt.
function renderRoster(game, side) {
  const view = sideView(game, side)
  const lines = [`── ${side.toUpperCase()} — turn ${game.playerTurn}, ${clock(game.minutesElapsed)} ──`]

  // The dead do not muster. Their end was narrated when it happened; keeping
  // a zero-strength line in the roster reads like a unit awaiting orders.
  for (const unit of view.own.filter(u => u.strength > 0)) {
    const state = game.battle.resolver.getState(unit.id)
    let line = `  ${unit.id.padEnd(14)} ${toLabel(unit.position).padEnd(5)} ` +
      `men ${bar(unit.strength, unit.maxStrength)} ${unit.strength}`
    if (state) {
      line += `   morale ${bar(state.morale, 100)}   wind ${bar(state.stamina, 120)}`
      if (state.routed) line += '  ** BROKEN — fleeing **'
    }
    lines.push(line)
  }
  if (view.own.length === 0) lines.push('  no units standing')
  return lines.join('\n')
}

function bar(value, max, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)))
  return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + ']'
}

function clock(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m of battle` : `${m}m of battle`
}

// ── The turn narrative ───────────────────────────────────
// The typed event log, worded. This is the plain-prose stand-in for the AI
// narrator: same input (the event log and nothing else), no voice. When the
// narrator lands it replaces these sentences, not this plumbing.
function renderTurnReport(game, turnEntry) {
  const lines = [`── the field reports (turn ${turnEntry.playerTurn}, ${turnEntry.interrupt}) ──`]

  for (const tick of turnEntry.ticks) {
    const events = game.battle.log.forTurn(tick.battleTurn)
    for (const event of events) {
      const line = wordEvent(event)
      if (line) lines.push('  ' + line)
    }
  }
  if (lines.length === 1) lines.push('  nothing to report')

  if (game.outcome.decided) {
    lines.push('')
    lines.push(game.outcome.winner === 'draw'
      ? `── THE FIELD IS A RUIN: ${game.outcome.reason} ──`
      : `── VICTORY: ${game.outcome.winner.toUpperCase()} — ${game.outcome.reason} ──`)
  }
  return lines.join('\n')
}

function wordEvent(event) {
  switch (event.type) {
    case 'move':
      if (event.blockedBy && samePosition(event.from, event.to)) {
        return `${event.unitId} cannot advance — ${event.blockedBy} bars the way`
      }
      if (event.blockedBy) return `${event.unitId} advances ${toLabel(event.from)}→${toLabel(event.to)}, stopped by ${event.blockedBy}`
      return samePosition(event.from, event.to) ? null : `${event.unitId} moves ${toLabel(event.from)}→${toLabel(event.to)}`
    case 'contact': return `CONTACT: ${event.aId} meets ${event.bId}`
    case 'exchange': return event.detail
    case 'push':
      return `${event.by} drives ${event.unitId} back to ${toLabel(event.to)}` +
        (event.lostHighGround ? ' — off the high ground!' : '')
    case 'crush': return `${event.unitId} has nowhere to give — crushed against ${event.reason}`
    case 'rout': return `${event.unitId} BREAKS and runs from ${event.by}`
    case 'pursuit':
      return `${event.by} cuts down ${event.killed} of the fleeing ${event.unitId}` +
        (event.trapped ? ' — they are cornered' : '')
    case 'fled': return `${event.unitId} escapes the field with ${event.strength} men`
    case 'destroyed': return `${event.unitId} is wiped out`
    case 'victory': return null // rendered as the banner instead
    default: return null
  }
}

// The hotseat curtain between two players at one keyboard.
function renderHandoff(side) {
  return [
    '\n'.repeat(30),
    '═'.repeat(46),
    `   Pass the seat. ${side.toUpperCase()} commander only —`,
    '   press Enter when ready.',
    '═'.repeat(46)
  ].join('\n')
}

module.exports = { renderMap, renderRoster, renderTurnReport, renderHandoff, wordEvent }
