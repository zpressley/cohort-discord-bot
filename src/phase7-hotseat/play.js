#!/usr/bin/env node
// src/phase7-hotseat/play.js
//
// Play Cohort at one keyboard — the stand-in for the old testing ritual of
// two Discord accounts talking to each other.
//
//   npm run play                                  meeting-battle, hotseat
//   npm run play -- legions-vs-celts              the builder-made armies
//   npm run play -- meeting-battle --auto blue    solo: blue runs itself
//   npm run play -- meeting-battle --seed 7       a different battle
//   npm run play -- meeting-battle --full-map     the whole 40x40
//
// At the prompt, one order per line:
//   spears to K7        everyone to the bridge      the archers hold
//   hold                surrender                   done   (ends your orders)
//   map                 shows your briefing again   quit   (abandons the game)
//
// Units you give no orders keep pressing the nearest enemy (standing
// orders); `hold` countermands that on purpose.

const readline = require('node:readline')
const { createSession } = require('./session')
const { loadScenario, SCENARIOS } = require('./scenarios')
const { renderHandoff } = require('./render')

function parseArgs(argv) {
  const args = { scenario: 'meeting-battle', seed: undefined, auto: null, fullMap: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--seed') args.seed = Number(argv[++i])
    else if (arg === '--auto') args.auto = argv[++i]
    else if (arg === '--full-map') args.fullMap = true
    else if (!arg.startsWith('--')) args.scenario = arg
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const spec = loadScenario(args.scenario)
  if (!spec) {
    console.log(`Unknown scenario "${args.scenario}". Available: ${Object.keys(SCENARIOS).join(', ')}`)
    process.exitCode = 1
    return
  }

  const session = createSession(spec, {
    seed: args.seed, auto: args.auto, fullMap: args.fullMap
  })

  // Not rl.question: with piped input (the smoke tests, or a scripted game)
  // lines can arrive while no question is pending, and readline drops them on
  // the floor; EOF then leaves the next question hanging forever. A manual
  // line queue loses nothing, and EOF comes back as null — treated as quit.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const pending = []
  const waiters = []
  let stdinClosed = false
  rl.on('line', (line) => {
    const waiter = waiters.shift()
    if (waiter) waiter(line)
    else pending.push(line)
  })
  rl.on('close', () => {
    stdinClosed = true
    while (waiters.length) waiters.shift()(null)
  })
  const ask = (prompt) => {
    process.stdout.write(prompt)
    if (pending.length > 0) return Promise.resolve(pending.shift())
    if (stdinClosed) return Promise.resolve(null)
    return new Promise(resolve => waiters.push(resolve))
  }

  console.log(`\n═══ COHORT — ${spec.name} ═══`)
  console.log(session.humanSides().length === 2
    ? 'Two commanders, one keyboard. The curtain drops between turns.\n'
    : `You command ${session.humanSides()[0]}; ${args.auto} fights itself.\n`)
  console.log('Orders: "spears to K7", "everyone to the bridge", "hold", then "done".')
  console.log('Also: map · surrender · quit\n')

  while (!session.finished()) {
    let report = null

    for (const side of session.humanSides()) {
      if (session.humanSides().length === 2) {
        console.log(renderHandoff(side))
        if (await ask('') === null) { rl.close(); return }
      }

      console.log('\n' + session.briefing(side) + '\n')

      // Collect this side's order block, re-prompting on questions.
      let submitted = false
      while (!submitted) {
        const lines = []
        let raw
        while ((raw = await ask(`${side}> `)) !== null) {
          const line = raw.trim().toLowerCase()
          if (line === 'done') break
          if (line === 'quit') { console.log('Battle abandoned.'); rl.close(); return }
          if (line === 'map') { console.log('\n' + session.briefing(side) + '\n'); continue }
          if (line) lines.push(line)
        }
        if (raw === null && lines.length === 0) {
          console.log('\n(input ended — battle abandoned)')
          rl.close()
          return
        }

        const result = session.submitLines(side, lines)
        if (result.status === 'clarify') {
          for (const question of result.questions) console.log('  ' + question)
          console.log('  (orders not sent — give the block again)')
          continue
        }
        submitted = true
        if (result.report) report = result.report
      }

      if (session.finished()) break
    }

    if (report) console.log('\n' + report + '\n')
  }

  console.log('\n' + session.finalSummary() + '\n')
  rl.close()
}

main()
