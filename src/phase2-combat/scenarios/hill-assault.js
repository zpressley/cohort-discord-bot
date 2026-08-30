// Red attacks uphill into a defender holding The Crownhill (Q1).
// Hill costs 1.5/tile and is the map's high ground. This is the scenario for
// testing the elevation modifier — if holding the hill is not worth something,
// the numbers are wrong.
//
// Tuning target (PHASE2_COMBAT_PLAN section 8): "the defender holds high ground
// with fewer, better troops. If the attacker wins easily, elevation is worth
// nothing."
//
// The defender was originally veteran_mercenary. That is "better troops" on
// paper, but veteran mercenaries carry Militia morale by design — they are the
// tier that leaves first when losing — so the hill defender broke early for a
// reason that had nothing to do with the hill, and the scenario could not
// measure what it was for. Both sides are now Professional, and the defender's
// advantages are exactly the two the scenario is about: the ground, and better
// kit on fewer men.

const HOLD = { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_infantry', target: 'hold' }] }

module.exports = {
  name: 'hill-assault',
  seed: 1,
  engagementRange: 1,

  units: [
    {
      id: 'red_infantry',
      side: 'red',
      culture: 'Roman Republic',
      role: 'heavy_infantry',
      position: 'Q5',
      strength: 100,
      maxStrength: 100,
      movementRange: 3,
      quality: 'professional',
      primaryWeapon: 'roman_gladius',
      armor: 'medium_armor',
      shield: 'medium_shield',
      formation: 'line'
    },
    {
      id: 'blue_infantry',
      side: 'blue',
      culture: 'Spartan City-State',
      role: 'spearmen',
      position: 'Q1',
      strength: 80,
      maxStrength: 80,
      movementRange: 3,
      quality: 'professional',
      primaryWeapon: 'spear_professional',
      armor: 'medium_armor',
      shield: 'heavy_shield',
      formation: 'phalanx'
    }
  ],

  turns: [
    { orders: [{ unitId: 'red_infantry', target: 'Q2' }, { unitId: 'blue_infantry', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'Q1' }, { unitId: 'blue_infantry', target: 'hold' }] },
    HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD
  ]
}
