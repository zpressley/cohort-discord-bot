// src/interpreter/tests/fixtures/score.js
//
// Runs the plain orders (plain-orders.js) through the grammar alone, with
// no AI, on each field with a real army mustered as the app musters it,
// and sorts every reading into:
//   right    the orders he meant, no question
//   asked    a "which do you mean?" with answers to tap: understood, but
//            the words fit more than one thing on this field
//   wrong    orders, but not the ones he meant
//   unread   a question with nothing to tap where an order was meant
// For an entry whose right answer is a question, a question is right and
// any order is wrong.
//
//   node src/interpreter/tests/fixtures/score.js            the table
//   node src/interpreter/tests/fixtures/score.js --misses   and every miss

const { createBattleStore, unitName } = require('../../../web/battles')
const { interpretText } = require('../../orders')
const { gridLabel, parseGridRef } = require('../../../engine/map/grid')
const { detectFeatures } = require('../../../engine/map/features')
const { missileRange } = require('../../../engine/combat/ranged')
const { PLAIN_ORDERS } = require('./plain-orders')
const { kindParts } = require('../../../narrator/words')

const MAPS = ['crownhill', 'ashford', 'thornwood', 'ravenridge', 'greywater']
const ARMIES = ['rome', 'macedon', 'parthia']

// One side's view, as the app gives the order reader (web/battles.js,
// context): its own units by their names, the enemy as if every unit had
// been seen where it stands, its own edge of the field, and the ground to
// fight for.
function contextFor(store, map, army) {
  const seat = store.muster({ map, opponent: 'standing', side: 'red', faction: army, enemyFaction: 'han', seed: 11 }).seats.red
  const game = store.seatOf(seat).entry.game
  const units = game.battle.world.units
  return {
    map: game.battle.map,
    units: units.filter(u => u.side === 'red').map(u => ({ ...u, aliases: [unitName(u).toLowerCase(), ...(u.aliases ?? [])] })),
    enemies: units.filter(u => u.side === 'blue').map(u => ({ id: u.id, status: 'visible', position: { ...u.position }, seenOnTurn: 1, role: u.role, mounted: u.mounted, primaryWeapon: u.primaryWeapon })),
    homeEdge: game.spec.sides.red.homeEdge,
    ground: game.battle.ground,
    lyingInWait: []
  }
}

const COMPASS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0], NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1] }

function placeMet(place, target, unit, context) {
  if (!place) return true
  if (place === 'any') return Boolean(target)
  if (!target) return false
  const { map } = context
  const near = (tiles, reach = 1) => tiles.some(t => Math.max(Math.abs(t.x - target.x), Math.abs(t.y - target.y)) <= reach)
  if (place === 'ground') return (context.ground ?? []).some(g => near(g.tiles, (g.reach ?? 0) + 1))
  if (place === 'home') {
    const dx = target.x - unit.position.x
    return context.homeEdge === 'west' ? dx < 0 : context.homeEdge === 'east' ? dx > 0 : true
  }
  if (COMPASS[place]) {
    const [sx, sy] = COMPASS[place]
    const dx = Math.sign(target.x - unit.position.x)
    const dy = Math.sign(target.y - unit.position.y)
    // Kept on the map, a march can come up short on one axis: that way,
    // or as near it as the ground allows.
    return (dx === sx || sx === 0) && (dy === sy || sy === 0) && (dx !== 0 || dy !== 0)
  }
  if (place.startsWith('kind:')) {
    const kind = place.slice(5)
    return detectFeatures(map).some(f => f.kind === kind && near(f.tiles))
  }
  if (place.startsWith('name:')) {
    const name = place.slice(5).toLowerCase()
    return detectFeatures(map).some(f => f.name && f.name.toLowerCase() === name && near(f.tiles))
  }
  const square = parseGridRef(place)
  if (square) return gridLabel(target) === square.label.slice(0, 2) || gridLabel(target) === square.label
  return false
}

function whoMet(who, ids, context) {
  const all = context.units
  const second = (u) => /^red_second_/.test(u.id)
  let want
  if (who === '*') want = all
  else if (who === '*/second') want = all.filter(second)
  else if (who === '*/first') want = all.filter(u => !second(u))
  else if (who === 'kind:cavalry') want = all.filter(u => u.mounted)
  else if (who === 'kind:archers') want = all.filter(u => missileRange(u) > 0)
  else if (typeof who === 'string' && who.startsWith('shown:')) want = all.filter(u => kindParts(u).kind.endsWith(who.slice(6)))
  else if (who === 'kind:foot') want = all.filter(u => !u.mounted)
  else if (who === 'kind:pikes') want = all.filter(u => ['macedonian_sarissa', 'two_handed_spear'].includes(u.primaryWeapon))
  else if (typeof who === 'string' && who.startsWith('*-')) {
    const out = who.slice(2).split('-')
    want = all.filter(u => !out.includes(unitName(u)))
  } else want = all.filter(u => who.includes(unitName(u)))
  const got = [...new Set(ids)].sort()
  const meant = want.map(u => u.id).sort()
  return got.length === meant.length && got.every((id, i) => id === meant[i])
}

function orderMet(want, orders, context) {
  const mine = orders.filter(o => !o.ride)
  const actions = [].concat(want.action)
  const fits = (o) => {
    const action = o.action === 'move' && o.then === 'hold' ? 'defend' : o.action
    if (!actions.includes(action) && !(actions.includes('defend') && o.action === 'defend')) return false
    const unit = context.units.find(u => u.id === o.unitRef)
    if (!placeMet(want.place, o.target, unit, context)) return false
    if (want.enemy && !o.enemy) return false
    if (want.fire === 'shoot' && o.holdFire) return false
    if (want.fire === 'hold' && !o.holdFire) return false
    if (want.steps && (o.steps ?? []).length < want.steps) return false
    if (want.when && o.when?.type !== want.when) return false
    const friend = context.units.find(u => u.id === o.friend)
    if (want.friend && !friend) return false
    if (typeof want.friend === 'string' && !kindParts(friend).kind.endsWith(want.friend.slice(6))) return false
    if (Array.isArray(want.friend) && !want.friend.includes(unitName(friend))) return false
    if (want.keep && o.keep !== want.keep) return false
    return true
  }
  const ids = mine.filter(fits).map(o => o.unitRef)
  return whoMet(want.who, ids, context) ? ids : null
}

async function judge(entry, context) {
  const read = await interpretText(entry.say, context, {})
  const orders = read.orders
  if (entry.want === 'ask') {
    // A clear answer, not the bare "I don't follow" (unless the words are
    // no order at all: `anyQuestion`).
    if (orders.length > 0) return { verdict: 'wrong', read }
    const clear = read.questions.length > 0 && (entry.anyQuestion || !read.questions.some(q => /^I don't follow/.test(q)))
    return { verdict: clear ? 'right' : 'unread', read }
  }
  const used = []
  let met = true
  for (const want of entry.want) {
    const ids = orderMet(want, orders, context)
    if (!ids) { met = false; break }
    used.push(...ids)
  }
  const extra = orders.filter(o => !o.ride && !used.includes(o.unitRef))
  if (met && extra.length === 0 && read.questions.length === 0) return { verdict: 'right', read }
  if (read.questions.length > 0 && read.choices.length > 0 && extra.length === 0) return { verdict: 'asked', read }
  if (orders.length === 0) return { verdict: 'unread', read }
  return { verdict: 'wrong', read }
}

/** Every reading: [{ entry, map, army, verdict, read }]. */
async function scoreAll() {
  const store = createBattleStore({})
  const contexts = new Map()
  const out = []
  for (const entry of PLAIN_ORDERS) {
    const army = entry.army ?? 'rome'
    for (const map of entry.maps ?? MAPS) {
      const key = `${map}/${army}`
      if (!contexts.has(key)) contexts.set(key, contextFor(store, map, army))
      const { verdict, read } = await judge(entry, contexts.get(key))
      out.push({ entry, map, army, verdict, read })
    }
  }
  return out
}

function tally(results) {
  const count = { right: 0, asked: 0, wrong: 0, unread: 0 }
  for (const r of results) count[r.verdict]++
  return { ...count, total: results.length }
}

module.exports = { scoreAll, tally, contextFor, MAPS, ARMIES }

if (require.main === module) {
  scoreAll().then(results => {
    const t = tally(results)
    const pct = (n) => `${Math.round(100 * n / t.total)}%`
    const lines = PLAIN_ORDERS.length
    const linesRight = PLAIN_ORDERS.filter(e => results.filter(r => r.entry === e).every(r => r.verdict === 'right' || r.verdict === 'asked')).length
    console.log(`${lines} orders, ${t.total} readings (each order on each field it fits)`)
    console.log(`right ${t.right} (${pct(t.right)})  asked which ${t.asked} (${pct(t.asked)})  wrong ${t.wrong} (${pct(t.wrong)})  not read ${t.unread} (${pct(t.unread)})`)
    console.log(`orders understood on every field (right or a fair question): ${linesRight} of ${lines}`)
    const fresh = tally(results.filter(r => r.entry.fresh))
    console.log(`of which fresh (not tuned for): ${fresh.total} readings, right ${fresh.right}, asked which ${fresh.asked}, wrong ${fresh.wrong}, not read ${fresh.unread}`)
    const held = tally(results.filter(r => r.entry.heldOut))
    console.log(`of which held out (written last, run once): ${held.total} readings, right ${held.right}, asked which ${held.asked}, wrong ${held.wrong}, not read ${held.unread}`)
    const kinds = tally(results.filter(r => r.entry.kinds))
    console.log(`of which kinds and keeping by a unit: ${kinds.total} readings, right ${kinds.right}, asked which ${kinds.asked}, wrong ${kinds.wrong}, not read ${kinds.unread}`)
    if (process.argv.includes('--by-order')) {
      for (const e of PLAIN_ORDERS) {
        const mine = results.filter(r => r.entry === e)
        if (mine.every(r => r.verdict === 'right')) continue
        console.log(`${JSON.stringify(e.say)}${e.army ? ` (${e.army})` : ''}: ${mine.map(r => `${r.map.slice(0, 5)} ${r.verdict}`).join(', ')}`)
      }
    }
    if (process.argv.includes('--misses')) {
      for (const r of results.filter(x => x.verdict === 'wrong' || x.verdict === 'unread')) {
        console.log(`\n[${r.verdict}] ${r.map}/${r.army}: ${JSON.stringify(r.entry.say)}`)
        for (const u of r.read.understood) console.log(`   read: ${u}`)
        for (const q of r.read.questions) console.log(`   asked: ${q.slice(0, 200)}`)
      }
    }
  })
}
