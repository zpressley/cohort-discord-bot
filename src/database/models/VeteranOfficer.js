const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const VeteranOfficer = sequelize.define('VeteranOfficer', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        eliteUnitId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'EliteUnits',
                key: 'id'
            }
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        rank: {
            type: DataTypes.STRING,
            allowNull: false // e.g., "Centurion", "War Chief", "Champion"
        },
        battlesExperience: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        isAlive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        // Personality traits
        personality: {
            type: DataTypes.JSON,
            defaultValue: {
                aggressive: 0,    // -5 to +5
                cautious: 0,      // -5 to +5
                tactical: 0,      // -5 to +5
                inspirational: 0  // -5 to +5
            }
        },
        // Individual knowledge - dies with officer
        tacticalKnowledge: {
            type: DataTypes.JSON,
            defaultValue: {
                enemyCultures: {},      // Knowledge about enemy formations
                terrainExperience: {},  // Experience in different terrain
                weatherAdaptation: {},  // Weather combat experience
                battleMemories: []      // Specific battle experiences
            }
        },
        // Equipment and personal items
        personalEquipment: {
            type: DataTypes.JSON,
            defaultValue: {
                weapon: null,
                armor: null,
                special: []
            }
        },
        // Officer's specialization within unit
        specialization: {
            type: DataTypes.ENUM(
                'Combat Leadership',     // Tactical bonuses in melee
                'Ranged Coordination',   // Archery/crossbow coordination
                'Formation Master',      // Formation bonuses
                'Scout Intelligence',    // Terrain and enemy intelligence
                'Siege Specialist',      // Engineering and siege warfare
                'Cavalry Coordination',  // Mounted unit coordination
                'Medical Support',       // Unit healing and morale
                'Cultural Liaison'       // Communication with allied units
            ),
            allowNull: true
        },
        // Relationships with other officers
        relationships: {
            type: DataTypes.JSON,
            defaultValue: {}  // Officer ID -> relationship strength (-5 to +5)
        },
        // Death details if killed
        deathBattle: {
            type: DataTypes.STRING,
            allowNull: true
        },
        deathCause: {
            type: DataTypes.STRING,
            allowNull: true
        },
        dateOfDeath: {
            type: DataTypes.DATE,
            allowNull: true
        }
    });

    // Associations
    VeteranOfficer.associate = (models) => {
        VeteranOfficer.belongsTo(models.EliteUnit, {
            foreignKey: 'eliteUnitId',
            as: 'eliteUnit'
        });
    };

    // Instance methods
    VeteranOfficer.prototype.addBattleExperience = function(battleType, enemies, terrain, weather, outcome) {
        this.battlesExperience += 1;
        
        // Add tactical knowledge
        if (!this.tacticalKnowledge.enemyCultures[enemies]) {
            this.tacticalKnowledge.enemyCultures[enemies] = 0;
        }
        this.tacticalKnowledge.enemyCultures[enemies] += 1;
        
        if (!this.tacticalKnowledge.terrainExperience[terrain]) {
            this.tacticalKnowledge.terrainExperience[terrain] = 0;
        }
        this.tacticalKnowledge.terrainExperience[terrain] += 1;
        
        if (!this.tacticalKnowledge.weatherAdaptation[weather]) {
            this.tacticalKnowledge.weatherAdaptation[weather] = 0;
        }
        this.tacticalKnowledge.weatherAdaptation[weather] += 1;
        
        // Add battle memory
        this.tacticalKnowledge.battleMemories.push({
            type: battleType,
            enemies: enemies,
            terrain: terrain,
            weather: weather,
            outcome: outcome,
            lessons: this.generateBattleLesson(enemies, terrain, weather, outcome)
        });
        
        // Keep only last 10 battle memories
        if (this.tacticalKnowledge.battleMemories.length > 10) {
            this.tacticalKnowledge.battleMemories.shift();
        }
        
        this.changed('tacticalKnowledge', true);
        return this.save();
    };

    VeteranOfficer.prototype.generateBattleLesson = function(enemies, terrain, weather, outcome) {
        // Generate contextual battle wisdom
        const lessons = [];
        
        if (terrain === 'forest' && enemies === 'Roman Republic') {
            lessons.push("Romans struggle in dense forest - their formations break");
        }
        if (weather === 'rain' && enemies.includes('archer')) {
            lessons.push("Rain makes composite bows useless");
        }
        if (outcome === 'victory' && terrain === 'hills') {
            lessons.push("High ground gives decisive advantage");
        }
        
        return lessons.length > 0 ? lessons[0] : "Battle experience gained";
    };

    VeteranOfficer.prototype.getKnowledgeBonus = function(enemyCulture, terrain, weather) {
        let bonus = 0;
        
        // Enemy knowledge bonus
        const enemyExp = this.tacticalKnowledge.enemyCultures[enemyCulture] || 0;
        bonus += Math.min(enemyExp, 3); // Max +3 for enemy knowledge
        
        // Terrain bonus
        const terrainExp = this.tacticalKnowledge.terrainExperience[terrain] || 0;
        bonus += Math.min(terrainExp, 2); // Max +2 for terrain
        
        // Weather bonus
        const weatherExp = this.tacticalKnowledge.weatherAdaptation[weather] || 0;
        bonus += Math.min(weatherExp, 1); // Max +1 for weather
        
        return bonus;
    };

    VeteranOfficer.prototype.killInBattle = function(battleName, cause) {
        this.isAlive = false;
        this.deathBattle = battleName;
        this.deathCause = cause;
        this.dateOfDeath = new Date();
        return this.save();
    };

    VeteranOfficer.prototype.getExperienceLevel = function() {
        const exp = this.battlesExperience;
        if (exp >= 11) return 'Legendary';
        if (exp >= 6) return 'Elite Veteran';
        if (exp >= 3) return 'Veteran';
        if (exp >= 1) return 'Seasoned';
        return 'Recruit';
    };

    return VeteranOfficer;
};