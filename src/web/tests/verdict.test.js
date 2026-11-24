// src/web/tests/verdict.test.js
//
// The verdict's table (docs/REVIEW-2026-11.md, S9: "Fled 0" in every
// verdict, when his dispatches told of units that broke and fled, then
// rallied or fell): men standing of those who went in, men fallen, and the
// units that broke, his own with what became of each, the enemy's only as
// his side saw them break.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createBattleStore } = require('../battles')

async function finished(seed) {
  const store = createBattleStore({})
  const token = (await store.muster({ opponent: 'standing', side: 'red', seed })).seats.red
  let tent
  for (let i = 0; i < 40; i++) {
    await store.submit(token, i === 0 ? 'everyone advance' : '')
    tent = store.view(token)
    if (tent.battle.status === 'finished') break
  }
  return { tent, game: store.seatOf(token).entry.game }
}

test('the verdict tells which of your units broke, and what became of each: rallied, left the field, destroyed or still fleeing', async () => {
  // Seed 9: his horse broke twice and rallied; the enemy's horse broke once.
  const { tent, game } = await finished(9)
  assert.equal(tent.battle.status, 'finished')
  const routed = (side) => [...new Set(game.battle.log.all().filter(e => e.type === 'rout' && e.unitId.startsWith(side)).map(e => e.unitId))]
  const mine = tent.verdict.sides.red
  assert.equal(mine.broke.length, routed('red_').length, 'every unit of his that broke is there')
  assert.ok(mine.broke.length > 0)
  assert.deepEqual(mine.broke.find(b => b.name === 'Horse'), { name: 'Horse', said: 'broke twice, and rallied' })
  for (const b of mine.broke) assert.match(b.said, /^broke( twice| \d+ times)?, and (rallied|left the field|were destroyed|were still fleeing)/)
})

test('the verdict\'s men add up: standing, fallen and those who left the field are the men each side went in with', async () => {
  const { tent } = await finished(9)
  for (const [side, n] of Object.entries(tent.verdict.sides)) {
    assert.equal(n.standing + n.fallen + n.fled, n.start, side)
    assert.equal(n.standingSaid, `${n.standing} of ${n.start}`)
  }
  assert.deepEqual(Object.values(tent.verdict.head), ['Side', 'Standing', 'Fallen', 'Broke'])
})

test('fog of war, the verdict: the enemy\'s units that broke are only those his side saw, by the names he knows, and nothing of what became of them', async () => {
  const { tent, game } = await finished(9)
  const theirs = tent.verdict.sides.blue
  const routed = new Set(game.battle.log.all().filter(e => e.type === 'rout' && e.unitId.startsWith('blue_')).map(e => e.unitId))
  assert.ok(theirs.broke.length <= routed.size)
  assert.ok(theirs.broke.length > 0, 'his horse broke the enemy\'s horse, and saw it')
  for (const b of theirs.broke) {
    assert.match(b.name, /^Enemy /)
    assert.match(b.said, /^broke( twice| \d+ times)?$/)
  }
  assert.equal(JSON.stringify(tent.verdict.sides).includes('blue_'), false, 'no enemy id in the verdict')
})

// Second playthrough, November 24 (S12): "You no longer hold the Crownhill",
// with no word of who was on it, while the line under the map said it was
// held by no one.
test('ground he held and lost is "held by neither side alone" under the map, and his dispatch says who he knows is on it', async () => {
  // Crownhill, seed 5, Rome against Rome: he takes the hill; at 2 h 10 the
  // enemy's hastati, reported on it, come up beside his own.
  const store = createBattleStore({})
  const token = (await store.muster({ opponent: 'standing', side: 'red', seed: 5, map: 'crownhill', faction: 'rome', enemyFaction: 'rome' })).seats.red
  let tent = store.view(token)
  assert.equal(tent.objectives[0].said, 'The ground to fight for, the Crownhill, is held by no one.')
  let lost = null
  for (let turn = 0; turn < 10 && !lost; turn++) {
    await store.submit(token, turn === 0 ? 'everyone take the Crownhill' : '')
    tent = store.view(token)
    lost = tent.dispatches[0].lines.find(l => /no longer hold/.test(l))
  }
  assert.equal(lost, 'The enemy is on the Crownhill with your men: you no longer hold it alone')
  assert.equal(tent.objectives[0].holder, null)
  assert.equal(tent.objectives[0].said, 'The ground to fight for, the Crownhill, is held by neither side alone.')
})
