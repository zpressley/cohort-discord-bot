// src/web/import-files.js
//
// Copy the battles and Commanders saved as files (under COHORT_DATA_DIR,
// default data/web) into Postgres (DATABASE_URL). A document already in
// the database is left as it is, so running this twice copies nothing the
// second time, and never writes over a game played since.
//
//   DATABASE_URL=postgres://... node src/web/import-files.js
//
// A convenience, not a migration: ruled 2026-11-24, "There are not any old
// battles I care about".

const path = require('path')
const { openStorage, createFileStorage } = require('./storage')

const KINDS = ['battle', 'commander', 'account']

async function importFiles({ dir, databaseUrl, log = console.log, ...options }) {
  const files = createFileStorage(dir)
  const db = await openStorage({ databaseUrl, ...options })
  const counts = {}
  try {
    for (const kind of KINDS) {
      const there = new Set(db.all(kind).map(d => d.id))
      const docs = files.all(kind).filter(d => d.id && !there.has(d.id))
      for (const doc of docs) db.put(kind, doc.id, doc)
      counts[kind] = docs.length
    }
    await db.flush()
  } finally {
    await db.close()
  }
  log(`Copied into the database: ${KINDS.map(k => `${counts[k] ?? 0} ${k}s`).join(', ')} (any already there were left alone).`)
  return counts
}

if (require.main === module) {
  require('dotenv').config()
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('Set DATABASE_URL to the database to copy into.')
    process.exit(1)
  }
  const dir = process.env.COHORT_DATA_DIR ?? path.join(process.cwd(), 'data', 'web')
  importFiles({ dir, databaseUrl }).catch((error) => {
    console.error(`Could not copy: ${error.message}`)
    process.exit(1)
  })
}

module.exports = { importFiles }
