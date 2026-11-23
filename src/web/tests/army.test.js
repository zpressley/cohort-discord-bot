// src/web/tests/army.test.js
//
// Buying the army, through the HTTP API: a Commander's standard army is his,
// kept on the server, checked through the builder whatever the browser
// sends, changed only between battles; mustering never waits on it; every
// unit has a name the order reader finds; officers stay earned. And the one
// kind of battle: to the end, against any faction, his own included.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { FACTIONS } = require('../../data/factions')
const { fieldFactions } = require('../../engine/army/factions')
const { loadScenario } = require('../../adapters/hotseat/scenarios')
const { boughtArmies } = require('../../harness/bought-league')

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
  return { server, api, close: () => new Promise(resolve => server.close(resolve)) }
}

const ROMAN = [
  { name: 'legionaries', quality: 'professional', weapon: 'roman_gladius', armor: 'heavy_armor', shield: 'heavy_shield' },
  { name: 'slingers', quality: 'levy', weapon: 'sling' },
  { name: 'slingers 2', quality: 'levy', weapon: 'sling' },
  { name: 'riders', quality: 'levy', weapon: 'sword_standard', mounted: true }
]

test('an army over its budget is refused, in the builder\'s words, and nothing is kept', async () => {
  const app = await start()
  try {
    const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
    const rich = ROMAN.map(u => ({ ...u, quality: 'veteran_mercenary' }))
    const refused = await app.api('POST', `/api/commander/${made.token}/army`, { units: rich })
    assert.equal(refused.status, 400)
    assert.match(refused.body.error, /The army would cost \d+ supply points against a budget of 30/)
    assert.deepEqual(refused.body.errors, [refused.body.error])
    assert.equal((await app.api('GET', `/api/commander/${made.token}`)).body.army.own, false)
  } finally { await app.close() }
})

test('an army with kit its culture may not field is refused with the builder\'s reason, unit by unit', async () => {
  const app = await start()
  try {
    const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
    const units = [{ name: 'pikes', quality: 'professional', weapon: 'macedonian_sarissa' }, { name: 'archers', quality: 'tribal_warriors', weapon: 'self_bow_basic' }]
    const refused = await app.api('POST', `/api/commander/${made.token}/army`, { units })
    assert.equal(refused.status, 400)
    assert.deepEqual(refused.body.errors, [
      'Pikes: the sarissa is not forged by Roman Republic',
      'Archers: Roman Republic cannot field Tribal Warriors — the loyalty bond is tribal identity'
    ])
    // The army screen hears the same reasons before anything is sent.
    const seen = (await app.api('POST', '/api/factions/rome/appraise', { units: [], draft: { quality: 'levy', weapon: 'spear_basic' } })).body
    const option = (field, value) => seen.draft.options[field].find(o => o.value === value)
    assert.equal(option('quality', 'tribal_warriors').refused, 'Roman Republic cannot field Tribal Warriors — the loyalty bond is tribal identity')
    assert.equal(option('armor', 'heavy_armor').refused, 'Levy troops cannot bear heavy armour')
    assert.ok(!seen.draft.options.weapon.some(o => o.value === 'macedonian_sarissa'), 'another culture\'s weapons are not offered')
    assert.equal(option('weapon', 'two_handed_spear').refused, 'The pike demands professional training or better')
    assert.equal(option('shield', 'medium_shield').refused, null)
  } finally { await app.close() }
})

test('a choice that would overspend the budget is refused with the budget\'s reason', async () => {
  const app = await start()
  try {
    const units = [{ name: 'legionaries', quality: 'veteran_mercenary', weapon: 'roman_gladius', armor: 'heavy_armor', shield: 'heavy_shield' }]
    const seen = (await app.api('POST', '/api/factions/rome/appraise', { units, draft: { quality: 'levy', weapon: 'roman_gladius' } })).body
    assert.equal(seen.spent, 15)
    assert.equal(seen.left, 15)
    assert.equal(seen.draft.options.quality.find(o => o.value === 'veteran_mercenary').refused, null)
    const more = (await app.api('POST', '/api/factions/rome/appraise', { units: [...units, { ...units[0], name: 'hastati', armor: 'medium_armor', shield: 'no_shield' }], draft: { quality: 'levy', weapon: 'sling' } })).body
    assert.equal(more.left, 3)
    assert.equal(more.draft.refused, 'The army would cost 31 supply points against a budget of 30')
    assert.ok(more.left < more.cheapest, 'no room for another unit')
  } finally { await app.close() }
})

test('the elite cannot be bought or sold: refused as a purchase, under its name, and in every army', async () => {
  const app = await start()
  try {
    const made = (await app.api('POST', '/api/commanders', { faction: 'han' })).body
    const bought = await app.api('POST', `/api/commander/${made.token}/army`, { units: [{ name: 'swords', quality: 'elite', weapon: 'chinese_dao' }] })
    assert.equal(bought.status, 400)
    assert.match(bought.body.error, /Swords: elite troops cannot be bought/)
    const named = await app.api('POST', `/api/commander/${made.token}/army`, { units: [{ name: 'yulin guard', quality: 'levy', weapon: 'chinese_dao' }] })
    assert.match(named.body.error, /the elite's name/)
    // Kept with one crossbow unit: the elite comes too, at no cost.
    const kept = await app.api('POST', `/api/commander/${made.token}/army`, { units: [{ name: 'crossbows', quality: 'professional', weapon: 'han_chinese_crossbow' }] })
    assert.equal(kept.status, 200)
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: made.token, seed: 2 })).body.seats.red
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.deepEqual(tent.own.map(u => u.name), ['Crossbows', 'Yulin guard'])
    assert.equal(tent.commander.with, 'Yulin guard')
  } finally { await app.close() }
})

test('an army cannot be changed while it is in the field; once the battle is over it can', async () => {
  const app = await start()
  try {
    const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
    assert.equal((await app.api('POST', `/api/commander/${made.token}/army`, { units: ROMAN })).status, 200)
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: made.token, seed: 4 })).body.seats.red
    const refused = await app.api('POST', `/api/commander/${made.token}/army`, { usual: true })
    assert.equal(refused.status, 409)
    assert.match(refused.body.error, /army is in the field .* can be changed when the battle is over/)
    assert.equal((await app.api('POST', `/api/commander/${made.token}/army`, { units: ROMAN.slice(0, 2) })).status, 409)
    await app.api('POST', `/api/seat/${seat}/orders`, { text: 'yield' })
    const usual = await app.api('POST', `/api/commander/${made.token}/army`, { usual: true })
    assert.equal(usual.status, 200)
    assert.deepEqual(usual.body.army, { own: false, units: (await app.api('GET', `/api/commander/${made.token}`)).body.army.units })
    assert.deepEqual(usual.body.army.units.map(u => u.name), ['legionaries', 'hastati', 'slingers'])
  } finally { await app.close() }
})

test('a Commander with no army built musters with his faction\'s usual one', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const made = (await app.api('POST', '/api/commanders', { faction: 'macedon' })).body
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: made.token, enemyFaction: 'han', seed: 9, map: 'ravenridge' })).body.seats.red
    const spec = store.seatOf(seat).entry.game.spec
    const usual = fieldFactions(loadScenario('meeting-battle', { map: 'ravenridge', deploy: true }), { red: 'macedon', blue: 'han' })
    assert.deepEqual(spec.units.map(u => [u.id, u.position, u.primaryWeapon]), usual.units.map(u => [u.id, u.position, u.primaryWeapon]))
  } finally { await app.close() }
})

test('every bought unit has a distinct name, and the order reader finds each one by it', async () => {
  const app = await start()
  try {
    for (const faction of Object.keys(FACTIONS)) {
      for (const [kind, units] of Object.entries(boughtArmies(faction))) {
        const made = (await app.api('POST', '/api/commanders', { faction })).body
        assert.equal((await app.api('POST', `/api/commander/${made.token}/army`, { units })).status, 200, `${faction} ${kind}`)
        const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'blue', commander: made.token, seed: 3 })).body.seats.blue
        const tent = (await app.api('GET', `/api/seat/${seat}`)).body
        assert.equal(new Set(tent.own.map(u => u.name)).size, tent.own.length, `${faction} ${kind}: names are distinct`)
        const text = tent.own.map(u => `${u.name.toLowerCase()} hold`).join('\n')
        const read = (await app.api('POST', `/api/seat/${seat}/read`, { text })).body
        assert.deepEqual(read.questions, [], `${faction} ${kind}`)
        assert.deepEqual(read.understood, tent.own.map(u => `${u.name}: hold`), `${faction} ${kind}`)
      }
    }
    // A name the game would not give that kit is refused: none says "everyone".
    const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
    const odd = await app.api('POST', `/api/commander/${made.token}/army`, { units: [{ name: 'everyone', quality: 'levy', weapon: 'sling' }] })
    assert.equal(odd.status, 400)
    assert.match(odd.body.error, /Everyone: that is not a name for slingers/)
    const twice = await app.api('POST', `/api/commander/${made.token}/army`, { units: [ROMAN[1], ROMAN[1]] })
    assert.match(twice.body.error, /two units are called "slingers"/)
  } finally { await app.close() }
})

test('a unit kept keeps its officer, a dismissed unit\'s battles are lost, a new unit has none, and rebuilding makes no officer', async () => {
  const store = createBattleStore({})
  const app = await start(store)
  try {
    const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
    const commander = store.commanders.get(made.token)
    // Some battles on: an officer with the legionaries, and the hastati and
    // slingers two and one battles toward one.
    store.commanders.setCompany(commander, {
      ...commander.company,
      battles: 3,
      officers: [
        { id: 'o1', name: 'Gaius', experience: 9, personality: 'steady', leads: 'praetorians', status: 'fit', record: [] },
        { id: 'o2', name: 'Marcus', experience: 4, personality: 'bold', leads: 'legionaries', status: 'fit', record: [] }
      ],
      units: { hastati: 2, slingers: 1 },
      nextId: 3
    })
    // Legionaries kept with new kit, hastati dismissed, slingers kept, riders bought.
    const army = [ROMAN[0], ROMAN[1], ROMAN[3]]
    const kept = (await app.api('POST', `/api/commander/${made.token}/army`, { units: army })).body
    assert.deepEqual(kept.unled, [{ kind: 'slingers', battles: 1 }])
    assert.deepEqual(kept.officers.map(o => [o.name, o.leads]), [['Gaius', 'praetorians'], ['Marcus', 'legionaries']])
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: made.token, seed: 5 })).body.seats.red
    const own = (await app.api('GET', `/api/seat/${seat}`)).body.own
    const officer = (name) => own.find(u => u.name === name).officer
    assert.equal(officer('Legionaries').name, 'Marcus')
    assert.equal(officer('Praetorians').name, 'Gaius')
    assert.ok(officer('Slingers').headless && officer('Riders').headless)
    await app.api('POST', `/api/seat/${seat}/orders`, { text: 'yield' })

    // Dismissing and buying back the slingers starts them again from nothing;
    // dismissing the legionaries frees Marcus to lead the best unit with none.
    const after = (await app.api('GET', `/api/commander/${made.token}`)).body
    const before = after.officers.length
    await app.api('POST', `/api/commander/${made.token}/army`, { units: [ROMAN[3]] })
    const again = (await app.api('POST', `/api/commander/${made.token}/army`, { units: [ROMAN[1], ROMAN[3]] })).body
    assert.deepEqual(again.unled.find(u => u.kind === 'slingers'), undefined, 'the slingers\' battles went with them')
    assert.equal(again.officers.length, before, 'no officer is made by changing the army')
    const next = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: made.token, seed: 6 })).body.seats.red
    const led = (await app.api('GET', `/api/seat/${next}`)).body.own.filter(u => u.officer && !u.officer.headless).map(u => u.name)
    assert.ok(led.includes('Praetorians'))
    assert.ok(led.length <= before, 'no more units led than there are officers')
  } finally { await app.close() }
})

test('the friend who joins brings his own Commander\'s bought army', async () => {
  const app = await start()
  try {
    const red = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
    const blue = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
    await app.api('POST', `/api/commander/${blue.token}/army`, { units: ROMAN })
    const { seats } = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', commander: red.token, seed: 5 })).body
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue.token })).status, 200)
    const tent = (await app.api('GET', `/api/seat/${seats.blue}`)).body
    assert.deepEqual(tent.own.map(u => u.name), ['Legionaries', 'Slingers', 'Slingers 2', 'Riders', 'Praetorians'])
    assert.equal(tent.battle.title, 'Crownhill: Rome against Rome')
    const reds = (await app.api('GET', `/api/seat/${seats.red}`)).body.own.map(u => u.name)
    assert.deepEqual(reds, ['Legionaries', 'Hastati', 'Slingers', 'Praetorians'], 'the mustering side brings the usual army')
  } finally { await app.close() }
})

test('the same faction may fight on both sides, by choice or by lot, and each side knows its own by name', async () => {
  const app = await start()
  try {
    const made = (await app.api('POST', '/api/commanders', { faction: 'sarmatia' })).body
    const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: made.token, enemyFaction: 'sarmatia', seed: 7 })).body.seats.red
    const tent = (await app.api('GET', `/api/seat/${seat}`)).body
    assert.equal(tent.battle.title, 'Crownhill: Sarmatia against Sarmatia')
    const read = (await app.api('POST', `/api/seat/${seat}/read`, { text: 'horse archers 1 hold\nscale riders advance' })).body
    assert.deepEqual(read.understood, ['Horse archers 1: hold', 'Scale riders: advance on the enemy'])
    // By lot, over enough seeds, his own faction comes up.
    const titles = new Set()
    for (let seed = 1; seed <= 24; seed++) {
      titles.add((await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', faction: 'rome', seed })).body.title)
    }
    assert.ok(titles.has('Crownhill: Rome against Rome'), [...titles].join(', '))
  } finally { await app.close() }
})

test('a deathmatch ends only when a side yields the field, loses its army, or loses its Commander, and the app has words for each', async () => {
  const app = await start()
  const ENDS = ['enemy surrendered', 'enemy commander bargained', 'enemy army broken', 'enemy army collapsed', 'enemy commander killed', 'both commanders killed', 'mutual collapse', 'mutual ruin']
  try {
    const reasons = new Set()
    for (let seed = 1; seed <= 6; seed++) {
      const made = (await app.api('POST', '/api/commanders', { faction: Object.keys(FACTIONS)[seed % 4] })).body
      // As the app musters: no time limit, no ground to hold.
      const seat = (await app.api('POST', '/api/battles', { opponent: 'standing', side: 'red', commander: made.token, seed, map: ['crownhill', 'ashford', 'thornwood'][seed % 3] })).body.seats.red
      let tent = (await app.api('GET', `/api/seat/${seat}`)).body
      assert.equal(tent.battle.timeLimitMinutes, null)
      assert.deepEqual(tent.objectives, [])
      for (let turn = 0; turn < 60 && tent.battle.status !== 'finished'; turn++) {
        await app.api('POST', `/api/seat/${seat}/orders`, { text: seed === 1 && turn === 2 ? 'yield' : 'everyone advance' })
        tent = (await app.api('GET', `/api/seat/${seat}`)).body
      }
      assert.equal(tent.battle.status, 'finished', `seed ${seed}`)
      reasons.add(tent.battle.outcome.reason)
    }
    assert.ok(reasons.has('enemy surrendered'))
    assert.ok([...reasons].some(r => /army/.test(r)), [...reasons].join(', '))
    for (const r of reasons) assert.ok(ENDS.includes(r), `${r} is one of the three ways`)
    // The verdict screen says each in the app's own words.
    const page = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
    for (const r of ENDS) assert.ok(page.includes(`'${r}'`), `the verdict has words for "${r}"`)
    assert.match(page, /'enemy surrendered': \['The enemy yielded the field', 'You yielded the field'\]/)
  } finally { await app.close() }
})
