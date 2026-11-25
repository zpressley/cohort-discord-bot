// src/web/tests/camps.test.js
//
// The battle of camps through the server (ruled 2026-11-25; engine/battle/
// camp.js): offered at the muster where the field suits it, the camps in
// the tent cut to what the seat's side knows, the orders that work them,
// the day counter, and the verdict when the days run out.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { waitingOn } = require('../../engine/orchestrator')

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
const mustered = async (app, body = {}) => (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 5, faction: 'rome', enemyFaction: 'rome', map: 'greywater', kind: 'camps', ...body })).body

test('the battle of camps is offered on Greywater, third, with a line on how it is won and that it may run over several days; not on the 1 km fields', async () => {
  const app = await start()
  try {
    const maps = (await app.api('GET', '/api/maps')).body
    const grey = maps.find(m => m.id === 'greywater').kinds
    assert.deepEqual(grey.map(k => k.id), ['pitched', 'ground', 'camps'])
    assert.equal(grey[2].title, 'A battle of camps')
    assert.match(grey[2].said, /pitches it where you choose/)
    assert.match(grey[2].said, /Break the enemy and burn his camp, and the field is yours\. Night does not end it: it may run over several days\./)
    for (const m of maps.filter(m => m.id !== 'greywater')) assert.ok(!m.kinds.some(k => k.id === 'camps'), m.id)
  } finally { await app.close() }
})

test('a battle of camps opens with his camp packed up and carried, the unit carrying it marked, and the enemy\'s camp unknown to him', async () => {
  const app = await start()
  try {
    const made = await mustered(app)
    const tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.equal(tent.battle.kind, 'camps')
    assert.equal(tent.battle.kindTitle, 'A battle of camps')
    assert.equal(tent.battle.day, 1)
    assert.equal(tent.camps.own.status, 'carried')
    const carrier = tent.own.filter(u => u.carriesCamp)
    assert.equal(carrier.length, 1)
    assert.equal(tent.camps.own.carrier, carrier[0].name)
    assert.equal(tent.camps.enemy, null, 'not found yet')
    assert.match(tent.groundLine, /^Day 1\. Your camp is packed up and carried by .*: your army tires while it is carried\. Pitch it: "pitch the camp here"\. The enemy's camp: not yet found\.$/)
    // Fog of war: nothing of the enemy's camp, its place or who carries it.
    const game = app.store.seatOf(made.seats.red).entry.game
    assert.ok(!JSON.stringify(tent).includes(game.battle.camps.blue.carrier))
  } finally { await app.close() }
})

test('"pitch the camp here" is read and pitched; the tent then shows the camp\'s ground, and "everyone advance" beside it leaves the carrier to its work', async () => {
  const app = await start()
  try {
    const made = await mustered(app)
    const read = (await app.api('POST', `/api/seat/${made.seats.red}/orders`, { text: 'pitch the camp here\neveryone advance' })).body
    assert.ok(read.understood.some(l => /: pitch the camp where they stand \([A-Z]\d+-[NS][EW]\)/.test(l)), read.understood.join(' | '))
    const tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.equal(tent.camps.own.status, 'pitched')
    assert.equal(tent.camps.own.tiles.length, 9)
    assert.match(tent.groundLine, /Your camp is pitched at [A-Z]\d+-[NS][EW]\./)
    assert.ok(tent.dispatches[0].lines.some(l => /pitched your camp/.test(l)))
  } finally { await app.close() }
})

test('a battle of camps goes on over the night, the day counted; it is never offered as "fight again the next day"; when the days run out the verdict says so', async () => {
  const app = await start()
  try {
    // A short day, so that days pass quickly.
    const made = await mustered(app, { dayMinutes: 60 })
    const game = app.store.seatOf(made.seats.red).entry.game
    for (let i = 0; i < 400 && !game.outcome.decided; i++) {
      for (const side of waitingOn(game)) if (made.seats[side]) await app.api('POST', `/api/seat/${made.seats[side]}/orders`, { text: i === 0 ? 'pitch the camp here\neveryone guard the camp' : '' })
      if (game.day === 2 && !game.outcome.decided) {
        const tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
        assert.equal(tent.battle.day, 2)
        assert.equal(tent.verdict, null)
      }
    }
    assert.equal(game.outcome.decided, true)
    assert.ok(game.day >= 2, `it ran into a second day (${game.day})`)
    const tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.ok(tent.dispatches.some(d => d.lines.some(l => /^Dawn: the second day of the battle begins/.test(l))), 'the dawn is told')
    assert.ok(!tent.verdict.night, 'no next day to call: the days run on by themselves')
    assert.equal((await app.api('POST', `/api/seat/${made.seats.red}/again`)).status, 409)
    if (game.outcome.reason === 'the days ran out') assert.match(tent.battle.outcome.said, /night has fallen with neither army beaten/)
  } finally { await app.close() }
})
