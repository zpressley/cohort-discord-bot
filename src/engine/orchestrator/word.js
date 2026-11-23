// src/engine/orchestrator/word.js
//
// What a Commander on the field knows, and when he knows it
// (docs/design/point-of-view-and-messengers.md, step 2: news by rider).
// "The player knows what his Commander knows, when his Commander knows it."
//
// Every ten minutes each unit of his sends word: how it stands (where, how
// many, its heart and wind, its order) and every enemy it can see. Word from
// a unit within his immediate range reaches him at once; from beyond it a
// rider carries it back, by the same way and at the same pace as an order
// goes out (command/messengers.js). Word from a unit no rider can get
// through to does not come at all: the unit is cut off, and he knows it only
// as it was when he last heard.
//
// The ledger, game.word[side]:
//   units     unitId -> the last report of it to reach him, with `heard`
//             (the battle turn the report left the unit), `live` (heard
//             this very tick: in his immediate range), `cutOff`, and
//             `gone` ('destroyed' | 'fled') once word of that has come
//   enemies   enemyId -> as fogOfWar's intel: where and when it was seen,
//             by him or in a report that has reached him; `status` is
//             'visible' only for what he or the units about him see now
//   road      reports on their way: { unitId, sent, arrives, report, sees }
//   sent      unitId -> [[sent, arrives]]: when each report left and
//             reached him (Infinity: it never will), for telling when a
//             piece of news reached him (arrivalOf)
//   saw       unitId -> { turn: [enemy ids] }: whom each unit could see,
//             tick by tick, so that news of an enemy alone reaches him with
//             the report of a unit that saw it
//   since     the battle turn from which his own riders bring him news (he
//             was freed then; while held he hears his captors instead)
//
// Everything here is rebuilt by playing a battle back: it is filled in by
// the orchestrator after every tick, from the battle's own state.
//
// A held Commander's ledger stands still: no rider reaches him, and what he
// hears is his captors' (web/battles.js). Free again, he learns what he
// brings out of their camp (learnFromCaptivity, as his side's intel does).

const { canSee } = require('../map/sight')
const { riders, orderDelays } = require('../command/messengers')
const { COMMAND } = require('../combat/tables')

const copy = (x) => (x === undefined || x === null ? null : JSON.parse(JSON.stringify(x)))

// How a unit stands, as its report says.
function reportOf(battle, unit) {
  const state = battle.resolver.getState(unit.id)
  return {
    position: { ...unit.position },
    strength: unit.strength,
    maxStrength: unit.maxStrength,
    morale: state ? Math.round(state.morale) : null,
    stamina: state ? Math.round(state.stamina) : null,
    broken: battle.broken.has(unit.id),
    hidden: battle.hidden.has(unit.id),
    crowding: battle.crowding.get(unit.id) ?? 'organized',
    rallied: battle.rallied?.has(unit.id) ?? false,
    order: copy(battle.orderBook.get(unit.id))
  }
}

// An enemy as the one who saw it could tell.
const sighting = (enemy, turn) => ({
  position: { ...enemy.position },
  strength: enemy.strength,
  seenOnTurn: turn,
  role: enemy.role ?? null,
  mounted: Boolean(enemy.mounted),
  primaryWeapon: enemy.primaryWeapon ?? null
})

/** A Commander's ledger at the start of a battle: he formed his army up himself. */
function createWord(game, side) {
  const { battle } = game
  const word = { units: {}, enemies: {}, road: [], sent: {}, saw: {}, since: 0 }
  for (const unit of battle.world.units.filter(u => u.side === side)) {
    word.units[unit.id] = { ...reportOf(battle, unit), heard: 0, live: true, cutOff: false, gone: null }
  }
  // What his side saw of the enemy as it formed up.
  for (const [id, e] of Object.entries(game.intel[side]?.known ?? {})) word.enemies[id] = { ...copy(e) }
  return word
}

/**
 * The tick has run: each of his units sends word, and what has reached him
 * by now is his. Returns what is new to him this tick, for the turn's stops:
 * { sighted: [enemy ids newly in sight or newly reported] }.
 */
function updateWord(game, side) {
  const { battle } = game
  const word = game.word[side]
  const turn = battle.turn
  const c = battle.commanders?.[side]
  const free = c?.status === 'free'
  const road = free ? riders(battle, side) : null
  const sighted = []
  const toldCutOff = Boolean(game.spec.everyoneAsked)

  const theirs = battle.world.units.filter(u => u.side !== side && u.strength > 0)
  const seesNow = (unit) => theirs.filter(e => {
    const options = battle.hidden.has(e.id) ? { seenWithin: battle.hidden.get(e.id).seenWithin } : {}
    return canSee(battle.map, unit, e, options)
  })

  // Each unit of his sends word: those still on the field, and once more
  // those that left it this tick (destroyed, or fled).
  const leftNow = new Set(battle.log.forTurn(turn).filter(e => e.type === 'destroyed' || e.type === 'fled').map(e => e.unitId))
  const senders = [
    ...battle.world.units.filter(u => u.side === side && (u.strength > 0 || leftNow.has(u.id))),
    ...battle.fledUnits.filter(u => u.side === side && leftNow.has(u.id))
  ]
  for (const unit of senders) {
    const gone = unit.strength <= 0 ? 'destroyed' : battle.fledUnits.includes(unit) ? 'fled' : null
    const sees = gone ? [] : seesNow(unit)
    ;(word.saw[unit.id] ??= {})[turn] = sees.map(e => e.id)
    const ticks = road ? road.ticks(unit) : Infinity
    const arrives = ticks === Infinity ? Infinity : turn + ticks
    ;(word.sent[unit.id] ??= []).push([turn, arrives])
    // Cut off, or in touch again: in a battle saved before the riders
    // rulings he knew at once when his riders could not get through (an
    // event only his side heard of). Since, he notices only when no word
    // comes (ruled 2026-11-23: "Notice when no word comes back"): see
    // overdue, below.
    const known = word.units[unit.id]
    if (toldCutOff && free && known && !gone && !known.gone && known.cutOff !== (ticks === Infinity)) {
      known.cutOff = ticks === Infinity
      battle.log.emit(known.cutOff ? 'cutOff' : 'inTouch', turn, { side, unitId: unit.id })
    }
    if (arrives === Infinity) continue
    word.road.push({
      unitId: unit.id, sent: turn, arrives, live: ticks === 0,
      report: { ...reportOf(battle, unit), gone },
      sees: sees.map(e => ({ id: e.id, ...sighting(e, turn) }))
    })
  }

  // What has reached him by now, oldest first.
  if (free) {
    const due = word.road.filter(r => r.arrives <= turn).sort((a, b) => a.sent - b.sent || a.unitId.localeCompare(b.unitId))
    word.road = word.road.filter(r => r.arrives > turn)
    const before = new Map(Object.entries(word.enemies).map(([id, e]) => [id, e.status]))
    for (const r of due) {
      const known = word.units[r.unitId]
      if (!known || r.sent >= known.heard) {
        // Word from a unit he had given up hearing from: it has come again.
        if (known?.overdue) (word.back ??= []).push({ unitId: r.unitId, turn })
        word.units[r.unitId] = { ...r.report, heard: r.sent, live: r.live && r.sent === turn, cutOff: known?.cutOff ?? false, ...(toldCutOff ? {} : { overdue: false }) }
      }
      for (const { id, ...seen } of r.sees) {
        if ((word.enemies[id]?.seenOnTurn ?? -1) > seen.seenOnTurn) continue
        const now = r.live && seen.seenOnTurn === turn
        word.enemies[id] = { status: now ? 'visible' : 'ghost', ...seen }
      }
    }
    // A sighting is an enemy he had no word of, or one come into his own
    // sight again.
    for (const [id, e] of Object.entries(word.enemies)) {
      const was = before.get(id)
      if (was === undefined || (e.status === 'visible' && was !== 'visible')) sighted.push(id)
    }
    // What he and those about him no longer see goes stale where it was.
    for (const e of Object.values(word.enemies)) {
      if (e.status === 'visible' && e.seenOnTurn < turn) e.status = 'ghost'
    }
    for (const u of Object.values(word.units)) if (u.heard < turn) u.live = false
    if (!toldCutOff) overdue(game, side)
  }
  return { sighted: [...new Set(sighted)].sort() }
}

// Which of his units he has had no word of for longer than he should
// (ruled 2026-11-23: "Notice when no word comes back. The lost legions in
// the tuetoberg forest"). Each sends word every ten minutes, so the last to
// reach him should be no older than a rider's ride from where the unit last
// was, plus COMMAND.OVERDUE of slack. Judged from his ledger alone: where
// he last heard each unit was, the enemy he knows of, and where he is
// himself. So a unit cut off, one destroyed out of his sight and one far
// off on bad ground look alike to him, until word comes or does not.
function overdue(game, side) {
  const word = game.word[side]
  const turn = game.battle.turn
  const ids = Object.keys(word.units).filter(id => !word.units[id].gone)
  const delays = orderDelays(game.battle, side, ids, { word }) ?? {}
  for (const id of ids) {
    const u = word.units[id]
    const minutes = delays[id]
    const ride = minutes === undefined || minutes === Infinity ? 1 : Math.max(1, minutes / 10)
    u.overdue = turn - u.heard > ride + COMMAND.OVERDUE
  }
}

/** What a freed Commander brings out of his captors' camp: where each enemy stood. */
function wordFromCaptivity(game, side) {
  const word = game.word[side]
  const { battle } = game
  word.since = battle.turn
  for (const enemy of battle.world.units.filter(u => u.side !== side && u.strength > 0)) {
    if (word.enemies[enemy.id]?.status === 'visible') continue
    word.enemies[enemy.id] = { status: 'ghost', ...sighting(enemy, battle.turn) }
  }
}

// When the news a unit sent at a battle turn reached him: with the first
// report it sent from then on that has reached him (or will). Infinity:
// it never will.
function heardAt(word, unitId, turn) {
  let best = Infinity
  for (const [sent, arrives] of word.sent[unitId] ?? []) {
    if (sent >= turn && arrives < best) best = arrives
  }
  return best
}

// The units an event is about (as the narrator reads them).
const involved = (e) => [e.unitId, e.aId, e.bId, e.by, e.a?.unitId, e.b?.unitId].filter(Boolean)

/**
 * When a piece of news reached a side's Commander: the battle turn, or
 * Infinity if it never did. The battle's end, ground changing hands and
 * what befell him himself he knows at once; news of one of his units comes
 * with its report; news of the enemy alone, with the report of a unit of
 * his that could see every enemy in it.
 */
function arrivalOf(game, side, event) {
  const word = game.word?.[side]
  if (!word) return event.turn
  if (event.type === 'victory' || event.type === 'objective' || event.type === 'officerYielded') return event.turn
  if (event.side === side && event.type.startsWith('commander')) return event.turn
  if ((event.type.startsWith('rider') || event.type === 'cutOff' || event.type === 'inTouch') && event.side === side) return event.turn
  if (event.turn < word.since) return Infinity
  const mine = (id) => Boolean(word.units[id])
  const ids = involved(event)
  const own = ids.filter(mine)
  if (own.length > 0) return Math.min(...own.map(id => heardAt(word, id, event.turn)))
  if (ids.length === 0) return Infinity
  let best = Infinity
  for (const [unitId, saw] of Object.entries(word.saw)) {
    const seen = saw[event.turn]
    if (seen && ids.every(id => seen.includes(id))) best = Math.min(best, heardAt(word, unitId, event.turn))
  }
  return best
}

/**
 * The news that reached a side's Commander in battle turns (from, to]:
 * [{ event, arrived }], in the order the events happened.
 */
function newsBetween(game, side, from, to) {
  const out = []
  for (const event of game.battle.log.all()) {
    if (event.turn > to) break
    const arrived = arrivalOf(game, side, event)
    if (arrived > from && arrived <= to) out.push({ event, arrived })
  }
  return out
}

/** The enemy as a Commander knows of it, in fogOfWar's intel form. */
function knownEnemies(word) {
  return Object.entries(word.enemies).map(([id, e]) => ({ id, ...e })).sort((a, b) => a.id.localeCompare(b.id))
}

module.exports = { knownEnemies, createWord, updateWord, wordFromCaptivity, arrivalOf, newsBetween, reportOf }
