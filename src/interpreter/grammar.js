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
//   archers go north / horse move 200 m east   move, by compass from where
//                                              the unit stands
//   everyone advance    / advance           advance on the enemy
//   swords withdraw     / fall back to C7   withdraw (to a place, or home)
//   spears attack the ford / storm C7       attack (go there looking for a fight)
//   horse attack their archers              attack an enemy unit its side has
//   spears charge the enemy swords          seen, and follow it (an enemy
//   swords go for the archers               kind, or a word of its name)
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
// "attack their archers", "go for the horse": an enemy unit, not a place.
// After attack, charge and the like the words must say it is the enemy
// ("their", "the enemy", "enemy") or name a kind of troops ("the archers");
// "go for" and "go after" are only ever said of an enemy.
const GO_FOR = /^(?:(.+?)\s+)?(go for|go after|ride down|run down|fall on|fall upon|attack|charge|assault|engage|hit|strike)\s+(.+)$/i
const THE_ENEMY = /^(?:(?:the|their|those|that|enemy|enemy's|the enemy's)\s+)+/i
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
const HOLD = /^(?:(.+?)\s+)?(?:holds?(?:\s+(?:position|positions|the line|your ground|their ground|its ground|fast|firm|here|there))?|stand (?:fast|firm)|stay(?:\s+(?:put|here|there))?|wait(?:\s+(?:here|there))?|halt|stop)$/i

// "archers go north", "horse move 200 m east": a compass direction from where
// the unit stands (200 m when no distance is given).
const COMPASS_WORDS = '(north[- ]?east|north[- ]?west|south[- ]?east|south[- ]?west|north|south|east|west)'
const GO_DIRECTION = new RegExp(`^(?:(.+?)\\s+)?(?:go|move|march|head|shift|step|ride|walk)\\s+(?:(\\d{1,4})\\s*(?:m|metres?|meters?|paces|yards?)\\s+)?(?:to the\\s+|due\\s+)?${COMPASS_WORDS}$`, 'i')

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

  // An order with depth: steps ("..., then ...") or a condition ("if ...").
  if (DEEP.test(text)) {
    const deep = readDeep(text, extra)
    if (deep) return deep
  }

  const stage3 = readStage3(text, extra)
  if (stage3) return stage3

  const read = readOlder(text, line)
  return read.kind === 'order' ? { ...read, ...extra } : read
}

// ── Orders with depth ──────────────────────────────────
//
//   swords to C4, then on to the bridge, then dig in          a chain
//   spears to the ford; if their horse is there, hold         one condition
//   archers hold. If you are attacked, fall back to the hill
//   horse hold, if the spears break fall back
//
// The pieces are plain orders, read by the same rules as any line. If a
// piece cannot be read, the whole line is left for the AI.

const DEEP = /\b(?:then|if|after that)\b/i
const STEP_SPLIT = /\s*(?:[,;.]\s*|\s+)(?:and\s+)?(?:then|after that|afterwards)[,]?\s+(?:on\s+(?=to\b))?/i
const HOLD_PIECE = /^(?:hold(?: it| there| the position| fast)?|dig in|stand(?: fast)?|defend it|make a stand|stay(?: there)?)$/i
const IF_SPLIT = /\s*[,;.]?\s*\b(?:but\s+|and\s+)?if\s+/i

// What comes after "if", up to the comma or "then" that starts what to do.
const SEES = /^(?:you|they|he|the men)?\s*(?:see|sees|spot|spots|sight|sights|meet|meets|find|finds|run into|runs into)\s+(.+)$/i
const IS_THERE = /^(?:the\s+|their\s+|enemy\s+|the enemy'?s?\s+)*(.+?)\s+(?:is|are)\s+(?:there|here|waiting|waiting there|holding it|on it|(?:at|on|in|by|near)\s+(.+))$/i
const HELD = /^(?:it|the place|that)\s+is\s+(?:held|taken|occupied|defended|guarded)|^(?:the enemy|they)\s+(?:hold|holds|have|has taken)\s+it$/i
const ATTACKED = /^(?:you are|you're|they are|he is|you get|they get)?\s*(?:attacked|charged|engaged|shot at|fired on|hit|under attack|under fire)$|^(?:the enemy|they|anyone)\s+(?:attack|attacks|charge|charges|come at you|comes at you|come on|engage|engages)(?:\s+you)?$/i
const BREAKS = /^(?:the\s+)?(.+?)\s+(?:break|breaks|rout|routs|run|runs|flee|flees|give way|gives way|are broken|is broken)$/i

function readCondition(words) {
  const text = clean(words)
  if (ATTACKED.test(text)) return { type: 'attacked' }
  if (HELD.test(text)) return { type: 'sees', kind: null, near: 'target' }
  let m = text.match(SEES)
  if (m) return { type: 'sees', kind: shootFirst(m[1]), near: null }
  m = text.match(IS_THERE)
  if (m) return { type: 'sees', kind: shootFirst(m[1]), near: m[2] ? clean(m[2]) : 'target' }
  m = text.match(BREAKS)
  // "their horse breaks" is the enemy's doing, which an order cannot wait on.
  if (m && !/\b(?:their|enemy)\b/i.test(text)) return { type: 'breaks', unitRef: clean(m[1]) }
  return null
}

// One piece of a deep order, read as a plain line. A piece that names no
// one ("on to the bridge", "fall back") is for the unit the line began with.
function readPiece(piece, who) {
  const text = clean(piece).replace(/^(?:then\s+)?(?:they\s+|he\s+|you\s+)?(?:should\s+|must\s+|can\s+)?/i, '')
  if (!text) return null
  // Read with the unit's name put back in front. A piece that names some
  // other unit is not a step of this order, and comes out with the wrong
  // name, which the caller refuses.
  const forThem = parseLine(who === 'everyone' ? text : `${who} ${text}`)
  return forThem.kind === 'order' && !forThem.steps && !forThem.when ? forThem : null
}

function readDeep(text, extra) {
  // The condition, if there is one, follows the order: "..., if X, Y".
  let main = text
  let when = null
  const split = text.split(IF_SPLIT)
  if (split.length > 2) return null
  if (split.length === 2) {
    if (!clean(split[0])) return null   // "if ..., ...; otherwise ..." is for the AI
    main = split[0]
    // What to do is set off by a comma or "then", or simply begins with a
    // verb: "if the spears break fall back".
    const parts = split[1].match(/^(.+?)(?:\s*,\s*(?:then\s+)?|\s+then\s+)(.+)$/i) ??
      split[1].match(/^(.+?)\s+((?:hold|fall back|withdraw|retreat|pull back|advance|charge|dig in|hide|(?:go|move|march|run) to)\b.*)$/i)
    if (!parts) return null
    const condition = readCondition(parts[1])
    if (!condition) return null
    when = { condition, words: parts[2] }
  }

  const pieces = main.split(STEP_SPLIT).map(clean).filter(Boolean)
  if (pieces.length === 0) return null
  // "..., then dig in": the step before it ends by holding.
  let lastHolds = false
  if (pieces.length > 1 && HOLD_PIECE.test(pieces.at(-1))) { pieces.pop(); lastHolds = true }

  const first = parseLine(pieces[0])
  if (first.kind !== 'order' || first.steps || first.when) return null
  const who = first.unitRef
  const steps = []
  for (const piece of pieces.slice(1)) {
    const step = readPiece(piece, who)
    if (!step || step.unitRef !== who) return null
    steps.push(step)
  }
  if (lastHolds) {
    const last = steps.at(-1) ?? first
    if (last.action === 'move') last.then = 'hold'
  }
  if (steps.length === 0 && !when) return null

  const out = { ...first, ...extra, deep: true }
  if (steps.length > 0) out.steps = steps
  if (when) {
    const then = readPiece(when.words, who)
    if (!then || then.unitRef !== who) return null
    out.when = { ...when.condition, do: then }
  }
  return out
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

    const go = text.match(GO_DIRECTION)
    if (go) return order(go[1], 'move', `${go[2] ?? 200} m ${go[3].toLowerCase()}`, null)

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
      'archers hide in the woods · scouts search the woods · spears ambush in the woods · ' +
      'archers shoot the horse · swords to C4, then on to the bridge · ' +
      'spears to the ford, if their horse is there, hold'
  }
}

function order(unitRef, action, place, then, extra = {}) {
  return { kind: 'order', unitRef: clean(unitRef) || 'everyone', action, place, then, ...extra }
}

// Ambush, hide, check and attack-a-place, or null for the older verbs.
const SPRING = /^(?:(.+?)\s+)?(?:spring (?:the )?(?:trap|ambush)|strike now)$/i
// "seek and destroy", "attack on sight": hunt the enemy, until told otherwise
// (ruled 2026-11-21: a unit attacks of its own accord only when ordered to).
const HUNT = /^(?:(.+?)\s+)?(?:(?:seek|search|find) and (?:destroy|attack|kill)|hunt(?: (?:them|the enemy|the enemies))?(?: down)?|(?:attack|engage|charge|strike|fight) (?:on sight|at will)|(?:free|cleared) to (?:attack|engage))\.?$/i

// Missile troops (ruled 2026-11-21). They shoot from where they stand
// without being told; these say what to shoot first, or not to shoot.
const HOLD_FIRE = /^(?:(.+?)\s+)?(?:hold (?:your |their |its )?fire|cease fire|cease shooting|stop shooting|do not shoot|don't shoot|save (?:your |their )?arrows)$/i
const SHOOT = /^(?:(.+?)\s+)?(?:shoot|loose|fire|open fire|let fly|rain arrows)(?:\s+at will)?(?:\s+(?:at|on|upon|into)\b)?(?:\s+(.+))?$/i
// What "shoot ..." names: a kind of enemy, or the last word of a name
// ("their spearmen" -> "spearmen"), or nothing in particular.
function shootFirst(words) {
  if (!words) return null
  for (const [kind, pattern] of KINDS) if (pattern.test(words)) return kind
  const bare = clean(words.replace(/\b(?:the|their|his|enemy|enemy's|enemies|those|that|them|it|anything|everything|anyone|at will|in range|first)\b/ig, ''))
  return bare ? bare.split(' ').at(-1).toLowerCase() : null
}

function readStage3(text, extra) {
  const holdFire = text.match(HOLD_FIRE)
  if (holdFire) return order(holdFire[1], 'hold', null, null, { ...extra, fire: 'hold', holdFire: true })
  const shoot = text.match(SHOOT)
  if (shoot) {
    const against = shootFirst(shoot[2])
    return order(shoot[1], 'hold', null, null, { ...extra, fire: 'shoot', ...(against ? { against } : {}) })
  }
  // With no one named, "spring the trap" is for the units lying in wait, not
  // the whole army: `spring` tells the resolver so.
  const spring = text.match(SPRING)
  if (spring) return order(spring[1], 'advance', null, null, { ...extra, spring: true })
  const hunt = text.match(HUNT)
  if (hunt) return order(hunt[1], 'advance', null, null, extra)
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
  m = text.match(GO_FOR)
  if (m && !NOT_A_PLACE.test(clean(m[3])) && !/\s(?:to|towards|toward)\s/i.test(text)) {
    const words = clean(m[3])
    const marked = /^(?:their|those|enemy|the enemy)\b/i.test(words) || /^go |^ride |^run /i.test(m[2])
    const bare = clean(words.replace(THE_ENEMY, ''))
    if (bare && (marked || KINDS.some(([, pattern]) => pattern.test(bare.replace(/\s+at\s+.+$/i, ''))))) {
      return order(m[1], 'attack', null, null, { ...extra, enemyRef: bare })
    }
  }
  m = text.match(ATTACK_PLACE)
  if (m && !NOT_A_PLACE.test(clean(m[2])) && !/\s(?:to|towards|toward)\s/i.test(text)) {
    return order(m[1], 'attack', clean(m[2]), null, extra)
  }
  return null
}

module.exports = { parseLine, KINDS }
