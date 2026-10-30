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
  const role = String(unit.role ?? '')
  if (/archer|bow|sling|skirmish/.test(role)) return 'bow'
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
function counter(unit, { side, own, selected, ghost, label, shift = 0 }) {
  const kind = kindOf(unit)
  const fill = ghost ? 'none' : `var(--side-${side})`
  const ink = ghost ? 'var(--ghost)' : `var(--side-${side}-on)`
  const dash = ghost || unit.hidden ? ' stroke-dasharray="3 2"' : ''
  const opacity = ghost ? 0.75 : (unit.broken ? 0.45 : (unit.hidden ? 0.8 : 1))
  const strength = own && unit.maxStrength
    ? `<rect x="-10" y="8.5" width="20" height="2.4" style="fill: var(--paper-edge)"/><rect x="-10" y="8.5" width="${Math.max(0, Math.round(20 * unit.strength / unit.maxStrength))}" height="2.4" style="fill: var(--ink)"/>`
    : ''
  const x = cx(unit.position.x) + shift
  const y = cy(unit.position.y) + shift
  return `
    <g class="counter" transform="translate(${x},${y})" opacity="${opacity}">
      <g transform="scale(${SCALE})">
        ${selected ? '<rect x="-14" y="-11" width="28" height="25" fill="none" style="stroke: var(--ink)" stroke-width="1.6"/>' : ''}
        <rect x="-10" y="-7" width="20" height="14" style="fill: ${fill}; stroke: ${ghost ? 'var(--ghost)' : 'var(--ink)'}" stroke-width="1.1"${dash}/>
        <g style="stroke: ${ink}; fill: ${ink}" stroke-width="1.3" stroke-linecap="square">${ghost ? '<text y="4" text-anchor="middle" font-size="11" style="stroke: none">?</text>' : symbol(kind)}</g>
        ${strength}
      </g>
      ${label ? `<text y="${own ? 27 : 24}" text-anchor="middle" font-size="10" class="unit-name" style="fill: var(--ink); font-family: var(--font-ui)">${esc(label)}</text>` : ''}
    </g>`
}

// Units on one tile cascade a little, with one label naming them all.
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
      const top = i === group.length - 1
      const label = !top ? null : opts.ghost
        ? `last seen ${u.minutesAgo ? `${u.minutesAgo} min ago` : 'just now'}`
        : group.map(g => g.name).join(', ')
      out.push(counter(u, { ...opts, ghost: opts.ghost, selected: opts.selectedId === u.id, label, shift: i * 5 }))
    })
  }
  return out.join('')
}

// ── The whole map ──────────────────────────────────────
export function drawMap(view, { selectedId = null } = {}) {
  const { width, height, terrain, landmarks } = view.map
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
  parts.push(`<g text-anchor="middle" font-size="11" font-style="italic" style="fill: var(--landmark-ink); font-family: var(--font-display)" aria-hidden="true">${
    (landmarks ?? []).filter(l => l.kind !== 'road' && l.kind !== 'river').map(l => `<text x="${cx(l.centre.x)}" y="${cy(l.centre.y) - 12}" class="landmark">${esc(l.name)}</text>`).join('')
  }</g>`)

  // Objectives: a dashed ring round the ground, and its name.
  for (const o of view.objectives ?? []) {
    const xs = o.tiles.map(t => t.x)
    const ys = o.tiles.map(t => t.y)
    const x0 = MARGIN + Math.min(...xs) * TILE - 3
    const y0 = MARGIN + Math.min(...ys) * TILE - 3
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * TILE + 6
    const h = (Math.max(...ys) - Math.min(...ys) + 1) * TILE + 6
    const held = o.holder ? ` (held by ${o.holder === side ? 'you' : 'the enemy'})` : ''
    parts.push(`<g aria-hidden="true"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="6" fill="none" style="stroke: var(--objective)" stroke-width="2" stroke-dasharray="6 4"/>
      <text x="${x0 + w / 2}" y="${y0 + h + 13}" text-anchor="middle" font-size="11" font-weight="600" style="fill: var(--objective); font-family: var(--font-display)">${esc(o.name + held)}</text></g>`)
  }

  // Orders in force: dashed arrows from each unit to where it is going.
  for (const u of view.own) {
    if (!u.target || u.broken) continue
    if (u.target.x === u.position.x && u.target.y === u.position.y) continue
    parts.push(`<path d="M${cx(u.position.x)} ${cy(u.position.y)}L${cx(u.target.x)} ${cy(u.target.y)}" fill="none" style="stroke: var(--order-arrow)" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#arrow)" opacity="0.8"/>`)
  }

  // Units: enemies as known, then yours on top.
  const enemies = view.enemies ?? []
  parts.push(drawUnits(enemies.filter(e => e.status !== 'visible'), { side: enemySide, own: false, ghost: true }))
  parts.push(drawUnits(enemies.filter(e => e.status === 'visible'), { side: enemySide, own: false, ghost: false }))
  parts.push(drawUnits(view.own, { side, own: true, ghost: false, selectedId }))

  const seen = (view.enemies ?? []).filter(e => e.status === 'visible').length
  const label = `Map of ${view.map.name}. Your ${view.own.length} units are shown; ${seen} enemy units in sight` +
    `${(view.objectives ?? []).length ? `; objectives: ${view.objectives.map(o => o.name).join(', ')}` : ''}. The Army tab lists every unit in words.`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">${parts.join('')}
    <style>.unit-name { paint-order: stroke; stroke: var(--paper); stroke-width: 3px; stroke-linejoin: round; } .sym-fill { fill: currentColor; }</style>
  </svg>`
}

// ── Gestures ───────────────────────────────────────────
/**
 * Wire the map up. handlers:
 *   onPick(unitId | null)        a unit of yours was tapped (or the pick cleared)
 *   onOrder(unit, x, y)          a picked unit was pointed at a place
 *   onPlace(x, y)                a place was tapped with no unit picked
 */
export function attachGestures(svg, view, getPicked, handlers) {
  const tileAt = (event) => {
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    const x = Math.floor((p.x - MARGIN) / TILE)
    const y = Math.floor((p.y - MARGIN) / TILE)
    if (x < 0 || y < 0 || x >= view.map.width || y >= view.map.height) return null
    return { x, y }
  }
  const ownAt = (t) => view.own.find(u => !u.broken && u.position.x === t.x && u.position.y === t.y)

  let down = null
  svg.addEventListener('pointerdown', (event) => {
    const t = tileAt(event)
    if (!t) return
    down = { t, unit: ownAt(t), x: event.clientX, y: event.clientY }
  })
  svg.addEventListener('pointerup', (event) => {
    if (!down) return
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
    // Tapped one of yours: pick it (tap again to let it go).
    const here = ownAt(t)
    const picked = getPicked()
    if (here) return handlers.onPick(picked === here.id ? null : here.id)
    // A unit is picked and a place is tapped: that is an order.
    if (picked) {
      const unit = view.own.find(u => u.id === picked)
      if (unit) return handlers.onOrder(unit, t.x, t.y)
    }
    handlers.onPlace(t.x, t.y)
  })
  svg.addEventListener('pointercancel', () => { down = null })
}
