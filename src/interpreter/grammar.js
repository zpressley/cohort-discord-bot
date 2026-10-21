// src/interpreter/grammar.js
//
// The fixed order grammar: plain sentences a player can type without any
// AI. It is also the fallback whenever the AI is unavailable or replies with
// something unusable, so the game never depends on the AI answering.
//
// One line, one order. What it understands:
//
//   spears to the ridge to the east         move
//   swords approach the woods               move
//   spears to the clearing and hold         defend (go there, then hold)
//   archers defend the ford                 defend
//   horse dig in at the clearing            defend
//   archers hold        / hold              hold (bare "hold" = everyone)
//   everyone advance    / advance           advance on the enemy
//   swords withdraw     / fall back to C7   withdraw (to a place, or home)
//   surrender           / done
//
// The result is an intent: words for which units and words for where.
// Turning those into unit ids and map positions is resolve.js's job, which
// needs the battle; this file needs nothing.

function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

// Endings that mean "and then hold there".
const THEN_HOLD = /\s*(?:,|\band\b|\bthen\b)\s*(?:then\s+)?(?:hold(?: it| there| the position)?|dig in|stand|set up (?:a )?defensive positions?|defend it|make a stand)\s*\.?$/i

// Verb phrases, tried in this order. Each splits "units VERB place".
// The unit words are optional: "fall back to K8" or "stop at the clearing"
// with no one named means everyone.
const VERBS = [
  { action: 'defend', pattern: /^(?:(.+?)\s+)?(?:dig in at|dig in on|set up (?:a )?defensive positions? (?:at|on|in)|defend|hold at|hold on|make a stand at)\s+(.+)$/i },
  { action: 'withdraw', pattern: /^(?:(.+?)\s+)?(?:withdraw|fall back|retreat|pull back)(?:\s+(?:to|towards|toward)\s+(.+))?$/i },
  { action: 'move', pattern: /^(?:(.+?)\s+)?(?:stop at|halt at|march to|march on|move to|go to|head for|make for|approach|towards|toward|to)\s+(.+)$/i }
]

const ADVANCE = /^(?:(.+?)\s+)?(?:advance|attack|charge|engage|press (?:the|on|the attack)|go forward)(?:\s+.*)?$/i
const HOLD = /^(?:(.+?)\s+)?(?:holds?|stand fast|stay put|halt|stop)$/i

/**
 * @returns one of
 *   { kind: 'order', unitRef, action, place, then }   place may be null
 *   { kind: 'surrender' } | { kind: 'done' } | { kind: 'empty' }
 *   { kind: 'ask', question }   the line could not be read
 */
function parseLine(line) {
  let text = clean(line).replace(/[.!]+$/, '')
  if (!text) return { kind: 'empty' }

  const lower = text.toLowerCase()
  if (lower === 'done' || lower === 'end' || lower === 'end turn') return { kind: 'done' }
  if (lower === 'surrender' || lower === 'yield') return { kind: 'surrender' }

  // "... and hold" turns a move into a defend. Checked first, so the plain
  // "X hold" rule below cannot swallow "X to the ford and hold".
  let then = null
  if (THEN_HOLD.test(text) && VERBS.some(v => v.pattern.test(text.replace(THEN_HOLD, '')))) {
    then = 'hold'
    text = text.replace(THEN_HOLD, '')
  }

  if (!then) {
    const hold = text.match(HOLD)
    if (hold) return order(hold[1], 'hold', null, null)

    const advance = text.match(ADVANCE)
    if (advance && !/\s(?:to|towards|toward)\s/i.test(text)) return order(advance[1], 'advance', null, null)
  }

  for (const { action, pattern } of VERBS) {
    const match = text.match(pattern)
    if (!match) continue
    const place = match[2] ? clean(match[2]) : null
    if (action === 'move' && then === 'hold') return order(match[1], 'defend', place, 'hold')
    return order(match[1], action, place, action === 'move' ? then : null)
  }

  return {
    kind: 'ask',
    question: `I don't follow "${clean(line)}". Orders read like: spears to the ridge to the east · ` +
      'archers defend the ford · everyone advance · swords fall back · hold · done'
  }
}

function order(unitRef, action, place, then) {
  return { kind: 'order', unitRef: clean(unitRef) || 'everyone', action, place, then }
}

module.exports = { parseLine }
