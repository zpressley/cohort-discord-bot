// src/harness/character-league.js
//
// The computer's Commanders' characters (opponent/planner.js, CHARACTERS):
// are they equal, and do they play differently? Each character against
// each other, the same faction on both sides, every map, with the map's
// ground to fight for and the twelve-hour day (night ends a battle with no
// winner), mustered as harness/ground-league.js does. Both sides are the
// computer, with no Commander on the field; every pairing is played from
// both ends of the field, so the map favours neither.
//
//   --rounds N    seeds per faction, map and pairing (default 2)
//   --only a,b    these characters only
//   --kind k      the kind of battle: 'ground' (default; the field's ground,
//                 as many of it to hold as the field says) or 'pitched'
//   --none        no ground to fight for (a battle where the player named
//                 none), to compare
//
//   node src/harness/character-league.js --rounds 2
//
// It prints each character's share against the field (a win 1, night or a
// draw a half), each pairing, and how each plays against itself: battle
// length, minutes to first contact, and how its battles end (by the
// ground, by breaking the enemy, by night).

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback }
const { createGame, submitOrders, waitingOn } = require('../engine/orchestrator')
const { planTurn, CHARACTER_NAMES } = require('../opponent/planner')
const { loadScenario, mapChoices } = require('../adapters/hotseat/scenarios')
const { fieldFactions, FACTIONS } = require('../engine/army/factions')
const { groundOf, kindSpec } = require('../data/maps')
const T = require('../engine/combat/tables')

const MAX_STOPS = 600
const NONE = process.argv.includes('--none')
const KIND = arg('--kind', 'ground')

/** One battle: `west` and `east` are characters. */
function play(map, faction, west, east, seed) {
  let spec = fieldFactions(loadScenario('meeting-battle', { map, deploy: true, kind: NONE ? null : KIND }), { red: faction, blue: faction })
  const kind = NONE ? {} : kindSpec(map, KIND)
  const objectives = NONE ? [] : kind.objectives ?? groundOf(map)
  spec = {
    ...spec,
    standingOrders: {},
    dayMinutes: T.DAY.MINUTES,
    ...kind,
    ...(objectives.length ? { objectives } : {}),
    sides: { ...spec.sides, red: { ...spec.sides.red, character: west }, blue: { ...spec.sides.blue, character: east } }
  }
  const game = createGame(spec, { seed })
  let stops = 0
  while (!game.outcome.decided && stops < MAX_STOPS) {
    stops++
    for (const side of ['red', 'blue']) {
      if (game.outcome.decided || !waitingOn(game).includes(side)) continue
      submitOrders(game, side, planTurn(game, side))
    }
  }
  const o = game.outcome
  const contact = game.battle.log.ofType('contact')[0]
  return {
    decided: o.decided,
    winner: o.winner === 'red' || o.winner === 'blue' ? o.winner : null,
    reason: o.reason,
    minutes: game.minutesElapsed,
    contactAt: contact ? contact.turn * 10 : null
  }
}

const how = (reason) => (reason === 'objectives held' ? 'ground' : reason === 'night fell' ? 'night' : /broken|collapsed/.test(reason ?? '') ? 'broken' : 'other')

function league({ rounds = 2, only = null } = {}) {
  const chars = only ?? CHARACTER_NAMES
  const factions = Object.keys(FACTIONS)
  const maps = mapChoices({ big: false }).map(m => m.id)
  const score = {}      // score[a][b] = { n, points } for a against b
  const style = {}      // each against itself
  const stuck = []
  for (const a of chars) {
    score[a] = {}
    for (const b of chars) score[a][b] = { n: 0, points: 0, w: 0, l: 0, d: 0 }
    style[a] = { n: 0, minutes: 0, contact: 0, contacts: 0, ground: 0, broken: 0, night: 0, other: 0 }
  }
  let k = 0
  for (const map of maps) {
    factions.forEach((faction, fi) => {
      for (let round = 0; round < rounds; round++) {
        for (let i = 0; i < chars.length; i++) {
          for (let j = i; j < chars.length; j++) {
            const a = chars[i]
            const b = chars[j]
            // Each pairing from both ends of the field, on the same seed.
            const seed = 1 + fi + factions.length * round + 997 * maps.indexOf(map)
            for (const [west, east] of (a === b ? [[a, b]] : [[a, b], [b, a]])) {
              k++
              const out = play(map, faction, west, east, seed)
              if (!out.decided) { stuck.push({ map, faction, west, east, seed }); continue }
              const pts = { red: out.winner === 'red' ? 1 : out.winner ? 0 : 0.5 }
              pts.blue = 1 - pts.red
              for (const [side, me, them] of [['red', west, east], ['blue', east, west]]) {
                const s = score[me][them]
                s.n++
                s.points += pts[side]
                if (pts[side] === 1) s.w++
                else if (pts[side] === 0) s.l++
                else s.d++
              }
              if (a === b) {
                const st = style[a]
                st.n++
                st.minutes += out.minutes
                st[how(out.reason)]++
                if (out.contactAt !== null) { st.contact += out.contactAt; st.contacts++ }
              }
            }
          }
        }
      }
    })
  }
  return { chars, score, style, stuck, battles: k }
}

if (require.main === module) {
  const started = Date.now()
  const only = arg('--only', null)
  const r = league({ rounds: Number(arg('--rounds', 2)), only: only ? only.split(',') : null })
  const pct = (x) => `${Math.round(100 * x)}%`
  console.log(`${r.battles} battles; ${r.stuck.length} did not end; ${((Date.now() - started) / 1000).toFixed(0)} s`)
  console.log('\nagainst the field (the others; a win 1, night a half):')
  for (const a of r.chars) {
    const others = r.chars.filter(b => b !== a).map(b => r.score[a][b])
    const n = others.reduce((s, x) => s + x.n, 0)
    const p = others.reduce((s, x) => s + x.points, 0)
    const w = others.reduce((s, x) => s + x.w, 0)
    const l = others.reduce((s, x) => s + x.l, 0)
    console.log(`  ${a.padEnd(9)} ${pct(p / Math.max(1, n))} of ${n} (won ${w}, lost ${l}, night ${n - w - l})`)
  }
  console.log('\neach pairing (the row\'s share against the column):')
  console.log(`  ${''.padEnd(9)} ${r.chars.map(c => c.padStart(9)).join('')}`)
  for (const a of r.chars) console.log(`  ${a.padEnd(9)} ${r.chars.map(b => (a === b ? '-' : pct(r.score[a][b].points / Math.max(1, r.score[a][b].n))).padStart(9)).join('')}`)
  console.log('\nhow each plays, against itself:')
  for (const a of r.chars) {
    const s = r.style[a]
    console.log(`  ${a.padEnd(9)} ${s.n} battles, ${Math.round(s.minutes / Math.max(1, s.n))} min on average; first contact at ${Math.round(s.contact / Math.max(1, s.contacts))} min; ` +
      `by the ground ${pct(s.ground / Math.max(1, s.n))}, an army broken ${pct(s.broken / Math.max(1, s.n))}, night ${pct(s.night / Math.max(1, s.n))}`)
  }
  if (r.stuck.length) { console.log('NOT ENDED:', JSON.stringify(r.stuck.slice(0, 5))); process.exitCode = 1 }
}

module.exports = { play, league }
