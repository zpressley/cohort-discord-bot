const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const EliteUnit = sequelize.define('EliteUnit', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        commanderId: {
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: 'Commanders',
                key: 'discordId'
            }
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        culture: {
            type: DataTypes.ENUM(
                'Roman Republic',
                'Germanic Tribes', 
                'Celtic Gauls',
                'Han Dynasty',
                'Scythian Confederation',
                'Macedonian Kingdoms',
                'Spartan City-State',
                'Carthaginian Empire',
                'Kingdom of Kush',
                'Berber Confederations',
                'Sarmatian Confederations',
                'Mauryan Empire',
                'Silla Kingdom',
                'Achaemenid Persian',
                'Parthian Empire',
                'Thracian Odrysians',
                'Samnite Federation',
                'Tibetan Kingdoms',
                'Pre-Genghis Mongolia',
                'Bactrian Greeks',
                'Yayoi Japan'
            ),
            allowNull: false
        },
        size: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 40,
                max: 100
            }
        },
        currentStrength: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        battlesParticipated: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        // Veteran experience calculation
        totalExperience: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        averageExperience: {
            type: DataTypes.VIRTUAL,
            get() {
                if (this.currentStrength === 0) return 0;
                return Math.round((this.totalExperience / this.currentStrength) * 100) / 100;
            }
        },
        veteranLevel: {
            type: DataTypes.ENUM(
                'Recruit',      // 0 battles average
                'Seasoned',     // 1-2 battles average
                'Veteran',      // 3-5 battles average
                'Elite Veteran',// 6-10 battles average
                'Legendary'     // 11+ battles average
            ),
            defaultValue: 'Recruit'
        },
        equipment: {
            type: DataTypes.JSON,
            defaultValue: {
                weapons: [],
                armor: [],
                shields: [],
                special: []
            }
        },
        // Cultural bonuses and restrictions
        culturalPerks: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        adaptedKnowledge: {
            type: DataTypes.JSON,
            defaultValue: {} // Knowledge gained from defeated enemies
        },
        // Current status
        morale: {
            type: DataTypes.INTEGER,
            defaultValue: 100,
            validate: {
                min: 0,
                max: 150
            }
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    });

    // Associations
    EliteUnit.associate = (models) => {
        EliteUnit.belongsTo(models.Commander, {
            foreignKey: 'commanderId',
            as: 'commander'
        });
        EliteUnit.hasMany(models.VeteranOfficer, {
            foreignKey: 'eliteUnitId',
            as: 'officers'
        });
    };

    // Instance methods
    EliteUnit.prototype.calculateVeteranLevel = function() {
        const avg = this.averageExperience;
        if (avg >= 11) {
            this.veteranLevel = 'Legendary';
        } else if (avg >= 6) {
            this.veteranLevel = 'Elite Veteran';
        } else if (avg >= 3) {
            this.veteranLevel = 'Veteran';
        } else if (avg >= 1) {
            this.veteranLevel = 'Seasoned';
        } else {
            this.veteranLevel = 'Recruit';
        }
        return this.save();
    };

    EliteUnit.prototype.addBattleExperience = function(survivors = null) {
        // If survivors not specified, assume no casualties
        const actualSurvivors = survivors || this.currentStrength;
        
        // Add 1 experience to surviving veterans
        this.totalExperience += actualSurvivors;
        this.battlesParticipated += 1;
        
        // If casualties occurred, adjust total experience
        if (survivors && survivors < this.currentStrength) {
            // Calculate experience lost with casualties
            const casualties = this.currentStrength - survivors;
            const avgExp = this.averageExperience;
            const experienceLost = Math.round(casualties * avgExp);
            
            this.totalExperience -= experienceLost;
            this.currentStrength = survivors;
        }
        
        return this.calculateVeteranLevel();
    };

    EliteUnit.prototype.addRecruits = function(newRecruits) {
        // Add recruits with 0 experience
        this.currentStrength += newRecruits;
        // Total experience stays same, so average drops
        return this.calculateVeteranLevel();
    };

    EliteUnit.prototype.getDeathProbability = function() {
        const avg = this.averageExperience;
        if (avg >= 11) return 0.06;      // Legendary: 6%
        if (avg >= 6) return 0.08;       // Elite: 8%
        if (avg >= 3) return 0.10;       // Veteran: 10%
        if (avg >= 1) return 0.12;       // Seasoned: 12%
        return 0.15;                     // Recruit: 15%
    };

    return EliteUnit;
};