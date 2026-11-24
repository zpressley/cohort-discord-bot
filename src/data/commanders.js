// src/data/commanders.js
//
// The two questions that make a Commander (docs/design/commanders-lore-and-
// tutorial.md; ruled 2026-11-22: "The ten kinds of commander, and glory or
// survival, are to introduce the lore and create the name").
//
//   KINDS   the ten kinds of commander, in the order the design lists them.
//           Each brings the nature of the veteran officer he starts with
//           (command/officers.js: what an officer does when he loses the
//           thread of an order). Bold, steady and cautious are each good
//           and bad in their turn; none is simply better.
//   HOLDS   what he fights for: glory or survival. His veteran holds the
//           same dear (tables.LOYALTY.MOVES), so the first officer he has
//           is won and lost as he would be.
//
// The words for each are in narrator/words.js (COMMANDER_KINDS, HOLDS_DEAR,
// COMMANDER_TITLES). Nothing here changes a battle that has no Commander
// made with them.

const KINDS = {
  engineer: { nature: 'steady' },
  mountain: { nature: 'cautious' },
  ghost: { nature: 'steady' },
  mirage: { nature: 'bold' },
  hero: { nature: 'bold' },
  wall: { nature: 'cautious' },
  wind: { nature: 'bold' },
  threshold: { nature: 'cautious' },
  serpent: { nature: 'steady' },
  storm: { nature: 'bold' }
}

const HOLDS = ['glory', 'survival']

// A Commander is known by his title once he has fought this many battles
// (the design: "Titles follow battles fought (1, 3, 10, 30)"; only the
// first title's words survive in archive/src/commanderName/titles).
const TITLE_AFTER = 1

module.exports = { KINDS, HOLDS, TITLE_AFTER }
