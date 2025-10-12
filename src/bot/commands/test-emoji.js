// src/bot/commands/test-emoji.js
// Test if custom Discord emojis work in DM messages

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-emoji')
        .setDescription('Test emoji rendering in DMs'),
        
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            const user = await interaction.client.users.fetch(interaction.user.id);
            
            // Test 1: Plain text emojis
            const plainText = 
`**EMOJI TEST - Plain Text:**
🔵 Blue circle
🔴 Red circle
🔶 Orange diamond
🔷 Blue diamond
⚔️ Swords
⭐ Star`;

            await user.send(plainText);
            
            // Test 2: Emojis in code block (CRITICAL TEST)
            const codeBlock = 
`**EMOJI IN CODE BLOCK:**
\`\`\`
    A B C D E F G
 5  . . . T ~ ~ .
 6  . 🔵 🔴 . ~ 🔶 .
 7  . ⭐ 🛡️ # = 🏹 .
\`\`\``;

            await user.send(codeBlock);
            
            // Test 3: Sample tactical map
            const tacticalMap =
`**TACTICAL MAP:**
\`\`\`
      A  B  C  D  E
  5   .  .  🔴  .  .
  6   .  🔵  .  🔶  .
  7   .  ⭐  #  =  .
\`\`\`

Legend:
🔵 Your forces
🔴 Enemy forces
⭐ Commander`;

            await user.send(tacticalMap);
            
            await interaction.editReply({ 
                content: '✅ Emoji tests sent to your DMs! Check if they render in code blocks.',
                ephemeral: true 
            });
            
        } catch (error) {
            console.error('Emoji test error:', error);
            await interaction.editReply({ 
                content: '❌ Error: ' + error.message,
                ephemeral: true 
            });
        }
    }
};