// src/web/tests/perks.test.js
//
// Each people's perks and restrictions on the screens (docs/design/
// army-balance.md, part 9): the perks a line each where he chooses his
// faction and on the army screen; a restriction said when a purchase is
// refused, as the builder's other refusals are; an army bought before
// left alone.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { PERK_WORDS } = require('../../narrator/words')

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
  return { server, api, store, close: () => new Promise(resolve => server.close(resolve)) }
}

test('every faction on the choosing screen comes with its perks, a line each, in the words of words.js', async () => {
  const app = await start()
  try {
    const factions = (await app.api('GET', '/api/factions')).body
    assert.equal(factions.length, 20)
    for (const f of factions) {
      assert.ok(f.perks.length > 0, `${f.id} has no perk to show`)
      for (const p of f.perks) assert.ok(Object.values(PERK_WORDS).some(w => w.name === p.name && w.said === p.said), `${f.id}: ${p.name}`)
    }
    const germania = factions.find(f => f.id === 'germania')
    assert.deepEqual(germania.perks.map(p => p.name), [PERK_WORDS.woodland.name])
  } finally { await app.close() }
})

test('the army screen shows the faction\'s perks', async () => {
  const app = await start()
  try {
    const seen = (await app.api('POST', '/api/factions/sparta/appraise', { units: [] })).body
    assert.deepEqual(seen.perks.map(p => p.name), [PERK_WORDS.last_man.name, PERK_WORDS.perioeci.name])
  } finally { await app.close() }
})

test('a restriction refuses a purchase in the builder\'s style: Sarmatia buys no foot', async () => {
  const app = await start()
  try {
    const made = (await app.api('POST', '/api/commanders', { faction: 'sarmatia' })).body
    const refused = await app.api('POST', `/api/commander/${made.token}/army`, { units: [{ name: 'spears', quality: 'tribal_warriors', weapon: 'spear_basic' }] })
    assert.equal(refused.status, 400)
    assert.deepEqual(refused.body.errors, ['Sarmatia fights on horseback: no foot'])
    // On the screen, "on foot" is refused with the same words.
    const seen = (await app.api('POST', '/api/factions/sarmatia/appraise', { units: [], draft: { quality: 'tribal_warriors', weapon: 'self_bow_basic', mounted: true } })).body
    assert.equal(seen.draft.options.mounted.find(o => o.value === false).refused, 'Sarmatia fights on horseback: no foot')
    assert.equal(seen.draft.options.mounted.find(o => o.value === true).refused, null)
  } finally { await app.close() }
})

test('a restriction on the army as a whole is said of the army: Rome with too little heavy foot', async () => {
  const app = await start()
  try {
    const units = [{ name: 'slingers', quality: 'levy', weapon: 'sling' }, { name: 'slingers 2', quality: 'levy', weapon: 'sling' }, { name: 'slingers 3', quality: 'levy', weapon: 'sling' }]
    const seen = (await app.api('POST', '/api/factions/rome/appraise', { units, draft: { quality: 'levy', weapon: 'sling' } })).body
    assert.match(seen.errors.join(' '), /Rome fights with heavy foot: at least half of the army/)
    assert.equal(seen.draft.options.weapon.find(o => o.value === 'sling').refused, null, 'one more slinger is not refused for it: the army as a whole is')
  } finally { await app.close() }
})

test('an army kept before a restriction still passes muster: restrictions hold when an army is bought', () => {
  const { checkArmy } = require('../armies')
  const slingers = [{ name: 'slingers', quality: 'levy', weapon: 'sling' }, { name: 'slingers 2', quality: 'levy', weapon: 'sling' }]
  assert.equal(checkArmy('rome', slingers).ok, false, 'bought now, it is refused')
  assert.equal(checkArmy('rome', slingers, { restrictions: false }).ok, true, 'kept before, it musters (battles.js, musterArmies)')
})
