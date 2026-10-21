// src/llm/groq.js
//
// The Groq transport: the only file that calls the network. Reads its key
// from GROQ_API_KEY and its model from GROQ_MODEL. Returns null when no key
// is set, so the game runs (on its fallbacks) without one.

const DEFAULT_MODEL = 'llama-3.1-8b-instant'

function groqTransport({ apiKey = process.env.GROQ_API_KEY, model = process.env.GROQ_MODEL } = {}) {
  if (!apiKey) return null
  const Groq = require('groq-sdk')
  // The client's own retries are off: createAiClient decides retries, so one
  // policy governs how long a player waits.
  const groq = new Groq({ apiKey, maxRetries: 0 })
  const chosen = model || DEFAULT_MODEL

  return {
    name: 'groq',
    model: chosen,
    async send({ system, user, json, maxTokens, temperature }) {
      const response = await groq.chat.completions.create({
        model: chosen,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user }
        ],
        max_tokens: maxTokens,
        temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {})
      })
      return {
        text: response.choices?.[0]?.message?.content ?? '',
        usage: response.usage
          ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens }
          : null
      }
    }
  }
}

module.exports = { groqTransport, DEFAULT_MODEL }
