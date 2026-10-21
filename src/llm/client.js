// src/llm/client.js
//
// The one way this project talks to an AI model (ruled: Groq). The AI turns
// words into orders and events into prose; it never decides an outcome, and
// the game must keep working when it is down. So every call here either
// succeeds or returns { ok: false } quickly, and callers fall back to the
// deterministic grammar or plain event text.
//
//   const ai = createAiClient({ transport: groqTransport() })
//   const reply = await ai.complete({ purpose: 'parse-order', system, user, json: true })
//   if (!reply.ok) { ...fall back... }
//
// What it does for every call:
//   - a timeout, and one retry, then gives up
//   - JSON mode: asks for a JSON object and parses it; unparseable JSON is a
//     failure, not a crash
//   - logs model, purpose, tokens and an estimated cost to the cost sink
//
// The transport is the only part that touches the network. Tests pass a
// fake or a recorded transport (see fixtures.js), so CI never calls Groq.

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_RETRIES = 1

// Estimated US dollars per million tokens. Prices change; the token counts
// in the cost log are the real record, these only turn them into a rough
// bill. Override with the `pricing` option.
const DEFAULT_PRICING = {
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 }
}

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function estimateCost(pricing, model, usage) {
  const rate = pricing[model]
  if (!rate || !usage) return null
  const cost = (usage.inputTokens * rate.input + usage.outputTokens * rate.output) / 1e6
  return Math.round(cost * 1e6) / 1e6
}

// Models sometimes wrap JSON in a code fence or a sentence despite JSON mode.
function parseJson(text) {
  const trimmed = String(text ?? '').trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('no JSON object in the reply')
    return JSON.parse(trimmed.slice(start, end + 1))
  }
}

/**
 * @param {Object} options
 * @param {Object} options.transport  { name, model, send({ system, user, json,
 *   maxTokens, temperature }) -> { text, usage: { inputTokens, outputTokens } } }
 * @param {number} [options.timeoutMs]
 * @param {number} [options.retries]   extra attempts after the first
 * @param {Function} [options.costSink]  called with one record per attempt
 * @param {Object} [options.pricing]
 */
function createAiClient(options = {}) {
  const transport = options.transport ?? null
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? DEFAULT_RETRIES
  const costSink = options.costSink ?? (() => {})
  const pricing = { ...DEFAULT_PRICING, ...(options.pricing ?? {}) }

  async function complete(request) {
    const { purpose = 'unspecified', system = '', user = '', json = false,
      maxTokens = 400, temperature = 0.2 } = request

    if (!transport) return { ok: false, error: 'no AI configured' }

    let lastError = null
    for (let attempt = 1; attempt <= 1 + retries; attempt++) {
      try {
        const reply = await withTimeout(
          transport.send({ system, user, json, maxTokens, temperature }), timeoutMs)
        const usage = reply.usage ?? null
        costSink({
          purpose, provider: transport.name, model: transport.model, attempt, ok: true,
          inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
          estimatedUsd: estimateCost(pricing, transport.model, usage)
        })
        if (!json) return { ok: true, text: reply.text, usage }
        try {
          return { ok: true, text: reply.text, json: parseJson(reply.text), usage }
        } catch (error) {
          lastError = `reply was not valid JSON: ${error.message}`
        }
      } catch (error) {
        lastError = error.message
        costSink({ purpose, provider: transport.name, model: transport.model, attempt, ok: false, error: lastError })
      }
    }
    return { ok: false, error: lastError }
  }

  return { complete, configured: Boolean(transport), model: transport?.model ?? null }
}

module.exports = { createAiClient, parseJson, estimateCost, DEFAULT_PRICING, DEFAULT_TIMEOUT_MS }
