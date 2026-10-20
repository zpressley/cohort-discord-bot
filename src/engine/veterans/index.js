// src/engine/veterans/index.js
// Public surface of phase 6: the veteran arc — earned experience, named
// officers who die forever, and the commander's persistent record.

const veterancy = require('./veterancy')
const officers = require('./officers')
const { createRepository, createCommander, stableStringify } = require('../../adapters/persistence/veteransRepository')
const { recordBattle, eliteBattleFields } = require('./campaign')

module.exports = {
  ...veterancy,
  ...officers,
  createRepository,
  createCommander,
  stableStringify,
  recordBattle,
  eliteBattleFields
}
