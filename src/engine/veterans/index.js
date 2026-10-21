// src/engine/veterans/index.js
// Public surface of phase 6: the veteran arc — earned experience, named
// officers who die forever, and the commander's record. Saving that record
// to disk is an adapter's job: src/adapters/persistence/veteransRepository.js.

const veterancy = require('./veterancy')
const officers = require('./officers')
const { createCommander, stableStringify } = require('./commander')
const { recordBattle, eliteBattleFields } = require('./campaign')

module.exports = {
  ...veterancy,
  ...officers,
  createCommander,
  stableStringify,
  recordBattle,
  eliteBattleFields
}
