// src/adapters/discord/tests/no-training-purchase.test.js
//
// Ruling Q8 (docs/DECISIONS.md): there is no training purchase. A unit's
// training comes from its quality tier and nothing else.
//
// The headless builder never had the field (builder.test.js pins that). The
// live Discord builder did, as a sixth step that charged SP for an upgrade no
// combat code read. Stage 0 removed it and archived the step under
// archive/training-purchase/. These checks keep it from coming back by
// accident. If it comes back on purpose, as a new ruling, change this test.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const REPO = path.resolve(__dirname, '../../../..')

// Every file that used to read, write, price or display unit.training.
const LIVE_BUILDER_FILES = [
  'src/bot/armyInteractionHandler.js',
  'src/bot/commands/build-army.js',
  'src/game/battleInitializer.js'
]

test('Q8: the live army builder no longer sells, stores or prices training', () => {
  for (const file of LIVE_BUILDER_FILES) {
    const source = fs.readFileSync(path.join(REPO, file), 'utf8')
    assert.doesNotMatch(source, /\.training\b|training\s*:/,
      `${file} reads or writes a training field; ruling Q8 removed the training purchase`)
    assert.doesNotMatch(source, /training-selection/,
      `${file} routes a training step; ruling Q8 removed the training purchase`)
  }
})

test('Q8: the live army builder still loads without the training step', () => {
  // Removing a step from a 1,000-line Discord handler is easy to get wrong.
  // Loading catches syntax and top-level errors, and the router must still be
  // exported.
  const handler = require(path.join(REPO, 'src/bot/armyInteractionHandler.js'))
  assert.equal(typeof handler.handleArmyBuilderInteractions, 'function')
})
