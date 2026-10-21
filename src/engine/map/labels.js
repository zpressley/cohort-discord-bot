// src/engine/map/labels.js
//
// Positions are numeric inside the engine: { x, y }, x the column (west to
// east), y the row (north to south), both from 0 (ruling Q1).
//
// Labels ("D4", "AA12") are how scenario files and the hotseat CLI name
// tiles: column letters, then the row number from 1. Letters are bijective
// base-26 (A..Z, AA..AZ, BA..), so any map width has labels. The player-facing
// coordinate format is not ruled yet; labels are a convenience at the edges,
// not part of the engine's state.

const LABEL = /^([A-Za-z]+)(\d+)$/

function fromLabel(label) {
  const match = typeof label === 'string' ? label.trim().match(LABEL) : null
  if (!match) throw new Error(`not a map label: ${label}`)

  let col = 0
  for (const ch of match[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
  const row = parseInt(match[2], 10)
  if (row < 1) throw new Error(`not a map label: ${label}`)

  return { x: col - 1, y: row - 1 }
}

function toLabel(position) {
  const { x, y } = toPosition(position)
  let n = x + 1
  let letters = ''
  while (n > 0) {
    const r = (n - 1) % 26
    letters = String.fromCharCode(65 + r) + letters
    n = Math.floor((n - 1) / 26)
  }
  return `${letters}${y + 1}`
}

// Accept a label or a position; return a fresh { x, y }. The engine calls
// this wherever a position enters from outside (unit specs, orders,
// objectives), so callers may write either form.
function toPosition(value) {
  if (typeof value === 'string') return fromLabel(value)
  if (value && Number.isInteger(value.x) && Number.isInteger(value.y)) {
    return { x: value.x, y: value.y }
  }
  throw new Error(`not a position: ${JSON.stringify(value)}`)
}

function isPosition(value) {
  return Boolean(value) && Number.isInteger(value.x) && Number.isInteger(value.y)
}

function samePosition(a, b) {
  return Boolean(a) && Boolean(b) && a.x === b.x && a.y === b.y
}

// A string key for Map/Set lookups. Positions are objects, so two equal
// positions are different keys unless they go through this.
function positionKey(position) {
  return `${position.x},${position.y}`
}

// Manhattan distance in tiles: movement is orthogonal, so this is the number
// of steps between two tiles on open ground.
function distance(a, b) {
  const p = toPosition(a)
  const q = toPosition(b)
  return Math.abs(p.x - q.x) + Math.abs(p.y - q.y)
}

module.exports = { fromLabel, toLabel, toPosition, isPosition, samePosition, positionKey, distance }
