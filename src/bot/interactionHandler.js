// Add this after the existing InteractionCreate handler
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isCommand()) {
        // ... existing command handler code stays here
    } else if (interaction.isStringSelectMenu()) {
        const { handleSelectMenu } = require('./bot/interactionHandler');
        await handleSelectMenu(interaction);
    } else if (interaction.isButton()) {
        const { handleButton } = require('./bot/interactionHandler');
        await handleButton(interaction);
    }
});