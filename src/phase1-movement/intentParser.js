// src/phase1-movement/intentParser.js
// Two functions: parse an order into a structured object,
// and handle ambiguity with an in-character clarifying question.

const Groq = require('groq-sdk')
const { buildLocalContext, listLandmarks } = require('./landmarkResolver')
const { getCell } = require('./mapData')

const SYSTEM_PROMPT = `
You are a Roman military officer interpreting your commander's orders.
Return ONLY a JSON object. No other text. No markdown. No explanation.

If the order is clear, return:
{ "action": "move", "landmark": "north ford", "pace": "normal" }

Valid actions: move, hold, advance, retreat, charge, ford
Valid pace: normal, quick, slow

If the order mentions a place you cannot identify from the landmark list provided, return:
{ "action": "clarify", "question": "your question to the commander in officer voice" }

If the order is ambiguous between two landmarks, return:
{ "action": "clarify", "question": "your question naming both options" }

Never invent landmark names. Never output coordinates. Only use landmark names from the list provided.
`.trim()

async function parseIntent(orderText, unit, mapContext) {
  const prompt = buildPrompt(orderText, unit, mapContext)

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    max_tokens: 200,
    temperature: 0.2
  })

  const raw = response.choices[0].message.content.trim()

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0])
    return parsed
  } catch {
    return {
      action: 'clarify',
      question: "I didn't understand that order, Commander. Could you rephrase?"
    }
  }
}

function buildPrompt(orderText, unit, mapContext) {
  const currentCell = getCell(unit.position)
  const locationDesc = currentCell.landmark || 'their current position'

  return `Commander's order: "${orderText}"

Your unit: ${unit.role} (${unit.strength} men), currently at ${locationDesc}

${mapContext}

Landmark names you may use: ${listLandmarks().join(', ')}

Return JSON only.`.trim()
}

module.exports = { parseIntent }
