// src/adapters/hotseat/session.js
//
// The hotseat session: everything the CLI does EXCEPT talk to a keyboard.
// The readline shell in play.js and the test suite drive the exact same
// object — which is the same split the Discord adapter will use, with
// message handlers where readline sits.

const { createGame, submitOrders, sideView } = require('../../engine/orchestrator')
const { sides } = require('../../engine/world')
const { interpretLines, interpretText } = require('../../interpreter/orders')
const { renderMap, renderRoster, renderTurnReport } = require('./render')

/**
 * @param {Object} spec     a phase 4/5 battle spec
 * @param {Object} options  { seed, auto: 'blue'|null, fullMap, ai }
 *   ai: an AI client (src/llm); without one, orders use the fixed grammar
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
     * What one side knows, for reading its orders: its own living, unbroken
     * units, the map, and the enemies its intel carries (fog of war holds).
     */
    context(side) {
      return {
        map: game.battle.map,
        units: game.battle.world.units.filter(u =>
          u.side === side && u.strength > 0 && !game.battle.broken.has(u.id)),
        enemies: sideView(game, side).intel
      }
    },

    /**
     * Read and submit one side's typed orders with the fixed grammar. If any
     * line raised a question, nothing is submitted: the commander answers and
     * resubmits the block. When the last side is in, the turn processes and
     * the report comes back.
     *
     * @returns {{ status, questions?, understood?, report?, outcome? }}
     */
    submitLines(side, lines) {
      return this.submit(side, interpretLines(lines, this.context(side)))
    },

    /**
     * The same, reading free text with the AI when one is configured and
     * falling back to the grammar when it is not or when it fails.
     */
    async submitText(side, text) {
      return this.submit(side, await interpretText(text, this.context(side), { ai: options.ai }))
    },

    submit(side, read) {
      const { orders, questions, surrender, understood, source } = read
      if (questions.length > 0) {
        return { status: 'clarify', questions, understood, source }
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
        return { status: 'waiting', waitingOn: result.waitingOn, understood, source }
      }

      const turnEntry = game.history.at(-1)
      return {
        status: result.status, // 'processed' | 'finished'
        understood,
        source,
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
