// src/web/public/map.js
//
// The battle map as an SVG, drawn from one side's view: an old map on
// paper, terrain in muted inks, the 100 m grid lettered in the margin, units
// as squares with clear markings (HistoryMarche style), enemies as last
// seen, objectives ringed, orders in force as dashed arrows.
//
// Colours come from the theme (CSS variables); nothing here picks a colour.
//
// Gestures: tap one of your units to pick it; then tap a place, or drag the
// unit there, and the map hands back a preset order ("Archers to D7-NE")
// for the order box (ruled 2026-10-30). A tap on the map with no unit picked
// names the place.

export const TILE = 24
const MARGIN = 26
const SQUARE = 4

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const TERRAIN = { p: 'plains', r: 'road', h: 'hill', f: 'forest', m: 'marsh', w: 'river', d: 'ford', b: 'bridge' }
const TERRAIN_WORDS = { plains: 'open field', road: 'road', hill: 'high ground', forest: 'woods', marsh: 'marsh', river: 'river', ford: 'ford', bridge: 'bridge' }

// ── Grid references, as the engine writes them (engine/map/grid.js) ──
function letters(n) {
  let s = ''
  let k = n + 1
  while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26) }
  return s
}
export function gridRef(x, y) {
  const square = `${letters(Math.floor(x / SQUARE))}${Math.floor(y / SQUARE) + 1}`
  const qx = Math.floor((x % SQUARE) / 2)
  const qy = Math.floor((y % SQUARE) / 2)
  return `${square}-${['NW', 'NE', 'SW', 'SE'][qy * 2 + qx]}`
}
export function terrainWords(view, x, y) {
  return TERRAIN_WORDS[TERRAIN[view.map.terrain[y]?.[x]] ?? 'plains']
}

const cx = (x) => MARGIN + x * TILE + TILE / 2
const cy = (y) => MARGIN + y * TILE + TILE / 2

// ── Unit counters ──────────────────────────────────────
function kindOf(unit) {
  if (unit.mounted) return 'horse'
  // Your own are marked by what kind of men they are (words.js, kindWords);
  // the enemy by the kind his reports told.
  const role = String(unit.kind ?? unit.role ?? '')
  if (/archer|bow|sling|skirmish|crossbow/.test(role)) return 'bow'
  if (/scout/.test(role)) return 'scout'
  if (/spear|pike/.test(role)) return 'spear'
  return 'foot'
}

function symbol(kind) {
  // Drawn inside a 20x14 counter centred on 0,0, in the counter's ink.
  switch (kind) {
    case 'horse': return '<path d="M-10 7L10 -7"/>'
    case 'bow': return '<path d="M-6 4Q0 -8 6 4" fill="none"/><path d="M-6 4H6"/>'
    case 'scout': return '<circle r="2.2" stroke="none" class="sym-fill"/>'
    case 'spear': return '<path d="M-10 -7L10 7M10 -7L-10 7"/><path d="M0 -7V7"/>'
    default: return '<path d="M-10 -7L10 7M10 -7L-10 7"/>'
  }
}

const SCALE = 1.35

// One counter: a square in the side's colour with the role's mark, a
// strength bar for your own, and (on the top counter of a stack) the name.
// An enemy whose kind no report has told (unknownKind) is marked "?", not
// with a kind's mark it might not be.
function counter(unit, { side, own, selected, ghost, aged = false, commander = false, nameAbove = null, shift = 0, k = 1 }) {
  const kind = kindOf(unit)
  const fill = ghost ? 'none' : `var(--side-${side})`
  const ink = ghost ? 'var(--ghost)' : `var(--side-${side}-on)`
  const dash = ghost || aged || unit.hidden ? ' stroke-dasharray="3 2"' : ''
  // A unit of yours known only by rider is drawn faded, where word last put it.
  const opacity = ghost ? 0.75 : aged ? (unit.broken ? 0.35 : 0.55) : (unit.broken ? 0.45 : (unit.hidden ? 0.8 : 1))
  // The Commander's own pennant, over the unit he rides with.
  const pennant = commander
    ? '<g aria-hidden="true"><path d="M-6 -8V-19" style="stroke: var(--ink)" stroke-width="1.2"/><path d="M-6 -19L4 -16L-6 -13Z" style="fill: var(--ink)"/></g>'
    : ''
  const cut = aged && (unit.word?.cutOff || unit.word?.noWord)
    ? '<path d="M7 -10L13 -4M13 -10L7 -4" style="stroke: var(--side-red)" stroke-width="1.8" aria-hidden="true"/>'
    : ''
  const strength = own && unit.maxStrength
    ? `<rect x="-10" y="8.5" width="20" height="2.4" style="fill: var(--paper-edge)"/><rect x="-10" y="8.5" width="${Math.max(0, Math.round(20 * unit.strength / unit.maxStrength))}" height="2.4" style="fill: var(--ink)"/>`
    : ''
  // The enemy's counters carry a mark of their own, a corner cut in ink,
  // so they are told from yours by more than colour.
  const mark = own ? '' : `<path d="M3 -7H10V0Z" style="fill: ${ghost ? 'var(--ghost)' : 'var(--ink)'}" aria-hidden="true"/>`
  const x = cx(unit.position.x) + shift
  const y = cy(unit.position.y) + shift
  return `
    <g class="counter" transform="translate(${x},${y})" opacity="${opacity}">
      <g transform="scale(${SCALE})">
        ${selected ? '<rect x="-14" y="-11" width="28" height="25" fill="none" style="stroke: var(--ink)" stroke-width="1.6"/>' : ''}
        <rect x="-10" y="-7" width="20" height="14" style="fill: ${fill}; stroke: ${ghost ? 'var(--ghost)' : 'var(--ink)'}" stroke-width="1.1"${dash}/>
        <g style="stroke: ${ink}; fill: ${ink}" stroke-width="1.3" stroke-linecap="square">${ghost || unit.unknownKind ? '<text y="4" text-anchor="middle" font-size="11" style="stroke: none">?</text>' : symbol(kind)}</g>
        ${strength}
        ${pennant}${cut}${mark}
      </g>
      ${nameAbove ? `<text y="${-(10 + 9 * k)}" text-anchor="middle" font-size="${(LABEL_PX * k).toFixed(1)}" font-weight="600" class="unit-name" style="fill: var(--ink); font-family: var(--font-ui)">${esc(nameAbove)}</text>` : ''}
    </g>`
}

// Units on one tile cascade a little. Units on neighbouring tiles would pile
// their names on top of each other, so a cluster of them (tiles touching) is
// named once: by name for one or two units, by number for more. The picked
// unit always carries its own name.
function clusters(list) {
  const left = [...list]
  const out = []
  while (left.length) {
    const group = [left.pop()]
    for (let i = 0; i < group.length; i++) {
      for (let j = left.length - 1; j >= 0; j--) {
        if (Math.abs(left[j].position.x - group[i].position.x) <= 1 && Math.abs(left[j].position.y - group[i].position.y) <= 1) group.push(left.splice(j, 1)[0])
      }
    }
    out.push(group)
  }
  return out
}

function clusterLabel(group, ghost, aged = false, own = true) {
  if (aged) {
    // Your units known by rider: their names, and how old the word is (the
    // server's words: "20 min ago", or cut off).
    const oldest = group.reduce((a, b) => ((b.word?.minutesAgo ?? 0) > (a.word?.minutesAgo ?? 0) ? b : a))
    const when = group.some(u => u.word?.cutOff) ? 'cut off' : group.some(u => u.word?.noWord) ? 'no word' : oldest.word?.said ?? ''
    return `${group.length <= 2 ? group.map(g => g.name).join(', ') : `${group.length} units`}, ${when}`
  }
  if (ghost) {
    const ago = Math.min(...group.map(u => u.minutesAgo ?? 0))
    return `${group.length > 1 ? `${group.length} enemy units` : 'enemy'}, last seen ${ago ? `${ago} min ago` : 'just now'}`
  }
  // The enemy's as the rest of the app names them: "enemy spears".
  if (!own) return group.length <= 2 ? group.map(enemyName).join(', ') : `${group.length} enemy units`
  return group.length <= 2 ? group.map(g => g.name).join(', ') : `${group.length} units`
}
const enemyName = (u) => {
  const name = String(u.name ?? '')
  return /^enemy\b/i.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : `enemy ${name.toLowerCase()}`
}

// Labels are placed last, all together, so names do not pile on each
// other where units meet: each goes under its cluster if there is room,
// else a line lower, two lines lower, or above it, wherever it covers
// least of the labels already placed. Yours are placed first.
//
// A label is never smaller than LABEL_PX on the screen, whatever the zoom
// (docs/REVIEW-2026-11.md, S14: 6 px at a fight on Greywater on a phone):
// the map is drawn for its zoom, and `k` scales its words up when the map
// is shown smaller than it is drawn.
const LABEL_PX = 11
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
const labelWidth = (l) => l.text.length * 0.58 * LABEL_PX * l.k + 6 * l.k
function labelBox(l, dy) {
  const w = labelWidth(l)
  return { x0: l.x - w / 2, x1: l.x + w / 2, y0: l.y + dy - 1.2 * LABEL_PX * l.k, y1: l.y + dy + 0.5 * LABEL_PX * l.k }
}
// Where each label goes: [{ l, dy, b, cost, hit }], `hit` the label placed
// before it that it lies on most, if any.
function layLabels(labels, taken = []) {
  const placed = taken.map(b => ({ b, l: null }))
  const out = []
  for (const l of [...labels].sort((a, b) => a.rank - b.rank)) {
    const line = 1.15 * LABEL_PX * l.k
    let best = null
    for (const dy of [0, line, 2 * line, -l.above]) {
      const b = labelBox(l, dy)
      let cost = 0
      let hit = null
      let most = 0
      for (const p of placed) {
        const o = overlap(b, p.b)
        cost += o
        if (p.l && o > most) { most = o; hit = p.l }
      }
      if (!best || cost < best.cost) best = { l, dy, b, cost, hit }
      if (cost === 0) break
    }
    placed.push({ b: best.b, l })
    out.push(best)
  }
  return out
}
function labelText(laid) {
  return laid.map(({ l, dy }) => `<text x="${l.x}" y="${(l.y + dy).toFixed(1)}" text-anchor="middle" font-size="${(LABEL_PX * l.k).toFixed(1)}" class="unit-name" style="fill: var(--ink); font-family: var(--font-ui)">${esc(l.text)}</text>`).join('')
}

// Every unit's label. Each cluster of one kind (yours, the enemy in sight,
// yours known by rider, the enemy last seen) has its own; where there is no
// room for each its own (a fight, on a phone), those whose labels would lie
// on each other share one: "3 of yours, 2 enemy", or "4 units". Their names
// show on a tap (the map's hint, app.js).
function sharedLabels(sets, k, taken) {
  let groups = sets.flatMap(set => clusters(set.list.map(u => ({ ...u, set }))))
  const item = (group, i) => {
    const lowest = group.reduce((a, b) => (b.position.y > a.position.y || (b.position.y === a.position.y && b.position.x > a.position.x) ? b : a))
    // (Stacked on one tile, the top counter is drawn a little lower.)
    const below = group.filter(u => u.position.x === lowest.position.x && u.position.y === lowest.position.y && u.set === lowest.set).length - 1
    return {
      group: i, text: sharedText(group), x: cx(lowest.position.x) + below * 5, y: cy(lowest.position.y) + below * 5 + 10 + LABEL_PX * k,
      above: 14 + 1.9 * LABEL_PX * k, rank: Math.min(...group.map(u => u.set.rank)), k
    }
  }
  // Shown small (a phone), labels that would lie on each other where they
  // hang share one at once: moved a line down they would only be read as
  // another unit's. Shown at full size, only those that cannot be moved
  // clear of each other.
  const tight = k > 1.2
  const merge = (a, b) => { groups = groups.filter((g, i) => i !== a && i !== b).concat([[...groups[a], ...groups[b]]]) }
  for (let round = 0; round < 200; round++) {
    const items = groups.map(item)
    if (tight) {
      const boxes = items.map(l => labelBox(l, 0))
      let pair = null
      for (let i = 0; i < boxes.length && !pair; i++) for (let j = i + 1; j < boxes.length && !pair; j++) if (overlap(boxes[i], boxes[j]) > 0) pair = [i, j]
      if (pair) { merge(...pair); continue }
    }
    const laid = layLabels(items, taken)
    const clash = laid.find(x => x.hit)
    if (!clash) return laid
    merge(clash.l.group, clash.hit.group)
  }
  return layLabels(groups.map(item), taken)
}
function sharedText(group) {
  const set = group[0].set
  if (group.every(u => u.set === set)) return clusterLabel(group, set.ghost, set.aged, set.mine)
  const mine = group.filter(u => u.set.mine)
  const theirs = group.filter(u => !u.set.mine)
  if (!theirs.length) return `${mine.length} units`
  if (!mine.length) return `${theirs.length} enemy units`
  return `${mine.length} of yours, ${theirs.length} enemy`
}

// The counters (their labels are sharedLabels').
function drawUnits(list, opts) {
  const byTile = new Map()
  for (const u of list) {
    const key = `${u.position.x},${u.position.y}`
    if (!byTile.has(key)) byTile.set(key, [])
    byTile.get(key).push(u)
  }
  const out = []
  for (const group of byTile.values()) {
    group.forEach((u, i) => {
      const selected = opts.selectedId === u.id
      out.push(counter(u, { ...opts, ghost: opts.ghost, commander: opts.commanderId === u.id, selected, nameAbove: selected && !opts.ghost ? u.name : null, shift: i * 5, k: opts.k ?? 1 }))
    })
  }
  return out.join('')
}

// ── The whole map ──────────────────────────────────────
export function drawMap(view, { selectedId = null, zoom = 1 } = {}) {
  const { width, height, terrain, landmarks } = view.map
  // How much bigger than drawn its words are, so that they read at
  // LABEL_PX on the screen at this zoom.
  const k = Math.max(1, 1 / zoom)
  const W = width * TILE + MARGIN * 2
  const H = height * TILE + MARGIN * 2
  const side = view.battle.side
  const enemySide = view.battle.sides.find(s => s !== side) ?? 'blue'
  const parts = []

  parts.push(`<defs>
    <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/>
      <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.16  0 0 0 0.9 0"/>
    </filter>
    <pattern id="t-forest" width="${TILE}" height="${TILE}" patternUnits="userSpaceOnUse">
      <rect width="${TILE}" height="${TILE}" style="fill: var(--terrain-forest)"/>
      <g style="fill: none; stroke: var(--terrain-forest-mark)" stroke-width="1">
        <circle cx="6" cy="7" r="3.2"/><path d="M6 10.2V13"/>
        <circle cx="17" cy="11" r="3.6"/><path d="M17 14.6V17.6"/>
        <circle cx="8" cy="18" r="2.8"/><path d="M8 20.8V23"/>
      </g>
    </pattern>
    <pattern id="t-hill" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="6" height="6" style="fill: var(--terrain-hill)"/>
      <path d="M0 0V6" style="stroke: var(--terrain-hill-mark)" stroke-width="0.8"/>
    </pattern>
    <pattern id="t-marsh" width="${TILE}" height="${TILE / 2}" patternUnits="userSpaceOnUse">
      <rect width="${TILE}" height="${TILE / 2}" style="fill: var(--terrain-marsh)"/>
      <path d="M4 9v-4M6 9v-5M8 9v-3M15 9v-4M17 9v-5M19 9v-3" style="stroke: var(--terrain-marsh-mark)" stroke-width="0.9"/>
    </pattern>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10Z" style="fill: var(--order-arrow)"/>
    </marker>
  </defs>`)

  // Paper, with a little grain and a darker edge.
  parts.push(`<rect width="${W}" height="${H}" style="fill: var(--paper)"/>`)
  parts.push(`<rect width="${W}" height="${H}" filter="url(#paper-grain)" style="opacity: var(--paper-texture-opacity)"/>`)
  parts.push(`<rect x="${MARGIN - 1}" y="${MARGIN - 1}" width="${width * TILE + 2}" height="${height * TILE + 2}" fill="none" style="stroke: var(--paper-edge)" stroke-width="2"/>`)

  // Terrain, in horizontal runs of the same ground.
  const fills = {
    forest: 'url(#t-forest)', hill: 'url(#t-hill)', marsh: 'url(#t-marsh)',
    river: 'var(--terrain-river)', ford: 'var(--terrain-ford)', road: 'var(--terrain-road)', bridge: 'var(--terrain-bridge)'
  }
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      const code = terrain[y][x]
      let run = 1
      while (x + run < width && terrain[y][x + run] === code) run++
      const name = TERRAIN[code]
      if (fills[name]) {
        const inset = name === 'road' ? ' opacity="0.75"' : ''
        parts.push(`<rect x="${MARGIN + x * TILE}" y="${MARGIN + y * TILE}" width="${run * TILE}" height="${TILE}" style="fill: ${fills[name]}"${inset}/>`)
      }
      x += run
    }
  }

  // The grid: 100 m squares, lettered and numbered in the margin.
  const grid = []
  for (let gx = 0; gx <= width; gx += SQUARE) grid.push(`M${MARGIN + gx * TILE} ${MARGIN}V${MARGIN + height * TILE}`)
  for (let gy = 0; gy <= height; gy += SQUARE) grid.push(`M${MARGIN} ${MARGIN + gy * TILE}H${MARGIN + width * TILE}`)
  parts.push(`<path d="${grid.join('')}" fill="none" style="stroke: var(--grid-line)" stroke-width="1"/>`)
  const labels = []
  for (let gx = 0; gx * SQUARE < width; gx++) {
    const x = MARGIN + (gx * SQUARE + SQUARE / 2) * TILE
    labels.push(`<text x="${x}" y="${MARGIN - 9}">${letters(gx)}</text><text x="${x}" y="${H - 9}">${letters(gx)}</text>`)
  }
  for (let gy = 0; gy * SQUARE < height; gy++) {
    const y = MARGIN + (gy * SQUARE + SQUARE / 2) * TILE + 4
    labels.push(`<text x="${MARGIN / 2}" y="${y}">${gy + 1}</text><text x="${W - MARGIN / 2}" y="${y}">${gy + 1}</text>`)
  }
  parts.push(`<g text-anchor="middle" font-size="12" style="fill: var(--grid-label); font-family: var(--font-display)" aria-hidden="true">${labels.join('')}</g>`)

  // Landmarks, lettered like an old map.
  parts.push(`<g text-anchor="middle" font-size="${(LABEL_PX * k).toFixed(1)}" font-style="italic" style="fill: var(--landmark-ink); font-family: var(--font-display)" aria-hidden="true">${
    (landmarks ?? []).filter(l => l.kind !== 'road' && l.kind !== 'river').map(l => `<text x="${cx(l.centre.x)}" y="${cy(l.centre.y) - 12}" class="landmark">${esc(l.name)}</text>`).join('')
  }</g>`)

  // Objectives: a dashed ring round the ground, and its name (which unit
  // labels keep clear of: groundNames).
  const groundNames = []
  for (const o of view.objectives ?? []) {
    const xs = o.tiles.map(t => t.x)
    const ys = o.tiles.map(t => t.y)
    const x0 = MARGIN + Math.min(...xs) * TILE - 3
    const y0 = MARGIN + Math.min(...ys) * TILE - 3
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * TILE + 6
    const h = (Math.max(...ys) - Math.min(...ys) + 1) * TILE + 6
    const held = o.holder ? ` (held by ${o.holder === side ? 'you' : 'the enemy'})` : ''
    const half = ((o.name + held).length * 3.3 + 4) * k
    groundNames.push({ x0: x0 + w / 2 - half, x1: x0 + w / 2 + half, y0: y0 + h + 3, y1: y0 + h + 3 + 13 * k })
    // A faint wash over the ground itself, so it reads at a phone's zoom.
    for (const t of o.tiles) parts.push(`<rect aria-hidden="true" x="${MARGIN + t.x * TILE}" y="${MARGIN + t.y * TILE}" width="${TILE}" height="${TILE}" style="fill: var(--objective)" fill-opacity="0.18"/>`)
    parts.push(`<g aria-hidden="true"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="6" fill="none" style="stroke: var(--objective)" stroke-width="2.5" stroke-dasharray="6 4"/>
      <text x="${x0 + w / 2}" y="${(y0 + h + 3 + 10 * k).toFixed(1)}" text-anchor="middle" font-size="${(LABEL_PX * k).toFixed(1)}" font-weight="600" style="fill: var(--objective); font-family: var(--font-display)">${esc(o.name + held)}</text></g>`)
  }

  // Orders in force: dashed arrows from each unit to where it is going.
  for (const u of view.own) {
    if (!u.target || u.broken) continue
    if (u.target.x === u.position.x && u.target.y === u.position.y) continue
    parts.push(`<path d="M${cx(u.position.x)} ${cy(u.position.y)}L${cx(u.target.x)} ${cy(u.target.y)}" fill="none" style="stroke: var(--order-arrow)" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#arrow)" opacity="0.8"/>`)
  }

  // The Commander's immediate range: within it his orders arrive at once
  // and he sees for himself; beyond it, by rider.
  const commanderId = view.commander?.status === 'free' ? view.commander.unitId : null
  const post = commanderId ? view.own.find(u => u.id === commanderId) : null
  if (post && view.commander.immediate) {
    const r = view.commander.immediate
    const x0 = Math.max(0, post.position.x - r)
    const y0 = Math.max(0, post.position.y - r)
    const x1 = Math.min(width - 1, post.position.x + r)
    const y1 = Math.min(height - 1, post.position.y + r)
    parts.push(`<g aria-hidden="true" class="immediate"><rect x="${MARGIN + x0 * TILE}" y="${MARGIN + y0 * TILE}" width="${(x1 - x0 + 1) * TILE}" height="${(y1 - y0 + 1) * TILE}" rx="8" style="fill: var(--immediate-fill); stroke: var(--immediate-edge)" stroke-width="1.4" stroke-dasharray="7 5"/>
      <text x="${MARGIN + x0 * TILE + 6}" y="${MARGIN + y0 * TILE + 13}" font-size="10" style="fill: var(--immediate-edge); font-family: var(--font-ui)">orders at once</text></g>`)
  }

  // Units: enemies as known, then yours on top: those known by rider faded,
  // where word last put them, then those about you as they are.
  const enemies = view.enemies ?? []
  const aged = (u) => u.word && !u.word.live
  const sets = [
    { list: view.own.filter(u => !aged(u)), mine: true, rank: 0 },
    { list: enemies.filter(e => e.status === 'visible'), mine: false, rank: 1 },
    { list: view.own.filter(aged), mine: true, aged: true, rank: 2 },
    { list: enemies.filter(e => e.status !== 'visible'), mine: false, ghost: true, rank: 3 }
  ]
  parts.push(drawUnits(sets[3].list, { side: enemySide, own: false, ghost: true, k }))
  parts.push(drawUnits(sets[1].list, { side: enemySide, own: false, ghost: false, k }))
  parts.push(drawUnits(sets[2].list, { side, own: true, ghost: false, aged: true, selectedId, commanderId, k }))
  parts.push(drawUnits(sets[0].list, { side, own: true, ghost: false, selectedId, commanderId, k }))
  // Labels: yours first, then the enemy in sight, those known by rider and
  // the enemy last seen; sharing one where they must.
  parts.push(labelText(sharedLabels(sets, k, groundNames)))

  const seen = (view.enemies ?? []).filter(e => e.status === 'visible').length
  const label = `Map of ${view.map.name}. Your ${view.own.length} units are shown; ${seen} enemy units in sight` +
    `${(view.objectives ?? []).length ? `; objectives: ${view.objectives.map(o => o.name).join(', ')}` : ''}. The Army tab lists every unit in words.`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">${parts.join('')}
    <style>.unit-name { paint-order: stroke; stroke: var(--paper); stroke-width: 3px; stroke-linejoin: round; } .sym-fill { fill: currentColor; }</style>
  </svg>`
}

// ── Gestures ───────────────────────────────────────────
// A fingertip is wider than a counter, so a tap picks the nearest of your
// units within REACH screen pixels. When more than one is that close (a
// stack, or neighbours), the map hands back the list to choose from.
const REACH = 26

/**
 * Wire the map up. handlers:
 *   onPick(unitId | null)        a unit of yours was tapped (or the pick cleared)
 *   onStack(units)               a tap fell on several of your units: choose one
 *   onOrder(unit, x, y)          a picked unit was pointed at a place
 *   onPlace(x, y)                a place was tapped with no unit picked
 *   onPinch(factor, x, y)        two fingers moved: scale by factor about the
 *                                client point x, y
 *   onPan(dx, dy)                a mouse dragged the map (not from a unit) by
 *                                dx, dy screen pixels (a finger scrolls it
 *                                natively)
 */
export function attachGestures(svg, view, getPicked, handlers) {
  const toMap = (event) => {
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    return pt.matrixTransform(svg.getScreenCTM().inverse())
  }
  const tileAt = (event) => {
    const p = toMap(event)
    const x = Math.floor((p.x - MARGIN) / TILE)
    const y = Math.floor((p.y - MARGIN) / TILE)
    if (x < 0 || y < 0 || x >= view.map.width || y >= view.map.height) return null
    return { x, y }
  }
  const standing = view.own.filter(u => !u.broken)
  const ownAt = (t) => standing.filter(u => u.position.x === t.x && u.position.y === t.y)
  // Units whose counter is within reach of the finger, nearest first.
  const ownNear = (event) => {
    const p = toMap(event)
    const scale = svg.getScreenCTM().a || 1
    return standing
      .map(u => ({ u, d: Math.hypot(cx(u.position.x) - p.x, cy(u.position.y) - p.y) * scale }))
      .filter(c => c.d <= REACH)
      .sort((a, b) => a.d - b.d)
      .map(c => c.u)
  }

  const touches = new Map()
  let pinch = null
  let down = null
  let pan = null
  const gap = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }
  svg.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touches.size >= 2) { down = null; pinch = { last: gap() }; return }
    }
    const t = tileAt(event)
    if (!t) return
    const near = ownNear(event)
    down = { t, unit: near.length === 1 ? near[0] : null, x: event.clientX, y: event.clientY }
    if (event.pointerType === 'mouse' && !down.unit) pan = { x: event.clientX, y: event.clientY }
  })
  svg.addEventListener('pointermove', (event) => {
    if (pan && event.pointerType === 'mouse') {
      if (!(event.buttons & 1)) { pan = null; return }
      handlers.onPan?.(event.clientX - pan.x, event.clientY - pan.y)
      pan = { x: event.clientX, y: event.clientY }
      return
    }
    if (!touches.has(event.pointerId)) return
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!pinch || touches.size < 2) return
    const [a, b] = [...touches.values()]
    const now = gap()
    if (pinch.last > 0 && now > 0) handlers.onPinch?.(now / pinch.last, (a.x + b.x) / 2, (a.y + b.y) / 2)
    pinch.last = now
  })
  const lift = (event) => {
    touches.delete(event.pointerId)
    if (touches.size === 0) setTimeout(() => { pinch = null }, 0)
  }
  svg.addEventListener('pointerup', (event) => {
    pan = null
    const wasPinch = pinch !== null
    lift(event)
    if (wasPinch || !down) return
    const start = down
    down = null
    const t = tileAt(event)
    if (!t) return
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
    const sameTile = t.x === start.t.x && t.y === start.t.y

    // Dragged one of yours to somewhere else: that is an order.
    if (start.unit && moved && !sameTile) return handlers.onOrder(start.unit, t.x, t.y)
    // A drag that was not from a unit is the map being scrolled.
    if (moved) return
    const picked = getPicked()
    // With a unit picked, a tap on a unit's own tile picks again; anywhere
    // else it is an order. With none picked, a tap near units picks one.
    const here = picked ? ownAt(t) : ownNear(event)
    if (here.length > 1) return handlers.onStack(here)
    if (here.length === 1) return handlers.onPick(picked === here[0].id ? null : here[0].id)
    if (picked) {
      const unit = view.own.find(u => u.id === picked)
      if (unit) return handlers.onOrder(unit, t.x, t.y)
    }
    handlers.onPlace(t.x, t.y)
  })
  svg.addEventListener('pointercancel', (event) => { down = null; lift(event) })
}
