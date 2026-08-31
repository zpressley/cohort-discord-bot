// src/phase4-integration/scenarios/meeting-battle.js
//
// The phase 4 exit battle: two four-unit armies advance into each other on
// open ground and fight until one army is broken. Each army carries the
// archetype spread that exercises the whole engine at once — spears, swords,
// archers, cavalry — so charges, braces, flanking, pushes, routs and pursuit
// all have room to happen in a single run.
//
// Red marches east from the western staging ground; blue marches west. Their
// centre lines collide around column J–K. The order script is intentionally
// blunt (everyone advance, then everyone hold): the exit criterion tests
// termination and replayability, not generalship.

const HOLD = { red: [], blue: [] }

module.exports = {
  name: 'meeting-battle',
  seed: 1,
  maxTurns: 20,
  engagementRange: 1,

  // Both armies are attacking: any unit the script leaves idle presses the
  // nearest enemy until one army breaks. This is what makes the exit criterion
  // ('terminates correctly under 20 turns') a property of the engine rather
  // than of a lucky script.
  standingOrders: { red: 'advance', blue: 'advance' },

  sides: {
    red: { homeEdge: 'west' },
    blue: { homeEdge: 'east' }
  },

  units: [
    // ── Red, west ──
    {
      id: 'red_spears', side: 'red', role: 'spearmen', position: 'E7',
      strength: 100, maxStrength: 100, movementRange: 3,
      quality: 'professional', primaryWeapon: 'spear_professional',
      armor: 'medium_armor', shield: 'medium_shield'
    },
    {
      id: 'red_swords', side: 'red', role: 'heavy_infantry', position: 'E8',
      strength: 100, maxStrength: 100, movementRange: 3,
      quality: 'professional', primaryWeapon: 'roman_gladius',
      armor: 'medium_armor', shield: 'heavy_shield',
      aliases: ['the swords', 'the legionaries']
    },
    {
      id: 'red_archers', side: 'red', role: 'archers', position: 'D8',
      strength: 100, maxStrength: 100, movementRange: 3,
      quality: 'militia', primaryWeapon: 'greek_composite_bow',
      armor: 'light_armor', shield: 'no_shield'
    },
    {
      id: 'red_horse', side: 'red', role: 'cavalry', position: 'E9',
      strength: 100, maxStrength: 100, movementRange: 5, mounted: true,
      quality: 'professional', primaryWeapon: 'sword_standard',
      armor: 'light_armor', shield: 'light_shield'
    },

    // ── Blue, east ──
    {
      id: 'blue_spears', side: 'blue', role: 'spearmen', position: 'N7',
      strength: 100, maxStrength: 100, movementRange: 3,
      quality: 'professional', primaryWeapon: 'two_handed_spear',
      armor: 'medium_armor', shield: 'no_shield'
    },
    {
      id: 'blue_swords', side: 'blue', role: 'heavy_infantry', position: 'N8',
      strength: 100, maxStrength: 100, movementRange: 3,
      quality: 'professional', primaryWeapon: 'celtic_longsword',
      armor: 'medium_armor', shield: 'medium_shield'
    },
    {
      id: 'blue_archers', side: 'blue', role: 'archers', position: 'O8',
      strength: 100, maxStrength: 100, movementRange: 3,
      quality: 'militia', primaryWeapon: 'persian_recurve_bow',
      armor: 'light_armor', shield: 'no_shield'
    },
    {
      id: 'blue_horse', side: 'blue', role: 'cavalry', position: 'N9',
      strength: 100, maxStrength: 100, movementRange: 5, mounted: true,
      quality: 'professional', primaryWeapon: 'chinese_dao',
      armor: 'light_armor', shield: 'light_shield'
    }
  ],

  turns: [
    // Both lines advance on the centre; each cavalry goes for the enemy archers.
    {
      red: [
        { unitRef: 'red_spears', target: 'J7' },
        { unitRef: 'the swords', target: 'J8' },
        { unitRef: 'red_archers', target: 'H8' },
        { unitRef: 'red_horse', target: 'M9' }
      ],
      blue: [
        { unitRef: 'blue_spears', target: 'K7' },
        { unitRef: 'blue_swords', target: 'K8' },
        { unitRef: 'blue_archers', target: 'L8' },
        { unitRef: 'blue_horse', target: 'G9' }
      ]
    },
    // Press the same objectives; late arrivals close the remaining distance.
    {
      red: [
        { unitRef: 'red_spears', target: 'J7' },
        { unitRef: 'the swords', target: 'J8' },
        { unitRef: 'red_horse', target: 'M9' }
      ],
      blue: [
        { unitRef: 'blue_spears', target: 'K7' },
        { unitRef: 'blue_swords', target: 'K8' },
        { unitRef: 'blue_horse', target: 'G9' }
      ]
    },
    // From here standing orders take over: everyone presses the nearest
    // enemy until one army is broken.
  ]
}
