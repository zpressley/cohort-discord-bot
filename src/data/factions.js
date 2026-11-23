// src/data/factions.js
//
// The factions a Commander may belong to, and the army each brings to the
// muster. Data only: src/engine/army/factions.js builds an army from it
// through the army builder (engine/army/builder.js), so the culture's
// budget and the kit it may field are enforced on every muster.
//
// A faction is one of the builder's cultures. It brings:
//   elite   its unique unit, free with every army (ruled 2026-11-23: "The
//           elite unit is the unique unit of the faction, you get it for
//           free"). Not bought: its kit must still be kit the culture may
//           field, but it costs nothing and is raised at the elite's one
//           size (QUALITY_TIERS.elite). The Commander's veteran leads it,
//           and he rides with it.
//   army    the standard units, bought within the culture's budget. Each
//           has a `name`: what the player calls it in an order. Two units
//           with the same name are told apart by number ("legionaries 1",
//           "legionaries 2"), and the name alone orders both.
//
// One default army per faction, for now: there is no screen to buy an army
// (not asked for yet). These were chosen from four candidates each by
// playing every pairing with the computer on both sides
// (src/harness/faction-league.js): the set whose worst pairing was nearest
// even. Not every army spends its whole budget: more, here, made a faction
// win too often (docs/DECISIONS.md, "How factions at the muster were built"). To add a faction, add an entry here; the test
// "every faction's default army is legal under the builder" checks it.
//
// The elites are from the old per-culture elite design
// (docs/Context/Old Context/elite_units_warp_format.js), fitted to the kit
// the builder has. Where that design named a weapon the culture may not
// field here, the nearest it may is used, and the entry says so.

const FACTIONS = {
  rome: {
    culture: 'Roman Republic',
    title: 'Rome',
    fights: 'Heavy foot behind big shields, with slingers.',
    elite: {
      name: 'praetorians',
      weapon: 'roman_gladius', armor: 'heavy_armor', shield: 'heavy_shield'
    },
    army: [
      { name: 'legionaries', quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' },
      { name: 'hastati', quality: 'militia', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' },
      { name: 'slingers', quality: 'levy', weapon: 'sling', armor: 'no_armor', shield: 'no_shield' }
    ]
  },

  macedon: {
    culture: 'Macedonian Kingdoms',
    title: 'Macedon',
    fights: 'The pike phalanx holds; the Companions ride.',
    // The old design's Macedonian elite were the Silver Shields, on foot.
    // The Companions are the better-known guard and give Macedon its horse;
    // they ride with swords (the builder has no horseman's lance for Macedon).
    elite: {
      name: 'companions',
      weapon: 'sword_standard', armor: 'medium_armor', shield: 'light_shield', mounted: true
    },
    army: [
      { name: 'sarissa foot', quality: 'professional', weapon: 'macedonian_sarissa', armor: 'light_armor', shield: 'no_shield' },
      { name: 'sarissa foot', quality: 'professional', weapon: 'macedonian_sarissa', armor: 'light_armor', shield: 'no_shield' },
      { name: 'hypaspists', quality: 'professional', weapon: 'spear_professional', armor: 'light_armor', shield: 'medium_shield' }
    ]
  },

  sarmatia: {
    culture: 'Sarmatian Confederations',
    title: 'Sarmatia',
    fights: 'Horse and bow: riders who shoot, and armoured lords who charge.',
    // The old design gave the Iron Scale Riders the kontos lance; the
    // builder lets only Persia and Parthia field it, so they carry swords.
    elite: {
      name: 'scale riders',
      weapon: 'sword_standard', armor: 'heavy_armor', shield: 'no_shield', mounted: true
    },
    army: [
      { name: 'horse archers', quality: 'tribal_warriors', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield', mounted: true },
      { name: 'horse archers', quality: 'tribal_warriors', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield', mounted: true },
      { name: 'raiders', quality: 'tribal_warriors', weapon: 'sword_standard', armor: 'medium_armor', shield: 'light_shield', mounted: true },
      { name: 'spears', quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'light_shield' }
    ]
  },

  han: {
    culture: 'Han Dynasty',
    title: 'Han',
    fights: 'Crossbows that pierce armour, with a guard of swordsmen.',
    // The old design's Yulin guard were half horse; here they fight on foot,
    // beside the crossbows they guard.
    elite: {
      name: 'yulin guard',
      weapon: 'chinese_dao', armor: 'heavy_armor', shield: 'medium_shield'
    },
    army: [
      { name: 'crossbows', quality: 'professional', weapon: 'han_chinese_crossbow', armor: 'medium_armor', shield: 'no_shield' },
      { name: 'spears', quality: 'militia', weapon: 'spear_professional', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'swords', quality: 'militia', weapon: 'chinese_dao', armor: 'light_armor', shield: 'light_shield' }
    ]
  }
}

module.exports = { FACTIONS }
