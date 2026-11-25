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

### On Supabase

- Use the **session pooler** connection string (Supabase's dashboard:
  Connect, "Session pooler") as `DATABASE_URL`. The direct connection is
  on IPv6 only unless the project pays for the IPv4 add-on, and many hosts
  reach out on IPv4 only. The session pooler suits a server that stays
  running, as this one does; the transaction pooler is for short-lived
  functions.
- The server turns **row level security** on for its table when it makes
  it, with no policy, so Supabase's own web API offers nothing from it.
  The table holds every seat's and Commander's token: leave it that way.
- The database password is part of the connection string. It goes in the
  host's settings only.

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

## Connecting Discord

Discord is optional. With none of these set, the game is exactly as it
is without it: no sign-in button, nothing sent. Sign-in and the bot each
work without the other.

### The settings

Set them in the host's settings, like the others. **Secrets go there and
nowhere else**: not in the repo, not in a commit, not in a chat.

| Name | What it is for |
|---|---|
| `PUBLIC_URL` | The game's own address, as players reach it (`https://...`, no `/` at the end). Used for the sign-in's return address and for the links in messages. Needed by both parts. |
| `DISCORD_CLIENT_ID` | The Discord application's id (the old bot's application). For sign-in. |
| `DISCORD_CLIENT_SECRET` | The application's OAuth2 client secret. For sign-in. **A secret.** |
| `SESSION_SECRET` | Any long random text (40 characters or more), made once and kept. It signs the "signed in" cookie; changing it signs everyone out. For sign-in. **A secret.** |
| `DISCORD_TOKEN` | The bot's token (the same name the old bot used). For messages, threads and roles. **A secret.** |
| `DISCORD_GUILD_ID` | Zach's Discord server's id. For messages and roles. |
| `DISCORD_BATTLES_CHANNEL_ID` | The channel where each battle between two players gets its own thread. Without it, no threads; messages still go. |

Sign-in needs `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `PUBLIC_URL`
and `SESSION_SECRET`. Messages need `DISCORD_TOKEN`, `DISCORD_GUILD_ID` and
`PUBLIC_URL`; threads need `DISCORD_BATTLES_CHANNEL_ID` as well. At start
the server says which parts are on ("Discord: sign-in on; messages on;
battle threads on."), never a value.

### In Discord's developer portal

On the application (discord.com/developers/applications):

1. **OAuth2, Redirects**: add `<PUBLIC_URL>/auth/discord/callback`
   exactly (for example `https://cohort.example.com/auth/discord/callback`).
   The client id and secret are on the same page.
2. **Bot**: the token is here ("Reset Token" shows a new one once). The bot
   must be **in the server**: OAuth2, URL Generator, scope `bot`, with the
   permissions below, then open the link and add it to the server.
3. **Permissions** it needs in the battles channel: View Channel, Send
   Messages, Create Public Threads, Send Messages in Threads. For the roles
   of the ten kinds of Commander: Manage Roles, and the bot's own role
   must be **above** those ten roles in the server's role list. Without
   Manage Roles the game carries on and gives no roles.

The bot needs no "privileged intents" and keeps no connection open: the
server calls Discord's web API only when it has something to send.

### What players get

- **Sign in with Discord**, offered on the first page and on Your
  officers, never required. Signed in, his Commanders and battles follow
  him to any phone or computer he signs in on.
- **A direct message when his orders are wanted** in a battle against a
  friend (never against the computer), when a friend joins his battle,
  when the next day is called, and when the battle is over; a reminder
  after a day unanswered, at most three. A direct message only reaches a
  player who is in the server.
- **A thread for each battle** between two players, in the battles
  channel, to talk in. It shows only what both could know: who is
  playing, night, a next day called, and who won.

If Discord is down or refuses, the game plays on; what could not be sent
is dropped with a plain line in the log. `/healthz` does not depend on
Discord.
