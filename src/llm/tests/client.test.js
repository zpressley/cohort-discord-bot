// src/llm/tests/client.test.js
//
// The AI client must fail fast and cleanly, because the game falls back to
// its deterministic paths whenever the AI does not answer. No network here:
// every test uses a scripted or replayed transport.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createAiClient, parseJson, estimateCost } = require('../client')
const { scriptedTransport, recordingTransport, replayTransport, requestKey } = require('../fixtures')
const { aiClientFromEnv } = require('..')

const reply = (text, usage = { inputTokens: 100, outputTokens: 20 }) => ({ text, usage })

test('no key, no AI: the client says so instead of throwing', async () => {
  const ai = aiClientFromEnv({})
  assert.equal(ai.configured, false)
  assert.deepEqual(await ai.complete({ user: 'hello' }), { ok: false, error: 'no AI configured' })
})

test('a plain reply comes back as text, and the call is logged with tokens and cost', async () => {
  const log = []
  const ai = createAiClient({
    transport: scriptedTransport(() => reply('The legion advances.'), { model: 'llama-3.1-8b-instant' }),
    costSink: (r) => log.push(r)
  })
  const result = await ai.complete({ purpose: 'narrate', user: 'events' })
  assert.equal(result.ok, true)
  assert.equal(result.text, 'The legion advances.')
  assert.equal(log.length, 1)
  assert.equal(log[0].purpose, 'narrate')
  assert.equal(log[0].inputTokens, 100)
  assert.equal(log[0].outputTokens, 20)
  assert.ok(log[0].estimatedUsd > 0)
})

test('JSON mode parses the object, even wrapped in a code fence', async () => {
  const ai = createAiClient({
    transport: scriptedTransport(() => reply('```json\n{"action":"hold"}\n```'))
  })
  const result = await ai.complete({ user: 'hold', json: true })
  assert.equal(result.ok, true)
  assert.deepEqual(result.json, { action: 'hold' })
})

test('a reply that is not JSON is a failure after the retry, not a crash', async () => {
  const transport = scriptedTransport(() => reply('I would rather not.'))
  const ai = createAiClient({ transport })
  const result = await ai.complete({ user: 'x', json: true })
  assert.equal(result.ok, false)
  assert.match(result.error, /not valid JSON/)
  assert.equal(transport.calls.length, 2, 'one try and one retry')
})

test('an error is retried once, then reported', async () => {
  const transport = scriptedTransport((req, n) => {
    if (n === 1) throw new Error('rate limited')
    return reply('ok now')
  })
  const ai = createAiClient({ transport })
  assert.deepEqual((await ai.complete({ user: 'x' })).text, 'ok now')

  const always = scriptedTransport(() => { throw new Error('service down') })
  const result = await createAiClient({ transport: always }).complete({ user: 'x' })
  assert.deepEqual(result, { ok: false, error: 'service down' })
  assert.equal(always.calls.length, 2)
})

test('a slow reply times out, so a player is never left waiting', async () => {
  const slow = scriptedTransport(() => new Promise(resolve => setTimeout(() => resolve(reply('late')), 500)))
  const ai = createAiClient({ transport: slow, timeoutMs: 20, retries: 0 })
  const result = await ai.complete({ user: 'x' })
  assert.equal(result.ok, false)
  assert.match(result.error, /timed out/)
})

test('recorded replies replay offline, keyed by exactly what was sent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-ai-'))
  const live = scriptedTransport(() => reply('{"action":"defend"}'), { model: 'm' })
  const recorder = createAiClient({ transport: recordingTransport(live, dir) })
  await recorder.complete({ system: 'S', user: 'dig in at the clearing', json: true })
  assert.equal(fs.readdirSync(dir).length, 1)

  const replay = createAiClient({ transport: replayTransport(dir) })
  const again = await replay.complete({ system: 'S', user: 'dig in at the clearing', json: true })
  assert.deepEqual(again.json, { action: 'defend' })

  const unknown = await createAiClient({ transport: replayTransport(dir), retries: 0 })
    .complete({ system: 'S', user: 'something never recorded', json: true })
  assert.equal(unknown.ok, false)
  assert.match(unknown.error, /no recorded reply/)

  assert.notEqual(requestKey({ system: 'S', user: 'a' }), requestKey({ system: 'S2', user: 'a' }),
    'a changed prompt no longer matches its old recording')
})

test('helpers: JSON extraction and cost estimates', () => {
  assert.deepEqual(parseJson('Sure! {"a":1} Hope that helps.'), { a: 1 })
  assert.throws(() => parseJson('no braces here'))
  assert.equal(estimateCost({ m: { input: 1, output: 2 } }, 'm', { inputTokens: 1e6, outputTokens: 1e6 }), 3)
  assert.equal(estimateCost({}, 'unknown', { inputTokens: 1, outputTokens: 1 }), null)
})

test('the Groq transport needs a key, and building it calls nothing', () => {
  const { groqTransport, DEFAULT_MODEL } = require('../groq')
  assert.equal(groqTransport({ apiKey: '' }), null)
  const transport = groqTransport({ apiKey: 'test-key-not-used' })
  assert.equal(transport.name, 'groq')
  assert.equal(transport.model, DEFAULT_MODEL)
  assert.equal(groqTransport({ apiKey: 'k', model: 'llama-3.3-70b-versatile' }).model, 'llama-3.3-70b-versatile')
})
