const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('Set or view your tactical map viewport'),

  async execute(interaction) {
    try {
      const select = new StringSelectMenuBuilder()
        .setCustomId('map-view-select')
        .setPlaceholder('Choose your map view')
        .addOptions(
          { label: 'Default (follow commander)', value: 'default' },
          { label: 'Central', value: 'center' },
          { label: 'Northwest', value: 'nw' },
          { label: 'Northeast', value: 'ne' },
          { label: 'Southwest', value: 'sw' },
          { label: 'Southeast', value: 'se' }
        );

      await interaction.reply({
        content: 'Select your preferred map viewport (persisted for briefings):',
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('map command error:', error);
      await interaction.reply({ content: '❌ Error generating map.', flags: MessageFlags.Ephemeral });
    }
  },

  async handleSelect(interaction) {
    try {
      const view = interaction.values?.[0] || 'default';
      const { models } = require('../../database/setup');
      const commander = await models.Commander.findByPk(interaction.user.id);
      if (commander) {
        const prefs = commander.preferences || {};
        prefs.mapView = view;
        commander.preferences = prefs;
        await commander.save();
      }

      const battle = await models.Battle.findOne({
        where: {
          status: 'in_progress',
          [Op.or]: [ { player1Id: interaction.user.id }, { player2Id: interaction.user.id } ]
        }
      });

      if (!battle) {
        await interaction.update({ content: `Map view set to ${view}. No active battle.`, components: [] });
        return;
      }

      const playerSide = battle.player1Id === interaction.user.id ? 'player1' : 'player2';
      const { RIVER_CROSSING_MAP } = require('../../game/maps/riverCrossing');
      const map = RIVER_CROSSING_MAP; // preview uses river for now
      const friendly = battle.battleState[playerSide]?.unitPositions || [];
      const visibleEnemy = (battle.battleState[playerSide]?.visibleEnemyPositions || []).map(c => ({ position: c }));
      const mapData = { terrain: map.terrain, player1Units: friendly, player2Units: visibleEnemy };

      // Compute viewport
      const { parseCoord, generateEmojiMapViewport } = require('../../game/maps/mapUtils');
      const GRID = 20, H = 15, W = 15; let top=0,left=0;
      function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi,v)); }
      if (view === 'center') { top = Math.floor((GRID-H)/2); left = Math.floor((GRID-W)/2); }
      else if (view === 'nw') { top=0; left=0; }
      else if (view === 'ne') { top=0; left=GRID-W; }
      else if (view === 'sw') { top=GRID-H; left=0; }
      else if (view === 'se') { top=GRID-H; left=GRID-W; }
      else {
        const commanderPos = battle.battleState[playerSide]?.commander?.position || friendly[0]?.position || 'K10';
        const p = parseCoord(commanderPos) || { row: 9, col: 9 };
        top = clamp(p.row - Math.floor(H/2), 0, GRID - H);
        left = clamp(p.col - Math.floor(W/2), 0, GRID - W);
      }
      // Overlays from intel memory
      const intelMem = (battle.battleState?.[playerSide]?.intelMemory) || [];
      const overlays = intelMem.filter(e => (battle.currentTurn - (e.lastSeenTurn || 0)) >= 2).map(e => e.position);
      const preview = generateEmojiMapViewport(mapData, { top, left, width: W, height: H }, overlays);

      await interaction.update({ content: `Map view set to ${view}.\n\n\`\`\`\n${preview}\n\`\`\``, components: [] });
    } catch (e) {
      console.error('map view select error:', e);
      try { await interaction.update({ content: 'Error setting map view.', components: [] }); } catch {}
    }
  }
};
