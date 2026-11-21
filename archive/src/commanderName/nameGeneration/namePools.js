// src/commanderName/nameGeneration/namePools.js
// Name pools for commander archetypes and philosophies

// NOTE: This module is intentionally self-contained and not yet wired into
// the live database. It mirrors the implementation guide so the commander
// name system can be integrated later without touching existing game code.

const NAME_POOLS = {
  engineer: {
    glory: {
      praenomina: ['Marcus', 'Lucius', 'Gaius', 'Titus', 'Quintus', 'Publius', 'Gnaeus', 'Aulus', 'Servius', 'Appius', 'Sextus', 'Decimus', 'Manius', 'Numerius', 'Tiberius'],
      nomina: [
        'Aemilius', 'Cornelius', 'Fabius', 'Claudius', 'Julius', 'Valerius', 'Aurelius', 'Flavius', 'Antonius',
        'Domitius', 'Caecilius', 'Manlius', 'Livius', 'Tullius', 'Pompeius', 'Horatius', 'Junius', 'Sergius',
        'Sulpicius', 'Terentius', 'Marcius', 'Papirius', 'Quinctius', 'Sempronius', 'Vergilius', 'Acilius',
        'Aquilius', 'Atilius', 'Calpurnius', 'Cassius', 'Decimius', 'Furius', 'Genucius', 'Iunius', 'Licinius',
        'Lucretius', 'Maecius', 'Minucius', 'Mucius', 'Nautius', 'Octavius', 'Oppius', 'Ovidius', 'Plautius',
        'Postumius', 'Rufius', 'Sextius', 'Titius', 'Ulpius', 'Vibius'
      ]
    },
    survival: {
      praenomina: ['Brutus', 'Corvus', 'Draco', 'Varro', 'Cassius', 'Nero', 'Sulla', 'Crassus', 'Cursor', 'Volusus'],
      nomina: [
        'Cruentus', 'Ferox', 'Severus', 'Durus', 'Mortifer', 'Tenebris', 'Sanguinus', 'Noctis', 'Glacialis',
        'Acerbus', 'Atrox', 'Crudus', 'Exitialis', 'Funestus', 'Gravis', 'Horridus', 'Immanis', 'Lugubris',
        'Maestus', 'Nefarius', 'Ominous', 'Perniciosus', 'Saevus', 'Terribilis', 'Violentus', 'Asper', 'Barbarus',
        'Cruentatus', 'Dirus', 'Ferus', 'Implacabilis', 'Luctuosus', 'Miser', 'Noxius', 'Pestifer', 'Rigidus',
        'Torvus', 'Austerus', 'Frigidus', 'Immitis', 'Mordax', 'Odiosus', 'Saevius', 'Tristis', 'Vehemens',
        'Acidus', 'Amarus', 'Calamitosus', 'Detestabilis'
      ]
    }
  },

  // For now we seed smaller pools for non-Roman archetypes. These are easy to
  // expand later; the generator logic does not depend on specific contents.
  mountain: {
    // Avoid directly using famous historical figures like Hannibal; these are
    // evocative but not literal Carthaginian names.
    glory: [
      'Barakbal', 'Malchus', 'Hadran', 'Bomicar', 'Giscar', 'Adonbal', 'Mattanor', 'Azdrubal', 'Zamaris', 'Abdcar',
      'Bostaric', 'Himilcaron', 'Zamrath', 'Milqarton', 'Aznicar'
    ],
    survival: [
      'Baalzor', 'Melkarth', 'Malkor', 'Syphiron', 'Zalmar', 'Tanithor', 'Eshmar', 'Astarn', 'Pygmar', 'Motcar'
    ]
  },

  ghost: {
    glory: ['Alaric', 'Varian', 'Cassian', 'Darius', 'Leontius'],
    survival: ['Shade', 'Nocturn', 'Umbra', 'Morrow', 'Graves']
  },

  mirage: {
    glory: ['Ardashir', 'Rostam', 'Bahram', 'Cyrus', 'Daryush'],
    survival: ['Dustwind', 'Sandveil', 'Dunewalker', 'Stormhoof', 'Nightmare']
  },

  hero: {
    // Use heroic-flavored but non-famous names
    glory: ['Acheron', 'Thesandor', 'Hektarion', 'Leonidos', 'Ajas'],
    survival: ['Bloodhand', 'Ironhide', 'Grimblade', 'Blackhelm', 'Redspear']
  },

  wall: {
    glory: ['Bulwark', 'Rampart', 'Citadel', 'Bastion', 'Strongwall'],
    survival: ['Stoneback', 'Holdfast', 'Ironbar', 'Lockshield', 'Grimwall']
  },

  wind: {
    glory: ['Swiftwind', 'Stormrider', 'Skyhoof', 'Fleetmane', 'Cloudcharger'],
    survival: ['Dusthoof', 'Ghostrider', 'Longstride', 'Nightgallop', 'Whisperstep']
  },

  threshold: {
    glory: ['Gatekeeper', 'Warden', 'Sentinel', 'Watchman', 'Bridgehold'],
    survival: ['Doorgrim', 'Lockjaw', 'Chokeblade', 'Narrowpass', 'Lastpost']
  },

  serpent: {
    glory: ['Viper', 'Cobra', 'Aspis', 'Serastes', 'Mamba'],
    survival: ['Fangshade', 'Venomtongue', 'Duskscale', 'Nightcoil', 'Grimadder']
  },

  storm: {
    glory: ['Thunderhand', 'Stormcaller', 'Skybreaker', 'Tempest', 'Rainmaker'],
    survival: ['Razorstorm', 'Blackcloud', 'Skyrend', 'Galescourge', 'Ironhail']
  }
};

module.exports = NAME_POOLS;
