# Stage 4: screen flow and wireframes

Date: 2026-10-29. Plan: [`PLAN.md`](PLAN.md), step 2. The wireframes are
drawn on a design canvas (link in the PR) for review on a phone; this file
is the written record of the same screens, kept with the code.

Wireframes only: boxes and words in plain greys with a hint of paper, so
the flow can be judged before the look. The parchment theme is step 3.

## The flow

```
Your battles ──► Muster ──► Command Tent ◄──► Army (a unit tapped)
     ▲   │                    │   ▲  │
     │   │                    │   │  └──► Dispatches
     │   └── a finished       ▼   │
     │       battle ──► Verdict   Orders ──► Orders sent (waiting)
     │                                             │
     └─────────── come back hours or days later ───┘
```

A commander's day: open "Your battles", see which battle is waiting on
them, read the dispatches, give orders, send them, close the page. Come
back later; the turn has run.

## The screens

### 1. Your battles

The home page, and where a commander comes back to.

- Three groups: **waiting on you** (bold, at the top), **waiting on the
  enemy** (with when your orders went), **finished**.
- Each battle shows: the field, your side and opponent (the standing orders
  or a friend), the turn, battle time, and how long ago the turn ran.
- One action: **Muster a new battle**.

### 2. Muster a battle

- The field (scenario), your opponent (the standing orders, or a friend by
  link), your side, when the day ends (a time limit, or when an army
  breaks), ground to hold (objectives: a named place or a grid square).
- **Muster the armies.** Against a friend, the next screen gives the link
  to send them.

### 3. The Command Tent: the map

The map takes the screen; everything else stays out of its way.

- Top bar: back to your battles, the field, the turn and battle time, and
  whose move it is.
- The map: the grid's squares lettered and numbered in the margin; terrain;
  your units as dark squares with a role symbol and name; a hidden unit
  shown dashed; enemies seen as open squares; an enemy last seen as a faint
  dashed "?" with "seen 20 min ago"; objectives ringed; your orders in force
  as dashed arrows.
- Tap a unit to see it; tap a square to put its name into an order.
- Below the map: the latest dispatch in a line or two (tap for all).
- Bottom bar: **Army**, **Give orders** (the main action), **Dispatches**.

### 4. A unit tapped (the army)

- The map shrinks, with the unit picked out.
- The unit's card: name, kind and quality, men out of full strength, bars
  for men, morale and wind, where it stands, its orders in force, and any
  state (hidden, crowded, fighting, broken).
- **Give this unit an order** (opens the order pad with its name started).
- The rest of the army, one line each with men and what they are doing.

### 5. Orders and read-back

- A box to write orders as you would say them, one per line.
- **Read them back** shows what each officer understood, in plain words,
  including how well a unit will hide there (the engine's own table).
- A question for any order that could mean two things ("Which ridge?"),
  with the choices as buttons. Nothing is sent while a question is open.
- **Send the orders.** Units given no order keep their last one.

### 6. Orders sent, waiting

- Calm, not urgent: "Your orders are with the army. The enemy commander has
  not answered yet. There is no hurry." No timers, no countdowns.
- The map with your orders drawn on it; what you ordered.
- **Change your orders** until the turn runs (the engine already takes the
  latest submission).

### 7. Dispatches

- Each turn's report, newest first, kept for the whole battle: a heading
  (turn, battle time, why the turn stopped: enemy sighted, contact, an
  hour passed), the narrated report in the culture's voice, and the plain
  account folded underneath.
- Fog of war holds: only what your side knows.

### 8. The verdict

- Victory, defeat or a draw, and why.
- Men standing, fled and fallen, each side.
- Your officers: killed, captured, wounded, or came through.
- Replay the battle turn by turn, with a slider over the map.

### On a desktop

The same tent, wider: the map in the middle, and one off-white column at
the side with **Army**, **Orders** and **Dispatches** as tabs, the latest
dispatch, and **Send the orders**. At phone width the column drops below
the map.

## Decisions taken in the wireframes (for review)

- **Orders stay free text,** as in the hotseat game, with tapping the map
  as a help for names, not a replacement. Tapping a unit then a square to
  build "move there" is a possible later shortcut.
- **One main action per screen,** in the dark button at the bottom.
- **Units given no order keep their last one,** said on the order screen,
  because that is what the engine does.
- **Plain words for state:** "men", "morale", "wind", "hidden, in ambush";
  no numbers beyond men.
- **Names of units are the army's own** ("the spears"). Real names, and an
  officer's name on each unit, wait for the commanders work.

## Questions for Zach

1. Is free-text orders right as the main way to command, with the map as a
   help? Or should the map do more (drag a unit to give a move order)?
2. Should "Your battles" be the home page, or should the app open straight
   into the battle waiting on you?
3. Anything missing from the unit card or the verdict?
