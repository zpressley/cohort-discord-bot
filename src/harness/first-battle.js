// src/harness/first-battle.js
//
// A new player's first battles, as the app plays them: a new Commander
// made at the muster, on the field with his best unit, his orders read by
// the grammar (no AI) and carried by rider, against the computer (its
// Commander's character from the seed, its orders by rider), a day of
// twelve hours, the field's own ground to fight for. Everything goes
// through the server's own battle store (src/web/battles.js), in memory.
//
// He plays one of three ways:
//   --play advance   "everyone advance" on his first turn, nothing after
//   --play take      the first turn's first example order for the kind of
//                    battle, on his first turn: "everyone take <the field's
//                    ground>" ("everyone take the fords" on Crownhill); in a
//                    pitched battle, with no ground, "everyone advance"
//   --play order     the words of --order on his first turn, nothing after
//   --play hold      "everyone hold" on his first turn, nothing after (to
//                    count how often a Commander whose men hold is asked)
//   --play planner   he plans as the computer does (opponent/planner.js),
//                    each time he is asked, his orders by rider
//
// For each field: his wins, how the battles ended, men lost on each side,
// how long the first stretch ran before he was first asked again, whether
// he was asked at all before the ground was lost, and his turns a battle.
//
//   node src/harness/first-battle.js --play advance --battles 40
//   --map crownhill   one field only
//   --kind pitched    the kind of battle (default ground; src/data/maps,
//                     kindsOf)

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback }
const { createBattleStore } = require('../web/battles')
const { submitOrders, waitingOn } = require('../engine/orchestrator')
const { planTurn } = require('../opponent/planner')
const { byCommandPost } = require('../engine/command/messengers')
const { mapChoices } = require('../adapters/hotseat/scenarios')
const { FACTIONS } = require('../engine/army/factions')
const { groundOf, MAPS } = require('../data/maps')

const MAX_TURNS = 300
// --play order --order "<words>": that order on his first turn, nothing after.
const ORDER = arg('--order', 'everyone advance')

function menOf(game, side) {
  return [...game.battle.world.units, ...game.battle.fledUnits].filter(u => u.side === side).reduce((n, u) => n + Math.max(0, u.strength), 0)
}

async function play({ map, faction, seed, how, kind = 'ground' }) {
  const store = createBattleStore({})
  const commander = store.commanders.create({ faction })
  const { seats } = store.muster({ map, side: 'red', seed, commander: commander.token, faction, kind })
  const token = seats.red
  const entry = store.seatOf(token).entry
  const game = entry.game
  const start = { red: menOf(game, 'red'), blue: menOf(game, 'blue') }
  const ground = groundOf(map).map(g => g.name)[0]
  const several = MAPS[map]?.hold?.called
  const take = kind === 'pitched' ? 'everyone advance' : several ? `everyone take the ${several}` : `everyone take the ${ground.replace(/^the /i, '')}`
  const first = how === 'advance' ? 'everyone advance' : how === 'hold' ? 'everyone hold' : how === 'order' ? ORDER : take
  let turns = 0
  for (; turns < MAX_TURNS && !game.outcome.decided; turns++) {
    if (how === 'planner') {
      // His own plan, straight into the battle; then the computer, as the
      // server answers for it, until the battle stops for him again.
      submitOrders(game, 'red', byCommandPost(planTurn(game, 'red')))
      for (let i = 0; i < 1000 && !game.outcome.decided && !waitingOn(game).includes('red'); i++) {
        submitOrders(game, 'blue', byCommandPost(planTurn(game, 'blue')))
      }
    } else {
      await store.submit(token, turns === 0 ? first : '')
    }
  }
  const lost = (side) => start[side] - menOf(game, side)
  // The first stretch: battle minutes until the battle first stopped for
  // him after his first orders.
  let minutes = 0
  let firstAsked = null
  const askedAt = []
  for (const h of game.history) {
    minutes += h.ticks.length * 10
    if (!h.wanted || h.wanted.red) { askedAt.push(minutes); if (firstAsked === null) firstAsked = minutes }
  }
  // Was he asked while the enemy held the ground, before it decided the
  // battle? (Asked at a stop after the enemy first held it.)
  const objectives = game.battle.log.ofType('objective')
  const enemyHeld = objectives.find(e => e.side === 'blue' && !e.close)
  const heldAt = enemyHeld ? enemyHeld.turn * 10 : null
  const askedWhileHeld = heldAt !== null && askedAt.some(m => m >= heldAt && m < game.minutesElapsed)
  // And during the enemy's last hold, the one that decided the battle:
  // asked after it began, while there was still time to contest it.
  const lastHeld = [...objectives].reverse().find(e => !e.close)
  const lastHeldAt = lastHeld?.side === 'blue' ? lastHeld.turn * 10 : null
  const askedInLastHold = lastHeldAt !== null && askedAt.some(m => m >= lastHeldAt && m < game.minutesElapsed)
  const why = {}
  for (const h of game.history) if (h.wanted?.red) why[h.wanted.red] = (why[h.wanted.red] ?? 0) + 1
  return {
    decided: game.outcome.decided, winner: game.outcome.winner, reason: game.outcome.reason,
    minutes: game.minutesElapsed, turns: game.calls.red, firstAsked,
    lostRed: lost('red'), lostBlue: lost('blue'), blows: lost('red') + lost('blue') > 0,
    heldAt, askedWhileHeld, askedInLastHold,
    // His Commander taken (riding with his best unit).
    taken: game.battle.log.ofType('commanderTaken').some(e => e.side === 'red'),
    crowded: game.battle.log.all().filter(e => e.type === 'crowding' && e.tier !== 'organized').length,
    // Packed together on the ground to fight for itself (not on the road there).
    packed: game.battle.log.all().filter(e => e.type === 'crowding' && e.tier !== 'organized' && e.unitId.startsWith('red') && game.objectives.some(o => o.tiles.some(t => Math.abs(t.x - e.at.x) <= 1 && Math.abs(t.y - e.at.y) <= 1))).length,
    why
  }
}

async function league({ battles = 40, how = 'advance', only = null, kind = 'ground' } = {}) {
  const factions = Object.keys(FACTIONS)
  const rows = []
  for (const { id: map } of mapChoices({ big: false }).filter(m => !only || m.id === only)) {
    const r = { map, n: 0, won: 0, lost: 0, night: 0, reasons: {}, lostRed: 0, lostBlue: 0, noBlows: 0, firstAsked: [], turns: 0, minutes: 0, groundLostUnasked: 0, lastHoldUnasked: 0, asked: 0, crowded: 0, packed: 0, why: {}, taken: 0 }
    for (let i = 0; i < battles; i++) {
      const out = await play({ map, faction: factions[i % factions.length], seed: 101 + i * 977, how, kind })
      r.n++
      if (out.winner === 'red') r.won++
      else if (out.winner === 'blue') r.lost++
      if (out.reason === 'night fell' || out.reason === 'field held at nightfall') r.night++
      const key = !out.decided ? 'not ended' : out.winner === 'draw' ? out.reason : `${out.reason} (${out.winner === 'red' ? 'his' : 'the computer\'s'})`
      r.reasons[key] = (r.reasons[key] ?? 0) + 1
      r.lostRed += out.lostRed
      r.lostBlue += out.lostBlue
      if (!out.blows) r.noBlows++
      if (out.firstAsked !== null) r.firstAsked.push(out.firstAsked)
      r.turns += out.turns
      if (out.taken) r.taken++
      r.minutes += out.minutes
      r.crowded += out.crowded
      r.packed += out.packed
      if (out.reason === 'objectives held' && out.winner === 'blue' && !out.askedWhileHeld) r.groundLostUnasked++
      if (out.reason === 'objectives held' && out.winner === 'blue' && !out.askedInLastHold) r.lastHoldUnasked++
      for (const [k, v] of Object.entries(out.why)) r.why[k] = (r.why[k] ?? 0) + v
    }
    rows.push(r)
  }
  return rows
}

if (require.main === module) {
  const how = arg('--play', 'advance')
  league({ battles: Number(arg('--battles', 40)), how, only: arg('--map', null), kind: arg('--kind', 'ground') }).then(rows => {
    const pct = (a, b) => `${Math.round(100 * a / Math.max(1, b))}%`
    for (const r of rows) {
      const f = [...r.firstAsked].sort((a, b) => a - b)
      console.log(`${r.map.padEnd(11)} ${how}: won ${r.won} of ${r.n} (${pct(r.won, r.n)}), lost ${r.lost}, night ${r.night}; ` +
        `no blow struck in ${r.noBlows}; men lost a battle: his ${Math.round(r.lostRed / r.n)}, the computer's ${Math.round(r.lostBlue / r.n)}`)
      console.log(`            first asked again after ${f[0] ?? '-'} to ${f.at(-1) ?? '-'} min (median ${f[Math.floor(f.length / 2)] ?? '-'}); ` +
        `${(r.turns / r.n).toFixed(1)} turns, ${Math.round(r.minutes / r.n)} min a battle; lost by the ground without being asked while the enemy held it: ${r.groundLostUnasked} (in the hold that won it: ${r.lastHoldUnasked}); ${(r.turns / Math.max(1, r.minutes / 60)).toFixed(1)} asked an hour; times units packed together ${r.crowded} (${r.packed} his, on or beside the ground)`)
      console.log(`            his Commander taken in ${r.taken} (${r.taken ? `1 in ${(r.n / r.taken).toFixed(0)}` : 'none'})`)
      console.log(`            ${Object.entries(r.reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`)
      console.log(`            asked for: ${Object.entries(r.why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    }
  })
}

module.exports = { play, league }
