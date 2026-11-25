# Hosting Cohort

Where the server and its database will be hosted is not decided yet. This
is what any host needs.

## What the server needs

- **Node 22.** Nothing else to install: no build step.
- **One process.** `npm start` (after `npm ci`). It keeps every battle in
  memory while it runs, so run one copy, not several.
- **A Postgres database** (16 is what it is tested on), or a disk that
  survives a redeploy. Postgres is the one to use on a host: a server's own
  disk is usually wiped when it is redeployed.

## Settings it reads

Set these in the host's own settings (its "variables" or "environment"
page). Secrets never go in the repo, in a commit or in a chat.

| Name | What it is for |
|---|---|
| `PORT` | The port to listen on. Most hosts set it themselves. Default 3000. |
| `DATABASE_URL` | The Postgres connection string the host gives (`postgres://...`). When it is set, battles and Commanders are saved there. **A secret.** |
| `COHORT_DATA_DIR` | Only without `DATABASE_URL`: the folder battles are saved in as files. Default `data/web`. |
| `GROQ_API_KEY` | The AI that reads orders and writes dispatches. Without it the game still works: orders are read by the fixed grammar and reports are plain. **A secret.** |

`DATABASE_URL` may end in `?sslmode=require` (most hosts give it so):
the connection is then encrypted. `sslmode=verify-full` also checks the
database's certificate; `sslmode=disable` turns encryption off (for a
database on the host's private network). With no `sslmode`, a database on
another machine is reached encrypted, and one on this machine or a host's
private network (a name ending `.internal`) plainly.

## What it does with the database

- At start it makes its one table, `documents`, if it is not there, and
  reads everything in. Then it listens.
- Each change is written straight after it is made, and the browser is
  answered only once it is saved.
- If the database stops answering, it tries again, with pauses. While it
  cannot save, it refuses new orders (the player is told to try again in a
  minute) and the health address says so. Nothing is lost while the
  server keeps running: it is written when the database comes back.
- On a redeploy the host sends SIGTERM: it stops taking requests, finishes
  the ones under way, writes what is waiting, and exits.
- It uses at most 3 connections.

## The health address

`GET /healthz` answers 200 while the game is loaded and saving works, and
503 when it is not (saving failing, or the server stopping). Point the
host's health check at it.

## Moving saved files in

Battles saved as files can be copied into the database once:

```
DATABASE_URL=postgres://... COHORT_DATA_DIR=data/web node src/web/import-files.js
```

Anything already in the database is left alone, so it is safe to run
twice.
