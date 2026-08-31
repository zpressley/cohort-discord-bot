// src/phase7-hotseat/parser.js
//
// The deterministic order grammar for the hotseat CLI. This is NOT the AI
// interpreter — that stays at the Discord/AI edge (phase 7's flagged half) —
// but it is deliberately shaped like the AI's output contract: whatever it
// parses becomes { unitRef, target }, the exact thing the orchestrator's
// expandOrders consumes. When the AI interpreter lands it emits the same
// shape and the whole stack below this line is already tested.
//
// Grammar (one order per line, case-insensitive):
//
//   <unitRef> to <coord|landmark>     spears to K7 / everyone to the bridge
//   <unitRef> hold                    the archers hold
//   hold                              everyone holds
//   surrender                         yields the battle
//   done                              finish this side's orders
//
// unitRef is whatever phase 3's resolver accepts: "everyone", a unit id, an
// alias, a role word. Targets are grid coords (K7, AA12) or phase 1 landmark
// names ("north ford", "the bridge") — ambiguity comes back as a question,
// never a guess, which is the same rule the AI prompt enforces.

const { resolve: resolveLandmark } = require('../phase1-movement/landmarkResolver')

const COORD = /^[a-z]{1,2}\d{1,2}$/i

/**
 * @param {string} line
 * @returns one of:
 *   { kind: 'order', unitRef, target }
 *   { kind: 'hold', unitRef }          unitRef 'everyone' for bare "hold"
 *   { kind: 'surrender' } | { kind: 'done' }
 *   { kind: 'ask', question }          ambiguity or an unknown place
 *   { kind: 'empty' }
 */
function parseOrderLine(line) {
  const text = String(line ?? '').trim()
  if (!text) return { kind: 'empty' }

  const lower = text.toLowerCase()
  if (lower === 'done' || lower === 'end') return { kind: 'done' }
  if (lower === 'surrender' || lower === 'yield') return { kind: 'surrender' }
  if (lower === 'hold') return { kind: 'hold', unitRef: 'everyone' }

  const holdMatch = lower.match(/^(.+?)\s+holds?$/)
  if (holdMatch) return { kind: 'hold', unitRef: holdMatch[1].trim() }

  // "<unitRef> to <target>" — the ' to ' split is greedy-left so unit names
  // containing "to" ("the tortoises") still work: the LAST ' to ' splits.
  const splitAt = lower.lastIndexOf(' to ')
  if (splitAt === -1) {
    return {
      kind: 'ask',
      question: `I don't follow "${text}". Orders read like: spears to K7 · everyone to the bridge · hold · done`
    }
  }

  const unitRef = text.slice(0, splitAt).trim()
  const rawTarget = text.slice(splitAt + 4).trim()
  if (!unitRef || !rawTarget) {
    return { kind: 'ask', question: `Who goes where? ("${text}")` }
  }

  const target = resolveTarget(rawTarget)
  if (target.coord) return { kind: 'order', unitRef, target: target.coord }
  return { kind: 'ask', question: target.question }
}

function resolveTarget(raw) {
  if (COORD.test(raw)) return { coord: raw.toUpperCase() }

  const landmark = resolveLandmark(raw)
  if (landmark.confidence === 'exact' || landmark.confidence === 'partial') {
    return { coord: landmark.coord }
  }
  if (landmark.confidence === 'ambiguous') {
    const names = landmark.matches.map(m => m.landmark ?? m.coord).join(' or ')
    return { question: `Which do you mean by "${raw}" — ${names}?` }
  }
  return { question: `I know no place called "${raw}". Try a coordinate (K7) or a landmark name.` }
}

/**
 * Parse a whole block of lines into side orders for submitOrders.
 * `hold` maps to target 'hold', which the movement resolver treats as
 * standing fast — it also overrides a standing 'advance' for that unit.
 */
function parseOrderBlock(lines) {
  const orders = []
  const questions = []
  let surrender = false

  for (const line of lines) {
    const parsed = parseOrderLine(line)
    if (parsed.kind === 'order') orders.push({ unitRef: parsed.unitRef, target: parsed.target })
    else if (parsed.kind === 'hold') orders.push({ unitRef: parsed.unitRef, target: 'hold' })
    else if (parsed.kind === 'surrender') surrender = true
    else if (parsed.kind === 'ask') questions.push(parsed.question)
    else if (parsed.kind === 'done') break
  }

  return { orders, questions, surrender }
}

module.exports = { parseOrderLine, parseOrderBlock }
