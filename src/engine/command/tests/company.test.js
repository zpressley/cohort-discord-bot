// src/engine/command/tests/company.test.js
//
// A Commander's company from battle to battle: who leads whom, what a
// battle does to them, and what is lost with a man.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createCompany, musterOfficers, settleBattle, ridesWith, HEADLESS } = require('../company')
const { gradeOf, grasp, EARNED_AT } = require('../officers')

const units = () => [
  { id: 'red_spears', side: 'red', kind: 'spears', quality: 'professional' },
  { id: 'red_swords', side: 'red', kind: 'swords', quality: 'professional' },
  { id: 'red_elite', side: 'red', kind: 'elite', quality: 'elite' }
]
// One entry for every unit that fought: an officer's fate, or a unit with none.
const fate = (unit, fateOf = 'unhurt', more = {}) => ({ officerId: unit.officer.id ?? null, unit: unit.kind, fate: fateOf, ...more })
const battle = (n) => ({ id: `b${n}`, title: `Battle ${n}`, result: 'victory', seed: n })
const through = (company, n, change = (f) => f) => {
  const mustered = musterOfficers(company, units(), n)
  return settleBattle(mustered.company, battle(n), mustered.units.map(u => change(fate(u), u)))
}

test('a new company has one officer, a veteran with the elite; no other unit has one', () => {
  const first = musterOfficers(createCompany(), units(), 7)
  assert.deepEqual(musterOfficers(createCompany(), units(), 7), first, 'the same battle gives the same men')
  assert.equal(first.company.officers.length, 1)
  assert.equal(first.company.officers[0].leads, 'elite')
  assert.equal(gradeOf(first.units[2].officer), 'veteran')
  assert.equal(typeof first.units[2].officer.name, 'string')
  assert.deepEqual([first.units[0].officer, first.units[1].officer], [HEADLESS, HEADLESS])
  assert.deepEqual(first.company.units, { spears: 0, swords: 0 }, 'their battles are counted from here')
  const plain = musterOfficers(createCompany(), units().map(u => ({ ...u, quality: u.kind === 'elite' ? 'militia' : 'professional' })), 7)
  assert.equal(plain.company.officers[0].leads, 'spears', 'with no elite unit, he is with the best')
})

test('the same officer leads the same men in the next battle, a battle older', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const after = settleBattle(one.company, battle(1), one.units.map(u => fate(u, 'unhurt', { deeds: 'held the ford', orders: ['hold'] })))
  const two = musterOfficers(after, units(), 99)
  assert.equal(two.units[2].officer.id, one.units[2].officer.id)
  assert.equal(two.units[2].officer.experience, one.units[2].officer.experience + 1)
  assert.equal(after.battles, 1)
  assert.deepEqual(after.officers[0].record[0], { battle: 'b1', title: 'Battle 1', result: 'victory', unit: 'elite', fate: 'unhurt', deeds: 'held the ford', orders: ['hold'] })
  assert.deepEqual(createCompany(), { officers: [], units: {}, fallen: [], battles: 0, settled: [], nextId: 1 }, 'nothing is changed in place')
})

test('a unit earns its officer: none for two battles, one by the fourth, named and seasoned', () => {
  let company = createCompany()
  for (let n = 1; n < EARNED_AT[0]; n++) {
    company = through(company, n)
    assert.equal(company.officers.length, 1, `no one yet after battle ${n}`)
    assert.deepEqual(company.units, { spears: n, swords: n })
  }
  for (let n = EARNED_AT[0]; n <= EARNED_AT[1]; n++) company = through(company, n)
  assert.deepEqual(company.units, {}, 'every unit has its officer by now')
  for (const kind of ['spears', 'swords']) {
    const officer = company.officers.find(o => o.leads === kind)
    assert.equal(typeof officer.name, 'string')
    assert.ok(officer.experience >= EARNED_AT[0] && officer.experience <= EARNED_AT[1], 'he comes with his unit\'s battles')
    assert.equal(gradeOf(officer), 'seasoned')
    assert.equal(officer.record[0].named, true, 'his record begins with the battle that made him')
  }
  assert.equal(new Set(company.officers.map(o => o.name)).size, 3, 'no two alike')
  const next = musterOfficers(company, units(), 50)
  assert.ok(next.units.every(u => u.officer.id), 'and they lead their men from then on')

  // Across many companies, some officers come at three battles and some at four.
  const at = new Set()
  for (let c = 0; c < 20; c++) {
    let other = createCompany()
    for (let n = 1; n <= EARNED_AT[0]; n++) other = through(other, c * 10 + n)
    at.add(other.officers.some(o => o.leads === 'spears') ? EARNED_AT[0] : EARNED_AT[1])
  }
  assert.deepEqual([...at].sort(), EARNED_AT)
})

test('a unit destroyed starts earning again from nothing', () => {
  let company = through(createCompany(), 1)
  company = through(company, 2, (f) => (f.unit === 'spears' ? { ...f, destroyed: true } : f))
  assert.deepEqual(company.units, { spears: 0, swords: 2 })
})

test('an officer killed or taken is gone, his memory with him, and his men must earn another', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const lost = one.units[2]   // the veteran
  const after = settleBattle(one.company, battle(1), [fate(one.units[0]), fate(one.units[1]), fate(lost, 'killed')])
  assert.deepEqual(after.officers, [])
  assert.deepEqual(after.fallen.map(f => [f.name, f.fate, f.at, f.led]), [[lost.officer.name, 'killed', 'Battle 1', 'elite']])
  assert.equal(after.fallen[0].record, undefined, 'the roll keeps who he was, not what he knew')
  assert.deepEqual(after.units, { spears: 1, swords: 1, elite: 0 })

  const two = musterOfficers(after, units(), 8)
  assert.deepEqual(two.units[2].officer, HEADLESS)
  assert.deepEqual(two.company.officers, [], 'no one is handed to them')
})

test('a wounded officer sits the next battle out, his men without him, and comes back for the one after', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const hurt = one.units[2]
  const after1 = settleBattle(one.company, battle(1), [fate(one.units[0]), fate(one.units[1]), fate(hurt, 'wounded', { how: 'in the rout' })])
  const two = musterOfficers(after1, units(), 8)
  assert.deepEqual(two.units[2].officer, HEADLESS)
  assert.equal('elite' in two.company.units, false, 'they are not earning another: he will be back')

  const after2 = settleBattle(two.company, battle(2), two.units.map(u => fate(u)))
  const three = musterOfficers(after2, units(), 9)
  assert.equal(three.units[2].officer.id, hurt.officer.id, 'he has his men back')
  assert.equal(three.units[2].officer.experience, hurt.officer.experience + 1, 'the battle he was wounded in counts')
})

test('a headless unit keeps nothing of an order beyond the plain order', () => {
  const order = { action: 'move', when: { type: 'attacked' }, steps: [{ action: 'hold' }] }
  const kept = grasp(order, HEADLESS, () => 0)
  assert.equal(kept.kept, 0)
  assert.equal(kept.order.when.lost, true)
  assert.equal(kept.order.steps, undefined)
})

test('on a different field an officer without his own kind of unit takes what there is', () => {
  const after = through(createCompany(), 1)
  const other = [{ id: 'red_unit_1', side: 'red', kind: 'heavy infantry 1', quality: 'professional' }]
  const two = musterOfficers(after, other, 3)
  assert.equal(two.units[0].officer.id, after.officers[0].id, 'the veteran, not no one')
  assert.equal(two.company.officers.length, 1)
})

// ── From the review of November 23 ─────────────────────

test('on a strange field the veteran takes its best unit, and the Commander rides with him', () => {
  const after = through(createCompany(), 1)
  const legion = [
    { id: 'red_unit_1', side: 'red', kind: 'heavy infantry 1', quality: 'professional' },
    { id: 'red_unit_2', side: 'red', kind: 'heavy infantry 2', quality: 'professional' },
    { id: 'red_elite', side: 'red', kind: 'praetorians', quality: 'elite' }
  ]
  const two = musterOfficers(after, legion, 3)
  assert.equal(two.units[2].officer.id, after.officers[0].id, 'not the first unit listed: the elite')
  assert.deepEqual([two.units[0].officer, two.units[1].officer], [HEADLESS, HEADLESS])
  assert.equal(ridesWith(two.units), 'red_elite')
})

test('the Commander rides with his most experienced officer; with none on the field, his best unit', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  assert.equal(ridesWith(one.units), 'red_elite')
  const hurt = settleBattle(one.company, battle(1), [fate(one.units[0]), fate(one.units[1]), fate(one.units[2], 'wounded')])
  const two = musterOfficers(hurt, units(), 8)
  assert.ok(two.units.every(u => u.officer.headless), 'his veteran is wounded: no officer on the field')
  assert.equal(ridesWith(two.units), 'red_elite')
})

test('a battle written into the company twice counts once', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const fates = one.units.map(u => fate(u))
  const once = settleBattle(one.company, battle(1), fates)
  assert.deepEqual(settleBattle(once, battle(1), fates), once)
  assert.equal(settleBattle(once, battle(2), fates).battles, 2, 'another battle still counts')
})

