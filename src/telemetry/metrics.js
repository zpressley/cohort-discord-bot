// src/telemetry/metrics.js
// Minimal anonymized metrics exporter (current code-020)
const fs = require('fs');
const path = require('path');

const METRICS_PATH = process.env.METRICS_PATH || path.join(__dirname, '../../data/metrics.jsonl');

function appendMetrics(event, data) {
  try {
    const payload = {
      ts: new Date().toISOString(),
      event,
      ...data
    };
    ensureDir(path.dirname(METRICS_PATH));
    fs.appendFileSync(METRICS_PATH, JSON.stringify(payload) + '\n');
  } catch (e) {
    // best-effort only
    console.warn('metrics append failed:', e.message);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = { appendMetrics };