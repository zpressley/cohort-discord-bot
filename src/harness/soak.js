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
//                                of commander on every map
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
const fields = mapChoices().map(m => m.id)
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
    const game = createGame({ ...loadScenario(name, { map: field, deploy: true }), standingOrders: {} }, { seed })
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
console.log(`meeting battle: a verdict in ${decided} of 50, ` +
  `${(meetingTurns / Math.max(1, decided)).toFixed(1)} battle turns on average`)

if (result.stuck.length > 0 || thinking.stuck.length > 0 || decided < 50 || result.unread > 0) process.exitCode = 1
