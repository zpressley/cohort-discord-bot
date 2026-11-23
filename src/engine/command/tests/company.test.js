// src/engine/command/tests/company.test.js
//
// A Commander's company from battle to battle: who leads whom, what a
// battle does to them, and what is lost with a man.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createCompany, musterOfficers, settleBattle, HEADLESS } = require('../company')
const { gradeOf, grasp, NAMED_AT } = require('../officers')

const units = () => [
  { id: 'red_spears', side: 'red', kind: 'spears', quality: 'professional' },
  { id: 'red_swords', side: 'red', kind: 'swords', quality: 'professional' },
  { id: 'red_elite', side: 'red', kind: 'elite', quality: 'elite' }
]
const fate = (unit, fateOf = 'unhurt', more = {}) => ({ officerId: unit.officer.id, unit: unit.kind, fate: fateOf, ...more })
const battle = (n) => ({ id: `b${n}`, title: `Battle ${n}`, result: 'victory' })

test('a new company has one named veteran, with the elite; every other officer is unknown', () => {
  const first = musterOfficers(createCompany(), units(), 7)
  assert.deepEqual(musterOfficers(createCompany(), units(), 7), first, 'the same battle gives the same men')
  assert.equal(first.company.officers.length, 3)
  assert.deepEqual(first.company.officers.map(o => o.leads), ['spears', 'swords', 'elite'])
  assert.deepEqual(first.units.map(u => gradeOf(u.officer)), ['green', 'green', 'veteran'])
  assert.deepEqual(first.units.map(u => typeof u.officer.name), ['object', 'object', 'string'], 'only the veteran has a name')
  assert.ok(first.units.every(u => u.officer.id))
  const plain = musterOfficers(createCompany(), units().map(u => ({ ...u, quality: u.kind === 'elite' ? 'militia' : 'professional' })), 7)
  assert.deepEqual(plain.units.map(u => gradeOf(u.officer)), ['veteran', 'green', 'green'], 'with no elite unit, he is with the best')
})

test('the same officers lead the same men in the next battle, a battle older', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const after = settleBattle(one.company, battle(1), one.units.map(u => fate(u, 'unhurt', { deeds: 'held the ford', orders: ['hold'] })))
  const two = musterOfficers(after, units(), 99)
  assert.deepEqual(two.units.map(u => u.officer.id), one.units.map(u => u.officer.id))
  assert.deepEqual(two.units.map(u => u.officer.experience), one.units.map(u => u.officer.experience + 1))
  assert.equal(after.battles, 1)
  assert.deepEqual(after.officers[0].record[0], { battle: 'b1', title: 'Battle 1', result: 'victory', unit: 'spears', fate: 'unhurt', deeds: 'held the ford', orders: ['hold'] })
  assert.deepEqual(createCompany(), { officers: [], headless: [], fallen: [], battles: 0, nextId: 1 }, 'nothing is changed in place')
})

test('an unknown officer earns his name when he is seasoned', () => {
  let company = createCompany()
  let mustered
  for (let n = 1; n <= NAMED_AT; n++) {
    mustered = musterOfficers(company, units(), n)
    assert.equal(mustered.units[0].officer.name, null, `no name going into battle ${n}`)
    company = settleBattle(mustered.company, battle(n), mustered.units.map(u => fate(u)))
  }
  const spears = company.officers.find(o => o.leads === 'spears')
  assert.equal(typeof spears.name, 'string')
  assert.equal(gradeOf(spears), 'seasoned')
  assert.equal(spears.record.at(-1).named, true, 'the battle that made his name')
  assert.equal(new Set(company.officers.map(o => o.name)).size, 3, 'no two alike')
  assert.equal(musterOfficers(company, units(), 50).units[0].officer.name, spears.name)
})

test('an officer killed or taken is gone, his memory with him; his men fight the next battle headless, then one of them steps up', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const lost = one.units[0]   // an unknown
  const after = settleBattle(one.company, battle(1), [fate(lost, 'killed'), fate(one.units[1]), fate(one.units[2])])
  assert.equal(after.officers.some(o => o.id === lost.officer.id), false)
  assert.deepEqual(after.fallen.map(f => [f.name, f.fate, f.at, f.led]), [[null, 'killed', 'Battle 1', 'spears']])
  assert.equal(after.fallen[0].record, undefined, 'the roll keeps who he was, not what he knew')
  assert.deepEqual(after.headless, ['spears'])

  const two = musterOfficers(after, units(), 8)
  assert.deepEqual(two.units[0].officer, HEADLESS)
  assert.equal(two.company.officers.length, 2, 'no one new yet')
  const after2 = settleBattle(two.company, battle(2), two.units.filter(u => u.officer.id).map(u => fate(u)))
  const three = musterOfficers(after2, units(), 9)
  assert.equal(three.units[0].officer.headless, undefined)
  assert.equal(three.units[0].officer.name, null, 'unknown, as the first was')
  assert.equal(three.units[0].officer.experience, 0)
})

test('a wounded officer sits the next battle out, his men headless, and comes back for the one after', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const hurt = one.units[0]
  const after1 = settleBattle(one.company, battle(1), [fate(hurt, 'wounded', { how: 'in the rout' }), fate(one.units[1]), fate(one.units[2])])
  const two = musterOfficers(after1, units(), 8)
  assert.deepEqual(two.units[0].officer, HEADLESS)

  const after2 = settleBattle(two.company, battle(2), two.units.filter(u => u.officer.id).map(u => fate(u)))
  const three = musterOfficers(after2, units(), 9)
  assert.equal(three.units[0].officer.id, hurt.officer.id, 'he has his men back')
  assert.equal(three.units[0].officer.experience, hurt.officer.experience + 1, 'the battle he was wounded in counts')
})

test('a headless unit keeps nothing of an order beyond the plain order', () => {
  const order = { action: 'move', when: { type: 'attacked' }, steps: [{ action: 'hold' }] }
  const kept = grasp(order, HEADLESS, () => 0)
  assert.equal(kept.kept, 0)
  assert.equal(kept.order.when.lost, true)
  assert.equal(kept.order.steps, undefined)
})

test('on a different field an officer without his own kind of unit takes what there is', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const after = settleBattle(one.company, battle(1), one.units.map(u => fate(u)))
  const other = [{ id: 'red_unit_1', side: 'red', kind: 'heavy infantry 1', quality: 'professional' }]
  const two = musterOfficers(after, other, 3)
  assert.ok(after.officers.some(o => o.id === two.units[0].officer.id), 'one of the old company, not a new man')
  assert.equal(two.company.officers.length, 3)
})
