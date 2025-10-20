// src/bot/commands/help.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('How to play, examples, and tips'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x8B4513)
      .setTitle('Cohort Help')
      .setDescription('Natural language orders are parsed and validated before execution.')
      .addFields(
        { name: 'Basics', value: 'DM the bot your orders during a battle. Example: "infantry to the ford, archers cover".' },
        { name: 'Simulation', value: 'Prefix with `simulate:` to dry-run without committing. Example: `simulate: cavalry flank east`.' },
        { name: 'Examples', value: '• "infantry advance to F11"\n• "form testudo" (Romans only)\n• "archers support infantry"' },
        { name: 'Cultural Rules', value: 'Some formations/tactics are restricted by culture (e.g., Celts cannot form testudo). You will see a clear message if restricted.' },
        { name: 'Validation', value: 'Invalid orders return field-level errors and suggestions. Use simpler phrasing or specify unit/position.' }
      )
      .setFooter({ text: 'Use /lobby to open the main panel' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
