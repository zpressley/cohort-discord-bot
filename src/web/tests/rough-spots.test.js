// src/web/tests/rough-spots.test.js
//
// The app's rough spots found by playing it through (docs/REVIEW-2026-11.md,
// "Playthrough, November 24": D6, D7, D9), through the server.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { waitingOn } = require('../../engine/orchestrator')
const { kindWords } = require('../../narrator/words')
const { FACTIONS } = require('../../data/factions')

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
  return { api, close: () => new Promise(resolve => server.close(resolve)) }
}

async function untilDone(app, store, seats, text = 'everyone hold') {
  const game = store.seatOf(Object.values(seats)[0]).entry.game
  for (let i = 0; i < 40 && !game.outcome.decided; i++) {
    for (const side of waitingOn(game)) if (seats[side]) await app.api('POST', `/api/seat/${seats[side]}/orders`, { text })
  }
  return game
}

test('a battle fought on into the next day is one battle: on the record, in the count of battles, in each officer\'s record and his experience', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander, map: 'ashford', enemyFaction: 'han', turnLimit: 2 })).body
    const day1 = await untilDone(app, store, made.seats)
    assert.equal(day1.outcome.reason, 'night fell')
    const after1 = (await app.api('GET', `/api/commander/${commander}`)).body
    assert.equal(after1.battles, 1)
    const next = (await app.api('POST', `/api/seat/${made.seats.red}/again`)).body.token
    const day2 = await untilDone(app, store, { red: next })
    assert.ok(day2.outcome.decided)

    const after2 = (await app.api('GET', `/api/commander/${commander}`)).body
    assert.equal(after2.battles, 1, 'one battle fought')
    assert.equal(after2.record.length, 1, 'one line on his record')
    assert.equal(after2.record[0].title, 'Ashford Vale: Rome against Han, fought over two days')
    for (const officer of after2.officers) {
      const before = after1.officers.find(o => o.id === officer.id)
      if (!before) continue
      assert.equal(officer.record.length, 1, `${officer.name}: one battle with you`)
      assert.match(officer.record[0].title, /fought over two days$/)
      assert.equal(officer.experience, before.experience, `${officer.name}: one battle's experience`)
    }
    for (const unit of after2.units) {
      const before = after1.units.find(u => u.kind === unit.kind)
      if (!before) continue
      assert.equal(unit.battles, before.battles, `the ${unit.kind}: one battle toward an officer`)
      assert.ok(unit.veterancy <= before.veterancy, `the ${unit.kind}: its men bank the battle once`)
    }

    // Your battles: the next day carries the whole battle; the day before is not listed.
    const lines = (await app.api('GET', `/api/seats?tokens=${made.seats.red},${next}`)).body
    const last = lines.find(l => l.token === next)
    assert.equal(last.firstTitle, 'Ashford Vale: Rome against Han')
    assert.equal(last.overDays, 'fought over two days')
    assert.equal(lines.find(l => l.token === made.seats.red).nextDay.token, next, 'the day before points to it, and the list leaves it out')
  } finally { await app.close() }
})

test('a battle night ended with no next day says so plainly in your battles', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, map: 'ashford', enemyFaction: 'han', turnLimit: 2 })).body
    await untilDone(app, store, made.seats)
    const [line] = (await app.api('GET', `/api/seats?tokens=${made.seats.red}`)).body
    assert.equal(line.outcome.listed, 'Night fell, and neither side had won')
    assert.equal(line.overDays, undefined)
  } finally { await app.close() }
})

test('the Commander is "you" when the server refuses him for an army in the field', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    await app.api('POST', '/api/battles', { opponent: 'standing', commander: red })
    const army = await app.api('POST', `/api/commander/${red}/army`, { usual: true })
    assert.equal(army.status, 409)
    assert.match(army.body.error, /^Your army is in the field/)
  } finally { await app.close() }
})

test('a unit\'s kind fits its kit: javelin men in light kit are skirmishers, the kontos makes lancers, the pike pikemen, and armour makes heavy infantry', async () => {
  const kind = (u) => kindWords({ armor: 'no_armor', shield: 'no_shield', ...u })
  assert.equal(kind({ quality: 'levy', primaryWeapon: 'sword_standard', thrown: 'light_javelin', armor: 'light_armor', shield: 'light_shield' }), 'levy skirmishers', 'velites')
  assert.equal(kind({ quality: 'professional', primaryWeapon: 'spear_basic', thrown: 'light_javelin', armor: 'light_armor', shield: 'light_shield' }), 'professional skirmishers', 'peltasts')
  assert.equal(kind({ quality: 'professional', primaryWeapon: 'roman_gladius', thrown: 'roman_pilum', armor: 'medium_armor', shield: 'heavy_shield' }), 'professional heavy infantry', 'legionaries with pila are not skirmishers')
  assert.equal(kind({ quality: 'tribal_warriors', primaryWeapon: 'battle_axe', thrown: 'germanic_throwing_axe', armor: 'light_armor', shield: 'light_shield' }), 'tribal infantry', 'axe throwers close to fight')
  assert.equal(kind({ quality: 'levy', primaryWeapon: 'sling' }), 'levy slingers')
  assert.equal(kind({ quality: 'professional', primaryWeapon: 'han_chinese_crossbow', armor: 'medium_armor' }), 'professional crossbowmen')
  assert.equal(kind({ quality: 'professional', primaryWeapon: 'macedonian_sarissa' }), 'professional pikemen')
  assert.equal(kind({ quality: 'elite', primaryWeapon: 'persian_kontos', mounted: true, armor: 'heavy_armor' }), 'elite lancers')
  assert.equal(kind({ quality: 'professional', primaryWeapon: 'parthian_horse_bow', mounted: true }), 'professional horse archers')
  assert.equal(kind({ quality: 'militia', primaryWeapon: 'sword_standard', thrown: 'light_javelin', mounted: true, armor: 'light_armor' }), 'militia light horse', 'Numidian horse')
  assert.equal(kind({ quality: 'militia', primaryWeapon: 'sword_standard', armor: 'light_armor', shield: 'medium_shield' }), 'militia infantry', 'no armour to speak of is not heavy')
  // Every usual army and elite of the twenty factions has a kind word.
  for (const [id, f] of Object.entries(FACTIONS)) {
    for (const u of [...f.army, { ...f.elite, quality: 'elite' }]) {
      assert.match(kind({ ...u, primaryWeapon: u.weapon, thrown: u.second }), /^(levy|militia|tribal|professional|mercenary|elite) (archers|crossbowmen|slingers|skirmishers|pikemen|spearmen|heavy infantry|infantry|horse archers|lancers|light horse|cavalry)$/, `${id}: ${u.name}`)
    }
  }
})

test('the Army tab names each of your units by its kind in words: Rome\'s velites are levy skirmishers', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: red, map: 'ashford', enemyFaction: 'han' })).body.seats.red
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.equal(tent.own.find(u => u.name === 'Velites').kind, 'levy skirmishers')
    assert.equal(tent.own.find(u => u.name === 'Legionaries').kind, 'professional heavy infantry')
    // Fog of war: the kind in words is for your own units only; of the
    // enemy, only what his reports told (his armour and second weapon are not).
    await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone advance' })
    const later = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.ok(later.enemies.every(e => !('kind' in e) && !('armor' in e) && !('thrown' in e)))
  } finally { await app.close() }
})
