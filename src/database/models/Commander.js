const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Commander = sequelize.define('Commander', {
        discordId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            primaryKey: true
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false
        },
        culture: {
            type: DataTypes.ENUM(
                'Roman Republic',
                'Macedonian Kingdoms',
                'Celtic Tribes', 
                'Han Dynasty',
                'Sarmatian Confederations',
                'Mauryan Empire',
                'Spartan City-State',
                'Berber Confederations'
            ),
            allowNull: true
        },
        rank: {
            type: DataTypes.ENUM(
                'Recruit',      // 0-2 battles
                'Veteran',      // 3-9 battles  
                'Elite',        // 10-24 battles
                'Legendary'     // 25+ battles
            ),
            defaultValue: 'Recruit'
        },
        battlesWon: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        battlesLost: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        totalBattles: {
            type: DataTypes.VIRTUAL,
            get() {
                return this.battlesWon + this.battlesLost;
            }
        },
        reputation: {
            type: DataTypes.INTEGER,
            defaultValue: 100, // Neutral reputation
            validate: {
                min: 0,
                max: 200
            }
        },
        honorPoints: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        preferredTactics: {
            type: DataTypes.JSON,
            defaultValue: {
                aggressive: 0,    // -5 to +5
                defensive: 0,     // -5 to +5  
                mobile: 0,        // -5 to +5
                formation: 0      // -5 to +5
            }
        },
        // Track cultural learning from defeated enemies
        culturalKnowledge: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        lastActive: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    });

    // Associations
    Commander.associate = (models) => {
        Commander.hasMany(models.EliteUnit, {
            foreignKey: 'commanderId',
            as: 'eliteUnits'
        });
        Commander.hasMany(models.Battle, {
            foreignKey: 'player1Id',
            as: 'battlesAsPlayer1'
        });
        Commander.hasMany(models.Battle, {
            foreignKey: 'player2Id', 
            as: 'battlesAsPlayer2'
        });
    };

    // Instance methods
    Commander.prototype.updateRank = function() {
        const total = this.totalBattles;
        if (total >= 25) {
            this.rank = 'Legendary';
        } else if (total >= 10) {
            this.rank = 'Elite';
        } else if (total >= 3) {
            this.rank = 'Veteran';
        } else {
            this.rank = 'Recruit';
        }
        return this.save();
    };

    Commander.prototype.addCulturalKnowledge = function(culture, knowledge) {
        if (!this.culturalKnowledge[culture]) {
            this.culturalKnowledge[culture] = [];
        }
        if (!this.culturalKnowledge[culture].includes(knowledge)) {
            this.culturalKnowledge[culture].push(knowledge);
            this.changed('culturalKnowledge', true);
        }
        return this.save();
    };

    Commander.prototype.getWinRate = function() {
        if (this.totalBattles === 0) return 0;
        return Math.round((this.battlesWon / this.totalBattles) * 100);
    };

    return Commander;
};