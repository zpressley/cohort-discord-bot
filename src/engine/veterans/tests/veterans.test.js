// src/engine/veterans/tests/veterans.test.js
//
// Phase 6's rules, and its exit criterion from the roadmap: three consecutive
// battles by the same commander persist correctly; an officer dies, a
// promotion fires, and the XP math matches the framework doc's worked
// example. The worked example test is the anchor — it pins this
// implementation to the old DB docs' own numbers.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')

const {
  createVeteranState, applyBattle, addRecruits, averageExperience,
  veteranLevel, veteranResistance, regularUnitLevel, namingMilestone,
  createRoster, livingOfficers, resolveOfficerFates, fateChances, perOfficer, exposureFromEvents,
  createCommander, recordBattle, eliteBattleFields
} = require('../index')
const { createRepository } = require('../../../adapters/persistence/veteransRepository')
const { createRng } = require('../../rng')
const { moraleResistance } = require('../../combat/ratings')

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-vet-'))
}

// ── The XP math, pinned to the docs' own worked example ─

test('the worked example: 15 recruits joining 65 veterans at 4.49 avg gives 80 at 3.65', () => {
  // Straight from the old DB docs' addRecruits example. If this fails, the
  // implementation has drifted from the documented intent.
  const state = { strength: 65, totalExperience: 292, battlesParticipated: 9 }
  assert.equal(averageExperience(state), 4.49)

  addRecruits(state, 15)
  assert.equal(state.strength, 80)
  assert.equal(averageExperience(state), 3.65)
  assert.equal(veteranLevel(state), 'Veteran', 'the example drops the unit from ~Veteran range down a rung in avg terms')
})

test('every survivor banks one experience per battle', () => {
  const state = createVeteranState({ strength: 80 })
  applyBattle(state, { survivors: 80 })
  assert.equal(state.totalExperience, 80)
  assert.equal(averageExperience(state), 1)
  assert.equal(state.battlesParticipated, 1)
})

test('the fallen take their experience with them', () => {
  // 80 men, two clean battles: avg 2.0. Then a bloody one: 60 survive.
  // The 20 dead carried avg-2 each; the 60 living bank today's point.
  const state = createVeteranState({ strength: 80 })
  applyBattle(state, { survivors: 80 })
  applyBattle(state, { survivors: 80 })
  assert.equal(averageExperience(state), 2)

  applyBattle(state, { survivors: 60 })
  // total = 160 + 60 (banked) - 20*2 (lost) = 180; 180/60 = 3.0
  assert.equal(state.strength, 60)
  assert.equal(averageExperience(state), 3)
})

test('veteran levels follow the salvaged thresholds', () => {
  const at = (avg) => veteranLevel({ strength: 1, totalExperience: avg })
  assert.equal(at(0), 'Recruit')
  assert.equal(at(1), 'Seasoned')
  assert.equal(at(3), 'Veteran')
  assert.equal(at(6), 'Elite Veteran')
  assert.equal(at(11), 'Legendary')
})

test('regular units use the simple battles-fought ladder', () => {
  assert.equal(regularUnitLevel(0), 'fresh')
  assert.equal(regularUnitLevel(1), 'green')
  assert.equal(regularUnitLevel(2), 'seasoned')
  assert.equal(regularUnitLevel(5), 'veteran')
  assert.equal(regularUnitLevel(10), 'legendary')
})

test('naming milestones land at battles 3, 5 and 10', () => {
  assert.equal(namingMilestone(2), null)
  assert.equal(namingMilestone(3), 'unit_named')
  assert.equal(namingMilestone(5), 'officer_personality')
  assert.equal(namingMilestone(10), 'legendary_status')
})

// ── Veterancy's teeth: rout resistance ─────────────────

test('veterancy raises rout resistance on top of the purchased tier', () => {
  // The notebook: "a veteran unit's main edge is that it stays." Two
  // otherwise identical professional units — one green, one Legendary — must
  // differ in the phase 2 resistance divisor, and in nothing the balance
  // matrix measures (its units never carry the field).
  const green = { quality: 'professional' }
  const legendary = {
    quality: 'professional',
    veteranResistance: veteranResistance({ strength: 80, totalExperience: 80 * 11 })
  }

  assert.ok(moraleResistance(legendary) > moraleResistance(green))
  assert.equal(moraleResistance({ quality: 'professional', veteranResistance: 0 }),
    moraleResistance(green), 'zero bonus is the same as no field — the matrix is untouched')
})

// ── Officers ───────────────────────────────────────────

// A stand-in RNG that returns the given draws in order, so a test can say
// exactly which officer the dice favour.
const draws = (...values) => { let i = 0; return () => values[i++] }

const TYPICAL = { win: 0.35, loss: 0.5 } // elite losses measured over 300 legions-vs-celts games

test('Q3: a typical win costs an officer about 1 battle in 10, a typical loss about 1 in 5', () => {
  assert.ok(Math.abs(fateChances({ result: 'victory', losses: TYPICAL.win }).kill - 0.1) < 0.005)
  assert.ok(Math.abs(fateChances({ result: 'defeat', losses: TYPICAL.loss }).kill - 0.2) < 0.005)

  // And the dice agree, whatever the roster size.
  for (const size of [3, 10]) {
    for (const [result, losses, target] of [['victory', TYPICAL.win, 0.1], ['defeat', TYPICAL.loss, 0.2]]) {
      const rng = createRng(size * 7 + target * 100)
      let costly = 0
      const battles = 20000
      for (let b = 0; b < battles; b++) {
        const roster = createRoster(Array.from({ length: size }, (_, i) => ({ position: `P${i}`, name: `o${i}` })))
        if (resolveOfficerFates(roster, rng, { battle: { result, losses } }).deaths.length > 0) costly++
      }
      const rate = costly / battles
      assert.ok(Math.abs(rate - target) < 0.012, `${result}, roster ${size}: ${rate.toFixed(3)} of battles cost an officer, want ${target}`)
    }
  }
})

test('Q3: the more men the unit lost, the likelier its officer fell', () => {
  const light = fateChances({ result: 'victory', losses: 0.05 }).kill
  const heavy = fateChances({ result: 'victory', losses: 0.8 }).kill
  assert.ok(heavy > light * 2, `${heavy} vs ${light}`)
  assert.ok(fateChances({ result: 'defeat', losses: 0.3 }).kill > fateChances({ result: 'victory', losses: 0.3 }).kill)
})

test('capture only happens to a unit that broke and was caught', () => {
  assert.equal(fateChances({ result: 'victory', losses: 0.3, exposure: {} }).capture, 0)
  assert.equal(fateChances({ result: 'defeat', losses: 0.5, exposure: { routed: true } }).capture, 0,
    'broke but got away clean')
  const caught = fateChances({ result: 'defeat', losses: 0.5, exposure: { routed: true, pursued: true } }).capture
  const trapped = fateChances({ result: 'defeat', losses: 0.5, exposure: { routed: true, pursued: true, trapped: true } }).capture
  assert.ok(caught > 0 && trapped > caught)
})

test('wounds: a near miss, and more for poor choices (fighting surrounded, getting trapped)', () => {
  const clean = fateChances({ result: 'victory', losses: 0.35 })
  const surrounded = fateChances({ result: 'victory', losses: 0.35, exposure: { outnumbered: true } })
  assert.ok(clean.wound > 0, 'a near miss is always possible')
  assert.ok(surrounded.wound > clean.wound + 0.09)
  assert.ok(Math.abs(perOfficer(0.2, 1) - 0.2) < 1e-12)
  assert.ok(Math.abs(1 - Math.pow(1 - perOfficer(0.2, 10), 10) - 0.2) < 1e-12)
})

test('a dead officer is promoted over, and his knowledge dies with him', () => {
  const roster = createRoster([
    { position: 'First Spear', name: 'Marcus' },
    { position: 'Standard Bearer', name: 'Gaius' }
  ])
  roster[0].knowledge.push('knows the north ford is passable in spring')

  // First draw kills Marcus, second spares Gaius.
  const outcome = resolveOfficerFates(roster, draws(0.001, 0.999),
    { recruitNames: ['Titus'], battle: { result: 'defeat', losses: 0.5 } })

  assert.equal(outcome.deaths.length, 1)
  assert.equal(outcome.deaths[0].name, 'Marcus')
  assert.equal(outcome.promotions.length, 1)
  assert.equal(outcome.promotions[0].name, 'Titus')
  assert.equal(outcome.promotions[0].position, 'First Spear')
  assert.equal(outcome.promotions[0].succeeds, 'Marcus')

  assert.equal(outcome.memorials[0].knowledgeLost[0],
    'knows the north ford is passable in spring')

  const living = livingOfficers(roster)
  assert.deepEqual(living.map(o => o.name).sort(), ['Gaius', 'Titus'])
  const titus = living.find(o => o.name === 'Titus')
  assert.equal(titus.battlesExperience, 0, 'the replacement knows nothing — that is the loss')
})

test('a captured officer leaves the roster alive, is replaced, and rolls no more', () => {
  const roster = createRoster([{ position: 'First Spear', name: 'Marcus' }])
  const battle = { result: 'defeat', losses: 0.6, exposure: { routed: true, pursued: true } }
  const { kill, capture } = fateChances(battle)
  // A draw just past the kill band, inside the capture band.
  const outcome = resolveOfficerFates(roster, draws(kill + capture / 2), { recruitNames: ['Titus'], battle })

  assert.deepEqual(outcome.captures.map(c => c.name), ['Marcus'])
  assert.equal(roster[0].alive, true, 'captured, not dead')
  assert.equal(roster[0].status, 'captured')
  assert.deepEqual(livingOfficers(roster).map(o => o.name), ['Titus'])

  const next = resolveOfficerFates(roster, draws(0.999), { battle: { result: 'victory', losses: 0.1 } })
  assert.equal(next.deaths.length + next.captures.length + next.wounds.length, 0)
  assert.equal(roster[0].status, 'captured', 'a captive is not at the next battle')
})

test('a wounded officer misses the next battle, then returns', () => {
  const roster = createRoster([{ position: 'First Spear', name: 'Marcus' }])
  const battle = { result: 'victory', losses: 0.35, exposure: { outnumbered: true } }
  const { kill, capture, wound } = fateChances(battle)
  const outcome = resolveOfficerFates(roster, draws(kill + capture + wound / 2), { battle })
  assert.equal(outcome.wounds.length, 1)
  assert.equal(outcome.wounds[0].reason, 'fought surrounded')
  assert.equal(roster[0].status, 'wounded')

  // The next battle: no draw is taken for him (the stand-in RNG has none
  // left to give), and he is back afterwards.
  const next = resolveOfficerFates(roster, draws(), { battle: { result: 'victory', losses: 0.2 } })
  assert.deepEqual(next.recovered.map(r => r.name), ['Marcus'])
  assert.equal(roster[0].status, 'active')
})

test('exposure is read from a real battle: the beaten elite broke, was chased and fought surrounded', () => {
  const { runBattle } = require('../../battle/battle')
  const { loadScenario } = require('../../../adapters/hotseat/scenarios')
  const spec = { ...loadScenario('legions-vs-celts'), maxTurns: 40 }
  const result = runBattle(spec, { seed: 3 })
  const loser = result.outcome.winner === 'red' ? 'blue_elite' : 'red_elite'
  const exposure = exposureFromEvents(result.events, loser)
  assert.equal(exposure.routed, true)
  assert.equal(exposure.pursued, true)
  assert.equal(exposure.outnumbered, true)
})

test('survivors gain a battle of experience; the roster keeps its dead as a record', () => {
  const roster = createRoster([{ position: 'First Spear', name: 'Marcus' }])
  // A seed whose first draw spares him.
  let seed = 1
  while (createRng(seed)() < 0.15) seed++
  resolveOfficerFates(roster, createRng(seed))
  assert.equal(roster[0].battlesExperience, 1)
  assert.equal(roster.length, 1)
})

test('officer fates are deterministic from the seed', () => {
  const build = () => {
    const roster = createRoster([
      { position: 'A', name: 'a' }, { position: 'B', name: 'b' },
      { position: 'C', name: 'c' }, { position: 'D', name: 'd' }
    ])
    const events = []
    for (let battle = 0; battle < 10; battle++) {
      events.push(resolveOfficerFates(roster, createRng(100 + battle)))
    }
    return JSON.stringify({ roster, events })
  }
  assert.equal(build(), build())
})

// ── The exit criterion ─────────────────────────────────

test('exit: three consecutive battles by the same commander persist correctly', () => {
  const dir = tempDir()
  const repo = createRepository(dir)

  // Enlistment day.
  const fresh = createCommander({ id: 'zach', name: 'Zach', culture: 'Roman Republic' })
  fresh.elite = {
    veteran: createVeteranState({ strength: 80 }),
    roster: createRoster([
      { position: 'First Spear', name: 'Marcus' },
      { position: 'Standard Bearer', name: 'Gaius' },
      { position: 'Master of Horse', name: 'Quintus' }
    ])
  }
  repo.save(fresh)

  // Three battles, each a full save/load round trip — the record must
  // survive the disk, not just the process.
  const battles = [
    { battleId: 'b1', result: 'victory', eliteSurvivors: 74, regularsFought: { spears_1: true } },
    { battleId: 'b2', result: 'defeat', eliteSurvivors: 61, regularsFought: { spears_1: true } },
    { battleId: 'b3', result: 'victory', eliteSurvivors: 58, regularsFought: { spears_1: true } }
  ]

  battles.forEach((battle, index) => {
    const commander = repo.load('zach')
    recordBattle(commander, battle, createRng(1000 + index), { recruitNames: ['Titus', 'Sextus', 'Decimus'] })
    repo.save(commander)
  })

  const veteranOfThree = repo.load('zach')

  assert.equal(veteranOfThree.battles.length, 3)
  assert.deepEqual(veteranOfThree.battles.map(b => b.battleId), ['b1', 'b2', 'b3'])
  assert.equal(veteranOfThree.elite.veteran.battlesParticipated, 3)
  assert.equal(veteranOfThree.elite.veteran.strength, 58,
    'strength tracks the survivors of the last battle')
  assert.ok(averageExperience(veteranOfThree.elite.veteran) > 1,
    'three battles of banked experience survive the round trips')

  // The naming milestone fired at battle three, exactly once, and was
  // recorded on the battle that crossed it.
  assert.deepEqual(veteranOfThree.battles[2].milestones, ['unit_named'])
  assert.deepEqual(veteranOfThree.battles[0].milestones, [])

  // The regular unit climbed its simple ladder.
  assert.equal(veteranOfThree.regulars.spears_1.battles, 3)
  assert.equal(regularUnitLevel(veteranOfThree.regulars.spears_1.battles), 'seasoned')

  // Officer arc: across three battles at these seeds someone died and was
  // replaced — and if not, the roster is intact; either way the ledger and
  // the roster must agree exactly.
  const deadNames = veteranOfThree.battles.flatMap(b => b.officerDeaths)
  const roster = veteranOfThree.elite.roster
  assert.equal(roster.filter(o => !o.alive).length, deadNames.length,
    'every recorded death is a dead officer in the roster, and vice versa')
  assert.equal(livingOfficers(roster).length, 3,
    'every named position is filled — promotion is automatic')

  // And the battle-facing view carries the earned resistance.
  const fields = eliteBattleFields(veteranOfThree)
  assert.ok(fields.veteranResistance >= 0)
  assert.equal(fields.strength, 58)

  fs.rmSync(dir, { recursive: true, force: true })
})

test('exit: the persisted record is byte-stable — saving twice changes nothing', () => {
  const dir = tempDir()
  const repo = createRepository(dir)

  const commander = createCommander({ id: 'c1', name: 'C', culture: 'Sparta' })
  commander.elite = {
    veteran: createVeteranState({ strength: 80 }),
    roster: createRoster([{ position: 'First Spear', name: 'M' }])
  }
  repo.save(commander)
  const once = fs.readFileSync(path.join(dir, 'c1.json'), 'utf8')
  repo.save(repo.load('c1'))
  const twice = fs.readFileSync(path.join(dir, 'c1.json'), 'utf8')

  assert.equal(once, twice)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('an officer death is a survivable disk event: die, save, load, promote intact', () => {
  const dir = tempDir()
  const repo = createRepository(dir)

  const commander = createCommander({ id: 'c2', name: 'C', culture: 'Roman Republic' })
  commander.elite = {
    veteran: createVeteranState({ strength: 80 }),
    roster: createRoster([{ position: 'First Spear', name: 'Marcus' }])
  }

  // A draw inside the kill band.
  const { deaths, promotions } = recordBattle(commander,
    { battleId: 'b1', result: 'defeat', eliteSurvivors: 70, regularsFought: {} },
    draws(0.001), { recruitNames: ['Titus'] }).officers

  assert.equal(deaths.length, 1)
  assert.equal(promotions.length, 1)

  repo.save(commander)
  const reloaded = repo.load('c2')

  assert.equal(reloaded.elite.roster.length, 2, 'the dead man and his successor')
  assert.equal(livingOfficers(reloaded.elite.roster)[0].name, 'Titus')
  assert.equal(reloaded.elite.roster[0].alive, false)

  fs.rmSync(dir, { recursive: true, force: true })
})
