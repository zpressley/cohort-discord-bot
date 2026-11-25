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
  const token = (await store.muster({ opponent: 'standing', side: 'red', seed, kind: 'ground' })).seats.red
  let tent
  for (let i = 0; i < 40; i++) {
    await store.submit(token, i === 0 ? 'everyone advance' : '')
    tent = store.view(token)
    if (tent.battle.status === 'finished') break
  }
  return { tent, game: store.seatOf(token).entry.game }
}

test('the verdict tells which of your units broke, and what became of each: rallied, left the field, destroyed or still fleeing', async () => {
  // Seed 1 (9 until ties of who steps first were a seeded draw, November
  // 25): his horse broke and rallied; the enemy's horse broke.
  const { tent, game } = await finished(1)
  assert.equal(tent.battle.status, 'finished')
  const routed = (side) => [...new Set(game.battle.log.all().filter(e => e.type === 'rout' && e.unitId.startsWith(side)).map(e => e.unitId))]
  const mine = tent.verdict.sides.red
  assert.equal(mine.broke.length, routed('red_').length, 'every unit of his that broke is there')
  assert.ok(mine.broke.length > 0)
  // (Seed 9's horse broke twice before armies marched in column and broken
  // units ran round the enemy; since, once. The count is checked instead.)
  const horse = mine.broke.find(b => b.name === 'Horse')
  const times = game.battle.log.all().filter(e => e.type === 'rout' && e.unitId === 'red_horse').length
  assert.match(horse.said, new RegExp(`^broke${times === 1 ? '' : times === 2 ? ' twice' : ` ${times} times`}, and rallied`))
  for (const b of mine.broke) assert.match(b.said, /^broke( twice| \d+ times)?, and (rallied|left the field|were destroyed|were still fleeing)/)
})

test('the verdict\'s men add up: standing, fallen and those who left the field are the men each side went in with', async () => {
  const { tent } = await finished(1)
  for (const [side, n] of Object.entries(tent.verdict.sides)) {
    assert.equal(n.standing + n.fallen + n.fled, n.start, side)
    assert.equal(n.standingSaid, `${n.standing} of ${n.start}`)
  }
  assert.deepEqual(Object.values(tent.verdict.head), ['Side', 'Standing', 'Fallen', 'Broke'])
})

test('fog of war, the verdict: the enemy\'s units that broke are only those his side saw, by the names he knows, and nothing of what became of them', async () => {
  const { tent, game } = await finished(1)
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
  // Raven Ridge, seed 3 (1 until ties of who steps first were a seeded
  // draw, November 25), Rome against Rome, a battle for ground: he takes
  // the gap, and the enemy, reported on it, comes up beside his men. (It
  // was Crownhill, seed 5, and the hill, until Crownhill's ground became
  // its three fords on November 25.)
  const store = createBattleStore({})
  const token = (await store.muster({ opponent: 'standing', side: 'red', seed: 3, map: 'ravenridge', faction: 'rome', enemyFaction: 'rome', kind: 'ground' })).seats.red
  let tent = store.view(token)
  assert.equal(tent.objectives[0].said, 'The ground to fight for, Raven Gap, is held by no one.')
  let lost = null
  for (let turn = 0; turn < 10 && !lost; turn++) {
    await store.submit(token, turn === 0 ? 'everyone take Raven Gap' : '')
    tent = store.view(token)
    lost = tent.dispatches[0].lines.find(l => /no longer hold/.test(l))
  }
  assert.equal(lost, 'The enemy is on Raven Gap with your men: you no longer hold it alone')
  assert.equal(tent.objectives[0].holder, null)
  assert.equal(tent.objectives[0].said, 'The ground to fight for, Raven Gap, is held by neither side alone.')
})
