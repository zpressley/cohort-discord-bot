// src/phase1-movement/handler.js
// Listens for messages in the battle-test channel.
// Natural conversation — no slash commands.
// Unit state persists in memory for Phase 1 testing.

const { resolve, buildLocalContext, listLandmarks } = require('./landmarkResolver')
const { parseIntent } = require('./intentParser')
const { executeMove } = require('./movementEngine')
const { narrateResult } = require('./narrator')
const { createUnit } = require('./unitState')
const { getCell } = require('./mapData')

// Channel ID for the battle-test channel
const BATTLE_TEST_CHANNEL_ID = '1519439030633369670'

// Unit state persists in memory — resets on bot restart
let unitState = createUnit()

async function handleMessage(message) {
  if (message.author.bot) return
  if (message.channel.id !== BATTLE_TEST_CHANNEL_ID) return

  const orderText = message.content.trim()
  if (!orderText) return

  // Show typing indicator while processing
  await message.channel.sendTyping()

  try {
    // Step 1 — parse intent via AI
    const mapContext = buildLocalContext(unitState)
    const intent = await parseIntent(orderText, unitState, mapContext)

    // Step 2 — ask for clarification if needed
    if (intent.action === 'clarify') {
      await message.reply(intent.question)
      return
    }

    // Step 3 — hold order
    if (intent.action === 'hold') {
      await message.reply(`*The legionaries hold their position at ${getCell(unitState.position).landmark || 'their current ground'}.*\n\n─────────────────────\n⚔️ YOUR FORCES\n─────────────────────\n**HEAVY INFANTRY** (${unitState.strength} / ${unitState.maxStrength} men)\n📍 ${getCell(unitState.position).landmark || 'Current position'}`)
      return
    }

    // Step 4 — resolve landmark to coordinate
    if (!intent.landmark) {
      await message.reply("I understand the order but couldn't identify a destination. Known positions are: " + listLandmarks().join(', ') + '.')
      return
    }

    const resolved = resolve(intent.landmark)

    if (resolved.confidence === 'none') {
      await message.reply(
        `I don't recognise that location, Commander. Known positions are: ${listLandmarks().join(', ')}.`
      )
      return
    }

    if (resolved.confidence === 'ambiguous') {
      const options = resolved.matches.map(m => m.cell.landmark).join(' or ')
      await message.reply(`Did you mean ${options}, Commander?`)
      return
    }

    // Step 5 — execute movement
    const moveResult = executeMove(unitState, resolved.coord)

    if (!moveResult.success) {
      await message.reply(`*The officers report: ${moveResult.reason}*`)
      return
    }

    // Step 6 — update state
    unitState.position = moveResult.finalPosition

    // Step 7 — narrate
    const { narrative, statusBlock } = await narrateResult(moveResult, unitState)

    // Step 8 — send response
    const response = [
      narrative,
      '',
      '─────────────────────',
      '⚔️ YOUR FORCES',
      '─────────────────────',
      statusBlock
    ].join('\n')

    await message.reply(response)

  } catch (err) {
    console.error('[phase1-handler] Error:', err)
    await message.reply('*A messenger reports an error in the chain of command. Please try again.*')
  }
}

// Reset unit to starting position (useful for testing)
function resetUnit() {
  unitState = createUnit()
  return unitState
}

// Expose current state (useful for debugging)
function getUnitState() {
  return { ...unitState }
}

module.exports = { handleMessage, resetUnit, getUnitState }
