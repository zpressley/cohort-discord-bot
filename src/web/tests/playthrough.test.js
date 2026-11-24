// src/web/tests/playthrough.test.js
//
// What a whole playthrough of the game turned up where its pieces meet
// (docs/REVIEW-2026-11.md, "Playthrough, November 24"), each as the rule it
// now keeps.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createServer } = require('../server')
const { createBattleStore, namedChoices } = require('../battles')
const { plain } = require('../armies')
const { BATTLE_OVER } = require('../../narrator/words')

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
  return { store, api, close: () => new Promise(resolve => server.close(resolve)) }
}

// A battle with a Commander on the field, played by "everyone advance" to
// its end: on Crownhill the computer takes the hill and the battle stops
// for it too, so the battle's stops outrun the player's turns.
async function playOut(app, seed) {
  const made = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body
  const token = (await app.api('POST', '/api/battles', { map: 'crownhill', opponent: 'standing', side: 'red', commander: made.token, faction: 'rome', enemyFaction: 'macedon', seed })).body.seats.red
  let tent
  for (let i = 0; i < 60; i++) {
    tent = (await app.api('GET', `/api/seat/${token}`)).body
    if (tent.battle.status === 'finished') break
    await app.api('POST', `/api/seat/${token}/orders`, { text: 'everyone advance' })
  }
  return { token, tent }
}

test('a finished battle tells you the turn it ended in, your last dispatch\'s, not the battle\'s count of stops; the replay still reaches every stop', async () => {
  const app = await start()
  try {
    const { token, tent } = await playOut(app, 5)
    assert.equal(tent.battle.status, 'finished')
    assert.equal(tent.battle.turn, tent.dispatches[0].turn, 'the bar\'s turn is the last dispatch\'s')
    assert.ok(tent.verdict.replayTo >= tent.battle.turn, 'the replay goes to the battle\'s last stop')
    const last = (await app.api('GET', `/api/seat/${token}/replay?turn=${tent.verdict.replayTo}`)).body
    assert.equal(last.turn, tent.verdict.replayTo)
    assert.equal(last.battle.minutes, tent.battle.minutes, 'its last step is the field as the battle ended')
  } finally { await app.close() }
})

test('the last dispatch says who won and why in your own words, never "Red won (enemy army broken)"', async () => {
  const app = await start()
  try {
    const { tent } = await playOut(app, 5)
    const lines = tent.dispatches[0].lines.join('\n')
    assert.match(lines, /The battle is over: .*\. The field is (yours|the enemy's)/)
    assert.doesNotMatch(lines, /\b(Red|Blue) won\b|\((enemy|objectives|time ran out)/)
  } finally { await app.close() }
  assert.equal(BATTLE_OVER.line('enemy army broken', true), 'The battle is over: the enemy army broke. The field is yours')
  assert.equal(BATTLE_OVER.line('enemy army broken', false), 'The battle is over: your army broke. The field is the enemy\'s')
  assert.equal(BATTLE_OVER.line('mutual ruin', null), 'The battle is over, and neither side has won: both armies are spent')
})

test('a choice between two seen enemies names each by the name your side knows it by, and carries no unit id to the browser', () => {
  const name = (text) => String(text).replace(/\bblue_light_horse\b/g, 'enemy light horse').replace(/\bblue_horse_archers\b/g, 'enemy horse archers')
  const choices = namedChoices([{
    question: 'Which horse archers do you mean? You have seen 2: blue_horse_archers (last seen at G6-NW), blue_light_horse (in sight at E4-SE).',
    place: 'horse archers',
    options: [
      { label: 'horse archers last seen at G6-NW', square: 'G6-NW', text: 'horse archers at G6-NW', enemy: 'blue_horse_archers', seen: 'last seen at G6-NW' },
      { label: 'horse archers in sight at E4-SE', square: 'E4-SE', text: 'horse archers at E4-SE', enemy: 'blue_light_horse', seen: 'in sight at E4-SE' }
    ]
  }], name)
  assert.deepEqual(choices[0].options.map(o => o.label), ['enemy horse archers last seen at G6-NW', 'enemy light horse in sight at E4-SE'])
  assert.doesNotMatch(JSON.stringify(choices), /blue_/)
  assert.deepEqual(choices[0].options.map(o => o.text), ['horse archers at G6-NW', 'horse archers at E4-SE'], 'what a choice writes into the orders is unchanged')
})

test('against a friend the battle is "Rome against a friend" until he chooses who leads, then against his own faction; never the faction the lot put in his seat for now', async () => {
  const app = await start()
  try {
    const red = (await app.api('POST', '/api/commanders', { faction: 'rome' })).body.token
    const seats = (await app.api('POST', '/api/battles', { opponent: 'friend', side: 'red', commander: red, seed: 4 })).body.seats
    for (const side of ['red', 'blue']) assert.equal((await app.api('GET', `/api/seat/${seats[side]}`)).body.battle.title, 'Crownhill: Rome against a friend')
    const blue = (await app.api('POST', '/api/commanders', { faction: 'parthia' })).body.token
    assert.equal((await app.api('POST', `/api/seat/${seats.blue}/join`, { commander: blue })).status, 200)
    assert.equal((await app.api('GET', `/api/seat/${seats.red}`)).body.battle.title, 'Crownhill: Rome against Parthia')
  } finally { await app.close() }
})

test('the builder\'s reason names a weapon once: "the great mace", not "the great the mace"', () => {
  assert.equal(plain('heavy_mace demands professional training or better'), 'The great mace demands professional training or better')
  assert.equal(plain('unit 2: spear_basic cannot be used from horseback', ['riders', 'spears']), 'Spears: the spear cannot be used from horseback')
})
