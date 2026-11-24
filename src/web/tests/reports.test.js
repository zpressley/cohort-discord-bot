// src/web/tests/reports.test.js
//
// Reports that say more as an officer rises, through the server, and fog of
// war held for each level: the browser is never sent a kind, a number or a
// state that his side's reports do not hold. Ruled by Zach on 2026-11-23
// (docs/DECISIONS.md, "Rulings, November 23, 2026 (officer perks)"):
//
//   "I would say additional details as progression happens but never
//   incorrect details."
//
// A unit with no officer reports that there is an enemy and where; a green
// officer adds what kind; a seasoned one roughly how many; a veteran exactly
// how many; a legendary one how they are holding up.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { REPORT } = require('../../narrator/words')
const { aboutHowMany } = require('../../engine/orchestrator/reports')

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

const OFFICER = {
  none: { headless: true, name: null, experience: 0, personality: 'steady' },
  green: { name: 'Titus', experience: 5, personality: 'steady', loyalty: 50 },
  seasoned: { name: 'Titus', experience: 9, personality: 'steady', loyalty: 50 },
  veteran: { name: 'Titus', experience: 14, personality: 'steady', loyalty: 50 },
  legendary: { name: 'Titus', experience: 22, personality: 'steady', loyalty: 50 }
}

// A new Commander of Rome against Parthia. With `grade`, every unit of his
// but the one he rides with is led by an officer of that grade (set by
// hand, for the test, before the first turn). His guard holds, the rest go
// forward, until word of the enemy has reached him.
async function sighting(app, store, grade = null, seed = 7) {
  const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
  const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed, commander: made.token, faction: 'rome', enemyFaction: 'parthia' })).body.seats.red
  const game = store.seatOf(seat).entry.game
  const guard = game.battle.commanders.red.unitId
  if (grade) for (const u of game.battle.world.units.filter(u => u.side === 'red' && u.id !== guard)) u.officer = OFFICER[grade]
  for (let t = 0; t < 12 && !game.outcome.decided; t++) {
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    if (tent.enemies.length) return { seat, game, tent }
    const name = tent.own.find(u => u.id === guard).name.toLowerCase()
    await app.api('POST', `/api/seat/${seat}/orders`, { text: `everyone advance\n${name} hold` })
  }
  throw new Error('no enemy was reported')
}

// The true enemy unit behind what the seat was shown.
const truth = (game, e) => game.battle.world.units.find(u => u.id === e.id) ??
  game.battle.world.units.find(u => u.side === 'blue' && u.position.x === e.position.x && u.position.y === e.position.y)

test('a new Commander\'s first sighting, by a unit with no officer: enemy troops, and where; nothing of their kind or numbers reaches the browser', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { game, tent } = await sighting(app, store)
    const told = tent.enemies.filter(e => e.reportedBy === 'none')
    assert.ok(told.length > 0)
    const text = JSON.stringify(tent)
    for (const e of told) {
      const unit = truth(game, e)
      assert.equal(e.name, 'Enemy troops')
      assert.equal(e.unknownKind, true)
      assert.equal(e.role, null)
      assert.equal(e.mounted, false, 'not said to be on foot either: the map marks them "?"')
      for (const key of ['strength', 'about', 'holding']) assert.equal(e[key], undefined, key)
      assert.match(e.id, /^enemy-[0-9a-f]+$/, 'a stand-in id, not one that names their kind')
      assert.ok(!text.includes(unit.id), `${unit.id}: its own id is nowhere in the answer`)
      const kind = unit.id.replace(/^blue_/, '').replace(/_/g, ' ')
      assert.ok(!text.toLowerCase().includes(kind), `"${kind}" is nowhere in the answer`)
      assert.match(e.said, /what kind and how many not known: reported by a unit of yours with no officer/)
    }
    // The dispatch tells him of them in the same words.
    assert.ok(tent.dispatches.flatMap(d => d.lines).some(l => /report enemy troops/.test(l)))
  } finally { await app.close() }
})

for (const [grade, holds] of [
  ['none', { kind: false, about: false, count: false, state: false }],
  ['green', { kind: true, about: false, count: false, state: false }],
  ['seasoned', { kind: true, about: true, count: false, state: false }],
  ['veteran', { kind: true, about: false, count: true, state: false }],
  ['legendary', { kind: true, about: false, count: true, state: true }]
]) {
  test(`fog of war, a ${grade === 'none' ? 'unit with no officer' : `${grade} officer`}'s report: the browser gets ${Object.entries(holds).filter(([, v]) => v).map(([k]) => k).join(', ') || 'only where'}, and nothing more, and all of it true`, async () => {
    const store = createBattleStore({})
    const app = await start(store)
    try {
      const { game, tent } = await sighting(app, store, grade)
      const told = tent.enemies.filter(e => e.reportedBy === grade)
      assert.ok(told.length > 0, `an enemy reported by a ${grade} report`)
      for (const e of told) {
        const unit = truth(game, e)
        assert.equal(!e.unknownKind, holds.kind, 'kind')
        if (holds.kind) assert.equal(e.role, unit.role)
        assert.equal(e.about !== undefined, holds.about, 'roughly how many')
        if (holds.about) assert.equal(e.about, REPORT.about[aboutHowMany(unit.strength).band], 'the band the true number is in')
        assert.equal(e.strength !== undefined, holds.count, 'exactly how many')
        if (holds.count) assert.equal(e.strength, unit.strength)
        assert.equal(e.holding !== undefined, holds.state, 'how they are holding up')
        if (holds.state) assert.equal(e.holding, 'firm, fresh', 'not yet in a fight')
      }
    } finally { await app.close() }
  })
}

test('he can order an attack on enemy troops he knows nothing more of: by the name the game gives them, by grid square, or by the ground they are on', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { seat, tent } = await sighting(app, store)
    const e = tent.enemies.find(x => x.unknownKind)
    for (const text of [`velites attack the enemy troops at ${e.at}`, 'velites attack the enemy troops', 'velites attack the enemy in the woods']) {
      const read = (await app.api('POST', `/api/seat/${seat}/read`, { text })).body
      assert.deepEqual(read.questions, [], text)
      assert.match(read.understood[0], /^Velites: attack enemy troops, (in sight|last seen) at /, text)
    }
    // Their kind cannot be named: he has not been told it.
    const read = (await app.api('POST', `/api/seat/${seat}/read`, { text: 'velites attack the light horse' })).body
    assert.equal(read.understood.length, 0)
    assert.match(read.questions[0], /You have seen: enemy troops/)
  } finally { await app.close() }
})
