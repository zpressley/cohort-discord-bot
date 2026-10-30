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

async function withApp(run) {
  const server = createServer(createBattleStore({}))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await playwright.chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {})
  const errors = []
  try {
    await run({ base, browser, errors })
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

    await p.fill('#replay', '0')
    await p.dispatchEvent('#replay', 'change')
    await p.waitForFunction(() => /before the first orders/.test(document.getElementById('replay-note').textContent))

    // Coming back: the home page lists the finished battle.
    await p.goto(base + '/')
    await p.waitForSelector('.battle-link')
    assert.match(p.url(), /\/battles$/, 'nothing waiting, so home is your battles')
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
    await blue.goto(link)
    await blue.waitForSelector('#map-scroll svg')
    assert.match(await blue.textContent('.bar-title'), /Blue/)

    await red.fill('#orders', 'everyone hold')
    await red.click('#send')
    await red.waitForSelector('.calm')
    assert.match(await red.textContent('.calm'), /with the army/)

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
  })
})
