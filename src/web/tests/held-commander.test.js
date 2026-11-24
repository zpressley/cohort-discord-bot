// src/web/tests/held-commander.test.js
//
// A Commander in the enemy's hands, through the server (ruled 2026-11-23):
// the table between him and his captors, a saved battle with offers in it,
// what he and his captors may see, and riding with another unit.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { heldSight, canRide } = require('../../engine/command/commander')
const { sideView } = require('../../engine/orchestrator')

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

// A battle between two players in which red's Commander is taken in the
// fighting, not by hand, so that the saved battle holds it: Persia on
// red, seed 708, both sides sending everyone in; he is taken with the battle
// still on, and is held a turn later (found by search). It was Macedon,
// seed 708, until each people had its perks (docs/design/army-balance.md
// part 9): with the Silver Shields seasoned, Macedon's Commander was taken
// only with his army all but gone, and none of some thousands of seeds
// searched left a battle on a turn later. Seed 646 until Rome carried
// pila (part 8).
// (Seed 708 until armies were made to come to grips and Crownhill's east
// army formed up further south, November 24: then he was taken there with
// the battle as good as over. 1477 is the first found since in which he is
// taken, his army fights on, and both sides' dispatches line up.)
async function takenInBattle(app) {
  const red = (await app.api('POST', '/api/commanders', { faction: 'persia' })).body
  const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 1477, commander: red.token, faction: 'persia' })).body.seats
  // Blue brings a Commander of Rome, so that both armies are fixed and the
  // battle is the same one whatever faction the lot would have given him.
  const blue = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
  await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })
  for (let t = 0; t < 20; t++) {
    const tent = (await app.api('GET', `/api/seat/${seats.red}`)).body
    if (tent.commander.status === 'held') {
      assert.equal(tent.battle.status, 'your-orders', 'the battle goes on')
      return { red, seats, tent }
    }
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone advance' })
    await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone advance' })
  }
  throw new Error('he was never taken')
}

test('a battle with an offer, a counter and an acceptance survives a server restart identically', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-held-'))
  const both = async (app, seats) => [(await app.api('GET', `/api/seat/${seats.red}`)).body, (await app.api('GET', `/api/seat/${seats.blue}`)).body]
  let app = null
  try {
    app = await start(createBattleStore({ dir }))
    const { red, seats } = await takenInBattle(app)
    assert.equal((await app.api('POST', `/api/seat/${seats.red}/offer`, { units: [] })).body.status, 'on the table')
    let blue = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    assert.deepEqual(blue.captive.offer.units, [], 'the field alone')
    const asked = blue.captive.seen[0].id
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/answer`, { offer: blue.captive.offer.id, more: [asked] })).body.status, 'on the table')
    let tent = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.deepEqual(tent.commander.table.answer, { kind: 'more' })
    assert.deepEqual(tent.commander.table.counter.units.map(u => u.id), [asked])

    // Stopped with the counter on the table.
    const before = await both(app, seats)
    await app.close()
    app = await start(createBattleStore({ dir }))
    assert.deepEqual(await both(app, seats), before, 'the counter came back with the battle')

    // A turn runs; he offers something else, and they take it.
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: '' })
    await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })
    tent = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.equal(tent.commander.status, 'held')
    const given = tent.commander.chips.filter(c => c.id !== asked).slice(-2).map(c => c.id)
    await app.api('POST', `/api/seat/${seats.red}/offer`, { units: given })
    blue = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/answer`, { offer: blue.captive.offer.id, accept: true })).body.status, 'finished')

    const ended = await both(app, seats)
    const company = (await app.api('GET', `/api/commander/${red.token}`)).body
    assert.equal(ended[0].battle.outcome.reason, 'enemy commander bargained')
    assert.equal(ended[0].verdict.commander.prices.length, 2)
    await app.close()
    app = await start(createBattleStore({ dir }))
    assert.deepEqual(await both(app, seats), ended, 'the same battle, the same verdict, after a restart')
    assert.deepEqual((await app.api('GET', `/api/commander/${red.token}`)).body, company, 'and written into his company once')
  } finally {
    await app?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('fog of war, held: his map holds only what can be seen from where he is held; his dispatch is his captors\' own', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { seats } = await takenInBattle(app)
    const game = store.seatOf(seats.red).entry.game
    // One of his units, by hand, far from the fight and out of his sight.
    const captor = game.battle.world.units.find(u => u.id === game.battle.commanders.red.heldBy)
    const away = game.battle.world.units.filter(u => u.side === 'red' && u.strength > 0 && !game.battle.broken.has(u.id)).at(-1)
    away.position = { x: captor.position.x > 20 ? 1 : 38, y: captor.position.y > 20 ? 1 : 38 }
    const tent = (await app.api('GET', `/api/seat/${seats.red}`)).body
    const sight = heldSight(game.battle, 'red')
    const out = tent.own.filter(u => u.outOfSight)
    assert.ok(out.length > 0, 'some of his army is out of his sight')
    for (const u of out) {
      for (const key of ['position', 'at', 'strength', 'morale', 'stamina', 'target', 'holdingFire']) assert.equal(key in u, false, `${u.name}: no ${key}`)
    }
    for (const u of tent.own.filter(u => !u.outOfSight)) {
      assert.ok(sight.seen.has(u.id))
      assert.equal('morale' in u, false, 'not even the morale of those he can see')
    }
    assert.ok(tent.enemies.every(e => sight.seen.has(e.id) && e.status === 'visible'), 'only the enemy in his captors\' sight')
    const known = sideView(game, 'red').intel.map(e => e.id).filter(id => !sight.seen.has(id))
    assert.ok(known.every(id => !JSON.stringify(tent.enemies).includes(id)), 'nothing his side knew before or has learned since')
    assert.equal((await app.api('POST', `/api/seat/${seats.red}/read`, { text: 'everyone advance' })).status, 409)

    // A turn held: he hears the reports that come in to his captors, their
    // own units and all, and nothing of his own army that they cannot see.
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: '' })
    await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone advance' })
    const after = (await app.api('GET', `/api/seat/${seats.red}`)).body
    const dispatch = after.dispatches[0]
    assert.match(dispatch.lines[0], /^You are held by enemy .+ at [A-J]\d{1,2}-(NW|NE|SW|SE), and hear the reports as they come in to your captors$/)
    // What blue was told of the same turn, in blue's own names, is what he read.
    const theirs = (await app.api('GET', `/api/seat/${seats.blue}`)).body.dispatches[0]
    assert.equal(theirs.turn, dispatch.turn)
    assert.ok(theirs.lines.length > 0)
    // Line for line, after the heading; and he may have more, for he hears
    // what reaches the captors about him at once, before a rider takes it
    // to their own Commander (since the east army forms up further south
    // on Crownhill, November 24, this battle has one such line).
    assert.ok(dispatch.lines.length - 1 >= theirs.lines.length, 'line for line, after the heading')
    assert.ok(dispatch.lines.slice(1).some(l => /^Enemy /.test(l)), 'their units are "enemy" to him still')
    // His far unit, which no enemy can see, is in neither.
    const blueSees = new Set(sideView(game, 'blue').intel.filter(e => e.status === 'visible').map(e => e.id))
    if (!blueSees.has(away.id)) {
      const name = after.own.find(u => u.id === away.id)?.name
      for (const line of dispatch.lines) assert.equal(new RegExp(`\\b${name}\\b`).test(line), false, `"${line}" tells of ${name}, whom his captors cannot see`)
    }

    // Free again: his side's view is his once more.
    Object.assign(game.battle.commanders.red, { status: 'free', heldBy: null, unitId: game.battle.world.units.find(u => u.side === 'red' && u.strength > 0).id })
    const free = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.ok(free.own.every(u => u.position && 'morale' in u))
    assert.deepEqual(free.enemies.map(e => e.id).sort(), sideView(game, 'red').intel.map(e => e.id).sort())
  } finally { await app.close() }
})

test('fog of war, the captor: the offer tells him only of the units offered, and he may ask only for units his side has seen', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { seats, tent } = await takenInBattle(app)
    const game = store.seatOf(seats.red).entry.game
    const seen = new Set(Object.keys(game.intel.blue.known))
    const unseen = tent.commander.chips.filter(c => !seen.has(c.id))
    const before = JSON.stringify((await app.api('GET', `/api/seat/${seats.blue}`)).body)
    const offered = unseen.length ? unseen[0] : tent.commander.chips[0]
    await app.api('POST', `/api/seat/${seats.red}/offer`, { units: [offered.id] })
    const blue = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    const told = JSON.stringify(blue)
    for (const c of tent.commander.chips) {
      if (c.id === offered.id || seen.has(c.id)) continue
      assert.equal(told.includes(c.id), false, `${c.id}: never seen by blue, and not offered`)
    }
    assert.deepEqual(blue.captive.offer.units, [{ id: offered.id, name: `enemy ${offered.name.toLowerCase()}` }])
    assert.deepEqual(blue.captive.seen.map(e => e.id).sort(), [...seen].sort())
    assert.equal(before.includes('"captive":{'), true, 'he knows he holds the enemy Commander')
    const never = unseen.find(c => c.id !== offered.id)
    if (never) {
      const refused = await app.api('POST', `/api/seat/${seats.blue}/answer`, { offer: blue.captive.offer.id, more: [offered.id, never.id] })
      assert.equal(refused.status, 409)
      assert.match(refused.body.error, /only for enemy units your side has seen/)
    }
    assert.equal((await app.api('POST', `/api/seat/${seats.red}/answer`, { offer: blue.captive.offer.id, accept: true })).status, 409, 'the captive cannot answer his own offer')
  } finally { await app.close() }
})

// A two-player battle with red's Commander taken by hand (the engine's own
// rule is tested elsewhere) and a friend, without a Commander, holding him.
async function heldByAFriend(app, store) {
  const red = (await app.api('POST', '/api/commanders')).body
  const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 3, commander: red.token })).body.seats
  await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: null })
  Object.assign(store.seatOf(seats.red).entry.game.battle.commanders.red, { status: 'held', heldBy: 'blue_swords' })
  return { red, seats }
}

test('an accepted offer of several units: each officer goes to the enemy, and a unit with no officer starts its count again', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { red, seats } = await heldByAFriend(app, store)
    const tent = (await app.api('GET', `/api/seat/${seats.red}`)).body
    const id = (name) => tent.commander.chips.find(c => c.name === name).id
    assert.equal((await app.api('POST', `/api/seat/${seats.red}/offer`, { units: [id('Spears'), id('Swords')] })).body.status, 'on the table')
    const offer = (await app.api('GET', `/api/seat/${seats.blue}`)).body.captive.offer.id
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/answer`, { offer, accept: true })).body.status, 'finished')
    const end = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.deepEqual(end.verdict.commander, { fate: 'ransomed', price: 'Spears', prices: ['Spears', 'Swords'] })
    assert.equal(end.verdict.officers.find(o => o.unit === 'Spears').fate, 'given up')
    const company = (await app.api('GET', `/api/commander/${red.token}`)).body
    assert.deepEqual(company.officers, [], 'his veteran went with the spears')
    assert.ok(company.fallen.some(f => f.led === 'spears' && f.fate === 'given up'))
    assert.deepEqual(company.unled.find(u => u.kind === 'swords'), { kind: 'swords', battles: 0 }, 'no officer to give, but its count starts again')
    assert.deepEqual(company.unled.find(u => u.kind === 'archers'), { kind: 'archers', battles: 1 }, 'the units he kept are a battle nearer an officer')
  } finally { await app.close() }
})

test('the field alone, accepted, ends the battle and costs him no unit and no officer', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { red, seats } = await heldByAFriend(app, store)
    await app.api('POST', `/api/seat/${seats.red}/offer`, { units: [] })
    const blue = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    await app.api('POST', `/api/seat/${seats.blue}/answer`, { offer: blue.captive.offer.id, accept: true })
    const end = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.deepEqual([end.battle.outcome.winner, end.battle.outcome.reason], ['blue', 'enemy commander bargained'])
    assert.deepEqual(end.verdict.commander, { fate: 'ransomed', price: null, prices: [] })
    assert.equal(end.verdict.officers.some(o => o.fate === 'given up'), false)
    const company = (await app.api('GET', `/api/commander/${red.token}`)).body
    assert.equal(company.officers.length, 1, 'his veteran is still his')
  } finally { await app.close() }
})

test('a friend who holds him may refuse, ask for more, or say nothing; the captive sees each answer', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { seats } = await heldByAFriend(app, store)
    await app.api('POST', `/api/seat/${seats.red}/offer`, { units: [] })
    let blue = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    assert.ok(blue.battle.table, 'the captor\'s page sees an offer has come')
    await app.api('POST', `/api/seat/${seats.blue}/answer`, { offer: blue.captive.offer.id, refuse: true })
    let red = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.deepEqual(red.commander.table, { offer: null, mayOffer: false, answer: { kind: 'refused' }, counter: null })
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/answer`, { offer: 1, accept: true })).status, 409, 'nothing left to accept')
    // Ignored: a turn runs, and nothing changes but the turn.
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: '' })
    await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })
    await app.api('POST', `/api/seat/${seats.red}/offer`, { units: [] })
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: '' })
    await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })
    red = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.equal(red.battle.status, 'your-orders')
    assert.deepEqual(red.commander.table.offer, { id: 2, units: [] }, 'still on the table, unanswered')
    assert.equal(red.commander.table.mayOffer, true)
  } finally { await app.close() }
})

test('the Army tab offers "ride with them" only for a unit beside the one he rides with, and the order reads back and runs', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders')).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })).body.seats.red
    const game = store.seatOf(seat).entry.game
    let tent = (await app.api('GET', `/api/seat/${seat}`)).body
    const { commanders, world, broken } = game.battle
    for (const u of tent.own) assert.equal(Boolean(u.canRide), canRide(commanders, world, broken, 'red', u.id).ok, u.name)
    // Bring the swords beside him.
    const withHim = world.units.find(u => u.id === tent.commander.unitId)
    const swords = world.units.find(u => u.id === 'red_swords')
    swords.position = { x: withHim.position.x + 1, y: withHim.position.y }
    tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.equal(tent.own.find(u => u.name === 'Swords').canRide, true)
    const read = (await app.api('POST', `/api/seat/${seat}/read`, { text: 'I ride with the swords' })).body
    assert.deepEqual(read.understood, ['You: ride with Swords'])
    await app.api('POST', `/api/seat/${seat}/orders`, { text: 'I ride with the swords' })
    tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.equal(tent.commander.with, 'Swords')
    assert.ok(tent.dispatches[0].lines.some(l => /^You rode over from Spears to Swords/.test(l)))
    // Far from the spears now.
    swords.position = { x: withHim.position.x + 8, y: withHim.position.y }
    const tooFar = (await app.api('POST', `/api/seat/${seat}/read`, { text: 'commander to the spears' })).body
    assert.match(tooFar.questions[0], /^Spears are \d+ tiles \(about \d+ m\) from Swords, whom you ride with/)
  } finally { await app.close() }
})
