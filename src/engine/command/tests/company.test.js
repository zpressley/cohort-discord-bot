// src/engine/command/tests/company.test.js
//
// A Commander's company from battle to battle: who leads whom, what a
// battle does to them, and what is lost with a man.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createCompany, musterOfficers, settleBattle } = require('../company')
const { gradeOf } = require('../officers')

const units = () => [
  { id: 'red_spears', side: 'red', kind: 'spears', quality: 'professional' },
  { id: 'red_swords', side: 'red', kind: 'swords', quality: 'professional' },
  { id: 'red_elite', side: 'red', kind: 'elite', quality: 'elite' }
]
const fate = (unit, fateOf = 'unhurt', more = {}) => ({ officerId: unit.officer.id, unit: unit.kind, fate: fateOf, ...more })
const battle = (n) => ({ id: `b${n}`, title: `Battle ${n}`, result: 'victory' })

test('a new company is given its first officers, and the same battle gives the same men', () => {
  const first = musterOfficers(createCompany(), units(), 7)
  assert.deepEqual(musterOfficers(createCompany(), units(), 7), first)
  assert.equal(first.company.officers.length, 3)
  assert.deepEqual(first.company.officers.map(o => o.leads), ['spears', 'swords', 'elite'])
  assert.equal(gradeOf(first.units[2].officer), 'veteran', 'the elite are led by a veteran')
  assert.ok(first.units.every(u => u.officer.id && u.officer.name))
})

test('the same officers lead the same men in the next battle, a battle older', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const after = settleBattle(one.company, battle(1), one.units.map(u => fate(u, 'unhurt', { deeds: 'held the ford', orders: ['hold'] })))
  const two = musterOfficers(after, units(), 99)
  assert.deepEqual(two.units.map(u => u.officer.name), one.units.map(u => u.officer.name))
  assert.deepEqual(two.units.map(u => u.officer.experience), one.units.map(u => u.officer.experience + 1))
  assert.equal(after.battles, 1)
  assert.deepEqual(after.officers[0].record[0], { battle: 'b1', title: 'Battle 1', result: 'victory', unit: 'spears', fate: 'unhurt', deeds: 'held the ford', orders: ['hold'] })
  assert.deepEqual(createCompany(), { officers: [], fallen: [], battles: 0, nextId: 1 }, 'nothing is changed in place')
})

test('an officer killed or taken is gone, his memory with him; the man who replaces him is green', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const lost = one.units[2]   // the veteran
  const after = settleBattle(one.company, battle(1), [fate(one.units[0]), fate(one.units[1]), fate(lost, 'killed')])
  assert.equal(after.officers.some(o => o.id === lost.officer.id), false)
  assert.deepEqual(after.fallen.map(f => [f.name, f.fate, f.at, f.led]), [[lost.officer.name, 'killed', 'Battle 1', 'elite']])
  assert.equal(after.fallen[0].record, undefined, 'the roll keeps his name, not what he knew')

  const two = musterOfficers(after, units(), 8)
  const replacement = two.units[2].officer
  assert.notEqual(replacement.name, lost.officer.name)
  assert.equal(replacement.experience, 0, 'everything has to be spelled out to him')
})

test('a wounded officer sits the next battle out and comes back for the one after', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const hurt = one.units[0]
  const after1 = settleBattle(one.company, battle(1), [fate(hurt, 'wounded', { how: 'in the rout' }), fate(one.units[1]), fate(one.units[2])])
  const two = musterOfficers(after1, units(), 8)
  assert.notEqual(two.units[0].officer.id, hurt.officer.id, 'a stand-in leads the spears')
  assert.equal(two.units[0].officer.experience, 0)

  const after2 = settleBattle(two.company, battle(2), two.units.map(u => fate(u)))
  const three = musterOfficers(after2, units(), 9)
  assert.equal(three.units[0].officer.id, hurt.officer.id, 'he has his men back')
  assert.equal(three.units[0].officer.experience, hurt.officer.experience + 1, 'the battle he was wounded in counts')
})

test('on a different field an officer without his own kind of unit takes what there is', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const after = settleBattle(one.company, battle(1), one.units.map(u => fate(u)))
  const other = [{ id: 'red_unit_1', side: 'red', kind: 'heavy infantry 1', quality: 'professional' }]
  const two = musterOfficers(after, other, 3)
  assert.ok(after.officers.some(o => o.id === two.units[0].officer.id), 'one of the old company, not a new man')
  assert.equal(two.company.officers.length, 3)
})
