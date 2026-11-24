// src/interpreter/orders.js
//
// From what a commander typed to engine orders.
//
//   interpretLines(lines, context)            fixed grammar only, synchronous
//   interpretText(text, context, { ai })      grammar first, the AI for what
//                                             the grammar cannot read
//
// Both return { orders, questions, choices, surrender, understood, source }.
// When there are questions, nothing should be submitted: the player answers
// and tries again.
//
// Grammar first, because it is free, instant and always gives the same
// answer: a plain order ("archers to D7-NE", "everyone advance") never costs
// an AI call. A line goes to the AI only when the grammar cannot read it, or
// when it says more than one simple thing. If the AI is missing or fails,
// the grammar's own answer stands (usually a question).
//
// Context is one side's own view: { map, units, enemies }.

const { parseLine, tidy } = require('./grammar')
const { resolveIntents, resolveUnitsWide } = require('./resolve')
const { detectFeatures } = require('../engine/map/features')
const { readWithAi } = require('./aiReader')

// A line that begins "if ..." or "then ..." goes on from the line before
// it: "spears to the ford; if their horse is there, hold" is one order,
// however it was broken up.
function joinContinued(lines) {
  const out = []
  for (const line of lines) {
    if (out.length > 0 && /^(?:but\s+|and\s+)?(?:if|then|after that|afterwards)\b/i.test(line.trim())) out[out.length - 1] += `, ${line.trim()}`
    else out.push(line)
  }
  return out
}

function grammarIntents(lines, context = null) {
  const intents = []
  const options = context ? readOptions(context) : {}
  const pieces = context ? joinContinued(lines).flatMap(line => splitLine(line, context, options)) : joinContinued(lines)
  for (const line of pieces) {
    const parsed = parseLine(line, options)
    if (parsed.kind === 'done') break
    if (parsed.kind !== 'empty') intents.push(parsed)
  }
  return intents
}

function interpretLines(lines, context) {
  return { ...resolveIntents(grammarIntents(lines, context), context), source: 'grammar' }
}

// ── Several orders on one line (docs/REVIEW-2026-11.md, D4) ─────
//
// "legionaries advance, everyone else hold", "legionaries to C5, hastati to
// D6", "legionaries hold velites advance": a line is cut into orders where a
// piece that begins with one of his units (or "everyone else", "the rest")
// reads as an order of its own, and only when every piece does. A line the
// grammar reads whole as one order, its units known, is left whole; a chain
// or a condition is never cut.

// The words of his units' and the field's names: kept from being "put right"
// as typos of the grammar's own words.
function readOptions(context) {
  const units = context.allOwn ?? context.units ?? []
  const names = units.flatMap(u => [u.id.replace(/^(?:red|blue)_/, '').replace(/_/g, ' '), ...(u.aliases ?? [])])
  const places = context.map ? detectFeatures(context.map).filter(f => f.name).map(f => f.name) : []
  return { names: [...names, ...places, ...(context.ground ?? []).map(g => g.name)] }
}

const WHO_START = /^(?:every(?:one|body)(?:\s+else)?|all(?:\s+units|\s+others|\s+the\s+rest|\s+but\b.*|\s+except\b.*)?|(?:the\s+)?(?:rest|others)|the\s+army)\b/i

// Does this piece begin with one of his units, or the rest of them?
function startsWithUnit(piece, units) {
  if (WHO_START.test(piece)) return true
  const words = piece.split(/\s+/)
  for (let k = Math.min(4, words.length - 1); k >= 1; k--) {
    if (resolveUnitsWide(words.slice(0, k).join(' '), units).units.length > 0) return true
  }
  return false
}

// Is this piece one whole order, its units known?
function wholeOrder(piece, context, options) {
  const parsed = parseLine(piece, options)
  if (parsed.kind !== 'order') return false
  if (parsed.deep) return true
  if (!grammarReadsWhole(piece, parsed)) return false
  const ref = parsed.unitRef
  if (WHO_START.test(ref) && ref !== 'everyone') return true
  if (ref !== 'everyone' && resolveUnitsWide(ref, context.units ?? []).units.length === 0) return false
  // ... and placed on the field, or a fair "which do you mean?".
  const read = resolveIntents([parsed], context)
  return read.questions.length === 0 || read.choices.length > 0
}

function splitLine(line, context, options) {
  const text = String(line).trim()
  if (!text || wholeOrder(text, context, options)) return [text]
  const units = context.units ?? []
  // Cut at a comma, "and", a full stop, or between two words, wherever the
  // rest begins with a unit; the first cut that leaves every piece an order.
  const cuts = []
  const re = /\s*(?:[,.]\s*(?:and\s+)?|\s+and\s+(?:then\s+)?|\s+)/g
  let m
  while ((m = re.exec(text))) {
    if (m[0].length === 0) { re.lastIndex++; continue }
    cuts.push({ at: m.index, after: m.index + m[0].length, hard: /[,.]|\band\b/.test(m[0]) })
  }
  for (const pass of [true, false]) {
    for (const cut of cuts.filter(c => c.hard === pass)) {
      const left = text.slice(0, cut.at).trim()
      const right = text.slice(cut.after).trim()
      if (!left || !right || !startsWithUnit(right, units)) continue
      if (!wholeOrder(left, context, options)) continue
      const rest = splitLine(right, context, options)
      if (rest.every(piece => wholeOrder(piece, context, options))) return [left, ...rest]
    }
  }
  return [text]
}

// Phrases the grammar handles that contain "and" or a comma.
const SAFE_PHRASES = /\s*(?:,|\band\b|\bthen\b)\s*(?:then\s+)?(?:hold(?: it| there| the position)?|dig in|stand|set up (?:a )?defensive positions?|defend it|make a stand|let\s+\S+(?:\s+\S+){0,3}\s+(?:pass|go by|go past|through|by)(?:\s+first)?|hit\b.*|strike\b.*|attack\b.*|fall on\b.*|ambush\b.*|jump\b.*|charge\b.*)/ig
// Words that mean a line says more than one simple order, or asks for
// something conditional.
const COMPOUND = /[,;:]|\b(?:and|then|while|but|unless|if|after|before|when|until|once|have|should|please|tell|send|order|make|let's|want|need)\b/i

// Is this line one the grammar can be trusted to have read whole? Its parse
// must be an order, and outside the unit names it must say only one thing.
function grammarReadsWhole(line, parsed) {
  if (parsed.kind === 'surrender' || parsed.kind === 'ride') return true
  if (parsed.kind !== 'order') return false
  // A chain or a condition the grammar took apart piece by piece.
  if (parsed.deep) return true
  // (Read as the grammar read it: filler words gone, typos put right.)
  let rest = tidy(String(line)).toLowerCase()
  const who = String(parsed.unitRef ?? '').toLowerCase()
  // Unit names are short and hold no place words: "spears to the bridge and
  // archers" is half an order swallowed into a name.
  if (who.split(/\s+/).length > 6 || /\b(?:to|in|at|on|into|from|by|toward|towards|near)\b/.test(who)) return false
  if (who && who !== 'everyone' && rest.includes(who)) rest = rest.replace(who, ' ')
  rest = rest.replace(SAFE_PHRASES, ' ').replace(/\b(?:seek|search|find) and (?:destroy|attack|kill)\b/g, ' ')
  return !COMPOUND.test(rest)
}

async function interpretText(text, context, { ai } = {}) {
  const options = readOptions(context)
  const lines = joinContinued(String(text).split(/\n|;/).map(l => l.trim()).filter(Boolean))
    .flatMap(line => splitLine(line, context, options))
  // The units his orders name, for "everyone else" in any of them.
  const named = namedLines(lines, context, options)
  const withNamed = { ...context, named }

  // Each line: read whole by the grammar and placed on the field without a
  // "who?" or "where?" question, or handed to the AI.
  const kept = []
  const hard = []
  for (const line of lines) {
    const parsed = parseLine(line, options)
    if (parsed.kind === 'done') break
    if (parsed.kind === 'empty') continue
    if (grammarReadsWhole(line, parsed)) {
      const resolved = resolveIntents([parsed], withNamed)
      // A question with choices ("which ridge?") is the grammar doing its
      // job. A question without is the grammar not understanding.
      // ("I ride with the horse" is the grammar's whole: a refusal is its answer.)
      if (parsed.kind === 'ride' || resolved.questions.length === 0 || resolved.choices.length > 0) { kept.push(parsed); continue }
    }
    hard.push({ line, parsed })
  }

  const fromGrammar = resolveIntents(kept, withNamed)
  if (hard.length === 0) return { ...fromGrammar, source: 'grammar' }

  const fromAi = await readWithAi(ai, hard.map(h => h.line).join('\n'), context)
  const rest = fromAi
    ? resolveIntents(fromAi.intents, withNamed)
    : resolveIntents(hard.map(h => h.parsed), withNamed)

  return {
    orders: [...fromGrammar.orders, ...rest.orders],
    questions: [...fromGrammar.questions, ...rest.questions],
    notes: [...fromGrammar.notes, ...rest.notes],
    choices: [...fromGrammar.choices, ...rest.choices],
    surrender: fromGrammar.surrender || rest.surrender,
    understood: [...fromGrammar.understood, ...rest.understood],
    counsel: [...(fromGrammar.counsel ?? []), ...(rest.counsel ?? [])],
    source: fromAi ? (kept.length ? 'grammar+ai' : 'ai') : 'grammar'
  }
}

// The units named in a set of lines, read by the grammar: "everyone else"
// is every unit but these.
function namedLines(lines, context, options) {
  const units = context.units ?? []
  const ids = new Set()
  const OTHERS_REF = /^(?:every(?:one|body)|all|all units|the army|army)$|\belse$|^(?:the\s+)?(?:rest|others)\b|\b(?:except|but)\b/i
  for (const line of lines) {
    const parsed = parseLine(line, options)
    if (parsed.kind !== 'order' || OTHERS_REF.test(parsed.unitRef ?? '')) continue
    for (const u of resolveUnitsWide(parsed.unitRef, units).units) ids.add(u.id)
  }
  return [...ids]
}

module.exports = { interpretLines, interpretText, grammarIntents, grammarReadsWhole, splitLine }
