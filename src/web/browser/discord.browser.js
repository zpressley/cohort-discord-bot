// src/web/browser/discord.browser.js
//
// Signing in with Discord in a real browser, at phone width, against a
// stand-in Discord (tests/fixtures/discord-standin.js): the button where a
// new player lands, signing in, "Signed in as", his Commander arriving in a
// second browser, the battle's thread in the tent, and signing out. Run
// with `npm run test:browser`; SHOT_DIR=/some/dir saves screenshots.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const net = require('net')
const path = require('path')
const { execSync } = require('child_process')

const { createServer } = require('../server')
const { createBattleStore } = require('../battles')
const { createDiscordWeb } = require('../signin')
const { discordConfig } = require('../../discord/config')
const { startStandin, standinEnv } = require('../tests/fixtures/discord-standin')

function findPlaywright() {
  try { return require('playwright') } catch { /* try the global one */ }
  try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')) } catch { return null }
}
const playwright = findPlaywright()
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const skip = !playwright ? 'Playwright is not installed' : false
const shot = (p, name) => (process.env.SHOT_DIR ? p.screenshot({ path: path.join(process.env.SHOT_DIR, `${name}.png`), fullPage: true }) : null)

// A free port, so that the game knows its own address (PUBLIC_URL) before it listens.
const freePort = () => new Promise(resolve => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
})

test('on a phone: sign in with Discord, your Commander in a second browser, the battle\'s thread, and signing out', { skip }, async () => {
  const standin = await startStandin()
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const store = createBattleStore({})
  const discord = createDiscordWeb({ config: discordConfig(standinEnv(standin, { PUBLIC_URL: base })), store, log: () => {}, client: { sleep: () => Promise.resolve(), pause: () => 1 } })
  const server = createServer(store, { discord })
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  const browser = await playwright.chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {})
  const errors = []
  const phone = async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const p = await context.newPage()
    p.on('pageerror', e => errors.push(e.message))
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    return p
  }
  const noSideways = async (p) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
  try {
    // A new player lands on making his Commander; signing in is offered, not asked.
    const first = await phone()
    await first.goto(base + '/')
    await first.waitForSelector('form#make')
    const button = first.locator('#sign-in')
    assert.equal(await button.textContent(), 'Sign in with Discord')
    const box = await button.boundingBox()
    assert.ok(box.height >= 44, 'a 44 px target')
    await noSideways(first)
    await shot(first, 'landing')
    // He makes his Commander without signing in, as today.
    const name = await first.inputValue('#make input[name="name"]')
    await first.click('#make button[type="submit"]')
    await first.waitForSelector('form#muster')

    // On his officers page he signs in; Discord sends him back there.
    standin.user = { id: '100000000000000001', username: 'aulus', global_name: 'Aulus' }
    await first.goto(base + '/officers')
    await first.waitForSelector('#sign-in')
    await first.click('#sign-in')
    await first.waitForSelector('#signed-in')
    assert.equal(new URL(first.url()).pathname, '/officers')
    assert.equal(await first.textContent('#signed-in'), 'Signed in as Aulus')
    assert.match(await first.textContent('main'), new RegExp(`Commander ${name}`))
    await noSideways(first)
    await shot(first, 'signed-in')

    // A second phone: no Commander, until he signs in there too.
    const second = await phone()
    await second.goto(base + '/officers')
    await second.waitForSelector('#sign-in')
    assert.match(await second.textContent('main'), /No officers yet/)
    await second.click('#sign-in')
    await second.waitForSelector('#signed-in')
    assert.match(await second.textContent('main'), new RegExp(`Commander ${name}`), 'his Commander came with him')
    await shot(second, 'second-phone')

    // A battle against a friend (made from the first phone, joined by a
    // friend signed in elsewhere): its thread, in the tent's Army tab.
    const seats = await first.evaluate(async () => (await (await fetch('/api/battles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opponent: 'friend', side: 'red', commander: JSON.parse(localStorage.getItem('cohort.commanders'))[0] }) })).json()).seats)
    await fetch(`${base}/api/seat/${seats.blue}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    await discord.idle()
    await first.goto(`${base}/b/${seats.red}`)
    await first.waitForSelector('#map-scroll svg')
    await first.click('[data-tab="army"]')
    await first.waitForSelector('#thread')
    assert.equal(await first.textContent('#thread'), 'Talk in this battle\'s thread on Discord')
    assert.match(await first.getAttribute('#thread', 'href'), /^https:\/\/discord\.com\/channels\/1420824208270823476\/thread-1$/)
    await noSideways(first)
    await shot(first, 'tent-thread')
    // The battle came to the second phone as well (his account holds it).
    await second.goto(base + '/battles')
    await second.waitForSelector('.battle-link')
    assert.match(await second.textContent('main'), /against a friend/)

    // Signing out on the second phone takes his links off it.
    await second.goto(base + '/officers')
    await second.waitForSelector('#sign-out')
    await second.click('#sign-out')
    await second.waitForSelector('form#make')
    await second.waitForSelector('#sign-in')
    assert.equal(await second.evaluate(() => localStorage.getItem('cohort.commanders')), null)
    assert.equal(await second.evaluate(() => localStorage.getItem('cohort.seats')), null)
    await shot(second, 'signed-out')
    // ... and the first phone is still signed in, with all of it.
    await first.goto(base + '/officers')
    await first.waitForSelector('#signed-in')
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
    await standin.close()
  }
  assert.deepEqual(errors, [], 'no errors in the page')
})

test('on a phone, with no Discord settings: no sign-in anywhere', { skip }, async () => {
  const store = createBattleStore({})
  const server = createServer(store)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await playwright.chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {})
  const errors = []
  try {
    const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
    p.on('pageerror', e => errors.push(e.message))
    await p.goto(base + '/')
    await p.waitForSelector('form#make')
    await p.click('#make button[type="submit"]')
    await p.waitForSelector('form#muster')
    await p.goto(base + '/officers')
    await p.waitForSelector('.commander')
    assert.equal(await p.locator('#sign-in, #signed-in, .signin').count(), 0)
    assert.doesNotMatch(await p.textContent('body'), /Discord/)
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
  assert.deepEqual(errors, [])
})
