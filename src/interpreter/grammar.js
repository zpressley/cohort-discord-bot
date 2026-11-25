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
//   spears take the Old Mill Bridge         defend (also occupy, or hold
//   hold the bridge                         a place)
//   archers hold        / hold              hold (bare "hold" = everyone)
//   archers go north / horse move 200 m east   move, by compass from where
//                                              the unit stands
//   everyone advance    / advance           advance on the enemy
//   swords withdraw     / fall back to C7   withdraw (to a place, or home)
//   archers fall back 100 m west            withdraw a distance in a compass direction
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
const THEN_HOLD = /\s*(?:,|\band\b|\bthen\b)\s*(?:then\s+)?(?:hold(?: it| there| the position)?|dig in|stand|set up (?:a )?defensive positions?|defend it|make a stand|stay(?: there| put)?|wait(?: there)?)\s*\.?$/i

// Verb phrases, tried in this order. Each splits "units VERB place".
// The unit words are optional: "fall back to K8" or "stop at the clearing"
// with no one named means everyone.
const VERBS = [
  { action: 'defend', pattern: /^(?:(.+?)\s+)?(?:dig in at|dig in on|set up (?:a )?defensive positions? (?:at|on|in)|defend|hold at|hold on|make a stand at|take up (?:a )?positions? (?:at|on|in|by)|take (?:a )?positions? (?:at|on|in|by)|form up (?:at|on|in|by)|take|occupy|hold|wait in|wait at|wait on|wait by|stay in|stay at|stay on)\s+(.+)$/i },
  { action: 'withdraw', pattern: /^(?:(.+?)\s+)?(?:withdraw|fall back|retreat|pull back)(?:\s+(?:to|towards|toward)\s+(.+))?$/i },
  { action: 'move', pattern: /^(?:(.+?)\s+)?(?:stop at|halt at|march to|march on|move to|go to|head for|make for|approach|go towards|go toward|move towards|move toward|march towards|march toward|head towards|head toward|towards|toward|move up to|go up to|advance to|run to|walk to|ride to|hurry to|rush to|push on to|press on to|march up to|to)\s+(.+)$/i }
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

// "archers fall back 100 metres to the west", "swords pull back south": the
// same, falling back.
const FALL_DIRECTION = new RegExp(`^(?:(.+?)\\s+)?(?:withdraw|fall back|retreat|pull back)\\s+(?:(\\d{1,4})\\s*(?:m|metres?|meters?|paces|yards?)\\s+)?(?:to the\\s+|due\\s+)?${COMPASS_WORDS}$`, 'i')

// The Commander riding over to another of his units.
const RIDE = /^(?:i(?:'ll| will| shall)?|you|the commander|commander)\s+(?:ride|rides|go|goes|join|joins|move|moves|switch|switches)\s+(?:over\s+)?(?:with|to)\s+([^,;]+)$/i
// (Up to a comma: "ride with the velites, velites advance" is two orders.)
const RIDE_SHORT = /^(?:(?:the\s+)?commander\s+(?:to|with)|ride with|join)\s+([^,;]+)$/i

// "We yield", "it is over. We surrender": giving up, said whole. Only these:
// a line that also gives an order is not a surrender.
const SURRENDER = /^(?:(?:it is|it's|this is) over|enough|all is lost|we are beaten|we're beaten|we have lost|we lost|ok|fine)?[.!,;]?\s*(?:we|i)\s+(?:surrender|yield|give up|give in)(?:\s+now)?$/i

/**
 * @returns one of
 *   { kind: 'order', unitRef, action, place, then }   place may be null
 *   { kind: 'ride', unitRef }   the Commander rides with that unit
 *   { kind: 'surrender' } | { kind: 'done' } | { kind: 'empty' }
 *   { kind: 'ask', question }   the line could not be read
 */
function parseLine(line, options = {}) {
  // However it is written, a line is read in a bounded number of steps: a
  // line too long, or an order nested deeper than any officer could carry,
  // is a plain "I could not follow that", never a hang or a crash.
  const depth = options.depth ?? 0
  if (depth > MAX_DEPTH || clean(line).length > MAX_LINE) return { kind: 'ask', unread: clean(line).slice(0, 120), tangled: true }
  let text = tidy(clean(line).replace(/[.!?]+$/, ''), options)
  if (!text) return { kind: 'empty' }

  const lower = text.toLowerCase()
  if (lower === 'done' || lower === 'end' || lower === 'end turn') return { kind: 'done' }
  if (lower === 'surrender' || lower === 'yield' || SURRENDER.test(text)) return { kind: 'surrender' }
  // The Commander himself: "I ride with the horse", "commander to the
  // companions". He rides over to another of his units.
  const ride = text.match(RIDE) ?? text.match(RIDE_SHORT)
  if (ride) return { kind: 'ride', unitRef: clean(ride[1]).replace(/^the\s+/i, '') }

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
    const deep = readDeep(text, extra, depth)
    if (deep) return deep
    // A condition it could not take apart is not read as a plain order with
    // the condition swallowed into a place ("archers hold your ground. If
    // anyone attacks you, ..." is not a march): left for the AI, or asked.
    if (/\bif\b/i.test(text)) return { kind: 'ask', unread: clean(line), question: `I don't follow "${clean(line)}".` }
  }

  // A camp battle's camp: pitch it, move it, strike it, burn theirs.
  const camp = readCamp(text)
  if (camp) return { ...camp, ...extra }

  const stage3 = readStage3(text, extra)
  // (What he typed, for a question whose answers replace the whole line.)
  if (stage3 && (stage3.fire || stage3.said || stage3.skirmish)) stage3.said = clean(line)
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
// How deep a line may nest before it is too tangled to read (a piece of a
// deep order is read as a line of its own, one level down), and how long a
// line may be. No order a player gives comes near either.
const MAX_DEPTH = 4
const MAX_LINE = 600
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
function readPiece(piece, who, depth = 0) {
  let text = clean(piece).replace(/^(?:then\s+)?(?:they\s+|he\s+|you\s+)?(?:should\s+|must\s+|can\s+)?/i, '')
  if (!text) return null
  // "..., then D6", "then the bridge": a bare place is a march there.
  if (/^[a-z]{1,2}\d{1,2}(?:-[ns][ew])?$/i.test(text) || (/^the\s+\S/i.test(text) && !VERB_START.test(text.replace(/^the\s+/i, '')))) text = `to ${text}`
  // "..., then east", "then 200 m north": a march that way.
  else if (new RegExp(`^(?:${DISTANCE}\\s+)?(?:to the\\s+)?${FULL_WAY}(?:\\s+${DISTANCE})?$`, 'i').test(text)) text = `go ${text}`
  // Read with the unit's name put back in front. A piece that names some
  // other unit is not a step of this order, and comes out with the wrong
  // name, which the caller refuses.
  const forThem = parseLine(who === 'everyone' ? text : `${who} ${text}`, { depth: depth + 1 })
  return forThem.kind === 'order' && !forThem.steps && !forThem.when ? forThem : null
}

// "the horse" and "horse" are one unit's name.
const sameUnit = (a, b) => clean(a).replace(/^(?:the|our|my)\s+/i, '').toLowerCase() === clean(b).replace(/^(?:the|our|my)\s+/i, '').toLowerCase()

function readDeep(text, extra, depth = 0) {
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
  // No step and no condition after all ("spears hold if", "then" alone):
  // nothing deep to read, and reading the first piece would be reading the
  // whole line again.
  if (!when && pieces.length < 2 && !lastHolds) return null

  const first = parseLine(pieces[0], { depth: depth + 1 })
  if (first.kind !== 'order' || first.steps || first.when) return null
  const who = first.unitRef
  const steps = []
  for (const piece of pieces.slice(1)) {
    const step = readPiece(piece, who, depth)
    if (!step || !sameUnit(step.unitRef, who)) return null
    steps.push(step)
  }
  if (lastHolds) {
    const last = steps.at(-1) ?? first
    if (last.action === 'move') last.then = 'hold'
  }
  // "legionaries march north 200 m, then hold": a march that ends by holding.
  if (steps.length === 0 && !when && lastHolds && first.action === 'move' && /^\d+ m /.test(first.place ?? '')) return { ...first, action: 'defend', then: 'hold', ...extra }
  if (steps.length === 0 && !when) return null

  const out = { ...first, ...extra, deep: true }
  if (steps.length > 0) out.steps = steps
  if (when) {
    const then = readPiece(when.words, who, depth)
    if (!then || !sameUnit(then.unitRef, who)) return null
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
    const plainHold = text.match(HOLD_TOO)
    if (plainHold) return order(plainHold[1], 'hold', null, null)

    const hold = text.match(HOLD)
    if (hold) return order(hold[1], 'hold', null, null)

    const compass = readCompass(text)
    if (compass) return compass

    const go = text.match(GO_DIRECTION)
    if (go) return order(go[1], 'move', `${go[2] ?? 200} m ${go[3].toLowerCase()}`, null)

    const fall = text.match(FALL_DIRECTION)
    if (fall) return order(fall[1], 'withdraw', `${fall[2] ?? 200} m ${fall[3].toLowerCase()}`, null)

    const advance = text.match(ADVANCE)
    if (advance && !/\s(?:to|towards|toward)\s/i.test(text)) return order(advance[1], 'advance', null, null)
  }

  // (Guard, secure, protect: hold a place. Tried before the older verbs, and
  // only where the words after it are no order of their own, so that
  // "praetorian guard to D7" is a march by the Praetorian guard.)
  const guard = text.match(GUARD)
  if (guard && !NOT_A_PLACE.test(clean(guard[2]))) return order(guard[1], 'defend', clean(guard[2]).replace(THEN_HOLD, ''), null)

  for (const { action, pattern } of VERBS) {
    const match = text.match(pattern)
    if (!match) continue
    const place = match[2] ? clean(match[2]) : null
    if (action === 'move' && then === 'hold') return order(match[1], 'defend', place, 'hold')
    return order(match[1], action, place, action === 'move' ? then : null)
  }

  // Not read. The question here is the plain one; the resolver, which knows
  // his units and the field, says which part it did not follow and offers
  // the nearest orders it does read (`unread`; words.js, NOT_READ).
  return {
    kind: 'ask',
    unread: clean(line),
    question: `I don't follow "${clean(line)}". Orders read like: spears to the ridge to the east · ` +
      'archers defend the ford · everyone advance · swords fall back · hold · ' +
      'archers hide in the woods · scouts search the woods · spears ambush in the woods · ' +
      'archers shoot the horse · swords to C4, then on to the bridge · ' +
      'spears to the ford, if their horse is there, hold'
  }
}

function order(unitRef, action, place, then, extra = {}) {
  // (A verb left before the order's own, "go around the left", names no one.)
  const who = /^(?:go|move|march|head|ride|walk|run|get|swing|wheel|sweep|circle|come|and|then)$/i.test(clean(unitRef)) ? '' : clean(unitRef)
  return { kind: 'order', unitRef: who || 'everyone', action, place, then, ...extra }
}

// ── The camp (a camp battle's) ─────────────────────────
//
//   velites pitch the camp at the Long Down     pitch (there)
//   pitch the camp here / make camp             pitch (where its carrier stands)
//   move the camp to C5 / carry the camp to C5  pitch there (taken up first)
//   strike the camp / pack up the camp          strike: take it up and carry it
//   horse burn their camp / take the enemy camp attack the enemy's camp
//   guard the camp / fall back to the camp      defend, withdraw: the camp is a
//                                               place (resolve.js)
// With no one named, who works the camp is the resolver's choice (the unit
// carrying it, else the nearest): `camp: true` on the intent.
const OUR_CAMP = '(?:(?:the|our|your|my)\\s+)?camp'
const THEIR_CAMP = "(?:the\\s+enemy'?s?|their|the\\s+enemy|enemy)\\s+camp"
const PITCH = new RegExp(`^(?:(.+?)\\s+)?(?:pitch|make|set up|put up|raise)\\s+${OUR_CAMP}(?:\\s+(?:at|on|in|by|near|beside)\\s+(.+?))?(?:\\s+(?:here|there|where (?:you|they) (?:are|stand)))?$`, 'i')
const MOVE_CAMP = new RegExp(`^(?:(.+?)\\s+)?(?:move|carry|take|shift|bring|march)\\s+${OUR_CAMP}\\s+(?:to|towards|toward|over to|up to|back to)\\s+(.+)$`, 'i')
const STRIKE = new RegExp(`^(?:(.+?)\\s+)?(?:strike|pack up|pack|take up|break|lift|pick up)\\s+${OUR_CAMP}(?:\\s+up)?$`, 'i')
const RAID = new RegExp(`^(?:(.+?)\\s+)?(?:burn|fire|torch|sack|raid|loot|take|capture|seize|storm|attack|assault|go for|destroy|hit)\\s+${THEIR_CAMP}$`, 'i')

function readCamp(text) {
  let m = text.match(RAID)
  if (m) return order(m[1], 'attack', 'their camp', null)
  m = text.match(MOVE_CAMP)
  if (m) return { ...order(m[1], 'pitch', clean(m[2]), null), camp: true }
  m = text.match(PITCH)
  if (m) return { ...order(m[1], 'pitch', m[2] ? clean(m[2]) : null, null), camp: true }
  m = text.match(STRIKE)
  if (m) return { ...order(m[1], 'strike', null, null), camp: true }
  return null
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
  const widened = readWidened(text, extra)
  if (widened) return widened
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

// ── The grammar widened (docs/REVIEW-2026-11.md, D4) ───
//
// Plain orders a new player types on a phone that the verbs above missed:
//
//   tell the legionaries to hold / i want the hastati to advance   filler
//   ok legionaries advance now / legionaries, advance              filler
//   legionnaires hold / evryone advance / legionaries atack        typos
//   legionaries go north 300m / move east / fall back 200 m        compass
//   legionaries go 2 squares north / velites go ne
//   guard the bridge / secure the ford / hastati protect C5        hold a place
//   legionaries stand your ground / dig in / stay where you are    hold
//   everyone forward / move up / go get them                       advance
//   back up 100 m / run away                                       fall back
//   horse archers skirmish / harass the enemy / fire and fall back fire and
//                                                                  retreat
//   velites throw javelins                                         throw
//   velites follow the legionaries / keep behind the pikes         keep by
//   velites stay with / support / escort / guard the legionaries   a unit
//   go around their left / flank them / hit them in the flank      a question
//
// "everyone else", "the rest", "the others", "everyone except the velites",
// "the first line", "the foot", "the pikes" are unit words, left to the
// resolver, which knows the army.

// Words that start an order: a piece of a line that begins with one of these
// is an order of its own, not a unit's name or a place.
const VERB_WORDS = [
  'advance', 'attack', 'charge', 'engage', 'hold', 'halt', 'stop', 'stay', 'wait', 'stand', 'withdraw', 'retreat',
  'fall', 'pull', 'back', 'march', 'move', 'go', 'head', 'to', 'defend', 'guard', 'secure', 'protect', 'occupy',
  'take', 'seize', 'capture', 'storm', 'assault', 'hide', 'ambush', 'search', 'check', 'scout', 'shoot', 'loose',
  'fire', 'throw', 'follow', 'support', 'cover', 'dig', 'press', 'push', 'run', 'skirmish', 'harass', 'flank',
  'hunt', 'seek', 'lie', 'take', 'set', 'approach', 'make', 'ride', 'walk', 'forward', 'spring', 'strike', 'hit'
]
const VERB_START = new RegExp(`^(?:${VERB_WORDS.join('|')})\\b`, 'i')

// The words a typo is put right to: the grammar's own, the compass, the
// ground and the kinds of troops. Only a word of four letters or more that
// is not one of these, nor a word of a unit's or a place's name, is put
// right, and only when one word alone is near it: one letter off (a
// letter wrong, missing, extra, or two swapped), two in a word of eight or
// more.
const VOCABULARY = [
  ...VERB_WORDS, 'everyone', 'everybody', 'others', 'rest', 'except', 'forward', 'position', 'ground', 'carefully',
  'cautiously', 'slowly', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
  'woods', 'wood', 'forest', 'trees', 'bridge', 'ford', 'hill', 'ridge', 'river', 'road', 'clearing', 'crossing',
  'marsh', 'village', 'pass', 'flank', 'left', 'right', 'javelins', 'arrows', 'enemy', 'their', 'them', 'there',
  'here', 'metres', 'meters', 'squares', 'yards', 'paces', 'infantry', 'cavalry', 'archers', 'horse', 'foot',
  'riders', 'second', 'first', 'line', 'line', 'then', 'with', 'into', 'behind', 'objective', 'fight', 'trap',
  'line', 'front', 'have', 'tell', 'order', 'send', 'want', 'please', 'that', 'this', 'they', 'when', 'after',
  'anything', 'everything', 'nearest', 'closest', 'until', 'where', 'were', 'what', 'your', 'units', 'unit',
  'all', 'army', 'pila', 'darts', 'spears', 'swords', 'cover', 'ambush', 'loose', 'fire', 'shoot', 'over',
  'down', 'along', 'across', 'around', 'round', 'through', 'toward', 'towards', 'from', 'pass', 'passes', 'first',
  'reach', 'break', 'breaks', 'attacked', 'see', 'sees', 'spot', 'more', 'some', 'about', 'only', 'just',
  // Common words that are no order word, kept from being "put right" into one.
  'kill', 'destroy', 'wipe', 'sure', 'keep', 'near', 'side', 'edge', 'base', 'away', 'home', 'camp', 'enemies',
  'troops', 'while', 'unless', 'before', 'once', 'will', 'shall', 'would', 'could', 'should', 'must', 'also',
  'both', 'each', 'every', 'other', 'else', 'again', 'still', 'well', 'good', 'safe', 'find', 'look', 'come',
  'bring', 'slow', 'fast', 'quick', 'hard', 'high', 'lines', 'mill', 'gate', 'rush', 'form', 'tight', 'steady',
  'still', 'orders', 'nothing', 'like', 'would', 'okay', 'alright', 'quickly', 'immediately', 'right', 'away',
  'flee', 'lure', 'bait', 'feint', 'wheel', 'turn', 'swing', 'sweep', 'circle', 'around', 'round', 'rear',
  'wing', 'close', 'closer', 'within', 'range', 'shot', 'volley', 'arrow', 'bows', 'slings', 'sling', 'stones',
  'javelin', 'pilum', 'throwing', 'axes', 'rocks', 'gap', 'saddle', 'town', 'hamlet', 'farm', 'field', 'fields',
  'stream', 'brook', 'bank', 'shore', 'water', 'track', 'path', 'lane', 'glade', 'copse', 'knoll', 'mound',
  'heights', 'crest', 'rise', 'slope', 'summit', 'top', 'middle', 'centre', 'center', 'past', 'beyond', 'inside',
  'square', 'grid', 'metre', 'meter', 'yard', 'pace',
  // Troops, theirs and his: never "put right" into another word.
  'slingers', 'spearmen', 'swordsmen', 'bowmen', 'crossbows', 'crossbowmen', 'pikemen', 'horsemen', 'hoplites',
  'legionaries', 'javelinmen', 'skirmishers', 'peltasts', 'cataphracts', 'chariots', 'elephants', 'warriors',
  'levy', 'militia', 'archer', 'spearman', 'swords', 'spear', 'sword', 'pikes', 'lancers', 'scouts', 'guard',
  'guards', 'infantrymen', 'footmen', 'companions', 'velites', 'hastati', 'triarii', 'principes', 'thureophoroi'
]
VOCABULARY.push('ahead', 'backward', 'backwards', 'onward', 'onwards', 'alone', 'together', 'instead', 'already',
  'enough', 'long', 'short', 'soon', 'later', 'first', 'last', 'next', 'away', 'again', 'outside', 'beside',
  'between', 'among', 'under', 'above', 'below', 'against', 'upon', 'onto', 'quick', 'hurry', 'rush', 'slowly')
const KNOWN = new Set(VOCABULARY)
// What a typo is put right to: the words an order turns on.
const TARGETS = [...VERB_WORDS, 'everyone', 'everybody', 'north', 'south', 'east', 'west', 'woods', 'forest', 'bridge',
  'ford', 'hill', 'ridge', 'river', 'clearing', 'crossing', 'marsh', 'carefully', 'javelins', 'others', 'except',
  'forward', 'flank', 'position', 'ground', 'cavalry', 'infantry', 'archers', 'legionaries', 'velites', 'hastati']

// Letters apart: a letter changed, missing or extra, or two side by side
// swapped (optimal string alignment), stopping once past `most`.
function lettersApart(a, b, most = 2) {
  if (Math.abs(a.length - b.length) > most) return most + 1
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

// How many letters off a word of this length may be and still be put right.
const slack = (word) => (word.length >= 10 ? 2 : word.length >= 4 ? 1 : 0)

// The one word of `words` this word is a typo of, or null.
function nearestWord(word, words) {
  const most = slack(word)
  if (most === 0) return null
  let found = null
  for (const w of words) {
    if (Math.abs(w.length - word.length) > most) continue
    if (lettersApart(word, w, most) <= most) {
      if (found && found !== w) return null
      found = w
    }
  }
  return found
}

function fixTypos(text, protect) {
  return text.split(' ').map(raw => {
    const word = raw.toLowerCase()
    if (word.length < 4 || /[^a-z]/.test(word) || KNOWN.has(word) || protect.has(word)) return raw
    // A typo of a unit's or a place's name is the resolver's to put right,
    // which knows them: only grammar words here, and not one that is near a
    // name as well.
    const name = nearestWord(word, protect)
    if (name && !KNOWN.has(name)) return raw
    // Near a word of the vocabulary that is no order word ("ahead", not
    // "head"): left as it is.
    const near = nearestWord(word, VOCABULARY)
    return near && TARGETS.includes(near) ? near : raw
  }).join(' ')
}

// Distances, in the words people use. A square of the player's grid is
// 100 m (engine/map/grid.js).
const COUNT = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const SQUARE_METRES = 100

/**
 * The line as an order is read: filler words gone, typos put right, the
 * forms people use for the same thing made one. `options.names`: the
 * words of his units' and the field's names, which are never "put right".
 */
function tidy(text, options = {}) {
  const protect = new Set((options.names ?? []).flatMap(n => String(n).toLowerCase().split(/[^a-z0-9']+/)).filter(Boolean))
  let out = clean(text)
    .replace(/[’‘]/g, "'")
    .replace(/\s+[-–—]+\s+|\s*[:–—]\s*/g, ' ')
    .replace(/!+/g, '')
  out = clean(fixTypos(out, protect))
  out = out
    .replace(/\bevery\s+(one|body)\b/ig, 'every$1')
    .replace(/^(?:(?:ok(?:ay)?|alright|all right|right then|so|and|now|please|go on)\b,?\s+)+/i, '')
    .replace(/\s+please\b|\bplease,?\s+/ig, ' ')
    .replace(/,?\s+(?:now|at once|immediately|right away|right now|asap|quickly)$/i, '')
  // "i want the legionaries to advance", "tell the hastati to hold", "get the
  // velites to the woods", "send the legionaries to C5": the order itself.
  const asked = out.match(/^(?:i\s+want|i'd\s+like|i\s+would\s+like|tell|order|command|instruct|get|send)\s+(.+?)\s+to\s+(.+)$/i)
  if (asked && !/\b(?:to|towards?)\b/i.test(asked[1])) out = VERB_START.test(asked[2]) && !/^to\b/i.test(asked[2]) ? `${asked[1]} ${asked[2]}` : `${asked[1]} to ${asked[2]}`
  const have = out.match(/^(?:have|make|let|get)\s+(?!(?:a|an|one|two|three|the first)\s+(?:\w+\s+)?pass\b)(.+?)\s+((?:advance|attack|charge|hold|stand|stay|fall back|withdraw|retreat|march|move|go|hide|shoot|loose|fire|defend|guard|take|search)\b.*)$/i)
  if (have) out = `${have[1]} ${have[2]}`
  out = out
    .replace(/^send\s+(?:in\s+)?(.+?)\s+(?:in|forward)$/i, '$1 advance')
    .replace(/^send in\s+(.+)$/i, '$1 advance')
    .replace(/^(?:let'?s\s+)?go\s+(?=get\s+(?:them|em)$)/i, '')
    // "velites go hide in the woods", "hastati go and search C5": the verb.
    .replace(/\b(?:go|come|run)\s+(?:and\s+)?(?=(?:hide|search|check|scout|take|attack|defend|guard|ambush|secure|occupy|seize|charge|storm|capture|lie in wait|dig in)\b)/i, '')
    // "hold until attacked, then fall back": a condition.
    .replace(/^(.+?)\s+until\s+(.+?)(?:\s*,\s*|\s+)then\s+(.+)$/i, '$1, if $2, $3')
    // "the legionaries, advance": a unit's name set off by a comma.
    .replace(/^([^,]{2,40}),\s+(?=(?:advance|attack|charge|hold|stand|stay|fall back|withdraw|retreat|march|move|go|hide|shoot|defend|guard|take|search|engage|halt|stop|wait)\b)/i, '$1 ')
    // "square C5", "grid C5": the square.
    .replace(/\b(?:grid\s+square|square|grid)\s+([a-z]{1,2}\d{1,2}(?:-[ns][ew])?)\b/ig, '$1')
    .replace(/\b([a-z]{1,2}\d{1,2}(?:-[ns][ew])?)\s+square\b/ig, '$1')
    // "pull the legionaries back", "bring the horse back": they fall back.
    // (Said of a unit already named, "legionaries pull the legionaries
    // back", as a piece of a deep order is read: the name once.)
    .replace(/^(?:(.+?)\s+)?(?:pull|bring|draw|get|move)\s+(?:the\s+|our\s+|my\s+)?(.+?)\s+back$/i, (all, who, them) =>
      !who || who.replace(/^(?:the|our|my)\s+/i, '').toLowerCase() === them.toLowerCase() ? `${them} pull back` : all)
    // "get back to the bridge", "go back to C5": fall back there.
    .replace(/\b(?:get|go|run|head|come|move|ride) back (?=to\b|towards?\b)/i, 'fall back ')
    // "hide the archers in the woods", "keep the horse back": the unit
    // first, as every other order has it.
    .replace(/^hide\s+(?!(?:in|into|inside|among|behind|at|on|by|near|from|there|here|yourselves|themselves)\b)((?:the\s+|our\s+|my\s+)?\S+(?:\s+\S+)?)\s+((?:in|into|inside|among|behind)\s+.+)$/i, '$1 hide $2')
    .replace(/^keep\s+(?!(?:back|going|at it|behind|with|up|close|by|beside|next|to|in)\b)((?:the\s+|our\s+|my\s+)?\S+(?:\s+\S+)?)\s+back$/i, '$1 stay back')
    // A word left hanging at the end, "hold then", "advance and": dropped.
    .replace(/(?:\s*,)?\s+(?:and|then|if|but|unless|so)$/i, '')
    // "2 squares north": 200 m.
    .replace(/\b(\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+squares?\b/ig, (_, n) => `${(COUNT[n.toLowerCase()] ?? Number(n)) * SQUARE_METRES} m`)
  return clean(out)
}

// Holding, in more of the ways people say it.
const HOLD_TOO = /^(?:(.+?)\s+)?(?:(?:defend|hold|guard) (?:here|this position|this spot|where (?:you|they|it) (?:are|is|stand))|stand (?:your|their|its) ground|stay where (?:you|they|it) (?:are|is|stand)|stay in place|stay in position|stay back|hang back|hold back|keep back|stand firm|stay still|keep (?:your|their) position|dig in|form up(?: and hold| and wait)?|hold (?:on|tight|steady)|stand still|wait for orders|do nothing)$/i

// Guard, secure, protect a place: go there and hold it. Not when the words
// after it are an order of their own ("praetorian guard to D7").
const GUARD = new RegExp(`^(?:(.+?)\\s+)?(?:guard|secure|protect|hold onto|keep hold of|cover|garrison)\\s+(?!(?:${VERB_WORDS.join('|')}|them|the enemy|their|him|her|it|us)\\b)(.+)$`, 'i')

// By the compass, with or without a distance either side of the direction:
// "go north 300m", "move 300 m north", "go 2 squares north" (200 m), "go
// ne", "legionaries 200m north", "advance 200 m east" (a march that way).
// Falling back with a distance and no direction is falling back toward his
// own edge ("fall back 200 m": `200 m back`).
const DISTANCE = '(\\d{1,4})\\s*(?:m|metres?|meters?|paces|yards?)'
const FULL_WAY = '(north[- ]?east|north[- ]?west|south[- ]?east|south[- ]?west|north|south|east|west)'
const SHORT_WAY = '(ne|nw|se|sw|n|s|e|w)'
const GO_WORDS = '(go|move|march|head|shift|step|ride|walk|advance|push|press on|go up|move up|withdraw|fall back|retreat|pull back|back up|back off|run)'
const COMPASS_ORDER = new RegExp(`^(?:(.+?)\\s+)?${GO_WORDS}(?:\\s+(?:up|out|off|on))?\\s+(?:${DISTANCE}\\s+)?(?:(?:to\\s+the|due|to|towards?\\s+the|toward)\\s+)?(?:${FULL_WAY}|${SHORT_WAY})(?:\\s+(?:for\\s+|about\\s+|some\\s+)?${DISTANCE})?$`, 'i')
const COMPASS_BARE = new RegExp(`^(.+?)\\s+${DISTANCE}\\s+(?:to the\\s+|due\\s+)?${FULL_WAY}$`, 'i')
const BACK_A_WAY = new RegExp(`^(?:(.+?)\\s+)?(?:withdraw|fall back|retreat|pull back|back up|back off|go back|move back)\\s+(?:about\\s+|some\\s+)?${DISTANCE}(?:\\s+back)?$`, 'i')
const WITHDRAWING = /^(?:withdraw|fall back|retreat|pull back|back up|back off|run)$/i
const SHORT = { n: 'north', s: 'south', e: 'east', w: 'west', ne: 'north-east', nw: 'north-west', se: 'south-east', sw: 'south-west' }

function readCompass(text) {
  let m = text.match(COMPASS_ORDER)
  if (m) {
    const [, who, verb, before, full, short, after] = m
    const way = full ? full.toLowerCase().replace(/\s+/, '-') : SHORT[short.toLowerCase()]
    const metres = before ?? after ?? 200
    return order(who, WITHDRAWING.test(verb) ? 'withdraw' : 'move', `${metres} m ${way}`, null)
  }
  m = text.match(COMPASS_BARE)
  if (m && !/\b(?:to|towards?|at|in|on)$/i.test(m[1])) return order(m[1], 'move', `${m[2]} m ${m[3].toLowerCase().replace(/\s+/, '-')}`, null)
  m = text.match(BACK_A_WAY)
  if (m) return order(m[1], 'withdraw', `${m[2]} m back`, null)
  return null
}

// Fire and retreat (engine/battle/skirmish.js): what the engine does with
// missile troops pressing the enemy. "Skirmish", "harass", "fire and fall
// back" are that; with an enemy named, it is the one to shoot first.
const SKIRMISH = /^(?:(.+?)\s+)?(?:skirmish(?:\s+with)?|harass|harry|pepper|hit and run|(?:shoot|fire|loose) and (?:fall back|retreat|withdraw|pull back|run|move back|back off))(?:\s+(.+))?$/i
// Throwing javelins, pila, darts: missile troops shoot; others throw them as
// they come to blows, which the resolver says.
const THROW = /^(?:(.+?)\s+)?(?:throw|hurl|cast|chuck|launch)(?:\s+(?:your|their|its|the|them|some))?(?:\s+(?:javelins?|pila|pilum|darts|plumbatae|axes|throwing axes|spears|weapons|missiles))?(?:\s+(?:at|on|into)\s+(.+))?$/i
// Keeping by another of his units as it moves (engine/battle/orders.js,
// follow): behind it and out of its fight ("follow", "keep behind"), or
// beside it, going at any enemy who fights it ("stay with", "support",
// "escort"; "guard" and "cover" a unit of his are read by the resolver).
const FOLLOW_BEHIND = /^(?:(.+?)\s+)?(?:follow behind|follow on behind|follow|keep behind|stay behind|keep in behind|stay in behind|keep to the rear of|stay to the rear of|trail behind|trail|shadow)\s+(?!\d)(.+)$/i
const FOLLOW = /^(?:(.+?)\s+)?(?:stay with|keep with|keep up with|keep close to|stay close to|stick with|stick close to|go with|march with|move with|ride with|support|escort|accompany|stay beside|keep beside|stay next to|keep next to|stay alongside|keep alongside|keep by|stay by)\s+(?!\d)(.+)$/i
// Going round a flank: which way round is not his officers' to guess.
const FLANK = [
  /^(?:(.+?)\s+)?(?:go|move|march|swing|wheel|get|sweep|circle|come|ride|head)?\s*(?:a?round|round to|to)\s+(?:the|their|his|its|our|your|the enemy's)\s+(?:left|right)(?:\s+(?:flank|wing|side))?(?:\s+.*)?$/i,
  /^(?:(.+?)\s+)?(?:outflank|flank|envelop|turn)\s+(?:them|the enemy|their\b.*|him|it)(?:\s+.*)?$/i,
  /^(?:(.+?)\s+)?(?:go|move|march|swing|ride|get|sweep|circle)\s+(?:a?round)\s+(?:them|the enemy|their\b.*)$/i,
  /^(?:(.+?)\s+)?(?:hit|attack|strike|take|charge|fall on|go for)\s+(?:them|the enemy|their\b.*?|him)\s+(?:in|on|from)\s+the\s+(?:left\s+|right\s+)?(?:flank|rear|side|back)\b.*$/i,
  /^(?:(.+?)\s+)?(?:go|move|march|head|ride|get)?\s*(?:to|on)\s+(?:the|their|our)\s+(?:left|right)\s+(?:flank|wing)$/i,
  /^(?:(.+?)\s+)?(?:flank|flanks|outflank)$/i
]
// What "advance" also is.
const ADVANCE_TOO = /^(?:(.+?)\s+)?(?:forward|move forward|go forward|march forward|(?:march|move|go|advance) (?:on|at|against|toward|towards) (?:the enemy|them|the foe)|move up|push forward|push on|go in|go get (?:them|em)|get (?:them|em)|at them|go at them|kill them(?: all)?|destroy them|close with the enemy|close in)$/i
const RUN_AWAY = /^(?:(.+?)\s+)?(?:run away|run|flee|get out of there|get back|disengage|back off|back up|go back|move back)$/i

function readWidened(text, extra) {
  let m = text.match(SKIRMISH)
  if (m) {
    const against = m[2] && !/^(?:the enemy|them|enemy|anything|everyone)$/i.test(clean(m[2])) ? shootFirst(m[2]) : null
    return order(m[1], 'advance', null, null, { ...extra, skirmish: true, ...(against ? { against } : {}) })
  }
  m = text.match(THROW)
  if (m && /\b(?:throw|hurl|cast|chuck|launch)\b/i.test(text)) {
    const against = shootFirst(m[2])
    return order(m[1], 'hold', null, null, { ...extra, fire: 'shoot', throws: true, ...(against ? { against } : {}) })
  }
  for (const pattern of FLANK) {
    m = text.match(pattern)
    if (m) return order(m[1], 'flank', null, null, { ...extra, said: clean(text) })
  }
  m = text.match(FOLLOW_BEHIND)
  if (m) return order(m[1], 'follow', null, null, { ...extra, friendRef: clean(m[2]).replace(/^(?:the|our|my)\s+/i, ''), keep: 'behind', said: clean(text) })
  m = text.match(FOLLOW)
  if (m) return order(m[1], 'follow', null, null, { ...extra, friendRef: clean(m[2]).replace(/^(?:the|our|my)\s+/i, ''), keep: 'beside', guard: true, said: clean(text) })
  m = text.match(ADVANCE_TOO)
  if (m) return order(m[1], 'advance', null, null, extra)
  // "velites scout ahead": go forward carefully, on their guard.
  m = text.match(/^(?:(.+?)\s+)?(?:scout|probe|feel|reconnoitre|recon)\s+(?:ahead|forward|the way|out ahead|on ahead)$/i)
  if (m) return order(m[1], 'advance', null, null, { ...extra, careful: true })
  // "keep going", "carry on": the order they have stands; nothing to send.
  m = text.match(/^(?:(.+?)\s+)?(?:keep going|carry on|continue|as you were|keep at it|same as before|same orders?)$/i)
  if (m) return order(m[1], 'carryOn', null, null, { ...extra, said: clean(text) })
  // "velites fall back behind the legionaries": by one of his own units, as
  // the resolver places it.
  m = text.match(/^(?:(.+?)\s+)?(withdraw|fall back|retreat|pull back|go|move|march|get)\s+((?:behind|in behind|beside|next to|alongside)\s+.+)$/i)
  if (m) return order(m[1], /^(?:withdraw|fall back|retreat|pull back)$/i.test(m[2]) ? 'withdraw' : 'move', clean(m[3]), null, extra)
  // "legionaries go to the woods and hide": hide (search, lie in wait) there.
  m = text.match(/^(?:(.+?)\s+)?(?:go|move|march|run|head|get)?\s*(?:to|into|in)\s+(.+?)\s*(?:,\s*|\s+)(?:and\s+)?(?:then\s+)?(hide|search it|search|check it|check|lie in wait|ambush|take cover)$/i)
  if (m && !/\b(?:to|into)\b/i.test(m[1] ?? '')) {
    const action = /^hide|^take cover/i.test(m[3]) ? 'hide' : /^search|^check/i.test(m[3]) ? 'check' : 'ambush'
    return order(m[1], action, clean(m[2]), null, extra)
  }
  m = text.match(RUN_AWAY)
  if (m) return order(m[1], 'withdraw', null, null, extra)
  // "go to C5", "move to the woods": the verb with no one named.
  if (/^(?:go|move|march|head|walk|ride)\s+(?:to|towards?|toward)\s+\S/i.test(text)) {
    const rest = text.replace(/^(?:go|move|march|head|walk|ride)\s+/i, '')
    const read = readOlder(rest, rest)
    if (read.kind === 'order') return { ...read, ...extra }
  }
  return null
}

module.exports = { parseLine, KINDS, tidy, VERB_START, lettersApart, nearestWord }
