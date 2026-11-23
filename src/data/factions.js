// src/data/factions.js
//
// The factions a Commander may belong to, and the army each brings to the
// muster. Data only: src/engine/army/factions.js builds an army from it
// through the army builder (engine/army/builder.js), so the culture's
// budget and the kit it may field are enforced on every muster.
//
// The twenty factions and their elite units are the owner's doc,
// docs/Context/final_20_cultures_complete.txt (ruled 2026-11-23: "I have a
// doc for factions and elite units for 20 factions"). Its perks and
// restrictions are not built; docs/DECISIONS.md, "How the twenty factions
// were built", says which the builder already enforces.
//
// A faction is one of the builder's cultures. It brings:
//   elite   its unique unit, free with every army (ruled 2026-11-23: "The
//           elite unit is the unique unit of the faction, you get it for
//           free"). Not bought: its kit must still be kit the culture may
//           field, but it costs nothing. `size` is the doc's number of men
//           (40 Spartans, 100 Immortals); without one it is raised at the
//           elite's standard size (QUALITY_TIERS.elite). The Commander's
//           veteran leads it, and he rides with it. Where the doc's kit is
//           not in the builder (elephants, a second weapon), the nearest
//           kit it has stands in, and the entry says so.
//   army    the standard units, bought within the culture's budget. Each
//           has a `name`: what the player calls it in an order. Two units
//           with the same name are told apart by number ("sarissa foot 1",
//           "sarissa foot 2"), and the name alone orders both.
//
// One default army per faction: the computer's army, and a ready-made
// choice for a player. They keep to the doc's restrictions where the
// builder does not (no foot for the Sarmatians, one horse unit at most for
// the Yayoi), and were set by playing every pairing with the computer on
// both sides (src/harness/faction-league.js). Not every army spends its
// whole budget. To add a faction, add an entry here; the test "every
// faction's default army is legal under the builder" checks it.

const FACTIONS = {
  rome: {
    culture: 'Roman Republic',
    title: 'Rome',
    fights: 'Heavy foot behind big shields, with light javelin men ahead of them.',
    // Doc: lorica segmentata, gladius, scutum.
    elite: {
      name: 'praetorian guard', size: 80,
      weapon: 'roman_gladius', armor: 'heavy_armor', shield: 'heavy_shield'
    },
    army: [
      { name: 'legionaries', quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' },
      { name: 'hastati', quality: 'militia', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' },
      { name: 'velites', quality: 'levy', weapon: 'light_javelin', armor: 'no_armor', shield: 'light_shield' }
    ]
  },

  macedon: {
    culture: 'Macedonian Kingdoms',
    title: 'Macedon',
    fights: 'The pike phalanx holds; the Silver Shields stand at its heart.',
    // Doc: "sarissa OR standard spears + bronze armor + silver shields". A
    // shield and a sarissa cannot be carried together here, so they take
    // the spear and keep their shields; they cannot change to pikes.
    elite: {
      name: 'silver shields', size: 80,
      weapon: 'spear_professional', armor: 'heavy_armor', shield: 'medium_shield'
    },
    army: [
      { name: 'sarissa foot', quality: 'professional', weapon: 'macedonian_sarissa', armor: 'no_armor', shield: 'no_shield' },
      { name: 'sarissa foot', quality: 'professional', weapon: 'macedonian_sarissa', armor: 'no_armor', shield: 'no_shield' },
      { name: 'peltasts', quality: 'professional', weapon: 'light_javelin', armor: 'no_armor', shield: 'light_shield' }
    ]
  },

  sparta: {
    culture: 'Spartan City-State',
    title: 'Sparta',
    fights: 'Few, and the best spearmen alive; their neighbours fill the line.',
    // Doc: hoplon, dory, bronze cuirass. Forty men.
    elite: {
      name: 'lacedaimonian guards', size: 40,
      weapon: 'spear_professional', armor: 'heavy_armor', shield: 'heavy_shield'
    },
    army: [
      { name: 'hoplites', quality: 'professional', weapon: 'spear_professional', armor: 'medium_armor', shield: 'heavy_shield' },
      { name: 'skirmishers', quality: 'levy', weapon: 'light_javelin', armor: 'no_armor', shield: 'light_shield' },
      { name: 'helots', quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'light_shield' }
    ]
  },

  carthage: {
    culture: 'Carthaginian Empire',
    title: 'Carthage',
    fights: 'Hired men from across the sea, and a citizen guard to hold them.',
    // Doc: "mixed, best available from across the empire", a hundred men.
    // Stood in as heavy spearmen (the Sacred Band of the histories). The war
    // elephants the doc gives Carthage are not in the game.
    elite: {
      name: 'sacred band', size: 100,
      weapon: 'spear_professional', armor: 'heavy_armor', shield: 'heavy_shield'
    },
    army: [
      { name: 'numidian horse', quality: 'militia', weapon: 'light_javelin', armor: 'light_armor', shield: 'light_shield', mounted: true },
      { name: 'gauls', quality: 'militia', weapon: 'sword_standard', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'slingers', quality: 'levy', weapon: 'sling', armor: 'no_armor', shield: 'no_shield' },
      { name: 'iberians', quality: 'militia', weapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield' }
    ]
  },

  kush: {
    culture: 'Kingdom of Kush',
    title: 'Kush',
    fights: 'Archers with great bows, and spearmen to keep the enemy off them.',
    // Doc: six-foot Nubian bows, leather armour.
    elite: {
      name: 'golden bows', size: 80,
      weapon: 'self_bow_professional', armor: 'light_armor', shield: 'no_shield'
    },
    army: [
      { name: 'spearmen', quality: 'professional', weapon: 'spear_professional', armor: 'medium_armor', shield: 'medium_shield' },
      { name: 'spearmen', quality: 'professional', weapon: 'spear_professional', armor: 'medium_armor', shield: 'medium_shield' },
      { name: 'slingers', quality: 'levy', weapon: 'sling', armor: 'no_armor', shield: 'no_shield' }
    ]
  },

  berbers: {
    culture: 'Berber Confederations',
    title: 'Berbers',
    fights: 'Desert horsemen with javelins, and the tribes on foot behind them.',
    // Doc: desert horses, light spears, leather armour. A spear cannot be
    // used from horseback here, so they carry the heavy javelin.
    elite: {
      name: 'blue men', size: 80,
      weapon: 'javelin_heavy', armor: 'light_armor', shield: 'light_shield', mounted: true
    },
    army: [
      { name: 'riders', quality: 'tribal_warriors', weapon: 'light_javelin', armor: 'light_armor', shield: 'light_shield', mounted: true },
      { name: 'swordsmen', quality: 'tribal_warriors', weapon: 'sword_standard', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'swordsmen', quality: 'tribal_warriors', weapon: 'sword_standard', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'slingers', quality: 'levy', weapon: 'sling', armor: 'no_armor', shield: 'no_shield' }
    ]
  },

  sarmatia: {
    culture: 'Sarmatian Confederations',
    title: 'Sarmatia',
    fights: 'All on horse: riders who shoot, and armoured lords who charge.',
    // Doc: scale armour, composite bows, kontos lances, armoured horses. One
    // weapon each here: they charge with the lance and carry no bow.
    elite: {
      name: 'iron scale riders', size: 80,
      weapon: 'persian_kontos', armor: 'heavy_armor', shield: 'no_shield', mounted: true
    },
    army: [
      { name: 'horse archers', quality: 'tribal_warriors', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield', mounted: true },
      { name: 'light riders', quality: 'tribal_warriors', weapon: 'light_javelin', armor: 'light_armor', shield: 'light_shield', mounted: true },
      { name: 'light riders', quality: 'tribal_warriors', weapon: 'light_javelin', armor: 'light_armor', shield: 'light_shield', mounted: true }
    ]
  },

  han: {
    culture: 'Han Dynasty',
    title: 'Han',
    fights: 'Crossbows that pierce armour, with a guard of swordsmen.',
    // Doc: jian and dao swords, iron lamellar, "mixed cavalry/infantry", a
    // hundred men; no shield. One unit here, so they fight on foot.
    elite: {
      name: 'yulin guard', size: 100,
      weapon: 'chinese_dao', armor: 'heavy_armor', shield: 'no_shield'
    },
    army: [
      { name: 'crossbows', quality: 'professional', weapon: 'han_chinese_crossbow', armor: 'light_armor', shield: 'no_shield' },
      { name: 'swords', quality: 'militia', weapon: 'chinese_dao', armor: 'light_armor', shield: 'light_shield' }
    ]
  },

  maurya: {
    culture: 'Mauryan Empire',
    title: 'Maurya',
    fights: 'Every arm together: bowmen, spearmen, horse, and the royal elephants.',
    // Doc: sixty elephant masters and six war elephants, wootz steel, cotton
    // armour. There are no elephants in the game: they stand in as heavily
    // armoured foot with maces, slow and crushing. (As horse, they rode
    // ahead of the line and were cut off: the faction won one battle in four.)
    elite: {
      name: 'gaja vahini', size: 60,
      weapon: 'mace', armor: 'heavy_armor', shield: 'no_shield'
    },
    army: [
      { name: 'bowmen', quality: 'professional', weapon: 'self_bow_professional', armor: 'light_armor', shield: 'no_shield' },
      { name: 'horsemen', quality: 'militia', weapon: 'sword_standard', armor: 'light_armor', shield: 'light_shield', mounted: true },
      { name: 'levies', quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'levies', quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' }
    ]
  },

  silla: {
    culture: 'Silla Kingdom',
    title: 'Silla',
    fights: 'A small army, led by well-born young men armoured in iron.',
    // Doc: curved swords, advanced iron armour, composite bows. One weapon
    // here: the sword.
    elite: {
      name: 'hwarang', size: 80,
      weapon: 'sword_standard', armor: 'heavy_armor', shield: 'medium_shield'
    },
    army: [
      { name: 'spearmen', quality: 'professional', weapon: 'spear_professional', armor: 'medium_armor', shield: 'medium_shield' },
      { name: 'archers', quality: 'militia', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield' },
      { name: 'levies', quality: 'militia', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' }
    ]
  },

  persia: {
    culture: 'Achaemenid Persian',
    title: 'Persia',
    fights: 'Archers and slingers behind a wall of wicker shields, the Immortals at the centre.',
    // Doc: spears, wicker shields, scale armour, akinakes, a hundred men.
    elite: {
      name: 'immortals', size: 100,
      weapon: 'spear_professional', armor: 'medium_armor', shield: 'medium_shield'
    },
    army: [
      { name: 'archers', quality: 'professional', weapon: 'persian_recurve_bow', armor: 'light_armor', shield: 'no_shield' },
      { name: 'sparabara', quality: 'militia', weapon: 'spear_professional', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'spearmen', quality: 'militia', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'slingers', quality: 'levy', weapon: 'sling', armor: 'no_armor', shield: 'no_shield' }
    ]
  },

  parthia: {
    culture: 'Parthian Empire',
    title: 'Parthia',
    fights: 'Horse archers who never close, lancers who do, and levies to hold the ground.',
    // Doc: forty cataphracts with the kontos and forty horse archers. One
    // unit here: the cataphracts.
    elite: {
      name: 'savaran', size: 80,
      weapon: 'persian_kontos', armor: 'heavy_armor', shield: 'no_shield', mounted: true
    },
    army: [
      { name: 'horse archers', quality: 'professional', weapon: 'parthian_horse_bow', armor: 'light_armor', shield: 'no_shield', mounted: true },
      { name: 'light horse', quality: 'militia', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield', mounted: true },
      { name: 'levy spears', quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'levy spears', quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' }
    ]
  },

  germania: {
    culture: 'Germanic Tribes',
    title: 'Germania',
    fights: 'Warbands of spearmen out of the forest, and the chief\'s sworn men.',
    // Doc: framea spears, pattern-welded swords, round shields. The builder's
    // framea takes both hands, so the shields are left behind.
    elite: {
      name: 'comitatus', size: 80,
      weapon: 'germanic_framea', armor: 'medium_armor', shield: 'no_shield'
    },
    army: [
      { name: 'warriors', quality: 'tribal_warriors', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'axemen', quality: 'tribal_warriors', weapon: 'germanic_throwing_axe', armor: 'light_armor', shield: 'light_shield' },
      { name: 'spearmen', quality: 'tribal_warriors', weapon: 'germanic_framea', armor: 'light_armor', shield: 'no_shield' },
      { name: 'skirmishers', quality: 'tribal_warriors', weapon: 'light_javelin', armor: 'light_armor', shield: 'light_shield' }
    ]
  },

  thrace: {
    culture: 'Thracian Odrysians',
    title: 'Thrace',
    fights: 'Light men from the mountains: javelins, and the dreaded long blade.',
    // Doc: pelte shields, javelins, curved swords. Sixty men. They throw the
    // heavy javelin; the curved sword is not carried.
    elite: {
      name: 'peltast guard', size: 60,
      weapon: 'javelin_heavy', armor: 'light_armor', shield: 'light_shield'
    },
    army: [
      { name: 'rhomphaia men', quality: 'tribal_warriors', weapon: 'thracian_rhomphaia', armor: 'light_armor', shield: 'no_shield' },
      { name: 'rhomphaia men', quality: 'tribal_warriors', weapon: 'thracian_rhomphaia', armor: 'light_armor', shield: 'no_shield' },
      { name: 'javelin men', quality: 'tribal_warriors', weapon: 'light_javelin', armor: 'light_armor', shield: 'light_shield' },
      { name: 'spearmen', quality: 'tribal_warriors', weapon: 'spear_basic', armor: 'light_armor', shield: 'light_shield' }
    ]
  },

  samnium: {
    culture: 'Samnite Federation',
    title: 'Samnium',
    fights: 'Mountain swordsmen with big shields, who hate Rome.',
    // Doc: gladii, javelins, scuta. The javelins are not carried.
    elite: {
      name: 'sacred spring warriors', size: 80,
      weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield'
    },
    army: [
      { name: 'swordsmen', quality: 'militia', weapon: 'roman_gladius', armor: 'light_armor', shield: 'heavy_shield' },
      { name: 'slingers', quality: 'levy', weapon: 'sling', armor: 'no_armor', shield: 'no_shield' },
      { name: 'veterans', quality: 'professional', weapon: 'roman_gladius', armor: 'medium_armor', shield: 'heavy_shield' }
    ]
  },

  tibet: {
    culture: 'Tibetan Kingdoms',
    title: 'Tibet',
    fights: 'Long spears from the roof of the world, and a militia that defends its home.',
    // Doc: long spears, yak-hide armour.
    elite: {
      name: 'snow lion guard', size: 80,
      weapon: 'two_handed_spear', armor: 'medium_armor', shield: 'no_shield'
    },
    army: [
      { name: 'pikemen', quality: 'professional', weapon: 'two_handed_spear', armor: 'medium_armor', shield: 'no_shield' },
      { name: 'spearmen', quality: 'militia', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'spearmen', quality: 'militia', weapon: 'spear_basic', armor: 'light_armor', shield: 'medium_shield' }
    ]
  },

  mongolia: {
    culture: 'Pre-Genghis Mongolia',
    title: 'Mongolia',
    fights: 'Every man on a horse: bowmen who never close, and armoured riders who do.',
    // Doc: composite bows, layered armour, a hundred men. The builder's
    // composite bows belong to the Greeks and Parthians: the professional
    // bow stands in.
    elite: {
      name: 'eternal sky riders', size: 100,
      weapon: 'self_bow_professional', armor: 'medium_armor', shield: 'no_shield', mounted: true
    },
    army: [
      { name: 'horse archers', quality: 'tribal_warriors', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield', mounted: true },
      { name: 'armoured riders', quality: 'tribal_warriors', weapon: 'sword_standard', armor: 'medium_armor', shield: 'light_shield', mounted: true },
      { name: 'armoured riders', quality: 'tribal_warriors', weapon: 'sword_standard', armor: 'medium_armor', shield: 'light_shield', mounted: true }
    ]
  },

  celts: {
    culture: 'Celtic Tribes',
    title: 'Celts',
    fights: 'Champions with long swords who charge first and ask after.',
    // Doc: pattern-welded longswords, lime-washed shields, light mail.
    elite: {
      name: 'fianna', size: 80,
      weapon: 'celtic_longsword', armor: 'medium_armor', shield: 'medium_shield'
    },
    army: [
      { name: 'warriors', quality: 'tribal_warriors', weapon: 'celtic_longsword', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'slingers', quality: 'levy', weapon: 'sling', armor: 'no_armor', shield: 'no_shield' },
      { name: 'levies', quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'light_shield' },
      { name: 'levies', quality: 'levy', weapon: 'spear_basic', armor: 'light_armor', shield: 'light_shield' },
      { name: 'horsemen', quality: 'tribal_warriors', weapon: 'light_javelin', armor: 'medium_armor', shield: 'light_shield', mounted: true }
    ]
  },

  bactria: {
    culture: 'Bactrian Greeks',
    title: 'Bactria',
    fights: 'Greek pikes and Iranian horse in one army.',
    // Doc: "mixed: Greek phalanx gear, Iranian cavalry armour, Indian
    // weapons". Stood in as armoured pikemen.
    elite: {
      name: 'indo hellenic guard', size: 80,
      weapon: 'macedonian_sarissa', armor: 'heavy_armor', shield: 'no_shield'
    },
    army: [
      { name: 'cataphracts', quality: 'professional', weapon: 'persian_kontos', armor: 'heavy_armor', shield: 'no_shield', mounted: true },
      { name: 'peltasts', quality: 'levy', weapon: 'light_javelin', armor: 'light_armor', shield: 'light_shield' },
      { name: 'archers', quality: 'militia', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'no_shield' }
    ]
  },

  yayoi: {
    culture: 'Yayoi Period Japan',
    title: 'Yayoi',
    fights: 'Clan spearmen and archers, on foot, as islanders fight.',
    // Doc: bronze and iron spears, composite bows, wooden shields. One
    // weapon here: the spear.
    elite: {
      name: 'yamatai warriors', size: 80,
      weapon: 'spear_professional', armor: 'medium_armor', shield: 'medium_shield'
    },
    army: [
      { name: 'spearmen', quality: 'militia', weapon: 'spear_professional', armor: 'light_armor', shield: 'medium_shield' },
      { name: 'archers', quality: 'militia', weapon: 'self_bow_basic', armor: 'light_armor', shield: 'light_shield' },
      { name: 'clansmen', quality: 'professional', weapon: 'spear_professional', armor: 'medium_armor', shield: 'medium_shield' }
    ]
  }
}

module.exports = { FACTIONS }
