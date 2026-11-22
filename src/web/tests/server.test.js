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

test('a Commander\'s officers go with him from battle to battle: they learn, they remember, and the lost are replaced', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-web-'))
  let app
  try {
    app = await start(createBattleStore({ dir }))
    const made = (await app.api('POST', '/api/commanders')).body
    const commander = made.token
    assert.deepEqual((await app.api('GET', `/api/commander/${commander}`)).body, { name: made.name, battles: 0, officers: [], fallen: [], battle: null })

    const first = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander })).body.seats.red
    const mustered = (await app.api('GET', `/api/commander/${commander}`)).body
    const tent = (await app.api('GET', `/api/seat/${first}`)).body
    assert.deepEqual(mustered.officers.map(o => o.name).sort(), tent.own.map(u => u.officer.name).sort(), 'the company leads the army')
    assert.ok(mustered.officers.every(o => o.record.length === 0 && o.status === 'fit'))

    const ended = await fight(app, first)
    assert.equal(ended.verdict.company, true)
    const after = (await app.api('GET', `/api/commander/${commander}`)).body
    assert.equal(after.battles, 1)
    const fates = new Map(ended.verdict.officers.map(o => [o.officer, o.fate]))
    for (const before of mustered.officers) {
      const fate = fates.get(before.name)
      const now = after.officers.find(o => o.name === before.name)
      if (fate === 'killed' || fate === 'captured') {
        assert.equal(now, undefined, 'the lost leave the company')
        assert.ok(after.fallen.some(f => f.name === before.name && f.fate === fate))
        continue
      }
      assert.equal(now.experience, before.experience + 1, 'a battle lived through is a battle learned from')
      assert.equal(now.status, fate === 'wounded' ? 'wounded' : 'fit')
      assert.equal(now.record.length, 1)
      assert.equal(now.record[0].result, ended.battle.outcome.winner === 'red' ? 'victory' : ended.battle.outcome.winner === 'draw' ? 'draw' : 'defeat')
      assert.ok(now.record[0].deeds.length > 0, 'what his unit did')
      assert.deepEqual(now.record[0].orders, ['advance on the enemy'], 'and what he was told')
    }
    // Looking again changes nothing: the battle is written in once.
    await app.api('GET', `/api/seat/${first}`)
    assert.deepEqual((await app.api('GET', `/api/commander/${commander}`)).body, after)
    await app.close()
    app = null

    // The company is kept on the server, and the next battle draws on it.
    app = await start(createBattleStore({ dir }))
    assert.deepEqual((await app.api('GET', `/api/commander/${commander}`)).body, after)
    const second = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander })).body.seats.red
    const next = (await app.api('GET', `/api/seat/${second}`)).body
    const fit = after.officers.filter(o => o.status === 'fit')
    for (const o of fit) {
      const unit = next.own.find(u => u.officer.name === o.name)
      assert.ok(unit, `${o.name} is back`)
      assert.equal(unit.name.toLowerCase(), o.leads, 'with the same men')
      assert.equal(unit.officer.grade, o.grade)
    }
    for (const o of after.officers.filter(o => o.status === 'wounded')) {
      assert.equal(next.own.some(u => u.officer.name === o.name), false, 'the wounded sit one out')
    }
    const company = (await app.api('GET', `/api/commander/${commander}`)).body
    const fresh = company.officers.filter(o => !after.officers.some(b => b.name === o.name))
    assert.equal(fresh.length, next.own.length - fit.length, 'new men fill the gaps')
    assert.ok(fresh.every(o => o.grade === 'green'), 'and they are green')
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
