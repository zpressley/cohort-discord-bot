// src/bot/interactionRouter.js (current code-015)
const { Events } = require('discord.js');

async function handle(interaction, client) {
  try {
    if (interaction.isCommand && interaction.isCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select-culture') {
        const { handleArmyBuilderInteractions } = require('./armyInteractionHandler');
        return await handleArmyBuilderInteractions(interaction);
      }
      if (interaction.customId === 'scenario-selection') {
        const { handleGameInteractions } = require('./gameInteractionHandler');
        return await handleGameInteractions(interaction);
      }
      const { handleArmyBuilderInteractions } = require('./armyInteractionHandler');
      return await handleArmyBuilderInteractions(interaction);
    }

    if (interaction.isButton && interaction.isButton()) {
      if (interaction.customId.startsWith('lobby-')) {
        const { handleLobbyInteractions } = require('./lobbyInteractionHandler');
        return await handleLobbyInteractions(interaction);
      }
      if (interaction.customId === 'select-culture') {
        const { handleArmyInteractions } = require('./armyInteractionHandler');
        return await handleArmyInteractions(interaction);
      }
      if (interaction.customId.startsWith('join-battle-') ||
          interaction.customId.startsWith('ready-for-battle-') ||
          interaction.customId.startsWith('abandon-battle-') ||
          interaction.customId === 'create-bridge-control' ||
          interaction.customId === 'create-hill-fort' ||
          interaction.customId === 'create-forest-ambush' ||
          interaction.customId === 'create-river-crossing' ||
          interaction.customId === 'create-desert-oasis' ||
          interaction.customId.startsWith('quick-')) {
        const { handleGameInteractions } = require('./gameInteractionHandler');
        return await handleGameInteractions(interaction);
      }
      if (interaction.customId === 'back-to-lobby') {
        const { showMainLobby } = require('./commands/lobby');
        const { models } = require('../database/setup');
        const commander = await models.Commander.findByPk(interaction.user.id);
        const isNewPlayer = !commander || !commander.culture;
        return await showMainLobby(interaction, commander, isNewPlayer);
      }
      const { handleArmyBuilderInteractions } = require('./armyInteractionHandler');
      return await handleArmyBuilderInteractions(interaction);
    }
  } catch (error) {
    console.error('Interaction router error:', error);
    const errorMessage = 'There was an error processing this interaction!';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}

module.exports = { handle };