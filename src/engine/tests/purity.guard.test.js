// src/engine/tests/purity.guard.test.js
//
// The engine is a pure function of (map, armies, orders, seed). That is what
// makes every battle replayable and every balance run trustworthy, and it is
// easy to break by accident: one Date.now() or one Math.random() and two runs
// of the same battle stop matching.
//
// This test reads every engine source file (tests excluded; they may use
// temp files) and fails on:
//   - randomness or time from outside: Math.random, Date.now, new Date,
//     performance.now
//   - side effects: process, console, timers
//   - any require that is not a relative path into src/engine/ or src/data/
//     (so no fs, no network, no Discord, no AI SDK, no database, and nothing
//     from the harness or adapters)

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SRC = path.resolve(__dirname, '../..')
const ENGINE = path.join(SRC, 'engine')
const ALLOWED_ROOTS = [ENGINE, path.join(SRC, 'data')]

const FORBIDDEN = [
  [/\bMath\.random\b/, 'Math.random (use the seeded rng passed in)'],
  [/\bDate\.now\b/, 'Date.now (the engine has no clock)'],
  [/\bnew Date\b/, 'new Date (the engine has no clock)'],
  [/\bperformance\.now\b/, 'performance.now (the engine has no clock)'],
  [/\bprocess\./, 'process (no environment, no exit, no I/O)'],
  [/\bconsole\./, 'console (return events instead of logging)'],
  [/\b(setTimeout|setInterval|setImmediate)\b/, 'timers']
]

function engineSources(dir = ENGINE) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'tests') out.push(...engineSources(full))
    } else if (entry.name.endsWith('.js')) {
      out.push(full)
    }
  }
  return out
}

// Comments may name the forbidden things (to forbid them); code may not.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

function resolves(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  return [base, base + '.js', path.join(base, 'index.js')].find(f => fs.existsSync(f)) ?? base
}

test('the engine is pure: no clock, no outside randomness, no I/O, no outside imports', () => {
  const files = engineSources()
  assert.ok(files.length > 20, `expected to scan the engine, found only ${files.length} files`)

  const problems = []
  for (const file of files) {
    const rel = path.relative(SRC, file)
    const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n')

    lines.forEach((line, i) => {
      for (const [pattern, why] of FORBIDDEN) {
        if (pattern.test(line)) problems.push(`  ${rel}:${i + 1}: ${why}`)
      }
      for (const match of line.matchAll(/require\(\s*(['"`])([^'"`]+)\1\s*\)/g)) {
        const spec = match[2]
        if (!spec.startsWith('.')) {
          problems.push(`  ${rel}:${i + 1}: requires '${spec}' (only engine and data modules)`)
          continue
        }
        const target = resolves(file, spec)
        if (!ALLOWED_ROOTS.some(root => target.startsWith(root + path.sep))) {
          problems.push(`  ${rel}:${i + 1}: requires '${spec}', outside src/engine and src/data`)
        }
      }
      if (/\bimport\s*\(/.test(line)) problems.push(`  ${rel}:${i + 1}: dynamic import`)
    })
  }

  assert.equal(problems.length, 0,
    `The engine must stay pure (see src/engine/README.md):\n${problems.join('\n')}`)
})
