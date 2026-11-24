// src/web/tests/fixtures/make-before-veterans.js
//
// How `before-veterans/` was made, with the code as it stood before a
// unit's veterancy went into battle (balance-base, 5508343): a Commander
// with no faction whose units had come through 12 battles each, whole, in a
// battle against the computer three turns in, and one fought to its end.
// Kept for the record; running it again makes a new set (new ids), which
// the test would then take as its own. `expected.json.txt` is how the
// battles stood then.

const path = require('path')
const fs = require('fs')
const { createBattleStore } = require('../../battles')

const dir = path.join(__dirname, 'before-veterans')

function facts(store, token) {
  const game = store.seatOf(token).entry.game
  return {
    outcome: game.outcome, turn: game.playerTurn, minutes: game.minutesElapsed,
    units: [...game.battle.world.units, ...game.battle.fledUnits].map(u => [u.id, u.strength, u.position.x, u.position.y])
  }
}

function seasoned(store, battles) {
  const made = store.commanders.create({})
  const c = store.commanders.get(made.token)
  const units = {}
  for (const kind of ['spears', 'swords', 'archers', 'horse']) units[kind] = { strength: 100, totalExperience: 100 * battles, battlesParticipated: battles }
  store.commanders.setCompany(c, { ...c.company, units, battles: 1 })
  return made.token
}

;(async () => {
  fs.mkdirSync(dir, { recursive: true })
  const store = createBattleStore({ dir, now: () => 1795000000000 })
  const a = seasoned(store, 12)
  const open = store.muster({ opponent: 'standing', side: 'red', seed: 13, commander: a })
  for (let t = 0; t < 3; t++) await store.submit(open.seats.red, 'everyone advance')
  const b = seasoned(store, 20)
  const done = store.muster({ opponent: 'standing', side: 'red', seed: 21, commander: b })
  for (let t = 0; t < 40 && !store.view(done.seats.red).battle.outcome; t++) await store.submit(done.seats.red, 'everyone advance')
  const expected = {
    seats: { open: open.seats.red, done: done.seats.red },
    games: { open: facts(store, open.seats.red), done: facts(store, done.seats.red) }
  }
  fs.writeFileSync(path.join(dir, 'expected.json.txt'), JSON.stringify(expected))
  console.log('made', store.view(done.seats.red).battle.outcome)
})()
