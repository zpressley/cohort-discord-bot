// src/game/officers/officers.js
// Officer naming, roster management, and display
// Merged from: culturalNames.js + namingSystem.js + rosterDisplay.js

// ── CULTURAL NAMES ─────────────────────────────────────────────────────────────

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
    }
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

    if (unit.isElite) {
        const names = namePool.elite;
        const randomName = names[Math.floor(Math.random() * names.length)];
        return {
            name: randomName,
            position: namePool.positions.elite,
            fullTitle: `${namePool.positions.elite} ${randomName}`
        };
    }

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

// ── NAMING SYSTEM ──────────────────────────────────────────────────────────────

/**
 * Assign officer names to units that reached Battle 3
 */
function assignOfficerNames(units, culture) {
    return units.map(unit => {
        const battles = unit.veteranBattles || 0;

        if (battles === 3 && !unit.officerName) {
            const officer = generateOfficerName(unit, culture);

            console.log(`  👤 ${unit.unitId} earned officer: ${officer.fullTitle}`);

            return {
                ...unit,
                officerName: officer.name,
                officerPosition: officer.position,
                officerFullTitle: officer.fullTitle,
                officerAssignedBattle: battles
            };
        }

        return unit;
    });
}

/**
 * Get officer for specific unit
 */
function getOfficerForUnit(unit, culture) {
    if (unit.officerName) {
        return {
            name: unit.officerName,
            position: unit.officerPosition,
            fullTitle: unit.officerFullTitle,
            battles: unit.veteranBattles || 0,
            canAdvise: (unit.veteranBattles || 0) >= 6,
            memories: unit.institutionalMemory || []
        };
    }

    return {
        name: 'Unit Commander',
        position: 'Commander',
        fullTitle: 'Unit Commander',
        battles: unit.veteranBattles || 0,
        canAdvise: false,
        memories: []
    };
}

/**
 * Get officer roster for player
 */
function getOfficerRoster(battleState, playerSide) {
    const units = battleState[playerSide]?.unitPositions || [];

    const officers = units
        .filter(u => u.officerName)
        .map(u => ({
            name: u.officerName,
            position: u.officerPosition,
            fullTitle: u.officerFullTitle,
            unitId: u.unitId,
            unitName: u.customName || getDefaultUnitName(u),
            battles: u.veteranBattles || 0,
            veteranLevel: getVeteranLevel(u.veteranBattles || 0),
            location: u.position,
            strength: `${u.currentStrength}/${u.maxStrength}`,
            morale: u.morale || 100,
            status: u.isBroken ? 'broken' : 'active',
            canAdvise: (u.veteranBattles || 0) >= 6
        }));

    return officers;
}

/**
 * Find officer by name in roster
 */
function findOfficerByName(nameQuery, officers) {
    const lower = nameQuery.toLowerCase();

    let match = officers.find(o => o.name.toLowerCase() === lower);
    if (match) return match;

    match = officers.find(o => o.name.toLowerCase().includes(lower));
    if (match) return match;

    match = officers.find(o => o.fullTitle.toLowerCase().includes(lower));
    return match || null;
}

function getVeteranLevel(battles) {
    if (battles >= 11) return 'legendary';
    if (battles >= 6) return 'elite_veteran';
    if (battles >= 3) return 'veteran';
    if (battles >= 1) return 'seasoned';
    return 'recruit';
}

function getDefaultUnitName(unit) {
    if (unit.isElite) return 'Elite Guard';
    if (unit.type === 'cavalry' || unit.mounted) return 'Cavalry';
    if (unit.type === 'archers' || unit.hasRanged) return 'Archers';
    return 'Infantry';
}

// ── ROSTER DISPLAY ─────────────────────────────────────────────────────────────

/**
 * Format officer roster for Discord
 */
function formatOfficerRoster(officers) {
    if (officers.length === 0) {
        return '**💬 Officer Roster:**\n\n' +
               '*No veteran officers yet. Units gain named officers after 3 battles.*\n\n' +
               '*Continue fighting to build veteran experience!*';
    }

    const lines = officers.map(o => {
        const statusIcon = o.status === 'broken' ? '💔' : '✅';
        const advisorBadge = o.canAdvise ? ' 🧠' : '';
        const veteranBadge = o.veteranLevel === 'legendary' ? ' ⭐' : '';

        return `   ${statusIcon} **${o.fullTitle}** (${o.unitName}) - ${o.battles} battles${advisorBadge}${veteranBadge}`;
    });

    const hasAdvisors = officers.some(o => o.canAdvise);
    const hasLegends = officers.some(o => o.veteranLevel === 'legendary');

    let footer = '\n\n';
    if (hasLegends) footer += '⭐ = *Legendary (11+ battles) - brilliant strategic insight*\n';
    if (hasAdvisors) footer += '🧠 = *Veteran (6+ battles) - provides tactical advice*\n';
    footer += '\n*Ask questions: "Marcus, what about that cavalry?" or "ask Cassius about the ford"*';

    return `**💬 Officer Roster:**\n\n${lines.join('\n')}${footer}`;
}

/**
 * Format officers for briefing (compact version)
 */
function formatOfficersForBriefing(officers) {
    if (officers.length === 0) return null;

    const lines = officers.map(o => {
        const badge = o.canAdvise ? '🧠' : '📋';
        return `${badge} ${o.fullTitle} - ${o.battles} battles`;
    });

    return lines.join('\n');
}

module.exports = {
    CULTURAL_OFFICER_NAMES,
    generateOfficerName,
    assignOfficerNames,
    getOfficerForUnit,
    getOfficerRoster,
    findOfficerByName,
    getVeteranLevel,
    formatOfficerRoster,
    formatOfficersForBriefing
};
