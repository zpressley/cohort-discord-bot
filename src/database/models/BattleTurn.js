const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const BattleTurn = sequelize.define('BattleTurn', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        battleId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'Battles',
                key: 'id'
            }
        },
        turnNumber: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // Player commands for this turn
        player1Command: {
            type: DataTypes.JSON,
            allowNull: true
        },
        player2Command: {
            type: DataTypes.JSON,
            allowNull: true
        },
        // AI analysis and resolution
        aiAnalysis: {
            type: DataTypes.JSON,
            allowNull: true
        },
        combatResults: {
            type: DataTypes.JSON,
            allowNull: true
        },
        // Turn narrative and events
        turnNarrative: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        majorEvents: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        // Unit status after this turn
        unitStatusAfter: {
            type: DataTypes.JSON,
            allowNull: true
        },
        // Officer status tracking
        officerEvents: {
            type: DataTypes.JSON,
            defaultValue: {
                promotions: [],
                casualties: [],
                heroicDeeds: []
            }
        },
        // Environmental effects this turn
        environmentalEffects: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        // Turn completion status
        isResolved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        resolvedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    });

    // Associations
    BattleTurn.associate = (models) => {
        BattleTurn.belongsTo(models.Battle, {
            foreignKey: 'battleId',
            as: 'battle'
        });
    };

    // Instance methods
    BattleTurn.prototype.addPlayerCommand = function(playerId, command) {
        if (playerId === this.battle.player1Id) {
            this.player1Command = command;
        } else if (playerId === this.battle.player2Id) {
            this.player2Command = command;
        }
        return this.save();
    };

    BattleTurn.prototype.bothPlayersReady = function() {
        return this.player1Command !== null && this.player2Command !== null;
    };

    BattleTurn.prototype.resolveTurn = function(aiAnalysis, combatResults, narrative) {
        this.aiAnalysis = aiAnalysis;
        this.combatResults = combatResults;
        this.turnNarrative = narrative;
        this.isResolved = true;
        this.resolvedAt = new Date();
        return this.save();
    };

    BattleTurn.prototype.addOfficerEvent = function(type, officerId, details) {
        if (!this.officerEvents[type]) {
            this.officerEvents[type] = [];
        }
        this.officerEvents[type].push({
            officerId,
            details,
            timestamp: new Date()
        });
        this.changed('officerEvents', true);
        return this.save();
    };

    return BattleTurn;
};