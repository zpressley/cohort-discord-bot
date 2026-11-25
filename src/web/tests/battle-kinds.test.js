// src/web/tests/battle-kinds.test.js
//
// The kinds of battle, through the server (ruled 2026-11-25): chosen at the
// muster, kept in the battle's spec, named in the tent, the verdict and the
// list of battles; and Crownhill's three fords, two of them to hold.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { waitingOn } = require('../../engine/orchestrator')
const { kindsOf, MAPS } = require('../../data/maps')

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
  return { api, store, close: () => new Promise(resolve => server.close(resolve)) }
}
const mustered = async (app, body) => (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 7, faction: 'rome', enemyFaction: 'han', ...body })).body
async function untilOver(app, seats, text = 'everyone hold') {
  const game = app.store.seatOf(seats.red).entry.game
  for (let i = 0; i < 60 && !game.outcome.decided; i++) {
    for (const side of waitingOn(game)) if (seats[side]) await app.api('POST', `/api/seat/${seats[side]}/orders`, { text })
  }
  return game
}

test('every field offers the pitched battle, and a field made for ground its battle for ground too: the pitched battle first, each with a line on how it is won', async () => {
  const app = await start()
  try {
    const maps = (await app.api('GET', '/api/maps')).body
    for (const m of maps) {
      assert.deepEqual(m.kinds.map(k => k.id), ['pitched', 'ground'], m.id)
      assert.equal(m.kinds[0].title, 'A pitched battle')
      assert.match(m.kinds[0].said, /^No ground to fight for: army against army\. Break the enemy, or make him yield the field\. If night falls first, an army still standing with half the men it began the day with/)
      assert.equal(m.kinds[1].title, 'A battle for ground')
      assert.match(m.kinds[1].said, /The ground to fight for: /)
    }
    const said = (id) => maps.find(m => m.id === id).kinds[1].said
    assert.match(said('crownhill'), /The ground to fight for: the North Ford, Miller's Crossing and the South Ford\. Hold two of the three fords alone for 1 h/)
    assert.match(said('thornwood'), /^King of the hill\. The ground to fight for: Thorn Knoll\./)
    assert.match(said('ashford'), /the Old Mill Bridge/)
    assert.match(said('ravenridge'), /Raven Gap/)
    assert.match(said('greywater'), /Elderby/)
  } finally { await app.close() }
})

test('which kind a field offers first is one line of data on the field: swapped, the battle for ground is offered first', () => {
  const was = MAPS.ashford.kinds
  try {
    MAPS.ashford.kinds = ['ground', 'pitched']
    assert.deepEqual(kindsOf('ashford'), ['ground', 'pitched'])
  } finally { MAPS.ashford.kinds = was }
  assert.deepEqual(kindsOf('ashford'), ['pitched', 'ground'])
})

test('a battle mustered with no kind named is the kind the field offers first, the pitched battle; one named is that kind, and its spec says so', async () => {
  const app = await start()
  try {
    const plain = await mustered(app, { map: 'ashford' })
    const spec = app.store.seatOf(plain.seats.red).entry.game.spec
    assert.equal(spec.kind, 'pitched')
    assert.equal((spec.objectives ?? []).length, 0, 'no ground to fight for')
    const ground = await mustered(app, { map: 'crownhill', kind: 'ground' })
    const g = app.store.seatOf(ground.seats.red).entry.game.spec
    assert.equal(g.kind, 'ground')
    assert.deepEqual(g.objectives.map(o => o.name), ['the North Ford', 'Miller\'s Crossing', 'the South Ford'])
    assert.equal(g.objectivesNeeded, 2)
    assert.equal(g.groundCalled, 'fords')
  } finally { await app.close() }
})

test('the tent of a pitched battle says there is no ground and how it is won, its list line names the kind, and its first dispatch says so', async () => {
  const app = await start()
  try {
    const made = await mustered(app, { map: 'crownhill', kind: 'pitched' })
    let tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.deepEqual(tent.objectives, [])
    assert.match(tent.groundLine, /^A pitched battle: no ground to fight for\./)
    assert.equal(tent.battle.kindTitle, 'A pitched battle')
    await app.api('POST', `/api/seat/${made.seats.red}/orders`, { text: 'everyone hold' })
    tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.match(tent.dispatches[0].lines.join('\n'), /A pitched battle: no ground to fight for/)
    assert.doesNotMatch(tent.dispatches[0].lines.join('\n'), /The ground to fight for/)
  } finally { await app.close() }
})

test('a pitched battle that night ends with both armies whole is a tie, so said in the verdict, and the next day may still be called', async () => {
  const app = await start()
  try {
    const made = await mustered(app, { map: 'ashford', kind: 'pitched', turnLimit: 2 })
    const game = await untilOver(app, made.seats)
    assert.deepEqual([game.outcome.winner, game.outcome.reason], ['draw', 'night fell'])
    const tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.match(tent.battle.outcome.said, /^night fell with both armies still standing, each with half its men or more: neither side has won/)
    assert.equal(tent.verdict.night.again, 'Fight again the next day')
    const again = await app.api('POST', `/api/seat/${made.seats.red}/again`)
    assert.equal(again.status, 201)
    assert.equal(app.store.seatOf(again.body.token).entry.game.spec.kind, 'pitched', 'the next day is the same kind of battle')
  } finally { await app.close() }
})

test('a pitched battle won at nightfall is a victory for the army still standing, and the verdict says why in his words', () => {
  const store = createBattleStore({})
  const commander = store.commanders.create({ faction: 'rome' })
  const { seats } = store.muster({ map: 'ashford', side: 'red', seed: 7, commander: commander.token, faction: 'rome', enemyFaction: 'han', kind: 'pitched' })
  const game = store.seatOf(seats.red).entry.game
  // Half the enemy's men gone at nightfall.
  for (const u of game.battle.world.units.filter(u => u.side === 'blue')) u.strength = Math.floor(u.strength * 0.4)
  game.outcome = { decided: true, winner: 'red', reason: 'field held at nightfall' }
  const red = store.summary(seats.red).outcome
  assert.match(red.said, /^Night fell with your army still standing, half its men or more in the ranks, and the enemy's beaten: you held the field/)
  const page = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  assert.ok(page.includes('\'field held at nightfall\''), 'the verdict has words for it')
})

test('on Crownhill\'s three fords the tent says who holds which, as every side knows it, and how many must be held: two of the three', async () => {
  const app = await start()
  try {
    const made = await mustered(app, { map: 'crownhill', kind: 'ground', opponent: 'friend' })
    const red = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.equal(red.groundLine, 'You hold none of the fords: hold two of the three fords alone for 1 h and the field is yours.')
    assert.deepEqual(red.groundHold, { needed: 2, called: 'fords' })
    // Red's men on two fords: both sides are told, each in his own words.
    const game = app.store.seatOf(made.seats.red).entry.game
    game.objectiveHolds['ground-1'] = { side: 'red', turns: 0, sinceMinute: 0 }
    game.objectiveHolds['ground-2'] = { side: 'red', turns: 0, sinceMinute: 0 }
    game.fieldHold = { side: 'red', sinceMinute: 0 }
    const mine = (await app.api('GET', `/api/seat/${made.seats.red}`)).body.groundLine
    const theirs = (await app.api('GET', `/api/seat/${made.seats.blue}`)).body.groundLine
    assert.equal(mine, 'You hold the North Ford and Miller\'s Crossing: hold two of the three fords alone for 1 h and the field is yours. 1 h more and it is.')
    assert.equal(theirs, 'You hold none of the fords; the enemy holds the North Ford and Miller\'s Crossing: hold two of the three fords alone for 1 h and the field is yours. The enemy holds as many: take one from him within 1 h, or the field is his.')
  } finally { await app.close() }
})

test('the first dispatch of a battle for the fords gives the rule: two of the three, alone, for an hour', async () => {
  const app = await start()
  try {
    const made = await mustered(app, { map: 'crownhill', kind: 'ground' })
    await app.api('POST', `/api/seat/${made.seats.red}/orders`, { text: 'everyone hold' })
    const lines = (await app.api('GET', `/api/seat/${made.seats.red}`)).body.dispatches[0].lines
    assert.equal(lines[0], 'The ground to fight for: the North Ford, Miller\'s Crossing and the South Ford. Hold two of the three fords alone for 1 h, with no enemy on them or beside them, and the field is yours: the time runs while you hold as many. Let the enemy hold as many as long, and the field is his.')
  } finally { await app.close() }
})

test('a saved battle replays with its kind and its grounds', async () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cohort-kinds-'))
  try {
    const store = createBattleStore({ dir })
    const app = await start(store)
    let seat
    try {
      const made = await mustered(app, { map: 'crownhill', kind: 'ground', seed: 9 })
      seat = made.seats.red
      for (let i = 0; i < 4; i++) await app.api('POST', `/api/seat/${seat}/orders`, { text: i === 0 ? 'everyone take the fords' : '' })
    } finally { await app.close() }
    const was = store.seatOf(seat).entry.game
    const now = createBattleStore({ dir }).seatOf(seat).entry.game
    assert.equal(now.spec.kind, 'ground')
    assert.equal(now.spec.objectivesNeeded, 2)
    assert.equal(now.objectives.length, 3)
    assert.deepEqual(now.battle.log.all(), was.battle.log.all())
    assert.deepEqual(now.fieldHold, was.fieldHold)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('the first turn\'s example orders fit the kind: "everyone take the fords" on the fords, no ground to take in a pitched battle', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  assert.match(page, /v\.groundHold \? \[`everyone take the \$\{v\.groundHold\.called\}`\]/)
  // A pitched battle sends no ground (objectives []), so no "take" order.
  assert.match(page, /\(v\.objectives \?\? \[\]\)\.slice\(0, 1\)\.map\(o => `everyone take \$\{o\.name\}`\)/)
})
