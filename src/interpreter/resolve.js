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
const { orderWords, OWN_EDGE, HOLD_THERE, RIDE_WITH: RIDE_WORDS } = require('../narrator/words')
const { RIDE } = require('../engine/combat/tables')
const { matchesKind, edgeTarget } = require('../engine/battle/battle')
const { KINDS } = require('./grammar')
const { gradeOf, MAX_STEPS, loyaltyBand } = require('../engine/command/officers')
const { findPlace, DIRECTIONS, TILE_METRES } = require('../engine/map/places')
const { isGridRef, gridTarget, gridLabel } = require('../engine/map/grid')
const { coverFor } = require('../engine/battle/hiding')

// The extra parts of an order the engine reads (Stage 3), carried through
// unchanged when set.
const EXTRAS = ['careful', 'against', 'letPass', 'regardless', 'holdFire']

// ── An enemy named in an attack ────────────────────────
//
// "their archers", "the enemy horse", "swords": which of the enemy units this
// side has seen (context.enemies, its intel: in sight or last seen) the
// words mean. Only those: an enemy never seen cannot be named, and the true
// field is never looked at. "archers at E5" picks the one seen nearest E5.

const AT_SQUARE = /\s+(?:at|in|near|by)\s+(\S+)$/i
const sansSide = (id) => String(id).replace(/^(?:red|blue)_/, '').replace(/_/g, ' ')

// Is this seen enemy of that kind? By what was seen of it when the intel
// says (role, mounted, weapon); else by its name.
function looksLike(enemy, kind) {
  if ('role' in enemy || 'mounted' in enemy) return matchesKind({ id: enemy.id, role: enemy.role, mounted: enemy.mounted, primaryWeapon: enemy.primaryWeapon }, kind)
  const words = KINDS.find(([k]) => k === kind)?.[1]
  return Boolean(words && words.test(sansSide(enemy.id)))
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
function resolveEnemy(words, enemies, map) {
  const seen = (enemies ?? []).filter(e => e.position && (e.strength === undefined || e.strength > 0))
  let ref = String(words).trim()
  let near = null
  const at = ref.match(AT_SQUARE)
  if (at && isGridRef(at[1])) {
    const square = gridTarget(map, at[1])
    if (!square.none) near = square.position
    ref = ref.slice(0, at.index).trim()
  }
  const kind = KINDS.find(([, pattern]) => pattern.test(ref))?.[0] ?? null
  const anyone = /^(?:everyone|everybody|all|army|the army)$/i.test(ref)
  // "swordsmen" for the enemy swords, "spearmen" for their spears.
  const stem = (w) => w.toLowerCase().replace(/s$/, '')
  const byStem = () => seen.filter(e => sansSide(e.id).split(' ').some(w => w.length > 3 && stem(ref).startsWith(stem(w))))
  const named = () => {
    const found = resolveUnitReference(ref, seen.map(e => ({ ...e, aliases: [sansSide(e.id)] }))).units
    return found.length > 0 ? found : byStem()
  }
  const matches = kind ? seen.filter(e => looksLike(e, kind)) : anyone ? [] : named()
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
        return { label: `${ref} ${seenWhere(e)}`, square, text: `${ref} at ${square}` }
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

function resolvePlace(map, origin, words) {
  const text = String(words).trim()
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
  if (found.position) return { position: found.position, description: found.description }
  if (found.question) {
    // Each choice says what to write instead, so the player can pick one
    // rather than retype the order: a named place by its name, any other by
    // its grid square.
    return {
      question: found.question,
      options: found.options.map(o => ({
        label: o.description,
        square: gridLabel(o.position, { quarter: true }),
        text: o.feature?.name ?? gridLabel(o.position, { quarter: true })
      }))
    }
  }
  return { question: `I can't place "${text}": ${found.none}. Try the ground (the ridge to the east, the clearing) or a grid square like C7.` }
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

  for (const intent of intents) {
    if (intent.kind === 'surrender') { surrender = true; continue }
    if (intent.kind === 'ask') { questions.push(intent.question); continue }
    if (intent.kind === 'note') { notes.push(intent.note); continue }
    if (intent.kind === 'ride') {
      const ride = resolveRide(intent, context)
      if (ride.question) { questions.push(ride.question); continue }
      orders.push({ ride: ride.unitId })
      understood.push(`You: ${RIDE_WORDS.say} ${ride.unitId}`)
      continue
    }
    if (intent.kind !== 'order') continue

    let match = intent.unitIds
      ? { units: units.filter(u => intent.unitIds.includes(u.id)) }
      : resolveUnits(intent.unitRef, units)
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
    if (match.units.length === 0) {
      questions.push(`Who do you mean by "${match.unknown ?? intent.unitRef}"? Your units: ${units.map(u => u.id).join(', ')}.`)
      continue
    }

    // "Shoot" and "hold fire" are for missile troops. With no one named they
    // are for all of them; a unit named that has nothing to shoot with is a
    // question, not an order quietly dropped.
    if (intent.fire) {
      const shooters = match.units.filter(u => ranged.missileRange(u) > 0)
      const others = match.units.filter(u => !shooters.includes(u))
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
        : `hold, and shoot at any enemy they can see within ${reach} m` + (intent.against ? `, ${intent.against} first` : '')))
      continue
    }

    // "horse attack their archers": an enemy this side has seen.
    if (intent.action === 'attack' && intent.enemyRef) {
      const found = resolveEnemy(intent.enemyRef, context.enemies, map)
      if (found.question) {
        questions.push(found.question)
        if (found.choice) choices.push(found.choice)
        continue
      }
      const extras = {}
      for (const key of ['careful']) if (intent[key]) extras[key] = intent[key]
      const deep = resolveDepth(intent, { map, units, own: match.units, from: groupOrigin(match.units), target: null })
      if (deep.question) {
        questions.push(deep.question)
        if (deep.choice) choices.push(deep.choice)
        continue
      }
      for (const unit of match.units) {
        orders.push({ unitRef: unit.id, action: 'attack', enemy: found.enemy.id, ...extras, ...deep.order })
      }
      const plain = orderWords('say', { action: 'attack', careful: extras.careful }, found.enemy.id)
      understood.push(`${match.units.map(u => u.id).join(', ')}: ${plain}, ${seenWhere(found.enemy)}${deep.words}`)
      counsel.push(...counselFor(match.units, units, { clauses: deep.clauses, action: 'attack', plain, shaken: context.shaken ?? [] }))
      continue
    }

    let target = null
    let where = ''
    let relative = false
    // "everyone 200 m north": each unit goes that way from where it stands.
    let perUnit = null
    if (intent.place) {
      const place = resolvePlace(map, groupOrigin(match.units), intent.place)
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
    const deep = resolveDepth(intent, { map, units, own: match.units, from: target ?? groupOrigin(match.units), target })
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
    line += deep.words
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
function resolveStep(map, origin, step) {
  let target = null
  let where = null
  let relative = false
  if (step.place) {
    const place = resolvePlace(map, origin, step.place)
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
function resolveDepth(intent, { map, units, own, from, target }) {
  const order = {}
  let words = ''
  let at = from
  const steps = []
  for (const step of (intent.steps ?? []).slice(0, MAX_STEPS)) {
    const resolved = resolveStep(map, at, step)
    if (resolved.question) return resolved
    steps.push(resolved.order)
    words += `; then ${resolved.words}`
    if (resolved.order.target) at = resolved.order.target
  }
  if (steps.length > 0) order.steps = steps

  if (intent.when) {
    const when = intent.when
    const instead = resolveStep(map, from, when.do)
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
        const place = resolvePlace(map, from, when.near)
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

module.exports = { resolveIntents, resolvePlace, resolveUnits, parseRelative, groupOrigin, coverWords, lyingInWait }
