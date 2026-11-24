// src/opponent/commander.js
//
// The computer's Commander: a name, and a character (bold, steady or
// cautious: planner.js, CHARACTERS), drawn at the muster from the battle's
// seed and written into the spec (spec.sides[side].character and
// .commanderName), so a saved battle replays with him and the next day
// brings the same man. Each character is as likely as the others.
//
// He is named as his officers are: from his army's culture's names
// (src/data/officers.js), never one of his own officers'.

const { createRng } = require('../engine/rng')
const { NAMES, PLAIN } = require('../data/officers')
const { CHARACTER_NAMES } = require('./planner')

/**
 * @param {Object} spec  a battle spec, units mustered and officers given
 * @param {string} side  the computer's side
 * @param {number} seed  the battle's seed
 * @returns {{ name: string, character: string }}
 */
function drawCommander(spec, side, seed) {
  // A stream of its own, so nothing else drawn from the seed moves.
  const random = createRng((Math.imul(seed ?? 1, 2654435761) ^ 0x5bd1e995) >>> 0 || 1)
  const character = CHARACTER_NAMES[Math.floor(random() * CHARACTER_NAMES.length)]
  const units = spec.units.filter(u => u.side === side)
  const pool = NAMES[units.find(u => u.culture)?.culture] ?? PLAIN
  const taken = new Set(units.map(u => u.officer?.name).filter(Boolean))
  const free = pool.filter(n => !taken.has(n))
  const from = free.length ? free : pool
  const name = from[Math.floor(random() * from.length)]
  return { name, character }
}

/**
 * The spec with the computer's Commander on `side`: as given (the day
 * before's; or a character named, as a test may), the rest drawn from the
 * seed.
 */
function withCommander(spec, side, seed, given = null) {
  const drawn = drawCommander(spec, side, seed)
  const name = given?.name || drawn.name
  const character = CHARACTER_NAMES.includes(given?.character) ? given.character : drawn.character
  return { ...spec, sides: { ...spec.sides, [side]: { ...spec.sides[side], commanderName: name, character } } }
}

/** The computer's Commander of a side, if the spec has one. */
function commanderOf(spec, side) {
  const s = spec.sides?.[side]
  return s?.commanderName && s.character ? { name: s.commanderName, character: s.character } : null
}

module.exports = { drawCommander, withCommander, commanderOf }
