// src/interpreter/tests/fixtures/mangled.js
//
// Orders no one would type, made to try the reader: words from the game's
// own vocabulary, his units' names and the field's places, joined with
// "if", "then", "but", "and", "unless", commas or nothing, then mangled
// (letters dropped, words doubled, cut short). Seeded, so the same seed
// gives the same orders.
//
//   mangledOrders(context, seed, count)   an array of lines

const { detectFeatures } = require('../../../engine/map/features')

const WORDS = [
  'advance', 'attack', 'charge', 'hold', 'halt', 'stop', 'stay', 'put', 'wait', 'stand', 'withdraw', 'retreat',
  'fall', 'back', 'pull', 'march', 'move', 'go', 'to', 'the', 'defend', 'guard', 'take', 'hide', 'ambush',
  'search', 'shoot', 'fire', 'throw', 'follow', 'stay with', 'ride with', 'i ride with', 'flank', 'their',
  'enemy', 'them', 'everyone', 'everyone else', 'the rest', 'all', 'except', 'north', 'south', 'east', 'west',
  '200 m', 'go north 300m', '2 squares', 'carefully', 'whatever happens', 'let two pass', 'break', 'breaks',
  'is there', 'are attacked', 'attacked', 'see', 'until', 'after that', 'on', 'at', 'by', 'near', 'in',
  'woods', 'hill', 'ford', 'bridge', 'ridge', 'C5', 'D7-NE', 'E12', 'want', 'i want', 'tell', 'send', 'have',
  'please', 'now', 'ok', 'horse', 'archers', 'foot', 'cavalry', 'spears', 'surrender', 'done', 'yield', '!', '?',
  'spring the trap', 'keep going', 'skirmish', 'javelins', 'in which case', 'otherwise', 'unless'
]
const JOINS = [' if ', ' then ', ' but ', ' and ', ' unless ', ', ', ',', '. ', '; ', ' ', '', ' but if ', ', then ', ' if if ', '\n']

// A small seeded generator (no Math.random in anything that decides).
function generator(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

function mangle(line, rand) {
  const roll = rand()
  if (roll < 0.15) {
    // A letter dropped somewhere.
    const at = Math.floor(rand() * line.length)
    return line.slice(0, at) + line.slice(at + 1)
  }
  if (roll < 0.25) return line.slice(0, Math.floor(rand() * line.length))
  if (roll < 0.32) return `${line} ${line}`
  if (roll < 0.38) return line.toUpperCase()
  if (roll < 0.42) return line.replace(/ /g, '')
  return line
}

function mangledOrders(context, seed, count) {
  const rand = generator(seed)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const units = (context.units ?? []).flatMap(u => [u.id.replace(/^(?:red|blue)_/, '').replace(/_/g, ' '), ...(u.aliases ?? [])])
  const places = context.map ? detectFeatures(context.map).filter(f => f.name).map(f => f.name) : []
  const vocabulary = [...WORDS, ...units, ...units, ...places]
  const lines = []
  for (let i = 0; i < count; i++) {
    const clauses = 1 + Math.floor(rand() * 5)
    let line = ''
    for (let c = 0; c < clauses; c++) {
      const words = 1 + Math.floor(rand() * 6)
      const clause = Array.from({ length: words }, () => pick(vocabulary)).join(' ')
      line += (c === 0 ? (rand() < 0.2 ? pick(JOINS).trimStart() : '') : pick(JOINS)) + clause
    }
    lines.push(mangle(line, rand))
  }
  return lines
}

module.exports = { mangledOrders, generator }
