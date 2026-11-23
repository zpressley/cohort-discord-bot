# The AI: which model, what it costs, how to check it

Date: 2026-11-20. Provider: Groq (ruled 2026-10-21). Brief from Zach: cheap
and good enough over amazing and expensive.

## What the AI does

Two jobs, and neither decides anything in the game:

1. **Reads orders** the fixed grammar cannot read, into the same order form
   the grammar produces (`src/interpreter/aiReader.js`).
2. **Tells the turn back** as a short dispatch in the side's voice
   (`src/narrator/turnNarrator.js`).

Without a key, or when Groq is down or rate-limited, the game runs on the
grammar and the plain report.

## The model: `openai/gpt-oss-20b`

Set in `src/llm/groq.js`; override with `GROQ_MODEL`.

The three chat models Groq offered on 2026-11-20, on the order benchmark
(38 orders at the time, written the way people type; 10 of them are read by
the grammar alone and never reach a model):

| Model | Orders read right | Median time | Cost per 1,000 AI reads | List price per million tokens (in / out) |
|---|---|---|---|---|
| `openai/gpt-oss-20b` | 37 of 38 | 0.4 s | $0.14 | $0.075 / $0.30 |
| `openai/gpt-oss-120b` | 35 of 38 | 0.7 s | $0.27 | $0.15 / $0.60 |
| `qwen/qwen3.8-27b` (preview) | 38 of 38 | 0.6 s | $1.22 | $0.80 / $4.00 |

The smallest model is the cheapest, the fastest, and within one order of the
best. After the prompt was tuned against its misses, and four harder orders
were added, it read all 42 (see "Latest run" below).

Prices are from third-party listings of Groq's price page (the page itself
could not be reached from the build machine); the token counts in the cost
log are exact, the dollar figures are estimates.

For dispatches the same model is used. The larger model writes slightly
better prose at about two and a half times the cost; set `GROQ_MODEL` to try
it.

## What a turn costs

- An order read: about 1,650 tokens in, 160 out: **$0.00015**.
- A dispatch: about 750 tokens in, 100 out: **$0.00008**.
- A player turn with both: about **$0.0002**, so 20 cents per thousand
  turns. A turn whose orders the grammar reads costs the dispatch only.

**The free tier** costs nothing and allows this model 8,000 tokens a
minute, 200,000 tokens a day and 1,000 requests a day (from Groq's own
reply headers and error message, 2026-11-21). The day's tokens are the
limit that bites: about 110 AI order reads, or 100 full AI turns, a day
across everyone playing, and one full benchmark run uses about a quarter of
it. Over a limit, the client waits out a short one (up to 12 seconds) and
otherwise falls back to the grammar and the plain report: the game goes on,
and orders the grammar cannot read get its "I don't follow" until the limit
lifts. The paid "Dev" tier removes the squeeze at the prices above (100
full AI turns cost about two cents).

## How it is kept cheap and correct

- **Grammar first.** `interpretText` tries the fixed grammar on each line.
  A line goes to the model only if the grammar cannot read it or it says
  more than one thing. Orders written by tapping the map never cost a call.
- **The provider enforces the reply's shape** (structured outputs with a
  strict JSON schema), and the reply is checked again here. A unit that is
  not on the field becomes a question, never a guess.
- **Least thinking.** The model is asked for the lowest reasoning effort and
  the reasoning is not sent back; thinking is billed as output.
- **A fixed opening.** The standing instructions hold nothing about the
  battle, so Groq caches them (cached input is half price).
- **The dispatch is worked out in code.** The turn's events are cut to what
  the side knows, merged across ticks, and the fighting is summed up per
  unit, most important first (`report` in `turnNarrator.js`). The model only
  turns a few notes into prose, which is why a small model is enough.

## Checking it

```
GROQ_API_KEY=... npm run ai:bench                  the default model
GROQ_API_KEY=... npm run ai:bench -- --verbose     show every miss
GROQ_API_KEY=... npm run ai:bench -- openai/gpt-oss-120b qwen/qwen3.8-27b
AI_COST_LOG=ai-cost.jsonl npm run web              one line per call: tokens, time, cost
```

Behind a proxy, add `NODE_USE_ENV_PROXY=1`. On the free tier a run takes
about seven minutes (it waits out the rate limit) and costs nothing.

Run the benchmark after any change to the prompts, and when Groq changes
its models: a model being retired is how the AI silently stopped working
before (the old default, `llama-3.1-8b-instant`, no longer exists).

## Latest run

2026-11-20, `openai/gpt-oss-20b`, free tier, after the prompts were tuned:

```
orders read right: 42 of 42  (11 by the grammar alone, 31 AI calls, 0 failed calls)
per AI read: 1656 tokens in, 156 out, median 619 ms, slowest 985 ms, about $0.000145 each ($0.14 per 1,000)
narration: clean (561 ms, about $0.000079)
  "The Archers broke and fled from enemy swords. The Swords were caught on
   the march by an unseen enemy. The Spears met enemy swords. The Horse went
   to ground in the woods (A1-SW) and is hidden."
```

Model replies vary a little from run to run even at temperature 0; earlier
runs of the same set scored 39 to 42. The three misses were fixed in code
where code could fix them (a name given for an id, two orders to one unit).

2026-11-21, after the bug sweep's small prompt changes ("seek and destroy",
"spring the trap" for units lying in wait): 40 of 42, every order the model
answered read right. The two misses were not misreadings: the day's free
tokens ran out near the end of the run (several benchmark runs in a day)
and those two orders fell back to the grammar.

2026-11-21, with ranged fire: 45 of 45 (15 by the grammar alone, 30 AI
calls, about $0.000154 a read). Three orders for missile troops were added
to the set. The model has two answers of its own for them, `shoot` and
`hold_fire`, which the code turns into a hold; asked instead to remember
"shoot is a hold with a target", it read "loose at their cavalry" as an
ambush.

2026-11-21, with orders that have depth: the reply gained five fields for
one condition, and a chain is written as orders for the same unit one after
another. An AI read now costs about 2,150 tokens in and 290 out, about
$0.00022. On the ten orders this touches: 7 of 10 at first, 9 of 10 after
two fixes in code, and then, with a worked example added to the prompt, the
six that go to the model read 6 of 6 twice.

2026-11-22, the full run with depth and officers in: **50 of 50** orders
read right (17 by the grammar alone, 33 AI calls, 2,250 tokens in and 186
out a read, about $0.00020). The dispatch check ran four times: three clean,
and one that opened with the wrong fact (it led with a unit that held, not
the one that broke). Dispatches are written at a little warmth, so they
vary; the facts in it were right.

2026-11-23, with an attack that can name an enemy unit (one new field,
`enemy`): **50 of 52** on two full runs (19 by the grammar alone, 33 AI
calls, 2,355 tokens in and 190 out a read, about $0.00020). The same two
misses both times. One was new: "send the horse after those bowmen" read as
a plain advance. One was an old order the new instruction had disturbed:
told to ask when a named enemy was not in sight, the model began asking
about the enemy in a condition too ("unless enemy cavalry is sitting on
it"). A first rewording cured the first and made the model ask about two
more. The instruction that held: the field is only for the unit an attack
goes for, the model writes the Commander's own words when nothing listed
fits and never asks because of it (the code asks, in `resolve.js`), and
`against` and conditions name a kind of enemy, not a unit. On the five
orders involved: 5 of 5. The day's free tokens were spent by then, so a
full run with the final wording was owed.

2026-11-23, later, the full run with the final wording: **51 of 52** on two
full runs (19 by the grammar alone, 32 AI calls, 2,433 tokens in and about
200 out a read, about $0.00018; the dispatch clean both times). The same
miss both times: "archers fall back 100 metres to the west". The model gave
the place as "the west" and dropped the distance, and the code, rightly,
asked where that was. Fixed in the grammar, not the prompt: a fall back, like
a march, now takes a distance and a compass direction ("fall back 100 m
west", "pull back south"), so that order no longer reaches the model. With
that the set stands at 52 of 52 by the two runs' readings (20 by the grammar
alone); the order was checked through the benchmark by itself, and a third
full run was not spent on it.
