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
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: null })
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
      { name: made.name, faction: null, factionTitle: null, ended: null, battles: 0, officers: [], unled: [], earnedAt: [3, 4], fallen: [], battle: null })

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

test('the Commander rides with his best unit; taken, he sends no orders, and his offers go to the computer, which answers each the same way every time', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders')).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })).body.seats.red
    let tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual(tent.commander, { status: 'free', unitId: tent.own[0].id, with: 'Spears', heldBy: null, heldAt: null, chips: [] })

    // Taken (set by hand here; the engine's own rule is tested in
    // engine/command/tests/commander.test.js).
    const game = store.seatOf(seat).entry.game
    Object.assign(game.battle.commanders.red, { status: 'held', heldBy: 'blue_swords' })
    tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.equal(tent.commander.status, 'held')
    assert.equal(tent.commander.heldBy, 'enemy swords')
    assert.deepEqual(tent.commander.chips.map(c => c.name).sort(), ['Archers', 'Horse', 'Spears', 'Swords'])
    assert.deepEqual(tent.commander.table, { offer: null, mayOffer: true, answer: null, counter: null })

    const sent = (await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone advance' })).body
    assert.deepEqual(sent.understood, [], 'his words reach no one')
    assert.equal((await app.api('POST', `/api/seat/${seat}/read`, { text: 'everyone advance' })).status, 409, 'nor are they read back')

    assert.equal((await app.api('POST', `/api/seat/${seat}/offer`, { units: ['blue_swords'] })).status, 409, 'not his to give')
    const spears = tent.commander.chips.find(c => c.name === 'Spears').id
    const first = (await app.api('POST', `/api/seat/${seat}/offer`, { units: [spears] })).body
    assert.equal((await app.api('POST', `/api/seat/${seat}/offer`, { units: [] })).status === 409 || first.status === 'finished', true,
      'one offer a turn')
    // The computer has answered at once (that the same battle gets the same
    // answer on replay: opponent/tests/captor.test.js).
    tent = (await app.api('GET', `/api/seat/${seat}`)).body
    if (first.status === 'finished') {
      assert.deepEqual([tent.battle.outcome.winner, tent.battle.outcome.reason], ['blue', 'enemy commander bargained'])
      assert.deepEqual(tent.verdict.commander, { fate: 'ransomed', price: 'Spears', prices: ['Spears'] })
    } else {
      assert.ok(['refused', 'more'].includes(tent.commander.table.answer.kind), 'refused, or asked for more')
      assert.equal(tent.commander.table.offer, null, 'an answered offer is off the table')
      assert.equal(tent.commander.table.mayOffer, false)
    }
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

test('held when the battle is lost with no deal: he goes free, alive, a commander of none; his name goes on and he may muster again', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const run = async (strip) => {
      const made = (await app.api('POST', '/api/commanders')).body
      const commander = made.token
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
      return { made, tent, company: (await app.api('GET', `/api/commander/${commander}`)).body }
    }
    for (const strip of [false, true]) {
      const { made, tent, company } = await run(strip)
      assert.deepEqual(tent.verdict.commander, { fate: 'stripped', price: null, prices: [] }, 'no unit is taken as his price')
      assert.equal(company.ended, null, 'he lives')
      assert.equal(company.name, made.name)
      assert.deepEqual(company.officers, [], 'every officer has left him, his veteran too')
      assert.ok(company.fallen.some(f => f.fate === 'left'))
      assert.ok(company.unled.every(u => u.battles === 0), 'every unit must earn an officer from nothing')
      const again = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander: made.token })
      assert.equal(again.status, 201, 'and he may muster again, with nothing')
      const next = (await app.api('GET', `/api/seat/${again.body.seats.red}`)).body
      assert.ok(next.own.every(u => u.officer?.headless), 'no officer on any unit, not even a new veteran')
    }
  } finally { await app.close() }
})

// ── From the review of November 23 ─────────────────────

test('held, the Commander cannot yield by his own word: the field is his only to offer; a body that is not an object is no body', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders')).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })).body.seats.red
    Object.assign(store.seatOf(seat).entry.game.battle.commanders.red, { status: 'held', heldBy: 'blue_swords' })

    const said = (await app.api('POST', `/api/seat/${seat}/orders`, { text: 'yield' })).body
    assert.equal(said.status, 'turn-ran', 'read as no orders: the turn runs')
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.notEqual(tent.battle.outcome?.reason, 'enemy surrendered')

    for (const url of [`/api/seat/${seat}/answer`, `/api/seat/${seat}/offer`, '/api/battles']) {
      const res = await fetch(app.base + url, { method: 'POST', body: 'null', headers: { 'Content-Type': 'application/json' } })
      assert.notEqual(res.status, 500, `${url} with a null body`)
    }
  } finally { await app.close() }
})


// ── The friend brings a Commander too ──────────────────

// A two-player battle: the mustering player's Commander on red, the
// friend's (made here) waiting to be chosen for blue.
async function twoCommanders(app, seed = 3) {
  const red = (await app.api('POST', '/api/commanders')).body
  const blue = (await app.api('POST', '/api/commanders')).body
  const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed, commander: red.token })).body.seats
  return { red, blue, seats }
}

// Both sides send orders until the battle ends.
async function fightBoth(app, seats) {
  let tent
  for (let i = 0; i < 80; i++) {
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: i === 0 ? 'everyone advance' : '' })
    await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: i === 0 ? 'everyone advance' : '' })
    tent = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    if (tent.battle.status === 'finished') break
  }
  assert.equal(tent.battle.status, 'finished')
  return tent
}

test('the friend chooses who leads before their first orders: their company\'s officers lead their side, and their Commander rides with their best unit', async () => {
  const app = await start()
  try {
    const { blue, seats } = await twoCommanders(app)
    const before = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    assert.equal(before.choosing, true)
    assert.equal(before.commander, null, 'no one leads yet')
    assert.equal((await app.api('GET', `/api/seat/${seats.red}`)).body.choosing, false, 'the mustering player chose at the muster')
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone advance' })).status, 409, 'no orders before the choice')
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/read`, { text: 'everyone advance' })).status, 409)

    const joined = await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })
    assert.deepEqual(joined.body, { status: 'joined', commander: blue.name })
    const tent = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    const company = (await app.api('GET', `/api/commander/${blue.token}`)).body
    assert.equal(tent.choosing, false)
    assert.deepEqual(company.officers.map(o => [o.leads, o.grade]), [['spears', 'veteran']], 'a new Commander\'s one veteran, with the best unit')
    assert.equal(tent.own[0].officer.name, company.officers[0].name)
    assert.deepEqual(tent.own.slice(1).map(u => u.officer), [{ headless: true }, { headless: true }, { headless: true }])
    assert.deepEqual(tent.commander, { status: 'free', unitId: tent.own[0].id, with: 'Spears', heldBy: null, heldAt: null, chips: [] })
    assert.deepEqual(company.battle, { title: 'Crownhill: the meeting battle', seat: seats.blue }, 'his army is in the field')
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone advance' })).status, 200)
  } finally { await app.close() }
})

test('a Commander who has fallen, or whose army is in the field, cannot be chosen to lead the friend\'s side', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { red, blue, seats } = await twoCommanders(app)
    const busy = await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: red.token })
    assert.equal(busy.status, 409, 'red\'s army is in this very battle')
    assert.match(busy.body.error, /army is in the field/)
    store.commanders.end(store.commanders.get(blue.token), { how: 'killed', at: 'Ashford' })
    const fallen = await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })
    assert.equal(fallen.status, 409)
    assert.match(fallen.body.error, /was killed at Ashford/)
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: 'not-a-real-token' })).status, 404)
    assert.equal((await app.api('GET', `/api/seat/${seats.blue}`)).body.choosing, true, 'still theirs to choose')
    assert.equal((await app.api('POST', `/api/seat/${seats.red}/join`, { commander: null })).status, 409, 'the mustering seat chose at the muster')
  } finally { await app.close() }
})

test('the friend\'s army is in the field until the battle ends, and the battle is written into both companies', async () => {
  const app = await start()
  try {
    const { red, blue, seats } = await twoCommanders(app)
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })
    const elsewhere = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander: blue.token })
    assert.equal(elsewhere.status, 409, 'an army fights one battle at a time')

    const tent = await fightBoth(app, seats)
    assert.equal(tent.verdict.company, true)
    for (const c of [red, blue]) {
      const company = (await app.api('GET', `/api/commander/${c.token}`)).body
      assert.equal(company.battles, 1, `${c.name}'s company fought it`)
      assert.equal(company.battle, null, 'and his army is home')
      const veteran = company.officers.find(o => o.leads === 'spears')
      if (veteran) assert.equal(veteran.record[0].title, 'Crownhill: the meeting battle')
      else assert.ok(company.fallen.some(f => f.led === 'spears') || company.ended)
    }
    const redTent = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.ok(tent.verdict.commander && redTent.verdict.commander, 'each seat\'s verdict tells its own Commander\'s fate')
    const again = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 5, commander: blue.token })
    assert.equal(again.status, (await app.api('GET', `/api/commander/${blue.token}`)).body.ended ? 409 : 201, 'home again, he can muster')
  } finally { await app.close() }
})

test('a battle joined after the mustering player sent orders replays identically after a restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-web-'))
  let app
  try {
    app = await start(createBattleStore({ dir }))
    const { blue, seats } = await twoCommanders(app, 9)
    assert.equal((await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone advance' })).body.status, 'waiting')
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })
    assert.match((await app.api('GET', `/api/seat/${seats.red}`)).body.pending.text, /advance/, 'the orders sent before are still in')
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })).body.status, 'turn-ran')
    const first = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.ok(first.own.every(u => /advancing/.test(u.order)), 'red\'s first orders were carried into the new game')
    for (let i = 0; i < 3; i++) {
      await app.api('POST', `/api/seat/${seats.red}/orders`, { text: '' })
      await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: '' })
    }
    const before = { red: (await app.api('GET', `/api/seat/${seats.red}`)).body, blue: (await app.api('GET', `/api/seat/${seats.blue}`)).body }
    await app.close()

    app = await start(createBattleStore({ dir }))
    const after = { red: (await app.api('GET', `/api/seat/${seats.red}`)).body, blue: (await app.api('GET', `/api/seat/${seats.blue}`)).body }
    assert.deepEqual(after, before, 'the same battle, rebuilt from one spec and one order log')
  } finally {
    await app?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the choice of who leads is closed once the first turn has run', async () => {
  const app = await start()
  try {
    const { blue, seats } = await twoCommanders(app)
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: null })
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })).status, 409, 'chosen once')
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: 'everyone hold' })
    await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })).status, 409)

    // The mustering player yields before the friend has chosen: the battle
    // is over, and there is nothing left to choose.
    const other = await twoCommanders(app)
    await app.api('POST', `/api/seat/${other.seats.red}/orders`, { text: 'yield' })
    const late = await app.api('POST', `/api/seat/${other.seats.blue}/join`, { commander: other.blue.token })
    assert.equal(late.status, 409)
    assert.equal((await app.api('GET', `/api/seat/${other.seats.blue}`)).body.choosing, false)
    assert.equal((await app.api('GET', `/api/commander/${other.blue.token}`)).body.battle, null, 'his army never took the field')
  } finally { await app.close() }
})

test('a seat with no Commander fights as a new Commander would, and nothing is kept', async () => {
  const app = await start()
  try {
    const { seats } = await twoCommanders(app)
    assert.deepEqual((await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: null })).body, { status: 'joined', commander: null })
    const tent = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    assert.equal(tent.own[0].officer.grade, 'veteran')
    assert.deepEqual(tent.own.slice(1).map(u => u.officer), [{ headless: true }, { headless: true }, { headless: true }])
    assert.equal(tent.commander.status, 'free', 'and a Commander on the field, who can fall as the other can')
    const ended = await fightBoth(app, seats)
    assert.equal(ended.verdict.company, false)
  } finally { await app.close() }
})

test('a seat never receives the other side\'s company or Commander', async () => {
  const app = await start()
  try {
    const { red, blue, seats } = await twoCommanders(app, 5)
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })
    const names = async (c) => {
      const company = (await app.api('GET', `/api/commander/${c.token}`)).body
      return [c.name, ...company.officers.map(o => o.name)]
    }
    const redNames = await names(red)
    const blueNames = await names(blue)
    const check = async () => {
      const r = JSON.stringify((await app.api('GET', `/api/seat/${seats.red}`)).body)
      const b = JSON.stringify((await app.api('GET', `/api/seat/${seats.blue}`)).body)
      for (const n of blueNames.filter(n => !redNames.includes(n))) assert.equal(r.includes(n), false, `red is never told of ${n}`)
      for (const n of redNames.filter(n => !blueNames.includes(n))) assert.equal(b.includes(n), false, `blue is never told of ${n}`)
      assert.equal(r.includes(blue.token) || b.includes(red.token), false, 'nor the other Commander\'s link')
    }
    await check()
    await fightBoth(app, seats)
    await check()
  } finally { await app.close() }
})

test('both Commanders killed: a draw, each side told its own fate, and both companies end', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { red, blue, seats } = await twoCommanders(app)
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })
    const game = store.seatOf(seats.red).entry.game
    game.battle.commanders.red.status = 'killed'
    game.battle.commanders.blue.status = 'killed'
    await app.api('POST', `/api/seat/${seats.red}/orders`, { text: '' })
    await app.api('POST', `/api/seat/${seats.blue}/orders`, { text: '' })
    for (const [side, c] of [['red', red], ['blue', blue]]) {
      const tent = (await app.api('GET', `/api/seat/${seats[side]}`)).body
      assert.deepEqual([tent.battle.outcome.winner, tent.battle.outcome.reason], ['draw', 'both commanders killed'])
      assert.deepEqual(tent.verdict.commander, { fate: 'killed', price: null, prices: [] })
      assert.deepEqual((await app.api('GET', `/api/commander/${c.token}`)).body.ended, { how: 'killed', at: 'Crownhill: the meeting battle' })
    }
  } finally { await app.close() }
})

test('a server that stops between a battle ending and its being written down loses nothing and counts nothing twice', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-web-'))
  let app
  try {
    app = await start(createBattleStore({ dir }))
    const commander = (await app.api('POST', '/api/commanders')).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })).body.seats.red
    await fight(app, seat)
    const after = (await app.api('GET', `/api/commander/${commander}`)).body
    assert.equal(after.battles, 1)
    await app.close()
    app = null

    // As if it had stopped with the battle saved, decided, but not yet
    // marked as written into the company (which it had been).
    const file = fs.readdirSync(dir).filter(n => n.endsWith('.json')).map(n => path.join(dir, n))[0]
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), settled: false }))
    app = await start(createBattleStore({ dir }))
    assert.deepEqual((await app.api('GET', `/api/commander/${commander}`)).body, after, 'written in once, not twice')
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).settled, true, 'and the battle knows it now')
    await app.close()
    app = null

    // As if it had stopped with the company not yet written at all.
    const commanderFile = path.join(dir, 'commanders', fs.readdirSync(path.join(dir, 'commanders'))[0])
    const saved = JSON.parse(fs.readFileSync(commanderFile, 'utf8'))
    const untouched = { ...saved, battle: JSON.parse(fs.readFileSync(file, 'utf8')).id, company: { ...saved.company, battles: 0, settled: [], officers: saved.company.officers.map(o => ({ ...o, record: [] })) } }
    fs.writeFileSync(commanderFile, JSON.stringify(untouched))
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), settled: false }))
    app = await start(createBattleStore({ dir }))
    const mended = (await app.api('GET', `/api/commander/${commander}`)).body
    assert.equal(mended.battles, 1, 'the battle is written in as the server comes up')
    assert.equal(mended.battle, null, 'and his army is home')
  } finally {
    await app?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an army in a battle the server forgot to tell its Commander of is still in the field after a restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-web-'))
  let app
  try {
    app = await start(createBattleStore({ dir }))
    const commander = (await app.api('POST', '/api/commanders')).body.token
    await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })
    await app.close()
    app = null
    const commanderFile = path.join(dir, 'commanders', fs.readdirSync(path.join(dir, 'commanders'))[0])
    fs.writeFileSync(commanderFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(commanderFile, 'utf8')), battle: null }))

    app = await start(createBattleStore({ dir }))
    assert.equal((await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander })).status, 409)
  } finally {
    await app?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a Commander cannot muster again while his last battle is still being written down, nor after dying in it', async () => {
  // An AI that takes its time over the last dispatch.
  const ai = { configured: true, complete: () => new Promise(resolve => setTimeout(() => resolve({ ok: false }), 200)) }
  const store = createBattleStore({ ai })
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders')).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })).body.seats.red
    store.seatOf(seat).entry.game.battle.commanders.red.status = 'killed'
    const lastTurn = app.api('POST', `/api/seat/${seat}/orders`, { text: '' })
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal((await app.api('GET', `/api/seat/${seat}/summary`)).body.status, 'finished', 'the battle is decided')
    const during = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander })
    assert.equal(during.status, 409, 'but not yet written down: his army is not home')
    await lastTurn
    const afterwards = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander })
    assert.equal(afterwards.status, 409)
    assert.match(afterwards.body.error, /was killed/)
  } finally { await app.close() }
})

test('a battle that cannot be mustered leaves the company as it was', async () => {
  const app = await start()
  try {
    const commander = (await app.api('POST', '/api/commanders')).body.token
    const before = (await app.api('GET', `/api/commander/${commander}`)).body
    const refused = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander, objectives: ['nowhere at all'] })
    assert.equal(refused.status, 400)
    assert.equal(refused.body.error, 'There is no "nowhere at all" on this field to hold.')
    assert.deepEqual((await app.api('GET', `/api/commander/${commander}`)).body, before)
  } finally { await app.close() }
})

test('two requests at once for one battle run one after the other, never a turn each underneath the other', async () => {
  const ai = { configured: true, complete: () => new Promise(resolve => setTimeout(() => resolve({ ok: false }), 100)) }
  const store = createBattleStore({ ai })
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders')).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })).body.seats.red
    // He waits, and yields before the wait's dispatch is written.
    const [waited, yielded] = await Promise.all([
      app.api('POST', `/api/seat/${seat}/orders`, { text: '' }),
      app.api('POST', `/api/seat/${seat}/orders`, { text: 'yield' })
    ])
    assert.equal(waited.body.status, 'turn-ran')
    assert.equal(yielded.body.status, 'turn-ran')
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.equal(tent.battle.status, 'finished')
    assert.deepEqual(tent.dispatches.map(d => d.turn), [...new Set(tent.dispatches.map(d => d.turn))], 'each turn told once')
    assert.equal((await app.api('GET', `/api/commander/${commander}`)).body.battles, 1)
  } finally { await app.close() }
})
