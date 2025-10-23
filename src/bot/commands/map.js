const { SlashCommandBuilder } = require('discord.js');
const { Op } = require('sequelize');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('Show a 15x15 tactical map viewport')
.addStringOption(opt =>
      opt.setName('view')
        .setDescription('Viewport to show')
        .setRequired(false)
        .addChoices(
          { name: 'default (follow commander)', value: 'default' },
          { name: 'central', value: 'center' },
          { name: 'northwest', value: 'nw' },
          { name: 'northeast', value: 'ne' },
          { name: 'southwest', value: 'sw' },
          { name: 'southeast', value: 'se' }
        )
    ),

  async execute(interaction) {
    try {
      const { models } = require('../../database/setup');
      const { calculateVisibility } = require('../../game/fogOfWar');
      const { parseCoord, generateEmojiMapViewport } = require('../../game/maps/mapUtils');
      const { RIVER_CROSSING_MAP } = require('../../game/maps/riverCrossing');
      const { BRIDGE_CONTROL_MAP } = require('../../game/maps/bridgeControl');
      const { HILL_FORT_ASSAULT_MAP } = require('../../game/maps/hillFortAssault');
      const { FOREST_AMBUSH_MAP } = require('../../game/maps/forestAmbush');
      const { DESERT_OASIS_MAP } = require('../../game/maps/desertOasis');

      const view = interaction.options.getString('view') || 'default';

      // Find active battle for this user
      const battle = await models.Battle.findOne({
        where: {
          status: 'in_progress',
          [Op.or]: [
            { player1Id: interaction.user.id },
            { player2Id: interaction.user.id }
          ]
        }
      });

      if (!battle) {
        await interaction.reply({ content: 'No active battle.', ephemeral: true });
        return;
      }

      const playerSide = battle.player1Id === interaction.user.id ? 'player1' : 'player2';
      const enemySide = playerSide === 'player1' ? 'player2' : 'player1';

      // Resolve scenario map
      const scenarioMaps = {
        'river_crossing': RIVER_CROSSING_MAP,
        'bridge_control': BRIDGE_CONTROL_MAP,
        'forest_ambush': FOREST_AMBUSH_MAP,
        'hill_fort_assault': HILL_FORT_ASSAULT_MAP,
        'desert_oasis': DESERT_OASIS_MAP
      };
      const map = scenarioMaps[battle.scenario] || RIVER_CROSSING_MAP;

      const state = battle.battleState || {};
      const friendly = state[playerSide]?.unitPositions || [];
      const enemy = state[enemySide]?.unitPositions || [];

      // Compute visibility to only show seen enemies
      const vis = calculateVisibility(friendly, enemy, map.terrain, battle.weather || 'clear');
      const visibleEnemyUnits = (vis.visibleEnemyPositions || []).map(coord => ({ position: coord }));

      // Determine viewport top-left based on requested view (15x15)
      const W = 15, H = 15, GRID = 20;
      const centerDefault = { row: Math.floor((GRID - 1) / 2), col: Math.floor((GRID - 1) / 2) };

      function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

      let top = 0, left = 0;
      if (view === 'center') {
        top = Math.floor((GRID - H) / 2);
        left = Math.floor((GRID - W) / 2);
      } else if (view === 'nw') {
        top = 0; left = 0;
      } else if (view === 'ne') {
        top = 0; left = GRID - W;
      } else if (view === 'sw') {
        top = GRID - H; left = 0;
      } else if (view === 'se') {
        top = GRID - H; left = GRID - W;
      } else {
        // default: follow commander position
        const commanderPos = state[playerSide]?.commander?.position || friendly[0]?.position;
        const p = parseCoord(commanderPos || 'K10') || centerDefault;
        top = clamp(p.row - Math.floor(H / 2), 0, GRID - H);
        left = clamp(p.col - Math.floor(W / 2), 0, GRID - W);
      }

      const mapText = generateEmojiMapViewport({
        terrain: map.terrain,
        player1Units: friendly,
        player2Units: visibleEnemyUnits
      }, { top, left, width: W, height: H });

      await interaction.reply({ content: `MAP (${view})\n\n\`\`\`\n${mapText}\n\`\`\``, ephemeral: true });

    } catch (error) {
      console.error('map command error:', error);
      await interaction.reply({ content: '❌ Error generating map.', ephemeral: true });
    }
  }
};