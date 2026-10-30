// src/web/public/app.js
//
// The browser app: one page, four screens (docs/stage-4/UX.md).
//
//   /            opens the battle waiting on you (ruled 2026-10-30), else
//                your battles, else the muster
//   /battles     your battles
//   /muster      muster a new battle
//   /b/<link>    the Command Tent for one side of one battle
//
// The links to your battles are kept in this browser (localStorage); the
// server holds the battles. Everything shown about a battle comes from the
// server already cut to your side's view.

import { drawMap, attachGestures, gridRef, terrainWords, TILE } from './map.js'

const app = document.getElementById('app')
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ── This browser's battles ─────────────────────────────
const SEATS_KEY = 'cohort.seats'
function loadSeats() {
  try { return JSON.parse(localStorage.getItem(SEATS_KEY)) ?? [] } catch { return [] }
}
function saveSeat(seat) {
  try {
    const list = loadSeats().filter(s => s.token !== seat.token)
    list.unshift(seat)
    localStorage.setItem(SEATS_KEY, JSON.stringify(list.slice(0, 50)))
  } catch { /* private browsing: the link itself still works */ }
}
function loadDraft(token) {
  try { return localStorage.getItem(`cohort.draft.${token}`) ?? '' } catch { return '' }
}
function saveDraft(token, text) {
  try { text ? localStorage.setItem(`cohort.draft.${token}`, text) : localStorage.removeItem(`cohort.draft.${token}`) } catch { /* fine */ }
}

// ── Talking to the server ──────────────────────────────
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Something went wrong'), { status: res.status })
  return data
}

// ── Words ──────────────────────────────────────────────
function clock(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!minutes) return 'the battle has not begun'
  return `${h ? `${h} h ` : ''}${m ? `${m} min ` : ''}of battle`
}
function ago(at) {
  if (!at) return ''
  const minutes = Math.round((Date.now() - at) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
const STATUS = { 'your-orders': 'Your orders', waiting: 'Waiting on the enemy', finished: 'Finished' }
const WHY = {
  contact: 'blows were struck', sighting: 'the enemy was sighted', time: 'an hour passed',
  stalled: 'all was quiet', objective: 'ground changed hands', decided: 'the battle was decided',
  surrender: 'a commander yielded'
}
const sideName = (side) => side.charAt(0).toUpperCase() + side.slice(1)
// The engine gives its reason from the winner's side ("enemy army
// broken"); a commander reads it from their own.
const REASONS = {
  'enemy army broken': ['The enemy army broke', 'Your army broke'],
  'enemy army collapsed': ['The enemy army collapsed', 'Your army collapsed'],
  'enemy surrendered': ['The enemy yielded', 'You yielded'],
  'objectives held': ['You held the field', 'The enemy held the field'],
  'time ran out: fewer losses': ['The day ended, and the enemy lost more', 'The day ended, and you lost more'],
  'time ran out: held more objectives': ['The day ended with more ground in your hands', 'The day ended with more ground in the enemy\'s hands']
}
function verdictWords(battle) {
  const o = battle.outcome
  if (!o) return null
  if (o.winner === 'draw') {
    const why = { 'mutual collapse': 'Both armies broke', 'mutual ruin': 'Both armies were ruined', 'time ran out: equal losses': 'The day ended with losses even' }
    return { title: 'A draw', reason: why[o.reason] ?? o.reason }
  }
  const won = o.winner === battle.side
  const words = REASONS[o.reason]
  return { title: won ? 'Victory' : 'Defeat', reason: words ? words[won ? 0 : 1] : o.reason }
}

// ── Routing ────────────────────────────────────────────
let stopPolling = () => {}
function go(path, { replace = false } = {}) {
  replace ? history.replaceState({}, '', path) : history.pushState({}, '', path)
  route()
}
document.addEventListener('click', (event) => {
  const a = event.target.closest('a[data-link]')
  if (!a || event.metaKey || event.ctrlKey) return
  event.preventDefault()
  go(a.getAttribute('href'))
})
window.addEventListener('popstate', route)

async function route() {
  stopPolling()
  stopPolling = () => {}
  const path = location.pathname
  const seat = path.match(/^\/b\/([A-Za-z0-9_-]{8,})$/)
  try {
    if (seat) return await tent(seat[1])
    if (path === '/battles') return await battles()
    if (path === '/muster') return await muster()
    return await home()
  } catch (error) {
    app.innerHTML = `<main class="page"><h1>Cohort</h1><p class="error">${esc(error.status === 404 ? 'There is no battle at this link.' : error.message)}</p><a href="/battles" data-link>Your battles</a></main>`
  }
}

// ── Home: straight to the battle waiting on you ────────
async function home() {
  const seats = loadSeats()
  if (seats.length === 0) return go('/muster', { replace: true })
  const lines = await api('GET', `/api/seats?tokens=${seats.map(s => s.token).join(',')}`)
  const waiting = lines.filter(l => l.status === 'your-orders').sort((a, b) => b.updatedAt - a.updatedAt)
  if (waiting.length > 0) return go(`/b/${waiting[0].token}`, { replace: true })
  return go('/battles', { replace: true })
}

// ── Your battles ───────────────────────────────────────
async function battles() {
  const seats = loadSeats()
  const lines = seats.length ? await api('GET', `/api/seats?tokens=${seats.map(s => s.token).join(',')}`) : []
  const group = (status) => lines.filter(l => l.status === status)
  const card = (l) => {
    const verdict = verdictWords(l)
    const opponent = l.opponent === 'standing' ? 'against the standing orders' : 'against a friend'
    const when = l.status === 'waiting' ? `your orders went ${ago(l.sentAt)}` : `turn ${l.turn} · ${clock(l.minutes)}`
    return `<a class="battle-link${l.status === 'your-orders' ? ' mine' : ''}" href="/b/${esc(l.token)}" data-link>
      <strong>${esc(l.title)}</strong>
      <span>${esc(sideName(l.side))}, ${opponent}</span>
      <span>${esc(verdict ? `${verdict.title}: ${verdict.reason}` : when)}</span>
    </a>`
  }
  const section = (title, list) => list.length ? `<p class="label-caps">${title}</p>${list.map(card).join('')}` : ''
  app.innerHTML = `
    <header class="bar"><strong style="font-family: var(--font-display); font-size: 22px">Cohort</strong><span class="note">Your battles</span></header>
    <main class="page">
      ${lines.length === 0 ? '<p class="note">No battles yet in this browser. A battle\'s link brings it here too.</p>' : ''}
      ${section('Waiting on you', group('your-orders'))}
      ${section('Waiting on the enemy', group('waiting'))}
      ${section('Finished', group('finished'))}
      <a class="btn btn-main btn-wide" href="/muster" data-link>Muster a new battle</a>
    </main>`
}

// ── Muster ─────────────────────────────────────────────
async function muster() {
  const [scenarios, maps] = await Promise.all([api('GET', '/api/scenarios'), api('GET', '/api/maps')])
  app.innerHTML = `
    <header class="bar"><a href="/battles" data-link>Your battles</a><strong style="font-family: var(--font-display); font-size: 18px">Muster a battle</strong><span></span></header>
    <main class="page">
      <form id="muster" class="page" style="padding: 0">
        <label class="field">The field
          <select name="map">${maps.map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('')}</select>
        </label>
        <label class="field">The armies
          <select name="scenario">${scenarios.map(s => `<option value="${esc(s.id)}">${esc(s.title.charAt(0).toUpperCase() + s.title.slice(1))}</option>`).join('')}</select>
        </label>
        <fieldset>
          <legend>Your opponent</legend>
          <label class="choice"><input type="radio" name="opponent" value="standing" checked> The standing orders (play alone)</label>
          <label class="choice"><input type="radio" name="opponent" value="friend"> A friend, by link</label>
        </fieldset>
        <label class="field">You command
          <select name="side"><option value="red">Red, from the west</option><option value="blue">Blue, from the east</option></select>
        </label>
        <label class="field">When the day ends
          <select name="timeLimit"><option value="240">After 4 hours of battle</option><option value="">When an army breaks</option></select>
        </label>
        <label class="field">Ground to hold (optional)
          <input type="text" name="objectives" placeholder="e.g. Harrow Bridge, C6" autocomplete="off">
        </label>
        <button class="btn btn-main btn-wide" type="submit">Muster the armies</button>
        <p class="note">Against a friend, you get a link to send them.</p>
      </form>
      <div id="shared"></div>
    </main>`
  document.getElementById('muster').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = new FormData(event.target)
    const button = event.target.querySelector('button[type="submit"]')
    button.disabled = true
    try {
      const side = form.get('side')
      const opponent = form.get('opponent')
      const result = await api('POST', '/api/battles', {
        scenario: form.get('scenario'), map: form.get('map'), opponent, side,
        timeLimitMinutes: form.get('timeLimit') ? Number(form.get('timeLimit')) : null,
        objectives: String(form.get('objectives') ?? '').split(',').map(s => s.trim()).filter(Boolean)
      })
      const mine = result.seats[side]
      const title = `${maps.find(m => m.id === form.get('map'))?.title ?? 'Battle'}: ${scenarios.find(s => s.id === form.get('scenario'))?.title ?? ''}`
      saveSeat({ token: mine, title, side })
      const friendSide = Object.keys(result.seats).find(s => s !== side)
      if (opponent !== 'friend' || !friendSide) return go(`/b/${mine}`)
      const link = `${location.origin}/b/${result.seats[friendSide]}`
      event.target.hidden = true
      document.getElementById('shared').innerHTML = `
        <div class="share">
          <strong>Send this link to your opponent.</strong>
          <span>They command ${esc(sideName(friendSide))}. Anyone with the link plays that side.</span>
          <code id="friend-link">${esc(link)}</code>
          <button class="btn" type="button" id="copy">Copy the link</button>
        </div>
        <a class="btn btn-main btn-wide" href="/b/${esc(mine)}" data-link>To your Command Tent</a>`
      document.getElementById('copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(link); document.getElementById('copy').textContent = 'Copied' } catch { /* select by hand */ }
      })
    } catch (error) {
      button.disabled = false
      event.target.insertAdjacentHTML('beforeend', `<p class="error">${esc(error.message)}</p>`)
    }
  })
}

// ── The Command Tent ───────────────────────────────────
async function tent(token) {
  const state = {
    token,
    view: null,
    tab: 'orders',
    picked: null,
    place: null,
    flash: null,
    draft: loadDraft(token),
    readback: null,
    editing: false,
    sending: false,
    zoom: null,
    // The verdict's replay: the battle as you saw it after an earlier turn.
    shown: null
  }

  async function load() {
    state.view = await api('GET', `/api/seat/${token}`)
    const b = state.view.battle
    saveSeat({ token, title: b.title, side: b.side })
    document.title = `${b.title} · Cohort`
    if (b.status === 'finished') { state.tab = 'orders'; state.picked = null; state.place = null; state.flash = null }
  }
  await load()

  app.innerHTML = `
    <header class="bar" id="bar"></header>
    <div class="tent">
      <section class="map-wrap" aria-label="The map">
        <div class="map-scroll" id="map-scroll"></div>
        <div class="map-tools">
          <button class="btn" type="button" id="zoom-in" aria-label="Zoom in">+</button>
          <button class="btn" type="button" id="zoom-out" aria-label="Zoom out">−</button>
        </div>
        <div class="map-hint" id="map-hint"></div>
      </section>
      <aside class="panel" aria-label="Army, orders and dispatches">
        <div class="tabs" role="tablist" id="tabs"></div>
        <div class="panel-body" id="panel-body" role="tabpanel"></div>
        <div class="panel-foot" id="panel-foot"></div>
      </aside>
    </div>`
  const scroll = document.getElementById('map-scroll')

  function renderBar() {
    const b = state.view.battle
    const chip = b.status === 'your-orders' ? '<span class="chip chip-dark">Your orders</span>' : `<span class="chip">${esc(STATUS[b.status])}</span>`
    document.getElementById('bar').innerHTML = `
      <a href="/battles" data-link>Battles</a>
      <div class="bar-title"><strong>${esc(b.title)}</strong><span>${esc(sideName(b.side))} · turn ${b.turn} · ${esc(clock(b.minutes))}</span></div>
      ${chip}`
  }

  function renderMap({ keepScroll = true } = {}) {
    const left = scroll.scrollLeft
    const top = scroll.scrollTop
    const showing = state.shown ?? state.view
    scroll.innerHTML = drawMap(showing, { selectedId: state.picked })
    const svg = scroll.querySelector('svg')
    const W = Number(svg.getAttribute('width'))
    if (state.zoom === null) state.zoom = Math.max(scroll.clientWidth / W, 15 / TILE)
    svg.style.width = `${Math.round(W * state.zoom)}px`
    svg.style.height = 'auto'
    if (state.shown) { if (keepScroll) { scroll.scrollLeft = left; scroll.scrollTop = top } return }
    attachGestures(svg, state.view, () => state.picked, {
      onPick: (id) => { state.picked = id; state.place = null; state.flash = null; renderMap(); renderHint(); if (state.tab === 'army') renderPanel() },
      onOrder: (unit, x, y) => addLine(`${unit.name} to ${gridRef(x, y)}`),
      onPlace: (x, y) => { state.place = { x, y }; state.flash = null; renderHint() }
    })
    if (keepScroll) { scroll.scrollLeft = left; scroll.scrollTop = top }
  }

  function centreOnArmy() {
    const own = state.view.own
    if (!own.length) return
    const svg = scroll.querySelector('svg')
    const scale = svg.clientWidth / Number(svg.getAttribute('width'))
    const mx = own.reduce((s, u) => s + u.position.x, 0) / own.length
    const my = own.reduce((s, u) => s + u.position.y, 0) / own.length
    scroll.scrollLeft = (26 + mx * TILE) * scale - scroll.clientWidth / 2
    scroll.scrollTop = (26 + my * TILE) * scale - scroll.clientHeight / 2
  }

  function zoomBy(factor) {
    const svg = scroll.querySelector('svg')
    const W = Number(svg.getAttribute('width'))
    const centreX = (scroll.scrollLeft + scroll.clientWidth / 2) / svg.clientWidth
    const centreY = (scroll.scrollTop + scroll.clientHeight / 2) / svg.clientHeight
    state.zoom = Math.min(2.5, Math.max(scroll.clientWidth / W / 1.2, state.zoom * factor))
    svg.style.width = `${Math.round(W * state.zoom)}px`
    scroll.scrollLeft = centreX * svg.clientWidth - scroll.clientWidth / 2
    scroll.scrollTop = centreY * svg.clientHeight - scroll.clientHeight / 2
  }
  document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.4))
  document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.4))

  function renderHint() {
    const hint = document.getElementById('map-hint')
    const finished = state.view.battle.status === 'finished'
    if (state.flash) {
      hint.innerHTML = `<span>Added to your orders: <strong>${esc(state.flash)}</strong></span>`
    } else if (state.picked) {
      const unit = state.view.own.find(u => u.id === state.picked)
      hint.innerHTML = `<span><strong>${esc(unit?.name)}</strong> picked: tap a place, or drag them there.</span><button class="btn btn-quiet" type="button" id="unpick">Let go</button>`
      document.getElementById('unpick').addEventListener('click', () => { state.picked = null; renderMap(); renderHint() })
    } else if (state.place) {
      const ref = gridRef(state.place.x, state.place.y)
      hint.innerHTML = `<span><strong>${esc(ref)}</strong> · ${esc(terrainWords(state.view, state.place.x, state.place.y))}</span>` +
        (finished ? '' : `<button class="btn btn-quiet" type="button" id="use-place">Add to orders</button>`)
      document.getElementById('use-place')?.addEventListener('click', () => addText(ref))
    } else {
      hint.innerHTML = finished ? '<span>The battle is over.</span>' : '<span>Tap one of your units, then a place, to order it there.</span>'
    }
  }

  // ── Orders from the map ──
  function addLine(line) {
    state.draft = state.draft.replace(/\s+$/, '')
    state.draft = state.draft ? `${state.draft}\n${line}` : line
    saveDraft(token, state.draft)
    state.picked = null
    state.place = null
    state.flash = line
    state.readback = null
    state.editing = true
    state.tab = 'orders'
    renderMap(); renderHint(); renderPanel()
  }
  function addText(text) {
    state.draft = state.draft ? `${state.draft.replace(/\s+$/, '')} ${text}` : text
    saveDraft(token, state.draft)
    state.place = null
    state.flash = text
    state.editing = true
    state.tab = 'orders'
    renderHint(); renderPanel()
    document.getElementById('orders')?.focus()
  }

  // ── The panel ──
  function renderPanel() {
    const tabs = [['army', 'Army'], ['orders', state.view.battle.status === 'finished' ? 'Verdict' : 'Orders'], ['dispatches', 'Dispatches']]
    document.getElementById('tabs').innerHTML = tabs.map(([id, label]) =>
      `<button type="button" role="tab" aria-selected="${state.tab === id}" data-tab="${id}">${label}</button>`).join('')
    document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; renderPanel() }))
    const body = document.getElementById('panel-body')
    const foot = document.getElementById('panel-foot')
    foot.innerHTML = ''
    if (state.tab === 'army') army(body)
    else if (state.tab === 'dispatches') dispatches(body)
    else orders(body, foot)
  }

  function meter(label, value, max) {
    const pct = Math.max(0, Math.min(100, Math.round(100 * value / (max || 1))))
    return `<div class="bar-meter"><span>${label}</span><div class="track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><div class="fill" style="width: ${pct}%"></div></div></div>`
  }

  function army(body) {
    const v = state.view
    const flags = (u) => [
      u.broken ? '<span class="flag flag-warn">broken</span>' : '',
      u.hidden ? '<span class="flag">hidden</span>' : '',
      u.crowding && u.crowding !== 'organized' ? `<span class="flag flag-warn">${esc(u.crowding)}</span>` : ''
    ].join('')
    const units = v.own.map(u => `
      <div class="unit-card" aria-pressed="${u.id === state.picked}">
        <header><h3>${esc(u.name)}</h3><span class="where">${esc(u.at)} · ${esc(terrainWords(v, u.position.x, u.position.y))}</span></header>
        <span class="note">${esc([u.quality, u.role].filter(Boolean).join(' ').replace(/_/g, ' '))}, ${u.strength} of ${u.maxStrength} men</span>
        <div class="bars">${meter('Men', u.strength, u.maxStrength)}${meter('Morale', u.morale, 100)}${meter('Wind', u.stamina, u.staminaPool)}</div>
        <p class="unit-order"><strong>Orders:</strong> ${esc(u.order)}</p>
        <div class="flags">${flags(u)}</div>
        ${v.battle.status === 'finished' || u.broken ? '' : `<div style="display: flex; gap: 8px; flex-wrap: wrap">
          <button class="btn btn-quiet" type="button" data-pick="${esc(u.id)}">${u.id === state.picked ? 'Picked on the map' : 'Pick on the map'}</button>
          <button class="btn btn-quiet" type="button" data-order="${esc(u.name)}">Give an order</button>
        </div>`}
      </div>`).join('')
    const fallen = v.fallen.length ? `<p class="label-caps">Lost</p>${v.fallen.map(f => `<p class="note">${esc(f.name)}: ${f.fled ? 'fled the field' : 'destroyed'}</p>`).join('')}` : ''
    const seen = v.enemies.length
      ? `<p class="label-caps">The enemy, as you know it</p>${v.enemies.map(e => `<p class="note">${esc(e.name)} at ${esc(e.at)}: ${e.status === 'visible' ? `in sight, about ${e.strength} men` : `last seen ${e.minutesAgo} min ago`}</p>`).join('')}`
      : '<p class="note">No enemy in sight.</p>'
    body.innerHTML = `${units || '<p class="note">No units standing.</p>'}${fallen}${seen}`
    body.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      state.picked = state.picked === b.dataset.pick ? null : b.dataset.pick
      renderMap(); renderHint(); renderPanel()
    }))
    body.querySelectorAll('[data-order]').forEach(b => b.addEventListener('click', () => {
      state.draft = state.draft ? `${state.draft.replace(/\s+$/, '')}\n${b.dataset.order} ` : `${b.dataset.order} `
      state.editing = true
      state.tab = 'orders'
      renderPanel()
      const box = document.getElementById('orders')
      box?.focus()
      box?.setSelectionRange(box.value.length, box.value.length)
    }))
  }

  function dispatches(body) {
    const list = state.view.dispatches
    if (!list.length) { body.innerHTML = '<p class="note">No dispatches yet. They come in once the first turn runs.</p>'; return }
    body.innerHTML = list.map((d, i) => `
      <article class="dispatch">
        <header><h3>Turn ${d.turn}</h3><span class="when">${esc(clock(d.minutes))} · ${esc(WHY[d.interrupt] ?? d.interrupt)}</span></header>
        ${d.narrated ? `<p class="told">${esc(d.narrated)}</p>` : ''}
        ${d.narrated
          ? `<details><summary>The plain account</summary><ul>${d.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul></details>`
          : `<ul>${d.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`}
      </article>`).join('')
  }

  function orders(body, foot) {
    const v = state.view
    const b = v.battle
    if (b.status === 'finished') return verdict(body)

    if (b.status === 'waiting' && !state.editing) {
      body.innerHTML = `
        <p class="calm">Your orders are with the army.</p>
        <p>${b.opponent === 'friend' ? 'The enemy commander has not answered yet.' : 'The turn is running.'} There is no hurry: close this page, and the turn will be here when you come back.</p>
        <p class="note">Sent ${esc(ago(v.pending?.at))}</p>
        <p class="label-caps">What you ordered</p>
        ${(v.pending?.understood ?? []).map(l => `<p class="readback">${esc(l)}</p>`).join('') || '<p class="note">No new orders: every unit keeps its last one.</p>'}`
      foot.innerHTML = '<button class="btn btn-wide" type="button" id="change">Change your orders before the turn runs</button>'
      document.getElementById('change').addEventListener('click', () => {
        state.editing = true
        state.draft = state.draft || v.pending?.text || ''
        renderPanel()
      })
      return
    }

    const rb = state.readback
    body.innerHTML = `
      <label for="orders" style="font-weight: 600; font-size: 14px">Your orders, as you would say them</label>
      <textarea id="orders" class="orders-box" spellcheck="false" placeholder="spears to the ridge to the east&#10;archers hide in the woods&#10;everyone advance">${esc(state.draft)}</textarea>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button class="btn" type="button" id="read-back">Read them back</button>
        ${state.draft ? '<button class="btn btn-quiet" type="button" id="clear">Clear</button>' : ''}
      </div>
      ${rb ? `
        ${rb.understood.length ? `<p class="label-caps">Your officers understood</p>${rb.understood.map(l => `<p class="readback">${esc(l)}</p>`).join('')}` : ''}
        ${rb.questions.map(q => `<p class="question">${esc(q)}</p>`).join('')}
        ${rb.error ? `<p class="error">${esc(rb.error)}</p>` : ''}` : ''}`
    foot.innerHTML = `
      <button class="btn btn-main btn-wide" type="button" id="send"${state.sending ? ' disabled' : ''}>${state.sending ? 'Sending…' : 'Send the orders'}</button>
      <p class="note" style="text-align: center">Units you give no order keep their last one.</p>`

    const box = document.getElementById('orders')
    box.addEventListener('input', () => { state.draft = box.value; state.readback = null; saveDraft(token, state.draft) })
    document.getElementById('clear')?.addEventListener('click', () => { state.draft = ''; state.readback = null; saveDraft(token, ''); renderPanel() })
    document.getElementById('read-back').addEventListener('click', async () => {
      try {
        state.readback = await api('POST', `/api/seat/${token}/read`, { text: state.draft })
      } catch (error) { state.readback = { understood: [], questions: [], error: error.message } }
      renderPanel()
    })
    document.getElementById('send').addEventListener('click', async () => {
      state.sending = true
      renderPanel()
      try {
        const result = await api('POST', `/api/seat/${token}/orders`, { text: state.draft })
        state.sending = false
        if (result.status === 'clarify') {
          state.readback = { understood: result.understood, questions: result.questions }
          return renderPanel()
        }
        state.draft = ''
        saveDraft(token, '')
        state.readback = null
        state.editing = false
        await load()
        if (result.status === 'turn-ran') state.tab = 'dispatches'
        renderAll()
        watch()
      } catch (error) {
        state.sending = false
        state.readback = { understood: [], questions: [], error: error.message }
        renderPanel()
      }
    })
  }

  function verdict(body) {
    const words = verdictWords(state.view.battle)
    const v = state.view.verdict
    body.innerHTML = `
      <div class="verdict" style="display: flex; flex-direction: column; gap: 8px">
        <h2>${esc(words.title)}</h2>
        <p>${esc(words.reason)}, after ${esc(clock(state.view.battle.minutes))}.</p>
      </div>
      ${v ? `<table class="losses"><thead><tr><th scope="col">Side</th><th scope="col">Standing</th><th scope="col">Fled</th><th scope="col">Fallen</th></tr></thead><tbody>
        ${Object.entries(v.sides).map(([s, n]) => `<tr><td>${esc(sideName(s))}${s === state.view.battle.side ? ' (you)' : ''}</td><td>${n.standing}</td><td>${n.fled}</td><td>${n.fallen}</td></tr>`).join('')}
      </tbody></table>` : ''}
      <label class="field" for="replay">Replay the battle, turn by turn
        <input id="replay" type="range" min="0" max="${state.view.battle.turn - 1}" value="${state.shown ? state.shown.turn : state.view.battle.turn - 1}" style="min-height: 44px">
      </label>
      <p class="note" id="replay-note">${state.shown ? replayWords(state.shown) : 'The field as the battle ended.'}</p>
      <a class="btn btn-wide" href="/battles" data-link>Your battles</a>`
    const slider = document.getElementById('replay')
    slider.addEventListener('change', async () => {
      const turn = Number(slider.value)
      const last = state.view.battle.turn - 1
      state.shown = turn >= last ? null : await api('GET', `/api/seat/${token}/replay?turn=${turn}`)
      document.getElementById('replay-note').textContent = state.shown ? replayWords(state.shown) : 'The field as the battle ended.'
      renderMap()
    })
  }

  function replayWords(shown) {
    return shown.turn === 0 ? 'The field before the first orders.' : `The field after turn ${shown.turn}, ${clock(shown.battle.minutes)}.`
  }

  function renderAll() {
    renderBar()
    renderMap()
    renderHint()
    renderPanel()
  }

  // A battle runs over days: while you wait, look in now and then, and
  // whenever you come back to the page.
  function watch() {
    stopPolling()
    if (state.view.battle.status !== 'waiting') return
    const check = async () => {
      try {
        const s = await api('GET', `/api/seat/${token}/summary`)
        if (s.status !== state.view.battle.status || s.turn !== state.view.battle.turn) {
          await load()
          if (s.status === 'your-orders') state.tab = 'dispatches'
          renderAll()
          watch()
        }
      } catch { /* try again later */ }
    }
    const timer = setInterval(check, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    stopPolling = () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }

  renderAll()
  centreOnArmy()
  watch()
}

route()
