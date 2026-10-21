// src/interpreter/orders.js
//
// From what a commander typed to engine orders.
//
//   interpretLines(lines, context)            fixed grammar only, synchronous
//   interpretText(text, context, { ai })      AI first, grammar if the AI is
//                                             missing, fails, or replies with
//                                             something unusable
//
// Both return { orders, questions, surrender, understood, source }. When
// there are questions, nothing should be submitted: the player answers and
// tries again (the hotseat CLI already works that way).
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

async function interpretText(text, context, { ai } = {}) {
  const fromAi = await readWithAi(ai, text, context)
  if (fromAi) return { ...resolveIntents(fromAi.intents, context), source: 'ai' }
  const lines = String(text).split(/\n|;/)
  return interpretLines(lines, context)
}

module.exports = { interpretLines, interpretText, grammarIntents }
