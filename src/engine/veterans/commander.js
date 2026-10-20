// src/engine/veterans/commander.js
//
// The commander record and its deterministic serialization. Pure: the
// repository that writes it to disk lives in
// src/adapters/persistence/veteransRepository.js.

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

module.exports = { createCommander, stableStringify }
