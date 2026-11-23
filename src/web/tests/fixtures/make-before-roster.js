// src/web/tests/fixtures/make-before-roster.js
//
// How `before-roster/` was made, with the code as it stood before the
// roster (Commanders kept every unit they bought in the field): a Commander
// of Rome with a bought army and one battle fought to the end against the
// computer, and a battle between two Commanders still under way. Kept for
// the record; running it again makes a new set (new ids), which the test
// would then take as its own. `expected.json.txt` is what the server said
// of them then.

const path = require('path')
const fs = require('fs')
const { createBattleStore } = require('../../battles')

const dir = path.join(__dirname, 'before-roster')

// What a battle is, whatever the screens make of it: how it stands, and
// every unit's men and place.
function facts(store, token) {
  const game = store.seatOf(token).entry.game
  return {
    outcome: game.outcome, turn: game.playerTurn, minutes: game.minutesElapsed,
    units: [...game.battle.world.units, ...game.battle.fledUnits].map(u => [u.id, u.strength, u.position.x, u.position.y])
  }
}

;(async () => {
  fs.mkdirSync(dir, { recursive: true })
  const store = createBattleStore({ dir, now: () => 1795000000000 })
  const a = store.commanders.create({ faction: 'rome' })
  store.setArmy(a.token, {
    units: [
      { name: 'legionaries', quality: 'professional', weapon: 'roman_gladius', armor: 'heavy_armor', shield: 'heavy_shield' },
      { name: 'slingers', quality: 'levy', weapon: 'sling' },
      { name: 'slingers 2', quality: 'levy', weapon: 'sling' }
    ]
  })
  const done = store.muster({ opponent: 'standing', side: 'red', seed: 11, commander: a.token, enemyFaction: 'han' })
  for (let t = 0; t < 40 && !store.view(done.seats.red).battle.outcome; t++) await store.submit(done.seats.red, 'everyone advance')
  const b = store.commanders.create({ faction: 'macedon' })
  const open = store.muster({ opponent: 'friend', side: 'blue', seed: 5, commander: b.token })
  const c = store.commanders.create({ faction: 'sarmatia' })
  store.join(open.seats.red, c.token)
  await store.submit(open.seats.blue, 'everyone advance')
  await store.submit(open.seats.red, 'horse archers advance')
  const expected = {
    commanders: { a: a.token, b: b.token, c: c.token },
    seats: { done: done.seats.red, openBlue: open.seats.blue, openRed: open.seats.red },
    games: { done: facts(store, done.seats.red), open: facts(store, open.seats.blue) },
    companies: { a: store.commanderView(a.token), b: store.commanderView(b.token) }
  }
  fs.writeFileSync(path.join(dir, 'expected.json.txt'), JSON.stringify(expected))
  console.log('made', store.view(done.seats.red).battle.outcome)
})()
