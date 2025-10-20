// src/bot/utils/dmQueue.js
// Simple DM queue with backoff to respect Discord rate limits (current code-019)

const queue = [];
let working = false;
let lastSentAt = 0;
const MIN_INTERVAL_MS = 1000; // 1 msg/sec safety

async function processQueue(client) {
  if (working) return;
  working = true;
  try {
    while (queue.length > 0) {
      const item = queue.shift();
      const now = Date.now();
      const elapsed = now - lastSentAt;
      if (elapsed < MIN_INTERVAL_MS) {
        await sleep(MIN_INTERVAL_MS - elapsed);
      }
      try {
        const user = await client.users.fetch(item.userId);
        await user.send(item.payload);
      } catch (e) {
        console.error('DM send failed:', e.message);
      }
      lastSentAt = Date.now();
    }
  } finally {
    working = false;
  }
}

function queuedDM(userId, payload, client) {
  queue.push({ userId, payload });
  // kick worker; don't await to avoid blocking caller
  processQueue(client);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { queuedDM };