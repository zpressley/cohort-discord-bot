// src/web/tests/veterans.test.js
//
// Veterans in battle (docs/design/army-balance.md, part 4; taken
// 2026-11-23): a Commander's units go into battle with their own veterancy,
// saved in the battle's spec; against the computer its army matches his
// average, up to seasoned; between two Commanders each army carries its
// own; he sees each unit's level; his enemy does not.
//
// Most of these use Commanders with no faction (the scenario's own armies),
// so that they do not hang on any faction's usual army passing the builder.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const T = require('../../engine/combat/tables')

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
  return { server, api, close: () => new Promise(resolve => server.close(resolve)) }
}

// The scenario's red army, as a company knows its units.
const KINDS = ['spears', 'swords', 'archers', 'horse']

// A Commander whose units have come through so many battles each, whole
// (so their veterancy is that number), put in by hand.
function veteranCommander(store, battles, more = {}) {
  const made = store.commanders.create({})
  const c = store.commanders.get(made.token)
  const units = {}
  for (const kind of KINDS) {
    const n = typeof battles === 'object' ? battles[kind] ?? 0 : battles
    units[kind] = { strength: 100, totalExperience: 100 * n, battlesParticipated: n, ...(more[kind] ?? {}) }
  }
  store.commanders.setCompany(c, { ...c.company, units, battles: 1 })
  return made.token
}

const specOf = (store, seat) => store.seatOf(seat).entry.game.spec
const sideUnits = (store, seat, side) => specOf(store, seat).units.filter(u => u.side === side)

test('a Commander\'s units go into battle each with its own veterancy, kept in the battle\'s spec', () => {
  const store = createBattleStore({})
  const token = veteranCommander(store, { spears: 14, swords: 9, archers: 2.5, horse: 0 })
  const seat = store.muster({ opponent: 'standing', side: 'red', seed: 7, commander: token }).seats.red
  const mine = Object.fromEntries(sideUnits(store, seat, 'red').map(u => [u.id, u.veterancy]))
  assert.deepEqual(mine, { red_spears: 14, red_swords: 9, red_archers: 2.5, red_horse: undefined })
  // On the field too, not only in the spec.
  const field = store.seatOf(seat).entry.game.battle.world.units.find(u => u.id === 'red_spears')
  assert.equal(field.veterancy, 14)
})

test('a unit raised new fights as before: a new Commander\'s units, and a battle with no Commander, carry no veterancy on either side', () => {
  const store = createBattleStore({})
  const fresh = store.commanders.create({}).token
  for (const m of [{ commander: fresh }, {}]) {
    const seat = store.muster({ opponent: 'standing', side: 'red', seed: 7, ...m }).seats.red
    assert.ok(specOf(store, seat).units.every(u => !('veterancy' in u)), JSON.stringify(m))
  }
})

test('against the computer, every unit of its army takes the average veterancy of the units he fields, each unit counting once', () => {
  const store = createBattleStore({})
  const token = veteranCommander(store, { spears: 6, swords: 4, archers: 2, horse: 0 })
  const seat = store.muster({ opponent: 'standing', side: 'red', seed: 7, commander: token }).seats.red
  const theirs = sideUnits(store, seat, 'blue')
  assert.ok(theirs.length > 0)
  assert.deepEqual(theirs.map(u => u.veterancy), theirs.map(() => 3))
})

test('the computer matches no higher than seasoned, however long-lived the Commander', () => {
  const store = createBattleStore({})
  const token = veteranCommander(store, 25)
  const seat = store.muster({ opponent: 'standing', side: 'red', seed: 7, commander: token }).seats.red
  assert.ok(sideUnits(store, seat, 'red').every(u => u.veterancy === 25))
  assert.ok(sideUnits(store, seat, 'blue').every(u => u.veterancy === T.VETERANCY.MATCH_UP_TO))
})

test('the computer matches only the units that march: those he leaves at home do not count', () => {
  // A faction Commander (Han's usual army fields on the base): his
  // crossbows stay home.
  const store = createBattleStore({})
  const made = store.commanders.create({ faction: 'han' })
  const c = store.commanders.get(made.token)
  const roster = store.commanders.view(made.token).roster
  const kinds = roster.units.map(u => u.name)
  const home = roster.units.find(u => u.how !== 'elite').name
  const units = Object.fromEntries(kinds.map(k => [k, { strength: 100, totalExperience: 100 * (k === home ? 20 : 2), battlesParticipated: k === home ? 20 : 2 }]))
  store.commanders.setCompany(c, { ...c.company, units })
  const marching = roster.units.filter(u => u.how !== 'elite' && u.name !== home).map(u => u.name)
  const seat = store.muster({ opponent: 'standing', side: 'red', seed: 3, commander: made.token, enemyFaction: 'persia', marching }).seats.red
  const mine = sideUnits(store, seat, 'red')
  assert.ok(mine.every(u => u.veterancy === 2), JSON.stringify(mine.map(u => [u.id, u.veterancy])))
  assert.ok(sideUnits(store, seat, 'blue').every(u => u.veterancy === 2))
})

test('between two Commanders each army carries its own veterancy, and neither is matched to the other', () => {
  const store = createBattleStore({})
  const red = veteranCommander(store, 16)
  const blue = veteranCommander(store, { spears: 5, swords: 0, archers: 0, horse: 0 })
  const seats = store.muster({ opponent: 'friend', side: 'red', seed: 7, commander: red }).seats
  // Before the friend joins, his side is no one's: it carries nothing.
  assert.ok(sideUnits(store, seats.red, 'blue').every(u => !('veterancy' in u)))
  store.join(seats.blue, blue)
  assert.ok(sideUnits(store, seats.red, 'red').every(u => u.veterancy === 16))
  assert.deepEqual(sideUnits(store, seats.red, 'blue').map(u => u.veterancy), [5, undefined, undefined, undefined])
})

test('a unit trained up by an officer of thirty battles also carries its veterancy: the two stack', () => {
  const store = createBattleStore({})
  const token = veteranCommander(store, 22, { archers: { drilled: T.TRAINING.BATTLES_PER_LEVEL } })
  const seat = store.muster({ opponent: 'standing', side: 'red', seed: 7, commander: token }).seats.red
  const archers = sideUnits(store, seat, 'red').find(u => u.id === 'red_archers')
  assert.equal(archers.quality, 'professional', 'trained up a level from militia')
  assert.equal(archers.veterancy, 22)
})

test('a battle with veterans replays exactly as it was played, from its saved spec', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-veterans-'))
  try {
    let store = createBattleStore({ dir })
    const token = veteranCommander(store, 21)
    const seat = store.muster({ opponent: 'standing', side: 'red', seed: 13, commander: token }).seats.red
    let app = await start(store)
    for (let i = 0; i < 3; i++) await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone advance' })
    const before = (await app.api('GET', `/api/seat/${seat}`)).body
    const units = (s) => s.seatOf(seat).entry.game.battle.world.units.map(u => [u.id, u.strength, u.veterancy])
    const was = units(store)
    await app.close()
    store = createBattleStore({ dir })
    app = await start(store)
    assert.deepEqual(units(store), was)
    assert.ok(was.some(([, , v]) => v === 21) && was.some(([, , v]) => v === 8))
    const after = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual(after.own, before.own)
    assert.deepEqual(after.dispatches, before.dispatches)
    await app.close()
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

// The fixture (fixtures/make-before-veterans.js) was made by the code before
// this change: Commanders whose units had 12 and 20 battles behind them, whose
// veterancy then went into no battle. (It pins the combat rules of that day:
// a change to combat replays it differently, as it does every saved battle.)
// Ruled 2026-11-24: "There are not any old battles I care about": it is no
// longer held to the battle it was (combat has changed since); it loads
// with nothing added, and goes on.
test('a battle saved before veterans went into battle loads with none in its spec, and goes on', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-veterans-old-'))
  try {
    const from = path.join(__dirname, 'fixtures', 'before-veterans')
    fs.cpSync(from, dir, { recursive: true })
    fs.rmSync(path.join(dir, 'expected.json.txt'))
    const expected = JSON.parse(fs.readFileSync(path.join(from, 'expected.json.txt'), 'utf8'))
    const store = createBattleStore({ dir })
    for (const key of ['open', 'done']) {
      const now = store.seatOf(expected.seats[key]).entry.game
      assert.ok(now.spec.units.every(u => !('veterancy' in u)), 'nothing added to the old spec')
      assert.deepEqual([...now.battle.world.units, ...now.battle.fledUnits].map(u => u.id).sort(), expected.games[key].units.map(u => u[0]).sort(), key)
    }
    // The open one goes on, as it was.
    const app = await start(store)
    try {
      const turn = await app.api('POST', `/api/seat/${expected.seats.open}/orders`, { text: 'everyone hold' })
      assert.equal(turn.status, 200)
      assert.ok(store.seatOf(expected.seats.open).entry.game.battle.world.units.every(u => !('veterancy' in u)))
    } finally { await app.close() }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('he sees each of his units\' veterancy in the game\'s words: raw, green, seasoned, veteran, legendary', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const token = veteranCommander(store, { spears: 1, swords: 5, archers: 9, horse: 20 })
    const view = (await app.api('GET', `/api/commander/${token}`)).body
    const level = Object.fromEntries(view.units.map(u => [u.kind, u.level]))
    assert.deepEqual(level, { spears: 'raw', swords: 'green', archers: 'seasoned', horse: 'legendary' })
    const { VETERANCY_WORDS } = require('../../narrator/words')
    assert.ok(Object.values(level).every(w => Object.values(VETERANCY_WORDS).includes(w)))
  } finally { await app.close() }
})

test('fog of war: a seat is never told any unit\'s veterancy, his own or the enemy\'s, nor what the computer matched', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = veteranCommander(store, 17)
    const blue = veteranCommander(store, 11)
    const seats = store.muster({ opponent: 'friend', side: 'red', seed: 7, commander: red }).seats
    store.join(seats.blue, blue)
    const solo = store.muster({ opponent: 'standing', side: 'red', seed: 7, commander: veteranCommander(store, 10) }).seats.red
    for (const seat of [seats.red, seats.blue, solo]) {
      await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone advance' })
      for (const url of [`/api/seat/${seat}`, `/api/seat/${seat}/summary`]) {
        const text = JSON.stringify((await app.api('GET', url)).body)
        assert.equal(/veteran(cy|Resistance)|"level"/.test(text), false, url)
      }
    }
  } finally { await app.close() }
})
