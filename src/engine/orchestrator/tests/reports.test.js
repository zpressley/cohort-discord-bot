// src/engine/orchestrator/tests/reports.test.js
//
// Reports that say more as an officer rises, and never say anything wrong.
// Ruled by Zach on 2026-11-23 (docs/DECISIONS.md, "Rulings, November 23,
// 2026 (officer perks)"):
//
//   "The second perk is too powerful and the unreliable officers could make
//   the game a bit too hard early on, I would say additional details as
//   progression happens but never incorrect details."
//
// The ladder, as recorded in docs/design/point-of-view-and-messengers.md:
// a unit with no officer reports that there is an enemy and where; a green
// officer adds what kind; a seasoned one roughly how many; a veteran exactly
// how many; a legendary one how they are holding up. Every level's report is
// true as far as it goes.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createGame, submitOrders, waitingOn } = require('../orchestrator')
const { reportOf, reportGrade, join, aboutHowMany } = require('../reports')
const { REPORTS } = require('../../combat/tables')

const ENEMY = { id: 'foe', side: 'blue', role: 'cavalry', mounted: true, primaryWeapon: 'persian_kontos', strength: 87, position: { x: 9, y: 9 } }
const STATE = () => ({ morale: 40, stamina: 20, staminaPool: 100, broken: false })

test('a unit with no officer reports only that there is an enemy, and where', () => {
  const r = reportOf(ENEMY, 'none', 4, STATE)
  assert.deepEqual(Object.keys(r).sort(), ['grade', 'on'])
  assert.equal(reportGrade({ officer: { headless: true } }), 'none')
})

test('a green officer adds what kind they are, and nothing of their numbers', () => {
  const r = reportOf(ENEMY, 'green', 4, STATE)
  assert.deepEqual(r.kind, { role: 'cavalry', mounted: true, primaryWeapon: 'persian_kontos', on: 4 })
  assert.equal(r.count, undefined)
  assert.equal(r.state, undefined)
  assert.equal(reportGrade({ officer: { name: 'Gaius', experience: 5 } }), 'green')
})

test('a seasoned officer adds roughly how many, in a band the true number is in', () => {
  const r = reportOf(ENEMY, 'seasoned', 4, STATE)
  assert.equal(r.count.exact, false)
  assert.equal(r.count.strength, undefined, 'no figure at all')
  assert.ok(r.count.from <= 87 && 87 <= r.count.to)
})

test('a veteran officer says exactly how many', () => {
  const r = reportOf(ENEMY, 'veteran', 4, STATE)
  assert.deepEqual(r.count, { exact: true, strength: 87, on: 4 })
  assert.equal(r.state, undefined, 'not how they are holding up')
})

test('a legendary officer adds how they are holding up: heart, wind, broken or not', () => {
  const r = reportOf(ENEMY, 'legendary', 4, STATE)
  assert.deepEqual(r.state, { morale: 40, stamina: 20, staminaPool: 100, broken: false, on: 4 })
  assert.equal(reportGrade({ officer: { name: 'Gaius', experience: 22 } }), 'legendary')
})

test('"roughly how many" is never wrong: every number of men falls in exactly one band, and the band holds it', () => {
  for (let n = 1; n <= 5000; n++) {
    const holding = REPORTS.ABOUT.filter(([from, to]) => n >= from && n <= to)
    assert.equal(holding.length, 1, `${n} men`)
    const band = aboutHowMany(n)
    assert.ok(band.from <= n && (band.to === null || n <= band.to))
  }
})

test('he keeps the fullest true thing he has been told, each fact as old as the report it came in', () => {
  const veteran = reportOf({ ...ENEMY, strength: 90 }, 'veteran', 2)
  const none = reportOf(ENEMY, 'none', 5)
  const joined = join(veteran, none)
  assert.equal(joined.on, 5, 'where they are: from the newest report')
  assert.deepEqual(joined.kind, veteran.kind, 'their kind, told once, is kept')
  assert.deepEqual(joined.count, { exact: true, strength: 90, on: 2 }, 'their numbers, as old as the report that told them')
  assert.equal(joined.grade, 'veteran', 'the best report he has had of them')
  // A newer count replaces an older one; of two the same age, the exact.
  const seasoned = reportOf(ENEMY, 'seasoned', 5)
  assert.equal(join(veteran, seasoned).count.on, 5)
  assert.equal(join(reportOf(ENEMY, 'veteran', 5), seasoned).count.exact, true)
  assert.equal(join(seasoned, reportOf(ENEMY, 'veteran', 5)).count.exact, true)
})

test('a battle with no officers at all tells what reports told before: kind and exact numbers', () => {
  assert.equal(reportGrade({}), REPORTS.NO_OFFICERS)
  assert.equal(REPORTS.NO_OFFICERS, 'veteran')
})

// The Commander with his guard; a scout of his far ahead with the given
// officer, and an enemy only the scout can see.
const MAP = { name: 'plain-40', width: 40, height: 20, terrain: {} }
const unit = (o) => ({
  id: 'u', side: 'red', position: { x: 2, y: 10 }, strength: 100, maxStrength: 100, movementRange: 3,
  quality: 'professional', primaryWeapon: 'sword_standard', armor: 'medium_armor', shield: 'medium_shield', ...o
})
const VETERAN = { name: 'Gaius', experience: 14, personality: 'steady' }
const HEADLESS = { headless: true, name: null, experience: 0, personality: 'steady' }
const spec = (scoutOfficer) => ({
  name: 'reports', map: MAP, sides: { red: { homeEdge: 'west' }, blue: { homeEdge: 'east' } }, standingOrders: {},
  units: [unit({ id: 'guard', officer: VETERAN }), unit({ id: 'scout', position: { x: 28, y: 10 }, officer: scoutOfficer }),
    unit({ id: 'foe', side: 'blue', position: { x: 33, y: 10 }, strength: 87, maxStrength: 87, officer: { name: 'Ariobarzanes', experience: 14, personality: 'steady' } })],
  commanders: { red: { unitId: 'guard' } }
})
const untilHeard = (game) => {
  for (let i = 0; i < 20 && !game.word.red.enemies.foe; i++) {
    submitOrders(game, 'red', [])
    for (let j = 0; j < 50 && !game.outcome.decided && !waitingOn(game).includes('red'); j++) submitOrders(game, 'blue', [])
  }
  return game.word.red.enemies.foe
}

test('a report is as good as the officer of the unit that saw them, not the best officer in the army', () => {
  const heard = untilHeard(createGame(spec(HEADLESS), { seed: 1 }))
  assert.ok(heard, 'word of the enemy reached him')
  assert.equal(heard.told.grade, 'none', 'the scout has no officer: his veteran with the guard did not see them')
  assert.equal(heard.told.kind, undefined)
  assert.equal(heard.told.count, undefined)
  assert.equal(heard.first.by, 'scout')
})

test('the same sighting by a legendary officer tells kind, exact numbers and how they are holding up', () => {
  const heard = untilHeard(createGame(spec({ name: 'Titus', experience: 24, personality: 'steady' }), { seed: 1 }))
  assert.equal(heard.told.grade, 'legendary')
  assert.equal(heard.told.kind.primaryWeapon, 'sword_standard')
  assert.equal(heard.told.count.strength, 87)
  assert.equal(heard.told.state.broken, false)
})

test('what the Commander sees from his own unit is at least a veteran\'s report', () => {
  const game = createGame({ ...spec(HEADLESS), units: [unit({ id: 'guard', officer: HEADLESS }), unit({ id: 'foe', side: 'blue', position: { x: 6, y: 10 }, strength: 87, maxStrength: 87 })] }, { seed: 1 })
  const seen = game.word.red.enemies.foe
  assert.equal(seen.told.grade, REPORTS.OWN_EYES)
  assert.equal(seen.told.count.strength, 87)
})
