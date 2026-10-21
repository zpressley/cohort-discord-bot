// src/llm/fixtures.js
//
// Recorded AI replies, so tests exercise real model output without calling
// the network. Record once with a key, commit the files, replay forever:
//
//   AI_RECORD_DIR=src/interpreter/fixtures GROQ_API_KEY=... node <script>
//
// A recording is one JSON file per distinct request, named by a hash of
// what was sent (system prompt, user text, JSON mode). Change a prompt and
// its old recordings no longer match, which is the point: the replay fails
// loudly and the recording is redone.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function requestKey({ system, user, json }) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ system, user, json: Boolean(json) }))
    .digest('hex').slice(0, 16)
}

function recordingTransport(real, dir) {
  return {
    name: `${real.name}+record`,
    model: real.model,
    async send(request) {
      const reply = await real.send(request)
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `${requestKey(request)}.json`)
      const { system, user, json } = request
      fs.writeFileSync(file, JSON.stringify({ request: { system, user, json: Boolean(json) }, model: real.model, reply }, null, 2) + '\n')
      return reply
    }
  }
}

function replayTransport(dir, { model = 'recorded' } = {}) {
  return {
    name: 'replay',
    model,
    async send(request) {
      const file = path.join(dir, `${requestKey(request)}.json`)
      if (!fs.existsSync(file)) {
        throw new Error(`no recorded reply for this request in ${dir} (record it with AI_RECORD_DIR)`)
      }
      return JSON.parse(fs.readFileSync(file, 'utf8')).reply
    }
  }
}

// A transport that answers from a function: for tests that need a specific
// reply, a failure, or a slow reply.
function scriptedTransport(answer, { model = 'scripted' } = {}) {
  const calls = []
  return {
    name: 'scripted',
    model,
    calls,
    async send(request) {
      calls.push(request)
      return answer(request, calls.length)
    }
  }
}

module.exports = { requestKey, recordingTransport, replayTransport, scriptedTransport }
