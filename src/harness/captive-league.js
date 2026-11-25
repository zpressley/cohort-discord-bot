// src/harness/captive-league.js
//
// A held Commander against the computer as his captor: how often his
// offers are taken, how often he is lost, and how his army fares while his
// officers run their own units. Faction armies on every map, as in
// faction-league.js, each battle with a seed of its own (the Commander's
// dice are seeded from the battle's seed alone).
//
// Red is the player. He sends everyone in, every turn (the worst case for
// his Commander), and while he is held:
//   --policy offer   he offers the field alone first, then the field and
//                    his weakest unit, adding the next weakest each turn;
//                    a counter he can meet, he meets
//   --policy wait    he makes no offer and waits for the battle to end
// Blue is the computer (opponent/planner.js), and answers each offer with
// opponent/captor.js.
//
//   node src/harness/captive-league.js --battles 2000 --policy offer
//   node src/harness/captive-league.js --root /path/to/an/older/src ...   (wait only)
//   --kind k        a kind of battle (src/data/maps, kindSpec): 'ground' or
//                   'pitched', with no day, as the league's battles always
//                   were; none, the battle as before the kinds (no ground)
//   --character c   the computer's Commander: bold, steady, cautious, or mix
//                   (drawn from each battle's seed, as the app's muster)

const path = require('path')
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback }
const ROOT = path.resolve(arg('--root', path.join(__dirname, '..')))
const need = (p) => require(path.join(ROOT, p))

const { createGame, submitOrders, commanderOf } = need('engine/orchestrator')
const { planTurn } = need('opponent/planner')
const { loadScenario, mapChoices } = need('adapters/hotseat/scenarios')
const { fieldFactions, FACTIONS } = need('engine/army/factions')
const { leadUnit } = need('engine/command/company')
const { assignOfficers } = need('engine/command/roster')
let captorAnswer = null
try { ({ captorAnswer } = need('opponent/captor')) } catch { /* an older build has none */ }

// --character bold|steady|cautious|mix: the computer's Commander's
// character (opponent/planner.js, CHARACTERS); mix: drawn from each
// battle's seed, as at the app's muster. None: steady, the planner as it was.
const CHARACTER = arg('--character', null)
const KIND = arg('--kind', null)
let kindSpec = null
try { ({ kindSpec } = need('data/maps')) } catch { /* an older build has none */ }
const { withCommander } = require('../opponent/commander')
let withSecondLine = null
try { ({ withSecondLine } = need('engine/army/secondLine')) } catch { /* a build before the big map */ }
const MAX_PLAYER_TURNS = 150

function play(red, blue, { map, seed, policy }) {
  // Officers as a new Commander has them: a veteran with the elite, no one
  // on the rest; the enemy's drawn from the seed, as at the muster.
  let spec = fieldFactions(loadScenario('meeting-battle', { map, deploy: true, ...(KIND ? { kind: KIND } : {}) }), { red, blue })
  if (KIND && kindSpec) spec = { ...spec, ...kindSpec(map, KIND) }
  // A field of more than one line (the big map): each army's second line.
  if (withSecondLine) spec = withSecondLine(spec, { red, blue })
  spec = { ...spec, units: assignOfficers(spec.units, seed) }
  const mine = spec.units.filter(u => u.side === 'red')
  const elite = mine[leadUnit(mine)].id
  spec = { ...spec, units: spec.units.map(u => u.side !== 'red' ? u : u.id === elite ? u : { ...u, officer: { headless: true } }) }
  const blueMine = spec.units.filter(u => u.side === 'blue')
  const commanders = { red: { unitId: elite }, blue: { unitId: blueMine[leadUnit(blueMine)].id } }
  // The computer's Commander's character (--character): one named, or
  // drawn from the seed as the app's muster draws it ('mix'); none, steady.
  if (CHARACTER) spec = withCommander(spec, 'blue', seed, CHARACTER === 'mix' ? null : { character: CHARACTER })
  const game = createGame({ ...spec, standingOrders: {}, commanders }, { seed })

  const r = { taken: false, offers: 0, accepted: 0, countered: 0, metCounter: false, heldTurns: 0 }
  let made = 0
  let turns = 0
  while (!game.outcome.decided && turns < MAX_PLAYER_TURNS) {
    const held = game.battle.commanders.red.status === 'held'
    if (held) {
      r.taken = true
      r.heldTurns++
      if (policy === 'offer' && game.parley) {
        const t = game.parley.red
        const chips = game.battle.world.units.filter(u => u.side === 'red' && u.strength > 0)
          .sort((a, b) => a.strength - b.strength || a.id.localeCompare(b.id)).map(u => u.id)
        const counter = t?.counter && t.answer?.kind === 'more' ? t.counter.units : null
        const units = counter && counter.every(id => chips.includes(id)) ? counter : chips.slice(0, Math.min(made, chips.length))
        if (counter && units === counter) r.metCounter = true
        const res = submitOrders(game, 'red', { offer: { units } })
        if (res.status !== 'refused') {
          made++
          r.offers++
          if (!game.outcome.decided) {
            const answer = captorAnswer(game, 'blue')
            if (answer) {
              if (answer.more) r.countered++
              submitOrders(game, 'blue', { answer })
            }
          }
          if (game.outcome.decided) { r.accepted++; break }
        }
      }
    } else made = 0
    const orders = held ? [] : game.battle.world.units.filter(u => u.side === 'red' && u.strength > 0 && !game.battle.broken.has(u.id))
      .map(u => ({ unitRef: u.id, action: 'advance' }))
    submitOrders(game, 'red', orders)
    submitOrders(game, 'blue', planTurn(game, 'blue'))
    turns++
  }
  return { ...r, decided: game.outcome.decided, winner: game.outcome.winner, reason: game.outcome.reason, fate: commanderOf(game, 'red')?.fate ?? null, prices: commanderOf(game, 'red')?.prices ?? [] }
}

function league({ battles = 480, policy = 'offer' } = {}) {
  // --maps a,b: these fields (the big one among them, if named); else the
  // four 1 km fields.
  const maps = arg('--maps', null)?.split(',') ?? mapChoices({ big: false }).map(m => m.id)
  const factions = Object.keys(FACTIONS)
  const pairs = []
  for (const a of factions) for (const b of factions) if (a !== b) for (const map of maps) pairs.push([a, b, map])
  const all = { battles: 0, stuck: 0, taken: 0, offers: 0, accepted: 0, countered: 0, metCounter: 0, fates: {}, heldWins: 0, heldLosses: 0, heldDraws: 0, wins: 0, prices: 0, fieldOnly: 0, heldTurns: 0 }
  for (let i = 0; i < battles; i++) {
    const [a, b, map] = pairs[i % pairs.length]
    const r = play(a, b, { map, seed: 1000 + i * 7919, policy })
    all.battles++
    if (!r.decided) { all.stuck++; continue }
    if (r.winner === 'red') all.wins++
    if (!r.taken) continue
    all.taken++
    all.heldTurns += r.heldTurns
    all.offers += r.offers
    all.accepted += r.accepted
    all.countered += r.countered
    if (r.metCounter) all.metCounter++
    all.fates[r.fate] = (all.fates[r.fate] ?? 0) + 1
    if (r.accepted) { all.prices += r.prices.length; if (!r.prices.length) all.fieldOnly++ }
    // How the army did while he was held, by the battle's end, deals aside.
    if (!r.accepted) {
      if (r.winner === 'red') all.heldWins++
      else if (r.winner === 'draw') all.heldDraws++
      else all.heldLosses++
    }
  }
  return all
}

if (require.main === module) {
  const battles = Number(arg('--battles', 480))
  const policy = arg('--policy', 'offer')
  const all = league({ battles, policy })
  const pct = (n, d) => `${Math.round(100 * n / Math.max(1, d))}%`
  console.log(`${all.battles} battles (${ROOT}), policy ${policy}; ${all.stuck} did not end`)
  console.log(`red won ${pct(all.wins, all.battles)}; taken in ${all.taken} (1 in ${(all.battles / Math.max(1, all.taken)).toFixed(1)})`)
  console.log(`held for ${(all.heldTurns / Math.max(1, all.taken)).toFixed(1)} player turns on average`)
  if (policy === 'offer') {
    console.log(`offers ${all.offers}, ${(all.offers / Math.max(1, all.taken)).toFixed(1)} a captivity; accepted ${all.accepted} (${pct(all.accepted, all.offers)} of offers, ${pct(all.accepted, all.taken)} of captivities); countered ${all.countered}; counter met in ${all.metCounter}`)
    console.log(`deals: ${all.fieldOnly} for the field alone; ${all.prices} units given in all`)
  }
  console.log('fates of the held:', JSON.stringify(all.fates))
  const noDeal = all.heldWins + all.heldLosses + all.heldDraws
  console.log(`held with no deal: ${noDeal}; the army won ${all.heldWins} (${pct(all.heldWins, noDeal)}), lost ${all.heldLosses}, drew ${all.heldDraws}`)
}

module.exports = { play, league }
