// src/harness/soak.js
//
// Does every game end? Plays many hotseat games with silent commanders: each
// side gives one opening order (or none) and then leaves its units to their
// orders and standing orders. A game that has not ended after 150 player
// turns is stuck, and the run fails. (It was 60 until units stopped knowing
// where an unseen enemy stood: a side that falls back into a big wood and
// sits there now has to be searched for, which takes a long time.) The closed-loop meeting battle must also
// reach a verdict on every seed. No time limit is set, so a game ends only
// by the fighting.
//
//   npm run soak                 6 openings x 2 scenarios x 25 seeds on
//                                Crownhill, 6 openings x 2 scenarios x 5
//                                seeds on each other map, plus 50 meeting
//                                battles
//                                and the computer's side against three kinds
//                                of commander on every map, and every
//                                faction's army on every map, each against
//                                a different enemy, and again fighting for
//                                the map's own ground in a day of twelve hours,
//                                and again with the computer led by a bold and
//                                by a cautious Commander; and a short
//                                section on the big fields (2 km)
//   npm run soak -- --seeds 50

const { createSession } = require('../adapters/hotseat/session')
const { loadScenario, SCENARIOS, mapChoices } = require('../adapters/hotseat/scenarios')
const { runBattle } = require('../engine/battle/battle')
const meeting = require('./scenarios/meeting-battle')

const seedsArg = process.argv.indexOf('--seeds')
const seeds = seedsArg > -1 ? Number(process.argv[seedsArg + 1]) : 25
const MAX_PLAYER_TURNS = 150

// [red's opening, blue's opening]
const OPENINGS = [
  [['everyone advance'], ['everyone advance']],
  [['everyone hold'], ['everyone advance']],
  [['everyone advance'], ['everyone hold']],
  [['everyone fall back'], ['everyone advance']],
  [['everyone advance'], ['everyone fall back']],
  [[], []]
]

const result = { games: 0, finished: 0, playerTurns: 0, stuck: [], unread: 0 }
// The 1 km fields; the big ones have a short section of their own below.
const fields = mapChoices({ big: false }).map(m => m.id)
for (const field of fields) for (const name of Object.keys(SCENARIOS)) {
  OPENINGS.forEach((opening, o) => {
    const perMap = field === 'crownhill' ? seeds : Math.max(1, Math.round(seeds / 5))
    for (let seed = 1; seed <= perMap; seed++) {
      const session = createSession(loadScenario(name, { map: field }), { seed })
      const [red, blue] = session.sides
      let turns = 0
      while (!session.finished() && turns < MAX_PLAYER_TURNS) {
        for (const [side, lines] of [[red, opening[0]], [blue, opening[1]]]) {
          const read = session.submitLines(side, turns === 0 ? lines : [])
          if (read.status === 'clarify') { result.unread++; session.submitLines(side, []) }
        }
        turns++
      }
      result.games++
      if (session.finished()) { result.finished++; result.playerTurns += turns } else result.stuck.push(`${field} ${name} opening ${o} seed ${seed}`)
    }
  })
}

// The computer's side (opponent/planner.js) must also bring every game to
// an end: against a commander who gives no orders at all, one who orders a
// general advance and nothing more, and itself. As the web app plays it:
// armies deployed for the map, and no standing order to advance.
const { createGame, submitOrders } = require('../engine/orchestrator')
const { planTurn } = require('../opponent/planner')
const FOES = {
  'gives no orders': () => [],
  'only advances': (game) => (game.playerTurn === 0 ? [{ unitRef: 'everyone', action: 'advance' }] : []),
  itself: (game) => planTurn(game, 'red')
}
const thinking = { games: 0, finished: 0, turns: 0, stuck: [] }
for (const field of fields) for (const name of Object.keys(SCENARIOS)) for (const [foe, orders] of Object.entries(FOES)) {
  for (let seed = 1; seed <= Math.max(2, Math.round(seeds / 5)); seed++) {
    // Red has a Commander on the field, as a player in the web app does:
    // he may be taken (and then sends no orders) or killed.
    const scenario = loadScenario(name, { map: field, deploy: true })
    const commanders = { red: { unitId: scenario.units.find(u => u.side === 'red').id } }
    const game = createGame({ ...scenario, standingOrders: {}, commanders }, { seed })
    let turns = 0
    while (!game.outcome.decided && turns < MAX_PLAYER_TURNS) {
      const red = orders(game)
      const blue = planTurn(game, 'blue')
      submitOrders(game, 'red', red)
      submitOrders(game, 'blue', blue)
      turns++
    }
    thinking.games++
    if (game.outcome.decided) { thinking.finished++; thinking.turns += turns } else thinking.stuck.push(`${field} ${name} against a commander who ${foe} seed ${seed}`)
  }
}

// Faction armies (src/data/factions.js), as the web app musters them, on
// every map, red's Commander on the field with his elite unit, red played
// by the three kinds of commander above and blue by the computer. (Blue has
// no Commander, as the computer's side has none in the app: one taken would
// send no orders, and against a commander who sends none either the two
// would stand for ever.) Twenty factions make 380 pairings; playing all of
// them on every map is too long for CI, so every faction is red on every
// map against a different enemy each time (and so blue as often), and each
// battle has a seed of its own. The league (faction-league.js) plays them
// all.
const { fieldFactions, FACTIONS } = require('../engine/army/factions')
const { leadUnit } = require('../engine/command/company')
const { byCommandPost } = require('../engine/command/messengers')
const armies = { games: 0, finished: 0, turns: 0, stuck: [] }
const factionKeys = Object.keys(FACTIONS)
fields.forEach((field, m) => factionKeys.forEach((red, i) => {
  for (let round = 0; round < Math.max(1, Math.round(seeds / 25)); round++) for (const [foe, orders] of Object.entries(FOES)) {
    const blue = factionKeys[(i + 1 + (m * 5 + round * 3) % (factionKeys.length - 1)) % factionKeys.length]
    const seed = 1 + i + factionKeys.length * (m + fields.length * round)
    const spec = fieldFactions(loadScenario('meeting-battle', { map: field, deploy: true }), { red, blue })
    const rides = (side) => { const mine = spec.units.filter(u => u.side === side); return { unitId: mine[leadUnit(mine)].id } }
    const game = createGame({ ...spec, standingOrders: {}, commanders: { red: rides('red') } }, { seed })
    let turns = 0
    while (!game.outcome.decided && turns < MAX_PLAYER_TURNS) {
      const r = orders(game)
      // As in the app: red's orders and news go by rider from his
      // Commander, blue's orders from its best unit (command/messengers.js).
      const b = byCommandPost(planTurn(game, 'blue'))
      submitOrders(game, 'red', r)
      submitOrders(game, 'blue', b)
      turns++
    }
    armies.games++
    if (game.outcome.decided) { armies.finished++; armies.turns += turns } else armies.stuck.push(`${field} ${red} v ${blue}, red a commander who ${foe}, seed ${seed}`)
  }
}))

// The computer's Commanders' characters (opponent/planner.js, CHARACTERS):
// the faction armies above again, blue led by a bold and by a cautious
// Commander (the steady one is the planner of the sections above), with no
// end of the day, so that a battle ends only by the fighting.
const characters = { games: 0, finished: 0, stuck: [] }
for (const character of ['bold', 'cautious']) {
  fields.forEach((field, m) => factionKeys.forEach((red, i) => {
    for (const [foe, orders] of Object.entries(FOES)) {
      const blue = factionKeys[(i + 2 + m * 5) % factionKeys.length]
      const seed = 1 + i + factionKeys.length * m
      const spec = fieldFactions(loadScenario('meeting-battle', { map: field, deploy: true }), { red, blue })
      const mine = spec.units.filter(u => u.side === 'red')
      const sides = { ...spec.sides, blue: { ...spec.sides.blue, character } }
      const game = createGame({ ...spec, sides, standingOrders: {}, commanders: { red: { unitId: mine[leadUnit(mine)].id } } }, { seed })
      let turns = 0
      while (!game.outcome.decided && turns < MAX_PLAYER_TURNS) {
        submitOrders(game, 'red', orders(game))
        submitOrders(game, 'blue', byCommandPost(planTurn(game, 'blue')))
        turns++
      }
      characters.games++
      if (game.outcome.decided) characters.finished++
      else characters.stuck.push(`${field} ${red} v ${blue} led by a ${character} Commander, red a commander who ${foe}, seed ${seed}`)
    }
  }))
}

// Armies a player bought (src/harness/bought-league.js: all cheap, all
// slingers, veterans, all horse), each against its own faction's usual
// army and another's, on every map: the same faction on both sides is
// allowed (ruled 2026-11-23).
const { boughtArmies, playBought } = require('./bought-league')
const bought = { games: 0, finished: 0, stuck: [] }
for (const field of fields) for (const [i, key] of Object.keys(FACTIONS).entries()) {
  const keys = Object.keys(FACTIONS)
  for (const [kind, units] of Object.entries(boughtArmies(key))) for (const enemy of [key, keys[(i + 1) % keys.length]]) {
    const r = playBought(key, units, enemy, { map: field, seed: bought.games + 1 })
    bought.games++
    if (r.decided) bought.finished++
    else bought.stuck.push(`${field} ${key} ${kind} v ${enemy}`)
  }
}

// The app's battles fight for each map's own ground (src/data/maps,
// `ground`) in a day of twelve hours: every faction's army on every map, as
// above, red played by the three kinds of commander. Every one must end; and
// how many the ground decided, and how long they ran, are told.
const { groundOf } = require('../data/maps')
const T = require('../engine/combat/tables')
const { waitingOn } = require('../engine/orchestrator')
const ground = { games: 0, finished: 0, minutes: 0, byGround: 0, night: 0, stuck: [] }
fields.forEach((field, m) => factionKeys.forEach((red, i) => {
  for (const [foe, orders] of Object.entries(FOES)) {
    const blue = factionKeys[(i + 3 + m * 5) % factionKeys.length]
    const seed = 1 + i + factionKeys.length * m
    const spec = fieldFactions(loadScenario('meeting-battle', { map: field, deploy: true }), { red, blue })
    const mine = spec.units.filter(u => u.side === 'red')
    const game = createGame({ ...spec, standingOrders: {}, dayMinutes: T.DAY.MINUTES, objectives: groundOf(field), commanders: { red: { unitId: mine[leadUnit(mine)].id } } }, { seed })
    let turns = 0
    while (!game.outcome.decided && turns < 4 * MAX_PLAYER_TURNS) {
      if (waitingOn(game).includes('red')) submitOrders(game, 'red', orders(game))
      if (!game.outcome.decided && waitingOn(game).includes('blue')) submitOrders(game, 'blue', byCommandPost(planTurn(game, 'blue')))
      turns++
    }
    ground.games++
    if (!game.outcome.decided) { ground.stuck.push(`${field} ${red} v ${blue}, red a commander who ${foe}, seed ${seed}`); continue }
    ground.finished++
    ground.minutes += game.minutesElapsed
    if (game.outcome.reason === 'objectives held') ground.byGround++
    if (game.outcome.reason === 'night fell') ground.night++
  }
}))

// The big fields (2 km, src/data/maps; mapChoices with big): half the
// factions' armies, each with its second line (engine/army/secondLine.js),
// fighting for the map's ground in a day of twelve hours, red a Commander
// on the field played by the three kinds of commander, blue the computer;
// and the hotseat's two scenarios with every opening once. Every one must
// end.
const { withSecondLine } = require('../engine/army/secondLine')
const bigFields = mapChoices().filter(m => !fields.includes(m.id)).map(m => m.id)
const big = { games: 0, finished: 0, minutes: 0, byGround: 0, night: 0, stuck: [] }
bigFields.forEach((field, m) => factionKeys.forEach((red, i) => {
  if (i % 2) return
  for (const [foe, orders] of Object.entries(FOES)) {
    const blue = factionKeys[(i + 5 + m * 3) % factionKeys.length]
    const seed = 7 + i + factionKeys.length * m
    const spec = withSecondLine(fieldFactions(loadScenario('meeting-battle', { map: field, deploy: true }), { red, blue }), { red, blue })
    const mine = spec.units.filter(u => u.side === 'red')
    const game = createGame({ ...spec, standingOrders: {}, dayMinutes: T.DAY.MINUTES, objectives: groundOf(field), commanders: { red: { unitId: mine[leadUnit(mine)].id } } }, { seed })
    let turns = 0
    while (!game.outcome.decided && turns < 4 * MAX_PLAYER_TURNS) {
      if (waitingOn(game).includes('red')) submitOrders(game, 'red', orders(game))
      if (!game.outcome.decided && waitingOn(game).includes('blue')) submitOrders(game, 'blue', byCommandPost(planTurn(game, 'blue')))
      turns++
    }
    big.games++
    if (!game.outcome.decided) { big.stuck.push(`${field} ${red} v ${blue}, red a commander who ${foe}, seed ${seed}`); continue }
    big.finished++
    big.minutes += game.minutesElapsed
    if (game.outcome.reason === 'objectives held') big.byGround++
    if (game.outcome.reason === 'night fell') big.night++
  }
}))
const bigHotseat = { games: 0, finished: 0, stuck: [] }
for (const field of bigFields) for (const name of Object.keys(SCENARIOS)) {
  OPENINGS.forEach((opening, o) => {
    const session = createSession(loadScenario(name, { map: field }), { seed: 1 + o })
    const [red, blue] = session.sides
    let turns = 0
    while (!session.finished() && turns < MAX_PLAYER_TURNS) {
      for (const [side, lines] of [[red, opening[0]], [blue, opening[1]]]) {
        const read = session.submitLines(side, turns === 0 ? lines : [])
        if (read.status === 'clarify') session.submitLines(side, [])
      }
      turns++
    }
    bigHotseat.games++
    if (session.finished()) bigHotseat.finished++
    else bigHotseat.stuck.push(`${field} ${name} opening ${o}`)
  })
}

let decided = 0
let meetingTurns = 0
for (let seed = 1; seed <= 50; seed++) {
  const record = runBattle(meeting, { seed })
  if (record.outcome.decided) { decided++; meetingTurns += record.turns.length }
}

console.log(`hotseat games: ${result.finished} of ${result.games} finished, ` +
  `${(result.playerTurns / Math.max(1, result.finished)).toFixed(1)} player turns on average`)
if (result.unread) console.log(`  ${result.unread} opening orders were not understood`)
for (const stuck of result.stuck.slice(0, 10)) console.log(`  stuck: ${stuck}`)
console.log(`the computer's side: ${thinking.finished} of ${thinking.games} finished, ` +
  `${(thinking.turns / Math.max(1, thinking.finished)).toFixed(1)} player turns on average`)
for (const stuck of thinking.stuck.slice(0, 10)) console.log(`  stuck: ${stuck}`)
console.log(`faction armies: ${armies.finished} of ${armies.games} finished, ` +
  `${(armies.turns / Math.max(1, armies.finished)).toFixed(1)} player turns on average`)
for (const stuck of armies.stuck.slice(0, 10)) console.log(`  stuck: ${stuck}`)
console.log(`the computer led by a bold or a cautious Commander: ${characters.finished} of ${characters.games} finished`)
for (const stuck of characters.stuck.slice(0, 10)) console.log(`  stuck: ${stuck}`)
console.log(`bought armies: ${bought.finished} of ${bought.games} finished`)
for (const stuck of bought.stuck.slice(0, 10)) console.log(`  stuck: ${stuck}`)
console.log(`the map's ground: ${ground.finished} of ${ground.games} finished, ${ground.byGround} decided by the ground, ` +
  `${ground.night} ended by night, ${Math.round(ground.minutes / Math.max(1, ground.finished))} battle minutes on average`)
for (const stuck of ground.stuck.slice(0, 10)) console.log(`  stuck: ${stuck}`)
console.log(`the big fields (${bigFields.join(', ')}): ${big.finished} of ${big.games} finished, ${big.byGround} decided by the ground, ` +
  `${big.night} ended by night, ${Math.round(big.minutes / Math.max(1, big.finished))} battle minutes on average; hotseat ${bigHotseat.finished} of ${bigHotseat.games}`)
for (const stuck of [...big.stuck, ...bigHotseat.stuck].slice(0, 10)) console.log(`  stuck: ${stuck}`)
console.log(`meeting battle: a verdict in ${decided} of 50, ` +
  `${(meetingTurns / Math.max(1, decided)).toFixed(1)} battle turns on average`)

if (result.stuck.length > 0 || thinking.stuck.length > 0 || armies.stuck.length > 0 || characters.stuck.length > 0 || bought.stuck.length > 0 || ground.stuck.length > 0 || big.stuck.length > 0 || bigHotseat.stuck.length > 0 || decided < 50 || result.unread > 0) process.exitCode = 1
