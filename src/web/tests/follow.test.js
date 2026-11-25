// src/web/tests/follow.test.js
//
// The follow order in the app: given in words, shown on the Army tab by the
// name of the unit kept by, and kept in the order log, so that a saved
// battle plays back to the same field.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createBattleStore } = require('../battles')

test('"velites stay with the legionaries" is shown on the Army tab, and a saved battle with it plays back the same', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-follow-'))
  try {
    const store = createBattleStore({ dir })
    const token = store.muster({ map: 'crownhill', opponent: 'computer', side: 'red', faction: 'rome', enemyFaction: 'han', seed: 11, kind: 'ground' }).seats.red
    await store.submit(token, 'velites stay with the legionaries\nlegionaries go east 400 m')
    for (let t = 0; t < 3; t++) await store.submit(token, '')
    const view = store.view(token)
    const velites = view.own.find(u => u.id === 'red_velites')
    const legionaries = view.own.find(u => u.id === 'red_legionaries')
    assert.match(velites.order, /^keeping beside Legionaries/)
    assert.ok(Math.max(Math.abs(velites.position.x - legionaries.position.x), Math.abs(velites.position.y - legionaries.position.y)) <= 3,
      `the velites kept by them: ${JSON.stringify(velites.position)}, ${JSON.stringify(legionaries.position)}`)
    const again = createBattleStore({ dir }).view(token)
    assert.deepEqual(again.own.map(u => [u.id, u.position, u.order]), view.own.map(u => [u.id, u.position, u.order]))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
