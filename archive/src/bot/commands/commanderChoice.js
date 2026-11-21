// src/bot/commands/commanderChoice.js
// Handle commander capture choice buttons

const { SlashCommandBuilder } = require('discord.js');

// Provide dummy slash command shape so command loader is satisfied
const data = new SlashCommandBuilder()
  .setName('commander-choice')
  .setDescription('Internal handler for commander capture decisions (not for user use)');

async function execute(interaction) {
  try {
    await interaction.reply({ content: 'This is an internal command. Use the buttons provided in battle DMs.', ephemeral: true });
  } catch {}
}

async function handle(interaction) {
  try {
    const id = interaction.customId; // commander-choice-<choice>-<battleId>-<side>
    const parts = id.split('-');
    const choice = parts[2];
    const battleId = parts[3];
    const side = parts[4]; // 'player1' | 'player2'

    const { models } = require('../../database/setup');
    const battle = await models.Battle.findByPk(battleId);
    if (!battle) {
      return await interaction.update({ content: 'Battle not found.', components: [] });
    }
    const state = battle.battleState || {};
    if (!state[side] || !state[side].commander) {
      return await interaction.update({ content: 'Commander not found.', components: [] });
    }

    // Update battleState commander status
    if (choice === 'escape') state[side].commander.status = 'escaped';
    else if (choice === 'die') state[side].commander.status = 'killed';
    else if (choice === 'surrender') state[side].commander.status = 'surrendered';

    battle.battleState = state;
    await battle.save();
    await interaction.update({ content: `Commander decision recorded: ${choice}.`, components: [] });
  } catch (e) {
    console.error('Commander choice error:', e);
    try { await interaction.update({ content: 'Error handling commander choice.', components: [] }); } catch {}
  }
}

module.exports = { data, execute, handle };
