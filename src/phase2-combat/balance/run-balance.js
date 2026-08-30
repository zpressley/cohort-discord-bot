#!/usr/bin/env node
// src/phase2-combat/balance/run-balance.js
//
// The balance-tuning tool. Runs the full matchup matrix headless — no Discord,
// no database, no AI, no wall clock — and prints a stable, diffable report.
//
//   npm run balance                       full matrix + mirror ladder
//   npm run balance -- --quality elite    matrix at one quality tier
//   npm run balance -- --sims 500         more simulations per pairing
//   npm run balance -- --ladder spearmen  mirror ladder for one archetype
//   npm run balance -- --sample cavalry:spearmen   one traced fight
//
// Workflow: save a report, change a number in combat/tables.js, run again, diff
// the two. The assertions in tests/balance.assertions.test.js decide whether
// the change is allowed to stand.

const { runMatrix, runMirrorLadder, runPairing, makeUnit, ARCHETYPES } = require('./matrix')
const { formatMatrix, formatLadder, formatSample, formatTuning } = require('./report')
const T = require('../combat/tables')

function parseArgs(argv) {
  const args = { quality: 'professional', sims: 200, ladder: 'medium_infantry', sample: null }

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--quality') args.quality = argv[++i]
    else if (argv[i] === '--sims') args.sims = Number(argv[++i])
    else if (argv[i] === '--ladder') args.ladder = argv[++i]
    else if (argv[i] === '--sample') args.sample = argv[++i]
  }

  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!T.QUALITY_TIERS[args.quality]) {
    console.error(`Unknown quality "${args.quality}". Available: ${Object.keys(T.QUALITY_TIERS).join(', ')}`)
    process.exitCode = 1
    return
  }

  if (args.sample) {
    const [aKey, bKey] = args.sample.split(':')
    if (!ARCHETYPES[aKey] || !ARCHETYPES[bKey]) {
      console.error(`Unknown archetype in "${args.sample}". Available: ${Object.keys(ARCHETYPES).join(', ')}`)
      process.exitCode = 1
      return
    }
    const pairing = runPairing(makeUnit(aKey, args.quality), makeUnit(bKey, args.quality), { sims: args.sims })
    console.log(formatSample(pairing.sample))
    return
  }

  console.log(formatTuning())
  console.log()
  console.log(formatMatrix(runMatrix({ quality: args.quality, sims: args.sims })))
  console.log()
  console.log(formatLadder(runMirrorLadder({ archetype: args.ladder, sims: args.sims })))
}

main()
