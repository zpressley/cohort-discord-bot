// src/phase5-orchestration/orchestrator.js
//
// The two-player game loop, headless. Both commanders submit orders; when the
// last one is in, the turn processes. No Discord, no AI, no wall clock — the
// Discord adapter (phase 7) will sit on top of exactly this surface:
//
//   const game = createGame(spec)
//   submitOrders(game, 'red',  [{ unitRef: 'the archers', target: 'H8' }])
//   submitOrders(game, 'blue', [{ unitRef: 'everyone', target: 'K9' }])   // turn fires
//   sideView(game, 'red')   // what red is allowed to know
//
// ── Elastic time (locked decision 1, ruling Q1) ────────
//
// One player turn is up to MAX_TICKS_PER_TURN ten-minute ticks. The submitted
// orders run for the first tick; while nothing has HAPPENED — no engagement,
// no fresh sighting on either side, no change of objective control, no
// verdict — the same orders keep running, so armies marching in empty country
// cover real ground per decision instead of trickling three tiles a turn.
// The moment anything happens the turn ends and both commanders decide again.
// A stalled tick (nobody moved, nothing happened) also ends the turn — there
// is nothing to fast-forward through.
//
// Submission timeouts are a real-world concern, so they live in the Discord
// adapter, not here; the headless form is forceProcess(game), which processes
// with whatever has been submitted (an absent commander's army holds — or
// presses on under standing orders, which is exactly what standing orders
// are for).

const { createBattleState, stepTurn } = require('../phase4-integration/battle')
const { unitsOnSide, sides } = require('../phase2-combat/harness/world')
const { createIntel, updateIntel, sideView: fogSideView } = require('./fogOfWar')
const { evaluateVictory, objectiveController, OBJECTIVE_TURNS_TO_WIN } = require('./victory')

const MAX_TICKS_PER_TURN = 6   // one hour of battle time per decision
const MINUTES_PER_TICK = 10    // locked decision 1

/**
 * @param {Object} spec  a phase 4 battle spec, plus optionally:
 *   objectives:          [{ id, coord }] — named ground worth holding
 *   objectiveTurnsToWin: consecutive player turns of total control to win
 * @param {Object} [options] { seed }
 */
function createGame(spec, options = {}) {
  const battle = createBattleState(spec, options)

  const game = {
    spec,
    battle,
    playerTurn: 0,
    minutesElapsed: 0,
    submitted: {},              // side -> orders (this player turn)
    surrendered: null,
    intel: {},
    startingStrength: {},
    objectiveHolds: {},         // objectiveId -> { side, turns }
    outcome: { decided: false, winner: null, reason: 'battle still open' },
    history: []                 // one entry per player turn
  }

  for (const side of sides(battle.world)) {
    game.intel[side] = createIntel()
    game.startingStrength[side] =
      unitsOnSide(battle.world, side).reduce((sum, u) => sum + u.strength, 0)
    // Opening intel: you can see whatever is in range from your deployment.
    updateIntel(game.intel[side], battle.world, side, 0)
  }

  return game
}

/**
 * Submit one side's orders (or surrender). When every side has submitted,
 * the turn processes immediately.
 *
 * @param {Object} game
 * @param {string} side
 * @param {Array|Object} orders  [{ unitRef, target }] or { surrender: true }
 * @returns {{ status: 'waiting'|'processed'|'finished', outcome? }}
 */
function submitOrders(game, side, orders) {
  if (game.outcome.decided) return { status: 'finished', outcome: game.outcome }

  if (orders && orders.surrender === true) {
    game.surrendered = side
    game.submitted[side] = []
  } else {
    game.submitted[side] = orders ?? []
  }

  const waitingOn = sides(game.battle.world).filter(s => !(s in game.submitted))
  if (waitingOn.length > 0 && !game.surrendered) {
    return { status: 'waiting', waitingOn }
  }

  const turnReport = processPlayerTurn(game)
  return {
    status: game.outcome.decided ? 'finished' : 'processed',
    outcome: game.outcome,
    turn: turnReport
  }
}

// Process with whatever has been submitted — the timeout path. Sides that
// never spoke hold (or follow their standing orders).
function forceProcess(game) {
  if (game.outcome.decided) return { status: 'finished', outcome: game.outcome }
  const turnReport = processPlayerTurn(game)
  return {
    status: game.outcome.decided ? 'finished' : 'processed',
    outcome: game.outcome,
    turn: turnReport
  }
}

function processPlayerTurn(game) {
  const { battle } = game
  game.playerTurn += 1

  const orders = game.submitted
  game.submitted = {}

  // Surrender ends the battle before a single blade moves — the yield is the
  // commander's decision, not something the field has to ratify.
  if (game.surrendered) {
    game.outcome = evaluateVictory(victoryContext(game))
    game.history.push({
      playerTurn: game.playerTurn, ticks: [], interrupt: 'surrender'
    })
    return game.history.at(-1)
  }

  const ticks = []
  let interrupt = null

  for (let tick = 1; tick <= MAX_TICKS_PER_TURN; tick++) {
    const turnRecord = stepTurn(battle, orders)
    game.minutesElapsed += MINUTES_PER_TICK

    // Sightings on either side interrupt: yours because you would give new
    // orders, the enemy's because their next orders may already be reacting
    // and the simultaneity contract says you both decide on equal footing.
    const sightings = []
    for (const side of sides(battle.world)) {
      sightings.push(...updateIntel(game.intel[side], battle.world, side, battle.turn))
    }

    const objectiveChanges = updateObjectiveHolds(game)

    ticks.push({ tick, battleTurn: battle.turn, record: turnRecord, sightings })

    game.outcome = evaluateVictory(victoryContext(game))
    if (game.outcome.decided) { interrupt = 'decided'; break }
    if (turnRecord.engagements.length > 0) { interrupt = 'contact'; break }
    if (sightings.length > 0) { interrupt = 'sighting'; break }
    if (objectiveChanges) { interrupt = 'objective'; break }
    if (nothingMoved(turnRecord)) { interrupt = 'stalled'; break }
  }

  game.history.push({
    playerTurn: game.playerTurn,
    ticks,
    interrupt: interrupt ?? 'time'   // six ticks passed; the commander checks in
  })
  return game.history.at(-1)
}

// Objective control is measured once per TICK but victory counts consecutive
// PLAYER turns — updateObjectiveHolds runs per tick so a mid-turn loss of the
// ford resets the clock, which is what "holding" means.
function updateObjectiveHolds(game) {
  const objectives = game.spec.objectives ?? []
  let changed = false

  for (const objective of objectives) {
    const controller = objectiveController(game.battle.world, game.battle.broken, objective)
    const hold = game.objectiveHolds[objective.id]

    if (!controller) {
      if (hold) { delete game.objectiveHolds[objective.id]; changed = true }
      continue
    }
    if (!hold || hold.side !== controller) {
      game.objectiveHolds[objective.id] = { side: controller, turns: 0, sincePlayerTurn: game.playerTurn }
      changed = true
    }
  }

  // The consecutive-turn count itself advances once per player turn, in
  // finishPlayerTurnHolds below — but a change of hands is an interrupt now.
  return changed
}

function victoryContext(game) {
  // Advance hold counts for objectives still controlled this player turn.
  for (const hold of Object.values(game.objectiveHolds)) {
    if (hold.countedTurn !== game.playerTurn) {
      hold.turns += 1
      hold.countedTurn = game.playerTurn
    }
  }

  return {
    world: game.battle.world,
    broken: game.battle.broken,
    surrendered: game.surrendered,
    startingStrength: game.startingStrength,
    objectiveHolds: game.objectiveHolds,
    objectiveTurnsToWin: game.spec.objectiveTurnsToWin ?? OBJECTIVE_TURNS_TO_WIN
  }
}

function nothingMoved(turnRecord) {
  return turnRecord.movement.every(m =>
    m.held || m.skipped || m.failed || m.tilesMoved === 0) &&
    turnRecord.engagements.length === 0
}

// What one commander is allowed to know. The fog module builds it; this just
// adds the game-level facts both sides share (turn, clock, verdict).
function sideView(game, side) {
  return {
    playerTurn: game.playerTurn,
    minutesElapsed: game.minutesElapsed,
    outcome: game.outcome,
    ...fogSideView(game.battle.world, side, game.intel[side])
  }
}

module.exports = {
  createGame,
  submitOrders,
  forceProcess,
  sideView,
  MAX_TICKS_PER_TURN,
  MINUTES_PER_TICK
}
