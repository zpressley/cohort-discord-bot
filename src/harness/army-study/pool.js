// src/harness/army-study/pool.js
//
// Many battles at once, in worker processes (lib.battle in each). A job is
// { red, blue, map, seed } with each side an army as lib.battle takes it
// ({ faction, units, policy? }); the answer, in the same order, is each
// battle's result. `--set` changes on the command line reach the workers.
//
//   const { runBattles } = require('./pool')
//   const results = await runBattles(jobs, { workers: 4 })

const { fork } = require('child_process')
const os = require('os')

if (process.argv.includes('--pool-worker')) {
  const L = require('./lib')
  process.on('message', (jobs) => {
    const out = jobs.map(j => {
      const r = L.battle(j.red, j.blue, { map: j.map, seed: j.seed })
      return { winner: r.winner, turns: r.turns, lost: r.lost, fates: r.fates, reason: r.reason, decided: r.decided }
    })
    // Exit only once the answer is sent: a large one is cut off otherwise.
    process.send(out, () => process.exit(0))
  })
} else {
  module.exports = { runBattles, defaultWorkers }
}

function defaultWorkers() {
  return Math.max(1, Math.min(4, os.cpus().length))
}

function runBattles(jobs, { workers = defaultWorkers() } = {}) {
  const sets = []
  process.argv.forEach((a, i) => { if (a === '--set') sets.push('--set', process.argv[i + 1]) })
  const chunks = Array.from({ length: workers }, () => [])
  jobs.forEach((j, i) => chunks[i % workers].push(j))
  return Promise.all(chunks.map(jobs => jobs.length === 0 ? Promise.resolve([]) : new Promise((resolve, reject) => {
    const child = fork(__filename, ['--pool-worker', ...sets])
    child.on('message', resolve)
    child.on('error', reject)
    child.on('exit', (code) => reject(new Error(`worker exited (${code}) without an answer`)))
    child.send(jobs)
  }))).then(parts => {
    // Put back in the order given.
    const out = new Array(jobs.length)
    parts.forEach((part, w) => part.forEach((r, k) => { out[w + k * workers] = r }))
    return out
  })
}
