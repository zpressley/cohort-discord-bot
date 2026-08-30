// Red crosses North Ford (W6) into a waiting defender.
// Ford costs 1.5/tile, so the attacker arrives having spent movement the
// defender kept. This is the scenario for testing a crossing penalty.

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
      armor: 'medium_armor',
      shield: 'medium_shield',
      formation: 'phalanx'
    }
  ],

  turns: [
    { orders: [{ unitId: 'red_infantry', target: 'W6' }, { unitId: 'blue_spearmen', target: 'X6' }] },
    { orders: [{ unitId: 'red_infantry', target: 'X6' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_spearmen', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_spearmen', target: 'hold' }] }
  ]
}
