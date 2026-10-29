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
//   spears attack the ford / storm C7       attack (go there looking for a fight)
//   archers hide in the woods               hide (go there, then hide)
//   scouts check the woods / search C7      check (go there, then search)
//   spears ambush in the woods              ambush (hide, then strike)
//   spears spring the trap                  advance: strike now, from hiding
//   spears hide in the woods and hit anything that passes        ambush
//
// Modifiers anywhere in the line:
//   carefully / on guard / cautiously       careful: half speed, not surprised
//   let two pass / let the first one pass   an ambush lets that many go by
//   the cavalry / horse / archers / foot    what an ambush strikes
//   whatever happens / no matter what       an ambush strikes even a unit
//                                           on guard
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

// "spring the trap": the player springs an ambush by ordering it to attack.
const ADVANCE = /^(?:(.+?)\s+)?(?:advance|attack|charge|engage|press (?:the|on|the attack)|go forward|spring (?:the )?(?:trap|ambush)|strike now)(?:\s+.*)?$/i

// Stage 3 verbs: ambush, hide, check, and attacking a place.
const PREP = '(?:in|at|on|by|from|behind|among|inside|into|near)'
// "ambush the cavalry from the woods": an optional object, then the place.
const AMBUSH = new RegExp(`^(?:(.+?)\\s+)?(?:ambush|lie in wait|wait in ambush|set (?:an )?ambush|lay (?:an )?ambush)(?:\\s+(?!${PREP}\\b)(.+?))??(?:\\s+${PREP}\\s+(.+))?$`, 'i')
// "hide in the woods and hit anything that passes": a hide that strikes.
const HIDE_AND_STRIKE = new RegExp(`^(?:(.+?)\\s+)?(?:hide|hold|wait|lie low|stay hidden|take cover)\\s+${PREP}\\s+(.+?)\\s*(?:,|\\band\\b|\\bthen\\b)\\s*(?:then\\s+)?(?:hit|strike|attack|fall on|ambush|charge|jump)\\b.*$`, 'i')
const HIDE = new RegExp(`^(?:(.+?)\\s+)?(?:hide|take cover|go to ground|lie low|conceal themselves|stay hidden)(?:\\s+${PREP}\\s+(.+))?$`, 'i')
const CHECK = /^(?:(.+?)\s+)?(?:check|search|scout|sweep|comb|look (?:in|into|through|over)|investigate)\b(?:\s+(.+))?$/i
const ATTACK_PLACE = /^(?:(.+?)\s+)?(?:attack|storm|assault|seize|capture|charge)\s+(.+)$/i
// What "attack ..." names that is not a place: the enemy itself.
const NOT_A_PLACE = /^(?:the )?(?:enemy|enemies|them|foe|foes|nearest(?: enemy)?|anything|everything)$/i

const CAREFUL = /\s*\b(?:carefully|cautiously|warily|with care|on guard|on their guard|slowly)\b/ig
const REGARDLESS = /\s*,?\s*\b(?:whatever happens|no matter what|regardless|at all costs|come what may)\b/ig
const NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
const LET_PASS = /\s*,?\s*(?:\band\s+)?\blet\s+(?:the\s+first\s+)?(\d+|a|an|one|two|three|four|five|six)\s+(?:units?\s+|of them\s+|enemies\s+)?(?:pass|go by|go past|through|by)(?:\s+first)?\b/i
const KINDS = [
  ['cavalry', /\b(?:cavalry|horse|horses|horsemen|riders|knights)\b/i],
  ['archers', /\b(?:archers|bowmen|slingers|skirmishers|missile troops)\b/i],
  ['scouts', /\b(?:scouts)\b/i],
  ['infantry', /\b(?:infantry|foot(?:men)?|foot soldiers)\b/i]
]
// What an ambush strikes, read from the words after its verb: "ambush the
// cavalry", "hit their horse". The unit's own name comes first and is
// not read.
function ambushKind(text) {
  const after = text.replace(/^.*?\b(?:ambush|hit|strike|attack|fall on|charge|lie in wait|wait in ambush)\b/i, '')
  for (const [kind, words] of KINDS) if (words.test(after)) return kind
  return null
}
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

  // Modifiers first, so the verb patterns read the bare order.
  const extra = {}
  if (CAREFUL.test(text)) { extra.careful = true; text = clean(text.replace(CAREFUL, '')) }
  CAREFUL.lastIndex = 0
  if (REGARDLESS.test(text)) { extra.regardless = true; text = clean(text.replace(REGARDLESS, '')) }
  REGARDLESS.lastIndex = 0
  const letPass = text.match(LET_PASS)
  if (letPass) {
    extra.letPass = NUMBERS[letPass[1].toLowerCase()] ?? parseInt(letPass[1], 10)
    text = clean(text.replace(LET_PASS, ''))
  }

  const stage3 = readStage3(text, extra)
  if (stage3) return stage3

  const read = readOlder(text, line)
  return read.kind === 'order' ? { ...read, ...extra } : read
}

// The Stage 2 verbs: move, defend, hold, advance, withdraw.
function readOlder(text, line) {
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
      'archers defend the ford · everyone advance · swords fall back · hold · ' +
      'archers hide in the woods · scouts check the woods · spears ambush in the woods · done'
  }
}

function order(unitRef, action, place, then, extra = {}) {
  return { kind: 'order', unitRef: clean(unitRef) || 'everyone', action, place, then, ...extra }
}

// Ambush, hide, check and attack-a-place, or null for the older verbs.
const SPRING = /^(?:(.+?)\s+)?(?:spring (?:the )?(?:trap|ambush)|strike now)$/i

function readStage3(text, extra) {
  const spring = text.match(SPRING)
  if (spring) return order(spring[1], 'advance', null, null, extra)
  const ambushExtra = () => {
    const against = ambushKind(text)
    return { ...extra, ...(against ? { against } : {}) }
  }
  let m = text.match(HIDE_AND_STRIKE)
  if (m) return order(m[1], 'ambush', clean(m[2]), null, ambushExtra())
  m = text.match(AMBUSH)
  if (m) {
    // "ambush the cavalry from the woods": the place is what follows the
    // preposition; what to strike is read separately.
    return order(m[1], 'ambush', m[3] ? clean(m[3]) : null, null, ambushExtra())
  }
  if (extra.letPass !== undefined || extra.regardless) {
    // "spears in the woods, let two pass": an ambush without the word.
    const lying = text.match(new RegExp(`^(?:(.+?)\\s+)?(?:hide|hold|wait|lie low|stay)?\\s*${PREP}\\s+(.+)$`, 'i'))
    if (lying && /\b(?:hit|strike|attack|fall on|ambush)\b/i.test(text) === false && extra.letPass !== undefined) {
      return order(lying[1], 'ambush', clean(lying[2]), null, ambushExtra())
    }
  }
  m = text.match(HIDE)
  if (m) return order(m[1], 'hide', m[2] ? clean(m[2]) : null, null, extra)
  m = text.match(CHECK)
  if (m) return order(m[1], 'check', m[2] ? clean(m[2].replace(/^(?:the ground|around)\b\s*/i, '')) || null : null, null, extra)
  m = text.match(ATTACK_PLACE)
  if (m && !NOT_A_PLACE.test(clean(m[2])) && !/\s(?:to|towards|toward)\s/i.test(text)) {
    return order(m[1], 'attack', clean(m[2]), null, extra)
  }
  return null
}

module.exports = { parseLine }
