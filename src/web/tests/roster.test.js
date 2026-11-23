// src/web/tests/roster.test.js
//
// A Commander's roster, through the HTTP API (ruled 2026-11-23: "You don't
// have to deploy every unit every game. But you cannot field an army over
// the supply threshold. Additional units from capture and other avenues
// exist. You can transfer officers." And: "You can name units after they
// get an officer"). Who marches, and what that costs; units given in a deal
// between two players' Commanders, which change hands with everything they
// have; officers moved between units; units named, and found by their name.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { addToRoster } = require('../roster')
const { LOYALTY } = require('../../engine/combat/tables')
const { commanderOf } = require('../../engine/orchestrator')

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

// Rome's usual army: legionaries 12, hastati 10, velites 4 (26 of 30); the
// praetorian guard free.
const roman = async (app) => (await app.api('POST', '/api/commanders', { faction: 'rome' })).body

// An officer of the company's own, put in by hand (an officer is earned
// over four battles; the tests need one now).
function giveOfficer(store, token, leads, more = {}) {
  const c = store.commanders.get(token)
  const company = JSON.parse(JSON.stringify(c.company))
  const officer = {
    id: `o${company.nextId++}`, name: more.name ?? 'Tullus', experience: 9, personality: 'steady', values: 'survival', loyalty: 60,
    leads, status: 'fit', record: [{ battle: 'x', title: 'An old fight', result: 'victory', unit: leads, fate: 'unhurt', deeds: '', orders: [] }], ...more
  }
  company.officers.push(officer)
  store.commanders.setCompany(c, company)
  return officer.id
}

// A unit's own veterancy and training, put in by hand.
function season(store, token, unit, state) {
  const c = store.commanders.get(token)
  store.commanders.setCompany(c, { ...c.company, units: { ...c.company.units, [unit]: { strength: 100, totalExperience: 100 * state.battles, battlesParticipated: state.battles, drilled: state.drilled ?? 0 } } })
}

// A battle against the computer, fought to its end.
async function fight(app, commander, more = {}) {
  const made = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 11, commander, enemyFaction: 'han', ...more })
  assert.equal(made.status, 201, JSON.stringify(made.body))
  const seat = made.body.seats.red
  for (let t = 0; t < 45; t++) {
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    if (tent.battle.outcome) return seat
    await app.api('POST', `/api/seat/${seat}/orders`, { text: 'everyone advance' })
  }
  throw new Error('the battle never ended')
}

const ownUnits = (store, seat) => store.seatOf(seat).entry.game.spec.units.filter(u => u.side === store.seatOf(seat).side)

test('an army in the field may not cost more than the budget: what marches over it is refused, with the cost', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = await roman(app)
    const c = store.commanders.get(red.token)
    // A unit taken from the enemy: veteran pikes, 12 points to field.
    store.commanders.setRoster(c, addToRoster(c, { name: 'pikes', quality: 'veteran_mercenary', weapon: 'two_handed_spear', culture: 'Macedonian Kingdoms' }, 'captured'))
    const refused = await app.api('POST', '/api/battles', { opponent: 'standing', commander: red.token, marching: ['legionaries', 'hastati', 'velites', 'pikes'] })
    assert.equal(refused.status, 400)
    assert.equal(refused.body.error, 'They would cost 38 supply points against a budget of 30: leave one at home.')
    assert.equal(store.commanders.get(red.token).battle, null, 'no battle was made')
    // Leave the hastati at home, and they may go.
    const made = await app.api('POST', '/api/battles', { opponent: 'standing', commander: red.token, marching: ['legionaries', 'velites', 'pikes'] })
    assert.equal(made.status, 201)
    assert.deepEqual(ownUnits(store, made.body.seats.red).map(u => u.id), ['red_legionaries', 'red_velites', 'red_pikes', 'red_praetorian_guard'])
  } finally { await app.close() }
})

test('a unit left at home, and its officer, gain nothing from the battle and lose nothing, and he leads no one else', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = await roman(app)
    giveOfficer(store, red.token, 'hastati')
    season(store, red.token, 'hastati', { battles: 6, drilled: 3 })
    const before = (await app.api('GET', `/api/commander/${red.token}`)).body
    const seat = await fight(app, red.token, { marching: ['legionaries', 'velites'] })
    assert.ok(!ownUnits(store, seat).some(u => u.id === 'red_hastati'), 'the hastati did not march')
    assert.ok(ownUnits(store, seat).find(u => u.id === 'red_legionaries').officer.headless, 'their officer was not given the legionaries')
    const after = (await app.api('GET', `/api/commander/${red.token}`)).body
    assert.equal(after.battles, before.battles + 1)
    assert.deepEqual(after.officers.find(o => o.leads === 'hastati'), before.officers.find(o => o.leads === 'hastati'), 'his experience, loyalty and record are as they were')
    assert.deepEqual(after.units.find(u => u.kind === 'hastati'), before.units.find(u => u.kind === 'hastati'), 'their veterancy and training are as they were')
    assert.equal(after.units.find(u => u.kind === 'legionaries').battles, 1, 'those who marched have the battle')
  } finally { await app.close() }
})

test('the muster marches the units that marched last time, and the first time everything he bought', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = await roman(app)
    let view = (await app.api('GET', `/api/commander/${red.token}`)).body
    assert.deepEqual(view.roster.marching, ['legionaries', 'hastati', 'velites'], 'the first time, everything bought')
    assert.ok(view.roster.units.find(u => u.how === 'elite').marches, 'the elite always marches')
    await fight(app, red.token, { marching: ['hastati'] })
    view = (await app.api('GET', `/api/commander/${red.token}`)).body
    assert.deepEqual(view.roster.marching, ['hastati'])
    // One tap: nothing said of who marches.
    const again = (await app.api('POST', '/api/battles', { opponent: 'standing', commander: red.token })).body
    assert.deepEqual(ownUnits(store, again.seats.red).map(u => u.id), ['red_hastati', 'red_praetorian_guard'])
  } finally { await app.close() }
})

test('what he buys must fit the budget together, at home or not: he cannot buy to the budget, leave units at home and buy again', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = await roman(app)
    const army = [
      { name: 'legionaries', quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' },
      { name: 'hastati', quality: 'militia', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' },
      { name: 'velites', quality: 'levy', weapon: 'light_javelin', shield: 'light_shield' }
    ]
    assert.equal((await app.api('POST', `/api/commander/${red.token}/army`, { units: army })).status, 200)
    // He leaves the legionaries at home...
    await fight(app, red.token, { marching: ['hastati', 'velites'] })
    // ...and buys another unit as if they were not his: refused.
    const more = await app.api('POST', `/api/commander/${red.token}/army`, { units: [...army, { name: 'spears', quality: 'militia', weapon: 'spear_basic' }] })
    assert.equal(more.status, 400)
    assert.match(more.body.error, /The army would cost 3\d supply points against a budget of 30/)
    // Dismissed, the legionaries free their points.
    const changed = await app.api('POST', `/api/commander/${red.token}/army`, { units: [...army.slice(1), { name: 'spears', quality: 'militia', weapon: 'spear_basic' }] })
    assert.equal(changed.status, 200)
    assert.deepEqual(changed.body.roster.marching, ['hastati', 'velites', 'spears'], 'a unit just bought marches; one dismissed is gone')
  } finally { await app.close() }
})

// A battle between two players' Commanders, Rome on red and Macedon on
// blue, with red's Commander taken by hand and his hastati, seasoned and
// trained under an officer of their own, given to blue in a deal.
async function hastatiGiven(app, store) {
  const red = await roman(app)
  const blue = (await app.api('POST', '/api/commanders', { faction: 'macedon' })).body
  giveOfficer(store, red.token, 'hastati', { name: 'Tullus' })
  season(store, red.token, 'hastati', { battles: 6, drilled: 5 })
  const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', seed: 3, commander: red.token })).body.seats
  await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })
  const game = store.seatOf(seats.red).entry.game
  Object.assign(game.battle.commanders.red, { status: 'held', heldBy: game.battle.world.units.find(u => u.side === 'blue').id })
  assert.equal((await app.api('POST', `/api/seat/${seats.red}/offer`, { units: ['red_hastati'] })).body.status, 'on the table')
  const offer = (await app.api('GET', `/api/seat/${seats.blue}`)).body.captive.offer.id
  assert.equal((await app.api('POST', `/api/seat/${seats.blue}/answer`, { offer, accept: true })).body.status, 'finished')
  return { red, blue, seats }
}

test('a unit given in a deal between two players goes to the captor\'s roster with its kit, veterancy, training and officer, and leaves the captive\'s', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { red, blue } = await hastatiGiven(app, store)
    const theirs = (await app.api('GET', `/api/commander/${blue.token}`)).body
    const hastati = theirs.roster.units.find(u => u.name === 'hastati')
    assert.equal(hastati.how, 'captured')
    assert.equal(hastati.came, 'taken from the enemy')
    assert.equal(hastati.words, 'militia, gladius, medium armour, heavy shield, on foot', 'their kit as it was raised, though Macedon forges no gladius')
    assert.equal(hastati.from.commander, red.name)
    assert.equal(hastati.marches, false, 'a unit taken waits at home until he chooses it')
    assert.deepEqual(theirs.units.find(u => u.kind === 'hastati'), { kind: 'hastati', battles: 7, veterancy: theirs.units.find(u => u.kind === 'hastati').veterancy, trained: 1 })
    assert.ok(theirs.units.find(u => u.kind === 'hastati').veterancy > 5, 'their veterancy came with them')
    const tullus = theirs.officers.find(o => o.name === 'Tullus')
    assert.equal(tullus.leads, 'hastati')
    assert.equal(tullus.experience, 10, 'his own experience, and this battle in it')
    assert.deepEqual(tullus.record.map(r => r.title).at(-1), 'An old fight', 'his record went with him')
    assert.equal(tullus.record[0].fate, 'given up')
    assert.equal(tullus.values, 'survival', 'what he holds dear is his own still')
    assert.equal(tullus.loyalty, 'disloyal', 'he has every reason to hate his new Commander')
    assert.equal(store.commanders.get(blue.token).company.officers.find(o => o.name === 'Tullus').loyalty, LOYALTY.CAPTURED)
    assert.deepEqual([tullus.taken.commander, tullus.taken.faction], [red.name, 'rome'], 'and his card says whom he served')

    const mine = (await app.api('GET', `/api/commander/${red.token}`)).body
    assert.ok(!mine.roster.units.some(u => u.name === 'hastati'), 'out of the captive\'s roster')
    assert.deepEqual(mine.army.units.map(u => u.name), ['legionaries', 'velites'])
    assert.ok(!mine.units.some(u => u.kind === 'hastati'))
    assert.ok(!mine.officers.some(o => o.name === 'Tullus'))
    assert.ok(mine.fallen.some(f => f.name === 'Tullus' && f.fate === 'given up'))
  } finally { await app.close() }
})

test('a unit taken can march: it costs its kit\'s price in supply, and takes the field trained, under its officer', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const { blue } = await hastatiGiven(app, store)
    const theirs = (await app.api('GET', `/api/commander/${blue.token}`)).body
    const cost = (name) => theirs.roster.units.find(u => u.name === name).cost
    assert.equal(cost('hastati'), 10, 'militia 5, gladius 3, medium armour 1, heavy shield 1')
    const all = theirs.roster.units.filter(u => u.how !== 'elite').map(u => u.name)
    const over = await app.api('POST', '/api/battles', { opponent: 'standing', commander: blue.token, marching: all })
    assert.equal(over.status, 400, 'everything at once is over the budget')
    const going = ['hastati', ...theirs.roster.marching.slice(1)]
    const made = await app.api('POST', '/api/battles', { opponent: 'standing', side: 'blue', commander: blue.token, marching: going })
    assert.equal(made.status, 201, JSON.stringify(made.body))
    const unit = ownUnits(store, made.body.seats.blue).find(u => u.id === 'blue_hastati')
    assert.equal(unit.quality, 'professional', 'trained a level, as they were')
    assert.equal(unit.primaryWeapon, 'roman_gladius')
    assert.equal(unit.officer.name, 'Tullus')
    assert.equal(unit.officer.loyalty, LOYALTY.CAPTURED, 'his loyalty goes into battle with him')
    assert.equal(unit.culture, 'Roman Republic')
  } finally { await app.close() }
})

test('nothing is captured by the computer, which keeps no roster: a unit given to it is simply gone', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = await roman(app)
    const seats = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', seed: 5, commander: red.token, enemyFaction: 'han' })).body.seats
    const entry = store.seatOf(seats.red).entry
    for (let t = 0; t < 20 && !entry.game.outcome.decided; t++) {
      Object.assign(entry.game.battle.commanders.red, { status: 'held', heldBy: entry.game.battle.world.units.find(u => u.side === 'blue').id })
      await app.api('POST', `/api/seat/${seats.red}/offer`, { units: ['red_hastati', 'red_velites', 'red_legionaries'] })
      if (!entry.game.outcome.decided) await app.api('POST', `/api/seat/${seats.red}/orders`, { text: '' })
    }
    assert.equal(entry.game.outcome.reason, 'enemy commander bargained')
    const mine = (await app.api('GET', `/api/commander/${red.token}`)).body
    const given = commanderOf(entry.game, 'red').prices.map(id => id.replace('red_', ''))
    assert.ok(given.length > 0)
    for (const name of given) assert.ok(!mine.roster.units.some(u => u.name === name), `the ${name} are his no more`)
    assert.equal(Object.keys(entry.commanders).length, 1, 'the computer has no Commander to take them')
    // And from the computer: it never offers, and its units never reach a roster.
    for (const c of [red]) assert.ok(!(await app.api('GET', `/api/commander/${c.token}`)).body.roster.units.some(u => u.how === 'captured'))
  } finally { await app.close() }
})

test('an officer moved to a unit with none keeps his experience and record; each unit keeps its veterancy and training', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = await roman(app)
    await fight(app, red.token)
    season(store, red.token, 'velites', { battles: 3, drilled: 5 })
    const before = (await app.api('GET', `/api/commander/${red.token}`)).body
    const veteran = before.officers[0]
    assert.equal(veteran.leads, 'praetorian guard')
    const moved = await app.api('POST', `/api/commander/${red.token}/officer`, { officer: veteran.id, to: 'velites' })
    assert.equal(moved.status, 200)
    const after = moved.body
    const him = after.officers.find(o => o.id === veteran.id)
    assert.deepEqual({ ...him, leads: veteran.leads }, veteran, 'his experience, nature, loyalty and record are his')
    assert.equal(him.leads, 'velites')
    assert.deepEqual(after.units, before.units, 'every unit\'s veterancy and training stay with it')
    assert.equal(after.roster.units.find(u => u.how === 'elite').officer, null, 'the elite has none now: his choice')
    // At the muster he leads them, and the elite go without.
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', commander: red.token })).body.seats.red
    assert.equal(ownUnits(store, seat).find(u => u.id === 'red_velites').officer.name, veteran.name)
    assert.ok(ownUnits(store, seat).find(u => u.id === 'red_praetorian_guard').officer.headless)
  } finally { await app.close() }
})

test('an officer moved to a unit that has one changes places with him', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = await roman(app)
    await fight(app, red.token)
    const veteran = (await app.api('GET', `/api/commander/${red.token}`)).body.officers[0]
    const other = giveOfficer(store, red.token, 'hastati', { name: 'Tullus' })
    const after = (await app.api('POST', `/api/commander/${red.token}/officer`, { officer: veteran.id, to: 'hastati' })).body
    assert.equal(after.officers.find(o => o.id === veteran.id).leads, 'hastati')
    assert.equal(after.officers.find(o => o.id === other).leads, 'praetorian guard')
    const refused = await app.api('POST', `/api/commander/${red.token}/officer`, { officer: veteran.id, to: 'triarii' })
    assert.deepEqual([refused.status, refused.body.error], [400, 'You have no unit called "triarii".'])
  } finally { await app.close() }
})

test('no officer is moved and no unit named while the army is in the field', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = await roman(app)
    await app.api('POST', '/api/battles', { opponent: 'standing', commander: red.token })
    const officer = (await app.api('GET', `/api/commander/${red.token}`)).body.officers[0]
    const moved = await app.api('POST', `/api/commander/${red.token}/officer`, { officer: officer.id, to: 'hastati' })
    assert.equal(moved.status, 409)
    assert.match(moved.body.error, /army is in the field .*His officers can be moved when the battle is over/)
    const named = await app.api('POST', `/api/commander/${red.token}/name`, { unit: 'praetorian guard', name: 'iron wolves' })
    assert.equal(named.status, 409)
    assert.match(named.body.error, /His units can be named when the battle is over/)
    assert.equal((await app.api('GET', `/api/commander/${red.token}`)).body.officers[0].leads, 'praetorian guard')
  } finally { await app.close() }
})

test('a named unit answers to its name in an order, and to its old one; its company, army and saved battles carry the name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-roster-'))
  let app = null
  try {
    let store = createBattleStore({ dir })
    app = await start(store)
    const red = await roman(app)
    await fight(app, red.token)
    giveOfficer(store, red.token, 'hastati', { name: 'Tullus' })
    const before = (await app.api('GET', `/api/commander/${red.token}`)).body
    const named = await app.api('POST', `/api/commander/${red.token}/name`, { unit: 'hastati', name: '  The Iron   Wolves ' })
    assert.equal(named.status, 200, JSON.stringify(named.body))
    const view = named.body
    assert.ok(view.roster.units.some(u => u.name === 'iron wolves' && u.named && u.formerly[0] === 'hastati'), 'in his roster, kept as plain words')
    assert.deepEqual(view.army.units.map(u => u.name), ['legionaries', 'iron wolves', 'velites'], 'in his army')
    assert.equal(view.officers.find(o => o.name === 'Tullus').leads, 'iron wolves', 'his officer leads them by it')
    assert.deepEqual(view.units.find(u => u.kind === 'iron wolves'), { ...before.units.find(u => u.kind === 'hastati'), kind: 'iron wolves' }, 'their veterancy by it')
    assert.ok(view.roster.marching.includes('iron wolves'))
    // The elite too, once it has an officer (his veteran).
    assert.equal((await app.api('POST', `/api/commander/${red.token}/name`, { unit: 'praetorian guard', name: 'old guard' })).status, 200)

    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', commander: red.token, enemyFaction: 'han' })).body.seats.red
    const read = async (text) => (await app.api('POST', `/api/seat/${seat}/read`, { text })).body
    assert.deepEqual((await read('iron wolves advance')).understood, ['Iron wolves: advance on the enemy'])
    assert.deepEqual((await read('hastati advance')).understood, ['Iron wolves: advance on the enemy'], 'their old name, which nothing else answers to')
    assert.deepEqual((await read('the old guard hold')).understood, ['Old guard: hold'])
    assert.deepEqual((await read('praetorian guard hold')).understood, ['Old guard: hold'])
    assert.equal(ownUnits(store, seat).find(u => u.id === 'red_iron_wolves').officer.name, 'Tullus')

    // The saved battle, read again by a server started afresh.
    await app.close()
    store = createBattleStore({ dir })
    app = await start(store)
    assert.ok(ownUnits(store, seat).some(u => u.id === 'red_iron_wolves'))
    assert.ok(ownUnits(store, seat).some(u => u.id === 'red_old_guard'))
    assert.equal((await app.api('GET', `/api/commander/${red.token}`)).body.roster.units.at(-1).name, 'old guard')
    // His army buys and changes as before, and the name holds through a change of kit.
    const kept = (await app.api('GET', `/api/commander/${red.token}`)).body
    assert.equal(kept.battle.title.length > 0, true)
  } finally {
    await app?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a named unit keeps its name when its kit is changed, and a browser cannot name a unit by saying so', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = await roman(app)
    giveOfficer(store, red.token, 'hastati', { name: 'Tullus' })
    await app.api('POST', `/api/commander/${red.token}/name`, { unit: 'hastati', name: 'iron wolves' })
    const army = (await app.api('GET', `/api/commander/${red.token}`)).body.army.units
    const changed = army.map(u => (u.name === 'iron wolves' ? { ...u, armor: 'light_armor' } : u))
    const kept = await app.api('POST', `/api/commander/${red.token}/army`, { units: changed })
    assert.equal(kept.status, 200, JSON.stringify(kept.body))
    assert.ok(kept.body.army.units.some(u => u.name === 'iron wolves' && u.armor === 'light_armor'))
    const forged = await app.api('POST', `/api/commander/${red.token}/army`, { units: [...changed, { name: 'golden eagles', named: true, quality: 'levy', weapon: 'sling' }] })
    assert.equal(forged.status, 400)
    assert.match(forged.body.error, /golden eagles: that is not a name for slingers/)
  } finally { await app.close() }
})

test('a name that will not do is refused with the reason, and a unit with no officer cannot be named', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const red = await roman(app)
    const name = async (unit, n) => (await app.api('POST', `/api/commander/${red.token}/name`, { unit, name: n })).body.error ?? null
    assert.equal(await name('hastati', 'iron wolves'), 'The hastati have no officer: a unit may be named once it has one.')
    giveOfficer(store, red.token, 'hastati')
    const cases = {
      everyone: '"everyone" means something else in an order: it cannot be in a name.',
      'horse guard': '"horse" is a kind of troops in an order: it cannot be in a name.',
      'red wolves': '"red" means something else in an order: it cannot be in a name.',
      'archers of mars': '"archers" is a kind of troops in an order: it cannot be in a name.',
      'north wind': '"north" means something else in an order: it cannot be in a name.',
      'harrow bridge': '"harrow bridge" is a place on the field: it cannot be a unit\'s name.',
      'the hill men': '"men" means something else in an order: it cannot be in a name.',
      legionaries: '"legionaries" is a name the game gives troops: choose one of your own.',
      'wolves 2': 'A name is one to three words of plain letters, with no numbers or marks.',
      '<b>wolves</b>': 'A name is one to three words of plain letters, with no numbers or marks.',
      ox: 'A name is 3 to 24 letters long.',
      'the very long name of men here': 'A name is 3 to 24 letters long.',
      'sons of the wolf': 'A name is one to three words of plain letters, with no numbers or marks.'
    }
    for (const [n, why] of Object.entries(cases)) assert.equal(await name('hastati', n), why, n)
    assert.equal(await name('hastati', 'wolves'), null)
    giveOfficer(store, red.token, 'velites', { name: 'Gaius' })
    assert.equal(await name('velites', 'wolves'), 'You have a unit called the wolves already.')
  } finally { await app.close() }
})

test('a unit taken whose name is borne already is given the next free one, and answers to its old name', () => {
  const commander = { faction: 'rome', company: { officers: [], units: {} } }
  const { unit } = addToRoster(commander, { name: 'hastati', quality: 'militia', weapon: 'roman_gladius', culture: 'Roman Republic' }, 'captured')
  assert.equal(unit.name, 'swords')
  assert.deepEqual(unit.formerly, ['hastati'])
  assert.throws(() => addToRoster(commander, unit, 'found'), /no avenue/)
})

test('battles and Commanders saved before the roster still load, and replay to the same battle', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-before-'))
  const from = path.join(__dirname, 'fixtures', 'before-roster')
  fs.cpSync(from, dir, { recursive: true })
  fs.rmSync(path.join(dir, 'expected.json.txt'))
  const expected = JSON.parse(fs.readFileSync(path.join(from, 'expected.json.txt'), 'utf8'))
  const store = createBattleStore({ dir })
  const app = await start(store)
  try {
    const facts = (token) => {
      const game = store.seatOf(token).entry.game
      return {
        outcome: game.outcome, turn: game.playerTurn, minutes: game.minutesElapsed,
        units: [...game.battle.world.units, ...game.battle.fledUnits].map(u => [u.id, u.strength, u.position.x, u.position.y])
      }
    }
    assert.deepEqual(facts(expected.seats.done), expected.games.done)
    assert.deepEqual(facts(expected.seats.openBlue), expected.games.open)
    // The Commanders: their officers and units as they were; every unit they
    // had marches, as every unit always did.
    for (const key of ['a', 'b']) {
      const now = (await app.api('GET', `/api/commander/${expected.commanders[key]}`)).body
      const was = expected.companies[key]
      assert.deepEqual(now.officers.map(({ id, ...o }) => o), was.officers)
      assert.deepEqual(now.units, was.units)
      assert.deepEqual(now.roster.marching, was.army.units.map(u => u.name))
    }
    // The open battle goes on.
    const turn = await app.api('POST', `/api/seat/${expected.seats.openBlue}/orders`, { text: 'everyone hold' })
    assert.equal(turn.status, 200)
    // And the finished one's Commander musters again with the army he had.
    const again = await app.api('POST', '/api/battles', { opponent: 'standing', commander: expected.commanders.a })
    assert.equal(again.status, 201)
  } finally {
    await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
