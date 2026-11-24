// src/engine/army/tests/secondLine.test.js
//
// The second line (army/secondLine.js): on a field that calls out more than
// one line, each army is joined by its faction's usual army again; on a
// 1 km field nothing changes.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { withSecondLine, linesOf } = require('../secondLine')
const { fieldFactions } = require('../factions')
const { loadScenario } = require('../../../adapters/hotseat/scenarios')
const { resolveMap } = require('../../map/map')
const { runBattle } = require('../../battle/battle')

const fielded = (map) => fieldFactions(loadScenario('meeting-battle', { map, deploy: true }), { red: 'macedon', blue: 'persia' })

test('a 1 km field calls out one line, and the second line changes nothing there', () => {
  for (const map of ['crownhill', 'ashford', 'thornwood', 'ravenridge']) {
    assert.equal(linesOf(map), 1, map)
    const spec = fielded(map)
    assert.equal(withSecondLine(spec, { red: 'macedon', blue: 'persia' }), spec, map)
  }
})

test('on the big map each army is joined by its usual army again, without a second elite, every unit on its own open tile', () => {
  assert.equal(linesOf('greywater'), 2)
  const one = fielded('greywater')
  const two = withSecondLine(one, { red: 'macedon', blue: 'persia' })
  const map = resolveMap('greywater')
  for (const side of ['red', 'blue']) {
    const first = one.units.filter(u => u.side === side)
    const all = two.units.filter(u => u.side === side)
    const raised = all.filter(u => u.secondLine)
    assert.equal(raised.length, first.filter(u => u.quality !== 'elite').length, side)
    assert.equal(all.length, first.length + raised.length, side)
    assert.equal(all.filter(u => u.quality === 'elite').length, 1, `${side}: one elite`)
    for (const u of raised) {
      assert.match(u.id, new RegExp(`^${side}_second_`))
      assert.ok(u.aliases.includes('second line'))
      assert.ok(u.aliases.every(a => a.startsWith('second ')))
    }
  }
  const tiles = new Set(two.units.map(u => `${u.position.x},${u.position.y}`))
  assert.equal(tiles.size, two.units.length, 'one unit to a tile')
  for (const u of two.units) assert.ok(map.passable(u.position) && !['river', 'marsh', 'ford', 'bridge'].includes(map.terrainAt(u.position)), u.id)
  assert.deepEqual(withSecondLine(one, { red: 'macedon', blue: 'persia' }), two, 'the same every time')
})

test('a battle on the big map, two lines a side, each pressing the other, comes to an end', () => {
  const spec = withSecondLine(fielded('greywater'), { red: 'macedon', blue: 'persia' })
  const result = runBattle({ ...spec, turns: [], maxTurns: 150 }, { seed: 3 })
  assert.ok(result.outcome.decided)
})
