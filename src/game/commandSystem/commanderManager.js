// src/game/commandSystem/commanderManager.js
// Manager for battle commander entities and their attachment/detachment mechanics

const { models } = require('../../database/setup');

/**
 * Create battle commander for a player at battle start
 * @param {string} battleId - Battle ID
 * @param {string} playerId - Player Discord ID
 * @param {string} culture - Player's culture
 * @param {string} eliteUnitId - ID of elite unit to attach to
 * @param {string} position - Starting position
 * @returns {Object} Created battle commander
 */
async function createBattleCommander(battleId, playerId, culture, eliteUnitId, position) {
    try {
        const commander = await models.BattleCommander.create({
            battleId,
            playerId,
            culture,
            attachedToUnitId: eliteUnitId,
            position,
            status: 'active',
            isAttached: true
        });
        
        console.log(`✅ Created battle commander for ${culture} player at ${position}`);
        return commander;
    } catch (error) {
        console.error('Error creating battle commander:', error);
        throw error;
    }
}

/**
 * Update commander position when attached unit moves
 * @param {string} battleId - Battle ID
 * @param {string} playerId - Player ID
 * @param {string} unitId - Unit that moved
 * @param {string} newPosition - New position
 * @returns {Object|null} Updated commander or null if not attached to this unit
 */
async function updateCommanderPosition(battleId, playerId, unitId, newPosition) {
    try {
        const commander = await models.BattleCommander.findOne({
            where: {
                battleId,
                playerId,
                attachedToUnitId: unitId,
                isAttached: true
            }
        });
        
        if (commander) {
            await commander.updatePosition(newPosition);
            console.log(`📍 Commander moved with ${unitId} to ${newPosition}`);
            return commander;
        }
        
        return null;
    } catch (error) {
        console.error('Error updating commander position:', error);
        throw error;
    }
}

/**
 * Check for capture risk when unit takes casualties
 * @param {string} battleId - Battle ID
 * @param {string} playerId - Player ID
 * @param {string} unitId - Unit that took casualties
 * @param {number} currentStrength - Unit's current strength
 * @param {number} maxStrength - Unit's maximum strength
 * @returns {Object|null} Commander if at risk, null otherwise
 */
async function checkCommanderCaptureRisk(battleId, playerId, unitId, currentStrength, maxStrength) {
    try {
        const commander = await models.BattleCommander.findOne({
            where: {
                battleId,
                playerId,
                attachedToUnitId: unitId,
                isAttached: true,
                status: 'active'
            }
        });
        
        if (commander) {
            await commander.checkCaptureRisk(currentStrength, maxStrength);
            
            if (commander.status === 'at_risk') {
                console.log(`⚠️ Commander at risk - ${unitId} at ${Math.round((currentStrength/maxStrength)*100)}% strength`);
                return commander;
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error checking commander capture risk:', error);
        throw error;
    }
}

// Detach/reattach functions removed - commander is POV-only and must always be attached

/**
 * Resolve commander capture with player's choice
 * @param {string} battleId - Battle ID
 * @param {string} playerId - Player ID
 * @param {string} choice - 'escape', 'die', or 'surrender'
 * @returns {Object} Commander with resolved status
 */
async function resolveCommanderCapture(battleId, playerId, choice) {
    try {
        const commander = await models.BattleCommander.findOne({
            where: {
                battleId,
                playerId,
                status: 'at_risk'
            }
        });
        
        if (!commander) {
            throw new Error('No commander at risk found');
        }
        
        await commander.resolveCapture(choice);
        console.log(`⚖️ Commander fate resolved: ${choice} -> ${commander.status}`);
        return commander;
    } catch (error) {
        console.error('Error resolving commander capture:', error);
        throw error;
    }
}

/**
 * Get commander status for a battle
 * @param {string} battleId - Battle ID
 * @param {string} playerId - Player ID
 * @returns {Object|null} Commander status or null if not found
 */
async function getCommanderStatus(battleId, playerId) {
    try {
        const commander = await models.BattleCommander.findOne({
            where: {
                battleId,
                playerId
            }
        });
        
        if (commander) {
            return {
                id: commander.id,
                name: commander.name,
                culture: commander.culture,
                status: commander.status,
                isAttached: commander.isAttached,
                attachedToUnitId: commander.attachedToUnitId,
                position: commander.position,
                canReattach: commander.canReattach,
                description: commander.getStatusDescription()
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error getting commander status:', error);
        throw error;
    }
}

/**
 * Get all commanders for a battle (both players)
 * @param {string} battleId - Battle ID
 * @returns {Array} Array of commander statuses
 */
async function getAllCommandersInBattle(battleId) {
    try {
        const commanders = await models.BattleCommander.findAll({
            where: { battleId },
            include: [{
                model: models.Commander,
                as: 'player',
                attributes: ['username', 'culture']
            }]
        });
        
        return commanders.map(cmd => ({
            playerId: cmd.playerId,
            playerName: cmd.player.username,
            name: cmd.name,
            culture: cmd.culture,
            status: cmd.status,
            isAttached: cmd.isAttached,
            attachedToUnitId: cmd.attachedToUnitId,
            position: cmd.position,
            canReattach: cmd.canReattach,
            description: cmd.getStatusDescription()
        }));
    } catch (error) {
        console.error('Error getting all commanders:', error);
        throw error;
    }
}

module.exports = {
    createBattleCommander,
    updateCommanderPosition,
    checkCommanderCaptureRisk,
    resolveCommanderCapture,
    getCommanderStatus,
    getAllCommandersInBattle
};
