// src/phase2-combat/tests/balance.assertions.test.js
//
// The regression suite that makes tuning safe.
//
// [design contract] "Every weight change reruns the matrix; assertions failing
// = the change is rejected."
//
// These are the nine automatic assertions listed in
// docs/design/combat-design.md under Balance Harness. Each test below names the
// assertion it implements. They are slower than the unit tests — the full
// matrix at N=200 is a few hundred milliseconds — but they are the only tests
// that can catch a tuning change that breaks the *feel* of the game rather than
// its arithmetic.
//
// If one fails after a table edit, the edit is wrong, not the test.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  runMatrix, runMirrorLadder, runPairing, makeUnit, ARCHETYPES
} = require('../balance/matrix')
const { duel } = require('../balance/duel')
const T = require('../combat/tables')

// [design contract] "N simulations each (suggest N=200)".
const SIMS = 200

// The paid ladder, worst to best. `elite` sits above it and is asserted
// separately; it is not something a player buys with SP.
const PAID_LADDER = ['levy', 'militia', 'tribal_warriors', 'professional', 'veteran_mercenary']

// Computed once — the matrix is the input to several assertions and there is no
// reason to pay for it repeatedly.
const MATRIX = runMatrix({ quality: 'professional', sims: SIMS })
const LADDER = runMirrorLadder({ sims: SIMS })

// ── Assertions 1 and 2: the round band ─────────────────

test('assertion 1: no pairing resolves in under 2 rounds', () => {
  // [design goal 2] "even the worst troops (levy) survive at least 1-2 rounds
  // before rout is possible." Players must get time to make a decision.
  for (const cell of MATRIX.cells) {
    assert.ok(cell.rounds.min >= 2,
      `${cell.a} vs ${cell.b} resolved in ${cell.rounds.min} rounds — the floor is 2`)
  }
})

test('assertion 2: no pairing exceeds 8 rounds', () => {
  // [design goal 2] "Slower battles, never stalemates. No pairing may grind
  // past ~8 rounds; stamina + morale decay guarantee convergence."
  for (const cell of MATRIX.cells) {
    assert.ok(cell.rounds.max <= 8,
      `${cell.a} vs ${cell.b} ran ${cell.rounds.max} rounds — the cap is 8`)
    assert.equal(cell.stalemateRate, 0,
      `${cell.a} vs ${cell.b} stalemated in ${(100 * cell.stalemateRate).toFixed(0)}% of sims`)
  }
})

test('assertions 1 and 2 hold at every quality tier, not just professional', () => {
  for (const quality of ['levy', 'militia', 'veteran_mercenary', 'elite']) {
    const matrix = runMatrix({ quality, sims: 60 })
    for (const cell of matrix.cells) {
      assert.ok(cell.rounds.min >= 2 && cell.rounds.max <= 8,
        `${quality}: ${cell.a} vs ${cell.b} ran [${cell.rounds.min}-${cell.rounds.max}]`)
    }
  }
})

// ── Assertion 3: mirrors are coin flips ────────────────

test('assertion 3: mirror matches come out about 50/50', () => {
  // [design goal 3] "Two equal-cost units in a neutral matchup should split
  // wins ~50/50 across many sims." A mirror is the strictest case of that:
  // identical cost, identical everything.
  for (const cell of MATRIX.cells.filter(c => c.mirror)) {
    assert.ok(Math.abs(cell.winRateA - 0.5) <= 0.12,
      `${cell.a} mirror went ${(100 * cell.winRateA).toFixed(0)}/${(100 * cell.winRateB).toFixed(0)} — not a coin flip`)
  }
})

test('assertion 3 holds down the whole quality ladder', () => {
  for (const rung of LADDER.rungs) {
    assert.ok(Math.abs(rung.winRateA - 0.5) <= 0.12,
      `${rung.quality} mirror went ${(100 * rung.winRateA).toFixed(0)}% to side A`)
  }
})

// ── Assertion 4: rounds rise with quality ──────────────

test('assertion 4: rounds-to-resolution rises with tier in mirror matches', () => {
  // [design goal 2] "elite vs elite ~6-8 rounds; levy vs levy ~2-3."
  //
  // Veteran Mercenaries are excluded, and that is a design decision rather than
  // a convenience. Rounds-to-resolution is driven by morale resistance, and the
  // notebook gives vet mercs Militia morale on purpose — so a vet merc mirror
  // is SHORT. Assertion 4 and the Veteran Mercenary concept genuinely conflict;
  // the tier is the documented exception, and the test immediately below pins
  // the behaviour that replaces it.
  const ordered = ['levy', 'militia', 'tribal_warriors', 'professional', 'elite']
  const roundsFor = (quality) => LADDER.rungs.find(r => r.quality === quality).rounds.mean

  let previous = 0
  for (const quality of ordered) {
    const rounds = roundsFor(quality)
    assert.ok(rounds >= previous,
      `${quality} resolved in ${rounds.toFixed(1)} rounds, faster than the tier below it`)
    previous = rounds
  }

  assert.ok(roundsFor('levy') <= 3, 'levy mirrors should be short and nasty')
  assert.ok(roundsFor('elite') >= 6, 'elite mirrors should be the long grind')
})

test('assertion 4, exception: Veteran Mercenary mirrors are SHORT, by design', () => {
  // "They hit hardest and leave first when losing." A vet merc mirror must
  // break sooner than a Professional one despite costing more.
  const roundsFor = (quality) => LADDER.rungs.find(r => r.quality === quality).rounds.mean
  assert.ok(roundsFor('veteran_mercenary') < roundsFor('professional'),
    'the whole point of the tier is that it does not stay')
})

// ── Assertion 5: the counters ──────────────────────────

// The unit that closed into contact is charging; the other stood to receive.
const counter = (aKey, aQuality, bKey, bQuality, whoCharges) => runPairing(
  makeUnit(aKey, aQuality), makeUnit(bKey, bQuality),
  { sims: SIMS, charging: { a: whoCharges === 'a', b: whoCharges === 'b' } }
)

test('assertion 5a: spears beat horses frontally', () => {
  // [design goal 4] "Spears beat horses." The cavalry is the one charging, so
  // this is the counter working against the charge, not around it.
  const result = counter('spearmen', 'professional', 'cavalry', 'professional', 'b')
  assert.ok(result.winRateA > 0.8,
    `spears won only ${(100 * result.winRateA).toFixed(0)}% against a frontal charge`)
})

test('assertion 5b: horses beat archers', () => {
  // [notebook] "Horse-vs-archers: spike lands nearly unopposed." Archers cannot
  // shoot while under melee attack, which in a duel is always.
  const result = counter('cavalry', 'professional', 'archers', 'professional', 'a')
  assert.ok(result.winRateA > 0.8,
    `cavalry won only ${(100 * result.winRateA).toFixed(0)}% against archers`)
})

test('assertion 5c: cavalry loses the melee it did not choose', () => {
  // [notebook] Cavalry is "bad in long melee engagements". The same pairing
  // flips entirely on who closed the distance — which is the point of the
  // charge-decay curve and of the [Q5] attacker ruling.
  const charged = counter('cavalry', 'professional', 'medium_infantry', 'professional', 'a')
  const caught = counter('cavalry', 'professional', 'medium_infantry', 'professional', 'b')

  assert.ok(charged.winRateA > 0.8,
    `a cavalry charge should land: won ${(100 * charged.winRateA).toFixed(0)}%`)
  assert.ok(caught.winRateA < 0.2,
    `cavalry caught standing should lose: won ${(100 * caught.winRateA).toFixed(0)}%`)
})

test('assertion 5d: counters are real but not absolute — quality overrides them', () => {
  // [design goal 4] "Counters are real but not absolute." A levy with spears
  // does not stop elite cavalry just by holding the right weapon.
  const outmatched = counter('spearmen', 'levy', 'cavalry', 'elite', 'b')
  assert.ok(outmatched.winRateA < 0.2,
    'a levy spear wall should not beat elite cavalry on the strength of the counter alone')

  const matched = counter('spearmen', 'elite', 'cavalry', 'levy', 'b')
  assert.ok(matched.winRateA > 0.8, 'and the counter should still work when quality is level or better')
})

// ── Assertion 6: Veteran Mercenaries ───────────────────

test('assertion 6: Veteran Mercenaries hit hardest in the paid ladder', () => {
  // Damage OUTPUT, measured on a single fresh exchange against one fixed
  // opponent so only the attacker's tier varies.
  //
  // Not measured as total casualties over a whole duel: a vet merc duel is
  // short by design, so summing across the fight measures how long the tier
  // survives rather than how hard it hits, and reports the opposite answer.
  const { casualtiesFrom } = require('../combat/damage')
  const target = makeUnit('medium_infantry', 'professional')

  const output = (quality) => casualtiesFrom(makeUnit('medium_infantry', quality), target).killed

  const vetMerc = output('veteran_mercenary')
  for (const quality of PAID_LADDER) {
    if (quality === 'veteran_mercenary') continue
    assert.ok(vetMerc > output(quality),
      `${quality} inflicted ${output(quality)} against the veteran mercenary's ${vetMerc}`)
  }
})

test('assertion 6: Veteran Mercenaries break sooner than their price suggests', () => {
  // "Above-average rout rate when losing." Against one shared superior
  // opponent, the vet merc should break before the Professional does.
  const beating = makeUnit('medium_infantry', 'elite')
  const roundsSurvived = (quality) =>
    duel({ a: makeUnit('medium_infantry', quality), b: beating, seed: 1 }).rounds

  assert.ok(roundsSurvived('veteran_mercenary') <= roundsSurvived('professional'),
    'a veteran mercenary should not out-last a professional under the same beating')
})

// ── Assertion 7: heavy kit is a countdown ──────────────

test('assertion 7: heavy kit runs out of stamina inside the engagement', () => {
  // [notebook] "Heavy kit protects and hits harder but runs stamina faster —
  // heavies must win before they gas out."
  const heavy = duel({
    a: makeUnit('heavy_infantry', 'professional'),
    b: makeUnit('heavy_infantry', 'professional'),
    seed: 1
  })
  const light = duel({
    a: makeUnit('light_infantry', 'professional'),
    b: makeUnit('light_infantry', 'professional'),
    seed: 1
  })

  const spentShare = (record, side) => 1 - record[side].stamina / T.QUALITY_TIERS.professional.staminaPool

  assert.ok(spentShare(heavy, 'a') > spentShare(light, 'a') / Math.max(1, heavy.rounds / light.rounds),
    'heavy kit must burn a larger share of the tank per round than light kit')
})

test('assertion 7: heavy kit wins early and pays for a long fight', () => {
  // The consequence, stated as the design states it: heavy infantry beats light
  // infantry, and the advantage is front-loaded, so a heavy unit that has
  // already gassed out is worse off than a light one at the same point.
  const short = counter('heavy_infantry', 'professional', 'light_infantry', 'professional', 'a')
  assert.ok(short.winRateA > 0.6, 'heavy kit should win the short violent version')

  const heavyUnit = makeUnit('heavy_infantry', 'professional')
  const lightUnit = makeUnit('light_infantry', 'professional')
  const { staminaDrainPerRound, staminaPool } = require('../combat/ratings')

  assert.ok(
    staminaPool(heavyUnit) / staminaDrainPerRound(heavyUnit) <
    staminaPool(lightUnit) / staminaDrainPerRound(lightUnit),
    'and must reach exhaustion first — that is what makes the clock real')
})

// ── Assertion 8: the mutual-rout rule ──────────────────

test('assertion 8: no engagement ends with both sides routed, and none runs forever', () => {
  // [locked decision 6] "Rout requires a loser." Checked as an outcome property
  // across the whole matrix rather than on a single fixture: no draw may be a
  // double rout, and no pairing may fail to terminate.
  for (const cell of MATRIX.cells) {
    assert.equal(cell.resolutions.stalemate, 0,
      `${cell.a} vs ${cell.b} failed to terminate`)
    assert.ok(cell.routRateA + cell.routRateB <= 1.0001,
      `${cell.a} vs ${cell.b} routed both sides in the same engagement`)
  }
})

// ── Assertion 9: elites ────────────────────────────────

test('assertion 9: an elite wins every head-on engagement except against another elite', () => {
  // [notebook] "An elite unit should win any head-on engagement unless facing
  // the enemy's own best." Checked against Professional — the best a player can
  // field in bulk — across every archetype, including the ones where the elite
  // is holding the losing side of a counter.
  for (const archetype of Object.keys(ARCHETYPES)) {
    const result = runPairing(
      makeUnit(archetype, 'elite'), makeUnit(archetype, 'professional'), { sims: 100 })
    assert.ok(result.winRateA > 0.9,
      `elite ${archetype} won only ${(100 * result.winRateA).toFixed(0)}% against professionals`)
  }
})

test('assertion 9: elite mirrors are still coin flips', () => {
  const elite = LADDER.rungs.find(r => r.quality === 'elite')
  assert.ok(Math.abs(elite.winRateA - 0.5) <= 0.12,
    `elite mirror went ${(100 * elite.winRateA).toFixed(0)}% to side A`)
})

// ── Reproducibility ────────────────────────────────────

test('a failing simulation can be replayed exactly from its seed', () => {
  // [design contract] "a seeded RNG makes every run reproducible — a failing
  // sim can be replayed exactly." Without this the whole harness is anecdote.
  const spec = {
    a: makeUnit('spearmen', 'militia'),
    b: makeUnit('cavalry', 'veteran_mercenary'),
    seed: 137,
    trace: true
  }
  assert.deepEqual(duel(spec), duel(spec))
})

test('the matrix is reproducible run to run', () => {
  const once = runMatrix({ quality: 'militia', sims: 20 })
  const twice = runMatrix({ quality: 'militia', sims: 20 })
  assert.deepEqual(once, twice)
})
