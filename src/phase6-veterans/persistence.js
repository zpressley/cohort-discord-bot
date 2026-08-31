// src/phase6-veterans/persistence.js
//
// The commander's record between battles — the thing the two catastrophic
// losses make sacred. A commander is a JSON document: veteran state, officer
// roster, battle history. The repository writes files.
//
// WHY FILES AND NOT SEQUELIZE (flagged, deliberate): the roadmap's phase 6
// names SQLite-dev/Postgres-prod, and the dependency is already installed —
// but the DB belongs to the same layer as the Discord adapter (async, IO,
// deployment-shaped), and phase 7 is where that stack gets rebuilt. What
// phase 6 actually has to prove is that the veteran arc SURVIVES a
// round-trip: three consecutive battles by the same commander persist
// correctly. This repository is the contract for that proof — swap
// `createRepository` for a Sequelize-backed one in phase 7 and nothing above
// it changes. The exit test would pass unmodified against the real DB.
//
// Serialization is deterministic (sorted keys, stable shapes) for the same
// reason every report in this codebase is diffable.

const fs = require('fs')
const path = require('path')

function createRepository(directory) {
  fs.mkdirSync(directory, { recursive: true })

  const fileFor = (commanderId) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(commanderId)) {
      throw new Error(`commander id must be filename-safe, got: ${commanderId}`)
    }
    return path.join(directory, `${commanderId}.json`)
  }

  return {
    save(commander) {
      fs.writeFileSync(fileFor(commander.id), stableStringify(commander) + '\n')
      return commander
    },

    load(commanderId) {
      const file = fileFor(commanderId)
      if (!fs.existsSync(file)) return null
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    },

    list() {
      return fs.readdirSync(directory)
        .filter(f => f.endsWith('.json'))
        .map(f => f.slice(0, -5))
        .sort()
    }
  }
}

function createCommander({ id, name, culture }) {
  return {
    id,
    name,
    culture,
    battles: [],       // one summary per battle fought, oldest first
    elite: null,       // { veteran: veteranState, roster: officers }
    regulars: {}       // unitId -> { battles: n } — the simple ladder
  }
}

// JSON with sorted keys at every level, so a saved commander diffs cleanly
// and a byte-compare between two saves means what it looks like it means.
function stableStringify(value, indent = 2) {
  return JSON.stringify(sortKeys(value), null, indent)
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys(value[key])
    }
    return out
  }
  return value
}

module.exports = { createRepository, createCommander, stableStringify }
