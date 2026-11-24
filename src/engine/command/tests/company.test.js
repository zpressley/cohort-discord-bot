// src/engine/command/tests/company.test.js
//
// A Commander's company from battle to battle: who leads whom, what a
// battle does to them, and what is lost with a man.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createCompany, musterOfficers, settleBattle, unitsOf, trainedQuality, ridesWith, HEADLESS } = require('../company')
const { TRAINING, LOYALTY, VETERANCY } = require('../../combat/tables')
const { applyBattle, averageExperience } = require('../../veterans/veterancy')
const { gradeOf, grasp, EARNED_AT, MAX_EXPERIENCE, loyaltyMove, losingTheThread, chanceToKeep } = require('../officers')

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
  assert.deepEqual(unitsOf(first.company).map(u => [u.kind, u.battles, u.led]), [['spears', 0, false], ['swords', 0, false], ['elite', 0, true]],
    'every unit\'s own battles are counted from here')
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
  const { loyalty, ...remembered } = after.officers[0].record[0]
  assert.deepEqual(remembered, { battle: 'b1', title: 'Battle 1', result: 'victory', unit: 'elite', fate: 'unhurt', deeds: 'held the ford', orders: ['hold'] })
  assert.equal(typeof loyalty, 'number', 'and what it did to his loyalty')
  assert.deepEqual(createCompany(), { officers: [], units: {}, fallen: [], battles: 0, settled: [], nextId: 1 }, 'nothing is changed in place')
})

test('a unit earns its officer: nameless for three battles, a green officer with a name at the fourth', () => {
  let company = createCompany()
  for (let n = 1; n < EARNED_AT; n++) {
    company = through(company, n)
    assert.equal(company.officers.length, 1, `no one yet after battle ${n}`)
    assert.deepEqual(unitsOf(company).map(u => [u.kind, u.battles, u.led]), [['spears', n, false], ['swords', n, false], ['elite', n, true]])
  }
  company = through(company, EARNED_AT)
  assert.ok(unitsOf(company).every(u => u.led), 'every unit has its officer now')
  for (const kind of ['spears', 'swords']) {
    const officer = company.officers.find(o => o.leads === kind)
    assert.equal(typeof officer.name, 'string')
    assert.equal(officer.experience, EARNED_AT, 'he comes with his unit\'s battles')
    assert.equal(gradeOf(officer), 'green')
    assert.equal(officer.record[0].named, true, 'his record begins with the battle that made him')
  }
  assert.equal(new Set(company.officers.map(o => o.name)).size, 3, 'no two alike')
  const next = musterOfficers(company, units(), 50)
  assert.ok(next.units.every(u => u.officer.id), 'and they lead their men from then on')
})

test('an officer rises with his battles: seasoned at 8, a veteran at 13, a legend at 20, and 30 is the most that counts', () => {
  let company = createCompany()
  const grades = {}
  for (let n = 1; n <= 34; n++) {
    company = through(company, n)
    // Loyalty kept out of it: a loyal officer learns faster (below).
    for (const o of company.officers) o.loyalty = LOYALTY.NEUTRAL
    const spears = company.officers.find(o => o.leads === 'spears')
    if (spears) grades[n] = gradeOf(spears)
  }
  assert.deepEqual([4, 7, 8, 12, 13, 19, 20].map(n => grades[n]), ['green', 'green', 'seasoned', 'seasoned', 'veteran', 'veteran', 'legendary'])
  assert.equal(company.officers.find(o => o.leads === 'spears').experience, MAX_EXPERIENCE)
  assert.equal(gradeOf(musterOfficers(createCompany(), units(), 7).units[2].officer), 'veteran', 'a new Commander\'s one officer is a veteran')
})

test('a unit destroyed starts again from nothing', () => {
  let company = through(createCompany(), 1)
  company = through(company, 2, (f) => (f.unit === 'spears' ? { ...f, destroyed: true } : f))
  assert.deepEqual(unitsOf(company).map(u => [u.kind, u.battles]), [['spears', 0], ['swords', 2], ['elite', 2]])
})

test('a unit\'s veterancy is the experience of its men: survivors bank a battle, the fallen take theirs with them, recruits know nothing', () => {
  const unit = (company) => unitsOf(company).find(u => u.kind === 'spears')
  const men = (f, survivors) => (f.unit === 'spears' ? { ...f, mustered: 100, survivors } : f)
  let whole = createCompany()
  let bled = createCompany()
  for (let n = 1; n <= 6; n++) {
    whole = through(whole, n, f => men(f, 100))
    bled = through(bled, n, f => men(f, 60))
  }
  assert.equal(unit(whole).veterancy, 6, 'no one lost in six battles: every man has six behind him')
  assert.ok(unit(bled).veterancy < 3, `forty men in a hundred lost each time: ${unit(bled).veterancy}`)
  // The newest men fall first: the fallen took less than an even share with them.
  const even = { strength: 100, totalExperience: 0, battlesParticipated: 0 }
  for (let n = 1; n <= 6; n++) { applyBattle(even, { survivors: 60 }); even.strength = 100 }
  assert.ok(unit(bled).veterancy > averageExperience(even), 'more is left than if deaths fell evenly')
  assert.equal(unit(bled).battles, 6, 'the unit has still come through six battles')
})

test('an officer killed or taken is gone, his memory with him; his men fight the next battle without one, then find a successor at their own level', () => {
  // The elite, kept whole for ten battles under its veteran.
  let company = createCompany()
  for (let n = 1; n <= 10; n++) company = through(company, n, f => ({ ...f, mustered: 100, survivors: 100 }))
  const veteran = company.officers.find(o => o.leads === 'elite')
  const mustered = musterOfficers(company, units(), 11)
  company = settleBattle(mustered.company, battle(11), mustered.units.map(u => ({ ...fate(u, u.kind === 'elite' ? 'killed' : 'unhurt'), mustered: 100, survivors: 100 })))
  assert.equal(company.officers.some(o => o.id === veteran.id), false)
  assert.deepEqual(company.fallen.map(f => [f.name, f.fate, f.at, f.led]), [[veteran.name, 'killed', 'Battle 11', 'elite']])
  assert.equal(company.fallen[0].record, undefined, 'the roll keeps who he was, not what he knew')
  assert.equal(company.officers.some(o => o.leads === 'elite'), false, 'no successor yet')

  const next = musterOfficers(company, units(), 12)
  assert.deepEqual(next.units[2].officer, HEADLESS, 'the battle after, they have no officer')
  company = settleBattle(next.company, battle(12), next.units.map(u => ({ ...fate(u), mustered: 100, survivors: 100 })))
  const successor = company.officers.find(o => o.leads === 'elite')
  assert.notEqual(successor.name, veteran.name)
  assert.equal(successor.experience, 12, 'twelve battles the unit has come through whole: he starts where his men are')
  assert.equal(gradeOf(successor), 'seasoned')
  assert.equal(successor.record.length, 1, 'but he remembers nothing of the battles before him')
})

test('an officer of thirty battles has his successor ready at once: over a unit of 24, a legend', () => {
  let company = createCompany()
  for (let n = 1; n <= 23; n++) company = through(company, n, f => ({ ...f, mustered: 100, survivors: 100 }))
  const old = company.officers.find(o => o.leads === 'elite')
  assert.equal(old.experience, MAX_EXPERIENCE)
  const mustered = musterOfficers(company, units(), 24)
  company = settleBattle(mustered.company, battle(24), mustered.units.map(u => ({ ...fate(u, u.kind === 'elite' ? 'killed' : 'unhurt'), mustered: 100, survivors: 100 })))
  const successor = company.officers.find(o => o.leads === 'elite')
  assert.ok(successor, 'no battle without an officer')
  assert.equal(successor.experience, 24)
  assert.equal(gradeOf(successor), 'legendary')
  // The same unit bled white each battle would have given him a green one.
  let bled = createCompany()
  for (let n = 1; n <= 23; n++) bled = through(bled, n, f => ({ ...f, mustered: 100, survivors: 50 }))
  const m2 = musterOfficers(bled, units(), 24)
  bled = settleBattle(m2.company, battle(24), m2.units.map(u => ({ ...fate(u, u.kind === 'elite' ? 'killed' : 'unhurt'), mustered: 100, survivors: 50 })))
  assert.equal(gradeOf(bled.officers.find(o => o.leads === 'elite')), 'green')
})

test('a wounded officer sits the next battle out, his men without him, and comes back for the one after', () => {
  const one = musterOfficers(createCompany(), units(), 7)
  const hurt = one.units[2]
  const after1 = settleBattle(one.company, battle(1), [fate(one.units[0]), fate(one.units[1]), fate(hurt, 'wounded', { how: 'in the rout' })])
  const two = musterOfficers(after1, units(), 8)
  assert.deepEqual(two.units[2].officer, HEADLESS)

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


// ── Training: the perk of an officer of thirty battles ─

test('an officer of thirty battles trains his men: militia under him are professionals in time, and no one else\'s rise', () => {
  const army = () => [
    { id: 'red_militia', side: 'red', kind: 'militia', quality: 'militia', strength: 100 },
    { id: 'red_elite', side: 'red', kind: 'elite', quality: 'elite', strength: 80 }
  ]
  // The veteran, grown old in the service, is given the militia: his own
  // elite are not on this field.
  let company = createCompany()
  for (let n = 1; n <= 20; n++) company = through(company, n)
  assert.equal(company.officers.find(o => o.leads === 'elite').experience, MAX_EXPERIENCE)
  const field = [army()[0]]
  const qualities = []
  for (let n = 21; n <= 21 + TRAINING.BATTLES_PER_LEVEL * 3; n++) {
    const mustered = musterOfficers(company, field, n)
    qualities.push(mustered.units[0].quality)
    company = settleBattle(mustered.company, battle(n), mustered.units.map(u => fate(u)))
  }
  const per = TRAINING.BATTLES_PER_LEVEL
  assert.equal(qualities[0], 'militia')
  assert.equal(qualities[per - 1], 'militia', 'not yet')
  assert.equal(qualities[per], 'professional', `a level every ${per} battles under him`)
  assert.equal(qualities[per * 2], 'veteran_mercenary')
  assert.equal(qualities[per * 3], 'veteran_mercenary', 'and no further: the elite are born, not made')
  assert.equal(unitsOf(company).find(u => u.kind === 'militia').trained, 3)

  // Under a lesser officer the same battles teach them nothing more.
  let plain = createCompany()
  for (let n = 1; n <= 12; n++) plain = through(plain, n)
  assert.ok(unitsOf(plain).every(u => u.trained === 0))
  assert.equal(musterOfficers(plain, units(), 99).units[0].quality, 'professional', 'as they were raised')
})

test('what training makes of each quality', () => {
  const per = TRAINING.BATTLES_PER_LEVEL
  assert.equal(trainedQuality('levy', per), 'militia')
  assert.equal(trainedQuality('levy', per * 2), 'professional')
  assert.equal(trainedQuality('tribal_warriors', per), 'professional', 'tribal warriors become professionals')
  assert.equal(trainedQuality('veteran_mercenary', per * 4), 'veteran_mercenary')
  assert.equal(trainedQuality('elite', per * 4), 'elite')
  assert.equal(trainedQuality('militia', per - 1), 'militia')
})

// ── Loyalty: earned through glory or survival ──────────

test('each officer holds glory or survival dear, and a battle moves his loyalty by which', () => {
  const m = LOYALTY.MOVES
  // Glory: a fight won is everything; a battle watched from the rear costs, even won.
  assert.ok(loyaltyMove('glory', { result: 'victory', fought: true, losses: 0.5 }) > 0, 'a bloody victory is still a victory to him')
  assert.ok(loyaltyMove('glory', { result: 'victory', fought: false, losses: 0 }) < 0, 'a boring one costs')
  // Survival: the same bloody victory costs; one that spared his men wins him.
  assert.ok(loyaltyMove('survival', { result: 'victory', fought: true, losses: 0.5 }) < 0, 'a bloody one costs')
  assert.ok(loyaltyMove('survival', { result: 'victory', fought: true, losses: 0.05 }) > 0)
  assert.ok(loyaltyMove('survival', { result: 'victory', fought: false, losses: 0 }) > 0, 'he does not mind being kept out of it')
  // Defeat costs both, whatever else.
  for (const values of LOYALTY.VALUES) for (const fought of [true, false]) for (const losses of [0, 0.25, 0.6]) {
    assert.ok(loyaltyMove(values, { result: 'defeat', fought, losses }) < 0, `${values}, a defeat`)
  }
  assert.equal(m.glory.victory.fought, loyaltyMove('glory', { result: 'victory', fought: true, losses: 0 }))
})

test('his loyalty is kept from battle to battle, between 0 and 100, and written in his record', () => {
  let company = createCompany()
  const first = musterOfficers(company, units(), 7)
  const veteran = first.company.officers[0]
  assert.ok(LOYALTY.VALUES.includes(veteran.values))
  assert.equal(veteran.loyalty, LOYALTY.NEUTRAL)
  const won = (n, c) => {
    const m = musterOfficers(c, units(), n)
    return settleBattle(m.company, battle(n), m.units.map(u => ({ ...fate(u), mustered: 100, survivors: 95, fought: true })))
  }
  company = won(1, company)
  const after = company.officers[0]
  assert.equal(after.loyalty, LOYALTY.NEUTRAL + after.record[0].loyalty)
  assert.ok(after.record[0].loyalty > 0, 'a victory fought and cheaply won pleases either kind')
  for (let n = 2; n <= 30; n++) company = won(n, company)
  assert.equal(company.officers[0].loyalty, 100, 'no higher')
  assert.equal(musterOfficers(company, units(), 99).units[2].officer.loyalty, 100, 'and he takes it into battle')
})

test('a loyal officer learns faster: five battles in the time another learns four', () => {
  const run = (loyalty) => {
    let company = musterOfficers(createCompany(), units(), 7).company
    const start = company.officers[0].experience
    for (let n = 1; n <= 4; n++) {
      company.officers[0].loyalty = loyalty
      const m = musterOfficers(company, units(), n)
      company = settleBattle(m.company, battle(n), m.units.map(u => fate(u)))
    }
    return company.officers[0].experience - start
  }
  assert.equal(run(LOYALTY.NEUTRAL), 4)
  assert.equal(run(LOYALTY.LOYAL), 4 * LOYALTY.LEARNS)
  assert.equal(run(LOYALTY.DISLOYAL), 4, 'a disloyal one learns no slower: he pays in other ways')
})

test('a loyal officer holds to his orders when he loses the thread; a disloyal one keeps less of them', () => {
  const bold = (loyalty) => ({ name: 'Marcus', experience: 9, personality: 'bold', loyalty })
  assert.equal(losingTheThread(bold(LOYALTY.NEUTRAL), 'condition', true), 'advance', 'his nature')
  assert.equal(losingTheThread(bold(LOYALTY.LOYAL), 'condition', true), 'carry on', 'his orders')
  assert.equal(losingTheThread(bold(LOYALTY.DISLOYAL), 'condition', true), 'advance')
  assert.equal(chanceToKeep(bold(LOYALTY.DISLOYAL), 1), chanceToKeep(bold(LOYALTY.NEUTRAL), 1) * LOYALTY.DISLOYAL_GRASP)
  assert.equal(chanceToKeep(bold(LOYALTY.LOYAL), 1), chanceToKeep(bold(LOYALTY.NEUTRAL), 1), 'loyalty does not make him cleverer')
})

test('the next day of a battle, a unit goes in with the men the day before left it and no recruits; it is made up to strength only once the fight is over', () => {
  // Day one: a hundred went in, sixty came out. Made up to a hundred.
  const day1 = musterOfficers(createCompany(), units(), 1)
  const after1 = settleBattle(day1.company, battle(1), day1.units.map(u => fate(u, 'unhurt', { mustered: 100, survivors: u.kind === 'spears' ? 60 : 100 })))
  assert.equal(after1.units.spears.strength, 100)
  assert.equal(after1.units.spears.totalExperience, 60, 'sixty men with one battle each; the forty recruits know nothing')
  // Day two: the sixty go in, fifty come out. No recruit is counted among
  // the fallen, for none came.
  const day2 = musterOfficers(after1, units(), 2)
  const after2 = settleBattle(day2.company, battle(2), day2.units.map(u => fate(u, 'unhurt', { mustered: u.kind === 'spears' ? 60 : 100, survivors: u.kind === 'spears' ? 50 : 100, full: 100 })))
  assert.equal(after2.units.spears.strength, 100, 'made up to strength once the fight is over')
  const alone = { strength: 60, totalExperience: 60, battlesParticipated: 1 }
  applyBattle(alone, { survivors: 50, fallenShare: VETERANCY.FALLEN_SHARE })
  assert.equal(after2.units.spears.totalExperience, alone.totalExperience, 'as if the sixty had fought alone')
  // Without `full`, a battle is settled as ever.
  const plain = settleBattle(day2.company, battle(3), day2.units.map(u => fate(u, 'unhurt', { mustered: 100, survivors: 100 })))
  assert.equal(plain.units.spears.strength, 100)
  assert.equal(plain.units.spears.totalExperience, 160)
})

