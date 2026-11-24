// src/web/public/app.js
//
// The browser app: one page, four screens (docs/stage-4/UX.md).
//
//   /            opens the battle waiting on you (ruled 2026-10-30), else
//                your battles, else the muster
//   /battles     your battles
//   /muster      muster a new battle
//   /officers    your officers: who they are and what they have been through
//   /army/<link> a Commander's standard army, bought within his budget
//   /b/<link>    the Command Tent for one side of one battle
//
// The links to your battles, and the links to your Commanders (each with
// his own officers), are kept in this browser (localStorage); the server
// holds the battles and the officers. Everything shown about a battle comes from the
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
function howToHidden() {
  try { return localStorage.getItem('cohort.hideHowTo') === '1' } catch { return false }
}
function hideHowTo() {
  try { localStorage.setItem('cohort.hideHowTo', '1') } catch { /* it comes back next time */ }
}
function saveDraft(token, text) {
  try { text ? localStorage.setItem(`cohort.draft.${token}`, text) : localStorage.removeItem(`cohort.draft.${token}`) } catch { /* fine */ }
}

// ── Your Commanders ────────────────────────────────────
// Each is a private link the server gives this browser; his officers are
// kept under it. You may have several, and so several battles going: a
// Commander's army fights one battle at a time.
const COMMANDERS_KEY = 'cohort.commanders'
function commanderTokens() {
  try {
    const list = JSON.parse(localStorage.getItem(COMMANDERS_KEY)) ?? []
    const old = localStorage.getItem('cohort.commander')   // when there was only one
    return old && !list.includes(old) ? [old, ...list] : list
  } catch { return [] }
}
function saveCommanders(tokens) {
  try { localStorage.setItem(COMMANDERS_KEY, JSON.stringify(tokens)); localStorage.removeItem('cohort.commander') } catch { /* private browsing: this battle only */ }
}
// Your Commanders as the server knows them; one it has no record of is dropped.
async function loadCommanders() {
  const tokens = commanderTokens()
  const found = await Promise.all(tokens.map(async (token) => {
    try { return { token, ...(await api('GET', `/api/commander/${token}`)) } } catch (error) { if (error.status === 404) return null; throw error }
  }))
  const known = found.filter(Boolean)
  if (known.length !== tokens.length) saveCommanders(known.map(c => c.token))
  return known
}
async function newCommander(faction) {
  const { token } = await api('POST', '/api/commanders', { faction })
  saveCommanders([...commanderTokens(), token])
  return token
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
// (Not "waiting on the enemy": he is not told whether the battle is running
// or standing for the other Commander.)
const STATUS = { 'your-orders': 'Your orders', waiting: 'With the army', finished: 'Finished' }
const WHY = {
  contact: 'blows were struck', sighting: 'the enemy was sighted', time: 'an hour passed', long: 'a long while passed',
  commander: 'a Commander fell into enemy hands, or got out of them',
  stalled: 'all was quiet', ready: 'your orders were carried out', fire: 'there was shooting', rallied: 'a broken unit rallied', objective: 'ground changed hands', decided: 'the battle was decided',
  rider: 'a rider came back: he could not get through', night: 'night fell',
  surrender: 'a commander yielded'
}
const sideName = (side) => side.charAt(0).toUpperCase() + side.slice(1)
// An answer to "which woods?": the words that tell the choices apart, then
// the grid square ("The woods 100 m east · D7-NE").
const optionWords = (o) => {
  const label = o.label ? o.label.charAt(0).toUpperCase() + o.label.slice(1) : o.text
  return o.square && !label.includes(o.square) ? `${label} · ${o.square}` : label
}
// The engine gives its reason from the winner's side ("enemy army
// broken"); a commander reads it from their own.
const REASONS = {
  'enemy army broken': ['The enemy army broke', 'Your army broke'],
  'enemy army collapsed': ['The enemy army was destroyed', 'Your army was destroyed'],
  'enemy surrendered': ['The enemy yielded the field', 'You yielded the field'],
  'enemy commander killed': ['The enemy Commander was killed', 'You were killed'],
  'enemy officers yielded': ['With their Commander in your hands, the enemy\'s officers yielded the field', 'With you in the enemy\'s hands, your senior officer yielded the field to save what was left'],
  'enemy commander bargained': ['The enemy Commander bargained for his freedom and left the field', 'You bargained for your freedom and left the field'],
  'objectives held': ['You held the field', 'The enemy held the field'],
  'time ran out: fewer losses': ['The day ended, and the enemy lost more', 'The day ended, and you lost more'],
  'time ran out: held more objectives': ['The day ended with more ground in your hands', 'The day ended with more ground in the enemy\'s hands']
}
function verdictWords(battle) {
  const o = battle.outcome
  if (!o) return null
  // Night ended it (words from the server: narrator/words.js, NIGHT).
  if (o.said) return { title: o.title, reason: o.said.charAt(0).toUpperCase() + o.said.slice(1), night: true }
  if (o.winner === 'draw') {
    const why = { 'both commanders killed': 'Both Commanders were killed', 'mutual collapse': 'Both armies broke', 'mutual ruin': 'Both armies were ruined', 'time ran out: equal losses': 'The day ended with losses even' }
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
  const armyOf = path.match(/^\/army\/([A-Za-z0-9_-]{8,})$/)
  try {
    if (seat) return await tent(seat[1])
    if (armyOf) return await armyScreen(armyOf[1])
    if (path === '/battles') return await battles()
    if (path === '/muster') return await muster()
    if (path === '/officers') return await officers()
    return await home()
  } catch (error) {
    app.innerHTML = `<main class="page"><h1>Cohort</h1><p class="error">${esc(error.status === 404 ? 'There is no battle at this link.' : error.message)}</p><a href="/battles" data-link>Your battles</a></main>`
  }
}

// Your battles' lines, with any next day's battle you were called out to
// (ruled 2026-11-24: "no they need a notice"): the old battle's line names
// your seat in it, and it is kept in this browser from then on.
async function seatLines(seats) {
  if (!seats.length) return []
  const lines = await api('GET', `/api/seats?tokens=${seats.map(s => s.token).join(',')}`)
  const known = new Set(lines.map(l => l.token))
  const found = lines.map(l => l.nextDay).filter(n => n?.token && !known.has(n.token))
  if (!found.length) return lines
  const more = await api('GET', `/api/seats?tokens=${found.map(n => n.token).join(',')}`)
  for (const l of more) saveSeat({ token: l.token, title: l.title, side: l.side })
  return [...more, ...lines]
}

// ── Home: straight to the battle waiting on you ────────
async function home() {
  const seats = loadSeats()
  if (seats.length === 0) return go('/muster', { replace: true })
  const lines = await seatLines(seats)
  const waiting = lines.filter(l => l.status === 'your-orders').sort((a, b) => b.updatedAt - a.updatedAt)
  if (waiting.length > 0) return go(`/b/${waiting[0].token}`, { replace: true })
  return go('/battles', { replace: true })
}

// ── Your battles ───────────────────────────────────────
async function battles() {
  const lines = await seatLines(loadSeats())
  const group = (status) => lines.filter(l => l.status === status)
  const card = (l) => {
    const verdict = verdictWords(l)
    const opponent = l.opponent === 'standing' ? 'against the computer' : 'against a friend'
    const when = l.status === 'waiting' && l.sentAt ? `your orders went ${ago(l.sentAt)}` : `turn ${l.turn} · ${clock(l.minutes)}`
    return `<a class="battle-link${l.status === 'your-orders' ? ' mine' : ''}" href="/b/${esc(l.token)}" data-link>
      <strong>${esc(l.title)}</strong>
      <span>${esc(sideName(l.side))}, ${opponent}</span>
      <span>${esc(verdict ? `${verdict.title}: ${verdict.reason}` : when)}</span>
      ${l.calledOut ? `<span class="called-out">${esc(l.calledOut)}</span>` : ''}
    </a>`
  }
  const section = (title, list) => list.length ? `<p class="label-caps">${title}</p>${list.map(card).join('')}` : ''
  app.innerHTML = `
    <header class="bar"><strong style="font-family: var(--font-display); font-size: 22px">Cohort</strong><span class="note">Your battles</span></header>
    <main class="page">
      ${lines.length === 0 ? '<p class="note">No battles yet in this browser. A battle\'s link brings it here too.</p>' : ''}
      ${section('Waiting on you', group('your-orders'))}
      ${section('Your orders are with the army', group('waiting'))}
      ${section('Finished', group('finished'))}
      <a class="btn btn-main btn-wide" href="/muster" data-link>Muster a new battle</a>
      <a class="btn btn-wide" href="/officers" data-link>Your officers</a>
    </main>`
}

// ── Your officers ──────────────────────────────────────
// As src/narrator/words.js has them.
const LOYALTY_WORDS = { loyal: 'loyal to you', disloyal: 'disaffected' }
const VALUES_WORDS = { glory: 'lives for glory', survival: 'looks to his men' }
const GRADE_WORDS = { green: 'green', seasoned: 'seasoned', veteran: 'a veteran', legendary: 'a legend' }
const RESULT_WORDS = { victory: 'a victory', defeat: 'a defeat', draw: 'a draw' }
// A unit's veterancy, as battles its men have come through on average.
const veteranOf = (v) => {
  const n = Math.floor(Number(v) || 0)
  return n === 0 ? 'new to battle' : `${n} battle${n === 1 ? '' : 's'} a man on average`
}
const FATE_WORDS = { killed: 'killed', captured: 'taken by the enemy', 'given up': 'given to the enemy for the Commander\'s freedom', left: 'left you when the battle left you a commander of none' }
async function officers(note = null) {
  const commanders = await loadCommanders()
  const battleLine = (r) => `<li><strong>${esc(r.title)}</strong>, ${esc(RESULT_WORDS[r.result] ?? r.result)}${
    r.fate === 'wounded' ? `; wounded${r.how ? ` (${esc(r.how)})` : ''}` : ''}${r.fate === 'given up' ? '; given up, with his men, in a deal for his Commander\'s freedom' : ''}.${r.deeds ? ` His men ${esc(r.deeds)}.` : ''}${r.named ? ' Here he came forward to lead them.' : ''}${r.loyalty > 0 ? ' He thought the better of you for it.' : r.loyalty < 0 ? ' He thought the worse of you for it.' : ''}</li>`
  // Moving an officer to other men (between battles only): to a unit with
  // none, or in place of the officer there, who takes his.
  const moves = (o, c) => {
    if (c.ended || c.battle || !c.roster) return ''
    const others = c.roster.units.filter(u => u.name !== o.leads)
    if (!others.length) return ''
    return `<button class="btn btn-quiet" type="button" data-move="${esc(o.id)}" aria-expanded="false">Move him to other men</button>
      <div class="move-list" id="move-${esc(o.id)}" hidden>
        <span>His experience and record go with him; each unit keeps its own veterancy.</span>
        ${others.map(u => `<button class="btn btn-wide" type="button" data-commander="${esc(c.token)}" data-officer="${esc(o.id)}" data-to="${esc(u.name)}">To the ${esc(u.name)}${u.officer ? `, in place of ${esc(u.officer.name)}` : ', who have no officer'}</button>`).join('')}
      </div>`
  }
  const card = (o, c) => `<div class="officer" data-officer-card="${esc(o.id)}">
      <strong>${esc(o.name)}</strong>
      <span>Leads the ${esc(o.leads)} · ${esc(GRADE_WORDS[o.grade] ?? o.grade)}, ${esc(o.personality)}${o.status === 'wounded' ? ' · wounded, back after the next battle' : ''}</span>
      ${menLine(c, o.leads, 'His men')}
      ${o.values ? `<span>He ${esc(VALUES_WORDS[o.values] ?? o.values)}${o.loyalty ? `, and is ${esc(LOYALTY_WORDS[o.loyalty])}` : ''}.</span>` : ''}
      ${o.taken ? `<span class="taken-note">Given to you by Commander ${esc(o.taken.commander)} at ${esc(o.taken.battle)}, in a deal for his own freedom. He has every reason to hate you.</span>` : ''}
      ${o.record.length
        ? `<details><summary>${o.record.length} battle${o.record.length === 1 ? '' : 's'} with ${o.taken ? 'his Commanders' : 'you'}</summary><ul>${o.record.map(battleLine).join('')}</ul></details>`
        : '<span>Yet to fight under you.</span>'}
      ${moves(o, c)}
    </div>`
  // A unit's veterancy, its level in the server's words (words.js).
  const menLine = (c, kind, who) => {
    const u = (c.units ?? []).find(x => x.kind === kind)
    return u?.level ? `<span class="veterancy">${who}: ${esc(u.level)}, ${veteranOf(u.veterancy)}.</span>` : ''
  }
  const fallen = (f) => `<p class="note">${esc(f.name)}, who led the ${esc(f.led)}: ${esc(FATE_WORDS[f.fate] ?? f.fate)} at ${esc(f.at)}, after ${f.battles} battle${f.battles === 1 ? '' : 's'} with you.</p>`
  const company = (c) => `
      <h2 class="commander">Commander ${esc(c.name)}${c.factionTitle ? ` of ${esc(c.factionTitle)}` : ''}</h2>
      <p class="note">${c.battles} battle${c.battles === 1 ? '' : 's'} fought. ${c.ended
        ? `${c.ended.how === 'killed' ? 'Killed' : 'Lost in the enemy\'s hands'} at ${esc(c.ended.at)}. His name stays in the record; his company is no more.`
        : c.battle
        ? `His army is in the field${c.battle.seat ? `: <a href="/b/${esc(c.battle.seat)}" data-link>${esc(c.battle.title)}</a>` : ` (${esc(c.battle.title)})`}.`
        : 'His army is ready to muster.'}</p>
      ${c.battle?.calledOut && c.battle.seat ? `<a class="notice" href="/b/${esc(c.battle.seat)}" data-link role="status"><strong>${esc(c.battle.calledOut)}</strong><span>${esc(c.battle.title)}</span></a>` : ''}
      ${!c.ended && c.faction ? `<a class="btn btn-wide" href="/army/${esc(c.token)}" data-link>${c.battle ? 'His army' : c.army?.own ? 'Change his army' : 'Buy his own army'}</a>` : ''}
      ${c.officers.map(o => card(o, c)).join('')}
      ${(c.units ?? []).filter(u => u.trained > 0).map(u => `<p class="note">The ${esc(u.kind)} have been trained up ${u.trained} level${u.trained === 1 ? '' : 's'} by an officer of thirty battles.</p>`).join('')}
      ${(c.unled ?? []).map(u => `<p class="note">The ${esc(u.kind)} have no officer${u.battles >= c.earnedAt ? ': one of their own will step up after their next battle' : ` yet: ${u.battles} battle${u.battles === 1 ? '' : 's'} come through. One comes forward after ${c.earnedAt}`}. ${menLine(c, u.kind, 'Their men')}</p>`).join('')}
      ${c.fallen.length ? `<p class="label-caps">Lost</p>${c.fallen.map(fallen).join('')}` : ''}`
  app.innerHTML = `
    <header class="bar"><a href="/battles" data-link>Your battles</a><strong style="font-family: var(--font-display); font-size: 18px">Your officers</strong><span></span></header>
    <main class="page">
      ${commanders.length === 0
        ? '<p class="note">No officers yet. A Commander starts with one, a veteran with his best unit. The rest are earned: a unit that comes through enough battles finds an officer in its own ranks.</p>'
        : '<p class="note">A unit with no officer keeps only a plain order. One that comes through enough battles finds an officer in its own ranks; a veteran follows a longer order. An army fights one battle at a time.</p>'}
      ${note ? `<p class="note" role="status" id="officers-note">${esc(note)}</p>` : ''}
      ${commanders.map(company).join('')}
      <a class="btn btn-main btn-wide" href="/muster" data-link>Muster a new battle</a>
    </main>`
  for (const b of app.querySelectorAll('[data-move]')) {
    b.addEventListener('click', () => {
      const list = document.getElementById(`move-${b.dataset.move}`)
      list.hidden = !list.hidden
      b.setAttribute('aria-expanded', String(!list.hidden))
    })
  }
  for (const b of app.querySelectorAll('[data-to]')) {
    b.addEventListener('click', async () => {
      b.disabled = true
      try {
        const after = await api('POST', `/api/commander/${b.dataset.commander}/officer`, { officer: b.dataset.officer, to: b.dataset.to })
        const him = after.officers.find(o => o.id === b.dataset.officer)
        await officers(`${him.name} now leads the ${him.leads}.`)
        document.getElementById(`move-${b.dataset.officer}`)?.closest('.officer')?.scrollIntoView({ block: 'center' })
      } catch (error) {
        b.disabled = false
        b.insertAdjacentHTML('afterend', `<p class="error">${esc(error.message)}</p>`)
      }
    })
  }
}

// ── Muster ─────────────────────────────────────────────
// One kind of battle (ruled 2026-11-23): to the end, won when the other side
// yields the field, loses its army, or loses its Commander. Against the
// computer you choose its faction, or let the lot choose (your own among
// them); against a friend you do not: his Commander brings his own army.
const LAST_COMMANDER = 'cohort.lastCommander'
function lastCommander() { try { return localStorage.getItem(LAST_COMMANDER) } catch { return null } }
function rememberCommander(token) { try { localStorage.setItem(LAST_COMMANDER, token) } catch { /* fine */ } }

async function muster() {
  const [maps, commanders, factions, day] = await Promise.all([api('GET', '/api/maps'), loadCommanders(), api('GET', '/api/factions'), api('GET', '/api/day')])
  // The Commander last chosen leads, if his army is home; else the first
  // whose army is not in the field; with none, a new one.
  commanders.splice(0, commanders.length, ...commanders.filter(c => !c.ended))   // the fallen muster no more
  const ready = commanders.find(c => !c.battle && c.token === lastCommander()) ?? commanders.find(c => !c.battle)
  const commanderOption = (c) => `<option value="${esc(c.token)}"${c.battle ? ' disabled' : ''}${c === ready ? ' selected' : ''}>${esc(c.name)}${
    c.battle ? ' (army in the field)' : `, ${c.battles} battle${c.battles === 1 ? '' : 's'} fought`}</option>`
  const factionOption = (f) => `<option value="${esc(f.id)}">${esc(f.title)}</option>`
  app.innerHTML = `
    <header class="bar"><a href="/battles" data-link>Your battles</a><strong style="font-family: var(--font-display); font-size: 18px">Muster a battle</strong><span></span></header>
    <main class="page">
      <form id="muster" class="page" style="padding: 0">
        <p class="note">A battle to the end. It is won when the other side yields the field, its army breaks or is destroyed, or its Commander is killed. ${esc(day.said)}</p>
        <label class="field">The field
          <select name="map">${maps.map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('')}</select>
        </label>
        <fieldset>
          <legend>Your opponent</legend>
          <label class="choice"><input type="radio" name="opponent" value="standing" checked> The computer (play alone)</label>
          <label class="choice"><input type="radio" name="opponent" value="friend"> A friend, by link</label>
        </fieldset>
        ${commanders.length ? `<label class="field">Your Commander
          <select name="commander">${commanders.map(commanderOption).join('')}<option value=""${ready ? '' : ' selected'}>A new Commander</option></select>
        </label>` : ''}
        <label class="field" id="faction-field">Your faction, for life
          <select name="faction">${factions.map(factionOption).join('')}</select>
        </label>
        <p class="note" id="faction-note"></p>
        <div class="buy-unit" id="army-line"></div>
        <label class="field" id="enemy-field">The enemy
          <select name="enemyFaction"><option value="">Any faction, by lot</option>${factions.map(factionOption).join('')}</select>
        </label>
        <p class="note" id="enemy-note" hidden>Your friend's Commander brings his own army, of his own faction: it may be yours.</p>
        <label class="field">You command
          <select name="side"><option value="red">Red, from the west</option><option value="blue">Blue, from the east</option></select>
        </label>
        <button class="btn btn-main btn-wide" type="submit">Muster the armies</button>
        <p class="note">Against a friend, you get a link to send them.</p>
      </form>
      <div id="shared"></div>
    </main>`
  // A Commander's faction is chosen once, when he is made: one who has
  // his is shown it; a new one (or one from before factions) chooses.
  const pickCommander = document.querySelector('select[name="commander"]')
  const pickFaction = document.querySelector('select[name="faction"]')
  const chosenNow = () => commanders.find(c => c.token === pickCommander?.value) ?? null
  // Who marches, for each Commander: what he chose last time, changed here
  // by a tap on a unit. The elite always marches; the supply spent and left
  // is in view; over the budget, the muster waits until he leaves one home.
  const marching = new Map()
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1)
  const spentOn = (c) => c.roster.units.filter(u => u.how !== 'elite' && marching.get(c.token).includes(u.name)).reduce((n, u) => n + (u.cost ?? 0), 0)
  function whoMarches(c) {
    const r = c.roster
    const names = marching.get(c.token)
    const spent = spentOn(c)
    const over = spent > r.budget
    const going = r.units.filter(u => u.how !== 'elite' && names.includes(u.name)).map(u => cap(u.name))
    const elite = r.units.find(u => u.how === 'elite')
    const row = (u) => {
      const always = u.how === 'elite'
      const on = always || names.includes(u.name)
      return `<button class="opt march" type="button" ${always ? 'aria-disabled="true" data-always' : `data-march="${esc(u.name)}"`} aria-pressed="${on}">
        <span class="march-name"><strong>${esc(cap(u.name))}</strong>${u.came ? ` <em>${esc(u.came)}</em>` : ''}<br><span class="march-officer">${esc(u.officer ? `Officer: ${u.officer.name}` : 'No officer')}${always ? ' · always marches' : ''}</span></span>
        <span>${always ? 'free' : `${u.cost ?? '–'} pts`}<br>${on ? 'marches' : 'at home'}</span>
      </button>`
    }
    return `<details class="who-marches" id="who-marches"${over ? ' open' : ''}>
        <summary><span class="note">${esc(going.join(', '))}${going.length ? ', and ' : ''}the ${esc(elite.name)}.</span>
          <span class="march-sum${over ? ' over' : ''}" id="march-sum">${spent} of ${r.budget} supply points${over ? `: ${spent - r.budget} over` : `, ${r.budget - spent} left`} · Who marches</span></summary>
        <p class="note">Tap a unit to leave it at home or bring it. A unit at home keeps its officer and all it has learned, and takes no part.</p>
        <div class="march-list">${r.units.map(row).join('')}</div>
      </details>`
  }
  function showFaction() {
    const chosen = chosenNow()
    const own = chosen?.faction ? factions.find(f => f.id === chosen.faction) : null
    document.getElementById('faction-field').style.display = own ? 'none' : ''
    const f = own ?? factions.find(x => x.id === pickFaction.value)
    document.getElementById('faction-note').textContent = f
      ? `${own ? `As ${chosen.name}, you fight for ${f.title}. ` : ''}${f.fights} Your elite unit, the ${f.elite.charAt(0).toUpperCase() + f.elite.slice(1)}, comes free: your veteran officer leads them, and you ride with them.`
      : ''
    // His army: the one he bought, or his faction's usual one; and of all
    // he owns, who marches (as last time, unless he changes it here).
    const army = chosen?.faction ? chosen.army : null
    if (chosen?.roster && !marching.has(chosen.token)) marching.set(chosen.token, [...chosen.roster.marching])
    document.getElementById('army-line').innerHTML = chosen?.faction
      ? `<strong>${army.own ? 'Your own army' : `The usual army of ${esc(f.title)}`}</strong>
         ${chosen.roster ? whoMarches(chosen) : ''}
         <a class="btn btn-wide" href="/army/${esc(chosen.token)}?then=/muster" data-link id="to-army">${army.own ? 'Change your army' : 'Buy your own army'}</a>`
      : `<strong>The usual army of ${esc(f?.title ?? '')}</strong>
         <span class="note">Or buy your own: make your Commander first, and choose his units within his budget.</span>
         <button class="btn btn-wide" type="button" id="make-and-buy">Make your Commander, and buy his army</button>`
    document.getElementById('to-army')?.addEventListener('click', () => rememberCommander(chosen.token))
    for (const b of document.querySelectorAll('[data-march]')) {
      b.addEventListener('click', () => {
        const names = marching.get(chosen.token)
        const name = b.dataset.march
        marching.set(chosen.token, names.includes(name) ? names.filter(n => n !== name) : [...names, name])
        showFaction()
        document.getElementById('who-marches').open = true
      })
    }
    document.getElementById('make-and-buy')?.addEventListener('click', async (event) => {
      event.target.disabled = true
      try {
        const token = await newCommander(pickFaction.value)
        rememberCommander(token)
        go(`/army/${token}?then=/muster`)
      } catch (error) {
        event.target.disabled = false
        event.target.insertAdjacentHTML('afterend', `<p class="error">${esc(error.message)}</p>`)
      }
    })
  }
  // The enemy's faction is asked only against the computer; your own is
  // among the choices.
  function showEnemy() {
    const friend = document.querySelector('input[name="opponent"]:checked')?.value === 'friend'
    document.getElementById('enemy-field').style.display = friend ? 'none' : ''
    document.getElementById('enemy-note').hidden = !friend
  }
  pickCommander?.addEventListener('change', showFaction)
  pickFaction.addEventListener('change', showFaction)
  document.querySelectorAll('input[name="opponent"]').forEach(r => r.addEventListener('change', showEnemy))
  showFaction()
  showEnemy()
  document.getElementById('muster').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = new FormData(event.target)
    const button = event.target.querySelector('button[type="submit"]')
    button.disabled = true
    try {
      const side = form.get('side')
      const opponent = form.get('opponent')
      const chosen = commanders.find(c => c.token === form.get('commander'))
      const faction = chosen?.faction ?? form.get('faction')
      const commander = form.get('commander') || await newCommander(faction)
      rememberCommander(commander)
      const result = await api('POST', '/api/battles', {
        map: form.get('map'), opponent, side, commander, faction,
        enemyFaction: opponent === 'friend' ? null : form.get('enemyFaction') || null,
        // Who marches, as chosen here (the server judges the budget).
        ...(chosen?.roster && marching.has(chosen.token) ? { marching: marching.get(chosen.token) } : {})
      })
      const mine = result.seats[side]
      saveSeat({ token: mine, title: result.title, side })
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

// ── Buying the army ────────────────────────────────────
// A Commander's standard army, bought within his faction's budget as the
// Discord builder had it: a unit at a time, quality, horse or foot, weapon,
// armour and shield, the supply points left always in view. Every choice is
// priced and judged by the server (the builder's rules); a refused one is
// shown struck through, and tapping it says why. The elite comes free and
// is not for sale. Kept on the server with the Commander, and changed only
// while his army is home. `?then=` is where to go once it is kept.
const STEPS = [
  ['quality', 'The men'],
  ['mounted', 'On foot or on horse'],
  ['weapon', 'Their weapon'],
  ['armor', 'Armour'],
  ['shield', 'Shield']
]
const NEW_UNIT = { quality: 'levy', weapon: 'spear_basic', armor: 'no_armor', shield: 'no_shield', mounted: false }
async function armyScreen(token) {
  const commander = await api('GET', `/api/commander/${token}`)
  const asked = new URLSearchParams(location.search).get('then') ?? ''
  const then = asked === '/muster' || /^\/b\/[A-Za-z0-9_-]{8,}$/.test(asked) ? asked : null
  const state = {
    units: (commander.army?.units ?? []).map(u => ({ ...u })),
    own: Boolean(commander.army?.own),
    draft: null,          // the unit being bought or changed
    at: null,             // its place in the army, when it is changed
    seen: null,           // the server's appraisal
    refused: null,        // why the choice just tapped is not allowed
    note: null,
    error: null,
    changed: false,
    saving: false,
    // The units that came to him otherwise (taken from the enemy), kept
    // unless he lets them go; and the unit he is naming, if any.
    captured: (commander.roster?.units ?? []).filter(u => u.came).map(u => u.name),
    naming: null,
    nameError: null
  }
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1)
  const inField = Boolean(commander.battle)
  const back = then ? `<a href="${esc(then)}" data-link>${then === '/muster' ? 'Muster' : 'The battle'}</a>` : '<a href="/officers" data-link>Your officers</a>'
  const rosterUnit = (name) => (commander.roster?.units ?? []).find(u => u.name === name)
  const eliteName = () => (commander.roster?.units ?? []).find(u => u.how === 'elite')?.name

  async function appraise() {
    const reserved = [...state.captured, eliteName()].filter(Boolean)
    state.seen = await api('POST', `/api/factions/${commander.faction}/appraise`, { units: state.units, draft: state.draft, at: state.at, reserved })
    if (state.draft) state.draft.name = state.seen.draft.name
  }

  // Naming a unit that has an officer: kept at once, between battles.
  function nameBox(name) {
    if (inField || state.changed || !commander.officers.some(o => o.leads === name)) return ''
    if (state.naming !== name) return `<button class="btn btn-quiet" type="button" data-name-unit="${esc(name)}">Name them</button>`
    return `<form class="name-form" id="name-form">
        <label class="field">A name of their own
          <input name="name" id="new-name" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="old guard">
        </label>
        <span class="note">One to three words, letters only. It is theirs while they live, and the enemy hears it. Your orders find them by it, and by what they were called before.</span>
        ${state.nameError ? `<p class="refused" role="alert" id="name-refused">${esc(state.nameError)}</p>` : ''}
        <button class="btn btn-main btn-wide" type="submit">Give them this name</button>
        <button class="btn btn-wide" type="button" id="name-cancel">Leave them as they are</button>
      </form>`
  }
  function wireNaming() {
    app.querySelectorAll('[data-name-unit]').forEach(b => b.addEventListener('click', () => {
      state.naming = b.dataset.nameUnit
      state.nameError = null
      render()
      document.getElementById('new-name')?.focus()
      document.getElementById('name-form')?.scrollIntoView({ block: 'center' })
    }))
    document.getElementById('name-cancel')?.addEventListener('click', () => { state.naming = null; state.nameError = null; render() })
    document.getElementById('name-form')?.addEventListener('submit', async (event) => {
      event.preventDefault()
      const typed = new FormData(event.target).get('name')
      try {
        const view = await api('POST', `/api/commander/${token}/name`, { unit: state.naming, name: typed })
        Object.assign(commander, view)
        state.units = (view.army?.units ?? []).map(u => ({ ...u }))
        state.captured = (view.roster?.units ?? []).filter(u => u.came).map(u => u.name)
        const was = state.naming
        const now = view.roster.units.find(u => (u.formerly ?? []).includes(was) || u.name === was)
        state.note = `The ${was} are the ${now?.name ?? typed} now.`
        state.naming = null
        state.nameError = null
        await appraise()
        render()
      } catch (error) {
        state.nameError = error.message
        render()
        document.getElementById('new-name').value = typed
        document.getElementById('name-refused')?.scrollIntoView({ block: 'center' })
      }
    })
  }

  // What his company has for a unit: its officer, or its battles toward one.
  function officerLine(name) {
    const officer = commander.officers.find(o => o.leads === name && o.status !== 'lost')
    const men = (commander.units ?? []).find(u => u.kind === name)
    const level = men?.level ? ` · men: ${esc(men.level)}` : ''
    if (officer) return `Officer: ${esc(officer.name)}${officer.status === 'wounded' ? ' (wounded)' : ''}${level}`
    const count = (commander.unled ?? []).find(u => u.kind === name)
    return count ? `No officer yet: ${count.battles} battle${count.battles === 1 ? '' : 's'} toward one${level}` : 'No officer yet: new to your army'
  }

  function budget(spent, total) {
    const over = spent > total
    const pct = Math.max(0, Math.min(100, Math.round(100 * spent / (total || 1))))
    return `<div class="budget${over ? ' over' : ''}" id="budget">
      <strong>${spent} of ${total} supply points</strong>
      <div class="track" role="meter" aria-label="Supply points spent" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${spent}"><div class="fill" style="width: ${pct}%"></div></div>
      <span class="note">${over ? `${spent - total} over the budget` : `${total - spent} left`}. The elite unit is free.</span>
    </div>`
  }

  function render() {
    const s = state.seen
    if (state.draft) return renderDraft(s)
    const room = s.left >= s.cheapest
    app.innerHTML = `
      <header class="bar">${back}<strong style="font-family: var(--font-display); font-size: 18px">Your army</strong><span></span></header>
      <main class="page" id="army-screen">
        <h1>${esc(commander.name)}'s army</h1>
        ${budget(s.spent, s.budget)}
        ${inField ? `<p class="question">His army is in the field (${esc(commander.battle.title)}). It can be changed when the battle is over.</p>` : ''}
        <div class="buy-unit elite">
          <header><h3>${esc(cap(eliteName() ?? s.elite.name))}</h3><span class="cost">Free</span></header>
          <span class="note">${esc(s.elite.words)}</span>
          <span class="note">Your elite unit, and ${esc(s.title)}'s own. Not for sale: it comes with every army, and always marches. You ride with them.</span>
          <span class="note">${officerLine(eliteName() ?? s.elite.name)}</span>
          ${state.naming === eliteName() ? nameBox(eliteName()) : `<div class="actions">${nameBox(eliteName())}</div>`}
        </div>
        ${s.units.map((u, i) => `
          <div class="buy-unit" data-unit="${i}">
            <header><h3>${esc(cap(u.name))}</h3><span class="cost">${u.cost ?? '–'} points</span></header>
            <span class="note">${esc(u.words)}${u.men ? `, ${u.men} men` : ''}</span>
            <span class="note">${officerLine(u.name)}${u.formerly?.length ? ` · once the ${esc(u.formerly.join(', the '))}` : ''}</span>
            ${u.errors.map(e => `<p class="refused">${esc(e)}</p>`).join('')}
            ${inField ? '' : state.naming === u.name ? nameBox(u.name) : `<div class="actions">
              <button class="btn btn-quiet" type="button" data-change="${i}">Change</button>
              <button class="btn btn-quiet" type="button" data-dismiss="${i}">Dismiss</button>
              ${nameBox(u.name)}
            </div>`}
          </div>`).join('')}
        ${state.captured.length ? `<p class="label-caps">Taken from the enemy</p>
          <p class="note">Units given to you in a deal for an enemy Commander's freedom: yours to march, with their own kit, whatever your faction forges, at its price in supply. They are over and above what you buy.</p>` : ''}
        ${state.captured.map(name => rosterUnit(name)).filter(Boolean).map(u => `
          <div class="buy-unit" data-captured="${esc(u.name)}">
            <header><h3>${esc(cap(u.name))}</h3><span class="cost">${u.cost ?? '–'} points to march</span></header>
            <span class="note">${esc(u.words)}</span>
            <span class="note">${esc(cap(u.came))}${u.from ? `: Commander ${esc(u.from.commander)}'s, at ${esc(u.from.battle)}` : ''}${u.formerly?.length ? ` · once the ${esc(u.formerly.join(', the '))}` : ''}</span>
            <span class="note">${officerLine(u.name)}</span>
            ${inField ? '' : state.naming === u.name ? nameBox(u.name) : `<div class="actions">
              <button class="btn btn-quiet" type="button" data-release="${esc(u.name)}">Let them go</button>
              ${nameBox(u.name)}
            </div>`}
          </div>`).join('')}
        ${s.units.length === 0 ? '<p class="note">No units bought yet. Buy at least one, or take the usual army.</p>' : ''}
        ${inField ? '' : `<button class="btn btn-wide" type="button" id="add"${room ? '' : ' disabled'}>Buy a unit</button>
        ${room ? '' : `<p class="note">${s.left > 0 ? `${s.left} supply point${s.left === 1 ? '' : 's'} left` : 'Nothing left to spend'}: the cheapest unit costs ${s.cheapest}.</p>`}`}
        ${s.errors.map(e => `<p class="refused">${esc(e)}</p>`).join('')}
        ${state.note ? `<p class="note" role="status">${esc(state.note)}</p>` : ''}
        ${state.error ? `<p class="error">${esc(state.error)}</p>` : ''}
        <p class="note">A unit you keep keeps its officer, or its battles toward one, whatever you change. A unit you dismiss takes its battles with it; its officer stays with you, and leads a unit that has none. A new unit has no officer: it earns one in battle. At the muster you choose who marches; a unit left at home is still yours, and what you buy still counts it.</p>
        ${inField ? '' : `<div class="buy-foot">
          <button class="btn btn-main btn-wide" type="button" id="keep"${s.errors.length || state.saving ? ' disabled' : ''}>${state.changed || !state.own ? 'Keep this army' : 'Kept'}</button>
          <button class="btn btn-wide" type="button" id="usual">Take the usual army of ${esc(s.title)}</button>
        </div>`}
      </main>`
    app.querySelectorAll('[data-change]').forEach(b => b.addEventListener('click', async () => {
      state.at = Number(b.dataset.change)
      state.draft = { ...state.units[state.at] }
      state.refused = null
      await appraise()
      render()
      window.scrollTo(0, 0)
    }))
    app.querySelectorAll('[data-dismiss]').forEach(b => b.addEventListener('click', async () => {
      const [gone] = state.units.splice(Number(b.dataset.dismiss), 1)
      state.changed = true
      state.note = `The ${gone.name} are dismissed.`
      await appraise()
      render()
    }))
    app.querySelectorAll('[data-release]').forEach(b => b.addEventListener('click', async () => {
      state.captured = state.captured.filter(n => n !== b.dataset.release)
      state.changed = true
      state.note = `The ${b.dataset.release} are let go: they go home, and their officer with them.`
      await appraise()
      render()
    }))
    wireNaming()
    document.getElementById('add')?.addEventListener('click', async () => {
      state.at = null
      state.draft = { ...NEW_UNIT }
      state.refused = null
      state.note = null
      await appraise()
      render()
      window.scrollTo(0, 0)
    })
    const done = (view) => {
      Object.assign(commander, view)
      state.units = view.army.units.map(u => ({ ...u }))
      state.own = view.army.own
      state.captured = (view.roster?.units ?? []).filter(u => u.came).map(u => u.name)
      state.changed = false
      state.saving = false
      if (then) return go(then)
      state.note = 'Your army is kept. It goes with you to your next battle.'
      appraise().then(render)
    }
    const keep = async (body) => {
      state.saving = true
      state.error = null
      try { done(await api('POST', `/api/commander/${token}/army`, body)) } catch (error) {
        state.saving = false
        state.error = error.message
        render()
      }
    }
    document.getElementById('keep')?.addEventListener('click', () => keep({ units: state.units, captured: state.captured }))
    document.getElementById('usual')?.addEventListener('click', () => keep({ usual: true, captured: state.captured }))
  }

  function renderDraft(s) {
    const d = s.draft
    const spent = d.spentWith
    const option = (field, o) => {
      const on = String(state.draft[field]) === String(o.value)
      return `<button class="opt" type="button" data-field="${field}" data-value="${esc(String(o.value))}" aria-pressed="${on}"${o.refused && !on ? ' aria-disabled="true"' : ''}>${esc(cap(o.words))}<span>${o.cost ? `+${o.cost}` : 'free'}</span></button>`
    }
    const step = ([field, title]) => {
      const options = d.options[field]
      if (field !== 'weapon') return `<section class="step"><h3>${title}</h3><div class="options">${options.map(o => option(field, o)).join('')}</div></section>`
      const close = options.filter(o => !o.shoots)
      const far = options.filter(o => o.shoots)
      return `<section class="step"><h3>${title}: to fight hand to hand</h3><div class="options">${close.map(o => option(field, o)).join('')}</div>
        <h3>Or to shoot and throw</h3><div class="options">${far.map(o => option(field, o)).join('')}</div></section>`
    }
    app.innerHTML = `
      <header class="bar"><button class="btn btn-quiet" type="button" id="draft-back">Back</button><strong style="font-family: var(--font-display); font-size: 18px">${state.at === null ? 'Buy a unit' : 'Change a unit'}</strong><span></span></header>
      <main class="page" id="army-screen">
        ${budget(spent, s.budget)}
        <div class="buy-unit" id="draft">
          <header><h3>${esc(cap(d.name))}</h3><span class="cost">${d.cost ?? '–'} points</span></header>
          <span class="note">${esc(d.words)}${d.men ? `, ${d.men} men` : ''}</span>
        </div>
        ${state.refused ? `<p class="refused" role="alert" id="refused"><strong>Not allowed:</strong> ${esc(state.refused)}</p>` : ''}
        ${d.refused ? `<p class="refused" id="draft-refused">${esc(d.refused)}</p>` : ''}
        ${STEPS.map(step).join('')}
        <div class="buy-foot">
          <button class="btn btn-main btn-wide" type="button" id="take"${d.refused ? ' disabled' : ''}>${state.at === null ? `Buy the ${esc(d.name)}` : 'Keep the change'}</button>
          <button class="btn btn-wide" type="button" id="draft-cancel">${state.at === null ? 'Do not buy them' : 'Leave them as they were'}</button>
        </div>
      </main>`
    app.querySelectorAll('[data-field]').forEach(b => b.addEventListener('click', async () => {
      const field = b.dataset.field
      const o = d.options[field].find(x => String(x.value) === b.dataset.value)
      if (b.getAttribute('aria-disabled') === 'true') {
        state.refused = `${cap(o.words)}: ${o.refused.charAt(0).toLowerCase()}${o.refused.slice(1)}`
        render()
        document.getElementById('refused')?.scrollIntoView({ block: 'center' })
        return
      }
      state.refused = null
      state.draft[field] = field === 'mounted' ? o.value === true : o.value
      await appraise()
      const y = window.scrollY
      render()
      window.scrollTo(0, y)
    }))
    const leave = async () => { state.draft = null; state.at = null; state.refused = null; await appraise(); render() }
    document.getElementById('draft-back').addEventListener('click', leave)
    document.getElementById('draft-cancel').addEventListener('click', leave)
    document.getElementById('take').addEventListener('click', async () => {
      // A unit he named keeps its name (the server holds which those are).
      const unit = { name: d.name, quality: d.quality, weapon: d.weapon, armor: d.armor, shield: d.shield, mounted: d.mounted, ...(state.draft.named ? { named: true } : {}) }
      if (state.at === null) state.units.push(unit)
      else state.units[state.at] = unit
      state.note = state.at === null ? `The ${d.name} join your army.` : `The ${d.name} are changed.`
      state.changed = true
      await leave()
    })
  }

  if (!commander.faction) {
    app.innerHTML = `<main class="page"><h1>${esc(commander.name)}</h1><p class="note">He has no faction yet: he takes one at his next muster, and then buys his army from its kit.</p><a class="btn btn-wide" href="/muster" data-link>Muster</a></main>`
    return
  }
  await appraise()
  render()
}

// ── Who leads: the friend's first screen in the tent ───
// As at the muster: one of your Commanders whose army is free, or a new
// one (one tap). Every player has a Commander (ruled 2026-11-23). Closed
// once the first turn has run.
async function whoLeads(token, view) {
  const b = view.battle
  const [all, factions] = await Promise.all([loadCommanders(), view.faction ? api('GET', '/api/factions') : []])
  // The Commander last chosen in this browser first (one just made, and his army bought).
  const ready = all.filter(c => !c.ended && !c.battle).sort((x, y) => (y.token === lastCommander()) - (x.token === lastCommander()))
  const titleOf = (id) => factions.find(f => f.id === id)?.title ?? ''
  const choice = (c, i) => `<button class="btn btn-wide${i === 0 ? ' btn-main' : ''}" type="button" data-lead="${esc(c.token)}">${esc(c.name)}, ${c.battles} battle${c.battles === 1 ? '' : 's'} fought${c.faction && view.faction ? ` (${esc(titleOf(c.faction))})` : ''}</button>`
  // A new Commander's faction is his for life; the army the muster gave
  // this side is the first choice.
  const factionPick = view.faction ? `<label class="field">Your faction, as a new Commander, for life
        <select name="faction">${factions.map(f => `<option value="${esc(f.id)}"${f.id === view.faction ? ' selected' : ''}>${esc(f.title)}</option>`).join('')}</select>
      </label>` : ''
  app.innerHTML = `
    <header class="bar"><a href="/battles" data-link>Battles</a><div class="bar-title"><strong>${esc(b.title)}</strong><span>${esc(sideName(b.side))} · against a friend</span></div><span></span></header>
    <main class="page" id="who-leads">
      <h1>Who leads?</h1>
      <p class="note">You command ${esc(sideName(b.side))}${view.faction ? ', with your Commander\'s own army: the one he bought, or his faction\'s usual one' : ''}. Your Commander rides with your best unit, and his officers lead your units. What befalls them here goes with them to the next battle.</p>
      ${ready.map(choice).join('')}
      ${factionPick}
      <button class="btn btn-wide${ready.length ? '' : ' btn-main'}" type="button" data-lead="new">A new Commander${view.faction ? ', with the usual army' : ''}</button>
      ${view.faction ? '<button class="btn btn-wide" type="button" data-lead="new-buy">A new Commander, and buy his army first</button>' : ''}
      <div id="who-leads-error"></div>
    </main>`
  for (const button of app.querySelectorAll('[data-lead]')) {
    button.addEventListener('click', async () => {
      for (const b of app.querySelectorAll('[data-lead]')) b.disabled = true
      try {
        const lead = button.dataset.lead
        if (lead === 'new-buy') {
          const made = await newCommander(app.querySelector('select[name="faction"]')?.value || null)
          rememberCommander(made)
          return go(`/army/${made}?then=/b/${token}`)
        }
        const faction = lead === 'new' ? app.querySelector('select[name="faction"]')?.value || null : null
        const commander = lead === 'new' ? await newCommander(faction) : lead || null
        await api('POST', `/api/seat/${token}/join`, { commander, faction })
        route()
      } catch (error) {
        // The choice closed meanwhile (the battle has begun): to the tent.
        const now = await api('GET', `/api/seat/${token}`).catch(() => null)
        if (now && !now.choosing) return route()
        for (const b of app.querySelectorAll('[data-lead]')) b.disabled = false
        document.getElementById('who-leads-error').innerHTML = `<p class="error">${esc(error.message)}</p>`
      }
    })
  }
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
    // Your units under one fingertip, to choose from.
    stack: null,
    // The map at full height (on a phone it shares the screen with the orders).
    tall: false,
    // The verdict's replay: the battle as you saw it after an earlier turn.
    shown: null
  }

  // Held by the enemy, his units out of his sight have no place on his map.
  const onMap = (v) => ({ ...v, own: v.own.filter(u => u.position) })

  async function load() {
    state.view = await api('GET', `/api/seat/${token}`)
    const b = state.view.battle
    saveSeat({ token, title: b.title, side: b.side })
    document.title = `${b.title} · Cohort`
    if (b.status === 'finished') { state.tab = 'orders'; state.picked = null; state.place = null; state.flash = null }
  }
  await load()
  // The friend who joined by link chooses who leads before their first orders.
  if (state.view.choosing) return whoLeads(token, state.view)

  app.innerHTML = `
    <header class="bar" id="bar"></header>
    <div class="tent">
      <section class="map-wrap" aria-label="The map">
        <div class="map-scroll" id="map-scroll"></div>
        <div class="map-tools">
          <button class="btn" type="button" id="zoom-in" aria-label="Zoom in">+</button>
          <button class="btn" type="button" id="zoom-out" aria-label="Zoom out">−</button>
          <button class="btn btn-tall" type="button" id="tall" aria-label="Taller map" aria-pressed="false">⇕</button>
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
      <div class="bar-title"><strong>${esc(b.title)}</strong><span>${esc(sideName(b.side))} · turn ${b.turn}${b.turnLimit ? ` of ${b.turnLimit}` : ''} · ${esc(clock(b.minutes))}${b.dayMinutes ? ` · night falls at ${esc(clock(b.dayMinutes).replace(/ of battle$/, ''))}` : ''}</span></div>
      ${chip}`
  }

  function renderMap({ keepScroll = true } = {}) {
    const left = scroll.scrollLeft
    const top = scroll.scrollTop
    const showing = state.shown ?? state.view
    scroll.innerHTML = drawMap(onMap(showing), { selectedId: state.picked })
    const svg = scroll.querySelector('svg')
    const W = Number(svg.getAttribute('width'))
    if (state.zoom === null) state.zoom = Math.max(scroll.clientWidth / W, 15 / TILE)
    svg.style.width = `${Math.round(W * state.zoom)}px`
    svg.style.height = 'auto'
    if (state.shown) { if (keepScroll) { scroll.scrollLeft = left; scroll.scrollTop = top } return }
    attachGestures(svg, onMap(state.view), () => state.picked, {
      onPick: (id) => { state.picked = id; state.stack = null; state.place = null; state.flash = null; renderMap(); renderHint(); if (state.tab === 'army') renderPanel() },
      onStack: (units) => { state.stack = units.map(u => u.id); state.place = null; state.flash = null; renderHint() },
      onPinch: (factor, x, y) => zoomBy(factor, { x, y }),
      onOrder: (unit, x, y) => addLine(`${unit.name} to ${gridRef(x, y)}`),
      onPlace: (x, y) => { state.place = { x, y }; state.flash = null; renderHint() }
    })
    if (keepScroll) { scroll.scrollLeft = left; scroll.scrollTop = top }
  }

  function centreOnArmy() {
    // Held, the map opens where he is held.
    const own = state.view.commander?.heldPosition ? [{ position: state.view.commander.heldPosition }] : onMap(state.view).own
    if (!own.length) return
    const svg = scroll.querySelector('svg')
    const scale = svg.clientWidth / Number(svg.getAttribute('width'))
    const mx = own.reduce((s, u) => s + u.position.x, 0) / own.length
    const my = own.reduce((s, u) => s + u.position.y, 0) / own.length
    scroll.scrollLeft = (26 + mx * TILE) * scale - scroll.clientWidth / 2
    scroll.scrollTop = (26 + my * TILE) * scale - scroll.clientHeight / 2
  }

  // Zoom about a point of the screen (the pinch's middle), or the middle of
  // the map's window.
  function zoomBy(factor, about = null) {
    const svg = scroll.querySelector('svg')
    const W = Number(svg.getAttribute('width'))
    const rect = scroll.getBoundingClientRect()
    const px = about ? about.x - rect.left : scroll.clientWidth / 2
    const py = about ? about.y - rect.top : scroll.clientHeight / 2
    const centreX = (scroll.scrollLeft + px) / svg.clientWidth
    const centreY = (scroll.scrollTop + py) / svg.clientHeight
    state.zoom = Math.min(2.5, Math.max(scroll.clientWidth / W / 1.2, state.zoom * factor))
    svg.style.width = `${Math.round(W * state.zoom)}px`
    scroll.scrollLeft = centreX * svg.clientWidth - px
    scroll.scrollTop = centreY * svg.clientHeight - py
  }
  document.getElementById('tall').addEventListener('click', (event) => {
    state.tall = !state.tall
    document.querySelector('.map-wrap').classList.toggle('tall', state.tall)
    event.currentTarget.setAttribute('aria-pressed', String(state.tall))
    event.currentTarget.setAttribute('aria-label', state.tall ? 'Shorter map' : 'Taller map')
  })
  document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.4))
  document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.4))

  function renderHint() {
    const hint = document.getElementById('map-hint')
    const finished = state.view.battle.status === 'finished'
    if (state.stack && !state.picked && !state.flash) {
      const units = state.stack.map(id => state.view.own.find(u => u.id === id)).filter(Boolean)
      hint.innerHTML = `<span>Which one?</span>${units.map(u => `<button class="btn" type="button" data-stack="${esc(u.id)}">${esc(u.name)}</button>`).join('')}<button class="btn btn-quiet" type="button" id="stack-away">Never mind</button>`
      hint.querySelectorAll('[data-stack]').forEach(b => b.addEventListener('click', () => {
        state.picked = b.dataset.stack; state.stack = null; renderMap(); renderHint(); if (state.tab === 'army') renderPanel()
      }))
      document.getElementById('stack-away').addEventListener('click', () => { state.stack = null; renderHint() })
    } else if (state.flash) {
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
    state.stack = null
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
      u.crowding && u.crowding !== 'organized' ? `<span class="flag flag-warn">${esc(u.crowding)}</span>` : '',
      u.word?.cutOff ? '<span class="flag flag-warn">cut off</span>' : '',
      u.word?.noWord ? '<span class="flag flag-warn">no word</span>' : ''
    ].join('')
    const officerLine = (u) => !u.officer ? '' : u.officer.headless ? '<p class="unit-order"><strong>No officer yet:</strong> they keep a plain order and nothing more</p>'
      : `<p class="unit-order"><strong>Officer:</strong> ${esc(u.officer.name)}, ${esc(u.officer.grade)} and ${esc(u.officer.personality)}${u.officer.loyalty ? `, ${esc(LOYALTY_WORDS[u.officer.loyalty])}` : ''}</p>`
    // Held: what he can see of his own men from where he is held, and no more.
    const sightCard = (u) => `
      <div class="unit-card">
        <header><h3>${esc(u.name)}</h3><span class="where">${u.outOfSight ? 'out of your sight' : esc(u.at)}</span></header>
        <span class="note">${esc([u.quality, u.role].filter(Boolean).join(' ').replace(/_/g, ' '))}${u.outOfSight ? '' : `, about ${u.strength} men, in sight from where you are held`}</span>
        ${officerLine(u)}
        <p class="unit-order">${esc(u.order.charAt(0).toUpperCase() + u.order.slice(1))}.</p>
        ${u.broken ? '<div class="flags"><span class="flag flag-warn">broken</span></div>' : ''}
      </div>`
    const units = v.own.map(u => u.outOfSight || u.inSightOfCaptivity ? sightCard(u) : `
      <div class="unit-card" aria-pressed="${u.id === state.picked}">
        <header><h3>${esc(u.name)}</h3><span class="where">${esc(u.at)} · ${esc(terrainWords(v, u.position.x, u.position.y))}</span></header>
        <span class="note">${esc([u.quality, u.role].filter(Boolean).join(' ').replace(/_/g, ' '))}, ${u.strength} of ${u.maxStrength} men</span>
        ${u.word && !u.word.live ? `<p class="unit-order word${u.word.cutOff || u.word.noWord ? ' cut-off' : ''}"><strong>${u.word.cutOff ? 'Cut off.' : 'By rider:'}</strong> ${esc(u.word.cutOff ? u.word.said.replace(/^cut off: n/, 'N') : u.word.noWord ? `${u.word.said}. This is where they last were` : `as they were ${u.word.said}`)}</p>` : ''}
        ${u.rider ? `<p class="unit-order"><strong>On the road:</strong> ${esc(u.rider.said)}</p>` : ''}
        ${v.commander?.unitId === u.id ? '<p class="unit-order"><strong>You ride with them.</strong> If they are cut to half and still in the fight, you can be taken or killed.</p>' : ''}
        <div class="bars">${meter('Men', u.strength, u.maxStrength)}${meter('Morale', u.morale, 100)}${meter('Wind', u.stamina, u.staminaPool)}</div>
        ${officerLine(u)}
        <p class="unit-order"><strong>Orders:</strong> ${esc(u.order)}${u.shootsTo ? esc(u.holdingFire ? '; holding fire' : `; shoots at enemies within ${u.shootsTo} m`) : ''}</p>
        <div class="flags">${flags(u)}</div>
        ${v.battle.status === 'finished' || u.broken ? '' : `<div style="display: flex; gap: 8px; flex-wrap: wrap">
          <button class="btn btn-quiet" type="button" data-pick="${esc(u.id)}">${u.id === state.picked ? 'Picked on the map' : 'Pick on the map'}</button>
          <button class="btn btn-quiet" type="button" data-order="${esc(u.name)}">Give an order</button>
          ${u.canRide ? `<button class="btn btn-quiet" type="button" data-ride="${esc(u.name)}">Ride with them</button>` : ''}
        </div>`}
      </div>`).join('')
    const fallen = v.fallen.length ? `<p class="label-caps">Lost</p>${v.fallen.map(f => `<p class="note">${esc(f.name)}: ${f.fled ? 'fled the field' : 'destroyed'}</p>`).join('')}` : ''
    const seen = v.enemies.length
      ? `<p class="label-caps">${v.commander?.status === 'held' ? 'The enemy, as you can see it from where you are held' : 'The enemy, as you know it'}</p>${v.enemies.map(e => `<p class="note">${esc(e.name)} at ${esc(e.at)}: ${e.status === 'visible' ? `in sight, about ${e.strength} men` : `last seen ${e.minutesAgo} min ago`}</p>`).join('')}`
      : '<p class="note">No enemy in sight.</p>'
    body.innerHTML = `${units || '<p class="note">No units standing.</p>'}${fallen}${seen}`
    body.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      state.picked = state.picked === b.dataset.pick ? null : b.dataset.pick
      renderMap(); renderHint(); renderPanel()
    }))
    // "Ride with them": the order, put in the box to read back and send.
    body.querySelectorAll('[data-ride]').forEach(b => b.addEventListener('click', () => {
      const line = `I ride with the ${b.dataset.ride.toLowerCase()}`
      state.draft = state.draft ? `${state.draft.replace(/\s+$/, '')}\n${line}` : line
      saveDraft(token, state.draft)
      state.readback = null
      state.editing = true
      state.tab = 'orders'
      renderPanel()
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
        <header><h3>Turn ${d.turn}</h3><span class="when">${d.plainReport && !d.narrated ? '<span class="flag" title="The dispatch could not be written this turn; this is the plain account.">plain report</span> ' : ''}${esc(clock(d.minutes))} · ${esc(WHY[d.interrupt] ?? d.interrupt)}</span></header>
        ${d.narrated ? `<p class="told">${esc(d.narrated)}</p>` : ''}
        ${d.narrated
          ? `<details><summary>The plain account</summary><ul>${d.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul></details>`
          : `<ul>${d.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`}
      </article>`).join('')
  }

  // The first turn's card: what the game understands, as orders to tap.
  // Every line here is one the interpreter's grammar reads.
  function howTo() {
    const v = state.view
    if (v.battle.turn !== 1 || howToHidden()) return ''
    const own = v.own.filter(u => !u.broken)
    if (!own.length) return ''
    const east = (u, n) => gridRef(Math.min(v.map.width - 1, u.position.x + n), u.position.y)
    const a = own[0]
    const b = own[own.length > 1 ? 1 : 0]
    const examples = [
      'everyone advance',
      `${a.name} to ${east(a, 4)}`,
      `${b.name} defend ${east(b, 2)}`,
      `${a.name} hold`,
      `${b.name} fall back`
    ]
    return `<div class="how-to">
      <strong>How to give orders</strong>
      <span class="note">Say them as you would to an officer: a unit, then what it should do and where. One order to a line. Tap one to put it in the box.</span>
      <div class="examples">${examples.map(e => `<button class="btn btn-quiet" type="button" data-example="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      <button class="btn btn-quiet" type="button" id="how-to-hide">Hide this</button>
    </div>`
  }

  // You hold the enemy Commander: his offer, and your answer. You need not
  // answer at all.
  function captiveCard() {
    const k = state.view.captive
    if (!k) return ''
    const list = (units) => ['the field', ...units.map(u => u.name)].join(', ').replace(/, ([^,]*)$/, ' and $1')
    state.asking = state.asking ?? null
    const asking = state.asking
    return `<div class="captive question" style="display: flex; flex-direction: column; gap: 8px">
      <p style="margin: 0"><strong>You hold the enemy Commander.</strong> Your ${esc(k.heldBy.toLowerCase())} have him.</p>
      ${k.offer ? `<p style="margin: 0">For his freedom he offers ${esc(list(k.offer.units))}. Accept, and the battle is yours: he leaves the field, and what he names is yours.</p>
        ${asking ? `<p class="label-caps">Ask for more: the field, and</p>
          <div style="display: flex; flex-direction: column; gap: 8px">${[...k.offer.units, ...k.seen.filter(e => !k.offer.units.some(u => u.id === e.id))].map(e => `<label class="check"><input type="checkbox" data-ask="${esc(e.id)}"${asking.has(e.id) ? ' checked' : ''}> ${esc(e.name.charAt(0).toUpperCase() + e.name.slice(1))}</label>`).join('')}</div>
          <p class="note">You can ask only for what he offered and enemy units your side has seen.</p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap"><button class="btn" type="button" id="ask-send">Ask for these</button><button class="btn btn-quiet" type="button" id="ask-cancel">Never mind</button></div>`
          : `<div style="display: flex; gap: 8px; flex-wrap: wrap">
          <button class="btn btn-main" type="button" id="offer-accept">Accept</button>
          <button class="btn" type="button" id="offer-refuse">Refuse</button>
          ${k.seen.some(e => !k.offer.units.some(u => u.id === e.id)) ? '<button class="btn" type="button" id="offer-more">Ask for more</button>' : ''}</div>
          ${k.seen.some(e => !k.offer.units.some(u => u.id === e.id)) ? '' : '<p class="note" style="margin: 0">Your side has seen nothing more of his to ask for.</p>'}`}
        <p class="note">Or answer nothing, and fight on.</p>`
        : `<p class="note" style="margin: 0">${k.asked ? `You asked for ${esc(list(k.asked.units))}. ` : ''}He has no offer on the table.</p>`}
    </div>`
  }
  function wireCaptive() {
    const k = state.view.captive
    if (!k?.offer) return
    const answer = async (body) => {
      try {
        await api('POST', `/api/seat/${token}/answer`, { offer: k.offer.id, ...body })
        state.asking = null
        await load()
      } catch (error) { state.readback = { understood: [], questions: [], error: error.message } }
      renderAll()
    }
    document.getElementById('offer-accept')?.addEventListener('click', () => answer({ accept: true }))
    document.getElementById('offer-refuse')?.addEventListener('click', () => answer({ refuse: true }))
    document.getElementById('offer-more')?.addEventListener('click', () => { state.asking = new Set(k.offer.units.map(u => u.id)); renderPanel() })
    document.getElementById('ask-cancel')?.addEventListener('click', () => { state.asking = null; renderPanel() })
    document.querySelectorAll('[data-ask]').forEach(box => box.addEventListener('change', () => {
      if (box.checked) state.asking.add(box.dataset.ask)
      else state.asking.delete(box.dataset.ask)
    }))
    document.getElementById('ask-send')?.addEventListener('click', () => answer({ more: [...state.asking] }))
  }

  function orders(body, foot) {
    const v = state.view
    const b = v.battle
    if (b.status === 'finished') return verdict(body)

    if (b.status === 'waiting' && !state.editing) {
      body.innerHTML = `
        <p class="calm">Your orders are with the army.</p>
        <p>${esc(v.carryingOut ?? '')} There is no hurry: close this page, and it will be here when you come back.</p>
        ${v.pending ? `<p class="note">Sent ${esc(ago(v.pending.at))}</p>
        <p class="label-caps">What you ordered</p>
        ${(v.pending.understood ?? []).map(l => `<p class="readback">${esc(l)}</p>`).join('') || '<p class="note">No new orders: every unit keeps its last one.</p>'}` : '<p class="note">Your army tab shows each unit as the last word of it left them.</p>'}`
      foot.innerHTML = `<button class="btn btn-wide" type="button" id="change">${v.pending ? 'Change your orders' : 'Send new orders'}</button>`
      document.getElementById('change').addEventListener('click', () => {
        state.editing = true
        state.draft = state.draft || v.pending?.text || ''
        renderPanel()
      })
      return
    }

    // In the enemy's hands: no orders. Wait, or make an offer for his
    // freedom: any of his units on the field, and the field itself.
    if (v.commander?.status === 'held') {
      const c = v.commander
      const t = c.table ?? {}
      const list = (units) => ['the field', ...units.map(u => `the ${u.name.toLowerCase()}`)].join(', ').replace(/, ([^,]*)$/, ' and $1')
      state.offering = state.offering ?? new Set((t.counter?.units ?? []).map(u => u.id))
      const picked = c.chips.filter(u => state.offering.has(u.id))
      const tableLine = t.offer
        ? `<p class="readback">Your offer is with them: ${esc(list(t.offer.units))}. They have not answered.</p>`
        : t.answer?.kind === 'more' && t.counter
          ? `<p class="question" style="margin: 0">They ask for more: ${esc(list(t.counter.units))}. Offer all of that this turn and you go free at once.</p>`
          : t.answer?.kind === 'refused' ? '<p class="note">They refused your last offer.</p>' : ''
      body.innerHTML = `
        <p class="question" style="margin: 0"><strong>You are taken.</strong> The ${esc(c.heldBy)} hold you${c.heldAt ? ` at ${esc(c.heldAt)}` : ''}.</p>
        <p>You can send no orders. Each of your officers now leads his own unit as he sees fit. You see only what can be seen from where you are held.</p>
        <p class="note">If your army wins, the enemy must give you up. If the men who hold you break, you are free. If the battle is lost while they hold you and no deal is struck, honor makes them let you go, with whatever of your army is left by then. Your senior officer, if he looks to his men, may yield the field himself when half the army is gone. You hear the reports that come in to your captors.</p>
        ${tableLine}
        <p class="label-caps">Offer a price for your freedom</p>
        ${t.mayOffer === false ? '<p class="note">You have made your offer this turn. Wait for the turn to run.</p>' : `
          <p class="note">One offer a turn. The field is always in it: the battle is lost, you go free, and every unit you name goes to the enemy with its officer. Name none to give the field alone, and keep every man. They need not answer.</p>
          <div class="offer-units" style="display: flex; flex-direction: column; gap: 8px">${c.chips.map(u =>
            `<label class="check"><input type="checkbox" data-chip="${esc(u.id)}"${state.offering.has(u.id) ? ' checked' : ''}> The ${esc(u.name.toLowerCase())}</label>`).join('')}</div>
          <button class="btn" type="button" id="make-offer"${state.sending ? ' disabled' : ''}>${picked.length ? `Offer the field and ${picked.length === 1 ? 'the ' + esc(picked[0].name.toLowerCase()) : picked.length + ' units'}` : 'Offer the field alone'}</button>`}
        ${state.readback?.error ? `<p class="error">${esc(state.readback.error)}</p>` : ''}`
      foot.innerHTML = `<button class="btn btn-main btn-wide" type="button" id="wait"${state.sending ? ' disabled' : ''}>${state.sending ? 'Waiting…' : 'Wait, and let them fight'}</button>`
      const act = async (call) => {
        state.sending = true
        renderPanel()
        try {
          await call()
          state.readback = null
          state.offering = null
          await load()
          state.tab = state.view.battle.status === 'waiting' ? 'orders' : 'dispatches'
          if (state.view.battle.status === 'finished' || state.view.commander?.status === 'held') state.tab = 'orders'
        } catch (error) { state.readback = { understood: [], questions: [], error: error.message } }
        state.sending = false
        renderAll()
        watch()
      }
      body.querySelectorAll('[data-chip]').forEach(box => box.addEventListener('change', () => {
        if (box.checked) state.offering.add(box.dataset.chip)
        else state.offering.delete(box.dataset.chip)
        renderPanel()
      }))
      document.getElementById('wait').addEventListener('click', () => act(() => api('POST', `/api/seat/${token}/orders`, { text: '' })))
      document.getElementById('make-offer')?.addEventListener('click', () => act(() => api('POST', `/api/seat/${token}/offer`, { units: c.chips.filter(u => state.offering.has(u.id)).map(u => u.id) })))
      return
    }

    const rb = state.readback
    body.innerHTML = `${captiveCard()}
      <label for="orders" style="font-weight: 600; font-size: 14px">Your orders, as you would say them</label>
      <textarea id="orders" class="orders-box" spellcheck="false" placeholder="spears to the ford; if their horse is there, hold&#10;swords to C4, then on to the bridge&#10;archers shoot the horse">${esc(state.draft)}</textarea>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button class="btn" type="button" id="read-back">Read them back</button>
        ${state.draft ? '<button class="btn btn-quiet" type="button" id="clear">Clear</button>' : ''}
      </div>
      ${rb ? '' : howTo()}
      ${rb ? `
        ${rb.understood.length ? `<p class="label-caps">Your officers understood</p>${rb.understood.map(l => `<p class="readback">${esc(l)}</p>`).join('')}` : ''}
        ${rb.questions.map(q => {
          const choice = (rb.choices ?? []).find(c => c.question === q)
          if (!choice) return `<p class="question">${esc(q)}</p>`
          return `<div class="question"><p style="margin: 0 0 8px">${esc(q)}</p><div style="display: flex; gap: 8px; flex-wrap: wrap">${
            choice.options.map((o, i) => `<button class="btn" type="button" data-choice="${esc(rb.choices.indexOf(choice))}" data-option="${i}">${esc(optionWords(o))}</button>`).join('')
          }</div></div>`
        }).join('')}
        ${(rb.counsel ?? []).map(c => `<p class="counsel">${esc(c)}</p>`).join('')}
        ${(rb.notes ?? []).map(n => `<p class="note">Note: ${esc(n)}</p>`).join('')}
        ${rb.canSendRest ? '<button class="btn" type="button" id="send-rest">Send the orders that were understood</button>' : ''}
        ${rb.error ? `<p class="error">${esc(rb.error)}</p>` : ''}` : ''}`
    foot.innerHTML = `
      <button class="btn btn-main btn-wide" type="button" id="send"${state.sending ? ' disabled' : ''}>${state.sending ? 'Sending…' : 'Send the orders'}</button>
      <p class="note" style="text-align: center">Units you give no order keep their last one. Units hold until ordered.</p>`

    wireCaptive()
    body.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => {
      state.draft = state.draft ? `${state.draft.replace(/\s+$/, '')}\n${b.dataset.example}` : b.dataset.example
      saveDraft(token, state.draft)
      state.readback = null
      renderPanel()
      document.getElementById('orders')?.focus()
    }))
    document.getElementById('how-to-hide')?.addEventListener('click', () => { hideHowTo(); renderPanel() })
    const box = document.getElementById('orders')
    box.addEventListener('input', () => { state.draft = box.value; state.readback = null; saveDraft(token, state.draft) })
    document.getElementById('clear')?.addEventListener('click', () => { state.draft = ''; state.readback = null; saveDraft(token, ''); renderPanel() })
    const readBack = async () => {
      try {
        state.readback = await api('POST', `/api/seat/${token}/read`, { text: state.draft })
      } catch (error) { state.readback = { understood: [], questions: [], error: error.message } }
      renderPanel()
    }
    document.getElementById('read-back').addEventListener('click', readBack)
    // A choice answers a question: its words take the place of the unclear
    // ones, and the orders are read back again.
    body.querySelectorAll('[data-choice]').forEach(b => b.addEventListener('click', () => {
      const choice = state.readback.choices[Number(b.dataset.choice)]
      const option = choice.options[Number(b.dataset.option)]
      const at = state.draft.toLowerCase().indexOf(String(choice.place).toLowerCase())
      if (at >= 0) state.draft = state.draft.slice(0, at) + option.text + state.draft.slice(at + choice.place.length)
      saveDraft(token, state.draft)
      readBack()
    }))
    // One unclear order does not hold up the others: the answer to a
    // question can wait a turn, and "send the rest" sends what was clear.
    const sendOrders = async (sendClear) => {
      state.sending = true
      renderPanel()
      try {
        const result = await api('POST', `/api/seat/${token}/orders`, { text: state.draft, sendClear })
        state.sending = false
        if (result.status === 'clarify') {
          state.readback = { understood: result.understood, questions: result.questions, choices: result.choices, counsel: result.counsel, canSendRest: result.canSendRest }
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
    }
    document.getElementById('send').addEventListener('click', () => sendOrders(false))
    document.getElementById('send-rest')?.addEventListener('click', () => sendOrders(true))
  }

  function verdict(body) {
    const words = verdictWords(state.view.battle)
    const v = state.view.verdict
    body.innerHTML = `
      <div class="verdict" style="display: flex; flex-direction: column; gap: 8px">
        <h2>${esc(words.title)}</h2>
        <p>${esc(words.reason)}${words.night ? '' : `, after ${esc(clock(state.view.battle.minutes))}`}.</p>
      </div>
      ${v?.night?.calledOut && v.night.next ? `<a class="notice" href="/b/${esc(v.night.next)}" data-link role="status"><strong>${esc(v.night.calledOut)}</strong><span>${esc(v.night.again)}</span></a>` : ''}
      ${v?.night && v.night.noNextDay ? `<p class="note">${esc(v.night.noNextDay)}</p>` : ''}
      ${v?.night && !v.night.noNextDay && !v.night.calledOut ? (v.night.next
        ? `<a class="btn btn-main btn-wide" href="/b/${esc(v.night.next)}" data-link>${esc(v.night.again)}</a>`
        : `<button class="btn btn-main btn-wide" type="button" id="again">${esc(v.night.again)}</button>`)
        + `<p class="note">${esc(v.night.againNote)}</p>` : '' }
      ${v?.night?.calledOut ? `<p class="note">${esc(v.night.againNote)}</p>` : ''}
      ${v?.night?.tellMe && 'Notification' in window && Notification.permission === 'default'
        ? `<button class="btn btn-quiet btn-wide" type="button" id="tell-me">${esc(v.night.tellMe)}</button>` : ''}
      ${v ? `<table class="losses"><thead><tr><th scope="col">Side</th><th scope="col">Standing</th><th scope="col">Fled</th><th scope="col">Fallen</th></tr></thead><tbody>
        ${Object.entries(v.sides).map(([s, n]) => `<tr><td>${esc(sideName(s))}${s === state.view.battle.side ? ' (you)' : ''}</td><td>${n.standing}</td><td>${n.fled}</td><td>${n.fallen}</td></tr>`).join('')}
      </tbody></table>` : ''}
      ${v?.commander ? commanderLine(v.commander) : ''}
      ${v?.officers ? `<p class="label-caps">Your officers</p>${officerLines(v.officers)}` : ''}
      <label class="field" for="replay">Replay the battle, turn by turn
        <input id="replay" type="range" min="0" max="${state.view.battle.turn - 1}" value="${state.shown ? state.shown.turn : state.view.battle.turn - 1}" style="min-height: 44px">
      </label>
      <p class="note" id="replay-note">${state.shown ? replayWords(state.shown) : 'The field as the battle ended.'}</p>
      ${v?.company ? '<a class="btn btn-wide" href="/officers" data-link>Your officers</a>' : ''}
      <a class="btn btn-wide" href="/battles" data-link>Your battles</a>`
    document.getElementById('again')?.addEventListener('click', async (event) => {
      event.target.disabled = true
      try {
        const next = await api('POST', `/api/seat/${token}/again`)
        saveSeat({ token: next.token, title: next.title, side: state.view.battle.side })
        go(`/b/${next.token}`)
      } catch (error) {
        event.target.disabled = false
        event.target.insertAdjacentHTML('afterend', `<p class="error">${esc(error.message)}</p>`)
      }
    })
    // The browser's own notice, while this page is open in the background:
    // asked for here, at his word, and shown by watch().
    document.getElementById('tell-me')?.addEventListener('click', async (event) => {
      const answer = await Notification.requestPermission().catch(() => 'denied')
      event.target.outerHTML = answer === 'granted' ? `<p class="note">${esc(v.night.toldYou)}</p>` : ''
    })
    const slider = document.getElementById('replay')
    slider.addEventListener('change', async () => {
      const turn = Number(slider.value)
      const last = state.view.battle.turn - 1
      state.shown = turn >= last ? null : await api('GET', `/api/seat/${token}/replay?turn=${turn}`)
      document.getElementById('replay-note').textContent = state.shown ? replayWords(state.shown) : 'The field as the battle ended.'
      renderMap()
    })
  }

  // What became of you.
  function commanderLine(c) {
    let words = {
      free: '',
      freed: 'You were in the enemy\'s hands; your army\'s victory made them give you up.',
      ransomed: c.prices?.length
        ? `You went free at a price: ${esc(c.prices.map(p => `the ${p.toLowerCase()}`).join(', ').replace(/, ([^,]*)$/, ' and $1'))} went to the enemy, with their officers.`
        : 'You gave the field for your freedom: the battle is lost, and your men are spared.',
      released: 'The battle was lost with you still in the enemy\'s hands, and no deal struck. Honor forbids them your life: they let you go, with whatever of your army came through the day.',
      killed: 'You were killed. Everything ends with you: your officers, their names and all they learned. Muster again with a new Commander.',
    }[c.fate]
    // Night fell on him in their hands (narrator/words.js, NIGHT).
    if (c.fate === 'released' && state.view.verdict?.night) words = esc(state.view.verdict.night.released)
    return words ? `<p class="${c.fate === 'killed' || c.fate === 'released' ? 'question' : 'note'}">${words}</p>` : ''
  }

  function officerLines(officers) {
    const hurt = officers.filter(o => o.fate !== 'unhurt')
    const lines = hurt.map(o => `<p class="note">${o.officer ? `${esc(o.officer)}, officer` : 'The officer'} of the ${esc(o.unit.toLowerCase())}: ${
      o.fate === 'killed' ? 'killed' : o.fate === 'captured' ? 'taken by the enemy' : o.fate === 'given up' ? 'given to the enemy as the price of your freedom' : `wounded (${esc(o.how)}), back after the next battle`}.</p>`)
    lines.push(`<p class="note">${hurt.length ? 'All others came through.' : 'Every officer came through.'}${state.view.verdict?.company ? ' Those who lived go with you to your next battle, the wiser for this one.' : ''}</p>`)
    return lines.join('')
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
    // Waiting on the turn; or across the table from a Commander held, for an
    // offer or an answer that can come at any time.
    const table = state.view.captive || state.view.commander?.status === 'held'
    // Night fell, against a friend, and no next day yet: he may call one.
    const night = state.view.verdict?.night && !state.view.verdict.night.next && state.view.verdict.night.tellMe
    if (!night && (state.view.battle.status === 'finished' || (state.view.battle.status !== 'waiting' && !table))) return
    const check = async () => {
      try {
        const s = await api('GET', `/api/seat/${token}/summary`)
        if (night && s.nextDay) {
          if (s.nextDay.calledOut && document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification(s.nextDay.title, { body: s.nextDay.calledOut }) } catch { /* the page shows it */ }
          }
          await load()
          renderAll()
          return watch()
        }
        if (night) return
        if (s.status !== state.view.battle.status || s.turn !== state.view.battle.turn || (s.table ?? null) !== (state.view.battle.table ?? null)) {
          const turned = s.turn !== state.view.battle.turn
          await load()
          if (s.status === 'your-orders' && turned) state.tab = 'dispatches'
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
