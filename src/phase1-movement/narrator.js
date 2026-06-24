// src/phase1-movement/narrator.js
// Takes a mechanical movement result and returns:
//   narrative — 2-3 sentence AI-generated paragraph
//   statusBlock — plain-text status card

const Groq = require('groq-sdk')
const { getCell } = require('./mapData')

const NARRATOR_PROMPT = `
You are narrating movement in an ancient Roman battle.
Write 2-3 sentences. Military tone. Past tense.
Reference landmark names, not coordinates or tile counts.
Do not invent events that didn't happen.
Do not mention game mechanics, movement points, or numbers of tiles.
If the unit didn't fully reach its destination, say so clearly.
`.trim()

async function narrateResult(moveResult, unit) {
  const fromCell = getCell(moveResult.startPosition)
  const toCell = getCell(moveResult.finalPosition)
  const targetCell = getCell(moveResult.targetCoord)

  const mechanicalSummary = buildMechanicalSummary(moveResult, fromCell, toCell, targetCell)

  let narrative = mechanicalSummary  // fallback if AI fails

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: NARRATOR_PROMPT },
        { role: 'user', content: mechanicalSummary }
      ],
      max_tokens: 150,
      temperature: 0.7
    })
    narrative = response.choices[0].message.content.trim()
  } catch (err) {
    console.error('[narrator] AI call failed, using fallback:', err.message)
  }

  const statusBlock = buildStatusBlock(unit, moveResult, toCell, targetCell)

  return { narrative, statusBlock }
}

function buildMechanicalSummary(moveResult, fromCell, toCell, targetCell) {
  const from = fromCell.landmark || 'their position'
  const to = toCell.landmark || 'a new position'
  const target = targetCell.landmark || 'their destination'
  const terrainCrossed = [...new Set(moveResult.tilesTraversed.map(t => t.terrain))].join(', ')

  if (moveResult.reachedTarget) {
    return `Heavy infantry moved from ${from} to ${to}, crossing ${terrainCrossed || 'open ground'}.`
  } else {
    return `Heavy infantry began moving from ${from} toward ${target} but could not reach it this turn. They stopped after crossing ${terrainCrossed || 'open ground'}, now at ${to}.`
  }
}

function buildStatusBlock(unit, moveResult, currentCell, targetCell) {
  const locationLine = currentCell.landmark
    ? `📍 ${currentCell.landmark}${currentCell.description ? ` — ${currentCell.description}` : ''}`
    : `📍 Open ground`

  const lines = [
    `**${unit.role.replace(/_/g, ' ').toUpperCase()}** (${unit.strength} / ${unit.maxStrength} men)`
  ]

  lines.push(locationLine)

  if (moveResult.partialMove) {
    const target = targetCell.landmark || moveResult.targetCoord
    const turns = moveResult.turnsToTarget
    lines.push(`⏳ Still en route to ${target} — ~${turns} turn${turns !== 1 ? 's' : ''} remaining`)
  }

  lines.push(`🔗 snake-river-map.github.io/#${moveResult.finalPosition}`)

  return lines.join('\n')
}

module.exports = { narrateResult }
