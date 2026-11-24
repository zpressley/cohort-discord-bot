# The Commander's point of view, and messengers

The specification for building Zach's ruling of November 23, 2026:

> "POV is limited to what the commander can see and this was already hashed
> out. Commands take longer to reach troops farther away, there is an
> immediate range around the commander then outside that range every turn
> of movement by a messenger on horseback is a delay in the order... so both
> ways, you are delayed in hearing back from distant troops ... maybe even
> troops behind enemy lines can't communicate. Adds disadvantage to being
> surrounded and adds value to choke points and map control."

and, of a Commander in the enemy's hands: "You see everything around your
position, not everything."

The ranges below were put to Zach the same day and approved: "Go with the
proposed pov/messenger ranges." The earlier design this takes up is the
command zones of `docs/design/architecture-roadmap.md` (instant at 2 to 6
tiles, by messenger beyond).

## The principle

**The player knows what his Commander knows, when his Commander knows it.**
Today he knows what any of his units knows, at once. This changes three
things: what he sees, when his orders arrive, and when news reaches him.

Everything here applies only to a side with a Commander on the field
(`spec.commanders`). A battle with none runs exactly as before.

## Where he is

With the unit he rides with (`command/commander.js`); in the enemy's hands,
with the unit that holds him.

## The numbers (`tables.COMMAND`, starting values)

| | |
|---|---|
| Immediate range | 6 tiles (150 m) from the Commander: within a shout and a short run |
| A rider's pace | 10 tiles each ten minutes, over the ground a horseman can cross (woods and fords slow him as they slow horse) |
| Ground a rider will not cross | any tile within 1 of an enemy unit |

A formed unit of horse moves 5 tiles in ten minutes; a lone rider at twice
that. The fields are 40 tiles across and armies form up 16 to 30 tiles
apart, so an order to a unit across the field takes 20 to 40 minutes, and
one to a unit a few hundred metres off takes 10.

## Orders

- To a unit **within the immediate range**, an order arrives at once, as
  now.
- To a unit **beyond it**, a rider carries the order. The delay is the
  rider's path from the Commander to the unit as they stand when the order
  is given, at the rider's pace, rounded up to whole ten minutes. The order
  takes effect when he arrives; until then the unit carries on with what it
  had. What its officer keeps of a deep order is rolled when it arrives.
- **No path** that avoids the enemy: no rider can get through, and the
  order is not sent. The Commander is told so when he gives it.
- A unit destroyed or gone from the field before the rider arrives never
  gets the order.
- A newer order to the same unit does not overtake an older one already on
  the road; both arrive, in the order given.
- The read-back says how long each order will take: "Horse: attack enemy
  archers. A rider reaches them in about 20 minutes."
- A Commander in the enemy's hands sends none.

## What he sees

- **Live:** everything the Commander's own unit can see from where it
  stands (the usual sight: 6 tiles, more from high ground, less into
  woods), and every unit of his within the immediate range, with what
  those units can see.
- **By report:** every other unit of his, and every enemy only they can
  see, as they stood when the news left them. News travels at the rider's
  pace by the same path rule, so a unit 20 tiles off is shown as it was 20
  minutes ago, marked with its age ("20 min ago").
- **No word:** a unit with no path a rider could take is cut off. It is
  shown where it last was, with when it was last heard from. It keeps
  fighting on the orders it has. He is not told it is cut off (ruled
  November 23: "Notice when no word comes back"): once the word that
  should have come is late, by a rider's ride from where the unit last
  was and a little slack, the unit is marked "no word of them since ...",
  judged from what has reached him alone. A unit cut off, one destroyed out
  of his sight and one merely far off look the same until word comes.
  When it comes again it simply arrives, and the dispatch says so.
- An enemy is on his map only if he sees it or a report of it has reached
  him; it is shown at the place and time of that report.

## What he is told

- The dispatch for a turn tells what has **reached** the Commander by its
  end, each piece of news with how old it is. A rout on the far wing an
  hour's ride away is in the dispatch an hour later.
- The battle stops for a Commander when stop-worthy news **reaches** him
  (contact, a sighting, a rout), not when it happens out of his knowledge,
  or when his orders are carried out. Only he is asked then (ruled November
  23: "No the game keeps going ... both would only be notified when there
  are commands to give or things happen to them"): the other side is not
  told the battle stopped, nor waited for. A march of three hours with no
  news is one wait. A Commander whose men only hold is not called back by
  the clock: he waits for news, such as passing enemy troops (ruled
  November 24: "Holding for several turns would still get interrupts from
  passing enemy troops"); no one waits more than six hours.
- He may give new orders unasked, interrupting units mid march; they go
  out at the end of the turn in play, when the battle moves on (ruled
  November 24: "You can interrupt units mid March. But orders don't come
  over till the end of the turn").
- His dispatch, when he is next asked, tells all that reached him since
  his last orders.
- An order no rider can carry is told him when the rider is back, a ride
  there and back as far as he knows, not at once (ruled November 24: "the
  rider should return with that news. After turns of travel pass"); the
  rider's return calls him back.
- The verdict, when the battle ends, tells all.
- The day is twelve hours of battle (ruled November 24). If neither side
  has won by then, night ends the fighting and neither side has won; he
  may fight again the next day against the same enemy.

## The computer's side

It has no Commander on the field. So that a player is not fighting an
opponent that knows and commands at once: its orders are delayed by the
same rule, counted from its best unit as its command post. Its knowledge
is not delayed in the first build (it plans from what its whole side has
seen); that is the next step for it, and is said plainly in the notes.

## Built in three steps

1. **Orders by rider.** The delay, the queue, "no rider can get through",
   the read-back's time. The map and dispatch unchanged.
2. **News by rider.** The map as the Commander knows it (live near him,
   aged beyond, "no word" when cut off), the dispatch by arrival, turns
   that stop on news arriving.
3. **Cut off, and the computer.** Riders blocked by the enemy both ways;
   the computer's orders delayed.

Each step leaves the game playable and is merged on its own.

Where the build stands:
- **Step 1 is built** (`engine/command/messengers.js`; the queue is
  `battle.riders`, filled as orders are given; `riderSent` and
  `riderBlocked` in the log; the read-back's time in
  `interpreter/resolve.js`). Measured with
  `node src/harness/messenger-league.js`. See `docs/DECISIONS.md`, "How the
  Commander's point of view and messengers were built".
- **Step 2 is built** (`engine/orchestrator/word.js`: what each Commander
  on the field knows and when, `game.word`; the tent, the read-back, the
  Army tab and the dispatch read it in `web/battles.js`; the map marks the
  Commander, his immediate range, and his units known by rider, faded with
  their age). Cut-off units already show "no word since" here, as the
  path rule blocks news as it blocks orders.
- **Step 3 is built.** A unit cut off, and back in touch, was told to its
  Commander (`cutOff`, `inTouch`), marked on the map with a cross and on
  the Army tab; since Zach's answer of November 23 only in battles saved
  before it, and the cross now marks a unit with no word. The computer's orders, marked as from its command post
  (`byCommandPost`, in `web/battles.js` and the soak), go by rider from its
  best unit; what it knows is not delayed. That is the next step for it.

All three steps are built. Not built: everything under "What comes after".

- **Zach's answers of November 23 are built** (see `docs/DECISIONS.md`,
  "How the riders rulings were built"): the immediate range stays at 6
  tiles; a unit cut off is no longer told (`cutOff` and `inTouch` are only
  in battles saved before), he notices that no word has come; an order on
  the road still arrives, and no word returns; and each side is asked only
  when wanted (`game.wanted`, `waitingOn` in the orchestrator), the day
  counted in battle time (`dayMinutes`).
- **Zach's answers of November 24 are built** (see `docs/DECISIONS.md`,
  "How the day, the night and the hold were built"): the day is twelve
  hours and night ends the battle with no winner, with the next day
  offered; a Commander whose men hold waits for news, not the hour; and
  the two rulings on orders unasked and a rider who could not get through
  are tested by name.

## What comes after, not in this build

- **Reports that say more as an officer rises, and never say anything
  wrong** (ruled November 23). A unit with no officer reports that there
  is an enemy and where; a green officer adds what kind; a seasoned one
  roughly how many; a veteran exactly how many; a legend how they are
  holding up. Every level's report is true as far as it goes.
- Officers who act on their Commander's intent when out of contact
  (veterans and above). The level-30 officer as a "second" near whom
  orders arrive at once was ruled out as too powerful.
- A unit choosing to send word of something urgent faster than the
  routine report.
- The enemy catching a rider and reading the order.
