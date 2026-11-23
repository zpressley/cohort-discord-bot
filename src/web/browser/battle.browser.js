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

test('alone, on a phone: muster, an order written on the map, turns to a verdict, the replay', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const p = await page(browser, errors, { width: 390, height: 844 })
    await p.goto(base + '/')
    await p.waitForSelector('form#muster')
    assert.match(p.url(), /\/muster$/, 'a new browser starts at the muster')
    await p.selectOption('select[name="timeLimit"]', '')
    await p.click('button[type="submit"]')
    await p.waitForSelector('#map-scroll svg')
    assert.match(p.url(), /\/b\/[A-Za-z0-9_-]+$/)

    // The orders box is on the first screen, not a scroll away.
    const ordersBox = await p.locator('#orders').boundingBox()
    assert.ok(ordersBox.y + ordersBox.height <= 844, `the orders box ends at ${ordersBox.y + ordersBox.height}, inside the 844 px screen`)

    // The first turn's card: its examples are put in the box, and the game reads them.
    const examples = await p.locator('[data-example]').count()
    assert.equal(examples, 5)
    for (let i = 0; i < examples; i++) {
      await p.click(`[data-example] >> nth=${i}`)
    }
    await p.click('#read-back')
    await p.waitForSelector('.readback')
    assert.equal(await p.locator('.question').count(), 0, 'every example is understood')
    await p.click('#clear')

    // The map gesture: pick the horse in the army panel, then tap a place.
    await p.click('[data-tab="army"]')
    await p.click('[data-pick="red_horse"]')
    const svg = p.locator('#map-scroll svg')
    const box = await svg.boundingBox()
    await svg.click({ position: { x: Math.min(box.width - 5, 260), y: 120 } })
    const draft = await p.inputValue('#orders')
    assert.match(draft, /^Horse to [A-J]\d{1,2}-(NW|NE|SW|SE)$/, `the map wrote "${draft}"`)

    // Read back, then send; alone, each turn runs at once.
    await p.click('#read-back')
    await p.waitForSelector('.readback')

    // An unclear place comes with choices; picking one rewrites the order.
    await p.fill('#orders', 'spears to the ford')
    await p.click('#read-back')
    await p.waitForSelector('[data-choice]')
    await p.click('[data-choice] >> nth=0')
    await p.waitForSelector('.readback')
    assert.doesNotMatch(await p.inputValue('#orders'), /the ford/)
    await p.fill('#orders', 'everyone advance')
    await p.click('#send')
    await p.waitForSelector('.dispatch')

    for (let i = 0; i < 40; i++) {
      if (await p.locator('.verdict').count()) break
      await p.click('[data-tab="orders"]')
      if (await p.locator('.verdict').count()) break
      await p.click('#send')
      await p.waitForSelector('.dispatch')
    }
    await p.click('[data-tab="orders"]')
    await p.waitForSelector('.verdict h2')
    assert.match(await p.textContent('.verdict h2'), /Victory|Defeat|A draw/)
    assert.equal(await p.locator('table.losses tbody tr').count(), 2)
    assert.match(await p.textContent('#panel-body'), /captain|came through/)

    await p.fill('#replay', '0')
    await p.dispatchEvent('#replay', 'change')
    await p.waitForFunction(() => /before the first orders/.test(document.getElementById('replay-note').textContent))

    // Coming back: the home page lists the finished battle.
    await p.goto(base + '/')
    await p.waitForSelector('.battle-link')
    assert.match(p.url(), /\/battles$/, 'nothing waiting, so home is your battles')

    // Your officers: those who lived, with the battle in their record.
    await p.click('a[href="/officers"]')
    await p.waitForSelector('.officer, .label-caps')
    assert.match(await p.textContent('main'), /1 battle fought/)
    if (await p.locator('.officer').count()) {
      await p.locator('.officer summary').first().click()
      assert.match(await p.locator('.officer li').first().textContent(), /a victory|a defeat|a draw/)
    }
    assert.match(await p.textContent('main'), /Commander \w+/)
    assert.match(await p.textContent('main'), /ready to muster/)
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, fullPage: true })

    // The next muster offers him again, or a new Commander; while his army
    // is in the field he cannot be chosen.
    await p.goto(base + '/muster')
    await p.waitForSelector('select[name="commander"]')
    assert.match(await p.locator('select[name="commander"] option:checked').textContent(), /1 battle fought/)
    await p.click('button[type="submit"]')
    await p.waitForSelector('#orders')
    await p.goto(base + '/muster')
    await p.waitForSelector('select[name="commander"]')
    assert.match(await p.locator('select[name="commander"] option:checked').textContent(), /A new Commander/)
    assert.equal(await p.locator('select[name="commander"] option[disabled]').count(), 1, 'his army is in the field')
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace('.png', '-muster.png'), fullPage: true })
    await p.goto(base + '/officers')
    await p.waitForSelector('.commander')
    assert.match(await p.textContent('main'), /His army is in the field/)
  })
})

test('two players by link, on desktops: the turn waits for both, then both read the dispatch', { skip }, async () => {
  await withApp(async ({ base, browser, errors }) => {
    const red = await page(browser, errors, { width: 1440, height: 900 })
    await red.goto(base + '/muster')
    await red.check('input[name="opponent"][value="friend"]')
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

    // The friend's first screen: who leads? A new Commander, in one tap.
    await blue.goto(link)
    await blue.waitForSelector('#who-leads')
    assert.match(await blue.textContent('#who-leads h1'), /Who leads\?/)
    assert.equal(await blue.locator('[data-lead]').count(), 2, 'no Commanders yet in this browser: a new one, or none')
    if (process.env.SHOT) await blue.screenshot({ path: process.env.SHOT.replace('.png', '-who-leads-desktop.png'), fullPage: true })
    await blue.click('[data-lead="new"]')
    await blue.waitForSelector('#map-scroll svg')
    assert.match(await blue.textContent('.bar-title'), /Blue/)
    assert.equal((await blue.evaluate(() => JSON.parse(localStorage.getItem('cohort.commanders')))).length, 1, 'his link is kept in this browser')
    await blue.click('[data-tab="army"]')
    assert.match(await blue.textContent('#panel-body'), /You ride with them/)
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
    assert.match(await blue.textContent('main'), /His army is in the field/)

    // Choosing is the friend's alone, and only once: the link opens the tent now.
    await blue.goto(link)
    await blue.waitForSelector('#map-scroll svg')
    assert.equal(await blue.locator('#who-leads').count(), 0)
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
    await p.goto(base + '/muster')
    await p.click('button[type="submit"]')
    await p.waitForSelector('#orders')
    await p.fill('#orders', 'everyone advance')
    await p.click('#send')
    await p.waitForSelector('.dispatch')
    assert.match(await p.textContent('.dispatch .flag'), /plain report/)
  }, { ai })
})
