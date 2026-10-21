// src/phase2-combat/tests/no-roles.guard.test.js
//
// Guard for ruling Q5 (docs/DECISIONS.md). Units belong to a side; neither
// unit in a fight has a role. Advantage comes from position and circumstance,
// and charge momentum belongs to the unit that moved into contact.
//
// Role language has crept back into this engine in several builds. This test
// fails the suite the moment it does again.
//
// Scanned: every file in the engine (src/phase*/, source and tests) and the
// three combat design docs Stage 0 cleaned.
// Not scanned: archive/, docs/DECISIONS.md, legacy code outside src/phase*/
// (src/game, src/bot and friends still run the live Discord bot and are
// slated for archive/), and this file, which has to name the words to ban them.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const REPO = path.resolve(__dirname, '../../..')
const BANNED = /attacker|defender/i
const MESSAGE = 'Attacker/defender roles were removed by design. See docs/DECISIONS.md.'

const DOCS = [
  'docs/design/combat-design.md',
  'docs/PHASE2_COMBAT_PLAN.md',
  'docs/Context/Old Context/combat_design_parameters.md'
]

const EXCLUDED = new Set([
  path.relative(REPO, __filename),
  'docs/DECISIONS.md'
])

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function scannedFiles() {
  const engineDirs = fs.readdirSync(path.join(REPO, 'src'), { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('phase'))
    .map(d => path.join(REPO, 'src', d.name))

  const files = [...engineDirs.flatMap(walk), ...DOCS.map(d => path.join(REPO, d))]
  return files
    .map(f => path.relative(REPO, f))
    .filter(f => !f.startsWith('archive' + path.sep) && !EXCLUDED.has(f))
}

test('engine source, tests and combat docs carry no attacker/defender roles', () => {
  const files = scannedFiles()
  // A guard that silently scans nothing guards nothing.
  assert.ok(files.length > 50, `expected to scan the engine, found only ${files.length} files`)

  const hits = []
  for (const file of files) {
    const lines = fs.readFileSync(path.join(REPO, file), 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (BANNED.test(line)) hits.push(`  ${file}:${i + 1}: ${line.trim()}`)
    })
  }

  assert.equal(hits.length, 0, `${MESSAGE}\n${hits.join('\n')}`)
})
