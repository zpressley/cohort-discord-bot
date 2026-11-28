// src/web/browser/battle.browser.js
//
// The web app in a real browser (Playwright, Chromium): a solo battle to its
// verdict at phone width, a two-player battle by link at desktop width, and
// the map gesture that writes an order. Not part of `npm test` (CI has no
// browser); run with
//
//   npm run test:browser
//
// It finds Playwright installed locally or globally, and Chromium at
// PLAYWRIGHT_CHROMIUM or /opt/pw-browsers/chromium; without them it skips.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')

function findPlaywright() {
  try { return require('playwright') } catch { /* try the global one */ }
  try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')) } catch { return null }
}
const playwright = findPlaywright()
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const skip = !playwright ? 'Playwright is not installed' : false

async function withApp(run, storeOptions = {}) {
  const store = createBattleStore(storeOptions)
  const server = createServer(store)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await playwright.chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {})
  const errors = []
  try {
    await run({ base, browser, errors, store })
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
  assert.deepEqual(errors, [], 'no errors in the page')
}

async function page(browser, errors, viewport) {
  const context = await browser.newContext({ viewport })
  const p = await context.newPage()
  p.on('pageerror', e => errors.push(e.message))
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  return p
}

// A new browser has no Commander: the muster sends it to make one first,
// and one tap, every answer as offered, makes him and brings him back.
async function toMuster(p, base, { faction = null } = {}) {
  await p.goto(base + '/muster')
  await p.waitForSelector('form#muster, form#make')
  if (await p.locator('form#make').count()) {
    if (faction) await p.selectOption('#make select[name="faction"]', faction)
    await p.click('#make button[type="submit"]')
    await p.waitForSelector('form#muster')
  }
}

test('alone, on a phone: muster, an order written on the map, turns to a verdict, the replay', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(base + '/')
    await p.waitForSelector('form#make')
    assert.match(p.url(), /\/commander\/new\?then=\/$/, 'a new browser makes its Commander first')
    // A new Commander chooses his faction; the enemy's is drawn by lot
    // unless chosen.
    await p.selectOption('select[name="faction"]', 'macedon')
    assert.match(await p.textContent('#faction-note'), /Silver shields, comes free/)
    await p.click('#make button[type="submit"]')
    // Made, he sees the main menu, and goes from there to a new battle.
    await p.waitForSelector('#menu')
    await p.click('#new-battle')
    await p.waitForSelector('form#muster')
    assert.match(await p.textContent('#faction-note'), /you fight for Macedon/)
    await p.selectOption('select[name="enemyFaction"]', 'rome')
    // One kind of battle, to the end: no kind, no day's end, no ground to hold to choose.
    assert.equal(await p.locator('select[name="scenario"], select[name="timeLimit"], input[name="objectives"]').count(), 0)
    assert.match(await p.textContent('form#muster'), /yields the field, its army breaks or is destroyed, or its Commander is killed/)
    // With no army bought, the usual one.
    assert.match(await p.textContent('#army-line'), /The usual army of Macedon/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-muster-new.png'), fullPage: true })
    await p.click('button[type="submit"]')
    await p.waitForSelector('#map-scroll svg')
    assert.match(p.url(), /\/b\/[A-Za-z0-9_-]+$/)

    // The orders box is on the first screen, not a scroll away.
    const ordersBox = await p.locator('#orders').boundingBox()
    assert.ok(ordersBox.y + ordersBox.height <= 844, `the orders box ends at ${ordersBox.y + ordersBox.height}, inside the 844 px screen`)

    // The first turn's card: its examples are put in the box, and the game reads them.
    const examples = await p.locator('[data-example]').count()
    assert.equal(examples, 6)
    // The muster offers the pitched battle first (ruled 2026-11-25): no
    // ground to fight for, so no "take" among them; the first is to advance.
    assert.equal(await p.textContent('[data-example] >> nth=0'), 'everyone advance')
    for (let i = 0; i < examples; i++) {
      await p.click(`[data-example] >> nth=${i}`)
    }
    await p.click('#read-back')
    await p.waitForSelector('.readback')
    assert.equal(await p.locator('.question').count(), 0, 'every example is understood')
    await p.click('#clear')
    // The empty box shows orders in his own units' names, not "spears" he has not got.
    assert.match(await p.getAttribute('#orders', 'placeholder'), /^Sarissa foot 1 to [A-J]\d+(-[NS][EW])?, then hold\nSarissa foot 2 to [A-J]\d+(-[NS][EW])?, then advance\nPeltasts hold$/)

    // The Army tab: Macedon's army, and you ride with its elite unit.
    await p.click('[data-tab="army"]')
    assert.match(await p.textContent('.bar-title'), /Macedon against Rome/)
    const cards = await p.locator('.unit-card h3').allTextContents()
    assert.deepEqual(cards, ['Sarissa foot 1', 'Sarissa foot 2', 'Peltasts', 'Silver shields'])
    assert.match(await p.locator('.unit-card', { hasText: 'Silver shields' }).textContent(), /You ride with them[\s\S]*Officer:.*veteran/)
    // Against the computer: its Commander's name, and what is said of him.
    assert.match(await p.textContent('#panel-body'), /The enemy's Commander: [A-Z][a-z]+, said to be (bold|steady|cautious)/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-army.png'), fullPage: true })

    // The map gesture: pick the Silver Shields in the army panel, then tap a place.
    await p.click('[data-pick="red_silver_shields"]')
    const svg = p.locator('#map-scroll svg')
    const box = await svg.boundingBox()
    await svg.click({ position: { x: Math.min(box.width - 5, 260), y: 120 } })
    const draft = await p.inputValue('#orders')
    assert.match(draft, /^Silver shields to [A-J]\d{1,2}-(NW|NE|SW|SE)$/, `the map wrote "${draft}"`)

    // Read back, then send; alone, each turn runs at once.
    await p.click('#read-back')
    await p.waitForSelector('.readback')

    // An unclear place comes with choices; picking one rewrites the order.
    await p.fill('#orders', 'sarissa foot 1 to the ford')
    await p.click('#read-back')
    await p.waitForSelector('[data-choice]')
    await p.click('[data-choice] >> nth=0')
    await p.waitForSelector('.readback')
    assert.doesNotMatch(await p.inputValue('#orders'), /the ford/)
    // Sending only an order that needs an answer sends nothing, and says so.
    await p.fill('#orders', 'everyone else hold')
    await p.click('#send')
    await p.waitForSelector('text=Nothing was sent: your officers need an answer first')
    await p.fill('#orders', 'everyone advance')
    await p.click('#send')
    await p.waitForSelector('.dispatch')

    for (let i = 0; i < 40; i++) {
      if (await p.locator('.verdict').count()) break
      await p.click('[data-tab="orders"]')
      if (await p.locator('.verdict').count()) break
      // (Taken by the enemy, he has no orders to send: he waits, and lets
      // his army fight. More often since the pitched battle, with no ground,
      // is offered first: November 25.)
      await p.waitForSelector('#send, #wait, .verdict')
      if (await p.locator('.verdict').count()) break
      await p.click(await p.locator('#send').count() ? '#send' : '#wait')
      // The turn has run when the page is no longer sending. (Not "a
      // dispatch is shown": a Commander held stays on the orders tab, and
      // waiting for a dispatch there timed out, in about one battle in
      // twenty: round two of "How the kinds of battle were built".)
      await p.waitForFunction(() => !document.querySelector('#send[disabled], #wait[disabled]'))
    }
    await p.click('[data-tab="orders"]')
    await p.waitForSelector('.verdict h2')
    assert.match(await p.textContent('.verdict h2'), /Victory|Defeat|A draw/)
    assert.equal(await p.locator('table.losses tbody tr').count(), 2)
    assert.match(await p.textContent('#panel-body'), /captain|came through/)

    await p.fill('#replay', '0')
    await p.dispatchEvent('#replay', 'change')
    await p.waitForFunction(() => /before the first orders/.test(document.getElementById('replay-note').textContent))

    // Coming back: the main menu lists the finished battle.
    await p.goto(base + '/')
    await p.waitForSelector('.battle-link')
    assert.match(p.url(), /\/$/, 'the front address is the main menu')

    // Your officers: those who lived, with the battle in their record.
    await p.click('a[href="/officers"]')
    await p.waitForURL(/\/officers$/)
    await p.waitForFunction(() => /battle fought|battles fought/.test(document.querySelector('main')?.textContent ?? ''))
    assert.match(await p.textContent('main'), /1 battle fought/)
    if (await p.locator('.officer').count()) {
      await p.locator('.officer summary').first().click()
      assert.match(await p.locator('.officer li').first().textContent(), /a victory|a defeat|a draw/)
    }
    assert.match(await p.textContent('main'), /Commander \w+ the Builder of Macedon/, 'the Engineer, for glory, after one battle')
    assert.match(await p.textContent('main'), /ready to muster/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, fullPage: true })

    // The next muster offers him again, or a new Commander; while his army
    // is in the field he cannot be chosen.
    await p.goto(base + '/muster')
    await p.waitForSelector('select[name="commander"]')
    assert.match(await p.locator('select[name="commander"] option:checked').textContent(), /1 battle fought/)
    // His faction is his: it is shown, not asked again.
    assert.equal(await p.locator('#faction-field').isHidden(), true)
    assert.match(await p.textContent('#faction-note'), /you fight for Macedon/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-muster-his.png'), fullPage: true })
    await p.click('button[type="submit"]')
    await p.waitForSelector('#orders')
    await p.goto(base + '/muster')
    await p.waitForSelector('form#make')
    assert.match(p.url(), /\/commander\/new/, 'his army is in the field: a new Commander must be made to muster')
    await p.goto(base + '/officers')
    await p.waitForSelector('.commander')
    assert.match(await p.textContent('main'), /Your army is in the field/, 'you, not he: the Commander is the player')
  })
})

test('two players by link, on desktops: the turn waits for both, then both read the dispatch', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const red = await page(browser, errors, { width: 1440, height: 900 })
    await toMuster(red, base)
    await red.check('input[name="opponent"][value="friend"]')
    // Against a friend the enemy's faction is not asked: his Commander brings his own.
    assert.equal(await red.locator('#enemy-field').isHidden(), true)
    await red.click('button[type="submit"]')
    await red.waitForSelector('#friend-link')
    const link = (await red.textContent('#friend-link')).trim()
    await red.click('text=To your Command Tent')
    await red.waitForSelector('#map-scroll svg')

    const blue = await page(browser, errors, { width: 1440, height: 900 })
    // Red sends orders before the friend has even opened the link.
    await red.fill('#orders', 'everyone hold')
    await red.click('#send')
    await red.waitForSelector('.calm')

    // The friend's first screen: who leads? A new Commander, made on his
    // own screen, who comes back here to lead.
    await blue.goto(link)
    await blue.waitForSelector('#who-leads')
    assert.match(await blue.textContent('#who-leads h1'), /Who leads\?/)
    assert.equal(await blue.locator('[data-lead]').count(), 2, 'no Commanders yet in this browser: a new one, with the usual army or one he buys first')
    if (process.env.SHOT) await blue.screenshot({ path: process.env.SHOT.replace('.png', '-who-leads-desktop.png'), fullPage: true })
    await blue.click('[data-lead="new"]')
    await blue.waitForSelector('form#make')
    // A new Commander's faction, for life: the army the muster gave this side first.
    await blue.selectOption('select[name="faction"]', 'sarmatia')
    await blue.click('#make button[type="submit"]')
    // The Commander he has just made leads: no second tap on "Who leads?".
    await blue.waitForSelector('#map-scroll svg')
    assert.equal(await blue.locator('#who-leads').count(), 0, 'the Commander just made leads at once')
    assert.match(await blue.textContent('.bar-title'), /Blue/)
    assert.equal((await blue.evaluate(() => JSON.parse(localStorage.getItem('cohort.commanders')))).length, 1, 'his link is kept in this browser')
    await blue.click('[data-tab="army"]')
    assert.match(await blue.textContent('#panel-body'), /You ride with them/)
    assert.match(await blue.locator('.unit-card', { hasText: 'You ride with them' }).textContent(), /Iron scale riders/)
    assert.match(await blue.textContent('#panel-body'), /veteran/)
    assert.match(await blue.textContent('#panel-body'), /No officer yet/)
    assert.match(await red.textContent('.calm'), /with the army/)

    await blue.click('[data-tab="orders"]')
    await blue.fill('#orders', 'everyone advance')
    await blue.click('#send')
    await blue.waitForSelector('.dispatch')

    // Red's page notices when it looks again (it checks every half minute,
    // or when the page comes back into view); reloading is the same.
    await red.reload()
    await red.waitForSelector('#orders')
    await red.click('[data-tab="dispatches"]')
    await red.waitForSelector('.dispatch')
    assert.match(await red.textContent('.bar .chip'), /Your orders/)

    // The friend's browser now lists the battle too.
    await blue.goto(base + '/battles')
    await blue.waitForSelector('.battle-link')
    // And his Commander, whose army is in the field.
    await blue.goto(base + '/officers')
    await blue.waitForSelector('.commander')
    assert.match(await blue.textContent('main'), /Your army is in the field/)

    // Choosing is the friend's alone, and only once: the link opens the tent now.
    await blue.goto(link)
    await blue.waitForSelector('#map-scroll svg')
    assert.equal(await blue.locator('#who-leads').count(), 0)
  })
})

test('on a phone: a new Commander buys his army, is told why a pick is refused, keeps it, and musters with it', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    const shot = (name) => process.env.SHOT ? p.screenshot({ path: process.env.SHOT.replace('.png', `-${name}.png`) }) : null
    const noSideways = async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
    await toMuster(p, base, { faction: 'han' })
    await p.click('#to-army')
    await p.waitForSelector('#army-screen')
    // He starts from the usual army; the elite is free and not for sale.
    assert.match(await p.textContent('#budget'), /26 of 30 supply points/)
    assert.match(await p.textContent('.buy-unit.elite'), /Yulin guard[\s\S]*Free[\s\S]*Not for sale/)
    // Before his first battle the elite's officer is the veteran the making promised, not "no officer yet".
    assert.match(await p.textContent('.buy-unit.elite'), /Officer: your veteran, who leads them from your first battle/)
    assert.equal(await p.locator('.buy-unit.elite [data-dismiss]').count(), 0)
    while (await p.locator('[data-dismiss]').count()) {
      const n = await p.locator('[data-dismiss]').count()
      await p.click('[data-dismiss] >> nth=0')
      await p.waitForFunction((was) => document.querySelectorAll('[data-dismiss]').length < was, n)
    }
    assert.match(await p.textContent('#budget'), /0 of 30 supply points/)
    assert.equal(await p.locator('#keep').isDisabled(), true, 'an army needs at least one unit')
    await noSideways()
    await shot('army-empty')

    // A unit, step by step: professionals with crossbows.
    await p.click('#add')
    await p.waitForSelector('#draft')
    const pick = async (field, value) => {
      await p.click(`[data-field="${field}"][data-value="${value}"]`)
      await p.waitForSelector(`[data-field="${field}"][data-value="${value}"][aria-pressed="true"]`)
    }
    await pick('quality', 'professional')
    await pick('weapon', 'han_chinese_crossbow')
    assert.match(await p.textContent('#draft h3'), /Crossbows/)
    // Refused: a heavy shield with the crossbow. Tapping it says why, in the builder's words.
    // (Centred first: the page is long, and the foot of it stays in view.)
    await p.$eval('[data-field="shield"][data-value="heavy_shield"]', el => el.scrollIntoView({ block: 'center' }))
    await p.click('[data-field="shield"][data-value="heavy_shield"]', { force: true })
    await p.waitForSelector('#refused')
    assert.match(await p.textContent('#refused'), /Not allowed: Heavy shield: the crossbow allows at most a medium shield/)
    assert.equal(await p.locator('[data-field="shield"][data-value="heavy_shield"][aria-pressed="true"]').count(), 0)
    await noSideways()
    await shot('army-refused')
    await pick('armor', 'medium_armor')
    // A second weapon: a sword for men who shoot, one more plain choice.
    assert.match(await p.textContent('#army-screen'), /A second weapon: a sword, to fight hand to hand/)
    await pick('second', 'chinese_dao')
    assert.match(await p.textContent('#draft'), /professionals, crossbow and dao, medium armour, no shield, on foot/)
    await noSideways()
    await shot('army-second')
    await p.click('#take')
    await p.waitForSelector('#add')
    assert.match(await p.textContent('#budget'), /13 of 30 supply points/, 'the dao at his belt costs 1')
    assert.match(await p.textContent('[data-unit="0"]'), /crossbow and dao/)
    await shot('army-part')

    // Slingers until the supply points run out; the last two are numbered.
    for (let i = 0; i < 6 && !(await p.locator('#add').isDisabled()); i++) {
      await p.click('#add')
      await p.waitForSelector('#draft')
      // Spears take javelins as their second weapon, not a sword.
      if (i === 0) {
        assert.match(await p.textContent('#army-screen'), /A second weapon: to throw as they close/)
        await shot('army-javelins')
      }
      await pick('weapon', 'sling')
      await p.click('#take')
      await p.waitForSelector('#add')
    }
    assert.equal(await p.locator('#add').isDisabled(), true)
    assert.match(await p.textContent('#army-screen'), /the cheapest unit costs 4/)
    const names = await p.locator('.buy-unit h3').allTextContents()
    assert.deepEqual(names, ['Yulin guard', 'Crossbows', 'Slingers', 'Slingers 2', 'Slingers 3'])
    await shot('army-full')

    // Kept: back to the muster, with his own army.
    await p.click('#keep')
    await p.waitForSelector('form#muster')
    assert.match(await p.textContent('#army-line'), /Your own army[\s\S]*Crossbows, Slingers, Slingers 2/)
    await shot('muster-own-army')
    await p.click('button[type="submit"]')
    await p.waitForSelector('#map-scroll svg')
    await p.click('[data-tab="army"]')
    assert.deepEqual(await p.locator('.unit-card h3').allTextContents(), ['Crossbows', 'Slingers', 'Slingers 2', 'Slingers 3', 'Yulin guard'])

    // In the field, his army cannot be changed.
    await p.goto(base + '/officers')
    await p.click('a[href^="/army/"]')
    await p.waitForSelector('#army-screen')
    assert.match(await p.textContent('#army-screen'), /in the field[\s\S]*can be changed when the battle is over/)
    assert.equal(await p.locator('#keep, #add, [data-dismiss]').count(), 0)
  })
})

async function newBattle(base, store) {
  const res = await fetch(base + '/api/battles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: 'meeting-battle', map: 'crownhill', opponent: 'standing', side: 'red' }) })
  const token = (await res.json()).seats.red
  return { token, units: store.seatOf(token).entry.game.battle.world.units.filter(u => u.side === 'red') }
}

test('on a phone: a stack of units is picked apart, and the map zooms by pinch', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const { token, units } = await newBattle(base, store)
    // Four units on neighbouring tiles, two of them on one tile.
    const at = units[0].position
    units.slice(0, 4).forEach((u, i) => { u.position = { x: at.x + (i === 1 || i === 3 ? 1 : 0), y: at.y + (i === 2 || i === 3 ? 1 : 0) } })
    units[1].position = { ...at }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    const p = await context.newPage()
    p.on('pageerror', e => errors.push(e.message))
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await p.goto(`${base}/b/${token}`)
    await p.waitForSelector('#map-scroll svg')

    // Names are not piled up: a cluster of four is named once.
    assert.equal(await p.locator('.unit-name').count(), 1)

    // A tap on the cluster asks which unit; choosing one picks it.
    const counter = await p.locator('.counter').first().boundingBox()
    await p.touchscreen.tap(counter.x + counter.width / 2, counter.y + counter.height / 2)
    await p.waitForSelector('[data-stack]')
    assert.ok(await p.locator('[data-stack]').count() >= 2)
    const name = (await p.locator('[data-stack]').first().textContent()).trim()
    await p.click('[data-stack] >> nth=0')
    assert.match(await p.textContent('#map-hint'), new RegExp(`${name} picked`))
    assert.equal(await p.locator('.unit-name').count(), 2, 'the picked unit also carries its name')

    // A pinch outward zooms the map in.
    await p.click('#unpick')
    const before = (await p.locator('#map-scroll svg').boundingBox()).width
    const cdp = await context.newCDPSession(p)
    const box = await p.locator('#map-scroll').boundingBox()
    const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const pt = (dx, id) => ({ x: mid.x + dx, y: mid.y, id })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(-20, 1), pt(20, 2)] })
    for (const d of [30, 45, 60, 80]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(-d, 1), pt(d, 2)] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    const after = (await p.locator('#map-scroll svg').boundingBox()).width
    assert.ok(after > before * 1.5, `pinching out zoomed the map from ${before} to ${after}`)
  })
})

test('a dispatch says so when the AI is on but gave only the plain report', { skip }, async () => {
  const ai = { configured: true, complete: async () => ({ ok: false }) }
  await withApp(async ({ base, browser, errors }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    await toMuster(p, base)
    await p.click('button[type="submit"]')
    await p.waitForSelector('#orders')
    await p.fill('#orders', 'everyone advance')
    await p.click('#send')
    await p.waitForSelector('.dispatch')
    assert.match(await p.textContent('.dispatch .flag'), /plain report/)
  }, { ai })
})

test('held, on a phone: an offer made with the tick boxes, the friend who holds him answers it, and riding with a unit beside him', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const post = async (url, body) => (await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })).json()
    const commander = (await post('/api/commanders')).token
    const seats = (await post('/api/battles', { opponent: 'friend', side: 'red', seed: 3, commander })).seats
    await post(`/api/seat/${seats.blue}/join`, { commander: null })
    const game = store.seatOf(seats.red).entry.game
    // Taken, by hand (the engine's rule is tested in the engine).
    Object.assign(game.battle.commanders.red, { status: 'held', heldBy: 'blue_swords' })

    const red = await page(browser, errors, { width: 390, height: 844 })
    await red.goto(`${base}/b/${seats.red}`)
    await red.waitForSelector('#make-offer')
    assert.match(await red.textContent('#panel-body'), /You are taken/)
    assert.equal(await red.locator('#yield-held').count(), 0, 'held, he cannot yield by his own word')
    assert.equal(await red.textContent('#map-hint'), 'You are held by the enemy: you can send no orders.', 'the map does not ask him to order his units')
    assert.equal(await red.textContent('#make-offer'), 'Offer the field alone')
    await red.check('[data-chip="red_horse"]')
    assert.equal(await red.textContent('#make-offer'), 'Offer the field and the horse')
    if (process.env.SHOT) await red.screenshot({ path: process.env.SHOT.replace('.png', '-held-offer.png') })
    await red.click('#make-offer')
    await red.waitForSelector('#panel-body .readback')
    assert.match(await red.textContent('#panel-body'), /Your offer is with them: the field and the horse/)
    const tabs = await red.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    assert.ok(tabs, 'no sideways scroll')
    // His Army tab: what he can see from where he is held, and no more.
    await red.click('[data-tab="army"]')
    assert.match(await red.textContent('#panel-body'), /out of your sight|in sight from where you are held/)
    assert.equal(await red.locator('[role="meter"][aria-label="Morale"]').count(), 0, 'no morale for units he cannot see')

    const blue = await page(browser, errors, { width: 390, height: 844 })
    await blue.goto(`${base}/b/${seats.blue}`)
    await blue.waitForSelector('#offer-accept')
    assert.match(await blue.textContent('.captive'), /For his freedom he offers the field and enemy horse/)
    assert.equal(await blue.locator('#offer-more').count(), 0, 'his side has seen nothing more to ask for')
    // Blue has seen red's spears and swords (by hand: the turn has not run).
    // (And word of them has reached blue's Commander: engine/orchestrator/word.js.)
    for (const id of ['red_spears', 'red_swords']) game.intel.blue.known[id] = game.word.blue.enemies[id] = { status: 'ghost', strength: 100, position: { x: 1, y: 1 }, seenOnTurn: 0 }
    await blue.reload()
    await blue.waitForSelector('#offer-more')
    await blue.locator('.captive').scrollIntoViewIfNeeded()
    if (process.env.SHOT) await blue.screenshot({ path: process.env.SHOT.replace('.png', '-captor-offer.png') })
    await blue.click('#offer-more')
    await blue.waitForSelector('#ask-send')
    assert.equal(await blue.locator('[data-ask]').count(), 3, 'what he offered, and what his side has seen')
    await blue.check('[data-ask="red_spears"]')
    if (process.env.SHOT) await blue.screenshot({ path: process.env.SHOT.replace('.png', '-captor-ask.png') })
    await blue.click('#ask-send')
    await blue.waitForFunction(() => /You asked for/.test(document.querySelector('.captive')?.textContent ?? ''))
    assert.match(await blue.textContent('.captive'), /You asked for the field, enemy horse and enemy spears/)
    await red.reload()
    await red.waitForSelector('#panel-body')
    assert.match(await red.textContent('#panel-body'), /They ask for more: the field, the horse and the spears/)
    // The turn runs; his next offer has what they asked for ticked ready.
    await post(`/api/seat/${seats.red}/orders`, { text: '' })
    await post(`/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })
    await red.reload()
    await red.waitForSelector('#make-offer')
    assert.equal(await red.isChecked('[data-chip="red_spears"]'), true, 'what they asked for, ticked ready')
    assert.equal(await red.textContent('#make-offer'), 'Offer the field and 2 units')

    // Free again, the swords brought beside him: "Ride with them".
    Object.assign(game.battle.commanders.red, { status: 'free', heldBy: null })
    const withHim = game.battle.world.units.find(u => u.id === game.battle.commanders.red.unitId)
    game.battle.world.units.find(u => u.id === 'red_swords').position = { x: withHim.position.x + 1, y: withHim.position.y }
    await red.reload()
    await red.waitForSelector('#tabs')
    await red.click('[data-tab="army"]')
    await red.waitForSelector('[data-ride="Swords"]')
    const beside = game.battle.world.units.filter(u => u.side === 'red' && Math.max(Math.abs(u.position.x - withHim.position.x), Math.abs(u.position.y - withHim.position.y)) <= 1 && u !== withHim)
    assert.equal(await red.locator('[data-ride]').count(), beside.length, 'only the units beside him')
    await red.locator('[data-ride="Swords"]').scrollIntoViewIfNeeded()
    if (process.env.SHOT) await red.screenshot({ path: process.env.SHOT.replace('.png', '-ride.png') })
    await red.click('[data-ride="Swords"]')
    await red.waitForSelector('#orders')
    assert.equal(await red.inputValue('#orders'), 'I ride with the swords')
    await red.click('#read-back')
    await red.waitForSelector('.readback')
    assert.equal(await red.textContent('.readback'), 'You: ride with Swords')
  })
})

test('the roster on a phone: who marches at the muster, a unit taken from the enemy, an officer moved, a unit named', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const post = async (url, body) => (await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
    // Rome's hastati, under an officer of their own, given to a Commander
    // of Macedon in a deal for Rome's Commander's freedom.
    const red = await post('/api/commanders', { faction: 'rome' })
    const blue = await post('/api/commanders', { faction: 'macedon' })
    const c = store.commanders.get(red.token)
    store.commanders.setCompany(c, { ...c.company, nextId: 2, officers: [{ id: 'o1', name: 'Tullus', experience: 9, personality: 'steady', values: 'survival', loyalty: 60, leads: 'hastati', status: 'fit', record: [] }] })
    const seats = (await post('/api/battles', { opponent: 'friend', side: 'red', seed: 3, commander: red.token })).seats
    await post(`/api/seat/${seats.blue}/join`, { commander: blue.token })
    const game = store.seatOf(seats.red).entry.game
    Object.assign(game.battle.commanders.red, { status: 'held', heldBy: game.battle.world.units.find(u => u.side === 'blue').id })
    await post(`/api/seat/${seats.red}/offer`, { units: ['red_hastati'] })
    const offer = (await (await fetch(`${base}/api/seat/${seats.blue}`)).json()).captive.offer.id
    await post(`/api/seat/${seats.blue}/answer`, { offer, accept: true })

    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(base + '/battles')
    await p.evaluate((token) => { localStorage.setItem('cohort.commanders', JSON.stringify([token])); localStorage.setItem('cohort.lastCommander', token) }, blue.token)

    // The muster: one tap marches what marched last time; open, he chooses.
    await p.goto(base + '/muster')
    await p.waitForSelector('#who-marches')
    assert.match(await p.textContent('#march-sum'), /\d+ of 30 supply points, \d+ left/)
    await p.click('#who-marches summary')
    await p.click('[data-march="hastati"]')
    assert.match(await p.textContent('#march-sum'), /: \d+ over/, 'the hastati too are over the budget')
    await p.click('[data-march="sarissa foot 2"]')
    assert.doesNotMatch(await p.textContent('#march-sum'), /over/)
    assert.equal(await p.getAttribute('[data-march="hastati"]', 'aria-pressed'), 'true')
    assert.equal(await p.locator('[data-always]').count(), 1, 'the elite always marches')
    await p.locator('#who-marches').scrollIntoViewIfNeeded()
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-who-marches.png'), fullPage: true })
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll')

    // The army screen: the unit taken, and naming it.
    await p.goto(`${base}/army/${blue.token}`)
    await p.waitForSelector('[data-captured="hastati"]')
    assert.match(await p.textContent('[data-captured="hastati"]'), /Taken from the enemy: Commander .*'s[\s\S]*Officer: Tullus/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-roster-captured.png'), fullPage: true })
    await p.click('[data-name-unit="hastati"]')
    await p.fill('#new-name', 'horse wolves')
    await p.click('#name-form button[type="submit"]')
    await p.waitForSelector('#name-refused')
    assert.equal(await p.textContent('#name-refused'), '"horse" is a kind of troops in an order: it cannot be in a name.')
    // The refusal is the server's 400, which the page logs: expected here.
    const logged = errors.findIndex(e => /status of 400/.test(e))
    if (logged >= 0) errors.splice(logged, 1)
    await p.locator('#name-form').scrollIntoViewIfNeeded()
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-naming.png') })
    await p.fill('#new-name', 'Iron Wolves')
    await p.click('#name-form button[type="submit"]')
    await p.waitForSelector('[data-captured="iron wolves"]')
    assert.match(await p.textContent('#army-screen'), /The hastati are the iron wolves now/)

    // The Officers page: Tullus moved to the elite, in place of the veteran.
    await p.goto(base + '/officers')
    const tullus = store.commanders.get(blue.token).company.officers.find(o => o.name === 'Tullus')
    await p.waitForSelector(`[data-officer-card="${tullus.id}"]`)
    assert.match(await p.textContent(`[data-officer-card="${tullus.id}"]`), /Given to you by Commander .* He has every reason to hate you/)
    await p.click(`[data-move="${tullus.id}"]`)
    await p.locator(`#move-${tullus.id}`).scrollIntoViewIfNeeded()
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-transfer.png') })
    await p.click(`[data-officer="${tullus.id}"][data-to="silver shields"]`)
    await p.waitForSelector('#officers-note')
    assert.equal(await p.textContent('#officers-note'), 'Tullus now leads the silver shields.')
    assert.equal(store.commanders.get(blue.token).company.officers.find(o => o.name === 'Tullus').leads, 'silver shields')
  })
})

test('on a phone: a Commander the battle is not waiting on sees his orders with the army and nothing of why; a unit with no word says so', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const { waitingOn } = require('../../engine/orchestrator')
    const post = async (url, body) => (await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })).json()
    let found = null
    // (Seeds 5 to 10 found one until combat changed with the army balance.)
    for (let seed = 5; seed <= 40; seed++) {
      const redC = (await post('/api/commanders', { faction: 'rome' })).token
      const blueC = (await post('/api/commanders', { faction: 'han' })).token
      const seats = (await post('/api/battles', { opponent: 'friend', side: 'red', seed, commander: redC, objectives: [] })).seats
      await post(`/api/seat/${seats.blue}/join`, { commander: blueC })
      const game = store.seatOf(seats.red).entry.game
      // (Sent 300 m east since columns, November 24: told to advance, every
      // stop called both; src/web/tests/asked.test.js the same.)
      await post(`/api/seat/${seats.red}/orders`, { text: 'everyone go east 300 m' })
      await post(`/api/seat/${seats.blue}/orders`, { text: 'everyone hold' })
      for (let t = 0; t < 30 && !game.outcome.decided && waitingOn(game).length !== 1; t++) {
        for (const side of waitingOn(game)) await post(`/api/seat/${seats[side]}/orders`, { text: '' })
      }
      if (!game.outcome.decided && waitingOn(game).length === 1) { found = { seats, game, other: waitingOn(game)[0] === 'red' ? 'blue' : 'red' }; break }
    }
    assert.ok(found, 'a battle that stopped for one Commander alone')
    const { seats, game, other } = found
    // One of his units has sent no word for longer than it should (by hand).
    const far = Object.keys(game.word[other].units).find(id => id !== game.battle.commanders[other].unitId && !game.word[other].units[id].gone)
    Object.assign(game.word[other].units[far], { overdue: true, live: false })

    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(`${base}/b/${seats[other]}`)
    await p.waitForSelector('.calm')
    assert.match(await p.textContent('.bar .chip'), /With the army/)
    assert.match(await p.textContent('#panel-body'), /Your officers are carrying out your orders/)
    assert.doesNotMatch(await p.textContent('#app'), /enemy commander|waiting on the enemy|has not answered/i)
    assert.equal(await p.textContent('#change'), 'Send new orders', 'he may change his mind, unasked')
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-with-the-army.png') })
    await p.click('[data-tab="army"]')
    const card = p.locator('.unit-card', { hasText: 'no word of them since' })
    assert.equal(await card.count(), 1)
    assert.match(await card.textContent(), /no word/)
    assert.doesNotMatch(await p.textContent('#panel-body'), /cut off/i)
    if (process.env.SHOT) {
      await card.scrollIntoViewIfNeeded()
      await p.screenshot({ path: process.env.SHOT.replace('.png', '-no-word.png') })
    }
  })
})

// Ruled 2026-11-24: "No the day just ends the battle, you can choose to
// fight again the next day."
test('on a phone: night ends the battle with no winner, and the main button fights again the next day', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const post = async (url, body) => (await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })).json()
    const p = await page(browser, errors, { width: 390, height: 844 })
    // The muster says how long the day is, and what night does.
    await toMuster(p, base)
    assert.match(await p.textContent('form#muster'), /The day is 12 h of battle\. If neither side has won by then, night ends the fighting/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-muster-day.png') })

    const commander = (await post('/api/commanders', { faction: 'rome' })).token
    // (A battle for ground: night ends it with no winner, whatever the men
    // left. A pitched battle's night: the kinds of battle test, below.)
    const seat = (await post('/api/battles', { opponent: 'standing', side: 'red', seed: 3, commander, enemyFaction: 'han', turnLimit: 2, kind: 'ground' })).seats.red
    const game = store.seatOf(seat).entry.game
    for (let i = 0; i < 10 && !game.outcome.decided; i++) await post(`/api/seat/${seat}/orders`, { text: 'everyone hold' })
    assert.equal(game.outcome.reason, 'night fell')
    await p.goto(`${base}/b/${seat}`)
    await p.waitForSelector('.verdict h2')
    assert.equal(await p.textContent('.verdict h2'), 'Night fell')
    assert.match(await p.textContent('.verdict'), /Night has ended the fighting, and neither side has won/)
    const again = p.locator('#again')
    assert.equal(await again.textContent(), 'Fight again the next day')
    assert.ok((await again.boundingBox()).height >= 44)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-night.png'), fullPage: true })
    // The dispatch says it too.
    await p.click('[data-tab="dispatches"]')
    assert.match(await p.textContent('#panel-body'), /Night has ended the fighting, and neither side has won/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-night-dispatch.png') })
    await p.click('[data-tab="orders"]')
    await p.click('#again')
    // (The page it starts on matches /b/<seat> too: wait for another seat's.)
    await p.waitForURL(url => /\/b\/[A-Za-z0-9_-]+$/.test(url.pathname) && !url.pathname.endsWith(`/b/${seat}`))
    await p.waitForSelector('#map-scroll svg')
    assert.notEqual(p.url(), `${base}/b/${seat}`)
    assert.match(await p.textContent('.bar-title'), /Rome against Han, day 2/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-day-2.png') })
  })
})

// Ruled 2026-11-24: "no they need a notice".
test('on a phone: a friend called out to a next day is told on the old verdict without a reload, on his list of battles and on his Commander\'s page', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const post = async (url, body) => (await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })).json()
    const red = (await post('/api/commanders', { faction: 'rome' })).token
    const blue = (await post('/api/commanders', { faction: 'han' })).token
    const seats = (await post('/api/battles', { opponent: 'friend', side: 'red', seed: 5, commander: red, turnLimit: 2 })).seats
    await post(`/api/seat/${seats.blue}/join`, { commander: blue })
    const game = store.seatOf(seats.red).entry.game
    const { waitingOn } = require('../../engine/orchestrator')
    for (let i = 0; i < 20 && !game.outcome.decided; i++) for (const side of waitingOn(game)) await post(`/api/seat/${seats[side]}/orders`, { text: 'everyone hold' })
    assert.equal(game.outcome.reason, 'night fell')

    // The friend's browser: his Commander and the old battle are kept in it.
    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(base + '/battles')
    await p.evaluate((token) => localStorage.setItem('cohort.commanders', JSON.stringify([token])), blue)
    await p.goto(`${base}/b/${seats.blue}`)
    await p.waitForSelector('.verdict h2')
    assert.equal(await p.locator('.notice').count(), 0)

    // Red calls the next day; the friend's open page finds it when it looks again.
    const called = await post(`/api/seat/${seats.red}/again`)
    const next = store.seatOf(called.token).entry
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await p.waitForSelector('.notice')
    assert.match(await p.textContent('.notice'), /The enemy has called you out for a second day\. Your orders are wanted\./)
    assert.equal(await p.getAttribute('.notice', 'href'), `/b/${next.seats.blue}`)
    assert.ok((await p.locator('.notice').boundingBox()).height >= 44)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-called-out-verdict.png'), fullPage: true })

    // His list of battles: the new day's battle, waiting on him, marked plainly.
    await p.goto(base + '/battles')
    await p.waitForSelector('.battle-link')
    const mine = p.locator('.battle-link.mine')
    assert.equal(await mine.count(), 1)
    assert.match(await mine.textContent(), /day 2/)
    assert.match(await mine.textContent(), /The enemy has called you out for a second day/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-called-out-battles.png'), fullPage: true })

    // His Commander's page.
    await p.goto(base + '/officers')
    await p.waitForSelector('.notice')
    assert.match(await p.textContent('.notice'), /called you out/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-called-out-officers.png') })
    const width = await p.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(width <= 390, 'no sideways scroll')
    if (process.env.SHOT) {
      await p.setViewportSize({ width: 1280, height: 800 })
      await p.goto(`${base}/b/${seats.blue}`)
      await p.waitForSelector('.notice')
      await p.screenshot({ path: process.env.SHOT.replace('.png', '-called-out-desktop.png') })
      await p.setViewportSize({ width: 390, height: 844 })
      await p.goto(base + '/officers')
      await p.waitForSelector('.notice')
    }

    // He answers: his orders go, and the notice is done.
    await p.click('.notice')
    await p.waitForSelector('#map-scroll svg')
    assert.match(p.url(), new RegExp(`/b/${next.seats.blue}$`))
  })
})

test('on a phone: the muster names the field\'s ground to fight for; the tent marks it on the map and says who holds it; the verdict says it decided the battle', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    const shot = (name) => process.env.SHOT ? p.screenshot({ path: process.env.SHOT.replace('.png', `-${name}.png`), fullPage: true }) : null
    await toMuster(p, base)
    // (Under the battle for ground, the second kind offered: ruled
    // 2026-11-25. Crownhill's ground is its three fords since.)
    assert.match(await p.textContent('.kind-choice >> nth=1'), /The ground to fight for: the North Ford, Miller's Crossing and the South Ford\. Hold two of the three fords alone for 1 h/)
    await p.selectOption('select[name="map"]', 'ashford')
    assert.match(await p.textContent('.kind-choice >> nth=1'), /The ground to fight for: the Old Mill Bridge\./)
    await shot('ground-muster')

    // A battle he will not come out of (its seed chosen, so the computer
    // takes the bridge before night): he holds, and loses the field by it.
    const seat = store.muster({ opponent: 'standing', side: 'red', seed: 5, map: 'ashford', faction: 'rome', enemyFaction: 'rome', kind: 'ground' }).seats.red
    await p.goto(base + `/b/${seat}`)
    await p.waitForSelector('#map-scroll svg')
    assert.equal(await p.textContent('#ground-line'), 'The ground to fight for, the Old Mill Bridge, is held by no one.')
    assert.match(await p.locator('#map-scroll svg').innerHTML(), /the Old Mill Bridge/)
    const width = await p.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(width <= 390, `no sideways scroll (${width} px)`)
    let taken = false
    for (let i = 0; i < 40 && !(await p.locator('.verdict').count()); i++) {
      await p.click('[data-tab="orders"]')
      if (await p.locator('.verdict').count()) break
      await p.fill('#orders', 'everyone hold')
      await p.click('#send')
      await p.waitForSelector('.dispatch')
      if (!taken && /^The enemy holds the Old Mill Bridge/.test(await p.textContent('#ground-line'))) {
        taken = true
        await shot('ground-map')
      }
    }
    assert.ok(taken, 'the tent said the enemy held it')
    await p.click('[data-tab="orders"]')
    await p.waitForSelector('.verdict h2')
    assert.equal(await p.textContent('.verdict h2'), 'Defeat')
    assert.match(await p.textContent('.verdict'), /The enemy held the Old Mill Bridge alone for 1 h, and the field is his/)
    await shot('ground-verdict')
  })
})

test('on a phone: a new Commander is made on one screen, two questions and a name, every one answered already; his answers show on his page and in his record', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    const shot = (name) => process.env.SHOT ? p.screenshot({ path: process.env.SHOT.replace('.png', `-${name}.png`), fullPage: true }) : null
    const noSideways = async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
    await p.goto(base + '/muster')
    await p.waitForSelector('form#make')
    // The two questions, in the game's words, each with its answer chosen.
    assert.match(await p.textContent('#make'), /What kind of commander are you\?[\s\S]*What do you fight for\?[\s\S]*Your faction, for life[\s\S]*Your name/)
    assert.equal(await p.locator('[data-kind]').count(), 10)
    assert.equal(await p.locator('[data-kind][aria-pressed="true"]').count(), 1)
    assert.equal(await p.locator('[data-holds][aria-pressed="true"]').count(), 1)
    for (const b of await p.locator('[data-kind], [data-holds]').all()) assert.ok((await b.boundingBox()).height >= 44, 'every answer is a 44 px target')
    assert.match(await p.inputValue('input[name="name"]'), /^[A-Z][a-z]+$/, 'a plain name is offered')
    assert.match(await p.textContent('#kind-note'), /The Engineer: Victory through preparation\. Your veteran officer is steady/)
    await noSideways()
    await shot('make')
    const button = await p.locator('#make button[type="submit"]').boundingBox()
    assert.ok(button.y + button.height <= 844 * 1.6, `"Take command" at ${Math.round(button.y)} px: a short screen`)

    // Each answer says what it does.
    await p.click('[data-kind="wall"]')
    await p.click('[data-holds="survival"]')
    assert.match(await p.textContent('#kind-note'), /The Wall: Nothing breaks your line\. Your veteran officer is cautious: if he loses the thread of an order, he stops and holds/)
    assert.match(await p.textContent('#holds-note'), /Your veteran looks to his men, as you do/)
    // A name refused says why, and nothing is made.
    await p.fill('input[name="name"]', 'Aurelian the Bold')
    await p.click('#make button[type="submit"]')
    await p.waitForSelector('#make-error .error')
    assert.match(await p.textContent('#make-error'), /"the" is a word the game uses for something else/)
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('cohort.commanders') ?? '[]').length), 0)
    // The refusal is the server's 400, which the page logs: expected here.
    const logged = errors.findIndex(e => /status of 400/.test(e))
    if (logged >= 0) errors.splice(logged, 1)
    await noSideways()
    await shot('make-refused')
    await p.fill('input[name="name"]', 'aurelian')
    assert.match(await p.textContent('#name-note'), /After your first battle you are known as aurelian the Patient/)
    await p.selectOption('select[name="faction"]', 'rome')
    await p.click('#make button[type="submit"]')

    // At the muster, and leading it.
    await p.waitForSelector('form#muster')
    assert.match(await p.locator('select[name="commander"] option:checked').textContent(), /^Aurelian, 0 battles fought/)
    assert.match(await p.textContent('#faction-note'), /As Aurelian, you fight for Rome/)
    await p.click('#muster button[type="submit"]')
    await p.waitForSelector('#orders')
    const seat = p.url().split('/b/')[1]
    await fetch(`${base}/api/seat/${seat}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'yield' }) })

    // His title, his answers, his record.
    await p.goto(base + '/officers')
    await p.waitForSelector('.commander')
    assert.match(await p.textContent('.commander'), /Commander Aurelian the Patient of Rome/)
    assert.match(await p.textContent('main'), /The Wall, for survival\./)
    // His veteran, cautious and looking to his men: unless the battle he
    // yielded cost him that officer, who is then named among the lost (the
    // seed is drawn at the muster; measured, 4 musters in 200).
    if (await p.locator('.officer').count()) assert.match(await p.textContent('.officer'), /cautious[\s\S]*looks to his men/)
    else assert.match(await p.textContent('main'), /Lost[\s\S]*who led the/, 'no officer left: the veteran is named among the lost')
    await shot('officers')
    await p.click('text=Your record')
    await p.waitForSelector('#commander-page')
    assert.match(await p.textContent('#his-answers'), /You are the Wall: nothing breaks your line\. You fight for survival\./)
    assert.match(await p.textContent('.record'), /a defeat/)
    await noSideways()
    await shot('record')

    // A Commander made before the questions, fallen: his page says what is kept, and asks nothing.
    const old = await (await fetch(base + '/api/commanders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()
    store.commanders.end(store.commanders.get(old.token), { how: 'killed', at: 'Crownhill: the meeting battle' })
    await p.goto(`${base}/commander/${old.token}`)
    await p.waitForSelector('#commander-page')
    assert.equal(await p.locator('#his-answers').count(), 0)
    assert.match(await p.textContent('#commander-page'), /You were killed at Crownhill: the meeting battle, on \d+ \w+ \d{4}\. Your name stays in the record/)
    assert.equal(await p.locator('text=Muster a new battle').count(), 0)
    await shot('record-fallen')
  })
})

// ── The big map (docs/DECISIONS.md, "How the big map was built") ──────
const bigShot = (p, name) => process.env.SHOT ? p.screenshot({ path: process.env.SHOT.replace('.png', `-${name}.png`) }) : null

test('the big map on a phone: it opens on your army at a size to read, zooms and pans by finger and button, shows the whole field, and a tap picks a unit', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const seat = store.muster({ opponent: 'standing', side: 'red', seed: 5, map: 'greywater', faction: 'rome', enemyFaction: 'celts' }).seats.red
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    const p = await context.newPage()
    p.on('pageerror', e => errors.push(e.message))
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await p.goto(`${base}/b/${seat}`)
    await p.waitForSelector('#map-scroll svg')
    const svgBox = () => p.locator('#map-scroll svg').boundingBox()
    const scrollOf = () => p.evaluate(() => { const s = document.getElementById('map-scroll'); return { left: s.scrollLeft, top: s.scrollTop, width: s.clientWidth, height: s.clientHeight } })
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll of the page')

    // At rest: the field is far wider than the screen, the counters are a
    // size to read and to tap, and the army is in the window.
    const start = (await svgBox()).width
    assert.ok(start > 1000, `the 2 km field opens zoomed in (${start} px wide)`)
    const box = await p.locator('.counter[opacity="1"]').first().boundingBox()
    const view = await p.locator('#map-scroll').boundingBox()
    assert.ok(box.width >= 16, `a counter is ${box.width} px across`)
    assert.ok(box.x > view.x && box.x < view.x + view.width && box.y > view.y && box.y < view.y + view.height, 'the army is in the window')
    for (const id of ['zoom-in', 'zoom-out', 'whole', 'tall']) assert.ok((await p.locator(`#${id}`).boundingBox()).height >= 44, `${id} is a 44 px target`)
    await bigShot(p, 'big-phone')

    // A tap a little off the counter still picks the unit: a fingertip's
    // reach, not the counter's size.
    await p.touchscreen.tap(box.x + box.width / 2 + 12, box.y + box.height / 2 + 8)
    await p.waitForFunction(() => /picked|Which one/.test(document.getElementById('map-hint').textContent))
    if (await p.locator('[data-stack]').count()) await p.click('[data-stack] >> nth=0')
    assert.match(await p.textContent('#map-hint'), /picked/)
    await p.click('#unpick')

    // The whole field in the window, and back again, with one thumb.
    await p.click('#whole')
    const whole = await svgBox()
    const { width, height } = await scrollOf()
    assert.ok(whole.width <= width + 1 && whole.height <= height + 1, `the whole field fits the window (${Math.round(whole.width)} by ${Math.round(whole.height)})`)
    await bigShot(p, 'big-phone-whole')
    await p.click('#whole')
    assert.ok(Math.abs((await svgBox()).width - start) < 2, 'and back to the zoom it had')

    // The buttons zoom.
    await p.click('#zoom-in')
    assert.ok((await svgBox()).width > start * 1.3, 'zoom in')
    await p.click('#zoom-out')
    await p.click('#zoom-out')
    assert.ok((await svgBox()).width < start, 'zoom out')

    // A finger drags the map across (the browser scrolls it).
    const before = await scrollOf()
    const cdp = await context.newCDPSession(p)
    const mid = { x: view.x + view.width / 2, y: view.y + view.height / 2 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mid.x, y: mid.y, id: 1 }] })
    for (const d of [20, 40, 60, 80, 100]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mid.x - d, y: mid.y - d / 2, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await p.waitForTimeout(300)
    const after = await scrollOf()
    assert.ok(after.left > before.left + 30, `a finger pans the map (${before.left} to ${after.left})`)

    // Two fingers pinch it bigger.
    const pinchFrom = (await svgBox()).width
    const pt = (dx, id) => ({ x: mid.x + dx, y: mid.y, id })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(-20, 1), pt(20, 2)] })
    for (const d of [30, 45, 60, 80]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(-d, 1), pt(d, 2)] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    assert.ok((await svgBox()).width > pinchFrom * 1.5, 'a pinch zooms in')
    await context.close()
  })
})

test('the big map on a desktop: the wheel zooms about the pointer, a mouse drag pans and writes no order, and a click picks a unit', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const seat = store.muster({ opponent: 'standing', side: 'red', seed: 5, map: 'greywater', faction: 'rome', enemyFaction: 'celts' }).seats.red
    const p = await page(browser, errors, { width: 1280, height: 860 })
    await p.goto(`${base}/b/${seat}`)
    await p.waitForSelector('#map-scroll svg')
    await bigShot(p, 'big-desktop')
    const svgWidth = async () => (await p.locator('#map-scroll svg').boundingBox()).width
    const scrollLeft = () => p.evaluate(() => document.getElementById('map-scroll').scrollLeft)
    const view = await p.locator('#map-scroll').boundingBox()
    const mid = { x: view.x + view.width / 2, y: view.y + view.height / 2 }

    // A click on one of yours picks it.
    const counter = await p.locator('.counter[opacity="1"]').first().boundingBox()
    await p.mouse.click(counter.x + counter.width / 2, counter.y + counter.height / 2)
    await p.waitForFunction(() => /picked|Which one/.test(document.getElementById('map-hint').textContent))
    if (await p.locator('[data-stack]').count()) await p.click('[data-stack] >> nth=0')
    await p.click('#unpick')

    const start = await svgWidth()
    await p.mouse.move(mid.x, mid.y)
    await p.mouse.wheel(0, -400)
    await p.waitForTimeout(100)
    assert.ok(await svgWidth() > start * 1.3, 'the wheel up zooms in')
    await p.mouse.wheel(0, 800)
    await p.waitForTimeout(100)
    assert.ok(await svgWidth() < start, 'the wheel down zooms out')
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the page does not scroll sideways')

    // A drag from open ground pans, and gives no order.
    await p.click('#zoom-in')
    await p.click('#zoom-in')
    await p.click('#zoom-in')
    const from = await scrollLeft()
    const y = view.y + 60
    await p.mouse.move(view.x + 300, y)
    await p.mouse.down()
    for (const d of [20, 60, 120, 160]) await p.mouse.move(view.x + 300 - d, y)
    await p.mouse.up()
    assert.ok(await scrollLeft() > from + 100, `a mouse drag pans the map (${from} to ${await scrollLeft()})`)
    assert.doesNotMatch(await p.textContent('#map-hint'), /picked/)

  })
})

test('a 1 km map opens on a phone as it always did, 15 px a tile, and shows the whole field with the same button', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const seat = store.muster({ opponent: 'standing', side: 'red', seed: 5, map: 'ashford', faction: 'rome', enemyFaction: 'celts' }).seats.red
    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(`${base}/b/${seat}`)
    await p.waitForSelector('#map-scroll svg')
    const width = (await p.locator('#map-scroll svg').boundingBox()).width
    assert.ok(Math.abs(width - Math.round((40 * 24 + 52) * 15 / 24)) <= 1, `${width} px wide`)
    await bigShot(p, 'small-phone')
    await p.click('#whole')
    assert.ok((await p.locator('#map-scroll svg').boundingBox()).width <= 390)
    await bigShot(p, 'small-phone-whole')
    const d = await page(browser, errors, { width: 1280, height: 860 })
    await d.goto(`${base}/b/${seat}`)
    await d.waitForSelector('#map-scroll svg')
    await bigShot(d, 'small-desktop')
  })
})

// From the playthrough of November 24 (docs/REVIEW-2026-11.md).
test('on a phone: the way back in the top bar is a finger\'s size, and a horse people\'s new unit starts on horse, its refusals keeping the people\'s capital', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    await toMuster(p, base, { faction: 'sarmatia' })
    const back = await p.locator('.bar > a').first().boundingBox()
    assert.ok(back.height >= 44 && back.width >= 44, `the way back is ${back.width} by ${back.height}`)
    await p.click('#to-army')
    await p.waitForSelector('#army-screen')
    await p.click('#add')
    await p.waitForSelector('#draft')
    assert.match(await p.textContent('#draft'), /on horse/, 'Sarmatia fights on horseback: the new unit is on horse')
    assert.equal(await p.locator('#draft-refused').count(), 0, 'and is not refused as it stands')
    assert.equal(await p.locator('#take').isDisabled(), false)
    // A refused choice says why, the people's name as it is written.
    await p.locator('[data-field="mounted"][data-value="false"]').dispatchEvent('click')
    await p.waitForSelector('#refused')
    assert.match(await p.textContent('#refused'), /On foot: Sarmatia fights on horseback/)
    const evenSo = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    assert.ok(evenSo, 'no sideways scroll')
  })
})

// The app's rough spots (docs/REVIEW-2026-11.md, playthrough of November 24).
const roughShot = (p, name) => process.env.SHOT ? p.screenshot({ path: process.env.SHOT.replace('.png', `-${name}.png`), fullPage: true }) : null

test('on a phone: changes to your army not yet kept are not lost by leaving the screen or a reload; the muster says they are not kept, and they can be undone', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    await toMuster(p, base, { faction: 'rome' })
    await p.click('#to-army')
    await p.waitForSelector('#army-screen')
    const units = await p.locator('[data-dismiss]').count()
    await p.click('[data-dismiss] >> nth=0')
    await p.waitForFunction((was) => document.querySelectorAll('[data-dismiss]').length < was, units)
    // Away by the top bar's "Muster": the muster says the change is not kept.
    await p.click('.bar a')
    await p.waitForSelector('form#muster')
    assert.match(await p.textContent('#army-not-kept'), /have not kept the changes/)
    await roughShot(p, 'army-not-kept-muster')
    // Back again, and after a reload: the change is still there.
    await p.click('#to-army')
    await p.waitForSelector('#army-screen')
    assert.equal(await p.locator('[data-dismiss]').count(), units - 1, 'the unit is still dismissed')
    assert.match(await p.textContent('#army-screen'), /Your changes from last time are here, not yet kept/)
    await p.reload()
    await p.waitForSelector('#army-screen')
    assert.equal(await p.locator('[data-dismiss]').count(), units - 1, 'and after a reload')
    await roughShot(p, 'army-changes-kept')
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
    // Undone: the army as it was kept, and nothing waiting.
    await p.click('#undo')
    await p.waitForFunction((was) => document.querySelectorAll('[data-dismiss]').length === was, units)
    await p.click('.bar a')
    await p.waitForSelector('form#muster')
    assert.equal(await p.locator('#army-not-kept').count(), 0)
    // Kept: it is his army, and nothing waits either.
    await p.click('#to-army')
    await p.waitForSelector('#army-screen')
    await p.click('[data-dismiss] >> nth=-1')
    await p.waitForFunction((was) => document.querySelectorAll('[data-dismiss]').length < was, units)
    await p.click('#keep')
    await p.waitForSelector('form#muster')
    assert.equal(await p.locator('#army-not-kept').count(), 0)
    assert.match(await p.textContent('#army-line'), /Your own army/)
  })
})

test('on the map, the enemy\'s units are labelled "enemy" and marked, and labels of units that meet do not lie on each other', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const seat = store.muster({ opponent: 'standing', side: 'red', seed: 5, map: 'ashford', faction: 'rome', enemyFaction: 'rome' }).seats.red
    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(`${base}/b/${seat}`)
    await p.waitForSelector('#map-scroll svg')
    // A fight drawn from a made-up view: two of yours and two of the
    // enemy's, of one faction, on touching tiles.
    const drawn = await p.evaluate(async () => {
      const { drawMap } = await import('/static/map.js')
      const terrain = Array.from({ length: 12 }, () => 'p'.repeat(12))
      const unit = (id, name, x, y, more = {}) => ({ id, name, position: { x, y }, role: 'heavy_infantry', strength: 80, maxStrength: 80, ...more })
      const view = {
        battle: { side: 'red', sides: ['red', 'blue'] },
        map: { width: 12, height: 12, terrain, landmarks: [], name: 'test' },
        own: [unit('r1', 'Praetorian guard', 5, 5), unit('r2', 'Legionaries', 6, 6)],
        enemies: [unit('b1', 'Praetorian guard', 5, 6, { status: 'visible' }), unit('b2', 'Legionaries', 7, 5, { status: 'visible' })],
        objectives: []
      }
      const holder = document.createElement('div')
      holder.id = 'label-test'
      holder.innerHTML = drawMap(view)
      document.body.appendChild(holder)
      const texts = [...holder.querySelectorAll('text.unit-name')]
      return {
        texts: texts.map(t => t.textContent),
        boxes: texts.map(t => { const b = t.getBBox(); return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height } }),
        marks: holder.querySelectorAll('.counter path[d="M3 -7H10V0Z"]').length
      }
    })
    assert.ok(drawn.texts.some(t => /^enemy praetorian guard/.test(t)), `the enemy is named as the app names him: ${drawn.texts.join(' | ')}`)
    assert.ok(drawn.texts.some(t => /(^|, )Praetorian guard/.test(t)), 'yours by name')
    assert.equal(drawn.marks, 2, 'each enemy counter carries a mark, not only a colour')
    for (let i = 0; i < drawn.boxes.length; i++) {
      for (let j = i + 1; j < drawn.boxes.length; j++) {
        const a = drawn.boxes[i]
        const b = drawn.boxes[j]
        const over = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
        assert.equal(over, 0, `"${drawn.texts[i]}" and "${drawn.texts[j]}" do not overlap`)
      }
    }
    await p.evaluate(() => document.getElementById('label-test').remove())
  })
})

test('the big map on a phone: after a turn it comes back to your army unless you moved it yourself, and one tap finds your army or you', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const commander = store.commanders.create({ faction: 'rome' })
    const seat = store.muster({ opponent: 'standing', side: 'red', seed: 5, map: 'greywater', commander: commander.token, enemyFaction: 'celts' }).seats.red
    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(`${base}/b/${seat}`)
    await p.waitForSelector('#map-scroll svg')
    // Whether the window is centred on these units (as far as the map's edge allows).
    const centredOn = async (units) => p.evaluate((units) => {
      const scroll = document.getElementById('map-scroll')
      const svg = scroll.querySelector('svg')
      const scale = svg.clientWidth / Number(svg.getAttribute('width'))
      const mx = units.reduce((s, u) => s + u.position.x, 0) / units.length
      const my = units.reduce((s, u) => s + u.position.y, 0) / units.length
      const want = {
        left: Math.max(0, Math.min(scroll.scrollWidth - scroll.clientWidth, (26 + mx * 24) * scale - scroll.clientWidth / 2)),
        top: Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, (26 + my * 24) * scale - scroll.clientHeight / 2))
      }
      return Math.abs(scroll.scrollLeft - want.left) < 3 && Math.abs(scroll.scrollTop - want.top) < 3
    }, units)
    const view = async () => (await p.request.get(`${base}/api/seat/${seat}`)).json()
    const own = async () => (await view()).own.filter(u => u.position)
    const send = async (text) => {
      const turn = await p.textContent('.bar-title span')
      await p.click('[data-tab="orders"]')
      await p.fill('#orders', text)
      await p.click('#send')
      await p.waitForFunction((was) => document.querySelector('.bar-title span').textContent !== was, turn)
    }
    await send('everyone advance')
    await send('everyone advance')
    assert.ok(await centredOn(await own()), 'he did not move the map: it follows his army')
    await roughShot(p, 'map-follows')

    // He moves the map himself: it stays where he put it.
    await p.evaluate(() => { const s = document.getElementById('map-scroll'); s.scrollLeft = 0; s.scrollTop = 0 })
    await p.waitForTimeout(200)
    await send('everyone advance')
    assert.deepEqual(await p.evaluate(() => [document.getElementById('map-scroll').scrollLeft, document.getElementById('map-scroll').scrollTop]), [0, 0], 'the map stays where he moved it')

    // One tap: his army; another: himself.
    const tap = await p.locator('#find-army').boundingBox()
    assert.ok(tap.height >= 44, 'a finger\'s size')
    await p.click('#find-army')
    assert.ok(await centredOn(await own()), 'Your army: the map is on his army')
    const tent = await view()
    await p.click('#find-you')
    assert.ok(await centredOn(tent.own.filter(u => u.id === tent.commander.unitId)), 'You: the map is on the unit he rides with')
    await roughShot(p, 'map-find-you')
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
  })
})

// Second playthrough, November 24 (docs/REVIEW-2026-11.md, S14 and D8).
// (The Crownhill was its ground until November 25; its three fords since,
// and the North Ford lies off the window to the north.)
test('on a phone, Crownhill opens on your army with a mark at the edge pointing to the North Ford, and a tap on it brings the ford into view; on a desktop both are in view', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const seat = store.muster({ opponent: 'standing', side: 'red', seed: 5, map: 'crownhill', faction: 'rome', enemyFaction: 'rome', kind: 'ground' }).seats.red
    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(`${base}/b/${seat}`)
    await p.waitForSelector('#map-scroll svg')
    const mark = p.locator('.ground-mark', { hasText: 'the North Ford' })
    assert.equal(await mark.count(), 1, 'the North Ford is out of the window: a mark points to it')
    assert.match(await mark.textContent(), /^[↑↗↖] the North Ford$/)
    const box = await mark.boundingBox()
    assert.ok(box.height >= 44, 'a finger\'s size')
    const view = await p.locator('#map-scroll').boundingBox()
    const army = await p.locator('.counter[opacity="1"]').first().boundingBox()
    assert.ok(army.y > view.y && army.y < view.y + view.height, 'the army is in the window')
    await mark.click()
    assert.equal(await p.locator('.ground-mark', { hasText: 'the North Ford' }).count(), 0, 'the ford is in view: no mark')
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')

    const d = await page(browser, errors, { width: 1366, height: 900 })
    await d.goto(`${base}/b/${seat}`)
    await d.waitForSelector('#map-scroll svg')
    assert.equal(await d.locator('.ground-mark').count(), 0, 'on a desktop the fords and the army are all in view')
    const dview = await d.locator('#map-scroll').boundingBox()
    const darmy = await d.locator('.counter[opacity="1"]').first().boundingBox()
    assert.ok(darmy.y > dview.y && darmy.y + darmy.height < dview.y + dview.height, 'the army is in view')
  })
})

test('on a phone, at a fight on Greywater, no label is under 11 px or lies on another: units in one fight share one, and a tap names them', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const seat = store.muster({ opponent: 'standing', side: 'red', seed: 7, map: 'greywater', faction: 'rome', enemyFaction: 'macedon' }).seats.red
    for (let i = 0; i < 12; i++) {
      await store.submit(seat, i === 0 ? 'everyone advance' : '')
      const v = store.view(seat)
      if (i > 2 && v.dispatches[0]?.lines.some(l => /fought/.test(l))) break
    }
    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(`${base}/b/${seat}`)
    await p.waitForSelector('#map-scroll svg')
    const labels = await p.evaluate(() => {
      const svg = document.querySelector('#map-scroll svg')
      const scale = svg.clientWidth / Number(svg.getAttribute('width'))
      return [...svg.querySelectorAll('text.unit-name')].map(t => {
        const b = t.getBoundingClientRect()
        return { text: t.textContent, px: Number(t.getAttribute('font-size')) * scale, x0: b.left, x1: b.right, y0: b.top, y1: b.bottom }
      })
    })
    assert.ok(labels.length > 0)
    for (const l of labels) assert.ok(l.px >= 10.9, `"${l.text}" is ${l.px.toFixed(1)} px`)
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const [a, b] = [labels[i], labels[j]]
        const over = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
        assert.equal(over, 0, `"${a.text}" and "${b.text}" do not lie on each other`)
      }
    }
    assert.ok(labels.some(l => /^\d+ of yours, \d+ enemy$/.test(l.text)), `one label for the fight: ${labels.map(l => l.text).join(' | ')}`)
    // A tap on the enemy's counter, clear of yours, names who is there.
    const counters = await p.evaluate(() => [...document.querySelectorAll('#map-scroll .counter')].map(c => {
      const b = c.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, enemy: Boolean(c.querySelector('path[d="M3 -7H10V0Z"]')) }
    }))
    const clear = counters.find(c => c.enemy && counters.every(o => o.enemy || Math.hypot(o.x - c.x, o.y - c.y) > 40))
    if (clear) {
      await p.mouse.click(clear.x, clear.y)
      assert.match(await p.textContent('#map-hint'), /enemy /)
    }
    await bigShot(p, 'greywater-fight-labels')
  })
})

// The kinds of battle (ruled 2026-11-25). KINDS_SHOTS: a folder for its
// screenshots.
test('on a phone: the muster offers the pitched battle first and the battle for ground second, each with how it is won; each kind\'s tent says how it is won, and Crownhill\'s three fords are on the map', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const shot = (p, name) => process.env.KINDS_SHOTS ? p.screenshot({ path: path.join(process.env.KINDS_SHOTS, `${name}.png`), fullPage: true }) : null
    const p = await page(browser, errors, { width: 390, height: 844 })
    await toMuster(p, base, { faction: 'rome' })
    const choices = p.locator('.kind-choice')
    assert.equal(await choices.count(), 2)
    assert.match(await choices.nth(0).textContent(), /^\s*A pitched battle\s*No ground to fight for: army against army/)
    assert.match(await choices.nth(1).textContent(), /A battle for ground\s*The ground to fight for: the North Ford, Miller's Crossing and the South Ford\. Hold two of the three fords/)
    assert.ok(await p.locator('input[name="kind"][value="pitched"]').isChecked(), 'the pitched battle is offered first')
    for (let i = 0; i < 2; i++) assert.ok((await choices.nth(i).boundingBox()).height >= 44, 'a finger\'s size')
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
    await shot(p, 'muster-kinds')
    // Thornwood's ground is the king of the hill.
    await p.selectOption('select[name="map"]', 'thornwood')
    assert.match(await choices.nth(1).textContent(), /King of the hill\. The ground to fight for: Thorn Knoll/)
    await p.selectOption('select[name="map"]', 'crownhill')

    // The battle for the fords.
    await p.check('input[name="kind"][value="ground"]')
    await p.click('button[type="submit"]')
    await p.waitForSelector('#map-scroll svg')
    assert.equal(await p.textContent('#ground-line'), 'You hold none of the fords: hold two of the three fords alone for 1 h and the field is yours.')
    const svg = await p.locator('#map-scroll svg').innerHTML()
    for (const ford of ['the North Ford', 'Miller\'s Crossing', 'the South Ford']) assert.ok(svg.includes(ford.replace("'", '&#39;')) || svg.includes(ford), `${ford} is marked on the map`)
    assert.equal(await p.textContent('[data-example] >> nth=0'), 'everyone advance')
    assert.equal(await p.textContent('[data-example] >> nth=1'), 'everyone take the fords')
    await shot(p, 'tent-fords')
    // The whole field, so the three fords are in view together.
    await p.click('#whole')
    await shot(p, 'tent-fords-whole')

    // A pitched battle: no ground, and the line says how it is won.
    // (His army is in the field: a second Commander musters.)
    await toMuster(p, base, { faction: 'rome' })
    await p.selectOption('select[name="map"]', 'ashford')
    await p.click('button[type="submit"]')
    await p.waitForSelector('#map-scroll svg')
    assert.match(await p.textContent('#ground-line'), /^A pitched battle: no ground to fight for\. Break the enemy, or make him yield the field\. At nightfall, an army still standing with half the men it began the day with/)
    assert.equal(await p.textContent('[data-example] >> nth=0'), 'everyone advance')
    await shot(p, 'tent-pitched')

    // Your battles name the kind.
    await p.goto(base + '/battles')
    await p.waitForSelector('.battle-link')
    const list = await p.locator('.battle-link').allTextContents()
    assert.ok(list.some(l => /A pitched battle, Red/.test(l)) && list.some(l => /A battle for ground, Red/.test(l)), list.join(' | '))
    await shot(p, 'battles-kinds')
  })
})

// The battle of camps (ruled 2026-11-25; engine/battle/camp.js).
// CAMPS_SHOTS: a folder for its screenshots.
test('on a phone: Greywater offers the battle of camps; the tent shows the camp carried, the day, and the camp pitched on the map; the Army tab says who carries it', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const shot = (p, name, full = true) => process.env.CAMPS_SHOTS ? p.screenshot({ path: path.join(process.env.CAMPS_SHOTS, `${name}.png`), fullPage: full }) : null
    const p = await page(browser, errors, { width: 390, height: 844 })
    await toMuster(p, base, { faction: 'rome' })
    await p.selectOption('select[name="map"]', 'greywater')
    const choices = p.locator('.kind-choice')
    assert.equal(await choices.count(), 3)
    assert.match(await choices.nth(2).textContent(), /A battle of camps\s*Each army marches out with its camp packed up.*Night does not end it: it may run over several days\./)
    assert.ok((await choices.nth(2).boundingBox()).height >= 44)
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
    await p.check('input[name="kind"][value="camps"]')
    await shot(p, 'muster-camps')
    await p.click('button[type="submit"]')
    await p.waitForSelector('#map-scroll svg')
    // The day, and where the camp is.
    assert.match(await p.textContent('#bar'), /day 1, first light · night in 12 h/)
    assert.match(await p.textContent('#ground-line'), /^Day 1\. Your camp is packed up and carried by .*: your army tires while it is carried\. Pitch it: "pitch the camp here"\. The enemy's camp: not yet found\.$/)
    assert.equal(await p.textContent('[data-example] >> nth=0'), 'pitch the camp here')
    assert.match(await p.textContent('[data-example] >> nth=1'), /pitch the camp at [A-Z]\d+-[NS][EW]$/)
    assert.ok(await p.locator('#map-scroll svg g.camp').count() >= 1, 'a tent beside the unit carrying it')
    await shot(p, 'tent-camp-carried', false)
    // The Army tab: who carries it.
    await p.click('[data-tab="army"]')
    assert.match(await p.textContent('#panel-body'), /They carry your camp\. They march at half their pace and fight worse for it/)
    await shot(p, 'army-carrier')
    // Pitch it, and everyone else holds.
    await p.click('[data-tab="orders"]')
    await p.fill('#orders', 'pitch the camp here\neveryone hold')
    await p.click('#send')
    await p.waitForFunction(() => /Your camp is pitched at/.test(document.querySelector('#ground-line')?.textContent ?? ''), null, { timeout: 15000 })
    const svg = await p.locator('#map-scroll svg').innerHTML()
    assert.ok(svg.includes('Your camp'), 'the camp is drawn and named on the map')
    assert.ok(!svg.includes('Enemy camp'), 'the enemy\'s is not, until it is found')
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
    await shot(p, 'tent-camp-pitched', false)
  })
})

test('on a phone: in a battle of camps the night passes plainly: the dispatch tells the rest and the dawn, and the bar counts the second day', { skip }, async () => {
  await withApp(async ({ base, browser, errors, store }) => {
    const shot = (p, name, full = true) => process.env.CAMPS_SHOTS ? p.screenshot({ path: path.join(process.env.CAMPS_SHOTS, `${name}.png`), fullPage: full }) : null
    // A short day (an hour), so that night comes soon.
    const made = store.muster({ map: 'greywater', kind: 'camps', opponent: 'standing', side: 'red', seed: 5, faction: 'rome', enemyFaction: 'rome', dayMinutes: 60 })
    const game = store.seatOf(made.seats.red).entry.game
    for (let i = 0; i < 40 && game.day === 1 && !game.outcome.decided; i++) await store.submit(made.seats.red, i === 0 ? 'pitch the camp here' : '')
    assert.equal(game.day, 2)
    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(`${base}/b/${made.seats.red}`)
    await p.waitForSelector('#map-scroll svg')
    assert.match(await p.textContent('#bar'), /day 2/)
    await p.click('[data-tab="dispatches"]')
    const told = await p.textContent('#panel-body')
    assert.match(told, /Night has fallen\. Your men rested in camp, and will be fresh at first light/)
    assert.match(told, /Dawn: the second day of the battle begins/)
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
    await shot(p, 'tent-dawn', false)
  })
})

// The main menu, and going back (ruled 2026-11-28: "If you back out of the
// battle page you go right back to the army select screen. That can't work
// that way because you lose your progress. Need a dedicated main menu").
// MENU_SHOTS: a folder for their screenshots.
const menuShot = (p, name, full = true) => process.env.MENU_SHOTS ? p.screenshot({ path: path.join(process.env.MENU_SHOTS, `${name}.png`), fullPage: full }) : null

test('the main menu lists a battle under way, where it stands, and one tap takes you back into it', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    await toMuster(p, base, { faction: 'rome' })
    await p.click('button[type="submit"]')
    await p.waitForSelector('#map-scroll svg')
    const seat = new URL(p.url()).pathname
    await p.click('#to-menu')
    await p.waitForSelector('#menu')
    assert.equal(new URL(p.url()).pathname, '/')
    const first = p.locator('.battle-link.going').first()
    assert.equal(await first.getAttribute('href'), seat, 'the battle just left is at the top')
    assert.match(await first.textContent(), /Your orders are wanted\./)
    assert.match(await first.textContent(), /Rome against/)
    assert.ok((await first.boundingBox()).height >= 44)
    // In order: the battles going on, a new battle, your officers.
    const order = await p.evaluate(() => [...document.querySelectorAll('#menu > *')].map(e => e.id || e.className))
    assert.ok(order.indexOf('new-battle') > order.findIndex(x => /going/.test(x)), `a new battle after the battles going on: ${order}`)
    assert.ok(order.indexOf('to-officers') > order.indexOf('new-battle'))
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
    await menuShot(p, 'menu-phone')
    await first.click()
    await p.waitForSelector('#map-scroll svg')
    assert.equal(new URL(p.url()).pathname, seat)
  })
})

test('Back from the tent lands on the main menu, not the muster, with that battle at the top; and so from a battle opened by its link', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    // A first visit: make the Commander, see the menu, muster from it.
    await p.goto(base + '/')
    await p.waitForSelector('form#make')
    await p.click('#make button[type="submit"]')
    await p.waitForSelector('#menu')
    await p.click('#new-battle')
    await p.waitForSelector('form#muster')
    await p.click('button[type="submit"]')
    await p.waitForSelector('#map-scroll svg')
    const seat = new URL(p.url()).pathname
    await p.goBack()
    await p.waitForSelector('#menu')
    assert.equal(new URL(p.url()).pathname, '/', 'Back from the battle is the menu')
    assert.equal(await p.locator('form#muster, form#make').count(), 0)
    assert.equal(await p.locator('.battle-link.going').first().getAttribute('href'), seat)
    // Forward again, and Back: still the menu.
    await p.goForward()
    await p.waitForSelector('#map-scroll svg')
    await p.goBack()
    await p.waitForSelector('#menu')
    // A new battle left unused (his army in the field, he is asked to make
    // another Commander first): its Back is the menu.
    await p.click('#new-battle')
    await p.waitForSelector('form#make')
    await p.goBack()
    await p.waitForSelector('#menu')
    // And so from Your officers, then a Commander's page, then a new battle.
    await p.click('#to-officers')
    await p.waitForSelector('.commander')
    await p.click('a[href^="/commander/"]')
    await p.waitForSelector('#commander-page')
    await p.goBack()
    await p.waitForSelector('.commander')
    await p.click('main a[href="/muster"]')
    await p.waitForSelector('form#make')
    await p.goBack()
    await p.waitForSelector('#menu')

    // A battle opened by its link, in a new tab: Back is the menu too.
    const q = await p.context().newPage()
    q.on('pageerror', e => errors.push(e.message))
    await q.goto(base + seat)
    await q.waitForSelector('#map-scroll svg')
    await q.goBack()
    await q.waitForSelector('#menu')
    assert.equal(new URL(q.url()).pathname, '/')
    await q.close()
  })
})

test('orders written and not sent are there when you come back to the battle, and gone once sent', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    await toMuster(p, base, { faction: 'rome' })
    await p.click('button[type="submit"]')
    await p.waitForSelector('#orders')
    const seat = new URL(p.url()).pathname
    await p.fill('#orders', 'everyone hold')
    await p.goBack()
    await p.waitForSelector('#menu')
    await p.click(`.battle-link[href="${seat}"]`)
    await p.waitForSelector('#orders')
    assert.equal(await p.inputValue('#orders'), 'everyone hold', 'kept through Back and the menu')
    await p.reload()
    await p.waitForSelector('#orders')
    assert.equal(await p.inputValue('#orders'), 'everyone hold', 'and through a reload')
    assert.match(await p.textContent('#panel-foot'), /The battle is saved as you go/)
    await p.click('#send')
    await p.waitForSelector('.dispatch')
    await p.click('[data-tab="orders"]')
    await p.waitForSelector('#orders')
    assert.equal(await p.inputValue('#orders'), '', 'sent, they are cleared')
    assert.equal(await p.evaluate((t) => localStorage.getItem(`cohort.draft.${t}`), seat.slice(3)), null)
  })
})

test('the swipe guard is set on the tent: a sideways swipe moves the map, and the page does not go back', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const p = await page(browser, errors, { width: 1280, height: 800 })
    await toMuster(p, base, { faction: 'rome' })
    await p.selectOption('select[name="map"]', 'greywater')
    await p.click('button[type="submit"]')
    await p.waitForSelector('#map-scroll svg')
    const seat = p.url()
    const guard = await p.evaluate(() => ({
      root: getComputedStyle(document.documentElement).overscrollBehaviorX,
      body: getComputedStyle(document.body).overscrollBehaviorX,
      map: getComputedStyle(document.getElementById('map-scroll')).overscrollBehaviorX
    }))
    assert.deepEqual(guard, { root: 'none', body: 'none', map: 'contain' })
    const box = await p.locator('#map-scroll').boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const before = await p.evaluate(() => document.getElementById('map-scroll').scrollLeft)
    const zoom = await p.evaluate(() => document.querySelector('#map-scroll svg').style.width)
    await p.mouse.wheel(200, 0)
    await p.waitForTimeout(200)
    assert.notEqual(await p.evaluate(() => document.getElementById('map-scroll').scrollLeft), before, 'the map moved sideways')
    assert.equal(await p.evaluate(() => document.querySelector('#map-scroll svg').style.width), zoom, 'and did not zoom')
    assert.equal(p.url(), seat, 'and the page stayed')
    await menuShot(p, 'tent-desktop', false)
  })
})
