# Cohort

An ancient-warfare battle game. Two Commanders give orders in their own
words; a deterministic engine resolves the battle; dispatches tell each
side what it could know. Played in the browser (the "Command Tent"),
alone against the computer or against a friend by link.

Zach Pressley owns the design. Treat specs as design direction, keep
things simple, and prefer cheap and good enough over amazing and expensive.

## The rules everything hangs on

- **The engine decides every outcome.** AI only reads orders and words
  reports. The game must work with no AI at all.
- **The Commander is the player, and the game is his point of view.** Write
  to him as "you". He is shown only what his side could know (fog of war is
  held on the server). The men who carry his orders are **officers**. The
  side with no player is **the computer**.
- **One vocabulary.** Words shown to the player come from
  `src/narrator/words.js`. Do not coin a second word for a thing that has
  one. Plain words: no jargon, no dev terms in anything a player reads.
- **Same battle, same story.** Everything is seeded. No `Math.random`, no
  clock, in anything that decides or tells a battle.
- **Never delete files.** Move what is retired to `archive/`.

## Where things are

| Folder | What it is |
|---|---|
| `src/engine` | The rules. Pure: (spec, seed, orders) to events. |
| `src/interpreter` | Orders in words to engine orders: grammar first, AI second. |
| `src/narrator` | Events to words: the plain account, the AI dispatch, the vocabulary. |
| `src/opponent` | The computer's side: a planner, no AI. |
| `src/web` | The server and the browser app. |
| `src/discord` | Discord's HTTP API: "your move" messages and battle threads (sign-in's routes are in `src/web`). Off unless configured. |
| `src/adapters/hotseat` | Two players at one terminal; used by the soak. |
| `src/llm` | The AI client (Groq). |
| `src/harness` | Soak, balance matrix, AI benchmark. |
| `docs/DECISIONS.md` | Every ruling, and how each was built. Read it before changing a rule. |
| `docs/design` | Zach's designs, and where the build stands against them. |
| `docs/REVIEW-2026-11.md` | The standing work list. |
| `archive/` | The retired Discord bot and old notes. Reference only. |

Folders that matter have their own `CLAUDE.md`. Read the one for the folder
you are working in.

## Checks

```
npm test               every unit test (about 2 minutes)
npm run soak           hundreds of whole battles; every one must end (about 4 minutes)
npm run test:browser   the app in a real browser, phone and desktop
npm run balance        the duel matrix; its last table must not change unless you meant to change combat
npm run ai:bench       live AI reads; costs tokens, needs a key (see src/interpreter/CLAUDE.md)
```

CI runs `npm test` and `npm run soak`. Before a pull request, run them from
a fresh clone as well: untracked files have hidden failures here before.

## How work is recorded

- **A ruling is Zach's own words**, quoted and dated, under "Rulings" in
  `docs/DECISIONS.md`.
- **A choice you made to build a ruling** goes under a "How ... was built
  (Claude's choices, open to change)" heading there, with the numbers and
  what you measured. If you guessed at what he meant, say so and say what
  the other reading was.
- A number that tunes the game lives in `src/engine/combat/tables.js` with
  a comment saying where it came from.
- Every rule has a test named for what it shows, written so the title
  reads as the rule.

## Git

- Work on a branch. Do not push, open a pull request or merge unless told to.
- Never rewrite history or force-push. Tags and remote branch deletion are
  Zach's to do.
- No secrets in the repo, in commits or in chat. No model names in commits,
  pull requests or code.

## Working as one of several agents

- Stay inside the files your task names. If you need a change elsewhere,
  make the smallest one and say so in your report.
- Do not reformat or reorder code you are not changing: others are editing
  the same files in parallel and it turns into conflicts.
- Finish with: what you built, what you measured, what you guessed, what
  you left undone, and the checks you ran with their results.
