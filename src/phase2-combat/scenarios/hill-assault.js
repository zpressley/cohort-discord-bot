// Red attacks uphill into a defender holding The Crownhill (Q1).
// Hill costs 1.5/tile and is the map's high ground. This is the scenario for
// testing an elevation modifier — if holding the hill is not worth something,
// the numbers are wrong.

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
      armor: 'heavy_armor',
      shield: 'heavy_shield',
      formation: 'line'
    },
    {
      id: 'blue_infantry',
      side: 'blue',
      culture: 'Spartan City-State',
      role: 'heavy_infantry',
      position: 'Q1',
      strength: 75,
      maxStrength: 75,
      movementRange: 3,
      quality: 'veteran_mercenary',
      armor: 'medium_armor',
      shield: 'heavy_shield',
      formation: 'phalanx'
    }
  ],

  turns: [
    { orders: [{ unitId: 'red_infantry', target: 'Q2' }, { unitId: 'blue_infantry', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'Q1' }, { unitId: 'blue_infantry', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_infantry', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_infantry', target: 'hold' }] },
    { orders: [{ unitId: 'red_infantry', target: 'hold' }, { unitId: 'blue_infantry', target: 'hold' }] }
  ]
}
