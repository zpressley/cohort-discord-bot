// src/web/public/motion.js
//
// The map moves between turns (ruled 2026-11-28: "can we have transition
// movement between turns"). Drawing only: it changes nothing about the
// battle or what is told.
//
// It moves only between two views his side was given, and adds nothing to
// them (fog of war is held on the server; nothing more is asked of it):
//   - a unit in both, where he could see it in both (his own, or an enemy
//     in sight in both, or last seen in both), slides in a straight line
//     from where his map showed it to where it shows it now: two places he
//     knew, and no path between them;
//   - a unit new to his map fades in where it is shown; one gone from it,
//     or lost from sight (in sight before, last seen now), fades out where
//     it was while its "last seen" mark fades in;
//   - his units that broke, were destroyed or left the field say so, there,
//     for a moment ("broke", "destroyed", "left the field": words.js);
//   - where his men, or an enemy unit he sees in both, lost men, a short
//     pulse: the fight;
//   - the labels, the orders' arrows and the camps fade in at the end.
// With reduced motion asked for, none of it: the map changes at once.
// A tap finishes it at once (app.js).

import { TILE } from './map.js'

const NS = 'http://www.w3.org/2000/svg'
export const MOVE_MS = 2000
export const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

const keyOf = (side, id) => `${side}:${id}`
function known(view) {
  const out = new Map()
  for (const u of view.own ?? []) if (u.position) out.set(keyOf('own', u.id), { position: u.position, seen: true, broken: Boolean(u.broken), strength: u.strength })
  for (const e of view.enemies ?? []) if (e.position) out.set(keyOf('enemy', e.id), { position: e.position, seen: e.status === 'visible', strength: e.strength })
  return out
}
const centre = (p) => ({ x: 26 + p.x * TILE + TILE / 2, y: 26 + p.y * TILE + TILE / 2 })

/**
 * Move the map just drawn (`svg`, drawn from `after`) from the view before
 * (`before`), whose counters were `leaving` (the old map's `.mover`s).
 * Returns { finish(), done }: finish() puts everything where it ends at
 * once; done resolves when it has.
 */
export function moveBetween(svg, before, after, leaving = [], { ms = MOVE_MS, k = 1 } = {}) {
  const anims = []
  const extra = []
  const was = known(before)
  const now = known(after)
  const slid = new Set()

  for (const g of svg.querySelectorAll('.mover')) {
    const key = keyOf(g.dataset.side, g.dataset.unit)
    const old = was.get(key)
    const seen = g.dataset.seen === '1'
    if (old && old.seen === seen) {
      slid.add(key)
      const dx = (old.position.x - Number(g.dataset.x)) * TILE
      const dy = (old.position.y - Number(g.dataset.y)) * TILE
      if (dx || dy) anims.push(g.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }], { duration: ms, easing: 'ease-in-out' }))
    } else {
      anims.push(g.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' }))
    }
  }

  // What is gone from the map, or lost from sight: the old counter fades
  // where it was.
  const layer = document.createElementNS(NS, 'g')
  layer.setAttribute('class', 'leaving')
  layer.setAttribute('aria-hidden', 'true')
  for (const n of leaving) {
    if (slid.has(keyOf(n.dataset.side, n.dataset.unit))) continue
    for (const t of n.querySelectorAll('.unit-name')) t.remove()
    layer.appendChild(n)
    anims.push(n.animate([{ opacity: 1 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: ms, easing: 'ease-in', fill: 'forwards' }))
  }
  const labels = svg.querySelector('.map-labels')
  svg.insertBefore(layer, labels)
  extra.push(layer)

  // His units that broke, were destroyed or left the field: said where.
  const fell = new Map((after.fallen ?? []).map(f => [f.id, f.fled ? 'left the field' : 'destroyed']))
  const marks = []
  for (const u of after.own ?? []) {
    const old = was.get(keyOf('own', u.id))
    if (old && !old.broken && u.broken && u.position) marks.push({ at: u.position, said: 'broke' })
  }
  for (const [id, said] of fell) {
    const old = was.get(keyOf('own', id))
    if (old && !now.has(keyOf('own', id))) marks.push({ at: old.position, said })
  }
  // A fight: where men were lost that he can count, in both views.
  const pulses = []
  for (const [key, n] of now) {
    const old = was.get(key)
    if (!old || !old.seen || !n.seen) continue
    if (typeof old.strength === 'number' && typeof n.strength === 'number' && n.strength < old.strength) pulses.push(n.position)
  }
  for (const at of pulses) {
    const c = centre(at)
    const ring = document.createElementNS(NS, 'circle')
    ring.setAttribute('cx', c.x)
    ring.setAttribute('cy', c.y)
    ring.setAttribute('r', TILE * 0.9)
    ring.setAttribute('class', 'fight-pulse')
    ring.setAttribute('aria-hidden', 'true')
    ring.style.cssText = 'fill: none; stroke: var(--ink); stroke-width: 2.5; transform-box: fill-box; transform-origin: center; opacity: 0'
    svg.insertBefore(ring, labels)
    extra.push(ring)
    anims.push(ring.animate([{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 0.9, transform: 'scale(0.7)', offset: 0.15 }, { opacity: 0, transform: 'scale(1.7)' }],
      { duration: Math.round(ms * 0.45), delay: Math.round(ms * 0.55), easing: 'ease-out', fill: 'forwards' }))
  }
  for (const m of marks) {
    const c = centre(m.at)
    const t = document.createElementNS(NS, 'text')
    t.setAttribute('x', c.x)
    t.setAttribute('y', (c.y - 16 * k).toFixed(1))
    t.setAttribute('text-anchor', 'middle')
    t.setAttribute('font-size', (12 * k).toFixed(1))
    t.setAttribute('font-weight', '700')
    t.setAttribute('class', 'fate-mark')
    t.style.cssText = 'fill: var(--ink); font-family: var(--font-ui); paint-order: stroke; stroke: var(--paper); stroke-width: 3px; stroke-linejoin: round; opacity: 0'
    t.textContent = m.said
    svg.appendChild(t)
    extra.push(t)
    anims.push(t.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: ms + 1200, delay: Math.round(ms * 0.4), fill: 'forwards' }))
  }

  // The words, the orders' arrows, his range and the camps, at the end.
  for (const g of svg.querySelectorAll('.map-labels, .map-orders, .immediate, .camp')) {
    anims.push(g.animate([{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: ms }))
  }

  let over = false
  const clear = () => {
    if (over) return
    over = true
    for (const n of extra) n.remove()
  }
  const done = Promise.all(anims.map(a => a.finished.catch(() => null))).then(clear)
  return {
    finish() {
      for (const a of anims) { try { a.finish() } catch { /* gone with the map */ } }
      clear()
    },
    get running() { return !over },
    done
  }
}
