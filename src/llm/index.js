// src/llm/index.js
//
// Build the project's AI client from the environment:
//   GROQ_API_KEY    no key, no AI: everything runs on its fallbacks
//   GROQ_MODEL      optional, defaults to groq.js DEFAULT_MODEL
//   AI_RECORD_DIR   save every reply there as a test fixture
//   AI_COST_LOG     append one JSON line per call (tokens, estimated cost)

const fs = require('fs')
const { createAiClient } = require('./client')
const { groqTransport } = require('./groq')
const { recordingTransport, replayTransport, scriptedTransport } = require('./fixtures')

function fileCostSink(file) {
  return (record) => fs.appendFileSync(file, JSON.stringify(record) + '\n')
}

function aiClientFromEnv(env = process.env) {
  let transport = groqTransport({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL })
  if (transport && env.AI_RECORD_DIR) transport = recordingTransport(transport, env.AI_RECORD_DIR)
  return createAiClient({
    transport,
    costSink: env.AI_COST_LOG ? fileCostSink(env.AI_COST_LOG) : undefined
  })
}

module.exports = {
  createAiClient,
  aiClientFromEnv,
  groqTransport,
  recordingTransport,
  replayTransport,
  scriptedTransport,
  fileCostSink
}
