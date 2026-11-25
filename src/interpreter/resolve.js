// src/interpreter/resolve.js
//
// Turn intents (words for which units, words for where) into engine orders
// (unit ids and map positions), or into questions for the player.
// Deterministic and AI-free: whether the intent came from the fixed grammar
// or from the AI, this step decides what it means on the actual battlefield.
//
// Context, all from one side's own point of view:
//   { map, units: [own living, unbroken units] }
//
// Places may be a grid reference ("C7", "C7-NE": the ruled player grid of
// 100 m squares), a landmark's name, or a description of the ground ("the
// ridge to the east"), resolved from where the ordered units stand.

const { resolveUnitReference } = require('../engine/movement/unitResolver')
const ranged = require('../engine/combat/ranged')
const { orderWords, OWN_EDGE, HOLD_THERE, RIDE_WITH: RIDE_WORDS, RIDER } = require('../narrator/words')
const { RIDE } = require('../engine/combat/tables')
const { matchesKind, edgeTarget } = require('../engine/battle/battle')
const { KINDS } = require('./grammar')
const { gradeOf, MAX_STEPS, loyaltyBand } = require('../engine/command/officers')
const { findPlace, DIRECTIONS, TILE_METRES } = require('../engine/map/places')
const { isGridRef, gridTarget, gridLabel } = require('../engine/map/grid')
const { coverFor } = require('../engine/battle/hiding')
const { ORDERS_READ, PLACE, KIT, FOLLOW_WORDS, GROUND } = require('../narrator/words')
const { lettersApart } = require('./grammar')
const { detectFeatures } = require('../engine/map/features')
const { compassWord, KIND_WORDS: GROUND_KIND_WORDS } = require('../engine/map/places')
const { unitsByKind, enemiesByKind } = require('./kinds')
const { CAMP: CAMP_WORDS } = require('../narrator/words')

// The extra parts of an order the engine reads (Stage 3), carried through
// unchanged when set.
const EXTRAS = ['careful', 'against', 'letPass', 'regardless', 'holdFire']

// ── An enemy named in an attack ────────────────────────
//
// "their archers", "the enemy horse", "swords": which of the enemy units this
// side has seen (context.enemies, its intel: in sight or last seen) the
// words mean. Only those: an enemy never seen cannot be named, and the true
// field is never looked at. "archers at E5" picks the one seen nearest E5.

const AT_SQUARE = /\s+(?:at|in|on|near|by)\s+(\S+)$/i
// "the enemy at the bridge", "troops by the Old Mill": a place by name or
// by the ground, for an enemy whose kind he has not been told.
const AT_PLACE = /(?:^|\s+)(?:at|in|on|upon|near|by)\s+(.+)$/i
// "The enemy on the hill" is an enemy he has seen within this many tiles
// (150 m) of the place; with none there, his men go to the place and fight
// whoever they find (docs/REVIEW-2026-11.md, S3 and S12).
const THERE_TILES = 6
const sansSide = (id) => String(id).replace(/^(?:red|blue)_/, '').replace(/_/g, ' ')
// What he may call a seen enemy: its kind's name, or what the reports of it
// let him call it (`name`: "troops", when no report told its kind).
const calledBy = (enemy) => enemy.name ?? sansSide(enemy.id)

// Is this seen enemy of that kind? By what was seen of it when the intel
// says (role, mounted, weapon); else by its name.
function looksLike(enemy, kind) {
  if ('role' in enemy || 'mounted' in enemy) return matchesKind({ id: enemy.id, role: enemy.role, mounted: enemy.mounted, primaryWeapon: enemy.primaryWeapon }, kind)
  const words = KINDS.find(([k]) => k === kind)?.[1]
  return Boolean(words && words.test(calledBy(enemy)))
}

function seenWhere(enemy) {
  const square = gridLabel(enemy.position, { quarter: true })
  return enemy.status === 'visible' ? `in sight at ${square}` : `last seen at ${square}`
}

/**
 * @param {string} words  what the Commander called the enemy ("archers")
 * @param {Array} enemies  his side's intel
 * @returns {{ enemy } | { question, choice? }}
 */
function resolveEnemy(words, enemies, map, placeOf = null) {
  const seen = (enemies ?? []).filter(e => e.position && (e.strength === undefined || e.strength > 0))
  let ref = String(words).trim()
  let near = null
  // The place, as his own orders would find it ("the hill" is the ground to
  // fight for), when the caller can say: { position, description, words }.
  let placeAt = null
  const at = ref.match(AT_SQUARE)
  if (at && isGridRef(at[1])) {
    const square = gridTarget(map, at[1])
    if (!square.none) near = square.position
    ref = ref.slice(0, at.index).trim()
  } else if (map) {
    const there = ref.match(AT_PLACE)
    const own = there && placeOf ? placeOf(there[1]) : null
    if (own?.position) placeAt = { ...own, words: clean(there[1]) }
    // (The ground nearest the enemy he has seen: "the woods" they are in.)
    const mid = seen.length ? { x: Math.round(seen.reduce((n, e) => n + e.position.x, 0) / seen.length), y: Math.round(seen.reduce((n, e) => n + e.position.y, 0) / seen.length) } : { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) }
    const place = placeAt ?? (there ? findPlace(map, mid, there[1]) : null)
    if (place?.position) {
      near = place.position
      ref = ref.slice(0, there.index).trim()
    }
  }
  // "attack the enemy at the bridge": whichever enemy he has seen is nearest.
  const bare = ref === '' || /^(?:troops|men|enemy|enemies|foe|foes|them)$/i.test(ref)
  // "their skirmishers": by the kind his Army tab would show them as, as
  // the reports of them tell it; else by the older, wider kinds.
  // (A seen enemy called by its own name, "their spears", keeps it.)
  const byName = resolveUnitReference(ref, seen.map(e => ({ ...e, aliases: [calledBy(e)] })))
  const shown = ['id', 'alias'].includes(byName.matchedBy) ? byName.units : enemiesByKind(ref, seen)
  const kind = shown ? null : KINDS.find(([, pattern]) => pattern.test(ref))?.[0] ?? null
  const anyone = /^(?:everyone|everybody|all|army|the army)$/i.test(ref)
  // "swordsmen" for the enemy swords, "spearmen" for their spears.
  const stem = (w) => w.toLowerCase().replace(/s$/, '')
  const byStem = () => seen.filter(e => calledBy(e).split(' ').some(w => w.length > 3 && stem(ref).startsWith(stem(w))))
  const named = () => {
    const found = resolveUnitReference(ref, seen.map(e => ({ ...e, aliases: [calledBy(e)] }))).units
    return found.length > 0 ? found : byStem()
  }
  let matches = shown ?? (kind ? seen.filter(e => looksLike(e, kind)) : bare && near ? seen : anyone ? [] : named())
  if (bare && near && ref === '') ref = 'enemy'
  // "The enemy on the hill": those he has seen there. With none, the place
  // itself, to go and fight whoever holds it.
  if (bare && placeAt) {
    matches = matches.filter(e => Math.max(Math.abs(e.position.x - placeAt.position.x), Math.abs(e.position.y - placeAt.position.y)) <= THERE_TILES)
    if (matches.length === 0) return { place: placeAt }
  }
  if (matches.length === 0) {
    if (seen.length === 0) return { question: `You have seen no enemy to attack. To go and find them, say "advance".` }
    return {
      question: `None of the enemy you have seen is "${ref}". You have seen: ` +
        seen.map(e => `${e.id} (${seenWhere(e)})`).join(', ') + '.'
    }
  }
  let pick = matches
  if (near && matches.length > 1) {
    const d = (e) => Math.max(Math.abs(e.position.x - near.x), Math.abs(e.position.y - near.y))
    const best = Math.min(...matches.map(d))
    pick = matches.filter(e => d(e) === best)
  }
  if (pick.length === 1) return { enemy: pick[0] }
  const question = `Which ${ref} do you mean? You have seen ${pick.length}: ` + pick.map(e => `${e.id} (${seenWhere(e)})`).join(', ') + '.'
  return {
    question,
    choice: {
      question,
      place: ref,
      options: pick.map(e => {
        const square = gridLabel(e.position, { quarter: true })
        // `enemy` and `seen`: so the web app can label each choice by the
        // enemy's own name (two "horse archers" may be horse archers and
        // light horse); it takes them off before the browser sees them.
        return { label: `${ref} ${seenWhere(e)}`, square, text: `${ref} at ${square}`, enemy: e.id, seen: seenWhere(e) }
      })
    }
  }
}

// Where a unit falling back toward home will stop (review item L11): the
// engine's own home target (battle.edgeTarget), each unit straight back to
// its side's edge of the field. Without the side's edge, the words alone.
function withdrawHomeWords(map, units, homeEdge, careful) {
  const order = { action: 'withdraw', careful }
  if (!homeEdge) return orderWords('say', order, OWN_EDGE) + `, ${HOLD_THERE}`
  const stops = units.map(u => ({ unit: u, at: edgeTarget(map, u.position, homeEdge) }))
  const metres = stops.map(s => Math.max(Math.abs(s.at.x - s.unit.position.x), Math.abs(s.at.y - s.unit.position.y)) * TILE_METRES)
  const squares = [...new Set(stops.map(s => gridLabel(s.at, { quarter: true })))]
  const far = Math.min(...metres) === Math.max(...metres) ? `${metres[0]} m` : `${Math.min(...metres)} to ${Math.max(...metres)} m`
  return orderWords('say', order, `${OWN_EDGE} at ${squares.join(', ')}, ${far} ${homeEdge}`) + `, ${HOLD_THERE}`
}

// How well a unit will hide there, in words for the read-back: the engine's
// own table (battle/hiding.js), so the player hears what the engine will do.
function coverWords(map, unit, position) {
  const cover = coverFor(map, { ...unit, position })
  if (cover.seenWithin === null) return `${cover.words}; it cannot hide there`
  const seen = cover.seenWithin === 0
    ? 'hidden from anyone who does not search'
    : `seen only within ${cover.seenWithin * 25} m`
  const cost = cover.cost?.staminaPerTurn ? ', but tiring' : ''
  return `${cover.words}: ${seen}${cost}`
}

// The read-back for an ambush's terms.
function ambushTerms(intent) {
  const parts = [intent.against ? `striking ${intent.against}` : 'striking anything that passes']
  if (intent.letPass) parts.push(`letting ${intent.letPass} pass first`)
  parts.push(intent.regardless ? 'whatever happens' : 'only if they come marching')
  return parts.join(', ')
}

// Where a group stands, for "the ridge to the east" said to several units:
// the unit nearest the group's middle, so the reference is read from a real
// position on the field.
function groupOrigin(units) {
  const cx = units.reduce((s, u) => s + u.position.x, 0) / units.length
  const cy = units.reduce((s, u) => s + u.position.y, 0) / units.length
  let best = units[0]
  let bestD = Infinity
  for (const u of units) {
    const d = (u.position.x - cx) ** 2 + (u.position.y - cy) ** 2
    if (d < bestD) { best = u; bestD = d }
  }
  return best.position
}

// "200 m north", "100 metres to the south-east": a distance and a compass
// direction from where the unit stands.
const RELATIVE = /^(?:about\s+|some\s+)?(\d{1,4})\s*(?:m|metres?|meters?|paces|yards?)\s+(?:to the\s+|due\s+)?(north[- ]?east|north[- ]?west|south[- ]?east|south[- ]?west|north|south|east|west)(?:\s+of (?:here|there|their position|its position))?$/i

function parseRelative(words) {
  const match = String(words).trim().match(RELATIVE)
  if (!match) return null
  const direction = match[2].toLowerCase().replace(/\s+/, '-').replace(/^(north|south)(east|west)$/, '$1-$2')
  const degrees = DIRECTIONS[direction]
  const tiles = Math.max(1, Math.round(Number(match[1]) / TILE_METRES))
  const rad = degrees * Math.PI / 180
  // Map rows run south as y grows, so north is -y.
  return { dx: Math.round(Math.cos(rad) * tiles), dy: -Math.round(Math.sin(rad) * tiles), words: `${tiles * TILE_METRES} m ${direction}` }
}

// The passable tile nearest a point (the point itself if it will do), kept
// on the map.
function nearestPassable(map, point) {
  const clamp = { x: Math.max(0, Math.min(map.width - 1, point.x)), y: Math.max(0, Math.min(map.height - 1, point.y)) }
  for (let r = 0; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
      const p = { x: clamp.x + dx, y: clamp.y + dy }
      if (map.inBounds(p) && map.passable(p)) return p
    }
  }
  return null
}

function resolvePlace(map, origin, words, known = {}) {
  let text = String(words).trim()
  // "200 m back": toward his own edge of the field.
  const back = text.match(/^(\d{1,4}) m back$/i)
  if (back) {
    if (!known.homeEdge) return { question: ORDERS_READ.noEdge }
    text = `${back[1]} m ${known.homeEdge}`
  }
  // A camp battle's camps: his own, and the enemy's if his men have found it.
  const camp = campPlace(text, known)
  if (camp) return camp
  // The ground to fight for, one of his own units, a name loosely written.
  const wide = widePlace(map, origin, text, known)
  if (wide) return wide
  const relative = parseRelative(text)
  if (relative) {
    const position = nearestPassable(map, { x: origin.x + relative.dx, y: origin.y + relative.dy })
    if (!position) return { question: `There is no ground to stand on ${relative.words} of there.` }
    return { position, description: relative.words, relative }
  }
  if (isGridRef(text)) {
    const square = gridTarget(map, text)
    if (square.none) return { question: `${square.none}.` }
    return { position: square.position, description: square.label }
  }
  const found = findPlace(map, origin, text)
  if (found.position) return { position: found.position, description: sayName(found.description, found.feature) }
  if (found.question) {
    // Each choice says what to write instead, so the player can pick one
    // rather than retype the order: a named place by its name, any other by
    // its grid square.
    return {
      question: found.options.reduce((q, o) => (o.feature?.name ? q.split(o.feature.name).join(PLACE.name(o.feature.name)) : q), found.question),
      options: found.options.map(o => ({
        label: sayName(o.description, o.feature),
        square: gridLabel(o.position, { quarter: true }),
        text: o.feature?.name ?? gridLabel(o.position, { quarter: true })
      }))
    }
  }
  return { question: `I can't place "${text}": ${found.none}. Try the ground (the ridge to the east, the clearing) or a grid square like C7.` }
}

// "the camp", "our camp", "their camp": a camp battle's camps as his side
// knows them (known.camps: sideView's camps, { own, enemy }). Null for any
// other words, or a battle with no camps.
const OUR_CAMP_WORDS = /^(?:the |our |your |my )?camp$/i
const THEIR_CAMP_WORDS = /^(?:the enemy'?s? |their |enemy |the enemy )camp$/i
function campPlace(text, known) {
  const camps = known.camps
  if (!camps) return null
  if (OUR_CAMP_WORDS.test(text)) {
    const own = camps.own
    if (!own || own.status === 'burned') return { question: CAMP_WORDS.noneOurs }
    if (own.status === 'carried') return { question: CAMP_WORDS.carriedBy(own.carrier) }
    return { position: { ...own.at }, description: CAMP_WORDS.ours }
  }
  if (THEIR_CAMP_WORDS.test(text)) {
    const theirs = camps.enemy
    if (!theirs?.at) return { question: CAMP_WORDS.notFound }
    if (theirs.status === 'burned') return { question: CAMP_WORDS.burnedTheirs }
    return { position: { ...theirs.at }, description: CAMP_WORDS.theirs }
  }
  return null
}

// Pitching or striking the camp (a camp battle's): who does it, and where.
// With no one named, the unit carrying it; else his unit nearest it. A
// camp burned is no camp; one carried cannot be struck again.
function resolveCampWork(intent, units, context, known) {
  const own = known.camps?.own
  if (!own) return { question: 'There are no camps in this battle.' }
  if (own.status === 'burned') return { question: CAMP_WORDS.noneOurs }
  let match = intent.unitRef === 'everyone' ? null : resolveUnitsWide(intent.unitRef, units, {})
  if (match && match.units.length === 0) return { question: `Who do you mean by "${match.unknown ?? intent.unitRef}"? Your units: ${units.map(u => u.id).join(', ')}.` }
  let unit
  if (!match) {
    unit = own.status === 'carried'
      ? units.find(u => u.id === own.carrier)
      : [...units].sort((a, b) => Math.max(Math.abs(a.position.x - own.at.x), Math.abs(a.position.y - own.at.y)) - Math.max(Math.abs(b.position.x - own.at.x), Math.abs(b.position.y - own.at.y)) || a.id.localeCompare(b.id))[0]
    if (!unit) return { question: 'None of your units can reach the camp.' }
  } else unit = match.units[0]
  if (intent.action === 'strike' && own.status === 'carried') return { question: CAMP_WORDS.carriedBy(own.carrier) }
  let target = null
  let where = null
  if (intent.place) {
    const place = resolvePlace(context.map, unit.position, intent.place, known)
    if (place.question) return { question: place.question, ...(place.options ? { choice: { question: place.question, place: intent.place, options: place.options } } : {}) }
    target = place.position
    where = `${place.description} (${gridLabel(target, { quarter: true })})`
  } else if (intent.action === 'pitch') {
    target = { ...unit.position }
    where = `where they stand (${gridLabel(target, { quarter: true })})`
  }
  const order = { unitRef: unit.id, action: intent.action, ...(target ? { target: { ...target } } : {}) }
  return { order, understood: `${unit.id}: ${orderWords('say', { action: intent.action }, where, { relative: !intent.place })}` }
}

/**
 * @param {Array} intents   from grammar.parseLine or the AI reader
 * @param {Object} context  { map, units }
 * @returns {{ orders: Array, questions: Array<string>, notes: Array<string>, choices: Array, surrender: boolean, understood: Array<string> }}
 *   notes: things the reader wants the player to know that do not stop the
 *   orders (for example a second step it could not record).
 *   choices: for a question with answers to pick from, { question, place,
 *   options: [{ label, text }] }: write option.text in place of the words
 *   `place` and read the order again.
 *   orders are engine orders: { unitRef: unitId, action, target?, then? };
 *   understood is a plain read-back for the player ("spears: defend the
 *   clearing 75 m south").
 */
function resolveIntents(intents, context) {
  const { map, units } = context
  const orders = []
  const questions = []
  const notes = []
  const choices = []
  const understood = []
  const counsel = []
  let surrender = false
  // How long a rider takes to each unit named (context.messengers, from
  // engine/command/messengers.js): said after the order, in the app's words.
  let riding = null
  const carried = (ids) => {
    const minutes = context.messengers ? context.messengers(ids, riding) : null
    if (!minutes) return ''
    const said = RIDER.readBack(ids.map(id => minutes[id] ?? 0), ids)
    return said ? `. ${said}` : ''
  }

  // The units named in this set of orders: "everyone else" is the rest.
  const named = namedIn(intents, units, context.named)
  // What places may be said by: his own edge, the ground to fight for, his
  // own units.
  let known = { homeEdge: context.homeEdge, ground: context.ground, groundNeeded: context.groundNeeded ?? null, units: context.allOwn ?? units, ...(context.camps ? { camps: context.camps } : {}) }

  // The units working the camp in these orders (pitch, strike): "everyone"
  // in another line does not take them off it.
  const campWork = known.camps ? intents.filter(i => i.kind === 'order' && (i.action === 'pitch' || i.action === 'strike'))
    .map(i => resolveCampWork(i, units, context, known).order).filter(Boolean) : []
  const campWorkers = new Set(campWork.map(o => o.unitRef))
  // ... and where it is being pitched is "the camp" for the other lines:
  // "pitch the camp here, everyone guard the camp".
  const pitching = campWork.find(o => o.action === 'pitch' && o.target)
  const campKnown = pitching ? { ...known, camps: { ...known.camps, own: { ...known.camps.own, status: 'pitched', at: { ...pitching.target } } } } : known
  const campBase = known
  known = campKnown

  for (let intent of intents) {
    if (intent.kind === 'surrender') { surrender = true; continue }
    if (intent.kind === 'ask') {
      // Too long or tangled to read at all (grammar.js, MAX_DEPTH).
      if (intent.tangled) { questions.push(ORDERS_READ.tangled(examples((context.units ?? [])[0], context))); continue }
      if (intent.unread) {
        const said = notRead(intent.unread, context)
        questions.push(said.question)
        if (said.choice) choices.push(said.choice)
      } else questions.push(intent.question)
      continue
    }
    if (intent.kind === 'note') { notes.push(intent.note); continue }
    if (intent.kind === 'ride') {
      const ride = resolveRide(intent, context)
      if (ride.question) { questions.push(ride.question); continue }
      orders.push({ ride: ride.unitId })
      riding = ride.unitId
      understood.push(`You: ${RIDE_WORDS.say} ${ride.unitId}`)
      continue
    }
    if (intent.kind !== 'order') continue

    // Pitching or striking the camp: one unit, the resolver's choice when
    // no one is named (resolveCampWork).
    if (intent.action === 'pitch' || intent.action === 'strike') {
      const work = resolveCampWork(intent, units, context, campBase)
      if (work.question) {
        questions.push(work.question)
        if (work.choice) choices.push(work.choice)
        continue
      }
      orders.push(work.order)
      understood.push(work.understood + carried([work.order.unitRef]))
      continue
    }

    let match = intent.unitIds
      ? { units: units.filter(u => intent.unitIds.includes(u.id)) }
      : resolveUnitsWide(intent.unitRef, units, { named })
    if (match.othersAlone) {
      questions.push(ORDERS_READ.othersAlone(intent.unitRef, `${units[0]?.id ?? 'spears'} advance, ${intent.unitRef} hold`))
      continue
    }
    // "Spring the trap" with no one named: the units lying in wait, and no
    // one else. (A caller that does not say who is lying in wait gets the
    // old reading: everyone.)
    if (intent.spring && !intent.unitIds && intent.unitRef === 'everyone' && context.lyingInWait) {
      match = { units: units.filter(u => context.lyingInWait.includes(u.id)) }
      if (match.units.length === 0) {
        questions.push('None of your units is lying in wait, so there is no trap to spring. To attack, name the units: "spears advance".')
        continue
      }
    }
    if (campWorkers.size && /^everyone/.test(intent.unitRef ?? '') && !intent.unitIds) match = { ...match, units: match.units.filter(u => !campWorkers.has(u.id)) }
    if (match.units.length === 0) {
      questions.push(`Who do you mean by "${match.unknown ?? intent.unitRef}"? Your units: ${units.map(u => u.id).join(', ')}.`)
      continue
    }

    // "Cover the legionaries", "guard the hastati": keeping with a unit of
    // his own, which no order does.
    const guarding = intent.action === 'defend' && intent.place && !intent.steps &&
      (['id', 'alias', 'name'].includes(resolveUnitReference(intent.place, known.units).matchedBy) || Boolean(unitsByKind(intent.place, known.units)))
    // Orders the engine has no order for, and skirmishing and throwing: a
    // question with what he can do instead, or what the engine does.
    const widened = resolveWidened(guarding ? { ...intent, action: 'follow', friendRef: intent.place, keep: 'beside', guard: true, said: intent.said ?? null } : intent, match.units, { ...context, known })
    if (widened) {
      if (widened.question) {
        questions.push(widened.question)
        if (widened.choice) choices.push(widened.choice)
        continue
      }
      orders.push(...widened.orders)
      understood.push(widened.understood + carried(widened.orders.map(o => o.unitRef)))
      counsel.push(...counselFor(match.units, units, { clauses: widened.clauses ?? 0, action: intent.action === 'follow' || guarding ? 'follow' : 'advance', plain: widened.understood, shaken: context.shaken ?? [] }))
      continue
    }

    // "Shoot" and "hold fire" are for missile troops. With no one named they
    // are for all of them; a unit named that has nothing to shoot with is a
    // question, not an order quietly dropped.
    if (intent.fire) {
      const shooters = match.units.filter(u => ranged.missileRange(u) > 0)
      const others = match.units.filter(u => !shooters.includes(u))
      // Javelins and pila are thrown as men come to blows: said so, with
      // the orders that do it.
      if (shooters.length === 0 && !intent.holdFire) {
        const thrown = throwQuestion(intent, match.units)
        questions.push(thrown.question)
        if (thrown.choice) choices.push(thrown.choice)
        continue
      }
      if (shooters.length === 0 || (others.length > 0 && intent.unitRef !== 'everyone')) {
        questions.push(shooters.length === 0 && intent.unitRef === 'everyone'
          ? 'None of your units has bows or slings to shoot with.'
          : `${others.map(u => u.id).join(', ')} cannot shoot. Only troops with bows, slings or crossbows can.`)
        continue
      }
      for (const unit of shooters) {
        orders.push({
          unitRef: unit.id, action: 'hold',
          ...(intent.holdFire ? { holdFire: true } : {}),
          ...(intent.against ? { against: intent.against } : {})
        })
      }
      const reach = Math.min(...shooters.map(u => ranged.missileRangeMetres(u)))
      understood.push(`${shooters.map(u => u.id).join(', ')}: ` + (intent.holdFire
        ? 'hold, and hold their fire'
        : `hold, and shoot at any enemy they can see within ${reach} m` + (intent.against ? `, ${intent.against} first` : '')) +
        carried(shooters.map(u => u.id)))
      continue
    }

    // A place as his orders find it, from where these units stand.
    const placeFor = (words) => resolvePlace(map, groupOrigin(match.units), words, known)
    // "charge the crossbows": a place that is no place, but an enemy he has
    // seen by name.
    if (intent.action === 'attack' && intent.place && !intent.enemyRef && !intent.steps && !intent.when) {
      const asPlace = resolvePlace(map, groupOrigin(match.units), intent.place, known)
      const bare = String(intent.place).replace(/^(?:the|their|enemy|those)\s+/i, '')
      if (asPlace.question && !asPlace.options && (context.enemies ?? []).length) {
        const asEnemy = resolveEnemy(bare, context.enemies, map, placeFor)
        if (asEnemy.enemy || asEnemy.choice) intent = { ...intent, place: null, enemyRef: bare }
      }
    }

    // "horse attack their archers": an enemy this side has seen.
    const found = intent.action === 'attack' && intent.enemyRef ? resolveEnemy(intent.enemyRef, context.enemies, map, placeFor) : null
    // "attack the enemy on the hill" with no enemy seen there: the hill,
    // to fight whoever they find on it, as the read-back says.
    if (found?.place) intent = { ...intent, enemyRef: null, place: found.place.words, whoever: true }
    if (intent.action === 'attack' && intent.enemyRef) {
      if (found.question) {
        questions.push(found.question)
        if (found.choice) choices.push(found.choice)
        continue
      }
      const extras = {}
      for (const key of ['careful']) if (intent[key]) extras[key] = intent[key]
      const deep = resolveDepth(intent, { map, units, own: match.units, from: groupOrigin(match.units), target: null, known })
      if (deep.question) {
        questions.push(deep.question)
        if (deep.choice) choices.push(deep.choice)
        continue
      }
      for (const unit of match.units) {
        orders.push({ unitRef: unit.id, action: 'attack', enemy: found.enemy.id, ...extras, ...deep.order })
      }
      const plain = orderWords('say', { action: 'attack', careful: extras.careful }, found.enemy.id)
      understood.push(`${match.units.map(u => u.id).join(', ')}: ${plain}, ${seenWhere(found.enemy)}${deep.words}${carried(match.units.map(u => u.id))}`)
      counsel.push(...counselFor(match.units, units, { clauses: deep.clauses, action: 'attack', plain, shaken: context.shaken ?? [] }))
      continue
    }

    let target = null
    let where = ''
    let relative = false
    // "everyone 200 m north": each unit goes that way from where it stands.
    let perUnit = null
    if (intent.place) {
      const place = resolvePlace(map, groupOrigin(match.units), intent.place, known)
      // Several pieces of ground at once ("everyone take the fords"): the
      // units shared out among them, each part told where it goes.
      if (place.spread && !intent.steps && !intent.when) {
        const share = shareOut(match.units, place.spread)
        const extras = {}
        for (const key of EXTRAS) if (intent[key] !== undefined && intent[key] !== null && intent[key] !== false) extras[key] = intent[key]
        const parts = place.spread.map((p, i) => ({ p, units: match.units.filter(u => share.get(u.id) === i) })).filter(x => x.units.length > 0)
        for (const { p, units: part } of parts) {
          for (const unit of part) orders.push({ unitRef: unit.id, action: intent.action, target: { ...p.position }, ...(intent.then ? { then: intent.then } : {}), ...extras })
        }
        understood.push(GROUND.some.shared(parts.map(({ p, units: part }) => `${part.map(u => u.id).join(', ')}: ${orderWords('say', { ...intent, careful: extras.careful }, `${p.description} (${gridLabel(p.position, { quarter: true })})`)}`)) + carried(match.units.map(u => u.id)))
        counsel.push(...counselFor(match.units, units, { clauses: 0, action: intent.action, plain: '', shaken: context.shaken ?? [] }))
        continue
      }
      if (place.relative && match.units.length > 1) {
        perUnit = new Map(match.units.map(u => [u.id,
          nearestPassable(map, { x: u.position.x + place.relative.dx, y: u.position.y + place.relative.dy }) ?? u.position]))
      }
      if (place.question) {
        questions.push(place.question)
        if (place.options) choices.push({ question: place.question, place: intent.place, options: place.options })
        continue
      }
      target = place.position
      where = place.description
      relative = Boolean(place.relative)
    } else if (intent.action === 'move') {
      questions.push(`Where should ${intent.unitRef} go?`)
      continue
    }

    const extras = {}
    for (const key of EXTRAS) if (intent[key] !== undefined && intent[key] !== null && intent[key] !== false) extras[key] = intent[key]

    // Depth: further steps, each placed from where the step before ends,
    // and one condition. A piece that cannot be placed is a question, and
    // the whole order waits on it.
    const deep = resolveDepth(intent, { map, units, own: match.units, from: target ?? groupOrigin(match.units), target, known })
    if (deep.question) {
      questions.push(deep.question)
      if (deep.choice) choices.push(deep.choice)
      continue
    }

    for (const unit of match.units) {
      orders.push({
        unitRef: unit.id,
        action: intent.action,
        ...(target ? { target: { ...(perUnit?.get(unit.id) ?? target) } } : {}),
        ...(intent.then ? { then: intent.then } : {}),
        ...extras,
        ...deep.order
      })
    }
    const who = match.units.map(u => u.id).join(', ')
    // The order in the app's one vocabulary (narrator/words.js): "march to
    // Miller's Crossing 250 m east (F6-NW)", "fall back", "search the woods".
    const place = !target ? null : perUnit ? where : `${where} (${gridLabel(target, { quarter: true })})`
    const plain = intent.action === 'withdraw' && !target
      ? withdrawHomeWords(map, match.units, context.homeEdge, extras.careful)
      : orderWords('say', { ...intent, careful: extras.careful }, place, { relative })
    let line = `${who}: ${plain}`
    if (intent.action === 'hide' || intent.action === 'ambush') {
      line += ` — ${coverWords(map, match.units[0], target ?? match.units[0].position)}`
    }
    if (intent.action === 'ambush') line += `; ${ambushTerms(intent)}`
    if (intent.whoever) line += `, ${ORDERS_READ.whoever}`
    line += deep.words
    line += carried(match.units.map(u => u.id))
    understood.push(line)
    counsel.push(...counselFor(match.units, units, { clauses: deep.clauses, action: intent.action, plain, shaken: context.shaken ?? [] }))
  }

  return { orders, questions, notes, choices, surrender, understood, counsel }
}

// "I ride with the horse": one unit of his own, and whether he may go to it
// (engine/command/commander.js, canRide; ruled 2026-11-23: "a commander
// needed to be adjacent to another unit to switch").
function resolveRide(intent, context) {
  const all = context.allOwn ?? context.units
  const match = resolveUnits(intent.unitRef, all)
  if (match.units.length !== 1) {
    return { question: match.units.length > 1
      ? `You can ride with one unit at a time: which of ${match.units.map(u => u.id).join(', ')}?`
      : `Who do you mean by "${match.unknown ?? intent.unitRef}"? Your units: ${all.map(u => u.id).join(', ')}.` }
  }
  const to = match.units[0]
  if (!context.ride) return { question: 'You have no place on the field to ride from.' }
  const can = context.ride(to.id)
  if (can.ok) return { unitId: to.id }
  const from = context.ridingWith
  const why = {
    held: 'You are held by the enemy: you ride with no one.',
    'not free': 'You are not on the field to ride anywhere.',
    same: `You ride with ${to.id} already.`,
    gone: `${to.id} are no longer on the field.`,
    broken: `${to.id} are broken and running: you cannot ride with them until they rally.`,
    'too far': `${to.id} are ${can.tiles} tiles (about ${can.tiles * TILE_METRES} m) from ${from}, whom you ride with: you can ride over only to a unit beside them, within ${RIDE.REACH} tile (${RIDE.REACH * TILE_METRES} m). Bring them closer first.`
  }[can.why] ?? `You cannot ride with ${to.id}.`
  return { question: why }
}

// ── Depth ──────────────────────────────────────────────

// One further step, or the thing to do when a condition comes true.
function resolveStep(map, origin, step, known = {}) {
  let target = null
  let where = null
  let relative = false
  if (step.place) {
    const place = resolvePlace(map, origin, step.place, known)
    if (place.question) {
      return { question: place.question, choice: place.options ? { question: place.question, place: step.place, options: place.options } : null }
    }
    target = place.position
    where = `${place.description} (${gridLabel(target, { quarter: true })})`
    relative = Boolean(place.relative)
  } else if (step.action === 'move') {
    return { question: 'Where should they go next?' }
  }
  return {
    order: {
      action: step.action,
      ...(target ? { target: { ...target } } : {}),
      ...(step.then ? { then: step.then } : {}),
      ...(step.careful ? { careful: true } : {})
    },
    words: orderWords('say', step, where, { relative })
  }
}

const KIND_WORDS = { cavalry: 'enemy cavalry', infantry: 'enemy foot', archers: 'enemy archers', scouts: 'enemy scouts' }

/**
 * The steps and the condition of an intent, as the engine takes them and in
 * words for the read-back.
 * @returns {{ order: { steps?, when? }, words: string, clauses: number } | { question, choice? }}
 */
function resolveDepth(intent, { map, units, own, from, target, known = {} }) {
  const order = {}
  let words = ''
  let at = from
  const steps = []
  for (const step of (intent.steps ?? []).slice(0, MAX_STEPS)) {
    const resolved = resolveStep(map, at, step, known)
    if (resolved.question) return resolved
    steps.push(resolved.order)
    words += `; then ${resolved.words}`
    if (resolved.order.target) at = resolved.order.target
  }
  if (steps.length > 0) order.steps = steps

  if (intent.when) {
    const when = intent.when
    const instead = resolveStep(map, from, when.do, known)
    if (instead.question) return instead
    if (when.type === 'attacked') {
      order.when = { type: 'attacked', do: instead.order }
      words += `; if attacked, ${instead.words}`
    } else if (when.type === 'breaks') {
      const friend = when.unitId ? { units: units.filter(u => u.id === when.unitId) } : resolveUnits(when.unitRef, units)
      const others = friend.units.filter(u => !own.includes(u))
      if (others.length !== 1) return { question: `Which of your other units do you mean by "if ${when.unitRef ?? when.unitId} break"? Your units: ${units.map(u => u.id).join(', ')}.` }
      order.when = { type: 'breaks', unitId: others[0].id, do: instead.order }
      words += `; if ${others[0].id} break, ${instead.words}`
    } else {
      let near = null
      if (when.near === 'target') near = target
      else if (when.near) {
        const place = resolvePlace(map, from, when.near, known)
        if (place.question) return { question: place.question, choice: place.options ? { question: place.question, place: when.near, options: place.options } : null }
        near = place.position
      }
      order.when = { type: 'sees', kind: when.kind ?? null, ...(near ? { near: { ...near } } : {}), do: instead.order }
      const whom = KIND_WORDS[when.kind] ?? (when.kind ? `enemy ${when.kind}` : 'the enemy')
      words += `; if they see ${whom}${near ? ` at ${gridLabel(near, { quarter: true })}` : ''}, ${instead.words}`
    }
  }
  return { order, words, clauses: steps.length + (order.when ? 1 : 0) }
}

// ── Counsel ────────────────────────────────────────────
//
// Before the Commander commits, a seasoned or veteran officer may warn him:
// that an order is deeper than the officer who must carry it can hold, or
// that it sends shaken men at the enemy. Counsel is drawn only from what the
// Commander could know himself (his officers' experience, his units' state);
// it never tells what the enemy is doing. With no experienced officer on the
// field, no one speaks.
function counselFor(ordered, all, { clauses, action, plain, shaken }) {
  // A loyal officer speaks up whatever his experience.
  const sage = all.filter(u => u.officer?.name && (gradeOf(u.officer) !== 'green' || loyaltyBand(u.officer) === 'loyal'))
    .sort((a, b) => (b.officer.experience ?? 0) - (a.officer.experience ?? 0) || a.id.localeCompare(b.id))[0]
  if (!sage) return []
  const out = []
  const says = (unit, text) => out.push(unit.id === sage.id
    ? `${sage.officer.name} of ${sage.id} says: ${text}`
    : `${sage.officer.name} of ${sage.id} warns: ${text}`)
  for (const unit of ordered) {
    if (clauses > 0 && unit.officer) {
      const grade = gradeOf(unit.officer)
      const self = unit.id === sage.id
      if (unit.officer.headless) {
        says(unit, `${unit.id} have no officer yet. They will keep "${plain}" and nothing more.`)
      } else if (grade === 'green') {
        says(unit, `${unit.officer.name} of ${unit.id} is green. Expect him to keep "${plain}" and lose the rest; ${losesTo(unit.officer)}.`)
      } else if (grade === 'seasoned' && clauses > 1) {
        says(unit, self
          ? `I can hold the first part of that. The rest I may lose; ${losesTo(unit.officer, true)}.`
          : `${unit.officer.name} of ${unit.id} should hold the first part of that. The rest is less sure; ${losesTo(unit.officer)}.`)
      }
    }
    if (shaken.includes(unit.id) && (action === 'advance' || action === 'attack')) {
      says(unit, `${unit.id} are at breaking point. Sent at the enemy now, they will break at the first blow.`)
    }
  }
  return out
}

// What an officer does when he loses the thread, in words.
function losesTo(officer, self = false) {
  const he = self ? 'I' : 'he'
  switch (officer.personality) {
    case 'bold': return `if ${he} lose${self ? '' : 's'} the thread, ${he} will advance on the enemy`
    case 'cautious': return `if ${he} lose${self ? '' : 's'} the thread, ${he} will stop and hold`
    default: return `if ${he} lose${self ? '' : 's'} the thread, ${he} will carry on with what ${he} remember${self ? '' : 's'}`
  }
}

// "spears and swords", "the archers, the horse": several units named at once.
// Every name must be known; one unknown name is a question, not a guess.
function resolveUnits(reference, units) {
  const whole = resolveUnitReference(reference, units)
  const parts = String(reference).split(/\s*(?:,|&|\band\b)\s*/i).map(p => p.trim()).filter(Boolean)
  // "hypaspists and archers" is two names, not one that happens to hold
  // the word "archers": a match on one word of the whole stands only when
  // the reference cannot be split into names.
  if (whole.units.length > 0 && (whole.matchedBy !== 'role' || parts.length < 2)) return whole
  if (parts.length < 2) return { units: [] }
  const found = []
  for (const part of parts) {
    // A name is a word or three; anything longer is not a unit's name.
    if (part.split(/\s+/).length > 3) return whole.units.length ? whole : { units: [], unknown: part }
    const match = resolveUnitReference(part, units)
    if (match.units.length === 0) return whole.units.length ? whole : { units: [], unknown: part }
    for (const u of match.units) if (!found.includes(u)) found.push(u)
  }
  return { units: found }
}

// The units of a side that are lying in wait (hiding or in ambush): the
// ones "spring the trap" is said to. For a context's `lyingInWait`.
function lyingInWait(battle, side) {
  return battle.world.units
    .filter(u => u.side === side && ['ambush', 'hide'].includes(battle.orderBook.get(u.id)?.action))
    .map(u => u.id)
}

// ── The grammar widened (docs/REVIEW-2026-11.md, D4) ───
//
// Units by "everyone else", "the rest", "everyone except the velites", "the
// first line", a kind ("the foot", "the horse", "the pikes"), a word and a
// number ("sarissa 2"), or a name a letter or two off ("legionnaires").
// Places by "the ground" and by the kind of the ground to fight for ("the
// hill" on Crownhill), by a name loosely written ("millers crossing"), or by
// one of his own units ("behind the legionaries"). Orders the engine has no
// order for are questions, with the nearest orders it has.

const OTHERS = /^(?:(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:rest|others|other units|remaining units|remainder)(?:\s+of\s+(?:you|them|the army|my units|the units|my army))?|every(?:one|body)\s+else|all\s+(?:of\s+)?(?:the\s+)?(?:others|rest)|any(?:one|body)\s+else|all\s+else|all\s+other\s+units)$/i
const EXCEPT = /^(?:every(?:one|body)|all(?:\s+units)?|all\s+of\s+you|the\s+(?:whole\s+)?army)\s+(?:except(?:\s+for)?|but|apart\s+from|other\s+than|save|besides)\s+(.+)$/i
const FIRST_LINE = /^(?:the\s+)?(?:first|front|forward|leading)\s+line$/i
const EVERYONE_WORDS = /^(?:everyone|everybody|all|all units|the army|army)$/i
// "all troops", "the men", "all of you": everyone.
const EVERYONE_TOO = /^(?:all\s+(?:of\s+)?)?(?:the\s+|my\s+|our\s+)?(?:troops|men|soldiers|forces|units|lads|boys|army|of you|you all|whole army|entire army|everyone|everybody)$/i
// His own units by kind (the engine's kinds: battle.matchesKind; and pikes).
const OWN_KINDS = [
  ['cavalry', /^(?:cavalry|horse|horses|horsemen|riders|mounted|mounted troops)$/],
  ['infantry', /^(?:infantry|foot|footmen|foot soldiers|foot troops)$/],
  ['archers', /^(?:archers|bowmen|missile troops|shooters|skirmishers)$/],
  ['pikes', /^(?:pikes|pikemen|pike|phalanx)$/]
]
const PIKES = new Set(['macedonian_sarissa', 'two_handed_spear'])
function ofKind(unit, kind) {
  if (kind === 'archers') return ranged.missileRange(unit) > 0
  if (kind === 'pikes') return PIKES.has(unit.primaryWeapon)
  return matchesKind(unit, kind)
}
const isSecond = (u) => (u.aliases ?? []).includes('second line')
const bareRef = (ref) => String(ref ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/^(?:the|my|our|all of the|all of my|all the|all my)\s+/, '')
const namesOf = (u) => [...new Set([sansSide(u.id), ...(u.aliases ?? [])].map(bareRef))]
// What a unit is called in the order box: its own name, as the app gives it.
const sayOf = (u) => (u.aliases?.[0] ?? sansSide(u.id)).toLowerCase()
const singular = (w) => w.replace(/ies$/, 'y').replace(/s$/, '')
const slackOf = (word) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0)

/**
 * Which of his units the words mean: as resolveUnits, and the widened ways.
 * @param {Object} [o]  { named: ids of units named in his other orders }
 * @returns {{ units, unknown?, othersAlone? }}
 */
function resolveUnitsWide(reference, units, { named = [] } = {}) {
  const ref = String(reference ?? '').trim().replace(/[.,!]+$/, '')
  if (OTHERS.test(ref)) {
    const rest = units.filter(u => !named.includes(u.id))
    return named.length === 0 ? { units: [], othersAlone: true } : { units: rest }
  }
  const except = ref.match(EXCEPT)
  if (except) {
    const out = resolveUnitsWide(except[1], units)
    if (out.units.length === 0) return { units: [], unknown: except[1] }
    return { units: units.filter(u => !out.units.includes(u)) }
  }
  if (FIRST_LINE.test(ref)) return { units: units.some(isSecond) ? units.filter(u => !isSecond(u)) : [...units] }
  if (EVERYONE_TOO.test(ref)) return { units: [...units], matchedBy: 'everyone' }
  const exact = resolveUnitReference(ref, units)
  if (['everyone', 'id', 'alias'].includes(exact.matchedBy)) return exact
  // The kind the Army tab shows for them ("skirmishers", "levy spearmen",
  // "the pikes"): the word on the screen, before the engine's older role.
  const shown = unitsByKind(ref, units)
  if (shown) return shown
  const bare = bareRef(ref)
  for (const [kind, words] of OWN_KINDS) {
    if (!words.test(bare)) continue
    const hits = units.filter(u => ofKind(u, kind))
    if (hits.length > 0) return { units: hits }
  }
  const plain = resolveUnits(ref, units)
  if (plain.units.length > 0) return plain
  const loose = looseUnits(bare, units)
  if (loose) return { units: loose }
  // "legionaries and hastatti": each name, each as loosely.
  const parts = ref.split(/\s*(?:,|&|\band\b|\bplus\b)\s*/i).map(p => p.trim()).filter(Boolean)
  if (parts.length > 1) {
    const found = []
    for (const part of parts) {
      if (part.split(/\s+/).length > 4) return { units: [], unknown: part }
      const one = resolveUnitsWide(part, units)
      if (one.units.length === 0) return { units: [], unknown: part }
      for (const u of one.units) if (!found.includes(u)) found.push(u)
    }
    return { units: found }
  }
  return plain
}

// A unit by a word and its number ("sarissa 2", "spears 2"), or by its name
// a letter or two off ("legionnaires", "pretorian guard"): only when the
// words fit one name, and never a second-line unit when he did not say
// "second" and a first-line one fits.
function looseUnits(bare, units) {
  if (!bare || EVERYONE_WORDS.test(bare)) return null
  const words = bare.split(' ')
  const firstLine = (hits) => (words.includes('second') || !hits.some(u => !isSecond(u)) ? hits : hits.filter(u => !isSecond(u)))
  // Every word he said is a word of its name.
  if (words.some(w => /[a-z]/.test(w))) {
    const hits = units.filter(u => namesOf(u).some(n => {
      const own = n.split(' ')
      return words.every(w => own.some(o => o === w || singular(o) === singular(w)))
    }))
    if (hits.length > 0) return firstLine(hits)
  }
  // The first letters of one name's word ("legion" for legionaries).
  if (words.length === 1 && bare.length >= 5) {
    const hits = units.filter(u => namesOf(u).some(n => n.split(' ').some(o => o.startsWith(bare))))
    const which = new Set(hits.flatMap(u => namesOf(u).flatMap(n => n.split(' ')).filter(o => o.startsWith(bare))))
    if (hits.length > 0 && which.size === 1) return firstLine(hits)
  }
  // A name, or a word of it, a letter or two off.
  let best = Infinity
  let hits = []
  let said = new Set()
  for (const u of units) {
    for (const name of namesOf(u)) {
      const tries = [[bare, name], [singular(bare), singular(name)]]
      if (words.length === 1) for (const w of name.split(' ')) tries.push([bare, w], [singular(bare), singular(w)])
      for (const [a, b] of tries) {
        const most = slackOf(b)
        if (most === 0) continue
        const d = lettersApart(a, b, most)
        if (d > most) continue
        if (d < best) { best = d; hits = [u]; said = new Set([b]) } else if (d === best) {
          if (!hits.includes(u)) hits.push(u)
          said.add(b)
        }
      }
    }
  }
  if (hits.length === 0) return null
  // Two different names as near: not his to guess.
  const names = [...said].map(singular)
  if (new Set(names).size > 1 && !hits.every(u => namesOf(u).some(n => said.has(n)))) return null
  return firstLine(hits)
}

// The units named in a set of orders, for "everyone else".
function namedIn(intents, units, extra = []) {
  const ids = new Set(extra)
  for (const intent of intents) {
    if (intent.kind !== 'order') continue
    // (The unit kept by is named too: "everyone else follow the legionaries".)
    if (intent.action === 'follow' && intent.friendRef) for (const u of resolveUnitsWide(intent.friendRef, units).units) ids.add(u.id)
    if (intent.unitIds) { intent.unitIds.forEach(id => ids.add(id)); continue }
    const ref = String(intent.unitRef ?? '')
    if (!ref || EVERYONE_WORDS.test(ref) || OTHERS.test(ref) || EXCEPT.test(ref)) continue
    for (const u of resolveUnitsWide(ref, units).units) ids.add(u.id)
  }
  return [...ids]
}

// "The Crownhill 400 m east" in a sentence: "the Crownhill 400 m east".
function sayName(description, feature) {
  const name = feature?.name
  if (!name || !String(description).startsWith(name)) return description
  return PLACE.name(name) + String(description).slice(name.length)
}

// Place words for the ground to fight for, and the kinds of ground the
// places.js words do not have.
const GROUND_WORDS = /^(?:the\s+)?(?:ground(?:\s+(?:to|we)\s+(?:fight|hold)\s+for)?|objective|objectives|goal|key ground|ground to take|ground to hold)$/i
const KIND_TOO = [['gap', ['pass']], ['pass', ['pass']], ['saddle', ['pass']], ['village', ['village']], ['town', ['village']], ['hamlet', ['village']], ['mill', ['mill']]]
const squash = (name) => bareRef(name).replace(/\s+/g, '')

// The kinds of ground a piece of ground to fight for is: the features on
// its tiles, and the tags of the landmarks on them.
function groundKinds(map, ground) {
  const keys = new Set(ground.tiles.map(t => `${t.x},${t.y}`))
  const kinds = new Set()
  for (const f of detectFeatures(map)) if (f.tiles.some(t => keys.has(`${t.x},${t.y}`))) kinds.add(f.kind)
  for (const l of map.landmarks()) {
    if (!keys.has(`${l.position.x},${l.position.y}`)) continue
    for (const tag of l.tags ?? []) kinds.add(tag)
    if (/mill/i.test(l.landmark)) kinds.add('mill')
  }
  return kinds
}

// Where to go to hold a piece of ground: the landmark on it, as places.js
// finds it, if that is on or by it; else its passable tile nearest him.
function groundPoint(map, origin, ground) {
  const keys = new Set(ground.tiles.map(t => `${t.x},${t.y}`))
  const near = (p) => ground.tiles.some(t => Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)) <= (ground.reach ?? 0))
  const mark = map.landmarks().find(l => keys.has(`${l.position.x},${l.position.y}`))
  if (mark) {
    const found = findPlace(map, origin, mark.landmark)
    if (found.position && near(found.position)) return found.position
  }
  let best = null
  let bestD = Infinity
  for (const t of ground.tiles) {
    if (!map.passable(t)) continue
    const d = Math.max(Math.abs(t.x - origin.x), Math.abs(t.y - origin.y))
    if (d < bestD) { best = t; bestD = d }
  }
  return best ? { ...best } : null
}

// Several pieces of the ground to fight for at once ("take the fords"):
// each with where to go to hold it, nearest first: as many as must be held
// (`needed`, when the battle says: two of Crownhill's three fords), else
// all. (All three, an army of four split three ways, won 11 battles of 40
// for a new player against the computer; the nearest two, see
// docs/DECISIONS.md, "How the kinds of battle were built".) The first is
// the place; resolveIntents shares the units out among them (shareOut).
function spreadOver(map, origin, grounds, needed = null) {
  const spread = grounds.map(g => {
    const position = groundPoint(map, origin, g)
    if (!position) return null
    const tiles = Math.max(Math.abs(position.x - origin.x), Math.abs(position.y - origin.y))
    const way = tiles === 0 ? '(here)' : `${tiles * TILE_METRES} m ${compassWord(origin, position)}`
    return { position, ground: g, description: `${PLACE.name(g.name)}, ${ORDERS_READ.ground}, ${way}`, tiles }
  }).filter(Boolean).sort((a, b) => a.tiles - b.tiles || a.ground.name.localeCompare(b.ground.name)).slice(0, needed && needed < grounds.length ? needed : grounds.length)
  if (spread.length === 0) return null
  return { position: spread[0].position, description: spread[0].description, spread }
}

// What several pieces of ground are, all together, as an order says it:
// "fords" when all are fords (the kind of feature on each), else "ground".
function groupWord(map, grounds) {
  const features = detectFeatures(map)
  const kinds = grounds.map(g => new Set(features.filter(f => f.tiles.some(t => g.tiles.some(x => x.x === t.x && x.y === t.y))).map(f => f.kind)))
  const common = [...(kinds[0] ?? [])].find(k => kinds.every(set => set.has(k)))
  return common ? `${common}s` : 'ground'
}

// Units shared out among several places (spreadOver): as evenly as they
// go, each to the nearest of those with fewest so far; the first place
// first when the count does not come out even. Map: unit id -> index.
function shareOut(units, spread) {
  const given = spread.map(() => 0)
  const out = new Map()
  const byId = [...units].sort((a, b) => a.id.localeCompare(b.id))
  for (const u of byId) {
    let best = 0
    for (let i = 1; i < spread.length; i++) {
      const d = (j) => Math.max(Math.abs(spread[j].position.x - u.position.x), Math.abs(spread[j].position.y - u.position.y))
      if (given[i] < given[best] || (given[i] === given[best] && d(i) < d(best))) best = i
    }
    given[best] += 1
    out.set(u.id, best)
  }
  return out
}

function wordsFor(word) {
  const w = word.toLowerCase()
  const listed = GROUND_KIND_WORDS.find(([k]) => k === w) ?? KIND_TOO.find(([k]) => k === w)
  return listed ? listed[1] : null
}

/**
 * The place the words mean, when it is one of the widened ways, else null
 * (places.js then reads them as before).
 */
function widePlace(map, origin, text, known) {
  const bare = bareRef(text)
  const grounds = (known.ground ?? []).filter(g => g.tiles?.length)
  // The ground to fight for: by those words, by its name, or by the kind of
  // ground it is ("the hill" where it is a hill).
  let ground = null
  if (GROUND_WORDS.test(text) || GROUND_WORDS.test(bare)) {
    if (grounds.length === 0) return { question: 'There is no ground to fight for on this field. Name a place or a grid square: "to C5".' }
    // Several to fight for (ruled 2026-11-25: three fords): all of them,
    // shared out among the units sent.
    if (grounds.length > 1) return spreadOver(map, origin, grounds, known.groundNeeded)
    ground = grounds[0]
  }
  if (!ground) ground = grounds.find(g => squash(g.name) === squash(text) || lettersApart(squash(g.name), squash(text), 2) <= slackOf(squash(g.name)))
  if (!ground) {
    // By its kind: "the ford". With several of that kind, "the fords" is
    // all of them, shared out; "the ford" asks which (never a guess). "The
    // nearest ford" is for places.js, as before.
    const word = bare.split(' ')
    const plural = word.length === 1 && /[^s]s$/.test(bare) ? wordsFor(bare.replace(/s$/, '')) : null
    const kinds = plural ?? wordsFor(bare)
    const ofKind = kinds ? grounds.filter(g => { const has = groundKinds(map, g); return kinds.some(k => has.has(k)) }) : []
    if (ofKind.length > 1 && plural) return spreadOver(map, origin, ofKind, known.groundNeeded)
    if (ofKind.length > 1) {
      const question = GROUND.some.which(bare, ofKind.map(g => PLACE.name(g.name)))
      return {
        question,
        options: ofKind.map(g => {
          const at = groundPoint(map, origin, g)
          const tiles = at ? Math.max(Math.abs(at.x - origin.x), Math.abs(at.y - origin.y)) : 0
          const way = !at ? '' : tiles === 0 ? ' (here)' : ` ${tiles * TILE_METRES} m ${compassWord(origin, at)}`
          return { label: `${PLACE.name(g.name)}${way}`, square: at ? gridLabel(at, { quarter: true }) : '', text: g.name.replace(/^the\s+/i, '') }
        })
      }
    }
    if (ofKind.length === 1) ground = ofKind[0]
  }
  if (ground) {
    const position = groundPoint(map, origin, ground)
    if (position) {
      const tiles = Math.max(Math.abs(position.x - origin.x), Math.abs(position.y - origin.y))
      const way = tiles === 0 ? '(here)' : `${tiles * TILE_METRES} m ${compassWord(origin, position)}`
      return { position, description: `${PLACE.name(ground.name)}, ${ORDERS_READ.ground}, ${way}` }
    }
  }
  // One of his own units: "behind the legionaries", "where the hastati are".
  const own = known.units ?? []
  const by = text.match(/^(?:behind|in behind|to the rear of)\s+(.+)$/i) ?? text.match(/^(?:beside|next to|alongside|with|near|up to)\s+(.+)$/i) ??
    text.match(/^where\s+(.+?)\s+(?:are|is|stand|stands)(?:\s+now)?$/i)
  const friendWords = by ? by[1] : text
  if (own.length && !wordsFor(bareRef(friendWords).split(' ').at(-1) ?? '') && !isGridRef(friendWords)) {
    const ref = resolveUnitReference(friendWords, own)
    const friends = ref.units.length && ref.matchedBy !== 'role' && ref.matchedBy !== 'everyone' ? ref.units : (by ? (looseUnits(bareRef(friendWords), own) ?? []) : [])
    if (friends.length > 0) {
      const behind = by && /^(?:behind|in behind|to the rear of)\b/i.test(text)
      const at = groupOrigin(friends)
      const step = behind ? ({ west: [-2, 0], east: [2, 0], north: [0, -2], south: [0, 2] }[known.homeEdge] ?? [0, 0]) : [0, 0]
      const position = nearestPassable(map, { x: at.x + step[0], y: at.y + step[1] })
      if (position) {
        const who = friends.map(u => u.id).join(', ')
        return { position, description: behind ? ORDERS_READ.behind(who, Math.max(Math.abs(step[0]), Math.abs(step[1])) * TILE_METRES) : ORDERS_READ.where(who) }
      }
    }
  }
  // A name loosely written: without its apostrophe or "the", run together
  // or apart ("crown hill"), a letter or two off, or in part ("the mill
  // bridge"), when it fits one name alone.
  const named = detectFeatures(map).filter(f => f.name)
  const plainName = (n) => String(n).toLowerCase().replace(/[’]/g, "'").replace(/^the\s+/, '').trim()
  if (named.some(f => plainName(f.name) === plainName(text))) return null
  let hits = named.filter(f => squash(f.name) === squash(text))
  if (hits.length === 0 && squash(text).length >= 5) hits = named.filter(f => lettersApart(squash(f.name), squash(text), 2) <= slackOf(squash(f.name)))
  if (hits.length === 0) {
    const words = bare.split(' ')
    if (words.length >= 2 || !wordsFor(bare)) {
      hits = named.filter(f => { const own = bareRef(f.name).split(' '); return words.every(w => own.includes(w)) })
    }
  }
  const names = [...new Set(hits.map(f => f.name))]
  if (names.length !== 1) return null
  const found = findPlace(map, origin, names[0])
  return found.position ? { position: found.position, description: sayName(found.description, found.feature) } : null
}

// Javelins and pila are thrown as men come to blows (battle.js, the throw at
// contact): said so, with the two orders that do it.
function throwQuestion(intent, units) {
  const throwers = units.filter(u => u.thrown)
  if (throwers.length === 0) {
    const shooters = units.filter(u => ranged.missileRange(u) > 0)
    if (intent.unitRef === 'everyone' && shooters.length === 0) return { question: intent.throws ? ORDERS_READ.nothingToThrow('None of your units') : 'None of your units has bows or slings to shoot with.' }
    const who = units.filter(u => !shooters.includes(u)).map(u => u.id).join(', ')
    return { question: intent.throws ? ORDERS_READ.nothingToThrow(who) : `${who} cannot shoot. Only troops with bows, slings or crossbows can.` }
  }
  const who = throwers.map(u => u.id).join(', ')
  const said = throwers.map(sayOf).join(' and ')
  const question = ORDERS_READ.thrown(who, KIT.weapon[throwers[0].thrown] ?? throwers[0].thrown)
  if (!intent.said) return { question }
  return {
    question,
    choice: {
      question,
      place: intent.said,
      options: [
        { label: ORDERS_READ.advanceAndThrow, text: `${said} advance` },
        { label: ORDERS_READ.holdAndThrow, text: `${said} hold` }
      ]
    }
  }
}

// The two ends of the enemy he has seen, across the way from his units to
// them: where going round a flank would take him.
function flankEnds(map, own, enemies) {
  const mid = (ps) => ({ x: ps.reduce((n, p) => n + p.x, 0) / ps.length, y: ps.reduce((n, p) => n + p.y, 0) / ps.length })
  const o = mid(own.map(u => u.position))
  const e = mid(enemies.map(x => x.position))
  let ux = e.x - o.x
  let uy = e.y - o.y
  const len = Math.hypot(ux, uy) || 1
  ux /= len; uy /= len
  const px = -uy
  const py = ux
  const along = enemies.map(x => ({ x, t: (x.position.x - e.x) * px + (x.position.y - e.y) * py }))
  const lo = along.reduce((a, b) => (b.t < a.t ? b : a))
  const hi = along.reduce((a, b) => (b.t > a.t ? b : a))
  const out = []
  for (const [end, sign] of [[lo, -1], [hi, 1]]) {
    const point = nearestPassable(map, { x: Math.round(end.x.position.x + sign * px * 4), y: Math.round(end.x.position.y + sign * py * 4) })
    if (point) out.push({ point, way: compassWord({ x: Math.round(e.x), y: Math.round(e.y) }, point) })
  }
  return out.filter((p, i) => out.findIndex(q => gridLabel(q.point, { quarter: true }) === gridLabel(p.point, { quarter: true })) === i)
}

// "velites stay with the legionaries", "archers keep behind the pikes",
// "cavalry guard the archers": each keeps by the unit named (the nearest of
// them, when several are), beside it and going at any enemy who fights it,
// or behind it and out of its fight (engine/battle/orders.js, follow).
function resolveFollow(intent, units, context) {
  const all = context.known.units
  const found = resolveUnitsWide(intent.friendRef, all)
  if (found.units.length === 0) {
    return { question: `Who do you mean by "${found.unknown ?? intent.friendRef}"? Your units: ${all.map(u => u.id).join(', ')}.` }
  }
  const friends = found.units
  const mine = units.filter(u => !friends.some(f => f.id === u.id))
  if (mine.length === 0) return { question: FOLLOW_WORDS.self(units.map(u => u.id).join(', ')) }
  const keep = intent.keep === 'behind' ? 'behind' : 'beside'
  const guard = keep === 'beside' && intent.guard !== false
  const deep = resolveDepth({ when: intent.when }, { map: context.map, units: context.units, own: mine, from: groupOrigin(mine), target: null, known: context.known })
  if (deep.question) return deep
  const far = (a, b) => Math.max(Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y))
  const byWhom = new Map()
  const orders = mine.map(u => {
    const friend = [...friends].sort((a, b) => far(u, a) - far(u, b) || a.id.localeCompare(b.id))[0]
    byWhom.set(friend.id, [...(byWhom.get(friend.id) ?? []), u.id])
    return {
      unitRef: u.id, action: 'follow', friend: friend.id, keep,
      ...(guard ? { guard: true } : {}),
      ...(intent.careful ? { careful: true } : {}),
      ...deep.order
    }
  })
  const how = guard ? FOLLOW_WORDS.guard : keep === 'behind' ? FOLLOW_WORDS.behind : FOLLOW_WORDS.beside
  const understood = FOLLOW_WORDS.nearest([...byWhom].map(([friend, who]) =>
    `${who.join(', ')}: ${orderWords('say', { action: 'follow', keep, careful: intent.careful }, friend)} ${how}${deep.words}`))
  return { orders, understood, clauses: deep.clauses + (guard ? 1 : 0) }
}

function resolveWidened(intent, units, context) {
  const { map } = context
  const who = units.map(u => u.id).join(', ')
  const said = intent.unitRef === 'everyone' ? 'everyone' : units.map(sayOf).join(' and ')
  if (intent.action === 'follow') return resolveFollow(intent, units, context)
  if (intent.action === 'carryOn') return { question: ORDERS_READ.carryOn(who) }
  if (intent.action === 'flank') {
    const seen = (context.enemies ?? []).filter(e => e.position && (e.strength === undefined || e.strength > 0))
    const near = gridLabel(nearestPassable(map, { x: groupOrigin(units).x, y: Math.max(0, groupOrigin(units).y - 8) }) ?? groupOrigin(units))
    if (seen.length === 0) return { question: ORDERS_READ.flankUnseen(`${said} to ${near}`) }
    const ends = flankEnds(map, units, seen)
    const question = ORDERS_READ.flank(`${said} to ${gridLabel(ends[0]?.point ?? groupOrigin(units))}, then advance`)
    return {
      question,
      choice: {
        question,
        place: intent.said,
        options: ends.map(end => {
          const square = gridLabel(end.point, { quarter: true })
          return { label: ORDERS_READ.flankEnd(end.way), square, text: `${said} to ${square}, then advance` }
        })
      }
    }
  }
  if (intent.throws) {
    const shooters = units.filter(u => ranged.missileRange(u) > 0)
    if (shooters.length > 0 && (shooters.length === units.length || intent.unitRef === 'everyone')) return null
    return throwQuestion(intent, units.filter(u => !shooters.includes(u)))
  }
  if (intent.skirmish) {
    const shooters = units.filter(u => ranged.missileRange(u) > 0)
    const others = units.filter(u => !shooters.includes(u))
    if (shooters.length === 0 || (others.length > 0 && intent.unitRef !== 'everyone')) {
      return throwQuestion({ ...intent, throws: true }, others)
    }
    const lines = []
    for (const mounted of [true, false]) {
      const group = shooters.filter(u => Boolean(u.mounted) === mounted)
      if (group.length) lines.push(`${group.map(u => u.id).join(', ')}: ${ORDERS_READ.skirmish(mounted)}${intent.against ? `, ${intent.against} first` : ''}`)
    }
    return {
      orders: shooters.map(u => ({ unitRef: u.id, action: 'advance', ...(intent.careful ? { careful: true } : {}), ...(intent.against ? { against: intent.against } : {}) })),
      understood: lines.join('; ')
    }
  }
  return null
}

// A line the grammar could not read: which part it did not follow, and the
// nearest orders it does read, in his own units' names.
function notRead(line, context) {
  const units = context.units ?? []
  const words = clean(line).split(' ')
  for (let k = Math.min(4, words.length - 1); k >= 1; k--) {
    const ref = words.slice(0, k).join(' ')
    if (OTHERS.test(ref)) break
    const found = resolveUnitsWide(ref, units)
    if (found.units.length > 0 && !/^(?:everyone|everybody|all)$/i.test(ref)) {
      return { question: ORDERS_READ.notReadFor(found.units.map(u => u.id).join(', '), words.slice(k).join(' '), examples(found.units[0], context)) }
    }
  }
  return { question: ORDERS_READ.notRead(clean(line), examples(units[0], context)) }
}

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

// Three or four orders the grammar reads, for this unit on this field.
function examples(unit, context) {
  if (!unit) return ['everyone advance', 'hold', 'fall back']
  const { map } = context
  const name = sayOf(unit)
  const toward = unit.position.x < map.width / 2 ? 8 : -8
  const square = gridLabel(nearestPassable(map, { x: unit.position.x + toward, y: unit.position.y }) ?? unit.position)
  const ground = (context.ground ?? [])[0]
  return [
    // (Several to fight for: all of them, shared out.)
    ...(ground ? [(context.ground ?? []).length > 1 ? `everyone take the ${groupWord(map, context.ground)}` : `everyone take ${PLACE.name(ground.name)}`] : []),
    `${name} advance`,
    `${name} to ${square}`,
    `${name} go north 200 m`,
    `${name} hold`,
    `${name} fall back`
  ].slice(0, 5)
}

module.exports = { resolveIntents, resolvePlace, resolveUnits, resolveUnitsWide, parseRelative, groupOrigin, coverWords, lyingInWait }
