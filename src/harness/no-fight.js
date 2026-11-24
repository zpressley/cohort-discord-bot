// src/harness/no-fight.js
//
// Battles that come to nothing: two armies that never come to grips, or
// stop fighting and stand for hours. Plays many battles as the app musters
// them (the map's ground to fight for, the twelve-hour day, the computer's
// Commander with a character, its orders by rider from its best unit) and
// counts:
//   nothing   ended by night or by the turn limit with each side having
//             lost under a tenth of its men (NOTHING_LOST): no fight worth
//             the name
//   night     ended by night or the turn limit at all
//   quiet     a stretch of two hours or more (QUIET_MINUTES) in which no
//             unit closed on the enemy (the two armies nearer than they had
//             ever been), shot, came to blows or took ground
// by map, by the computer's character and by kind of army.
//
// Red is played four ways (--red):
//   computer  the computer, with no Commander on the field, a character
//             of its own (every pairing of the three comes up): two
//             armies led by the computer's planner
//   planner   the player's stand-in of the leagues: his Commander on the
//             field, orders by rider, planning as the computer does
//   charge    sends everyone in, every turn
//   idle      gives no orders at all: night ends his battle, but the
//             computer should still come for him or for the ground
// Armies: each faction's usual army against another's, and a bought army
// (harness/bought-league.js: cheap, slingers, veterans, horse) against a
// faction's usual one. The big field brings each side's second line.
//
//   node src/harness/no-fight.js                    every map, red computer
//   node src/harness/no-fight.js --red idle --map ashford
//   --none        no ground to fight for (a battle where the player named
//                 none)
//   --noday       no day either: the battle ends only by the fighting or at
//                 150 player turns (as the whole-battle fingerprint tests
//                 play them, both sides the computer, asked every turn)
//   --rounds N    seeds per faction (default 1)
//   --list N      print the N worst battles (default 8)

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback }
const { createGame, submitOrders, waitingOn } = require('../engine/orchestrator')
const { planTurn, CHARACTER_NAMES } = require('../opponent/planner')
const { withCommander } = require('../opponent/commander')
const { loadScenario, mapChoices } = require('../adapters/hotseat/scenarios')
const { fieldFactions, FACTIONS } = require('../engine/army/factions')
const { fieldArmies } = require('../engine/army/standard')
const { withSecondLine } = require('../engine/army/secondLine')
const { leadUnit } = require('../engine/command/company')
const { byCommandPost } = require('../engine/command/messengers')
const { tileDistance } = require('../engine/world')
const { groundOf } = require('../data/maps')
const { boughtArmies } = require('./bought-league')
const T = require('../engine/combat/tables')

const NOTHING_LOST = 0.1
const QUIET_MINUTES = 120
const MAX_TURNS = 150
// Events that are a fight: blows, shooting, ground changing hands, a rout.
const FIGHT = new Set(['contact', 'volley', 'thrown', 'objective', 'rout', 'destroyed', 'pursuit', 'crush', 'push'])

/**
 * One battle.
 * @param {Object} o  { map, red, blue (faction keys), bought (units or null),
 *   redPlays ('computer'|'planner'|'charge'|'idle'), character (blue's),
 *   redCharacter (red's, when the computer), seed, none (no ground), noDay }
 */
function play({ map, red, blue, bought = null, redPlays = 'computer', character, redCharacter = null, seed, none = false, noDay = false }) {
  let spec = bought
    ? fieldArmies(loadScenario('meeting-battle', { map, deploy: true }), { red: { faction: red, units: bought }, blue: { faction: blue, units: null } })
    : fieldFactions(loadScenario('meeting-battle', { map, deploy: true }), { red, blue })
  spec = withSecondLine(spec, { red, blue })
  spec = withCommander(spec, 'blue', seed, { character })
  if (redPlays === 'computer' && redCharacter) spec = withCommander(spec, 'red', seed + 1, { character: redCharacter })
  const objectives = none ? [] : groundOf(map)
  const mine = spec.units.filter(u => u.side === 'red')
  spec = {
    ...spec,
    standingOrders: {},
    ...(noDay ? {} : { dayMinutes: T.DAY.MINUTES }),
    ...(objectives.length ? { objectives } : {}),
    ...(redPlays !== 'computer' ? { commanders: { red: { unitId: mine[leadUnit(mine)].id } } } : {})
  }
  const game = createGame(spec, { seed })
  const start = game.battle.world.units.map(u => ({ id: u.id, side: u.side, position: { ...u.position } }))
  const men = (side, units) => units.filter(u => u.side === side).reduce((n, u) => n + Math.max(0, u.strength), 0)
  const startMen = { red: men('red', game.battle.world.units), blue: men('blue', game.battle.world.units) }

  const redOrders = () => {
    if (redPlays === 'idle') return []
    if (redPlays === 'charge') return game.battle.world.units.filter(u => u.side === 'red' && u.strength > 0).map(u => ({ unitRef: u.id, action: 'advance' }))
    return planTurn(game, 'red')
  }
  let turns = 0
  let stops = 0
  while (!game.outcome.decided && turns < MAX_TURNS && stops < 4 * MAX_TURNS) {
    stops++
    let redAsked = false
    for (const side of ['red', 'blue']) {
      if (game.outcome.decided || !waitingOn(game).includes(side)) continue
      if (side === 'red') { submitOrders(game, 'red', redOrders()); redAsked = true } else submitOrders(game, 'blue', redPlays === 'computer' && noDay ? planTurn(game, 'blue') : byCommandPost(planTurn(game, 'blue')))
    }
    if (redAsked) turns++
  }
  const o = game.outcome
  const all = [...game.battle.world.units, ...game.battle.fledUnits]
  const lost = { red: 1 - men('red', all) / startMen.red, blue: 1 - men('blue', all) / startMen.blue }
  const events = game.battle.log.all()
  const night = !o.decided || o.reason === 'night fell'
  const quiet = quietest(start, events, game.battle.turn)
  const contact = events.find(e => e.type === 'contact')
  const firstShot = events.find(e => e.type === 'volley' || e.type === 'contact')
  return {
    decided: o.decided,
    winner: o.winner === 'red' || o.winner === 'blue' ? o.winner : null,
    reason: o.decided ? o.reason : 'turn limit',
    minutes: game.minutesElapsed,
    lost,
    night,
    nothing: night && lost.red < NOTHING_LOST && lost.blue < NOTHING_LOST,
    quiet,
    contactAt: contact ? contact.turn * 10 : null,
    firstBlowAt: firstShot ? firstShot.turn * 10 : null
  }
}

// The longest stretch (minutes) in which nothing closed, shot, fought or
// took ground, from the battle's event log: a tick is busy when a fight
// event falls in it or when the nearest two enemy units are nearer than
// they have been all battle (positions replayed from the move events).
function quietest(start, events, lastTurn) {
  const at = new Map(start.map(u => [u.id, { ...u }]))
  const busy = new Set()
  const byTurn = new Map()
  for (const e of events) {
    if (!byTurn.has(e.turn)) byTurn.set(e.turn, [])
    byTurn.get(e.turn).push(e)
  }
  let closest = Infinity
  for (let turn = 1; turn <= lastTurn; turn++) {
    for (const e of byTurn.get(turn) ?? []) {
      if (FIGHT.has(e.type)) busy.add(turn)
      if (e.type === 'move' && at.has(e.unitId)) at.get(e.unitId).position = { ...e.to }
      if ((e.type === 'destroyed' || e.type === 'fled') && at.has(e.unitId)) at.delete(e.unitId)
    }
    const units = [...at.values()]
    let gap = Infinity
    for (const a of units) if (a.side === 'red') for (const b of units) if (b.side !== 'red') gap = Math.min(gap, tileDistance(a.position, b.position))
    if (gap < closest) { closest = gap; busy.add(turn) }
  }
  let longest = 0
  let last = 0
  for (let turn = 1; turn <= lastTurn; turn++) {
    if (busy.has(turn)) { longest = Math.max(longest, turn - last - 1); last = turn }
  }
  longest = Math.max(longest, lastTurn - last)
  return longest * 10
}

/** Every battle of the study, as { map, red, blue, bought, kind, character, redCharacter, seed }. */
function battles({ maps, rounds = 1, redPlays = 'computer' }) {
  const keys = Object.keys(FACTIONS)
  const out = []
  maps.forEach((map, m) => {
    CHARACTER_NAMES.forEach((character, c) => {
      for (let round = 0; round < rounds; round++) {
        keys.forEach((red, i) => {
          const seed = 1 + i + keys.length * (c + 3 * (m + maps.length * round))
          // Another faction each time (never its own).
          const blue = keys[(i + 1 + (c * 3 + m * 5 + round * 7) % (keys.length - 1)) % keys.length]
          const redCharacter = redPlays === 'computer' ? CHARACTER_NAMES[(i + round) % 3] : null
          out.push({ map, red, blue, bought: null, kind: 'usual', character, redCharacter, seed })
          const kinds = Object.entries(boughtArmies(red)).filter(([k]) => k !== 'usual')
          if (kinds.length === 0) return
          const [kind, units] = kinds[(i + c + round) % kinds.length]
          out.push({ map, red, blue, bought: units, kind, character, redCharacter, seed: seed + 100000 })
        })
      }
    })
  })
  return out
}

function study({ maps, rounds = 1, redPlays = 'computer', none = false, noDay = false }) {
  const rows = []
  for (const b of battles({ maps, rounds, redPlays })) rows.push({ ...b, ...play({ ...b, redPlays, none, noDay }) })
  return rows
}

function table(rows, key, label) {
  const groups = new Map()
  for (const r of rows) {
    const k = key(r)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  const pct = (n, d) => `${Math.round(100 * n / Math.max(1, d))}%`
  const lines = [`| ${label} | battles | nothing | night or limit | 2 h quiet | minutes | first blow |`, '|---|---|---|---|---|---|---|']
  for (const [k, g] of groups) {
    const blows = g.filter(r => r.firstBlowAt !== null)
    lines.push(`| ${k} | ${g.length} | ${g.filter(r => r.nothing).length} (${pct(g.filter(r => r.nothing).length, g.length)}) | ${g.filter(r => r.night).length} (${pct(g.filter(r => r.night).length, g.length)}) | ` +
      `${g.filter(r => r.quiet >= QUIET_MINUTES).length} (${pct(g.filter(r => r.quiet >= QUIET_MINUTES).length, g.length)}) | ${Math.round(g.reduce((n, r) => n + r.minutes, 0) / g.length)} | ` +
      `${blows.length ? Math.round(blows.reduce((n, r) => n + r.firstBlowAt, 0) / blows.length) : '-'} |`)
  }
  return lines.join('\n')
}

if (require.main === module) {
  const only = arg('--map', null)
  const maps = only ? only.split(',') : mapChoices().map(m => m.id)
  const redPlays = arg('--red', 'computer')
  const none = process.argv.includes('--none')
  const noDay = process.argv.includes('--noday')
  const started = Date.now()
  const rows = study({ maps, rounds: Number(arg('--rounds', 1)), redPlays, none, noDay })
  console.log(`${rows.length} battles, red ${redPlays}, ${none ? 'no ground' : 'the ground'}, ${noDay ? 'no day' : 'the day'}; ${((Date.now() - started) / 1000).toFixed(0)} s\n`)
  console.log(table(rows, () => 'all', 'All') + '\n')
  console.log(table(rows, r => r.map, 'Map') + '\n')
  console.log(table(rows, r => r.character, "Computer's character") + '\n')
  if (redPlays === 'computer') console.log(table(rows, r => `${r.redCharacter} v ${r.character}`, 'West v east') + '\n')
  console.log(table(rows, r => r.kind, "West's army") + '\n')
  const worst = [...rows].sort((a, b) => Number(b.nothing) - Number(a.nothing) || b.quiet - a.quiet).slice(0, Number(arg('--list', 8)))
  for (const r of worst) {
    console.log(`  ${r.map} ${r.red}${r.bought ? ` (${r.kind})` : ''} v ${r.blue}, ${r.redCharacter ? `${r.redCharacter} v ` : ''}${r.character}, seed ${r.seed}: ${r.reason}, ${r.minutes} min, ` +
      `lost ${Math.round(100 * r.lost.red)}% / ${Math.round(100 * r.lost.blue)}%, quiet ${r.quiet} min, first blow ${r.firstBlowAt ?? 'never'}`)
  }
}

module.exports = { play, study, battles, quietest, NOTHING_LOST, QUIET_MINUTES }
