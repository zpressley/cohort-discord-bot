// src/llm/groq.js
//
// The Groq transport: the only file that calls the network. Reads its key
// from GROQ_API_KEY and its model from GROQ_MODEL. Returns null when no key
// is set, so the game runs (on its fallbacks) without one.
//
// It speaks Groq's OpenAI-compatible HTTP API with Node's own fetch: no SDK,
// so it follows the machine's proxy settings (NODE_USE_ENV_PROXY=1) and has
// nothing to keep up to date.
//
// The default model is the cheapest one that reads orders reliably; see
// docs/ai/MODELS.md for the comparison (`npm run ai:bench` reruns it).

const DEFAULT_MODEL = 'openai/gpt-oss-20b'
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

// Reasoning models think before they answer, and the thinking is billed as
// output. The game's two jobs (read an order, retell a turn) need very
// little of it, so ask for the least and never ask for it back.
function reasoningOptions(model, effort) {
  if (/gpt-oss/.test(model)) return { reasoning_effort: effort ?? 'low', include_reasoning: false }
  if (/qwen/.test(model)) return { reasoning_effort: 'none' }
  return {}
}

// What the model must return. A schema makes the API itself enforce the
// shape (structured outputs); plain JSON mode is the fallback for callers
// without one.
function responseFormat({ json, schema, schemaName }) {
  if (schema) return { response_format: { type: 'json_schema', json_schema: { name: schemaName ?? 'reply', strict: true, schema } } }
  if (json) return { response_format: { type: 'json_object' } }
  return {}
}

function groqTransport({ apiKey = process.env.GROQ_API_KEY, model = process.env.GROQ_MODEL, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) return null
  const chosen = model || DEFAULT_MODEL

  return {
    name: 'groq',
    model: chosen,
    async send({ system, user, json, schema, schemaName, maxTokens, temperature, effort }) {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: chosen,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: user }
          ],
          // Thinking counts against the limit, so leave it room on top of
          // the answer the caller asked for.
          max_completion_tokens: maxTokens + (/gpt-oss/.test(chosen) ? (effort && effort !== 'low' ? 1200 : 400) : 0),
          temperature,
          ...reasoningOptions(chosen, effort),
          ...responseFormat({ json, schema, schemaName })
        })
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const error = new Error(`${response.status} ${body?.error?.message ?? response.statusText}`)
        // Over the rate limit: say how long to wait, so the client can wait
        // it out when it is short.
        if (response.status === 429) {
          const seconds = Number(response.headers.get('retry-after'))
          error.retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 5000
        }
        throw error
      }
      const usage = body.usage
      return {
        text: body.choices?.[0]?.message?.content ?? '',
        usage: usage
          ? {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0
            }
          : null
      }
    }
  }
}

module.exports = { groqTransport, DEFAULT_MODEL }
