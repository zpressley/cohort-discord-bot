#!/usr/bin/env node
// src/phase2-combat/run.js
// Drive a scenario from the terminal. No Discord, no bot token, no database.
//
//   node src/phase2-combat/run.js                          list scenarios
//   node src/phase2-combat/run.js hill-assault             movement only
//   node src/phase2-combat/run.js hill-assault --combat    with the placeholder resolver
//   node src/phase2-combat/run.js hill-assault --seed 42
//   node src/phase2-combat/run.js hill-assault --combat --sweep 50
//
// Swap --combat for your real resolver once phase 2 exists: import it below
// and point RESOLVERS at it.

const { runScenario, sweep, formatReport, formatSummary } = require('./harness')
const { placeholderResolver } = require('./harness/placeholderResolver')
const { createCombatResolver } = require('./combat')
const { SCENARIOS, getScenario } = require('./scenarios')

// Factories, not resolvers. The real engine carries stamina, morale and
// rounds-in-contact across rounds in a closure, so every run needs its own.
const RESOLVERS = {
  combat: () => createCombatResolver(),
  placeholder: () => placeholderResolver
}

const DEFAULT_RESOLVER = 'combat'

function parseArgs(argv) {
  const args = { scenario: null, combat: false, seed: null, sweep: 0, resolver: DEFAULT_RESOLVER }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--combat') args.combat = true
    else if (arg === '--seed') args.seed = Number(argv[++i])
    else if (arg === '--sweep') args.sweep = Number(argv[++i])
    else if (arg === '--resolver') args.resolver = argv[++i]
    else if (!arg.startsWith('--')) args.scenario = arg
  }

  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.scenario) {
    console.log('Scenarios:')
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      console.log(`  ${name.padEnd(18)} ${scenario.units.length} units, ${scenario.turns.length} turns`)
    }
    console.log('\nUsage: node src/phase2-combat/run.js <scenario> [--combat] [--seed N] [--sweep N]')
    return
  }

  const scenario = getScenario(args.scenario)
  const factory = args.combat ? RESOLVERS[args.resolver] : null

  if (args.combat && !factory) {
    console.error(`Unknown resolver "${args.resolver}". Available: ${Object.keys(RESOLVERS).join(', ')}`)
    process.exitCode = 1
    return
  }

  if (args.sweep > 0) {
    const { runs, tally } = sweep(scenario, { combatResolverFactory: factory, seeds: args.sweep })
    console.log(`SWEEP: ${scenario.name} x${args.sweep} seeds\n`)
    for (const run of runs) console.log(formatSummary(run))
    console.log('\nwin tally:', JSON.stringify(tally))
    return
  }

  console.log(formatReport(runScenario(scenario, {
    combatResolver: factory ? factory() : null,
    seed: args.seed ?? undefined
  })))
}

main()
