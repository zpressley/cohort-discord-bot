// src/engine/battle/camp.js
//
// The camp (ruled 2026-11-25; docs/DECISIONS.md, "Rulings, November 25,
// 2026 (camps)"). Only in a battle whose spec has `camps`: a battle with
// none never calls anything here, and runs as before.
//
// Each army has one camp. It starts packed up, carried by one of its units
// ("No it's packed up and placed somewhere"), and is pitched where the
// Commander orders: a few tiles (CAMP.RADIUS) about the place. Then:
//   - a night's rest in it gives the army back its wind and its heart for
//     the next day (orchestrator, nightPasses); with no camp pitched there
//     is "no rest tonight";
//   - a unit of its own fighting from inside it has a better defence
//     (CAMP.DEFENSE), and the unit carrying it fights worse (CAMP.BURDEN)
//     and goes at half its pace (CAMP.CARRY_PACE);
//   - while it is carried the whole army sheds wind each ten minutes
//     (CAMP.CARRIED_DRAIN), after a spell of grace for the opening march;
//   - an enemy inside it with no formed unit of its own there burns it at
//     once ("undefended camp gets captures in 1 turn"); defended, it takes
//     CAMP.HITS ticks with an enemy inside before it falls;
//   - broken units of its own run to it, not for the field's edge, stop
//     there, and rally there the more easily ("broken troops would have a
//     place to retreat to");
//   - the unit carrying it breaking or cut down drops it where it stood:
//     either side may then take it, its own to take up, the enemy to burn.
// A burned camp is a blow, not the end: the army fights on without it.
//
// state.camps: side -> {
//   status    'carried' | 'pitched' | 'dropped' | 'burned'
//   carrier   unit id while carried, else null
//   at        the camp's place when pitched or dropped (its middle)
//   tiles     its ground when pitched
//   hits      ticks it has been fought in, defended, since it was pitched
//   pitched   whether it has ever been pitched (the grace is the first march's)
//   tiring    whether its army is shedding wind for it now (told once a spell)
//   lastAt    where its carrier stood last, to drop it there
// }
// state.campSeen: side -> { at, status, turn } what the side knows of the
// enemy's camp: found once a unit of its own has seen it.

const { tileDistance, getUnit, livingUnits, unitsOnSide } = require('../world')
const { samePosition, toPosition } = require('../map/labels')
const { canSee } = require('../map/sight')
const T = require('../combat/tables')
const R = require('../combat/ratings')

const CAMP = T.CAMP

/**
 * The camps of a battle, as its spec gives them, or null when it has none.
 * spec.camps: true (each side's camp carried by its default unit), or
 * { side: { carrier?, at? } }: a carrier named, or a camp already pitched
 * at a place (the other reading of the ruling, and tests).
 */
function createCamps(spec, map) {
  if (!spec.camps) return null
  const sides = [...new Set(spec.units.map(u => u.side))].sort()
  const out = {}
  for (const side of sides) {
    const given = (typeof spec.camps === 'object' ? spec.camps[side] : null) ?? {}
    const units = spec.units.filter(u => u.side === side)
    if (given.at) {
      const at = toPosition(given.at)
      out[side] = { status: 'pitched', carrier: null, at, tiles: campTiles(map, at), hits: 0, pitched: true, tiring: false, lastAt: null }
      continue
    }
    const carrier = units.find(u => u.id === given.carrier)?.id ?? defaultCarrier(units, spec.commanders?.[side]?.unitId)
    out[side] = { status: 'carried', carrier, at: null, tiles: null, hits: 0, pitched: false, tiring: false, lastAt: null }
  }
  return out
}

// Who carries the camp when the Commander names no one: the unit least use
// in the line. Not the unit he rides with, and not horse while there is
// foot; then the least trained, then the fewest men, then by name.
function defaultCarrier(units, commanderUnit = null) {
  const rank = (u) => T.QUALITY_ORDER.indexOf(u.quality)
  const pool = units.filter(u => u.id !== commanderUnit)
  const foot = pool.filter(u => !u.mounted)
  const from = foot.length > 0 ? foot : pool.length > 0 ? pool : units
  return [...from].sort((a, b) => rank(a) - rank(b) || a.strength - b.strength || a.id.localeCompare(b.id))[0]?.id ?? null
}

/** A pitched camp's ground: its middle and the passable tiles about it. */
function campTiles(map, at) {
  const tiles = []
  for (let dy = -CAMP.RADIUS; dy <= CAMP.RADIUS; dy++) {
    for (let dx = -CAMP.RADIUS; dx <= CAMP.RADIUS; dx++) {
      const p = { x: at.x + dx, y: at.y + dy }
      if (!map.inBounds(p) || !map.passable(p) || map.terrainAt(p) === 'river') continue
      tiles.push(p)
    }
  }
  return tiles
}

/** Is a place inside a side's pitched camp? */
function inCamp(camp, position) {
  return Boolean(camp && camp.status === 'pitched' && camp.tiles.some(t => samePosition(t, position)))
}

/** Is this unit inside its own side's pitched camp? */
function inOwnCamp(state, unit) {
  return inCamp(state.camps?.[unit.side], unit.position)
}

/** Does this unit carry its side's camp? */
function carries(state, unit) {
  const camp = state.camps?.[unit.side]
  return Boolean(camp && camp.status === 'carried' && camp.carrier === unit.id)
}

/**
 * Where a unit with a pitch or strike order goes this tick: the camp, to
 * take it up; or, carrying it, the place to pitch it. Null: nowhere (the
 * camp is burned, or another of its units has it).
 */
function campWay(state, unit, order) {
  const camp = state.camps?.[unit.side]
  if (!camp || camp.status === 'burned') return null
  if (camp.status === 'carried') {
    if (camp.carrier !== unit.id) return null
    return order.action === 'pitch' && order.target ? order.target : unit.position
  }
  return camp.at
}

// Close enough to the camp to take it up: on it, or beside where it lies.
const atTheCamp = (camp, position) => camp.at && tileDistance(camp.at, position) <= Math.max(1, CAMP.RADIUS)

/**
 * At the tick's end, after the march: the camp taken up and pitched by
 * those ordered to. Changes the order book: a camp pitched, or taken up on
 * a strike order, leaves the unit holding.
 */
function settleCampOrders(state, { turn, log, broken, movement }) {
  const { world } = state
  const HOLD = { action: 'hold', target: null, then: null }
  for (const unit of [...livingUnits(world)].sort((a, b) => a.id.localeCompare(b.id))) {
    const order = state.orderBook.get(unit.id)
    if (!order || (order.action !== 'pitch' && order.action !== 'strike') || broken.has(unit.id)) continue
    const camp = state.camps?.[unit.side]
    if (!camp || camp.status === 'burned' || (camp.status === 'carried' && camp.carrier !== unit.id)) {
      state.orderBook.set(unit.id, { ...HOLD })
      continue
    }
    // Told to pitch it where it stands pitched already: done. (An order on
    // the road may arrive after the camp was pitched by the one before it.)
    if (order.action === 'pitch' && camp.status === 'pitched' && (!order.target || tileDistance(order.target, camp.at) <= CAMP.RADIUS)) {
      state.orderBook.set(unit.id, { ...HOLD })
      continue
    }
    if (camp.status !== 'carried') {
      if (!atTheCamp(camp, unit.position)) continue
      const from = { ...camp.at }
      Object.assign(camp, { status: 'carried', carrier: unit.id, at: null, tiles: null, hits: 0, lastAt: { ...unit.position } })
      log.emit('campStruck', turn, { side: unit.side, unitId: unit.id, at: from })
      if (order.action === 'strike') { state.orderBook.set(unit.id, { ...HOLD }); continue }
    }
    if (order.action !== 'pitch') { state.orderBook.set(unit.id, { ...HOLD }); continue }
    const target = order.target ?? unit.position
    const move = movement.find(m => m.unitId === unit.id)
    // Where it was told, or as near as it could get: a place no way leads
    // to, and it pitches where it stands.
    if (!samePosition(target, unit.position) && move?.failed !== 'no path') continue
    pitch(state, camp, unit, turn, log)
    state.orderBook.set(unit.id, { ...HOLD })
  }
  for (const camp of Object.values(state.camps ?? {})) {
    if (camp.status !== 'carried') continue
    const carrier = getUnit(world, camp.carrier)
    if (carrier) camp.lastAt = { ...carrier.position }
  }
}

function pitch(state, camp, unit, turn, log) {
  const at = { ...unit.position }
  Object.assign(camp, { status: 'pitched', carrier: null, at, tiles: campTiles(state.map, at), hits: 0, pitched: true, tiring: false })
  log.emit('campPitched', turn, { side: unit.side, unitId: unit.id, at: { ...at } })
}

/**
 * Engagements fought from inside a camp, or by the unit carrying it: the
 * edge each side of the fight has (combat/resolve.js reads aCampDefense,
 * aBurden and their b twins).
 */
function markEngagements(state, engagements) {
  for (const e of engagements) {
    for (const [key, id] of [['a', e.aId], ['b', e.bId]]) {
      const unit = getUnit(state.world, id)
      if (!unit) continue
      if (inOwnCamp(state, unit)) e[`${key}CampDefense`] = CAMP.DEFENSE
      if (carries(state, unit)) e[`${key}Burden`] = CAMP.BURDEN
    }
  }
}

/**
 * At the tick's end, after the fighting: a carrier broken or gone drops
 * the camp; an enemy inside a camp burns it (at once if no one defends it,
 * after CAMP.HITS ticks if someone does); and armies whose camp is on the
 * move, or burned, shed wind.
 */
function stepCamps(state, { turn, log, broken, resolver }) {
  const { world } = state
  const formed = (u) => u.strength > 0 && !broken.has(u.id)
  for (const side of Object.keys(state.camps).sort()) {
    const camp = state.camps[side]
    if (camp.status === 'carried') {
      const carrier = getUnit(world, camp.carrier)
      if (!carrier || carrier.strength <= 0 || broken.has(carrier.id)) {
        const at = carrier && carrier.strength > 0 ? { ...carrier.position } : camp.lastAt
        if (at) {
          Object.assign(camp, { status: 'dropped', carrier: null, at: { ...at }, tiles: null })
          log.emit('campDropped', turn, { side, unitId: carrier?.id ?? null, at: { ...at } })
        }
      }
    }
    if (camp.status === 'pitched' || camp.status === 'dropped') {
      const ground = camp.status === 'pitched' ? camp.tiles : [camp.at]
      const on = (u) => ground.some(t => samePosition(t, u.position))
      const inside = livingUnits(world).filter(u => u.side !== side && formed(u) && on(u)).sort((a, b) => a.id.localeCompare(b.id))
      if (inside.length > 0) {
        // A dropped camp is defended by a formed unit of its own beside it.
        const guard = camp.status === 'pitched'
          ? unitsOnSide(world, side).filter(u => formed(u) && on(u))
          : unitsOnSide(world, side).filter(u => formed(u) && tileDistance(u.position, camp.at) <= 1)
        if (guard.length === 0) burn(state, camp, side, inside[0], true, turn, log)
        else {
          camp.hits += 1
          if (camp.hits >= CAMP.HITS) burn(state, camp, side, inside[0], false, turn, log)
          else log.emit('campAssailed', turn, { side, by: inside[0].id, hits: camp.hits, of: CAMP.HITS, at: { ...camp.at } })
        }
      }
    }
    // Wind shed for it: while it is carried or lies dropped (after the
    // first march's grace), and once it is burned (CAMP.BURNED_DRAIN).
    const minutes = state.turn * 10
    // (Dropped is as carried: not pitched, and none of the grace left.)
    const carrying = (camp.status === 'carried' || camp.status === 'dropped') && (camp.pitched || minutes > CAMP.GRACE_MINUTES)
    const drain = carrying ? CAMP.CARRIED_DRAIN : camp.status === 'burned' ? CAMP.BURNED_DRAIN : 0
    if (drain > 0) {
      for (const unit of unitsOnSide(world, side)) if (unit.strength > 0) resolver.tire(unit, drain)
      if (carrying && !camp.tiring) log.emit('campTiring', turn, { side })
    }
    camp.tiring = carrying
    // Its army with no steady unit left, holding out by its standing camp
    // (holdsOut): both sides are told, once a spell, what is left to do.
    const holding = holdsOut(state, side) && !unitsOnSide(world, side).some(u => formed(u) && !state.isShaken(u))
    if (holding && !camp.holdingOut) log.emit('campHoldsOut', turn, { side, at: camp.at ? { ...camp.at } : null })
    camp.holdingOut = holding
  }
}

function burn(state, camp, side, by, undefended, turn, log) {
  const at = { ...camp.at }
  Object.assign(camp, { status: 'burned', carrier: null, tiles: null })
  log.emit('campBurned', turn, { side, by: by.id, undefended, at })
}

/**
 * Where a broken unit runs: to its own camp, if it is pitched (a test for a
 * tile of it), else null (for the field's edge, as before).
 */
function refugeOf(state, unit) {
  const camp = state.camps?.[unit.side]
  if (!camp || camp.status !== 'pitched') return null
  return (p) => inCamp(camp, p)
}

/**
 * What each side has found of the enemy's camp, after the tick: one of its
 * formed units in sight of it (of a tile of it, or of where it lies, or of
 * the unit carrying it). A burned camp is known to both at once (the owner
 * sees the flames; those who burned it are there). Logs campFound the
 * first time a side finds it, and when it finds it somewhere new.
 */
function seeCamps(state, { turn, log, broken }) {
  const { world, map } = state
  state.campSeen ??= {}
  for (const side of Object.keys(state.camps).sort()) {
    for (const other of Object.keys(state.camps).sort()) {
      if (other === side) continue
      const camp = state.camps[other]
      const known = state.campSeen[side] ?? null
      if (camp.status === 'burned') {
        if (known?.status !== 'burned') state.campSeen[side] = { at: camp.at ? { ...camp.at } : known?.at ?? null, status: 'burned', turn }
        continue
      }
      const spot = camp.status === 'carried' ? getUnit(world, camp.carrier)?.position : camp.at
      if (!spot) continue
      const watchers = unitsOnSide(world, side).filter(u => u.strength > 0 && !broken.has(u.id))
      const ground = camp.status === 'pitched' ? camp.tiles : [spot]
      const by = watchers.find(w => ground.some(t => canSee(map, w, { position: t })))
      if (!by) {
        // Gone from where it was seen (taken up and carried off): forgotten
        // once one of its units stands where it was.
        if (known && known.status !== 'carried' && camp.status === 'carried' && watchers.some(w => tileDistance(w.position, known.at) <= 1)) delete state.campSeen[side]
        continue
      }
      const moved = !known || known.status !== camp.status || !samePosition(known.at, spot)
      state.campSeen[side] = { at: { ...spot }, status: camp.status, turn }
      if (moved && camp.status !== 'carried') log.emit('campFound', turn, { side, unitId: by.id, of: other, status: camp.status, at: { ...spot } })
    }
  }
}

/**
 * A night passes (orchestrator, nightPasses). An army with its camp pitched
 * rests in it: wind back (CAMP.REST_WIND of what each unit can spend) and
 * heart back to where it began (CAMP.REST_HEART), and its broken units come
 * back to the standards and form up. An army with no camp pitched (carried,
 * dropped or burned) has no rest: nothing comes back. Returns side ->
 * { rested, why ('pitched', or the camp's status), wind (its share of
 * wind as night fell) }.
 */
function nightRest(state) {
  const out = {}
  for (const side of Object.keys(state.camps).sort()) {
    const camp = state.camps[side]
    const rested = camp.status === 'pitched'
    // Its wind as night falls: the share of what its units can spend.
    const units = unitsOnSide(state.world, side).filter(u => u.strength > 0)
    const pool = units.reduce((sum, u) => sum + R.staminaPool(u), 0)
    const left = units.reduce((sum, u) => sum + (state.resolver.getState(u.id)?.stamina ?? R.staminaPool(u)), 0)
    out[side] = { rested, why: camp.status, wind: pool ? Math.round(100 * left / pool) / 100 : null }
    if (!rested) continue
    for (const unit of unitsOnSide(state.world, side)) {
      if (unit.strength <= 0) continue
      state.resolver.rest(unit, CAMP.REST_WIND, CAMP.REST_HEART)
      if (state.broken.has(unit.id)) {
        state.broken.delete(unit.id)
        state.resolver.rally(unit)
        state.orderBook.delete(unit.id)
      }
    }
    // A free Commander whose unit is down to COMMANDER.THRESHOLD of its men
    // or fewer rides out at first light with the strongest unit he has
    // (most of its men left, then the best trained): he chooses afresh in
    // camp, where before he was taken one battle in five, mostly riding
    // with a unit fought down on the day before (docs/DECISIONS.md, "How
    // camps were built", round 7). The log says so (commanderRode).
    const c = state.commanders?.[side]
    if (c?.status === 'free') {
      const share = (u) => u.strength / (state.mustered.get(u.id) || u.strength || 1)
      const his = units.find(u => u.id === c.unitId)
      if (his && share(his) <= T.COMMANDER.THRESHOLD) {
        const rank = (u) => T.QUALITY_ORDER.indexOf(u.quality)
        const best = units.filter(u => u.id !== camp.carrier)
          .sort((a, b) => share(b) - share(a) || rank(b) - rank(a) || a.id.localeCompare(b.id))[0]
        if (best && best.id !== his.id && share(best) > share(his)) {
          out[side].rode = { from: his.id, to: best.id }
          c.unitId = best.id
        }
      }
    }
  }
  return out
}

/**
 * Is an army with no steady unit left still in the battle? In a camp
 * battle, yes while its camp is pitched and it has men left on the field:
 * its broken units run there, rally, and rest there at night. Burn the
 * camp, or cut them down, and it is beaten.
 */
function holdsOut(state, side) {
  const camp = state.camps?.[side]
  return Boolean(camp && camp.status === 'pitched' && unitsOnSide(state.world, side).some(u => u.strength > 0))
}

/**
 * Is a Commander riding with this unit safe from being taken? In a camp
 * battle: among his own tents (the unit inside its own pitched camp); and
 * once his army has no steady unit left and holds out by its camp, for he
 * rides back to it ahead of his running men, as in a battle with no camp he
 * would leave the field with them (docs/DECISIONS.md, "How camps were
 * built", round 7); and once his own unit breaks, for the same reason
 * (round 8). When the camp falls, the battle is lost.
 */
function sheltered(state, unit) {
  if (inOwnCamp(state, unit)) return true
  if (!holdsOut(state, unit.side)) return false
  // His own men broken, with the camp standing: he rides back to it ahead
  // of them, as they run for it (round 8: he was caught running twice as
  // often as in a pitched battle, where his men run off the field).
  if (state.broken.has(unit.id)) return true
  return !unitsOnSide(state.world, unit.side).some(u => u.strength > 0 && !state.broken.has(u.id) && !state.isShaken(u))
}

/** A side's own camp and what it knows of the enemy's, as plain data. */
function campsView(state, side) {
  if (!state.camps) return null
  const own = state.camps[side]
  const seen = state.campSeen?.[side] ?? null
  return {
    own: own ? { status: own.status, carrier: own.carrier, at: own.at ? { ...own.at } : null, tiles: own.tiles?.map(t => ({ ...t })) ?? null, hits: own.hits, of: CAMP.HITS } : null,
    enemy: seen ? { status: seen.status, at: seen.at ? { ...seen.at } : null, turn: seen.turn } : null
  }
}

module.exports = {
  createCamps, defaultCarrier, campTiles, inCamp, inOwnCamp, carries, campWay,
  settleCampOrders, markEngagements, stepCamps, refugeOf, seeCamps, nightRest, campsView, holdsOut, sheltered
}
