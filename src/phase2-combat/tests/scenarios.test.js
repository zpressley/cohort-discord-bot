// src/phase2-combat/tests/scenarios.test.js
//
// Phase 2's other exit criterion. The assertions in balance.assertions.test.js
// cover the matrix; these cover the three tactical scenarios and their tuning
// targets from PHASE2_COMBAT_PLAN.md section 8:
//
//   hill-assault      elevation matters
//   ford-crossing     mid-crossing is punishing
//   bridge-standoff   an even frontal fight, bloody and slow
//
// ── A note on what a scenario can and cannot prove ─────
//
// A scenario has one side advancing and the other holding, and in this engine
// that asymmetry — `prepared` — is the single most decisive factor there is,
// ahead of terrain, numbers and kit within a tier. Measured directly: a braced
// defender beats an unbraced attacker in ~100% of otherwise-identical matchups.
//
// So "the defender won the hill scenario" does NOT show that elevation matters;
// the same defender wins on flat ground. Terrain has to be measured with
// everything else held equal, which is what the controlled tests below do. The
// scenario tests then pin the scenarios as characterization — they catch a
// change that alters how a real battle plays out, without pretending to isolate
// a single modifier.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { runScenario } = require('../harness')
const { createCombatResolver } = require('../combat')
const { duel } = require('../balance/duel')
const { SCENARIOS } = require('../scenarios')

const SEEDS = 40

function sweepScenario(name, seeds = SEEDS) {
  const scenario = SCENARIOS[name]
  const runs = []
  for (let seed = 1; seed <= seeds; seed++) {
    runs.push(runScenario(scenario, { combatResolver: createCombatResolver(), seed }))
  }
  return runs
}

function winRate(runs, side) {
  return runs.filter(r => r.outcome.winner === side).length / runs.length
}

// Total casualties across both sides at the end of a run, as a share of the
// men who started.
function bloodiness(run) {
  const units = run.turns.at(-1).snapshot.units
  const lost = units.reduce((sum, u) => sum + (u.maxStrength - u.strength), 0)
  const started = units.reduce((sum, u) => sum + u.maxStrength, 0)
  return lost / started
}

// A fixed pair used for the controlled terrain tests: identical units, both
// braced, neither charging. The only thing that varies is the ground.
const CONTROL = {
  quality: 'professional',
  primaryWeapon: 'sword_standard',
  armor: 'medium_armor',
  shield: 'medium_shield',
  strength: 100,
  maxStrength: 100
}

function controlledTerrain({ aTerrain = 'plains', bTerrain = 'plains' }, seeds = 200) {
  let aWins = 0
  for (let seed = 1; seed <= seeds; seed++) {
    const result = duel({
      a: CONTROL,
      b: { ...CONTROL },
      seed,
      aTerrain,
      bTerrain,
      prepared: { a: true, b: true },
      charging: { a: false, b: false }
    })
    if (result.winner === 'a') aWins++
  }
  return aWins / seeds
}

// ── Terrain, measured with everything else held equal ──

test('elevation is worth something — the controlled measurement', () => {
  // The hill-assault scenario asks "if the attacker wins easily, elevation is
  // worth nothing". This is that question asked properly: two identical units,
  // both braced, neither charging, and only the ground different.
  const flat = controlledTerrain({})
  const uphill = controlledTerrain({ bTerrain: 'hill' })

  assert.ok(Math.abs(flat - 0.5) <= 0.12, `the control itself must be even, got ${(100 * flat).toFixed(0)}%`)
  assert.ok(uphill < flat - 0.10,
    `attacking uphill should cost real win probability: ${(100 * flat).toFixed(0)}% flat vs ${(100 * uphill).toFixed(0)}% uphill`)
})

test('being caught mid-crossing is punishing — the controlled measurement', () => {
  const flat = controlledTerrain({})
  const inTheWater = controlledTerrain({ aTerrain: 'ford' })

  assert.ok(inTheWater < flat - 0.15,
    `a unit caught in the ford should be badly off: ${(100 * flat).toFixed(0)}% flat vs ${(100 * inTheWater).toFixed(0)}% in the ford`)
})

test('holding ground beats advancing into contact — the effect that dominates scenarios', () => {
  // Not a design target, but the largest single effect in the engine, so it is
  // pinned: if this ever stops being true, every scenario result below changes
  // meaning and the comments at the top of this file are wrong.
  let bracedWins = 0
  for (let seed = 1; seed <= 200; seed++) {
    const result = duel({
      a: CONTROL,
      b: { ...CONTROL },
      seed,
      prepared: { a: false, b: true },
      charging: { a: true, b: false }
    })
    if (result.winner === 'b') bracedWins++
  }
  assert.ok(bracedWins / 200 > 0.8,
    `braced defenders should dominate, got ${(100 * bracedWins / 200).toFixed(0)}%`)
})

// ── The three scenarios ────────────────────────────────

test('every scenario reaches a decision — no undecided battles', () => {
  // Before the resolver reported routs, all three ended `undecided` even though
  // a unit had broken. Most battles end in a rout, so this is the common path,
  // not an edge case.
  for (const name of Object.keys(SCENARIOS)) {
    for (const run of sweepScenario(name, 10)) {
      assert.ok(run.outcome.decided, `${name} seed ${run.seed} ended undecided`)
      assert.ok(['red', 'blue', 'draw'].includes(run.outcome.winner))
    }
  }
})

test('hill-assault: the defenders hold the crest', () => {
  // 80 Spartans on The Crownhill against 100 Romans coming up it.
  const runs = sweepScenario('hill-assault')
  assert.ok(winRate(runs, 'blue') > 0.8,
    `the hill should hold, blue won ${(100 * winRate(runs, 'blue')).toFixed(0)}%`)
})

test('ford-crossing: the attacker is caught in the water and loses', () => {
  const runs = sweepScenario('ford-crossing')
  assert.ok(winRate(runs, 'blue') > 0.8,
    `crossing into a braced defender should fail, blue won ${(100 * winRate(runs, 'blue')).toFixed(0)}%`)

  // And the asymmetry must be real: one side in the ford, one on dry ground.
  // The scenario originally ordered the defender INTO the water, so both sides
  // took the crossing penalty and it measured nothing.
  const contact = runs[0].turns.find(t => t.engagements.length > 0)
  assert.equal(contact.engagements[0].aTerrain, 'ford')
  assert.equal(contact.engagements[0].bTerrain, 'plains')
})

test('bridge-standoff: bloody, slow, and genuinely even', () => {
  const runs = sweepScenario('bridge-standoff')
  const red = winRate(runs, 'red')

  assert.ok(red > 0.25 && red < 0.75,
    `a frontal fight between matched forces should be close, red won ${(100 * red).toFixed(0)}%`)

  const meanBlood = runs.reduce((sum, r) => sum + bloodiness(r), 0) / runs.length
  assert.ok(meanBlood > 0.15,
    `"bloody" should mean it, mean losses were ${(100 * meanBlood).toFixed(0)}% of both forces`)

  const meanTurns = runs.reduce((sum, r) => sum + r.turns.length, 0) / runs.length
  assert.ok(meanTurns >= 4, `"slow" should mean it, mean length was ${meanTurns.toFixed(1)} turns`)
})

test('no scenario is decided by a unit fighting with the wrong weapon', () => {
  // Every scenario unit used to leave `primaryWeapon` unset, so a spearman
  // formed in phalanx fought with the default sword and the spear counter was
  // absent from all three. Cheap to assert, easy to reintroduce.
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    for (const unit of scenario.units) {
      assert.ok(unit.primaryWeapon, `${name}: ${unit.id} has no primaryWeapon`)
    }
  }
})

test('scenario runs stay reproducible from their seed', () => {
  const once = runScenario(SCENARIOS['bridge-standoff'], { combatResolver: createCombatResolver(), seed: 9 })
  const twice = runScenario(SCENARIOS['bridge-standoff'], { combatResolver: createCombatResolver(), seed: 9 })
  assert.deepEqual(once, twice)
})
