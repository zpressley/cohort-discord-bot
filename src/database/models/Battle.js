const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Battle = sequelize.define('Battle', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        player1Id: {
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: 'Commanders',
                key: 'discordId'
            }
        },
        player2Id: {
            type: DataTypes.STRING,
            allowNull: true,
            references: {
                model: 'Commanders',
                key: 'discordId'
            }
        },
        // Scenario key (slug), e.g., 'river_crossing', 'bridge_control'
        scenario: {
            type: DataTypes.STRING,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM(
                'waiting_for_players',
                'army_building',
                'in_progress',
                'completed',
                'abandoned'
            ),
            defaultValue: 'waiting_for_players'
        },
        currentTurn: {
            type: DataTypes.INTEGER,
            defaultValue: 1
        },
        maxTurns: {
            type: DataTypes.INTEGER,
            defaultValue: 12
        },
        // Player cultures (for cultural validation)
        player1Culture: {
            type: DataTypes.STRING,
            allowNull: true
        },
        player2Culture: {
            type: DataTypes.STRING,
            allowNull: true
        },
        // Environmental conditions
        weather: {
            type: DataTypes.ENUM(
                'clear',
                'light_rain',
                'heavy_rain',
                'fog',
                'extreme_heat',
                'wind',
                'cold',
                'storm'
            ),
            defaultValue: 'clear'
        },
        terrain: {
            type: DataTypes.JSON,
            defaultValue: {
                primary: 'plains',
                features: [],
                modifiers: {}
            }
        },
        // Battle state
        battleState: {
            type: DataTypes.JSON,
            defaultValue: {
                player1: {
                    army: {},
                    positions: [],
                    supplies: 100,
                    morale: 100
                },
                player2: {
                    army: {},
                    positions: [],
                    supplies: 100,
                    morale: 100
                },
                objectives: {},
                turnEvents: []
            }
        },
        // Victory conditions and results
        victoryConditions: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        winner: {
            type: DataTypes.STRING,
            allowNull: true
        },
        battleResult: {
            type: DataTypes.JSON,
            allowNull: true
        },
        // Discord integration
        channelId: {
            type: DataTypes.STRING,
            allowNull: true
        },
        messageId: {
            type: DataTypes.STRING,
            allowNull: true
        }
    });

    // Associations
    Battle.associate = (models) => {
        Battle.belongsTo(models.Commander, {
            foreignKey: 'player1Id',
            as: 'player1'
        });
        Battle.belongsTo(models.Commander, {
            foreignKey: 'player2Id',
            as: 'player2'
        });
        Battle.hasMany(models.BattleTurn, {
            foreignKey: 'battleId',
            as: 'turns'
        });
        Battle.hasMany(models.BattleCommander, {
            foreignKey: 'battleId',
            as: 'commanders'
        });
    };

    // Instance methods
    Battle.prototype.getOpponent = function(playerId) {
        return playerId === this.player1Id ? this.player2Id : this.player1Id;
    };

    Battle.prototype.advanceTurn = function() {
        this.currentTurn += 1;
        return this.save();
    };

    Battle.prototype.isComplete = function() {
        return this.status === 'completed' || 
               this.currentTurn > this.maxTurns ||
               this.winner !== null;
    };

    Battle.prototype.setWinner = function(playerId, reason = 'victory') {
        this.winner = playerId;
        this.status = 'completed';
        this.battleResult = {
            reason: reason,
            completedOn: new Date(),
            finalTurn: this.currentTurn
        };
        return this.save();
    };

    Battle.prototype.generateWeather = function() {
        const rand = Math.random();
        if (rand < 0.40) this.weather = 'clear';
        else if (rand < 0.75) this.weather = 'light_rain';
        else if (rand < 0.85) this.weather = 'fog';
        else if (rand < 0.93) this.weather = 'extreme_heat';
        else if (rand < 0.97) this.weather = 'wind';
        else if (rand < 0.99) this.weather = 'cold';
        else this.weather = 'storm';
        
        return this.save();
    };

    return Battle;
};