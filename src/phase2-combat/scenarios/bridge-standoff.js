// Two forces march the Merchant Road onto Harrow Bridge (H15) from opposite
// ends. The bridge is the cheapest crossing on the map (0.5/tile) and one tile
// wide, so this is the scenario for testing a frontal contact with no flank
// available to either side.
//
// Tuning target (PHASE2_COMBAT_PLAN section 8): "even matchup, no flank. Should
// be bloody and slow."
//
// Blue was originally tribal_warriors in light armour against Roman
// professionals in heavy armour and heavy shields — a quality and kit mismatch
// in every dimension, which the engine duly resolved 100-0. That measures a
// tier gap, not a bridge. Both sides are now Professional in matching kit, so
// the only thing under test is the frontage: neither side can go around, so the
// fight has to be decided head-on.

const HOLD = { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_infantry', target: 'hold' }] }

module.exports = {
  name: 'bridge-standoff',
  seed: 1,
  engagementRange: 1,

  units: [
    {
      id: 'red_infantry',
      side: 'red',
      culture: 'Roman Republic',
      role: 'heavy_infantry',
      position: 'H19',
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
      id: 'blue_infantry',
      side: 'blue',
      culture: 'Celtic Tribes',
      role: 'heavy_infantry',
      position: 'H11',
      strength: 100,
      maxStrength: 100,
      movementRange: 3,
      quality: 'professional',
      primaryWeapon: 'celtic_longsword',
      armor: 'medium_armor',
      shield: 'heavy_shield',
      formation: 'line'
    }
  ],

  turns: [
    { orders: [{ unitId: 'red_infantry', target: 'H16' }, { unitId: 'blue_infantry', target: 'H14' }] },
    { orders: [{ unitId: 'red_infantry', target: 'H15' }, { unitId: 'blue_infantry', target: 'H15' }] },
    HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD
  ]
}
