// src/web/tests/messengers.test.js
//
// Orders and news by rider, through the server
// (docs/design/point-of-view-and-messengers.md).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { orderDelays } = require('../../engine/command/messengers')
const { gameRecord, replayGame } = require('../../engine/orchestrator')

async function start(store = createBattleStore({})) {
  const server = createServer(store)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const api = async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined
    })
    return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() }
  }
  return { server, base, api, close: () => new Promise(resolve => server.close(resolve)) }
}

// A battle against the computer with a Commander of Rome on the field (no
// ground to fight for: these battles were chosen for their news before the
// maps had their own).
async function solo(app, { seed = 3, map = 'crownhill' } = {}) {
  const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
  const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed, map, commander: made.token, faction: 'rome', objectives: [] })).body.seats.red
  return seat
}

test('the read-back says how long a rider takes to each unit beyond the Commander\'s immediate range', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const seat = await solo(app)
    const game = store.seatOf(seat).entry.game
    // The army forms up within his immediate range; send one unit far off
    // (by hand, for the test) to the far north-west of the field.
    const far = game.battle.world.units.find(u => u.side === 'red' && u.id !== game.battle.commanders.red.unitId)
    far.position = { x: 1, y: 1 }
    game.word.red.units[far.id].position = { x: 1, y: 1 }
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    const minutes = orderDelays(game.battle, 'red', tent.own.map(u => u.id), { word: game.word.red })
    const read = (await app.api('POST', `/api/seat/${seat}/read`, { text: tent.own.map(u => `${u.name.toLowerCase()} hold`).join('\n') })).body
    tent.own.forEach((u, i) => {
      const line = read.understood[i]
      if (minutes[u.id] === 0) assert.equal(line, `${u.name}: hold`, 'at once: nothing more is said')
      else assert.equal(line, `${u.name}: hold. A rider reaches them in about ${minutes[u.id]} minutes`)
    })
    assert.ok(Object.values(minutes).some(m => m > 0), 'some unit of the army is beyond the immediate range')
  } finally { await app.close() }
})

// A battle in which the army goes forward and the Commander stays back
// with his guard: word of it comes later and later. Turns are run until
// his side has seen an enemy he has not yet heard of.
async function aheadOfHim(app, store) {
  for (const seed of [3, 4, 5, 6, 7]) {
    const seat = await solo(app, { seed })
    const game = store.seatOf(seat).entry.game
    const guard = game.battle.commanders.red.unitId
    for (let t = 0; t < 12 && !game.outcome.decided; t++) {
      const tent = (await app.api('GET', `/api/seat/${seat}`)).body
      const name = tent.own.find(u => u.id === guard).name.toLowerCase()
      await app.api('POST', `/api/seat/${seat}/orders`, { text: `everyone advance\n${name} hold` })
      const unheard = Object.keys(game.intel.red.known).filter(id => !game.word.red.enemies[id])
      const stale = game.battle.world.units.filter(u => u.side === 'red' && u.strength > 0 && game.word.red.units[u.id] && game.word.red.units[u.id].heard < game.battle.turn)
      if (!game.outcome.decided && unheard.length > 0 && stale.length > 0) return { seat, game, unheard, stale }
    }
  }
  throw new Error('no battle left the Commander behind his news')
}

test('fog of war by rider: the tent shows a distant unit as word of it last came, and no enemy he has not heard of', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { seat, game, unheard, stale } = await aheadOfHim(app, store)
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    const text = JSON.stringify(tent)
    for (const id of unheard) assert.ok(!text.includes(`"${id}"`), `${id}: seen by his side, not yet heard of by him, is nowhere in the tent`)
    for (const u of stale) {
      const shown = tent.own.find(o => o.id === u.id)
      const word = game.word.red.units[u.id]
      assert.deepEqual([shown.position, shown.strength, shown.word.minutesAgo], [word.position, word.strength, (game.battle.turn - word.heard) * 10])
    }
    // (An enemy whose kind no report told goes by a stand-in id: reports.test.js.)
    for (const e of tent.enemies) {
      const told = game.word.red.enemies[e.id] ?? Object.values(game.word.red.enemies).find(w => !w.told.kind && w.seenOnTurn === e.seenOnTurn && w.position.x === e.position.x && w.position.y === e.position.y)
      assert.ok(told, 'each enemy where he was told it stood')
      assert.deepEqual(e.position, told.position)
    }
    // The status line the list of battles reads says nothing more.
    const summary = JSON.stringify((await app.api('GET', `/api/seat/${seat}/summary`)).body)
    for (const id of unheard) assert.ok(!summary.includes(id))
    // Nor does the read-back: an enemy he has not heard of cannot be named.
    const read = (await app.api('POST', `/api/seat/${seat}/read`, { text: 'everyone attack the enemy archers' })).body
    for (const id of unheard) assert.ok(!JSON.stringify(read).includes(id))
  } finally { await app.close() }
})

test('the dispatch tells news from far off with how old it is', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { seat } = await aheadOfHim(app, store)
    let found = null
    for (let t = 0; t < 10 && !found; t++) {
      const tent = (await app.api('GET', `/api/seat/${seat}`)).body
      found = tent.dispatches.flatMap(d => d.lines).find(l => /^Word from \d+ (min|h)/.test(l))
      if (!found && tent.battle.status !== 'finished') await app.api('POST', `/api/seat/${seat}/orders`, { text: '' })
    }
    assert.ok(found, 'a line of news by rider, with how old it is')
  } finally { await app.close() }
})

test('the computer\'s orders go out by rider from its best unit, and a saved battle plays them back', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const seat = await solo(app)
    await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone advance' })
    const game = store.seatOf(seat).entry.game
    const theirs = game.orderLog.filter(e => e.side === 'blue')
    assert.ok(theirs.length > 0 && theirs.every(e => e.orders.every(o => o.fromPost === true)), 'each of its orders marked as from its command post')
    assert.ok(game.battle.posts.has('blue'))
    const again = replayGame(JSON.parse(JSON.stringify(gameRecord(game))))
    assert.deepEqual(again.battle.log.all(), game.battle.log.all())
  } finally { await app.close() }
})

// ── The enemy catching a rider ─────────────────────────
// (engine/command/messengers.js, ridersTaken; tables.RIDER_TAKEN.) A rider
// is put on the road by hand beside the enemy, and the roll made sure, so
// that the test does not wait on the dice.
const { RIDER_TAKEN } = require('../../engine/combat/tables')
async function sure(fn) {
  const was = [RIDER_TAKEN.FOOT.CHANCE, RIDER_TAKEN.HORSE.CHANCE]
  RIDER_TAKEN.FOOT.CHANCE = 1
  RIDER_TAKEN.HORSE.CHANCE = 1
  try { return await fn() } finally { [RIDER_TAKEN.FOOT.CHANCE, RIDER_TAKEN.HORSE.CHANCE] = was }
}
// A road down one column of the field, a tile at a time, from row `from`.
const column = (x, from, n) => Array.from({ length: n }, (_, i) => ({ x, y: from + i, c: i }))

test('fog of war, a rider caught: the Commander who sent him is told nothing, and believes his order on the road until it should have arrived', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    await sure(async () => {
      const seat = await solo(app)
      const game = store.seatOf(seat).entry.game
      const { battle } = game
      // A rider of his to the hastati, riding past the enemy's cataphracts
      // two tiles off (where they stand, (30, 25); it was (27, 24) before the east army formed up
      // further north), and due long after.
      battle.riders = [{ side: 'red', unitId: 'red_hastati', order: { unitId: 'red_hastati', action: 'move', target: { x: 20, y: 2 } }, sent: battle.turn, arrives: battle.turn + 30, path: column(28, 14, 13) }]
      await app.api('POST', `/api/seat/${seat}/orders`, { text: 'legionaries hold' })
      const taken = battle.log.all().filter(e => e.type === 'riderTaken')
      assert.deepEqual(taken.map(e => [e.from, e.to]), [['red', 'red_hastati']], 'the enemy took him')
      assert.notDeepEqual(battle.orderBook.get('red_hastati')?.target, { x: 20, y: 2 }, 'his order never arrived')
      const tent = (await app.api('GET', `/api/seat/${seat}`)).body
      const text = JSON.stringify(tent)
      for (const word of ['riderTaken', 'lostRiders', "enemy's riders", 'taken', '"path"']) {
        assert.equal(text.includes(word), false, `no "${word}" in the answer`)
      }
      if (battle.turn < 31) assert.ok(tent.own.find(u => u.id === 'red_hastati').rider, 'as far as he knows, the rider is still on his way')
    })
  } finally { await app.close() }
})

test('a unit of his that catches an enemy rider tells its Commander the order he carried, in the game\'s own words', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    await sure(async () => {
      const seat = await solo(app)
      const game = store.seatOf(seat).entry.game
      const { battle } = game
      // The enemy's rider to its slingers, riding past his hastati (11, 21)
      // a tile off: they are beside him, so word of it comes at once.
      battle.riders = [{ side: 'blue', unitId: 'blue_slingers', order: { unitId: 'blue_slingers', fromPost: true, action: 'attack', target: { x: 11, y: 21 } }, sent: battle.turn, arrives: battle.turn + 3, path: column(12, 12, 13) }]
      await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone hold' })
      const taken = battle.log.all().filter(e => e.type === 'riderTaken')
      assert.deepEqual(taken.map(e => [e.side, e.unitId, e.to]), [['red', 'red_hastati', 'blue_slingers']])
      const tent = (await app.api('GET', `/api/seat/${seat}`)).body
      const line = tent.dispatches.flatMap(d => d.lines).find(l => l.includes("took one of the enemy's riders"))
      assert.match(line ?? '', /^Hastati took one of the enemy's riders .*, carrying an order for enemy slingers: attack (?:the Merchant Road \()?C6-/)
      assert.equal(JSON.stringify(tent).includes('blue_slingers'), false, 'the enemy named in his words, never by the engine\'s name')
    })
  } finally { await app.close() }
})
