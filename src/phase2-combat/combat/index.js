// src/phase2-combat/combat/index.js
// Public surface of the phase 2 combat engine.
//
// Nothing here imports from src/game/. The legacy tree is a source of numbers,
// not code — the numbers it gave up are in tables.js with [salvage] against
// each one.

const tables = require('./tables')
const ratings = require('./ratings')
const damage = require('./damage')
const { createCombatResolver, chaosFor, chargeRoundFor } = require('./resolve')

module.exports = {
  createCombatResolver,
  chaosFor,
  chargeRoundFor,
  tables,
  ratings,
  damage
}
