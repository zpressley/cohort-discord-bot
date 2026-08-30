// Red crosses North Ford (W6-X6) into a defender waiting on the dry far bank.
// Ford costs 1.5/tile and carries a crossing penalty and extra chaos, so the
// attacker fights with wet feet while the defender does not. This is the
// scenario for testing the crossing penalty.
//
// Tuning target (PHASE2_COMBAT_PLAN section 8): "the attacker is caught
// mid-crossing. Should be punishing."
//
// Two authoring bugs were fixed here after the engine could actually measure
// the scenario:
//
//   - Blue was ordered from the dry bank at Y6 INTO the ford at X6 on turn one,
//     so both units stood in the water and the crossing penalty applied to both
//     sides equally. The scenario measured nothing. Blue now holds Y6, which is
//     what "a waiting defender" meant in the first place.
//   - No unit set `primaryWeapon`, so a spearman formed in phalanx was fighting
//     with the default sword. The whole spear/cavalry counter was absent from
//     every scenario.

const HOLD = { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_spearmen', target: 'hold' }] }

module.exports = {
  name: 'ford-crossing',
  seed: 1,
  engagementRange: 1,

  units: [
    {
      id: 'red_infantry',
      side: 'red',
      culture: 'Roman Republic',
      role: 'heavy_infantry',
      position: 'T6',
      strength: 100,
      maxStrength: 100,
      movementRange: 3,
      quality: 'professional',
      primaryWeapon: 'roman_gladius',
      armor: 'medium_armor',
      shield: 'heavy_shield',
      formation: 'line'
    },
    {
      id: 'blue_spearmen',
      side: 'blue',
      culture: 'Macedonian Kingdoms',
      role: 'spearmen',
      position: 'Y6',
      strength: 100,
      maxStrength: 100,
      movementRange: 3,
      quality: 'professional',
      primaryWeapon: 'spear_professional',
      armor: 'medium_armor',
      shield: 'medium_shield',
      formation: 'phalanx'
    }
  ],

  turns: [
    // Red closes to the near lip of the ford; blue stands its ground on the bank.
    { orders: [{ unitId: 'red_infantry', target: 'W6' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    // Red wades to X6 — in the water, adjacent to blue on dry ground.
    { orders: [{ unitId: 'red_infantry', target: 'X6' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD
  ]
}
