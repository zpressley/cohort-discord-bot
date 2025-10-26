// src/game/officers/culturalNames.js
// Authentic historical names for officers from each culture
// Names are assigned at Battle 3 and persist for unit's lifetime

/**
 * Officer name pools by culture
 */
const CULTURAL_OFFICER_NAMES = {
    'Roman Republic': {
        elite: [
            'Marcus Aurelius', 'Titus Flavius', 'Gaius Julius', 'Lucius Cornelius',
            'Cassius Longinus', 'Quintus Fabius', 'Decimus Brutus', 'Sextus Pompeius',
            'Aulus Varro', 'Publius Scipio', 'Gnaeus Magnus', 'Tiberius Gracchus'
        ],
        regular: [
            'Marcus', 'Titus', 'Gaius', 'Lucius', 'Cassius', 'Quintus',
            'Decimus', 'Sextus', 'Aulus', 'Publius', 'Gnaeus', 'Tiberius'
        ],
        positions: {
            elite: 'Centurion',
            regular: 'Decanus',
            second: 'Optio'
        }
    },
    
    'Macedonian Kingdoms': {
        elite: [
            'Alexander', 'Ptolemy', 'Seleucus', 'Antigonus', 'Perdiccas',
            'Craterus', 'Hephaestion', 'Parmenion', 'Cleitus', 'Philotas'
        ],
        regular: [
            'Nikolaos', 'Dimitrios', 'Andreas', 'Philippos', 'Alexandros',
            'Theron', 'Lysander', 'Demetrios', 'Antigonos'
        ],
        positions: {
            elite: 'Phalangarch',
            regular: 'Syntagmatarch',
            second: 'Lochagos'
        }
    },
    
    'Spartan City-State': {
        elite: [
            'Leonidas', 'Brasidas', 'Lysander', 'Agis', 'Cleomenes',
            'Pausanias', 'Agesilaus', 'Archidamus'
        ],
        regular: [
            'Aristodemus', 'Eurytus', 'Dienekes', 'Alpheus', 'Maron',
            'Polymedes', 'Hyperanthes', 'Alphaeus'
        ],
        positions: {
            elite: 'Lochagos',
            regular: 'Enomotarch',
            second: 'Pentekoster'
        }
    },
    
    'Carthaginian Empire': {
        elite: [
            'Hannibal', 'Hasdrubal', 'Hanno', 'Mago', 'Maharbal',
            'Gisgo', 'Adherbal', 'Bomilcar'
        ],
        regular: [
            'Barca', 'Mattan', 'Eshmuniaton', 'Hamilcar', 'Himilco',
            'Abdeshmun', 'Imilce', 'Sophonisba'
        ],
        positions: {
            elite: 'Sacred Band Commander',
            regular: 'Band Leader',
            second: 'Rab'
        }
    },
    
    'Kingdom of Kush': {
        elite: [
            'Kashta', 'Piye', 'Shabaka', 'Taharqa', 'Tantamani',
            'Alara', 'Aspelta', 'Amanirenas'
        ],
        regular: [
            'Amani', 'Khensa', 'Maleqorobar', 'Atlanersa', 'Senkamanisken',
            'Anlamani', 'Nastasen', 'Harsiotef'
        ],
        positions: {
            elite: 'Master Archer',
            regular: 'Bow Captain',
            second: 'Arrow Commander'
        }
    },
    
    'Berber Confederations': {
        elite: [
            'Massinissa', 'Jugurtha', 'Syphax', 'Adherbal', 'Hiempsal',
            'Kahina', 'Tin Hinan', 'Dihya'
        ],
        regular: [
            'Amghar', 'Massyl', 'Numida', 'Gaetul', 'Mauri',
            'Aguellid', 'Amazigh', 'Imazighen'
        ],
        positions: {
            elite: 'Amghar (Tribal Chief)',
            regular: 'Cavalry Master',
            second: 'Raid Leader'
        }
    },
    
    'Sarmatian Confederations': {
        elite: [
            'Arvan', 'Bataar', 'Tengri', 'Khagan', 'Timur',
            'Alania', 'Roxana', 'Tomyris'
        ],
        regular: [
            'Borte', 'Subutai', 'Jebe', 'Kublai', 'Arslan',
            'Batu', 'Hulagu', 'Chagatai'
        ],
        positions: {
            elite: 'Khan',
            regular: 'Noyan',
            second: 'Minghan'
        }
    },
    
    'Han Dynasty': {
        elite: [
            'Zhang Liang', 'Wei Qing', 'Huo Qubing', 'Chen Tang', 'Ban Chao',
            'Li Guang', 'Zhao Chongguo', 'Dou Ying', 'Zhou Yafu', 'Cao Shen'
        ],
        regular: [
            'Zhang', 'Wu', 'Liu', 'Chen', 'Wang', 'Zhao', 'Li', 'Zhou',
            'Cao', 'Sun', 'Ma', 'Deng', 'Gao', 'Song'
        ],
        positions: {
            elite: 'Captain (Yulin Guard)',
            regular: 'Sergeant',
            second: 'Corporal'
        }
    },
    
    'Celtic': {
        elite: [
            'Brennus', 'Vercingetorix', 'Cassivellaunus', 'Caratacus',
            'Boudica', 'Adminius', 'Togodumnus', 'Diviciacus'
        ],
        regular: [
            'Cai', 'Bran', 'Finn', 'Mael', 'Arthgal', 'Cathal',
            'Domnall', 'Eogan', 'Fergus', 'Niall', 'Oisin', 'Ruadhan'
        ],
        positions: {
            elite: 'Rí (War King)',
            regular: 'Fianna Champion',
            second: 'War Leader'
        }
    },
    
    // Add remaining 11 cultures as they're implemented:
    // Thracian Odrysians, Samnite Federation, Tibetan Kingdoms,
    // Pre-Genghis Mongolia, Bactrian Greeks, Yayoi Japan, etc.
};

/**
 * Generate officer name for unit (called once at Battle 3)
 */
function generateOfficerName(unit, culture) {
    const namePool = CULTURAL_OFFICER_NAMES[culture];
    
    if (!namePool) {
        console.warn(`No name pool for culture: ${culture}, using default`);
        return {
            name: 'Officer',
            position: 'Commander',
            fullTitle: 'Officer'
        };
    }
    
    // Elite units get elite names
    if (unit.isElite) {
        const names = namePool.elite;
        const randomName = names[Math.floor(Math.random() * names.length)];
        return {
            name: randomName,
            position: namePool.positions.elite,
            fullTitle: `${namePool.positions.elite} ${randomName}`
        };
    }
    
    // Regular units get regular names
    const names = namePool.regular;
    const randomName = names[Math.floor(Math.random() * names.length)];
    const position = Math.random() < 0.3 ? 
        namePool.positions.second : 
        namePool.positions.regular;
    
    return {
        name: randomName,
        position: position,
        fullTitle: `${position} ${randomName}`
    };
}

module.exports = {
    CULTURAL_OFFICER_NAMES,
    generateOfficerName
};