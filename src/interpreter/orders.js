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

const { parseLine } = require('./grammar')
const { resolveIntents } = require('./resolve')
const { readWithAi } = require('./aiReader')

function grammarIntents(lines) {
  const intents = []
  for (const line of lines) {
    const parsed = parseLine(line)
    if (parsed.kind === 'done') break
    if (parsed.kind !== 'empty') intents.push(parsed)
  }
  return intents
}

function interpretLines(lines, context) {
  return { ...resolveIntents(grammarIntents(lines), context), source: 'grammar' }
}

// Phrases the grammar handles that contain "and" or a comma.
const SAFE_PHRASES = /\s*(?:,|\band\b|\bthen\b)\s*(?:then\s+)?(?:hold(?: it| there| the position)?|dig in|stand|set up (?:a )?defensive positions?|defend it|make a stand|let\s+\S+(?:\s+\S+){0,3}\s+(?:pass|go by|go past|through|by)(?:\s+first)?|hit\b.*|strike\b.*|attack\b.*|fall on\b.*|ambush\b.*)/ig
// Words that mean a line says more than one simple order, or asks for
// something conditional.
const COMPOUND = /[,;:]|\b(?:and|then|while|but|unless|if|after|before|when|until|once|have|should|please|tell|send|order|make|let's|want|need)\b/i

// Is this line one the grammar can be trusted to have read whole? Its parse
// must be an order, and outside the unit names it must say only one thing.
function grammarReadsWhole(line, parsed) {
  if (parsed.kind === 'surrender') return true
  if (parsed.kind !== 'order') return false
  let rest = String(line).toLowerCase()
  const who = String(parsed.unitRef ?? '').toLowerCase()
  // Unit names are short and hold no place words: "spears to the bridge and
  // archers" is half an order swallowed into a name.
  if (who.split(/\s+/).length > 6 || /\b(?:to|in|at|on|into|from|by|toward|towards|near)\b/.test(who)) return false
  if (who && who !== 'everyone' && rest.includes(who)) rest = rest.replace(who, ' ')
  rest = rest.replace(SAFE_PHRASES, ' ').replace(/\b(?:seek|search|find) and (?:destroy|attack|kill)\b/g, ' ')
  return !COMPOUND.test(rest)
}

async function interpretText(text, context, { ai } = {}) {
  const lines = String(text).split(/\n|;/).map(l => l.trim()).filter(Boolean)

  // Each line: read whole by the grammar and placed on the field without a
  // "who?" or "where?" question, or handed to the AI.
  const kept = []
  const hard = []
  for (const line of lines) {
    const parsed = parseLine(line)
    if (parsed.kind === 'done') break
    if (parsed.kind === 'empty') continue
    if (grammarReadsWhole(line, parsed)) {
      const resolved = resolveIntents([parsed], context)
      // A question with choices ("which ridge?") is the grammar doing its
      // job. A question without is the grammar not understanding.
      if (resolved.questions.length === 0 || resolved.choices.length > 0) { kept.push(parsed); continue }
    }
    hard.push({ line, parsed })
  }

  const fromGrammar = resolveIntents(kept, context)
  if (hard.length === 0) return { ...fromGrammar, source: 'grammar' }

  const fromAi = await readWithAi(ai, hard.map(h => h.line).join('\n'), context)
  const rest = fromAi
    ? resolveIntents(fromAi.intents, context)
    : resolveIntents(hard.map(h => h.parsed), context)

  return {
    orders: [...fromGrammar.orders, ...rest.orders],
    questions: [...fromGrammar.questions, ...rest.questions],
    notes: [...fromGrammar.notes, ...rest.notes],
    choices: [...fromGrammar.choices, ...rest.choices],
    surrender: fromGrammar.surrender || rest.surrender,
    understood: [...fromGrammar.understood, ...rest.understood],
    source: fromAi ? (kept.length ? 'grammar+ai' : 'ai') : 'grammar'
  }
}

module.exports = { interpretLines, interpretText, grammarIntents, grammarReadsWhole }
