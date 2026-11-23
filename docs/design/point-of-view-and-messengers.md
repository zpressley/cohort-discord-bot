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
  fighting on the orders it has.
- An enemy is on his map only if he sees it or a report of it has reached
  him; it is shown at the place and time of that report.

## What he is told

- The dispatch for a turn tells what has **reached** the Commander by its
  end, each piece of news with how old it is. A rout on the far wing an
  hour's ride away is in the dispatch an hour later.
- A player turn stops early when stop-worthy news **reaches** a Commander
  (contact, a sighting, a rout), not when it happens out of his knowledge.
  A turn still ends after an hour at most.
- The verdict, when the battle ends, tells all.

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

## What comes after, not in this build

- Officers who act on their Commander's intent when out of contact
  (veterans and above), and the level-30 officer as a second near whom
  orders arrive at once: see the officer perks put to Zach on November 23.
- A unit choosing to send word of something urgent faster than the
  routine report.
- The enemy catching a rider and reading the order.
