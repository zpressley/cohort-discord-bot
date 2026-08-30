// Two forces march the Merchant Road onto Harrow Bridge (H15) from opposite ends.
// The bridge is the cheapest crossing on the map (0.5/tile) and one tile wide,
// so this is the scenario for testing a frontal contact with no flank available.

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
      strength: 400,
      maxStrength: 400,
      movementRange: 3,
      quality: 'professional',
      armor: 'heavy_armor',
      shield: 'heavy_shield',
      formation: 'line'
    },
    {
      id: 'blue_infantry',
      side: 'blue',
      culture: 'Celtic Tribes',
      role: 'heavy_infantry',
      position: 'H11',
      strength: 400,
      maxStrength: 400,
      movementRange: 3,
      quality: 'tribal_warriors',
      armor: 'light_armor',
      shield: 'medium_shield',
      formation: 'line'
    }
  ],

  turns: [
    { orders: [{ unitId: 'red_infantry', target: 'H16' }, { unitId: 'blue_infantry', target: 'H14' }] },
    { orders: [{ unitId: 'red_infantry', target: 'H15' }, { unitId: 'blue_infantry', target: 'H15' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_infantry', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_infantry', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_infantry', target: 'hold' }] }
  ]
}
