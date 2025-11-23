// src/bot/commands/create-profile.js
// Lightweight "create-profile" command that drives the commanderName profile
// flow via DMs. This implementation is deliberately conservative: it does not
// mutate the live Commander model or game state yet. It just helps a player
// pick an archetype/philosophy and receive a generated commander name.

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { ARCHETYPE_DATA, beginProfileFlow, continueProfileFlow } = require('../../commanderName/profile/profileFlow');
const { models } = require('../../database/setup');
const proceduralGenerators = require('../../commanderName/nameGeneration/name_generators');
const kingdomsRoles = require('../../commanderName/roles/kingdomsRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create-profile')
    .setDescription('Begin the Cohort commander naming flow in DMs'),

  async execute(interaction) {
    try {
      // Kick off DM-based flow
      const user = interaction.user;

      // If this player already has a locked-in commander name, do not allow
      // rerunning the profile flow; gently remind them of their identity.
      const existingName = await models.UsedNames.findOne({
        where: { usedBy: user.id, retired: false },
        order: [['usedAt', 'DESC']]
      });

      if (existingName) {
        await interaction.reply({
          content: `${existingName.fullName}, the gods have named you already.`,
          ephemeral: true
        });
        return;
      }

      // Fetch or create Commander so we can persist naming attempts across
      // multiple /create-profile runs.
      let commander = await models.Commander.findByPk(user.id);
      if (!commander) {
        commander = await models.Commander.create({
          discordId: user.id,
          username: user.username
        });
      }

      const prefs = commander.preferences || {};
      const namingSession = prefs.namingSession || { attempts: 0, candidates: [] };

      const dm = await user.createDM();

      await interaction.reply({
        content: '📜 Opening your commander naming council in DMs…',
        ephemeral: true
      });

      // Track per-user state in memory for this command invocation.
      const flowState = {
        step: 'choose_archetype',
        userId: user.id,
        archetype: null,
        philosophy: null,
        attempts: namingSession.attempts || 0,
        maxAttempts: 7,
        candidates: Array.isArray(namingSession.candidates) ? namingSession.candidates.slice(0, 7) : [], // { name, archetype, philosophy }
        selectedIndex: null,
        commander
      };

      // If the player has already reached the attempt limit in a previous
      // session, immediately show the final selection with their saved
      // candidates instead of restarting from scratch.
      if (flowState.attempts >= flowState.maxAttempts && flowState.candidates.length > 0) {
        const { finalEmbed, finalRows } = buildFinalSelectionMessage(flowState);
        await dm.send({ embeds: [finalEmbed], components: finalRows });
        flowState.step = 'select_final';
      } else {
        // Step 1: choose archetype
        const state = beginProfileFlow();
        const { archetypeEmbed, archetypeRows } = buildArchetypeSelectionMessage();
        await dm.send({ embeds: [archetypeEmbed], components: archetypeRows });
      }

      const filter = (btn) => btn.user.id === user.id && btn.customId.startsWith('profile-');
      const collector = dm.createMessageComponentCollector({ filter, time: 5 * 60 * 1000 });

      collector.on('collect', async (btn) => {
        try {
          if (flowState.step === 'choose_archetype' && btn.customId.startsWith('profile-arch-')) {
            const archetype = btn.customId.replace('profile-arch-', '');
            const nextState = await continueProfileFlow(flowState, archetype);
            Object.assign(flowState, nextState); // update local state (sets archetype)
            flowState.archetype = archetype;

            // Ask for philosophy
            const phEmbed = new EmbedBuilder()
              .setColor(0x8B4513)
              .setTitle('⚖️ Fight for glory or survival?')
              .setDescription('This shades your commander identity: bright glory or ruthless survival.');

            const phRow = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('profile-ph-glory')
                  .setLabel('Glory')
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId('profile-ph-survival')
                  .setLabel('Survival')
                  .setStyle(ButtonStyle.Danger)
              );

            await btn.update({ embeds: [phEmbed], components: [phRow] });
            flowState.step = 'choose_philosophy';
            return;
          }

          if (flowState.step === 'choose_philosophy' && btn.customId.startsWith('profile-ph-')) {
            const philosophy = btn.customId === 'profile-ph-glory' ? 'glory' : 'survival';
            const nextState = await continueProfileFlow(flowState, philosophy);
            Object.assign(flowState, nextState);
            flowState.philosophy = philosophy;

            // Start or continue the 7-attempt candidate flow
            await presentNextCandidate(btn, flowState);
            return;
          }

          // Single-candidate confirm stage (attempts 1-6)
          if (flowState.step === 'confirm_single') {
            if (btn.customId === 'profile-name-accept') {
              // Player wants to proceed to lock-in for the latest candidate
              flowState.selectedIndex = flowState.candidates.length - 1;
              await showLockInMenu(btn, flowState);
              return;
            }
            if (btn.customId === 'profile-name-retry') {
              // If we've already used all attempts, jump to final selection.
              if (flowState.attempts >= flowState.maxAttempts) {
                await showFinalSelection(btn, flowState);
                return;
              }
              // Otherwise, send the player back to archetype/philosophy
              // selection for the next attempt. We keep the existing
              // candidates and attempt count so total tries are still capped
              // at 7.
              const { archetypeEmbed, archetypeRows } = buildArchetypeSelectionMessage();
              flowState.step = 'choose_archetype';
              flowState.archetype = null;
              flowState.philosophy = null;
              await btn.update({ embeds: [archetypeEmbed], components: archetypeRows });
              return;
            }
          }

          // Final 7-name selection stage
          if (flowState.step === 'select_final' && btn.customId.startsWith('profile-final-')) {
            const idx = parseInt(btn.customId.replace('profile-final-', ''), 10);
            if (!Number.isNaN(idx) && idx >= 0 && idx < flowState.candidates.length) {
              flowState.selectedIndex = idx;
              await showLockInMenu(btn, flowState);
              return;
            }
          }

          // Lock-in confirmation stage
          if (flowState.step === 'lock_in') {
            if (btn.customId === 'profile-lock-confirm') {
              const chosen = flowState.candidates[flowState.selectedIndex];
              try {
                // Reserve the chosen name in UsedNames; if it is somehow taken
                // concurrently, this will throw and we surface an error.
                await proceduralGenerators.lockInSpecificName(
                  chosen.archetype,
                  chosen.philosophy,
                  flowState.userId,
                  chosen.name
                );

                // Optionally, persist archetype/philosophy/name on Commander for later use.
                const commander = flowState.commander;
                if (commander) {
                  const prefs = commander.preferences || {};
                  prefs.commanderProfile = {
                    name: chosen.name,
                    archetype: chosen.archetype,
                    philosophy: chosen.philosophy
                  };
                  commander.preferences = prefs;
                  await commander.save();
                }

                // Assign or shift the player's archetype role in the guild
                await assignArchetypeRole(interaction.guild, flowState.userId, chosen.archetype, btn.client);

                collector.stop('complete');
                await btn.update({
                  embeds: [],
                  components: [],
                  content: `✅ Locked in: **${chosen.name}**. This is now your commander name until death.`
                });
              } catch (lockErr) {
                console.warn('Lock-in failed:', lockErr.message);
                await btn.update({
                  embeds: [],
                  components: [],
                  content: '⚠️ That name was taken while you were choosing. Please run `/create-profile` again to receive new candidates.'
                });
                collector.stop('error');
              }
              return;
            }
            if (btn.customId === 'profile-lock-back') {
              // If the player still has remaining attempts, let them return to
              // the single-candidate confirm view (with Retry). Once attempts
              // are exhausted, send them to the final selection list.
              if (flowState.attempts < flowState.maxAttempts) {
                const latest = flowState.candidates[flowState.selectedIndex];
                await showSingleCandidateConfirm(btn, flowState, latest.name);
              } else {
                await showFinalSelection(btn, flowState);
              }
              return;
            }
          }
        } catch (err) {
          console.warn('create-profile flow error:', err.message);
          // Avoid double-acknowledging the interaction. If this button
          // interaction has already been updated/replied, use followUp.
          try {
            if (btn.replied || btn.deferred) {
              await btn.followUp({ content: 'Something went wrong processing your choice. Please run /create-profile again.' });
            } else {
              await btn.reply({ content: 'Something went wrong processing your choice. Please run /create-profile again.' });
            }
          } catch (notifyErr) {
            console.warn('create-profile error notification failed:', notifyErr.message);
          }
          collector.stop('error');
        }
      });

      collector.on('end', (collected, reason) => {
        if (reason !== 'complete') {
          dm.send('⏳ Commander naming session ended. You can restart anytime with `/create-profile`.').catch(() => {});
        }
      });
    } catch (err) {
      console.error('create-profile command error:', err);
      if (!interaction.replied) {
        await interaction.reply({
          content: 'Unable to start commander naming flow (DMs may be disabled). Please enable DMs and try again.',
          ephemeral: true
        });
      }
    }
  }
};

// ========================= Helper functions =========================

function buildArchetypeSelectionMessage() {
  const archetypeEmbed = new EmbedBuilder()
    .setColor(0x8B4513)
    .setTitle('🏺 Choose your commander archetype')
    .setDescription('What kind of leader are you? This shapes your commander identity and name.');

  for (const [key, meta] of Object.entries(ARCHETYPE_DATA)) {
    archetypeEmbed.addFields({
      name: `${meta.emoji} ${meta.name}`,
      value: meta.description,
      inline: true
    });
  }

  // Build up to two rows of archetype buttons so all archetypes from the
  // guide are available (Discord allows 5 buttons per row).
  const archetypeEntries = Object.entries(ARCHETYPE_DATA);
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  archetypeEntries.forEach(([key, meta], index) => {
    const button = new ButtonBuilder()
      .setCustomId(`profile-arch-${key}`)
      .setLabel(meta.name)
      .setStyle(ButtonStyle.Primary);
    if (index < 5) {
      row1.addComponents(button);
    } else if (index < 10) {
      row2.addComponents(button);
    }
  });

  const rows = [row1];
  if (row2.components.length > 0) rows.push(row2);

  return { archetypeEmbed, archetypeRows: rows };
}

async function presentNextCandidate(btn, flowState) {
  // If we've already reached the maximum attempts, go straight to final
  // selection using the accumulated candidates.
  if (flowState.attempts >= flowState.maxAttempts) {
    await showFinalSelection(btn, flowState);
    return;
  }

  flowState.attempts += 1;

  // Generate procedural candidate (does not reserve in DB yet)
  const candidateName = await proceduralGenerators.generateForArchetype(
    flowState.archetype,
    flowState.philosophy
  );
  flowState.candidates.push({
    name: candidateName,
    archetype: flowState.archetype,
    philosophy: flowState.philosophy
  });

  // Persist session state on Commander.preferences
  await persistNamingSession(flowState);

  // If this was the 7th attempt, jump to final selection view
  if (flowState.attempts >= flowState.maxAttempts) {
    await showFinalSelection(btn, flowState);
    return;
  }

  await showSingleCandidateConfirm(btn, flowState, candidateName);
}

async function showSingleCandidateConfirm(btn, flowState, candidateName) {
  const remaining = flowState.maxAttempts - flowState.attempts;
  const isWarning = flowState.attempts === flowState.maxAttempts - 1;

  const confirmEmbed = new EmbedBuilder()
    .setColor(0x8B4513)
    .setTitle(`🎖️ Your commander name (Attempt ${flowState.attempts} of ${flowState.maxAttempts})`)
    .setDescription(`**${candidateName}**`)
    .addFields(
      { name: 'Archetype', value: ARCHETYPE_DATA[flowState.archetype].name, inline: true },
      { name: 'Philosophy', value: flowState.philosophy === 'glory' ? 'Glory' : 'Survival', inline: true }
    )
    .setFooter({
      text: isWarning
        ? 'Warning: one more retry before final selection from all names.'
        : `You may retry ${remaining} more time(s) before final selection.`
    });

  const confirmRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('profile-name-accept')
        .setLabel('Take this name')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('profile-name-retry')
        .setLabel('Retry')
        .setStyle(ButtonStyle.Secondary)
    );

  await btn.update({ embeds: [confirmEmbed], components: [confirmRow] });
  flowState.step = 'confirm_single';
}

async function showFinalSelection(btn, flowState) {
  const { finalEmbed, finalRows } = buildFinalSelectionMessage(flowState);
  await btn.update({ embeds: [finalEmbed], components: finalRows });
  flowState.step = 'select_final';
}

function buildFinalSelectionMessage(flowState) {
  const listLines = flowState.candidates
    .map((c, idx) => `${idx + 1}. **${c.name}** (${ARCHETYPE_DATA[c.archetype].name} / ${c.philosophy === 'glory' ? 'Glory' : 'Survival'})`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x8B4513)
    .setTitle('🎖️ Choose your commander name')
    .setDescription(listLines)
    .setFooter({
      text: 'Select the name that will represent your commander until death.'
    });

  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  flowState.candidates.forEach((c, idx) => {
    const button = new ButtonBuilder()
      .setCustomId(`profile-final-${idx}`)
      .setLabel(`${idx + 1}`)
      .setStyle(ButtonStyle.Primary);

    if (idx < 5) {
      row1.addComponents(button);
    } else if (idx < 10) {
      row2.addComponents(button);
    }
  });

  const rows = [row1];
  if (row2.components.length > 0) rows.push(row2);

  return { finalEmbed: embed, finalRows: rows };
}

async function showLockInMenu(btn, flowState) {
  const chosen = flowState.candidates[flowState.selectedIndex];

  const embed = new EmbedBuilder()
    .setColor(0x8B4513)
    .setTitle('🔒 Lock in commander identity')
    .setDescription(
      `Your commander name: **${chosen.name}**\n\n` +
      'This will be your identity until death:\n' +
      '- All progress, armies, officers, and history will be tied to this name.\n' +
      '- You cannot rename this commander once locked in.\n' +
      '- Only a new commander (after death) can claim a new name.'
    );

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('profile-lock-confirm')
        .setLabel('Lock in this name')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('profile-lock-back')
        .setLabel('Back to choices')
        .setStyle(ButtonStyle.Secondary)
    );

  await btn.update({ embeds: [embed], components: [row] });
  flowState.step = 'lock_in';
}

async function persistNamingSession(flowState) {
  const commander = flowState.commander;
  if (!commander) return;

  const prefs = commander.preferences || {};
  prefs.namingSession = {
    attempts: flowState.attempts,
    candidates: flowState.candidates
  };
  commander.preferences = prefs;
  await commander.save();
}

async function assignArchetypeRole(guild, userId, archetype, client) {
  if (!guild) return;

  const mapping = kingdomsRoles[guild.id];
  if (!mapping) return;

  // Handle "gate" vs "threshold" key naming if needed
  const key = mapping[archetype] ? archetype : (archetype === 'threshold' ? 'gate' : archetype);
  const roleId = mapping[key];
  if (!roleId) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  // Remove any other archetype roles in this mapping so the player has only one
  const otherRoleIds = Object.values(mapping).filter(id => id !== roleId);
  const rolesToRemove = member.roles.cache.filter(r => otherRoleIds.includes(r.id));
  if (rolesToRemove.size) {
    await member.roles.remove(rolesToRemove).catch(() => {});
  }

  if (!member.roles.cache.has(roleId)) {
    await member.roles.add(roleId).catch(() => {});
  }
}
