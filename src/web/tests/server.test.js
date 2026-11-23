// src/web/tests/server.test.js
//
// The web app's server, through its HTTP API: muster, the Command Tent's
// view, read-back, orders, turns, two players by link, saved battles
// surviving a restart, and fog of war held on the server.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')

async function start(store = createBattleStore({})) {
  const server = createServer(store)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const api = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    })
    return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() }
  }
  return { server, base, api, close: () => new Promise(resolve => server.close(resolve)) }
}

test('muster alone: one seat, the tent opens on your orders', async () => {
  const app = await start()
  try {
    const { status, body } = await app.api('POST', '/api/battles', { scenario: 'meeting-battle', opponent: 'standing', side: 'red', seed: 3 })
    assert.equal(status, 201)
    assert.deepEqual(Object.keys(body.seats), ['red'], 'no link for the standing orders')

    const tent = (await app.api('GET', `/api/seat/${body.seats.red}`)).body
    assert.equal(tent.battle.side, 'red')
    assert.equal(tent.battle.status, 'your-orders')
    assert.equal(tent.battle.opponent, 'standing')
    assert.equal(tent.map.width, 40)
    assert.equal(tent.map.terrain.length, 40)
    assert.ok(tent.own.length > 0 && tent.own.every(u => u.name && u.at && u.order))
  } finally { await app.close() }
})

test('read back, then send: alone, the turn runs at once and a dispatch arrives', async () => {
  const app = await start()
  try {
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red' })).body.seats.red
    const read = (await app.api('POST', `/api/seat/${token}/read`, { text: 'spears to the ridge to the west' })).body
    assert.equal(read.questions.length, 0)
    assert.match(read.understood[0], /^Spears: march to Shepherd's Ridge/)

    const asked = (await app.api('POST', `/api/seat/${token}/orders`, { text: 'spears to the ford' })).body
    assert.equal(asked.status, 'clarify', 'a question sends nothing')
    assert.equal((await app.api('GET', `/api/seat/${token}`)).body.battle.turn, 1)

    const sent = (await app.api('POST', `/api/seat/${token}/orders`, { text: 'everyone advance' })).body
    assert.equal(sent.status, 'turn-ran')
    const tent = (await app.api('GET', `/api/seat/${token}`)).body
    assert.equal(tent.battle.turn, 2)
    assert.equal(tent.dispatches.length, 1)
    assert.ok(tent.dispatches[0].lines.length > 0)
  } finally { await app.close() }
})

test('two players by link: the turn waits for both, and orders can change until it runs', async () => {
  const app = await start()
  try {
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red' })).body.seats
    assert.deepEqual(Object.keys(seats).sort(), ['blue', 'red'])

    const first = (await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone hold' })).body
    assert.equal(first.status, 'waiting')
    let red = (await app.api('GET', `/api/seat/${seats.red}/summary`)).body
    assert.equal(red.status, 'waiting')
    assert.match((await app.api('GET', `/api/seat/${seats.red}`)).body.pending.text, /hold/)

    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone advance' })
    const blue = (await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })).body
    assert.equal(blue.status, 'turn-ran')
    red = (await app.api('GET', `/api/seat/${seats.red}/summary`)).body
    assert.equal(red.status, 'your-orders')
    assert.equal(red.turn, 2)

    const listed = (await app.api('GET', `/api/seats?tokens=${seats.red},${seats.blue},nonsense`)).body
    assert.deepEqual(listed.map(s => s.side), ['red', 'blue'])
  } finally { await app.close() }
})

test('fog of war is held on the server: a side never receives an enemy it has not seen', async () => {
  const app = await start()
  try {
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 5 })).body.seats
    const raw = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.deepEqual(raw.enemies, [], 'nothing seen yet')
    assert.equal(JSON.stringify(raw).includes('blue_'), false, 'not a single enemy id anywhere in the answer')
  } finally { await app.close() }
})

test('a battle survives the server stopping', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-web-'))
  try {
    let app = await start(createBattleStore({ dir }))
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 9 })).body.seats.red
    await app.api('POST', `/api/seat/${token}/orders`, { text: 'everyone advance' })
    const before = (await app.api('GET', `/api/seat/${token}`)).body
    await app.close()

    app = await start(createBattleStore({ dir }))
    const after = (await app.api('GET', `/api/seat/${token}`)).body
    assert.deepEqual(after.own, before.own, 'the same army, rebuilt from the order log')
    assert.deepEqual(after.dispatches, before.dispatches)
    await app.close()
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('unknown links, bad requests and paths outside the app are refused', async () => {
  const app = await start()
  try {
    assert.equal((await app.api('GET', '/api/seat/not-a-real-token')).status, 404)
    assert.equal((await app.api('GET', '/static/..%2fbattles.js')).status, 404)
    assert.equal((await app.api('GET', '/themes/..%2f..%2fbattles.js')).status, 404)
    assert.doesNotMatch((await app.api('GET', '/static/../battles.js')).body, /createBattleStore/, 'never the server source')
    const res = await fetch(app.base + '/api/battles', { method: 'POST', body: '{nope', headers: { 'Content-Type': 'application/json' } })
    assert.equal(res.status, 400)
    const page = await app.api('GET', '/b/anything')
    assert.match(page.body, /<title>Cohort/)
  } finally { await app.close() }
})

test('a finished battle shows the verdict and replays turn by turn, as this side saw it', async () => {
  const app = await start()
  try {
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3 })).body.seats.red
    assert.equal((await app.api('GET', `/api/seat/${token}/replay?turn=1`)).status, 409, 'no replay while the battle is on')

    let tent
    for (let i = 0; i < 40; i++) {
      await app.api('POST', `/api/seat/${token}/orders`, { text: i === 0 ? 'everyone advance' : '' })
      tent = (await app.api('GET', `/api/seat/${token}`)).body
      if (tent.battle.status === 'finished') break
    }
    assert.equal(tent.battle.status, 'finished')
    assert.ok(tent.battle.outcome.winner)
    const sides = Object.keys(tent.verdict.sides).sort()
    assert.deepEqual(sides, ['blue', 'red'])
    for (const s of sides) {
      const n = tent.verdict.sides[s]
      assert.ok(n.standing >= 0 && n.fled >= 0 && n.fallen >= 0)
    }

    const start0 = (await app.api('GET', `/api/seat/${token}/replay?turn=0`)).body
    assert.equal(start0.turn, 0)
    assert.equal(start0.battle.minutes, 0)
    assert.deepEqual(start0.enemies, [], 'before the first orders nothing was seen')
    const one = (await app.api('GET', `/api/seat/${token}/replay?turn=1`)).body
    assert.equal(one.turn, 1)
    assert.ok(one.battle.minutes > 0)
    assert.equal(JSON.stringify(start0).includes('"side":"blue"'), false)
  } finally { await app.close() }
})

test('a battle can be mustered on any map', async () => {
  const app = await start()
  try {
    const maps = (await app.api('GET', '/api/maps')).body
    assert.deepEqual(maps.map(m => m.id).sort(), ['ashford', 'crownhill', 'ravenridge', 'thornwood'])
    const token = (await app.api('POST', '/api/battles', { map: 'thornwood', scenario: 'legions-vs-celts', opponent: 'standing', side: 'red' })).body.seats.red
    const tent = (await app.api('GET', `/api/seat/${token}`)).body
    assert.equal(tent.map.name, 'thornwood')
    assert.match(tent.battle.title, /^Thornwood: Legions and Celts$/)
    assert.ok(tent.map.landmarks.some(l => l.name === "Hermit's Glade"))
    const sent = (await app.api('POST', `/api/seat/${token}/orders`, { text: 'everyone advance' })).body
    assert.equal(sent.status, 'turn-ran')
  } finally { await app.close() }
})

test('a question comes with choices; a finished battle tells what became of your captains', async () => {
  const app = await start()
  try {
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3 })).body.seats.red
    const asked = (await app.api('POST', `/api/seat/${token}/orders`, { text: 'spears to the ford' })).body
    assert.equal(asked.status, 'clarify')
    assert.equal(asked.choices[0].place, 'the ford')
    assert.ok(asked.choices[0].options.some(o => o.text === "Miller's Crossing" && /east/.test(o.label) && o.square))

    let tent
    for (let i = 0; i < 40; i++) {
      await app.api('POST', `/api/seat/${token}/orders`, { text: i === 0 ? 'everyone advance' : '' })
      tent = (await app.api('GET', `/api/seat/${token}`)).body
      if (tent.battle.status === 'finished') break
    }
    const officers = tent.verdict.officers
    assert.equal(officers.length, tent.own.length + tent.fallen.length, 'one captain per unit')
    for (const o of officers) assert.ok(['killed', 'captured', 'wounded', 'unhurt'].includes(o.fate))
    const again = (await app.api('GET', `/api/seat/${token}`)).body
    assert.deepEqual(again.verdict.officers, officers, 'the same story every time')
  } finally { await app.close() }
})

// ── Review, November 2026 ──────────────────────────────

test('your units hold until ordered; only the computer\'s side advances of its own accord', async () => {
  const app = await start()
  try {
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3 })).body.seats.red
    const before = (await app.api('GET', `/api/seat/${token}`)).body
    assert.ok(before.own.every(u => u.order === 'holding (no orders yet)'))
    // Crownhill is fought across the river now, not in its north-west corner.
    assert.ok(before.own.every(u => /^[BC][67]/.test(u.at)), before.own.map(u => u.at).join(' '))

    const sent = (await app.api('POST', `/api/seat/${token}/orders`, { text: '' })).body
    assert.equal(sent.status, 'turn-ran')
    const after = (await app.api('GET', `/api/seat/${token}`)).body
    assert.deepEqual(after.own.map(u => u.at), before.own.map(u => u.at), 'no one moved without an order')

    await app.api('POST', `/api/seat/${token}/orders`, { text: 'horse seek and destroy' })
    const hunting = (await app.api('GET', `/api/seat/${token}`)).body
    assert.equal(hunting.own.find(u => u.name === 'Horse').order, 'advancing on the enemy')
    assert.equal(hunting.own.find(u => u.name === 'Spears').order, 'holding (no orders yet)')
  } finally { await app.close() }
})

test('one unclear order does not throw away the others: the clear ones can be sent', async () => {
  const app = await start()
  try {
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3 })).body.seats.red
    const text = 'spears to the ford\nswords to the ridge to the west'
    const asked = (await app.api('POST', `/api/seat/${token}/orders`, { text })).body
    assert.equal(asked.status, 'clarify')
    assert.equal(asked.canSendRest, true)
    assert.equal((await app.api('GET', `/api/seat/${token}`)).body.battle.turn, 1, 'nothing sent yet')

    const sent = (await app.api('POST', `/api/seat/${token}/orders`, { text, sendClear: true })).body
    assert.equal(sent.status, 'turn-ran')
    assert.match(sent.notes[0], /^Not sent: Which ford/)
    const tent = (await app.api('GET', `/api/seat/${token}`)).body
    assert.match(tent.own.find(u => u.name === 'Swords').order, /^marching to/)
    assert.equal(tent.own.find(u => u.name === 'Spears').order, 'holding (no orders yet)')

    // Nothing understood at all: there is no "rest" to send.
    const none = (await app.api('POST', `/api/seat/${token}/orders`, { text: 'spears to the ford', sendClear: true })).body
    assert.equal(none.status, 'clarify')
    assert.equal(none.canSendRest, false)
  } finally { await app.close() }
})

test('archers shoot: the order is read, the Army tab says how far, and the dispatch tells it', async () => {
  const app = await start()
  try {
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 1 })).body.seats.red
    const read = (await app.api('POST', `/api/seat/${token}/read`, { text: 'archers shoot the horse\nspears shoot' })).body
    assert.match(read.understood[0], /^Archers: hold, and shoot at any enemy they can see within 200 m, cavalry first$/)
    assert.match(read.questions[0], /^Spears cannot shoot/)

    const before = (await app.api('GET', `/api/seat/${token}`)).body
    assert.equal(before.own.find(u => u.name === 'Archers').shootsTo, 200)
    assert.equal(before.own.find(u => u.name === 'Spears').shootsTo, null)

    // Go and find them (the computer may be holding its ground): the
    // archers close until they can shoot, and shoot.
    let tent
    for (let i = 0; i < 14; i++) {
      await app.api('POST', `/api/seat/${token}/orders`, { text: i === 0 ? 'everyone advance' : '' })
      tent = (await app.api('GET', `/api/seat/${token}`)).body
      if (tent.dispatches.some(d => d.lines.some(l => /^Archers: .*shot at enemy/.test(l)))) break
    }
    assert.ok(tent.dispatches.some(d => d.lines.some(l => /^Archers: .*shot at enemy/.test(l))), 'a volley is in the dispatch')
  } finally { await app.close() }
})

test('officers: named on the Army tab, counsel before a deep order, and the chain is carried', async () => {
  const app = await start()
  try {
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 2 })).body.seats.red
    const tent = (await app.api('GET', `/api/seat/${token}`)).body
    assert.ok(tent.own.every(u => u.officer.name && ['green', 'seasoned', 'veteran'].includes(u.officer.grade) && ['bold', 'steady', 'cautious'].includes(u.officer.personality)))
    assert.equal(JSON.stringify(tent.enemies).includes('officer'), false)

    const green = tent.own.find(u => u.officer.grade === 'green')
    const sage = tent.own.find(u => u.officer.grade !== 'green')
    const text = `${green.name} to D6, then on to E6, then dig in`
    const read = (await app.api('POST', `/api/seat/${token}/read`, { text })).body
    assert.match(read.understood[0], new RegExp(`^${green.name}: march to D6 \\(D6-NW\\); then march to E6 \\(E6-NW\\) and hold it$`))
    assert.match(read.counsel[0], new RegExp(`^${sage.officer.name} of ${sage.name} warns: ${green.officer.name} of ${green.name} is green\\.`))
    assert.deepEqual((await app.api('POST', `/api/seat/${token}/read`, { text: `${green.name} to D6` })).body.counsel, [])

    const sent = (await app.api('POST', `/api/seat/${token}/orders`, { text })).body
    assert.equal(sent.status, 'turn-ran')
    const after = (await app.api('GET', `/api/seat/${token}`)).body
    const told = after.dispatches.flatMap(d => d.lines).join(' / ')
    assert.equal(/grasp|clauses/.test(told), false, 'the roll itself is not told')
  } finally { await app.close() }
})

// ── Officers who go from battle to battle ──────────────

async function fight(app, token) {
  let tent
  for (let i = 0; i < 60; i++) {
    await app.api('POST', `/api/seat/${token}/orders`, { text: i === 0 ? 'everyone advance' : '' })
    tent = (await app.api('GET', `/api/seat/${token}`)).body
    if (tent.battle.status === 'finished') break
  }
  assert.equal(tent.battle.status, 'finished')
  return tent
}

test('a Commander starts with one officer, his veteran; the other units earn theirs, battle by battle', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-web-'))
  let app
  try {
    app = await start(createBattleStore({ dir }))
    const made = (await app.api('POST', '/api/commanders')).body
    const commander = made.token
    assert.deepEqual((await app.api('GET', `/api/commander/${commander}`)).body,
      { name: made.name, ended: null, battles: 0, officers: [], unled: [], earnedAt: [3, 4], fallen: [], battle: null })

    const first = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })).body.seats.red
    const mustered = (await app.api('GET', `/api/commander/${commander}`)).body
    const tent = (await app.api('GET', `/api/seat/${first}`)).body
    assert.deepEqual(mustered.officers.map(o => [o.leads, o.grade, typeof o.name]), [['spears', 'veteran', 'string']], 'one officer, with the best unit')
    assert.deepEqual(mustered.unled, [{ kind: 'swords', battles: 0 }, { kind: 'archers', battles: 0 }, { kind: 'horse', battles: 0 }])
    assert.equal(tent.own[0].officer.name, mustered.officers[0].name)
    assert.deepEqual(tent.own.slice(1).map(u => u.officer), [{ headless: true }, { headless: true }, { headless: true }])

    const ended = await fight(app, first)
    assert.equal(ended.verdict.company, true)
    const after = (await app.api('GET', `/api/commander/${commander}`)).body
    assert.equal(after.battles, 1)
    const fates = new Map(ended.verdict.officers.map(o => [o.unit.toLowerCase(), o]))
    const veteran = after.officers.find(o => o.leads === 'spears')
    if (['killed', 'captured'].includes(fates.get('spears').fate)) {
      assert.equal(veteran, undefined, 'the lost leave the company')
      assert.ok(after.fallen.some(f => f.led === 'spears'))
    } else {
      assert.equal(veteran.experience, mustered.officers[0].experience + 1, 'a battle lived through is a battle learned from')
      assert.equal(veteran.record.length, 1)
      assert.ok(veteran.record[0].deeds.length > 0, 'what his unit did')
      assert.deepEqual(veteran.record[0].orders, ['advance on the enemy'], 'and what he was told')
    }
    for (const kind of ['swords', 'archers', 'horse']) {
      assert.equal(fates.get(kind).fate, 'unhurt', 'no officer to lose')
      assert.deepEqual(after.unled.find(u => u.kind === kind), { kind, battles: fates.get(kind).destroyed ? 0 : 1 }, 'a battle nearer to an officer')
    }
    // Looking again changes nothing: the battle is written in once.
    await app.api('GET', `/api/seat/${first}`)
    assert.deepEqual((await app.api('GET', `/api/commander/${commander}`)).body, after)
    await app.close()
    app = null

    // The company is kept on the server, and later battles draw on it.
    app = await start(createBattleStore({ dir }))
    assert.deepEqual((await app.api('GET', `/api/commander/${commander}`)).body, after)
    let company = after
    for (let n = 2; n <= 6 && !company.ended && company.unled.length > 0; n++) {
      const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 10 + n, commander })).body.seats.red
      await fight(app, seat)
      company = (await app.api('GET', `/api/commander/${commander}`)).body
      if (n < 3) assert.equal(company.officers.filter(o => o.leads !== 'spears').length, 0, 'no one comes forward before the third battle')
    }
    if (!company.ended) {
      const earned = company.officers.filter(o => o.leads !== 'spears')
      assert.ok(earned.length > 0, 'officers have come forward')
      for (const o of earned) {
        assert.equal(typeof o.name, 'string')
        assert.ok(o.experience >= 3)
        assert.equal(o.record.at(-1).named, true, 'his record begins where he came forward')
      }
    }
  } finally {
    await app?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('without a Commander, or with a link the server does not know, a battle musters as before', async () => {
  const app = await start()
  try {
    assert.equal((await app.api('GET', '/api/commander/not-a-real-token')).status, 404)
    const token = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander: 'not-a-real-token' })).body.seats.red
    const plain = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3 })).body.seats.red
    const a = (await app.api('GET', `/api/seat/${token}`)).body
    const b = (await app.api('GET', `/api/seat/${plain}`)).body
    assert.deepEqual(a.own, b.own)
    assert.equal((await fight(app, plain)).verdict.company, false)
  } finally { await app.close() }
})

test('an army fights one battle at a time; another Commander can take the field meanwhile', async () => {
  const app = await start()
  try {
    const first = (await app.api('POST', '/api/commanders')).body
    const second = (await app.api('POST', '/api/commanders')).body
    assert.notEqual(first.name, second.name, 'told apart by name')

    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander: first.token })).body.seats.red
    const inField = (await app.api('GET', `/api/commander/${first.token}`)).body
    assert.deepEqual(inField.battle, { title: 'Crownhill: the meeting battle', seat }, 'he knows where his army is')

    const refused = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander: first.token })
    assert.equal(refused.status, 409)
    assert.match(refused.body.error, new RegExp(`${first.name}'s army is in the field`))
    const company = (await app.api('GET', `/api/commander/${first.token}`)).body
    assert.deepEqual(company, inField, 'and nothing was mustered')

    // A second Commander has an army of his own.
    const other = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander: second.token })
    assert.equal(other.status, 201)

    // The battle over, the first army can muster again.
    await fight(app, seat)
    assert.equal((await app.api('GET', `/api/commander/${first.token}`)).body.battle, null)
    assert.equal((await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 5, commander: first.token })).status, 201)
  } finally { await app.close() }
})

// ── The Commander on the field ─────────────────────────

test('the Commander rides with his best unit; taken, he sends no orders and can give up a unit to go free', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders')).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })).body.seats.red
    let tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual(tent.commander, { status: 'free', unitId: tent.own[0].id, with: 'Spears', heldBy: null, chips: [] })

    // Taken (set by hand here; the engine's own rule is tested in
    // engine/command/tests/commander.test.js).
    const game = store.seatOf(seat).entry.game
    Object.assign(game.battle.commanders.red, { status: 'held', heldBy: 'blue_swords' })
    tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.equal(tent.commander.status, 'held')
    assert.equal(tent.commander.heldBy, 'enemy swords')
    assert.deepEqual(tent.commander.chips.map(c => c.name).sort(), ['Archers', 'Horse', 'Spears', 'Swords'])

    const before = tent.own.map(u => u.order)
    const sent = (await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone advance' })).body
    assert.deepEqual(sent.understood, [], 'his words reach no one')
    tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual(tent.own.map(u => u.order), before, 'the units keep the orders they had')

    assert.equal((await app.api('POST', `/api/seat/${seat}/bargain`, { unit: 'blue_swords' })).status, 409, 'not his to give')
    const spears = tent.own.find(u => u.name === 'Spears').id
    assert.equal((await app.api('POST', `/api/seat/${seat}/bargain`, { unit: spears })).body.status, 'finished')
    tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual([tent.battle.outcome.winner, tent.battle.outcome.reason], ['blue', 'enemy commander bargained'])
    assert.deepEqual(tent.verdict.commander, { fate: 'ransomed', price: 'Spears' })
    assert.equal(tent.verdict.officers.find(o => o.unit === 'Spears').fate, 'given up')

    const company = (await app.api('GET', `/api/commander/${commander}`)).body
    assert.equal(company.ended, null, 'he lives, and so does his company')
    assert.deepEqual(company.officers, [], 'less the veteran, who went with the spears')
    assert.ok(company.fallen.some(f => f.led === 'spears' && f.fate === 'given up'))
    assert.deepEqual(company.unled.find(u => u.kind === 'spears'), { kind: 'spears', battles: 0 }, 'they must earn another')
  } finally { await app.close() }
})

test('a Commander killed loses the battle and everything with it; his name stays, and he musters no more', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const made = (await app.api('POST', '/api/commanders')).body
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander: made.token })).body.seats.red
    store.seatOf(seat).entry.game.battle.commanders.red.status = 'killed'
    await app.api('POST', `/api/seat/${seat}/orders`, { text: '' })
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual([tent.battle.status, tent.battle.outcome.winner, tent.battle.outcome.reason], ['finished', 'blue', 'enemy commander killed'])
    assert.equal(tent.verdict.commander.fate, 'killed')

    const company = (await app.api('GET', `/api/commander/${made.token}`)).body
    assert.deepEqual(company.ended, { how: 'killed', at: 'Crownhill: the meeting battle' })
    assert.equal(company.name, made.name, 'the name lives on in the record')
    const refused = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander: made.token })
    assert.equal(refused.status, 409)
    assert.match(refused.body.error, /was killed at Crownhill/)

    // No other Commander is ever given his name.
    const names = new Set([made.name])
    for (let i = 0; i < 40; i++) names.add((await app.api('POST', '/api/commanders')).body.name)
    assert.equal(names.size, 41)
  } finally { await app.close() }
})

test('held when the battle is lost: the enemy takes his best unit left on the field; with none left he is lost', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const run = async (strip) => {
      const commander = (await app.api('POST', '/api/commanders')).body.token
      const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })).body.seats.red
      const game = store.seatOf(seat).entry.game
      Object.assign(game.battle.commanders.red, { status: 'held', heldBy: 'blue_swords' })
      for (const u of game.battle.world.units) {
        if (u.side !== 'red') continue
        if (strip) u.strength = 0
        else game.battle.broken.add(u.id)
      }
      for (let i = 0; i < 30; i++) {
        await app.api('POST', `/api/seat/${seat}/orders`, { text: '' })
        if ((await app.api('GET', `/api/seat/${seat}/summary`)).body.status === 'finished') break
      }
      const tent = (await app.api('GET', `/api/seat/${seat}`)).body
      assert.equal(tent.battle.outcome.winner, 'blue')
      return { tent, company: (await app.api('GET', `/api/commander/${commander}`)).body }
    }
    // His army broken, but men of his still on the field as the battle ends.
    const beaten = await run(false)
    if (beaten.tent.verdict.commander.fate === 'ransomed') {
      const price = beaten.tent.verdict.commander.price
      assert.equal(beaten.tent.verdict.officers.find(o => o.unit === price).fate, 'given up')
      assert.equal(beaten.company.ended, null, 'a unit was his price, and he goes on')
    } else {
      // Every man of his had left the field by the end: nothing to give.
      assert.equal(beaten.tent.verdict.commander.fate, 'lost')
    }

    const nothingLeft = await run(true)
    assert.equal(nothingLeft.tent.verdict.commander.fate, 'lost')
    assert.deepEqual(nothingLeft.company.ended, { how: 'lost', at: 'Crownhill: the meeting battle' })
  } finally { await app.close() }
})
