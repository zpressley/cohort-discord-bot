// src/phase7-hotseat/session.js
//
// The hotseat session: everything the CLI does EXCEPT talk to a keyboard.
// The readline shell in play.js and the test suite drive the exact same
// object — which is the same split the Discord adapter will use, with
// message handlers where readline sits.

const { createGame, submitOrders, sideView } = require('../phase5-orchestration')
const { sides } = require('../phase2-combat/harness/world')
const { parseOrderBlock } = require('./parser')
const { renderMap, renderRoster, renderTurnReport } = require('./render')

/**
 * @param {Object} spec     a phase 4/5 battle spec
 * @param {Object} options  { seed, auto: 'blue'|null, fullMap }
 */
function createSession(spec, options = {}) {
  const game = createGame(spec, { seed: options.seed })
  const autoSide = options.auto ?? null
  const fullMap = Boolean(options.fullMap)

  const session = {
    game,
    sides: sides(game.battle.world),
    humanSides() {
      return this.sides.filter(s => s !== autoSide)
    },

    // The briefing a commander sees before giving orders.
    briefing(side) {
      return renderRoster(game, side) + '\n\n' + renderMap(game, side, { fullMap })
    },

    /**
     * Parse and submit one side's typed orders. If parsing raised questions,
     * nothing is submitted — the commander answers and resubmits the block.
     * When the last side is in, the turn processes and the report comes back.
     *
     * @returns {{ status, questions?, report?, outcome? }}
     */
    submitLines(side, lines) {
      const { orders, questions, surrender } = parseOrderBlock(lines)
      if (questions.length > 0) {
        return { status: 'clarify', questions }
      }

      let result = submitOrders(game, side, surrender ? { surrender: true } : orders)

      // The scripted opponent: standing orders carry its aggression, so its
      // submission is empty — the point is WHEN it submits, which is
      // immediately after the human, exactly like the second Discord account
      // used to.
      if (result.status === 'waiting' && autoSide && result.waitingOn.includes(autoSide)) {
        result = submitOrders(game, autoSide, [])
      }

      if (result.status === 'waiting') {
        return { status: 'waiting', waitingOn: result.waitingOn }
      }

      const turnEntry = game.history.at(-1)
      return {
        status: result.status, // 'processed' | 'finished'
        report: renderTurnReport(game, turnEntry),
        outcome: game.outcome
      }
    },

    finished() {
      return game.outcome.decided
    },

    finalSummary() {
      const lines = []
      const verdict = game.outcome.winner === 'draw'
        ? `Draw — ${game.outcome.reason}`
        : `${(game.outcome.winner ?? 'nobody').toUpperCase()} wins — ${game.outcome.reason}`
      lines.push(verdict)
      lines.push(`${game.playerTurn} player turns, ${game.minutesElapsed} minutes of battle.`)

      for (const side of this.sides) {
        const view = sideView(game, side)
        const standing = view.own.reduce((sum, u) => sum + u.strength, 0)
        const fled = game.battle.fledUnits.filter(u => u.side === side)
        lines.push(`  ${side}: ${standing} men standing` +
          (fled.length ? `, ${fled.reduce((s, u) => s + u.strength, 0)} fled the field` : ''))
      }
      return lines.join('\n')
    }
  }

  return session
}

module.exports = { createSession }
