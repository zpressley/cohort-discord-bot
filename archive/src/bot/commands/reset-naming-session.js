// src/bot/commands/reset-naming-session.js
// Admin/debug command to clear a player's commander naming session so they can
// restart /create-profile from scratch. This does NOT remove any locked-in
// names from UsedNames; it only clears the in-progress attempts stored on
// Commander.preferences.

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { models } = require('../../database/setup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-naming-session')
    .setDescription('Admin: reset a player\'s commander naming attempts')
    .addUserOption(option =>
      option
        .setName('player')
        .setDescription('The player whose naming session to reset')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      // Basic permission gate: require Manage Guild or equivalent. This is in
      // addition to the default member permissions on the command.
      if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: 'You do not have permission to use this command.',
          ephemeral: true
        });
        return;
      }

      const targetUser = interaction.options.getUser('player') || interaction.user;

      const commander = await models.Commander.findByPk(targetUser.id);
      if (!commander) {
        await interaction.reply({
          content: `No Commander record found for ${targetUser.username}. Nothing to reset.`,
          ephemeral: true
        });
        return;
      }

      const prefs = commander.preferences || {};
      if (!prefs.namingSession) {
        await interaction.reply({
          content: `No in-progress naming session found for ${targetUser.username}.`,
          ephemeral: true
        });
        return;
      }

      delete prefs.namingSession;
      commander.preferences = prefs;
      await commander.save();

      await interaction.reply({
        content: `Cleared naming session for ${targetUser.username}. They can now run /create-profile from the beginning.`,
        ephemeral: true
      });
    } catch (err) {
      console.error('reset-naming-session error:', err);
      if (!interaction.replied) {
        await interaction.reply({
          content: 'Error resetting naming session. Check logs for details.',
          ephemeral: true
        });
      }
    }
  }
};
