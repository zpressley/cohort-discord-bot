const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const BattleCommander = sequelize.define('BattleCommander', {
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
        playerId: {
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: 'Commanders',
                key: 'discordId'
            }
        },
        // Commander properties
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'Commander'
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
            allowNull: false
        },
        // Current status
        isAttached: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        attachedToUnitId: {
            type: DataTypes.STRING,
            allowNull: true // null when detached
        },
        position: {
            type: DataTypes.STRING,
            allowNull: false // always matches attached unit's position
        },
        // Cultural reattachment rules (obsolete - commander is POV-only)
        canReattach: {
            type: DataTypes.VIRTUAL,
            get() {
                // Always false - commander cannot detach (POV design)
                return false;
            }
        },
        // Battle status
        status: {
            type: DataTypes.ENUM(
                'active',      // Commanding normally (POV with unit)
                'at_risk',     // Elite unit <25% strength
                'captured',    // Captured by enemy
                'escaped',     // Successfully escaped capture
                'killed',      // Died heroically
                'surrendered'  // Surrendered to enemy
            ),
            defaultValue: 'active'
        },
        // Capture mechanics
        captureRoll: {
            type: DataTypes.INTEGER,
            allowNull: true // 1-100, set when at risk
        },
        captureChoice: {
            type: DataTypes.ENUM(
                'escape',     // Attempt escape (50% success)
                'die',        // Fight to death (heroic)
                'surrender'   // Accept capture
            ),
            allowNull: true
        },
        // Leadership bonuses (for future expansion)
        leadershipRadius: {
            type: DataTypes.INTEGER,
            defaultValue: 2 // tiles within which commander provides bonuses
        },
        moraleBonus: {
            type: DataTypes.INTEGER,
            defaultValue: 1 // +1 morale to nearby units
        }
    });

    // Associations
    BattleCommander.associate = (models) => {
        BattleCommander.belongsTo(models.Battle, {
            foreignKey: 'battleId',
            as: 'battle'
        });
        BattleCommander.belongsTo(models.Commander, {
            foreignKey: 'playerId',
            as: 'player'
        });
    };

    // Instance methods
    BattleCommander.prototype.attachToUnit = function(unitId, position) {
        this.attachedToUnitId = unitId;
        this.position = position;
        this.isAttached = true;
        this.status = 'active';
        return this.save();
    };

    // Commander cannot detach - is a POV that must always be with a unit
    BattleCommander.prototype.detachFromUnit = function(newPosition) {
        throw new Error('Commander is a point-of-view and must always be attached to a unit');
    };

    BattleCommander.prototype.checkCaptureRisk = function(unitStrength, unitMaxStrength) {
        const strengthPercent = (unitStrength / unitMaxStrength) * 100;
        
        if (strengthPercent < 25 && this.status === 'active') {
            this.status = 'at_risk';
            this.captureRoll = Math.floor(Math.random() * 100) + 1; // 1-100
            return this.save();
        }
        
        return Promise.resolve(this);
    };

    BattleCommander.prototype.resolveCapture = function(choice) {
        this.captureChoice = choice;
        
        switch (choice) {
            case 'escape':
                const escapeRoll = Math.floor(Math.random() * 100) + 1;
                if (escapeRoll <= 50) { // 50% success
                    this.status = 'escaped';
                    // Note: Commander remains attached - they escaped to nearest unit
                    // The actual unit reassignment should be handled by calling code
                } else {
                    this.status = 'captured';
                }
                break;
                
            case 'die':
                this.status = 'killed';
                break;
                
            case 'surrender':
                this.status = 'surrendered';
                break;
        }
        
        return this.save();
    };

    BattleCommander.prototype.updatePosition = function(newPosition) {
        this.position = newPosition;
        return this.save();
    };

    BattleCommander.prototype.getStatusDescription = function() {
        switch (this.status) {
            case 'active':
                return `With ${this.attachedToUnitId} at ${this.position}`;
            case 'at_risk':
                return `At risk of capture (unit <25% strength)`;
            case 'captured':
                return `Captured by enemy forces`;
            case 'escaped':
                return `Successfully escaped capture`;
            case 'killed':
                return `Died fighting heroically`;
            case 'surrendered':
                return `Surrendered to enemy`;
            default:
                return `Status unknown`;
        }
    };

    return BattleCommander;
};