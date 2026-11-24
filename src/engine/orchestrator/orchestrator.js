// src/engine/orchestrator/orchestrator.js
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
// So does the moment a side's orders are carried out (a unit arrived, hid or
// finished its search, and none of that side's units is still on its way):
// without that, an ambush could be laid and sprung inside one turn, with no
// say for the commander in between.
// A stalled tick (nobody moved, nothing happened) also ends the turn — there
// is nothing to fast-forward through.
//
// Submission timeouts are a real-world concern, so they live in the Discord
// adapter, not here; the headless form is forceProcess(game), which processes
// with whatever has been submitted (an absent commander's army holds — or
// presses on under standing orders, which is exactly what standing orders
// are for).
//
// ── Replay ─────────────────────────────────────────────
//
// The engine is a pure function of (spec, seed, orders), so a game is fully
// described by those three. Every submission and every forced turn is logged
// in game.orderLog, gameRecord(game) packages the three as plain data for
// saving, and replayGame(record) plays them back into an identical game: the
// same event log byte for byte, the same history, the same verdict.

const { createBattleState, stepTurn } = require('../battle/battle')
const { unitsOnSide, sides } = require('../world')
const { samePosition } = require('../map/labels')
const { createIntel, updateIntel, learnFromCaptivity, sideView: fogSideView } = require('./fogOfWar')
const { createWord, updateWord, wordFromCaptivity, arrivalOf } = require('./word')
const { evaluateVictory, objectiveController, objectiveArea, OBJECTIVE_HOLD_MINUTES } = require('./victory')
const { bargainChips, commanderFate } = require('../command/commander')
const { PARLEY, COMMAND } = require('../combat/tables')

const MAX_TICKS_PER_TURN = 6   // one hour of battle time per decision
const MINUTES_PER_TICK = 10    // locked decision 1

/**
 * @param {Object} spec  a phase 4 battle spec, plus optionally:
 *   objectives:          [{ id, name?, coord | square | feature | tiles }] —
 *                        named ground worth holding (see victory.js,
 *                        objectiveArea)
 *   objectiveHoldMinutes: battle time all objectives must be held to win
 *                        (default 60)
 *   objectiveTurnsToWin: if set, consecutive player turns instead
 *   turnLimit:           player turns after which night falls (a testing
 *                        aid): the battle ends with no winner
 *   timeLimitMinutes:    battle time after which the side that lost the
 *                        larger share of its men loses (a testing aid)
 *   dayMinutes:          battle time after which night falls (the app's
 *                        end of the day): the battle ends with no winner
 *   everyoneAsked:       true for a battle saved before the riders rulings:
 *                        every side is asked at every stop, and a Commander
 *                        is told at once when a unit is cut off (see
 *                        "Asked when wanted", below)
 * @param {Object} [options] { seed }
 */
function createGame(spec, options = {}) {
  const battle = createBattleState(spec, options)

  const game = {
    spec,
    seed: battle.seed,
    battle,
    // Everything submitted, in order: { side, orders } or { forced: true }.
    // With spec and seed this is the whole game (see replayGame).
    orderLog: [],
    objectives: (spec.objectives ?? []).map(o => objectiveArea(battle.map, o)),
    playerTurn: 0,
    minutesElapsed: 0,
    submitted: {},              // side -> orders (this player turn)
    surrendered: null,
    // { side, units } when a Commander in the enemy's hands bought his
    // freedom: the battle lost, and those of his units given to the enemy.
    bargained: null,
    // The table between a held Commander and his captors (see makeOffer).
    parley: {},
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
    updateIntel(game.intel[side], battle.world, side, 0, battle.map, battle.hidden)
  }
  // What each Commander on the field knows, and when (word.js): only for a
  // side with one. A battle with none has no ledger and runs as before.
  game.word = {}
  // (A battle saved before riders has none: spec.messengers false.)
  if (spec.messengers !== false) for (const side of Object.keys(spec.commanders ?? {}).sort()) game.word[side] = createWord(game, side)
  // Who the next turn waits on (see "Asked when wanted"): at the start,
  // everyone. How many times the battle has stopped for each side (his own
  // turns), and the battle turn it last did.
  game.wanted = sides(battle.world)
  game.calls = Object.fromEntries(game.wanted.map(s => [s, 0]))
  game.askedAt = Object.fromEntries(game.wanted.map(s => [s, 0]))

  return game
}

/**
 * Is each side asked only when wanted (ruled 2026-11-23)? So in a battle
 * with a Commander on the field, unless it was saved before the ruling.
 */
const askedWhenWanted = (game) => Object.keys(game.word ?? {}).length > 0 && !game.spec.everyoneAsked

/** The sides the next turn still waits on: those wanted that have not given orders. */
function waitingOn(game) {
  if (game.outcome.decided) return []
  const wanted = askedWhenWanted(game) ? game.wanted : sides(game.battle.world)
  return wanted.filter(s => !(s in game.submitted))
}

/**
 * Submit one side's orders (or surrender). When every side has submitted,
 * the turn processes immediately.
 *
 * @param {Object} game
 * @param {string} side
 * @param {Array|Object} orders  [{ unitRef, target }] (and { ride: unitId }:
 *                               the Commander rides over to that unit), or
 *                               { surrender: true } (not while he is held),
 *                               or, between a held Commander and his
 *                               captors (see makeOffer):
 *                                 { offer: { units } }  his offer
 *                                 { answer: { offer, accept | refuse | more: { units } } }
 *                               or { bargain: unitId }: the bargain of
 *                               before November 23, kept so that battles
 *                               saved then replay.
 * @returns {{ status: 'waiting'|'processed'|'finished'|'parley'|'refused', outcome?, refused? }}
 */
function submitOrders(game, side, orders) {
  if (game.outcome.decided) return { status: 'finished', outcome: game.outcome }
  game.orderLog.push({ side, orders: copyOrders(orders) })

  // The table between a held Commander and his captors. Neither an offer
  // nor an answer is a side's orders for the turn: each is put down
  // between turns, and the turn waits for orders as before. A deal struck
  // ends the battle at once, as a yield does.
  if (orders && (orders.offer || orders.answer)) {
    const done = orders.offer ? makeOffer(game, side, orders.offer) : answerOffer(game, side, orders.answer)
    if (!done.deal) return { status: done.refused ? 'refused' : 'parley', refused: done.refused ?? null }
    const turnReport = processPlayerTurn(game)
    return { status: 'finished', outcome: game.outcome, turn: turnReport }
  }

  if (orders && orders.surrender === true) {
    // A Commander in the enemy's hands cannot yield by his own word (ruled
    // 2026-11-23): his officers run their own units, and the field is his
    // only to offer for his freedom. Read as no orders.
    if (!captorOf(game, side)) game.surrendered = side
    game.submitted[side] = []
  } else if (orders && orders.bargain) {
    // The bargain as it was before November 23 (one unit, always taken):
    // kept so that battles saved then replay as they were played.
    const held = game.battle.commanders?.[side]?.status === 'held'
    if (held && bargainChips(game.battle.world, side).some(u => u.id === orders.bargain)) {
      strikeDeal(game, side, [orders.bargain])
    }
    game.submitted[side] = []
  } else {
    game.submitted[side] = orders ?? []
  }

  // A side not wanted may still give orders: they go out when the battle
  // moves on. The turn runs when every side wanted has given its own.
  const waiting = waitingOn(game)
  if (waiting.length > 0 && !game.surrendered) {
    return { status: 'waiting', waitingOn: waiting }
  }

  const turnReport = processPlayerTurn(game)
  return {
    status: game.outcome.decided ? 'finished' : 'processed',
    outcome: game.outcome,
    turn: turnReport
  }
}

// ── The table: a held Commander's offers, and his captors' answers ──
//
// Ruled 2026-11-23: "The captive names a price, the captor rejects or asks
// for more, this continues each turn til the battle ends or the captive
// surrenders, or loses their army. Surrender is also an option. The captor
// does not have to accept anything or even respond, they can just ignore
// and keep fighting."
//
// game.parley[captiveSide] = {
//   offer    { id, units, turn } on the table, or null. `units` are ids of
//            his units still on the field; none means the field alone.
//            Every deal is a yield of the field: the battle is lost.
//   counter  { id, units, turn } what the captor asked for, or null. It
//            stands for the player turn it was made in and PARLEY.COUNTER_LASTS
//            more; an offer that gives all it names strikes the deal at once.
//   answer   the captor's last answer, for the captive to read:
//            { kind: 'refused'|'more', to: offer id, turn }
//   nextId, last (the player turn of his last offer)
// }


/** The side holding a side's Commander, or null when he is not held. */
function captorOf(game, side) {
  const c = game.battle.commanders?.[side]
  if (c?.status !== 'held') return null
  const unit = game.battle.world.units.find(u => u.id === c.heldBy) ?? game.battle.fledUnits.find(u => u.id === c.heldBy)
  return unit?.side ?? null
}

const table = (game, side) => (game.parley[side] ??= { offer: null, counter: null, answer: null, nextId: 1, last: null })
const onTheField = (game, side) => new Set(bargainChips(game.battle.world, side).map(u => u.id))
const counterStands = (game, counter) => counter && game.playerTurn <= counter.turn + PARLEY.COUNTER_LASTS

/**
 * Why an offer cannot be put on the table, or null if it can.
 * @param {{ units?: string[] }} offer
 */
function checkOffer(game, side, offer) {
  if (game.outcome.decided) return 'the battle is over'
  if (!captorOf(game, side)) return 'you are not held'
  const units = offer?.units ?? []
  if (!Array.isArray(units) || new Set(units).size !== units.length) return 'name each unit once'
  const mine = onTheField(game, side)
  if (units.some(id => !mine.has(id))) return 'that is not yours to give'
  if (game.parley[side]?.last === game.playerTurn) return 'one offer a turn: wait for the turn to run'
  return null
}

/**
 * Why a captor's answer cannot be given, or null if it can.
 * @param {{ offer: number, accept?: true, refuse?: true, more?: { units: string[] } }} answer
 */
function checkAnswer(game, side, answer) {
  if (game.outcome.decided) return 'the battle is over'
  const captive = Object.keys(game.parley ?? {}).find(s => captorOf(game, s) === side && game.parley[s].offer)
  const offer = captive ? game.parley[captive].offer : null
  if (!offer || offer.id !== answer?.offer) return 'there is no such offer on the table'
  const kinds = ['accept', 'refuse', 'more'].filter(k => answer[k])
  if (kinds.length !== 1) return 'accept, refuse or ask for more'
  if (answer.accept) {
    const theirs = onTheField(game, captive)
    if (offer.units.some(id => !theirs.has(id))) return 'what was offered is no longer theirs to give'
  }
  if (answer.more) {
    const units = answer.more.units ?? []
    // A captor may name only what his side has seen of the enemy, and what
    // the captive himself put on the table.
    const known = game.intel[side]?.known ?? {}
    if (!Array.isArray(units) || new Set(units).size !== units.length) return 'name each unit once'
    if (units.some(id => !known[id] && !offer.units.includes(id))) return 'you can ask only for enemy units your side has seen'
    if (units.length === offer.units.length && units.every(id => offer.units.includes(id))) return 'that is what was offered: accept it'
  }
  return null
}

function makeOffer(game, side, offer) {
  const refused = checkOffer(game, side, offer)
  if (refused) return { refused }
  const t = table(game, side)
  const units = [...offer.units ?? []]
  t.last = game.playerTurn
  // Meeting what the captor asked for strikes the deal.
  if (counterStands(game, t.counter) && t.counter.units.every(id => units.includes(id))) {
    strikeDeal(game, side, units)
    return { deal: true }
  }
  t.offer = { id: t.nextId++, units, turn: game.playerTurn }
  return {}
}

function answerOffer(game, side, answer) {
  const refused = checkAnswer(game, side, answer)
  if (refused) return { refused }
  const captive = Object.keys(game.parley).find(s => captorOf(game, s) === side && game.parley[s].offer?.id === answer.offer)
  const t = game.parley[captive]
  if (answer.accept) {
    strikeDeal(game, captive, t.offer.units)
    return { deal: true }
  }
  t.answer = { kind: answer.more ? 'more' : 'refused', to: t.offer.id, turn: game.playerTurn }
  t.counter = answer.more ? { id: t.offer.id, units: [...answer.more.units], turn: game.playerTurn } : null
  t.offer = null
  return {}
}

// The battle is lost as a yield; he is free, and what he gave goes to the
// enemy (web/battles.js: their officers are 'given up').
function strikeDeal(game, side, units) {
  game.surrendered = side
  game.bargained = { side, units: [...units] }
  game.battle.commanders[side].status = 'free'
  if (game.parley[side]) Object.assign(game.parley[side], { offer: null, counter: null })
}

// The table is cleared when he is no longer held.
function clearTable(game) {
  for (const side of Object.keys(game.parley)) {
    if (captorOf(game, side)) continue
    Object.assign(game.parley[side], { offer: null, counter: null, answer: null })
  }
}

// Process with whatever has been submitted — the timeout path. Sides that
// never spoke hold (or follow their standing orders).
function forceProcess(game) {
  if (game.outcome.decided) return { status: 'finished', outcome: game.outcome }
  game.orderLog.push({ forced: true })
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
    // (Everyone hears of it.)
    for (const s of sides(battle.world)) { game.calls[s] = (game.calls[s] ?? 0) + 1; game.askedAt[s] = battle.turn }
    return game.history.at(-1)
  }

  const ticks = []
  let interrupt = null
  // Asked when wanted: who the battle stops for, and why (side -> reason).
  const asking = askedWhenWanted(game)
  let wantedBy = null

  for (let tick = 1; tick <= (asking ? COMMAND.LONGEST : MAX_TICKS_PER_TURN); tick++) {
    // Orders are given once, as the turn opens. They stand in the battle's
    // order book from then on, so later ticks need nothing new. (Before
    // November 2026 the same orders were handed in again every tick, which
    // would have put a unit back on the first step of a chain each time.)
    const turnRecord = stepTurn(battle, tick === 1 ? orders : {}, { sameTurn: tick > 1 })
    game.minutesElapsed += MINUTES_PER_TICK

    // Sightings on either side interrupt: yours because you would give new
    // orders, the enemy's because their next orders may already be reacting
    // and the simultaneity contract says you both decide on equal footing.
    const sightings = []
    const sightedBy = {}
    for (const side of sides(battle.world)) {
      sightedBy[side] = updateIntel(game.intel[side], battle.world, side, battle.turn, battle.map, battle.hidden)
      sightings.push(...sightedBy[side])
    }

    // A Commander who got free this tick tells his side where every enemy
    // unit stood as he left their camp (battle.js does the same for what
    // his units make for): each is known as last seen there.
    for (const freed of battle.log.forTurn(battle.turn).filter(e => e.type === 'commanderFreed')) {
      learnFromCaptivity(game.intel[freed.side], battle.world, freed.side, battle.turn)
      if (game.word[freed.side]) wordFromCaptivity(game, freed.side)
    }
    // Word from his units reaches each Commander on the field (word.js).
    const heard = {}
    for (const side of Object.keys(game.word)) heard[side] = updateWord(game, side)

    const objectiveChanges = updateObjectiveHolds(game)

    ticks.push({ tick, battleTurn: battle.turn, record: turnRecord, sightings })

    game.outcome = evaluateVictory(victoryContext(game))
    // The end of the day, counted in battle time (the app's battles since
    // the riders rulings).
    if (!game.outcome.decided && game.spec.dayMinutes && game.minutesElapsed >= game.spec.dayMinutes) {
      nightFalls(game)
    }
    if (game.outcome.decided) { interrupt = game.outcome.reason === 'night fell' ? 'night' : 'decided'; break }
    // A Commander taken or freed: both sides stop, for both know of it. (One
    // who only got away to another of his units is his own side's secret,
    // and a stop would tell the enemy something had happened.)
    if (battle.log.forTurn(battle.turn).some(e => e.type === 'commanderTaken' || e.type === 'commanderFreed')) { interrupt = 'commander'; break }
    if (asking) {
      // Each side is asked only when it is wanted: the battle goes on
      // until one is (ruled 2026-11-23).
      wantedBy = wantedNow(game, turnRecord, sightedBy, heard, objectiveChanges)
      if (wantedBy) { interrupt = Object.values(wantedBy)[0]; break }
      continue
    }
    if (Object.keys(game.word).length > 0) {
      // A battle with a Commander on the field stops when news worth
      // stopping for reaches a Commander, not when it happens out of his
      // knowledge (docs/design/point-of-view-and-messengers.md). A side
      // with none (the computer) does not stop the turn for itself.
      interrupt = byNews(game, turnRecord, sightedBy, heard, objectiveChanges)
      if (interrupt) break
      continue
    }
    if (turnRecord.engagements.length > 0) { interrupt = 'contact'; break }
    if (turnRecord.volleys.length > 0) { interrupt = 'fire'; break }
    if (sightings.length > 0) { interrupt = 'sighting'; break }
    if (objectiveChanges) { interrupt = 'objective'; break }
    if (ordersCarriedOut(battle)) { interrupt = 'ready'; break }
    // A unit back in hand wants orders.
    if (battle.log.forTurn(battle.turn).some(e => e.type === 'rallied')) { interrupt = 'rallied'; break }
    if (nothingMoved(turnRecord)) { interrupt = 'stalled'; break }
  }

  clearTable(game)
  // The end of the day counted in turns (a testing aid): after
  // spec.turnLimit player turns night falls, as it does at dayMinutes.
  if (!game.outcome.decided && game.spec.turnLimit && game.playerTurn >= game.spec.turnLimit) {
    nightFalls(game)
    interrupt = game.outcome.reason === 'night fell' ? 'night' : 'decided'
  }

  if (!asking) {
    game.history.push({
      playerTurn: game.playerTurn,
      ticks,
      interrupt: interrupt ?? 'time'   // six ticks passed; the commander checks in
    })
    for (const s of sides(battle.world)) { game.calls[s] = (game.calls[s] ?? 0) + 1; game.askedAt[s] = battle.turn }
    return game.history.at(-1)
  }
  // Everyone is wanted when the battle is decided, when a Commander is
  // taken or freed (both sides know of it), and when the battle has run as
  // long as it may without asking anyone (COMMAND.LONGEST).
  const all = sides(battle.world)
  if (!wantedBy || game.outcome.decided) wantedBy = Object.fromEntries(all.map(s => [s, interrupt ?? 'long']))
  game.wanted = all.filter(s => wantedBy[s])
  for (const s of game.wanted) { game.calls[s] = (game.calls[s] ?? 0) + 1; game.askedAt[s] = battle.turn }
  game.history.push({
    playerTurn: game.playerTurn,
    ticks,
    interrupt: interrupt ?? 'long',
    wanted: wantedBy
  })
  return game.history.at(-1)
}

// The end of the day (ruled 2026-11-24: "No the day just ends the battle,
// you can choose to fight again the next day"): the battle ends with no
// winner (victory.js, 'night fell'), and the log says so, for both sides
// see the dark come down ('nightfall', told to everyone).
function nightFalls(game) {
  game.outcome = evaluateVictory({ ...victoryContext(game), dayOver: true })
  if (game.outcome.reason === 'night fell') game.battle.log.emit('nightfall', game.battle.turn, {})
}

// ── Asked when wanted ──────────────────────────────────
//
// Ruled 2026-11-23: "No the game keeps going. This is true for two human
// players as well. If one player gives move command for a march taking 3
// turns don't notify that commander for 3 turns unless the units spot the
// enemy. If the other command moves 1 turn of movement at a time that is
// fine... both would only be notified when there are commands to give or
// things happen to them."
//
// In a battle with a Commander on the field (unless saved before the
// ruling: spec.everyoneAsked), the battle runs on from one stop to the next,
// and each stop is for the sides wanted at it. Only those are asked for
// orders; the others are not told of it, nor waited for. A side is wanted:
//   - free with his army: when news worth stopping for reaches him (a fight,
//     shooting, a rout, a sighting, a rally), or his orders are carried out
//     (judged by what has reached him). Not by the clock: a Commander whose
//     men only hold waits for news (ruled 2026-11-24: "Holding for several
//     turns would still get interrupts from passing enemy troops"), or for
//     COMMAND.LONGEST. A rider back with word that he could not get
//     through calls him back too;
//   - held: when his captors hear what would stop them (as before), and
//     every COMMAND.QUIET, for he always has an offer to make;
//   - with no Commander on the field (the computer): on its own side's
//     news, as every side was before, and every COMMAND.QUIET;
//   - every side: when ground changes hands (all know at once).
// Who was wanted, and why, is history[i].wanted (side -> reason).
function wantedNow(game, turnRecord, sightedBy, heard, objectiveChanges) {
  const { battle } = game
  const all = sides(battle.world)
  if (objectiveChanges) return Object.fromEntries(all.map(s => [s, 'objective']))
  const recent = battle.log.all().filter(e => e.turn > battle.turn - NEWS_LOOKBACK)
  const now = recent.filter(e => e.turn === battle.turn)
  const quiet = (side) => battle.turn - (game.askedAt[side] ?? 0) >= COMMAND.QUIET
  const ofSide = (id, side) => [...battle.world.units, ...battle.fledUnits].some(u => u.id === id && u.side === side)
  const by = {}
  const order = ['contact', 'fire', 'sighting', 'ready', 'rallied', 'rider', 'stalled', 'time']
  for (const side of all) {
    const c = battle.commanders?.[side]
    const reasons = []
    if (game.word[side] && c?.status === 'free') {
      reasons.push(...newsFor(game, side, recent, heard))
      // A rider back with word that he could not get through: he has
      // commands to give (ruled 2026-11-24: "the rider should return with
      // that news"). Now that the hour does not call him back, it must.
      if (recent.some(e => e.type === 'riderBlocked' && e.side === side && arrivalOf(game, side, e) === battle.turn)) reasons.push('rider')
    } else if (game.word[side] && c?.status === 'held') {
      reasons.push(...heldNews(game, side, turnRecord, sightedBy, now))
      if (quiet(side)) reasons.push('time')
    } else {
      // As every side was asked before.
      if (turnRecord.engagements.length > 0) reasons.push('contact')
      if (turnRecord.volleys.length > 0) reasons.push('fire')
      if (sightedBy[side]?.length > 0) reasons.push('sighting')
      if (ordersCarriedOut(battle, { side })) reasons.push('ready')
      if (now.some(e => e.type === 'rallied' && ofSide(e.unitId, side))) reasons.push('rallied')
      if (nothingMoved(turnRecord)) reasons.push('stalled')
      if (quiet(side)) reasons.push('time')
    }
    // However busy his men, no one waits longer than COMMAND.LONGEST.
    if (battle.turn - (game.askedAt[side] ?? 0) >= COMMAND.LONGEST) reasons.push('long')
    const why = [...order, 'long'].find(r => reasons.includes(r))
    if (why) by[side] = why
  }
  return Object.keys(by).length > 0 ? by : null
}

// Objective control is measured once per TICK but victory counts consecutive
// PLAYER turns — updateObjectiveHolds runs per tick so a mid-turn loss of the
// ford resets the clock, which is what "holding" means.
function updateObjectiveHolds(game) {
  const objectives = game.objectives
  let changed = false

  for (const objective of objectives) {
    const controller = objectiveController(game.battle.world, game.battle.broken, objective)
    const hold = game.objectiveHolds[objective.id]

    const was = hold?.side ?? null
    if (!controller) {
      if (hold) {
        delete game.objectiveHolds[objective.id]
        changed = true
        game.battle.log.emit('objective', game.battle.turn, { objectiveId: objective.id, name: objective.name, side: null, was })
      }
      continue
    }
    if (!hold || hold.side !== controller) {
      game.objectiveHolds[objective.id] = {
        side: controller, turns: 0, sincePlayerTurn: game.playerTurn, sinceMinute: game.minutesElapsed
      }
      changed = true
      game.battle.log.emit('objective', game.battle.turn, { objectiveId: objective.id, name: objective.name, side: controller, was })
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
    isShaken: game.battle.isShaken,
    surrendered: game.surrendered,
    bargained: game.bargained,
    commanders: game.battle.commanders,
    yielded: game.battle.yielded ?? null,
    allSides: Object.keys(game.startingStrength),
    startingStrength: game.startingStrength,
    objectiveHolds: game.objectiveHolds,
    objectiveCount: game.objectives.length,
    objectiveTurnsToWin: game.spec.objectiveTurnsToWin ?? null,
    objectiveHoldMinutes: game.spec.objectiveHoldMinutes ?? OBJECTIVE_HOLD_MINUTES,
    minutesElapsed: game.minutesElapsed,
    timeLimitMinutes: game.spec.timeLimitMinutes ?? null,
    fledStrength: game.battle.fledUnits.reduce((m, u) => ({ ...m, [u.side]: (m[u.side] ?? 0) + u.strength }), {})
  }
}

// A side's orders are carried out when one of its units finished what it was
// told this tick, and none of its units is still on the way somewhere.
// Standing still and pressing the enemy (advance) never finish, so a side
// under the standing order to advance never stops the clock this way.
// How far back (battle turns) news may come from for a turn to stop on its
// arrival: a ride of over three hours is no news worth stopping for.
const NEWS_LOOKBACK = 20

// Why the turn stops, judged by what has reached each Commander on the
// field this tick; or null. A held Commander hears what his captors hear,
// as soon as they do.
function byNews(game, turnRecord, sightedBy, heard, objectiveChanges) {
  const { battle } = game
  const recent = battle.log.all().filter(e => e.turn > battle.turn - NEWS_LOOKBACK)
  const reasons = []
  for (const side of Object.keys(game.word).sort()) {
    const c = battle.commanders?.[side]
    if (c?.status === 'held') {
      reasons.push(...heldNews(game, side, turnRecord, sightedBy, recent.filter(e => e.turn === battle.turn)))
      continue
    }
    if (c?.status !== 'free') continue
    reasons.push(...newsFor(game, side, recent, heard))
  }
  if (objectiveChanges) reasons.push('objective')
  const order = ['contact', 'fire', 'sighting', 'objective', 'ready', 'rallied']
  const why = order.find(r => reasons.includes(r))
  if (why) return why
  return nothingMoved(turnRecord) ? 'stalled' : null
}

// What would stop the turn for a held Commander: what his captors hear.
function heldNews(game, side, turnRecord, sightedBy, now) {
  const captor = captorOf(game, side)
  const reasons = []
  if (turnRecord.engagements.length > 0) reasons.push('contact')
  if (turnRecord.volleys.length > 0) reasons.push('fire')
  if (captor && sightedBy[captor]?.length > 0) reasons.push('sighting')
  if (now.some(e => e.type === 'rallied')) reasons.push('rallied')
  return reasons
}

// What would stop the turn for a free Commander: news that reached him this
// tick, and his orders carried out.
function newsFor(game, side, recent, heard) {
  const { battle } = game
  const reasons = []
  const arrived = recent.filter(e => arrivalOf(game, side, e) === battle.turn)
  if (arrived.some(e => e.type === 'contact' || e.type === 'exchange')) reasons.push('contact')
  if (arrived.some(e => e.type === 'volley')) reasons.push('fire')
  if (arrived.some(e => e.type === 'rout')) reasons.push('contact')
  if (heard[side]?.sighted.length > 0) reasons.push('sighting')
  if (ordersCarriedOut(battle, { side, events: arrived })) reasons.push('ready')
  if (arrived.some(e => e.type === 'rallied')) reasons.push('rallied')
  return reasons
}

const DONE = ['arrived', 'halted', 'hidden', 'checked']
function ordersCarriedOut(battle, { side = null, events = null } = {}) {
  // (A unit arriving at one step of a longer order has not finished.)
  const done = (events ?? battle.log.forTurn(battle.turn))
    .filter(e => (DONE.includes(e.type) && !e.more) || (e.type === 'hideFailed' && e.reason === 'no cover'))
  if (done.length === 0) return false
  const doneIds = new Set(done.map(e => e.unitId))

  const working = (unit) => {
    if (doneIds.has(unit.id) || battle.broken.has(unit.id) || unit.strength <= 0) return false
    // An order still on the road to it (command/messengers.js): not done.
    if (battle.riders?.some(r => r.unitId === unit.id)) return true
    const order = battle.orderBook.get(unit.id)
    if (!order) return false
    // Going for a named enemy never finishes, as pressing the enemy does not.
    if (order.enemy) return false
    switch (order.action) {
      case 'hold': case 'advance': return false
      case 'check': return true
      case 'hide': case 'ambush': return !battle.hidden.has(unit.id)
      default: return order.target ? !samePosition(order.target, unit.position) : true
    }
  }
  const finishedSides = new Set(battle.world.units.filter(u => doneIds.has(u.id)).map(u => u.side))
  if (side) return finishedSides.has(side) && !unitsOnSide(battle.world, side).some(working)
  return [...finishedSides].some(s => !unitsOnSide(battle.world, s).some(working))
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

// Orders are logged as data, detached from whatever object the caller keeps
// editing. Orders are plain JSON (unit references, labels or positions,
// 'hold'), so a JSON round trip is an exact copy.
function copyOrders(orders) {
  return orders === undefined ? undefined : JSON.parse(JSON.stringify(orders))
}

/**
 * The whole game as plain data: the spec it started from, its seed, and every
 * submission in order. Save this and the game can be rebuilt exactly.
 * The spec must itself be data (a map named or defined, not a built map
 * object) for the record to survive JSON.
 */
function gameRecord(game) {
  return JSON.parse(JSON.stringify({
    spec: game.spec,
    seed: game.seed,
    orderLog: game.orderLog
  }))
}

/**
 * Rebuild a game from its record by playing every submission back in order.
 * Pass `upTo` to stop after that many log entries (to look at a game as it
 * stood mid-battle).
 */
function replayGame(record, { upTo = Infinity } = {}) {
  const game = createGame(record.spec, { seed: record.seed })
  record.orderLog.slice(0, upTo).forEach(entry => {
    if (entry.forced) forceProcess(game)
    else submitOrders(game, entry.side, entry.orders)
  })
  return game
}

/** What became of a side's Commander, once the game is decided (or null). */
function commanderOf(game, side) {
  return commanderFate({ commanders: game.battle.commanders, world: game.battle.world, outcome: game.outcome, bargained: game.bargained }, side)
}

module.exports = {
  createGame,
  commanderOf,
  captorOf,
  checkOffer,
  checkAnswer,
  gameRecord,
  replayGame,
  submitOrders,
  forceProcess,
  waitingOn,
  askedWhenWanted,
  sideView,
  MAX_TICKS_PER_TURN,
  MINUTES_PER_TICK
}
