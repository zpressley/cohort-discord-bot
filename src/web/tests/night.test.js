// src/web/tests/night.test.js
//
// The end of the day, through the server. Ruled 2026-11-24: "No the day
// just ends the battle, you can choose to fight again the next day."

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { waitingOn, gameRecord } = require('../../engine/orchestrator')

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

// Hold until night: a day of two turns.
async function untilNight(app, store, seats, text = 'everyone hold') {
  const game = store.seatOf(Object.values(seats)[0]).entry.game
  for (let i = 0; i < 40 && !game.outcome.decided; i++) {
    for (const side of waitingOn(game)) if (seats[side]) await app.api('POST', `/api/seat/${seats[side]}/orders`, { text })
  }
  return game
}

// Each unit's men at nightfall, those who ran among them, by side.
function atNightfall(game, side) {
  return new Map([...game.battle.world.units, ...game.battle.fledUnits]
    .filter(u => u.side === side && u.strength > 0).map(u => [u.id, u.strength]))
}
// The next day's units of one side, by id.
const fielded = (game, side) => new Map(game.spec.units.filter(u => u.side === side).map(u => [u.id, u]))

test('when night ends a battle against the computer, you are offered to fight again the next day against the same enemy, and your army comes as it stands', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander, map: 'ashford', enemyFaction: 'han', turnLimit: 2 })).body
    const game = await untilNight(app, store, made.seats)
    assert.equal(game.outcome.reason, 'night fell')
    const tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.equal(tent.verdict.night.again, 'Fight again the next day')
    assert.equal(tent.verdict.night.next, null)
    // The dispatch says it plainly.
    assert.match(tent.dispatches[0].lines.join('\n'), /Night has ended the fighting, and neither side has won/)
    // Nobody is credited with a win or a loss; the battle counts.
    const before = (await app.api('GET', `/api/commander/${commander}`)).body
    assert.equal(before.battles, 1)
    const again = await app.api('POST', `/api/seat/${made.seats.red}/again`)
    assert.equal(again.status, 201)
    assert.match(again.body.title, /^Ashford Vale: Rome against Han, day 2$/)
    const next = store.seatOf(again.body.token).entry
    assert.equal(next.game.spec.map, 'ashford')
    assert.equal(next.auto, 'blue', 'against the computer again')
    assert.ok(next.game.spec.units.filter(u => u.side === 'blue').every(u => u.faction === 'han'), 'the same enemy')
    assert.equal(next.commanders.red, store.commanders.get(commander).id, 'led by the same Commander')
    // Asked again, the same battle: it is made once.
    assert.equal((await app.api('POST', `/api/seat/${made.seats.red}/again`)).body.token, again.body.token)
    assert.equal((await app.api('GET', `/api/seat/${made.seats.red}`)).body.verdict.night.next, again.body.token)
  } finally { await app.close() }
})

test('only a battle night ended can be fought again the next day', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3 })).body.seats.red
    assert.equal((await app.api('POST', `/api/seat/${seat}/again`)).status, 409)
    assert.equal((await app.api('GET', `/api/seat/${seat}`)).body.verdict, null)
  } finally { await app.close() }
})

test('between two friends, the next day is one battle: each is given his own seat in it, and each Commander leads his side again', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const blue = (await app.api('POST', '/api/commanders', { faction: 'han' })).body.token
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 5, commander: red, turnLimit: 2 })).body.seats
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue })
    const game = await untilNight(app, store, seats)
    assert.equal(game.outcome.reason, 'night fell')
    // Blue asks first; red, coming later, finds his seat in it.
    const theirs = (await app.api('POST', `/api/seat/${seats.blue}/again`)).body
    const next = store.seatOf(theirs.token).entry
    assert.equal(store.seatOf(theirs.token).side, 'blue')
    assert.equal(next.joining, null, 'no one has to choose again')
    assert.deepEqual(next.commanders, { red: store.commanders.get(red).id, blue: store.commanders.get(blue).id })
    const tent = (await app.api('GET', `/api/seat/${seats.red}`)).body
    assert.equal(tent.verdict.night.next, next.seats.red)
    // Each is shown only his own seat.
    assert.ok(!JSON.stringify(tent).includes(next.seats.blue))
  } finally { await app.close() }
})

// Ruled 2026-11-24: "lol yes, it's just night time. Computer does not get to reset."
test('the next day against the computer, its army is the one it had at nightfall: each unit with the men it has left, no fresh units, the same kit, its veterancy not matched again', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander, map: 'ashford', enemyFaction: 'han', turnLimit: 6 })).body
    const game = await untilNight(app, store, made.seats, 'everyone advance on the enemy')
    assert.equal(game.outcome.reason, 'night fell')
    const left = atNightfall(game, 'blue')
    assert.ok([...left.values()].some(n => n < 100), 'the computer lost men in the day')
    const day1 = fielded(game, 'blue')
    const token = (await app.api('POST', `/api/seat/${made.seats.red}/again`)).body.token
    const next = store.seatOf(token).entry.game
    const day2 = fielded(next, 'blue')
    assert.deepEqual([...day2.keys()].sort(), [...left.keys()].sort(), 'the units it had left, and no others')
    for (const [id, unit] of day2) {
      const was = day1.get(id)
      assert.equal(unit.strength, left.get(id), `${id}: the men it had left`)
      assert.equal(unit.maxStrength, was.maxStrength, `${id}: a unit that lost men, not a smaller fresh one`)
      for (const key of ['faction', 'quality', 'primaryWeapon', 'armor', 'shield', 'mounted', 'veterancy']) assert.deepEqual(unit[key], was[key], `${id}: the same ${key}`)
    }
    // In the battle's making, so the saved battle replays with it.
    assert.deepEqual(gameRecord(next).spec.units.filter(u => u.side === 'blue').map(u => u.strength), [...day2.values()].map(u => u.strength))
    assert.equal(next.spec.nextDay, 2)
  } finally { await app.close() }
})

test('the next day, your army is the men left at nightfall: no recruits come in the night, and each unit\'s veterancy is its own men\'s', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const commander = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, commander, map: 'ashford', enemyFaction: 'han', turnLimit: 6 })).body
    const game = await untilNight(app, store, made.seats, 'everyone advance on the enemy')
    const left = atNightfall(game, 'red')
    assert.ok([...left.values()].some(n => n < 100), 'you lost men in the day')
    const token = (await app.api('POST', `/api/seat/${made.seats.red}/again`)).body.token
    const next = store.seatOf(token).entry.game
    const company = store.commanders.get(commander).company
    for (const [id, unit] of fielded(next, 'red')) {
      assert.equal(unit.strength, left.get(id), `${id}: the men left, not made up with recruits`)
      const state = company.units[unit.id.replace(/^red_/, '').replace(/_/g, ' ')]
      if (state?.totalExperience > 0) assert.equal(unit.veterancy, Math.round(state.totalExperience / unit.strength * 100) / 100, `${id}: its men's own experience, not thinned by recruits`)
    }
    // And once the second day is fought, the company makes them up to
    // strength again, as after any battle.
    const day2 = { red: token }
    await untilNight(app, store, day2, 'everyone advance on the enemy')
    for (const state of Object.values(store.commanders.get(commander).company.units)) assert.ok(state.strength >= 80)
  } finally { await app.close() }
})

test('the next day, men who ran come back to the standards in the night; the dead do not', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    // (Mongolia, not Rome: with their pila the legions no longer ran in the
    // day; docs/design/army-balance.md, part 8. Found by search. Rome
    // against Carthage since a unit rallied with no heart holds rather than
    // go in again: Mongolia's riders no longer broke a second time and ran;
    // "How taking ground, news of the ground, and rallying were mended".
    // Thornwood seed 27, not Ashford seed 1, since broken units run round the
    // enemy and rally more often than they leave the field: on Ashford none
    // of seeds 1 to 200 had a unit of his run off it in the day. "How
    // columns, wavering under fire and flight were mended".)
    // (A battle for ground, as every battle was until November 25. Seed 2,
    // not 27, since ties of who steps first are a seeded draw, not by name:
    // round two of "How the kinds of battle were built".)
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 2, map: 'thornwood', faction: 'rome', enemyFaction: 'carthage', turnLimit: 10, kind: 'ground' })).body
    const game = await untilNight(app, store, made.seats, 'everyone advance on the enemy')
    assert.equal(game.outcome.reason, 'night fell')
    const ran = game.battle.fledUnits.filter(u => u.side === 'red' && u.strength > 0)
    assert.ok(ran.length > 0, 'a unit of yours ran in the day')
    const token = (await app.api('POST', `/api/seat/${made.seats.red}/again`)).body.token
    const next = fielded(store.seatOf(token).entry.game, 'red')
    for (const u of ran) assert.equal(next.get(u.id)?.strength, u.strength, `${u.id}: back with the men who ran`)
    for (const u of game.battle.world.units.filter(x => x.strength <= 0)) assert.ok(!next.has(u.id) && !fielded(store.seatOf(token).entry.game, 'blue').has(u.id), `${u.id}: destroyed, and gone`)
  } finally { await app.close() }
})

test('between two friends, both armies come to the next day as they stand, and a third day after a second night the same', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const blue = (await app.api('POST', '/api/commanders', { faction: 'han' })).body.token
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 4, commander: red, map: 'ashford', turnLimit: 4 })).body.seats
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue })
    let game = await untilNight(app, store, seats, 'everyone advance on the enemy')
    let tokens = seats
    for (const day of [2, 3]) {
      assert.equal(game.outcome.reason, 'night fell', `night fell on day ${day - 1}`)
      const left = { red: atNightfall(game, 'red'), blue: atNightfall(game, 'blue') }
      const theirs = (await app.api('POST', `/api/seat/${tokens.red}/again`)).body
      const next = store.seatOf(theirs.token).entry
      assert.equal(next.game.spec.nextDay, day)
      assert.match(next.title, new RegExp(`, day ${day}$`))
      for (const side of ['red', 'blue']) {
        const now = fielded(next.game, side)
        assert.deepEqual([...now.keys()].sort(), [...left[side].keys()].sort(), `day ${day}, ${side}: the units left`)
        for (const [id, unit] of now) assert.equal(unit.strength, left[side].get(id), `day ${day}, ${id}`)
      }
      tokens = next.seats
      game = await untilNight(app, store, tokens, 'everyone advance on the enemy')
      if (game.outcome.reason !== 'night fell') break
    }
  } finally { await app.close() }
})

test('if one side has nothing left able to fight when night falls, there is no next day to offer', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, faction: 'rome', enemyFaction: 'han', turnLimit: 2 })).body
    const game = await untilNight(app, store, made.seats)
    assert.equal(game.outcome.reason, 'night fell')
    // (As if the enemy's last men had fallen as the dark came down.)
    for (const u of game.battle.world.units.filter(x => x.side === 'blue')) u.strength = 0
    const tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.match(tent.verdict.night.noNextDay, /no next day/)
    const again = await app.api('POST', `/api/seat/${made.seats.red}/again`)
    assert.equal(again.status, 409)
    assert.match(again.body.error, /no one left able to take the field/)
  } finally { await app.close() }
})

test('the verdict of a night tells you the enemy\'s army comes to the next day as it stands too, and shows you no more of it than before', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 4, map: 'ashford', faction: 'rome', enemyFaction: 'han', turnLimit: 6 })).body
    await untilNight(app, store, made.seats, 'everyone advance on the enemy')
    const tent = (await app.api('GET', `/api/seat/${made.seats.red}`)).body
    assert.match(tent.verdict.night.againNote, /Both armies come as they stand after today, yours and the enemy's/)
    assert.deepEqual(Object.keys(tent.verdict.night).sort(), ['again', 'againNote', 'ended', 'next', 'released', 'title'], 'nothing more about the enemy than the verdict already gives')
    // The next day's tent is cut to your side, as every battle is.
    const token = (await app.api('POST', `/api/seat/${made.seats.red}/again`)).body.token
    const next = (await app.api('GET', `/api/seat/${token}`)).body
    const seen = new Set(next.enemies.map(e => e.id))
    const entry = store.seatOf(token).entry
    for (const u of entry.game.battle.world.units.filter(x => x.side === 'blue' && !seen.has(x.id))) assert.ok(!JSON.stringify(next).includes(u.id), `${u.id}, unseen, is not shown`)
  } finally { await app.close() }
})

// Ruled 2026-11-24: "no they need a notice".
test('when a friend calls a next day, you are told wherever you next open the game: your list of battles, your Commander\'s page and the old verdict, until your orders go', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const blue = (await app.api('POST', '/api/commanders', { faction: 'han' })).body.token
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 5, commander: red, turnLimit: 2 })).body.seats
    await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue })
    await untilNight(app, store, seats)
    // Before anyone asks: no notice, and the friend may be told by his browser.
    const before = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    assert.equal(before.verdict.night.calledOut, undefined)
    assert.equal(before.battle.nextDay, undefined)
    assert.ok(before.verdict.night.tellMe)
    const called = (await app.api('POST', `/api/seat/${seats.red}/again`)).body
    const next = store.seatOf(called.token).entry
    const notice = 'The enemy has called you out for a second day. Your orders are wanted.'
    // His list of battles (the old battle's line names his seat in the new).
    const [line] = (await app.api('GET', `/api/seats?tokens=${seats.blue}`)).body
    assert.equal(line.nextDay.token, next.seats.blue)
    assert.equal(line.nextDay.calledOut, notice)
    const [newLine] = (await app.api('GET', `/api/seats?tokens=${next.seats.blue}`)).body
    assert.equal(newLine.calledOut, notice)
    assert.equal(newLine.status, 'your-orders')
    // His Commander's page.
    const page = (await app.api('GET', `/api/commander/${blue}`)).body
    assert.equal(page.battle.seat, next.seats.blue)
    assert.equal(page.battle.calledOut, notice)
    // The old verdict.
    const old = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    assert.equal(old.verdict.night.next, next.seats.blue)
    assert.equal(old.verdict.night.calledOut, notice)
    // The one who called it is not told he was called out.
    const [mine] = (await app.api('GET', `/api/seats?tokens=${seats.red}`)).body
    assert.equal(mine.nextDay.calledOut, undefined)
    assert.equal((await app.api('GET', `/api/commander/${red}`)).body.battle.calledOut, undefined)
    // Fog: each is shown only his own seat.
    assert.ok(!JSON.stringify(line).includes(next.seats.red))
    assert.ok(!JSON.stringify(mine).includes(next.seats.blue))
    // His orders go: the notice is done.
    await app.api('POST', `/api/seat/${next.seats.blue}/orders`, { text: 'everyone hold' })
    assert.equal((await app.api('GET', `/api/seats?tokens=${next.seats.blue}`)).body[0].calledOut, undefined)
  } finally { await app.close() }
})

test('the notice goes the other way round too: whoever asks first, the other is told', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 5, turnLimit: 2 })).body.seats
    await app.api('POST', `/api/seat/${seats.blue}/join`, {})
    await untilNight(app, store, seats)
    const called = (await app.api('POST', `/api/seat/${seats.blue}/again`)).body
    const next = store.seatOf(called.token).entry
    const [line] = (await app.api('GET', `/api/seats?tokens=${seats.red}`)).body
    assert.match(line.nextDay.calledOut, /called you out for a second day/)
    assert.equal((await app.api('GET', `/api/seat/${next.seats.red}`)).body.battle.calledOut, line.nextDay.calledOut)
    assert.equal((await app.api('GET', `/api/seat/${next.seats.blue}`)).body.battle.calledOut, undefined)
  } finally { await app.close() }
})

// Ruled 2026-11-28: a main menu. A battle night ended is listed there as
// going on while a next day can be fought, and as over once it cannot.
test('the main menu lists a battle night ended as going on while a next day can still be fought, and not once it is called or cannot be', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const made = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, faction: 'rome', enemyFaction: 'han', turnLimit: 2 })).body
    const game = await untilNight(app, store, made.seats)
    assert.equal(game.outcome.reason, 'night fell')
    const line = async () => (await app.api('GET', `/api/seats?tokens=${made.seats.red}`)).body[0]
    assert.equal((await line()).fightOn, 'Night has fallen. You can fight again the next day')
    await app.api('POST', `/api/seat/${made.seats.red}/again`)
    assert.equal((await line()).fightOn, undefined, 'called: the next day is the battle going on')

    const other = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 3, faction: 'rome', enemyFaction: 'han', turnLimit: 2 })).body
    const second = await untilNight(app, store, other.seats)
    for (const u of second.battle.world.units.filter(x => x.side === 'blue')) u.strength = 0
    assert.equal((await app.api('GET', `/api/seats?tokens=${other.seats.red}`)).body[0].fightOn, undefined, 'no one left to fight: it is over')
  } finally { await app.close() }
})
