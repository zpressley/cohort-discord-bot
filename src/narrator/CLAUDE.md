# Telling the battle

Events to words. `words.js` is the one vocabulary. `turnNarrator.js` makes
each side's report of a turn: the plain account (always), and the AI
dispatch (when there is a key).

- **One word for one thing.** Orders, morale and outcomes are named in
  `words.js` and nowhere else. The list is in `docs/DECISIONS.md` ("One
  vocabulary").
- **Each side is told only what it could know.** `visibleEvents` decides.
  `PRIVATE` events are a unit's own side's alone; `UNTOLD` are the engine's
  own rolls, told to no one.
- **The Commander is "you".** What happens to him is told to him in the
  second person (`toTheCommander`); the other side hears it as its own
  men's doing.
- **The AI words the report; it adds no facts.** It is given the digest
  and may not invent losses, places or units.
- A new event type needs a `plainFact` line and a `WEIGHT`.
