// Characterization tests for the phase 1 movement stack.
//
// These pin behaviour that phase 2 is about to build on top of. They are not
// aspirational — if one fails after a change to phase 1, either the change is
// wrong or the pin needs updating deliberately.

const test = require('node:test')
const assert = require('node:assert/strict')

const { parseCoord, coordToString, findPath, executeMove } = require('../../phase1-movement/movementEngine')
const { getCell, getTerrainType, MOVEMENT_COSTS } = require('../../phase1-movement/mapData')
const { resolve, listLandmarks } = require('../../phase1-movement/landmarkResolver')
const { createUnit } = require('../../phase1-movement/unitState')

test('coordinates round-trip across the whole 40x40 grid', () => {
  for (let row = 0; row < 40; row++) {
    for (let col = 0; col < 40; col++) {
      const coord = coordToString({ row, col })
      assert.deepEqual(parseCoord(coord), { row, col }, `round-trip failed for ${coord}`)
    }
  }
})

test('two-letter columns address the eastern third, not single-letter columns', () => {
  // Regression: the original copy of parseCoord collapsed AA1 onto col 1.
  assert.equal(parseCoord('AA1').col, 26)
  assert.equal(parseCoord('AN40').col, 39)
  assert.notEqual(parseCoord('AA1').col, parseCoord('B1').col)
})

test('out-of-bounds coordinates are rejected', () => {
  assert.throws(() => parseCoord('A41'))
  assert.throws(() => parseCoord('AO1'))
  assert.throws(() => parseCoord('nonsense'))
})

test('named landmarks sit on their documented terrain', () => {
  assert.equal(getCell('W6').landmark, 'North Ford')
  assert.equal(getCell('W6').terrain, 'ford')
  assert.equal(getCell('H15').landmark, 'Harrow Bridge')
  assert.equal(getCell('H15').terrain, 'bridge')
  assert.equal(getCell('Q1').landmark, 'The Crownhill')
  assert.equal(getCell('Q1').terrain, 'hill')
  assert.equal(getCell('O34').landmark, 'South Ford')
  assert.equal(getCell('A20').landmark, "Shepherd's Ridge")
  assert.equal(getCell('F7').landmark, 'The Merchant Road')
})

test('unnamed tiles default to plains with no landmark', () => {
  const cell = getCell('D4')
  assert.equal(cell.terrain, 'plains')
  assert.equal(cell.landmark, null)
})

test('terrain lookup falls back to the terrain map for unnamed tiles', () => {
  assert.equal(getTerrainType('A1'), 'forest')
  assert.equal(getTerrainType('AK5'), 'marsh')
  assert.equal(getTerrainType('F8'), 'road')
})

test('movement costs rank terrain the way the design intends', () => {
  assert.ok(MOVEMENT_COSTS.road < MOVEMENT_COSTS.plains, 'roads beat open ground')
  assert.ok(MOVEMENT_COSTS.bridge < MOVEMENT_COSTS.plains, 'the bridge is the fast crossing')
  assert.ok(MOVEMENT_COSTS.forest > MOVEMENT_COSTS.hill, 'forest is slower than hill')
  assert.ok(MOVEMENT_COSTS.marsh > MOVEMENT_COSTS.forest, 'marsh is the worst passable ground')
  assert.ok(MOVEMENT_COSTS.river >= 999, 'open river is impassable')
})

test('pathfinding returns a contiguous path between its endpoints', () => {
  const path = findPath('D4', 'H7')
  assert.ok(path, 'expected a path')
  assert.equal(path[0], 'D4')
  assert.equal(path.at(-1), 'H7')

  for (let i = 1; i < path.length; i++) {
    const a = parseCoord(path[i - 1])
    const b = parseCoord(path[i])
    const step = Math.abs(a.row - b.row) + Math.abs(a.col - b.col)
    assert.equal(step, 1, `path jumps between ${path[i - 1]} and ${path[i]}`)
  }
})

test('a unit that cannot reach its target reports a partial move', () => {
  const unit = createUnit({ position: 'D4', movementRange: 3 })
  const result = executeMove(unit, 'D20')

  assert.equal(result.success, true)
  assert.equal(result.reachedTarget, false)
  assert.equal(result.partialMove, true)
  assert.ok(result.turnsToTarget > 1)
  assert.notEqual(result.finalPosition, 'D20')
})

test('movement never overspends the movement allowance', () => {
  const unit = createUnit({ position: 'D4', movementRange: 3 })
  const result = executeMove(unit, 'D10')

  const spent = result.tilesTraversed
    .reduce((total, tile) => total + (MOVEMENT_COSTS[tile.terrain] ?? 1.0), 0)

  assert.ok(spent <= unit.movementRange + 1e-9, `spent ${spent} of ${unit.movementRange}`)
})

test('ordering a unit to its own tile is rejected', () => {
  const unit = createUnit({ position: 'D4' })
  const result = executeMove(unit, 'D4')
  assert.equal(result.success, false)
  assert.match(result.reason, /already/i)
})

test('landmark resolution handles exact, partial and unknown', () => {
  assert.equal(resolve('Harrow Bridge').confidence, 'exact')
  assert.equal(resolve('Harrow Bridge').coord, 'H15')

  assert.equal(resolve('north ford').coord, 'W6')

  assert.equal(resolve('Atlantis').confidence, 'none')
})

// KNOWN DEFECT — pinned, not endorsed. See PHASE2_COMBAT_PLAN.md "Known
// phase 1 defects". buildAliasIndex() is a flat object, so when two cells
// share an alias the later one silently overwrites the earlier. "the ridge"
// is an alias on both Q1 (The Crownhill) and A20 (Shepherd's Ridge); A20 is
// inserted last and wins. The ambiguity branch only runs on partial matches,
// so an exact collision is never disambiguated and the player is never asked.
// Change this test when the resolver is fixed to return 'ambiguous'.
test('duplicate aliases silently resolve to the last cell indexed', () => {
  const result = resolve('the ridge')
  assert.equal(result.confidence, 'exact')
  assert.equal(result.coord, 'A20')
})

test('partial matching is word-aware — "ridge" must not match "bridge"', () => {
  const result = resolve('ridge')
  const coords = result.matches ? result.matches.map(m => m.coord) : [result.coord]
  assert.ok(!coords.includes('H15'), 'ridge should never resolve to Harrow Bridge')
})

test('every named cell is listed as a landmark', () => {
  const landmarks = listLandmarks()
  assert.equal(landmarks.length, 7)
  assert.ok(landmarks.includes('Miller\'s Crossing'))
})
