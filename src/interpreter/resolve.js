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
const { orderWords } = require('../narrator/words')
const { gradeOf, MAX_STEPS } = require('../engine/command/officers')
const { findPlace, DIRECTIONS, TILE_METRES } = require('../engine/map/places')
const { isGridRef, gridTarget, gridLabel } = require('../engine/map/grid')
const { coverFor } = require('../engine/battle/hiding')

// The extra parts of an order the engine reads (Stage 3), carried through
// unchanged when set.
const EXTRAS = ['careful', 'against', 'letPass', 'regardless', 'holdFire']

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
    const plain = orderWords('say', { ...intent, careful: extras.careful }, place, { relative })
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
  const sage = all.filter(u => u.officer && gradeOf(u.officer) !== 'green')
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
      if (grade === 'green') {
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
  if (whole.units.length > 0) return whole
  const parts = String(reference).split(/\s*(?:,|&|\band\b)\s*/i).map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return { units: [] }
  const found = []
  for (const part of parts) {
    // A name is a word or three; anything longer is not a unit's name.
    if (part.split(/\s+/).length > 3) return { units: [], unknown: part }
    const match = resolveUnitReference(part, units)
    if (match.units.length === 0) return { units: [], unknown: part }
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
