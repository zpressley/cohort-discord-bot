// src/web/tests/fixtures/make-before-asked.js
//
// How `before-asked/` was made, with the code as it stood before the riders
// rulings of 2026-11-23 (main at ca49eab: every side asked at every stop, a
// unit cut off told at once): a Commander of Rome against the computer,
// some turns into the battle, and a battle between two Commanders under
// way. Kept for the record; it was run from a copy of that code (running it
// again makes a new set, with new ids). `expected.json.txt` is what the
// battles were then.

const path = require('path')
const fs = require('fs')
const { createBattleStore } = require('../../battles')

const dir = path.join(__dirname, 'before-asked')

function facts(store, token) {
  const game = store.seatOf(token).entry.game
  return {
    outcome: game.outcome, turn: game.playerTurn, minutes: game.minutesElapsed,
    history: game.history.map(h => [h.interrupt, h.ticks.length]),
    units: [...game.battle.world.units, ...game.battle.fledUnits].map(u => [u.id, u.strength, u.position.x, u.position.y])
  }
}

;(async () => {
  fs.mkdirSync(dir, { recursive: true })
  const store = createBattleStore({ dir, now: () => 1795000000000 })
  const a = store.commanders.create({ faction: 'rome' })
  const solo = store.muster({ opponent: 'standing', side: 'red', seed: 11, commander: a.token, enemyFaction: 'han' })
  for (let t = 0; t < 6 && !store.view(solo.seats.red).battle.outcome; t++) await store.submit(solo.seats.red, t === 0 ? 'everyone advance' : '')
  const b = store.commanders.create({ faction: 'macedon' })
  const open = store.muster({ opponent: 'friend', side: 'blue', seed: 5, commander: b.token })
  const c = store.commanders.create({ faction: 'sarmatia' })
  store.join(open.seats.red, c.token)
  for (let t = 0; t < 3; t++) {
    await store.submit(open.seats.blue, t === 0 ? 'everyone advance' : '')
    await store.submit(open.seats.red, t === 0 ? 'everyone hold' : '')
  }
  const expected = {
    seats: { solo: solo.seats.red, openBlue: open.seats.blue, openRed: open.seats.red },
    games: { solo: facts(store, solo.seats.red), open: facts(store, open.seats.blue) }
  }
  fs.writeFileSync(path.join(dir, 'expected.json.txt'), JSON.stringify(expected))
  console.log('made', expected.games.solo.turn, expected.games.open.turn)
})()
